// axe-core pass plus layout shift (CLS) on each route, both colour schemes, phone and desktop widths.
// A planted violation (an <img> with no alt) must be reported, or the pass is blind.
//   node design/verify/a11y.mjs <baseUrl> <path> [<path> ...]
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from '@playwright/test';

const [base, ...paths] = process.argv.slice(2);
const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const browser = await chromium.launch({ channel: 'chrome' });
let bad = 0;

for (const p of paths) {
  for (const width of [375, 1280]) {
    for (const scheme of ['light', 'dark']) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme });
      const page = await ctx.newPage();
      await page.addInitScript(() => {
        window.__cls = 0;
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
        }).observe({ type: 'layout-shift', buffered: true });
      });
      await page.goto(base + p, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      await page.evaluate(axeSource);
      const run = () => page.evaluate(() => window.axe.run(document, { resultTypes: ['violations'] }));

      // planted control
      await page.evaluate(() => {
        const i = document.createElement('img');
        i.id = '__ctl';
        i.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
        document.body.append(i);
      });
      const withControl = await run();
      const sees = withControl.violations.some((v) => v.id === 'image-alt');
      await page.evaluate(() => document.getElementById('__ctl')?.remove());

      const res = await run();
      const cls = await page.evaluate(() => window.__cls);
      const serious = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      const fail = !sees || serious.length > 0 || cls >= 0.1;
      if (fail) bad++;
      console.log(
        `${fail ? 'FAIL' : 'ok  '} ${p} w${width} ${scheme}  control:${sees ? 'seen' : 'MISSED'}  serious/critical:${serious.length}  all:${res.violations.length}  CLS:${cls.toFixed(3)}`,
      );
      for (const v of res.violations) console.log(`      ${v.impact} ${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`);
      await ctx.close();
    }
  }
}
await browser.close();
process.exit(bad ? 1 : 0);
