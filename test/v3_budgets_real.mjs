// FIZZ & POP v3 regression — SPEC_V2 section 5 budgets re-measured with the REAL frame-time metric (rAF interval = JS + raster + commit, what the player sees),
// on the built game, optionally A/B against the pre-wave build.
//   node test/v3_budgets_real.mjs [--html path] [--tag name] [--only desk,phone,hitch,static,boot] [--secs 15]
//   desk    desktop 1280x800 at DPR 1 and DPR 2, typical round-8 play and the busy scene (8 enemies, 38 bubbles, 2P), 3 s warm-up excluded
//   phone   390x844 DPR 3 touch at 6x CPU throttle, typical play from page load: first 3 s and after, ladder state, calibration
//   hitch   resize steps (k changes) during play: worst rAF gap and frames > 50 ms per step window
//   static  CPU share of the main thread (CDP TaskDuration) in idle title / how-to / scores / paused game / click-to-resume overlay
//   boot    page load -> interactive title (bootMs) at 4x throttle, median of 3
// What this VM can and cannot prove (printed at the end): software-rasterised canvas (no GPU), 4 shared cores, headless rAF at 60 Hz.
import fs from 'fs';
import path from 'path';
import { open, OUT as MAIN_OUT, HTML as DEFAULT, sleep, stat, PROFILES } from './main_v3_lib.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const HTML = opt('html', DEFAULT), TAG = opt('tag', 'v3'), SECS = +opt('secs', 15);
const ONLY = opt('only', '') ? new Set(opt('only', '').split(',')) : null;
const want = (n) => !ONLY || ONLY.has(n);
const OUT = path.resolve(MAIN_OUT, '..', 'regress'); fs.mkdirSync(OUT, { recursive: true });
const report = { when: new Date().toISOString(), html: HTML, tag: TAG, sections: {} };

const REC = () => { window.__fr = []; let last = performance.now(); const tick = (ts) => { window.__fr.push([ts, ts - last]); last = ts; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  window.__lt = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ entryTypes: ['longtask'] }); } catch (e) {} };
const BUSY = `(() => { const D = fz.Game.debug; fz.start(2, 8, 5); D.skipIntro(); D.god(true); const S = D._S(); D.clearEnemies();
  for (let i = 0; i < 8; i++) D.spawn(['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer', 'nibbler', 'crabbit', 'jellop'][i], 30 + i * 24, 60 + (i % 3) * 40);
  for (let i = 0; i < 38; i++) D.spawn(['thunder', 'fire', 'water'][i % 3], 24 + (i % 10) * 20, 40 + Math.floor(i / 10) * 30);
  for (const b of S.bubbles) { b.att = null; b.life = 1e9; } S.players[0].inv = 0; S.players[1].inv = 0; D.noClear(true); })()`;
const TYPICAL = `(() => { const D = fz.Game.debug; fz.start(1, 8, 5); D.skipIntro(); D.god(true); D.noClear(true); })()`;
const DRIVE = `(i) => { fz.input.set(0, { right: (i >> 5) % 2 === 0, left: (i >> 5) % 2 === 1, fire: i % 6 < 3, jump: i % 40 === 0 }); fz.input.set(1, { left: (i >> 5) % 2 === 0, right: (i >> 5) % 2 === 1, fire: i % 8 < 3 }); }`;
const startScene = (t, scene) => t.page.evaluate(({ setup, drive }) => { window.fz = window.__fizzpop; (0, eval)(setup); const drv = (0, eval)(drive); let n = 0; window.__drive = setInterval(() => { n++; drv(n); }, 16); }, { setup: scene === 'busy' ? BUSY : TYPICAL, drive: DRIVE });
const frameSummary = (fr, from, to) => { const a = fr.filter((x) => x[0] >= from && (to === undefined || x[0] < to)).map((x) => x[1]); const s = stat(a); return { n: s.n, fps: +(1000 / (s.avg || 1)).toFixed(1), avg: s.avg, p50: s.med, p95: s.p95, p99: s.p99, max: s.max, over50: a.filter((x) => x > 50).length, over100: a.filter((x) => x > 100).length }; };
const line = (label, s) => console.log(`  ${label.padEnd(34)} frames ${String(s.n).padStart(5)}  ${String(s.fps).padStart(5)} fps  avg ${String(s.avg).padStart(6)}  p95 ${String(s.p95).padStart(6)}  p99 ${String(s.p99).padStart(6)}  max ${String(s.max).padStart(7)}  >50ms ${String(s.over50).padStart(3)}  >100ms ${String(s.over100).padStart(3)}`);
const cpuMetrics = (t) => t.cdp.send('Performance.getMetrics').then((r) => Object.fromEntries(r.metrics.map((m) => [m.name, m.value])));

async function desk() {
  console.log('\n== desktop (no throttle): real rAF intervals after a 3 s warm-up');
  report.sections.desk = {};
  for (const [pname, scene] of [['desk1', 'typical'], ['desk1', 'busy'], ['desk2', 'typical'], ['desk2', 'busy']]) {
    const t = await open({ html: HTML, profile: pname, wait: false, init: REC });
    await t.page.waitForFunction(() => !!window.__fizzpop && window.__fizzpop.bootMs >= 0, null, { timeout: 120000 });
    await t.cdp.send('Performance.enable');
    await startScene(t, scene);
    const t0 = await t.page.evaluate(() => performance.now()); const m0 = await cpuMetrics(t);
    await sleep(SECS * 1000);
    const m1 = await cpuMetrics(t);
    const r = await t.page.evaluate(() => ({ fr: window.__fr, k: fz._main.k(), q: fz.quality, perf: fz._main.perf && fz._main.perf(), lt: window.__lt }));
    const s = frameSummary(r.fr, t0 + 3000);
    const busyMs = (m1.TaskDuration - m0.TaskDuration) * 1000, wallMs = SECS * 1000;
    const key = `${pname}/${scene}`; report.sections.desk[key] = { k: r.k, q: r.q, ...s, mainThreadBusyPct: +(100 * busyMs / wallMs).toFixed(1), errors: t.errors.length };
    line(`${key} (k ${r.k}, q${r.q}, main busy ${(100 * busyMs / wallMs).toFixed(0)} %)`, s);
    if (t.errors.length) console.log('    ERRORS', t.errors.slice(0, 3));
    await t.close();
  }
}

async function phone() {
  console.log('\n== phone 390x844 DPR 3 touch, 6x CPU throttle, typical play from page load');
  const t = await open({ html: HTML, profile: 'phone', cpu: 6, wait: false, init: REC });
  await t.page.waitForFunction(() => !!window.__fizzpop && window.__fizzpop.bootMs >= 0, null, { timeout: 180000 });
  const boot = await t.page.evaluate(() => ({ bootMs: __fizzpop.bootMs, calib: __fizzpop._main.calibration && __fizzpop._main.calibration(), t0: performance.now(), k: __fizzpop._main.k(), q: __fizzpop.quality }));
  await startScene(t, 'typical');
  await sleep(Math.max(SECS, 30) * 1000);
  const r = await t.page.evaluate(() => ({ fr: window.__fr, k: fz._main.k(), q: fz.quality, aq: fz._main.autoQuality && fz._main.autoQuality(), lt: window.__lt }));
  const wins = [];
  for (let s = 0; s < 3; s++) { const sm = frameSummary(r.fr, boot.t0 + s * 1000, boot.t0 + (s + 1) * 1000); wins.push(sm); line(`play second ${s + 1}`, sm); }
  const first3 = frameSummary(r.fr, boot.t0, boot.t0 + 3000), after = frameSummary(r.fr, boot.t0 + 3000);
  line('first 3 s of play', first3); line('after 3 s', after);
  console.log(`  boot ${boot.bootMs} ms, start k ${boot.k} q${boot.q}, calibration ${JSON.stringify(boot.calib && { probeMs: boot.calib.probeMs, ms: boot.calib.ms, quality: boot.calib.quality, kCap: boot.calib.kCap })}; final k ${r.k} q${r.q}; ladder log ${JSON.stringify(r.aq && r.aq.log)}`);
  report.sections.phone = { boot, first3, after, wins, finalK: r.k, finalQ: r.q, log: r.aq && r.aq.log, errors: t.errors.length };
  if (t.errors.length) console.log('    ERRORS', t.errors.slice(0, 3));
  await t.close();
}

async function hitch() {
  console.log('\n== k-change hitches: viewport resize steps during play (desktop DPR 1; each size held 3.5 s)');
  const t = await open({ html: HTML, profile: 'desk1', wait: false, init: REC });
  await t.page.waitForFunction(() => !!window.__fizzpop && window.__fizzpop.bootMs >= 0, null, { timeout: 120000 });
  await startScene(t, 'typical');
  await sleep(4000);
  const sizes = [[1280, 800], [1100, 700], [960, 640], [820, 600], [700, 500], [1000, 760], [1280, 800], [1500, 900], [1280, 800]];
  const marks = [];
  for (const [w, h] of sizes) {
    const at = await t.page.evaluate(() => performance.now());
    await t.page.setViewportSize({ width: w, height: h });
    await sleep(3500);
    const k = await t.page.evaluate(() => fz._main.k());
    marks.push({ w, h, k, at });
  }
  const r = await t.page.evaluate(() => ({ fr: window.__fr, gstats: fz.GFX._stats ? fz.GFX._stats() : null }));
  const rows = [];
  marks.forEach((m, i) => { const to = i + 1 < marks.length ? marks[i + 1].at : undefined; const s = frameSummary(r.fr, m.at, to); rows.push({ ...m, ...s }); console.log(`  -> ${String(m.w).padStart(4)}x${String(m.h).padEnd(4)} k ${String(m.k).padEnd(5)} worst gap ${String(s.max).padStart(6)} ms  p95 ${String(s.p95).padStart(5)}  frames >50 ms ${s.over50}  >100 ms ${s.over100}`); });
  const all = frameSummary(r.fr, marks[0].at);
  const gaps = Math.max(...rows.map((x) => x.max));
  console.log(`  overall: ${all.n} frames, p95 ${all.p95}, worst gap ${gaps} ms, frames > 50 ms ${all.over50}, > 100 ms ${all.over100}`);
  report.sections.hitch = { rows, all, worstGap: gaps, errors: t.errors.length };
  if (t.errors.length) console.log('    ERRORS', t.errors.slice(0, 3));
  await t.close();
}

async function statics() {
  console.log('\n== static scenes: main-thread busy share (CDP TaskDuration), DPR 2 desktop q2');
  const t = await open({ html: HTML, profile: 'desk2', wait: false, init: REC });
  await t.page.waitForFunction(() => !!window.__fizzpop && window.__fizzpop.bootMs >= 0, null, { timeout: 120000 });
  await t.cdp.send('Performance.enable');
  report.sections.static = {};
  const measure = async (label, setup, ms = 5000, warm = 2500) => {
    await t.page.evaluate(setup); await sleep(warm);
    const f0 = await t.page.evaluate(() => (fz._main.frameStats ? fz._main.frameStats() : null)); const m0 = await cpuMetrics(t);
    await sleep(ms);
    const m1 = await cpuMetrics(t); const f1 = await t.page.evaluate(() => (fz._main.frameStats ? fz._main.frameStats() : null));
    const busy = 100 * (m1.TaskDuration - m0.TaskDuration) * 1000 / ms, script = 100 * (m1.ScriptDuration - m0.ScriptDuration) * 1000 / ms;
    const renders = f0 && f1 ? +((f1.renders - f0.renders) * 1000 / ms).toFixed(1) : null;
    report.sections.static[label] = { busyPct: +busy.toFixed(1), scriptPct: +script.toFixed(1), rendersPerSec: renders };
    console.log(`  ${label.padEnd(40)} main thread busy ${busy.toFixed(1).padStart(5)} %  (script ${script.toFixed(1).padStart(5)} %)  renders/s ${renders === null ? 'n/a' : renders}`);
  };
  await measure('title, idle after its intro', () => { window.fz = window.__fizzpop; fz.goto('title'); }, 5000, 4000);
  await measure('how-to page', () => { fz.goto('howto'); });
  await measure('hi-scores', () => { fz.goto('scores'); });
  await measure('paused game (P)', () => { fz.start(1, 8, 5); fz.Game.debug.skipIntro(); fz.step(30); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', code: 'KeyP', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'p', code: 'KeyP', bubbles: true })); });
  await measure('running game (control, typical, no input)', () => { fz.start(1, 8, 5); fz.Game.debug.skipIntro(); fz.Game.debug.god(true); });
  await t.page.evaluate(() => fz.goto('title'));
  await measure('page blurred (click-to-resume overlay)', () => { document.hasFocus = () => false; window.dispatchEvent(new Event('blur')); });
  if (t.errors.length) console.log('    ERRORS', t.errors.slice(0, 3));
  report.sections.static.errors = t.errors.length;
  await t.close();
}

async function boot() {
  console.log('\n== boot to interactive title at 4x CPU throttle (desktop viewport), median of 3');
  const ms = [];
  for (let i = 0; i < 3; i++) { const t = await open({ html: HTML, profile: 'desk1', cpu: 4, wait: false }); await t.page.waitForFunction(() => !!window.__fizzpop && window.__fizzpop.bootMs >= 0, null, { timeout: 120000 }); ms.push(await t.page.evaluate(() => __fizzpop.bootMs)); await t.close(); }
  ms.sort((a, b) => a - b); console.log(`  bootMs ${ms.join(' / ')}  median ${ms[1]} ms`);
  report.sections.boot = { ms, median: ms[1] };
}

console.log(`FIZZ & POP real-frame-time budgets  ${HTML.replace(/.*scratchpad\/fizzpop\//, '')}  tag ${TAG}`);
for (const [n, f] of [['desk', desk], ['phone', phone], ['hitch', hitch], ['static', statics], ['boot', boot]]) { if (!want(n)) continue; try { await f(); } catch (e) { console.log(`  [${n}] threw ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`); report.sections[n] = { threw: String(e) }; } }
fs.writeFileSync(path.join(OUT, `budgets_real_${TAG}.json`), JSON.stringify(report, null, 1));
console.log('\nThis VM: software-rasterised canvas (every canvas pixel is paid on the CPU, no GPU compositing), 4 shared cores, headless Chromium at a 60 Hz rAF. It can show relative A/B differences, hitches (long frames from JS, bakes, GC) and static-scene CPU. It cannot show real GPU raster/commit cost, thermal throttling or a phone\'s real 6x slowdown (CPU throttle only scales JS).');
