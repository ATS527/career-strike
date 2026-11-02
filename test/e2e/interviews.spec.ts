import { expect, signIn, test } from './fixtures.js';

test('schedule an interview for a submitted application and practise what the posting asks for', async ({ page, context, cs }) => {
  await context.route('https://jobs.lever.co/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>stub</title>' }));
  cs.seed('lever', 'iv', [
    {
      title: 'Senior Platform Engineer',
      applyUrl: 'https://jobs.lever.co/iv/0/apply',
      description: [
        { type: 'heading', text: 'Requirements' },
        { type: 'item', text: 'Rust services in production' },
        { type: 'item', text: 'TypeScript tooling' },
      ],
    },
  ]);
  await cs.api('PUT', '/api/settings/identity.fullName', { value: 'Jordan Example' });
  await cs.api('PUT', '/api/settings/identity.email', { value: 'jordan@example.com' });
  await cs.api('POST', '/api/profile/facts', { kind: 'skill', value: { name: 'TypeScript' } });
  await fetch(`${cs.origin}/api/documents`, {
    method: 'POST',
    headers: { authorization: `Bearer ${cs.token}`, 'content-type': 'application/pdf', 'x-cs-filename': 'cv.pdf', 'x-cs-document-kind': 'resume' },
    body: Buffer.from('%PDF-1.7 x'),
  });
  const { jobs } = (await cs.api('GET', '/api/jobs')).body as { jobs: { id: string }[] };
  const appId = ((await cs.api('POST', '/api/applications', { jobId: jobs[0]!.id })).body as { application: { id: string } }).application.id;
  await cs.api('POST', `/api/applications/${appId}/ready`);

  await signIn(page, cs);
  await page.goto(`${cs.origin}/applications/${appId}`);
  await expect(page.getByText('Interviews can be added once the application has been submitted.')).toBeVisible();
  await page.getByRole('button', { name: 'Approve this exact application' }).click();
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Start submitting on the employer’s site' }).click();
  await (await popup).close();
  await page.getByRole('button', { name: 'Yes, I submitted it' }).click();
  await expect(page.getByText('Submitted', { exact: true })).toBeVisible();

  await page.getByLabel('Stage').fill('Technical interview');
  await page.getByLabel('Format').selectOption('video');
  const soon = new Date(Date.now() + 3 * 864e5);
  const local = new Date(soon.getTime() - soon.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  await page.getByLabel('Date and time').fill(local);
  await page.getByRole('button', { name: 'Add interview' }).click();
  await expect(page.getByText('Interviewing', { exact: true })).toBeVisible();
  await expect(page.getByTestId('interviews')).toContainText('Technical interview');
  await expect(page.getByRole('button', { name: '📅 .ics' })).toBeVisible();

  // Check Follow-Up Studio
  await expect(page.getByRole('heading', { level: 3, name: '✉️ Professional Follow-Up Studio' })).toBeVisible();
  await page.getByRole('tab', { name: 'Thank You' }).click();
  await expect(page.locator('.outreach-preview-box')).toContainText('Thank you');

  await page.getByRole('link', { name: 'Prepare for interviews' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Get ready for Synthetic Labs' })).toBeVisible();
  await expect(page.getByRole('button', { name: '📅 Add to Calendar (.ics)' })).toBeVisible();

  // Open 1-Page Interview Brief
  await page.getByRole('button', { name: '📋 1-Page Interview Brief' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('STAR Response Quick Guide');
  await page.getByRole('button', { name: 'Close brief' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();

  const rust = page.locator('[data-topic="skill-rust"]');
  await expect(rust).toContainText('Gap: not in your profile');
  await expect(rust).toContainText('Posting: “Rust services in production”');

  // Verify STAR story assistant
  await rust.getByRole('button', { name: /Use STAR Story Framework/ }).click();
  await rust.getByRole('button', { name: '✍️ Insert STAR Outline into Notes' }).click();
  await expect(rust.getByLabel('Notes (optional)')).toHaveValue(/S: \[Situation/);

  await expect(page.locator('[data-topic="behavioral"]')).toBeVisible();
  await expect(page.getByText('Suggested by Career Strike for this kind of role — not stated in the posting.')).toBeVisible();
  await rust.getByLabel('How ready do you feel?').selectOption('2');
  await rust.getByLabel('Notes (optional)').fill('Ownership and borrowing');
  await rust.getByRole('button', { name: 'Log practice for Rust' }).click();
  await expect(rust).toContainText('1 session · last: Shaky');
  await expect(page.getByTestId('practice-history')).toContainText('Ownership and borrowing');

  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Home' }).click();
  await expect(page.getByTestId('upcoming-interviews')).toContainText('Technical interview');
  await expect(page.getByTestId('next-actions')).toContainText('Prepare for your Technical interview with Synthetic Labs');
});
