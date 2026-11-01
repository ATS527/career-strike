import type { FastifyInstance } from 'fastify';
import type { UpdateChecker } from '../../updates/checker.js';

/** Version and update status for the dashboard. AI assistants have no business here. */
export function registerUpdateRoutes(app: FastifyInstance, updates: UpdateChecker): void {
  app.get('/api/updates', async (req, reply) => {
    if (req.principal?.kind === 'mcp-client') return reply.code(403).send({ error: 'FORBIDDEN' });
    return updates.status();
  });

  // An explicit "Check now": allowed even when weekly checks are off, because the candidate asked.
  app.post('/api/updates/check', async (req, reply) => {
    if (req.principal?.kind === 'mcp-client') return reply.code(403).send({ error: 'FORBIDDEN' });
    return updates.check();
  });

  app.post('/api/updates/acknowledge', async (req, reply) => {
    if (req.principal?.kind === 'mcp-client') return reply.code(403).send({ error: 'FORBIDDEN' });
    return updates.acknowledge();
  });
}
