import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { syncBoard } from '../../src/career/jobs.js';
import { appPaths } from '../../src/core/paths.js';
import { localRequest } from '../../src/service/http-client.js';
import { type RunningService, startService } from '../../src/service/service.js';
import type { NormalizedPosting } from '../../src/sources/types.js';
import { openDb } from '../../src/store/db.js';
import { dashboardSession, tempDir } from '../helpers.js';

const running: RunningService[] = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((s) => s.stop()));
});

function posting(source: NormalizedPosting['source'], i: number, title: string): NormalizedPosting {
  return {
    source, board: 'learn', sourceJobId: `${source}-${i}`, employer: `Synthetic ${source} ${i}`, title, locationText: 'Remote', remotePolicy: 'remote',
    employmentType: 'full_time', department: null, salary: null,
    description: [{ type: 'heading', text: 'Requirements' }, { type: 'item', text: 'Rust and TypeScript' }],
    applyUrl: null, postingUrl: null, publishedAt: null, unresolved: [],
  };
}

async function setup() {
  const paths = appPaths(path.join(tempDir(), 'data'));
  const s = await startService(paths, { port: 0 });
  running.push(s);
  const db = openDb(paths.db);
  // 12 Lever applications (6 answered, 2 interviews for Data Engineer) and 10 Greenhouse (1 answered).
  syncBoard(db, 'lever', 'learn', Array.from({ length: 12 }, (_, i) => posting('lever', i, i < 2 ? 'Senior Data Engineer' : 'Backend Engineer')));
  syncBoard(db, 'greenhouse', 'learn', Array.from({ length: 10 }, (_, i) => posting('greenhouse', i, 'Backend Engineer')));
  db.prepare("INSERT INTO source_boards (id, source, board, added_at) VALUES ('src_x', 'lever', 'learn', 'x')").run();
  const jobs = db.prepare('SELECT j.id, s.source, s.source_job_id FROM jobs j JOIN job_sources s ON s.job_id = j.id').all() as { id: string; source: string; source_job_id: string }[];
  const ev = db.prepare('INSERT INTO application_events (application_id, from_state, to_state, actor, at) VALUES (?, ?, ?, ?, ?)');
  for (const j of jobs) {
    const i = Number(j.source_job_id.split('-')[1]);
    const id = `app_${j.source}_${i}`;
    const responded = j.source === 'lever' ? i < 6 : i < 1;
    const interviewed = j.source === 'lever' && i < 2;
    const final = interviewed ? 'INTERVIEW' : responded ? 'RESPONSE_RECEIVED' : 'SUBMITTED_CONFIRMED';
    db.prepare("INSERT INTO applications (id, job_id, state, mode, current_version, created_at, updated_at) VALUES (?, ?, ?, 'manual', 1, 'x', 'x')").run(id, j.id, final);
    ev.run(id, 'NEEDS_MANUAL_ACTION', 'SUBMITTED_CONFIRMED', 'dashboard', '2026-10-20T10:00:00.000Z');
    if (responded) ev.run(id, 'SUBMITTED_CONFIRMED', 'RESPONSE_RECEIVED', 'dashboard', '2026-10-23T10:00:00.000Z');
    if (interviewed) ev.run(id, 'RESPONSE_RECEIVED', 'INTERVIEW', 'dashboard', '2026-10-25T10:00:00.000Z');
  }
  db.close();
  const bearer = { authorization: `Bearer ${s.info.token}` };
  const call = (method: string, url: string, body?: unknown, headers: Record<string, string> = bearer) => localRequest(s.info.port, url, { method, body, headers });
  await call('POST', '/api/profile/facts', { kind: 'skill', value: { name: 'TypeScript' } });
  const dash = await dashboardSession(s.info.port, s.info.token);
  return { s, paths, call, dash };
}

type Strategy = {
  metrics: {
    totals: { submitted: number; responses: number; interviews: number };
    responseRate: { numerator: number; n: number };
    daysToFirstResponse: { median: number; n: number };
    bySource: { source: string; responded: { numerator: number; n: number } }[];
    campaignSummaries: { weekStart: string; discovered: number; shortlisted: number; submitted: number; responses: number; interviews: number }[];
    recurringGaps: { skill: string; jobs: number }[];
  };
  observations: { kind: string; text: string }[];
  proposals: { id: string; rule: string; title: string; status: string }[];
  history: { day: string }[];
};

describe('strategy learning', () => {
  it('computes metrics only from recorded events, with sample sizes', async () => {
    const { call } = await setup();
    const st = (await call('GET', '/api/strategy')).body as Strategy;
    expect(st.metrics.totals).toMatchObject({ submitted: 22, responses: 7, interviews: 2 });
    expect(st.metrics.responseRate).toMatchObject({ numerator: 7, n: 22 });
    expect(st.metrics.daysToFirstResponse).toMatchObject({ median: 3, n: 7 });
    expect(st.metrics.bySource.find((s) => s.source === 'lever')!.responded).toMatchObject({ numerator: 6, n: 12 });
    expect(st.metrics.recurringGaps).toEqual([{ skill: 'Rust', jobs: 22 }]);
    expect(st.metrics.campaignSummaries.length).toBe(8);
    expect(st.metrics.campaignSummaries.some((w) => w.submitted > 0)).toBe(true);
    expect(st.observations[0]).toMatchObject({ kind: 'comparison' });
    expect(st.observations[0]!.text).toContain('(n=12)');
    expect(st.history).toHaveLength(1);
  });

  it('proposes, applies only on the candidate’s acceptance, and never re-proposes a dismissed idea', async () => {
    const { call, dash, paths } = await setup();
    const st = (await call('GET', '/api/strategy')).body as Strategy;
    const rules = st.proposals.map((p) => p.rule).sort();
    expect(rules).toEqual(['interviewing-role', 'monitoring-off', 'recurring-gap']);
    const monitoring = st.proposals.find((p) => p.rule === 'monitoring-off')!;
    expect((await call('POST', `/api/strategy/proposals/${monitoring.id}/accept`)).status).toBe(403);
    expect((await call('POST', `/api/strategy/proposals/${monitoring.id}/accept`, {}, dash.headers)).status).toBe(200);
    const settings = (await call('GET', '/api/settings')).body as { settings: Record<string, unknown> };
    expect(settings.settings['monitoring.discoveryIntervalHours']).toBe('24');
    expect((await call('POST', `/api/strategy/proposals/${monitoring.id}/accept`, {}, dash.headers)).status).toBe(409);

    const role = st.proposals.find((p) => p.rule === 'interviewing-role')!;
    expect(role.title).toBe('Add “Data Engineer” to your preferred roles');
    await call('POST', `/api/strategy/proposals/${role.id}/dismiss`, {}, dash.headers);
    const again = (await call('GET', '/api/strategy')).body as Strategy;
    expect(again.proposals.filter((p) => p.rule === 'interviewing-role').map((p) => p.status)).toEqual(['DISMISSED']);
    expect(((await call('GET', '/api/settings')).body as { settings: Record<string, unknown> }).settings['search.preferredRoles']).toEqual([]);

    const db = openDb(paths.db);
    expect(db.prepare("SELECT actor FROM audit_events WHERE action = 'setting.updated' AND subject = 'monitoring.discoveryIntervalHours'").pluck().get()).toBe('strategy-proposal');
    db.close();
  });

  it('refuses a proposal whose action was tampered with to touch anything outside the allowlist', async () => {
    const { call, dash, paths } = await setup();
    const st = (await call('GET', '/api/strategy')).body as Strategy;
    const gap = st.proposals.find((p) => p.rule === 'recurring-gap')!;
    const db = openDb(paths.db);
    db.prepare('UPDATE strategy_proposals SET action_json = ? WHERE id = ?').run(JSON.stringify({ type: 'set-setting', key: 'identity.email', value: 'attacker@example.com' }), gap.id);
    db.close();
    const res = await call('POST', `/api/strategy/proposals/${gap.id}/accept`, {}, dash.headers);
    expect(res.status).toBe(409);
    expect(((await call('GET', '/api/settings')).body as { settings: Record<string, unknown> }).settings['identity.email']).toBeNull();
  });
});
