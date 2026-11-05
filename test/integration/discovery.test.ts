import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Discovery } from '../../src/career/discovery.js';
import {
  addManualJob,
  effectiveStatus,
  FRESH_FOR_MS,
  getJob,
  JobQuery,
  jobCounts,
  listJobs,
  setDisposition,
  syncBoard,
} from '../../src/career/jobs.js';
import { createAdapters } from '../../src/sources/adapters.js';
import type { NormalizedPosting } from '../../src/sources/types.js';
import { openDb } from '../../src/store/db.js';
import { TaskSupervisor } from '../../src/supervisor/tasks.js';
import { fakeFetch, greenhouseJobs } from '../fixtures/ats.js';
import { tempDir } from '../helpers.js';

const db = () => openDb(path.join(tempDir('cs-disc-'), 'cs.db'));
const query = (q: Partial<ReturnType<typeof JobQuery.parse>> = {}) => JobQuery.parse(q);

function posting(id: string, over: Partial<NormalizedPosting> = {}): NormalizedPosting {
  return {
    source: 'greenhouse',
    board: 'synthetic',
    sourceJobId: id,
    employer: 'Synthetic Labs',
    title: `Synthetic Role ${id}`,
    locationText: 'Remote',
    remotePolicy: 'remote',
    employmentType: 'full_time',
    department: null,
    salary: null,
    description: [{ type: 'paragraph', text: `Posting ${id} body text` }],
    applyUrl: `https://careers.example.com/${id}`,
    postingUrl: `https://careers.example.com/${id}`,
    publishedAt: '2026-10-01T00:00:00.000Z',
    unresolved: [],
    ...over,
  };
}

describe('board sync', () => {
  it('adds, refreshes and closes postings from complete listings', () => {
    const d = db();
    const t0 = new Date('2026-10-30T00:00:00Z');
    expect(syncBoard(d, 'greenhouse', 'synthetic', [posting('1'), posting('2')], t0)).toEqual({
      fetched: 2,
      added: 2,
      updated: 0,
      closed: 0,
    });

    const t1 = new Date('2026-10-30T06:00:00Z');
    expect(syncBoard(d, 'greenhouse', 'synthetic', [posting('2', { title: 'Synthetic Role 2 (Senior)' })], t1)).toEqual(
      {
        fetched: 1,
        added: 0,
        updated: 1,
        closed: 1,
      },
    );
    const all = listJobs(d, query({ status: 'all' }), { excludedEmployers: [] }, t1.getTime()).jobs;
    const one = all.find((j) => j.title === 'Synthetic Role 1')!;
    const two = all.find((j) => j.title.startsWith('Synthetic Role 2'))!;
    expect(one.status).toBe('CLOSED');
    expect(two).toMatchObject({ status: 'OPEN', title: 'Synthetic Role 2 (Senior)', lastVerifiedAt: t1.toISOString() });

    // A posting that reappears is open again.
    syncBoard(d, 'greenhouse', 'synthetic', [posting('1'), posting('2')], new Date('2026-10-30T07:00:00Z'));
    expect(getJob(d, one.id, { excludedEmployers: [] }, Date.parse('2026-10-30T07:00:00Z'))!.status).toBe('OPEN');
  });

  it('never claims a posting is open once its verification is older than 72 hours', () => {
    const verified = '2026-10-01T00:00:00.000Z';
    expect(effectiveStatus('OPEN', verified, Date.parse(verified) + FRESH_FOR_MS - 1)).toBe('OPEN');
    expect(effectiveStatus('OPEN', verified, Date.parse(verified) + FRESH_FOR_MS + 1)).toBe('STALE');
    expect(effectiveStatus('OPEN', null)).toBe('STALE');
  });

  it('links the same role found on two sources and keeps the live one primary', () => {
    const d = db();
    syncBoard(
      d,
      'greenhouse',
      'synthetic',
      [posting('1', { title: 'Data Engineer', locationText: 'Berlin' })],
      new Date('2026-10-01T00:00:00Z'),
    );
    syncBoard(
      d,
      'lever',
      'synthetic',
      [posting('lv1', { source: 'lever', title: 'Data  engineer', locationText: 'berlin' })],
      new Date('2026-10-02T00:00:00Z'),
    );
    const now = Date.parse('2026-10-02T01:00:00Z');
    const visible = listJobs(d, query(), { excludedEmployers: [] }, now).jobs;
    expect(visible).toHaveLength(1);
    const detail = getJob(d, visible[0]!.id, { excludedEmployers: [] }, now)!;
    expect(detail.duplicates).toHaveLength(1);
    expect(detail.duplicates[0]!.sources).toEqual(['lever']);

    // The original listing closes; the Lever copy must become visible rather than disappear.
    syncBoard(d, 'greenhouse', 'synthetic', [], new Date('2026-10-02T02:00:00Z'));
    const after = listJobs(d, query(), { excludedEmployers: [] }, Date.parse('2026-10-02T02:00:00Z')).jobs;
    expect(after).toHaveLength(1);
    expect(after[0]!.sources).toEqual(['lever']);
  });

  it('search escapes wildcards and matches across title, employer and description', () => {
    const d = db();
    syncBoard(d, 'greenhouse', 'synthetic', [
      posting('1', { title: '100% Remote SRE' }),
      posting('2', { title: 'Platform Lead' }),
    ]);
    expect(listJobs(d, query({ q: '100%' }), { excludedEmployers: [] }).jobs.map((j) => j.title)).toEqual([
      '100% Remote SRE',
    ]);
    expect(listJobs(d, query({ q: '%' }), { excludedEmployers: [] }).jobs).toHaveLength(1);
    expect(listJobs(d, query({ q: 'posting 2 body' }), { excludedEmployers: [] }).jobs.map((j) => j.title)).toEqual([
      'Platform Lead',
    ]);
    expect(listJobs(d, query({ q: 'synthetic labs' }), { excludedEmployers: [] }).jobs).toHaveLength(2);
  });

  it('filters by configured country from explicit country or configured-city evidence', () => {
    const d = db();
    syncBoard(d, 'greenhouse', 'synthetic', [
      posting('in', { title: 'India role', locationText: 'Bangalore, India' }),
      posting('de', { title: 'Germany role', locationText: 'Berlin, Germany' }),
      posting('remote', { title: 'Remote role', locationText: 'Remote' }),
    ]);
    expect(listJobs(d, query({ country: 'IN' }), { excludedEmployers: [] }).jobs.map((j) => j.title)).toEqual([
      'India role',
    ]);
    expect(listJobs(d, query({ country: 'DE' }), { excludedEmployers: [] }).jobs.map((j) => j.title)).toEqual([
      'Germany role',
    ]);
    expect(listJobs(d, query({ country: 'SG' }), { excludedEmployers: [] }).jobs).toEqual([]);
    expect(
      listJobs(d, query({ country: 'IN', city: 'Bengaluru' }), { excludedEmployers: [] }).jobs.map((j) => j.title),
    ).toEqual(['India role']);
    expect(listJobs(d, query({ country: 'IN', city: 'Pune' }), { excludedEmployers: [] }).jobs).toEqual([]);
  });

  it('dispositions persist, excluded jobs and employers are hidden unless asked for', () => {
    const d = db();
    syncBoard(d, 'greenhouse', 'synthetic', [posting('1'), posting('2', { employer: 'Avoided Corp' })]);
    const [a] = listJobs(d, query({ q: 'Role 1' }), { excludedEmployers: [] }).jobs;
    expect(setDisposition(d, a!.id, 'excluded', 'test')).toBe(true);
    expect(setDisposition(d, 'job_missing', 'excluded', 'test')).toBe(false);
    expect(listJobs(d, query(), { excludedEmployers: ['avoided corp'] }).jobs).toHaveLength(0);
    expect(
      listJobs(d, query({ includeExcludedEmployers: true }), { excludedEmployers: ['avoided corp'] }).jobs.map(
        (j) => j.employer,
      ),
    ).toEqual(['Avoided Corp']);
    expect(listJobs(d, query({ disposition: 'excluded' }), { excludedEmployers: [] }).jobs.map((j) => j.id)).toEqual([
      a!.id,
    ]);
    const audit = d.prepare("SELECT actor, subject FROM audit_events WHERE action = 'job.disposition'").all();
    expect(audit).toEqual([{ actor: 'test', subject: a!.id }]);
  });

  it('manual jobs are stored UNVERIFIED with their stated facts and an explicit caveat', () => {
    const d = db();
    const id = addManualJob(d, {
      employer: 'Synthetic Startup',
      title: 'Founding Engineer',
      url: 'https://careers.example.com/founding',
      location: 'Bengaluru',
      remotePolicy: 'hybrid',
      description: 'Build the first product.\n\n- Own the backend',
    });
    const job = getJob(d, id, { excludedEmployers: [] })!;
    expect(job).toMatchObject({
      status: 'UNVERIFIED',
      sources: ['manual'],
      remotePolicy: 'hybrid',
      applyUrl: 'https://careers.example.com/founding',
    });
    expect(job.description).toEqual([
      { type: 'paragraph', text: 'Build the first product.' },
      { type: 'item', text: 'Own the backend' },
    ]);
    expect(job.unresolved[0]).toContain('has not verified');
    expect(jobCounts(d).unverified).toBe(1);
  });
});

describe('discovery tasks', () => {
  function setup(routes: Parameters<typeof fakeFetch>[0]) {
    const d = db();
    const tasks = new TaskSupervisor(d);
    const discovery = new Discovery(d, createAdapters(fakeFetch(routes)), tasks);
    return { d, tasks, discovery };
  }

  it('a successful run records jobs, marks the board healthy and the task SUCCEEDED with its result', async () => {
    const { d, tasks, discovery } = setup({ 'boards-api.greenhouse.io': greenhouseJobs([{ id: 1 }, { id: 2 }]) });
    const board = discovery.addBoard('greenhouse', 'synthetic');
    const { task } = discovery.discover(board.id, 'test', 'test')!;
    await tasks.idle();
    expect(tasks.get(task.id)).toMatchObject({ state: 'SUCCEEDED', result: { fetched: 2, added: 2 } });
    expect(discovery.getBoard(board.id)).toMatchObject({
      health: 'OK',
      consecutiveFailures: 0,
      lastTask: { state: 'SUCCEEDED' },
    });
    expect(jobCounts(d).open).toBe(2);
  });

  it('an outage marks the board DEGRADED and leaves every job and verification time untouched', async () => {
    let fail = false;
    const { d, tasks, discovery } = setup({
      'boards-api.greenhouse.io': () =>
        fail
          ? new Response('', { status: 503 })
          : new Response(JSON.stringify(greenhouseJobs([{ id: 1 }])), { status: 200 }),
    });
    const board = discovery.addBoard('greenhouse', 'synthetic');
    discovery.discover(board.id, 'test', 'test');
    await tasks.idle();
    const before = d.prepare('SELECT status, last_verified_at FROM jobs').all();

    fail = true;
    const { task } = discovery.discover(board.id, 'test', 'test')!;
    await tasks.idle();
    expect(tasks.get(task.id)).toMatchObject({ state: 'FAILED', error: expect.stringContaining('HTTP 503') });
    expect(discovery.getBoard(board.id)).toMatchObject({ health: 'DEGRADED', consecutiveFailures: 1 });
    expect(d.prepare('SELECT status, last_verified_at FROM jobs').all()).toEqual(before);
  });

  it('a missing board is reported as NOT_FOUND', async () => {
    const { tasks, discovery } = setup({});
    const board = discovery.addBoard('greenhouse', 'no-such-board');
    discovery.discover(board.id, 'test', 'test');
    await tasks.idle();
    expect(discovery.getBoard(board.id)!.health).toBe('NOT_FOUND');
  });

  it('runs at most one fetch per board at a time and can be cancelled', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const { tasks, discovery } = setup({
      'boards-api.greenhouse.io': async () => {
        await gate;
        return new Response(JSON.stringify(greenhouseJobs([{ id: 1 }])), { status: 200 });
      },
    });
    const board = discovery.addBoard('greenhouse', 'synthetic');
    const first = discovery.discover(board.id, 'test', 'test')!;
    const second = discovery.discover(board.id, 'test', 'test')!;
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.task.id).toBe(first.task.id);
    expect(tasks.get(first.task.id)!.state).toBe('RUNNING');

    expect(tasks.cancel(first.task.id)).toBe(true);
    release();
    await tasks.idle();
    expect(tasks.get(first.task.id)).toMatchObject({ state: 'CANCELLED', cancelRequested: true });
    expect(discovery.getBoard(board.id)!.health).toBe('NEVER_RUN');
    expect(tasks.cancel(first.task.id)).toBe(false);
  });

  it('tasks left running by a dead process are reported INTERRUPTED, not running', () => {
    const d = db();
    d.prepare(
      `INSERT INTO tasks (id, kind, dedupe_key, trigger, client, params_json, state, created_at, started_at, owner_pid)
       VALUES ('task_old', 'discover:x', 'discover:x', 'test', 'test', '{}', 'RUNNING', '2026-10-01', '2026-10-01', 999999)`,
    ).run();
    const tasks = new TaskSupervisor(d);
    expect(tasks.recoverInterrupted().map((t) => t.id)).toEqual(['task_old']);
    expect(tasks.get('task_old')).toMatchObject({
      state: 'INTERRUPTED',
      error: expect.stringContaining('stopped before'),
    });
  });

  it('rejects duplicate and malformed boards', () => {
    const { discovery } = setup({});
    discovery.addBoard('lever', 'synthetic');
    expect(() => discovery.addBoard('lever', 'synthetic')).toThrow('already monitored');
    expect(() => discovery.addBoard('lever', '../etc')).toThrow('Board names');
  });
});
