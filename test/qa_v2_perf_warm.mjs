// Warm-up queue vs an early game start: how long until the sprite queue is empty, and how many bakes + hitches land inside gameplay
// usage: node warm.mjs variant k startAfterSec [cpu]
import fs from 'fs';
import path from 'path';
import { open, K_VIEWS, HTML, OUT, sleep, stat } from './qa_v2_perf_lib.mjs';
const [variant, kS, startS, cpuS] = [process.argv[2] || 'base', process.argv[3] || '4', process.argv[4] || '2', process.argv[5] || '1'];
const [vw, vh, dpr] = K_VIEWS[+kS];
const t = await open({ html: variant === 'base' ? HTML : path.join(OUT, 'variants', variant + '.html'), vw, vh, dpr, cpu: +cpuS });
await t.page.evaluate(() => {
  fz = window.__fizzpop; fz._main.setQuality(1, true);
  window.__lazy = { n: 0, ms: 0, max: 0, names: [] };
  const G = fz.GFX, d0 = G.draw;
  G.draw = function (...a) { const s0 = G._stats().bakes; const t0 = performance.now(); const r = d0.apply(this, a); const dt = performance.now() - t0; if (G._stats().bakes > s0) { window.__lazy.n++; window.__lazy.ms += dt; if (dt > window.__lazy.max) window.__lazy.max = dt; if (window.__lazy.names.length < 12) window.__lazy.names.push(a[1] + ':' + dt.toFixed(1)); } return r; };
  window.__fr = []; let last = performance.now(); const tick = (ts) => { window.__fr.push([ts, ts - last]); last = ts; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  window.__q = []; setInterval(() => window.__q.push([Math.round(performance.now()), G._stats().warmQueue]), 250);
});
await sleep(+startS * 1000 * Math.max(1, +cpuS / 2));
const t0 = await t.page.evaluate(() => { const t0 = performance.now(); window.__lazy.n = 0; window.__lazy.ms = 0; window.__lazy.max = 0; window.__lazy.names = []; const fz = window.__fizzpop; fz.start(1, 1, 3); fz.Game.debug.god(true); let n = 0; window.__drive = setInterval(() => { n++; fz.input.set(0, { right: (n >> 5) % 2 === 0, left: (n >> 5) % 2 === 1, fire: n % 6 < 3, jump: n % 40 === 0 }); }, 16); return t0; });
await sleep(20000 * Math.max(1, +cpuS / 3));
const r = await t.page.evaluate((t0) => ({ fr: window.__fr.filter((x) => x[0] > t0).map((x) => x[1]), lazy: window.__lazy, q: window.__q, drawn: window.__fizzpop.GFX._stats().entries }), t0);
const emptyAt = r.q.find((x) => x[1] === 0);
const s = stat(r.fr);
console.log(`${variant} k=${kS} start@${startS}s cpu${cpuS}: warm queue empty at ${emptyAt ? (emptyAt[0] / 1000).toFixed(1) + ' s' : 'NOT within run (queue ' + r.q[r.q.length - 1][1] + ' left)'} | play: lazy bakes inside gameplay ${r.lazy.n} (${r.lazy.ms.toFixed(0)} ms, max ${r.lazy.max.toFixed(1)}) ${r.lazy.names.slice(0, 6).join(' ')} | frames>34ms ${r.fr.filter((x) => x > 34).length} >50ms ${r.fr.filter((x) => x > 50).length} of ${r.fr.length}; rAF p95 ${s.p95} p99 ${s.p99} max ${s.max}`);
await t.close();
