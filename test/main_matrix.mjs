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
  return { lay: window.__fizzpop._main.layout(), c: rc('#screen'), legend: rc('#legend'), touch: rc('#touch'), btns, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight,
    rows: window.__fizzpop._main.rows(), ir: getComputedStyle(document.getElementById('screen')).imageRendering, cw: document.getElementById('screen').width };
};

function verify(label, m, touch) {
  const L = m.lay, c = m.c;
  check(`${label}: zero scroll`, m.sw <= m.iw && m.sh <= m.ih + 1, JSON.stringify({ sw: m.sw, iw: m.iw, sh: m.sh, ih: m.ih }));
  check(`${label}: picture inside the viewport with 16px gutters (8px in the translucent-pad fallback)`, c.x >= (L.mode === 'over' ? 7.5 : 15.5) && c.r <= m.iw - (L.mode === 'over' ? 7.5 : 15.5) && c.y >= 0 && c.b <= m.ih + 0.5, JSON.stringify(c));
  check(`${label}: 8:7 aspect`, Math.abs(c.w / c.h - 256 / 224) < 0.01);
  const exp = L.sharp ? 'auto' : 'pixelated';
  check(`${label}: image-rendering ${exp}; backing store ${L.m}x`, m.ir === exp && m.cw === 256 * L.m, JSON.stringify({ ir: m.ir, cw: m.cw, L }));
  if (!L.sharp) {                                              // crisp: a whole number of device pixels per game pixel
    const dev = (c.w * L.dpr) / 256;
    check(`${label}: whole device pixels per game pixel (${dev.toFixed(3)})`, Math.abs(dev - Math.round(dev)) < 0.01 && dev >= 1, String(dev));
  }
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
    // K2: controls rest at the bottom of the viewport (8 px page padding, no empty band below them); the picture is centred in the space above
    if (L.mode === 'port') check(`${label}: portrait: controls anchored at the bottom, picture centred above them`, m.touch.b >= m.ih - 8 - 1.5 && m.touch.b <= m.ih - 8 + 1.5 && Math.abs((c.y - 8) - (m.touch.y - c.b)) < 2, JSON.stringify({ cy: c.y, cb: c.b, ty: m.touch.y, tb: m.touch.b, ih: m.ih }));
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
    results.push(`${label}: ${m.lay.mode} x${m.lay.scale.toFixed(3)} ${m.lay.sharp ? 'sharp m=' + m.lay.m : 'crisp'}${m.lay.legend ? ' +legend' : ''}`);
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
