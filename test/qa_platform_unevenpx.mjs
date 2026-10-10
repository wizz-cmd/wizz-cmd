// QA platform: quantify uneven nearest-neighbour pixel widths when the canvas is scaled to a non-integer device-pixel ratio.
// Takes a real screenshot of the canvas element, measures the run length distribution of device pixels per game pixel
// along the central row of the title logo; saves a zoomed crop.
import fs from 'fs'; import path from 'path';
import { open, launchBrowser, ev, OUT, log } from './qa_platform_lib.mjs';
const D = path.join(OUT, 'layout'); fs.mkdirSync(D, { recursive: true });
const browser = await launchBrowser();
for (const [name, w, h, dpr, touch] of [['ph360_dpr2', 360, 740, 2, true], ['ph390_dpr3', 390, 844, 3, true], ['art900x500_dpr1', 900, 500, 1, false], ['d1280_dpr1', 1280, 800, 1, false]]) {
  const t = await open({ browser, viewport: { width: w, height: h }, touch, dpr });
  await ev(t.page, () => { fz.freeze(true); fz.start(1, 1, 7); fz.step(200); });
  await t.page.waitForTimeout(100);
  const box = await t.page.locator('#screen').boundingBox();
  const file = path.join(D, `uneven_${name}.png`);
  await t.page.screenshot({ path: file, clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 120) } });
  // measure: read the same canvas through screenshot -> compute run lengths of a distinct-colour boundary in the device-pixel image
  const stats = await ev(t.page, () => {
    const cv = document.getElementById('screen');
    const r = cv.getBoundingClientRect(); const dpr = devicePixelRatio;
    const devW = Math.round(r.width * dpr);
    // ideal: each game pixel maps to devW/256 device px; with nearest neighbour the width of game pixel i is floor((i+1)*s)-floor(i*s)
    const s = devW / 256; const widths = {};
    for (let i = 0; i < 256; i++) { const wd = Math.round((i + 1) * s) - Math.round(i * s); widths[wd] = (widths[wd] || 0) + 1; }
    return { devW, s: +s.toFixed(3), widths };
  });
  log(name, JSON.stringify(stats), 'errors', t.errors.length);
  await t.close();
}
await browser.close();
