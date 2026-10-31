import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { marketReadiness } from '../../markets/readiness.js';
import type { Db } from '../../store/db.js';

/**
 * Readiness and health signals for the configured markets and their curated employer-direct
 * targets. Read-only local evidence for the dashboard; AI assistants have their own projection.
 */
export function registerReadinessRoutes(app: FastifyInstance, deps: { db: Db }): void {
  app.get('/api/readiness', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.principal?.kind === 'mcp-client') return reply.code(403).send({ error: 'FORBIDDEN' });
    return { markets: marketReadiness(deps.db) };
  });
}
