// Per-category raster-cost attribution of one frame: every canvas call is followed by a 1x1 getImageData on its destination
// (forces the deferred CPU raster), timed, and bucketed by GFX entry point / call type / source size. The constant cost of
// call+flush is calibrated with a 0x0 draw and subtracted.
import fs from 'fs';
import { open, K_VIEWS, BUSY, TYPICAL, DRIVE, OUT } from './qa_v2_perf_lib.mjs';
const kList = process.argv[2] ? process.argv[2].split(',').map(Number) : [4];
const sceneArg = process.argv[3] || 'busy';
const qList = process.argv[4] ? process.argv[4].split(',').map(Number) : [0, 2];
const KCAP = process.argv[5] ? +process.argv[5] : 0;
const INSTR = `(() => {
  const proto = CanvasRenderingContext2D.prototype, GFX = fz.GFX;
  const P = window.__prof = { on: false, cat: 'game', stats: new Map(), frames: 0 };
  const cv = document.getElementById('screen');
  const fl = (c) => { try { c.getImageData(0, 0, 1, 1); } catch (e) {} };
  let ov = 0;
  const add = (key, dt, px) => { let s = P.stats.get(key); if (!s) { s = { n: 0, ms: 0, px: 0 }; P.stats.set(key, s); } s.n++; s.ms += dt; s.px += px; };
  const dim = (img) => img ? (img.width + 'x' + img.height) : '';
  const keep = {};
  for (const name of ['drawImage', 'fillRect', 'fill', 'stroke', 'fillText', 'strokeRect', 'clearRect']) {
    const orig = keep[name] = proto[name];
    proto[name] = function (...a) {
      if (!P.on || P.inFlush) return orig.apply(this, a);
      const t0 = performance.now();
      const r = orig.apply(this, a);
      P.inFlush = true; fl(this); P.inFlush = false;
      const dt = performance.now() - t0 - ov;
      let key = P.cat + ' ' + name, px = 0;
      const gco = this.globalCompositeOperation;
      if (name === 'drawImage') {
        const img = a[0];
        const m = this.getTransform();
        let dw, dh;
        if (a.length >= 9) { dw = a[7]; dh = a[8]; } else if (a.length >= 5) { dw = a[3]; dh = a[4]; } else { dw = img.width; dh = img.height; }
        const sx = Math.hypot(m.a, m.b), sy = Math.hypot(m.c, m.d);
        px = Math.abs(dw * sx * dh * sy);
        key += ' [' + dim(img) + (this.canvas === cv ? '->main' : '->off') + ' ' + gco + (this.filter && this.filter !== 'none' ? ' F' : '') + ']';
        if (P.cat === 'game' || P.cat === 'main') key += ' dst~' + Math.round(dw * sx) + 'x' + Math.round(dh * sy);
      } else if (name === 'fillRect') { const m = this.getTransform(); px = Math.abs(a[2] * a[3] * m.a * m.d); key += ' ' + gco + (this.fillStyle && typeof this.fillStyle !== 'string' ? ' gradient/pattern' : ''); }
      else key += ' ' + gco;
      add(key, dt, px);
      return r;
    };
  }
  // calibrate: call+flush overhead of a no-op draw
  P.on = false;
  const o = keep.fillRect, g = cv.getContext('2d');
  let t0 = performance.now(); for (let i = 0; i < 400; i++) { o.call(g, 0, 0, 0, 0); g.getImageData(0, 0, 1, 1); } ov = (performance.now() - t0) / 400;
  P.overhead = ov;
  for (const fn of ['draw', 'text', 'particle', 'postFX', 'levelGlints', 'drawLogo']) {
    const orig = GFX[fn];
    GFX[fn] = function (...a) { const prev = P.cat; P.cat = 'gfx.' + fn; try { return orig.apply(this, a); } finally { P.cat = prev; } };
  }
  const mainRender = fz._main.renderNow;
  P.reset = () => { P.stats = new Map(); P.frames = 0; };
})()`;
const out = {};
for (const k of kList) {
  const [vw, vh, dpr] = KCAP ? [1700, 1400, 1] : K_VIEWS[k];
  const t = await open({ vw, vh, dpr });
  const kk = await t.page.evaluate(() => window.__fizzpop.k ? 0 : window.__fizzpop._main.k());
  await t.page.evaluate(() => { fz = window.__fizzpop; fz.freeze(true); });
  await t.page.waitForTimeout(600);
  if (KCAP) await t.page.evaluate((c) => { fz._main.setKCap(c); }, KCAP);
  const NONPLAY = ['title','story','howto','scores','entry','ending'];
  if (NONPLAY.includes(sceneArg)) await t.page.evaluate((sc) => { fz.goto(sc, sc === 'story' ? { next: { players: 1, level: 1, seed: 1 } } : sc === 'entry' ? { entries: [{ pi: 0, score: 12345, round: 5 }], players: 1 } : sc === 'ending' ? { players: 1, scores: [100000, 0] } : null); }, sceneArg);
  else await t.page.evaluate(sceneArg.startsWith('typ') ? TYPICAL : BUSY);
  for (const q of qList) {
    const chain = sceneArg.includes('chain');
    const r = await t.page.evaluate(async ({ q, drive, INSTR, chain, sceneName }) => {
      fz = window.__fizzpop;
      if (!window.__prof) (0, eval)(INSTR);
      const P = window.__prof;
      fz._main.setQuality(q, true);
      const drv = (0, eval)('(' + drive + ')'); const NP = ['title','story','howto','scores','entry','ending'].includes(sceneName);
      for (let i = 0; i < 90; i++) { if (!NP) drv(i); fz.step(1); }
      P.reset(); P.on = true;
      const N = 60; const total = [];
      for (let i = 0; i < N; i++) { if (!NP) drv(i + 90); const a = performance.now(); fz.step(1); total.push(performance.now() - a); P.frames++; }
      P.on = false;
      const rows = [];
      for (const [key, s] of P.stats) rows.push({ key, n: +(s.n / N).toFixed(1), ms: +(s.ms / N).toFixed(3), mpx: +(s.px / N / 1e6).toFixed(3) });
      rows.sort((a, b) => b.ms - a.ms);
      const byCat = {};
      for (const rw of rows) { const c = rw.key.split(' ')[0]; (byCat[c] = byCat[c] || { n: 0, ms: 0, mpx: 0 }); byCat[c].n += rw.n; byCat[c].ms += rw.ms; byCat[c].mpx += rw.mpx; }
      return { rows: rows.slice(0, 40), byCat, overheadUs: P.overhead * 1000, k: fz._main.k(), fxdrawn: (fz.Game.debug.fxStats() || {}).drawn };
    }, { q, drive: DRIVE(chain), INSTR, chain, sceneName: sceneArg });
    console.log(`\n=== k=${r.k} scene=${sceneArg} q=${q}  call+flush overhead ${r.overheadUs.toFixed(1)} us (subtracted)  fx drawn ${JSON.stringify(r.fxdrawn)}`);
    let tot = 0; for (const [c, s] of Object.entries(r.byCat)) tot += s.ms;
    console.log(`sum attributed ${tot.toFixed(2)} ms/frame`);
    for (const [c, s] of Object.entries(r.byCat)) console.log(`  ${c.padEnd(18)} calls/frame ${String(s.n.toFixed(0)).padStart(5)}  ${s.ms.toFixed(2).padStart(7)} ms  ${s.mpx.toFixed(2)} Mpx`);
    for (const rw of r.rows.slice(0, 22)) console.log(`   ${String(rw.ms.toFixed(3)).padStart(7)} ms x${String(rw.n).padStart(5)} ${rw.mpx.toFixed(3)}Mpx  ${rw.key}`);
    out[`k${r.k}|${sceneArg}|q${q}`] = r;
  }
  await t.close();
}
fs.writeFileSync(OUT + `/breakdown_${sceneArg}_${kList.join('')}.json`, JSON.stringify(out, null, 1));
