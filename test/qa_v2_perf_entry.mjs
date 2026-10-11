// Scene-entry / round-start hitches: first frame cost (goto + render, with raster flush) of every scene and of game start / round change, cold (after boot + 8 s idle warm-up).
// usage: node entry.mjs k [cpu]
import fs from 'fs';
import { open, K_VIEWS, BUSY, stat, sleep, OUT } from './qa_v2_perf_lib.mjs';
const k = +(process.argv[2] || 4), cpu = +(process.argv[3] || 1);
const [vw, vh, dpr] = K_VIEWS[k];
const t = await open({ vw, vh, dpr, cpu });
await sleep(7000 * Math.max(1, cpu / 2));
const r = await t.page.evaluate(() => {
  fz = window.__fizzpop; fz.freeze(true);
  fz._main.setQuality(2, true);
  const cx = document.getElementById('screen').getContext('2d');
  const out = [];
  const timeit = (label, fn) => {
    const s0 = fz.GFX._stats();
    const a = performance.now(); fn(); cx.getImageData(0, 0, 1, 1); const b = performance.now();
    const s1 = fz.GFX._stats();
    // second frame
    const c = performance.now(); fz.step(1); cx.getImageData(0, 0, 1, 1); const d = performance.now();
    out.push({ label, first: +(b - a).toFixed(1), second: +(d - c).toFixed(1), bakes: s1.bakes - s0.bakes, bakeMs: +(s1.bakeMs - s0.bakeMs).toFixed(1), heroes: fz._main.bigHeroes().count, queue: s1.warmQueue, jobs: s1.jobs });
  };
  for (const sc of ['howto', 'scores', 'story', 'entry', 'ending', 'title']) {
    timeit('scene ' + sc, () => fz.goto(sc, sc === 'story' ? { next: { players: 1, level: 1, seed: 1 } } : sc === 'entry' ? { entries: [{ pi: 0, score: 12345, round: 5 }], players: 1 } : sc === 'ending' ? { players: 1, scores: [100000, 0] } : null));
  }
  timeit('start R1 (1P)', () => fz.start(1, 1, 3));
  fz.Game.debug.skipIntro();
  // advance to the next round (round change = transition + level/bg canvas for the next round), measure the worst frame of the transition
  const D = fz.Game.debug; D.god(true);
  let worst = 0, worstI = -1, n0 = fz.GFX._stats();
  const frames = [];
  const S = D._S();
  D.clearEnemies();
  for (let i = 0; i < 400; i++) {
    const a = performance.now(); fz.step(1); cx.getImageData(0, 0, 1, 1); const b = performance.now();
    frames.push(b - a); if (b - a > worst) { worst = b - a; worstI = i; }
    if (S.level >= 2 && S.phase === 'play' && i > 10) break;
  }
  const n1 = fz.GFX._stats();
  out.push({ label: 'round 1->2 transition (worst of ' + frames.length + ' frames)', first: +worst.toFixed(1), second: +(frames.reduce((x, y) => x + y, 0) / frames.length).toFixed(1), bakes: n1.bakes - n0.bakes, bakeMs: +(n1.bakeMs - n0.bakeMs).toFixed(1), heroes: 0, queue: n1.warmQueue, jobs: n1.jobs, at: worstI });
  // boss / kraken / bonefin first appearances
  for (const [lvl, label] of [[6, 'R6 (theme 2 start)'], [10, 'R10 boss? '], [16, 'R16 stage2'], [30, 'R30 kraken']]) {
    G: { const s0 = fz.GFX._stats(); const a = performance.now(); fz.start(1, lvl, 3); fz.Game.debug.skipIntro(); cx.getImageData(0, 0, 1, 1); const b = performance.now(); const fr = []; for (let i = 0; i < 30; i++) { const c = performance.now(); fz.step(1); cx.getImageData(0, 0, 1, 1); fr.push(performance.now() - c); } const s1 = fz.GFX._stats(); out.push({ label: 'start ' + label, first: +(b - a).toFixed(1), second: +Math.max(...fr).toFixed(1), bakes: s1.bakes - s0.bakes, bakeMs: +(s1.bakeMs - s0.bakeMs).toFixed(1), heroes: 0, queue: s1.warmQueue, jobs: s1.jobs }); }
  }
  return { out, k: fz._main.k() };
});
console.log(`k=${r.k} cpu=${cpu}`);
for (const o of r.out) console.log(`  ${o.label.padEnd(44)} first ${String(o.first).padStart(7)} ms | next(max/avg) ${String(o.second).padStart(6)} | sprite bakes ${o.bakes} (${o.bakeMs} ms) heroes ${o.heroes} warmQ ${o.queue} jobs ${o.jobs}`);
fs.writeFileSync(OUT + `/entry_k${k}_cpu${cpu}.json`, JSON.stringify(r, null, 1));
await t.close();
