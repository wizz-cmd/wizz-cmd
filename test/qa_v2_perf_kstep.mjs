// Hitch on a k step in a running game (what auto-quality's resolution lever, a window resize or a DPR change causes): rAF intervals + first frames after the step
// usage: node kstep.mjs [variant] [cpu]
import fs from 'fs';
import path from 'path';
import { open, BUSY, DRIVE, HTML, OUT, sleep, stat } from './qa_v2_perf_lib.mjs';
const variant = process.argv[2] || 'base', cpu = +(process.argv[3] || 1);
const t = await open({ html: variant === 'base' ? HTML : path.join(OUT, 'variants', variant + '.html'), vw: 1700, vh: 1400, dpr: 1, cpu });
await t.page.evaluate(({ setup, drive }) => {
  fz = window.__fizzpop; fz.freeze(true); (0, eval)(setup); fz._main.setQuality(2, true); fz.freeze(false);
  const drv = (0, eval)('(' + drive + ')'); let n = 0; window.__drive = setInterval(() => { n++; drv(n); }, 16);
  window.__fr = []; let last = performance.now(); const tick = (ts) => { window.__fr.push([ts, ts - last]); last = ts; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
}, { setup: BUSY, drive: DRIVE(false) });
await sleep(4000 * Math.max(1, cpu / 2));
const out = [];
for (const [from, to] of [[5, 4], [4, 3], [3, 4], [4, 2], [2, 4], [4, 5.25], [5.25, 5]]) {
  await t.page.evaluate((c) => { fz._main.setKCap(c); }, from);
  await sleep(3000 * Math.max(1, cpu / 2));
  const r = await t.page.evaluate((c) => { const t0 = performance.now(); fz._main.setKCap(c); const sync = performance.now() - t0; window.__fr.length = 0; return { sync, at: t0, k: fz._main.k() }; }, to);
  await sleep(2500);
  const fr = await t.page.evaluate(() => window.__fr.slice());
  const ints = fr.map((x) => x[1]);
  const over = ints.filter((x) => x > 34), worst = Math.max(...ints), excess = ints.reduce((s, x) => s + Math.max(0, x - 16.7), 0);
  out.push({ from, to, k: r.k, syncMs: +r.sync.toFixed(1), worst: +worst.toFixed(0), framesOver34: over.length, excessMs: +excess.toFixed(0), first8: ints.slice(0, 8).map((x) => +x.toFixed(0)) });
  console.log(`${variant} cpu${cpu}: k ${from} -> ${to} (k=${r.k}): setKCap() call ${r.sync.toFixed(1)} ms | worst frame ${worst.toFixed(0)} ms | frames >34 ms: ${over.length} | total excess over 16.7 ms: ${excess.toFixed(0)} ms | first frames ${ints.slice(0, 8).map((x) => x.toFixed(0)).join(',')}`);
}
fs.writeFileSync(OUT + `/kstep_${variant}_cpu${cpu}.json`, JSON.stringify(out, null, 1));
await t.close();
