import Fastify, { type FastifyInstance } from 'fastify';
import { type Db, schemaVersion } from '../store/db.js';
import { getSettings, SettingError, setSetting } from '../store/settings.js';
import { isAllowedHost, isAllowedOrigin, SECURITY_HEADERS, tokensEqual } from './security.js';

export interface ServerOptions {
  db: Db;
  token: string;
  version: string;
}

const UNAUTHENTICATED_ROUTES = new Set(['/api/health']);

export function buildServer({ db, token, version }: ServerOptions): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 64 * 1024 });

  const boundPort = (): number => {
    const addr = app.server.address();
    return typeof addr === 'object' && addr !== null ? addr.port : -1;
  };

  app.addHook('onRequest', async (req, reply) => {
    const port = boundPort();
    if (!isAllowedHost(req.headers.host, port)) {
      reply.code(421).send({ error: 'HOST_REJECTED' });
      return reply;
    }
    if (!isAllowedOrigin(req.headers.origin, port)) {
      reply.code(403).send({ error: 'ORIGIN_REJECTED' });
      return reply;
    }
    const routePath = req.url.split('?', 1)[0] ?? '';
    if (!UNAUTHENTICATED_ROUTES.has(routePath)) {
      const auth = req.headers.authorization;
      if (!auth?.startsWith('Bearer ') || !tokensEqual(auth.slice('Bearer '.length), token)) {
        reply.code(401).send({ error: 'UNAUTHORIZED' });
        return reply;
      }
    }
  });

  app.addHook('onSend', async (_req, reply, payload) => {
    reply.headers(SECURITY_HEADERS);
    return payload;
  });

  // Never echo internal error messages; they can contain paths or data.
  app.setErrorHandler((err, _req, reply) => {
    const statusCode = (err as { statusCode?: number }).statusCode;
    const status = statusCode !== undefined && statusCode >= 400 && statusCode < 500 ? statusCode : 500;
    reply.code(status).send({ error: status === 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST' });
  });

  app.get('/api/health', async () => ({
    status: 'ok',
    service: 'career-strike',
    version,
    schemaVersion: schemaVersion(db),
    pid: process.pid,
  }));

  app.get('/api/settings', async () => ({ settings: getSettings(db) }));

  app.put<{ Params: { key: string }; Body: unknown }>('/api/settings/:key', async (req, reply) => {
    const body = req.body;
    if (typeof body !== 'object' || body === null || !('value' in body)) {
      return reply.code(400).send({ error: 'INVALID_BODY' });
    }
    try {
      return { key: req.params.key, value: setSetting(db, req.params.key, body.value, 'local-api') };
    } catch (err) {
      if (err instanceof SettingError) {
        return reply.code(err.code === 'UNKNOWN_SETTING' ? 404 : 400).send({ error: err.code, issues: err.issues });
      }
      throw err;
    }
  });

  return app;
}
