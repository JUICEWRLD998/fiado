// Shared by the end-to-end specs. Everything runs against the real app and live testnet.

import { expect, type BrowserContext, type Page } from '@playwright/test';

/** A virtual passkey device (with PRF) for one page, so each simulated person has their own real passkey. */
export async function passkeyDevice(context: BrowserContext, page: Page): Promise<void> {
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      ctap2Version: 'ctap2_1',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      hasPrf: true,
      automaticPresenceSimulation: true,
    },
  });
}

/** A shopkeeper creates a shop and waits for it to be ready (key, test money, name on-chain). */
export async function openShop(page: Page, name: string, opts: { device?: boolean } = {}): Promise<void> {
  await page.goto('/shop');
  await page.getByTestId('shop-name').fill(name);
  // a key kept in the browser, so the whole state can be saved and replayed (a virtual passkey cannot)
  if (opts.device) await page.getByTestId('mode-device').check();
  await page.getByTestId('create-shop').click();
  await expect(page.getByTestId('shop-ready')).toBeVisible({ timeout: 150_000 });
  await expect(page.getByTestId('shop-title')).toHaveText(name);
}

/**
 * The whole join: the shop shows a code, the customer opens it and says hello, the shop reviews their record and
 * approves, the customer reviews and signs, and the shop's flow finishes. Returns the shop's join transaction link.
 */
export async function joinCustomer(p: {
  shop: Page;
  customer: Page;
  customerName: string;
  limit: string;
  /** Text the shop's review of the customer must contain, e.g. their history. */
  shopSees?: string;
  /** True when the customer already has an account and a passkey on this device. */
  returning?: boolean;
  /** Keep the customer's key in the browser instead of a passkey. */
  deviceKey?: boolean;
}): Promise<string> {
  const { shop, customer } = p;
  await shop.getByTestId('add-customer').click();
  await shop.getByTestId('join-limit').fill(p.limit);
  await shop.getByTestId('start-join').click();
  const link = await shop.getByTestId('flow-link').getAttribute('href');
  expect(link).toContain('/c/join?s=');

  await customer.goto(link!);
  await customer.getByTestId('customer-name').fill(p.customerName);
  if (p.deviceKey) await customer.getByTestId('mode-device').check();
  await customer.getByTestId('join-button').click();

  await expect(shop.getByTestId('review-customer')).toBeVisible({ timeout: 90_000 });
  if (p.shopSees) await expect(shop.getByTestId('review-customer')).toContainText(p.shopSees);
  await shop.getByTestId('approve-customer').click();

  await expect(customer.getByTestId('review-card')).toBeVisible({ timeout: 90_000 });
  if (p.returning) await expect(customer.getByTestId('review-card')).not.toContainText('Your account is created');
  await customer.getByTestId('sign-join').click();
  await expect(customer.getByTestId('join-done')).toBeVisible({ timeout: 90_000 });

  await expect(shop.getByTestId('flow-done')).toBeVisible({ timeout: 60_000 });
  const tx = (await shop.getByTestId('flow-explorer').getAttribute('href')) ?? '';
  await shop.getByRole('button', { name: 'Close' }).click();
  return tx;
}

export async function sellOnCredit(p: { shop: Page; customer: Page; name: string; item: string; amount: string; unlock?: boolean }): Promise<void> {
  const row = p.shop.getByTestId("book-row").filter({ hasText: p.name });
  await row.getByTestId("open-sale").click();
  await row.getByTestId("item").fill(p.item);
  await row.getByTestId("amount").fill(p.amount);
  await row.getByTestId("show-sale-code").click();
  const link = await row.getByTestId("flow-link").getAttribute("href");
  await p.customer.goto(link!);
  if (p.unlock) await p.customer.getByTestId("unlock-customer").click();
  await p.customer.getByTestId("sign-purchase").click();
  await expect(row.getByTestId("flow-done")).toBeVisible({ timeout: 90_000 });
  await row.getByRole("button", { name: "Close" }).click();
}
