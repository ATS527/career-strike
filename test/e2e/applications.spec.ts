import { type CsService, expect, signIn, test } from './fixtures.js';

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from('synthetic resume')]);

async function prepare(cs: CsService) {
  cs.seed('lever', 'apply', [
    {
      title: 'Platform Engineer',
      applyUrl: 'https://jobs.lever.co/apply/0/apply',
      description: [
        { type: 'heading', text: 'Requirements' },
        { type: 'item', text: 'TypeScript and Kubernetes' },
      ],
    },
  ]);
  for (const [key, value] of [
    ['identity.fullName', 'Jordan Example'],
    ['identity.email', 'jordan@example.com'],
  ] as const) expect((await cs.api('PUT', `/api/settings/${key}`, { value })).status).toBe(200);
  await cs.api('POST', '/api/profile/facts', { kind: 'skill', value: { name: 'TypeScript', years: 5 } });
  await cs.api('POST', '/api/profile/facts', { kind: 'role', value: { title: 'Platform Engineer', employer: 'Synthetic Co', startYear: 2019 } });
  const { jobs } = (await cs.api('GET', '/api/jobs')).body as { jobs: { id: string }[] };
  return jobs[0]!.id;
}

test.describe('applications', () => {
  test('upload a résumé, prepare, review the exact package, approve, and see edits cancel the approval', async ({ page, cs }) => {
    const jobId = await prepare(cs);
    await signIn(page, cs);

    await page.goto(`${cs.origin}/profile`);
    await page.getByLabel('File (PDF, .docx or .txt, up to 10 MB)').setInputFiles({ name: 'Jordan Resume.pdf', mimeType: 'application/pdf', buffer: PDF });
    await expect(page.getByTestId('documents')).toContainText('Jordan Resume.pdf');
    await expect(page.getByRole('link', { name: 'Download Jordan Resume.pdf' })).toHaveAttribute('href', /\/api\/documents\/doc_/);

    await page.goto(`${cs.origin}/jobs/${jobId}`);
    await page.getByRole('button', { name: 'Prepare an application' }).click();
    await expect(page).toHaveURL(/\/applications\/app_/);
    await expect(page.getByRole('heading', { level: 1, name: 'Platform Engineer' })).toBeVisible();

    const pkg = page.getByTestId('package');
    await expect(pkg).toContainText('Your full name');
    await expect(pkg).toContainText('Your email address');
    await expect(pkg).toContainText('Résumé: Jordan Resume.pdf');
    await expect(pkg).toContainText('jobs.lever.co');
    await expect(pkg.locator('.letter')).toContainText('I have worked as Platform Engineer at Synthetic Co since 2019.');
    await expect(pkg).not.toContainText('Kubernetes (');

    await page.getByRole('button', { name: 'Mark ready for review' }).click();
    await expect(page.getByText('Ready for your review', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Approve this exact application' }).click();
    await expect(page.getByText('Approved — not yet submitted', { exact: true })).toBeVisible();
    await expect(page.getByText('Approval is valid')).toBeVisible();
    await expect(page.getByRole('link', { name: /Open the official application/ })).toHaveAttribute('href', 'https://jobs.lever.co/apply/0/apply');

    // Any edit makes a new version and cancels the approval.
    await expect(page.getByText('Changing anything creates a new version and cancels your approval.')).toBeVisible();
    await page.getByLabel('Cover letter').fill('Dear team,\n\nShort and true.\n\nJordan');
    await page.getByRole('button', { name: 'Save as a new version' }).click();
    await expect(page.getByText('Draft', { exact: true })).toBeVisible();
    await expect(page.getByText('Version 2')).toBeVisible();
    const app = (await cs.api('GET', '/api/applications')).body as { applications: { id: string }[] };
    const view = (await cs.api('GET', `/api/applications/${app.applications[0]!.id}`)).body as { application: { approval: { valid: boolean; approval: { state: string } } } };
    expect(view.application.approval).toMatchObject({ valid: false, approval: { state: 'INVALIDATED' } });
  });

  test('statements the profile does not support must be confirmed before approval', async ({ page, cs }) => {
    const jobId = await prepare(cs);
    const PDFUP = await fetch(`${cs.origin}/api/documents`, {
      method: 'POST',
      headers: { authorization: `Bearer ${cs.token}`, 'content-type': 'application/pdf', 'x-cs-filename': 'cv.pdf', 'x-cs-document-kind': 'resume' },
      body: PDF,
    });
    expect(PDFUP.status).toBe(201);
    const created = (await cs.api('POST', '/api/applications', { jobId })).body as { application: { id: string } };
    await signIn(page, cs);
    await page.goto(`${cs.origin}/applications/${created.application.id}`);
    await page.getByLabel('Cover letter').fill('I have 15 years of Rust experience.');
    await page.getByRole('button', { name: 'Save as a new version' }).click();
    await expect(page.getByText('Mentions Rust, which is not in your profile.')).toBeVisible();
    await expect(page.getByText('Claims 15 years; your profile supports about')).toBeVisible();
    await page.getByRole('button', { name: 'Mark ready for review' }).click();
    const approve = page.getByRole('button', { name: 'Approve this exact application' });
    await expect(approve).toBeDisabled();
    await page.getByLabel('I confirm the flagged statements are accurate.').check();
    await approve.click();
    await expect(page.getByText('Approval is valid')).toBeVisible();
  });

  test('rejecting at review cancels it and nothing can be sent', async ({ page, cs }) => {
    const jobId = await prepare(cs);
    await signIn(page, cs);
    await page.goto(`${cs.origin}/jobs/${jobId}`);
    await page.getByRole('button', { name: 'Prepare an application' }).click();
    await expect(page.getByText('Still needed: Résumé/CV.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark ready for review' })).toBeDisabled();
    page.once('dialog', (d) => void d.accept('Not the right team'));
    await page.getByRole('button', { name: 'Reject' }).click();
    await expect(page.getByText('Cancelled', { exact: true })).toBeVisible();
    await expect(page.getByText('This application can no longer be edited.')).toBeVisible();

    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Applications' }).click();
    await expect(page.getByRole('region', { name: /Closed/ })).toContainText('Platform Engineer');
  });

  test('save for later returns a reviewed application to drafts and it stays there', async ({ page, cs }) => {
    const jobId = await prepare(cs);
    await fetch(`${cs.origin}/api/documents`, {
      method: 'POST',
      headers: { authorization: `Bearer ${cs.token}`, 'content-type': 'application/pdf', 'x-cs-filename': 'cv.pdf', 'x-cs-document-kind': 'resume' },
      body: PDF,
    });
    const created = (await cs.api('POST', '/api/applications', { jobId })).body as { application: { id: string } };
    await signIn(page, cs);
    await page.goto(`${cs.origin}/applications/${created.application.id}`);
    await page.getByRole('button', { name: 'Mark ready for review' }).click();
    await expect(page.getByText('Ready for your review', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Save for later' }).click();
    await expect(page.getByText('Draft', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Draft', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark ready for review' })).toBeEnabled();
  });
});
