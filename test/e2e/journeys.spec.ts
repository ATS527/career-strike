import { type PracticeAts, startPracticeAts } from '../../src/practice/test-ats.js';
import { expect, signIn, test } from './fixtures.js';

// First launch and onboarding, done the way a new user would: only through the dashboard, following
// the setup actions Home offers until it has nothing left to ask. Every other required journey is
// listed with its test in acceptance/journeys.json.

test.describe('first launch and onboarding', () => {
  let ats: PracticeAts;
  test.beforeEach(async () => {
    ats = await startPracticeAts();
  });
  test.afterEach(async () => {
    await ats.close();
  });

  test('a new user is guided from an empty install to reviewing real postings', async ({ page, cs }) => {
    expect((await cs.api('POST', '/api/practice/endpoint', { origin: ats.origin })).status).toBe(200);
    await page.goto(`${cs.origin}/`);
    await expect(page.getByRole('heading', { name: 'Open the dashboard from your terminal' })).toBeVisible();
    await signIn(page, cs);

    const actions = page.getByRole('main');
    const setup = [
      'Add your skills and past roles',
      'Add the roles you are targeting',
      'Set your joining availability',
      'Tell Career Strike where you can work',
      'Add a job board to monitor, or add a job by hand',
    ];
    for (const title of setup) await expect(actions.getByRole('link', { name: title })).toBeVisible();

    await actions.getByRole('link', { name: 'Add your skills and past roles' }).click();
    const skills = page.locator('[data-fact-kind="skill"]');
    await skills.getByLabel('Skill', { exact: true }).fill('TypeScript');
    await skills.getByRole('button', { name: 'Add' }).click();
    await expect(skills.getByRole('listitem')).toHaveText([/TypeScript/]);

    const saveSetting = async (key: string): Promise<void> => {
      const field = page.locator(`[data-setting="${key}"]`);
      await field.getByRole('button', { name: 'Save' }).click();
      await expect(field.getByRole('status')).toHaveText('Saved');
    };
    await page.getByRole('link', { name: 'Home' }).click();
    await actions.getByRole('link', { name: 'Add the roles you are targeting' }).click();
    await page.getByLabel('Preferred roles').fill('Platform Engineer');
    await saveSetting('search.preferredRoles');
    await page.getByRole('link', { name: 'Home' }).click();
    await actions.getByRole('link', { name: 'Set your joining availability' }).click();
    await page.getByRole('radio', { name: 'Immediately' }).check();
    await saveSetting('candidate.joiningAvailability');
    await page.getByRole('link', { name: 'Home' }).click();
    await actions.getByRole('link', { name: 'Tell Career Strike where you can work' }).click();
    await page.getByLabel('Countries you can work in').fill('DE');
    await saveSetting('search.eligibleCountries');

    await page.getByRole('link', { name: 'Home' }).click();
    await actions.getByRole('link', { name: 'Add a job board to monitor, or add a job by hand' }).click();
    await page.getByLabel('Careers page link').fill(`${ats.origin}/boards/demo`);
    await page.getByRole('button', { name: 'Monitor this board' }).click();
    await expect(page.locator('[data-board="demo"]')).toContainText('Done: 2 postings found, 2 new');

    // Setup is complete: Home now points at the real postings that were just fetched.
    await page.getByRole('link', { name: 'Home' }).click();
    for (const title of setup) await expect(actions.getByRole('link', { name: title })).toHaveCount(0);
    await actions.getByRole('link', { name: 'Review 2 verified open roles' }).click();
    await expect(page).toHaveURL(/\/opportunities\?disposition=none&status=OPEN/);
    await expect(page.getByTestId('job-list').getByRole('listitem')).toHaveCount(2);
  });
});
