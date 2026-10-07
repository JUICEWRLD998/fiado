// Phase 8, in real browsers against the live Stellar test network: the proof pages and the practice shop.

import { expect, test } from '@playwright/test';

const HORIZON = 'https://horizon-testnet.stellar.org';
const hashOf = (href: string | null) => /\/tx\/([0-9a-f]{64})$/.exec(href ?? '')?.[1];

async function horizonTx(hash: string): Promise<{ successful: boolean; fee_account: string; source_account: string }> {
  for (let i = 0; i < 6; i++) {
    const r = await fetch(`${HORIZON}/transactions/${hash}`);
    if (r.ok) return (await r.json()) as { successful: boolean; fee_account: string; source_account: string };
    await new Promise((res) => setTimeout(res, 1500));
  }
  throw new Error(`transaction ${hash} never appeared on Horizon`);
}

test('/how: six claims, each with a way to check it', async ({ page }) => {
  await page.goto('/how');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('How it works');
  await expect(page.getByTestId('claim')).toHaveCount(6);
  const links = await page.getByTestId('claim-ledger-link').evaluateAll((a) => a.map((x) => (x as HTMLAnchorElement).href));
  expect(links).toHaveLength(4);
  for (const href of links) expect(href).toMatch(/^https:\/\/stellar\.expert\/explorer\/testnet\/tx\/[0-9a-f]{64}$/);
  await expect(page.getByTestId('claim-record-link')).toHaveAttribute('href', /^\/record\/G[A-Z2-7]{55}$/);
  await expect(page.getByTestId('status')).toContainText('NOT LIVE');
});

test('/evidence: with no consenting shop it says so and shows no numbers', async ({ page }) => {
  await page.goto('/evidence');
  await expect(page.getByTestId('evidence-title')).toHaveText('Evidence');
  await expect(page.getByTestId('evidence-empty')).toContainText('No shopkeeper has agreed to be listed yet');
  await expect(page.getByTestId('evidence-totals')).toHaveCount(0);
  await expect(page.getByTestId('evidence-shop')).toHaveCount(0);
});

test('the proof links are on every page', async ({ page }) => {
  for (const path of ['/', '/shop', '/c', '/how', '/evidence']) {
    await page.goto(path);
    const nav = page.getByRole('navigation', { name: 'Proof' });
    await expect(nav.getByRole('link', { name: 'How it works' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Evidence' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Practice shop' })).toBeVisible();
  }
});

test('/try: one click from the landing page to a real refusal by the network', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/');
  await page.getByTestId('landing-try').click();
  await expect(page).toHaveURL(/\/try$/);

  // labelled as practice from the first moment, before anything is built
  await expect(page.getByTestId('practice-label')).toContainText('Practice only');
  await expect(page.getByTestId('practice-building')).toBeVisible();

  await expect(page.getByTestId('practice-ready')).toBeVisible({ timeout: 200_000 });
  const rows = page.getByTestId('practice-row');
  await expect(rows).toHaveCount(2);
  for (const tag of await rows.getByText('Demo', { exact: true }).all()) await expect(tag).toBeVisible();

  const bisi = rows.filter({ hasText: 'Demo Bisi' });
  await expect(bisi.getByTestId('practice-owed')).toHaveText('₦3,200');

  // one click: the network refuses a purchase over the limit
  await bisi.getByTestId('practice-buy-over').click();
  await expect(bisi.getByTestId('refusal-moment')).toBeVisible({ timeout: 60_000 });
  await expect(bisi.getByTestId('practice-result')).toContainText('Over the credit limit');
  const refusedHash = hashOf(await bisi.getByTestId('practice-ledger-link').getAttribute('href'));
  expect(refusedHash).toBeTruthy();
  expect((await horizonTx(refusedHash!)).successful).toBe(false);
  await expect(bisi.getByTestId('practice-owed')).toHaveText('₦3,200'); // nothing was added

  // an ordinary purchase is recorded, and the shop (not the customer) paid the fee
  await bisi.getByTestId('practice-buy-small').click();
  await expect(bisi.getByTestId('practice-owed')).toHaveText('₦3,700', { timeout: 60_000 });
  const boughtHash = hashOf(await bisi.getByTestId('practice-ledger-link').getAttribute('href'));
  const bought = await horizonTx(boughtHash!);
  expect(bought.successful).toBe(true);
  expect(bought.fee_account).not.toBe(bought.source_account);

  // a cash repayment burns the tab
  await bisi.getByTestId('practice-repay').click();
  await expect(bisi.getByTestId('practice-owed')).toHaveText('₦0', { timeout: 60_000 });
});
