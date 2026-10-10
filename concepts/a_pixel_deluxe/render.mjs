// Renders the three Concept A mockup views to PNG with Playwright (Chromium, headless) and writes palette.json.
// Usage: node render.mjs [gameplay|title|cast ...]
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const { chromium } = createRequire(import.meta.url)('playwright');

const dir = path.dirname(fileURLToPath(import.meta.url));
const url = 'file://' + path.join(dir, 'mockup.html');
const views = { gameplay: [1024, 896], title: [1024, 896], cast: [1600, 600] };
const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(views);

const browser = await chromium.launch({ headless: true });
let failed = false;
for (const name of want) {
  const [w, h] = views[name];
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', e => errors.push('pageerror: ' + (e.stack || e)));
  page.on('requestfailed', r => errors.push('requestfailed: ' + r.url()));
  await page.goto(url + '#' + name);
  await page.waitForFunction('window.__ready === true', null, { timeout: 120000 });
  const ms = await page.evaluate(() => window.__renderMs);
  const data = await page.evaluate(() => document.getElementById('screen').toDataURL('image/png'));
  fs.writeFileSync(path.join(dir, name + '.png'), Buffer.from(data.split(',')[1], 'base64'));
  if (name === 'gameplay') {
    const pal = await page.evaluate(() => PALETTE_JSON().map(p => ({ name: p.name, hex: p.hex, role: p.role })));
    fs.writeFileSync(path.join(dir, 'palette.json'), JSON.stringify(pal, null, 2) + '\n');
  }
  console.log(`${name}.png ${w}x${h}  render ${ms} ms  console errors: ${errors.length}`);
  errors.forEach(e => console.log('   ', e));
  if (errors.length) failed = true;
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
