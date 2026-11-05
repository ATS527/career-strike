import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { syncBoard } from '../../src/career/jobs.js';
import { appPaths } from '../../src/core/paths.js';
import { localRequest } from '../../src/service/http-client.js';
import { type RunningService, startService } from '../../src/service/service.js';
import type { NormalizedPosting } from '../../src/sources/types.js';
import { openDb } from '../../src/store/db.js';
import { tempDir } from '../helpers.js';

const running: RunningService[] = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((s) => s.stop()));
});

function posting(
  id: string,
  title: string,
  requirements: string[],
  over: Partial<NormalizedPosting> = {},
): NormalizedPosting {
  return {
    source: 'greenhouse',
    board: 'synthetic',
    sourceJobId: id,
    employer: 'Synthetic Labs',
    title,
    locationText: 'Remote - India',
    remotePolicy: 'remote',
    employmentType: 'full_time',
    department: null,
    salary: null,
    description: [
      { type: 'heading', text: 'Requirements' },
      ...requirements.map((t) => ({ type: 'item' as const, text: t })),
    ],
    applyUrl: `https://careers.example.com/${id}`,
    postingUrl: `https://careers.example.com/${id}`,
    publishedAt: `2026-10-0${id}T00:00:00.000Z`,
    unresolved: [],
    ...over,
  };
}

async function start() {
  const paths = appPaths(path.join(tempDir(), 'data'));
  const s = await startService(paths, { port: 0 });
  running.push(s);
  const call = (method: string, url: string, body?: unknown) =>
    localRequest(s.info.port, url, { method, body, headers: { authorization: `Bearer ${s.info.token}` } });
  const seed = (postings: NormalizedPosting[]) => {
    const db = openDb(paths.db);
    syncBoard(db, 'greenhouse', 'synthetic', postings);
    db.close();
  };
  return { s, call, seed, paths };
}

describe('candidate profile', () => {
  it('stores validated facts, canonicalises known skills and audits without values', async () => {
    const { call, paths } = await start();
    const added = await call('POST', '/api/profile/facts', { kind: 'skill', value: { name: 'k8s', years: 4 } });
    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({
      fact: { kind: 'skill', value: { name: 'Kubernetes', years: 4, level: null }, source: 'user', approved: true },
    });

    expect(
      (
        await call('POST', '/api/profile/facts', {
          kind: 'role',
          value: { title: 'SRE', startYear: 2020, endYear: 2019 },
        })
      ).status,
    ).toBe(400);
    expect(
      (await call('POST', '/api/profile/facts', { kind: 'role', value: { title: 'SRE', startYear: 2999 } })).status,
    ).toBe(400);
    expect((await call('POST', '/api/profile/facts', { kind: 'secret', value: {} })).status).toBe(400);
    expect((await call('POST', '/api/profile/facts', { kind: 'skill', value: { name: 'X', extra: 1 } })).status).toBe(
      400,
    );

    const id = (added.body as { fact: { id: string } }).fact.id;
    expect(
      (await call('PUT', `/api/profile/facts/${id}`, { value: { name: 'Kubernetes', years: 6 } })).body,
    ).toMatchObject({ fact: { value: { years: 6 } } });
    expect((await call('PUT', `/api/profile/facts/${id}`, { value: { name: '' } })).status).toBe(400);
    expect((await call('PUT', '/api/profile/facts/fact_nope', { value: { name: 'X' } })).status).toBe(404);

    const db = openDb(paths.db);
    const audit = JSON.stringify(db.prepare("SELECT * FROM audit_events WHERE action LIKE 'profile.%'").all());
    db.close();
    expect(audit).toContain('profile.fact.added');
    expect(audit).not.toContain('Kubernetes');

    expect((await call('DELETE', `/api/profile/facts/${id}`)).status).toBe(200);
    expect((await call('GET', '/api/profile')).body).toEqual({ facts: [], evidence: [] });
  });

  it('ignores unapproved facts when matching', async () => {
    const { call, paths, seed } = await start();
    seed([posting('1', 'Platform Engineer', ['Strong Kubernetes'])]);
    const db = openDb(paths.db);
    db.prepare(
      "INSERT INTO profile_facts (id, kind, value_json, source, approved, created_at, updated_at) VALUES ('fact_doc', 'skill', '{\"name\":\"Kubernetes\"}', 'document', 0, 'x', 'x')",
    ).run();
    db.close();
    const { jobs } = (await call('GET', '/api/jobs')).body as {
      jobs: { fit: { tier: string; matchedSkills: string[] } }[];
    };
    expect(jobs[0]!.fit).toMatchObject({ tier: 'unknown', matchedSkills: [] });
  });

  it('suggests skills from résumé text as unapproved facts, used only once approved', async () => {
    const { s, call, paths, seed } = await start();
    seed([posting('1', 'Platform Engineer', ['Strong Kubernetes', 'Experience with Terraform'])]);
    await call('POST', '/api/profile/facts', { kind: 'skill', value: { name: 'Terraform' } });
    const resume = 'Synthetic Person — ran k8s clusters, wrote Terraform and Python. Unique-marker-7f3a.';
    const res = await call('POST', '/api/profile/suggestions', { text: resume });
    expect(res.status).toBe(201);
    const suggested = (
      res.body as { suggested: { id: string; value: { name: string }; source: string; approved: boolean }[] }
    ).suggested;
    // Terraform is already in the profile, so it is not suggested again.
    expect(suggested.map((f) => f.value.name).sort()).toEqual(['Kubernetes', 'Python']);
    expect(suggested.every((f) => f.source === 'document' && !f.approved)).toBe(true);

    const fit = async () =>
      ((await call('GET', '/api/jobs')).body as { jobs: { fit: { matchedSkills: string[] } }[] }).jobs[0]!.fit
        .matchedSkills;
    expect(await fit()).toEqual(['Terraform']);
    const k8s = suggested.find((f) => f.value.name === 'Kubernetes')!;
    expect((await call('POST', `/api/profile/facts/${k8s.id}/approve`)).body).toMatchObject({
      fact: { approved: true, source: 'document' },
    });
    expect((await fit()).sort()).toEqual(['Kubernetes', 'Terraform']);
    // Discarding a suggestion removes it; running again finds only what is still missing.
    const py = suggested.find((f) => f.value.name === 'Python')!;
    expect((await call('DELETE', `/api/profile/facts/${py.id}`)).status).toBe(200);
    expect((await call('POST', `/api/profile/facts/fact_nope/approve`)).status).toBe(404);
    expect(
      (
        (await call('POST', '/api/profile/suggestions', { text: resume })).body as {
          suggested: { value: { name: string } }[];
        }
      ).suggested.map((f) => f.value.name),
    ).toEqual(['Python']);
    expect((await call('POST', '/api/profile/suggestions', { text: '  ' })).status).toBe(400);

    // The pasted text is never stored, nor written to the audit log or service log.
    const db = openDb(paths.db);
    const dump = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").pluck().all() as string[];
    for (const table of dump)
      expect(JSON.stringify(db.prepare(`SELECT * FROM "${table}"`).all())).not.toContain('Unique-marker-7f3a');
    db.close();
    expect(JSON.stringify(s)).not.toContain('Unique-marker-7f3a');
  });

  it('reads skills from a stored plain-text résumé and says plainly that PDF text is not extracted', async () => {
    const { s, call } = await start();
    const upload = async (mime: string, bytes: Buffer) =>
      (await fetch(`http://127.0.0.1:${s.info.port}/api/documents`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${s.info.token}`,
          'content-type': mime,
          'x-cs-document-kind': 'resume',
          'x-cs-filename': 'resume',
        },
        body: bytes,
      }).then((r) => r.json())) as { document: { id: string } };
    const txt = await upload('text/plain', Buffer.from('Built services in Python and PostgreSQL.'));
    const res = await call('POST', '/api/profile/suggestions', { documentId: txt.document.id });
    expect(
      (res.body as { suggested: { value: { name: string } }[] }).suggested.map((f) => f.value.name).sort(),
    ).toEqual(['PostgreSQL', 'Python']);
    const pdf = await upload('application/pdf', Buffer.from('%PDF-1.4\nsynthetic'));
    const refused = await call('POST', '/api/profile/suggestions', { documentId: pdf.document.id });
    expect(refused.status).toBe(400);
    expect(refused.body).toMatchObject({ error: 'UNSUPPORTED_TYPE' });
    expect((await call('POST', '/api/profile/suggestions', { documentId: 'doc_missing' })).status).toBe(404);
  });
});

describe('fit in the opportunities API', () => {
  it('explains fit on each job and sorts best matches first', async () => {
    const { call, seed } = await start();
    seed([
      posting('1', 'Data Scientist', ['Deep PyTorch experience', 'Statistics']),
      posting('2', 'Backend Engineer', ['TypeScript and Node.js', 'PostgreSQL'], { locationText: 'Remote - India' }),
      posting('3', 'Backend Engineer (US)', ['TypeScript'], { locationText: 'Austin, TX' }),
    ]);
    await call('PUT', '/api/settings/candidate.country', { value: 'IN' });
    await call('PUT', '/api/settings/search.preferredRoles', { value: ['Backend Engineer'] });
    for (const name of ['TypeScript', 'Node.js', 'PostgreSQL'])
      await call('POST', '/api/profile/facts', { kind: 'skill', value: { name } });

    const list = (await call('GET', '/api/jobs?sort=best_fit')).body as {
      fitAvailable: boolean;
      jobs: { title: string; fit: { tier: string; tierRule: string } }[];
    };
    expect(list.fitAvailable).toBe(true);
    expect(list.jobs.map((j) => [j.title, j.fit.tier])).toEqual([
      ['Backend Engineer', 'strong'],
      ['Data Scientist', 'stretch'],
      ['Backend Engineer (US)', 'ineligible'],
    ]);
    expect(list.jobs[2]!.fit.tierRule).toContain('countries you have not said you can work in');

    expect(((await call('GET', '/api/jobs?tier=strong')).body as { total: number }).total).toBe(1);
    expect(((await call('GET', '/api/jobs?tier=eligible')).body as { total: number }).total).toBe(2);

    const id = ((await call('GET', '/api/jobs?q=Data')).body as { jobs: { id: string }[] }).jobs[0]!.id;
    const detail = (await call('GET', `/api/jobs/${id}`)).body as {
      job: {
        requirements: { skills: { skill: string; importance: string }[] };
        fitDetail: { factors: { id: string; verdict: string }[] };
      };
    };
    expect(detail.job.requirements.skills).toEqual(
      expect.arrayContaining([expect.objectContaining({ skill: 'PyTorch', importance: 'required' })]),
    );
    expect(detail.job.fitDetail.factors.find((f) => f.id === 'skills')!.verdict).toBe('gap');

    const overview = (await call('GET', '/api/overview')).body as {
      matches: { strongUnreviewed: number };
      nextActions: { rule: string }[];
    };
    expect(overview.matches.strongUnreviewed).toBe(1);
    expect(overview.nextActions.map((a) => a.rule)).toContain('matches.strong-unreviewed');
  });

  it('backfills requirements for jobs stored before extraction existed', async () => {
    const { s, call, paths, seed } = await start();
    seed([posting('1', 'Engineer', ['Rust'])]);
    const db = openDb(paths.db);
    db.prepare('UPDATE jobs SET requirements_json = NULL, requirements_version = 0').run();
    db.close();
    await s.stop();
    const again = await startService(paths, { port: 0 });
    running.push(again);
    const res = await localRequest(again.info.port, '/api/jobs', {
      headers: { authorization: `Bearer ${again.info.token}` },
    });
    const id = (res.body as { jobs: { id: string }[] }).jobs[0]!.id;
    const detail = await localRequest(again.info.port, `/api/jobs/${id}`, {
      headers: { authorization: `Bearer ${again.info.token}` },
    });
    expect(
      (detail.body as { job: { requirements: { skills: { skill: string }[] } } }).job.requirements.skills.map(
        (x) => x.skill,
      ),
    ).toEqual(['Rust']);
    void call;
  });
});
