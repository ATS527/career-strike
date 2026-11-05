import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { McpClientStore } from '../../src/mcp/clients.js';
import { openDb } from '../../src/store/db.js';
import { expect, signIn, test } from './fixtures.js';

const VERSION = (JSON.parse(fs.readFileSync('package.json', 'utf8')) as { version: string }).version;

function writeUpdateState(home: string, file: 'check.json' | 'history.json', value: unknown): void {
  fs.mkdirSync(path.join(home, 'updates'), { recursive: true });
  fs.writeFileSync(path.join(home, 'updates', file), JSON.stringify(value));
}

test('Settings shows the installed version, and an honest result when a check fails', async ({ page, cs }) => {
  await signIn(page, cs);
  await page.goto(`${cs.origin}/settings#updates`);
  const panel = page.locator('#updates');
  await expect(panel.getByRole('heading', { name: 'Updates' })).toBeVisible();
  await expect(panel.getByTestId('installed-version')).toHaveText(VERSION);
  await expect(panel).toContainText('It does not look for new versions on its own.');
  await expect(panel.getByTestId('update-check-status')).toHaveText('Not checked yet.');
  // Nothing is announced when nothing is known.
  await expect(page.getByTestId('update-banner')).toHaveCount(0);
  await expect(page.getByTestId('whats-new-banner')).toHaveCount(0);

  await panel.getByRole('button', { name: 'Check now' }).click();
  await expect(panel.getByTestId('update-check-status')).toContainText(
    'The last check failed: Could not reach 127.0.0.1',
  );
  await expect(page.getByTestId('update-banner')).toHaveCount(0);
});

test('a newer release is announced with how to install it, and "what’s new" shows once after updating', async ({
  page,
  cs,
}) => {
  writeUpdateState(cs.home, 'check.json', {
    checkedAt: new Date().toISOString(),
    latest: {
      version: '99.0.0',
      name: 'Career Strike 99.0.0',
      url: 'https://github.com/owner/career-strike/releases/tag/v99.0.0',
      notes: '- A synthetic future feature',
      publishedAt: '2026-11-01T00:00:00Z',
    },
    error: null,
  });
  writeUpdateState(cs.home, 'history.json', {
    last: {
      from: '0.1.0',
      to: VERSION,
      at: new Date().toISOString(),
      previousPackage: null,
      backupDir: null,
      schemaBefore: 1,
    },
    acknowledged: null,
  });
  await signIn(page, cs);

  // Right after an update, what changed comes first.
  const whatsNew = page.getByTestId('whats-new-banner');
  await expect(whatsNew).toContainText(`Career Strike is now ${VERSION} (was 0.1.0)`);
  await whatsNew.getByRole('link', { name: 'See what’s new' }).click();
  await expect(page.getByRole('heading', { name: `What’s new in ${VERSION}` })).toBeVisible();
  await expect(page.locator('#updates')).toContainText('career-strike update --undo');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual(
    [],
  );

  await whatsNew.getByRole('button', { name: 'Dismiss' }).click();
  await expect(whatsNew).toHaveCount(0);

  // Then the newer release, with the command to run.
  const banner = page.getByTestId('update-banner');
  await expect(banner).toContainText('Career Strike 99.0.0 is available.');
  await expect(banner).toContainText('career-strike update');
  const available = page.getByTestId('update-available');
  await expect(available).toContainText('A synthetic future feature');
  await expect(available.getByRole('link', { name: /Full release notes on GitHub/ })).toHaveAttribute(
    'href',
    'https://github.com/owner/career-strike/releases/tag/v99.0.0',
  );

  // Dismissal is remembered across reloads.
  await page.reload();
  await expect(page.getByTestId('update-banner')).toBeVisible();
  await expect(page.getByTestId('whats-new-banner')).toHaveCount(0);
});

test('AI assistants cannot read or trigger update checks', async ({ cs }) => {
  const db = openDb(path.join(cs.home, 'career-strike.db'));
  const { token } = new McpClientStore(db).create('e2e-assistant', 'test');
  db.close();
  for (const [method, url] of [
    ['GET', '/api/updates'],
    ['POST', '/api/updates/check'],
    ['POST', '/api/updates/acknowledge'],
  ] as const) {
    const res = await fetch(`${cs.origin}${url}`, { method, headers: { authorization: `Bearer ${token}` } });
    expect(res.status, `${method} ${url}`).toBe(403);
  }
  // The local administrator (the CLI) may.
  const status = await cs.api('GET', '/api/updates');
  expect(status.status).toBe(200);
  expect(status.body).toMatchObject({ current: VERSION, checks: 'off' });
});
