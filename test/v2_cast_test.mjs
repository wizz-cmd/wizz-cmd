// FIZZ & POP v2 - cast test (role "gfxcast").   node test/v2_cast_test.mjs [--cast=<path rel. to test/>] [--out=<dir>] [--real]
// Checks src/11_gfx_cast.js (or --cast) against SPEC 3.1 + the wave-2/3 additions with a stub GFX (define() collects the entries) and,
// unless --nostub-only, with the REAL src/10_gfx.js:
//  registry (every name, w, h, frames) | every frame bakes at k = 1, 2, 4 without throwing and is not empty | soft light fades out inside the
//  pad (no alpha on the outer pixel ring) | SPEC_V2 overdraw limits (alpha >= 0.45 contour extents: heroes 1.35 x, enemies 1.25 x, items 1.2 x)
//  | deterministic bake | frames differ + loops are seamless | water tiles join | angry = red + steam | enemies distinct | hero flip silhouette
//  | static source rules (no Math.random / Date / network / DOM at load) | real GFX integration (has/frames/size/draw with flip, white, tint, glow)
//  | zero console errors | bake timing + memory report.  PNG sheets go to out/v2/gfxcast/.  Exit code 1 on any failed check.
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { execFileSync } from 'child_process';
import { launch, canvasFnShot, PROJECT } from '../tools/harness.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const a = args.find((x) => x.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3) : d; };
const OUT = opt('out', path.join(PROJECT, 'out', 'v2', 'gfxcast'));
const castRel = opt('cast', '../src/11_gfx_cast.js');
const castAbs = path.resolve(PROJECT, 'test', castRel);
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) }); console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail !== undefined && (!ok || String(detail).length < 160) ? '  ' + detail : '')); };

/* ---------------------------------------------------------------- expected registry */
const reg = JSON.parse(fs.readFileSync(path.join(PROJECT, 'test', 'stubs', 'sprite_registry.json'), 'utf8'));
const EXPECT = new Map(reg.map((r) => [r.name, r]));
for (const n of ['crabbit_throw_angry', 'springle_squash_angry', 'glimmer_fire_angry']) { const b = EXPECT.get(n.replace('_angry', '')); EXPECT.set(n, { name: n, w: b.w, h: b.h, frames: b.frames }); }

/* ---------------------------------------------------------------- 1. static source */
const src = fs.readFileSync(castAbs, 'utf8');
try { execFileSync(process.execPath, ['--check', castAbs]); check('node --check', true); } catch (e) { check('node --check', false, e.message); }
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
check('deterministic: no Math.random / Date / performance', !/Math\.random|Date\.now|new Date|performance\./.test(code));
check('no network / eval / DOM access', !/\b(fetch|XMLHttpRequest|eval|Image|document|window|localStorage)\b|new Function|import\(|url\(/.test(code));
check('no GFX use other than GFX.define', (code.match(/\bGFX\.\w+/g) || []).every((m) => m === 'GFX.define'), (code.match(/\bGFX\.\w+/g) || []).filter((m) => m !== 'GFX.define'));
check('header documents the contract', /CONTRACT/.test(src) && /ANIMATION/.test(src) && /EXPORT/.test(src));
{   // loads in a bare sandbox with a stub GFX + the real NEON (no DOM needed: define() only stores)
  try {
    const sb = vm.createContext({ console });
    vm.runInContext(fs.readFileSync(path.join(PROJECT, 'src', '09_neon.js'), 'utf8') + '\nvar NEON_ = NEON;', sb);
    const defs = [];
    vm.runInContext('var GFX = { define(n, s) { __defs.push([n, s.w, s.h, s.frames, typeof s.draw]); return true; } };', Object.assign(sb, { __defs: defs }));
    const r = vm.runInContext(src + '\n;GFX_CAST', sb);
    check('loads without DOM (vm sandbox) and exports {count, names}', r && typeof r.count === 'number' && Array.isArray(r.names) && r.count === defs.length, r && r.count + ' vs ' + defs.length);
  } catch (e) { check('loads without DOM (vm sandbox)', false, e.message); }
}

/* ---------------------------------------------------------------- 2. page (stub GFX) */
const pageUrl = (gfx) => path.join(PROJECT, 'test', 'v2_cast_harness.html') + '?gfx=' + gfx + '&cast=' + encodeURIComponent(castRel);
const t = await launch({ html: pageUrl('stub'), viewport: { width: 1400, height: 900 } });
await t.page.waitForFunction(() => window.__castReady === true);
const ev = (fn, ...a) => t.page.evaluate(fn, ...a);

const list = await ev(() => T.list());
const got = new Map(list.map((s) => [s.name, s]));
check('every registry name is defined', Array.from(EXPECT.keys()).every((n) => got.has(n)), Array.from(EXPECT.keys()).filter((n) => !got.has(n)));
check('no sprite outside registry + 3 angry action poses', list.every((s) => EXPECT.has(s.name)), list.filter((s) => !EXPECT.has(s.name)).map((s) => s.name));
check('w / h / frames exact', Array.from(EXPECT.values()).every((e) => got.has(e.name) && got.get(e.name).w === e.w && got.get(e.name).h === e.h && got.get(e.name).frames === e.frames),
  Array.from(EXPECT.values()).filter((e) => !got.has(e.name) || got.get(e.name).w !== e.w || got.get(e.name).h !== e.h || got.get(e.name).frames !== e.frames).map((e) => e.name + ' want ' + e.w + 'x' + e.h + 'x' + e.frames + ' got ' + (got.get(e.name) ? got.get(e.name).w + 'x' + got.get(e.name).h + 'x' + got.get(e.name).frames : 'none')));
check('count = 82 and GFX_CAST.count matches', list.length === 82 && (await ev(() => GFX_CAST.count)) === 82, list.length);
check('no duplicate definitions', new Set(await ev(() => GFX_CAST.names)).size === list.length);

/* every frame at k = 1, 2, 4: bakes, not empty, ring clean, extents; timing */
const SIDEWAYS_TILES = new Set(['water_flow', 'water_fall']);            // seamless stream tiles carry light to the tile edges on purpose
const bake = await ev(() => {
  const out = { rows: [], errors: [], ms: {}, px: {} };
  for (const k of [1, 2, 4, 8]) {
    let t0 = performance.now(), px = 0;
    for (const s of T.list()) {
      for (let f = 0; f < s.frames; f++) {
        try {
          const m = T.metrics(s.name, f, k);
          px += m.W * m.H;
          if (k <= 8) out.rows.push({ name: s.name, f, k, any: m.any, edge: m.edge, bbox: m.bbox, W: m.W, H: m.H });
        } catch (e) { out.errors.push(s.name + ' f' + f + ' k' + k + ': ' + e.message); }
      }
    }
    out.ms[k] = performance.now() - t0; out.px[k] = px;
  }
  return out;
});
check('every frame bakes at k = 1, 2, 4, 8 without throwing', bake.errors.length === 0, bake.errors.slice(0, 5));
check('no console errors during bakes', t.errors.length === 0, t.errors.slice(0, 3));
const empties = bake.rows.filter((r) => r.any < 20);
check('no frame is empty', empties.length === 0, empties.slice(0, 5).map((r) => r.name + ' f' + r.f + ' k' + r.k));
const ringBad = bake.rows.filter((r) => r.edge > 4 && !(SIDEWAYS_TILES.has(r.name)));
check('soft light fades inside the pad (outer ring alpha <= 4/255)', ringBad.length === 0, ringBad.slice(0, 60).map((r) => r.name + ' f' + r.f + ' k' + r.k + ' a=' + r.edge));
const cat = (n) => /^p[12]_(idle|walk|jump|fall|shoot|die|stun)$/.test(n) ? ['hero', 1.35] : /^(nibbler|crabbit|jellop|springle|glimmer)_(move|angry|die)$|^(crabbit_throw|springle_squash|glimmer_fire)(_angry)?$|^bonefin$/.test(n) ? ['enemy', 1.25] : /^kraken(_angry)?$/.test(n) ? ['boss', 1.25] : /^(food_\d|pu_\w+|moonpearl)$/.test(n) ? ['item', 1.2] : null;
const over = [];
const lim = new Map();
for (const r of bake.rows.filter((r) => r.k === 4 && r.bbox)) {
  const c = cat(r.name); if (!c) continue;
  const s = got.get(r.name), bw = r.bbox.x1 - r.bbox.x0, bh = r.bbox.y1 - r.bbox.y0;
  const rel = Math.max(bw / s.w, bh / s.h);
  const e = lim.get(r.name) || { rel: 0, c };
  e.rel = Math.max(e.rel, rel); lim.set(r.name, e);
  if (rel > c[1] + 0.001) over.push(r.name + ' f' + r.f + ' ' + rel.toFixed(2) + ' > ' + c[1]);
}
check('SPEC_V2 overdraw limits (contour alpha >= 0.45; heroes 1.35, enemies/boss 1.25, items 1.2 x the box)', over.length === 0, over.slice(0, 12));
const worst = { hero: 0, enemy: 0, boss: 0, item: 0 };
for (const e of lim.values()) worst[e.c[0]] = Math.max(worst[e.c[0]], e.rel);
console.log('  worst contour extents (x box):', JSON.stringify(Object.fromEntries(Object.entries(worst).map(([k, v]) => [k, +v.toFixed(2)]))));
console.log('  bake all frames: k=1 %s ms, k=2 %s ms, k=4 %s ms, k=8 %s ms  (backing px %s / %s / %s / %s Mpx)', bake.ms[1].toFixed(0), bake.ms[2].toFixed(0), bake.ms[4].toFixed(0), bake.ms[8].toFixed(0), (bake.px[1] / 1e6).toFixed(2), (bake.px[2] / 1e6).toFixed(2), (bake.px[4] / 1e6).toFixed(2), (bake.px[8] / 1e6).toFixed(2));
check('total bake time at k = 4 is sane (< 4 s in software raster)', bake.ms[4] < 4000, bake.ms[4].toFixed(0) + ' ms');
const slow = await ev(() => { const o = []; for (const s of T.list()) for (let f = 0; f < s.frames; f++) { const t0 = performance.now(); T.bake(s.name, f, 4); const d = performance.now() - t0; if (d > 25) o.push(s.name + ' f' + f + ' ' + d.toFixed(0) + 'ms'); } return o; });
check('no single frame needs > 25 ms at k = 4', slow.length === 0, slow.slice(0, 8));

/* determinism, frame variety, loop seams, tiles, angry, distinctness, flip */
const an = await ev(() => {
  const o = { nondet: [], same: [], seam: [], seamInfo: [], tiles: [], angry: [], masks: {}, flip: null, bright: {} };
  const px = (name, f, k) => { const cv = T.bake(name, f, k); return { cv, d: cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data }; };
  const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) { s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) + Math.abs(a[i + 3] - b[i + 3]); } return s / (a.length / 4) / 4; };
  const LOOPS = /^(p[12]_walk|(nibbler|crabbit|jellop|springle|glimmer)_(move|angry|trapped)|bonefin|kraken|kraken_angry|bubble|bubble_warn|bubble_thunder|bubble_fire|bubble_water|bubble_letter|flame|pebble|spark|ink|bolt|fire_drop|water_flow|water_fall|moonpearl)$/;
  for (const s of T.list()) {
    const fr = [];
    for (let f = 0; f < s.frames; f++) { const a = px(s.name, f, 2), b = px(s.name, f, 2); if (diff(a.d, b.d) !== 0) o.nondet.push(s.name + ' f' + f); fr.push(a.d); }
    if (s.frames > 1) {
      for (let f = 0; f < s.frames; f++) for (let g = f + 1; g < s.frames; g++) if (diff(fr[f], fr[g]) < 0.02) o.same.push(s.name + ' f' + f + '=f' + g);
      if (LOOPS.test(s.name) && s.frames >= 3) {
        const d = fr.map((_, f) => diff(fr[f], fr[(f + 1) % s.frames]));
        const wrap = d[s.frames - 1], others = d.slice(0, s.frames - 1), mx = Math.max(...others), mean = others.reduce((a, b) => a + b, 0) / others.length;
        o.seamInfo.push([s.name, +wrap.toFixed(2), +mean.toFixed(2)]);
        if (wrap > Math.max(2.2 * mx, mean * 3 + 0.5)) o.seam.push(s.name + ' wrap ' + wrap.toFixed(2) + ' vs max ' + mx.toFixed(2));
      }
    }
  }
  // seamless stream tiles: the last pixel column (water_flow) / row (water_fall) continues into the first of the next tile
  for (const [name, vertical] of [['water_flow', false], ['water_fall', true]]) {
    for (let f = 0; f < 2; f++) {
      const { cv, d } = px(name, f, 4), W = cv.width, H = cv.height;
      let s = 0, n = 0;
      if (!vertical) { for (let y = 0; y < H; y++) { const a = (y * W) * 4, b = (y * W + W - 1) * 4; for (let c = 0; c < 4; c++) { s += Math.abs(d[a + c] - d[b + c]); n++; } } }
      else { for (let x = 0; x < W; x++) { const a = x * 4, b = ((H - 1) * W + x) * 4; for (let c = 0; c < 4; c++) { s += Math.abs(d[a + c] - d[b + c]); n++; } } }
      o.tiles.push([name, f, +(s / n).toFixed(2)]);
    }
  }
  // angry: red dominance of the contour pixels + more light above than the calm frame (steam)
  const redness = (name, f) => { const { cv, d } = px(name, f, 4); let r = 0, g = 0, b = 0, n = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 115 && (d[i] + d[i + 1] + d[i + 2]) > 200) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; } } return n ? [r / n, g / n, b / n, n] : [0, 0, 0, 0]; };
  for (const e of ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer']) {
    const a = redness(e + '_angry', 1), m = redness(e + '_move', 1);
    o.angry.push([e, a.map((v) => +v.toFixed(0)), m.map((v) => +v.toFixed(0))]);
  }
  // silhouettes (alpha >= 0.45 masks at k = 2, box + pad) of the move frame 0 for pairwise IoU, and the hero flip test
  const mask = (name, f) => { const { cv, d } = px(name, f, 2); const m = new Uint8Array(cv.width * cv.height); for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > 115 ? 1 : 0; return { m, w: cv.width, h: cv.height, pl: cv._pl }; };
  const E = ['nibbler_move', 'crabbit_move', 'jellop_move', 'springle_move', 'glimmer_move', 'bonefin'];
  const ms = E.map((n) => mask(n, 0));
  o.iou = [];
  for (let i = 0; i < E.length; i++) for (let j = i + 1; j < E.length; j++) {
    const A = ms[i], B = ms[j], w = Math.min(A.w, B.w), h = Math.min(A.h, B.h);
    let inter = 0, uni = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const a = A.m[y * A.w + x], b = B.m[y * B.w + x]; inter += a & b; uni += a | b; }
    o.iou.push([E[i], E[j], +(inter / uni).toFixed(2)]);
  }
  o.flipIou = {};
  for (const n of ['p1_idle', 'p2_idle', 'p1_walk', 'p2_walk']) {
    const A = mask(n, 0); let inter = 0, uni = 0; const bw = 32;   // mirror about the BOX centre: box x 0..16 at k=2 starts at pl, width 32
    for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) { const mx = 2 * A.pl + bw - 1 - x; const a = A.m[y * A.w + x], b = mx >= 0 && mx < A.w ? A.m[y * A.w + mx] : 0; inter += a & b; uni += a | b; }
    o.flipIou[n] = +(inter / uni).toFixed(2);
  }
  // mean brightness of lit pixels: heroes vs enemies
  const bright = (name, f) => { const { d } = px(name, f, 2); let s = 0; for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; return s / 255 / 4; };   // total emitted light (logical px^2 of full white)
  o.bright = { p1: bright('p1_idle', 0), p2: bright('p2_idle', 0), nibbler: bright('nibbler_move', 0), crabbit: bright('crabbit_move', 0), jellop: bright('jellop_move', 0), springle: bright('springle_move', 0), glimmer: bright('glimmer_move', 0) };
  return o;
});
check('bake is deterministic (same pixels twice)', an.nondet.length === 0, an.nondet.slice(0, 6));
check('multi-frame sprites: all frames differ', an.same.length === 0, an.same.slice(0, 8));
check('loops are seamless (wrap diff <= 2.2 x the largest step)', an.seam.length === 0, an.seam.slice(0, 8));
check('water tiles join (edge columns / rows continue)', an.tiles.every((x) => x[2] < 14), JSON.stringify(an.tiles));
check('angry frames are red (r > 1.6 x mean(g, b)) for every enemy', an.angry.every(([e, a]) => a[0] > 1.6 * (a[1] + a[2]) / 2), JSON.stringify(an.angry.map(([e, a]) => [e, a.slice(0, 3)])));
check('angry frames are redder than the calm frames', an.angry.every(([e, a, m]) => a[0] / ((a[1] + a[2]) / 2 + 1) > m[0] / ((m[1] + m[2]) / 2 + 1)));
check('enemy silhouettes are distinct (pairwise mask IoU < 0.72)', an.iou.every((x) => x[2] < 0.72), JSON.stringify(an.iou.filter((x) => x[2] >= 0.5)));
check('hero flip test: mirrored silhouette changes >= 15 % (IoU <= 0.85)', Object.values(an.flipIou).every((v) => v <= 0.85), JSON.stringify(an.flipIou));
console.log('  hero vs enemy emitted light (px^2 of full white):', JSON.stringify(Object.fromEntries(Object.entries(an.bright).map(([k, v]) => [k, +v.toFixed(0)]))));
check('twins are the brightest creatures (total emitted light above every enemy)', Math.min(an.bright.p1, an.bright.p2) > Math.max(an.bright.nibbler, an.bright.crabbit, an.bright.jellop, an.bright.springle, an.bright.glimmer), JSON.stringify(an.bright));

/* sheets */
for (const [g, names, k, zoom] of [
  ['heroes', list.filter((s) => /^p[12]_/.test(s.name)).map((s) => s.name), 4, 1],
  ['enemies', list.filter((s) => /^(nibbler|crabbit|jellop|springle|glimmer)_|^crabbit_|^springle_|^glimmer_|^bonefin/.test(s.name)).map((s) => s.name), 4, 1],
  ['world', list.filter((s) => !/^p[12]_|^(nibbler|crabbit|jellop|springle|glimmer)_|^crabbit_|^springle_|^glimmer_|^bonefin|^kraken/.test(s.name)).map((s) => s.name), 4, 1],
  ['boss', ['kraken', 'kraken_angry', 'kraken_trapped', 'moonpearl'], 4, 1],
]) {
  await canvasFnShot(t.page, path.join(OUT, `cast_${g}_k${k}.png`), (names, k) => T.sheet(names, k, { maxW: 2000 }), { args: [names, k], scale: zoom });
  await canvasFnShot(t.page, path.join(OUT, `cast_${g}_k2.png`), (names) => T.sheet(names, 2, { maxW: 1400 }), { args: [names], scale: 1 });
}
check('console errors after sheets', t.errors.length === 0, t.errors.slice(0, 3));
await t.close();

/* ---------------------------------------------------------------- 3. real GFX integration */
{
  const r = await launch({ html: pageUrl('real'), viewport: { width: 1200, height: 800 } });
  await r.page.waitForFunction(() => window.__castReady === true);
  const info = await r.page.evaluate(() => {
    const out = { has: [], dims: [], draw: [], lint: [], reg: GFX._registry().length };
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 512; const g = cv.getContext('2d');
    GFX.setScale(2); g.setTransform(2, 0, 0, 2, 0, 0);
    for (const s of T.list()) {
      if (!GFX.has(s.name)) out.has.push(s.name);
      if (GFX.frames(s.name) !== s.frames || GFX.size(s.name).w !== s.w || GFX.size(s.name).h !== s.h) out.dims.push(s.name);
      try { for (let f = 0; f < s.frames; f++) { GFX.draw(g, s.name, f, 40, 40, {}); GFX.draw(g, s.name, f, 90, 40, { flip: true, alpha: 0.5 }); GFX.draw(g, s.name, f, 140, 40, { white: true }); GFX.draw(g, s.name, f, 40, 100, { tint: '#aef0ff' }); GFX.draw(g, s.name, f, 90, 100, { glow: 0.4 }); } }
      catch (e) { out.draw.push(s.name + ': ' + e.message); }
    }
    out.lint = GFX._lint();
    // draw all frames of everything over a scene-like background to look at integration
    return out;
  });
  check('real GFX: every sprite has() with matching frames / size', info.has.length === 0 && info.dims.length === 0, JSON.stringify({ has: info.has.slice(0, 5), dims: info.dims.slice(0, 5) }));
  check('real GFX: draw() with flip / alpha / white / tint / glow never throws', info.draw.length === 0, info.draw.slice(0, 4));
  check('real GFX: lint log clean (no bake errors, no unknown sprites)', info.lint.length === 0, JSON.stringify(info.lint.slice(0, 4)));
  check('real GFX: registry has 82 entries from the cast', info.reg >= 82, info.reg);
  await canvasFnShot(r.page, path.join(OUT, 'real_gfx_sheet.png'), () => GFX.sheet(), { scale: 1 });
  check('real GFX: zero console errors', r.errors.length === 0, r.errors.slice(0, 3));
  await r.close();
}

const failed = results.filter((x) => !x.ok);
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ when: new Date().toISOString(), total: results.length, failed: failed.length, results }, null, 1));
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
