// Screenshots pages at chosen widths and colour schemes, so a design is judged by looking, never by inferring.
//
//   node design/verify/shoot.mjs <baseUrl> <outDir> <waitMs> <path> [<path> ...]
//   WIDTHS=375,1280 SCHEMES=light,dark   (defaults: 375,1280 and light)
//
// Headless Chrome defaults to the dark colour scheme, so the scheme is always set explicitly.

import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [base, out, wait, ...paths] = process.argv.slice(2);
if (!base || !out || paths.length === 0) {
  console.error('usage: shoot.mjs <baseUrl> <outDir> <waitMs> <path> [<path> ...]');
  process.exit(2);
}
const widths = (process.env.WIDTHS ?? '375,1280').split(',').map(Number);
const schemes = (process.env.SCHEMES ?? 'light').split(',');
mkdirSync(out, { recursive: true });

const slug = (p) => p.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/-+$/, '') || 'home';
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const p of paths) {
    for (const width of widths) {
      for (const scheme of schemes) {
        const ctx = await browser.newContext({
          viewport: { width, height: width < 600 ? 812 : 900 },
          colorScheme: scheme,
          deviceScaleFactor: 1,
        });
        const page = await ctx.newPage();
        const errors = [];
        page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
        page.on('pageerror', (e) => errors.push(String(e)));
        await page.goto(base + p, { waitUntil: 'load' });
        await page.waitForTimeout(Number(wait));
        const file = `${out}/${slug(p)}-w${width}-${scheme}.png`;
        await page.screenshot({ path: file, fullPage: true });
        console.log(`${file}${errors.length ? `  console errors: ${errors.join(' | ')}` : ''}`);
        await ctx.close();
      }
    }
  }
} finally {
  await browser.close();
}
