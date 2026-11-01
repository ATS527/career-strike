import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { AppPaths } from '../core/paths.js';
import { ensureHome } from '../core/paths.js';
import { localRequest } from './http-client.js';
import { probeHealth, readRuntime, type RuntimeInfo } from './runtime.js';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function runningService(paths: AppPaths): Promise<RuntimeInfo | null> {
  const info = readRuntime(paths.runtimeFile);
  return info && (await probeHealth(info)) ? info : null;
}

/**
 * Start `serve` as a detached background process (same Node binary, flags and CLI entry point as
 * the caller) and wait until it answers health checks. Returns the running service.
 */
export async function startDetached(paths: AppPaths, cliEntry: string, port: number, timeoutMs = 15_000): Promise<RuntimeInfo> {
  const existing = await runningService(paths);
  if (existing) return existing;
  ensureHome(paths);
  const out = fs.openSync(path.join(paths.logs, 'service.out'), 'a', 0o600);
  const child = spawn(process.execPath, [...process.execArgv, cliEntry, 'serve', '--port', String(port)], {
    detached: true,
    stdio: ['ignore', out, out],
    env: process.env,
  });
  fs.closeSync(out);
  let exitCode: number | null = null;
  child.once('exit', (code) => {
    exitCode = code ?? -1;
  });
  child.unref();

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (exitCode !== null) throw new Error(`The service exited during startup (code ${exitCode}). See ${path.join(paths.logs, 'service.out')}.`);
    const info = readRuntime(paths.runtimeFile);
    if (info && info.pid === child.pid && (await probeHealth(info))) return info;
    await sleep(100);
  }
  throw new Error(`The service did not become healthy within ${timeoutMs / 1000}s. See ${path.join(paths.logs, 'service.out')}.`);
}

/** Stop the service recorded in the runtime file, only after confirming it is ours. */
export async function stopService(paths: AppPaths, timeoutMs = 10_000): Promise<'stopped' | 'not-running'> {
  const info = await runningService(paths);
  if (!info) return 'not-running';
  process.kill(info.pid, 'SIGTERM');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // Done only when the process has actually exited, not merely stopped answering.
    if (!processAlive(info.pid)) return 'stopped';
    await sleep(100);
  }
  throw new Error(`Service pid ${info.pid} did not stop within ${timeoutMs / 1000}s.`);
}

export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export async function dashboardUrl(info: RuntimeInfo, origin = `http://127.0.0.1:${info.port}`): Promise<string> {
  const res = await localRequest(info.port, '/api/session/launch-token', {
    method: 'POST',
    headers: { authorization: `Bearer ${info.token}` },
  });
  const body = res.body as { token?: unknown } | null;
  if (res.status !== 200 || typeof body?.token !== 'string') throw new Error(`Could not create a dashboard session (HTTP ${res.status}).`);
  return `${origin}/auth/launch?t=${encodeURIComponent(body.token)}`;
}

export function openInBrowser(url: string): void {
  const [cmd, args] =
    process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
}
