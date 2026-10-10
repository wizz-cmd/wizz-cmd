// Touch-screen laptop (hasTouch, pointer: fine): the FIRST touch switches the page into touch layout inside the pointerdown handler.
// The tap position was measured in the OLD layout but is mapped through the NEW canvas rect.
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { log, check } from './qa3_diffreview_lib.mjs';
import path from 'path';
const url = 'file://' + path.resolve('dist/fizzpop.html');
const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
for (const [w, h] of [[1280, 800], [1024, 768], [1920, 1080]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(url); await page.waitForFunction(() => !!window.__fizzpop); await page.evaluate(() => window.__fizzpop.scene());
  await page.waitForTimeout(400);
  const before = await page.evaluate(() => { const r = document.getElementById('screen').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, rows: window.__fizzpop._main.rows(), touch: window.__fizzpop._main.touchMode() }; });
  // row "1 PLAYER" centre in the CURRENT (desktop) layout
  const row = before.rows.find((r) => r.id === 'p1');
  const tx = before.x + ((row.x0 + row.x1) / 2) * before.w / 256, ty = before.y + (row.top + row.h / 2) * before.h / 224;
  await page.touchscreen.tap(tx, ty);
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({ scene: window.__fizzpop.scene(), touch: window.__fizzpop._main.touchMode(), r: (() => { const r = document.getElementById('screen').getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); })() }));
  log(`${w}x${h}: before canvas ${[before.x, before.y, before.w, before.h].map(Math.round)} touchMode=${before.touch}; tapped row p1 at (${Math.round(tx)},${Math.round(ty)}) -> scene=${after.scene} touchMode=${after.touch} canvas ${after.r}`);
  check(`FT1 ${w}x${h}: the very first touch on a touch-screen laptop starts the game when it hits 1 PLAYER`, after.scene === 'story', after);
  await ctx.close();
}
await browser.close();
