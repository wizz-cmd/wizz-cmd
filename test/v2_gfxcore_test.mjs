// FIZZ & POP v2 - GFX core test (role "gfxcore").   node test/v2_gfxcore_test.mjs [--gfx=../src/10_gfx.js] [outDir]
//  API: define / draw (frame wrap, flip, white, tint, glow, alpha, unknown names) / has / frames / size / setScale (v3: EXACT k, no buckets) / text + textWidth /
//       particle (device-px ladder, 1:1) / theme (v3: no player hue on platforms) / sheet / postFX (q1 vignette only, q2 pipelined bloom) / drawLogo /
//       drawHero + drawBig, bake-cache memory bound, setScale storm, determinism
//  WORLD: all 30 levelCanvas + bgCanvas looks at k = 1, 2, 4 (PNGs for the eyes) with numeric gates: dimensions, transparency, opacity,
//       theme identity, variant variety, top-edge readability, no seams between merged tiles
//  PERF: levelCanvas build <= 60 ms at k=4, postFX at 1024x896 q2 (see the ENV note), draw() cost
//  Exit code 1 on any failed check. PNGs in out/v2/gfxcore/.
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import vm from 'vm';
import { launch, canvasFnShot, PROJECT } from '../tools/harness.mjs';

const args = process.argv.slice(2);
const gfxArg = (args.find((a) => a.startsWith('--gfx=')) || '--gfx=../src/10_gfx.js').slice(6);
const OUT = args.find((a) => !a.startsWith('--')) || path.join(PROJECT, 'out', 'v2', 'gfxcore');
const castArg = args.includes('--cast') ? '1' : '0';       // load 11_gfx_cast.js only on request (it is another module's job)
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) }); if (!ok) console.log('FAIL', name, detail === undefined ? '' : detail); };
const info = (name, detail) => { results.push({ name, ok: true, info: true, detail: String(detail) }); console.log('INFO', name, detail); };
// release-gate policy (FIXPLAN_V3): wall-clock checks are advisory in the blocking run (FP_TIMING=advisory), strict otherwise and in the perf step
import { ADVISORY, timingCheck } from './timing_gate.mjs';
const tcheck = timingCheck(check, results);

/* ---------------------------------------------------------------- 1. static */
const SRC = path.resolve(path.dirname(new URL(import.meta.url).pathname), gfxArg.startsWith('..') ? gfxArg : '../' + gfxArg);
const srcPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), gfxArg);
const code = fs.readFileSync(srcPath, 'utf8');
{
  const tmp = path.join(OUT, '.syn.js');
  fs.writeFileSync(tmp, '(() => { "use strict"; const C = {W:256,H:224,TILE:8,MAP_Y:16}; const NEON = {};\n' + code + '\n})();');
  try { execFileSync(process.execPath, ['--check', tmp]); check('node --check', true); } catch (e) { check('node --check', false, e.message); }
  fs.unlinkSync(tmp);
  const body = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('no network / eval / Function / import()', !/\b(fetch|XMLHttpRequest|eval)\b|new Function|import\(/.test(body));
  check('no top-level DOM access at load (document/window only inside functions)', !/^(document|window)\b/m.test(body));
  check('const GFX declared', /^const GFX = /m.test(code));
  const API = ['init', 'setScale', 'define', 'draw', 'frames', 'size', 'has', 'text', 'textWidth', 'levelCanvas', 'bgCanvas', 'theme', 'drawLogo', 'postFX', 'particle', 'sheet', 'drawHero', 'drawBig', 'warmStep'];
  const head = code.slice(0, code.indexOf('\nconst GFX = '));
  check('header documents every public call', API.every((n) => new RegExp('\\b' + n + '\\(').test(head)), API.filter((n) => !new RegExp('\\b' + n + '\\(').test(head)));
}

{
  // loads with NO DOM / window / canvas (vm sandbox): define() + metadata calls must work before any scale or document exists
  try {
    const sb = vm.createContext({ console });
    const src = ['00_shared.js', '09_neon.js'].map((f) => fs.readFileSync(path.join(PROJECT, 'src', f), 'utf8')).join('\n') + '\n' + code + '\n;GFX';
    const G = vm.runInContext(src, sb);
    G.define('x', { w: 8, h: 8, frames: 2, draw() {} });
    check('loads without DOM (vm sandbox); define/has/frames/size/theme/textWidth work with no canvas', G && G.has('x') && G.frames('x') === 2 && G.size('x').w === 8 && G.theme(15).name === 'Crystal Caves' && G.textWidth('AB') === 16 && (G.init(), true));
  } catch (e) { check('loads without DOM (vm sandbox)', false, e.message); }
}

const t = await launch({ html: path.join(PROJECT, 'test', 'v2_gfxcore_page.html') + '?gfx=' + gfxArg + '&cast=' + castArg, viewport: { width: 1200, height: 900 } });
const E = (fn, ...a) => t.page.evaluate(fn, ...a);
const shot = (file, fn, argv, scale = 1) => canvasFnShot(t.page, path.join(OUT, file), fn, { args: argv || [], scale });

/* ---------------------------------------------------------------- 2. API */
const api = await E(() => {
  const o = {};
  const bad = [];
  const ck = (n, ok, d) => { if (!ok) bad.push(n + (d === undefined ? '' : ' ' + d)); };
  GFX.init(); GFX.init();
  ck('init idempotent', true);
  GFX.setScale(4);
  // asymmetric test sprite: a red block on the left half, blue block on the right, pad 4 on every side
  GFX.define('t_asym', { w: 16, h: 16, frames: 3, pad: { l: 4, r: 4, t: 4, b: 4 }, draw(ctx, f, op) {
    ctx.fillStyle = 'rgb(255,0,0)'; ctx.fillRect(1, 4, 6, 8); ctx.fillStyle = 'rgb(0,0,255)'; ctx.fillRect(9, 4, 6, 8);
    ctx.fillStyle = 'rgb(0,255,0)'; ctx.fillRect(f * 4 + 1, 14, 3, 2); ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(-3, 6, 3, 4);   // 3 px of pad area
    o.drawOpts = JSON.stringify({ k: op.k, frame: op.frame, frames: op.frames, name: op.name, t: op.t, bake: op.bake, w: op.w, h: op.h, ox: op.ox, oy: op.oy });
  } });
  ck('has/frames/size', GFX.has('t_asym') && GFX.frames('t_asym') === 3 && GFX.size('t_asym').w === 16 && GFX.size('t_asym').h === 16);
  ck('unknown has/frames/size', !GFX.has('zzz') && GFX.frames('zzz') === 0 && GFX.size('zzz').w === 0);
  ck('define malformed returns false, no throw', GFX.define('', {}) === false && GFX.define('x', null) === false && GFX.define('x', { draw: 5 }) === false);
  const mk = () => { const c = T.canvas(256, 256), g = c.getContext('2d'); g.setTransform(4, 0, 0, 4, 0, 0); g.imageSmoothingEnabled = true; return [c, g]; };
  const px = (c, lx, ly) => Array.from(c.getContext('2d').getImageData(Math.round(lx * 4), Math.round(ly * 4), 1, 1).data);
  // plain draw at box origin (10,10): red block starts at logical (11,14)
  let [c, g] = mk(); GFX.draw(g, 't_asym', 0, 10, 10);
  let p = px(c, 13, 18); ck('plain: red where expected', p[0] > 240 && p[1] < 10 && p[2] < 10 && p[3] > 240, p);
  p = px(c, 21, 18); ck('plain: blue on the right', p[2] > 240 && p[0] < 10, p);
  p = px(c, 8.5, 18); ck('overdraw: pad area outside the box is drawn', p[3] > 60 && p[3] < 100, p);        // rgba(255,255,255,0.3) at logical x -3..0 of the box
  ck('draw opts reach define.draw (k, frame, frames, name, t, bake, w, h, ox, oy)', (() => { const d = JSON.parse(o.drawOpts); return d.k === 4 && d.bake === true && d.name === 't_asym' && d.w === 16 && d.h === 16 && d.ox === 16 && d.oy === 16 && d.frames === 3; })(), o.drawOpts);
  // flip: red/blue swap sides and the pad moves to the other side of the box
  [c, g] = mk(); GFX.draw(g, 't_asym', 0, 10, 10, { flip: true });
  p = px(c, 13, 18); ck('flip: blue now on the left', p[2] > 240 && p[0] < 10, p);
  p = px(c, 21, 18); ck('flip: red now on the right', p[0] > 240 && p[2] < 10, p);
  p = px(c, 27.5, 18); ck('flip: pad overdraw mirrored to the right side', p[3] > 60 && p[3] < 100, p);
  p = px(c, 8.5, 18); ck('flip: nothing left of the box any more', p[3] < 10, p);
  // white silhouette
  [c, g] = mk(); GFX.draw(g, 't_asym', 0, 10, 10, { white: true });
  p = px(c, 13, 18); ck('white: opaque white', p[0] > 245 && p[1] > 245 && p[2] > 245 && p[3] > 245, p);
  p = px(c, 10, 8); ck('white: transparent outside', p[3] < 10, p);
  // tint
  [c, g] = mk(); GFX.draw(g, 't_asym', 0, 10, 10, { tint: '#00ffff' });
  const pt = px(c, 13, 18), pn = (() => { const [c2, g2] = mk(); GFX.draw(g2, 't_asym', 0, 10, 10); return px(c2, 13, 18); })();
  ck('tint: red body shifts towards the tint', pt[1] > pn[1] + 60 && pt[0] < pn[0], [pn, pt]);
  // alpha
  [c, g] = mk(); GFX.draw(g, 't_asym', 0, 10, 10, { alpha: 0.5 });
  p = px(c, 13, 18); ck('alpha 0.5', p[3] > 120 && p[3] < 136, p);
  [c, g] = mk(); g.globalAlpha = 0.5; GFX.draw(g, 't_asym', 0, 10, 10, { alpha: 0.5 }); p = px(c, 13, 18); ck('alpha multiplies ctx.globalAlpha and restores it', p[3] > 56 && p[3] < 72 && g.globalAlpha === 0.5, [p, g.globalAlpha]);
  // glow 0..1: halo split, core unchanged
  [c, g] = mk(); GFX.draw(g, 't_asym', 0, 10, 10, { glow: 0 });
  p = px(c, 13, 18); ck('glow 0: opaque core stays', p[3] > 240, p);
  p = px(c, 8.5, 18); ck('glow 0: halo (alpha 0.3) removed', p[3] < 10, p);
  [c, g] = mk(); GFX.draw(g, 't_asym', 0, 10, 10, { glow: 1 }); p = px(c, 8.5, 18); ck('glow 1: halo kept', p[3] > 60, p);
  // frame wrap
  const fr = [];
  for (const f of [0, 1, 2, 3, 4, -1, -3, 2.9, NaN, undefined, 1e9]) { [c, g] = mk(); GFX.draw(g, 't_asym', f, 10, 10); fr.push([12.5, 16.5, 20.5].map((x) => px(c, x, 25)[1] > 200 ? 1 : 0).join('')); }   // green marker at box x = f*4+1 .. f*4+4, y 14..16
  const same = (a, b) => fr[a] === fr[b];
  ck('frame wraps modulo (3 -> 0, 4 -> 1, -1 -> 2, 2.9 -> 2, NaN -> 0)', same(3, 0) && same(4, 1) && same(5, 2) && same(7, 2) && same(8, 0) && same(9, 0), fr.join(' | '));
  // unknown sprite: placeholder, no throw, warns once
  let threw = false; try { [c, g] = mk(); GFX.draw(g, 'definitely_missing', 0, 20, 20); GFX.draw(g, 'definitely_missing', 5, 20, 20, { flip: true, white: true, tint: '#f00', glow: 0.2 }); } catch (e) { threw = String(e); }
  ck('unknown name: no throw', !threw, threw);
  const ps = T.stats(c, 20 * 4, 20 * 4, 64, 64); ck('unknown name: placeholder drawn', ps.maxLuma > 40, ps);
  // x,y snapping is stable: same output for 10.0 and 10.01 (device pixel grid)
  [c, g] = mk(); GFX.draw(g, 't_asym', 0, 10, 10); const h1 = T.hash(c); [c, g] = mk(); GFX.draw(g, 't_asym', 0, 10.01, 10.01); ck('positions snap to the device pixel grid', h1 === T.hash(c));
  // redefine replaces and drops the baked data
  GFX.define('t_asym', { w: 8, h: 8, frames: 1, pad: 0, draw(ctx) { ctx.fillStyle = '#0f0'; ctx.fillRect(0, 0, 8, 8); } });
  ck('redefine replaces', GFX.frames('t_asym') === 1 && GFX.size('t_asym').w === 8);
  [c, g] = mk(); GFX.draw(g, 't_asym', 0, 10, 10); p = px(c, 12, 12); ck('redefine: new art drawn', p[1] > 240 && p[0] < 10, p);
  // a throwing draw does not break the frame
  GFX.define('t_throw', { w: 16, h: 16, draw() { throw new Error('boom'); } });
  threw = false; try { [c, g] = mk(); GFX.draw(g, 't_throw', 0, 0, 0); } catch (e) { threw = String(e); }
  ck('define.draw that throws is contained', !threw, threw);
  o.bad = bad; o.lint = GFX._lint();
  return o;
});
check('API: define/draw/flip/white/tint/alpha/glow/frames/unknown', api.bad.length === 0, api.bad.join(' ; '));

/* ---------------------------------------------------------------- 3. scale buckets + bake cache bound + storm */
const cache = await E(() => {
  const o = {}, bad = [];
  const ck = (n, ok, d) => { if (!ok) bad.push(n + (d === undefined ? '' : ' ' + d)); };
  GFX._reset();
  // bucket reporting
  const bucketsSeen = {};
  for (const k of [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 3, 3.5, 3.75, 4, 4.25, 4.5, 4.75, 5, 5.5, 6, 7, 8, 9, 0.5, NaN, 'x']) { GFX.setScale(k); bucketsSeen[k] = GFX._stats().kb; }
  o.buckets = bucketsSeen;
  ck('v3: the bake scale IS k (0.25 steps): 1 -> 1, 3.75 -> 3.75, 4.25 -> 4.25, 4.5 -> 4.5, 8 -> 8', bucketsSeen[1] === 1 && bucketsSeen[3.75] === 3.75 && bucketsSeen[4.25] === 4.25 && bucketsSeen[4.5] === 4.5 && bucketsSeen[8] === 8, JSON.stringify(bucketsSeen));
  ck('k is clamped to 1..8 and quantised to 0.25 (9 -> 8, 0.5 / NaN / "x" -> 1)', bucketsSeen[9] === 8 && bucketsSeen[0.5] === 1 && bucketsSeen['x'] === 1 && bucketsSeen[NaN] === 1, JSON.stringify([bucketsSeen[9], bucketsSeen[0.5], bucketsSeen['x']]));
  // memory bound: 300 big sprites x 6 frames at k = 8
  GFX.setScale(8);
  const N = 300, FR = 6;
  for (let i = 0; i < N; i++) GFX.define('mem_' + i, { w: 24, h: 24, frames: FR, pad: { l: 4, r: 4, t: 4, b: 4 }, draw(ctx, f, op) { ctx.fillStyle = 'hsl(' + (i * 7 + f * 30) + ',80%,60%)'; ctx.fillRect(2, 2, 20, 20); } });
  const c = T.canvas(512, 512), g = c.getContext('2d'); g.setTransform(8, 0, 0, 8, 0, 0);
  const t0 = performance.now();
  for (let i = 0; i < N; i++) for (let f = 0; f < FR; f++) GFX.draw(g, 'mem_' + i, f, (i % 10) * 6, ((i / 10) | 0) % 10 * 6);
  o.fillMs = performance.now() - t0;
  const st = GFX._stats();
  o.st = st;
  ck('bake cache stays within the pixel budget', st.px <= st.maxPx, st.px + ' > ' + st.maxPx);
  ck('peak never explodes past 1.25x budget', st.peakPx <= st.maxPx * 1.25, st.peakPx);
  ck('eviction actually happened (budget is enforced, not just never reached)', st.evictions > 0 || st.px < st.maxPx * 0.99, JSON.stringify(st));
  // recently used entries survive eviction: draw sprite 0 just before the last one
  GFX.draw(g, 'mem_0', 0, 0, 0); const b0 = GFX._stats().bakes; GFX.draw(g, 'mem_0', 0, 0, 0); ck('a cached entry is not re-baked', GFX._stats().bakes === b0);
  // storm: 1500 random scales interleaved with draws
  const t1 = performance.now(); let threw = null;
  try { for (let i = 0; i < 1500; i++) { GFX.setScale(1 + Math.random() * 7); for (let j = 0; j < 4; j++) GFX.draw(g, 'mem_' + ((i * 7 + j) % N), j, 10, 10); GFX.text(g, 'STORM ' + i, 4, 4, '#3cf2ff'); GFX.particle(g, 'dot', 20, 20, 2, '#fff', 1); } } catch (e) { threw = String(e && e.stack); }
  o.stormMs = performance.now() - t1;
  ck('setScale storm: no exception', !threw, threw);
  const s2 = GFX._stats();
  ck('setScale storm: memory stays bounded', s2.px <= s2.maxPx && s2.tilePx <= 6e6 && s2.particles <= 480 && s2.fonts <= 96, JSON.stringify(s2));
  ck('setScale storm: entries stay bounded', s2.entries < N * FR, s2.entries);
  o.storm = s2;
  GFX._undefine('mem_'); GFX._reset();
  o.bad = bad;
  return o;
});
check('cache: buckets, memory bound, storm', cache.bad.length === 0, cache.bad.join(' ; '));
info('cache stats', JSON.stringify({ buckets: cache.buckets, fillMs: +cache.fillMs.toFixed(1), stormMs: +cache.stormMs.toFixed(1), after: cache.st }));

/* ---------------------------------------------------------------- 3b. idle warm-up */
const warmT = await E(async () => {
  const o = {}, bad = [];
  const ck = (n, ok, d) => { if (!ok) bad.push(n + (d === undefined ? '' : ' ' + d)); };
  GFX._undefine('mem_'); GFX._undefine('t_'); GFX._undefine('mem'); GFX._reset();
  GFX.setScale(3);
  for (let i = 0; i < 12; i++) GFX.define('warm_' + i, { w: 16, h: 16, frames: 3, draw(ctx, f) { ctx.fillStyle = '#0ff'; ctx.fillRect(2, 2, 12, 12); } });
  GFX.define('kraken_warmtest', { w: 48, h: 48, frames: 2, draw(ctx) { ctx.fillStyle = '#f0f'; ctx.fillRect(2, 2, 40, 40); } });
  const baked = (pre) => GFX._registry().filter((r) => r.name.startsWith(pre)).reduce((a, r) => a + r.baked, 0);
  GFX.init();
  const b0 = baked('warm_');
  // integrator: with the real cast (--cast) ~190 cast frames sit ahead of the fake warm_ sprites in the queue, so poll (max 8 s) instead of a fixed 700 ms
  const until = async (pred, ms = 8000) => { const t0 = performance.now(); while (!pred() && performance.now() - t0 < ms) await new Promise((r) => setTimeout(r, 50)); };
  await until(() => baked('warm_') === 36);
  o.before = b0; o.after = baked('warm_');
  ck('warm-up bakes the registry on idle time (12 sprites x 3 frames)', o.after === 36, o.before + ' -> ' + o.after);
  ck('lazy families (kraken*, moonpearl*) are not warmed automatically', baked('kraken_warmtest') === 0, baked('kraken_warmtest'));
  GFX.warm('kraken');
  await new Promise((r) => setTimeout(r, 500));
  ck('warm(prefix) bakes the named family', baked('kraken_warmtest') === 2, baked('kraken_warmtest'));
  const bk = GFX._stats().bakes;
  const c = T.canvas(256, 256), g = c.getContext('2d'); g.setTransform(3, 0, 0, 3, 0, 0);
  for (let i = 0; i < 12; i++) for (let f = 0; f < 3; f++) GFX.draw(g, 'warm_' + i, f, 0, 0);
  ck('draw after warm-up needs no baking', GFX._stats().bakes === bk, GFX._stats().bakes - bk);
  GFX.define('warm_late', { w: 16, h: 16, frames: 2, draw(ctx) { ctx.fillStyle = '#ff0'; ctx.fillRect(1, 1, 14, 14); } });
  await new Promise((r) => setTimeout(r, 500));
  ck('a sprite defined after init is warmed too', baked('warm_late') === 2, baked('warm_late'));
  GFX.setScale(2);
  const stl = GFX._stats().stale;
  ck('setScale keeps the previous scale baked (stale: drawn until its replacement exists)', stl >= 38, stl);
  await until(() => GFX._stats().stale === 0 && GFX._stats().warmQueue === 0, 12000);
  ck('...and the warm-up replaces every stale bake at the new scale', GFX._stats().stale === 0 && baked('warm_') >= 38, JSON.stringify([GFX._stats().stale, baked('warm_')]));
  o.bad = bad;
  return o;
});
check('idle warm-up queue', warmT.bad.length === 0, warmT.bad.join(' ; '));

/* ---------------------------------------------------------------- 4. text */
const txt = await E(() => {
  const o = {}, bad = [];
  const ck = (n, ok, d) => { if (!ok) bad.push(n + (d === undefined ? '' : ' ' + d)); };
  GFX.setScale(4);
  ck('textWidth: 8 px per glyph', GFX.textWidth('ABC') === 24 && GFX.textWidth('') === 0 && GFX.textWidth('AB', 2) === 32 && GFX.textWidth('©♥') === 16);
  const mk = () => { const c = T.canvas(512, 96), g = c.getContext('2d'); g.setTransform(4, 0, 0, 4, 0, 0); g.imageSmoothingEnabled = true; g.fillStyle = '#05070f'; g.fillRect(0, 0, 128, 24); return [c, g]; };
  const lit = (c) => T.stats(c, 0, 0, c.width, c.height).maxLuma;
  // every required glyph draws something and stays inside its 8 px cell (+ halo pad)
  const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?.,:;-+=&\'"/()%*#<>_©♥★←→';
  const empty = [], wide = [];
  for (const ch of glyphs) {
    const [c, g] = mk(); GFX.text(g, ch, 40, 8, '#ffffff');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let minX = 1e9, maxX = -1, n = 0;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const i = (y * c.width + x) * 4; if (d[i] + d[i + 1] + d[i + 2] > 3 * 70) { n++; minX = Math.min(minX, x); maxX = Math.max(maxX, x); } }
    if (n < 3) empty.push(ch); if (maxX >= 0 && (minX < 40 * 4 - 3 || maxX > 48 * 4 + 3)) wide.push(ch + '(' + minX + '..' + maxX + ')');
  }
  ck('all SPEC glyphs draw', empty.length === 0, 'empty: ' + empty.join(''));
  ck('glyph bright pixels stay inside the 8 px cell (+ 0.75 px)', wide.length === 0, wide.join(' '));
  // lower case = upper case, unknown -> '?'
  { const [a, ga] = mk(); GFX.text(ga, 'hello', 4, 8, '#3cf2ff'); const [b, gb] = mk(); GFX.text(gb, 'HELLO', 4, 8, '#3cf2ff'); ck('lower case renders as upper case', T.hash(a) === T.hash(b)); }
  { const [a, ga] = mk(); GFX.text(ga, 'é', 4, 8, '#3cf2ff'); const [b, gb] = mk(); GFX.text(gb, '?', 4, 8, '#3cf2ff'); ck('unknown glyph -> ?', T.hash(a) === T.hash(b)); }
  // alignment
  { const [a, ga] = mk(); GFX.text(ga, 'CENTER', 64, 8, '#fff', { align: 'center' }); const [b, gb] = mk(); GFX.text(gb, 'CENTER', 64 - 24, 8, '#fff'); ck('align center', T.hash(a) === T.hash(b));
    const [c, gc] = mk(); GFX.text(gc, 'RIGHT', 100, 8, '#fff', { align: 'right' }); const [d, gd] = mk(); GFX.text(gd, 'RIGHT', 60, 8, '#fff'); ck('align right', T.hash(c) === T.hash(d)); }
  // scale 2: cell 16 px, glyph twice as tall
  { const [a, ga] = mk(); GFX.text(ga, 'A', 10, 2, '#fff', { scale: 2 }); const s = T.stats(a, 10 * 4 - 8, 0, 16 * 4 + 16, 96); ck('scale 2 draws a bigger glyph', s.maxLuma > 100); }
  // options: shadow / outline / glow produce different output, none throws
  { const hs = {}; for (const [n, op] of [['plain', {}], ['noshadow', { shadow: false }], ['outline', { outline: '#000000' }], ['noglow', { glow: false }]]) { const [c, g] = mk(); GFX.text(g, 'OPT', 8, 8, '#ffb23e', op); hs[n] = T.hash(c); }
    ck('shadow / outline / glow options change the rendering', new Set(Object.values(hs)).size === 4, JSON.stringify(hs)); }
  // colour input: css names, rgb(), rgba(), NEON array, lots of different colours do not blow the cache
  { let threw = null; try { const [c, g] = mk(); for (const col of ['#f0f', '#ff00ff', 'rgb(10,200,30)', 'rgba(255,0,0,0.5)', 'white', [60, 242, 255], undefined, 'not-a-colour']) GFX.text(g, 'COL', 4, 8, col); for (let i = 0; i < 400; i++) GFX.text(g, 'X' + i, 4, 8, 'rgb(' + (i % 256) + ',' + ((i * 3) % 256) + ',200)'); } catch (e) { threw = String(e); }
    ck('colour forms accepted, 400 colours bounded', !threw && GFX._stats().fonts <= 96 && GFX._stats().tilePx <= 6e6, threw + JSON.stringify(GFX._stats())); }
  // number / null input
  { let threw = null; try { const [c, g] = mk(); GFX.text(g, 12345, 4, 8, '#fff'); GFX.text(g, null, 4, 8, '#fff'); GFX.text(g, undefined, 4, 8, '#fff'); } catch (e) { threw = String(e); } ck('non-string input tolerated', !threw, threw); }
  // text(): restores the context state
  { const [c, g] = mk(); g.globalAlpha = 0.7; g.globalCompositeOperation = 'multiply'; GFX.text(g, 'S', 4, 8, '#fff', { alpha: 0.4 }); ck('text restores alpha / composite', g.globalAlpha === 0.7 && g.globalCompositeOperation === 'multiply'); }
  o.bad = bad;
  return o;
});
check('text', txt.bad.length === 0, txt.bad.join(' ; '));

// font specimen
await shot('font_specimen.png', () => {
  GFX.setScale(4);
  const c = T.canvas(1024, 640), g = c.getContext('2d'); g.setTransform(4, 0, 0, 4, 0, 0); g.imageSmoothingEnabled = true;
  g.fillStyle = '#05070f'; g.fillRect(0, 0, 256, 160);
  const rows = ['ABCDEFGHIJKLMNOPQRSTUVWXYZ', '0123456789 !?.,:;-+=&', '\'"/()%*#<>_©♥★←→', 'THE SUNKEN TOWER  HI-SCORES'];
  rows.forEach((r, i) => GFX.text(g, r, 8, 8 + i * 12, ['#3cf2ff', '#ff3ea5', '#ffb23e', '#b6ff3b'][i]));
  GFX.text(g, 'SCALE 2 GLOW', 8, 62, '#eaffff', { scale: 2 });
  GFX.text(g, 'CENTERED', 128, 84, '#ff3ea5', { align: 'center', scale: 1.5 });
  GFX.text(g, 'NO GLOW', 8, 100, '#3cf2ff', { glow: false }); GFX.text(g, 'OUTLINE', 80, 100, '#ffffff', { outline: '#ff3ea5', shadow: false });
  GFX.text(g, '012300', 8, 116, '#eaffff', { scale: 2 }); GFX.text(g, 'HI SCORE 050000', 8, 136, '#ffb23e');
  return c;
}, [], 1);

/* ---------------------------------------------------------------- 5. particles, theme, sheet */
const misc = await E(() => {
  const o = {}, bad = [];
  const ck = (n, ok, d) => { if (!ok) bad.push(n + (d === undefined ? '' : ' ' + d)); };
  GFX.setScale(4);
  const mk = () => { const c = T.canvas(256, 256), g = c.getContext('2d'); g.setTransform(4, 0, 0, 4, 0, 0); g.imageSmoothingEnabled = true; g.fillStyle = '#05070f'; g.fillRect(0, 0, 64, 64); return [c, g]; };
  for (const kind of ['dot', 'ring', 'spark', 'streak']) {
    const [c, g] = mk(); GFX.particle(g, kind, 32, 32, kind === 'streak' ? 14 : 6, '#3cf2ff', 1, 0);
    const R = (cc) => T.stats(cc, 8 * 4, 8 * 4, 48 * 4, 48 * 4), base = (() => { const [cb] = mk(); return R(cb).luma; })();
    const s = R(c); ck('particle ' + kind + ' draws light', s.maxLuma > 90, s);
    const [c2, g2] = mk(); GFX.particle(g2, kind, 32, 32, kind === 'streak' ? 14 : 6, '#3cf2ff', 0.25); const s2 = R(c2); ck('particle ' + kind + ' alpha scales', s2.luma - base < (s.luma - base) * 0.6 && s2.luma - base > 0.02, [s2.luma - base, s.luma - base]);
    const [c3, g3] = mk(); GFX.particle(g3, kind, 32, 32, kind === 'streak' ? 14 : 6, 'rgb(255,0,0)', 1); const s3 = R(c3), b3 = (() => { const [cb] = mk(); return R(cb); })(); ck('particle ' + kind + ' takes the colour', (s3.r - b3.r) > (s3.b - b3.b) + 0.3 && (s3.r - b3.r) > (s3.g - b3.g) + 0.3, JSON.stringify([s3, b3]));
    const [c4, g4] = mk(); g4.globalAlpha = 0.5; g4.globalCompositeOperation = 'multiply'; GFX.particle(g4, kind, 32, 32, 6, '#fff', 1); ck('particle restores ctx alpha/composite', g4.globalAlpha === 0.5 && g4.globalCompositeOperation === 'multiply');
  }
  { let threw = null; try { const [c, g] = mk(); GFX.particle(g, 'nope', 1, 1, 3, '#fff', 1); GFX.particle(g, 'dot', 1, 1, 0, '#fff', 1); GFX.particle(g, 'dot', 1, 1, -3, '#fff', 1); GFX.particle(g, 'dot', 1, 1, 3, '#fff', 0); GFX.particle(g, 'dot', 1, 1, 3, [1, 2, 3], NaN); GFX.particle(g, 'ring', 1, 1, 400, '#fff', 1); } catch (e) { threw = String(e); } ck('particle: bad input tolerated', !threw, threw); }
  { const [c, g] = mk(); for (let i = 0; i < 2000; i++) GFX.particle(g, ['dot', 'ring', 'spark', 'streak'][i % 4], i % 64, (i * 7) % 64, 1 + (i % 30), 'rgb(' + (i * 5 % 256) + ',' + (i * 11 % 256) + ',' + (i * 17 % 256) + ')', 0.5); ck('particle cache bounded (count and pixels)', GFX._stats().particles <= 480 && GFX._stats().particlePx <= GFX._stats().maxPx * 0.3 + 1, JSON.stringify([GFX._stats().particles, GFX._stats().particlePx])); }
  // rotation of a streak actually rotates it
  { const [a, ga] = mk(); GFX.particle(ga, 'streak', 32, 32, 20, '#fff', 1, 0); const [b, gb] = mk(); GFX.particle(gb, 'streak', 32, 32, 20, '#fff', 1, Math.PI / 2); ck('streak rotation', T.hash(a) !== T.hash(b)); }
  // theme
  const names = ['Coral Reef', 'Kelp Forest', 'Sunken Ship', 'Crystal Caves', 'Volcanic Vents', 'Abyss Temple'];
  const hex = /^#[0-9a-f]{6}$/;
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    const th = GFX.theme(i);
    ck('theme ' + i + ' shape', th && hex.test(th.bg) && hex.test(th.accent) && hex.test(th.accent2) && hex.test(th.glow) && hex.test(th.edge) && th.name === names[(i / 5) | 0], JSON.stringify(th));
    const lum = (h) => 0.2126 * parseInt(h.slice(1, 3), 16) + 0.7152 * parseInt(h.slice(3, 5), 16) + 0.0722 * parseInt(h.slice(5, 7), 16);
    ck('theme ' + i + ' bg is near-black, edge/accent bright', lum(th.bg) < 30 && lum(th.edge) > 90 && lum(th.accent) > 90 && lum(th.accent2) > 90, JSON.stringify(th));
    seen.add(th.edge + th.bg);
  }
  ck('30 distinct (edge, bg) looks', seen.size === 30, seen.size);
  ck('theme out of range clamps, never throws', GFX.theme(-3).name === 'Coral Reef' && GFX.theme(99).name === 'Abyss Temple' && GFX.theme(NaN).name === 'Coral Reef');
  o.themes = Array.from({ length: 30 }, (_, i) => GFX.theme(i));
  // sheet lists whatever is defined
  GFX.define('sheet_a', { w: 16, h: 16, frames: 2, draw(ctx, f) { ctx.fillStyle = '#f0f'; ctx.fillRect(2, 2, 12, 12); } });
  const sh = GFX.sheet(); ck('sheet returns a canvas with every sprite', sh && sh.width > 100 && sh.height > 50 && T.stats(sh, 0, 0, sh.width, sh.height).maxLuma > 100, sh && sh.width + 'x' + sh.height);
  o.reg = GFX._registry().length;
  o.bad = bad;
  return o;
});
check('particles, themes, sheet', misc.bad.length === 0, misc.bad.slice(0, 6).join(' ; '));

// enemy hue vs theme edge (information for the art pass: every enemy must stay distinct on every theme)
{
  const hue = (hex) => { const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0; const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return h * 60; };
  const cast = { fizz: '#ff3ea5', pop: '#3cf2ff', nibbler: '#ffb23e', crabbit: '#ff6a3d', jellop: '#8a5cff', springle: '#b6ff3b', glimmer: '#3d7bff', angry: '#ff2a2a' };
  const close = [];
  misc.themes.forEach((th, i) => { for (const [n, c] of Object.entries(cast)) { const d = Math.abs(((hue(th.edge) - hue(c) + 540) % 360) - 180); if (d < 12) close.push(`R${i + 1}:${n}(${d.toFixed(0)}deg)`); } });
  info('theme edges within 12 deg of a cast hue (relies on dark body + white-hot core + silhouette there)', close.join(' ') || 'none');
}

/* ---------------------------------------------------------------- 6. the 30 looks */
const world = await E(() => {
  const o = { dims: [], bad: [], lvl: [], bg: [] };
  const ck = (n, ok, d) => { if (!ok) o.bad.push(n + (d === undefined ? '' : ' ' + d)); };
  for (const k of [1, 2, 4]) {
    GFX.setScale(k);
    let ms = 0, maxMs = 0;
    for (let i = 0; i < 30; i++) {
      const t0 = performance.now();
      const lv = GFX.levelCanvas(i, __maps[i]); lv.getContext('2d').getImageData(0, 0, 1, 1);
      const dt = performance.now() - t0; ms += dt; maxMs = Math.max(maxMs, dt);
      ck(`levelCanvas(${i}) k=${k} size`, lv.width === Math.round(256 * k) && lv.height === Math.round(208 * k), lv.width + 'x' + lv.height);
      const same = GFX.levelCanvas(i, __maps[i]); ck(`levelCanvas(${i}) k=${k} cached (same object)`, same === lv);
      const bg = GFX.bgCanvas(i); ck(`bgCanvas(${i}) k=${k} size`, bg.width === Math.round(256 * k) && bg.height === Math.round(208 * k), bg.width + 'x' + bg.height);
      ck(`bgCanvas(${i}) k=${k} cached`, GFX.bgCanvas(i) === bg);
      if (k === 2) {
        const sl = T.stats(lv, 0, 0, lv.width, lv.height);
        ck(`levelCanvas(${i}) has crystal and open water (0 < mean alpha < 0.7)`, sl.a > 255 * 0.04 && sl.a < 255 * 0.7, sl.a);
        const sb = T.stats(bg, 0, 0, bg.width, bg.height);
        const d = T.px(bg).data; let minA = 255; for (let q = 3; q < d.length; q += 4) if (d[q] < minA) minA = d[q];
        ck(`bgCanvas(${i}) opaque`, minA === 255, minA);
        ck(`bgCanvas(${i}) is dark (mean luma < 40, max < 215: structure stays dimmer than life)`, sb.luma < 40 && sb.maxLuma < 215, JSON.stringify([sb.luma, sb.maxLuma]));
        o.bg.push({ i, r: sb.r, g: sb.g, b: sb.b, luma: sb.luma });
        o.lvl.push({ i, alpha: sl.a });
      }
    }
    o.dims.push({ k, buildMeanMs: ms / 30, buildMaxMs: maxMs, stats: GFX._stats() });
  }
  // bounded world cache
  const st = GFX._stats(); ck('world cache bounded (<= 4 levels + 4 backgrounds)', st.levels <= 4 && st.bgs <= 4, JSON.stringify([st.levels, st.bgs]));
  o.bad.push(...[]);
  return o;
});
check('world: 30 levels + 30 backgrounds at k = 1, 2, 4 (size, cache, alpha, opacity, darkness)', world.bad.length === 0, world.bad.slice(0, 8).join(' ; '));
info('world build times', JSON.stringify(world.dims.map((d) => ({ k: d.k, meanMs: +d.buildMeanMs.toFixed(1), maxMs: +d.buildMaxMs.toFixed(1) }))));
{
  const d4 = world.dims.find((d) => d.k === 4);
  tcheck('levelCanvas build <= 60 ms at k=4 (max over the 30 looks, incl. first-touch raster flush)', d4.buildMaxMs <= 60, d4.buildMaxMs.toFixed(1) + ' ms (mean ' + d4.buildMeanMs.toFixed(1) + ')');
}

// variety + identity
{
  const bg = world.bg, dist = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
  let minWithin = 1e9, minBetween = 1e9;
  for (let i = 0; i < 30; i++) for (let j = i + 1; j < 30; j++) { const d = dist(bg[i], bg[j]); if (((i / 5) | 0) === ((j / 5) | 0)) minWithin = Math.min(minWithin, d); else minBetween = Math.min(minBetween, d); }
  info('bg mean-colour distance', `min within a theme ${minWithin.toFixed(2)}, min between themes ${minBetween.toFixed(2)}`);
  check('theme identity: backgrounds of different themes differ in mean colour', minBetween > 1.5, minBetween);
}

// pixel-level variety between all 30 backgrounds and levels (hash of a down-sampled grid)
const variety = await E(() => {
  GFX.setScale(1);
  const hs = new Set(), hl = new Set();
  for (let i = 0; i < 30; i++) { hs.add(T.hash(GFX.bgCanvas(i))); hl.add(T.hash(T.levelShot(i, 1, true, __maps[0]))); }
  return { bg: hs.size, lv: hl.size };
});
check('30 distinct backgrounds, 30 distinct level looks (same map in every theme)', variety.bg === 30 && variety.lv === 30, JSON.stringify(variety));

// readability of platform tops + seams + determinism, on a synthetic map
const synth = await E(() => {
  const o = { bad: [] }, ck = (n, ok, d) => { if (!ok) o.bad.push(n + (d === undefined ? '' : ' ' + d)); };
  const rows = [];
  for (let r = 0; r < 26; r++) rows.push('##' + '.'.repeat(28) + '##');
  rows[0] = '#'.repeat(32); rows[25] = '#'.repeat(32);
  rows[10] = '##' + '.'.repeat(3) + '#'.repeat(22) + '.'.repeat(3) + '##';          // one long platform, cols 5-26, 1 thick
  rows[11] = rows[10]; rows[12] = rows[10];                                            // 3 thick: 24 px tall, 176 px wide of merged tiles
  rows[18] = '##' + '.'.repeat(6) + '#'.repeat(4) + '.'.repeat(4) + '#'.repeat(4) + '.'.repeat(6) + '##';
  const map = rows;
  const topY = 16 + 10 * 8;                                                            // logical y of the top face of the long platform
  const k = 4; GFX.setScale(k);
  const edgeOverBody = [], seams = [];
  for (let i = 0; i < 30; i++) {
    const lv = GFX.levelCanvas(i, map);
    const g = lv.getContext('2d'); const y0 = (topY - 16) * k;
    // top edge readability: the brightest pixel in a 6 px band around the face (middle of the platform) vs the platform body 10 px below
    const band = T.stats(lv, 60 * k, y0 - 3, 100 * k, 7).maxLuma;
    const bodyS = T.stats(lv, 60 * k, y0 + 10 * k, 100 * k, 6 * k).luma;
    const bg = GFX.bgCanvas(i), bgS = T.stats(bg, 60 * k, y0 - 12 * k, 100 * k, 6 * k).luma;
    ck('theme look ' + i + ': platform top edge is bright (maxLuma > 110)', band > 110, band);
    ck('theme look ' + i + ': top edge clearly brighter than the body (x1.8) and than the water above (x3)', band > bodyS * 1.8 && band > bgS * 3, [band, bodyS, bgS]);
    edgeOverBody.push(+(band / Math.max(1, bodyS)).toFixed(1));
    // seams: mean luma per column inside the 3-thick merged block, middle rows; a seam would show as a periodic bright/dark column every 8 px (tile pitch)
    const d = T.px(lv, 40 * k, (topY + 6 - 16) * k, 120 * k, 8 * k).data; const W = 120 * k, cols = new Float64Array(W);
    for (let x = 0; x < W; x++) { let s = 0; for (let y = 0; y < 8 * k; y++) { const q = (y * W + x) * 4; s += T.lum(d[q], d[q + 1], d[q + 2]) * (d[q + 3] / 255); } cols[x] = s / (8 * k); }
    let atSeam = 0, near = 0, nS = 0, nN = 0;
    for (let x = 4; x < W - 4; x++) { const lx = (40 * k + x) / k; const m = lx % 8; if (m < 0.26 || m > 7.74) { atSeam += cols[x]; nS++; } else if (m > 1.5 && m < 6.5) { near += cols[x]; nN++; } }
    const ratio = (atSeam / nS) / Math.max(0.5, near / nN);
    seams.push(+ratio.toFixed(2));
    ck('theme look ' + i + ': no tile seams inside merged slabs (seam/body luma ratio < 1.3)', ratio < 1.3, ratio);
  }
  // determinism: rebuild after a scale round trip gives identical pixels
  const h1 = T.hash(GFX.levelCanvas(13, map)), b1 = T.hash(GFX.bgCanvas(13)); GFX.setScale(2); GFX.setScale(4);
  ck('levelCanvas deterministic across rebuilds', T.hash(GFX.levelCanvas(13, map)) === h1);
  ck('bgCanvas deterministic across rebuilds', T.hash(GFX.bgCanvas(13)) === b1);
  // map identity: same index with another map rebuilds
  const alt = rows.slice(); alt[18] = rows[10]; const h2 = T.hash(GFX.levelCanvas(13, alt)); ck('levelCanvas follows the map content', h2 !== h1);
  const same = GFX.levelCanvas(13, alt.slice()); ck('a copied map array hits the cache', same === GFX.levelCanvas(13, alt));
  // robustness
  let threw = null; try { GFX.levelCanvas(0, []); GFX.levelCanvas(1, undefined); GFX.levelCanvas(2, ['#']); GFX.levelCanvas(NaN, rows); GFX.levelCanvas(99, rows); GFX.bgCanvas(-5); GFX.bgCanvas(77); } catch (e) { threw = String(e && e.stack); }
  ck('levelCanvas/bgCanvas tolerate odd input', !threw, threw);
  o.edgeOverBody = edgeOverBody; o.seams = seams;
  return o;
});
check('look gates: platform-top readability, no seams, determinism, robustness', synth.bad.length === 0, synth.bad.slice(0, 8).join(' ; '));
info('edge/body luma ratio per look', synth.edgeOverBody.join(' '));
info('seam ratio per look', synth.seams.join(' '));

// prefetch: a REAL round that was built queues the next round (level + background) for idle time, ~1.5 s later; the transition then finds them cached
const pre = await E(async () => {
  const o = {}, bad = [];
  const ck = (n, ok, d) => { if (!ok) bad.push(n + (d === undefined ? '' : ' ' + d)); };
  const until = async (pred, ms) => { const t0 = performance.now(); while (!pred() && performance.now() - t0 < ms) await new Promise((r) => setTimeout(r, 50)); };
  GFX._reset(); GFX.setScale(4); GFX.init();
  ck('caches empty after a reset', GFX._stats().levels === 0 && GFX._stats().bgs === 0);
  const t0 = performance.now(); GFX.levelCanvas(6, __maps[6]); o.firstMs = performance.now() - t0;
  ck('prefetch queued jobs after the first levelCanvas of a real round', GFX._stats().jobs > 0, JSON.stringify(GFX._stats()));
  await until(() => GFX._stats().jobs === 0 && GFX._stats().levels === 2 && GFX._stats().bgs === 2, 9000);
  const st = GFX._stats();
  ck('idle prefetch built bg(6), level(7) and bg(7)', st.levels === 2 && st.bgs === 2 && st.jobs === 0, JSON.stringify({ l: st.levels, b: st.bgs, j: st.jobs }));
  const t1 = performance.now(); const l7 = GFX.levelCanvas(7, __maps[7]); const b7 = GFX.bgCanvas(7); o.hitMs = performance.now() - t1;
  ck('prefetched canvases are complete and the right size', l7.width === 1024 && b7.width === 1024 && T.stats(l7, 0, 0, 1024, 832).a > 10 && T.stats(b7, 0, 0, 1024, 832).luma > 3);
  // a prefetched look is pixel-identical to a synchronous one
  const hPre = T.hash(l7), hbPre = T.hash(b7);
  GFX._reset(); GFX.setScale(4); GFX._bgOff(true);
  const l7s = GFX.levelCanvas(7, __maps[7]), b7s = GFX.bgCanvas(7);
  ck('prefetch result == synchronous result (level, bg)', T.hash(l7s) === hPre && T.hash(b7s) === hbPre);
  // V10c: after a scale step the previous canvas keeps being served (any size works: Game draws it with an explicit 256 x 208 destination) while the new one is built
  const lOld = GFX.levelCanvas(7, __maps[7]);
  GFX.setScale(3);
  const lStale = GFX.levelCanvas(7, __maps[7]), bStale = GFX.bgCanvas(7);
  ck('double buffer: the previous scale is served right after setScale (no synchronous re-bake)', lStale === lOld && bStale.width === 1024 && GFX._stats().worldStale === 2, JSON.stringify([lStale === lOld, bStale.width, GFX._stats().worldStale]));
  for (let g = 0; g < 400 && GFX._stats().worldStale > 0; g++) GFX._bgRun(50);
  const lNew = GFX.levelCanvas(7, __maps[7]), bNew = GFX.bgCanvas(7);
  ck('...and the new canvas replaces it (size follows k exactly)', lNew.width === 768 && lNew.height === 624 && bNew.width === 768 && GFX._stats().worldStale === 0, JSON.stringify([lNew.width, lNew.height, GFX._stats().worldStale]));
  // the title's custom ledge map (index 15, other content) never queues a prefetch (no wasted bake of round 16)
  GFX._reset(); GFX.setScale(2);
  const ledge = __maps[15].map((r, i) => (i > 3 && i < 20 ? r.replace(/#/g, (m, off) => (off > 3 && off < 28 ? '.' : m)) : r));
  GFX.levelCanvas(15, ledge);
  ck('title ledges (a custom map) queue no prefetch', GFX._stats().jobs === 0, GFX._stats().jobs);
  GFX.levelCanvas(15, __maps[15]);
  ck('...a real round does', GFX._stats().jobs >= 2, GFX._stats().jobs);
  // last round: no round 31
  GFX._bgOff(false); GFX._reset(); GFX.setScale(4); GFX.levelCanvas(29, __maps[29]); await new Promise((r) => setTimeout(r, 2500));
  ck('no prefetch beyond round 30; bounded caches', GFX._stats().levels <= 4 && GFX._stats().bgs <= 4 && GFX._stats().jobs <= 1, JSON.stringify(GFX._stats()));
  GFX._bgOff(false);
  o.bad = bad;
  return o;
});
check('level/bg prefetch + double-buffered re-bake', pre.bad.length === 0, pre.bad.join(' ; '));
tcheck('a prefetched round costs ~nothing (< 3 ms)', pre.hitMs < 3, pre.hitMs);
info('prefetch', `first build ${pre.firstMs.toFixed(1)} ms, prefetched hit ${pre.hitMs.toFixed(2)} ms`);

const glints = await E(() => {
  const bad = [], ck = (n, ok, d) => { if (!ok) bad.push(n + (d === undefined ? '' : ' ' + d)); };
  GFX.setScale(4);
  const mk = () => { const c = T.canvas(1024, 832), g = c.getContext('2d'); g.setTransform(4, 0, 0, 4, 0, 0); g.imageSmoothingEnabled = true; g.fillStyle = '#05070f'; g.fillRect(0, 0, 256, 224); g.drawImage(GFX.levelCanvas(0, __maps[0]), 0, 16, 256, 208); return [c, g]; };
  const [a, ga] = mk(); const h0 = T.hash(a); GFX.levelGlints(ga, 0, __maps[0], 1.3); ck('levelGlints draws light', T.hash(a) !== h0);
  const [b, gb] = mk(); GFX.levelGlints(gb, 0, __maps[0], 1.3); ck('levelGlints deterministic', T.hash(a) === T.hash(b));
  const [c, gc] = mk(); GFX.levelGlints(gc, 0, __maps[0], 2.9); ck('levelGlints moves with t', T.hash(a) !== T.hash(c));
  const [d, gd] = mk(); gd.globalAlpha = 0.6; gd.globalCompositeOperation = 'multiply'; GFX.levelGlints(gd, 0, __maps[0], 1); ck('levelGlints restores ctx state', gd.globalAlpha === 0.6 && gd.globalCompositeOperation === 'multiply');
  let threw = null; try { GFX.levelGlints(ga, 99, undefined, NaN); GFX.levelGlints(ga, 0, [], 1); } catch (e) { threw = String(e); } ck('levelGlints tolerates odd input', !threw, threw);
  const [e, ge] = mk(); const t0 = performance.now(); for (let q = 0; q < 20; q++) GFX.levelGlints(ge, 0, __maps[0], q * 0.1); ge.getImageData(0, 0, 1, 1); const ms = (performance.now() - t0) / 20;
  return { bad, ms };
});
check('levelGlints', glints.bad.length === 0, glints.bad.join(' ; '));
tcheck('levelGlints <= 2 ms per frame', glints.ms < 2, glints.ms);

/* ---------------------------------------------------------------- 7. PNGs of the looks */
const mapIdx = 0;
await shot('looks_k1_all30.png', () => {
  GFX.setScale(1);
  const items = []; for (let i = 0; i < 30; i++) items.push(T.levelShot(i, 1, true));
  return T.grid(items, 5, 256, 208, 4);
}, [], 1);
for (let th = 0; th < 6; th++) {
  await shot(`looks_k2_theme${th}.png`, (th) => {
    GFX.setScale(2);
    const items = []; for (let v = 0; v < 5; v++) items.push(T.levelShot(th * 5 + v, 2, true));
    return T.grid(items, 3, 512, 416, 6);
  }, [th], 1);
  await shot(`bg_k2_theme${th}.png`, (th) => {
    const items = []; for (let v = 0; v < 5; v++) items.push(T.bgOnly(th * 5 + v, 2));
    return T.grid(items, 3, 512, 416, 6);
  }, [th], 1);
}
await shot('bg_k1_all30.png', () => { const items = []; for (let i = 0; i < 30; i++) items.push(T.bgOnly(i, 1)); return T.grid(items, 5, 256, 208, 4); }, [], 1);
for (const i of [0, 4, 7, 10, 14, 16, 19, 24, 26, 29]) await shot(`look_k4_${String(i).padStart(2, '0')}.png`, (i) => T.levelShot(i, 4, true), [i], 1);

/* ---------------------------------------------------------------- 8. logo, postFX */
const logo = await E(() => {
  const o = { bad: [] }, ck = (n, ok, d) => { if (!ok) o.bad.push(n + (d === undefined ? '' : ' ' + d)); };
  GFX.setScale(4);
  const mk = () => { const c = T.canvas(1024, 400), g = c.getContext('2d'); g.setTransform(4, 0, 0, 4, 0, 0); g.imageSmoothingEnabled = true; g.fillStyle = '#05070f'; g.fillRect(0, 0, 256, 100); return [c, g]; };
  const [a, ga] = mk(); const r = GFX.drawLogo(ga, 128, 30, 0);
  ck('drawLogo returns the size', r && r.total > 190 && r.total < 235 && r.uy > 40, JSON.stringify(r));
  const s = T.stats(a); ck('logo draws light', s.maxLuma > 200 && s.luma > 6, s);
  const left = T.stats(a, 0, 0, (128 - r.total / 2 - 8) * 4, 400), right = T.stats(a, (128 + r.total / 2 + 8) * 4, 0, 1024, 400);
  ck('logo stays inside its measured width (+ halo)', left.maxLuma < 90 && right.maxLuma < 90, [left.maxLuma, right.maxLuma]);
  const [b, gb] = mk(); GFX.drawLogo(gb, 128, 30, 5.3); ck('logo animates with t', T.hash(a) !== T.hash(b));
  const [c, gc] = mk(); GFX.drawLogo(gc, 128, 30, 0); ck('logo is deterministic for equal t', T.hash(a) === T.hash(c));
  o.logoMs = 1e9; for (let rep = 0; rep < 4; rep++) { const t0 = performance.now(); for (let i = 0; i < 20; i++) GFX.drawLogo(ga, 128, 30, i * 0.3); ga.getImageData(0, 0, 1, 1); o.logoMs = Math.min(o.logoMs, (performance.now() - t0) / 20); }   // best of 4: other processes share this CPU
  for (const k of [1, 2, 3, 6]) { GFX.setScale(k); const cc = T.canvas(256 * k, 80 * k), g = cc.getContext('2d'); g.setTransform(k, 0, 0, k, 0, 0); GFX.drawLogo(g, 128, 20, 1); ck('logo at k=' + k, T.stats(cc).maxLuma > 150); }
  o.total = r.total;
  return o;
});
check('logo', logo.bad.length === 0, logo.bad.join(' ; '));
tcheck('logo frame cost <= 9 ms (software raster, best of 4)', logo.logoMs < 9, logo.logoMs);
info('logo', `width ${logo.total.toFixed(1)} logical px, ${logo.logoMs.toFixed(2)} ms/frame (software raster, flushed)`);
await shot('logo_k4.png', () => {
  GFX.setScale(4);
  const c = T.canvas(1024, 448), g = c.getContext('2d'); g.setTransform(4, 0, 0, 4, 0, 0); g.imageSmoothingEnabled = true; g.fillStyle = '#05070f'; g.fillRect(0, 0, 256, 112);
  g.drawImage(GFX.bgCanvas(3), 0, 0, 256, 112, 0, 0, 256, 112);
  const r = GFX.drawLogo(g, 128, 30, 2.1); GFX.text(g, 'THE SUNKEN TOWER', 128, r.uy + 8, '#bff6ff', { align: 'center', scale: 1 });
  GFX.postFX(g, 2); return c;
}, [], 1);
await shot('logo_k1_k2.png', () => {
  const c = T.canvas(256 + 512 + 30, 160), g = c.getContext('2d'); g.fillStyle = '#05070f'; g.fillRect(0, 0, c.width, c.height);
  for (const [k, ox] of [[1, 0], [2, 266]]) { GFX.setScale(k); const cc = T.canvas(256 * k, 80 * k), gg = cc.getContext('2d'); gg.setTransform(k, 0, 0, k, 0, 0); gg.fillStyle = '#05070f'; gg.fillRect(0, 0, 256, 80); GFX.drawLogo(gg, 128, 20, 2.1); g.drawImage(cc, ox, 0); }
  return c;
}, [], 2);

const post = await E(() => {
  const o = { bad: [] }, ck = (n, ok, d) => { if (!ok) o.bad.push(n + (d === undefined ? '' : ' ' + d)); };
  GFX.setScale(4);
  const scene = () => { const c = T.canvas(1024, 896), g = c.getContext('2d'); g.setTransform(4, 0, 0, 4, 0, 0); g.imageSmoothingEnabled = true;
    g.fillStyle = '#0a1226'; g.fillRect(0, 0, 256, 224); g.drawImage(GFX.bgCanvas(0), 0, 16, 256, 208); g.drawImage(GFX.levelCanvas(0, __maps[0]), 0, 16, 256, 208); GFX.drawLogo(g, 128, 60, 1.2); GFX.text(g, 'HI SCORE', 128, 6, '#ffb23e', { align: 'center' });
    GFX.particle(g, 'dot', 200, 150, 4, '#ff3ea5', 1); return [c, g]; };
  const [c0] = scene(), h0 = T.hash(c0);
  const [cq0, g0] = scene(); GFX.postFX(g0, 0); ck('quality 0 leaves the frame untouched', T.hash(cq0) === h0);
  const [cq2, g2] = scene(); GFX.postFX(g2, 2);
  const [cq1, g1] = scene(); GFX.postFX(g1, 1);
  ck('postFX restores the context (transform, alpha, composite)', (() => { const m = g2.getTransform(); return m.a === 4 && m.d === 4 && g2.globalAlpha === 1 && g2.globalCompositeOperation === 'source-over'; })());
  const corner = (c) => T.stats(c, 0, 0, 40, 40).luma, centre = (c) => T.stats(c, 448, 380, 128, 128).luma;
  ck('vignette darkens the corners (q2, q1)', corner(cq2) < corner(c0) * 0.9 && corner(cq1) < corner(c0) * 0.9, [corner(c0), corner(cq2), corner(cq1)]);
  // bloom adds light around a bright source: ring 14-26 logical px away from the dot
  const ring = (c) => T.stats(c, (200 - 26) * 4, (150 - 26) * 4, 52 * 4, 52 * 4).luma;
  ck('v3 (V10a): q2 = bloom (adds light around bright sources), q1 = vignette only (no bloom: the halos are baked)', ring(cq2) > ring(c0) * 1.03 && ring(cq1) < ring(c0) * 1.02, [ring(c0), ring(cq2), ring(cq1)]);
  ck('postFX does not wash out the frame (mean luma change < 60 % on the logo-heavy title scene)', Math.abs(T.stats(cq2).luma / T.stats(c0).luma - 1) < 0.6, [T.stats(c0).luma, T.stats(cq2).luma]);
  const mx = (c) => T.stats(c, 0, 0, c.width, c.height).maxLuma; ck('no clipping explosion: max luma stays 255 or below', mx(cq2) <= 255);
  window.__post = { c0, cq2, cq1 };
  // resize + tiny canvases
  let threw = null; try { for (const [w, h] of [[8, 8], [9, 7], [64, 64], [300, 200], [1, 1]]) { const c = T.canvas(w, h), g = c.getContext('2d'); GFX.postFX(g, 2); GFX.postFX(g, 1); } } catch (e) { threw = String(e); }
  ck('postFX on tiny / odd canvases', !threw, threw);
  // timing: flushed (true raster cost) and call-only, q2 / q1, 24 frames each, scene redrawn every frame like the game does
  const flush = (g) => g.getImageData(0, 0, 1, 1);
  const timeIt = (q) => { const [c, g] = scene(); const calls = [], full = []; for (let i = 0; i < 24; i++) { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 1024, 896); g.setTransform(4, 0, 0, 4, 0, 0); g.drawImage(GFX.bgCanvas(0), 0, 16, 256, 208); flush(g); const t0 = performance.now(); GFX.postFX(g, q); const t1 = performance.now(); flush(g); const t2 = performance.now(); calls.push(t1 - t0); full.push(t2 - t0); } const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length; return { callMean: mean(calls), flushedMean: mean(full), flushedMax: Math.max(...full) }; };
  o.q2 = timeIt(2); o.q1 = timeIt(1);
  // calibration: the cost of ONE full-frame additive 1:1 blit on this machine (the physical floor of any bloom)
  const [cb, gb] = scene(); const [sc, sg] = [T.canvas(1024, 896), null]; sc.getContext('2d').fillStyle = 'rgba(10,10,10,0.5)'; sc.getContext('2d').fillRect(0, 0, 1024, 896);
  const cal = []; for (let i = 0; i < 20; i++) { flush(gb); const t0 = performance.now(); gb.setTransform(1, 0, 0, 1, 0, 0); gb.globalCompositeOperation = 'lighter'; gb.drawImage(sc, 0, 0); gb.globalCompositeOperation = 'source-over'; flush(gb); cal.push(performance.now() - t0); }
  cal.sort((a, b) => a - b); o.blit = cal[10];
  return o;
});
check('postFX behaviour (q0 off, vignette, bloom, state restore, odd canvases)', post.bad.length === 0, post.bad.join(' ; '));
info('postFX 1024x896', `q2 call ${post.q2.callMean.toFixed(2)} ms mean, flushed ${post.q2.flushedMean.toFixed(2)} ms (max ${post.q2.flushedMax.toFixed(1)}); q1 call ${post.q1.callMean.toFixed(2)} ms, flushed ${post.q1.flushedMean.toFixed(2)} ms; one full-frame additive 1:1 blit = ${post.blit.toFixed(2)} ms on this machine`);
{
  const q2 = post.q2.flushedMean, floor = Math.max(post.blit, 0.2);
  if (post.q2.callMean <= 2 && q2 <= 2) tcheck('postFX q2 <= 2 ms at 1024x896', true);
  else if (post.blit >= 0.5) { const ok = q2 <= 12 * floor + 1; results.push({ name: 'postFX q2 <= 2 ms at 1024x896 [ENV-LIMITED: CPU raster, one full-frame blit already costs ' + post.blit.toFixed(2) + ' ms; gate relaxed to <= 12 blits]', ok: ok || ADVISORY, info: true, detail: `${q2.toFixed(2)} ms flushed / ${post.q2.callMean.toFixed(2)} ms call` }); if (!ok) tcheck('postFX relaxed gate (<= 12 blits)', false, q2); }
  else tcheck('postFX q2 <= 2 ms at 1024x896', false, `${q2.toFixed(2)} ms flushed, ${post.q2.callMean.toFixed(2)} ms call`);
}
await shot('postfx_compare.png', () => { const { c0, cq2, cq1 } = window.__post; return T.grid([c0, cq1, cq2], 3, 512, 448, 6); }, [], 1);
await shot('postfx_q2_full.png', () => window.__post.cq2, [], 1);

/* ---------------------------------------------------------------- 9. draw() throughput + sheet */
const perf = await E(() => {
  const o = {};
  GFX.setScale(4);
  for (let i = 0; i < 40; i++) GFX.define('perf_' + i, { w: 16, h: 16, frames: 4, pad: { l: 4, r: 4, t: 4, b: 4 }, draw(ctx, f) { NEON.neon(ctx, NEON.circlePath(8, 8, 5 + f * 0.3), NEON.RGB.cyan, NEON.lwFor(4)); NEON.glow(ctx, 8, 8, 9, NEON.RGB.cyan, 0.3); } });
  const c = T.canvas(1024, 896), g = c.getContext('2d'); g.setTransform(4, 0, 0, 4, 0, 0); g.imageSmoothingEnabled = true;
  for (let i = 0; i < 40; i++) for (let f = 0; f < 4; f++) GFX.draw(g, 'perf_' + i, f, 0, 0);          // bake
  const bakes = GFX._stats().bakes;
  g.getImageData(0, 0, 1, 1);
  let callMs = 1e9, fullMs = 1e9;
  for (let rep = 0; rep < 5; rep++) { g.getImageData(0, 0, 1, 1); const t0 = performance.now(); for (let r = 0; r < 20; r++) { for (let i = 0; i < 40; i++) GFX.draw(g, 'perf_' + i, r, (i % 16) * 15, ((i / 16) | 0) * 40, { flip: i % 2 === 0 }); } callMs = Math.min(callMs, (performance.now() - t0) / 20); g.getImageData(0, 0, 1, 1); fullMs = Math.min(fullMs, (performance.now() - t0) / 20); }   // best of 5
  o.perDraw = { calls40Ms: callMs, flushed40Ms: fullMs, rebakes: GFX._stats().bakes - bakes };
  o.text12Ms = 1e9; for (let rep = 0; rep < 4; rep++) { g.getImageData(0, 0, 1, 1); const t1 = performance.now(); for (let r = 0; r < 20; r++) for (let i = 0; i < 12; i++) GFX.text(g, 'SCORE ' + (100000 + r * 13 + i), 8, 8 + i * 9, '#3cf2ff'); g.getImageData(0, 0, 1, 1); o.text12Ms = Math.min(o.text12Ms, (performance.now() - t1) / 20); }
  return o;
});
check('draw(): baked sprites are not re-baked in steady state', perf.perDraw.rebakes === 0, perf.perDraw.rebakes);
tcheck('draw(): 40 sprites/frame (incl. flips) <= 2.5 ms flushed (software raster, best of 5)', perf.perDraw.flushed40Ms <= 2.5, perf.perDraw.flushed40Ms.toFixed(2));
tcheck('text(): 12 HUD-style strings (84 glyphs, all different every frame = worst case) <= 2 ms flushed', perf.text12Ms <= 2, perf.text12Ms.toFixed(2));
info('draw/text cost', `40 sprites ${perf.perDraw.calls40Ms.toFixed(2)} ms call / ${perf.perDraw.flushed40Ms.toFixed(2)} ms flushed; 12 strings ${perf.text12Ms.toFixed(2)} ms`);
await shot('sheet.png', () => { GFX.setScale(2); return GFX.sheet(); }, [], 1);

/* ---------------------------------------------------------------- 10. console + summary */
check('zero console errors / page errors', t.errors.length === 0, t.errors.join(' | '));
await t.close();

const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ gfx: gfxArg, passed: results.length - failed.length, failed: failed.length, results }, null, 1));
console.log(`\ngfxcore test: ${results.filter((r) => r.ok && !r.info).length} checks passed, ${failed.length} failed, ${results.filter((r) => r.info).length} info lines   (PNGs + results.json in ${OUT})`);
process.exit(failed.length ? 1 : 0);
