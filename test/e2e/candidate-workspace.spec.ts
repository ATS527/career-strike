import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, signIn, test } from './fixtures.js';

async function seriousViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

test.describe('Candidate Workspace & Global Career Explorer', () => {
  test('profile hero, professional overview, and links saving', async ({ page, cs }) => {
    await signIn(page, cs);
    await page.goto(`${cs.origin}/profile`);

    // Verify page heading and workspace layout
    await expect(page.getByRole('heading', { level: 1, name: 'Your career profile' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Professional overview' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Professional links' })).toBeVisible();

    // Fill overview fields
    await page.getByLabel('Full name').fill('Jane Doe');
    await page.getByLabel('Professional headline').fill('Staff Systems Architect · Cloud & Distributed Systems');
    await page.getByLabel('About you').fill('Passionate engineer with experience building resilient systems and leading platforms.');

    // Save profile draft
    await page.getByRole('button', { name: /Save (draft|profile)/i }).click();
    await expect(page.getByTestId('profile-save-status')).toContainText('All profile changes saved.');

    // Avatar initials should now show "JD"
    await expect(page.locator('.workspace-avatar')).toHaveText('JD');
    await expect(page.locator('.workspace-hero h3')).toHaveText('Jane Doe');

    // Test LinkedIn verification
    await page.getByLabel('LinkedIn profile address').fill('https://www.linkedin.com/in/janedoe');
    await page.getByRole('button', { name: 'Verify URL' }).click();
    await expect(page.getByTestId('profile-save-status')).toContainText('Valid HTTPS LinkedIn profile URL');
    await expect(page.getByRole('link', { name: /Open profile/i })).toBeVisible();

    // Test GitHub and Portfolio fields
    await page.getByLabel('GitHub profile').fill('https://github.com/janedoe');
    await page.getByLabel('Portfolio or personal website').fill('https://janedoe.dev');
    await page.getByRole('button', { name: /Save (draft|profile)/i }).click();
    await expect(page.getByTestId('profile-save-status')).toContainText('All profile changes saved.');

    // Reload page to verify backend persistence
    await page.reload();
    await expect(page.getByLabel('Full name')).toHaveValue('Jane Doe');
    await expect(page.getByLabel('Professional headline')).toHaveValue('Staff Systems Architect · Cloud & Distributed Systems');
    await expect(page.getByLabel('GitHub profile')).toHaveValue('https://github.com/janedoe');
    await expect(page.getByLabel('Portfolio or personal website')).toHaveValue('https://janedoe.dev');
  });

  test('markets explorer filtering and target selection persistence', async ({ page, cs }) => {
    await signIn(page, cs);
    await page.goto(`${cs.origin}/markets`);

    await expect(page.getByRole('heading', { level: 1, name: 'Where should you look next?' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Discover international tech markets' })).toBeVisible();

    // 16 curated markets loaded
    const rows = page.locator('.market-table tbody tr');
    await expect(rows).toHaveCount(16);

    // Filter by search keyword
    const searchInput = page.getByRole('searchbox', { name: 'Search countries or cities' });
    await searchInput.fill('Tokyo');
    await expect(rows).toHaveCount(1);
    await expect(page.locator('.market-table tbody tr', { hasText: 'Japan' })).toBeVisible();

    // Clear search and filter by region
    await searchInput.fill('');
    await page.getByRole('combobox', { name: 'Filter by region' }).selectOption('Asia');
    await expect(rows).toHaveCount(4); // JP, SG, TH, MY

    // Toggle English pathways only
    await page.getByLabel('More English-friendly pathways').check();
    await expect(rows).toHaveCount(2); // SG, MY

    // Reset filters
    await page.getByRole('button', { name: 'Reset filters' }).click();
    await expect(rows).toHaveCount(16);

    // Target Germany and Ireland
    const deRow = page.locator('.market-table tbody tr', { hasText: 'Germany' });
    await deRow.getByRole('button', { name: '+ Target' }).click();
    await expect(deRow.getByRole('button', { name: '✓ Selected' })).toBeVisible();

    const ieRow = page.locator('.market-table tbody tr', { hasText: 'Ireland' });
    await ieRow.getByRole('button', { name: '+ Target' }).click();
    await expect(ieRow.getByRole('button', { name: '✓ Selected' })).toBeVisible();

    // Navigate to profile and verify target badges in the sidebar
    await page.getByRole('link', { name: /Back to profile/i }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Your career profile' })).toBeVisible();

    const prefSection = page.locator('section[aria-labelledby="preferences-card-heading"]');
    await expect(prefSection.getByText(/Germany/i)).toBeVisible();
    await expect(prefSection.getByText(/Ireland/i)).toBeVisible();
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`accessibility audit on /profile and /markets (${scheme})`, async ({ page, cs }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await signIn(page, cs);

      await page.goto(`${cs.origin}/profile`);
      await expect(page.locator('main h1')).toBeVisible();
      expect(await seriousViolations(page), `/profile ${scheme}`).toEqual([]);

      await page.goto(`${cs.origin}/markets`);
      await expect(page.locator('main h1')).toBeVisible();
      expect(await seriousViolations(page), `/markets ${scheme}`).toEqual([]);
    });
  }

  for (const width of [375, 768, 1280]) {
    test(`responsive layout without horizontal overflow at ${width}px`, async ({ page, cs }) => {
      await page.setViewportSize({ width, height: 900 });
      await signIn(page, cs);

      for (const route of ['/profile', '/markets']) {
        await page.goto(`${cs.origin}${route}`);
        await expect(page.locator('main h1')).toBeVisible();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${route} overflows at ${width}px`).toBeLessThanOrEqual(0);
      }
    });
  }
});
