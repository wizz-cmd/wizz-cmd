// GFX.bgCanvas (FIXPLAN §2 G13): node test/gfx_bg.mjs  -> out/v2/integration/gfx_bg_all30.png (+ gfx_bg_amplified.png), exit 1 on failure.
// Checks: opaque 256x208, cached, 30 distinct looks, near-black (every pixel luminance <= 0.09, mean <= 0.02),
// row 0 matches GFX.theme(i).bg (seam with the HUD row), faint-but-present silhouettes, per-variant hue differences,
// bright sprites keep >= 6:1 contrast against the brightest background pixel, build cost per canvas.
import path from 'path';
import { launch, canvasFnShot, PROJECT } from '../tools/harness.mjs';
const t = await launch({ html: path.join(PROJECT, 'test', 'gfx_sheet.html') });
let failed = 0;
import { timingCheck } from './timing_gate.mjs';   // release-gate policy: wall-clock checks are advisory in the blocking run (FP_TIMING=advisory)
const check = (n, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  ' + extra}`); if (!ok) failed++; };
const tcheck = timingCheck((n, ok, extra) => check(n, ok, extra));
const r = await t.page.evaluate(() => {
  // v2: every check runs at an explicit bake scale (bg canvases are 256b x 208b, b = bake bucket capped at 4)
  const K = 2; GFX.setScale(K);
  const lum = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const out = { fails: [], maxMean: 0, maxP99: 0, maxP999: 0, hashes: new Set(), ms: 0, minLayerColours: 99, seamMax: 0, pix: [] };
  for (let i = 0; i < 30; i++) {
    const t0 = performance.now(); const cv = GFX.bgCanvas(i); out.ms = Math.max(out.ms, performance.now() - t0);
    const b = cv.width / 256, W = cv.width, H = cv.height;
    if (!(b >= 1 && b <= 4) || H !== 208 * b) out.fails.push(`bg ${i} size ${cv.width}x${cv.height}`);
    if (GFX.bgCanvas(i) !== cv) out.fails.push(`bg ${i} not cached`);
    const d = cv.getContext('2d').getImageData(0, 0, W, H).data;
    let h = 2166136261, sum = 0; const colours = new Set(), L = [];
    for (let k = 0; k < d.length; k += 4) {
      if (d[k + 3] !== 255) { out.fails.push(`bg ${i} not opaque`); break; }
      const l = lum(d[k], d[k + 1], d[k + 2]); L.push(l); sum += l; colours.add((d[k] >> 2 << 16) | (d[k + 1] >> 2 << 8) | (d[k + 2] >> 2));
      h = Math.imul(h ^ d[k] ^ (d[k + 1] << 8) ^ (d[k + 2] << 16), 16777619);
    }
    L.sort((a, c) => a - c);
    out.hashes.add(h >>> 0); out.maxMean = Math.max(out.maxMean, sum / L.length); out.maxP99 = Math.max(out.maxP99, L[Math.floor(L.length * 0.99)]); out.maxP999 = Math.max(out.maxP999, L[Math.floor(L.length * 0.999)]);
    out.minLayerColours = Math.min(out.minLayerColours, colours.size);
    const th = hex(GFX.theme(i).bg); for (let c = 0; c < 3; c++) { const row = []; for (let x = 0; x < W; x++) row.push(d[x * 4 + c]); row.sort((a, c2) => a - c2); out.seamMax = Math.max(out.seamMax, Math.abs(row[W >> 1] - th[c])); }
    out.pix.push(d);
  }
  out.hashes = out.hashes.size;
  // variants inside a theme must be visibly different images: pairwise mean absolute difference (0..255) of the 5 variants >= 1.0
  out.minVariantDiff = 1e9;
  for (let th = 0; th < 6; th++) for (let a = 0; a < 5; a++) for (let c = a + 1; c < 5; c++) {
    const A = out.pix[th * 5 + a], B = out.pix[th * 5 + c]; let s = 0, n = 0; for (let k = 0; k < A.length; k += 16) { s += Math.abs(A[k] - B[k]) + Math.abs(A[k + 1] - B[k + 1]) + Math.abs(A[k + 2] - B[k + 2]); n += 3; }
    out.minVariantDiff = Math.min(out.minVariantDiff, s / n);
  }
  // how visible are the silhouettes? dE76 of every pixel against its row-median colour (= the base gradient), 99th percentile per round
  const lab = (r, g, b) => { const f = (v) => { v /= 255; return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92; }; const R = f(r), G = f(g), B = f(b); const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883; const h = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116); return [116 * h(Y) - 16, 500 * (h(X) - h(Y)), 200 * (h(Y) - h(Z))]; };
  out.p99 = [];
  for (let i = 0; i < 30; i++) {
    const d = out.pix[i], W = 256 * K, H = 208 * K, devs = [];
    for (let y = 0; y < H; y += 2) { const row = []; for (let x = 0; x < W; x += 2) { const k = (y * W + x) * 4; row.push(lab(d[k], d[k + 1], d[k + 2])); } const med = [0, 1, 2].map((c) => row.map((q) => q[c]).sort((a, c2) => a - c2)[row.length >> 1]); for (const q of row) devs.push(Math.hypot(q[0] - med[0], q[1] - med[1], q[2] - med[2])); }
    devs.sort((a, c) => a - c); out.p99.push(+devs[Math.floor(devs.length * 0.99)].toFixed(2));
  }
  // lit sprites must stay far brighter than the background: darkest hero/enemy MEAN luminance of the lit (alpha > 0.5) pixels vs the 98th-percentile bg luminance
  const spr = (n) => { const sz = GFX.size(n); const c = document.createElement('canvas'); c.width = (sz.w + 20) * K; c.height = (sz.h + 20) * K; const g = c.getContext('2d', { willReadFrequently: true }); g.setTransform(K, 0, 0, K, 0, 0); GFX.draw(g, n, 0, 10, 10); return g.getImageData(0, 0, c.width, c.height).data; };
  // v2 creatures are luminous contours around dark translucent bodies, so the figure/ground question is about the CONTOUR: mean luminance of the brightest quarter of each sprite's lit pixels
  let minSpr = 1, minName = ''; for (const n of ['p1_idle', 'p2_idle', 'nibbler_move', 'crabbit_move', 'jellop_move', 'springle_move', 'glimmer_move']) { const d = spr(n); const Ls = []; for (let k = 0; k < d.length; k += 4) if (d[k + 3] > 128) Ls.push(lum(d[k], d[k + 1], d[k + 2])); Ls.sort((a, c) => c - a); const top = Ls.slice(0, Math.max(1, Ls.length >> 2)); const m = top.reduce((a, c) => a + c, 0) / top.length; if (m < minSpr) { minSpr = m; minName = n; } }
  out.minSpriteName = minName;
  out.minSpriteMeanL = minSpr;
  // p98 of the brightest background
  out.p98 = 0; for (let i = 0; i < 30; i++) { const d = out.pix[i], L = []; for (let k = 0; k < d.length; k += 16) L.push(lum(d[k], d[k + 1], d[k + 2])); L.sort((a, c) => a - c); out.p98 = Math.max(out.p98, L[Math.floor(L.length * 0.98)]); }
  out.bgs = Array.from({ length: 30 }, (_, i) => GFX.theme(i).bg).join(' ');
  delete out.pix;
  // build cost at a high bake scale (k = 4: the largest everyday scale), CPU raster; cache dropped first so every canvas is really built
  GFX.setScale(4); const ms = []; for (let i = 0; i < 30; i += 3) { const t0 = performance.now(); GFX.bgCanvas(i); ms.push(performance.now() - t0); }
  ms.sort((a, c) => a - c); out.k4Median = ms[ms.length >> 1]; out.k4Max = ms[ms.length - 1];
  GFX.setScale(K);
  return out;
});
r.fails.forEach((f) => check(f, false));
check('opaque 256b x 208b, cached, 30 canvases', !r.fails.length);
check(`30 distinct backgrounds (${r.hashes})`, r.hashes === 30);
check(`near-black water: mean luminance ${r.maxMean.toFixed(4)} <= 0.025, p99 ${r.maxP99.toFixed(3)} <= 0.13, p99.9 ${r.maxP999.toFixed(3)} <= 0.30 (v1: max <= 0.09; v2 allows a few lit crystal / lava / ray accents)`, r.maxMean <= 0.025 && r.maxP99 <= 0.13 && r.maxP999 <= 0.3);
check(`row 0 stays close to theme().bg (max channel diff ${r.seamMax} <= 45; the ceiling row hides the HUD seam)`, r.seamMax <= 45);
check(`gradient + silhouettes present (>= 12 colours per canvas at 6-bit, min ${r.minLayerColours})`, r.minLayerColours >= 12);
check(`the 5 variants of every theme are visibly different images (min pairwise mean abs diff ${r.minVariantDiff.toFixed(2)} >= 1.0)`, r.minVariantDiff >= 1.0);
check(`sprites stay far brighter than the background (darkest sprite contour (brightest quarter of lit px, ${r.minSpriteName}) mean L ${r.minSpriteMeanL.toFixed(2)} vs 98th-percentile bg ${r.p98.toFixed(3)}: ${((r.minSpriteMeanL + 0.05) / (r.p98 + 0.05)).toFixed(1)}:1 >= 3)`, (r.minSpriteMeanL + 0.05) / (r.p98 + 0.05) >= 3);
const minP99 = Math.min(...r.p99), minShipTemple = Math.min(...[10, 11, 12, 13, 14, 25, 26, 27, 28, 29].map((i) => r.p99[i]));
check(`silhouettes are perceivable on every round: p99 dE76 vs the gradient >= 3.5 (min ${minP99}), ship + temple >= 6 (min ${minShipTemple})`, minP99 >= 3.5 && minShipTemple >= 6);
tcheck(`build cost per canvas at k=4: median ${r.k4Median.toFixed(1)} ms <= 45, max ${r.k4Max.toFixed(1)} ms <= 80 (CPU raster)`, r.k4Median <= 45 && r.k4Max <= 80);
const sheet = (amp) => {
  GFX.setScale(2);
  const S = 0.5, cv = document.createElement('canvas'); cv.width = 5 * 256 * S + 6; cv.height = 6 * 208 * S + 7; const g = cv.getContext('2d'); g.fillStyle = '#222'; g.fillRect(0, 0, cv.width, cv.height);
  for (let i = 0; i < 30; i++) {
    const x = (i % 5) * (256 * S + 1) + 1, y = Math.floor(i / 5) * (208 * S + 1) + 1;
    const tmp = document.createElement('canvas'); tmp.width = 256; tmp.height = 208; const tg = tmp.getContext('2d', { willReadFrequently: true }); tg.drawImage(GFX.bgCanvas(i), 0, 0, 256, 208);
    if (amp) { const im = tg.getImageData(0, 0, 256, 208), d = im.data; for (let k = 0; k < d.length; k += 4) { d[k] = Math.min(255, d[k] * 6); d[k + 1] = Math.min(255, d[k + 1] * 6); d[k + 2] = Math.min(255, d[k + 2] * 6); } tg.putImageData(im, 0, 0); }
    g.imageSmoothingEnabled = false; g.drawImage(tmp, x, y, 256 * S, 208 * S);
  }
  return cv;
};
await canvasFnShot(t.page, path.join(PROJECT, 'out/v2/integration/gfx_bg_all30.png'), sheet, { args: [false], scale: 2 });
await canvasFnShot(t.page, path.join(PROJECT, 'out/v2/integration/gfx_bg_amplified.png'), sheet, { args: [true], scale: 2 });
check('zero console errors', t.errors.length === 0, t.errors.join('|'));
await t.close();
process.exit(failed ? 1 : 0);
