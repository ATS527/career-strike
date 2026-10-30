#!/usr/bin/env node
import fs from 'node:fs';
import { Command, InvalidArgumentError } from 'commander';
import { appPaths, ensureHome, findGitRoot } from '../core/paths.js';
import { MIN_NODE_MAJOR, VERSION } from '../core/version.js';
import { inspectDb, latestKnownVersion, openDb, schemaVersion } from '../store/db.js';
import { probeHealth, readRuntime } from '../service/runtime.js';
import { AlreadyRunningError, DEFAULT_PORT, startService } from '../service/service.js';

function parsePort(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 65535) throw new InvalidArgumentError('Port must be an integer from 0 to 65535.');
  return n;
}

const program = new Command().name('career-strike').description('Local-first job-hunting platform').version(VERSION);

program
  .command('init')
  .description('Create the local data directory and database')
  .action(() => {
    const paths = appPaths();
    ensureHome(paths);
    const db = openDb(paths.db);
    console.log(`Data directory: ${paths.home}`);
    console.log(`Database schema: v${schemaVersion(db)}`);
    db.close();
  });

program
  .command('serve')
  .description('Run the local service in the foreground (127.0.0.1 only)')
  .option('-p, --port <port>', 'port to bind on 127.0.0.1 (0 = any free port)', parsePort, DEFAULT_PORT)
  .action(async (opts: { port: number }) => {
    const service = await startService(appPaths(), { port: opts.port });
    console.log(`Career Strike ${VERSION} listening on http://127.0.0.1:${service.info.port} (pid ${service.info.pid})`);
    const shutdown = (): void => {
      void service.stop().then(() => process.exit(0));
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });

program
  .command('status')
  .description('Report whether the local service is running')
  .option('--json', 'machine-readable output')
  .action(async (opts: { json?: boolean }) => {
    const info = readRuntime(appPaths().runtimeFile);
    if (info && (await probeHealth(info))) {
      const result = { state: 'running', port: info.port, pid: info.pid, version: info.version, startedAt: info.startedAt };
      console.log(opts.json ? JSON.stringify(result) : `running on http://127.0.0.1:${info.port} (pid ${info.pid})`);
      return;
    }
    // A runtime file without a live service means the previous process died without cleanup.
    const state = info ? 'stale' : 'stopped';
    console.log(opts.json ? JSON.stringify({ state }) : state);
    process.exitCode = 3;
  });

program
  .command('doctor')
  .description('Diagnose the local installation (read-only)')
  .action(async () => {
    const paths = appPaths();
    const checks: { name: string; ok: boolean; detail: string }[] = [];
    const nodeMajor = Number(process.versions.node.split('.')[0]);
    checks.push({ name: 'node', ok: nodeMajor >= MIN_NODE_MAJOR, detail: process.versions.node });
    const repo = findGitRoot(paths.home);
    checks.push({ name: 'data-outside-repo', ok: repo === null, detail: repo ?? paths.home });
    if (process.platform !== 'win32' && fs.existsSync(paths.home)) {
      const mode = fs.statSync(paths.home).mode & 0o777;
      checks.push({ name: 'data-permissions', ok: (mode & 0o077) === 0, detail: mode.toString(8) });
    }
    try {
      const version = inspectDb(paths.db);
      checks.push(
        version === null
          ? { name: 'database', ok: false, detail: 'not initialised; run `career-strike init`' }
          : { name: 'database', ok: version === latestKnownVersion(), detail: `schema v${version} (build supports v${latestKnownVersion()})` },
      );
    } catch (err) {
      checks.push({ name: 'database', ok: false, detail: err instanceof Error ? err.message : String(err) });
    }
    const info = readRuntime(paths.runtimeFile);
    const running = info !== null && (await probeHealth(info));
    checks.push({ name: 'service', ok: true, detail: running && info ? `running on port ${info.port}` : 'not running' });
    for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name.padEnd(18)} ${c.detail}`);
    if (checks.some((c) => !c.ok)) process.exitCode = 1;
  });

try {
  await program.parseAsync();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = err instanceof AlreadyRunningError ? 2 : 1;
}
