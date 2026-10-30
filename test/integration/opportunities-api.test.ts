import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { appPaths } from '../../src/core/paths.js';
import { localRequest } from '../../src/service/http-client.js';
import { type RunningService, startService } from '../../src/service/service.js';
import { createAdapters } from '../../src/sources/adapters.js';
import { fakeFetch, greenhouseJobs, leverPostings } from '../fixtures/ats.js';
import { tempDir } from '../helpers.js';

const running: RunningService[] = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((s) => s.stop()));
});

async function start() {
  const adapters = createAdapters(
    fakeFetch({
      'boards-api.greenhouse.io': greenhouseJobs([{ id: 1, title: 'Synthetic SRE', workplace: 'Remote' }, { id: 2, title: 'Synthetic Designer' }]),
      'api.lever.co': leverPostings([{ id: 'a' }]),
    }),
  );
  const s = await startService(appPaths(path.join(tempDir(), 'data')), { port: 0, adapters });
  running.push(s);
  const call = (method: string, url: string, body?: unknown) =>
    localRequest(s.info.port, url, { method, body, headers: { authorization: `Bearer ${s.info.token}` } });
  return { s, call };
}

async function waitForTask(call: Awaited<ReturnType<typeof start>>['call'], id: string): Promise<{ state: string }> {
  for (let i = 0; i < 100; i++) {
    const { task } = (await call('GET', `/api/tasks/${id}`)).body as { task: { state: string } };
    if (task.state !== 'RUNNING' && task.state !== 'QUEUED') return task;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('task did not finish');
}

describe('opportunities API', () => {
  it('adding a board starts a discovery task whose jobs then appear in search and on the overview', async () => {
    const { call } = await start();
    const added = await call('POST', '/api/sources', { source: 'greenhouse', board: 'synthetic' });
    expect(added.status).toBe(201);
    const { task } = added.body as { task: { id: string } };
    expect((await waitForTask(call, task.id)).state).toBe('SUCCEEDED');

    const list = (await call('GET', '/api/jobs?q=sre')).body as { total: number; jobs: { id: string; title: string; status: string; remotePolicy: string }[] };
    expect(list.total).toBe(1);
    expect(list.jobs[0]).toMatchObject({ title: 'Synthetic SRE', status: 'OPEN', remotePolicy: 'remote' });

    const overview = (await call('GET', '/api/overview')).body as { jobs: { open: number; unreviewed: number }; sources: { boards: number; healthy: number }; nextActions: { rule: string }[] };
    expect(overview.jobs).toMatchObject({ open: 2, unreviewed: 2 });
    expect(overview.sources).toMatchObject({ boards: 1, healthy: 1 });
    expect(overview.nextActions.map((a) => a.rule)).toContain('jobs.unreviewed');
    expect(overview.nextActions.map((a) => a.rule)).not.toContain('jobs.no-sources');

    const detail = (await call('GET', `/api/jobs/${list.jobs[0]!.id}`)).body as { job: { sourceRecords: { source: string; board: string }[] } };
    expect(detail.job.sourceRecords).toEqual([expect.objectContaining({ source: 'greenhouse', board: 'synthetic' })]);
  });

  it('shortlisting persists and changes what needs review', async () => {
    const { call } = await start();
    const { task } = (await call('POST', '/api/sources', { source: 'lever', board: 'synthetic' })).body as { task: { id: string } };
    await waitForTask(call, task.id);
    const { jobs } = (await call('GET', '/api/jobs')).body as { jobs: { id: string }[] };
    const res = await call('PUT', `/api/jobs/${jobs[0]!.id}/disposition`, { disposition: 'shortlisted' });
    expect(res.status).toBe(200);
    expect((res.body as { job: { disposition: string } }).job.disposition).toBe('shortlisted');
    const overview = (await call('GET', '/api/overview')).body as { jobs: { shortlisted: number; unreviewed: number } };
    expect(overview.jobs).toMatchObject({ shortlisted: 1, unreviewed: 0 });
    expect((await call('GET', '/api/jobs?disposition=shortlisted')).body).toMatchObject({ total: 1 });
  });

  it('validates input and reports conflicts and missing records', async () => {
    const { call } = await start();
    expect((await call('POST', '/api/sources', { source: 'indeed', board: 'x' })).status).toBe(400);
    expect((await call('POST', '/api/sources', { source: 'lever', board: '../x' })).status).toBe(400);
    expect((await call('POST', '/api/sources', { source: 'lever', board: 'synthetic' })).status).toBe(201);
    expect((await call('POST', '/api/sources', { source: 'lever', board: 'synthetic' })).status).toBe(409);
    expect((await call('GET', '/api/jobs?status=bogus')).status).toBe(400);
    expect((await call('GET', '/api/jobs/job_nope')).status).toBe(404);
    expect((await call('PUT', '/api/jobs/job_nope/disposition', { disposition: 'shortlisted' })).status).toBe(404);
    expect((await call('POST', '/api/jobs', { employer: 'X', title: 'Y', url: 'javascript:alert(1)' })).status).toBe(400);
    expect((await call('POST', '/api/tasks/task_nope/cancel')).status).toBe(404);
  });

  it('manual intake creates an unverified job', async () => {
    const { call } = await start();
    const res = await call('POST', '/api/jobs', { employer: 'Synthetic Co', title: 'Synthetic PM', url: 'https://careers.example.com/pm', description: 'Lead.' });
    expect(res.status).toBe(201);
    expect((res.body as { job: { status: string; sources: string[] } }).job).toMatchObject({ status: 'UNVERIFIED', sources: ['manual'] });
  });
});
