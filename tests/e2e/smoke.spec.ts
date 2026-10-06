import { expect, test } from '@playwright/test';

test('landing names the product, the testnet status and both ways in', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /credit book, kept by the network/i })).toBeVisible();
  await expect(page.getByText('Runs on the Stellar test network. No real money.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open my shop' }).first()).toHaveAttribute('href', '/shop');
  await expect(page.getByRole('link', { name: 'I’m a customer' })).toHaveAttribute('href', '/c');
});
