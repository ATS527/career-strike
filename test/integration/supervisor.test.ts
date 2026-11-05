import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Discovery } from '../../src/career/discovery.js';
import { type AppPaths, appPaths, ensureHome } from '../../src/core/paths.js';
import { type PracticeAts, startPracticeAts } from '../../src/practice/test-ats.js';
import { localRequest } from '../../src/service/http-client.js';
import { type RunningService, startService } from '../../src/service/service.js';
import { createAdapters } from '../../src/sources/adapters.js';
import { openDb } from '../../src/store/db.js';
import { setSetting } from '../../src/store/settings.js';
import { backoffMs, Scheduler } from '../../src/supervisor/scheduler.js';
import { TaskSupervisor } from '../../src/supervisor/tasks.js';
import { dashboardSession, tempDir } from '../helpers.js';

const endpoints: PracticeAts[] = [];
const running: RunningService[] = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((s) => s.stop()));
  await Promise.all(endpoints.splice(0).map((e) => e.close()));
});

async function practiceWorld() {
  const ats = await startPracticeAts();
  endpoints.push(ats);
  const paths = appPaths(path.join(tempDir(), 'data'));
  ensureHome(paths);
  const db = openDb(paths.db);
  db.prepare('INSERT INTO practice_endpoint (id, origin, created_at) VALUES (1, ?, ?)').run(ats.origin, 'x');
  const tasks = new TaskSupervisor(db);
  const adapters = createAdapters(undefined, { practiceOrigin: () => ats.origin });
  const discovery = new Discovery(db, adapters, tasks);
  const board = discovery.addBoard('practice', 'demo');
  return { ats, paths, db, tasks, discovery, board, adapters };
}

describe('backoff', () => {
  it('doubles from 15 minutes and is capped at a day', () => {
    expect([0, 1, 2, 3, 10, 50].map(backoffMs)).toEqual([0, 900_000, 1_800_000, 3_600_000, 86_400_000, 86_400_000]);
  });
});

describe('scheduler', () => {
  it('does nothing until the candidate turns monitoring on', async () => {
    const { db, discovery } = await practiceWorld();
    expect(new Scheduler(db, discovery).tick()).toEqual({ claimed: false, started: [], skipped: [] });
  });

  it('runs each slot exactly once, even with two processes on the same data', async () => {
    const { db, paths, discovery, tasks, ats } = await practiceWorld();
    setSetting(db, 'monitoring.discoveryIntervalHours', '6', 'test');
    const now = Date.parse('2026-10-31T09:10:00Z');
    const a = new Scheduler(db, discovery, undefined, () => now);
    // A second process: its own connection, supervisor and discovery, same database file.
    const db2 = openDb(paths.db);
    const b = new Scheduler(
      db2,
      new Discovery(db2, createAdapters(undefined, { practiceOrigin: () => ats.origin }), new TaskSupervisor(db2)),
      undefined,
      () => now + 1000,
    );
    const [first, second] = [a.tick(), b.tick()];
    expect(first.claimed).toBe(true);
    expect(first.started).toHaveLength(1);
    expect(second).toEqual({ claimed: false, started: [], skipped: [] });
    expect(a.tick().claimed).toBe(false);
    await tasks.idle();
    expect(db.prepare("SELECT COUNT(*) FROM jobs WHERE status = 'OPEN'").pluck().get()).toBe(2);
    // The next slot is a new run.
    expect(new Scheduler(db, discovery, undefined, () => now + 6 * 3600_000).tick().claimed).toBe(true);
    expect(a.status()[0]).toMatchObject({ enabled: true, intervalHours: 6, nextRunAt: '2026-10-31T12:00:00.000Z' });
    db2.close();
  });

  it('a failing board backs off for scheduled runs but not when the candidate fetches it', async () => {
    const { db, discovery, tasks, ats, board } = await practiceWorld();
    setSetting(db, 'monitoring.discoveryIntervalHours', '6', 'test');
    ats.setFault('server-error');
    discovery.discover(board.id, 'manual', 'test');
    await tasks.idle();
    const after = discovery.getBoard(board.id)!;
    expect(after).toMatchObject({ health: 'DEGRADED', consecutiveFailures: 1 });
    const wait = Date.parse(after.nextAttemptAt!) - Date.now();
    expect(wait).toBeGreaterThan(14 * 60_000);
    expect(wait).toBeLessThanOrEqual(15 * 60_000);

    const tick = new Scheduler(db, discovery).tick();
    expect(tick).toMatchObject({ claimed: true, started: [], skipped: [board.id] });

    ats.setFault('reject');
    discovery.discover(board.id, 'manual', 'test');
    await tasks.idle();
    expect(discovery.getBoard(board.id)).toMatchObject({
      consecutiveFailures: 2,
      lastError: expect.stringContaining('slow down'),
    });

    ats.setFault('none');
    discovery.discover(board.id, 'manual', 'test');
    await tasks.idle();
    expect(discovery.getBoard(board.id)).toMatchObject({ health: 'OK', consecutiveFailures: 0, nextAttemptAt: null });
  });

  it('a discovery can be cancelled while running and leaves nothing half-written', async () => {
    const { db, discovery, tasks, ats, board } = await practiceWorld();
    ats.setFault('slow', 2000);
    const { task } = discovery.discover(board.id, 'manual', 'test')!;
    await new Promise((r) => setTimeout(r, 100));
    expect(tasks.get(task.id)).toMatchObject({ state: 'RUNNING', live: true });
    expect(tasks.cancel(task.id)).toBe(true);
    await tasks.idle();
    expect(tasks.get(task.id)).toMatchObject({ state: 'CANCELLED', live: false });
    expect(db.prepare('SELECT COUNT(*) FROM jobs').pluck().get()).toBe(0);
  });
});

describe('restart recovery', () => {
  it('re-queues an interrupted discovery (attempt 2) when the service starts', async () => {
    const { db, paths, board, ats } = await practiceWorld();
    db.prepare(
      `INSERT INTO tasks (id, kind, dedupe_key, trigger, client, params_json, state, created_at, started_at, owner_pid, attempt)
       VALUES ('task_dead', ?, ?, 'schedule', 'scheduler', '{}', 'RUNNING', '2026-10-31', '2026-10-31', 999999, 1)`,
    ).run(`discover:${board.id}`, `discover:${board.id}`);
    db.close();
    const s = await startService(paths, { port: 0 });
    running.push(s);
    const call = (url: string) =>
      localRequest(s.info.port, url, { headers: { authorization: `Bearer ${s.info.token}` } });
    let activity: { recent: { id: string; state: string; trigger: string; attempt: number }[] } = { recent: [] };
    for (let i = 0; i < 100; i++) {
      activity = (await call('/api/activity')).body as typeof activity;
      if (activity.recent.some((t) => t.trigger === 'recovery' && t.state === 'SUCCEEDED')) break;
      await new Promise((r) => setTimeout(r, 30));
    }
    expect(activity.recent.find((t) => t.id === 'task_dead')).toMatchObject({ state: 'INTERRUPTED' });
    expect(activity.recent.find((t) => t.trigger === 'recovery')).toMatchObject({ state: 'SUCCEEDED', attempt: 2 });
    void ats;
  });
});

describe('cancelling a submission', () => {
  it('records the outcome as unconfirmed instead of leaving it stuck', async () => {
    const ats = await startPracticeAts();
    endpoints.push(ats);
    const paths: AppPaths = appPaths(path.join(tempDir(), 'data'));
    const s = await startService(paths, { port: 0 });
    running.push(s);
    const bearer = { authorization: `Bearer ${s.info.token}` };
    const call = (method: string, url: string, body?: unknown, headers: Record<string, string> = bearer) =>
      localRequest(s.info.port, url, { method, body, headers });
    await call('POST', '/api/practice/endpoint', { origin: ats.origin });
    const jobId = ((await call('POST', '/api/practice/jobs', {})).body as { jobId: string }).jobId;
    await call('PUT', '/api/settings/identity.fullName', { value: 'Jordan Example' });
    await call('PUT', '/api/settings/identity.email', { value: 'jordan@example.com' });
    await fetch(`http://127.0.0.1:${s.info.port}/api/documents`, {
      method: 'POST',
      headers: {
        ...bearer,
        'content-type': 'application/pdf',
        'x-cs-filename': 'cv.pdf',
        'x-cs-document-kind': 'resume',
      },
      body: Buffer.from('%PDF-1.7 x'),
    });
    const dash = await dashboardSession(s.info.port, s.info.token);
    const app = ((await call('POST', '/api/applications', { jobId })).body as { application: { id: string } })
      .application;
    const ready = (
      (await call('POST', `/api/applications/${app.id}/ready`)).body as {
        application: { version: number; payloadHash: string };
      }
    ).application;
    await call(
      'POST',
      `/api/applications/${app.id}/approve`,
      { version: ready.version, payloadHash: ready.payloadHash },
      dash.headers,
    );
    ats.setFault('slow', 3000);
    await call('POST', `/api/applications/${app.id}/submit`, {}, dash.headers);
    const activity = (await call('GET', '/api/activity')).body as { running: { id: string; kind: string }[] };
    const submitTask = activity.running.find((t) => t.kind === `submit:${app.id}`)!;
    expect(submitTask).toBeDefined();
    expect((await call('POST', `/api/tasks/${submitTask.id}/cancel`)).status).toBe(202);
    for (let i = 0; i < 100; i++) {
      const v = (await call('GET', `/api/applications/${app.id}`)).body as { application: { state: string } };
      if (v.application.state !== 'SUBMISSION_IN_PROGRESS') break;
      await new Promise((r) => setTimeout(r, 30));
    }
    expect(
      ((await call('GET', `/api/applications/${app.id}`)).body as { application: { state: string } }).application.state,
    ).toBe('SUBMISSION_UNCONFIRMED');
  });
});
