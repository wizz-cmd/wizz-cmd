// FIZZ & POP — layout matrix (U2 / U8 / U11 / U16 / U18 / Ut2 / Ut4): every viewport x DPR x touch/desktop combination loads the
// REAL build (dist/fizzpop.html), is checked numerically and screenshotted for a human look, plus the same in a sandboxed
// cross-origin iframe. Usage: node test/main_matrix.mjs [--quick]   -> out/main/matrix/*.png (exit 1 on any failure)
import fs from 'fs';
import http from 'http';
import path from 'path';
import { launch, pageShot, fp, PROJECT } from '../tools/harness.mjs';

const OUT = path.join(PROJECT, 'out', 'main', 'matrix');
fs.mkdirSync(OUT, { recursive: true });
const HTML = path.join(PROJECT, 'dist', 'fizzpop.html');
const QUICK = process.argv.includes('--quick');
let failed = 0, passed = 0;
const check = (name, cond, extra = '') => { if (cond) passed++; else failed++; if (!cond || process.env.VERBOSE) console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '   ' + extra}`); };

const VIEWPORTS = [[360, 740, true], [390, 844, true], [412, 915, true], [844, 390, true], [768, 1024, true], [1280, 800, false], [1920, 1080, false]];
const DPRS = QUICK ? [1, 3] : [1, 2, 3];

/** Numbers measured inside the page (works in the top page and in a frame). */
const measure = () => {
  const rc = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, r: b.right, b: b.bottom, w: b.width, h: b.height, vis: getComputedStyle(e).display !== 'none' }; };
  const btns = [...document.querySelectorAll('#touch button')].map((b) => { const r = b.getBoundingClientRect(); return { k: b.dataset.k, x: r.x, y: r.y, r: r.right, b: r.bottom, w: r.width, h: r.height }; });
  return { lay: window.__fizzpop._main.layout(), c: rc('#screen'), legend: rc('#legend'), touch: rc('#touch'), pads: rc('#touch .pads'), strip: rc('[data-k="pause"]'), btns, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight,
    rows: window.__fizzpop._main.rows(), ir: getComputedStyle(document.getElementById('screen')).imageRendering, cw: document.getElementById('screen').width };
};

function verify(label, m, touch) {
  const L = m.lay, c = m.c;
  check(`${label}: zero scroll`, m.sw <= m.iw && m.sh <= m.ih + 1, JSON.stringify({ sw: m.sw, iw: m.iw, sh: m.sh, ih: m.ih }));
  check(`${label}: picture inside the viewport with 16px gutters (8px in the translucent-pad fallback)`, c.x >= (L.mode === 'over' ? 7.5 : 15.5) && c.r <= m.iw - (L.mode === 'over' ? 7.5 : 15.5) && c.y >= 0 && c.b <= m.ih + 0.5, JSON.stringify(c));
  check(`${label}: 8:7 aspect`, Math.abs(c.w / c.h - 256 / 224) < 0.01);
  // v2: resolution independent. Backing store = 256k x 224k, k on a 0.25 step in 1..8, image-rendering auto (never pixelated); when the
  // layout snapped to a whole step the backing store is mapped 1:1 onto the device pixels (crisp), otherwise the browser resamples smoothly.
  check(`${label}: image-rendering auto; backing store 256k x 224k, k = ${L.k}`, m.ir === 'auto' && m.cw === 256 * L.k && Math.abs(L.k * 4 - Math.round(L.k * 4)) < 1e-9 && L.k >= 1 && L.k <= 8 && L.k === L.m && !L.sharp, JSON.stringify({ ir: m.ir, cw: m.cw, L }));
  if (L.snapped) {                                             // crisp: one backing pixel per device pixel
    const dev = (c.w * L.dpr) / 256;
    check(`${label}: crisp, ${dev.toFixed(3)} device px per logical px = k ${L.k}`, Math.abs(dev - L.k) < 0.02 * L.k, String(dev));
  } else check(`${label}: not snapped: smooth resample from k ${L.k} (device px per logical px ${((c.w * L.dpr) / 256).toFixed(3)}, within 8 % unless k is capped at 8)`, Math.abs(((c.w * L.dpr) / 256) / L.k - 1) < 0.08 || L.k === 8 || L.k < L.kNat, String(((c.w * L.dpr) / 256) / L.k));
  if (touch) {
    check(`${label}: touch UI visible, legend hidden`, m.touch.vis && !(m.legend && m.legend.vis && m.legend.h > 0));
    const big = m.btns.filter((b) => ['left', 'right', 'jump', 'fire'].includes(b.k)), pills = m.btns.filter((b) => b.k === 'pause' || b.k === 'sound');
    check(`${label}: four big buttons >= 44 css px each way (${big.map((b) => Math.round(b.w) + 'x' + Math.round(b.h)).join(' ')})`, big.length === 4 && big.every((b) => b.w >= 44 && b.h >= 44));
    check(`${label}: PAUSE / SOUND are 44 px tall`, pills.length === 2 && pills.every((b) => b.h >= 43.5));
    check(`${label}: every button on screen`, m.btns.every((b) => b.x >= -0.5 && b.y >= -0.5 && b.r <= m.iw + 0.5 && b.b <= m.ih + 0.5), JSON.stringify(m.btns));
    if (L.mode !== 'over') {
      const hit = m.btns.filter((b) => b.x < c.r - 0.5 && b.r > c.x + 0.5 && b.y < c.b - 0.5 && b.b > c.y + 0.5);
      check(`${label}: no button covers the picture`, hit.length === 0, JSON.stringify(hit));
    }
    const fire = m.btns.find((b) => b.k === 'fire');
    for (const p of pills) check(`${label}: ${p.k} is not within 8 px of BUBBLE`, !(p.r + 8 > fire.x && p.x - 8 < fire.r && p.b + 8 > fire.y && p.y - 8 < fire.b), JSON.stringify({ p, fire }));
    if (m.rows) check(`${label}: title rows >= ${m.rows.length > 0 ? 40 : 0} css px (${m.rows.map((r) => Math.round(r.h * L.scale)).join('/')})`, m.rows.every((r) => r.h * L.scale >= 39.5) || L.scale < 0.95, JSON.stringify({ rows: m.rows, s: L.scale }));
    // K2 / v3 V4: controls rest at the bottom of the viewport (8 px page padding, no empty band below them); the picture and the PAUSE / SOUND strip under it are centred in the space above the pads: two moderate gaps, none above 20 % of the page
    if (L.mode === 'port') {
      const topGap = c.y - 8, midGap = m.pads.y - m.strip.b;
      check(`${label}: portrait: controls anchored at the bottom, picture + strip centred above the pads (gaps ${topGap.toFixed(0)} / ${midGap.toFixed(0)})`, m.touch.b >= m.ih - 8 - 1.5 && m.touch.b <= m.ih - 8 + 1.5 && Math.abs(topGap - midGap) < 3 && m.strip.y >= c.b - 0.5, JSON.stringify({ cy: c.y, cb: c.b, ty: m.touch.y, tb: m.touch.b, py: m.pads.y, sb: m.strip.b, ih: m.ih }));
      check(`${label}: portrait: no dead band over 20 % of the page (${topGap.toFixed(0)} / ${midGap.toFixed(0)} of ${m.ih})`, topGap <= 0.2 * m.ih && midGap <= 0.2 * m.ih, JSON.stringify({ topGap, midGap }));
    }
  } else {
    check(`${label}: touch UI hidden on desktop`, !m.touch.vis);
  }
}

const results = [];
for (const [w, h, touch] of VIEWPORTS) {
  for (const dpr of DPRS) {
    const label = `${w}x${h}@${dpr}${touch ? ' touch' : ''}`;
    const t = await launch({ html: HTML, viewport: { width: w, height: h }, touch, deviceScaleFactor: dpr });
    const g = fp(t.page);
    await t.page.waitForFunction(() => !!window.__fizzpop);
    await g.freeze(true); await g.step(30);
    await t.page.waitForTimeout(150);
    const m = await t.page.evaluate(measure);
    verify(label, m, touch);
    results.push(`${label}: ${m.lay.mode} x${m.lay.scale.toFixed(3)} k=${m.lay.k} ${m.lay.snapped ? 'crisp' : 'smooth'}${m.lay.legend ? ' +legend' : ''}`);
    await pageShot(t.page, path.join(OUT, `${w}x${h}_d${dpr}${touch ? '_touch' : ''}_title.png`));
    // and in the middle of a game
    await g.start(1, 6, 3); await g.step(240);
    const m2 = await t.page.evaluate(measure);
    verify(label + ' (playing)', m2, touch);
    if (dpr === DPRS[0]) await pageShot(t.page, path.join(OUT, `${w}x${h}_d${dpr}${touch ? '_touch' : ''}_play.png`));
    check(`${label}: zero console errors`, t.errors.length === 0, JSON.stringify(t.errors));
    await t.close();
  }
}

// ---- the same inside a sandboxed cross-origin iframe -----------------------------------------------------------------
function serve(map) {
  return new Promise((res) => {
    const srv = http.createServer((req, rsp) => {
      const e = map[req.url.split('?')[0]];
      if (!e) { rsp.writeHead(404); rsp.end('nf'); return; }
      rsp.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      rsp.end(e);
    });
    srv.listen(0, '127.0.0.1', () => res({ port: srv.address().port, close: () => new Promise((r) => srv.close(r)) }));
  });
}
const html = fs.readFileSync(HTML, 'utf8');
for (const [w, h, touch] of VIEWPORTS) {
  for (const dpr of QUICK ? [2] : [1, 3]) {
    const label = `iframe ${w}x${h}@${dpr}${touch ? ' touch' : ''}`;
    const game = await serve({ '/g.html': html });
    const host = await serve({ '/': `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#222"><iframe id="f" sandbox="allow-scripts" src="http://127.0.0.1:${game.port}/g.html" style="display:block;width:100%;height:100vh;border:0"></iframe></body></html>` });
    const t = await launch({ html: `http://127.0.0.1:${host.port}/`, viewport: { width: w, height: h }, touch, deviceScaleFactor: dpr });
    let frame = null;
    for (let i = 0; i < 60 && !frame; i++) { frame = t.page.frames().find((f) => f.url().includes('/g.html')); if (!frame) await t.page.waitForTimeout(100); }
    await frame.waitForFunction(() => !!window.__fizzpop, null, { timeout: 10000 });
    await t.page.waitForTimeout(500);
    await frame.evaluate(() => { window.fz = window.__fizzpop; fz.freeze(true); fz.step(30); });
    const m = await frame.evaluate(measure);
    verify(label, m, touch);
    await pageShot(t.page, path.join(OUT, `iframe_${w}x${h}_d${dpr}${touch ? '_touch' : ''}.png`));
    check(`${label}: zero console errors`, t.errors.length === 0, JSON.stringify(t.errors));
    await t.close(); await game.close(); await host.close();
  }
}

if (process.env.VERBOSE) console.log(results.join('\n'));
console.log(`\n${failed ? failed + ' FAILED, ' : ''}${passed} passed (${VIEWPORTS.length} viewports x ${DPRS.length} DPRs + iframes)`);
process.exit(failed ? 1 : 0);
