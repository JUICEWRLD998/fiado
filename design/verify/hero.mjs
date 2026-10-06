// Captures the product's own output for the landing hero (imagery ladder, rung R1): the real shop book, the real
// over-limit refusal on the real Stellar test network, at 2x, at the frame where the stamp has landed.
//
//   node design/verify/hero.mjs [baseUrl=http://localhost:3210]
//
// It plays one real purchase: Bisi (owes 3,200 of 10,000) tries to buy 9,000 of cooking oil. The shop shows a code,
// Bisi signs it on her phone, and the network refuses it. Needs design/world/ from the world spec.

import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:3210';
mkdirSync('public/imagery', { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const shopCtx = await browser.newContext({ storageState: 'design/world/shop.json', viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2, colorScheme: 'light' });
  const custCtx = await browser.newContext({ storageState: 'design/world/customer.json', viewport: { width: 390, height: 800 }, colorScheme: 'light' });
  const shop = await shopCtx.newPage();
  const cust = await custCtx.newPage();

  await shop.goto(`${base}/shop`);
  await shop.waitForSelector('[data-testid=shop-ready] [data-testid=book-row]', { timeout: 90_000 });
  const row = shop.getByTestId('book-row').filter({ hasText: 'Bisi' });
  await row.getByTestId('open-sale').click();
  await row.getByTestId('item').fill('Cooking oil 25L');
  await row.getByTestId('amount').fill('9000');
  await row.getByTestId('show-sale-code').click();
  const link = await row.getByTestId('flow-link').getAttribute('href');

  await cust.goto(link);
  await cust.getByTestId('sign-purchase').click();

  await row.getByTestId('flow-refused').waitFor({ timeout: 90_000 });
  await shop.waitForTimeout(1700); // the moment settles by about 1.1s
  const href = await row.getByTestId('flow-explorer').getAttribute('href');

  await shop.locator('[data-testid=shop-ready] article').screenshot({ path: 'public/imagery/refusal-2x.png' });
  console.log('saved public/imagery/refusal-2x.png');
  console.log(`refused transaction: ${href}`);
} finally {
  await browser.close();
}
