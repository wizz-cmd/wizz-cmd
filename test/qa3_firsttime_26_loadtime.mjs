// Step 26: time from navigation to the first title frame (LOADING -> title) inside the iframe, with 1x and 6x CPU throttle (mid-range phone), and rAF pacing in the first round
import fs from 'fs';
import http from 'http';
import { createRequire } from 'module';
import { FRAG, SKEL, OUT, AUDIO_SPY, wait } from './qa3_firsttime_lib.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
function serve(map) { return new Promise((res) => { const srv = http.createServer((q, r) => { const e = map[q.url.split('?')[0]]; if (!e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(e); }); srv.listen(0, '127.0.0.1', () => res({ port: srv.address().port, close: () => new Promise((x) => srv.close(x)) })); }); }
for (const rate of [1, 4, 6]) {
  const game = await serve({ '/game.html': SKEL(FRAG) });
  const host = await serve({ '/': `<!doctype html><html><body style="margin:0"><iframe id="f" sandbox="allow-scripts" src="http://127.0.0.1:${game.port}/game.html" style="display:block;width:100%;height:100vh;border:0"></iframe></body></html>` });
  const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${host.port}/`);
  let frame = null; for (let i = 0; i < 200 && !frame; i++) { frame = page.frames().find((f) => f.url().includes('/game.html')); if (!frame) await wait(50); }
  await frame.waitForFunction(() => !!window.__fizzpop);
  // poll until the scene is 'title' without forcing the boot (the hooks finish the boot on first use, so only read the DOM)
  const tHook = Date.now() - t0;
  await frame.evaluate(() => { window.__fz = window.__fizzpop; });
  let tTitle = null;
  for (let i = 0; i < 400; i++) { const s = await frame.evaluate(() => { try { return window.__fizzpop.scene(); } catch (e) { return 'err'; } }); if (s === 'title') { tTitle = Date.now() - t0; break; } await wait(25); }
  // frame pacing while idle on title for 2 s
  const pacing = await frame.evaluate(() => new Promise((res) => { const ts = []; let n = 0; function f(t) { ts.push(t); if (++n < 120) requestAnimationFrame(f); else { const d = ts.slice(1).map((v, i) => v - ts[i]).sort((a, b) => a - b); res({ med: d[d.length >> 1], p95: d[Math.floor(d.length * 0.95)], max: d[d.length - 1] }); } } requestAnimationFrame(f); }));
  console.log(`cpu x${rate}: hook ready ${tHook} ms, title ready ${tTitle} ms, rAF pacing`, JSON.stringify(pacing));
  await browser.close(); await game.close(); await host.close();
}
