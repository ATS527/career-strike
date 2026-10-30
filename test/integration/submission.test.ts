import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type AppPaths, appPaths } from '../../src/core/paths.js';
import { type PracticeAts, startPracticeAts } from '../../src/practice/test-ats.js';
import { localRequest } from '../../src/service/http-client.js';
import { type RunningService, startService } from '../../src/service/service.js';
import { openDb } from '../../src/store/db.js';
import { dashboardSession, tempDir } from '../helpers.js';

const running: RunningService[] = [];
const endpoints: PracticeAts[] = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((s) => s.stop()));
  await Promise.all(endpoints.splice(0).map((e) => e.close()));
});

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from('synthetic resume for practice')]);
type View = { id: string; state: string; version: number; payloadHash: string; payload: { destination: { method: string } }; approval: { valid: boolean; approval: { id: string; state: string } | null }; events: { to: string; evidence: Record<string, unknown> | null }[] };

async function setup(paths: AppPaths = appPaths(path.join(tempDir(), 'data')), ats?: PracticeAts) {
  const endpoint = ats ?? (await startPracticeAts());
  if (!ats) endpoints.push(endpoint);
  const s = await startService(paths, { port: 0 });
  running.push(s);
  const bearer = { authorization: `Bearer ${s.info.token}` };
  const call = (method: string, url: string, body?: unknown, headers: Record<string, string> = bearer) => localRequest(s.info.port, url, { method, body, headers });
  const dash = await dashboardSession(s.info.port, s.info.token);
  return { s, paths, ats: endpoint, call, dash };
}

async function approvedPracticeApp(ctx: Awaited<ReturnType<typeof setup>>): Promise<View> {
  const { s, call, dash, ats } = ctx;
  expect((await call('POST', '/api/practice/endpoint', { origin: ats.origin })).status).toBe(200);
  const jobId = ((await call('POST', '/api/practice/jobs', {})).body as { jobId: string }).jobId;
  await call('PUT', '/api/settings/identity.fullName', { value: 'Jordan Example' });
  await call('PUT', '/api/settings/identity.email', { value: 'jordan@example.com' });
  await fetch(`http://127.0.0.1:${s.info.port}/api/documents`, {
    method: 'POST',
    headers: { authorization: `Bearer ${s.info.token}`, 'content-type': 'application/pdf', 'x-cs-filename': 'cv.pdf', 'x-cs-document-kind': 'resume' },
    body: PDF,
  });
  const created = ((await call('POST', '/api/applications', { jobId })).body as { application: View }).application;
  expect(created.payload.destination.method).toBe('test-ats');
  const ready = ((await call('POST', `/api/applications/${created.id}/ready`)).body as { application: View }).application;
  return ((await call('POST', `/api/applications/${created.id}/approve`, { version: ready.version, payloadHash: ready.payloadHash }, dash.headers)).body as { application: View }).application;
}

async function settle(ctx: Awaited<ReturnType<typeof setup>>, id: string): Promise<View> {
  for (let i = 0; i < 200; i++) {
    const v = ((await ctx.call('GET', `/api/applications/${id}`)).body as { application: View }).application;
    if (v.state !== 'SUBMISSION_IN_PROGRESS') return v;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('submission did not settle');
}

describe('automated submission to the owned practice endpoint', () => {
  it('sends the exact approved package once and confirms it only with a verified receipt', async () => {
    const ctx = await setup();
    const app = await approvedPracticeApp(ctx);
    expect((await ctx.call('POST', `/api/applications/${app.id}/submit`)).status).toBe(403);
    expect((await ctx.call('POST', `/api/applications/${app.id}/submit`, {}, ctx.dash.headers)).status).toBe(200);
    const done = await settle(ctx, app.id);
    expect(done.state).toBe('SUBMITTED_CONFIRMED');
    expect(done.approval).toMatchObject({ valid: false, approval: { state: 'CONSUMED' } });
    const receipts = [...ctx.ats.receipts.values()];
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({ payloadHash: app.payloadHash, attachmentsVerified: true, idempotencyKey: app.approval.approval!.id });
    expect(done.events.at(-1)).toMatchObject({ to: 'SUBMITTED_CONFIRMED', evidence: { type: 'endpoint-receipt', receipt: { receiptId: receipts[0]!.receiptId } } });
    expect((await ctx.call('POST', `/api/applications/${app.id}/submit`, {}, ctx.dash.headers)).status).toBe(409);
    expect(ctx.ats.receipts.size).toBe(1);
  });

  it('a lost response is unconfirmed, is never resent, and reconciliation finds the receipt', async () => {
    const ctx = await setup();
    const app = await approvedPracticeApp(ctx);
    ctx.ats.setFault('drop-after-store');
    await ctx.call('POST', `/api/applications/${app.id}/submit`, {}, ctx.dash.headers);
    const after = await settle(ctx, app.id);
    expect(after.state).toBe('SUBMISSION_UNCONFIRMED');
    expect(ctx.ats.receipts.size).toBe(1);
    ctx.ats.setFault('none');
    expect((await ctx.call('POST', `/api/applications/${app.id}/submit`, {}, ctx.dash.headers)).status).toBe(409);
    const reconciled = await ctx.call('POST', `/api/applications/${app.id}/reconcile`, {}, ctx.dash.headers);
    expect((reconciled.body as { application: View }).application.state).toBe('SUBMITTED_CONFIRMED');
    expect(ctx.ats.receipts.size).toBe(1);
  });

  it('an endpoint that never received it ends FAILED, and resubmitting needs a fresh approval', async () => {
    const ctx = await setup();
    const app = await approvedPracticeApp(ctx);
    ctx.ats.setFault('server-error');
    await ctx.call('POST', `/api/applications/${app.id}/submit`, {}, ctx.dash.headers);
    expect((await settle(ctx, app.id)).state).toBe('SUBMISSION_UNCONFIRMED');
    ctx.ats.setFault('none');
    const r = await ctx.call('POST', `/api/applications/${app.id}/reconcile`, {}, ctx.dash.headers);
    expect((r.body as { application: View }).application.state).toBe('SUBMISSION_FAILED');
    expect(ctx.ats.receipts.size).toBe(0);
    // It cannot simply be resent; it goes back to a draft and needs a new approval.
    expect((await ctx.call('POST', `/api/applications/${app.id}/submit`, {}, ctx.dash.headers)).status).toBe(409);
    expect((await ctx.call('PUT', `/api/applications/${app.id}`, { changes: { coverLetter: 'x' } })).status).toBe(409);
    const redrafted = ((await ctx.call('POST', `/api/applications/${app.id}/redraft`)).body as { application: View }).application;
    expect(redrafted.state).toBe('DRAFTED');
    expect(redrafted.approval.valid).toBe(false);
    const ready = ((await ctx.call('POST', `/api/applications/${app.id}/ready`)).body as { application: View }).application;
    const second = ((await ctx.call('POST', `/api/applications/${app.id}/approve`, { version: ready.version, payloadHash: ready.payloadHash }, ctx.dash.headers)).body as { application: View }).application;
    expect(second.approval.approval!.id).not.toBe(app.approval.approval!.id);
    await ctx.call('POST', `/api/applications/${app.id}/submit`, {}, ctx.dash.headers);
    expect((await settle(ctx, app.id)).state).toBe('SUBMITTED_CONFIRMED');
    expect([...ctx.ats.receipts.values()].map((r) => r.idempotencyKey)).toEqual([second.approval.approval!.id]);
  });

  it('a definite rejection is recorded as failed with the endpoint’s reason', async () => {
    const ctx = await setup();
    const app = await approvedPracticeApp(ctx);
    ctx.ats.setFault('reject');
    await ctx.call('POST', `/api/applications/${app.id}/submit`, {}, ctx.dash.headers);
    const v = await settle(ctx, app.id);
    expect(v.state).toBe('SUBMISSION_FAILED');
    expect(JSON.stringify(v.events.at(-1))).toContain('told to reject');
  });

  it('two simultaneous submit requests send exactly once', async () => {
    const ctx = await setup();
    const app = await approvedPracticeApp(ctx);
    ctx.ats.setFault('slow', 300);
    const [a, b] = await Promise.all([
      ctx.call('POST', `/api/applications/${app.id}/submit`, {}, ctx.dash.headers),
      ctx.call('POST', `/api/applications/${app.id}/submit`, {}, ctx.dash.headers),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect((await settle(ctx, app.id)).state).toBe('SUBMITTED_CONFIRMED');
    expect(ctx.ats.receipts.size).toBe(1);
  });

  it('refuses a duplicate of a role already submitted', async () => {
    const ctx = await setup();
    const first = await approvedPracticeApp(ctx);
    await ctx.call('POST', `/api/applications/${first.id}/submit`, {}, ctx.dash.headers);
    expect((await settle(ctx, first.id)).state).toBe('SUBMITTED_CONFIRMED');

    const jobB = ((await ctx.call('POST', '/api/practice/jobs', {})).body as { jobId: string }).jobId;
    const db = openDb(ctx.paths.db);
    const firstJob = db.prepare('SELECT job_id FROM applications WHERE id = ?').pluck().get(first.id) as string;
    db.prepare('UPDATE jobs SET duplicate_key = (SELECT duplicate_key FROM jobs WHERE id = ?) WHERE id = ?').run(firstJob, jobB);
    db.close();
    const b = ((await ctx.call('POST', '/api/applications', { jobId: jobB })).body as { application: View & { duplicateRisk: { applicationId: string; state: string }[] } }).application;
    // The risk is visible before approving.
    expect(b.duplicateRisk).toEqual([expect.objectContaining({ applicationId: first.id, state: 'SUBMITTED_CONFIRMED' })]);
    const ready = ((await ctx.call('POST', `/api/applications/${b.id}/ready`)).body as { application: View }).application;
    await ctx.call('POST', `/api/applications/${b.id}/approve`, { version: ready.version, payloadHash: ready.payloadHash }, ctx.dash.headers);
    const res = await ctx.call('POST', `/api/applications/${b.id}/submit`, {}, ctx.dash.headers);
    expect(res.status).toBe(409);
    expect((res.body as { error: string }).error).toBe('DUPLICATE');
    expect(((await ctx.call('GET', `/api/applications/${b.id}`)).body as { application: View }).application.state).toBe('DUPLICATE');
    expect(ctx.ats.receipts.size).toBe(1);
  });

  it('a submission in flight when the service stops is recovered as unconfirmed, never resent', async () => {
    const ctx = await setup();
    const app = await approvedPracticeApp(ctx);
    ctx.ats.setFault('slow', 1500);
    await ctx.call('POST', `/api/applications/${app.id}/submit`, {}, ctx.dash.headers);
    await new Promise((r) => setTimeout(r, 200));
    await ctx.s.stop();
    // Simulate a crash: whatever the stopped process recorded, the attempt was still open.
    const db = openDb(ctx.paths.db);
    db.prepare("UPDATE submission_attempts SET state = 'IN_PROGRESS', ended_at = NULL WHERE application_id = ?").run(app.id);
    db.prepare("UPDATE applications SET state = 'SUBMISSION_IN_PROGRESS' WHERE id = ?").run(app.id);
    db.close();
    await new Promise((r) => setTimeout(r, 1500));
    const again = await setup(ctx.paths, ctx.ats);
    const v = ((await again.call('GET', `/api/applications/${app.id}`)).body as { application: View }).application;
    expect(v.state).toBe('SUBMISSION_UNCONFIRMED');
    expect(ctx.ats.receipts.size).toBe(1);
    ctx.ats.setFault('none');
    const r = await again.call('POST', `/api/applications/${app.id}/reconcile`, {}, again.dash.headers);
    expect((r.body as { application: View }).application.state).toBe('SUBMITTED_CONFIRMED');
    expect(ctx.ats.receipts.size).toBe(1);
  });

  it('never sends a file that changed after approval, and only a loopback practice endpoint can be registered', async () => {
    const ctx = await setup();
    const app = await approvedPracticeApp(ctx);
    const docDir = path.join(ctx.paths.vault, 'documents');
    const file = path.join(docDir, fs.readdirSync(docDir)[0]!);
    fs.appendFileSync(file, 'tampered');
    const res = await ctx.call('POST', `/api/applications/${app.id}/submit`, {}, ctx.dash.headers);
    expect(res.status).toBe(400);
    expect((res.body as { message: string }).message).toContain('changed after you approved it');
    expect(ctx.ats.receipts.size).toBe(0);
    expect(((await ctx.call('GET', `/api/applications/${app.id}`)).body as { application: View }).application.approval.valid).toBe(true);

    for (const origin of ['https://evil.example', 'http://localhost:9999', 'http://10.0.0.5:80', 'http://127.0.0.1:9999/path']) {
      expect((await ctx.call('POST', '/api/practice/endpoint', { origin })).status, origin).toBe(400);
    }
  });

  it('real-employer applications can never be submitted automatically', async () => {
    const ctx = await setup();
    const db = openDb(ctx.paths.db);
    db.close();
    const created = await ctx.call('POST', '/api/jobs', { employer: 'Real Employer', title: 'Engineer', url: 'https://careers.example.com/1' });
    const jobId = (created.body as { job: { id: string } }).job.id;
    const app = ((await ctx.call('POST', '/api/applications', { jobId })).body as { application: View }).application;
    expect(app.payload.destination.method).toBe('manual');
    const res = await ctx.call('POST', `/api/applications/${app.id}/submit`, {}, ctx.dash.headers);
    expect(res.status).toBe(409);
    expect((res.body as { error: string }).error).toBe('NOT_AUTOMATABLE');
  });
});
