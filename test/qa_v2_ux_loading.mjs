// QA v2 (ux lens): the LOADING moment. Holds the page's first rAF / setTimeout (so finishBoot has not run) and screenshots what a user sees
// while the heavy bake work is pending, then releases and screenshots the first title frames. Sandboxed cross-origin iframe, real gesture rules.
import fs from 'fs';
import path from 'path';
import http from 'http';
import { createRequire } from 'module';
import { PROJECT, OUT, wait, FRAG, SKEL } from './qa_v2_ux_lib.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');

const HOLD = `(() => {
  if (window.top === window) return;                 // only inside the game iframe
  const q = []; let hold = true;
  const raf = window.requestAnimationFrame.bind(window), st = window.setTimeout.bind(window);
  window.requestAnimationFrame = (cb) => { if (hold) { q.push(['r', cb]); return 1; } return raf(cb); };
  window.setTimeout = (cb, ms, ...a) => { if (hold && typeof cb === 'function') { q.push(['t', cb, ms, a]); return 1; } return st(cb, ms, ...a); };
  window.__release = () => { hold = false; for (const e of q.splice(0)) { if (e[0] === 'r') raf(e[1]); else st(e[1], 0, ...(e[3] || [])); } };
  window.__held = () => hold;
})();`;

function serve(map) {
  return new Promise((res) => {
    const srv = http.createServer((req, rsp) => { const e = map[req.url.split('?')[0]]; if (!e) { rsp.writeHead(404); rsp.end('nf'); return; } rsp.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); rsp.end(e); });
    srv.listen(0, '127.0.0.1', () => res({ port: srv.address().port, close: () => new Promise((r) => srv.close(r)) }));
  });
}

const cfgs = [
  { w: 1280, h: 800, dpr: 1, touch: false, name: 'desk1' },
  { w: 1280, h: 800, dpr: 2, touch: false, name: 'desk2' },
  { w: 390, h: 844, dpr: 3, touch: true, name: 'ph390' },
  { w: 360, h: 740, dpr: 3, touch: true, name: 'ph360' },
  { w: 844, h: 390, dpr: 3, touch: true, name: 'land844' },
];
const only = process.argv[2];
for (const c of cfgs) {
  if (only && c.name !== only) continue;
  const game = await serve({ '/game.html': SKEL(FRAG) });
  const host = await serve({ '/': `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#222"><iframe id="f" sandbox="allow-scripts" src="http://127.0.0.1:${game.port}/game.html" style="display:block;width:100%;height:100vh;border:0"></iframe></body></html>` });
  const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
  const context = await browser.newContext({ viewport: { width: c.w, height: c.h }, deviceScaleFactor: c.dpr, hasTouch: c.touch, isMobile: c.touch });
  await context.addInitScript(HOLD);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${host.port}/`, { waitUntil: 'load' });
  let frame = null;
  for (let i = 0; i < 60 && !frame; i++) { frame = page.frames().find((f) => f.url().includes('/game.html')); if (!frame) await wait(100); }
  await wait(300);
  const held = await frame.evaluate(() => window.__held && window.__held());
  const info = await frame.evaluate(() => { const cv = document.getElementById('screen'); const r = cv.getBoundingClientRect(); return { held: window.__held && window.__held(), cv: [cv.width, cv.height, Math.round(r.width), Math.round(r.height)], focusHidden: document.getElementById('focus').hidden, loadingMs: window.__fizzpop && window.__fizzpop.loadingMs, bootMs: window.__fizzpop && window.__fizzpop.bootMs }; });
  console.log(c.name, 'held=', held, JSON.stringify(info));
  await page.screenshot({ path: path.join(OUT, `loading_${c.name}_0_held.png`) });
  await frame.evaluate(() => window.__release());
  await wait(80);
  await page.screenshot({ path: path.join(OUT, `loading_${c.name}_1_after80.png`) });
  await wait(1200);
  await page.screenshot({ path: path.join(OUT, `loading_${c.name}_2_settled.png`) });
  const info2 = await frame.evaluate(() => ({ bootMs: window.__fizzpop.bootMs, prof: window.__fizzpop.bootProfile, scene: window.__fizzpop.scene(), focusHidden: document.getElementById('focus').hidden, lay: window.__fizzpop._main.layout() }));
  console.log(c.name, 'after', JSON.stringify(info2), 'errors', errors);
  await browser.close(); await game.close(); await host.close();
}
