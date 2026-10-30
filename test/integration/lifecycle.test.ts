import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { syncBoard } from '../../src/career/jobs.js';
import { type AppPaths, appPaths } from '../../src/core/paths.js';
import { localRequest } from '../../src/service/http-client.js';
import { type RunningService, startService } from '../../src/service/service.js';
import { createAdapters } from '../../src/sources/adapters.js';
import type { NormalizedPosting } from '../../src/sources/types.js';
import { CLASSIFICATION } from '../../src/store/classification.js';
import { openDb } from '../../src/store/db.js';
import { fakeFetch } from '../fixtures/ats.js';
import { dashboardSession, tempDir } from '../helpers.js';

const CLI = ['--import', 'tsx', path.resolve('src/cli/index.ts')];
const runCli = (home: string, args: string[]) =>
  spawnSync(process.execPath, [...CLI, ...args], { env: { ...process.env, CAREER_STRIKE_HOME: home }, encoding: 'utf8', timeout: 30_000 });

const running: RunningService[] = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((s) => s.stop()));
});

const posting = (id: string): NormalizedPosting => ({
  source: 'greenhouse', board: 'life', sourceJobId: id, employer: 'Synthetic Lifecycle Ltd', title: `Lifecycle Role ${id}`, locationText: 'Remote',
  remotePolicy: 'remote', employmentType: 'full_time', department: null, salary: null,
  description: [{ type: 'heading', text: 'Requirements' }, { type: 'item', text: 'TypeScript' }],
  applyUrl: `https://careers.example.com/life/${id}`, postingUrl: `https://careers.example.com/life/${id}`, publishedAt: null, unresolved: [],
});

/** Fill every feature with synthetic data, then stop the service. */
async function populated(): Promise<{ paths: AppPaths; pdf: Buffer }> {
  const paths = appPaths(path.join(tempDir(), 'data'));
  const s = await startService(paths, { port: 0, adapters: createAdapters(fakeFetch({})) });
  running.push(s);
  const db = openDb(paths.db);
  syncBoard(db, 'greenhouse', 'life', [posting('1'), posting('2')]);
  db.prepare("INSERT INTO source_boards (id, source, board, added_at) VALUES ('src_life', 'greenhouse', 'life', '2026-10-01T00:00:00.000Z')").run();
  const jobIds = db.prepare('SELECT id FROM jobs ORDER BY title').pluck().all() as string[];
  db.close();
  const bearer = { authorization: `Bearer ${s.info.token}` };
  const call = (method: string, url: string, body?: unknown, headers: Record<string, string> = bearer) => localRequest(s.info.port, url, { method, body, headers });
  const dash = await dashboardSession(s.info.port, s.info.token);

  await call('PUT', '/api/settings/identity.fullName', { value: 'Synthetic Candidate' });
  await call('PUT', '/api/settings/identity.email', { value: 'synthetic.candidate@example.com' });
  await call('POST', '/api/profile/facts', { kind: 'skill', value: { name: 'TypeScript', years: 3 } });
  await call('POST', '/api/profile/suggestions', { text: 'Also Kubernetes' });
  const pdf = Buffer.from('%PDF-1.7 synthetic lifecycle resume');
  await fetch(`http://127.0.0.1:${s.info.port}/api/documents`, {
    method: 'POST', headers: { ...bearer, 'content-type': 'application/pdf', 'x-cs-filename': 'synthetic-resume.pdf', 'x-cs-document-kind': 'resume' }, body: pdf,
  });
  await call('PUT', `/api/jobs/${jobIds[1]}/disposition`, { disposition: 'shortlisted' });
  const app = ((await call('POST', '/api/applications', { jobId: jobIds[0] })).body as { application: { id: string } }).application;
  const readyRes = await call('POST', `/api/applications/${app.id}/ready`);
  if (readyRes.status !== 200) throw new Error(JSON.stringify(readyRes.body));
  const ready = (readyRes.body as { application: { version: number; payloadHash: string } }).application;
  expect((await call('POST', `/api/applications/${app.id}/approve`, { version: ready.version, payloadHash: ready.payloadHash }, dash.headers)).status).toBe(200);
  await call('POST', `/api/applications/${app.id}/follow-ups`, { dueAt: '2026-12-01', note: 'Synthetic follow-up' });
  const client = (await call('POST', '/api/mcp-clients', { name: 'test' })).body as { token: string };
  await localRequest(s.info.port, '/api/mcp/disclosures', { method: 'POST', body: { purpose: 'Synthetic purpose text', fields: ['profile.skills'] }, headers: { authorization: `Bearer ${client.token}` } });
  await call('GET', '/api/strategy');
  fs.mkdirSync(path.join(paths.home, 'mcp'), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(paths.home, 'mcp', 'test.token'), client.token, { mode: 0o600 });
  await running.pop()!.stop();
  return { paths, pdf };
}

function dumpAll(dbFile: string): Record<string, unknown[]> {
  const db = openDb(dbFile);
  try {
    return Object.fromEntries(Object.keys(CLASSIFICATION).map((t) => [t, db.prepare(`SELECT * FROM "${t}" ORDER BY rowid`).all()]));
  } finally {
    db.close();
  }
}

function filesUnder(dir: string): string[] {
  return fs.existsSync(dir) ? (fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => path.join(e.parentPath, e.name))) : [];
}

describe('export', () => {
  it('writes every record and document, without credentials, as owner-only files', async () => {
    const { paths, pdf } = await populated();
    const before = dumpAll(paths.db);
    const out = path.join(tempDir(), 'export');
    const res = runCli(paths.home, ['export', out]);
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toMatch(/Exported \d+ records and 1 documents/);

    const data = JSON.parse(fs.readFileSync(path.join(out, 'career-data.json'), 'utf8')) as { tables: Record<string, Record<string, unknown>[]> };
    for (const [table, rows] of Object.entries(before)) {
      if (table === 'dashboard_sessions') {
        expect(data.tables).not.toHaveProperty(table);
        continue;
      }
      expect(data.tables[table], table).toHaveLength(rows.length);
    }
    // Every non-empty career table is really in the archive.
    for (const t of ['profile_facts', 'documents', 'applications', 'application_versions', 'approvals', 'follow_ups', 'disclosures', 'settings', 'job_user_state', 'strategy_snapshots']) {
      expect(data.tables[t]!.length, t).toBeGreaterThan(0);
    }
    const text = JSON.stringify(data);
    expect(text).toContain('synthetic.candidate@example.com');
    expect(text).not.toMatch(/token_hash|"mac"|id_hash|csrf_token/);
    expect(data.tables.approvals![0]).not.toHaveProperty('mac');

    const docs = fs.readdirSync(path.join(out, 'documents'));
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatch(/^doc_.+-synthetic-resume\.pdf$/);
    expect(fs.readFileSync(path.join(out, 'documents', docs[0]!)).equals(pdf)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8')) as { files: { path: string; sha256: string }[]; omitted: string[] };
    expect(manifest.files.map((f) => f.path).sort()).toEqual(['README.txt', 'career-data.json', `documents/${docs[0]}`]);
    expect(manifest.omitted).toContain('Credential column approvals.mac');
    for (const f of filesUnder(out)) expect((fs.statSync(f).mode & 0o777).toString(8), f).toBe('600');

    // Never into a non-empty folder or a git working tree (this repository).
    expect(runCli(paths.home, ['export', out]).stderr).toContain('is not empty');
    expect(runCli(paths.home, ['export', path.resolve('test-results', 'never-export-here')]).stderr).toContain('Refusing to write career data inside the git working tree');
  });
});

describe('backup and restore', () => {
  it('round-trips all data and documents, keeps the replaced data aside, and refuses damaged backups', async () => {
    const { paths, pdf } = await populated();
    const before = dumpAll(paths.db);
    const out = path.join(tempDir(), 'backup');
    const b = runCli(paths.home, ['backup', out]);
    expect(b.status, b.stderr).toBe(0);

    // Change things after the backup: remove a fact and the document, add a setting.
    const s = await startService(paths, { port: 0, adapters: createAdapters(fakeFetch({})) });
    running.push(s);
    const bearer = { authorization: `Bearer ${s.info.token}` };
    const facts = (await localRequest(s.info.port, '/api/profile', { headers: bearer })).body as { facts: { id: string }[] };
    await localRequest(s.info.port, `/api/profile/facts/${facts.facts[0]!.id}`, { method: 'DELETE', headers: bearer });
    const docs = (await localRequest(s.info.port, '/api/documents', { headers: bearer })).body as { documents: { id: string }[] };
    await localRequest(s.info.port, `/api/documents/${docs.documents[0]!.id}`, { method: 'DELETE', headers: bearer });
    await localRequest(s.info.port, '/api/settings/candidate.country', { method: 'PUT', body: { value: 'DE' }, headers: bearer });

    // Not while the service is running.
    expect(runCli(paths.home, ['restore', out]).stderr).toContain('The service is running');
    await running.pop()!.stop();

    // A damaged backup is refused before anything changes.
    const damaged = path.join(tempDir(), 'damaged');
    fs.cpSync(out, damaged, { recursive: true });
    const docFile = filesUnder(path.join(damaged, 'documents'))[0]!;
    fs.writeFileSync(docFile, 'tampered');
    const refused = runCli(paths.home, ['restore', damaged]);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain('The backup is damaged');
    expect(dumpAll(paths.db).profile_facts).toHaveLength(before.profile_facts!.length - 1);

    const r = runCli(paths.home, ['restore', out]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('Your previous data was moved to');
    const after = dumpAll(paths.db);
    for (const table of Object.keys(before)) expect(after[table], table).toEqual(before[table]);
    const restoredDocs = filesUnder(path.join(paths.vault, 'documents'));
    expect(restoredDocs).toHaveLength(1);
    expect(fs.readFileSync(restoredDocs[0]!).equals(pdf)).toBe(true);
    expect(fs.readdirSync(path.join(paths.home, 'backups')).some((n) => n.startsWith('pre-restore-'))).toBe(true);

    // The restored data works: the service starts and serves the restored document.
    const s2 = await startService(paths, { port: 0, adapters: createAdapters(fakeFetch({})) });
    running.push(s2);
    const id = (before.documents![0] as { id: string }).id;
    const content = await fetch(`http://127.0.0.1:${s2.info.port}/api/documents/${id}/content`, { headers: { authorization: `Bearer ${s2.info.token}` } });
    expect(Buffer.from(await content.arrayBuffer()).equals(pdf)).toBe(true);
  });
});

describe('delete', () => {
  it('needs the exact confirmation, then removes all career data and secrets, verified by inspection', async () => {
    const { paths } = await populated();
    const foreign = path.join(paths.home, 'my-own-notes.txt');
    fs.writeFileSync(foreign, 'not created by Career Strike');
    expect(fs.existsSync(path.join(paths.home, 'secrets', 'approval-key.key'))).toBe(true);

    const unconfirmed = runCli(paths.home, ['delete-data']);
    expect(unconfirmed.status).toBe(1);
    expect(unconfirmed.stderr).toContain('Nothing was deleted');
    expect(fs.existsSync(paths.db)).toBe(true);
    expect(runCli(paths.home, ['delete-data', '--confirm', 'yes']).status).toBe(1);
    expect(fs.existsSync(paths.db)).toBe(true);

    const s = await startService(paths, { port: 0 });
    running.push(s);
    expect(runCli(paths.home, ['delete-data', '--confirm', 'delete my career data']).stderr).toContain('The service is running');
    await running.pop()!.stop();

    const res = runCli(paths.home, ['delete-data', '--confirm', 'delete my career data']);
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain('left in place');
    // Inspection: the only file left is the one Career Strike did not create.
    expect(filesUnder(paths.home)).toEqual([foreign]);
    expect(fs.readdirSync(paths.home)).toEqual(['my-own-notes.txt']);
    expect(runCli(paths.home, ['doctor']).stdout).toContain('not initialised');
  });

  it('removes the data directory itself when nothing else is in it', async () => {
    const { paths } = await populated();
    expect(runCli(paths.home, ['delete-data', '--confirm', 'delete my career data']).status).toBe(0);
    expect(fs.existsSync(paths.home)).toBe(false);
  });
});
