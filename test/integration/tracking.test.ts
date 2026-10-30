import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { syncBoard } from '../../src/career/jobs.js';
import { appPaths } from '../../src/core/paths.js';
import { localRequest } from '../../src/service/http-client.js';
import { type RunningService, startService } from '../../src/service/service.js';
import { createAdapters } from '../../src/sources/adapters.js';
import type { NormalizedPosting } from '../../src/sources/types.js';
import { openDb } from '../../src/store/db.js';
import { fakeFetch, leverPostings } from '../fixtures/ats.js';
import { dashboardSession, tempDir } from '../helpers.js';

const running: RunningService[] = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((s) => s.stop()));
});

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from('x')]);

function posting(id: string): NormalizedPosting {
  return {
    source: 'lever', board: 'synthetic', sourceJobId: id, employer: 'Synthetic Labs', title: `Role ${id}`, locationText: 'Remote - India', remotePolicy: 'remote',
    employmentType: 'full_time', department: null, salary: null, description: [{ type: 'paragraph', text: 'Synthetic.' }],
    applyUrl: `https://jobs.lever.co/synthetic/${id}/apply`, postingUrl: `https://jobs.lever.co/synthetic/${id}`, publishedAt: null, unresolved: [],
  };
}

type View = { id: string; state: string; version: number; payloadHash: string; approval: { valid: boolean; approval: { state: string } | null }; events: { to: string; evidence: unknown; actor: string }[]; followUps: { id: string; status: string }[] };

async function setup(liveIds: string[] = ['a']) {
  // Discovery uses this fake Lever board; changing liveIds simulates postings being taken down.
  let current = liveIds;
  const adapters = createAdapters(fakeFetch({ 'api.lever.co': () => new Response(JSON.stringify(leverPostings(current.map((id) => ({ id, text: `Role ${id}` })))), { status: 200 }) }));
  const paths = appPaths(path.join(tempDir(), 'data'));
  const s = await startService(paths, { port: 0, adapters });
  running.push(s);
  const db = openDb(paths.db);
  syncBoard(db, 'lever', 'synthetic', liveIds.map(posting));
  const jobIds = db.prepare('SELECT id FROM jobs ORDER BY title').pluck().all() as string[];
  db.close();
  const bearer = { authorization: `Bearer ${s.info.token}` };
  const call = (method: string, url: string, body?: unknown, headers: Record<string, string> = bearer) => localRequest(s.info.port, url, { method, body, headers });
  await call('PUT', '/api/settings/identity.fullName', { value: 'Jordan Example' });
  await call('PUT', '/api/settings/identity.email', { value: 'jordan@example.com' });
  await fetch(`http://127.0.0.1:${s.info.port}/api/documents`, { method: 'POST', headers: { ...bearer, 'content-type': 'application/pdf', 'x-cs-filename': 'cv.pdf', 'x-cs-document-kind': 'resume' }, body: PDF });
  const dash = await dashboardSession(s.info.port, s.info.token);
  const view = async (id: string) => ((await call('GET', `/api/applications/${id}`)).body as { application: View }).application;
  const approved = async (jobId: string): Promise<View> => {
    const created = ((await call('POST', '/api/applications', { jobId })).body as { application: View }).application;
    const ready = ((await call('POST', `/api/applications/${created.id}/ready`)).body as { application: View }).application;
    const res = await call('POST', `/api/applications/${created.id}/approve`, { version: ready.version, payloadHash: ready.payloadHash }, dash.headers);
    return (res.body as { application: View }).application;
  };
  return { s, call, dash, jobIds, view, approved, setLive: (ids: string[]) => (current = ids), paths };
}

describe('manual submission', () => {
  it('consumes the approval once, and only the candidate’s confirmation marks it submitted', async () => {
    const { call, dash, jobIds, view, approved } = await setup();
    const app = await approved(jobIds[0]!);
    expect(app.state).toBe('APPROVED');

    expect((await call('POST', `/api/applications/${app.id}/start-submission`)).status).toBe(403);
    const started = await call('POST', `/api/applications/${app.id}/start-submission`, {}, dash.headers);
    expect(started.status).toBe(200);
    let v = await view(app.id);
    expect(v.state).toBe('NEEDS_MANUAL_ACTION');
    expect(v.approval).toMatchObject({ valid: false, approval: { state: 'CONSUMED' } });
    expect((await call('POST', `/api/applications/${app.id}/start-submission`, {}, dash.headers)).status).toBe(409);

    expect((await call('POST', `/api/applications/${app.id}/confirm-submitted`, { submittedAt: '2026-10-30', reference: 'X' })).status).toBe(403);
    expect((await call('POST', `/api/applications/${app.id}/confirm-submitted`, { submittedAt: 'yesterday' }, dash.headers)).status).toBe(400);
    const confirmed = await call('POST', `/api/applications/${app.id}/confirm-submitted`, { submittedAt: '2026-10-30', reference: 'LV-123', note: 'Confirmation email received' }, dash.headers);
    expect(confirmed.status).toBe(200);
    v = await view(app.id);
    expect(v.state).toBe('SUBMITTED_CONFIRMED');
    expect(v.events.at(-1)).toMatchObject({ to: 'SUBMITTED_CONFIRMED', actor: 'dashboard', evidence: { type: 'candidate-confirmation', reference: 'LV-123', submittedAt: '2026-10-30' } });
  });

  it('an unsure submission stays unconfirmed until confirmed, and outcomes follow the lifecycle', async () => {
    const { call, dash, jobIds, view, approved } = await setup();
    const app = await approved(jobIds[0]!);
    await call('POST', `/api/applications/${app.id}/start-submission`, {}, dash.headers);
    await call('POST', `/api/applications/${app.id}/mark-unconfirmed`, { note: 'Page timed out' }, dash.headers);
    expect((await view(app.id)).state).toBe('SUBMISSION_UNCONFIRMED');
    // No outcome can be recorded for something not known to be submitted.
    expect((await call('POST', `/api/applications/${app.id}/outcome`, { outcome: 'INTERVIEW', occurredAt: '2026-11-02' }, dash.headers)).status).toBe(409);
    await call('POST', `/api/applications/${app.id}/confirm-submitted`, { submittedAt: '2026-10-30' }, dash.headers);
    for (const outcome of ['RESPONSE_RECEIVED', 'INTERVIEW', 'INTERVIEW', 'OFFER']) {
      const res = await call('POST', `/api/applications/${app.id}/outcome`, { outcome, occurredAt: '2026-11-05', note: `${outcome} by email` }, dash.headers);
      expect(res.status, outcome).toBe(200);
    }
    expect((await view(app.id)).state).toBe('OFFER');
    expect((await call('POST', `/api/applications/${app.id}/outcome`, { outcome: 'RESPONSE_RECEIVED', occurredAt: '2026-11-06' }, dash.headers)).status).toBe(409);
    const overview = (await call('GET', '/api/overview')).body as { applications: { offers: number } };
    expect(overview.applications.offers).toBe(1);
  });

  it('cannot start a submission once the approval no longer matches', async () => {
    const { call, dash, jobIds, approved } = await setup();
    const app = await approved(jobIds[0]!);
    await call('PUT', `/api/applications/${app.id}`, { changes: { coverLetter: 'Changed after approval' } });
    const res = await call('POST', `/api/applications/${app.id}/start-submission`, {}, dash.headers);
    expect(res.status).toBe(409);
  });
});

describe('expiry', () => {
  it('unsent applications expire when the posting is taken down; submitted ones do not', async () => {
    const { call, dash, jobIds, view, approved, setLive } = await setup(['a', 'b']);
    const unsent = await approved(jobIds[0]!);
    const sent = await approved(jobIds[1]!);
    await call('POST', `/api/applications/${sent.id}/start-submission`, {}, dash.headers);
    await call('POST', `/api/applications/${sent.id}/confirm-submitted`, { submittedAt: '2026-10-30' }, dash.headers);

    const board = ((await call('POST', '/api/sources', { source: 'lever', board: 'synthetic' })).body as { task: { id: string } }).task;
    for (let i = 0; i < 100 && ((await call('GET', `/api/tasks/${board.id}`)).body as { task: { state: string } }).task.state === 'RUNNING'; i++) await new Promise((r) => setTimeout(r, 20));
    setLive([]);
    const boardId = ((await call('GET', '/api/sources')).body as { boards: { id: string }[] }).boards[0]!.id;
    const task = ((await call('POST', `/api/sources/${boardId}/discover`)).body as { task: { id: string } }).task;
    for (let i = 0; i < 200 && ((await call('GET', `/api/tasks/${task.id}`)).body as { task: { state: string } }).task.state !== 'SUCCEEDED'; i++) await new Promise((r) => setTimeout(r, 25));

    const u = await view(unsent.id);
    expect(u.state).toBe('EXPIRED');
    expect(u.approval).toMatchObject({ valid: false, approval: { state: 'REVOKED' } });
    expect((await view(sent.id)).state).toBe('SUBMITTED_CONFIRMED');
  });
});

describe('follow-ups', () => {
  it('are created, surface as next actions when due, and can be completed', async () => {
    const { call, jobIds } = await setup();
    const app = ((await call('POST', '/api/applications', { jobId: jobIds[0] })).body as { application: View }).application;
    expect((await call('POST', `/api/applications/${app.id}/follow-ups`, { dueAt: '2026-01-01', note: '' })).status).toBe(400);
    const due = await call('POST', `/api/applications/${app.id}/follow-ups`, { dueAt: '2026-01-01', note: 'Email the recruiter' });
    expect(due.status).toBe(201);
    await call('POST', `/api/applications/${app.id}/follow-ups`, { dueAt: '2999-01-01', note: 'Not yet' });

    const overview = (await call('GET', '/api/overview')).body as { followUps: { note: string }[]; nextActions: { rule: string; title: string }[] };
    expect(overview.followUps.map((f) => f.note)).toEqual(['Email the recruiter', 'Not yet']);
    expect(overview.nextActions.filter((a) => a.rule === 'follow-ups.due').map((a) => a.title)).toEqual(['Follow up: Email the recruiter']);

    const id = (due.body as { followUp: { id: string } }).followUp.id;
    expect((await call('POST', `/api/follow-ups/${id}/done`)).status).toBe(200);
    expect((await call('POST', `/api/follow-ups/${id}/done`)).status).toBe(404);
    const after = (await call('GET', '/api/overview')).body as { nextActions: { rule: string }[] };
    expect(after.nextActions.map((a) => a.rule)).not.toContain('follow-ups.due');
  });
});
