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
        if (process.env.SCROLL) {
          // let anything that starts when it scrolls into view start, then come back to the top
          await page.evaluate(async () => {
            for (let y = 0; y < document.body.scrollHeight; y += 300) {
              window.scrollTo(0, y);
              await new Promise((r) => setTimeout(r, 150));
            }
          });
          await page.waitForTimeout(2200);
          await page.evaluate(() => window.scrollTo(0, 0));
        }
        await page.waitForTimeout(Number(wait));

        // overflow, measured per element (scrollWidth is blind under overflow-x: clip), with a planted control
        const measure = () => {
          const cw = document.documentElement.clientWidth;
          const bad = [];
          for (const el of document.body.querySelectorAll('*')) {
            if (el.closest('svg')) continue;
            const closed = el.closest('details:not([open])');
            if (closed && !(el.tagName === 'SUMMARY' && el.parentElement === closed)) continue;
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            if (r.right > cw + 1) bad.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} right=${Math.round(r.right)} cw=${cw}`);
          }
          return bad;
        };
        await page.evaluate(() => {
          const d = document.createElement('div');
          d.id = '__ctl';
          d.style.cssText = 'position:absolute;left:0;top:0;width:2000px;height:2px';
          document.body.appendChild(d);
        });
        const withControl = await page.evaluate(measure);
        await page.evaluate(() => document.getElementById('__ctl')?.remove());
        const blind = !withControl.some((s) => s.includes('right=2000'));
        const real = await page.evaluate(measure);

        const file = `${out}/${slug(p)}-w${width}-${scheme}.png`;
        await page.screenshot({ path: file, fullPage: true });
        const flag = blind ? '  PROBE BLIND' : real.length ? `  OVERFLOW: ${real.slice(0, 3).join('; ')}` : '';
        console.log(`${file}${flag}${errors.length ? `  console errors: ${errors.join(' | ')}` : ''}`);
        await ctx.close();
      }
    }
  }
} finally {
  await browser.close();
}
