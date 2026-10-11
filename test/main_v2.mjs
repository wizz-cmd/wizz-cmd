// FIZZ & POP v2 — Main checks for SPEC_V2 sec. 1 (render architecture) and sec. 3 (Main). Real build (dist/fizzpop.html).
//   k quantisation + GFX.setScale on resize / DPR change, the transform / smoothing every frame, the postFX call and its guards, auto quality
//   transitions (simulated slow / fast frames, anti-flap, lock, a real CPU throttle), reduced motion -> Game.setOptions + the scenes,
//   photosensitivity (no bright full-screen fill above 12 % alpha, no luminance jump), the LOADING first paint, boot time at 4x CPU throttle,
//   static back layers survive a resize, page chrome tokens, bundle size.
// Usage: node test/main_v2.mjs        -> out/main/v2/*.png, exit 1 on any failure.   (build first: ./build.sh)
import fs from 'fs';
import path from 'path';
import { launch, canvasShot, pageShot, fp, PROJECT } from '../tools/harness.mjs';

const OUT = path.join(PROJECT, 'out', 'main', 'v2');
fs.mkdirSync(OUT, { recursive: true });
const HTML = process.env.V2_HTML || path.join(PROJECT, 'dist', 'fizzpop.html');
let failed = 0, passed = 0;
const check = (name, cond, extra = '') => { if (cond) passed++; else failed++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '   ' + extra}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function group(name, fn) {
  if (process.env.ONLY_GROUPS && !process.env.ONLY_GROUPS.split(',').includes(name)) return;
  console.log(`\n== ${name}`);
  try { await fn(); } catch (e) { check(name + ' threw', false, e && e.stack ? e.stack : String(e)); }
}
async function open(opts = {}) {
  const t = await launch({ html: HTML, viewport: { width: 1280, height: 800 }, ...opts });
  t.g = fp(t.page);
  await t.page.waitForFunction(() => !!window.__fizzpop);
  await t.page.evaluate(() => window.__fizzpop.scene());                    // finish the boot
  t.noErrors = (label = 'zero console/page errors') => check(label, t.errors.length === 0, JSON.stringify(t.errors));
  t.k = () => t.g.evaluate(() => fz._main.k());
  t.lay = () => t.g.evaluate(() => fz._main.layout());
  t.cv = () => t.page.evaluate(() => { const c = document.getElementById('screen'); return { w: c.width, h: c.height }; });
  return t;
}
const is025 = (k) => Math.abs(k * 4 - Math.round(k * 4)) < 1e-9;
/** Mean luminance (0..255) of the canvas, sampled on a 64 x 56 grid. */
const MEAN_LUM = () => { const c = document.getElementById('screen'), t = document.createElement('canvas'); t.width = 64; t.height = 56; const g = t.getContext('2d'); g.drawImage(c, 0, 0, 64, 56); const d = g.getImageData(0, 0, 64, 56).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; return s / (d.length / 4); };

// ---------------------------------------------------------------------------------------------------------------------------
await group('k-quantisation-and-setScale', async () => {
  const t = await open();
  const page = t.page, g = t.g;
  await g.evaluate(() => { window.__sc = []; const G = fz.GFX, o = G.setScale; G.setScale = function (k) { window.__sc.push(k); return o.apply(this, arguments); }; });
  const seen = [];                                                           // distinct k in the order the layouts produced them
  const sizes = [[1280, 800], [1000, 700], [800, 600], [640, 480], [390, 844], [1920, 1080], [2560, 1440], [100, 100], [1280, 800], [4000, 3000], [360, 640]];
  let prev = await t.k();
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    await wait(180);
    const L = await t.lay(), c = await t.cv();
    check(`${w}x${h}: k ${L.k} is a 0.25 step in 1..8`, is025(L.k) && L.k >= 1 && L.k <= 8, JSON.stringify(L));
    check(`${w}x${h}: backing store ${c.w}x${c.h} = 256k x 224k`, c.w === 256 * L.k && c.h === Math.round(224 * L.k), JSON.stringify({ c, k: L.k }));
    if (L.k !== prev) seen.push(L.k);
    prev = L.k;
  }
  const log = await g.evaluate(() => window.__sc.slice());
  check(`GFX.setScale(k) is called exactly when k changes, with the new k, in order: ${JSON.stringify(seen)}`, JSON.stringify(log) === JSON.stringify(seen), JSON.stringify({ log, seen }));
  check('the clamps: a 100x100 window is k 1, a 4000x3000 window is k 8 (the picture then stretches to fill)', seen.includes(1) && seen.includes(8));
  const hook = await g.evaluate(() => fz._main.scaleLog());
  check('_main.scaleLog() mirrors what GFX received', JSON.stringify(hook.slice(-log.length)) === JSON.stringify(log), JSON.stringify({ hook, log }));
  t.noErrors();
  await t.close();
});

await group('dpr-change', async () => {
  const t = await open();
  const g = t.g;
  const cdp = await t.context.newCDPSession(t.page);
  await g.evaluate(() => { window.__sc = []; const G = fz.GFX, o = G.setScale; G.setScale = function (k) { window.__sc.push(k); return o.apply(this, arguments); }; });
  const set = (dpr) => cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: dpr, mobile: false });
  check('start: DPR 1 -> k 3, canvas 768x672', (await t.k()) === 3 && (await t.cv()).w === 768);
  const expect = [[2, 6], [3, 8], [1.5, 4.75], [1, 3]];                     // 1280x800 with the legend: css 768 (DPR 2: 6 x 256 = 1536 backing px), k capped at 8, 1.5 -> 4.75 (a 0.25 step, 2.3 % under the free space), back
  for (const [dpr, kWant] of expect) {
    await set(dpr);
    await wait(450);
    const L = await t.lay(), c = await t.cv();
    check(`DPR ${dpr}: Main noticed (layout.dpr ${L.dpr}), k ${L.k} (want ${kWant}), backing ${c.w}x${c.h}`, L.dpr === dpr && L.k === kWant && c.w === 256 * kWant, JSON.stringify(L));
  }
  const log = await g.evaluate(() => window.__sc.slice());
  check(`GFX.setScale followed every DPR change: ${JSON.stringify(log)}`, JSON.stringify(log) === JSON.stringify(expect.map((e) => e[1])), JSON.stringify(log));
  await cdp.send('Emulation.clearDeviceMetricsOverride').catch(() => {});
  t.noErrors();
  await t.close();
});

await group('transform-and-postfx', async () => {
  const t = await open();
  const g = t.g;
  await g.freeze(true);
  await g.evaluate(() => {
    window.__log = [];
    const G = fz.GFX, ot = G.text, op = G.postFX;
    G.text = function (c, ...a) { const m = c.getTransform(); window.__log.push(['text', m.a, m.d, c.imageSmoothingEnabled, c.canvas.id]); return ot.call(this, c, ...a); };
    G.postFX = function (c, q) { const m = c.getTransform(); window.__log.push(['post', q, c.canvas.id, m.a, c.canvas.width]); return op.call(this, c, q); };
  });
  const k = await t.k();
  await g.goto('title'); await g.step(2);
  const log = await g.evaluate(() => window.__log.slice());
  const texts = log.filter((e) => e[0] === 'text'), posts = log.filter((e) => e[0] === 'post');      // (the title records its text on a layer canvas of the same resolution)
  check(`every frame draws the scene under setTransform(k,0,0,k,0,0) (k ${k}) with smoothing on: ${texts.length} GFX.text calls`, texts.length > 5 && texts.every((e) => e[1] === k && e[2] === k && e[3] === true), JSON.stringify(texts.slice(0, 3)));
  check('GFX.postFX(ctx, quality) is called after the scene, on the visible context, once per frame', posts.length >= 2 && posts.every((e) => e[1] === 2 && e[2] === 'screen' && e[4] === 256 * k), JSON.stringify(posts));
  const lastText = log.map((e) => e[0]).lastIndexOf('text'), lastPost = log.map((e) => e[0]).lastIndexOf('post');
  check('...and it is the LAST thing that happens in the frame (after every text run)', lastPost > lastText, `${lastText} ${lastPost}`);
  for (const [q, want] of [[1, 1], [0, null]]) {
    await g.evaluate((q) => { window.__log.length = 0; fz._main.setQuality(q, true); }, q);
    await g.step(1);
    const posts2 = (await g.evaluate(() => window.__log.filter((e) => e[0] === 'post')));
    check(`quality ${q}: postFX ${want === null ? 'is not called at all' : 'is called with ' + want}`, want === null ? posts2.length === 0 : posts2.length >= 1 && posts2.every((e) => e[1] === want), JSON.stringify(posts2));
  }
  await g.evaluate(() => { fz._main.setQuality(2, false); });
  // a postFX that throws is logged once and the frame still completes
  await g.evaluate(() => { fz._main.autoQualityReset(); fz._main.setQuality(2, true); fz.GFX.postFX = () => { throw new Error('boom post'); }; });
  await g.step(3);
  check('a throwing GFX.postFX is logged exactly once and the loop survives', t.errors.length === 1 && /boom post/.test(t.errors[0]) && (await g.scene()) === 'title', JSON.stringify(t.errors));
  await t.close();
});

await group('auto-quality', async () => {
  const t = await open();
  const g = t.g;
  await g.freeze(true);
  const q = () => g.evaluate(() => fz._main.quality());
  const gameQ = () => g.evaluate(() => fz.Game.debug.options().quality);
  const feed = (cost, dt, n) => g.evaluate(([cost, dt, n]) => { for (let i = 0; i < n; i++) fz._main.autoQualityFeed(cost, dt); return fz._main.quality(); }, [cost, dt, n]);
  const state = () => g.evaluate(() => fz._main.autoQuality());
  const reset = () => g.evaluate(() => { fz._main.autoQualityReset(); fz._main.setQuality(2, false); });
  await reset();
  check('desktop: starts at quality 2, readable as __fizzpop.quality and _main.quality()', (await q()) === 2 && (await g.evaluate(() => fz.quality)) === 2);
  // the 2-s average of update + render + postFX above 12 ms drops one level
  check('119 slow frames (20 ms) = 1.98 s: no change yet (a window is 2 s)', (await feed(20, 16.7, 119)) === 2);
  check('the 120th completes the window: 2 -> 1', (await feed(20, 16.7, 1)) === 1);
  check('Game.setOptions followed (Game quality 1)', (await gameQ()) === 1);
  check('another slow 2 s: 1 -> 0', (await feed(20, 16.7, 120)) === 0 && (await gameQ()) === 0);
  check('...and it stays at 0 (the floor) however slow it gets', (await feed(40, 16.7, 600)) === 0);
  // 6..12 ms: hold
  await reset(); await feed(20, 16.7, 120);                                  // -> 1
  check('a 9 ms average (between 6 and 12) for 60 s changes nothing', (await feed(9, 16.7, 3600)) === 1);
  // raise: 10 s under 6 ms
  await reset(); await feed(20, 16.7, 240);                                  // -> 0, no raise yet
  check('4 calm windows (8 s under 6 ms) do not raise yet', (await feed(3, 16.7, 480)) === 0);
  check('the 5th (10 s under 6 ms) raises one level: 0 -> 1', (await feed(3, 16.7, 120)) === 1 && (await gameQ()) === 1);
  check('and 10 s more: 1 -> 2 (the ceiling)', (await feed(3, 16.7, 600)) === 2 && (await feed(3, 16.7, 1200)) === 2);
  // anti-flap: a raise undone at once doubles the wait
  await reset(); await feed(20, 16.7, 120);                                  // 2 -> 1
  await feed(3, 16.7, 600);                                                  // 10 s calm: 1 -> 2
  check('(setup) raised back to 2', (await q()) === 2);
  check('the raise is undone by the next slow window: 2 -> 1 ...', (await feed(20, 16.7, 120)) === 1);
  const st1 = await state();
  check(`...and the next raise now waits twice as long (${st1.raiseWaitMs} ms)`, st1.raiseWaitMs === 20000, JSON.stringify(st1));
  check('10 s calm is no longer enough', (await feed(3, 16.7, 600)) === 1);
  check('20 s calm raises again', (await feed(3, 16.7, 600)) === 2);
  // lock
  await reset();
  await g.evaluate(() => fz._main.setQuality(1, true));
  check('setQuality(q, lock) pins the level: slow frames do not move it', (await feed(40, 16.7, 600)) === 1 && (await state()).locked === true);
  await reset();
  // garbage in
  check('NaN / negative / zero input is ignored', (await feed(NaN, 16.7, 10)) === 2 && (await feed(-5, 16.7, 10)) === 2 && (await feed(20, 0, 10)) === 2);
  // coarse pointer devices start at 1
  const m = await open({ viewport: { width: 390, height: 844 }, touch: true });
  check('coarse-pointer (phone): starts at quality 1', (await m.g.evaluate(() => fz._main.quality())) === 1 && (await m.g.evaluate(() => fz.Game.debug.options().quality)) === 1);
  await m.close();
  t.noErrors();
  await t.close();
});

// Integrator (v2.0): the resolution lever below quality 0 + the severe-overload fast path (SPEC_V2 5: p95 <= 16 ms after the first 3 s at 6x throttle on a 390x844 DPR 3 phone)
await group('resolution-lever', async () => {
  const t = await open({ viewport: { width: 1280, height: 800 } });
  const g = t.g;
  await g.freeze(true);
  const feed = (cost, dt, n) => g.evaluate(([cost, dt, n]) => { for (let i = 0; i < n; i++) fz._main.autoQualityFeed(cost, dt); return { q: fz._main.quality(), k: fz._main.k() }; }, [cost, dt, n]);
  const reset = () => g.evaluate(() => { fz._main.autoQualityReset(); fz._main.setQuality(2, false); });
  await reset();
  const k0 = await t.k(), css0 = (await t.lay()).w;
  check(`desktop 1280x800 starts at k ${k0} with no cap`, (await g.evaluate(() => fz._main.autoQuality().kCap)) === null);
  await g.evaluate(() => { window.__sc = []; const G = fz.GFX, o = G.setScale; G.setScale = function (k) { window.__sc.push(k); return o.apply(this, arguments); }; });
  // moderate overload (20 ms): quality first (2 -> 1 -> 0), only then the lever, one bucket step per 2 s window
  let r = await feed(20, 16.7, 240);
  check('20 ms frames: quality 2 -> 0 first, k untouched so far', r.q === 0 && r.k === k0, JSON.stringify(r));
  r = await feed(20, 16.7, 121);
  const k1 = r.k;
  check(`the next slow 2 s window lowers the render scale one bucket (${k0} -> ${k1}, <= 80 %)`, k1 < k0 && k1 <= k0 * 0.8 + 1e-9 && k1 >= 1.5, JSON.stringify(r));
  const L1 = await t.lay();
  check('the css size is unchanged (the browser upscales), the backing store follows k', L1.w === css0 && (await t.cv()).w === 256 * k1 && L1.kNat === k0, JSON.stringify(L1));
  r = await feed(20, 16.7, 600);
  check('it keeps stepping down while slow but never below k 1.5', r.k === 1.5 || r.k >= 1.5, JSON.stringify(r));
  r = await feed(40, 16.7, 1200);
  check('...floor 1.5', r.k === 1.5 && r.q === 0, JSON.stringify(r));
  const log = await g.evaluate(() => window.__sc.slice());
  check('GFX.setScale followed every step, with bucket values only', log.length >= 2 && log.every((k) => [1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 8].includes(k)), JSON.stringify(log));
  const st = await g.evaluate(() => fz._main.autoQuality());
  check('autoQuality() reports kCap / kNat / k', st.kCap === r.k && st.kNat === k0 && st.k === r.k, JSON.stringify({ kCap: st.kCap, kNat: st.kNat, k: st.k }));
  // raise: 10 s calm raises quality first, then the lever one bucket at a time, then the cap is off
  r = await feed(3, 16.7, 660);
  check('10 s calm: quality 0 -> 1 first (k stays capped)', r.q === 1 && r.k === 1.5, JSON.stringify(r));
  r = await feed(3, 16.7, 660);
  check('10 s more: quality 1 -> 2', r.q === 2 && r.k === 1.5, JSON.stringify(r));
  r = await feed(3, 16.7, 660);
  check('10 s more: the lever is raised one bucket', r.k > 1.5 && r.k <= k0, JSON.stringify(r));
  for (let i = 0; i < 8 && (await g.evaluate(() => fz._main.autoQuality().kCap)) !== null; i++) r = await feed(3, 16.7, 1200);
  check(`...and in the end the cap is off again at the natural k ${k0}`, (await g.evaluate(() => fz._main.autoQuality().kCap)) === null && (await t.k()) === k0, JSON.stringify(r));
  // severe overload: a 0.5 s window (>= 8 frames) averaging > 24 ms steps down at once, and one 900 ms hitch does not
  await reset();
  r = await feed(40, 40, 13);
  check('0.5 s of 40 ms frames: quality 2 -> 1 at once (no 2 s wait)', r.q === 1, JSON.stringify(r));
  r = await feed(40, 40, 13);
  check('another 0.5 s: 1 -> 0', r.q === 0, JSON.stringify(r));
  r = await feed(40, 40, 13);
  check('another 0.5 s at quality 0: the lever steps down', r.k < k0, JSON.stringify(r));
  await reset();
  r = await feed(250, 250, 2);
  r = await feed(3, 16.7, 90);
  check('two 250 ms hitches (a 0.5 s fast window of only 2 frames: fewer than 8) drop nothing; the 2 s average stays 8 ms (hold zone 6..12)', r.q === 2 && r.k === k0, JSON.stringify(r));
  // locked: the lever does nothing either
  await g.evaluate(() => fz._main.setQuality(2, true));
  r = await feed(60, 16.7, 1200);
  check('locked quality pins k as well', r.q === 2 && r.k === k0, JSON.stringify(r));
  await reset();
  await g.evaluate(() => fz._main.setKCap(2));
  check('_main.setKCap(2) caps k at 2; setKCap(null) lifts it', (await t.k()) === 2 && (await g.evaluate(() => fz._main.setKCap(null))) === k0);
  t.noErrors();
  await t.close();
});

await group('auto-quality-real-throttle', async () => {
  const t = await open();
  const g = t.g;
  await g.start(1, 6, 3);
  const cdp = await t.context.newCDPSession(t.page);
  const q0 = await g.evaluate(() => fz._main.quality());
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 20 });
  let q = q0, waited = 0;
  while (q >= q0 && waited < 20000) { await wait(500); waited += 500; q = await g.evaluate(() => fz._main.quality()); }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const st = await g.evaluate(() => fz._main.autoQuality());
  check(`a real 20x CPU throttle in play drops the quality within 20 s (${q0} -> ${q} after ${waited} ms, window avg ${st.windowAvgMs.toFixed(1)} ms)`, q < q0, JSON.stringify(st));
  check('...Game follows', (await g.evaluate(() => fz.Game.debug.options().quality)) === q);
  const perf = await g.evaluate(() => fz._main.perf());
  check('_main.perf() reports n, avg, p95, max of the last frames', perf.n > 10 && perf.avg > 0 && perf.p95 >= perf.avg * 0.5 && perf.max >= perf.p95, JSON.stringify(perf));
  t.noErrors();
  await t.close();
});

await group('reduced-motion', async () => {
  const t = await open();
  const g = t.g, page = t.page;
  await g.evaluate(() => { window.__opt = []; const G = fz.Game, o = G.setOptions; G.setOptions = function (x) { window.__opt.push(JSON.parse(JSON.stringify(x))); return o.apply(this, arguments); }; });
  check('default: no reduced motion', (await g.evaluate(() => fz._main.reducedMotion())) === false && (await g.evaluate(() => fz.Game.debug.options().reducedMotion)) === false);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await wait(250);
  check('prefers-reduced-motion: reduce (changed at run time) -> Main follows and tells Game.setOptions({ reducedMotion: true, quality })', await g.evaluate(() => fz._main.reducedMotion() === true && fz.Game.debug.options().reducedMotion === true && window.__opt.some((o) => o.reducedMotion === true && typeof o.quality === 'number')), JSON.stringify(await g.evaluate(() => window.__opt)));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await wait(250);
  check('back to no-preference -> false again', await g.evaluate(() => fz._main.reducedMotion() === false && fz.Game.debug.options().reducedMotion === false));
  // at boot: emulate first, then reload
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await page.waitForFunction(() => !!window.__fizzpop);
  check('reduced motion already set at page load: Main and Game start in reduced mode (before any game started)', await g.evaluate(() => fz._main.reducedMotion() === true && fz.Game.debug.options().reducedMotion === true));
  check('...and it persists into a game (Game.start)', await (async () => { await g.start(1, 1, 3); return g.evaluate(() => fz.Game.debug.options().reducedMotion === true); })());
  // the override hook (null = follow the OS)
  await g.evaluate(() => fz._main.setReducedMotion(false));
  check('setReducedMotion(false) overrides the OS preference', await g.evaluate(() => fz._main.reducedMotion() === false && fz.Game.debug.options().reducedMotion === false));
  await g.evaluate(() => fz._main.setReducedMotion(null));
  check('setReducedMotion(null) follows the OS again', await g.evaluate(() => fz._main.reducedMotion() === true));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await wait(200);
  await g.goto('title');
  await g.freeze(true);
  // ambient: half the bubbles and plankton
  await g.evaluate(() => { window.__dots = 0; const G = fz.GFX, o = G.particle; G.particle = function (c, kind, x, y, size) { if (kind === 'dot' && size <= 1.1) window.__dots++; return o.apply(this, arguments); }; });   // (installed once)
  const count = async (rm) => {
    await g.evaluate((rm) => { fz._main.setReducedMotion(rm); fz._main.setQuality(2, true); }, rm);
    await g.goto('scores'); await g.evaluate(() => fz._main.ambientReset());
    let maxShown = 0, dots = 0;
    for (let i = 0; i < 40; i++) { const a = await g.evaluate(() => { window.__dots = 0; fz.step(12); return { n: fz._main.ambient().shown.length / 3, d: window.__dots }; }); maxShown = Math.max(maxShown, a.n); dots = Math.max(dots, a.d); }   // (one synchronous step = exactly one render: the real loop keeps rendering while frozen)
    return { maxShown, dots };
  };
  const full = await count(false), red = await count(true);
  check(`reduced motion halves the ambient bubbles (max drawn ${red.maxShown} <= 7; full ${full.maxShown})`, red.maxShown <= 7 && red.maxShown <= full.maxShown, JSON.stringify({ full, red }));
  check(`...and the plankton (${red.dots} specks vs ${full.dots})`, full.dots >= 40 && red.dots <= 16, JSON.stringify({ full, red }));
  t.noErrors();
  await t.close();
});

await group('photosensitivity', async () => {
  // (a) no light full-screen fill brighter than 12 % alpha in any scene, with and without reduced motion; the story's grab flash exists only without it
  for (const rm of [false, true]) {
    const t = await open();
    const g = t.g;
    await g.freeze(true);
    await g.evaluate((rm) => {
      fz._main.setReducedMotion(rm); fz._main.setQuality(0, true);
      window.__fills = [];
      const o = CanvasRenderingContext2D.prototype.fillRect;
      CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
        if (w >= 250 && h >= 100 && typeof this.fillStyle === 'string') {
          const m = /rgba?\(([^)]+)\)/.exec(this.fillStyle);
          if (m) { const p = m[1].split(',').map(Number); window.__fills.push({ r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1, op: this.globalCompositeOperation, ga: this.globalAlpha, w, h }); }
        }
        return o.apply(this, arguments);
      };
    }, rm);
    const scenes = [['title', undefined, 120], ['story', { next: { players: 1, level: 1, seed: 1 } }, 360], ['howto', { page: 0 }, 30], ['scores', {}, 60], ['entry', { entries: [{ pi: 0, score: 5000, round: 1 }] }, 90],
      ['ending', { res: { won: true, level: 30, scores: [1, 0], players: 1 }, entries: [] }, 420]];
    let grab = 0;
    for (const [name, args, frames] of scenes) {
      await g.goto(name, args);
      await g.evaluate(() => { window.__fills.length = 0; });
      await g.evaluate((n) => { for (let i = 0; i < n; i++) fz.step(1); }, frames);       // one render per frame (the story's flash lasts 8 frames)
      const fills = await g.evaluate(() => window.__fills.slice());
      const bright = fills.filter((f) => Math.max(f.r, f.g, f.b) >= 150 && f.a * f.ga > 0.125);
      check(`${rm ? 'reduced motion: ' : ''}${name}: no light full-screen fill above 12 % alpha (${fills.length} full-screen fills seen)`, bright.length === 0, JSON.stringify(bright.slice(0, 3)));
      if (name === 'story') grab = fills.filter((f) => Math.max(f.r, f.g, f.b) >= 150 && f.a > 0.02).length;
    }
    if (rm) check('reduced motion: the story\'s pearl-grab flash is gone', grab === 0, String(grab));
    else check('(sanity) without reduced motion the story\'s single, soft grab flash is drawn (<= 8 frames)', grab >= 1 && grab <= 8, String(grab));
    t.noErrors();
    await t.close();
  }
  // (b) no strobing: the mean luminance never jumps by more than 15 % of full scale from one frame to the next, and fewer than 3 jumps per second above 6 %
  const t = await open();
  const g = t.g;
  await g.freeze(true);
  for (const [name, args, frames] of [['title', undefined, 300], ['story', { next: { players: 1, level: 1, seed: 1 } }, 330], ['ending', { res: { won: true, level: 30, scores: [1, 0], players: 1 }, entries: [] }, 600], ['scores', {}, 120]]) {
    await g.goto(name, args);
    let prev = await g.evaluate(MEAN_LUM), maxJump = 0, big = [];
    for (let i = 0; i < frames; i++) {
      await g.step(1);
      const v = await g.evaluate(MEAN_LUM), j = Math.abs(v - prev);
      maxJump = Math.max(maxJump, j); if (j > 255 * 0.06) big.push(i);
      prev = v;
    }
    const perSec = (big.length / frames) * 60;
    check(`${name}: biggest frame-to-frame jump of the mean luminance ${maxJump.toFixed(1)} / 255 (<= 38), ${big.length} jumps above 6 % in ${frames} frames (<= 3 per second)`, maxJump <= 255 * 0.15 && perSec <= 3, JSON.stringify(big.slice(0, 10)));
  }
  t.noErrors();
  await t.close();
});

await group('loading-and-boot', async () => {
  // the very first paint: a LOADING frame at the FINAL resolution (canvas already 256k wide) before GFX.init / the first scene
  const t = await launch({ html: HTML, wait: false, initScript: `
    window.__first = null;
    document.addEventListener('DOMContentLoaded', () => {
      const c = document.getElementById('screen'); if (!c) return;
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let lit = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 60) lit++;
      window.__first = { w: c.width, h: c.height, lit, hooks: !!window.__fizzpop, boot: window.__fizzpop ? window.__fizzpop.bootMs : null, loading: window.__fizzpop ? window.__fizzpop.loadingMs : null };
    });` });
  await t.page.waitForFunction(() => window.__first, null, { timeout: 8000 });
  const f = await t.page.evaluate(() => window.__first);
  check(`DOMContentLoaded: the canvas is already sized for the screen (${f.w}x${f.h}, a 256k x 224k backing store) and shows the LOADING frame (${f.lit} lit pixels)`, f.w >= 256 && f.w % 64 === 0 && f.h === Math.round(f.w * 224 / 256) && f.lit > 40 && f.hooks, JSON.stringify(f));
  check('...before the boot completed (bootMs -1 at that point, loadingMs >= 0)', f.boot === -1 && f.loading >= 0, JSON.stringify(f));
  await t.page.waitForFunction(() => window.__fizzpop.bootMs >= 0, null, { timeout: 8000 });
  const b = await t.page.evaluate(() => ({ boot: window.__fizzpop.bootMs, loading: window.__fizzpop.loadingMs }));
  check(`boot order: LOADING (${b.loading} ms) comes before the first title paint (${b.boot} ms)`, b.loading >= 0 && b.boot > b.loading, JSON.stringify(b));
  t.errors.length === 0 ? check('zero console errors', true) : check('zero console errors', false, JSON.stringify(t.errors));
  await t.close();
  // boot to an interactive title <= 1.5 s at 4x CPU throttle (SPEC_V2 sec. 5); best of 3 (a shared build machine is noisy)
  const times = [];
  for (let i = 0; i < 3; i++) {
    const u = await launch({ html: 'about:blank' });
    const cdp = await u.context.newCDPSession(u.page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await u.page.goto('file://' + HTML, { waitUntil: 'commit' });
    await u.page.waitForFunction(() => window.__fizzpop && window.__fizzpop.bootMs >= 0, null, { timeout: 15000 });
    times.push(await u.page.evaluate(() => window.__fizzpop.bootMs));
    await u.close();
  }
  console.log('      boot to the first title paint at 4x CPU throttle (ms since navigation start): ' + times.join(', '));
  check(`boot to interactive title <= 1500 ms at 4x CPU throttle (best of 3: ${Math.min(...times)} ms)`, Math.min(...times) <= 1500, times.join(','));
});

await group('crisp-pixel-grid', async () => {
  // "Crisp at DPR 1 / 2 / 3": when the layout snapped (backing px = device px), alternating 1-px columns drawn on the backing store must reach the
  // screen as runs of exactly one device pixel (the re-based successor of qa_platform_r2_pixelgrid / the old integer-scale checks).
  for (const [w, h, dpr, touch] of [[1280, 800, 1, false], [1280, 800, 2, false], [1920, 1080, 1, false], [390, 844, 3, true], [412, 915, 2, true], [844, 390, 2, true], [1024, 768, 1.5, false], [800, 600, 1, false]]) {
    const t = await open({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, touch });
    const g = t.g;
    await g.freeze(true);
    const L = await t.lay();
    await t.page.evaluate(() => { window.requestAnimationFrame = () => 0; document.getElementById('focus').style.display = 'none'; });       // (the click-to-play overlay would sit on top of the canvas in the screenshot)
    await wait(120);
    await t.page.evaluate(() => { const c = document.getElementById('screen'), x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); for (let i = 0; i < c.width; i++) { x.fillStyle = i % 2 ? '#fff' : '#000'; x.fillRect(i, 0, 1, c.height); } });
    await wait(100);
    const box = await t.page.evaluate(() => { const r = document.getElementById('screen').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    // clip on whole DEVICE pixels, strictly inside the canvas (a fractional clip makes the screenshot itself resample and would show moire beats)
    const x0 = Math.ceil(box.x * dpr) + 2, x1 = Math.floor((box.x + box.w) * dpr) - 2;
    const buf = await t.page.screenshot({ clip: { x: x0 / dpr + 1e-4, y: Math.round(box.y + box.h / 2 - 1), width: (x1 - x0) / dpr - 2e-4, height: 2 } });
    const hist = await t.page.evaluate(async (b64) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, img.width, 1).data; const runs = []; let cur = d[0] > 127, n = 0;
      for (let i = 0; i < img.width; i++) { const v = d[i * 4] > 127; if (v === cur) n++; else { runs.push(n); cur = v; n = 1; } } runs.push(n);
      const hh = {}; runs.slice(1, -1).forEach((r) => { hh[r] = (hh[r] || 0) + 1; }); return hh;
    }, buf.toString('base64'));
    const keys = Object.keys(hist).map(Number), total = keys.reduce((a, k) => a + hist[k], 0), ones = hist[1] || 0;
    // Exactly 1 device pixel per column whenever css width x DPR is exact. Chrome lays boxes out in 1/64 css px, so at DPR 3 / k 4 (341.333 css px) the canvas
    // is 0.016 device px short of 1024: stripes then show two ~34 px moire beats (every other run 1 px, >= 99 % of the runs). Both are crisp for real content.
    if (L.snapped) check(`${w}x${h}@${dpr}${touch ? ' touch' : ''}: k ${L.k} snapped -> every column run is 1 device pixel (>= 99 %; 1/64 css px layout granularity may add a beat) ${JSON.stringify(hist)}`, ones / total >= 0.99 && Math.max(...keys) <= 40, JSON.stringify(hist));
    else check(`${w}x${h}@${dpr}${touch ? ' touch' : ''}: k ${L.k} not snapped (smooth resample): the screen shows ${JSON.stringify(hist)} (informational, must still render)`, keys.length >= 1);
    t.noErrors();
    await t.close();
  }
});

await group('static-layers-and-resize', async () => {
  // the baked backdrops (static layer, logo layer, shaft) must be rebuilt at the new scale: a title at k 3 and at k 2 look the same at thumbnail size
  const t = await open();
  const g = t.g;
  await g.freeze(true);
  await g.evaluate(() => fz._main.setQuality(0, true));
  const thumb = () => g.evaluate(() => {
    const c = document.getElementById('screen'), s = document.createElement('canvas'); s.width = 32; s.height = 28;
    const x = s.getContext('2d'); x.drawImage(c, 0, 0, 32, 28);
    return Array.from(x.getImageData(0, 0, 32, 28).data);
  });
  await g.goto('title'); await g.step(40);
  const a = await thumb();
  await canvasShot(t.page, path.join(OUT, 'title_k3.png'), { scale: 1 });
  await t.page.setViewportSize({ width: 800, height: 600 });
  await wait(300);
  const k2 = await t.k();
  const b = await thumb();
  await canvasShot(t.page, path.join(OUT, 'title_resized.png'), { scale: 1 });
  let diff = 0; for (let i = 0; i < a.length; i += 4) diff += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
  diff /= (a.length / 4) * 3;
  check(`after a resize (k 3 -> ${k2}) the frame is repainted at once (frozen loop) and matches the old one (mean thumbnail difference ${diff.toFixed(1)} / 255 <= 14)`, k2 !== 3 && diff <= 14, `${diff} k=${k2}`);
  const lit = b.reduce((s, v, i) => s + (i % 4 < 3 ? v : 0), 0) / (b.length / 4 * 3);
  check(`the repainted frame is not black / empty (mean ${lit.toFixed(1)})`, lit > 8, String(lit));
  const big = await g.evaluate(() => fz._main.bigHeroes());
  check(`the big title twins were re-baked for the new scale and the cache is bounded (${big.count} frames, ${(big.px / 1e6).toFixed(2)} Mpx <= 5)`, big.count >= 2 && big.px <= 5e6, JSON.stringify(big));
  t.noErrors();
  await t.close();
});

await group('page-chrome-and-budget', async () => {
  const st = fs.statSync(HTML).size;
  check(`bundle ${(st / 1024).toFixed(0)} KB <= 1.5 MB (SPEC_V2 sec. 5)`, st <= 1.5 * 1024 * 1024);
  const css = async (opts, js) => { const t = await open(opts); const r = await t.page.evaluate(js); noErrorsOf(t); await t.close(); return r; };
  const noErrorsOf = (t) => check('zero errors', t.errors.length === 0, JSON.stringify(t.errors));
  const btn = () => { const b = document.querySelector('[data-k="fire"]'), c = getComputedStyle(b), r = getComputedStyle(document.documentElement); return { color: c.color, bg: c.backgroundColor, edge: c.borderTopColor, page: getComputedStyle(document.body).backgroundColor, ir: getComputedStyle(document.getElementById('screen')).imageRendering, scheme: r.colorScheme }; };
  const dark = await css({ viewport: { width: 390, height: 844 }, touch: true, colorScheme: 'dark' }, btn);
  const light = await css({ viewport: { width: 390, height: 844 }, touch: true, colorScheme: 'light' }, btn);
  check(`dark: the abyss page (${dark.page}), glass buttons with pale cyan ink (${dark.color}) and a cyan hairline (${dark.edge})`, dark.page === 'rgb(5, 7, 15)' && dark.color === 'rgb(191, 244, 255)' && /rgba\(60, 242, 255/.test(dark.edge) && dark.scheme === 'dark', JSON.stringify(dark));
  check(`light: a light page around the dark canvas (${light.page}), dark-navy ink on the buttons (${light.color}) on white`, light.page === 'rgb(233, 238, 246)' && light.color === 'rgb(11, 26, 51)' && light.bg === 'rgb(255, 255, 255)' && light.scheme === 'light', JSON.stringify(light));
  check('image-rendering is auto in both (the pixelated look is gone)', dark.ir === 'auto' && light.ir === 'auto');
  const t = await open({ colorScheme: 'dark', viewport: { width: 1280, height: 800 } });
  await t.g.freeze(true); await t.g.goto('title'); await t.g.step(40);
  await pageShot(t.page, path.join(OUT, 'page_dark.png'));
  const l = await open({ colorScheme: 'light', viewport: { width: 1280, height: 800 } });
  await l.g.freeze(true); await l.g.goto('title'); await l.g.step(40);
  await pageShot(l.page, path.join(OUT, 'page_light.png'));
  t.noErrors(); l.noErrors();
  await t.close(); await l.close();
});

console.log(`\n${failed ? failed + ' FAILED, ' : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
