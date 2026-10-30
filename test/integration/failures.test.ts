import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { Discovery } from '../../src/career/discovery.js';
import { jobCounts } from '../../src/career/jobs.js';
import { appPaths } from '../../src/core/paths.js';
import { localRequest } from '../../src/service/http-client.js';
import { type RunningService, startService } from '../../src/service/service.js';
import { createAdapters } from '../../src/sources/adapters.js';
import { retryAfterMs } from '../../src/sources/fetch-guard.js';
import { openDb } from '../../src/store/db.js';
import { TaskSupervisor } from '../../src/supervisor/tasks.js';
import { fakeFetch, greenhouseJobs } from '../fixtures/ats.js';
import { tempDir } from '../helpers.js';

// Failure injection not covered elsewhere. Source outages, interrupted discovery and lost
// submission responses are injected in discovery, supervisor and submission tests.

const running: RunningService[] = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((s) => s.stop()));
});

describe('database busy', () => {
  it('answers 503 with a clear message while another program holds the write lock, changes nothing, then recovers', async () => {
    const paths = appPaths(path.join(tempDir(), 'data'));
    const s = await startService(paths, { port: 0 });
    running.push(s);
    const call = (method: string, url: string, body?: unknown) =>
      localRequest(s.info.port, url, { method, body, headers: { authorization: `Bearer ${s.info.token}` }, timeoutMs: 15_000 });

    const other = new Database(paths.db);
    other.exec('BEGIN IMMEDIATE');
    const started = Date.now();
    const busy = await call('PUT', '/api/settings/candidate.country', { value: 'DE' });
    expect(busy.status).toBe(503);
    expect(busy.headers['retry-after']).toBe('2');
    expect(busy.body).toMatchObject({ error: 'DATABASE_BUSY', message: expect.stringContaining('Nothing was changed') });
    expect(Date.now() - started).toBeLessThan(5000);
    // Reads still work while the write lock is held (WAL).
    expect((await call('GET', '/api/settings')).status).toBe(200);
    other.exec('ROLLBACK');
    other.close();

    expect((await call('GET', '/api/settings')).body).toMatchObject({ settings: { 'candidate.country': null } });
    expect((await call('PUT', '/api/settings/candidate.country', { value: 'DE' })).status).toBe(200);
    expect((await call('GET', '/api/settings')).body).toMatchObject({ settings: { 'candidate.country': 'DE' } });
  });
});

describe('source quota', () => {
  function setup(response: () => Response) {
    const d = openDb(path.join(tempDir(), 'q.db'));
    const tasks = new TaskSupervisor(d);
    let limited = false;
    const discovery = new Discovery(
      d,
      createAdapters(fakeFetch({ 'boards-api.greenhouse.io': () => (limited ? response() : new Response(JSON.stringify(greenhouseJobs([{ id: 1 }])), { status: 200 })) })),
      tasks,
    );
    const board = discovery.addBoard('greenhouse', 'synthetic');
    return { d, tasks, discovery, board, limit: () => (limited = true) };
  }

  it('a rate-limit with Retry-After degrades the board, waits as long as asked, and leaves jobs untouched', async () => {
    const { d, tasks, discovery, board, limit } = setup(() => new Response('', { status: 429, headers: { 'retry-after': '7200' } }));
    discovery.discover(board.id, 'test', 'test');
    await tasks.idle();
    const before = d.prepare('SELECT status, last_verified_at FROM jobs').all();
    limit();
    const { task } = discovery.discover(board.id, 'test', 'test')!;
    await tasks.idle();
    expect(tasks.get(task.id)).toMatchObject({ state: 'FAILED', error: expect.stringContaining('asked Career Strike to slow down for 120 min') });
    const after = discovery.getBoard(board.id)!;
    expect(after).toMatchObject({ health: 'DEGRADED', consecutiveFailures: 1 });
    // The source asked for two hours, longer than the 15-minute first backoff.
    expect(Date.parse(after.nextAttemptAt!) - Date.now()).toBeGreaterThan(115 * 60_000);
    expect(d.prepare('SELECT status, last_verified_at FROM jobs').all()).toEqual(before);
    expect(jobCounts(d).open).toBe(1);
  });

  it('a 503 with Retry-After is treated as a quota, and without it as an outage with the normal backoff', async () => {
    const quota = setup(() => new Response('', { status: 503, headers: { 'retry-after': '600' } }));
    quota.limit();
    quota.discovery.discover(quota.board.id, 'test', 'test');
    await quota.tasks.idle();
    expect(quota.discovery.getBoard(quota.board.id)!.lastError).toContain('slow down for 10 min (HTTP 503)');

    const outage = setup(() => new Response('', { status: 503 }));
    outage.limit();
    outage.discovery.discover(outage.board.id, 'test', 'test');
    await outage.tasks.idle();
    const b = outage.discovery.getBoard(outage.board.id)!;
    expect(b.lastError).toContain('returned HTTP 503');
    expect(Date.parse(b.nextAttemptAt!) - Date.now()).toBeLessThanOrEqual(15 * 60_000);
  });

  it('reads Retry-After as seconds or a date, ignores nonsense and caps it at a day', () => {
    const now = Date.parse('2026-10-31T00:00:00Z');
    expect(retryAfterMs('120', now)).toBe(120_000);
    expect(retryAfterMs('Sat, 31 Oct 2026 00:05:00 GMT', now)).toBe(300_000);
    expect(retryAfterMs('soon', now)).toBeNull();
    expect(retryAfterMs(null, now)).toBeNull();
    expect(retryAfterMs('999999', now)).toBe(24 * 3600_000);
  });
});
