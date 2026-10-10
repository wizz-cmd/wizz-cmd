// QA platform: fixed-step cadence vs display refresh rate. Drives the page's own RAF loop with synthetic timestamps (60/75/90/120/144/165 Hz,
// +-0.15 ms jitter) and records how many Game.update steps run per rendered frame; reports the distribution and the longest run of
// frames without a step, i.e. how uneven the motion is (no render interpolation).
import { launchBrowser, open, ev, log } from './qa_platform_lib.mjs';
const init = `window.__q = []; window.requestAnimationFrame = (cb) => { window.__q.push(cb); return 1; };`;
const b = await launchBrowser({ autoplay: true });
for (const hz of [60, 75, 90, 120, 144, 165, 240]) {
  const t = await open({ browser: b, initScript: init });
  const r = await ev(t.page, (hz) => {
    fz.start(1, 1, 5); fz.Game.debug.skipIntro(); fz.Game.debug.god(true);
    let steps = 0; const orig = fz.Game.update; fz.Game.update = function (...a) { steps++; return orig.apply(this, a); };
    const rnd = fz.U.rng(5); let now = performance.now() + 100; const per = 1000 / hz; const hist = {}; const seq = [];
    const run = (n) => { for (let i = 0; i < n; i++) { now += per + rnd.float(-0.15, 0.15); const q = window.__q.splice(0); steps = 0; q.forEach((cb) => cb(now)); seq.push(steps); } };
    run(120); seq.length = 0; run(1800);
    seq.forEach((s) => { hist[s] = (hist[s] || 0) + 1; });
    let maxZero = 0, z = 0; seq.forEach((s) => { if (s === 0) { z++; maxZero = Math.max(maxZero, z); } else z = 0; });
    // cadence irregularity: variance of the gap (in frames) between consecutive steps vs ideal
    const gaps = []; let g = 0; seq.forEach((s) => { g++; for (let k = 0; k < s; k++) { gaps.push(g); g = 0; } });
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length; const distinct = {}; gaps.forEach((x) => { distinct[x] = (distinct[x] || 0) + 1; });
    return { hist, maxZero, gapsHist: distinct, stepsPerSec: +(seq.reduce((a, b) => a + b, 0) / (seq.length / hz)).toFixed(2) };
  }, hz);
  log(`${hz} Hz: steps/s ${r.stepsPerSec} | steps-per-frame histogram ${JSON.stringify(r.hist)} | frames between steps ${JSON.stringify(r.gapsHist)}`);
  await t.close();
}
await b.close();
