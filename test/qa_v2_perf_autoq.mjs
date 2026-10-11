// Auto-quality dynamics: real loop, quality NOT locked; per 4-s window: quality, kCap, real fps (rAF), Main's own cost avg. base vs prototype.
// usage: node autoq.mjs variant=base|autoqdt|... profile=desk6|phone6|desk4 scene=busy|typical|chain secs=48
import fs from 'fs';
import path from 'path';
import { open, K_VIEWS, BUSY, TYPICAL, DRIVE, HTML, OUT, sleep, stat } from './qa_v2_perf_lib.mjs';
const arg = (n, d) => { const a = process.argv.find((x) => x.startsWith(n + '=')); return a ? a.slice(n.length + 1) : d; };
const variant = arg('variant', 'base'), profile = arg('profile', 'desk6'), scene = arg('scene', 'busy'), secs = +arg('secs', 48);
const P = { desk6: { vw: 1024, vh: 768, dpr: 2, touch: false, cpu: 1 }, desk4: { vw: 1280, vh: 1000, dpr: 1, touch: false, cpu: 1 }, phone6: { vw: 390, vh: 844, dpr: 3, touch: true, cpu: 6 }, phone4: { vw: 390, vh: 844, dpr: 3, touch: true, cpu: 4 }, phone3: { vw: 390, vh: 844, dpr: 3, touch: true, cpu: 3 } }[profile];
const t = await open({ html: variant === 'base' ? HTML : path.join(OUT, 'variants', variant + '.html'), ...P });
await t.page.evaluate(({ setup, drive }) => {
  fz = window.__fizzpop; fz.freeze(true); (0, eval)(setup); fz.freeze(false);
  const drv = (0, eval)('(' + drive + ')'); let n = 0; window.__drive = setInterval(() => { n++; drv(n); }, 16);
  window.__fr = []; let last = performance.now(); const tick = (ts) => { window.__fr.push(ts - last); last = ts; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
}, { setup: scene === 'typical' ? TYPICAL : BUSY, drive: DRIVE(scene === 'chain') });
const wins = [];
for (let w = 0; w < secs / 4; w++) {
  await sleep(4000);
  const r = await t.page.evaluate(() => { const a = window.__fr.splice(0); const aq = fz._main.autoQuality(); return { a, q: fz.quality, kCap: aq.kCap, k: fz._main.k(), perf: fz._main.perf(), win: aq.windowAvgMs }; });
  const s = stat(r.a), fps = 1000 / s.avg;
  wins.push({ t: (w + 1) * 4, q: r.q, k: r.k, kCap: r.kCap, fps: +fps.toFixed(1), p95: s.p95, max: s.max, mainCost: +r.perf.avg.toFixed(1), win: r.win && +r.win.toFixed(1) });
  console.log(`${variant}/${profile}/${scene} t=${String((w + 1) * 4).padStart(3)}s q${r.q} k=${r.k} | ${fps.toFixed(1).padStart(5)} fps rAF avg ${s.avg} p95 ${s.p95} max ${s.max} | Main cost avg ${r.perf.avg.toFixed(1)} p95 ${r.perf.p95.toFixed(1)} window ${r.win ? r.win.toFixed(1) : '-'}`);
}
const log = await t.page.evaluate(() => fz._main.autoQuality().log);
console.log('ladder log', JSON.stringify(log));
fs.writeFileSync(OUT + `/autoq_${variant}_${profile}_${scene}.json`, JSON.stringify({ wins, log }, null, 1));
await t.close();
