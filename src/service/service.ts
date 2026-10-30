import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { type AppPaths, ensureHome } from '../core/paths.js';
import { VERSION } from '../core/version.js';
import { openDb } from '../store/db.js';
import { probeHealth, readRuntime, removeRuntime, type RuntimeInfo, writeRuntime } from './runtime.js';
import { newToken } from './security.js';
import { buildServer } from './server.js';

export const DEFAULT_PORT = 47615;

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

export async function startService(paths: AppPaths, opts: { port?: number } = {}): Promise<RunningService> {
  ensureHome(paths);
  const existing = readRuntime(paths.runtimeFile);
  if (existing && (await probeHealth(existing))) throw new AlreadyRunningError(existing);

  const db = openDb(paths.db);
  const token = newToken();
  const app = buildServer({ db, token, version: VERSION });
  try {
    await app.listen({ host: '127.0.0.1', port: opts.port ?? DEFAULT_PORT });
  } catch (err) {
    db.close();
    throw err;
  }
  const { port } = app.server.address() as AddressInfo;
  const info: RuntimeInfo = { pid: process.pid, port, token, startedAt: new Date().toISOString(), version: VERSION };
  writeRuntime(paths.runtimeFile, info);

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
    },
  };
}
