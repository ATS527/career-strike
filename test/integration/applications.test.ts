import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { syncBoard } from '../../src/career/jobs.js';
import { type AppPaths, appPaths } from '../../src/core/paths.js';
import { localRequest } from '../../src/service/http-client.js';
import { type RunningService, startService } from '../../src/service/service.js';
import { createAdapters } from '../../src/sources/adapters.js';
import type { NormalizedPosting } from '../../src/sources/types.js';
import { openDb } from '../../src/store/db.js';
import { fakeFetch } from '../fixtures/ats.js';
import { dashboardSession, tempDir } from '../helpers.js';

const running: RunningService[] = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((s) => s.stop()));
});

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from('synthetic resume body')]);

const FORM = {
  questions: [
    { label: 'First Name', required: true, fields: [{ name: 'first_name', type: 'input_text', values: [] }] },
    { label: 'Last Name', required: true, fields: [{ name: 'last_name', type: 'input_text', values: [] }] },
    { label: 'Email', required: true, fields: [{ name: 'email', type: 'input_text', values: [] }] },
    { label: 'Resume/CV', required: true, fields: [{ name: 'resume', type: 'input_file', values: [] }] },
    { label: 'Cover Letter', required: false, fields: [{ name: 'cover_letter_text', type: 'textarea', values: [] }] },
    {
      label: 'Do you need visa sponsorship?',
      required: true,
      fields: [{ name: 'q_visa', type: 'multi_value_single_select', values: [{ label: 'Yes' }, { label: 'No' }] }],
    },
  ],
  demographic_questions: { questions: [{ label: 'Gender' }] },
};

function posting(): NormalizedPosting {
  return {
    source: 'greenhouse',
    board: 'synthetic',
    sourceJobId: '4242',
    employer: 'Synthetic Labs',
    title: 'Platform Engineer',
    locationText: 'Remote - India',
    remotePolicy: 'remote',
    employmentType: 'full_time',
    department: null,
    salary: null,
    description: [
      { type: 'heading', text: 'Requirements' },
      { type: 'item', text: 'TypeScript and Kubernetes' },
    ],
    applyUrl: 'https://careers.example.com/apply/4242',
    postingUrl: 'https://careers.example.com/4242',
    publishedAt: '2026-10-01T00:00:00.000Z',
    unresolved: [],
  };
}

async function setup() {
  const paths = appPaths(path.join(tempDir(), 'data'));
  const s = await startService(paths, {
    port: 0,
    adapters: createAdapters(fakeFetch({ 'boards-api.greenhouse.io': FORM })),
  });
  running.push(s);
  const db = openDb(paths.db);
  syncBoard(db, 'greenhouse', 'synthetic', [posting()]);
  const jobId = db.prepare('SELECT id FROM jobs').pluck().get() as string;
  db.close();
  const bearer = { authorization: `Bearer ${s.info.token}` };
  const call = (method: string, url: string, body?: unknown, headers: Record<string, string> = bearer) =>
    localRequest(s.info.port, url, { method, body, headers });
  for (const [key, value] of [
    ['identity.fullName', 'Jordan Example'],
    ['identity.email', 'jordan@example.com'],
    ['identity.phone', '+1 555 0100'],
  ] as const)
    await call('PUT', `/api/settings/${key}`, { value });
  await call('POST', '/api/profile/facts', { kind: 'skill', value: { name: 'TypeScript', years: 5 } });
  await call('POST', '/api/profile/facts', {
    kind: 'role',
    value: { title: 'Platform Engineer', employer: 'Synthetic Co', startYear: 2019 },
  });
  const dash = await dashboardSession(s.info.port, s.info.token);
  return { s, paths, jobId, call, dash };
}

async function upload(
  s: RunningService,
  bytes: Buffer,
  mime = 'application/pdf',
  filename = 'resume.pdf',
  kind = 'resume',
) {
  return localRequest(s.info.port, '/api/documents', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${s.info.token}`,
      'content-type': mime,
      'x-cs-filename': encodeURIComponent(filename),
      'x-cs-document-kind': kind,
      'content-length': String(bytes.length),
    },
    // localRequest JSON-encodes bodies; send raw bytes via a direct request instead.
    body: undefined,
  }).then(() => rawUpload(s, bytes, mime, filename, kind));
}

function rawUpload(
  s: RunningService,
  bytes: Buffer,
  mime: string,
  filename: string,
  kind: string,
): Promise<{ status: number; body: unknown }> {
  return fetch(`http://127.0.0.1:${s.info.port}/api/documents`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${s.info.token}`,
      'content-type': mime,
      'x-cs-filename': encodeURIComponent(filename),
      'x-cs-document-kind': kind,
    },
    body: bytes,
  }).then(async (r) => ({ status: r.status, body: await r.json() }));
}

type View = {
  id: string;
  state: string;
  version: number;
  payloadHash: string;
  missingRequired: string[];
  disclosures: string[];
  warnings: { message: string }[];
  approval: { valid: boolean; reason: string; approval: { state: string } | null };
  payload: {
    identity: Record<string, unknown>;
    fields: { key: string; value: string | null; source: string }[];
    coverLetter: string | null;
    notAnswered: string[];
    attachments: { filename: string; sha256: string }[];
    personalization: {
      profileFingerprint: string;
      snapshotId: string;
      variants: { id: string; kind: string; contentHash: string }[];
    } | null;
  };
  versions: { version: number; reason: string }[];
};

describe('documents', () => {
  it('accepts real PDFs only, keeps them private and never reveals the vault path', async () => {
    const { s, paths, call } = await setup();
    const ok = await rawUpload(s, PDF, 'application/pdf', '../../etc/My Résumé.pdf', 'resume');
    expect(ok.status).toBe(201);
    const doc = (ok.body as { document: { id: string; filename: string; sha256: string } }).document;
    expect(doc.filename).toBe('My Résumé.pdf');
    expect(JSON.stringify(ok.body)).not.toContain(paths.vault);

    expect((await rawUpload(s, Buffer.from('not a pdf'), 'application/pdf', 'x.pdf', 'resume')).status).toBe(400);
    expect((await rawUpload(s, Buffer.from('<html>'), 'text/html', 'x.html', 'resume')).status).toBe(415);
    expect((await rawUpload(s, PDF, 'application/pdf', 'x.pdf', 'passport')).status).toBe(400);

    const stored = fs.readdirSync(path.join(paths.vault, 'documents'));
    expect(stored).toEqual([doc.id]);
    if (process.platform !== 'win32')
      expect(fs.statSync(path.join(paths.vault, 'documents', doc.id)).mode & 0o777).toBe(0o600);

    const content = await fetch(`http://127.0.0.1:${s.info.port}/api/documents/${doc.id}/content`, {
      headers: { authorization: `Bearer ${s.info.token}` },
    });
    expect(content.headers.get('content-disposition')).toMatch(/^attachment;/);
    expect(Buffer.from(await content.arrayBuffer()).equals(PDF)).toBe(true);
    for (const res of [
      await call('GET', '/api/documents'),
      await call('GET', '/api/overview'),
      await call('GET', '/api/profile'),
    ]) {
      expect(JSON.stringify(res.body)).not.toContain(paths.vault);
    }
  });
});

describe('applications', () => {
  async function draft(ctx: Awaited<ReturnType<typeof setup>>): Promise<View> {
    await rawUpload(ctx.s, PDF, 'application/pdf', 'resume.pdf', 'resume');
    const res = await ctx.call('POST', '/api/applications', { jobId: ctx.jobId });
    expect(res.status).toBe(201);
    return (res.body as { application: View }).application;
  }

  it('drafts from the employer’s real form and the approved profile, leaving employer questions to the candidate', async () => {
    const ctx = await setup();
    const app = await draft(ctx);
    expect(app.state).toBe('DRAFTED');
    const value = (k: string) => app.payload.fields.find((f) => f.key === k);
    expect(value('first_name')).toMatchObject({ value: 'Jordan', source: 'identity' });
    expect(value('resume')).toMatchObject({ value: 'resume.pdf', source: 'document' });
    expect(value('q_visa')).toMatchObject({ value: null, source: 'empty' });
    expect(app.payload.notAnswered).toEqual(['Gender']);
    expect(app.payload.identity).toMatchObject({ phone: null });
    expect(app.payload.coverLetter).toContain('I have worked as Platform Engineer at Synthetic Co since 2019.');
    expect(app.missingRequired).toEqual(['Do you need visa sponsorship?']);
    expect(app.warnings).toEqual([]);
    expect((await ctx.call('POST', '/api/applications', { jobId: ctx.jobId })).status).toBe(409);
  });

  it('keeps a generated document package local, evidence-backed, job-bound, and stale when the profile changes', async () => {
    const ctx = await setup();
    let app = await draft(ctx);
    const generated = await ctx.call('POST', `/api/applications/${app.id}/personalize`);
    expect(generated.status).toBe(200);
    app = (generated.body as { application: View }).application;
    expect(app.payload.personalization?.variants.map((v) => v.kind).sort()).toEqual(['cover_letter', 'resume']);
    expect(app.payload.coverLetter).toContain('Platform Engineer');

    const review = await ctx.call('GET', `/api/applications/${app.id}/personalization`);
    const personalization = (
      review.body as {
        personalization: {
          variants: { kind: string; evidence: { requirement: string; evidenceRefs: string[] }[] }[];
          stale: boolean;
        };
      }
    ).personalization;
    expect(personalization.stale).toBe(false);
    expect(personalization.variants).toHaveLength(2);
    expect(
      personalization.variants.find((v) => v.kind === 'resume')?.evidence.find((e) => e.requirement === 'TypeScript')
        ?.evidenceRefs[0],
    ).toMatch(/^fact_/);

    // Required form fields are answered first, then changing confirmed profile evidence makes the
    // package stale and prevents review until it is regenerated.
    await ctx.call('PUT', `/api/applications/${app.id}`, { changes: { fields: [{ key: 'q_visa', value: 'No' }] } });
    await ctx.call('POST', '/api/profile/facts', { kind: 'skill', value: { name: 'Kubernetes', years: 2 } });
    const stale = await ctx.call('POST', `/api/applications/${app.id}/ready`);
    expect(stale.status).toBe(409);
    expect((stale.body as { error: string }).error).toBe('STALE_DOCUMENTS');
  });

  it('cannot be marked ready while required answers are missing', async () => {
    const ctx = await setup();
    const app = await draft(ctx);
    const res = await ctx.call('POST', `/api/applications/${app.id}/ready`);
    expect(res.status).toBe(422);
    expect((res.body as { message: string }).message).toContain('Do you need visa sponsorship?');
    expect(
      (
        await ctx.call('PUT', `/api/applications/${app.id}`, {
          changes: { fields: [{ key: 'q_visa', value: 'Maybe' }] },
        })
      ).status,
    ).toBe(400);
  });

  it('approval is dashboard-only, bound to the reviewed version and hash, and invalidated by any edit', async () => {
    const ctx = await setup();
    let app = await draft(ctx);
    app = (
      (
        await ctx.call('PUT', `/api/applications/${app.id}`, {
          changes: { fields: [{ key: 'q_visa', value: 'No' }] },
          reason: 'Answered visa question',
        })
      ).body as { application: View }
    ).application;
    expect(app.version).toBe(2);
    app = ((await ctx.call('POST', `/api/applications/${app.id}/ready`)).body as { application: View }).application;
    expect(app.state).toBe('READY_FOR_REVIEW');

    const approveBody = { version: app.version, payloadHash: app.payloadHash };
    const viaBearer = await ctx.call('POST', `/api/applications/${app.id}/approve`, approveBody);
    expect(viaBearer.status).toBe(403);
    expect((viaBearer.body as { error: string }).error).toBe('APPROVAL_REQUIRES_DASHBOARD');

    const stale = await ctx.call(
      'POST',
      `/api/applications/${app.id}/approve`,
      { version: 1, payloadHash: app.payloadHash },
      ctx.dash.headers,
    );
    expect(stale.status).toBe(409);

    const approved = await ctx.call('POST', `/api/applications/${app.id}/approve`, approveBody, ctx.dash.headers);
    expect(approved.status).toBe(200);
    app = (approved.body as { application: View }).application;
    expect(app.state).toBe('APPROVED');
    expect(app.approval).toMatchObject({ valid: true, approval: { state: 'ACTIVE' } });

    // Any material change: a new version, the approval invalidated, back to drafts.
    app = (
      (
        await ctx.call('PUT', `/api/applications/${app.id}`, {
          changes: { coverLetter: `${app.payload.coverLetter}\nP.S.` },
        })
      ).body as { application: View }
    ).application;
    expect(app.state).toBe('DRAFTED');
    expect(app.version).toBe(3);
    expect(app.approval).toMatchObject({ valid: false, approval: { state: 'INVALIDATED' } });
    expect(app.versions.map((v) => v.reason)).toEqual([
      'Edited by you',
      'Answered visa question',
      'First draft from your approved profile and the employer’s published form',
    ]);
  });

  it('flags unsupported claims and requires the candidate to confirm them before approving', async () => {
    const ctx = await setup();
    let app = await draft(ctx);
    await ctx.call('PUT', `/api/applications/${app.id}`, {
      changes: { fields: [{ key: 'q_visa', value: 'No' }], coverLetter: 'I have 20 years of Rust.' },
    });
    app = ((await ctx.call('POST', `/api/applications/${app.id}/ready`)).body as { application: View }).application;
    expect(app.warnings.map((w) => w.message)).toEqual([
      'Mentions Rust, which is not in your profile.',
      'Claims 20 years; your profile supports about 7.',
    ]);
    const body = { version: app.version, payloadHash: app.payloadHash };
    expect((await ctx.call('POST', `/api/applications/${app.id}/approve`, body, ctx.dash.headers)).status).toBe(422);
    expect(
      (
        await ctx.call(
          'POST',
          `/api/applications/${app.id}/approve`,
          { ...body, acknowledgeWarnings: true },
          ctx.dash.headers,
        )
      ).status,
    ).toBe(200);
  });

  async function approvedApp() {
    const ctx = await setup();
    let app = await draft(ctx);
    await ctx.call('PUT', `/api/applications/${app.id}`, { changes: { fields: [{ key: 'q_visa', value: 'No' }] } });
    app = ((await ctx.call('POST', `/api/applications/${app.id}/ready`)).body as { application: View }).application;
    app = (
      (
        await ctx.call(
          'POST',
          `/api/applications/${app.id}/approve`,
          { version: app.version, payloadHash: app.payloadHash },
          ctx.dash.headers,
        )
      ).body as { application: View }
    ).application;
    expect(app.approval.valid).toBe(true);
    const status = async () =>
      ((await ctx.call('GET', `/api/applications/${app.id}`)).body as { application: View }).application.approval;
    return { ...ctx, app, status, paths: ctx.paths as AppPaths };
  }

  it('detects a payload changed behind the approval’s back', async () => {
    const { app, status, paths } = await approvedApp();
    const db = openDb(paths.db);
    const row = db
      .prepare('SELECT payload_json FROM application_versions WHERE application_id = ? AND version = ?')
      .get(app.id, app.version) as { payload_json: string };
    const tampered = JSON.parse(row.payload_json);
    tampered.destination.url = 'https://evil.example/collect';
    db.prepare('UPDATE application_versions SET payload_json = ? WHERE application_id = ? AND version = ?').run(
      JSON.stringify(tampered),
      app.id,
      app.version,
    );
    db.close();
    expect(await status()).toMatchObject({
      valid: false,
      reason: 'What would be submitted differs from what was approved.',
    });
  });

  it('rejects a forged approval record', async () => {
    const { app, status, paths } = await approvedApp();
    const db = openDb(paths.db);
    db.prepare("UPDATE approvals SET mac = ? WHERE application_id = ? AND state = 'ACTIVE'").run(
      '0'.repeat(64),
      app.id,
    );
    db.close();
    expect(await status()).toMatchObject({
      valid: false,
      reason: expect.stringContaining('signature does not verify'),
    });
  });

  it('a consumed approval cannot be replayed and an old one expires', async () => {
    const { app, status, paths } = await approvedApp();
    const db = openDb(paths.db);
    db.prepare("UPDATE approvals SET state = 'CONSUMED', consumed_at = 'x' WHERE application_id = ?").run(app.id);
    expect(await status()).toMatchObject({ valid: false, approval: { state: 'CONSUMED' } });
    db.prepare(
      "UPDATE approvals SET state = 'ACTIVE', expires_at = '2000-01-01T00:00:00.000Z' WHERE application_id = ?",
    ).run(app.id);
    db.close();
    // Changing expiry also breaks the signature; either way the approval is not usable.
    expect((await status()).valid).toBe(false);
  });

  it('expiry is enforced even with an authentic signature', async () => {
    const { app, paths } = await approvedApp();
    const { ApplicationService, APPROVAL_TTL_MS } = await import('../../src/applications/service.js');
    const { DocumentVault } = await import('../../src/vault/documents.js');
    const { FileSecretStore } = await import('../../src/vault/secrets.js');
    const db = openDb(paths.db);
    const service = new ApplicationService(
      db,
      new FileSecretStore(path.join(paths.home, 'secrets')),
      new DocumentVault(db, paths.vault),
      async () => null,
    );
    expect((await service.verifyApproval(app.id)).valid).toBe(true);
    const later = await service.verifyApproval(app.id, Date.now() + APPROVAL_TTL_MS + 60_000);
    expect(later).toMatchObject({ valid: false, reason: 'Approval expired. Review and approve again.' });
    expect(db.prepare('SELECT state FROM approvals WHERE application_id = ?').pluck().get(app.id)).toBe('EXPIRED');
    db.close();
  });

  it('rejecting at review cancels the application and revokes the approval', async () => {
    const { app, call, dash } = await approvedApp();
    const res = await call('POST', `/api/applications/${app.id}/reject`, { note: 'Changed my mind' }, dash.headers);
    const view = (res.body as { application: View }).application;
    expect(view.state).toBe('CANCELLED');
    expect(view.approval).toMatchObject({ valid: false, approval: { state: 'REVOKED' } });
    expect((await call('PUT', `/api/applications/${app.id}`, { changes: { coverLetter: 'x' } })).status).toBe(409);
  });
});
