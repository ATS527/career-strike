import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { createFileLogger } from '../core/log.js';
import { type AppPaths, ensureHome } from '../core/paths.js';
import { VERSION } from '../core/version.js';
import { openDb } from '../store/db.js';
import { probeHealth, readRuntime, removeRuntime, type RuntimeInfo, writeRuntime } from './runtime.js';
import { newToken } from './security.js';
import { buildServer } from './server.js';
import { loadStaticAssets } from './static.js';

export const DEFAULT_PORT = 47615;

// Resolves to <package>/dist/web from both src/service and dist/service.
export const WEB_DIR = fileURLToPath(new URL('../../dist/web/', import.meta.url));

export class AlreadyRunningError extends Error {
  constructor(readonly info: RuntimeInfo) {
    super(`Career Strike is already running on port ${info.port} (pid ${info.pid}).`);
  }
}

export interface RunningService {
  app: FastifyInstance;
  info: RuntimeInfo;
  stop(): Promise<void>;
}

export async function startService(paths: AppPaths, opts: { port?: number; webDir?: string } = {}): Promise<RunningService> {
  ensureHome(paths);
  const existing = readRuntime(paths.runtimeFile);
  if (existing && (await probeHealth(existing))) throw new AlreadyRunningError(existing);

  const logger = createFileLogger(paths.logs);
  const db = openDb(paths.db);
  const token = newToken();
  const startedAt = new Date().toISOString();
  const assets = loadStaticAssets(opts.webDir ?? WEB_DIR);
  const app = buildServer({ db, token, version: VERSION, startedAt, assets, logger });
  try {
    await app.listen({ host: '127.0.0.1', port: opts.port ?? DEFAULT_PORT });
  } catch (err) {
    db.close();
    throw err;
  }
  const { port } = app.server.address() as AddressInfo;
  const info: RuntimeInfo = { pid: process.pid, port, token, startedAt, version: VERSION };
  writeRuntime(paths.runtimeFile, info);
  logger.info('service.started', { port, version: VERSION, dashboard: assets ? 'available' : 'not-built' });

  let stopped = false;
  return {
    app,
    info,
    stop: async () => {
      if (stopped) return;
      stopped = true;
      removeRuntime(paths.runtimeFile, info.pid);
      await app.close();
      db.close();
      logger.info('service.stopped', {});
    },
  };
}
