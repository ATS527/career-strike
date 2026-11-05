import { type PracticeAts, startPracticeAts } from '../../src/practice/test-ats.js';
import { expect, signIn, test } from './fixtures.js';

test.describe('agent activity', () => {
  let ats: PracticeAts;
  test.beforeEach(async () => {
    ats = await startPracticeAts();
  });
  test.afterEach(async () => {
    await ats.close();
  });

  test('real work is shown while it runs, can be cancelled, and schedules and backoff are visible', async ({
    page,
    cs,
  }) => {
    expect((await cs.api('POST', '/api/practice/endpoint', { origin: ats.origin })).status).toBe(200);
    await signIn(page, cs);
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Activity' }).click();
    await expect(page.getByText('Nothing is running.')).toBeVisible();
    await expect(page.getByTestId('schedules')).toContainText('off — turn on in Settings');

    // A slow fetch is visibly running and can be cancelled.
    ats.setFault('slow', 4000);
    await page.goto(`${cs.origin}/opportunities/sources`);
    await page.getByLabel('Careers page link').fill(`${ats.origin}/boards/demo`);
    await page.getByRole('button', { name: 'Monitor this board' }).click();
    await page.goto(`${cs.origin}/activity`);
    const runningList = page.getByTestId('running');
    await expect(runningList).toContainText('Fetch Practice board board “demo”');
    await expect(runningList).toContainText('board added');
    await runningList.getByRole('button', { name: /^Cancel/ }).click();
    await expect(page.getByText('Nothing is running.')).toBeVisible();
    await expect(page.getByTestId('recent').getByRole('row').nth(1)).toContainText('Cancelled');

    // Fetched for real, the result is recorded truthfully.
    ats.setFault('none');
    await page.goto(`${cs.origin}/opportunities/sources`);
    await page.locator('[data-board="demo"]').getByRole('button', { name: 'Fetch now' }).click();
    await expect(page.locator('[data-board="demo"]')).toContainText('Done: 2 postings found, 2 new');
    await page.goto(`${cs.origin}/activity`);
    await expect(page.getByTestId('recent').getByRole('row').nth(1)).toContainText('2 postings, 2 new, 0 closed');

    // Scheduled monitoring is off until turned on, then its next run is shown.
    await page.goto(`${cs.origin}/settings#monitoring.discoveryIntervalHours`);
    await page.getByRole('radio', { name: 'Every 6 hours' }).check();
    await page
      .locator('[data-setting="monitoring.discoveryIntervalHours"]')
      .getByRole('button', { name: 'Save' })
      .click();
    await expect(page.locator('[data-setting="monitoring.discoveryIntervalHours"]').getByRole('status')).toHaveText(
      'Saved',
    );
    await page.goto(`${cs.origin}/activity`);
    await expect(page.getByTestId('schedules')).toContainText('Check monitored job boards: every 6 hours · next');

    // A failing board backs off, and the reason is shown.
    ats.setFault('server-error');
    await page.goto(`${cs.origin}/opportunities/sources`);
    await page.locator('[data-board="demo"]').getByRole('button', { name: 'Fetch now' }).click();
    await expect(page.locator('[data-board="demo"]')).toContainText('Fetch failed');
    await page.goto(`${cs.origin}/activity`);
    await expect(page.getByTestId('schedules')).toContainText(
      'Board “demo” failed 1 time; scheduled checks wait until',
    );
    await expect(page.getByTestId('schedules')).toContainText('returned HTTP 503');
  });
});
