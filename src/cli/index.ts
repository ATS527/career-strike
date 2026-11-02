#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { Command, InvalidArgumentError } from 'commander';
import { appPaths, ensureHome, findGitRoot } from '../core/paths.js';
import { MIN_NODE_MAJOR, VERSION } from '../core/version.js';
import { inspectDb, latestKnownVersion, openDb, schemaVersion } from '../store/db.js';
import { backup, deleteAllData, exportData, restore, rollback } from '../store/lifecycle.js';
import { defaultSecretStore } from '../vault/secrets.js';
import { HOSTS, type Host, hostVersion, isRegistered, register, settlesTo, unregister } from '../mcp/hosts.js';
import { runMcpStdio, tokenFile } from '../mcp/server.js';
import { isMcpClientName } from '../mcp/clients.js';
import { dashboardUrl, openInBrowser, processAlive, startDetached, stopService } from '../service/control.js';
import { runDoctorChecks } from '../service/diagnostics.js';
import { localRequest } from '../service/http-client.js';
import { probeHealth, readRuntime } from '../service/runtime.js';
import { AlreadyRunningError, DEFAULT_PORT, startService, WEB_DIR } from '../service/service.js';
import { employerTargetsFor, verifyTargetDiscovery } from '../markets/employers.js';
import { isCountryCode, type CountryCode } from '../markets/countries.js';
import { createAdapters } from '../sources/adapters.js';
import { Discovery, DuplicateBoardError } from '../career/discovery.js';
import { TaskSupervisor } from '../supervisor/tasks.js';
import { getSettings, setSetting } from '../store/settings.js';
import { UPDATE_CHECK_SETTING } from '../updates/checker.js';
import { latestRelease, UpdateError } from '../updates/releases.js';
import { Updater } from '../updates/updater.js';
import { compareVersions } from '../updates/version.js';

const CLI_ENTRY = fileURLToPath(import.meta.url);

/** Source and packaged builds keep the executable two directories below the package root. */
function packageRoot(): string {
  return path.resolve(path.dirname(fs.realpathSync(CLI_ENTRY)), '..', '..');
}

function parsePort(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 65535) throw new InvalidArgumentError('Port must be an integer from 0 to 65535.');
  return n;
}

const program = new Command().name('career-strike').description('Local-first job-hunting platform').version(VERSION);

program
  .command('init')
  .description('Create the local data directory and database')
  .option('--check-updates', 'look for new Career Strike versions once a week')
  .option('--no-check-updates', 'never look for new versions on its own')
  .action(async (opts: { checkUpdates?: boolean }) => {
    const paths = appPaths();
    ensureHome(paths);
    const db = openDb(paths.db);
    try {
      console.log(`Data directory: ${paths.home}`);
      console.log(`Database schema: v${schemaVersion(db)}`);
      // Asked once: an explicit flag, or a question in an interactive terminal. Never assumed.
      const decided = db.prepare('SELECT 1 FROM settings WHERE key = ?').get(UPDATE_CHECK_SETTING) !== undefined;
      let choice = opts.checkUpdates;
      if (choice === undefined && !decided && process.stdin.isTTY && process.stdout.isTTY) {
        choice = await ask('Check for new Career Strike versions once a week? This sends one request to GitHub with nothing about you. [y/N] ');
      }
      if (choice !== undefined) setSetting(db, UPDATE_CHECK_SETTING, choice ? 'weekly' : 'off', 'local-client');
      const on = getSettings(db)[UPDATE_CHECK_SETTING] === 'weekly';
      console.log(`Update checks: ${on ? 'once a week' : 'off'} (change in Settings, or run \`career-strike update --check\` any time)`);
    } finally {
      db.close();
    }
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
  .option('--dev', 'open the Vite dashboard on http://127.0.0.1:5173')
  .option('--no-open', 'print the single-use dashboard link instead of opening a browser')
  .action(async (opts: { port: number; dev?: boolean; open: boolean }) => {
    const info = await startDetached(appPaths(), CLI_ENTRY, opts.port);
    const url = await dashboardUrl(info, opts.dev ? 'http://127.0.0.1:5173' : undefined);
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
  .requiredOption('--client <name>', 'a safe local MCP client label, e.g. codex or axym', parseMcpClientName)
  .action(async (opts: { client: string }) => {
    await runMcpStdio(appPaths(), opts.client, CLI_ENTRY);
  });

function parseMcpClientName(value: string): string {
  if (!isMcpClientName(value)) throw new InvalidArgumentError('Use lowercase letters, numbers and hyphens; start with a letter (for example codex or axym).');
  return value;
}

function parseHost(value: string): Host {
  if (!(HOSTS as readonly string[]).includes(value)) throw new InvalidArgumentError(`Choose one of: ${HOSTS.join(', ')}.`);
  return value as Host;
}

async function authorizeMcpClient(clientName: string): Promise<{ id: string }> {
  const paths = appPaths();
  const info = await startDetached(paths, CLI_ENTRY, DEFAULT_PORT);
  const res = await localRequest(info.port, '/api/mcp-clients', { method: 'POST', body: { name: clientName }, headers: { authorization: `Bearer ${info.token}` } });
  if (res.status !== 201) throw new Error(`Could not create MCP credentials (HTTP ${res.status}).`);
  const { token, client } = res.body as { token: string; client: { id: string } };
  // The token is never placed in a host configuration or printed to the terminal.
  const file = tokenFile(paths, clientName);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, token, { mode: 0o600 });
  return { id: client.id };
}

program
  .command('connect')
  .description('Connect an AI assistant to Career Strike over MCP (changes that assistant’s MCP configuration)')
  .argument('<assistant>', `one of: ${HOSTS.join(', ')}`, parseHost)
  .action(async (assistant: Host) => {
    const version = await hostVersion(assistant);
    if (!version) throw new Error(`${assistant} does not appear to be installed (its command was not found).`);
    const client = await authorizeMcpClient(assistant);
    const paths = appPaths();
    const env: Record<string, string> = process.env.CAREER_STRIKE_HOME ? { CAREER_STRIKE_HOME: paths.home } : {};
    await register(assistant, { command: process.execPath, args: [...process.execArgv, CLI_ENTRY, 'mcp', '--client', assistant], env });
    if (!(await settlesTo(assistant, true))) throw new Error(`${assistant} did not list Career Strike after registration; check its MCP configuration.`);
    console.log(`Connected ${assistant} (${version}). It can search and read public postings, add jobs and boards, and shortlist.`);
    console.log(`Grant more access in the dashboard under Settings → AI assistants. Client id: ${client.id}`);
  });

program
  .command('authorize-mcp')
  .description('Authorize any MCP-compatible client without changing that client’s configuration')
  .argument('<client>', 'a local label, e.g. codex or axym', parseMcpClientName)
  .action(async (client: string) => {
    const result = await authorizeMcpClient(client);
    console.log(`Authorized ${client}. Configure it to run: career-strike mcp --client ${client}`);
    console.log(`Grant more access in the dashboard under Settings → AI assistants. Client id: ${result.id}`);
  });

program
  .command('plugin-path')
  .description('Print the installed Career Strike plugin directory for Codex plugin setup')
  .action(() => {
    const plugin = path.join(packageRoot(), 'plugins', 'career-strike');
    if (!fs.existsSync(path.join(plugin, 'plugin.json'))) throw new Error('The Career Strike plugin is not included in this installation. Reinstall a package that includes plugins.');
    console.log(plugin);
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
      const clientsToRevoke = (list.body as { clients: { id: string; name: string }[] }).clients.filter((x) => x.name === assistant);
      await Promise.all(
        clientsToRevoke.map((c) =>
          localRequest(info.port, `/api/mcp-clients/${c.id}/revoke`, { method: 'POST', headers: { authorization: `Bearer ${info.token}` } }),
        ),
      );
    }
    const gone = await settlesTo(assistant, false);
    console.log(removed === 'removed' ? `Removed Career Strike from ${assistant}.` : `${assistant} did not have Career Strike configured.`);
    if (!gone) {
      process.exitCode = 1;
      console.error(`${assistant} still lists ${'career-strike'}; check its MCP configuration.`);
    }
  });

program
  .command('revoke-mcp')
  .description('Revoke a generic MCP client and remove its local credential')
  .argument('<client>', 'the local label used with authorize-mcp', parseMcpClientName)
  .action(async (client: string) => {
    const paths = appPaths();
    const info = await startDetached(paths, CLI_ENTRY, DEFAULT_PORT);
    const list = await localRequest(info.port, '/api/mcp-clients', { headers: { authorization: `Bearer ${info.token}` } });
    if (list.status !== 200) throw new Error(`Could not list MCP clients (HTTP ${list.status}).`);
    const matches = (list.body as { clients: { id: string; name: string }[] }).clients.filter((item) => item.name === client);
    await Promise.all(
      matches.map(async (item) => {
        const res = await localRequest(info.port, `/api/mcp-clients/${item.id}/revoke`, { method: 'POST', headers: { authorization: `Bearer ${info.token}` } });
        if (res.status !== 200) throw new Error(`Could not revoke MCP credentials (HTTP ${res.status}).`);
      }),
    );
    fs.rmSync(tokenFile(paths, client), { force: true });
    console.log(matches.length ? `Revoked ${client}. Remove its Career Strike MCP entry from the client’s configuration.` : `${client} had no active Career Strike credential.`);
  });

program
  .command('practice')
  .description('Run an owned practice endpoint on this computer and add a practice job, to try automated submission safely')
  .option('-p, --port <port>', 'port for the practice endpoint (0 = any free port)', parsePort, 0)
  .action(async (opts: { port: number }) => {
    const { startPracticeAts } = await import('../practice/test-ats.js');
    const paths = appPaths();
    const [info, ats] = await Promise.all([
      startDetached(paths, CLI_ENTRY, DEFAULT_PORT),
      startPracticeAts(opts.port),
    ]);
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
      const result = { state: 'running', port: info.port, pid: info.pid, version: info.version, installedVersion: VERSION, startedAt: info.startedAt };
      console.log(opts.json ? JSON.stringify(result) : `running on http://127.0.0.1:${info.port} (pid ${info.pid})`);
      // After an install without a restart, the old program keeps running until it is restarted.
      if (!opts.json && info.version !== VERSION) {
        console.log(`The running service is ${info.version} but ${VERSION} is installed. Restart it: career-strike stop && career-strike start`);
      }
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
    const checks = await runDoctorChecks(appPaths());
    for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name.padEnd(18)} ${c.detail}`);
    if (checks.some((c) => !c.ok)) process.exitCode = 1;
  });

function parseCountry(value: string): CountryCode {
  const country = value.toUpperCase();
  if (!isCountryCode(country)) throw new InvalidArgumentError('Choose a configured ISO country code, for example IN.');
  return country;
}

program
  .command('verify-market')
  .description('Verify and adopt a curated employer-direct board only after a permitted live retrieval')
  .argument('<country>', 'configured ISO country code', parseCountry)
  .option('--target <id>', 'one curated employer target (required when a market has multiple targets)')
  .action(async (country: CountryCode, opts: { target?: string }) => {
    await requireStopped('verify a market');
    const targets = employerTargetsFor(country);
    const selected = opts.target ? targets.filter((target) => target.id === opts.target) : targets;
    if (selected.length === 0) throw new Error(`No approved employer-direct target is available for ${country}.`);
    if (selected.length > 1) throw new Error(`Choose one target with --target: ${selected.map((target) => target.id).join(', ')}.`);
    const target = selected[0]!;
    const paths = appPaths();
    ensureHome(paths);
    const db = openDb(paths.db);
    try {
      const adapters = createAdapters();
      const verification = await verifyTargetDiscovery(target, adapters[target.source], country);
      const discovery = new Discovery(db, adapters, new TaskSupervisor(db));
      const adopted = discovery.adoptVerifiedBoard(target.source, target.board, verification.postings, new Date(verification.verifiedAt));
      console.log(`Certified ${country} discovery through ${target.employer} (${target.source}/${target.board}).`);
      console.log(`Retrieved ${adopted.result.fetched} postings; ${verification.countryPostings.length} have explicit ${country} location evidence.`);
      console.log(`Monitoring is enabled as ${adopted.board.id}. ${country} may now be described as DISCOVERY_AVAILABLE for this local installation.`);
    } catch (err) {
      if (err instanceof DuplicateBoardError) {
        throw new Error(`The verified target is already monitored; refresh it from the dashboard instead. ${country} is not re-certified by this command.`);
      }
      throw err;
    } finally {
      db.close();
    }
  });

async function requireStopped(action: string): Promise<void> {
  const info = readRuntime(appPaths().runtimeFile);
  // A live process counts even if it does not answer: a hung service still holds the database open.
  if (info && ((await probeHealth(info)) || processAlive(info.pid))) {
    throw new Error(`The service is running (pid ${info.pid}). Stop it first with \`career-strike stop\`, then ${action}.`);
  }
}

program
  .command('export')
  .description('Write all your career data and documents to a new folder, readable without Career Strike')
  .argument('<folder>', 'a new or empty folder outside any git repository')
  .action((folder: string) => {
    const r = exportData(appPaths(), folder);
    const rows = Object.values(r.tables).reduce((a, b) => a + b, 0);
    console.log(`Exported ${rows} records and ${r.documents} documents to ${r.dir}`);
    console.log(`Left out on purpose: ${r.omitted.join('; ')}.`);
    console.log('This folder contains private information. Keep it somewhere only you can read.');
  });

program
  .command('backup')
  .description('Copy the database and documents to a new folder for `career-strike restore`')
  .argument('<folder>', 'a new or empty folder outside any git repository')
  .action((folder: string) => {
    const r = backup(appPaths(), folder);
    console.log(`Backed up ${r.files} files (schema v${r.schemaVersion}) to ${r.dir}`);
    console.log('Approval signing keys stay in your keychain and are not part of the backup; approvals made before a restore on another computer must be given again.');
  });

program
  .command('restore')
  .description('Replace current data with a verified backup (current data is kept aside first)')
  .argument('<folder>', 'a folder written by `career-strike backup`')
  .action(async (folder: string) => {
    await requireStopped('restore');
    const r = restore(appPaths(), folder);
    console.log(`Restored (schema v${r.schemaVersion}).${r.previous ? ` Your previous data was moved to ${r.previous}` : ''}`);
  });

program
  .command('rollback')
  .description('Restore the database backup saved before an upgrade (current data is kept aside first)')
  .option('--backup <file>', 'path to a specific pre-upgrade backup file')
  .action(async (opts: { backup?: string }) => {
    await requireStopped('rollback');
    const r = rollback(appPaths(), { targetFile: opts.backup });
    console.log(
      `Restored pre-upgrade backup from ${r.restoredFrom} (schema v${r.schemaVersion}).` +
        (r.previous ? ` Your previous data was moved to ${r.previous}` : ''),
    );
  });

async function ask(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^y(es)?$/i.test((await rl.question(question)).trim());
  } finally {
    rl.close();
  }
}

program
  .command('update')
  .description('Update Career Strike to the newest release; your data is backed up first and the update can be undone')
  .option('--check', 'only say whether a newer version has been released')
  .option('--to <version>', 'install a specific newer release')
  .option('--undo', 'go back to the version the last update replaced')
  .option('-y, --yes', 'do not ask for confirmation')
  .option('--json', 'machine-readable output (with --check)')
  .action(async (opts: { check?: boolean; to?: string; undo?: boolean; yes?: boolean; json?: boolean }) => {
    try {
      if (opts.check) {
        const latest = await latestRelease();
        const available = latest !== null && compareVersions(latest.version, VERSION) > 0;
        if (opts.json) {
          console.log(JSON.stringify({ current: VERSION, latest: latest?.version ?? null, updateAvailable: available, url: latest?.url ?? null }));
        } else if (!latest) {
          console.log(`You have ${VERSION}. No releases have been published yet.`);
        } else if (available) {
          console.log(`Career Strike ${latest.version} is available (you have ${VERSION}).`);
          console.log(`Release notes: ${latest.url}`);
          console.log('Install it with: career-strike update');
        } else {
          console.log(`You have the newest version (${VERSION}).`);
        }
        return;
      }

      const prefix = globalPrefix();
      if (!prefix) {
        throw new UpdateError(
          `This copy of Career Strike runs from ${packageRoot()}, not from an npm global install. Update it the way you installed it (for a source checkout: git pull && npm ci && npm run build).`,
        );
      }
      const confirm = async (question: string): Promise<boolean> => {
        if (opts.yes) return true;
        if (!process.stdin.isTTY) throw new UpdateError('Run with --yes to update without a confirmation prompt.');
        return ask(`${question} [y/N] `);
      };
      const updater = new Updater({ paths: appPaths(), currentVersion: VERSION, packageRoot: packageRoot(), prefix, confirm });

      if (opts.undo) {
        const r = await updater.undo();
        console.log(`Back on Career Strike ${r.to} (was ${r.from}).${r.restoredData ? ' Your data was restored from before the update.' : ''}`);
        return;
      }

      const r = await updater.update({ to: opts.to });
      if (r.result === 'up-to-date') console.log(r.latest ? `You have the newest version (${r.current}).` : `You have ${r.current}. No releases have been published yet.`);
      else if (r.result === 'declined') console.log('Nothing was changed.');
      else if (r.result === 'rolled-back') {
        console.error(`Career Strike was not updated to ${r.to}; you are still on ${r.from}. Reason: ${r.reason}`);
        process.exitCode = 1;
      } else {
        console.log(`Updated Career Strike ${r.from} → ${r.to}.${r.restarted ? ' The service was restarted.' : ''}`);
        console.log('Changed your mind? career-strike update --undo');
        console.log('Open the dashboard: career-strike dashboard');
      }
    } catch (err) {
      if (!(err instanceof UpdateError)) throw err;
      console.error(err.message);
      process.exitCode = 1;
    }
  });

/** The npm prefix Career Strike was installed into globally, if it was. */
function globalPrefix(): string | null {
  const pkgRoot = packageRoot();
  const nodeModules = path.dirname(pkgRoot);
  if (path.basename(nodeModules) !== 'node_modules' || path.basename(pkgRoot) !== 'career-strike') return null;
  const parent = path.dirname(nodeModules);
  return path.basename(parent) === 'lib' ? path.dirname(parent) : parent;
}

program
  .command('uninstall')
  .description('Remove Career Strike from AI assistants and remove the program; your data is kept unless you delete it separately')
  .action(async () => {
    const paths = appPaths();
    console.log(`Service: ${await stopService(paths)}`);
    await Promise.all(
      HOSTS.map(async (host) => {
        if (!(await hostVersion(host))) return;
        if (!(await isRegistered(host))) return;
        await unregister(host);
        const gone = await settlesTo(host, false);
        console.log(gone ? `Removed Career Strike from ${host}.` : `${host} still lists Career Strike; remove "career-strike" from its MCP settings by hand.`);
        if (!gone) process.exitCode = 1;
      }),
    );
    fs.rmSync(path.join(paths.home, 'mcp'), { recursive: true, force: true });
    const prefix = globalPrefix();
    if (prefix) {
      const { execFileSync } = await import('node:child_process');
      execFileSync('npm', ['uninstall', '--global', '--prefix', prefix, 'career-strike'], { stdio: 'ignore', shell: process.platform === 'win32' });
      console.log(`Removed the career-strike program from ${prefix}.`);
    } else {
      console.log('Career Strike was not installed with `npm install --global`; remove it the way you installed it.');
    }
    console.log(`Your data is still in ${paths.home}. To delete it permanently: career-strike delete-data --confirm "${DELETE_PHRASE}" (before uninstalling), or delete that folder.`);
  });

const DELETE_PHRASE = 'delete my career data';
program
  .command('delete-data')
  .description('Permanently delete all Career Strike data on this computer (export first if you want a copy)')
  .option('--confirm <phrase>', `type exactly: "${DELETE_PHRASE}"`)
  .action(async (opts: { confirm?: string }) => {
    const paths = appPaths();
    if (opts.confirm !== DELETE_PHRASE) {
      console.error(`This permanently deletes your profile, applications, documents, settings, logs and backups in ${paths.home}.`);
      console.error(`Nothing was deleted. To go ahead, run: career-strike delete-data --confirm "${DELETE_PHRASE}"`);
      process.exitCode = 1;
      return;
    }
    await requireStopped('delete your data');
    const r = await deleteAllData(paths, defaultSecretStore(paths.home));
    console.log(`Deleted: ${r.removed.join(', ') || 'nothing was stored'}; secrets: ${r.secretsRemoved.join(', ')}.`);
    if (r.leftInPlace.length) console.log(`Not created by Career Strike, so left in place in ${paths.home}: ${r.leftInPlace.join(', ')}`);
    console.log('AI assistants may still list Career Strike in their settings: run `career-strike disconnect <assistant>` to remove it.');
  });

try {
  await program.parseAsync();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = err instanceof AlreadyRunningError ? 2 : 1;
}
