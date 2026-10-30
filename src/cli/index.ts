#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command, InvalidArgumentError } from 'commander';
import { appPaths, ensureHome, findGitRoot } from '../core/paths.js';
import { MIN_NODE_MAJOR, VERSION } from '../core/version.js';
import { inspectDb, latestKnownVersion, openDb, schemaVersion } from '../store/db.js';
import { HOSTS, type Host, hostVersion, register, settlesTo, unregister } from '../mcp/hosts.js';
import { runMcpStdio, tokenFile } from '../mcp/server.js';
import { dashboardUrl, openInBrowser, startDetached, stopService } from '../service/control.js';
import { localRequest } from '../service/http-client.js';
import { probeHealth, readRuntime } from '../service/runtime.js';
import { AlreadyRunningError, DEFAULT_PORT, startService } from '../service/service.js';

const CLI_ENTRY = fileURLToPath(import.meta.url);

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
      // Exit promptly even if a connection refuses to close.
      setTimeout(() => process.exit(1), 5000).unref();
      void service.stop().then(() => process.exit(0));
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });

program
  .command('start')
  .description('Start the local service in the background')
  .option('-p, --port <port>', 'port to bind on 127.0.0.1', parsePort, DEFAULT_PORT)
  .action(async (opts: { port: number }) => {
    const info = await startDetached(appPaths(), CLI_ENTRY, opts.port);
    console.log(`running on http://127.0.0.1:${info.port} (pid ${info.pid})`);
  });

program
  .command('stop')
  .description('Stop the background service')
  .action(async () => {
    console.log(await stopService(appPaths()));
  });

program
  .command('dashboard')
  .description('Open the dashboard in your browser, starting the service if needed')
  .option('-p, --port <port>', 'port to use if the service must be started', parsePort, DEFAULT_PORT)
  .option('--no-open', 'print the single-use dashboard link instead of opening a browser')
  .action(async (opts: { port: number; open: boolean }) => {
    const info = await startDetached(appPaths(), CLI_ENTRY, opts.port);
    const url = await dashboardUrl(info);
    if (opts.open) {
      openInBrowser(url);
      console.log(`Opened the dashboard (service on http://127.0.0.1:${info.port}).`);
    } else {
      console.log(url);
    }
  });

program
  .command('mcp')
  .description('Run the MCP server over stdio for an AI assistant (launched by the assistant, not by you)')
  .requiredOption('--client <name>', 'which assistant is connecting: codex, claude-code or opencode')
  .action(async (opts: { client: string }) => {
    await runMcpStdio(appPaths(), opts.client, CLI_ENTRY);
  });

function parseHost(value: string): Host {
  if (!(HOSTS as readonly string[]).includes(value)) throw new InvalidArgumentError(`Choose one of: ${HOSTS.join(', ')}.`);
  return value as Host;
}

program
  .command('connect')
  .description('Connect an AI assistant to Career Strike over MCP (changes that assistant’s MCP configuration)')
  .argument('<assistant>', `one of: ${HOSTS.join(', ')}`, parseHost)
  .action(async (assistant: Host) => {
    const version = await hostVersion(assistant);
    if (!version) throw new Error(`${assistant} does not appear to be installed (its command was not found).`);
    const paths = appPaths();
    const info = await startDetached(paths, CLI_ENTRY, DEFAULT_PORT);
    const res = await localRequest(info.port, '/api/mcp-clients', { method: 'POST', body: { name: assistant }, headers: { authorization: `Bearer ${info.token}` } });
    if (res.status !== 201) throw new Error(`Could not create credentials (HTTP ${res.status}).`);
    const { token, client } = res.body as { token: string; client: { id: string } };
    // The assistant's config only holds the command; the scoped token lives in an owner-only file.
    const file = tokenFile(paths, assistant);
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, token, { mode: 0o600 });
    const env: Record<string, string> = process.env.CAREER_STRIKE_HOME ? { CAREER_STRIKE_HOME: paths.home } : {};
    await register(assistant, { command: process.execPath, args: [...process.execArgv, CLI_ENTRY, 'mcp', '--client', assistant], env });
    if (!(await settlesTo(assistant, true))) throw new Error(`${assistant} did not list Career Strike after registration; check its MCP configuration.`);
    console.log(`Connected ${assistant} (${version}). It can search and read public postings, add jobs and boards, and shortlist.`);
    console.log(`Grant more access in the dashboard under Settings → AI assistants. Client id: ${client.id}`);
  });

program
  .command('disconnect')
  .description('Remove Career Strike from an AI assistant and revoke its access')
  .argument('<assistant>', `one of: ${HOSTS.join(', ')}`, parseHost)
  .action(async (assistant: Host) => {
    const paths = appPaths();
    const removed = await unregister(assistant);
    fs.rmSync(tokenFile(paths, assistant), { force: true });
    const info = readRuntime(paths.runtimeFile);
    if (info && (await probeHealth(info))) {
      const list = await localRequest(info.port, '/api/mcp-clients', { headers: { authorization: `Bearer ${info.token}` } });
      for (const c of (list.body as { clients: { id: string; name: string }[] }).clients.filter((x) => x.name === assistant)) {
        await localRequest(info.port, `/api/mcp-clients/${c.id}/revoke`, { method: 'POST', headers: { authorization: `Bearer ${info.token}` } });
      }
    }
    const gone = await settlesTo(assistant, false);
    console.log(removed === 'removed' ? `Removed Career Strike from ${assistant}.` : `${assistant} did not have Career Strike configured.`);
    if (!gone) {
      process.exitCode = 1;
      console.error(`${assistant} still lists ${'career-strike'}; check its MCP configuration.`);
    }
  });

program
  .command('practice')
  .description('Run an owned practice endpoint on this computer and add a practice job, to try automated submission safely')
  .option('-p, --port <port>', 'port for the practice endpoint (0 = any free port)', parsePort, 0)
  .action(async (opts: { port: number }) => {
    const { startPracticeAts } = await import('../practice/test-ats.js');
    const paths = appPaths();
    const info = await startDetached(paths, CLI_ENTRY, DEFAULT_PORT);
    const ats = await startPracticeAts(opts.port);
    const auth = { authorization: `Bearer ${info.token}` };
    const set = await localRequest(info.port, '/api/practice/endpoint', { method: 'POST', body: { origin: ats.origin }, headers: auth });
    if (set.status !== 200) throw new Error(`Could not register the practice endpoint (HTTP ${set.status}).`);
    const job = await localRequest(info.port, '/api/practice/jobs', { method: 'POST', body: {}, headers: auth });
    console.log(`Practice endpoint running at ${ats.origin} (nothing sent here leaves this computer).`);
    console.log(`A practice job was added: open the dashboard, prepare an application for “Practice application”, approve it and submit.`);
    console.log(`To try monitoring offline, add the job board ${ats.origin}/boards/demo under Opportunities → Job boards.`);
    console.log(`Job id: ${(job.body as { jobId: string }).jobId}. Press Ctrl-C to stop the practice endpoint.`);
    const stop = (): void => void ats.close().then(() => process.exit(0));
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
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
