import { expect, signIn, test } from './fixtures.js';

const REQUIRED = (items: string[]) => [
  { type: 'heading' as const, text: 'Requirements' },
  ...items.map((text) => ({ type: 'item' as const, text })),
];

test.describe('profile', () => {
  test('facts are added with validation, persist, and can be removed', async ({ page, cs }) => {
    await signIn(page, cs);
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Profile' }).click();
    const skills = page.locator('[data-fact-kind="skill"]');
    await skills.getByLabel('Skill', { exact: true }).fill('k8s');
    await skills.getByLabel('Years using it').fill('4');
    await skills.getByRole('button', { name: 'Add' }).click();
    await expect(skills.getByRole('listitem')).toHaveText([/Kubernetes · 4 yrs/]);

    const roles = page.locator('[data-fact-kind="role"]');
    await roles.getByLabel('Job title').fill('Platform Engineer');
    await roles.getByLabel('Start year').fill('2021');
    await roles.getByLabel('End year').fill('2019');
    await roles.getByRole('button', { name: 'Add' }).click();
    await expect(roles.getByText('End year is before start year')).toBeVisible();
    await roles.getByLabel('End year').fill('');
    await roles.getByRole('button', { name: 'Add' }).click();
    await expect(roles.getByRole('listitem')).toHaveText([/Platform Engineer · 2021–now/]);

    await cs.restart();
    await page.reload();
    await expect(skills.getByRole('listitem')).toHaveText([/Kubernetes/]);
    await skills.getByRole('button', { name: 'Remove Kubernetes · 4 yrs' }).click();
    await expect(skills.getByText('None added yet.')).toBeVisible();
  });

  test('skills suggested from pasted résumé text are used only after approval', async ({ page, cs }) => {
    await signIn(page, cs);
    await page.goto(`${cs.origin}/profile`);
    await page.getByLabel('Résumé text').fill('Synthetic résumé: five years of Kubernetes and some Rust.');
    await page.getByRole('button', { name: 'Suggest skills' }).click();
    await expect(page.getByText('2 skills suggested below.')).toBeVisible();
    const skills = page.locator('[data-fact-kind="skill"]');
    await expect(skills.getByRole('listitem')).toHaveCount(2);
    await expect(skills.getByText('Suggested — not used until you approve')).toHaveCount(2);
    await skills.getByRole('button', { name: 'Approve Kubernetes' }).click();
    await skills.getByRole('button', { name: 'Discard Rust' }).click();
    await expect(skills.getByRole('listitem')).toHaveText([/^Kubernetes/]);
    await expect(skills.getByText('Suggested — not used until you approve')).toHaveCount(0);
    await expect(skills.getByRole('button', { name: 'Remove Kubernetes' })).toBeVisible();
    expect(await page.getByLabel('Résumé text').inputValue()).toBe('');
  });
});

test.describe('fit', () => {
  test('job details explain the fit with labelled evidence and mark inference', async ({ page, cs }) => {
    cs.seed('greenhouse', 'fit', [
      {
        title: 'Backend Engineer',
        locationText: 'Remote - India',
        description: [
          ...REQUIRED(['Strong TypeScript and Node.js', '4+ years building APIs', 'Kubernetes in production']),
          { type: 'paragraph', text: 'We need an immediate joiner.' },
        ],
      },
    ]);
    await cs.api('PUT', '/api/settings/candidate.country', { value: 'IN' });
    await cs.api('PUT', '/api/settings/candidate.joiningAvailability', { value: 'immediate' });
    await cs.api('PUT', '/api/settings/search.preferredRoles', { value: ['Backend Engineer'] });
    for (const name of ['TypeScript', 'Node.js'])
      await cs.api('POST', '/api/profile/facts', { kind: 'skill', value: { name } });
    await cs.api('POST', '/api/profile/facts', { kind: 'role', value: { title: 'Backend Engineer', startYear: 2019 } });

    await signIn(page, cs);
    await page.goto(`${cs.origin}/opportunities`);
    const row = page.getByTestId('job-list').getByRole('listitem').first();
    await expect(row).toContainText('Possible fit');
    await expect(row).toContainText('You have Node.js, TypeScript');
    await expect(row).toContainText('Missing Kubernetes');
    await expect(row).toContainText('Asks for an early start');

    await row.getByRole('link', { name: 'Backend Engineer' }).click();
    const fit = page.getByRole('region', { name: 'How it fits you' });
    await expect(fit).toContainText('Possible fit');
    await expect(fit).toContainText(
      'You have most of the skills it asks for (missing Kubernetes); nothing else is a gap.',
    );
    const skills = page.locator('[data-factor="skills"]');
    await expect(skills).toContainText('You have 2 of the 3 skills listed as required; missing Kubernetes.');
    await expect(skills).toContainText('Posting Asks for Kubernetes: “Kubernetes in production”');
    await expect(page.locator('[data-factor="experience"]')).toContainText('Career Strike’s inference');
    await expect(page.locator('[data-factor="eligibility"]')).toContainText(
      'The posting names India, where you can work.',
    );
    await expect(page.locator('[data-factor="start"]')).toContainText('“We need an immediate joiner.”');
    await expect(page.locator('[data-factor="salary"]')).toContainText('Career Strike never estimates salaries');
    const req = page.getByRole('region', { name: 'What the posting asks for' });
    await expect(req).toContainText('is Career Strike’s inference from the posting’s headings');
    await expect(req.getByRole('listitem').filter({ hasText: 'Kubernetes' })).toContainText(
      '“Kubernetes in production”',
    );
  });

  test('best-fit sorting, fit filters and Home point to the strongest real matches', async ({ page, cs }) => {
    cs.seed('lever', 'many', [
      { title: 'Data Scientist', locationText: 'Remote - India', description: REQUIRED(['PyTorch', 'Statistics']) },
      {
        title: 'Backend Engineer',
        locationText: 'Remote - India',
        description: REQUIRED(['TypeScript', 'PostgreSQL']),
      },
      { title: 'US-only Engineer', locationText: 'Austin, TX', description: REQUIRED(['TypeScript']) },
      {
        title: 'Urgent Backend Role',
        locationText: 'Bengaluru',
        description: [...REQUIRED(['TypeScript']), { type: 'paragraph', text: 'Immediate joiners preferred.' }],
      },
    ]);
    await cs.api('PUT', '/api/settings/candidate.country', { value: 'IN' });
    await cs.api('PUT', '/api/settings/search.remotePreference', { value: 'onsite_ok' });
    await cs.api('PUT', '/api/settings/candidate.joiningAvailability', { value: 'immediate' });
    for (const name of ['TypeScript', 'PostgreSQL'])
      await cs.api('POST', '/api/profile/facts', { kind: 'skill', value: { name } });

    await signIn(page, cs);
    const actions = page.getByTestId('next-actions');
    await expect(actions).toContainText('Look at 2 strong matches first');
    await expect(actions).toContainText('1 role asks for an early start');

    await actions.getByRole('link', { name: 'Look at 2 strong matches first' }).click();
    const rows = page.getByTestId('job-list').getByRole('listitem');
    // Within the strong tier, the early-start role the candidate can meet ranks first.
    await expect(rows.locator('h2')).toHaveText(['Urgent Backend Role', 'Backend Engineer']);

    await page.getByLabel('Fit').selectOption('');
    await expect(rows.locator('h2')).toHaveText([
      'Urgent Backend Role',
      'Backend Engineer',
      'Data Scientist',
      'US-only Engineer',
    ]);
    await expect(rows.last()).toContainText('Not eligible');
    await page.getByLabel('Fit').selectOption('eligible');
    await expect(rows).toHaveCount(3);
    await page.getByLabel('Asks for an early start').check();
    await expect(rows.locator('h2')).toHaveText(['Urgent Backend Role']);
  });
});
