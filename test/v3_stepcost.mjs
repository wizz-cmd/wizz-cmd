// FIZZ & POP v3 regression probe: steady-state cost of ONE game frame (fz.step(1) = update + render + postFX, with the deferred raster flushed by a 1x1 getImageData) in the
// busy scene (2P, 8 enemies, 38 bubbles, bomb chain every 12 frames) at fixed render scales, after the GFX warm-up / migration has finished. Lets v3 and the pre-wave build be compared.
//   node test/v3_stepcost.mjs [--html path] [--ks 2,3,3.75,4,5.25] [--q 0,2] [--frames 240] [--chain 1|0]
import { open, BUSY, stat, K_VIEWS } from './qa_v2_perf_lib.mjs';
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const HTML = opt('html', undefined), KS = opt('ks', '2,3,3.75,4,5.25').split(',').map(Number), QS = opt('q', '0,2').split(',').map(Number), N = +opt('frames', 240), CHAIN = opt('chain', '1') === '1';
for (const k of KS) {
  const [vw, vh, dpr] = K_VIEWS[k];
  const t = await open({ html: HTML, vw, vh, dpr });
  await t.page.evaluate(() => { window.fz = window.__fizzpop; fz.freeze(true); });
  for (const q of QS) {
    await t.page.evaluate((q) => { fz._main.setQuality(q, true); }, q);
    await t.page.evaluate(BUSY);
    // let the background work (warm-up queue, world jobs, migration) finish: poll GFX._stats() when it exists, else wait a fixed 5 s
    const waited = await t.page.evaluate(async () => { const t0 = performance.now(); const st = () => (fz.GFX._stats ? fz.GFX._stats() : null); if (!st()) { await new Promise((r) => setTimeout(r, 5000)); return performance.now() - t0; }
      for (let i = 0; i < 400; i++) { const s = st(); if (!(s.warmQueue > 0 || s.migrating || s.jobs > 0)) break; fz.step(1); await new Promise((r) => setTimeout(r, 16)); } return performance.now() - t0; });
    const r = await t.page.evaluate(({ N, CHAIN }) => {
      const D = fz.Game.debug, S = D._S(); const cv = document.getElementById('screen'), cx = cv.getContext('2d');
      const one = (i) => {
        if (CHAIN && i % 12 === 0) { for (let k = 0; k < 6; k++) { D.spawn(['nibbler', 'crabbit', 'jellop'][k % 3], 60 + k * 14, 120); const e = S.enemies[S.enemies.length - 1]; e.state = 'frozen'; e.freezeT = 1e9; } D.give(0, 'bomb'); }
        fz.input.set(0, { right: (i >> 5) % 2 === 0, left: (i >> 5) % 2 === 1 }); fz.input.set(1, { left: (i >> 5) % 2 === 0, right: (i >> 5) % 2 === 1 });
        const a = performance.now(); fz.step(1); cx.getImageData(0, 0, 1, 1); return performance.now() - a;
      };
      for (let i = 0; i < 90; i++) one(i);
      const flushed = []; for (let i = 0; i < N; i++) flushed.push(one(i));
      fz.input.clear(); return { k: fz._main.k(), flushed };
    }, { N, CHAIN });
    const s = stat(r.flushed);
    console.log(`k ${String(r.k).padEnd(5)} q${q}  busy${CHAIN ? '+chain' : ''} frame (flushed): avg ${String(s.avg).padStart(6)} med ${String(s.med).padStart(6)} p95 ${String(s.p95).padStart(6)} max ${String(s.max).padStart(7)} ms   (background work settled after ${Math.round(waited)} ms)`);
  }
  if (t.errors.length) console.log('  ERRORS', t.errors.slice(0, 2));
  await t.close();
}
