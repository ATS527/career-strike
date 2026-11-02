import { expect, signIn, test } from './fixtures.js';

test.describe('resume studio and profile readiness', () => {
  test('displays master resume, ATS health checks, and allows side-by-side comparison', async ({ page, cs }) => {
    // 1. Seed candidate facts and a job
    await cs.api('POST', '/api/profile/facts', {
      kind: 'role',
      value: { title: 'Staff Platform Engineer', employer: 'Acme Systems', startYear: 2021, endYear: null },
    });
    await cs.api('POST', '/api/profile/facts', {
      kind: 'skill',
      value: { name: 'Kubernetes', years: 4, level: 'expert' },
    });
    await cs.api('POST', '/api/profile/evidence', {
      kind: 'project',
      value: { name: 'Cloud Migration', summary: 'Migrated 50 microservices to Kubernetes with zero downtime', skills: ['Kubernetes'] },
    });

    cs.seed('lever', 'resume-studio-test', [
      {
        title: 'Principal Infrastructure Engineer',
        description: [{ type: 'paragraph', text: 'Experience with Kubernetes required.' }],
      },
    ]);
    const jobs = ((await cs.api('GET', '/api/jobs')).body as { jobs: { id: string }[] }).jobs;
    expect(jobs.length).toBeGreaterThan(0);

    // Prepare an application for this job
    const appRes = await cs.api('POST', '/api/applications', { jobId: jobs[0]!.id });
    expect(appRes.status).toBe(201);
    const appId = (appRes.body as { application: { id: string } }).application.id;

    // Generate personalized documents for this application
    await cs.api('POST', `/api/applications/${appId}/personalize`);

    // 2. Sign in and verify Resume Studio tab in navigation
    await signIn(page, cs);
    const resumeLink = page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Resume Studio' });
    await expect(resumeLink).toBeVisible();
    await resumeLink.click();

    await expect(page).toHaveURL(`${cs.origin}/resume`);
    await expect(page.getByRole('heading', { level: 1, name: 'Resume Studio' })).toBeVisible();

    // 3. Verify ATS Health & Truthfulness Verification cards
    await expect(page.getByRole('heading', { level: 2, name: 'ATS Health & Truthfulness Verification' })).toBeVisible();
    await expect(page.getByText('Cryptographic Evidence Provenance')).toBeVisible();
    await expect(page.getByText('Standard ATS Section Headings')).toBeVisible();

    // 4. Verify Master Resume Document content
    const masterDoc = page.locator('[aria-label="Master Resume content"]');
    await expect(masterDoc).toBeVisible();
    await expect(masterDoc).toContainText('Staff Platform Engineer — Acme Systems');
    await expect(masterDoc).toContainText('Kubernetes');
    await expect(masterDoc).toContainText('Cloud Migration: Migrated 50 microservices to Kubernetes');

    // 5. Switch to Side-by-Side Job Comparison
    await page.getByRole('button', { name: 'Job Comparison' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Side-by-Side Tailored Document Comparison' })).toBeVisible();
    await expect(page.getByText('Master Reference (Canonical Facts)')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tailored Resume' })).toBeVisible();

    // 6. Edit tailored document variant and save
    const editor = page.locator('#variant-editor');
    await expect(editor).toBeVisible();
    await editor.fill('TARGET ROLE: Principal Infrastructure Engineer\n\nCUSTOM CANDIDATE NOTE\n\nEXPERIENCE:\nStaff Platform Engineer at Acme Systems.');
    const saveButton = page.getByRole('button', { name: 'Save Document Edit' });
    await expect(saveButton).toBeVisible();
    await saveButton.click();
    await expect(page.getByRole('status')).toContainText('Saved document edit');
    await expect(page.getByText('Candidate Edited')).toBeVisible();
  });
});
