import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { HTML, BUSY, DRIVE, sleep, OUT, traceRun } from './qa_v2_perf_lib.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
for (const v of ['base', 'hzcap']) {
  const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--disable-frame-rate-limit', '--disable-gpu-vsync'] });
  const context = await browser.newContext({ viewport: { width: 900, height: 760 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await page.goto('file://' + (v === 'base' ? HTML : path.join(OUT, 'variants', v + '.html')));
  await page.waitForFunction(() => !!window.__fizzpop && window.__fizzpop.bootMs >= 0);
  await page.evaluate(({ setup, drive }) => { fz = window.__fizzpop; fz.freeze(true); (0, eval)(setup); fz._main.setQuality(2, true); fz.freeze(false); const drv = (0, eval)('(' + drive + ')'); let n = 0; window.__drive = setInterval(() => { n++; drv(n); }, 16); window.__fr = []; let last = performance.now(); const tick = (ts) => { window.__fr.push(ts - last); last = ts; requestAnimationFrame(tick); }; requestAnimationFrame(tick); }, { setup: BUSY, drive: DRIVE(false) });
  await sleep(2500);
  const t = { page, cdp };
  const r = await traceRun(t, 5);
  const busy = r.perFrame.beginMainFrame * r.frames / 5000 * 100;
  console.log(`${v}: ${r.frames} main frames in 5 s (${(r.frames / 5).toFixed(0)}/s), main-thread frame ${r.perFrame.beginMainFrame} ms => main thread ${busy.toFixed(0)} % busy; rAF avg ${r.rAF.avg} ms; viz ${r.perFrame.vizDrawAndSwap}`);
  await browser.close();
}
