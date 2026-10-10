// Renders gameplay.png / title.png / cast.png from mockup.html (Chromium via Playwright, deterministic still frames).
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const { chromium } = createRequire(import.meta.url)('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const page_url = 'file://' + path.join(here, 'mockup.html');
const jobs = [['gameplay', 1024, 896], ['title', 1024, 896], ['cast', 1600, 600]];
const only = process.argv.slice(2);

const browser = await chromium.launch({ headless: true });
let bad = 0;
for (const [name, w, h] of jobs) {
  if (only.length && !only.includes(name)) continue;
  const page = await browser.newPage({ viewport: { width: w + 40, height: h + 160 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  page.on('requestfailed', (r) => errors.push('[requestfailed] ' + r.url()));
  await page.goto(`${page_url}?still#${name}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  const dataUrl = await page.evaluate(() => document.getElementById('c').toDataURL('image/png'));
  const out = path.join(here, `${name}.png`);
  fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log(`${name}.png ${w}x${h}  console errors: ${errors.length}`);
  errors.forEach((e) => console.log('   ' + e));
  bad += errors.length;
  await page.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
