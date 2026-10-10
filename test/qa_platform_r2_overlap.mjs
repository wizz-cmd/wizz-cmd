// For many touch viewports: does any touch button overlap the canvas (covering the game picture) or leave the viewport?
import { launchBrowser, DIST, save } from './qa_platform_r2_lib.mjs';
const browser = await launchBrowser();
const sizes = [[320, 568], [360, 640], [360, 740], [375, 667], [390, 844], [412, 915], [430, 932], [568, 320], [640, 360], [667, 375], [740, 360], [812, 375], [844, 390], [915, 412], [932, 430], [600, 400], [768, 1024], [1024, 768], [820, 1180], [1180, 820]];
const rows = [];
for (const [w, h] of sizes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await ctx.newPage(); await page.goto('file://' + DIST); await page.waitForTimeout(250);
  const r = await page.evaluate(() => {
    const R = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
    const c = R(document.getElementById('screen')); const out = { canvas: c, vw: innerWidth, vh: innerHeight, over: [], off: [] };
    document.querySelectorAll('#touch [data-k]').forEach((bt) => { const b = R(bt); const ix = Math.min(c.r, b.r) - Math.max(c.l, b.l), iy = Math.min(c.b, b.b) - Math.max(c.t, b.t);
      if (ix > 0 && iy > 0) out.over.push(`${bt.dataset.k}:${Math.round(ix)}x${Math.round(iy)}px`);
      if (b.l < 0 || b.t < 0 || b.r > innerWidth || b.b > innerHeight) out.off.push(bt.dataset.k); });
    return out;
  });
  rows.push({ vp: `${w}x${h}`, canvasW: Math.round(r.canvas.r - r.canvas.l), overlap: r.over.join(' ') || '-', offscreen: r.off.join(' ') || '-' });
  console.log(`${w}x${h}`.padEnd(10), 'canvasW', String(Math.round(r.canvas.r - r.canvas.l)).padEnd(5), 'overlap', (r.over.join(' ') || '-').padEnd(30), 'offscreen', r.off.join(' ') || '-');
  await ctx.close();
}
await browser.close(); save('overlap.json', rows);
