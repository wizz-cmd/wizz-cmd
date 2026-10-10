// Average cost of one full vector redraw per scene (CPU/software raster in headless Chromium; a GPU canvas will be much faster).
// usage: node perf.mjs      (see notes.md "Cost per frame")
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
const { chromium } = createRequire(import.meta.url)('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ headless: true });
for (const hash of ['gameplay', 'title', 'cast']) {
  const page = await browser.newPage({ viewport: { width: 1700, height: 1000 } });
  await page.goto('file://' + path.join(here, 'mockup.html') + '?still#' + hash);
  await page.waitForFunction(() => window.__ready === true);
  console.log(JSON.stringify(await page.evaluate(() => window.__measure(12))));
  await page.close();
}
await browser.close();
