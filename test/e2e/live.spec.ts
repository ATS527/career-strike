import { expect, signIn, test } from './fixtures.js';

// Live journeys against real public job boards. They run only with CS_LIVE=1, and a skipped run
// never counts as evidence.
test.describe('live job boards', () => {
  test('adding a real public board fetches genuine postings (live)', async ({ page, cs }) => {
    test.skip(!process.env.CS_LIVE, 'Live network test: run with CS_LIVE=1');
    test.setTimeout(90_000);
    await signIn(page, cs);
    await page.goto(`${cs.origin}/opportunities/sources`);
    await page.getByLabel('Careers page link').fill('https://jobs.lever.co/spotify');
    await page.getByRole('button', { name: 'Monitor this board' }).click();
    const board = page.locator('[data-board="spotify"]');
    await expect(board.getByRole('status')).toContainText(/Done: \d+ postings found/, { timeout: 60_000 });
    await expect(board).toContainText('Working');
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Opportunities' }).click();
    await expect(page.getByTestId('job-list').getByRole('listitem').first()).toContainText('Open · verified');
    const job = page.getByTestId('job-list').getByRole('listitem').first();
    await job.getByRole('link').first().click();
    await expect(page.getByRole('link', { name: /Open the official posting/ })).toHaveAttribute('href', /^https:\/\/jobs\.lever\.co\/spotify\//);
  });
});
