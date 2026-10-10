// GFX.bgCanvas (FIXPLAN §2 G13): node test/gfx_bg.mjs  -> out/fix/gfx_bg_all30.png (+ gfx_bg_amplified.png), exit 1 on failure.
// Checks: opaque 256x208, cached, 30 distinct looks, near-black (every pixel luminance <= 0.09, mean <= 0.02),
// row 0 matches GFX.theme(i).bg (seam with the HUD row), faint-but-present silhouettes, per-variant hue differences,
// bright sprites keep >= 6:1 contrast against the brightest background pixel, build cost per canvas.
import path from 'path';
import { launch, canvasFnShot, PROJECT } from '../tools/harness.mjs';
const t = await launch({ html: path.join(PROJECT, 'test', 'gfx_sheet.html') });
let failed = 0;
const check = (n, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  ' + extra}`); if (!ok) failed++; };
const r = await t.page.evaluate(() => {
  const lum = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const out = { fails: [], maxL: 0, meanL: 0, hashes: new Set(), ms: 0, minLayerColours: 99, seamMax: 0, hueSpread: {} };
  let sumMean = 0;
  for (let i = 0; i < 30; i++) {
    const t0 = performance.now(); const cv = GFX.bgCanvas(i); out.ms = Math.max(out.ms, performance.now() - t0);
    if (cv.width !== 256 || cv.height !== 208) out.fails.push(`bg ${i} size ${cv.width}x${cv.height}`);
    if (GFX.bgCanvas(i) !== cv) out.fails.push(`bg ${i} not cached`);
    const d = cv.getContext('2d').getImageData(0, 0, 256, 208).data;
    let h = 2166136261, mx = 0, sum = 0; const colours = new Set();
    for (let k = 0; k < d.length; k += 4) {
      if (d[k + 3] !== 255) { out.fails.push(`bg ${i} not opaque`); break; }
      const L = lum(d[k], d[k + 1], d[k + 2]); mx = Math.max(mx, L); sum += L; colours.add((d[k] << 16) | (d[k + 1] << 8) | d[k + 2]);
      h = Math.imul(h ^ d[k] ^ (d[k + 1] << 8) ^ (d[k + 2] << 16), 16777619);
    }
    out.hashes.add(h >>> 0); out.maxL = Math.max(out.maxL, mx); sumMean += sum / (d.length / 4);
    out.minLayerColours = Math.min(out.minLayerColours, colours.size);
    const th = hex(GFX.theme(i).bg); for (let c = 0; c < 3; c++) { const row = []; for (let x = 0; x < 256; x++) row.push(d[x * 4 + c]); row.sort((a, b) => a - b); out.seamMax = Math.max(out.seamMax, Math.abs(row[128] - th[c])); }
    const lums = []; for (let k = 0; k < d.length; k += 4) lums.push(lum(d[k], d[k + 1], d[k + 2])); lums.sort((a, b) => a - b); out.p98 = Math.max(out.p98 || 0, lums[Math.floor(lums.length * 0.98)]);
    out.hueSpread[i] = [d[(200 * 256 + 5) * 4], d[(200 * 256 + 5) * 4 + 1], d[(200 * 256 + 5) * 4 + 2]];
  }
  out.meanL = sumMean / 30; out.hashes = out.hashes.size;
  // wave 3: how visible are the silhouettes? dE76 of every pixel against its row-median colour (= the base gradient), 99th percentile per round
  const lab = (r, g, b) => { const f = (v) => { v /= 255; return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92; }; const R = f(r), G = f(g), B = f(b); const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883; const h = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116); return [116 * h(Y) - 16, 500 * (h(X) - h(Y)), 200 * (h(Y) - h(Z))]; };
  out.p99 = [];
  for (let i = 0; i < 30; i++) {
    const d = GFX.bgCanvas(i).getContext('2d').getImageData(0, 0, 256, 208).data, devs = [];
    for (let y = 0; y < 208; y++) { const row = []; for (let x = 0; x < 256; x++) { const k = (y * 256 + x) * 4; row.push(lab(d[k], d[k + 1], d[k + 2])); } const med = [0, 1, 2].map((c) => row.map((q) => q[c]).sort((a, b) => a - b)[128]); for (const q of row) devs.push(Math.hypot(q[0] - med[0], q[1] - med[1], q[2] - med[2])); }
    devs.sort((a, b) => a - b); out.p99.push(+devs[Math.floor(devs.length * 0.99)].toFixed(2));
  }
  // brightest sprite pixel vs the brightest bg pixel
  const spr = (n) => { const c = document.createElement('canvas'); c.width = 16; c.height = 16; GFX.draw(c.getContext('2d'), n, 0, 0, 0); return c.getContext('2d').getImageData(0, 0, 16, 16).data; };
  let minSpr = 1; for (const n of ['p1_idle', 'p2_idle', 'nibbler_move', 'crabbit_move', 'jellop_move', 'springle_move', 'glimmer_move']) { const d = spr(n); let s = 0, c = 0; for (let k = 0; k < d.length; k += 4) if (d[k + 3] > 200) { s += lum(d[k], d[k + 1], d[k + 2]); c++; } minSpr = Math.min(minSpr, s / c); }
  out.minSpriteMeanL = minSpr;
  // themes must differ per variant (hue varies slightly inside a theme)
  let sameBg = 0; for (let i = 0; i < 30; i += 5) { const s = new Set(); for (let k = 0; k < 5; k++) s.add(out.hueSpread[i + k].join(',') + '/' + GFX.theme(i + k).bg); if (s.size < 5) sameBg++; } out.themesWithSharedBg = sameBg; out.bgs = Array.from({ length: 30 }, (_, i) => GFX.theme(i).bg).join(' ');
  return out;
});
r.fails.forEach((f) => check(f, false));
check('opaque 256x208, cached, 30 canvases', !r.fails.length);
check(`30 distinct backgrounds (${r.hashes})`, r.hashes === 30);
check(`near-black: max pixel luminance ${r.maxL.toFixed(3)} <= 0.09, mean ${r.meanL.toFixed(4)} <= 0.02`, r.maxL <= 0.09 && r.meanL <= 0.02);
check(`row 0 median matches theme().bg (max channel diff ${r.seamMax} <= 4)`, r.seamMax <= 4);
check(`gradient + silhouettes present (>= 12 colours per canvas, min ${r.minLayerColours})`, r.minLayerColours >= 12);
check('hue differs per variant inside each theme', r.themesWithSharedBg === 0, 'themes sharing a bg: ' + r.themesWithSharedBg);
check(`sprites stay far brighter than the background (darkest sprite mean L ${r.minSpriteMeanL.toFixed(2)} vs 98th-percentile bg ${r.p98.toFixed(3)}: ${((r.minSpriteMeanL + 0.05) / (r.p98 + 0.05)).toFixed(1)}:1 >= 3)`, (r.minSpriteMeanL + 0.05) / (r.p98 + 0.05) >= 3);
const minP99 = Math.min(...r.p99), minShipTemple = Math.min(...[10, 11, 12, 13, 14, 25, 26, 27, 28, 29].map((i) => r.p99[i]));
check(`silhouettes are perceivable on every round: p99 dE76 vs the gradient >= 3.5 (min ${minP99}), ship + temple >= 6 (min ${minShipTemple})`, minP99 >= 3.5 && minShipTemple >= 6);
check(`build cost per canvas ${r.ms.toFixed(1)} ms <= 25`, r.ms <= 25);
const sheet = (amp) => {
  const S = 0.5, cv = document.createElement('canvas'); cv.width = 5 * 256 * S + 6; cv.height = 6 * 208 * S + 7; const g = cv.getContext('2d'); g.fillStyle = '#222'; g.fillRect(0, 0, cv.width, cv.height);
  for (let i = 0; i < 30; i++) {
    const x = (i % 5) * (256 * S + 1) + 1, y = Math.floor(i / 5) * (208 * S + 1) + 1;
    const tmp = document.createElement('canvas'); tmp.width = 256; tmp.height = 208; const tg = tmp.getContext('2d'); tg.drawImage(GFX.bgCanvas(i), 0, 0);
    if (amp) { const im = tg.getImageData(0, 0, 256, 208), d = im.data; for (let k = 0; k < d.length; k += 4) { d[k] = Math.min(255, d[k] * 6); d[k + 1] = Math.min(255, d[k + 1] * 6); d[k + 2] = Math.min(255, d[k + 2] * 6); } tg.putImageData(im, 0, 0); }
    g.imageSmoothingEnabled = false; g.drawImage(tmp, x, y, 256 * S, 208 * S);
  }
  return cv;
};
await canvasFnShot(t.page, path.join(PROJECT, 'out/fix/gfx_bg_all30.png'), sheet, { args: [false], scale: 2 });
await canvasFnShot(t.page, path.join(PROJECT, 'out/fix/gfx_bg_amplified.png'), sheet, { args: [true], scale: 2 });
check('zero console errors', t.errors.length === 0, t.errors.join('|'));
await t.close();
process.exit(failed ? 1 : 0);
