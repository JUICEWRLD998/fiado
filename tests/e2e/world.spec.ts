// Builds a small, real demo world on live testnet and saves the browser state of two of its people, so the design
// can be verified with REAL data at every width and in both themes (design/verify/states.mjs).
//
//   FIADO_WORLD=1 npx playwright test world --project=desktop
//
// Keys are kept in the browser (device mode) because a virtual passkey cannot be saved and replayed.
// The shop is "Mama Bisi Provisions"; Bisi owes a little, Tunde is close to his limit, Ngozi owes nothing.

import { test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { joinCustomer, openShop, sellOnCredit } from './helpers';

test.skip(!process.env.FIADO_WORLD, 'builds the demo world on testnet; run with FIADO_WORLD=1');

test('build the demo world', async ({ browser, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one build is enough');
  test.setTimeout(900_000);
  mkdirSync('design/world', { recursive: true });

  const person = async () => {
    const ctx = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 } });
    return { ctx, page: await ctx.newPage() };
  };

  const shop = await person();
  await openShop(shop.page, 'Mama Bisi Provisions', { device: true });

  const people = [
    { name: 'Bisi Okafor', limit: '10000', item: 'Rice 2 bags', amount: '3200' },
    { name: 'Tunde Adeyemi', limit: '8000', item: 'Cement 3 bags', amount: '7600' },
    { name: 'Ngozi Eze', limit: '5000', item: '', amount: '' },
  ];

  let bisi: Awaited<ReturnType<typeof person>> | null = null;
  for (const p of people) {
    const c = await person();
    await joinCustomer({ shop: shop.page, customer: c.page, customerName: p.name, limit: p.limit, deviceKey: true });
    if (p.item) await sellOnCredit({ shop: shop.page, customer: c.page, name: p.name.split(' ')[0]!, item: p.item, amount: p.amount });
    if (p.name.startsWith('Bisi')) bisi = c;
    else await c.ctx.close();
  }

  await shop.ctx.storageState({ path: 'design/world/shop.json' });
  await bisi!.ctx.storageState({ path: 'design/world/customer.json' });
  await shop.ctx.close();
  await bisi!.ctx.close();
});
