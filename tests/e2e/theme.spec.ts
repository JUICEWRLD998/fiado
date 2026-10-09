import { expect, test, type Page } from '@playwright/test';

const bg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const theme = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme ?? null);

test('the theme switch changes the real page colours, remembers the choice, and follows the device until chosen', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, colorScheme: 'light' });
  const page = await ctx.newPage();
  await page.goto('/evidence');
  const toggle = page.getByTestId('theme-toggle');

  // no choice yet: the device (light) decides
  await expect(toggle).toHaveAttribute('aria-label', 'Switch to dark mode');
  expect(await theme(page)).toBeNull();
  const light = await bg(page);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-label', 'Switch to light mode');
  expect(await theme(page)).toBe('dark');
  const dark = await bg(page);
  expect(dark).not.toBe(light); // planted control: a switch that changed nothing would fail here

  // the choice survives a reload, with no flash: the attribute is set before the page is interactive
  await page.reload();
  expect(await theme(page)).toBe('dark');
  expect(await bg(page)).toBe(dark);

  await page.getByTestId('theme-toggle').click();
  expect(await theme(page)).toBe('light');
  expect(await bg(page)).toBe(light);
  await ctx.close();
});

test('with a dark device and no choice, the switch offers light mode; a stored choice beats the device', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.goto('/how');
  await expect(page.getByTestId('theme-toggle')).toHaveAttribute('aria-label', 'Switch to light mode');
  await page.getByTestId('theme-toggle').click();
  expect(await theme(page)).toBe('light');
  await page.reload();
  expect(await theme(page)).toBe('light'); // the saved light choice wins over the dark device
  await ctx.close();
});

test('the switch is on every page and is at least 44px square', async ({ page }) => {
  for (const path of ['/', '/shop', '/c', '/how', '/evidence', '/try']) {
    await page.goto(path);
    const toggle = page.getByTestId('theme-toggle');
    await expect(toggle, path).toBeVisible();
    const box = await toggle.boundingBox();
    expect(box!.width, path).toBeGreaterThanOrEqual(44);
    expect(box!.height, path).toBeGreaterThanOrEqual(44);
  }
});
