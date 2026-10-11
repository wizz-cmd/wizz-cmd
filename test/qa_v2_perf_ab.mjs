// A/B of prototype variants (own copies) against dist: flush-based frame cost and a CDP trace of the real loop.
// usage: node qa_v2_perf_ab.mjs variants=base,css k=4 scene=busy q=2 [trace=1] [secs=5]
import fs from 'fs';
import path from 'path';
import { open, K_VIEWS, BUSY, TYPICAL, DRIVE, HTML, OUT, stat, sleep, traceRun } from './qa_v2_perf_lib.mjs';
const arg = (n, d) => { const a = process.argv.find((x) => x.startsWith(n + '=')); return a ? a.slice(n.length + 1) : d; };
const variants = arg('variants', 'base').split(',');
const ks = arg('k', '4').split(',').map(Number), scenes = arg('scene', 'busy').split(','), qs = arg('q', '2').split(',').map(Number);
const doTrace = arg('trace', '1') === '1', secs = +arg('secs', '5'), cpu = +arg('cpu', '1'), nFrames = +arg('frames', '200');
const fileOf = (v) => (v === 'base' ? HTML : path.join(OUT, 'variants', v + '.html'));
const rows = [];
for (const k of ks) for (const scene of scenes) for (const q of qs) {
  for (const v of variants) {
    const [vw, vh, dpr] = K_VIEWS[k];
    const t = await open({ html: fileOf(v), vw, vh, dpr, cpu });
    const NP = ['title', 'story', 'howto', 'scores', 'entry', 'ending'].includes(scene);
    const setup = NP ? `(() => { fz = window.__fizzpop; fz.goto('${scene}', ${scene === 'ending' ? "{ players: 1, scores: [100000, 0] }" : 'null'}); })()` : scene === 'typical' ? TYPICAL : BUSY;
    const drive = DRIVE(scene === 'chain');
    // 1) flush-based
    const r = await t.page.evaluate(({ setup, q, drive, NP, nFrames }) => {
      fz = window.__fizzpop; fz.freeze(true); (0, eval)(setup); fz._main.setQuality(q, true);
      const drv = (0, eval)('(' + drive + ')'); const cx = document.getElementById('screen').getContext('2d');
      for (let i = 0; i < 100; i++) { if (!NP) drv(i); fz.step(1); }
      const a = [];
      for (let i = 0; i < nFrames; i++) { if (!NP) drv(i); const t0 = performance.now(); fz.step(1); cx.getImageData(0, 0, 1, 1); a.push(performance.now() - t0); }
      return { a, k: fz._main.k(), st: fz.GFX._stats() };
    }, { setup, q, drive, NP, nFrames });
    const s = stat(r.a);
    let tr = null;
    if (doTrace) {
      await t.page.evaluate(({ drive, NP }) => { fz.freeze(false); const drv = (0, eval)('(' + drive + ')'); let n = 0; if (!NP) window.__drive = setInterval(() => { n++; drv(n); }, 16); window.__fr = []; let last = performance.now(); const tick = (ts) => { window.__fr.push(ts - last); last = ts; requestAnimationFrame(tick); }; requestAnimationFrame(tick); }, { drive, NP });
      await sleep(2500);
      tr = await traceRun(t, secs);
    }
    const row = { v, k: r.k, scene, q, flush: s, trace: tr && { main: tr.perFrame.beginMainFrame, js: tr.perFrame.rafJs, commit: tr.perFrame.commit, raster: tr.perFrame.canvasRaster, viz: tr.perFrame.vizDrawAndSwap, rAF: tr.rAF.avg, p95: tr.rAF.p95, max: tr.rAF.max, gcMs: tr.gc.ms }, errors: t.errors.slice(0, 3), px: r.st.px };
    rows.push(row);
    console.log(`${v.padEnd(11)} k=${r.k} ${scene.padEnd(10)} q${q} | flush step avg ${String(s.avg).padStart(6)} med ${String(s.med).padStart(6)} p95 ${String(s.p95).padStart(6)} max ${String(s.max).padStart(5)}` + (tr ? ` | main-thread frame ${tr.perFrame.beginMainFrame} (js ${tr.perFrame.rafJs} + commit ${tr.perFrame.commit}) viz ${tr.perFrame.vizDrawAndSwap} rAF ${tr.rAF.avg}/${tr.rAF.p95}/${tr.rAF.max}` : '') + (t.errors.length ? ' ERR ' + t.errors[0].slice(0, 100) : ''));
    await t.close();
  }
}
fs.appendFileSync(OUT + '/ab_log.jsonl', JSON.stringify({ when: new Date().toISOString(), args: process.argv.slice(2), rows }) + '\n');
