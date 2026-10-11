// High-refresh displays: rAF faster than 60 Hz => how many renders per fixed update? (uncapped rAF emulates 120/144 Hz)
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { HTML, BUSY, DRIVE, sleep, OUT } from './qa_v2_perf_lib.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--disable-frame-rate-limit', '--disable-gpu-vsync'] });
const context = await browser.newContext({ viewport: { width: 900, height: 760 } });
const page = await context.newPage();
await page.goto('file://' + HTML);
await page.waitForFunction(() => !!window.__fizzpop && window.__fizzpop.bootMs >= 0);
const r = await page.evaluate(async ({ setup, drive }) => {
  fz = window.__fizzpop; fz.freeze(true); (0, eval)(setup); fz._main.setQuality(2, true);
  let upd = 0, ren = 0, renSame = 0;
  const G = fz.Game, u0 = G.update, r0 = G.render;
  G.update = function (...a) { upd++; return u0.apply(this, a); };
  G.render = function (...a) { ren++; return r0.apply(this, a); };
  const cv = document.getElementById('screen'), cx = cv.getContext('2d');
  fz.freeze(false);
  const drv = (0, eval)('(' + drive + ')'); let n = 0; const iv = setInterval(() => { n++; drv(n); }, 16);
  const fr = []; let last = performance.now(); let alive = true; const tick = (ts) => { fr.push(ts - last); last = ts; if (alive) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  await new Promise((r) => setTimeout(r, 5000));
  alive = false; clearInterval(iv);
  const avg = fr.reduce((x, y) => x + y, 0) / fr.length;
  return { upd, ren, frames: fr.length, avgRafMs: avg, rafHz: 1000 / avg };
}, { setup: BUSY, drive: DRIVE(false) });
console.log(JSON.stringify(r));
console.log(`rAF ${r.rafHz.toFixed(0)} Hz: ${r.upd} game updates, ${r.ren} Game.render calls in 5 s => ${(r.ren / r.upd).toFixed(2)} renders per update`);
await browser.close();
