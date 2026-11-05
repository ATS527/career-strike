import { expect, signIn, test } from './fixtures.js';

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from('synthetic resume')]);

test('submit on the employer’s site with copied answers, confirm it, record an interview and follow up', async ({
  page,
  context,
  cs,
}) => {
  // The employer's site is stubbed: no request leaves the test machine.
  await context.route('https://jobs.lever.co/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Employer form (stub)</title>' }),
  );
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: cs.origin });

  cs.seed('lever', 'track', [{ title: 'Site Reliability Engineer', applyUrl: 'https://jobs.lever.co/track/0/apply' }]);
  await cs.api('PUT', '/api/settings/identity.fullName', { value: 'Jordan Example' });
  await cs.api('PUT', '/api/settings/identity.email', { value: 'jordan@example.com' });
  await fetch(`${cs.origin}/api/documents`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${cs.token}`,
      'content-type': 'application/pdf',
      'x-cs-filename': 'cv.pdf',
      'x-cs-document-kind': 'resume',
    },
    body: PDF,
  });
  const { jobs } = (await cs.api('GET', '/api/jobs')).body as { jobs: { id: string }[] };
  const created = (await cs.api('POST', '/api/applications', { jobId: jobs[0]!.id })).body as {
    application: { id: string };
  };
  const appId = created.application.id;
  await cs.api('POST', `/api/applications/${appId}/ready`);

  await signIn(page, cs);
  await expect(page.getByTestId('next-actions')).toContainText('Review 1 prepared application');
  await page.goto(`${cs.origin}/applications/${appId}`);
  await page.getByRole('button', { name: 'Approve this exact application' }).click();
  await expect(page.getByText('Approval is valid')).toBeVisible();

  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Start submitting on the employer’s site' }).click();
  await expect(await (await popup).title()).toBe('Employer form (stub)');
  await expect(page.getByText('Submit on the employer’s site', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Copy Email' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('jordan@example.com');

  await page.getByLabel('Confirmation number or reference (optional)').fill('LV-7781');
  await page.getByRole('button', { name: 'Yes, I submitted it' }).click();
  await expect(page.getByText('Submitted', { exact: true })).toBeVisible();

  await page.getByLabel('What happened?').selectOption('INTERVIEW');
  await page.getByLabel('Details (optional)').fill('Phone screen with the hiring manager');
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.getByText('Interviewing', { exact: true })).toBeVisible();

  await page.getByLabel('Remind me to').fill('Send a thank-you note');
  await page.getByLabel('Due date').fill(new Date().toISOString().slice(0, 10));
  await page.getByRole('button', { name: 'Add reminder' }).click();
  await expect(page.getByTestId('follow-ups')).toContainText('Send a thank-you note');

  await page.locator('.history summary').click();
  await expect(page.locator('.history')).toContainText('ref LV-7781');

  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Home' }).click();
  await expect(page.getByTestId('application-counts').getByRole('link', { name: /^1 interviewing/ })).toBeVisible();
  await expect(page.getByTestId('next-actions')).toContainText('Follow up: Send a thank-you note');

  await cs.restart();
  await page.reload();
  await expect(page.getByTestId('application-counts').getByRole('link', { name: /^1 interviewing/ })).toBeVisible();
});

test('a submission the candidate is unsure about is never counted as submitted', async ({ page, context, cs }) => {
  await context.route('https://jobs.lever.co/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<title>stub</title>' }),
  );
  cs.seed('lever', 'unsure', [{ title: 'Data Analyst', applyUrl: 'https://jobs.lever.co/unsure/0/apply' }]);
  await cs.api('PUT', '/api/settings/identity.fullName', { value: 'Jordan Example' });
  await cs.api('PUT', '/api/settings/identity.email', { value: 'jordan@example.com' });
  await fetch(`${cs.origin}/api/documents`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${cs.token}`,
      'content-type': 'application/pdf',
      'x-cs-filename': 'cv.pdf',
      'x-cs-document-kind': 'resume',
    },
    body: PDF,
  });
  const { jobs } = (await cs.api('GET', '/api/jobs')).body as { jobs: { id: string }[] };
  const appId = (
    (await cs.api('POST', '/api/applications', { jobId: jobs[0]!.id })).body as { application: { id: string } }
  ).application.id;
  await cs.api('POST', `/api/applications/${appId}/ready`);
  await signIn(page, cs);
  await page.goto(`${cs.origin}/applications/${appId}`);
  await page.getByRole('button', { name: 'Approve this exact application' }).click();
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Start submitting on the employer’s site' }).click();
  await (await popup).close();
  await page.getByRole('button', { name: 'I’m not sure it went through' }).click();
  await expect(page.getByText('Submission not confirmed', { exact: true })).toBeVisible();
  await expect(page.getByLabel('What happened?')).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Home' }).click();
  await expect(page.getByTestId('application-counts').getByRole('link', { name: /^0 submitted/ })).toBeVisible();
  await expect(page.getByTestId('next-actions')).toContainText('Confirm whether 1 application was sent');
});
