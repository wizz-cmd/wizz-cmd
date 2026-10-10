// GFX wave-3 art regressions (src based, no build needed): node test/gfx_items.mjs
//  - Springle reads as a seahorse: thin tube snout (<= 8 fill px right of the head, no dark jaw pixels out there), a spiral tail with an enclosed dark hole,
//    the body sinks with the squash (tall, half squashed, squashed) while the spiral tail flattens, angry/trapped/die variants exist.
//  - pu_shoes (Flippers): each fin's fill width only ever widens from the pocket to the blade (no neck dent), blade >= 1.7x the pocket, dark foot opening.
//  - bolt: one hard Z (>= 5 opaque px in every column), frame B is the vertical mirror of frame A, white-hot core present.
//  - Nibbler flank cog: no near-white low-chroma pixel inside the cog area (a pale disc with a dark centre read as a second eye).
import path from 'path';
import { launch, PROJECT } from '../tools/harness.mjs';
const t = await launch({ html: path.join(PROJECT, 'test', 'gfx_sheet.html') });
let failed = 0;
const check = (n, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  ' + extra}`); if (!ok) failed++; };
const r = await t.page.evaluate(() => {
  const OLc = [0x1b, 0x10, 0x33];
  const px = (n, f) => { const sz = GFX.size(n); const c = document.createElement('canvas'); c.width = sz.w; c.height = sz.h; const x = c.getContext('2d', { willReadFrequently: true }); GFX.draw(x, n, f, 0, 0); const d = x.getImageData(0, 0, sz.w, sz.h).data; const g = (X, Y) => { if (X < 0 || Y < 0 || X >= sz.w || Y >= sz.h) return null; const i = (Y * sz.w + X) * 4; return d[i + 3] > 200 ? [d[i], d[i + 1], d[i + 2]] : null; }; return { w: sz.w, h: sz.h, g }; };
  const isOL = (p) => p && p[0] === OLc[0] && p[1] === OLc[1] && p[2] === OLc[2];
  const eq = (p, hex) => p && p[0] === parseInt(hex.slice(1, 3), 16) && p[1] === parseInt(hex.slice(3, 5), 16) && p[2] === parseInt(hex.slice(5, 7), 16);
  const o = {};
  // --- springle
  const sp = px('springle_move', 0); let snout = 0, jaw = 0, hole = 0;
  for (let y = 3; y <= 6; y++) for (let x = 10; x < 16; x++) { const p = sp.g(x, y); if (p && !isOL(p)) { snout++; if (eq(p, '#4a9a2a')) jaw++; } }
  { // holes in the fill: connected cells that are transparent or outline-coloured, never reach the sprite border and lie in the tail rows
    const seen = new Set(), solid = (x, y) => { const p = sp.g(x, y); return p && !isOL(p); };
    for (let y0 = 9; y0 <= 14; y0++) for (let x0 = 0; x0 < 16; x0++) {
      if (solid(x0, y0) || seen.has(y0 * 16 + x0)) continue;
      const q = [[x0, y0]]; seen.add(y0 * 16 + x0); let border = false;
      while (q.length) { const [x, y] = q.pop(); if (x === 0 || y === 0 || x === 15 || y === 15) border = true; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X > 15 || Y > 15 || solid(X, Y) || seen.has(Y * 16 + X)) continue; seen.add(Y * 16 + X); q.push([X, Y]); } }
      if (!border) hole++;
    }
  }
  const topRow = (n, f) => { const q = px(n, f); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const p = q.g(x, y); if (p && !isOL(p)) return y; } return 99; };
  o.sp = { snout, jaw, hole, top: [topRow('springle_move', 0), topRow('springle_move', 2), topRow('springle_squash', 0)], variants: ['springle_angry', 'springle_trapped', 'springle_die', 'springle_squash_angry'].every((n) => GFX.has(n)) };
  // --- flippers: fill widths per row of the left fin (x 0..7), outline excluded
  const sh = px('pu_shoes', 0), widths = [];
  for (let y = 0; y < 16; y++) { let a = 99, b = -1; for (let x = 0; x < 8; x++) { const p = sh.g(x, y); if (p && !isOL(p)) { a = Math.min(a, x); b = Math.max(b, x); } } widths.push(b < 0 ? 0 : b - a + 1); }
  let dip = 0, first = widths.findIndex((v) => v > 0), last = widths.length - 1 - [...widths].reverse().findIndex((v) => v > 0);
  for (let y = first + 1; y <= last; y++) if (widths[y] < widths[y - 1]) dip++;
  let opening = 0; for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (eq(sh.g(x, y), '#0e2c38')) opening++;
  o.fin = { widths, dip, ratio: +(Math.max(...widths) / widths[first]).toFixed(2), opening, rows: last - first + 1 };
  // --- bolt
  const A = px('bolt', 0), B = px('bolt', 1); let thin = 0, mirrorDiff = 0, white = 0, minRun = 99;
  for (let x = 0; x < 16; x++) { let run = 0, best = 0; for (let y = 0; y < 8; y++) { if (A.g(x, y)) { run++; best = Math.max(best, run); } else run = 0; } minRun = Math.min(minRun, best); }
  for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) { if (!!A.g(x, y) !== !!B.g(x, 7 - y)) mirrorDiff++; if (eq(A.g(x, y), '#ffffff')) white++; }
  o.bolt = { minRun, mirrorDiff, white };
  // --- nibbler cog area (x 4..8, y 6..10), all 4 frames: no pale low-chroma pixel
  const lab = (r, g, b) => { const f = (v) => { v /= 255; return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92; }; const R = f(r), G = f(g), B2 = f(b); const X = (R * 0.4124 + G * 0.3576 + B2 * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B2 * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B2 * 0.9505) / 1.08883; const h = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116); return [116 * h(Y) - 16, 500 * (h(X) - h(Y)), 200 * (h(Y) - h(Z))]; };
  let pale = 0, steel = 0;
  for (let f = 0; f < 4; f++) { const q = px('nibbler_move', f); for (let y = 6; y <= 10; y++) for (let x = 4; x <= 8; x++) { const p = q.g(x, y); if (!p) continue; const L = lab(...p); if (L[0] > 80 && Math.hypot(L[1], L[2]) < 20) pale++; if (eq(p, '#5a6cb8') || eq(p, '#7d8cc8')) steel++; } }
  o.cog = { pale, steel };
  return o;
});
console.log(JSON.stringify(r));
check(`Springle: thin tube snout (${r.sp.snout} fill px right of the head <= 8) with no dark jaw pixels (${r.sp.jaw})`, r.sp.snout <= 8 && r.sp.jaw === 0);
check(`Springle: spiral tail with an enclosed dark hole (${r.sp.hole} >= 1)`, r.sp.hole >= 1);
check(`Springle: the body sinks one row on the bounce frames and in the squash pose (top fill rows ${r.sp.top.join(', ')})`, r.sp.top[0] === 0 && r.sp.top[1] === 1 && r.sp.top[2] === 1);
check('Springle: angry / trapped / die / squash_angry variants registered', r.sp.variants);
check(`Flippers: fill width never narrows from pocket to blade (${r.fin.dip} dips; widths ${r.fin.widths.join(',')})`, r.fin.dip === 0);
check(`Flippers: blade >= 1.7x the pocket width (${r.fin.ratio}x), >= 9 rows of blade (${r.fin.rows} rows in all), dark foot opening (${r.fin.opening} px)`, r.fin.ratio >= 1.7 && r.fin.rows >= 12 && r.fin.opening >= 2);
check(`Bolt: one hard Z, every column has a >= 5 px opaque run (min ${r.bolt.minRun})`, r.bolt.minRun >= 5);
check(`Bolt: frame B is the vertical mirror of frame A (${r.bolt.mirrorDiff} differing px), white-hot core (${r.bolt.white} px)`, r.bolt.mirrorDiff === 0 && r.bolt.white >= 10);
check(`Nibbler cog: no pale low-chroma pixel in the cog area (${r.cog.pale}), steel cog pixels present (${r.cog.steel})`, r.cog.pale === 0 && r.cog.steel >= 8);
check('zero console errors / lint clean', t.errors.length === 0 && (await t.page.evaluate(() => T.lint())).length === 0, t.errors.join('|'));
await t.close();
process.exit(failed ? 1 : 0);
