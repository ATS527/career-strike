import { type PracticeAts, startPracticeAts } from '../../src/practice/test-ats.js';
import { type CsService, expect, signIn, test } from './fixtures.js';

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from('synthetic resume')]);

async function practiceApplication(cs: CsService, ats: PracticeAts): Promise<string> {
  expect((await cs.api('POST', '/api/practice/endpoint', { origin: ats.origin })).status).toBe(200);
  const jobId = ((await cs.api('POST', '/api/practice/jobs', {})).body as { jobId: string }).jobId;
  await cs.api('PUT', '/api/settings/identity.fullName', { value: 'Jordan Example' });
  await cs.api('PUT', '/api/settings/identity.email', { value: 'jordan@example.com' });
  await fetch(`${cs.origin}/api/documents`, {
    method: 'POST',
    headers: { authorization: `Bearer ${cs.token}`, 'content-type': 'application/pdf', 'x-cs-filename': 'cv.pdf', 'x-cs-document-kind': 'resume' },
    body: PDF,
  });
  const id = ((await cs.api('POST', '/api/applications', { jobId })).body as { application: { id: string } }).application.id;
  await cs.api('POST', `/api/applications/${id}/ready`);
  return id;
}

test.describe('practice submission', () => {
  let ats: PracticeAts;
  test.beforeEach(async () => {
    ats = await startPracticeAts();
  });
  test.afterEach(async () => {
    await ats.close();
  });

  test('approve and submit to the owned endpoint; a verified receipt marks it submitted', async ({ page, cs }) => {
    const id = await practiceApplication(cs, ats);
    await signIn(page, cs);
    await page.goto(`${cs.origin}/applications/${id}`);
    await page.getByRole('button', { name: 'Approve this exact application' }).click();
    await expect(page.getByText('This goes to the practice endpoint on this computer, not to an employer.')).toBeVisible();
    await page.getByRole('button', { name: 'Submit to the practice endpoint' }).click();
    await expect(page.getByText('Submitted', { exact: true })).toBeVisible();
    const receipt = [...ats.receipts.values()][0]!;
    await page.locator('.history summary').click();
    await expect(page.locator('.history')).toContainText(`receipt ${receipt.receiptId}`);
    expect(ats.receipts.size).toBe(1);
  });

  test('a lost response is shown as unknown, not resent, and resolved by checking with the endpoint', async ({ page, cs }) => {
    const id = await practiceApplication(cs, ats);
    ats.setFault('drop-after-store');
    await signIn(page, cs);
    await page.goto(`${cs.origin}/applications/${id}`);
    await page.getByRole('button', { name: 'Approve this exact application' }).click();
    await page.getByRole('button', { name: 'Submit to the practice endpoint' }).click();
    await expect(page.getByText('Career Strike does not know whether it arrived.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit to the practice endpoint' })).toHaveCount(0);
    ats.setFault('none');
    await page.getByRole('button', { name: 'Check whether it arrived' }).click();
    await expect(page.getByText('Submitted', { exact: true })).toBeVisible();
    expect(ats.receipts.size).toBe(1);
  });
});
