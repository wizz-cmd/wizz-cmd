import fs from 'fs';
import { open, K_VIEWS, BUSY, TYPICAL, DRIVE, traceRun, sleep, OUT } from './qa_v2_perf_lib.mjs';
const list = (process.argv[2] || '2:busy:0,2:busy:2,3:busy:0,3:busy:1,3:busy:2,4:busy:0,4:busy:1,4:busy:2,6:busy:0,6:busy:1,6:busy:2').split(',').map((s) => s.split(':'));
const out = {};
for (const [kS, scene, qS] of list) {
  const k = +kS, q = +qS, cfg = K_VIEWS[k];
  const t = await open({ vw: cfg[0], vh: cfg[1], dpr: cfg[2] });
  await t.page.evaluate(({ setup, q, drive }) => {
    fz = window.__fizzpop; fz.freeze(true); (0, eval)(setup); fz._main.setQuality(q, true); fz.freeze(false);
    const drv = (0, eval)('(' + drive + ')'); let n = 0; window.__drive = setInterval(() => { n++; drv(n); }, 16);
    window.__fr = []; let last = performance.now(); const tick = (ts) => { window.__fr.push(ts - last); last = ts; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  }, { setup: scene === 'typical' ? TYPICAL : BUSY, q, drive: DRIVE(scene === 'chain') });
  await sleep(2500);
  const r = await traceRun(t, 5);
  const kk = await t.page.evaluate(() => fz._main.k());
  out[`k${kk}|${scene}|q${q}`] = r;
  console.log(`k=${kk} ${scene} q${q}: main-thread frame ${r.perFrame.beginMainFrame} ms = rAF js ${r.perFrame.rafJs} + commit ${r.perFrame.commit} (canvas raster ${r.perFrame.canvasRaster}) | viz ${r.perFrame.vizDrawAndSwap} ms | GC ${r.gc.ms} ms in ${r.gc.n} (${r.gc.perSecMs} ms/s, max ${r.gc.max}) | rAF avg ${r.rAF.avg} p95 ${r.rAF.p95} max ${r.rAF.max} | frames ${r.frames}`);
  await t.close();
}
fs.writeFileSync(OUT + '/trace_matrix.json', JSON.stringify(out, null, 1));
