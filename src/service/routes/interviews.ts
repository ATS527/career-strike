import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ApplicationError } from '../../applications/service.js';
import { TransitionError } from '../../applications/states.js';
import { InterviewInput, type InterviewService, InterviewUpdate, PracticeInput } from '../../interview/service.js';

function fail(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof ApplicationError)
    return reply
      .code(err.code === 'NOT_FOUND' || err.code === 'JOB_NOT_FOUND' ? 404 : 409)
      .send({ error: err.code, message: err.message });
  if (err instanceof TransitionError)
    return reply.code(409).send({ error: 'INVALID_TRANSITION', message: err.message });
  throw err;
}

const actorOf = (req: FastifyRequest): string => (req.principal?.kind === 'dashboard' ? 'dashboard' : 'local-client');

export function registerInterviewRoutes(app: FastifyInstance, deps: { interviews: InterviewService }): void {
  const { interviews } = deps;

  app.get<{ Params: { id: string } }>('/api/applications/:id/prep', async (req, reply) => {
    try {
      return await interviews.prep(req.params.id);
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.post<{ Params: { id: string } }>('/api/applications/:id/practice', async (req, reply) => {
    const parsed = PracticeInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT', issues: parsed.error.issues });
    try {
      await interviews.logPractice(req.params.id, parsed.data);
      return reply.code(201).send(await interviews.prep(req.params.id));
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.post<{ Params: { id: string } }>('/api/applications/:id/interviews', async (req, reply) => {
    const parsed = InterviewInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT', issues: parsed.error.issues });
    try {
      return reply.code(201).send({ interview: await interviews.schedule(req.params.id, parsed.data, actorOf(req)) });
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.put<{ Params: { id: string } }>('/api/interviews/:id', async (req, reply) => {
    const parsed = InterviewUpdate.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT', issues: parsed.error.issues });
    const updated = interviews.update(req.params.id, parsed.data);
    return updated ? { interview: updated } : reply.code(404).send({ error: 'NOT_FOUND' });
  });

  app.get('/api/interviews', async () => ({ upcoming: interviews.upcoming() }));
}
