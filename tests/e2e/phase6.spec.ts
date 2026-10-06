// MILESTONE 2: feature-complete, in real browsers on live testnet.
//
// One customer, two shops. The customer's record travels with them: the second shop sees it before opening a line.
// Then the shop's tools: write-off, change the limit (and be refused below the debt), remind on WhatsApp,
// settle, and close the line. The customer's record keeps the history after the line is closed.

import { Keypair } from '@stellar/stellar-sdk';
import { devices, expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { joinCustomer, openShop, passkeyDevice } from './helpers';

const SHOTS = 'test-results/phase6';

test('one customer, two shops: record, write-off, limit, reminder, close', async ({ browser, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one live run is enough');
  test.setTimeout(600_000);
  mkdirSync(SHOTS, { recursive: true });

  const mk = async (opts: Parameters<typeof browser.newContext>[0]) => {
    const ctx = await browser.newContext({ baseURL, ...opts });
    const page = await ctx.newPage();
    await passkeyDevice(ctx, page);
    return { ctx, page };
  };
  const { page: shopA } = await mk({ viewport: { width: 1280, height: 900 } });
  const { page: shopB } = await mk({ viewport: { width: 1280, height: 900 } });
  const { page: cust } = await mk({ ...devices['Pixel 7'] });
  const publicCtx = await browser.newContext({ baseURL }); // a stranger with only the link: no passkey, no account
  const stranger = await publicCtx.newPage();

  // ---- Mama Bisi opens a shop and adds Bisi (a first visit: nothing to show yet)
  await openShop(shopA, 'Mama Bisi');
  await joinCustomer({ shop: shopA, customer: cust, customerName: 'Bisi', limit: '5000', shopSees: 'first time' });
  const rowA = shopA.getByTestId('book-row').filter({ hasText: 'Bisi' });
  await expect(rowA).toBeVisible({ timeout: 30_000 });

  // ---- Bisi buys rice on credit (3,000)
  await rowA.getByTestId('open-sale').click();
  await rowA.getByTestId('item').fill('Rice 2 bags');
  await rowA.getByTestId('amount').fill('3000');
  await rowA.getByTestId('show-sale-code').click();
  const buyLink = await rowA.getByTestId('flow-link').getAttribute('href');
  await cust.goto(buyLink!);
  await cust.getByTestId('unlock-customer').click();
  await cust.getByTestId('sign-purchase').click();
  await expect(rowA.getByTestId('flow-done')).toBeVisible({ timeout: 90_000 });
  await rowA.getByRole('button', { name: 'Close' }).click();
  await expect(rowA.getByTestId('row-owed')).toHaveText('₦3,000', { timeout: 30_000 });

  // ---- Bisi's record has a shareable link; a stranger with only that link can read it
  await cust.goto('/c');
  await cust.getByTestId('unlock-customer').click();
  await expect(cust.getByTestId('record-facts')).toBeVisible({ timeout: 60_000 });
  const recordPath = await cust.getByTestId('my-record-link').getAttribute('href');
  expect(recordPath).toMatch(/^\/record\/G[A-Z2-7]{55}$/);
  await stranger.goto(recordPath!);
  await expect(stranger.getByTestId('record-title')).toHaveText('Bisi’s record', { timeout: 60_000 });
  await expect(stranger.getByTestId('record-purchases')).toHaveText('1 purchase at 1 shop');
  await expect(stranger.getByTestId('record-shop')).toContainText('Mama Bisi');
  await stranger.screenshot({ path: `${SHOTS}/01-public-record.png`, fullPage: true });
  // a valid address nobody has used says so; one with a bad checksum, or no address at all, is a 404
  await stranger.goto(`/record/${Keypair.random().publicKey()}`);
  await expect(stranger.getByTestId('record-missing')).toBeVisible({ timeout: 30_000 });
  const badChecksum = `${recordPath!.split('/').pop()!.slice(0, -1)}${recordPath!.endsWith('A') ? 'B' : 'A'}`;
  expect((await stranger.goto(`/record/${badChecksum}`))?.status()).toBe(404);
  expect((await stranger.goto('/record/not-a-key'))?.status()).toBe(404);

  // ---- A second shop meets Bisi: the record travels with her
  await openShop(shopB, 'Alhaji Stores');
  await joinCustomer({
    shop: shopB,
    customer: cust,
    customerName: 'Bisi',
    limit: '3000',
    shopSees: '1 purchase at 1 shop',
    returning: true,
  });
  await expect(shopB.getByTestId('book-row').filter({ hasText: 'Bisi' }).getByTestId('row-limit')).toHaveText('₦3,000', { timeout: 30_000 });
  await cust.goto('/c');
  await cust.getByTestId('unlock-customer').click();
  await expect(cust.getByTestId('tab-row')).toHaveCount(2, { timeout: 60_000 });
  await cust.screenshot({ path: `${SHOTS}/02-customer-two-tabs.png`, fullPage: true });

  // ---- Mama Bisi's tools. Write off 200 of the 3,000.
  await rowA.getByTestId('open-more').click();
  await rowA.getByTestId('open-writeoff').click();
  await rowA.getByTestId('writeoff-input').fill('200');
  await rowA.getByTestId('writeoff-submit').click();
  await expect(rowA.getByTestId('writeoff-result')).toContainText('Wrote off ₦200', { timeout: 60_000 });
  await expect(rowA.getByTestId('row-owed')).toHaveText('₦2,800', { timeout: 30_000 });

  // a limit below what is owed is refused with the reason; a limit above it is accepted
  await rowA.getByTestId('open-limit').click();
  await rowA.getByTestId('limit-input').fill('1000');
  await rowA.getByTestId('limit-submit').click();
  await expect(rowA.getByTestId('limit-result')).toContainText('cannot be lower');
  await expect(rowA.getByTestId('row-limit')).toHaveText('₦5,000');
  await rowA.getByTestId('limit-input').fill('4000');
  await rowA.getByTestId('limit-submit').click();
  await expect(rowA.getByTestId('limit-result')).toContainText('₦4,000', { timeout: 60_000 });
  await expect(rowA.getByTestId('row-limit')).toHaveText('₦4,000', { timeout: 30_000 });

  // the reminder is a ready-to-send WhatsApp message, built from the book
  const remind = decodeURIComponent((await rowA.getByTestId('remind').getAttribute('href'))!.replace('https://wa.me/?text=', ''));
  expect(remind).toContain('Bisi');
  expect(remind).toContain('₦2,800');
  expect(remind).toContain('Mama Bisi');

  // a line with debt cannot be closed; settle it, then it can
  await rowA.getByTestId('open-close').click();
  await rowA.getByTestId('close-submit').click();
  await expect(rowA.getByTestId('close-result')).toContainText('Settle what is owed first');
  await rowA.getByTestId('open-repay').click();
  await rowA.getByTestId('repay-amount').fill('2800');
  await rowA.getByTestId('repay-submit').click();
  await expect(rowA.getByTestId('row-owed')).toHaveText('₦0', { timeout: 60_000 });
  await rowA.getByTestId('open-close').click();
  await rowA.getByTestId('close-submit').click();
  await expect(shopA.getByTestId('book-empty')).toBeVisible({ timeout: 60_000 });
  await shopA.screenshot({ path: `${SHOTS}/03-shop-after-close.png`, fullPage: true });

  // ---- Bisi: one open tab left, but her record still tells the whole story, including the write-off
  await cust.goto('/c');
  await cust.getByTestId('unlock-customer').click();
  await expect(cust.getByTestId('tab-row')).toHaveCount(1, { timeout: 60_000 });
  await expect(cust.getByTestId('tab-shop')).toHaveText('Alhaji Stores');
  await expect(cust.getByTestId('record-facts')).toContainText('1 purchase at 1 shop');
  await expect(cust.getByTestId('record-facts')).toContainText('1 written off by the shop');
  await expect(cust.getByTestId('record-shop')).toContainText('written off ₦200');
  await cust.screenshot({ path: `${SHOTS}/04-customer-record-after.png`, fullPage: true });
});
