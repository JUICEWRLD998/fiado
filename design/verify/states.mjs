// Screenshots the real app, in the real demo world, at all eight widths and both colour schemes, and measures
// horizontal overflow per element. Run after: FIADO_WORLD=1 npx playwright test world --project=desktop
//
//   node design/verify/states.mjs [baseUrl=http://localhost:3210] [outDir=design/shots/build]
//   WIDTHS=375,1280 SCHEMES=light  to narrow it
//
// The overflow probe measures every element's right edge, never scrollWidth: `overflow-x: clip` on html and body
// makes a scrollWidth check blind. A planted 2000px control must be reported or the probe's result is withheld.

import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:3210';
const out = process.argv[3] ?? 'design/shots/build';
const widths = (process.env.WIDTHS ?? '320,375,414,768,1024,1280,1440,1920').split(',').map(Number);
const schemes = (process.env.SCHEMES ?? 'light,dark').split(',');
mkdirSync(out, { recursive: true });

const customerState = JSON.parse(readFileSync('design/world/customer.json', 'utf8'));
const meta = customerState.origins.flatMap((o) => o.localStorage).find((e) => e.name === 'fiado.customer');
const pub = JSON.parse(meta.value).pub;

const routes = [
  { name: 'shop', path: '/shop', state: 'design/world/shop.json', ready: '[data-testid=shop-ready] [data-testid=book-row]' },
  { name: 'shop-sale', path: '/shop', state: 'design/world/shop.json', ready: '[data-testid=shop-ready] [data-testid=book-row]', act: async (page) => page.getByTestId('open-sale').first().click() },
  { name: 'shop-more', path: '/shop', state: 'design/world/shop.json', ready: '[data-testid=shop-ready] [data-testid=book-row]', act: async (page) => page.getByTestId('open-more').first().click() },
  { name: 'customer', path: '/c', state: 'design/world/customer.json', ready: '[data-testid=customer-ready] [data-testid=tab-row]' },
  { name: 'record', path: `/record/${pub}`, state: 'design/world/customer.json', ready: '[data-testid=record-facts]' },
];

const OVERFLOW = () => {
  const cw = document.documentElement.clientWidth;
  const bad = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (el.closest('svg')) continue;
    // content inside a closed <details> is not rendered for a person (only its summary is)
    const closed = el.closest('details:not([open])');
    if (closed && !(el.tagName === 'SUMMARY' && el.parentElement === closed)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > cw + 1) bad.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} right=${Math.round(r.right)} cw=${cw}`);
  }
  return bad;
};

const only = process.env.ROUTES?.split(',');
const browser = await chromium.launch({ channel: 'chrome' });
let problems = 0;
try {
  for (const route of routes.filter((r) => !only || only.includes(r.name))) {
    for (const width of widths) {
      for (const scheme of schemes) {
        const ctx = await browser.newContext({ storageState: route.state, viewport: { width, height: width < 600 ? 812 : 900 }, colorScheme: scheme });
        const page = await ctx.newPage();
        const errors = [];
        page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
        page.on('pageerror', (e) => errors.push(String(e)));
        await page.goto(base + route.path, { waitUntil: 'load' });
        await page.waitForSelector(route.ready, { timeout: 90_000 });
        if (route.act) await route.act(page);
        await page.waitForTimeout(900);

        // planted control first: a 2000px element must be reported, or this probe is blind
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

        const file = `${out}/${route.name}-w${width}-${scheme}.png`;
        await page.screenshot({ path: file, fullPage: true });
        const flag = blind ? ' PROBE BLIND (planted control not reported)' : real.length ? ` OVERFLOW: ${real.slice(0, 3).join('; ')}` : '';
        if (blind || real.length || errors.length) problems++;
        console.log(`${file}${flag}${errors.length ? ` console errors: ${errors.join(' | ')}` : ''}`);
        await ctx.close();
      }
    }
  }
} finally {
  await browser.close();
}
console.log(problems === 0 ? '\nno overflow, no console errors, probe controls registered' : `\n${problems} screenshot(s) with a problem`);
process.exit(problems ? 1 : 0);
