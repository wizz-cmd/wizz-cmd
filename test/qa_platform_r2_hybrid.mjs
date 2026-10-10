// Hybrid laptop / desktop panel: first touch event flips the page into touch layout. How much canvas is lost?
import { launchBrowser, DIST, OUT, sleep } from './qa_platform_r2_lib.mjs';
const browser = await launchBrowser();
for (const [w, h] of [[700, 600], [900, 700], [1024, 700], [1280, 800], [800, 600], [600, 500]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const page = await ctx.newPage(); await page.goto('file://' + DIST); await sleep(250);
  const L = () => page.evaluate(() => { const l = window.__fizzpop._main.layout(); return `${l.w}x${l.h} (x${l.scale.toFixed(2)}) touch=${l.touch} land=${l.land}`; });
  const before = await L();
  await page.evaluate(() => { document.getElementById('screen').dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', pointerId: 7, clientX: 10, clientY: 10, bubbles: true })); });
  await sleep(250);
  const after = await L();
  if (w === 700) await page.screenshot({ path: `${OUT}/hybrid_after_touch_${w}x${h}.png` });
  console.log(`${w}x${h}@2`.padEnd(11), 'before:', before.padEnd(36), 'after first touch:', after);
  await ctx.close();
}
await browser.close();
