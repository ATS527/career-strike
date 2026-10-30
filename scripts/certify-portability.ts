// G-06: an opportunity saved through one real assistant is visible in the dashboard and through
// another real assistant connected to the same Career Strike instance.
//
//   npm run build && npx tsx scripts/certify-portability.ts claude-code opencode
import { execFile, execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { syncBoard } from '../src/career/jobs.js';
import { HOSTS, type Host, hostVersion, settlesTo } from '../src/mcp/hosts.js';
import { localRequest } from '../src/service/http-client.js';
import { readRuntime } from '../src/service/runtime.js';
import { openDb } from '../src/store/db.js';
import { RegistrySchema, serializeRegistry, validateRegistry } from './registry.js';

const run = promisify(execFile);
const CLI = path.resolve('dist/cli/index.js');

function ask(host: Host, prompt: string, cwd: string, env: NodeJS.ProcessEnv): Promise<string> {
  const args =
    host === 'claude-code'
      ? ['-p', prompt, '--allowedTools', 'mcp__career-strike__cs_search_jobs,mcp__career-strike__cs_set_job_decision,mcp__career-strike__cs_list_shortlist', '--max-turns', '10']
      : host === 'opencode'
        ? ['run', '--auto', prompt]
        : ['exec', '--skip-git-repo-check', '-s', 'read-only', '-C', cwd, prompt];
  const cmd = { codex: 'codex', 'claude-code': 'claude', opencode: 'opencode' }[host];
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.stderr.on('data', (d: Buffer) => (out += d.toString()));
    const timer = setTimeout(() => child.kill('SIGTERM'), 6 * 60_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(`${out}\n[exit ${code}]`);
    });
  });
}

async function main(): Promise<number> {
  const [writer, reader] = process.argv.slice(2) as [Host, Host];
  if (!HOSTS.includes(writer) || !HOSTS.includes(reader) || writer === reader) {
    console.error('Usage: certify-portability.ts <writer-host> <reader-host>');
    return 2;
  }
  if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() !== '') {
    console.error('Commit first.');
    return 2;
  }
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-cert-port-'));
  const home = path.join(root, 'data');
  const work = path.join(root, 'work');
  fs.mkdirSync(work, { recursive: true });
  const env = { ...process.env, CAREER_STRIKE_HOME: home, CAREER_STRIKE_SECRET_STORE: 'file' };
  const cs = (...args: string[]) => run(process.execPath, [CLI, ...args], { env, timeout: 120_000 });
  const marker = `Portable${Date.now().toString(36)}`;
  const checks: { name: string; passed: boolean; detail: string }[] = [];
  const check = (name: string, passed: boolean, detail: string): void => {
    checks.push({ name, passed, detail });
    console.log(`${passed ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
  };
  const transcript: Record<string, string> = {};
  try {
    await cs('init');
    const db = openDb(path.join(home, 'career-strike.db'));
    syncBoard(db, 'lever', 'port', [1, 2, 3].map((i) => ({
      source: 'lever' as const, board: 'port', sourceJobId: `p-${i}`, employer: 'Synthetic Portability Co', title: `${marker} Role ${i}`, locationText: 'Remote',
      remotePolicy: 'remote' as const, employmentType: 'full_time' as const, department: null, salary: null, description: [{ type: 'paragraph' as const, text: 'Synthetic.' }],
      applyUrl: `https://careers.example.com/p/${i}`, postingUrl: `https://careers.example.com/p/${i}`, publishedAt: null, unresolved: [],
    })));
    db.close();
    await cs('connect', writer);
    await cs('connect', reader);
    const info = readRuntime(path.join(home, 'service.json'))!;
    const admin = (url: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) =>
      localRequest(info.port, url, { ...init, headers: { authorization: `Bearer ${info.token}`, ...init.headers } });

    // The candidate grants the reading assistant access to the shortlist, in a real dashboard session.
    const minted = await admin('/api/session/launch-token', { method: 'POST' });
    const launch = await localRequest(info.port, `/auth/launch?t=${(minted.body as { token: string }).token}`);
    const cookie = launch.headers['set-cookie']![0]!.split(';', 1)[0]!;
    const csrf = ((await localRequest(info.port, '/api/session', { headers: { cookie } })).body as { csrf: string }).csrf;
    const clients = ((await admin('/api/mcp-clients')).body as { clients: { id: string; name: string }[] }).clients;
    const readerId = clients.find((c) => c.name === reader)!.id;
    const grant = await localRequest(info.port, `/api/mcp-clients/${readerId}/scopes`, { method: 'PUT', body: { scopes: ['personal:read'] }, headers: { cookie, 'x-cs-csrf': csrf } });
    check('candidate granted shortlist access in the dashboard', grant.status === 200, `HTTP ${grant.status}`);

    transcript.writer = (await ask(writer, `Use only the career-strike MCP tools. Search for "${marker}" and shortlist the job titled "${marker} Role 2" with cs_set_job_decision. Reply "done".`, work, env)).slice(-3000);
    const shortlisted = (await admin('/api/jobs?disposition=shortlisted&status=all')).body as { jobs: { title: string }[] };
    check(`${writer} shortlisted the job`, shortlisted.jobs.map((j) => j.title).join() === `${marker} Role 2`, JSON.stringify(shortlisted.jobs.map((j) => j.title)));
    const db2 = openDb(path.join(home, 'career-strike.db'));
    const actor = db2.prepare("SELECT actor FROM audit_events WHERE action = 'job.disposition' ORDER BY id DESC LIMIT 1").pluck().get();
    db2.close();
    check('the change is attributed to the writing assistant', actor === `ai:${writer}`, String(actor));

    transcript.reader = (await ask(reader, 'Use only the career-strike MCP tools. Call cs_list_shortlist and reply with the exact titles it returns.', work, env)).slice(-3000);
    check(`${reader} sees the shortlist made through ${writer}`, transcript.reader.includes(`${marker} Role 2`) && !transcript.reader.includes(`${marker} Role 3`), 'title only available from cs_list_shortlist');
    const log = fs.readFileSync(path.join(home, 'logs', 'service.log'), 'utf8');
    check('shortlist read reached Career Strike', /"path":"\/api\/mcp\/shortlist","status":200/.test(log), 'service log');

    // The dashboard side, in a real browser, at this revision.
    const e2e = spawnSync('npx', ['playwright', 'test', 'test/e2e/assistants.spec.ts', '--reporter=line'], { encoding: 'utf8' });
    check('dashboard shows shortlists made through MCP (browser)', e2e.status === 0, (e2e.stdout.match(/\d+ passed[^\n]*/) ?? ['see output'])[0]!);
  } catch (err) {
    check('certification ran to completion', false, err instanceof Error ? err.message.split('\n')[0]! : String(err));
  } finally {
    for (const h of [writer, reader]) await cs('disconnect', h).catch(() => undefined);
    await cs('stop').catch(() => undefined);
    for (const h of [writer, reader]) check(`${h} left without Career Strike`, await settlesTo(h, false), `${h} mcp list`);
    fs.rmSync(root, { recursive: true, force: true });
  }

  const passed = checks.every((c) => c.passed);
  const at = new Date().toISOString();
  const out = path.join('acceptance', 'evidence', 'real-host', 'portability.json');
  fs.writeFileSync(out, `${JSON.stringify({ revision, at, writer: `${writer} ${await hostVersion(writer)}`, reader: `${reader} ${await hostVersion(reader)}`, passed, checks, transcript }, null, 2)}\n`);
  const registry = RegistrySchema.parse(JSON.parse(fs.readFileSync('acceptance/registry.json', 'utf8')));
  const next = {
    ...registry,
    criteria: registry.criteria.map((c) =>
      c.id !== 'G-06'
        ? c
        : {
            ...c,
            tests: [out, 'test/e2e/assistants.spec.ts'],
            status: passed ? ('PASS' as const) : ('FAIL' as const),
            failureCause: passed ? null : checks.filter((x) => !x.passed).map((x) => x.name).join('; '),
            evidence: { revision, command: `npx tsx scripts/certify-portability.ts ${writer} ${reader}`, exitCode: passed ? 0 : 1, at, kinds: ['real-host' as const, 'e2e' as const] },
            nextAction: passed ? 'Re-certify when hosts or MCP change' : 'Investigate',
          },
    ),
  };
  const problems = validateRegistry(next, fs.existsSync);
  if (problems.length) {
    console.error(problems.join('\n'));
    return 2;
  }
  fs.writeFileSync('acceptance/registry.json', serializeRegistry(next));
  console.log(passed ? 'G-06 PASS' : 'G-06 FAIL');
  return passed ? 0 : 1;
}

process.exitCode = await main();
