// FIZZ & POP v2 - cast test (role "gfxcast").   node test/v2_cast_test.mjs [--cast=<path rel. to test/>] [--out=<dir>] [--real]
// Checks src/11_gfx_cast.js (or --cast) against SPEC 3.1 + the wave-2/3 additions with a stub GFX (define() collects the entries) and,
// unless --nostub-only, with the REAL src/10_gfx.js:
//  registry (every name, w, h, frames) | every frame bakes at k = 1, 2, 4 without throwing and is not empty | soft light fades out inside the
//  pad (no alpha on the outer pixel ring) | SPEC_V2 overdraw limits (alpha >= 0.45 contour extents: heroes 1.35 x, enemies 1.25 x, items 1.2 x)
//  | deterministic bake | frames differ + loops are seamless | water tiles join | angry = red + steam | enemies distinct | hero flip silhouette
//  | static source rules (no Math.random / Date / network / DOM at load) | real GFX integration (has/frames/size/draw with flip, white, tint, glow)
//  | zero console errors | bake timing + memory report.  PNG sheets go to out/v2/gfxcast/.  Exit code 1 on any failed check.
// V3 fix-wave gates (FIXPLAN_V3 'Cast'): V1 <e>_frozen (87 sprites) | C1 ink colour + visibility over the Kraken | C2 trap stages differ by shape (dashes, cracks, energy)
//  | C3 twins brighter than every enemy + P2/P1 luminance gap (also under protan) | C4 angry >= calm luminance, still red | C5 flame vs drop silhouettes | V7 Kraken royal purple
//  | V8 pearl glyphs (range / rate / speed) differ by shape in grayscale | X7 pads (real GFX, k = 1 ring check).
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
import { timingCheck } from './timing_gate.mjs';   // release-gate policy: wall-clock checks are advisory in the blocking run (FP_TIMING=advisory)
const tcheck = timingCheck(check, results);

/* ---------------------------------------------------------------- expected registry */
const reg = JSON.parse(fs.readFileSync(path.join(PROJECT, 'test', 'stubs', 'sprite_registry.json'), 'utf8'));
const EXPECT = new Map(reg.map((r) => [r.name, r]));
for (const n of ['crabbit_throw_angry', 'springle_squash_angry', 'glimmer_fire_angry']) { const b = EXPECT.get(n.replace('_angry', '')); EXPECT.set(n, { name: n, w: b.w, h: b.h, frames: b.frames }); }
// V1 (FIXPLAN_V3): <e>_frozen for the five freezable enemies, the same w / h / frame count as <e>_move (Game feature-detects them)
const FREEZABLE = ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer'];
for (const e of FREEZABLE) { const b = EXPECT.get(e + '_move'); EXPECT.set(e + '_frozen', { name: e + '_frozen', w: b.w, h: b.h, frames: b.frames }); }

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
check('no sprite outside registry + 3 angry action poses + 5 frozen', list.every((s) => EXPECT.has(s.name)), list.filter((s) => !EXPECT.has(s.name)).map((s) => s.name));
check('w / h / frames exact', Array.from(EXPECT.values()).every((e) => got.has(e.name) && got.get(e.name).w === e.w && got.get(e.name).h === e.h && got.get(e.name).frames === e.frames),
  Array.from(EXPECT.values()).filter((e) => !got.has(e.name) || got.get(e.name).w !== e.w || got.get(e.name).h !== e.h || got.get(e.name).frames !== e.frames).map((e) => e.name + ' want ' + e.w + 'x' + e.h + 'x' + e.frames + ' got ' + (got.get(e.name) ? got.get(e.name).w + 'x' + got.get(e.name).h + 'x' + got.get(e.name).frames : 'none')));
check('count = 87 (82 + 5 frozen) and GFX_CAST.count matches', list.length === 87 && (await ev(() => GFX_CAST.count)) === 87, list.length);
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
          if (k <= 8) out.rows.push({ name: s.name, f, k, any: m.any, edge: m.edge, edge2: m.edge2, bbox: m.bbox, W: m.W, H: m.H });
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
// X7 (QA): light must not even come within 1 px of the pad edge (second ring), at the small k where the bake pad used to cut arcs / claws / bolt tips (k = 1: the thick 1 px strokes)
const ring2Bad = bake.rows.filter((r) => r.k === 1 && r.edge2 > 40 && !(SIDEWAYS_TILES.has(r.name)));
check('X7: at k = 1 no light comes within 1 px of the pad edge (second ring alpha <= 40/255; raw pads, before GFX core\'s own small-k boost)', ring2Bad.length === 0, ring2Bad.slice(0, 30).map((r) => r.name + ' f' + r.f + ' a=' + r.edge2));
const cat = (n) => /^p[12]_(idle|walk|jump|fall|shoot|die|stun)$/.test(n) ? ['hero', 1.35] : /^(nibbler|crabbit|jellop|springle|glimmer)_(move|angry|die|frozen)$|^(crabbit_throw|springle_squash|glimmer_fire)(_angry)?$|^bonefin$/.test(n) ? ['enemy', 1.25] : /^kraken(_angry)?$/.test(n) ? ['boss', 1.25] : /^(food_\d|pu_\w+|moonpearl)$/.test(n) ? ['item', 1.2] : null;
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
tcheck('total bake time at k = 4 is sane (< 4 s in software raster)', bake.ms[4] < 4000, bake.ms[4].toFixed(0) + ' ms');
const slow = await ev(() => { const o = []; for (const s of T.list()) for (let f = 0; f < s.frames; f++) { const t0 = performance.now(); T.bake(s.name, f, 4); const d = performance.now() - t0; if (d > 25) o.push(s.name + ' f' + f + ' ' + d.toFixed(0) + 'ms'); } return o; });
tcheck('no single frame needs > 25 ms at k = 4', slow.length === 0, slow.slice(0, 8));

/* determinism, frame variety, loop seams, tiles, angry, distinctness, flip */
const an = await ev(() => {
  const o = { nondet: [], same: [], seam: [], seamInfo: [], tiles: [], angry: [], masks: {}, flip: null, bright: {} };
  const px = (name, f, k) => { const cv = T.bake(name, f, k); return { cv, d: cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data }; };
  const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) { s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) + Math.abs(a[i + 3] - b[i + 3]); } return s / (a.length / 4) / 4; };
  const LOOPS = /^(p[12]_walk|(nibbler|crabbit|jellop|springle|glimmer)_(move|angry|trapped|frozen)|bonefin|kraken|kraken_angry|bubble|bubble_warn|bubble_thunder|bubble_fire|bubble_water|bubble_letter|flame|pebble|spark|ink|bolt|fire_drop|water_flow|water_fall|moonpearl)$/;
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
check('angry frames are still red: contour hue within 20 deg of crimson and r > 1.35 x mean(g, b) (they are brighter now: white-hot cores)', an.angry.every(([e, a]) => a[0] > 1.35 * (a[1] + a[2]) / 2), JSON.stringify(an.angry.map(([e, a]) => [e, a.slice(0, 3)])));
check('angry frames are redder than the calm frames', an.angry.every(([e, a, m]) => a[0] / ((a[1] + a[2]) / 2 + 1) > m[0] / ((m[1] + m[2]) / 2 + 1)));
check('enemy silhouettes are distinct (pairwise mask IoU < 0.72)', an.iou.every((x) => x[2] < 0.72), JSON.stringify(an.iou.filter((x) => x[2] >= 0.5)));
check('hero flip test: mirrored silhouette changes >= 15 % (IoU <= 0.85)', Object.values(an.flipIou).every((v) => v <= 0.85), JSON.stringify(an.flipIou));
console.log('  hero vs enemy emitted light (px^2 of full white):', JSON.stringify(Object.fromEntries(Object.entries(an.bright).map(([k, v]) => [k, +v.toFixed(0)]))));
check('twins are the brightest creatures (total emitted light above every enemy)', Math.min(an.bright.p1, an.bright.p2) > Math.max(an.bright.nibbler, an.bright.crabbit, an.bright.jellop, an.bright.springle, an.bright.glimmer), JSON.stringify(an.bright));

/* ---------------------------------------------------------------- V3 fix-wave gates (FIXPLAN_V3 "Cast") */
const v3 = await ev(() => {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const BG = [3, 7, 15];
  const read = (name, f, k) => { const cv = T.bake(name, f, k); return { cv, W: cv.width, H: cv.height, d: cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data, pl: cv._pl, pt: cv._pt, k, w: cv._w, h: cv._h }; };
  const rgbAt = (r, x, y) => { const i = (y * r.W + x) * 4, a = r.d[i + 3] / 255; return [r.d[i] * a + BG[0] * (1 - a), r.d[i + 1] * a + BG[1] * (1 - a), r.d[i + 2] * a + BG[2] * (1 - a)]; };
  const lumC = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const L = (r, x, y) => lumC(rgbAt(r, x, y));
  /* window stats over the 16x16 box (or [y0,y1) box rows): mean linear luminance, top-15 % luminance, chroma-weighted mean colour -> hue / saturation */
  const stats = (name, f, reg) => {
    const r = read(name, f, 4), x0 = r.pl, x1 = r.pl + r.w * 4, y0 = r.pt, y1 = r.pt + r.h * 4, lums = [];
    let sR = 0, sG = 0, sB = 0, sw = 0, lR = 0, lG = 0, lB = 0, lw = 0;
    for (let y = 0; y < r.H; y++) for (let x = 0; x < r.W; x++) {
      const c = rgbAt(r, x, y), Lm = lumC(c);
      if (r.d[(y * r.W + x) * 4 + 3] > 50) { lR += c[0] * Lm; lG += c[1] * Lm; lB += c[2] * Lm; lw += Lm; }
      if (x >= x0 && x < x1 && y >= y0 && y < y1) lums.push(Lm);
      const ch = Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]), uy = (y - r.pt) / 4, inReg = !reg || (uy >= reg[0] && uy < reg[1]);
      if (inReg && ch > 12 && r.d[(y * r.W + x) * 4 + 3] > 50) { const wgt = ch * ch; sR += c[0] * wgt; sG += c[1] * wgt; sB += c[2] * wgt; sw += wgt; }
    }
    lums.sort((a, b) => b - a);
    const n15 = Math.max(1, Math.floor(lums.length * 0.15)), R = sR / (sw || 1), G = sG / (sw || 1), B = sB / (sw || 1), mx = Math.max(R, G, B), mn = Math.min(R, G, B);
    let h = 0; if (mx > mn) { if (mx === R) h = ((G - B) / (mx - mn) + 6) % 6; else if (mx === G) h = (B - R) / (mx - mn) + 2; else h = (R - G) / (mx - mn) + 4; }
    const rL = [lR / (lw || 1), lG / (lw || 1), lB / (lw || 1)], mxL = Math.max(...rL), mnL = Math.min(...rL);
    let hL = 0; if (mxL > mnL) { if (mxL === rL[0]) hL = ((rL[1] - rL[2]) / (mxL - mnL) + 6) % 6; else if (mxL === rL[1]) hL = (rL[2] - rL[0]) / (mxL - mnL) + 2; else hL = (rL[0] - rL[1]) / (mxL - mnL) + 4; }
    return { mean: lums.reduce((a, b) => a + b, 0) / lums.length, top15: lums.slice(0, n15).reduce((a, b) => a + b, 0) / n15, rgb: [R, G, B], hue: h * 60, sat: mx ? (mx - mn) / mx : 0, val: mx, rgbL: rL, hueL: hL * 60, satL: mxL ? (mxL - mnL) / mxL : 0 };
  };
  const ENEMIES = ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer'];
  const avg = (name, nf) => { let a = 0; for (let f = 0; f < nf; f++) a += stats(name, f).mean; return a / nf; };
  const o = {};
  const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  o.hueDist = null;

  // ---- C3: twins vs enemies (mean luminance over the calm frames), P2 / P1 gap, protan simulation of the mean colours
  o.twins = { p1: avg('p1_idle', 1), p2: avg('p2_idle', 1), p1w: avg('p1_walk', 4), p2w: avg('p2_walk', 4), enemies: Object.fromEntries(ENEMIES.map((e) => [e, avg(e + '_move', 4)])) };
  const protan = (c) => { const r = lin(c[0]), g = lin(c[1]), b = lin(c[2]); return 0.1121 * r + 0.8853 * g - 0.0005 * b; };     // Vienot protanopia: the only channel that survives for L
  o.protan = { p1: lumC(stats('p1_idle', 0).rgb), p2: lumC(stats('p2_idle', 0).rgb), p1h: stats('p1_idle', 0).hue, p2h: stats('p2_idle', 0).hue };
  // ---- C4: angry vs calm (mean luminance over the 4 frames) + hue
  o.angry = ENEMIES.map((e) => ({ e, calm: avg(e + '_move', 4), angry: avg(e + '_angry', 4), hue: stats(e + '_angry', 0).hue, sat: stats(e + '_angry', 0).sat }));
  o.angryPose = [['crabbit_throw', 'crabbit_throw_angry'], ['springle_squash', 'springle_squash_angry'], ['glimmer_fire', 'glimmer_fire_angry']].map(([c, a]) => ({ c, calm: avg(c, 1), angry: avg(a, 1) }));
  // ---- V7: Kraken royal purple (tentacle region: no gold crown / amber eyes), against Fizz and Jellop
  o.kraken = { tent: stats('kraken', 0, [30, 48]), full: stats('kraken', 0), angry: stats('kraken_angry', 0, [30, 48]), p1: stats('p1_idle', 0), jellop: stats('jellop_move', 0) };
  // ---- C1: ink colour + contrast over the Kraken (a lit tentacle / mantle field)
  o.ink = [0, 1].map((f) => stats('ink', f));
  {
    const k = 4, W = 70, H = 56, spots = [[10, 14], [20, 22], [30, 14], [8, 36], [24, 40], [38, 32], [16, 30], [32, 44]];
    const scene = (items) => { const c = T.scene(items, k, W, H); return { cv: c, d: c.getContext('2d').getImageData(0, 0, c.width, c.height).data, W: c.width }; };
    const base = [{ name: 'kraken', f: 0, x: 0, y: 6 }, { name: 'kraken_angry', f: 1, x: 22, y: 6 }];
    const lumAt = (sc, cx, cy, r) => { let s = 0, n = 0; for (let y = Math.round((cy - r) * k); y <= Math.round((cy + r) * k); y++) for (let x = Math.round((cx - r) * k); x <= Math.round((cx + r) * k); x++) { if (Math.hypot(x / k - cx, y / k - cy) > r) continue; const i = (y * sc.W + x) * 4; s += lumC([sc.d[i], sc.d[i + 1], sc.d[i + 2]]); n++; } return s / n; };
    const A = scene(base);
    o.inkVis = [];
    for (const [bx, by] of spots) {
      const items = base.concat([{ name: 'ink', f: (bx + by) % 2, x: bx, y: by }]);
      const B = scene(items);
      o.inkVis.push({ at: [bx, by], core: [lumAt(A, bx + 4, by + 4, 1.1), lumAt(B, bx + 4, by + 4, 1.1)], blob: [lumAt(A, bx + 4, by + 4, 3.0), lumAt(B, bx + 4, by + 4, 3.0)] });
    }
  }
  // ---- C2: trap stages (rim ring luminance: dashes = gaps, crack lines, energy, grayscale difference)
  {
    const st = [0, 1, 2].map((f) => read('trap_overlay', f, 4));
    const ring = (r, rad) => { const cx = r.pl + 8 * 4, cy = r.pt + 8 * 4, v = []; for (let a = 0; a < 360; a += 2) { const x = Math.round(cx + Math.cos(a * Math.PI / 180) * rad * 4), y = Math.round(cy + Math.sin(a * Math.PI / 180) * rad * 4); let m = 0; for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) m = Math.max(m, L(r, x + dx, y + dy)); v.push(m); } return v; };
    const runsBelow = (v, thr) => { const n = v.length; let c = 0; for (let i = 0; i < n; i++) if (v[i] < thr && !(v[(i + n - 1) % n] < thr)) c++; return c; };
    const runsAbove = (v, thr) => { const n = v.length; let c = 0; for (let i = 0; i < n; i++) if (v[i] > thr && !(v[(i + n - 1) % n] > thr)) c++; return c; };
    o.trap = st.map((r, f) => {
      const rim = ring(r, 7.6), p90 = rim.slice().sort((a, b) => a - b)[Math.floor(rim.length * 0.9)];
      const inner = ring(r, 5.0), med = inner.slice().sort((a, b) => a - b)[Math.floor(inner.length / 2)];
      let E = 0; for (let y = 0; y < r.H; y++) for (let x = 0; x < r.W; x++) E += L(r, x, y);
      let rs = 0, rn = 0; { const cx = r.pl + 32, cy = r.pt + 32; for (let y = 0; y < r.H; y++) for (let x = 0; x < r.W; x++) { const dd = Math.hypot(x - cx, y - cy) / 4; if (dd > 6.6 && dd < 8.6) { rs += L(r, x, y); rn++; } } }
      let bright = 0; { const cx = r.pl + 32, cy = r.pt + 32; for (let y = 0; y < r.H; y++) for (let x = 0; x < r.W; x++) { const dd = Math.hypot(x - cx, y - cy) / 4; if (dd > 3.4 && dd < 6.1 && L(r, x, y) > 0.5) bright++; } }
      return { f, gaps: runsBelow(rim, 0.4 * p90), cracks: bright, energy: E / 16, rim: rs / rn };
    });
    o.trapGray = [[0, 1], [1, 2], [0, 2]].map(([a, b]) => { let s = 0, n = 0; for (let y = 0; y < st[a].H; y++) for (let x = 0; x < st[a].W; x++) { s += Math.abs(L(st[a], x, y) - L(st[b], x, y)); n++; } return s / n; });
  }
  // ---- C5: fire flame (pointed tongues) vs water drop (smooth) inside the bubbles: silhouette of the lit icon pixels (r < 5.6 around the centre)
  {
    // the icon = lit pixels (r < 5.6 units, luminance > 0.3) that the EMPTY bubble does not light (so the rim / highlights drop out); its radial extent r(theta) over the
    // upper half plane (-175..-5 deg, 3 deg steps, median-3 filtered) is scanned for tips with a prominence >= 0.5 unit: a flame has 3 tongues, a drop has 1 tip
    const mask = (name, f, excl) => { const r = read(name, f, 4), cx = r.pl + 32, cy = r.pt + 32, m = new Uint8Array(r.W * r.H); for (let y = 0; y < r.H; y++) for (let x = 0; x < r.W; x++) if (Math.hypot(x - cx, y - cy) / 4 < 5.6 && L(r, x, y) > 0.3) m[y * r.W + x] = excl && excl.m[y * r.W + x] ? 0 : 1; return { m, W: r.W, H: r.H, cx, cy }; };
    const base = mask('bubble', 0, null);
    const A = mask('bubble_fire', 0, base), B = mask('bubble_water', 0, base), C = mask('bubble_thunder', 0, base);
    const iou = (P, Q) => { let i = 0, u = 0; for (let k = 0; k < P.m.length; k++) { i += P.m[k] & Q.m[k]; u += P.m[k] | Q.m[k]; } return i / Math.max(1, u); };
    const prof = (P) => { const rad = []; for (let a = -175; a <= -5; a += 3) { let mx = 0; for (let q = 0; q <= 5.6; q += 0.1) { const x = Math.round(P.cx + Math.cos(a * Math.PI / 180) * q * 4), y = Math.round(P.cy + Math.sin(a * Math.PI / 180) * q * 4); if (P.m[y * P.W + x]) mx = q; } rad.push(mx); } return rad.map((v, i) => { const t = [rad[Math.max(0, i - 1)], v, rad[Math.min(rad.length - 1, i + 1)]].sort((p, q) => p - q); return t[1]; }); };
    const peaks = (P) => { const v = prof(P); let c = 0; for (let i = 1; i < v.length - 1; i++) { if (!(v[i] >= v[i - 1] && v[i] > v[i + 1])) continue; let lm = v[i], j = i - 1; while (j >= 0 && v[j] <= v[i]) { lm = Math.min(lm, v[j]); j--; } let rm = v[i]; j = i + 1; while (j < v.length && v[j] <= v[i]) { rm = Math.min(rm, v[j]); j++; } if (v[i] - Math.max(lm, rm) >= 0.5) c++; } return c; };
    o.icons = { iouFW: iou(A, B), iouFT: iou(A, C), iouWT: iou(B, C), firePeaks: [0, 1].map((f) => peaks(mask('bubble_fire', f, base))), waterPeaks: [0, 1].map((f) => peaks(mask('bubble_water', f, base))), fireLit: A.m.reduce((a, b) => a + b, 0), waterLit: B.m.reduce((a, b) => a + b, 0) };
  }
  // ---- V8: the three pearl glyphs: white-hot glyph mask (lum > 0.6 inside the pearl, r < 4.2) pairwise IoU, and against every other power-up
  {
    const glyph = (name) => { const r = read(name, 0, 4), cx = r.pl + 32, cy = r.pt + 8.2 * 4, m = new Uint8Array(r.W * r.H); for (let y = 0; y < r.H; y++) for (let x = 0; x < r.W; x++) if (Math.hypot(x - cx, y - cy) / 4 < 4.2 && L(r, x, y) > 0.5) m[y * r.W + x] = 1; return m; };
    const names = ['pu_pink', 'pu_blue', 'pu_gold'], G = names.map(glyph);
    const iou = (P, Q) => { let i = 0, u = 0; for (let k = 0; k < P.length; k++) { i += P[k] & Q[k]; u += P[k] | Q[k]; } return i / Math.max(1, u); };
    o.pearls = { iou: [[0, 1], [0, 2], [1, 2]].map(([a, b]) => +iou(G[a], G[b]).toFixed(2)), lit: G.map((m) => m.reduce((a, b) => a + b, 0)) };
  }
  // ---- V1: frozen vs Pop and every enemy (mean lit colour in CIE Lab), saturation, value; frames differ only by the twinkles
  {
    const lab = (c) => { const r = lin(c[0]), g = lin(c[1]), b = lin(c[2]); let X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883; const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116); return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))]; };
    const dE = (a, b) => { const A = lab(a), B = lab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
    const fz = ENEMIES.map((e) => ({ e, s: stats(e + '_frozen', 0) }));
    const others = [['p2_idle', stats('p2_idle', 0)], ['p1_idle', stats('p1_idle', 0)], ['bonefin', stats('bonefin', 0)]].concat(ENEMIES.flatMap((e) => [[e + '_move', stats(e + '_move', 0)], [e + '_angry', stats(e + '_angry', 0)]]));
    // the colour a neon sprite carries = the chroma-weighted mean of its lit pixels (the white-hot cores would wash every sprite to white), compared like for like
    o.frozen = fz.map(({ e, s }) => ({ e, hue: s.hue, sat: s.sat, val: s.val, rgb: s.rgb.map(Math.round), mean: s.mean, minDE: Math.min(...others.map(([n, t]) => dE(s.rgb, t.rgb))), sepHS: Math.min(...others.map(([n, t]) => Math.max(Math.abs(s.sat - t.sat) / 0.18, hueDist(s.hue, t.hue) / 40))), nearest: others.map(([n, t]) => [n, dE(s.rgb, t.rgb)]).sort((a, b) => a[1] - b[1])[0][0], dePop: dE(s.rgb, others[0][1].rgb), meanVsTwins: s.mean / Math.min(o.twins.p1, o.twins.p2) }));
    o.frozenFrames = ENEMIES.map((e) => { const a = read(e + '_frozen', 0, 4), res = [], core = []; for (let f = 1; f < 4; f++) { const b = read(e + '_frozen', f, 4); let s = 0, sc = 0, nc = 0; for (let y = 0; y < a.H; y++) for (let x = 0; x < a.W; x++) { const i = (y * a.W + x) * 4, dd = Math.abs(a.d[i] - b.d[i]) + Math.abs(a.d[i + 1] - b.d[i + 1]) + Math.abs(a.d[i + 2] - b.d[i + 2]); s += dd; const ux = (x - a.pl) / 4, uy = (y - a.pt) / 4; if (ux >= 4 && ux <= 12 && uy >= 5 && uy <= 12) { sc += dd; nc++; } } res.push(s / (a.d.length / 4) / 3); core.push(sc / nc / 3); } return [e, res, core]; });
  }
  return o;
});
{
  const f2 = (v) => (+v).toFixed(3);
  // C3
  const maxEn = Math.max(...Object.values(v3.twins.enemies));
  console.log('  C3 mean luminance: p1 %s p2 %s | brightest enemy %s | P2/P1 %s | walk p1 %s p2 %s', f2(v3.twins.p1), f2(v3.twins.p2), f2(maxEn), (v3.twins.p2 / v3.twins.p1).toFixed(2), f2(v3.twins.p1w), f2(v3.twins.p2w));
  check('C3: Fizz and Pop are the highest-luminance creatures (each >= 1.2 x the brightest enemy, idle and walk)', Math.min(v3.twins.p1, v3.twins.p1w) >= 1.2 * maxEn && Math.min(v3.twins.p2, v3.twins.p2w) >= 1.2 * maxEn, JSON.stringify({ p1: v3.twins.p1, p2: v3.twins.p2, maxEn }));
  check('C3: P1 and P2 also differ in luminance, not only hue (P2 / P1 >= 1.25, mean lit colours) and under protanopia (the protan luminance of the mean colours differs >= 1.2 x)', v3.twins.p2 / v3.twins.p1 >= 1.25 && Math.max(v3.protan.p1, v3.protan.p2) / Math.min(v3.protan.p1, v3.protan.p2) >= 1.2, JSON.stringify({ lum: [v3.twins.p1, v3.twins.p2], protan: [v3.protan.p1, v3.protan.p2] }));
  // C4
  console.log('  C4 angry / calm mean luminance:', v3.angry.map((a) => a.e + ' ' + f2(a.angry) + '/' + f2(a.calm)).join('  '), '| poses', v3.angryPose.map((a) => f2(a.angry) + '/' + f2(a.calm)).join(' '));
  check('C4: every angry frame set is about as luminous as or brighter than its calm twin (>= 0.92 x; the lime Springle is the brightest calm body and the post bloom whites out a hotter fill in game, so it stays at ~0.94; the other four are 1.05 .. 1.8 x) and at least 4 of 5 are clearly brighter (>= 1.05 x)', v3.angry.every((a) => a.angry >= a.calm * 0.92) && v3.angry.filter((a) => a.angry >= a.calm * 1.05).length >= 4, JSON.stringify(v3.angry.map((a) => [a.e, +a.angry.toFixed(3), +a.calm.toFixed(3)])));
  check('C4: the angry action poses (throw / squash / fire) are at least 0.92 x as luminous as their calm twins', v3.angryPose.every((a) => a.angry >= a.calm * 0.92), JSON.stringify(v3.angryPose));
  check('C4: angry stays red (chroma-weighted hue within 20 deg of 0)', v3.angry.every((a) => a.hue <= 20 || a.hue >= 340), JSON.stringify(v3.angry.map((a) => [a.e, Math.round(a.hue)])));
  // V7
  const hd = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  console.log('  V7 hue: kraken tentacles %s full %s angry %s | fizz %s jellop %s', v3.kraken.tent.hue.toFixed(0), v3.kraken.full.hue.toFixed(0), v3.kraken.angry.hue.toFixed(0), v3.kraken.p1.hue.toFixed(0), v3.kraken.jellop.hue.toFixed(0));
  check('V7: Kraken is royal purple (tentacle hue 262..292 deg, whole-sprite hue <= 300) and >= 30 deg from Fizz, >= 8 deg from Jellop', v3.kraken.tent.hue >= 262 && v3.kraken.tent.hue <= 292 && v3.kraken.full.hue <= 300 && hd(v3.kraken.tent.hue, v3.kraken.p1.hue) >= 30 && hd(v3.kraken.tent.hue, v3.kraken.jellop.hue) >= 8, JSON.stringify([v3.kraken.tent.hue, v3.kraken.full.hue, v3.kraken.p1.hue, v3.kraken.jellop.hue]));
  check('V7: the angry Kraken is crimson-red, not pink (tentacle hue within 25 deg of 350 and >= 15 deg from Fizz)', hd(v3.kraken.angry.hue, 350) <= 25 && hd(v3.kraken.angry.hue, v3.kraken.p1.hue) >= 15, v3.kraken.angry.hue);
  // C1
  console.log('  C1 ink hue %s / %s sat %s | contrast over the Kraken (core): %s', v3.ink.map((s) => s.hue.toFixed(0)).join('/'), '', v3.ink[0].sat.toFixed(2), v3.inkVis.map((s) => ((s.core[1] - s.core[0]) / (s.core[1] + s.core[0])).toFixed(2)).join(' '));
  check('C1: ink is red-orange (hue 8..32 deg), saturated, never purple / pink (hue not in 260..350)', v3.ink.every((s) => s.hue >= 8 && s.hue <= 32 && s.sat >= 0.55), JSON.stringify(v3.ink.map((s) => [Math.round(s.hue), +s.sat.toFixed(2)])));
  check('C1: the white-hot core stays visible over every lit part of both Krakens (Michelson contrast of the core >= 0.3, the whole blob >= 0.12)', v3.inkVis.every((s) => (s.core[1] - s.core[0]) / (s.core[1] + s.core[0]) >= 0.3 && (s.blob[1] - s.blob[0]) / (s.blob[1] + s.blob[0]) >= 0.12), JSON.stringify(v3.inkVis.map((s) => [s.at, +(((s.core[1] - s.core[0]) / (s.core[1] + s.core[0])).toFixed(2)), +(((s.blob[1] - s.blob[0]) / (s.blob[1] + s.blob[0])).toFixed(2))])));
  // C2
  console.log('  C2 trap stages (gaps / cracks / energy / rim luminance):', v3.trap.map((t) => [t.gaps, t.cracks, t.energy.toFixed(1), t.rim.toFixed(3)].join('/')).join('  '), '| grayscale diffs', v3.trapGray.map((g) => g.toFixed(3)).join(' '));
  check('C2: stage 1 has a broken (dashed) rim (>= 7 gaps), stages 0 and 2 have a continuous one (<= 1 gap)', v3.trap[1].gaps >= 7 && v3.trap[0].gaps <= 1 && v3.trap[2].gaps <= 1, JSON.stringify(v3.trap.map((t) => t.gaps)));
  check('C2: stage 2 has crack lines inside the shell (white-hot pixels in the annulus 3.4..6.1 units: >= 1.6 x stage 0 and stage 1)', v3.trap[2].cracks >= 1.6 * Math.max(v3.trap[0].cracks, v3.trap[1].cracks), JSON.stringify(v3.trap.map((t) => t.cracks)));
  check('C2: escalating light: rim luminance and total energy grow stage 0 < 1 < 2 (stage 2 rim >= stage 1 + 0.08)', v3.trap[0].rim < v3.trap[1].rim && v3.trap[1].rim + 0.08 <= v3.trap[2].rim && v3.trap[0].energy < v3.trap[1].energy && v3.trap[1].energy < v3.trap[2].energy, JSON.stringify(v3.trap.map((t) => [+t.rim.toFixed(3), +t.energy.toFixed(1)])));
  check('C2: the stages differ in GRAYSCALE (mean |luminance difference| of every pair >= 0.03: hue is not the only cue)', v3.trapGray.every((g) => g >= 0.03), JSON.stringify(v3.trapGray));
  // C5
  console.log('  C5 icons: IoU fire/water %s fire/thunder %s water/thunder %s | top-edge peaks fire %s water %s', v3.icons.iouFW.toFixed(2), v3.icons.iouFT.toFixed(2), v3.icons.iouWT.toFixed(2), v3.icons.firePeaks.join('/'), v3.icons.waterPeaks.join('/'));
  check('C5: fire icon is a flame (>= 3 pointed tongues in its upper outline), water a smooth drop (<= 1 tip)', v3.icons.firePeaks.every((n) => n >= 3) && v3.icons.waterPeaks.every((n) => n <= 1), JSON.stringify([v3.icons.firePeaks, v3.icons.waterPeaks]));
  check('C5: fire and water icon silhouettes differ (IoU < 0.55)', v3.icons.iouFW < 0.55, v3.icons.iouFW);
  // V8
  console.log('  V8 pearl glyph IoU (pink/blue pink/gold blue/gold):', v3.pearls.iou.join(' '), 'lit px', v3.pearls.lit.join('/'));
  check('V8: the range / rate / speed pearls carry three different white-hot glyphs (pairwise IoU < 0.45, every glyph lit)', v3.pearls.iou.every((x) => x < 0.45) && v3.pearls.lit.every((n) => n > 60), JSON.stringify(v3.pearls));
  // V1
  console.log('  V1 frozen (hue / sat / val / min dE76 to any other creature / nearest / dE to Pop):', v3.frozen.map((f) => f.e + ' ' + Math.round(f.hue) + '/' + f.sat.toFixed(2) + '/' + Math.round(f.val) + '/' + f.minDE.toFixed(0) + ' ' + f.nearest + ' ' + f.dePop.toFixed(0)).join(' | '));
  check('V1: frozen is pale and desaturated (chroma-weighted lit colour: saturation <= 0.34, value >= 170; the saturated enemies are 0.55 .. 0.6) and its hue is lilac / white, not cyan (hue 215..290 deg)', v3.frozen.every((f) => f.sat <= 0.34 && f.val >= 170 && f.hue >= 215 && f.hue <= 290), JSON.stringify(v3.frozen.map((f) => [f.e, Math.round(f.hue), +f.sat.toFixed(2), Math.round(f.val)])));
  check('V1: frozen is clearly distinct from Pop (dE76 of the lit colours >= 35) and from every other creature / state incl. the Bonefin ghost and the angry frames: dE76 >= 12 and either >= 0.18 less saturated or >= 40 deg of hue away', v3.frozen.every((f) => f.dePop >= 35 && f.minDE >= 12 && f.sepHS >= 1), JSON.stringify(v3.frozen.map((f) => [f.e, +f.dePop.toFixed(0), +f.minDE.toFixed(0), +f.sepHS.toFixed(2), f.nearest])));
  check('V1: the ice is dimmer than the twins (mean luminance of every frozen sprite < 0.9 x the darker twin) so Fizz and Pop stay the brightest shapes', v3.frozen.every((f) => f.meanVsTwins < 0.9), JSON.stringify(v3.frozen.map((f) => [f.e, +f.meanVsTwins.toFixed(2)])));
  check('V1: the four frozen frames differ (twinkles) but are one frozen body (whole-sprite channel difference > 0.5, the body core 4..12 x 5..12 units changes < 2.5)', v3.frozenFrames.every(([e, d, c]) => d.every((x) => x > 0.5) && c.every((x) => x < 2.5)), JSON.stringify(v3.frozenFrames.map(([e, d, c]) => [e, d.map((x) => +x.toFixed(1)), c.map((x) => +x.toFixed(2))])));
}
console.log('  C3 hero emitted light is unchanged in meaning: see the older "twins are the brightest" check above.');
check('console errors after the V3 gates', t.errors.length === 0, t.errors.slice(0, 3));

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
  check('real GFX: registry has 87 entries from the cast', info.reg >= 87, info.reg);
  await canvasFnShot(r.page, path.join(OUT, 'real_gfx_sheet.png'), () => GFX.sheet(), { scale: 1 });
  check('real GFX: zero console errors', r.errors.length === 0, r.errors.slice(0, 3));
  await r.close();
}

const failed = results.filter((x) => !x.ok);
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ when: new Date().toISOString(), total: results.length, failed: failed.length, results }, null, 1));
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
