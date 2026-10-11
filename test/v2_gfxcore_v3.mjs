// FIZZ & POP v3 - GFX core wave-3 gates (role "gfxcore"):  node test/v2_gfxcore_v3.mjs [outDir]
//  X1/X6  exact-k bakes: light energy of the sprites is flat above k ~ 2.25 (look identical at every scale), small steps below
//  X3     particles are drawn 1:1 in device pixels (a shift by whole device pixels is a pure pixel shift) and cost no more than plain blits
//  X4     no getImageData / read-back anywhere in 10_gfx.js (glow split with canvas operations only), pipelines pre-exercised during warm-up
//  X7     no hard cut of lit art at the bake pad edge at k = 1 .. 1.5 (water streams are meant to fill their box)
//  X8     O / 0, D / 0, B / 8 are different letterforms at k <= 1.5
//  L1     no player hue (Fizz 328 deg, Pop 186 deg) on any of the 30 platform looks; round 1 is azure with rose accents
//  V9     GFX.sheet(): no label overlaps the next cell
//  V11    GFX.drawHero / GFX.drawBig: placement, flip, alpha, frames, scale, cache bound, exact-k, errors
//  PNGs in out/v3/gfxcore/
import fs from 'fs';
import path from 'path';
import { launch, canvasFnShot, PROJECT } from '../tools/harness.mjs';

const OUT = process.argv.slice(2).find((a) => !a.startsWith('--')) || path.join(PROJECT, 'out', 'v3', 'gfxcore');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
import { timingCheck } from './timing_gate.mjs';   // release-gate policy: wall-clock checks are advisory in the blocking run (FP_TIMING=advisory)
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) }); if (!ok) console.log('FAIL', name, detail === undefined ? '' : String(detail).slice(0, 600)); };
const tcheck = timingCheck(check, results);
const info = (name, detail) => { results.push({ name, ok: true, info: true, detail: String(detail) }); console.log('INFO', name, detail); };

/* ---------------------------------------------------------------- static: no read-back */
{
  const code = fs.readFileSync(path.join(PROJECT, 'src', '10_gfx.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('X4: no getImageData / readback in 10_gfx.js', !/getImageData|toDataURL|toBlob|convertToBlob|transferToImageBitmap/.test(code));
  check('X1: no bucket table left (bucketOf / BUCKETS)', !/bucketOf|BUCKETS/.test(code));
}

const t = await launch({ html: path.join(PROJECT, 'test', 'v2_gfxcore_page.html') + '?cast=1', viewport: { width: 1200, height: 900 } });
const E = (fn, ...a) => t.page.evaluate(fn, ...a);
await E(() => { GFX._bgOff(true); });

/* ---------------------------------------------------------------- X6 energy */
const en = await E(() => {
  const names = ['p1_idle', 'p2_walk', 'nibbler_move', 'crabbit_angry', 'jellop_move', 'springle_move', 'glimmer_move', 'bonefin', 'food_0', 'pu_gold'];
  const ks = [2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75, 4, 4.25, 4.5, 5, 5.5, 6, 7, 8], low = [1, 1.25, 1.5, 1.75, 2];
  const out = {};
  const energy = (n, k) => {
    GFX.setScale(k);
    const M = 10, W = Math.ceil((16 + 2 * M) * k), cv = document.createElement('canvas'); cv.width = W; cv.height = W;
    const c = cv.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, W, W); c.setTransform(k, 0, 0, k, 0, 0);
    GFX.draw(c, n, 0, M, M);
    const d = c.getImageData(0, 0, W, W).data; let e = 0;
    for (let i = 0; i < d.length; i += 4) e += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    return e / (k * k) / 255;
  };
  for (const n of names) out[n] = { hi: ks.map((k) => energy(n, k)), lo: low.map((k) => energy(n, k)) };
  return { ks, low, out };
});
{
  let worstSpread = 0, worstStep = 0, worstLowStep = 0, worstK1 = 0, worst = '';
  for (const [n, o] of Object.entries(en.out)) {
    const ref = o.hi[en.ks.indexOf(4)];
    for (const v of o.hi) worstSpread = Math.max(worstSpread, Math.abs(v / ref - 1));
    for (let i = 1; i < o.hi.length; i++) worstStep = Math.max(worstStep, Math.abs(o.hi[i] / o.hi[i - 1] - 1));
    const all = o.lo.concat(o.hi.slice(0, 1));
    for (let i = 2; i < all.length; i++) { const s = Math.abs(all[i] / all[i - 1] - 1); if (s > worstLowStep) { worstLowStep = s; worst = n; } }       // 1.25 -> 1.5 -> ... -> 2.25
    worstK1 = Math.max(worstK1, Math.abs(all[1] / all[0] - 1));                                                                                       // the extreme step 1 -> 1.25 (a 256 px wide window)
  }
  check('X6: light energy of the sprites is within +-8 % of k = 4 for every k from 2.25 to 8', worstSpread <= 0.08, (worstSpread * 100).toFixed(1) + ' %');
  check('X6: no step between neighbouring scales (k >= 2.25) changes a sprite by more than 4 %', worstStep <= 0.04, (worstStep * 100).toFixed(1) + ' %');
  check('X6: between k = 1.25 and 2.25 the step per 0.25 stays <= 15 % (0.85 device px minimum stroke), the extreme step 1 -> 1.25 <= 16 %', worstLowStep <= 0.15 && worstK1 <= 0.16, (worstLowStep * 100).toFixed(1) + ' % (' + worst + '), k1 step ' + (worstK1 * 100).toFixed(1) + ' %');
  info('X6 energy (luma sum / logical px^2) p1_idle', 'k1.. ' + en.out.p1_idle.lo.map((v) => v.toFixed(0)).join(' ') + ' | k2.25.. ' + en.out.p1_idle.hi.map((v) => v.toFixed(0)).join(' '));
}

/* ---------------------------------------------------------------- X3 particles */
const parts = await E(() => {
  const o = { bad: [] }, ck = (n, ok, d) => { if (!ok) o.bad.push(n + (d === undefined ? '' : ' ' + d)); };
  for (const k of [2, 3.75, 4.25, 5.25]) {
    GFX._reset(); GFX.setScale(k);
    for (const kind of ['dot', 'ring', 'spark']) {
      const W = Math.ceil(120 * k), H = Math.ceil(60 * k);
      const mk = (x) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.setTransform(k, 0, 0, k, 0, 0); GFX.particle(g, kind, x, 30, 7.3, '#3cf2ff', 0.9); return g.getImageData(0, 0, W, H).data; };
      const shift = 3, a = mk(40.37), b = mk(40.37 + shift / k);                // exactly 3 device px apart
      let diff = 0, sum = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W - shift; x++) { const ia = (y * W + x) * 4, ib = (y * W + x + shift) * 4; for (let q = 0; q < 4; q++) { diff += Math.abs(a[ia + q] - b[ib + q]); sum += a[ia + q]; } }
      ck('k=' + k + ' ' + kind + ': a 3-device-px move is a pure pixel shift (blit is 1:1, not resampled)', diff <= sum * 0.002, (diff / Math.max(1, sum)).toFixed(4));
    }
    const st = GFX._stats();
    ck('k=' + k + ': particle cache count / pixels bounded', st.particles <= 480 && st.particlePx <= st.maxPx * 0.3 + 1, JSON.stringify([st.particles, st.particlePx]));
  }
  // drawn size is within 5 % of the requested size
  GFX._reset(); GFX.setScale(4);
  const sizes = [];
  for (const sz of [1.5, 2, 3.3, 5, 8.7, 13, 21]) {
    const c = document.createElement('canvas'); c.width = 400; c.height = 400; const g = c.getContext('2d'); g.setTransform(4, 0, 0, 4, 0, 0); GFX.particle(g, 'dot', 50, 50, sz, '#ffffff', 1);
    const d = g.getImageData(0, 0, 400, 400).data; let minX = 1e9, maxX = -1; for (let y = 0; y < 400; y++) for (let x = 0; x < 400; x++) if (d[(y * 400 + x) * 4 + 3] > 2) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
    sizes.push([sz, maxX - minX + 1]);
  }
  o.sizes = sizes;
  // the radius of a ring is the requested radius (small = baked sprite, big = live strokes): the brightest pixel on a row through the centre
  GFX._reset(); GFX.setScale(4);
  o.rings = [];
  for (const r of [3, 9, 25, 41, 60]) {
    const S = Math.ceil((r * 2 + 12) * 4), c = document.createElement('canvas'); c.width = S; c.height = S; const g = c.getContext('2d'); g.setTransform(4, 0, 0, 4, 0, 0);
    GFX.particle(g, 'ring', S / 8, S / 8, r, '#ffffff', 1);
    const d = g.getImageData(0, Math.round(S / 2), S, 1).data;     let best = -1, bx = 0, n = 0, sx = 0;
    for (let x = Math.round(S / 2) + 4; x < S; x++) { const l = d[x * 4] + d[x * 4 + 1] + d[x * 4 + 2]; if (l > best) best = l; }
    for (let x = Math.round(S / 2) + 4; x < S; x++) { const l = d[x * 4] + d[x * 4 + 1] + d[x * 4 + 2]; if (l >= best * 0.8) { n++; sx += x; } }      // centre of the bright band
    bx = sx / Math.max(1, n);
    o.rings.push([r, +((bx - S / 2) / 4).toFixed(2)]);
    ck('ring radius ' + r + ' is drawn at about r (within 6 % + 0.6 logical px)', Math.abs((bx - S / 2) / 4 - r) <= r * 0.06 + 0.6, (bx - S / 2) / 4);
  }
  // chain-like frame: 300 mixed particles, call + flushed cost
  GFX._reset(); GFX.setScale(4);
  const c = document.createElement('canvas'); c.width = 1024; c.height = 896; const g = c.getContext('2d'); g.setTransform(4, 0, 0, 4, 0, 0);
  const frame = (f) => { for (let i = 0; i < 300; i++) GFX.particle(g, i % 5 === 0 ? 'ring' : i % 5 === 1 ? 'spark' : 'dot', 10 + (i * 37 + f) % 230, 20 + (i * 53) % 190, 1.2 + (i % 7) * 0.9, i % 3 ? '#ff3ea5' : '#3cf2ff', 0.7); };
  frame(0); g.getImageData(0, 0, 1, 1);
  let best = 1e9; for (let r = 0; r < 5; r++) { g.getImageData(0, 0, 1, 1); const t0 = performance.now(); for (let f = 0; f < 10; f++) frame(f); g.getImageData(0, 0, 1, 1); best = Math.min(best, (performance.now() - t0) / 10); }
  o.chainMs = best;
  return o;
});
check('X3: particles are baked at the device size and blitted 1:1', parts.bad.length === 0, parts.bad.join(' ; '));
info('X3 chain frame', `300 particles ${parts.chainMs.toFixed(2)} ms/frame flushed (k=4, software raster)`);

/* ---------------------------------------------------------------- X4 glow split without read-back + pipelines */
const gl = await E(() => {
  const bad = [], ck = (n, ok, d) => { if (!ok) bad.push(n + (d === undefined ? '' : ' ' + d)); };
  GFX._reset(); GFX.setScale(4);
  const orig = CanvasRenderingContext2D.prototype.getImageData; let calls = 0;
  CanvasRenderingContext2D.prototype.getImageData = function () { calls++; return orig.apply(this, arguments); };
  const mk = () => { const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d'); g.setTransform(4, 0, 0, 4, 0, 0); return [c, g]; };
  const names = ['food_0', 'pu_gold', 'p1_idle', 'nibbler_move', 'bubble'];
  const pix = (c) => c.getContext('2d').getImageData(0, 0, c.width, c.height);   // (measurement only: counted below)
  const before = calls;
  const imgs = [];
  for (const n of names) { const [c, g] = mk(); GFX.draw(g, n, 0, 20, 20, { glow: 0.5 }); imgs.push(c); const [c1, g1] = mk(); GFX.draw(g1, n, 0, 20, 20, { glow: 0.999 }); const [c2, g2] = mk(); GFX.draw(g2, n, 0, 20, 20); imgs.push(c1, c2); }
  ck('X4: GFX.draw with opts.glow performs no getImageData', calls === before, calls - before);
  CanvasRenderingContext2D.prototype.getImageData = orig;
  // glow ~1 (core + halo, additive) equals the plain sprite
  let worst = 0;
  for (let i = 0; i < names.length; i++) { const a = pix(imgs[i * 3 + 1]).data, b = pix(imgs[i * 3 + 2]).data; let d = 0, s = 0; for (let q = 0; q < a.length; q++) { d += Math.abs(a[q] - b[q]); s += b[q]; } worst = Math.max(worst, d / Math.max(1, s)); }
  ck('glow 0.999 == the plain sprite (core + halo split loses nothing)', worst < 0.03, worst.toFixed(4));
  // glow 0 keeps the core, drops the faint halo
  const [c0, g0] = mk(); GFX.draw(g0, 'p1_idle', 0, 20, 20, { glow: 0 }); const [cf, gf] = mk(); GFX.draw(gf, 'p1_idle', 0, 20, 20);
  const sum = (c) => { const d = pix(c).data; let s = 0; for (let q = 0; q < d.length; q += 4) s += d[q] + d[q + 1] + d[q + 2]; return s; };
  ck('glow 0 is dimmer than the full sprite but not empty', sum(c0) < sum(cf) * 0.92 && sum(c0) > sum(cf) * 0.4, [sum(c0), sum(cf)]);
  GFX._reset(); GFX.setScale(3); GFX.init(); GFX._warmNow(3);
  ck('X4: the pipeline pre-exercise ran during warm-up', GFX._stats().pipes === true);
  return { bad };
});
check('X4: halo split by canvas operations only', gl.bad.length === 0, gl.bad.join(' ; '));

/* ---------------------------------------------------------------- X7 pad clipping */
const pad = await E(() => {
  const out = [];
  const regs = GFX._registry().filter((r) => !/^water_/.test(r.name));          // seamless stream tiles fill their box on purpose
  for (const k of [1, 1.25, 1.5]) {
    GFX.setScale(k);
    const xb = (2 - k) * 1.5;
    for (const d of regs) for (let f = 0; f < d.frames; f++) {
      const M = 30, W = Math.ceil((d.w + 2 * M) * k), H = Math.ceil((d.h + 2 * M) * k);
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d'); c.setTransform(k, 0, 0, k, 0, 0);
      GFX.draw(c, d.name, f, M, M);
      const pl = Math.ceil((d.pad.l + xb) * k), pr = Math.ceil((d.pad.r + xb) * k), pt = Math.ceil((d.pad.t + xb) * k), pb = Math.ceil((d.pad.b + xb) * k);
      const cw = Math.ceil(d.w * k) + pl + pr, ch = Math.ceil(d.h * k) + pt + pb, sx = Math.round(M * k) - pl, sy = Math.round(M * k) - pt;
      const id = c.getImageData(0, 0, W, H).data, A = (x, y) => id[(y * W + x) * 4 + 3];
      let m = 0;
      for (let x = sx; x < sx + cw; x++) m = Math.max(m, A(x, sy), A(x, sy + ch - 1));
      for (let y = sy; y < sy + ch; y++) m = Math.max(m, A(sx, y), A(sx + cw - 1, y));
      if (m >= 10) out.push({ k, name: d.name, f, m });
    }
  }
  return out;
});
check('X7: no lit art is cut by the bake pad at k = 1 / 1.25 / 1.5 (outer ring alpha < 10 / 255)', pad.length === 0, JSON.stringify(pad.slice(0, 8)));

/* ---------------------------------------------------------------- X8 font */
const font = await E(() => {
  const pairs = [['O', '0'], ['D', '0'], ['B', '8']], out = {};
  for (const k of [1, 1.25, 1.5, 2, 3]) {
    GFX._reset(); GFX.setScale(k);
    out[k] = pairs.map(([a, b]) => {
      const px = (ch) => { const cv = document.createElement('canvas'); cv.width = Math.ceil(12 * k); cv.height = Math.ceil(12 * k); const c = cv.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, cv.width, cv.height); c.setTransform(k, 0, 0, k, 0, 0); GFX.text(c, ch, 2, 2, '#ffffff', { glow: false, shadow: false }); return c.getImageData(0, 0, cv.width, cv.height).data; };
      const A = px(a), B = px(b); let d = 0, s = 0; for (let i = 0; i < A.length; i += 4) { d += Math.abs(A[i] - B[i]); s += Math.max(A[i], B[i]); }
      return [a + b, +(d / s).toFixed(2)];
    });
  }
  return out;
});
for (const k of ['1', '1.25', '1.5']) for (const [pair, v] of font[k]) check('X8: ' + pair + ' differ at k=' + k + ' (pixel difference >= 0.45; was 0.28-0.45)', v >= 0.45, v);
info('X8 pixel difference (1 = totally different)', JSON.stringify(font));
await canvasFnShot(t.page, path.join(OUT, 'font_small_k.png'), () => {
  const rows = [1, 1.25, 1.5, 2], str = 'O0 8B D0 5S 2Z 1I L1 6G 9Q', cv = document.createElement('canvas'); cv.width = 1000; cv.height = 4 * 60 + 8; const g = cv.getContext('2d'); g.fillStyle = '#05070f'; g.fillRect(0, 0, cv.width, cv.height); g.imageSmoothingEnabled = false;
  rows.forEach((k, i) => { GFX._reset(); GFX.setScale(k); const w = Math.ceil(str.length * 8 * k) + 8, h = Math.ceil(12 * k), c = document.createElement('canvas'); c.width = w; c.height = h; const cg = c.getContext('2d'); cg.fillStyle = '#05070f'; cg.fillRect(0, 0, w, h); cg.setTransform(k, 0, 0, k, 0, 0); GFX.text(cg, str, 2, 2, '#3cf2ff'); const z = Math.floor(Math.min(5, 1000 / w)); g.drawImage(c, 0, 6 + i * 60, w * z, h * z); });
  return cv;
}, { args: [], scale: 1 });

/* ---------------------------------------------------------------- L1 themes */
const th = await E(() => {
  const hsl = (hex) => { const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2; if (!d) return [0, 0, l]; const s = d / (1 - Math.abs(2 * l - 1)); const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h * 60, s, l]; };
  const hx = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
  const rows = [];
  for (let i = 0; i < 30; i++) { const T = GFX.theme(i), D = GFX._themeData(i); rows.push({ i, name: T.name, edge: hsl(T.edge), body: hsl(hx(D.body)), edgeHex: T.edge, accent: T.accent }); }
  return rows;
});
{
  const dist = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
  const bad = [], pop = [];
  for (const r of th) {
    if (r.edge[1] >= 0.3 && dist(r.edge[0], 328) < 35) bad.push(`R${r.i + 1}:edge(${r.edge[0].toFixed(0)}deg)`);
    if (r.body[1] >= 0.3 && dist(r.body[0], 328) < 30) bad.push(`R${r.i + 1}:body(${r.body[0].toFixed(0)}deg)`);      // the body is a faint translucent fill: 30 deg
    if (r.edge[1] >= 0.5 && dist(r.edge[0], 186) < 8) pop.push(`R${r.i + 1}:edge(${r.edge[0].toFixed(0)}deg)`);
  }
  check('L1: no platform edge within 35 deg (body 30 deg) of Fizz magenta (328 deg), in any of the 30 looks', bad.length === 0, bad.join(' '));
  check('L1: no platform edge within 8 deg of Pop cyan (186 deg)', pop.length === 0, pop.join(' '));
  const coral = th.filter((r) => r.name === 'Coral Reef');
  check('L1: Coral Reef (rounds 1-5) is azure / lagoon teal (edge hue 165-215 deg) with rose accents', coral.length === 5 && coral.every((r) => r.edge[0] >= 165 && r.edge[0] <= 215) && coral.every((r) => { const a = parseInt(r.accent.slice(1, 3), 16); return a > 150; }), JSON.stringify(coral.map((r) => [r.edgeHex, r.accent])));
}
await canvasFnShot(t.page, path.join(OUT, 'round1_fizz_pop.png'), () => {
  GFX._reset(); const k = 3; GFX.setScale(k);
  const cv = document.createElement('canvas'); cv.width = 256 * k; cv.height = 224 * k; const g = cv.getContext('2d'); g.setTransform(k, 0, 0, k, 0, 0); g.imageSmoothingEnabled = true; g.fillStyle = '#02040a'; g.fillRect(0, 0, 256, 224);
  const map = window.__maps[0];
  g.drawImage(GFX.bgCanvas(0), 0, 16, 256, 208); g.drawImage(GFX.levelCanvas(0, map), 0, 16, 256, 208);
  const tops = []; for (let r = 1; r < map.length - 1; r++) for (let c = 2; c < 30; c++) if (map[r][c] === '#' && map[r - 1][c] !== '#' && map[r][c - 1] === '#' && map[r][c + 1] === '#') tops.push([c, r]);
  const pick = [tops[2], tops[tops.length >> 1], tops[tops.length - 3]].filter(Boolean);
  pick.forEach(([c, r], i) => { GFX.draw(g, i % 2 ? 'p2_idle' : 'p1_idle', 0, c * 8 - 4, 16 + r * 8 - 16); });
  GFX.postFX(g, 2);
  return cv;
}, { args: [], scale: 1 });

/* ---------------------------------------------------------------- V9 sheet */
const sh = await E(() => { GFX._reset(); GFX.setScale(2); const cv = GFX.sheet(); const lay = GFX._sheetLayout(); return { w: cv.width, h: cv.height, lay }; });
{
  const bad = [];
  const rowsOf = new Map();
  for (const c of sh.lay) { const k = c.y; (rowsOf.get(k) || rowsOf.set(k, []).get(k)).push(c); }
  for (const row of rowsOf.values()) { row.sort((a, b) => a.x - b.x); for (let i = 0; i < row.length; i++) { const c = row[i]; if (c.labelW > c.w) bad.push(c.name + ' label ' + c.labelW + ' > cell ' + c.w); if (i + 1 < row.length && c.x + Math.max(c.labelW, 0) > row[i + 1].x) bad.push(c.name + ' label runs into ' + row[i + 1].name); } }
  check('V9: no sheet label overlaps the next cell (' + sh.lay.length + ' cells)', bad.length === 0 && sh.lay.length >= 80, bad.slice(0, 5).join(' ; '));
}

/* ---------------------------------------------------------------- V11 drawHero / drawBig */
const hero = await E(() => {
  const bad = [], ck = (n, ok, d) => { if (!ok) bad.push(n + (d === undefined ? '' : ' ' + d)); };
  GFX._reset(); const k = 4; GFX.setScale(k);
  ck('drawHero / drawBig exist', typeof GFX.drawHero === 'function' && typeof GFX.drawBig === 'function');
  const mk = () => { const c = document.createElement('canvas'); c.width = 256 * k; c.height = 160 * k; const g = c.getContext('2d'); g.setTransform(k, 0, 0, k, 0, 0); return [c, g]; };
  const bbox = (c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, s = 0; for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const a = d[(y * c.width + x) * 4 + 3]; if (a > 40) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } s += a; } return { x0: x0 / k, x1: x1 / k, y0: y0 / k, y1: y1 / k, s }; };
  const hash = (c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 2166136261 >>> 0; for (let i = 0; i < d.length; i += 7) h = Math.imul(h ^ d[i], 16777619) >>> 0; return h; };
  // placement: (x, y) = bottom centre of the 16 x 16 box; the art stays around it (heroes <= 1.35 x the box height + glow)
  let [c, g] = mk(); GFX.drawHero(g, 'fizz', 100, 120, 1, 0, {}); let b = bbox(c);
  ck('fizz at scale 1 is centred on x and stands on y (bottom within 5 px of y, centre within 8 px of x)', b.x1 > 0 && Math.abs((b.x0 + b.x1) / 2 - 100) < 8 && b.y1 > 120 - 7 && b.y1 < 120 + 6, JSON.stringify(b));
  const [c2, g2] = mk(); GFX.drawHero(g2, 'fizz', 100, 120, 2, 0, {}); const b2 = bbox(c2);
  ck('scale 2 draws about twice as high', (b2.y1 - b2.y0) / (b.y1 - b.y0) > 1.7 && (b2.y1 - b2.y0) / (b.y1 - b.y0) < 2.3, [(b2.y1 - b2.y0), (b.y1 - b.y0)]);
  const [c3, g3] = mk(); GFX.drawHero(g3, 'fizz', 100, 120, 2, 0, { flip: true }); const b3 = bbox(c3);
  ck('flip mirrors about the centre x (same height, mirrored extent)', Math.abs((b3.y1 - b3.y0) - (b2.y1 - b2.y0)) < 1 && Math.abs((b3.x0 + b3.x1) / 2 - (200 - (b2.x0 + b2.x1) / 2)) < 2, [b2, b3]);
  const [c4, g4] = mk(); GFX.drawHero(g4, 'fizz', 100, 120, 2, 0, { alpha: 0.5 }); const b4 = bbox(c4);
  ck('alpha 0.5 halves the light', b4.s < b2.s * 0.62 && b4.s > b2.s * 0.3, [b4.s, b2.s]);
  const [c5, g5] = mk(); g5.globalAlpha = 0.7; g5.globalCompositeOperation = 'multiply'; GFX.drawHero(g5, 'pop', 100, 120, 2, 0, { alpha: 0.4 }); ck('ctx state restored', g5.globalAlpha === 0.7 && g5.globalCompositeOperation === 'multiply');
  // t -> frame (3 per second, 8 frames), explicit frame / frames, poses
  const frameHash = (t, opts) => { const [cc, gg] = mk(); GFX.drawHero(gg, 'pop', 100, 120, 2, t, opts || {}); return hash(cc); };
  ck('t advances the idle frame: t = 0 and t = 0.34 differ, t = 0 and t = 8 / 3 (a full loop) match', frameHash(0) !== frameHash(0.34) && frameHash(0) === frameHash(8 / 3), [frameHash(0), frameHash(0.34), frameHash(8 / 3)]);
  ck('explicit frame / frames override t', frameHash(5, { frame: 2, frames: 8 }) === frameHash(2 / 3 + 0.01) && frameHash(0, { frame: 3, frames: 8 }) !== frameHash(0, { frame: 4, frames: 8 }));
  const poses = ['idle', 'blink', 'walk', 'jump', 'fall', 'puff', 'shoot', 'die', 'stun'], ph = poses.map((p) => frameHash(0, { pose: p }));
  ck('every pose draws and the poses differ', new Set(ph).size >= 7, JSON.stringify(ph));
  // kraken
  const [c6, g6] = mk(); GFX.drawBig('kraken', g6, 128, 150, 1, 0, {}); const b6 = bbox(c6);
  ck('big kraken (48 x 48) stands on y and is about as wide as its box', b6.y1 > 140 && b6.y1 < 156 && (b6.x1 - b6.x0) > 36 && (b6.x1 - b6.x0) < 80, JSON.stringify(b6));
  const [c7, g7] = mk(); GFX.drawBig('kraken_angry', g7, 128, 150, 1, 0, {}); ck('kraken_angry differs from kraken', hash(c6) !== hash(c7));
  // exact k: the drawn canvas is baked at min(k, 5) and blits 1:1 when K <= 5 (shift test)
  const shiftTest = () => { const mk2 = (x) => { const cc = document.createElement('canvas'); cc.width = 240 * k; cc.height = 120 * k; const gg = cc.getContext('2d'); gg.setTransform(k, 0, 0, k, 0, 0); GFX.drawHero(gg, 'fizz', x, 100, 2, 0, {}); return gg.getImageData(0, 0, cc.width, cc.height).data; }; const a = mk2(80.1), bb = mk2(80.1 + 3 / k), W = 240 * k; let d = 0, s = 0; for (let y = 0; y < 120 * k; y++) for (let x = 0; x < W - 3; x++) { const ia = (y * W + x) * 4, ib = (y * W + x + 3) * 4; for (let q = 0; q < 4; q++) { d += Math.abs(a[ia + q] - bb[ib + q]); s += a[ia + q]; } } return d / Math.max(1, s); };
  ck('big hero blit is 1:1 (a whole-device-pixel move is a pure shift)', shiftTest() < 0.003, shiftTest());
  // robustness
  let threw = null; try { GFX.drawHero(g, 'nobody', 1, 1, 1, 0); GFX.drawHero(g, 'fizz', NaN, 5, 0, NaN, { pose: 'zzz', frame: NaN, frames: -3 }); GFX.drawBig('zzz', g, 1, 1, 1, 0); GFX.drawHero(g, 'p1', 50, 50, 3, -7, { pose: 'idle' }); } catch (e) { threw = String(e); }
  ck('odd input never throws', !threw, threw);
  // cache bound
  for (let i = 0; i < 400; i++) GFX.drawHero(g, i % 2 ? 'fizz' : 'pop', 100, 100, 1 + (i % 9) * 0.5, i / 3, { pose: poses[i % poses.length] });
  const st = GFX._stats(); ck('big cache bounded (<= 50 % of the sprite budget)', st.bigPx <= st.maxPx * 0.5 + 1, st.bigPx + ' / ' + st.maxPx);
  // scale step: the previous bake is drawn at once, re-baked inside the slice
  GFX._reset(); GFX.setScale(4); const [c8, g8] = mk(); GFX.drawHero(g8, 'fizz', 100, 120, 2, 0, {}); GFX.setScale(3); const t0 = performance.now(); const [c9, g9] = [document.createElement('canvas'), null]; c9.width = 768; c9.height = 480; const gg9 = c9.getContext('2d'); gg9.setTransform(3, 0, 0, 3, 0, 0); GFX.drawHero(gg9, 'fizz', 100, 120, 2, 0, {}); GFX.drawHero(gg9, 'pop', 150, 120, 2, 0, {});
  const ms = performance.now() - t0;
  return { bad, ms };
});
check('V11: GFX.drawHero / GFX.drawBig', hero.bad.length === 0, hero.bad.join(' ; '));
tcheck('after a scale step at most one big bake per frame slice (2 draws <= 45 ms)', hero.ms < 45, hero.ms);
await canvasFnShot(t.page, path.join(OUT, 'drawhero.png'), () => {
  GFX._reset(); const k = 3; GFX.setScale(k);
  const cv = document.createElement('canvas'); cv.width = 256 * k; cv.height = 150 * k; const g = cv.getContext('2d'); g.setTransform(k, 0, 0, k, 0, 0); g.fillStyle = '#05070f'; g.fillRect(0, 0, 256, 150);
  GFX.drawHero(g, 'fizz', 40, 80, 2, 0, { pose: 'idle' }); GFX.drawHero(g, 'pop', 90, 80, 2, 0, { pose: 'idle', flip: true }); GFX.drawHero(g, 'fizz', 130, 80, 2, 0, { pose: 'shoot' }); GFX.drawHero(g, 'pop', 170, 80, 2, 1, { pose: 'jump' });
  GFX.drawBig('kraken', g, 215, 100, 1, 0, {}); GFX.drawHero(g, 'fizz', 60, 145, 3, 0.7, { pose: 'blink' }); GFX.drawHero(g, 'pop', 130, 145, 1, 0, { pose: 'puff' });
  return cv;
}, { args: [], scale: 1 });

check('zero console errors', t.errors.length === 0, t.errors.join(' | '));
await t.close();
const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(OUT, 'v3_results.json'), JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 1));
console.log(`\ngfxcore v3: ${results.filter((r) => r.ok && !r.info).length} checks passed, ${failed.length} failed, ${results.filter((r) => r.info).length} info lines   (PNGs in ${OUT})`);
process.exit(failed.length ? 1 : 0);
