// GFX text options (FIXPLAN §0 outline option, SPEC_V2 2 glow/shadow): node test/gfx_text.mjs  -> out/v2/integration/gfx_text.png, exit 1 on failure.
// v2.0 re-base (SPEC_V2 section 7): the pixel-era gate counted exact 1-px outlines of an 8x8 bitmap font. The stroke font is thin, glowing and resolution
// independent, so the SAME intents are measured at an explicit bake scale (k = 3) on lit pixels:
//   outline option paints a ring of the requested colour around the glyph, the glyph core does not move, no outline option -> no ring,
//   the soft dark shadow is on by default and off with shadow:false, scale + align (centre / right) are computed from the glyph advance (8 px * scale per glyph),
//   glow:false removes the halo, repeated calls are stable (cache keys distinct per colour / scale / flags).
import path from 'path';
import { launch, canvasFnShot, PROJECT } from '../tools/harness.mjs';
const t = await launch({ html: path.join(PROJECT, 'test', 'gfx_sheet.html') });
let failed = 0;
const check = (n, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  ' + extra}`); if (!ok) failed++; };
const r = await t.page.evaluate(() => {
  const K = 3; GFX.setScale(K);
  const mkc = (w, h) => { const c = document.createElement('canvas'); c.width = w * K; c.height = h * K; const g = c.getContext('2d', { willReadFrequently: true }); g.setTransform(K, 0, 0, K, 0, 0); return { c, g, w: w * K, h: h * K }; };
  const px = (o) => o.g.getImageData(0, 0, o.w, o.h).data;
  const isCore = (d, i) => d[i + 3] > 200 && d[i] > 225 && d[i + 1] > 225 && d[i + 2] > 225;      // the white-hot core of a white glyph
  const isRed = (d, i) => d[i + 3] > 40 && d[i] > 150 && d[i + 1] < 100 && d[i + 2] < 100;
  const isDark = (d, i) => d[i + 3] > 10 && d[i] < 60 && d[i + 1] < 60 && d[i + 2] < 60;
  const draw = (s, x, y, col, opt) => { const o = mkc(40, 24); GFX.text(o.g, s, x, y, col, opt); return o; };
  const out = {};
  const A = draw('I', 8, 8, '#ffffff', { shadow: false });
  const B = draw('I', 8, 8, '#ffffff', { outline: '#ff0000', shadow: false });
  const Cc = draw('I', 8, 8, '#ffffff');                                                     // defaults: soft shadow on
  const a = px(A), b = px(B), c = px(Cc);
  // glyph core unmoved by the outline
  let coreA = 0, coreB = 0, coreBoth = 0; for (let i = 0; i < a.length; i += 4) { const ca = isCore(a, i), cb = isCore(b, i); if (ca) coreA++; if (cb) coreB++; if (ca && cb) coreBoth++; }
  out.coreA = coreA; out.coreB = coreB; out.coreOverlap = coreBoth / Math.max(1, Math.max(coreA, coreB));
  // outline ring: red pixels present, all within 5 logical px of the glyph core bbox, on all four sides
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
  for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) if (isCore(b, (y * B.w + x) * 4)) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  let red = 0, far = 0, left = 0, right = 0, above = 0, below = 0;
  for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) { const i = (y * B.w + x) * 4; if (!isRed(b, i)) continue; red++;
    if (x < minX - 5 * K || x > maxX + 5 * K || y < minY - 5 * K || y > maxY + 5 * K) far++;
    if (x < minX) left++; if (x > maxX) right++; if (y < minY) above++; if (y > maxY) below++; }
  Object.assign(out, { red, far, sideL: left, sideR: right, sideA: above, sideB: below });
  let redA = 0; for (let i = 0; i < a.length; i += 4) if (isRed(a, i)) redA++; out.redWithoutOption = redA;
  // shadow default on / off
  let darkOff = 0, darkOn = 0; for (let i = 0; i < a.length; i += 4) { if (isDark(a, i)) darkOff++; if (isDark(c, i)) darkOn++; }
  out.darkOff = darkOff; out.darkOn = darkOn;
  // glow:false is smaller / dimmer than the default
  const G0 = draw('I', 8, 8, '#4fc8ff', { shadow: false, glow: false }), G1 = draw('I', 8, 8, '#4fc8ff', { shadow: false });
  const light = (o) => { const d = px(o); let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i + 3]; return s; };
  out.glowOff = light(G0); out.glowOn = light(G1);
  // scale 2: twice the cap height (stroke width constant)
  const S1 = draw('I', 10, 6, '#fff', { shadow: false }), S2 = draw('I', 10, 6, '#fff', { shadow: false, scale: 2 });
  const hgt = (o) => { const d = px(o); let lo = 1e9, hi = -1; for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) if (isCore(d, (y * o.w + x) * 4)) { lo = Math.min(lo, y); hi = Math.max(hi, y); } return (hi - lo + 1) / K; };
  out.h1 = hgt(S1); out.h2 = hgt(S2);
  // alignment: centre / right computed from the 8-px advance
  const bboxX = (o) => { const d = px(o); let lo = 1e9, hi = -1; for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) if (isCore(d, (y * o.w + x) * 4)) { lo = Math.min(lo, x); hi = Math.max(hi, x); } return [lo / K, (hi + 1) / K]; };
  const Wc = mkc(100, 20); GFX.text(Wc.g, 'AB', 50, 4, '#fff', { align: 'center', outline: '#000' });
  const Wr = mkc(100, 20); GFX.text(Wr.g, 'AB', 50, 4, '#fff', { align: 'right', shadow: false });
  const Wl = mkc(100, 20); GFX.text(Wl.g, 'AB', 50, 4, '#fff', { align: 'left', shadow: false });
  out.centre = bboxX(Wc); out.right = bboxX(Wr); out.left = bboxX(Wl);
  out.width = GFX.textWidth('AB'); out.widthRet = GFX.text(mkc(10, 10).g, 'AB', 0, 0, '#fff');
  // stability: the same call twice (cache) yields identical pixels; different colours / scales do not alias each other
  const T1 = draw('ROUND 7', 4, 4, '#ffffff', { outline: '#1b1033' }), T2 = draw('ROUND 7', 4, 4, '#ffffff', { outline: '#1b1033' });
  const T3 = draw('ROUND 7', 4, 4, '#ffffff', { outline: '#ff0000' });
  const same = (p, q) => { const d1 = px(p), d2 = px(q); for (let i = 0; i < d1.length; i++) if (d1[i] !== d2[i]) return false; return true; };
  out.stable = same(T1, T2); out.outlineColourDiffers = !same(T1, T3);
  return out;
});
check('glyph core unmoved by the outline', r.coreA > 20 && r.coreOverlap >= 0.9, JSON.stringify({ coreA: r.coreA, coreB: r.coreB, overlap: r.coreOverlap }));
check('outline painted in the requested colour, close to the glyph', r.red > 40 && r.far === 0, JSON.stringify({ red: r.red, far: r.far }));
check('outline surrounds the glyph on all four sides', r.sideL > 5 && r.sideR > 5 && r.sideA > 5 && r.sideB > 5, JSON.stringify({ l: r.sideL, r: r.sideR, a: r.sideA, b: r.sideB }));
check('no outline option -> no outline colour', r.redWithoutOption === 0, 'red px ' + r.redWithoutOption);
check('default call keeps its soft dark shadow; shadow:false removes it', r.darkOn > r.darkOff + 10, JSON.stringify({ on: r.darkOn, off: r.darkOff }));
check('glow:false paints less light than the default glow', r.glowOn > r.glowOff * 1.15, JSON.stringify({ on: r.glowOn, off: r.glowOff }));
check('scale 2 doubles the cap height', r.h2 >= r.h1 * 1.8 && r.h2 <= r.h1 * 2.2, `h1 ${r.h1} h2 ${r.h2}`);
check('centre alignment uses the 8 px advance (AB centred on 50)', Math.abs((r.centre[0] + r.centre[1]) / 2 - 50) <= 2, JSON.stringify(r.centre));
check('right alignment ends at x = 50', r.right[1] <= 51 && r.right[1] >= 46, JSON.stringify(r.right));
check('left alignment starts at x = 50', r.left[0] >= 49 && r.left[0] <= 54, JSON.stringify(r.left));
check('textWidth == returned width == 8 px per glyph', r.width === 16 && r.widthRet === 16, `${r.width} / ${r.widthRet}`);
check('repeated call is stable (cached) and the outline colour is part of the cache key', r.stable && r.outlineColourDiffers, JSON.stringify({ stable: r.stable, differs: r.outlineColourDiffers }));
await canvasFnShot(t.page, path.join(PROJECT, 'out/v2/integration/gfx_text.png'), () => {
  const K = 3; GFX.setScale(K);
  const cv = document.createElement('canvas'); cv.width = 256 * K; cv.height = 96 * K; const g = cv.getContext('2d'); g.setTransform(K, 0, 0, K, 0, 0);
  const bgs = ['#06101c', '#c8284a', '#f0d890', '#3a8c4c'];
  bgs.forEach((b, i) => { g.fillStyle = b; g.fillRect(i * 64, 0, 64, 96); });
  bgs.forEach((b, i) => {
    GFX.text(g, 'ROUND 7', i * 64 + 4, 4, '#ffffff', { outline: '#1b1033' });
    GFX.text(g, 'READY!', i * 64 + 4, 20, '#ffe36b', { outline: '#1b1033', scale: 1 });
    GFX.text(g, 'x2', i * 64 + 4, 36, '#ff8fc8', { outline: '#000000', shadow: true });
    GFX.text(g, 'OLD', i * 64 + 4, 52, '#ffffff');
    GFX.text(g, 'HI', i * 64 + 4, 68, '#ffffff', { outline: '#1b1033', scale: 2 });
  });
  return cv;
}, { scale: 1 });
check('zero console errors', t.errors.length === 0, t.errors.join('|'));
await t.close();
process.exit(failed ? 1 : 0);
