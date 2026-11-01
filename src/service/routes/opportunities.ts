import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { DuplicateBoardError, type Discovery } from '../../career/discovery.js';
import { candidateContext } from '../../career/context.js';
import { addManualJob, getJob, JobQuery, listJobs, ManualJobInput, setDisposition } from '../../career/jobs.js';
import { addFact, approveAllFacts, approveFact, deleteFact, listFacts, NewFact, suggestSkills, updateFact } from '../../career/profile.js';
import { addEvidence, confirmEvidence, deleteEvidence, listEvidence, NewEvidence, updateEvidence } from '../../career/evidence.js';
import { importLinkedInExport, parseLinkedInArchive, parseLinkedInCsvText } from '../../career/linkedin-export.js';
import type { Db } from '../../store/db.js';
import { getSettings } from '../../store/settings.js';
import { boardFromUrl } from '../../sources/board-url.js';
import { SourceError } from '../../sources/types.js';
import type { TaskSupervisor } from '../../supervisor/tasks.js';
import type { DocumentVault } from '../../vault/documents.js';

const AddBoard = z.union([
  z.object({ source: z.enum(['greenhouse', 'lever', 'ashby']), board: z.string().trim().min(1).max(100) }).strict(),
  z.object({ url: z.string().trim().min(1).max(2000) }).strict(),
]);
const SuggestFrom = z.union([
  z.object({ text: z.string().trim().min(1, 'Paste your résumé text').max(200_000) }).strict(),
  z.object({ documentId: z.string().regex(/^doc_[A-Za-z0-9_-]+$/) }).strict(),
]);
const DispositionBody = z.object({ disposition: z.enum(['none', 'shortlisted', 'excluded']) }).strict();

function actorOf(req: FastifyRequest): string {
  return req.principal?.kind === 'dashboard' ? 'dashboard' : 'local-client';
}

function invalid(reply: FastifyReply, issues: z.core.$ZodIssue[]): FastifyReply {
  return reply.code(400).send({ error: 'INVALID_INPUT', issues });
}

export function registerOpportunityRoutes(app: FastifyInstance, deps: { db: Db; discovery: Discovery; tasks: TaskSupervisor; vault: DocumentVault }): void {
  const { db, discovery, tasks, vault } = deps;
  const ctx = () => candidateContext(db);
  const practiceOrigin = (): string | null => (db.prepare('SELECT origin FROM practice_endpoint WHERE id = 1').pluck().get() as string | undefined) ?? null;

  // ---- monitored boards ----

  app.get('/api/sources', async () => ({ boards: discovery.listBoards() }));

  app.post('/api/sources', async (req, reply) => {
    const parsed = AddBoard.safeParse(req.body);
    if (!parsed.success) return invalid(reply, parsed.error.issues);
    const target = 'url' in parsed.data ? boardFromUrl(parsed.data.url, practiceOrigin()) : parsed.data;
    if (!target) {
      return reply.code(400).send({
        error: 'UNRECOGNISED_BOARD_URL',
        message: 'Paste a Greenhouse, Lever or Ashby careers page link, e.g. https://jobs.lever.co/company (or a practice board link from career-strike practice)',
      });
    }
    try {
      const board = discovery.addBoard(target.source, target.board);
      const run = discovery.discover(board.id, 'board-added', actorOf(req));
      return reply.code(201).send({ board: discovery.getBoard(board.id), task: run?.task ?? null });
    } catch (err) {
      if (err instanceof DuplicateBoardError) return reply.code(409).send({ error: 'ALREADY_MONITORED', message: err.message });
      if (err instanceof SourceError) return reply.code(400).send({ error: 'INVALID_BOARD', message: err.message });
      throw err;
    }
  });

  app.delete<{ Params: { id: string } }>('/api/sources/:id', async (req, reply) => {
    if (!discovery.removeBoard(req.params.id)) return reply.code(404).send({ error: 'NOT_FOUND' });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/sources/:id/discover', async (req, reply) => {
    const run = discovery.discover(req.params.id, 'manual', actorOf(req));
    if (!run) return reply.code(404).send({ error: 'NOT_FOUND' });
    return reply.code(run.created ? 202 : 200).send({ task: run.task, alreadyRunning: !run.created });
  });

  // ---- tasks ----

  app.get('/api/tasks', async () => ({ tasks: tasks.list(100) }));

  app.get<{ Params: { id: string } }>('/api/tasks/:id', async (req, reply) => {
    const task = tasks.get(req.params.id);
    return task ? { task } : reply.code(404).send({ error: 'NOT_FOUND' });
  });

  app.post<{ Params: { id: string } }>('/api/tasks/:id/cancel', async (req, reply) => {
    if (!tasks.get(req.params.id)) return reply.code(404).send({ error: 'NOT_FOUND' });
    if (!tasks.cancel(req.params.id)) return reply.code(409).send({ error: 'NOT_RUNNING' });
    return reply.code(202).send({ ok: true });
  });

  // ---- jobs ----

  app.get('/api/jobs', async (req, reply) => {
    const parsed = JobQuery.safeParse(req.query);
    if (!parsed.success) return invalid(reply, parsed.error.issues);
    return listJobs(db, parsed.data, ctx());
  });

  app.post('/api/jobs', async (req, reply) => {
    const parsed = ManualJobInput.safeParse(req.body);
    if (!parsed.success) return invalid(reply, parsed.error.issues);
    const id = addManualJob(db, parsed.data);
    return reply.code(201).send({ job: getJob(db, id, ctx()) });
  });

  app.get<{ Params: { id: string } }>('/api/jobs/:id', async (req, reply) => {
    const job = getJob(db, req.params.id, ctx());
    return job ? { job } : reply.code(404).send({ error: 'NOT_FOUND' });
  });

  app.put<{ Params: { id: string } }>('/api/jobs/:id/disposition', async (req, reply) => {
    const parsed = DispositionBody.safeParse(req.body);
    if (!parsed.success) return invalid(reply, parsed.error.issues);
    if (!setDisposition(db, req.params.id, parsed.data.disposition, actorOf(req))) return reply.code(404).send({ error: 'NOT_FOUND' });
    return { job: getJob(db, req.params.id, ctx()) };
  });

  // ---- candidate profile (SENSITIVE) ----

  app.get('/api/profile', async () => ({
    facts: listFacts(db),
    evidence: listEvidence(db),
  }));

  app.post('/api/profile/facts', async (req, reply) => {
    const parsed = NewFact.safeParse(req.body);
    if (!parsed.success) return invalid(reply, parsed.error.issues);
    return reply.code(201).send({ fact: addFact(db, parsed.data, actorOf(req)) });
  });

  // Résumé text is read here, locally, and never stored: only the suggested skills are kept.
  app.post('/api/profile/suggestions', async (req, reply) => {
    const parsed = SuggestFrom.safeParse(req.body);
    if (!parsed.success) return invalid(reply, parsed.error.issues);
    let text: string;
    if ('text' in parsed.data) text = parsed.data.text;
    else {
      const doc = vault.get(parsed.data.documentId);
      if (!doc) return reply.code(404).send({ error: 'NOT_FOUND' });
      // PDF and Word text extraction is not built in; say so rather than guess.
      if (doc.mime !== 'text/plain') {
        return reply.code(400).send({ error: 'UNSUPPORTED_TYPE', message: 'Skills can be suggested from plain-text documents only. Paste the text of a PDF or Word résumé instead.' });
      }
      text = vault.read(doc.id)!.toString('utf8');
    }
    return reply.code(201).send({ suggested: suggestSkills(db, text, actorOf(req)) });
  });

  app.post<{ Params: { id: string } }>('/api/profile/facts/:id/approve', async (req, reply) => {
    const fact = approveFact(db, req.params.id, actorOf(req));
    if (!fact) return reply.code(404).send({ error: 'NOT_FOUND' });
    return { fact };
  });

  app.post('/api/profile/facts/approve-all', async (req) => {
    const kind = typeof (req.body as { kind?: unknown })?.kind === 'string' ? (req.body as { kind: string }).kind : undefined;
    const count = approveAllFacts(db, actorOf(req), kind as any);
    return { count };
  });

  app.put<{ Params: { id: string } }>('/api/profile/facts/:id', async (req, reply) => {
    const body = req.body as { value?: unknown } | null;
    const result = updateFact(db, req.params.id, body?.value, actorOf(req));
    if (result === 'not_found') return reply.code(404).send({ error: 'NOT_FOUND' });
    if (result instanceof z.ZodError) return invalid(reply, result.issues);
    return { fact: result };
  });

  app.delete<{ Params: { id: string } }>('/api/profile/facts/:id', async (req, reply) => {
    if (!deleteFact(db, req.params.id, actorOf(req))) return reply.code(404).send({ error: 'NOT_FOUND' });
    return { ok: true };
  });

  // Evidence is kept with the same canonical candidate profile, but deliberately separate from
  // short profile facts because it can contain longer project and achievement text.
  app.post('/api/profile/evidence', async (req, reply) => {
    const parsed = NewEvidence.safeParse(req.body);
    if (!parsed.success) return invalid(reply, parsed.error.issues);
    return reply.code(201).send({ evidence: addEvidence(db, parsed.data, actorOf(req)) });
  });

  app.post<{ Params: { id: string } }>('/api/profile/evidence/:id/confirm', async (req, reply) => {
    const item = confirmEvidence(db, req.params.id, actorOf(req));
    if (!item) return reply.code(404).send({ error: 'NOT_FOUND' });
    return { evidence: item };
  });

  app.put<{ Params: { id: string } }>('/api/profile/evidence/:id', async (req, reply) => {
    const body = req.body as { value?: unknown } | null;
    const result = updateEvidence(db, req.params.id, body?.value, actorOf(req));
    if (result === 'not_found') return reply.code(404).send({ error: 'NOT_FOUND' });
    if (result instanceof z.ZodError) return invalid(reply, result.issues);
    return { evidence: result };
  });

  app.delete<{ Params: { id: string } }>('/api/profile/evidence/:id', async (req, reply) => {
    if (!deleteEvidence(db, req.params.id, actorOf(req))) return reply.code(404).send({ error: 'NOT_FOUND' });
    return { ok: true };
  });

  app.post('/api/profile/import/linkedin', { bodyLimit: 15 * 1024 * 1024 }, async (req, reply) => {
    let data;
    try {
      if (Buffer.isBuffer(req.body)) {
        if (req.body.length >= 4 && req.body[0] === 0x50 && req.body[1] === 0x4b) {
          data = parseLinkedInArchive(req.body);
        } else {
          const filename = req.headers['x-cs-filename'] ? decodeURIComponent(String(req.headers['x-cs-filename'])) : undefined;
          data = parseLinkedInCsvText(req.body.toString('utf8'), filename);
        }
      } else if (typeof req.body === 'object' && req.body !== null) {
        const body = req.body as { zipBase64?: string; csvText?: string; filename?: string; documentId?: string };
        if (body.documentId) {
          const doc = vault.get(body.documentId);
          if (!doc) return reply.code(404).send({ error: 'NOT_FOUND' });
          const bytes = vault.read(doc.id);
          if (!bytes) return reply.code(404).send({ error: 'NOT_FOUND' });
          if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
            data = parseLinkedInArchive(bytes);
          } else {
            data = parseLinkedInCsvText(bytes.toString('utf8'), doc.filename);
          }
        } else if (body.zipBase64) {
          data = parseLinkedInArchive(Buffer.from(body.zipBase64, 'base64'));
        } else if (typeof body.csvText === 'string') {
          data = parseLinkedInCsvText(body.csvText, body.filename);
        } else {
          return reply.code(400).send({ error: 'INVALID_INPUT', message: 'Provide zipBase64, csvText, documentId, or a file payload.' });
        }
      } else {
        return reply.code(400).send({ error: 'INVALID_INPUT', message: 'Invalid payload.' });
      }
      const result = importLinkedInExport(db, data, actorOf(req));
      return reply.code(200).send({ ok: true, result });
    } catch (err) {
      return reply.code(400).send({ error: 'IMPORT_FAILED', message: err instanceof Error ? err.message : String(err) });
    }
  });
}
