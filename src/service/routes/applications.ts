import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ApplicationError, type ApplicationService } from '../../applications/service.js';
import { TransitionError } from '../../applications/states.js';
import { ACCEPTED_DOCUMENT_TYPES, DocumentError, type DocumentVault, MAX_DOCUMENT_BYTES } from '../../vault/documents.js';

const ERROR_STATUS: Record<ApplicationError['code'], number> = {
  JOB_NOT_FOUND: 404,
  NOT_FOUND: 404,
  JOB_CLOSED: 409,
  ALREADY_EXISTS: 409,
  STALE_REVIEW: 409,
  NOT_EDITABLE: 409,
  INCOMPLETE: 422,
  WARNINGS_NOT_ACKNOWLEDGED: 422,
  INVALID_CHANGE: 400,
};

const Create = z.object({ jobId: z.string().min(1).max(100) }).strict();
const Update = z
  .object({
    reason: z.string().trim().min(1).max(300).optional(),
    changes: z
      .object({
        fields: z.array(z.object({ key: z.string().min(1).max(100), value: z.string().max(20_000).nullable() }).strict()).max(100).optional(),
        coverLetter: z.string().max(20_000).nullable().optional(),
        resumeDocumentId: z.string().max(100).nullable().optional(),
        method: z.enum(['manual', 'assisted']).optional(),
      })
      .strict(),
  })
  .strict();
const Approve = z
  .object({ version: z.number().int().positive(), payloadHash: z.string().regex(/^[0-9a-f]{64}$/), acknowledgeWarnings: z.boolean().default(false) })
  .strict();
const Reject = z.object({ note: z.string().trim().max(500).nullable().default(null) }).strict();

function actorOf(req: FastifyRequest): string {
  return req.principal?.kind === 'dashboard' ? 'dashboard' : 'local-client';
}

function fail(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof ApplicationError) return reply.code(ERROR_STATUS[err.code]).send({ error: err.code, message: err.message, details: err.details });
  if (err instanceof TransitionError) return reply.code(409).send({ error: 'INVALID_TRANSITION', message: err.message });
  if (err instanceof DocumentError) return reply.code(err.code === 'TOO_LARGE' ? 413 : 400).send({ error: err.code, message: err.message });
  throw err;
}

export function registerApplicationRoutes(app: FastifyInstance, deps: { applications: ApplicationService; vault: DocumentVault }): void {
  const { applications, vault } = deps;

  // ---- documents (SENSITIVE; never exposes vault paths) ----

  app.addContentTypeParser(ACCEPTED_DOCUMENT_TYPES, { parseAs: 'buffer', bodyLimit: MAX_DOCUMENT_BYTES + 1 }, (_req, body, done) => done(null, body));

  app.get('/api/documents', async () => ({ documents: vault.list() }));

  app.post('/api/documents', { bodyLimit: MAX_DOCUMENT_BYTES + 1 }, async (req, reply) => {
    const mime = String(req.headers['content-type'] ?? '').split(';')[0]!.trim();
    const kind = z.enum(['resume', 'cover_letter', 'other']).safeParse(req.headers['x-cs-document-kind']);
    const filename = decodeURIComponent(String(req.headers['x-cs-filename'] ?? 'document'));
    if (!kind.success) return reply.code(400).send({ error: 'INVALID_KIND', message: 'Say whether this is a résumé, cover letter or other file.' });
    if (!Buffer.isBuffer(req.body)) return reply.code(415).send({ error: 'UNSUPPORTED_TYPE', message: 'Upload a PDF, Word (.docx) or plain-text file.' });
    try {
      return reply.code(201).send({ document: vault.save({ kind: kind.data, filename, mime, bytes: req.body }, actorOf(req)) });
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.get<{ Params: { id: string } }>('/api/documents/:id/content', async (req, reply) => {
    const doc = vault.get(req.params.id);
    const bytes = doc ? vault.read(doc.id) : null;
    if (!doc || !bytes) return reply.code(404).send({ error: 'NOT_FOUND' });
    // Always a download: candidate files are never rendered inside the dashboard's origin.
    reply
      .type(doc.mime)
      .header('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(doc.filename)}`)
      .header('content-security-policy', "default-src 'none'; sandbox");
    return bytes;
  });

  app.delete<{ Params: { id: string } }>('/api/documents/:id', async (req, reply) => {
    if (!vault.delete(req.params.id, actorOf(req))) return reply.code(404).send({ error: 'NOT_FOUND' });
    return { ok: true };
  });

  // ---- applications ----

  app.get('/api/applications', async () => ({ applications: applications.list() }));

  app.post('/api/applications', async (req, reply) => {
    const parsed = Create.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT', issues: parsed.error.issues });
    try {
      const id = await applications.create(parsed.data.jobId, actorOf(req));
      return reply.code(201).send({ application: await applications.get(id) });
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.get<{ Params: { id: string } }>('/api/applications/:id', async (req, reply) => {
    const view = await applications.get(req.params.id);
    return view ? { application: view } : reply.code(404).send({ error: 'NOT_FOUND' });
  });

  app.put<{ Params: { id: string } }>('/api/applications/:id', async (req, reply) => {
    const parsed = Update.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT', issues: parsed.error.issues });
    try {
      await applications.update(req.params.id, parsed.data.changes, actorOf(req), parsed.data.reason);
      return { application: await applications.get(req.params.id) };
    } catch (err) {
      return fail(reply, err);
    }
  });

  const action = (path: string, run: (id: string, req: FastifyRequest) => void | Promise<unknown>) =>
    app.post<{ Params: { id: string } }>(`/api/applications/:id/${path}`, async (req, reply) => {
      try {
        await run(req.params.id, req);
        return { application: await applications.get(req.params.id) };
      } catch (err) {
        return fail(reply, err);
      }
    });

  action('ready', (id, req) => applications.markReady(id, actorOf(req)));
  action('save-for-later', (id, req) => applications.saveForLater(id, actorOf(req)));
  action('reject', (id, req) => {
    const parsed = Reject.safeParse(req.body ?? {});
    return applications.reject(id, actorOf(req), parsed.success ? parsed.data.note : null);
  });

  app.post<{ Params: { id: string } }>('/api/applications/:id/approve', async (req, reply) => {
    // A person must approve, in the dashboard. Local clients and AI hosts cannot.
    if (req.principal?.kind !== 'dashboard') {
      return reply.code(403).send({ error: 'APPROVAL_REQUIRES_DASHBOARD', message: 'Applications can only be approved in the Career Strike dashboard.' });
    }
    const parsed = Approve.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT', issues: parsed.error.issues });
    try {
      await applications.approve(req.params.id, parsed.data, 'dashboard');
      return { application: await applications.get(req.params.id) };
    } catch (err) {
      return fail(reply, err);
    }
  });
}
