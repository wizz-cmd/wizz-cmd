// Real (un-frozen) rAF loop: Main's own per-frame cost (what auto-quality sees) vs the real rAF interval / long tasks. Locked quality so the ladder does not move.
import fs from 'fs';
import { open, K_VIEWS, BUSY, TYPICAL, DRIVE, stat, sleep, OUT } from './qa_v2_perf_lib.mjs';
const cfgs = (process.argv[2] || '3:typical:2,3:busy:2,4:busy:2,4:busy:1,4:busy:0,6:busy:2,6:busy:0,4:chain:2').split(',').map((s) => s.split(':'));
const out = {};
for (const [kS, scene, qS] of cfgs) {
  const k = +kS, q = +qS;
  const [vw, vh, dpr] = K_VIEWS[k];
  const t = await open({ vw, vh, dpr });
  await t.page.evaluate(({ setup, q, drive }) => {
    fz = window.__fizzpop;
    fz.freeze(true);
    (0, eval)(setup);
    fz._main.setQuality(q, true);
    fz.freeze(false);
    window.__fr = []; let last = performance.now(); const tick = (ts) => { window.__fr.push(ts - last); last = ts; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    window.__lt = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([e.startTime, e.duration]); }).observe({ entryTypes: ['longtask'] }); } catch (e) {}
    const drv = (0, eval)('(' + drive + ')'); let n = 0;
    window.__drive = setInterval(() => { n++; drv(n); }, 16);
  }, { setup: scene === 'typical' ? TYPICAL : BUSY, q, drive: DRIVE(scene === 'chain') });
  await sleep(2500);
  await t.page.evaluate(() => { window.__fr.length = 0; window.__lt.length = 0; });
  await sleep(6000);
  const r = await t.page.evaluate(() => ({ fr: window.__fr.slice(), lt: window.__lt.slice(), perf: fz._main.perf(), k: fz._main.k(), q: fz.quality }));
  const s = stat(r.fr);
  const fps = 1000 / s.avg;
  out[`k${r.k}|${scene}|q${q}`] = { mainCost: r.perf, rAF: s, fps: +fps.toFixed(1), longTasks: r.lt.length };
  console.log(`k=${r.k} ${scene.padEnd(8)} q${r.q} | Main cost avg ${r.perf.avg.toFixed(2)} p95 ${r.perf.p95.toFixed(1)} max ${r.perf.max.toFixed(0)} | rAF interval avg ${s.avg} med ${s.med} p95 ${s.p95} p99 ${s.p99} max ${s.max} => ${fps.toFixed(1)} fps | long tasks ${r.lt.length}`);
  await t.close();
}
fs.writeFileSync(OUT + '/realloop.json', JSON.stringify(out, null, 1));
