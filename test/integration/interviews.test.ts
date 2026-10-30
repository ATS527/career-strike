import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { syncBoard } from '../../src/career/jobs.js';
import { appPaths } from '../../src/core/paths.js';
import { localRequest } from '../../src/service/http-client.js';
import { type RunningService, startService } from '../../src/service/service.js';
import { openDb } from '../../src/store/db.js';
import { dashboardSession, tempDir } from '../helpers.js';

const running: RunningService[] = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((s) => s.stop()));
});

async function setup() {
  const paths = appPaths(path.join(tempDir(), 'data'));
  const s = await startService(paths, { port: 0 });
  running.push(s);
  const db = openDb(paths.db);
  syncBoard(db, 'lever', 'iv', [
    {
      source: 'lever', board: 'iv', sourceJobId: '1', employer: 'Synthetic Labs', title: 'Senior Platform Engineer', locationText: 'Remote', remotePolicy: 'remote',
      employmentType: 'full_time', department: null, salary: null,
      description: [{ type: 'heading', text: 'Requirements' }, { type: 'item', text: 'Go (Golang) services' }, { type: 'item', text: 'TypeScript tooling' }],
      applyUrl: 'https://jobs.lever.co/iv/1/apply', postingUrl: 'https://jobs.lever.co/iv/1', publishedAt: null, unresolved: [],
    },
  ]);
  const jobId = db.prepare('SELECT id FROM jobs').pluck().get() as string;
  db.close();
  const bearer = { authorization: `Bearer ${s.info.token}` };
  const call = (method: string, url: string, body?: unknown, headers: Record<string, string> = bearer) => localRequest(s.info.port, url, { method, body, headers });
  await call('PUT', '/api/settings/identity.fullName', { value: 'Jordan Example' });
  await call('PUT', '/api/settings/identity.email', { value: 'jordan@example.com' });
  await call('POST', '/api/profile/facts', { kind: 'skill', value: { name: 'TypeScript' } });
  await fetch(`http://127.0.0.1:${s.info.port}/api/documents`, { method: 'POST', headers: { ...bearer, 'content-type': 'application/pdf', 'x-cs-filename': 'cv.pdf', 'x-cs-document-kind': 'resume' }, body: Buffer.from('%PDF-1.7 x') });
  const dash = await dashboardSession(s.info.port, s.info.token);
  const app = ((await call('POST', '/api/applications', { jobId })).body as { application: { id: string } }).application;
  return { s, call, dash, appId: app.id };
}

async function submit(ctx: Awaited<ReturnType<typeof setup>>) {
  const ready = ((await ctx.call('POST', `/api/applications/${ctx.appId}/ready`)).body as { application: { version: number; payloadHash: string } }).application;
  await ctx.call('POST', `/api/applications/${ctx.appId}/approve`, { version: ready.version, payloadHash: ready.payloadHash }, ctx.dash.headers);
  await ctx.call('POST', `/api/applications/${ctx.appId}/start-submission`, {}, ctx.dash.headers);
  await ctx.call('POST', `/api/applications/${ctx.appId}/confirm-submitted`, { submittedAt: '2026-10-30' }, ctx.dash.headers);
}

describe('interview preparation and tracking', () => {
  it('builds prep topics from the posting, flags gaps and records practice', async () => {
    const ctx = await setup();
    const prep = (await ctx.call('GET', `/api/applications/${ctx.appId}/prep`)).body as { topics: { id: string; title: string; gap: boolean; source: string; sessions: number }[] };
    expect(prep.topics.filter((t) => t.source === 'posting').map((t) => [t.title, t.gap])).toEqual([
      ['Go', true],
      ['TypeScript', false],
    ]);
    expect((await ctx.call('POST', `/api/applications/${ctx.appId}/practice`, { topicId: 'not-a-topic', confidence: 3 })).status).toBe(409);
    expect((await ctx.call('POST', `/api/applications/${ctx.appId}/practice`, { topicId: 'skill-go', confidence: 9 })).status).toBe(400);
    const after = (await ctx.call('POST', `/api/applications/${ctx.appId}/practice`, { topicId: 'skill-go', confidence: 2, minutes: 30, notes: 'Goroutines' })).body as {
      topics: { id: string; sessions: number; lastConfidence: number }[];
    };
    expect(after.topics.find((t) => t.id === 'skill-go')).toMatchObject({ sessions: 1, lastConfidence: 2 });
  });

  it('interviews can only exist for submitted applications and move them to Interviewing', async () => {
    const ctx = await setup();
    const when = new Date(Date.now() + 2 * 864e5).toISOString();
    const early = await ctx.call('POST', `/api/applications/${ctx.appId}/interviews`, { stage: 'Phone screen', format: 'phone', scheduledAt: when });
    expect(early.status).toBe(409);
    await submit(ctx);
    const res = await ctx.call('POST', `/api/applications/${ctx.appId}/interviews`, { stage: 'Phone screen', format: 'phone', scheduledAt: when });
    expect(res.status).toBe(201);
    const view = (await ctx.call('GET', `/api/applications/${ctx.appId}`)).body as { application: { state: string; events: { to: string; note: string }[] } };
    expect(view.application.state).toBe('INTERVIEW');
    expect(view.application.events.at(-1)).toMatchObject({ to: 'INTERVIEW', note: 'Interview arranged: Phone screen' });

    const overview = (await ctx.call('GET', '/api/overview')).body as { interviews: { stage: string }[]; nextActions: { rule: string; title: string }[] };
    expect(overview.interviews.map((i) => i.stage)).toEqual(['Phone screen']);
    expect(overview.nextActions.find((a) => a.rule === 'interviews.prepare')!.title).toBe('Prepare for your Phone screen with Synthetic Labs');

    const id = (res.body as { interview: { id: string } }).interview.id;
    expect(((await ctx.call('PUT', `/api/interviews/${id}`, { outcome: 'passed' })).body as { interview: { outcome: string } }).interview.outcome).toBe('passed');
    expect(((await ctx.call('GET', '/api/overview')).body as { interviews: unknown[] }).interviews).toEqual([]);
  });
});
