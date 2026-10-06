// Real hover probe: move the mouse over each control and compare computed colours before and after.
// A planted control (a button whose :hover rule is injected here) must register as changed, or the probe is blind.
//   node design/verify/hover.mjs <url>
import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://localhost:3140/';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
await page.goto(url, { waitUntil: 'networkidle' });
await page.addStyleTag({ content: '*{transition:none !important}' });
await page.evaluate(() => {
  const b = document.createElement('button');
  b.id = '__ctl';
  b.textContent = 'planted';
    const st = document.createElement('style');
  st.textContent = '#__ctl{position:fixed;left:8px;top:8px;z-index:99999;background:rgb(1,2,3)} #__ctl:hover{background:rgb(9,9,9)}';
  document.head.append(st); document.body.append(b);
});

const ctl = page.locator('#__ctl');
const bgOf = () => ctl.evaluate((n) => getComputedStyle(n).backgroundColor);
await page.mouse.move(0, 0);
const cb = await bgOf();
await ctl.hover();
const control = cb !== (await bgOf());

const snap = (el) => el.evaluate((n) => { const c = getComputedStyle(n); return [c.backgroundColor, c.color, c.borderColor, c.textDecorationLine, c.boxShadow].join('|'); });
const targets = await page.locator('a[href], button').all();
let changed = 0;
const still = [];
for (const t of targets) {
  if (!(await t.isVisible())) continue;
  const id = await t.getAttribute('id');
  await page.mouse.move(0, 0);
  const before = await snap(t);
  await t.hover({ timeout: 2000 }).catch(() => {});
  const after = await snap(t);
  const label = ((await t.innerText().catch(() => '')) || (await t.getAttribute('aria-label')) || '').trim().slice(0, 30);
  if (id === '__ctl') continue;
  if (before !== after) changed++;
  else still.push(label);
}
console.log(`planted control registered: ${control}`);
console.log(`controls with a hover change: ${changed}; without: ${still.length} ${JSON.stringify(still)}`);
await browser.close();
process.exit(control ? 0 : 2);
