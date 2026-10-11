// QA v2 (ux lens): shared helpers. Loads dist/fizzpop.artifact.html inside a minimal doctype skeleton in a
// sandboxed cross-origin iframe (what a claude.ai Artifact is). Does NOT pass the autoplay-policy flag, so audio must
// really be unlocked by a user gesture inside the frame. Never edits src/.
import fs from 'fs';
import http from 'http';
import path from 'path';
import { createRequire } from 'module';
import { PROJECT } from '../tools/harness.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
export { PROJECT };
export const OUT = path.join(PROJECT, 'out', 'qa_v2', 'ux');
fs.mkdirSync(OUT, { recursive: true });
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const FRAG = fs.readFileSync(process.env.FT_FRAG || path.join(PROJECT, 'dist', 'fizzpop.artifact.html'), 'utf8');   // FT_FRAG: patched copy for fix verification
export const SKEL = (inner) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>:root{ padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }</style>
</head><body>
${inner}
</body></html>`;

export const results = [];
export const check = (name, ok, detail) => {
  results.push([name, ok]);
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '   ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''));
};

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

// Wraps AudioNode.connect so every node feeding ctx.destination ALSO feeds one analyser (real output level, per context).
export const AUDIO_SPY = `(() => {
  window.__spy = { ctxs: [], an: null, buf: null };
  const oc = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dst, ...r) {
    const out = oc.call(this, dst, ...r);
    try {
      if (dst && dst.constructor && dst.constructor.name === 'AudioDestinationNode') {
        const c = dst.context;
        if (!c.__an) { c.__an = c.createAnalyser(); c.__an.fftSize = 2048; c.__buf = new Float32Array(2048); window.__spy.ctxs.push(c); oc.call(this, c.__an); }
        else if (!this.__tapped) { oc.call(this, c.__an); }
        this.__tapped = true;
      }
    } catch (e) {}
    return out;
  };
  window.__level = () => { const c = window.__spy.ctxs[0]; if (!c) return null; c.__an.getFloatTimeDomainData(c.__buf); let s = 0, pk = 0; for (const v of c.__buf) { s += v * v; pk = Math.max(pk, Math.abs(v)); } return { rms: Math.sqrt(s / c.__buf.length), pk, state: c.state, t: c.currentTime }; };
})();`;

export async function open({ w = 1280, h = 800, touch = false, dpr = 1, sameOrigin = false, name = 'x', keepFocusOverlay = true, scheme = null } = {}) {
  const game = await serve({ '/game.html': SKEL(FRAG) });
  const sb = sameOrigin ? 'allow-scripts allow-same-origin' : 'allow-scripts';
  const host = await serve({ '/': `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#222"><iframe id="f" sandbox="${sb}" src="http://127.0.0.1:${game.port}/game.html" style="display:block;width:100%;height:100vh;border:0"></iframe></body></html>` });
  const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });   // NO autoplay-policy flag: real gesture rules
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: touch, isMobile: touch, ...(scheme ? { colorScheme: scheme } : {}) });
  await context.addInitScript(AUDIO_SPY);
  const page = await context.newPage();
  const errors = [], logs = [];
  page.on('console', (m) => { logs.push(`[${m.type()}] ${m.text()}`); if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e && e.message)));
  await page.goto(`http://127.0.0.1:${host.port}/`, { waitUntil: 'load' });
  let frame = null;
  for (let i = 0; i < 60 && !frame; i++) { frame = page.frames().find((f) => f.url().includes('/game.html')); if (!frame) await wait(100); }
  await frame.waitForFunction(() => !!window.__fizzpop, null, { timeout: 10000 });
  await frame.evaluate(() => { window.fz = window.__fizzpop; });
  const T = {
    page, frame, errors, logs, browser, context, w, h, touch,
    async close() { try { await browser.close(); } catch (e) {} await game.close(); await host.close(); },
    ev: (fn, ...a) => frame.evaluate(fn, ...a),
    async shot(label, { canvas = false } = {}) {
      const f = path.join(OUT, `${name}_${label}.png`);
      await page.screenshot({ path: f });
      if (canvas) {
        const d = await frame.evaluate(async () => {
          const el = document.getElementById('screen'); const src = el.toDataURL('image/png'); const img = new Image(); img.src = src; await img.decode();
          const o = document.createElement('canvas'); o.width = 256 * 3; o.height = 224 * 3; const c = o.getContext('2d'); c.imageSmoothingEnabled = false; c.drawImage(img, 0, 0, o.width, o.height); return o.toDataURL('image/png');
        });
        fs.writeFileSync(path.join(OUT, `${name}_${label}_cv.png`), Buffer.from(d.replace(/^data:image\/png;base64,/, ''), 'base64'));
      }
      return f;
    },
    scene: () => frame.evaluate(() => fz.scene()),
    st: () => frame.evaluate(() => { const s = fz.Game.debug.state(); return s; }),
    audio: () => frame.evaluate(() => ({ st: fz.AUDIO._state(), lvl: window.__level && window.__level() })),
    ui: () => frame.evaluate(() => ({
      focusHidden: document.getElementById('focus').hidden, hasFocus: document.hasFocus(), scene: fz.scene(),
      paused: fz._main.paused(), holds: fz._main.holds(), lay: fz._main.layout(), touchMode: fz._main.touchMode(), touchOnly: fz._main.touchOnly(),
    })),
    async key(code, ms = 60) { await page.keyboard.down(code); await wait(ms); await page.keyboard.up(code); await wait(45); },
    async hold(code, ms) { await page.keyboard.down(code); await wait(ms); await page.keyboard.up(code); },
  };
  return T;
}

// ---- touch helpers (CDP touch events so we can HOLD a finger down; works across the cross-origin iframe) ----
export async function touchKit(T) {
  const cdp = await T.context.newCDPSession(T.page);
  let nextId = 1;
  const pts = new Map();
  const send = (type) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...pts.values()].map((p) => ({ x: p.x, y: p.y, id: p.id })) });
  return {
    async down(x, y) { const id = nextId++; pts.set(id, { x, y, id }); await send('touchStart'); return id; },
    async up(id) { pts.delete(id); await send('touchEnd'); },
    async tap(x, y, ms = 70) { const id = await this.down(x, y); await wait(ms); await this.up(id); },
    async hold(x, y, ms) { const id = await this.down(x, y); await wait(ms); await this.up(id); },
    // coordinates (page space) of a touch-control button or a logical canvas point
    async btn(k) { const r = await T.frame.evaluate((k) => { const b = document.querySelector('#touch [data-k="' + k + '"]'); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; }, k); const fr = await T.frame.frameElement(); const o = await fr.boundingBox(); return { x: o.x + r.x, y: o.y + r.y, w: r.w, h: r.h }; },
    async cv(lx, ly) { const r = await T.frame.evaluate(() => { const c = document.getElementById('screen').getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height }; }); const fr = await T.frame.frameElement(); const o = await fr.boundingBox(); return { x: o.x + r.x + lx * r.w / 256, y: o.y + r.y + ly * r.h / 224 }; },
  };
}
