// First 14 s of a phone-like session (390x844 DPR3 touch, CPU throttle): per-second frame stats, k and quality over time. variant / cpu.
import fs from 'fs';
import path from 'path';
import { open, HTML, OUT, sleep, stat } from './qa_v2_perf_lib.mjs';
const variant = process.argv[2] || 'base', cpu = +(process.argv[3] || 4);
const t = await open({ html: variant === 'base' ? HTML : path.join(OUT, 'variants', variant + '.html'), vw: 390, vh: 844, dpr: 3, touch: true, cpu, wait: false });
await t.page.addInitScript(() => { window.__fr = []; let last = performance.now(); const tick = (ts) => { window.__fr.push([ts, ts - last]); last = ts; requestAnimationFrame(tick); }; requestAnimationFrame(tick); window.__ks = []; setInterval(() => { const f = window.__fizzpop; if (f && f._main) window.__ks.push([Math.round(performance.now()), f._main.k(), f.quality]); }, 100); });
await t.page.reload();
await t.page.waitForFunction(() => !!window.__fizzpop && window.__fizzpop.bootMs >= 0, null, { timeout: 120000 });
await sleep(13000);
const r = await t.page.evaluate(() => ({ fr: window.__fr, ks: window.__ks, boot: window.__fizzpop.bootMs, probe: window.__probeMs }));
console.log(`${variant} cpu${cpu}: bootMs ${r.boot}, probe ${r.probe === undefined ? '-' : r.probe.toFixed(2) + ' ms'}`);
let worstSecs = [];
for (let s = 0; s < 14; s++) {
  const a = r.fr.filter((x) => x[0] >= s * 1000 && x[0] < (s + 1) * 1000).map((x) => x[1]);
  if (!a.length) continue;
  const ks = r.ks.filter((x) => x[0] >= s * 1000 && x[0] < (s + 1) * 1000), kq = ks.length ? ks[ks.length - 1] : [0, 0, 0];
  const st = stat(a);
  console.log(`  t=${String(s).padStart(2)}s frames ${String(a.length).padStart(3)} avg ${String(st.avg).padStart(6)} max ${String(st.max).padStart(7)} >50ms: ${String(a.filter((x) => x > 50).length).padStart(2)} | k=${kq[1]} q${kq[2]}`);
}
const late = r.fr.filter((x) => x[0] > 1000 && x[0] < 9000).map((x) => x[1]);
console.log(`  1-9 s: frames>50ms ${late.filter((x) => x > 50).length}, >100ms ${late.filter((x) => x > 100).length}, worst ${Math.max(...late).toFixed(0)} ms; total time lost over 16.7: ${(late.reduce((s, x) => s + Math.max(0, x - 16.7), 0) / 1000).toFixed(1)} s`);
await t.close();
