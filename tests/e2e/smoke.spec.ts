import { expect, test } from '@playwright/test';

test('landing renders the name and the testnet status', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Fiado' })).toBeVisible();
  await expect(page.getByText('testnet only')).toBeVisible();
});
