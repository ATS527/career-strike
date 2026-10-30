import { expect, signIn, test } from './fixtures.js';

test('assistants appear when they connect, and private access follows the candidate’s grants', async ({ page, cs }) => {
  cs.seed('lever', 'ai', [{ title: 'Platform Engineer' }]);
  await cs.api('POST', '/api/profile/facts', { kind: 'skill', value: { name: 'TypeScript' } });
  const created = (await cs.api('POST', '/api/mcp-clients', { name: 'claude-code' })).body as { token: string };
  const asAi = (url: string) => fetch(`${cs.origin}${url}`, { headers: { authorization: `Bearer ${created.token}` } });
  const jobId = (((await (await asAi('/api/mcp/jobs')).json()) as { jobs: { id: string }[] }).jobs[0]!).id;
  expect((await asAi(`/api/mcp/jobs/${jobId}/fit`)).status).toBe(403);

  await signIn(page, cs);
  await expect(page.getByText('Active in the last 15 minutes: Claude Code')).toBeVisible();

  await page.goto(`${cs.origin}/settings#ai-assistants`);
  const card = page.locator('[data-client="claude-code"]');
  await expect(card).toContainText('Claude Code');
  const fitGrant = card.getByLabel(/Allow it to see how jobs fit your profile/);
  await fitGrant.check();
  await expect(page.getByText('Claude Code: allowed to see how jobs fit your profile')).toBeVisible();
  expect((await asAi(`/api/mcp/jobs/${jobId}/fit`)).status).toBe(200);

  await fitGrant.uncheck();
  await expect(page.getByText('Claude Code: no longer allowed')).toBeVisible();
  expect((await asAi(`/api/mcp/jobs/${jobId}/fit`)).status).toBe(403);

  page.once('dialog', (d) => void d.accept());
  await card.getByRole('button', { name: 'Disconnect Claude Code' }).click();
  await expect(page.getByText('career-strike disconnect claude-code')).toBeVisible();
  expect((await asAi('/api/mcp/jobs')).status).toBe(401);
});
