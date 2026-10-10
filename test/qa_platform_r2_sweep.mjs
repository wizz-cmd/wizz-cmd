// Sweep viewport sizes (as an Artifact iframe could be) and report how much of the possible canvas size the layout uses.
import { launchBrowser, DIST, save, OUT } from './qa_platform_r2_lib.mjs';
const browser = await launchBrowser();
const rows = [];
async function run(touch, dpr, sizes) {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: dpr, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  await page.goto('file://' + DIST);
  await page.waitForTimeout(300);
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(120);
    const m = await page.evaluate(() => {
      const L = window.__fizzpop._main.layout(); const c = document.getElementById('screen').getBoundingClientRect();
      const lg = document.getElementById('legend'), tb = document.getElementById('touch');
      return { L, canvasW: c.width, canvasH: c.height, legendH: lg ? lg.offsetHeight : 0, legendDisp: getComputedStyle(lg).display, touchH: tb.offsetHeight, ovX: document.documentElement.scrollWidth > innerWidth, ovY: document.documentElement.scrollHeight > innerHeight, top: c.top, bottom: innerHeight - c.bottom };
    });
    const maxFit = Math.min((w - 32) / 256, (h - 16) / 224);           // best case ignoring legend/controls
    rows.push({ touch, dpr, w, h, canvas: `${m.canvasW}x${m.canvasH}`, scale: +(m.canvasW / 256).toFixed(2), maxFitNoChrome: +maxFit.toFixed(2), pct: +(100 * m.canvasW * m.canvasH / (w * h)).toFixed(0), land: m.L.land, legendH: m.legendDisp === 'none' ? 0 : m.legendH, touchH: m.touchH, ovX: m.ovX, ovY: m.ovY, top: +m.top.toFixed(0) });
  }
  await ctx.close();
}
const artSizes = []; for (const w of [360, 480, 600, 700, 800, 900, 1000, 1200]) for (const h of [300, 400, 500, 600, 700, 800]) artSizes.push([w, h]);
await run(false, 1, artSizes);
await run(false, 2, artSizes);
await run(true, 3, [[390, 844], [390, 700], [390, 600], [390, 500], [390, 400], [390, 300], [360, 300], [480, 270], [568, 320], [640, 360], [700, 400], [600, 500], [768, 600], [320, 568]]);
await browser.close();
save('sweep.json', rows);
for (const r of rows.filter((r) => !r.touch && r.dpr === 1)) console.log(`noTouch dpr1 ${r.w}x${r.h}`.padEnd(24), 'canvas', r.canvas.padEnd(9), '×' + r.scale, 'ideal×' + r.maxFitNoChrome, 'legend', r.legendH, 'area%', r.pct, r.ovY ? 'OVERFLOW-Y' : '');
console.log('--- touch');
for (const r of rows.filter((r) => r.touch)) console.log(`touch ${r.w}x${r.h}`.padEnd(20), 'canvas', r.canvas.padEnd(9), '×' + r.scale, 'land', r.land, 'touchBar', r.touchH, 'area%', r.pct, 'ovX', r.ovX, 'ovY', r.ovY, 'top', r.top);
