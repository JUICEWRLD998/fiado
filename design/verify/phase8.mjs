// Screenshots the Phase 8 pages in a real browser at all eight widths and both colour schemes, and measures
// horizontal overflow per element. /try is the live practice shop: it is built once on the test network, driven to a
// refusal, then photographed at every width.
//
//   node design/verify/phase8.mjs [baseUrl=http://localhost:3220] [outDir=design/shots/phase8]
//   WIDTHS=375,1280 SCHEMES=light  to narrow it
//
// The overflow probe measures every element's right edge, never scrollWidth. A planted 2000px control must be
// reported or the probe's result is withheld.

import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:3220';
const out = process.argv[3] ?? 'design/shots/phase8';
const widths = (process.env.WIDTHS ?? '320,375,414,768,1024,1280,1440,1920').split(',').map(Number);
const schemes = (process.env.SCHEMES ?? 'light,dark').split(',');
mkdirSync(out, { recursive: true });

const OVERFLOW = () => {
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

/** Smallest tap target among links and buttons that are visible: a target under 24px is a problem. */
const TARGETS = () => {
  const small = [];
  for (const el of document.querySelectorAll('a, button, summary')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (el.closest('p, li') && el.tagName === 'A' && getComputedStyle(el).display === 'inline') continue; // inline text link
    if (r.height < 24 || r.width < 24) small.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  return small;
};

let problems = 0;

async function shoot(page, name, width, scheme, errors) {
  await page.setViewportSize({ width, height: width < 600 ? 812 : 900 });
  await page.emulateMedia({ colorScheme: scheme });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const d = document.createElement('div');
    d.id = '__ctl';
    d.style.cssText = 'position:absolute;left:0;top:0;width:2000px;height:2px';
    document.body.appendChild(d);
  });
  const withControl = await page.evaluate(OVERFLOW);
  await page.evaluate(() => document.getElementById('__ctl')?.remove());
  const blind = !withControl.some((s) => s.includes('right=2000'));
  const real = await page.evaluate(OVERFLOW);
  const small = await page.evaluate(TARGETS);
  const file = `${out}/${name}-w${width}-${scheme}.png`;
  await page.screenshot({ path: file, fullPage: true });
  const bad = blind || real.length || small.length || errors.length;
  if (bad) problems++;
  console.log(
    `${file}${blind ? ' PROBE BLIND' : ''}${real.length ? ` OVERFLOW: ${real.slice(0, 3).join('; ')}` : ''}${small.length ? ` SMALL TARGETS: ${small.slice(0, 3).join('; ')}` : ''}${errors.length ? ` console errors: ${errors.join(' | ')}` : ''}`,
  );
}

const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const route of [
    { name: 'how', path: '/how', ready: '[data-testid=claims]' },
    { name: 'evidence', path: '/evidence', ready: '[data-testid=evidence-empty]' },
  ]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text() + ' ' + (m.location().url ?? '')));
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(base + route.path, { waitUntil: 'load' });
    await page.waitForSelector(route.ready);
    for (const width of widths) for (const scheme of schemes) await shoot(page, route.name, width, scheme, errors.splice(0));
    await ctx.close();
  }

  // the live practice shop: build it once, show a refusal, then photograph it at every width
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text() + ' ' + (m.location().url ?? '')));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + '/try', { waitUntil: 'load' });
  await page.waitForSelector('[data-testid=practice-building]');
  for (const width of [375, 1280]) await shoot(page, 'try-building', width, 'light', []);
  const settled = await page
    .locator('[data-testid=practice-ready], [data-testid=practice-error]')
    .first()
    .waitFor({ timeout: 200_000 })
    .then(() => page.evaluate(() => document.querySelector('[data-testid=practice-error]')?.textContent ?? null));
  if (settled) throw new Error(`the practice shop showed an error: ${settled}`);
  // while the faucet funds the new shop, shop setup polls Horizon and gets 404 until the account exists (the same wait /shop does)
  await shoot(page, 'try-ready', 1280, 'light', errors.splice(0).filter((e) => !(e.includes('status of 404') && e.includes('horizon-testnet.stellar.org/accounts/'))));
  // the one expected console error: Horizon answers 400 to the refused submission, which is the refusal itself
  const expected = (e) => e.includes('status of 400') && e.endsWith('horizon-testnet.stellar.org/transactions');
  await page.getByTestId('practice-buy-over').first().click();
  await page.waitForSelector('[data-testid=refusal-moment]', { timeout: 60_000 });
  await page.waitForTimeout(2500); // let the moment finish
  for (const width of widths) for (const scheme of schemes) await shoot(page, 'try-refused', width, scheme, errors.splice(0).filter((e) => !expected(e)));
  await ctx.close();
} finally {
  await browser.close();
}
console.log(problems === 0 ? '\nno overflow, no small targets, no console errors, probe controls registered' : `\n${problems} screenshot(s) with a problem`);
process.exit(problems ? 1 : 0);
