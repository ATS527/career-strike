import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { DuplicateBoardError, type Discovery } from '../../career/discovery.js';
import { candidateContext } from '../../career/context.js';
import { addManualJob, getJob, JobQuery, listJobs, ManualJobInput, setDisposition } from '../../career/jobs.js';
import { addFact, deleteFact, listFacts, NewFact, updateFact } from '../../career/profile.js';
import type { Db } from '../../store/db.js';
import { boardFromUrl } from '../../sources/board-url.js';
import { SourceError } from '../../sources/types.js';
import type { TaskSupervisor } from '../../supervisor/tasks.js';

const AddBoard = z.union([
  z.object({ source: z.enum(['greenhouse', 'lever', 'ashby']), board: z.string().trim().min(1).max(100) }).strict(),
  z.object({ url: z.string().trim().min(1).max(2000) }).strict(),
]);
const DispositionBody = z.object({ disposition: z.enum(['none', 'shortlisted', 'excluded']) }).strict();

function actorOf(req: FastifyRequest): string {
  return req.principal?.kind === 'dashboard' ? 'dashboard' : 'local-client';
}

function invalid(reply: FastifyReply, issues: z.core.$ZodIssue[]): FastifyReply {
  return reply.code(400).send({ error: 'INVALID_INPUT', issues });
}

export function registerOpportunityRoutes(app: FastifyInstance, deps: { db: Db; discovery: Discovery; tasks: TaskSupervisor }): void {
  const { db, discovery, tasks } = deps;
  const ctx = () => candidateContext(db);

  // ---- monitored boards ----

  app.get('/api/sources', async () => ({ boards: discovery.listBoards() }));

  app.post('/api/sources', async (req, reply) => {
    const parsed = AddBoard.safeParse(req.body);
    if (!parsed.success) return invalid(reply, parsed.error.issues);
    const target = 'url' in parsed.data ? boardFromUrl(parsed.data.url) : parsed.data;
    if (!target) {
      return reply.code(400).send({
        error: 'UNRECOGNISED_BOARD_URL',
        message: 'Paste a Greenhouse, Lever or Ashby careers page link, e.g. https://jobs.lever.co/company',
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

  app.get('/api/profile', async () => ({ facts: listFacts(db) }));

  app.post('/api/profile/facts', async (req, reply) => {
    const parsed = NewFact.safeParse(req.body);
    if (!parsed.success) return invalid(reply, parsed.error.issues);
    return reply.code(201).send({ fact: addFact(db, parsed.data, actorOf(req)) });
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
}
