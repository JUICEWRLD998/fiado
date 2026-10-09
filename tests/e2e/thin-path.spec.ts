// MILESTONE 1: the thin path, end to end, in real browsers, on live testnet.
//
// Two separate browser contexts play two people on two devices: a shopkeeper on a desktop, a customer on a
// phone-sized screen. Each has its own virtual passkey authenticator, so the keys are real passkey PRF keys.
// Nothing here is mocked: the mailbox is the real API, the chain is the real testnet.
//
//   join -> purchase -> OVER-LIMIT purchase refused by the network -> cash repayment -> the customer's view

import { devices, expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { passkeyDevice } from './helpers';

const SHOTS = 'test-results/thin-path';

test('shop and customer complete the thin path on testnet', async ({ browser, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one live run is enough');
  test.setTimeout(420_000);
  mkdirSync(SHOTS, { recursive: true });

  const shopCtx = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 } });
  const custCtx = await browser.newContext({ baseURL, ...devices['Pixel 7'] });
  const shop = await shopCtx.newPage();
  const cust = await custCtx.newPage();
  await passkeyDevice(shopCtx, shop);
  await passkeyDevice(custCtx, cust);
  const evidence: string[] = [];
  const note = (label: string, href: string | null) => evidence.push(`${label}: ${href ?? '(no link)'}`);

  // ---- 1. the shopkeeper opens a shop (passkey key, test money, name published on-chain)
  await shop.goto('/shop');
  await shop.getByTestId('shop-name').fill('Mama Bisi');
  await expect(shop.getByTestId('mode-passkey')).toBeChecked();
  await shop.getByTestId('create-shop').click();
  await expect(shop.getByTestId('shop-ready')).toBeVisible({ timeout: 150_000 });
  await expect(shop.getByTestId('shop-title')).toHaveText('Mama Bisi');
  await expect(shop.getByTestId('shop-key-full')).toHaveText(/^G[A-Z2-7]{55}$/); // the full public key, so a shop can send it
  await shop.screenshot({ path: `${SHOTS}/01-shop-ready.png` });

  // ---- 2. add a customer: the shop shows a code
  await shop.getByTestId('add-customer').click();
  await shop.getByTestId('start-join').click();
  const joinLink = await shop.getByTestId('flow-link').getAttribute('href');
  expect(joinLink).toContain('/c/join?s=');
  await expect(shop.getByTestId('qr')).toBeVisible();
  await shop.screenshot({ path: `${SHOTS}/02-shop-join-code.png` });

  // ---- 3. the customer scans it, makes a passkey key, says hello, reviews, signs
  await cust.goto(joinLink!);
  await expect(cust.getByTestId('offer-limit')).toHaveText('₦10,000');
  await cust.getByTestId('customer-name').fill('Bisi');
  await cust.getByTestId('join-button').click();
  // the shop sees who is asking, and their record (none yet), and chooses to open the line
  await expect(shop.getByTestId('review-customer')).toContainText('first time', { timeout: 90_000 });
  await shop.getByTestId('approve-customer').click();
  await expect(cust.getByTestId('review-card')).toBeVisible({ timeout: 90_000 });
  await cust.screenshot({ path: `${SHOTS}/03-customer-review-join.png` });
  await cust.getByTestId('sign-join').click();
  await expect(cust.getByTestId('join-done')).toBeVisible({ timeout: 90_000 });

  // ---- 4. the shop's book now has Bisi, with a ₦10,000 line and nothing owed
  await expect(shop.getByTestId('flow-done')).toBeVisible({ timeout: 60_000 });
  note('join', await shop.getByTestId('flow-explorer').getAttribute('href'));
  await shop.getByRole('button', { name: 'Close' }).click();
  const row = shop.getByTestId('book-row').filter({ hasText: 'Bisi' });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row.getByTestId('row-owed')).toHaveText('₦0');
  await expect(row.getByTestId('row-limit')).toHaveText('₦10,000');

  // ---- 5. a purchase on credit: the shop shows a code, the customer reads the terms and signs
  await row.getByTestId('open-sale').click();
  await row.getByTestId('item').fill('Rice 2 bags');
  await row.getByTestId('amount').fill('3200');
  await row.getByTestId('show-sale-code').click();
  const buyLink = await row.getByTestId('flow-link').getAttribute('href');
  expect(buyLink).toContain('/c/pay?s=');
  await cust.goto(buyLink!);
  await cust.getByTestId('unlock-customer').click();
  await expect(cust.getByTestId('pay-card')).toBeVisible({ timeout: 60_000 });
  await expect(cust.getByTestId('pay-item')).toHaveText('Rice 2 bags');
  await expect(cust.getByTestId('pay-amount')).toHaveText('₦3,200');
  await cust.screenshot({ path: `${SHOTS}/04-customer-review-purchase.png` });
  await cust.getByTestId('sign-purchase').click();
  await expect(row.getByTestId('flow-done')).toBeVisible({ timeout: 90_000 });
  note('purchase 3,200', await row.getByTestId('flow-explorer').getAttribute('href'));
  await row.getByRole('button', { name: 'Close' }).click();
  await expect(row.getByTestId('row-owed')).toHaveText('₦3,200', { timeout: 30_000 });
  await expect(cust.getByTestId('pay-confirmed')).toBeVisible({ timeout: 60_000 });
  await shop.screenshot({ path: `${SHOTS}/05-shop-after-purchase.png` });

  // ---- 6. THE MOMENT: a purchase over the limit. The customer signs it; the network refuses it.
  await row.getByTestId('amount').fill('9000');
  await expect(row.getByTestId('over-limit-hint')).toBeVisible();
  await row.getByTestId('item').fill('Cement 20 bags');
  await row.getByTestId('show-sale-code').click();
  const overLink = await row.getByTestId('flow-link').getAttribute('href');
  await cust.goto(overLink!);
  await cust.getByTestId('unlock-customer').click();
  await expect(cust.getByTestId('pay-over-limit')).toBeVisible({ timeout: 60_000 });
  await cust.getByTestId('sign-purchase').click();
  await expect(row.getByTestId('flow-refused')).toBeVisible({ timeout: 90_000 });
  await expect(row.getByTestId('flow-refused')).toContainText('Over the credit limit');
  note('REFUSED over the limit (op_line_full)', await row.getByTestId('flow-explorer').getAttribute('href'));
  await shop.waitForTimeout(1500); // the moment settles by about 1.1s: this is the frame the OG card and README are cut from
  await shop.screenshot({ path: `${SHOTS}/06-shop-refused-over-limit.png` });
  await row.getByRole('button', { name: 'Close' }).click();
  await expect(row.getByTestId('row-owed')).toHaveText('₦3,200'); // nothing was added

  // ---- 7. a cash repayment: the shop returns the IOU
  await row.getByTestId('open-repay').click();
  await row.getByTestId('repay-amount').fill('1000');
  await row.getByTestId('repay-submit').click();
  await expect(row.getByTestId('repay-result')).toContainText('Recorded', { timeout: 60_000 });
  await expect(row.getByTestId('row-owed')).toHaveText('₦2,200', { timeout: 30_000 });
  await shop.screenshot({ path: `${SHOTS}/07-shop-after-repay.png` });

  // ---- 8. the customer's own view: tab and record, read from the same ledger
  await cust.goto('/c');
  await cust.getByTestId('unlock-customer').click();
  const tab = cust.getByTestId('tab-row');
  await expect(tab).toBeVisible({ timeout: 60_000 });
  await expect(tab.getByTestId('tab-shop')).toHaveText('Mama Bisi');
  await expect(tab.getByTestId('tab-owed')).toHaveText('₦2,200', { timeout: 30_000 });
  // The refused 9,000 purchase never reached the ledger as a success, so the record shows exactly one purchase.
  await expect(cust.getByTestId('record-summary')).toContainText('1 purchase at 1 shop', { timeout: 30_000 });
  await expect(cust.getByTestId('record-summary')).toContainText('0 paid off');
  await cust.screenshot({ path: `${SHOTS}/08-customer-tabs.png` });

  console.log(`\nEVIDENCE (testnet)\n${evidence.join('\n')}\n`);
  await shopCtx.close();
  await custCtx.close();
});
