import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, signIn, test } from './fixtures.js';

async function seriousViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

for (const scheme of ['light', 'dark'] as const) {
  test(`no serious or critical axe violations (${scheme})`, async ({ page, cs }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(`${cs.origin}/`);
    await expect(page.getByRole('heading', { name: 'Open the dashboard from your terminal' })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    await signIn(page, cs);
    expect(await seriousViolations(page)).toEqual([]);

    await page.goto(`${cs.origin}/settings`);
    await expect(page.locator('[data-setting]').first()).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    cs.seed('lever', 'a11y', [{ title: 'Accessible Role' }, { title: 'Second Role', remotePolicy: 'unknown' }]);
    const ids = ((await cs.api('GET', '/api/jobs')).body as { jobs: { id: string }[] }).jobs.map((j) => j.id);
    await cs.api('POST', '/api/profile/facts', { kind: 'skill', value: { name: 'TypeScript' } });
    const created = (await cs.api('POST', '/api/applications', { jobId: ids[0] })).body as { application: { id: string } };
    for (const route of ['/applications', `/applications/${created.application.id}`, `/applications/${created.application.id}/prep`, '/opportunities', `/jobs/${ids[0]}`, `/opportunities/compare?ids=${ids.join(',')}`, '/opportunities/sources', '/opportunities/new', '/profile']) {
      await page.goto(`${cs.origin}${route}`);
      await expect(page.locator('main h1')).toBeVisible();
      expect(await seriousViolations(page), route).toEqual([]);
    }
  });
}

test('the main journey works with the keyboard alone', async ({ page, cs }) => {
  await signIn(page, cs);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();

  // Reach Settings through the primary navigation.
  const settingsLink = page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Settings' });
  await settingsLink.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Your search, your rules' })).toBeVisible();

  // Change a radio group with arrow keys and save with Enter.
  await page.getByRole('radio', { name: 'Remote only' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Remote or hybrid' })).toBeChecked();
  const field = page.locator('[data-setting="search.remotePreference"]');
  await page.keyboard.press('Tab');
  await expect(field.getByRole('button', { name: 'Save' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(field.getByRole('status')).toHaveText('Saved');
  expect((await cs.settings())['search.remotePreference']).toBe('hybrid_ok');
});

for (const width of [375, 768, 1280]) {
  test(`layout fits a ${width}px viewport with actions reachable`, async ({ page, cs }) => {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page, cs);
    cs.seed('greenhouse', 'layout', [{ title: 'A Rather Long Synthetic Job Title For Layout Testing Purposes' }, { title: 'Short' }]);
    const ids = ((await cs.api('GET', '/api/jobs')).body as { jobs: { id: string }[] }).jobs.map((j) => j.id);
    await cs.api('POST', '/api/profile/facts', { kind: 'role', value: { title: 'Synthetic Engineer', startYear: 2019 } });
    for (const route of ['/', '/settings', '/opportunities', `/jobs/${ids[0]}`, '/opportunities/sources', '/opportunities/new', '/profile']) {
      await page.goto(`${cs.origin}${route}`);
      await expect(page.locator('main h1')).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${route} overflows horizontally`).toBeLessThanOrEqual(0);
      await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Settings' })).toBeInViewport();
    }
    await page.goto(`${cs.origin}/settings`);
    const save = page.locator('[data-setting="search.excludedEmployers"]').getByRole('button', { name: 'Save' });
    await save.scrollIntoViewIfNeeded();
    await expect(save).toBeInViewport();
    const box = await save.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
}
