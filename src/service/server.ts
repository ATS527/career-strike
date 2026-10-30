import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { Discovery } from '../career/discovery.js';
import { candidateContext } from '../career/context.js';
import { backfillRequirements, JobQuery, jobCounts, listJobs } from '../career/jobs.js';
import { nextActions } from '../career/next-actions.js';
import { type Logger, nullLogger } from '../core/log.js';
import { type Db, schemaVersion } from '../store/db.js';
import { describeSettings, getSettings, SettingError, setSetting } from '../store/settings.js';
import { createAdapters } from '../sources/adapters.js';
import type { SourceAdapter, SourceId } from '../sources/types.js';
import { TaskSupervisor } from '../supervisor/tasks.js';
import { ApplicationService } from '../applications/service.js';
import { DocumentVault } from '../vault/documents.js';
import type { SecretStore } from '../vault/secrets.js';
import { registerApplicationRoutes } from './routes/applications.js';
import { registerOpportunityRoutes } from './routes/opportunities.js';
import { isAllowedHost, isAllowedOrigin, SECURITY_HEADERS, tokensEqual } from './security.js';
import { clearedSessionCookie, readCookie, SESSION_COOKIE, sessionCookie, SessionStore } from './sessions.js';
import { DASHBOARD_CSP, type StaticAsset } from './static.js';

export interface ServerOptions {
  db: Db;
  token: string;
  version: string;
  startedAt?: string;
  assets?: Map<string, StaticAsset> | null;
  logger?: Logger;
  /** Job-source adapters; tests inject adapters backed by fixtures. */
  adapters?: Readonly<Record<SourceId, SourceAdapter>>;
  /** Private vault directory for candidate documents. */
  vaultDir: string;
  secrets: SecretStore;
}

/** Who is calling: the local CLI/MCP client (bearer token) or a browser dashboard session. */
export type Principal = { kind: 'local-client' } | { kind: 'dashboard'; sessionId: string; csrf: string };

declare module 'fastify' {
  interface FastifyRequest {
    principal: Principal | null;
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CLIENT_ROUTE = /^\/(?:[a-z0-9-]+(?:\/[A-Za-z0-9_-]+)*)?$/;
const UNAUTHENTICATED_API = new Set(['/api/health']);

export function buildServer({
  db,
  token,
  version,
  startedAt,
  assets = null,
  logger = nullLogger,
  adapters = createAdapters(),
  vaultDir,
  secrets,
}: ServerOptions): FastifyInstance {
  // forceCloseConnections: open dashboard tabs hold keep-alive sockets that would otherwise block shutdown.
  const app = Fastify({ logger: false, bodyLimit: 64 * 1024, forceCloseConnections: true });
  const sessions = new SessionStore(db);
  const tasks = new TaskSupervisor(db, logger);
  const interrupted = tasks.recoverInterrupted();
  if (interrupted > 0) logger.warn('tasks.interrupted', { count: interrupted });
  const vault = new DocumentVault(db, vaultDir);
  const applications = new ApplicationService(
    db,
    secrets,
    vault,
    async (jobId) => {
      // Only Greenhouse publishes application forms publicly; elsewhere the standard fields are used.
      const src = db.prepare("SELECT board, source_job_id FROM job_sources WHERE job_id = ? AND source = 'greenhouse' LIMIT 1").get(jobId) as
        | { board: string; source_job_id: string }
        | undefined;
      if (!src || !adapters.greenhouse.applicationQuestions) return null;
      return adapters.greenhouse.applicationQuestions(src.board, src.source_job_id);
    },
    logger,
  );
  const discovery = new Discovery(db, adapters, tasks, () => {
    const expired = applications.expireForClosedJobs();
    if (expired > 0) logger.info('applications.expired', { count: expired });
  });
  const backfilled = backfillRequirements(db);
  if (backfilled > 0) logger.info('jobs.requirements-backfilled', { count: backfilled });
  app.decorateRequest('principal', null);
  app.addHook('onClose', async () => {
    await tasks.cancelAll();
  });

  const boundPort = (): number => {
    const addr = app.server.address();
    return typeof addr === 'object' && addr !== null ? addr.port : -1;
  };

  const reject = (reply: FastifyReply, status: number, error: string): FastifyReply => {
    reply.code(status).send({ error });
    return reply;
  };

  app.addHook('onRequest', async (req, reply) => {
    const port = boundPort();
    if (!isAllowedHost(req.headers.host, port)) return reject(reply, 421, 'HOST_REJECTED');
    if (!isAllowedOrigin(req.headers.origin, port)) return reject(reply, 403, 'ORIGIN_REJECTED');
    // Browsers label requests initiated by other sites (including other localhost ports).
    const fetchSite = req.headers['sec-fetch-site'];
    if (fetchSite === 'cross-site' || fetchSite === 'same-site') return reject(reply, 403, 'CROSS_SITE_REJECTED');

    const routePath = pathOf(req);
    if (!routePath.startsWith('/api/') || UNAUTHENTICATED_API.has(routePath)) return;

    const auth = req.headers.authorization;
    if (auth !== undefined) {
      if (!auth.startsWith('Bearer ') || !tokensEqual(auth.slice('Bearer '.length), token)) return reject(reply, 401, 'UNAUTHORIZED');
      req.principal = { kind: 'local-client' };
      return;
    }
    const sessionId = readCookie(req.headers.cookie, SESSION_COOKIE);
    const session = sessionId ? sessions.lookup(sessionId) : null;
    if (!sessionId || !session) return reject(reply, 401, 'UNAUTHORIZED');
    if (!SAFE_METHODS.has(req.method)) {
      const csrf = req.headers['x-cs-csrf'];
      if (typeof csrf !== 'string' || !tokensEqual(csrf, session.csrf)) return reject(reply, 403, 'CSRF_REJECTED');
    }
    req.principal = { kind: 'dashboard', sessionId, csrf: session.csrf };
  });

  app.addHook('onSend', async (_req, reply, payload) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      // Routes may set their own cache policy (immutable hashed assets); everything else is no-store.
      if (name === 'cache-control' && reply.hasHeader(name)) continue;
      reply.header(name, value);
    }
    if (String(reply.getHeader('content-type') ?? '').startsWith('text/html')) reply.header('content-security-policy', DASHBOARD_CSP);
    return payload;
  });

  app.addHook('onResponse', async (req, reply) => {
    // Path only: query strings can carry launch tokens.
    logger.info('http.request', { method: req.method, path: pathOf(req), status: reply.statusCode, ms: Math.round(reply.elapsedTime) });
  });

  // Never echo internal error messages; they can contain paths or data.
  app.setErrorHandler((err, req, reply) => {
    const statusCode = (err as { statusCode?: number }).statusCode;
    const status = statusCode !== undefined && statusCode >= 400 && statusCode < 500 ? statusCode : 500;
    if (status === 500) logger.error('http.error', { path: pathOf(req), message: err instanceof Error ? err.message : String(err) });
    reply.code(status).send({ error: status === 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST' });
  });

  // ---- health and session ----

  app.get('/api/health', async () => ({
    status: 'ok',
    service: 'career-strike',
    version,
    schemaVersion: schemaVersion(db),
    pid: process.pid,
  }));

  app.post('/api/session/launch-token', async (req, reply) => {
    if (req.principal?.kind !== 'local-client') return reject(reply, 403, 'LOCAL_CLIENT_REQUIRED');
    return sessions.mintLaunchToken();
  });

  app.get('/api/session', async (req) => {
    const p = req.principal;
    return p?.kind === 'dashboard' ? { kind: 'dashboard', csrf: p.csrf } : { kind: 'local-client' };
  });

  app.post('/api/session/logout', async (req, reply) => {
    const p = req.principal;
    if (p?.kind !== 'dashboard') return reject(reply, 400, 'NOT_A_DASHBOARD_SESSION');
    sessions.revoke(p.sessionId);
    reply.header('set-cookie', clearedSessionCookie());
    return { ok: true };
  });

  app.get<{ Querystring: { t?: string } }>('/auth/launch', async (req, reply) => {
    const created = typeof req.query.t === 'string' ? sessions.redeemLaunchToken(req.query.t) : null;
    if (!created) {
      reply.code(401).type('text/html; charset=utf-8');
      return launchFailedPage;
    }
    reply.header('set-cookie', sessionCookie(created.id));
    // The redirect drops the single-use token from the address bar and history.
    return reply.redirect('/', 303);
  });

  // ---- dashboard data ----

  app.get('/api/overview', async () => {
    const settings = getSettings(db);
    const counts = jobCounts(db);
    const boards = discovery.listBoards();
    const ctx = candidateContext(db);
    const fresh = listJobs(db, JobQuery.parse({ status: 'OPEN', disposition: 'none', limit: 200 }), ctx).jobs;
    const byState = applications.counts();
    const sum = (...states: string[]): number => states.reduce((n, st) => n + ((byState as Record<string, number>)[st] ?? 0), 0);
    const appCounts = {
      drafts: sum('DRAFTED', 'NEEDS_INFORMATION', 'BLOCKED'),
      readyForReview: sum('READY_FOR_REVIEW'),
      approved: sum('APPROVED'),
      awaitingConfirmation: sum('NEEDS_MANUAL_ACTION', 'SUBMISSION_UNCONFIRMED'),
      submitted: sum('SUBMITTED_CONFIRMED', 'RESPONSE_RECEIVED'),
      interviewing: sum('INTERVIEW'),
      offers: sum('OFFER'),
      expiredUnsent: sum('EXPIRED'),
    };
    const followUps = applications.openFollowUps();
    const matches = {
      strongUnreviewed: fresh.filter((j) => j.fit?.tier === 'strong').length,
      immediateStartUnreviewed: fresh.filter((j) => j.fit?.immediateStartAsked && j.fit.tier !== 'ineligible').length,
      profileFacts: (ctx.profile?.skills.length ?? 0) + (ctx.profile?.roles.length ?? 0),
    };
    return {
      service: { version, schemaVersion: schemaVersion(db), startedAt: startedAt ?? null },
      aiHosts: { connected: [] as string[] },
      jobs: counts,
      sources: {
        boards: boards.length,
        healthy: boards.filter((b) => b.health === 'OK').length,
        failing: boards.filter((b) => b.health === 'DEGRADED' || b.health === 'NOT_FOUND').length,
        lastSuccessfulDiscovery: discovery.lastSuccessfulDiscovery(),
      },
      activeTasks: tasks.list(20).filter((t) => t.state === 'RUNNING' || t.state === 'QUEUED'),
      matches,
      applications: appCounts,
      followUps: followUps.slice(0, 5),
      nextActions: nextActions({
        settings,
        jobs: counts,
        boards,
        matches,
        availability: ctx.settings?.joiningAvailability,
        applications: appCounts,
        followUpsDue: followUps.filter((f) => Date.parse(f.dueAt) <= Date.now()).map((f) => ({ id: f.id, note: f.note, title: f.title, employer: f.employer, applicationId: f.applicationId })),
      }),
    };
  });

  registerOpportunityRoutes(app, { db, discovery, tasks });

  registerApplicationRoutes(app, { applications, vault });

  app.get('/api/settings', async () => ({ settings: getSettings(db), definitions: describeSettings() }));

  app.put<{ Params: { key: string }; Body: unknown }>('/api/settings/:key', async (req, reply) => {
    const body = req.body;
    if (typeof body !== 'object' || body === null || !('value' in body)) return reject(reply, 400, 'INVALID_BODY');
    try {
      const actor = req.principal?.kind === 'dashboard' ? 'dashboard' : 'local-client';
      return { key: req.params.key, value: setSetting(db, req.params.key, body.value, actor) };
    } catch (err) {
      if (err instanceof SettingError) {
        return reply.code(err.code === 'UNKNOWN_SETTING' ? 404 : 400).send({ error: err.code, issues: err.issues });
      }
      throw err;
    }
  });

  app.all('/api/*', async (_req, reply) => reject(reply, 404, 'NOT_FOUND'));

  // ---- dashboard assets ----

  app.get('/*', async (req, reply) => {
    if (!assets) {
      reply.code(503).type('text/plain; charset=utf-8');
      return 'The dashboard has not been built. Run `npm run build` in the Career Strike repository.';
    }
    const routePath = pathOf(req);
    // Exact built files, or the app shell for client-side routes such as /settings or /jobs/abc-1.
    const asset = assets.get(routePath) ?? (CLIENT_ROUTE.test(routePath) ? assets.get('/index.html') : undefined);
    if (!asset) return reject(reply, 404, 'NOT_FOUND');
    reply.type(asset.contentType).header('cache-control', asset.immutable ? 'public, max-age=31536000, immutable' : 'no-store');
    return asset.body;
  });

  return app;
}

function pathOf(req: FastifyRequest): string {
  return req.url.split('?', 1)[0] ?? '';
}

const launchFailedPage = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Career Strike</title></head>
<body><main><h1>This dashboard link has expired</h1>
<p>Dashboard links work once and expire after a minute. Run <code>career-strike dashboard</code> to open a new one.</p>
</main></body></html>`;
