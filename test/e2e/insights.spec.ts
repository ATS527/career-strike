import { type PracticeAts, startPracticeAts } from '../../src/practice/test-ats.js';
import { expect, signIn, test } from './fixtures.js';

test.describe('insights', () => {
  let ats: PracticeAts;
  test.beforeEach(async () => {
    ats = await startPracticeAts();
  });
  test.afterEach(async () => {
    await ats.close();
  });

  test('a new search gets honest numbers, and a suggestion changes nothing until accepted', async ({ page, cs }) => {
    // Monitoring one board by hand (on the owned practice endpoint) prompts the scheduling suggestion.
    expect((await cs.api('POST', '/api/practice/endpoint', { origin: ats.origin })).status).toBe(200);
    expect((await cs.api('POST', '/api/sources', { url: `${ats.origin}/boards/demo` })).status).toBe(201);
    await signIn(page, cs);
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Insights' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('What your search is telling you');
    await expect(page.getByTestId('observations')).toContainText('Too few submitted applications');
    await expect(page.getByTestId('totals')).toContainText('no data (n=0)');

    const campaignSummary = page.getByTestId('campaign-summary');
    await expect(campaignSummary).toBeVisible();
    await expect(campaignSummary.getByRole('row')).toHaveCount(9); // header + 8 weeks

    const proposals = page.getByTestId('proposals');
    await expect(proposals).toContainText('Check your job boards automatically once a day');
    expect((await cs.settings())['monitoring.discoveryIntervalHours']).toBe('0');
    await proposals.getByRole('button', { name: /^Accept Check your job boards/ }).click();
    await expect(page.getByRole('status')).toHaveText(/^Accepted: Check your job boards/);
    await expect(page.getByTestId('decided')).toContainText('Accepted on');
    await expect(page.getByText('No suggestions right now.')).toBeVisible();
    expect((await cs.settings())['monitoring.discoveryIntervalHours']).toBe('24');

    // An AI host or script with the admin token still cannot accept on the candidate's behalf.
    const st = (await cs.api('GET', '/api/strategy')).body as { proposals: { id: string }[] };
    expect((await cs.api('POST', `/api/strategy/proposals/${st.proposals[0]!.id}/dismiss`)).status).toBe(403);
  });
});
