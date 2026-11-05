import path from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { type AppPaths, appPaths } from '../../src/core/paths.js';
import { localRequest } from '../../src/service/http-client.js';
import { type RunningService, startService } from '../../src/service/service.js';
import { dashboardSession, tempDir } from '../helpers.js';

const running: RunningService[] = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((s) => s.stop()));
});

async function setup() {
  const paths: AppPaths = appPaths(path.join(tempDir(), 'data'));
  const s = await startService(paths, { port: 0 });
  running.push(s);
  const adminHeaders = { authorization: `Bearer ${s.info.token}` };
  const call = (method: string, url: string, body?: unknown, headers: Record<string, string> = adminHeaders) =>
    localRequest(s.info.port, url, { method, body, headers });
  const dash = await dashboardSession(s.info.port, s.info.token);
  return { paths, s, call, dash, adminHeaders };
}

describe('LinkedIn integration', () => {
  it('saves and normalizes candidate.linkedinUrl and rejects invalid URLs', async () => {
    const { call, dash } = await setup();

    // 1. Invalid LinkedIn URL rejected
    const bad = await call(
      'PUT',
      '/api/settings/candidate.linkedinUrl',
      { value: 'https://linkedin.com/company/acme' },
      dash.headers,
    );
    expect(bad.status).toBe(400);

    // 2. Valid URL normalized
    const ok = await call(
      'PUT',
      '/api/settings/candidate.linkedinUrl',
      { value: 'linkedin.com/in/jordan-example' },
      dash.headers,
    );
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({
      key: 'candidate.linkedinUrl',
      value: 'https://www.linkedin.com/in/jordan-example/',
    });

    // 3. /api/settings returns candidate.linkedinUrl
    const settings = await call('GET', '/api/settings', undefined, dash.headers);
    expect(settings.status).toBe(200);
    expect((settings.body as { settings: Record<string, unknown> }).settings['candidate.linkedinUrl']).toBe(
      'https://www.linkedin.com/in/jordan-example/',
    );
  });

  it('imports LinkedIn export archive into unapproved facts and unconfirmed evidence', async () => {
    const { call, dash } = await setup();

    const archive = zipSync({
      'Positions.csv': strToU8(
        'Company Name,Title,Started On,Finished On\nAcme Corp,Staff Engineer,Jan 2021,Present\n',
      ),
      'Skills.csv': strToU8('Name\nTypeScript\nDocker\n'),
      'Education.csv': strToU8('School Name,Degree Name,Started On,Finished On\nTech Institute,B.S.,2015,2019\n'),
      'Certifications.csv': strToU8('Name,Authority,Started On\nCKA,Cloud Native Foundation,2022\n'),
      'Languages.csv': strToU8('Name,Proficiency\nEnglish,Native or bilingual proficiency\n'),
      'Projects.csv': strToU8(
        'Title,Description,Url\nCareer Strike Tool,"Privacy-first job hunt",https://example.com/project\n',
      ),
    });

    const res = await call(
      'POST',
      '/api/profile/import/linkedin',
      { zipBase64: Buffer.from(archive).toString('base64') },
      dash.headers,
    );
    expect(res.status).toBe(200);
    const body = res.body as { ok: boolean; result: { imported: Record<string, number>; total: number } };
    expect(body.ok).toBe(true);
    expect(body.result.imported).toEqual({
      roles: 1,
      skills: 2,
      education: 1,
      certifications: 1,
      languages: 1,
      projects: 1,
    });
    expect(body.result.total).toBe(7);

    // Verify unapproved facts and unconfirmed evidence
    const prof = (await call('GET', '/api/profile', undefined, dash.headers)).body as {
      facts: { id: string; approved: boolean; kind: string; value: Record<string, unknown> }[];
      evidence: { id: string; confirmed: boolean; kind: string; value: Record<string, unknown> }[];
    };

    expect(prof.facts).toHaveLength(6);
    expect(prof.facts.every((f) => !f.approved)).toBe(true);

    expect(prof.evidence).toHaveLength(1);
    expect(prof.evidence[0]?.confirmed).toBe(false);
    expect(prof.evidence[0]?.value.name).toBe('Career Strike Tool');

    // Confirm the evidence
    const confRes = await call('POST', `/api/profile/evidence/${prof.evidence[0]!.id}/confirm`, {}, dash.headers);
    expect(confRes.status).toBe(200);
    expect((confRes.body as { evidence: { confirmed: boolean } }).evidence.confirmed).toBe(true);

    // Approve one fact
    const appRes = await call('POST', `/api/profile/facts/${prof.facts[0]!.id}/approve`, {}, dash.headers);
    expect(appRes.status).toBe(200);
    expect((appRes.body as { fact: { approved: boolean } }).fact.approved).toBe(true);

    // Approve all remaining facts
    const allRes = await call('POST', '/api/profile/facts/approve-all', {}, dash.headers);
    expect(allRes.status).toBe(200);
    expect((allRes.body as { count: number }).count).toBe(5);

    // Check all are now approved
    const profAfter = (await call('GET', '/api/profile', undefined, dash.headers)).body as {
      facts: { approved: boolean }[];
      evidence: { confirmed: boolean }[];
    };
    expect(profAfter.facts.every((f) => f.approved)).toBe(true);
    expect(profAfter.evidence.every((e) => e.confirmed)).toBe(true);
  });

  it('discloses profile.linkedin to an AI assistant only after candidate approval', async () => {
    const { call, dash, adminHeaders } = await setup();

    // Set linkedin address
    await call('PUT', '/api/settings/candidate.linkedinUrl', { value: 'linkedin.com/in/alex-smith' }, dash.headers);

    // Create MCP client
    const mcpRes = await call('POST', '/api/mcp-clients', { name: 'test-agent' }, adminHeaders);
    const { token } = mcpRes.body as { token: string };
    const mcpHeaders = { authorization: `Bearer ${token}` };

    // Request personal info disclosure including profile.linkedin
    const reqRes = await call(
      'POST',
      '/api/mcp/disclosures',
      { purpose: 'Analyze candidate LinkedIn profile to tailor application', fields: ['profile.linkedin'] },
      mcpHeaders,
    );
    expect(reqRes.status).toBe(201);
    const dsc = reqRes.body as { requestId: string; state: string };
    expect(dsc.state).toBe('PENDING');

    // Candidate previews and approves in dashboard
    const prev = (await call('GET', `/api/disclosures/${dsc.requestId}/preview`, undefined, dash.headers)).body as {
      values: Record<string, unknown>;
      previewHash: string;
    };
    expect(prev.values['profile.linkedin']).toBe('https://www.linkedin.com/in/alex-smith/');

    const appRes = await call(
      'POST',
      `/api/disclosures/${dsc.requestId}/approve`,
      { fields: ['profile.linkedin'], previewHash: prev.previewHash },
      dash.headers,
    );
    expect(appRes.status).toBe(200);

    // AI collects disclosure once
    const collectRes = await call('GET', `/api/mcp/disclosures/${dsc.requestId}`, undefined, mcpHeaders);
    expect(collectRes.status).toBe(200);
    expect(collectRes.body).toEqual({
      purpose: 'Analyze candidate LinkedIn profile to tailor application',
      sharedOnce: true,
      information: {
        'profile.linkedin': 'https://www.linkedin.com/in/alex-smith/',
      },
    });
  });

  it('populates LinkedIn questions in application drafting from candidate.linkedinUrl', async () => {
    const { call, dash } = await setup();

    await call('PUT', '/api/settings/identity.fullName', { value: 'Jordan Example' }, dash.headers);
    await call('PUT', '/api/settings/identity.email', { value: 'jordan@example.com' }, dash.headers);
    await call(
      'PUT',
      '/api/settings/candidate.linkedinUrl',
      { value: 'https://www.linkedin.com/in/jordan-example/' },
      dash.headers,
    );

    // Add manual job
    const jobRes = await call(
      'POST',
      '/api/jobs',
      {
        title: 'Full Stack Engineer',
        employer: 'TechCorp',
        url: 'https://jobs.example.com/apply/123',
      },
      dash.headers,
    );
    expect(jobRes.status).toBe(201);
    const jobId = (jobRes.body as { job: { id: string } }).job?.id;

    // Create application draft
    const appRes = await call('POST', '/api/applications', { jobId }, dash.headers);
    expect(appRes.status).toBe(201);
    const view = (appRes.body as { application: { payload: { identity: { links: string[] } } } }).application;
    expect(view.payload.identity.links).toContain('https://www.linkedin.com/in/jordan-example/');
  });
});
