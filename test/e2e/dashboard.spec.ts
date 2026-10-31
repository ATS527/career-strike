import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CsService, expect, signIn, test } from './fixtures.js';

test.describe('launch and sessions', () => {
  test('without a session the dashboard explains how to open it and shows no data', async ({ page, cs }) => {
    await page.goto(`${cs.origin}/`);
    await expect(page.getByRole('heading', { name: 'Open the dashboard from your terminal' })).toBeVisible();
    await expect(page.getByText('career-strike dashboard')).toBeVisible();
    await expect(page.getByText('Next best actions')).toHaveCount(0);
  });

  test('career-strike dashboard starts a stopped service and its link signs the browser in', async ({ page }) => {
    const home = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cs-e2e-')), 'data');
    const cs = new CsService(home);
    expect(cs.cli('status').status).toBe(3);
    const dash = cs.cli('dashboard', '--no-open', '--port', '0');
    try {
      expect(dash.status, dash.stderr).toBe(0);
      const link = new URL(dash.stdout.trim());
      await page.goto(link.href);
      await expect(page).toHaveURL(`${link.origin}/`);
      await expect(page.getByRole('heading', { name: 'Where things stand' })).toBeVisible();
      await expect(page.getByText('None connected. Career Strike works fully without them.')).toBeVisible();

      // The link is single-use.
      await page.context().clearCookies();
      await page.goto(link.href);
      await expect(page.getByRole('heading', { name: 'This dashboard link has expired' })).toBeVisible();
    } finally {
      expect(cs.cli('stop').stdout.trim()).toBe('stopped');
    }
  });

  test('signing out ends the session', async ({ page, cs }) => {
    await signIn(page, cs);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: 'Open the dashboard from your terminal' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Open the dashboard from your terminal' })).toBeVisible();
  });
});

test.describe('home', () => {
  test('next best actions come from stored state and explain their rule', async ({ page, cs }) => {
    await signIn(page, cs);
    const actions = page.getByTestId('next-actions').getByRole('listitem');
    // A fresh install: four profile gaps and no source of opportunities yet.
    await expect(actions).toHaveCount(5);
    await expect(page.getByTestId('next-actions')).toContainText('profile.preferred-roles-missing');
    await expect(actions.last()).toContainText('jobs.no-sources');

    await actions.getByRole('link', { name: 'Add the roles you are targeting' }).click();
    await expect(page).toHaveURL(`${cs.origin}/settings#search.preferredRoles`);
    const roles = page.getByLabel('Preferred roles');
    await expect(roles).toBeFocused();
    await roles.fill('Synthetic Platform Engineer\nSynthetic SRE');
    const field = page.locator('[data-setting="search.preferredRoles"]');
    await field.getByRole('button', { name: 'Save' }).click();
    await expect(field.getByRole('status')).toHaveText('Saved');

    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Home' }).click();
    await expect(actions).toHaveCount(4);
    await expect(page.getByText('profile.preferred-roles-missing')).toHaveCount(0);
  });

  test('shows an honest empty state when nothing needs attention', async ({ page, cs }) => {
    cs.seed('greenhouse', 'done', [{ title: 'Already Reviewed' }]);
    const { jobs } = (await cs.api('GET', '/api/jobs')).body as { jobs: { id: string }[] };
    expect((await cs.api('PUT', `/api/jobs/${jobs[0]!.id}/disposition`, { disposition: 'shortlisted' })).status).toBe(200);
    expect((await cs.api('POST', '/api/profile/facts', { kind: 'skill', value: { name: 'SQL' } })).status).toBe(201);
    for (const [key, value] of [
      ['search.preferredRoles', ['Synthetic Analyst']],
      ['candidate.joiningAvailability', 'immediate'],
      ['candidate.country', 'DE'],
    ] as const) {
      const res = await fetch(`${cs.origin}/api/settings/${key}`, {
        method: 'PUT',
        headers: { authorization: `Bearer ${cs.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      expect(res.status).toBe(200);
    }
    await signIn(page, cs);
    await expect(page.getByText('Nothing needs your attention right now.')).toBeVisible();
  });
});

test.describe('settings', () => {
  test('every declared setting has exactly one control and every control is declared', async ({ page, cs }) => {
    await signIn(page, cs);
    await page.goto(`${cs.origin}/settings`);
    const res = await fetch(`${cs.origin}/api/settings`, { headers: { authorization: `Bearer ${cs.token}` } });
    const { definitions } = (await res.json()) as { definitions: { key: string }[] };
    await expect(page.locator('[data-setting]')).toHaveCount(definitions.length);
    const rendered = await page.locator('[data-setting]').evaluateAll((els) => els.map((e) => e.getAttribute('data-setting')));
    expect(rendered.sort()).toEqual(definitions.map((d) => d.key).sort());
    // Nothing on the page is a control outside a declared setting except navigation and sign-out.
    const strayControls = await page.locator('main input, main select, main textarea').evaluateAll(
      (els) => els.filter((e) => !e.closest('[data-setting]')).length,
    );
    expect(strayControls).toBe(0);
  });

  test('all settings persist across a service restart and a fresh browser session', async ({ page, browser, cs }) => {
    await signIn(page, cs);
    await page.goto(`${cs.origin}/settings`);

    const save = async (key: string): Promise<void> => {
      const field = page.locator(`[data-setting="${key}"]`);
      await field.getByRole('button', { name: 'Save' }).click();
      await expect(field.getByRole('status')).toHaveText('Saved');
    };

    await page.getByLabel('Preferred roles').fill('Synthetic Data Engineer');
    await save('search.preferredRoles');
    await page.getByRole('radio', { name: 'Remote or hybrid' }).check();
    await save('search.remotePreference');
    await page.getByRole('checkbox', { name: 'Contract' }).check();
    await save('search.employmentTypes');
    await page.getByLabel('Country of residence').fill('in');
    await save('candidate.country');
    await page.getByLabel('Countries you can work in').fill('IN\nAE');
    await save('search.eligibleCountries');
    await page.getByRole('radio', { name: 'Immediately' }).check();
    await save('candidate.joiningAvailability');
    await page.getByLabel('Currency').fill('INR');
    await page.getByLabel('Minimum').fill('2400000');
    await page.getByLabel('Interval').selectOption('year');
    await save('candidate.salaryExpectation');
    await page.getByLabel('Excluded employers').fill('Synthetic Corp');
    await save('search.excludedEmployers');

    await cs.restart();
    const expected = {
      'search.preferredRoles': ['Synthetic Data Engineer'],
      'search.remotePreference': 'hybrid_ok',
      'search.employmentTypes': ['full_time', 'contract'],
      'candidate.country': 'IN',
      'search.eligibleCountries': ['IN', 'AE'],
      'candidate.joiningAvailability': 'immediate',
      'candidate.salaryExpectation': { currency: 'INR', minimum: 2400000, interval: 'year' },
      'search.excludedEmployers': ['Synthetic Corp'],
      'identity.fullName': null,
      'identity.email': null,
      'identity.phone': null,
      'identity.profileLinks': [],
      'monitoring.discoveryIntervalHours': '0',
    };
    expect(await cs.settings()).toEqual(expected);

    // Same browser, restarted service: the session survives and the page shows stored values.
    await page.reload();
    await expect(page.getByLabel('Country of residence')).toHaveValue('IN');
    await expect(page.getByRole('radio', { name: 'Immediately' })).toBeChecked();

    // A brand-new browser profile needs a new link and sees the same data.
    const fresh = await browser.newContext();
    const other = await fresh.newPage();
    await other.goto(await cs.launchUrl());
    await other.goto(`${cs.origin}/settings`);
    await expect(other.getByLabel('Minimum')).toHaveValue('2400000');
    await expect(other.getByRole('checkbox', { name: 'Contract' })).toBeChecked();
    await fresh.close();
  });

  test('invalid input is explained and not saved', async ({ page, cs }) => {
    await signIn(page, cs);
    await page.goto(`${cs.origin}/settings`);
    const field = page.locator('[data-setting="candidate.country"]');
    await page.getByLabel('Country of residence').fill('India');
    await field.getByRole('button', { name: 'Save' }).click();
    await expect(field.getByRole('status')).toContainText('Use a two-letter ISO country code');
    expect((await cs.settings())['candidate.country']).toBeNull();

    await field.getByRole('button', { name: 'Discard changes' }).click();
    await expect(page.getByLabel('Country of residence')).toHaveValue('');
  });

  test('data and privacy section provides export, backup status, diagnostics, and deletion with confirmation', async ({ page, cs }) => {
    await signIn(page, cs);
    await page.goto(`${cs.origin}/settings#data-privacy`);
    await expect(page.getByRole('heading', { name: 'Data & privacy' })).toBeVisible();

    // Export link
    const download = page.getByTestId('download-export');
    await expect(download).toHaveAttribute('href', '/api/data/export');

    // Backup status
    await expect(page.getByTestId('backup-status')).toBeVisible();

    // Installation diagnostics
    const diag = page.getByTestId('installation-diagnostics');
    await expect(diag).toBeVisible();
    await expect(diag.getByRole('row')).toHaveCount(7); // header + 6 checks

    // Data deletion with typed confirmation
    await page.getByTestId('start-delete-button').click();
    const confirmInput = page.getByTestId('delete-confirm-input');
    await expect(confirmInput).toBeVisible();
    const deleteButton = page.getByTestId('confirm-delete-button');
    await expect(deleteButton).toBeDisabled();

    await confirmInput.fill('wrong phrase');
    await expect(deleteButton).toBeDisabled();

    await confirmInput.fill('delete my career data');
    await expect(deleteButton).toBeEnabled();
  });
});

test.describe('outages', () => {
  test('a stopped service is reported truthfully and the page recovers on its own', async ({ page, cs }) => {
    await signIn(page, cs);
    await page.goto(`${cs.origin}/settings`);
    await expect(page.getByLabel('Preferred roles')).toBeVisible();
    await cs.stop();

    await page.getByLabel('Preferred roles').fill('Synthetic Role');
    await page.locator('[data-setting="search.preferredRoles"]').getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'The Career Strike service is not responding.' })).toBeVisible();
    await expect(page.locator('[data-setting="search.preferredRoles"]').getByRole('status')).toContainText('Could not save');

    await cs.resume();
    await expect(page.getByText('The Career Strike service is not responding.')).toHaveCount(0, { timeout: 10_000 });
    // After reconnecting the page reloads stored data; the unsaved edit was not silently applied.
    expect((await cs.settings())['search.preferredRoles']).toEqual([]);
    await expect(page.getByLabel('Preferred roles')).toHaveValue('');
  });

  test('a page opened during an outage shows the failure and loads once the service returns', async ({ page, cs }) => {
    await signIn(page, cs);
    await cs.stop();
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByText('The Career Strike service is not responding.')).toBeVisible();
    await expect(page.getByLabel('Preferred roles')).toHaveCount(0);

    await cs.resume();
    await expect(page.getByLabel('Preferred roles')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('The Career Strike service is not responding.')).toHaveCount(0);
  });
});
