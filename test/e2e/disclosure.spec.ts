import AxeBuilder from '@axe-core/playwright';
import { expect, signIn, test } from './fixtures.js';

test('an assistant sees only what the candidate previewed and approved, once', async ({ page, cs }) => {
  await cs.api('POST', '/api/profile/facts', { kind: 'skill', value: { name: 'TypeScript', years: 5 } });
  await cs.api('PUT', '/api/settings/candidate.salaryExpectation', {
    value: { currency: 'EUR', minimum: 123456, interval: 'year' },
  });
  const created = (await cs.api('POST', '/api/mcp-clients', { name: 'claude-code' })).body as { token: string };
  const asAi = (method: string, url: string, body?: unknown) =>
    fetch(`${cs.origin}${url}`, {
      method,
      headers: { authorization: `Bearer ${created.token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  const asked = (await (
    await asAi('POST', '/api/mcp/disclosures', {
      purpose: 'Tailor a cover letter to your strengths',
      fields: ['profile.skills', 'preferences.salary'],
    })
  ).json()) as {
    requestId: string;
  };

  await signIn(page, cs);
  await page.getByRole('link', { name: 'Claude Code asks to see some of your information' }).click();
  const requests = page.getByTestId('pending-requests');
  await expect(requests).toContainText('Tailor a cover letter to your strengths');
  await requests.getByRole('button', { name: 'Review what would be shared with Claude Code' }).click();

  const preview = page.getByRole('group', { name: 'Exactly what Claude Code would receive' });
  await expect(preview.locator('[data-field="profile.skills"]')).toHaveText('TypeScript · 5');
  await expect(preview.locator('[data-field="preferences.salary"]')).toContainText('123456');
  const axe = await new AxeBuilder({ page })
    .include('#ai-requests')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);

  // The candidate shares less than was asked for.
  await preview.getByLabel('Share your salary expectation').uncheck();
  await preview.getByRole('button', { name: 'Share once with Claude Code' }).click();
  await expect(page.locator('#ai-requests').getByRole('status')).toHaveText(
    'Approved. Claude Code can collect this once, within an hour.',
  );

  const first = await asAi('GET', `/api/mcp/disclosures/${asked.requestId}`);
  expect(first.status).toBe(200);
  const body = await first.text();
  expect(body).toContain('TypeScript');
  expect(body).not.toContain('123456');
  expect((await asAi('GET', `/api/mcp/disclosures/${asked.requestId}`)).status).toBe(410);

  await page.reload();
  await expect(page.getByTestId('disclosure-history')).toContainText(
    'Claude Code · Shared once · Your approved skills, with years and level',
  );
  await expect(page.getByTestId('disclosure-history')).toContainText('for “Tailor a cover letter to your strengths”');
  await expect(page.getByText('No requests waiting.')).toBeVisible();
});
