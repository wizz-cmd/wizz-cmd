// Main v3 (U1 / U4): the auto-quality ladder measured with REAL rAF intervals (what the player sees: JS + raster + commit), from page load on.
//   node test/main_v3_ladder.mjs [profile=phone6|desk6|phone4|desk4|phone1] [scene=typical|busy|title] [secs=30] [html=<file>] [tag=<label>]
//   Per 3-s window: quality / k, fps, p95 and max rAF interval, frames > 50 ms; then the verdict after the first 3 s (SPEC_V2 5: p95 <= 16 ms; here: rAF p95 <= 20 ms, no frame > 50 ms)
//   and what the VM can and cannot prove (CPU raster: every frame's canvas raster is paid on the main thread).
import fs from 'fs';
import path from 'path';
import { open, OUT, HTML, sleep, stat } from './main_v3_lib.mjs';
const arg = (n, d) => { const a = process.argv.find((x) => x.startsWith(n + '=')); return a ? a.slice(n.length + 1) : d; };
const profile = arg('profile', 'phone6'), scene = arg('scene', 'typical'), secs = +arg('secs', 30), html = arg('html', HTML), tag = arg('tag', 'new');
const P = { desk6: { vw: 1024, vh: 768, dpr: 2, touch: false, cpu: 1 }, desk2x: { vw: 1280, vh: 800, dpr: 2, touch: false, cpu: 1 }, desk4: { vw: 1280, vh: 1000, dpr: 1, touch: false, cpu: 1 }, phone6: { vw: 390, vh: 844, dpr: 3, touch: true, cpu: 6 }, phone4: { vw: 390, vh: 844, dpr: 3, touch: true, cpu: 4 }, phone1: { vw: 390, vh: 844, dpr: 3, touch: true, cpu: 1 }, deskdpr2cpu6: { vw: 1280, vh: 800, dpr: 2, touch: false, cpu: 6 } }[profile];
const BUSY = `(() => { const D = fz.Game.debug; fz.start(2, 8, 5); D.skipIntro(); D.god(true); const S = D._S(); D.clearEnemies();
  for (let i = 0; i < 8; i++) D.spawn(['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer', 'nibbler', 'crabbit', 'jellop'][i], 30 + i * 24, 60 + (i % 3) * 40);
  for (let i = 0; i < 38; i++) D.spawn(['thunder', 'fire', 'water'][i % 3], 24 + (i % 10) * 20, 40 + Math.floor(i / 10) * 30);
  for (const b of S.bubbles) { b.att = null; b.life = 1e9; } S.players[0].inv = 0; S.players[1].inv = 0; D.noClear(true); })()`;
const TYPICAL = `(() => { const D = fz.Game.debug; fz.start(1, 8, 5); D.skipIntro(); D.god(true); D.noClear(true); })()`;
const DRIVE = `(i) => { fz.input.set(0, { right: (i >> 5) % 2 === 0, left: (i >> 5) % 2 === 1, fire: i % 6 < 3, jump: i % 40 === 0 }); fz.input.set(1, { left: (i >> 5) % 2 === 0, right: (i >> 5) % 2 === 1, fire: i % 8 < 3 }); }`;
// the recorder is installed BEFORE the page's own script runs, so the boot itself is measured
const t = await open({ html, ...P, wait: false, init: () => { window.__fr = []; let last = performance.now(); const tick = (ts) => { window.__fr.push([ts, ts - last]); last = ts; requestAnimationFrame(tick); }; requestAnimationFrame(tick); window.__ks = []; setInterval(() => { const f = window.__fizzpop; if (f && f._main && f.bootMs >= 0) window.__ks.push([Math.round(performance.now()), f._main.k(), f.quality]); }, 100); } });
await t.page.waitForFunction(() => !!window.__fizzpop && window.__fizzpop.bootMs >= 0, null, { timeout: 120000 });
const boot = await t.page.evaluate(() => ({ bootMs: __fizzpop.bootMs, calib: __fizzpop._main.calibration && __fizzpop._main.calibration(), prof: __fizzpop.bootProfile, t0: performance.now() }));
if (scene !== 'title') {
  await t.page.evaluate(({ setup, drive }) => { window.fz = window.__fizzpop; (0, eval)(setup); const drv = (0, eval)(drive); let n = 0; window.__drive = setInterval(() => { n++; drv(n); }, 16); }, { setup: scene === 'busy' ? BUSY : TYPICAL, drive: DRIVE });
}
const t0 = boot.t0;
await sleep(secs * 1000);
const r = await t.page.evaluate(() => ({ fr: window.__fr, ks: window.__ks, log: __fizzpop._main.autoQuality().log, aq: __fizzpop._main.autoQuality(), stats: (__fizzpop._main.frameStats ? __fizzpop._main.frameStats() : null), perf: __fizzpop._main.perf() }));
console.log(`${tag} ${profile}/${scene}: bootMs ${boot.bootMs} calib ${boot.calib ? `probe ${boot.calib.probeMs.toFixed(2)} ms -> q${boot.calib.quality} cap ${boot.calib.kCap} (${boot.calib.ms} ms)` : '-'} boot profile ${JSON.stringify(boot.prof)}`);
const frames = r.fr.filter((x) => x[0] > 0);
const win = 3000, wins = [];
const tEnd = frames.length ? frames[frames.length - 1][0] : 0;
for (let s = 0; s * win < tEnd; s++) {
  const a = frames.filter((x) => x[0] >= s * win && x[0] < (s + 1) * win).map((x) => x[1]);
  if (!a.length) continue;
  const st = stat(a), ks = r.ks.filter((x) => x[0] >= s * win && x[0] < (s + 1) * win), kq = ks.length ? ks[ks.length - 1] : [0, 0, 0];
  wins.push({ t: s * 3, fps: +(1000 / st.avg).toFixed(1), p95: st.p95, max: st.max, over50: a.filter((x) => x > 50).length, k: kq[1], q: kq[2] });
  console.log(`  t=${String(s * 3).padStart(3)}s frames ${String(a.length).padStart(4)} fps ${(1000 / st.avg).toFixed(1).padStart(5)} avg ${String(st.avg).padStart(6)} p95 ${String(st.p95).padStart(6)} max ${String(st.max).padStart(7)} >50ms ${String(a.filter((x) => x > 50).length).padStart(2)} | k=${kq[1]} q${kq[2]}`);
}
const after = frames.filter((x) => x[0] > 3000).map((x) => x[1]);
const sa = stat(after);
console.log(`  after 3 s: ${sa.n} frames, avg ${sa.avg} ms (${(1000 / sa.avg).toFixed(1)} fps) p95 ${sa.p95} p99 ${sa.p99} max ${sa.max}; frames > 50 ms: ${after.filter((x) => x > 50).length}, > 100 ms: ${after.filter((x) => x > 100).length}`);
console.log(`  ladder log: ${JSON.stringify(r.log)}`);
console.log(`  frameStats ${JSON.stringify(r.stats)}  state ${JSON.stringify({ q: r.aq.quality, k: r.aq.k, kCap: r.aq.kCap, lateFrac: r.aq.lateFrac, windowAvg: r.aq.windowAvgMs })}`);
fs.writeFileSync(path.join(OUT, `ladder_${tag}_${profile}_${scene}.json`), JSON.stringify({ boot, wins, after: sa, log: r.log, stats: r.stats }, null, 1));
console.log(`  errors: ${JSON.stringify(t.errors)}`);
await t.close();
