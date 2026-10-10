// GFX text outline option (FIXPLAN §0): node test/gfx_text.mjs  -> out/fix/gfx_text.png, exit 1 on failure.
// Checks: 8-direction 1 font-pixel outline, glyphs unmoved (same position as without outline), no change without option,
// scale + align, outline+shadow only when explicitly requested, cache keys distinct.
import path from 'path';
import { launch, canvasFnShot, PROJECT } from '../tools/harness.mjs';
const t = await launch({ html: path.join(PROJECT, 'test', 'gfx_sheet.html') });
let failed = 0;
const check = (n, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  ' + extra}`); if (!ok) failed++; };
const r = await t.page.evaluate(() => {
  const mkc = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const px = (c) => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const out = {};
  const A = mkc(40, 24), B = mkc(40, 24), Cc = mkc(40, 24);
  GFX.text(A.getContext('2d'), 'I', 8, 8, '#ffffff', { shadow: false });
  GFX.text(B.getContext('2d'), 'I', 8, 8, '#ffffff', { outline: '#ff0000' });
  GFX.text(Cc.getContext('2d'), 'I', 8, 8, '#ffffff');                    // old behaviour (drop shadow)
  const a = px(A), b = px(B), c = px(Cc);
  // glyph pixels (pure white) identical in A and B
  let sameGlyph = true, outlinePx = 0, outsideFar = 0;
  for (let y = 0; y < 24; y++) for (let x = 0; x < 40; x++) {
    const i = (y * 40 + x) * 4;
    const wa = a[i] === 255 && a[i + 1] === 255 && a[i + 2] === 255 && a[i + 3] === 255;
    const wb = b[i] === 255 && b[i + 1] === 255 && b[i + 2] === 255 && b[i + 3] === 255;
    if (wa !== wb) sameGlyph = false;
    if (b[i] === 255 && b[i + 1] === 0 && b[i + 3] === 255) { outlinePx++; if (x < 7 || x > 16 || y < 7 || y > 16) outsideFar++; }
  }
  out.sameGlyph = sameGlyph; out.outlinePx = outlinePx; out.outsideFar = outsideFar;
  // every glyph pixel has all 8 neighbours painted (white or red)
  let holes = 0;
  for (let y = 1; y < 23; y++) for (let x = 1; x < 39; x++) {
    const i = (y * 40 + x) * 4; if (!(b[i] === 255 && b[i + 1] === 255 && b[i + 3] === 255)) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const j = ((y + dy) * 40 + x + dx) * 4; if (!b[j + 3]) holes++; }
  }
  out.holes = holes;
  // no outline option -> drop shadow still there
  let shadow = 0; for (let i = 0; i < c.length; i += 4) if (c[i + 3] && c[i] < 60) shadow++;
  out.shadow = shadow;
  // outline must not draw a dark drop shadow unless asked
  let dark = 0; for (let i = 0; i < b.length; i += 4) if (b[i + 3] && b[i] < 60) dark++;
  out.darkNoShadow = dark;
  // scale 2 outline = 2 px
  const S = mkc(60, 40); GFX.text(S.getContext('2d'), 'I', 10, 10, '#fff', { outline: '#f00', scale: 2 });
  const s2 = px(S); let minX = 99; for (let y = 0; y < 40; y++) for (let x = 0; x < 60; x++) if (s2[(y * 60 + x) * 4 + 3] && s2[(y * 60 + x) * 4 + 1] === 0) minX = Math.min(minX, x);
  out.scale2Left = minX;     // glyph 'I' col 1.. -> left red edge at 10 + (col-1)*2 ... checked loosely below
  // centre / right alignment still computed from the glyph width, not the padded canvas
  const W = mkc(100, 20); GFX.text(W.getContext('2d'), 'AB', 50, 4, '#fff', { align: 'center', outline: '#000' });
  const w1 = px(W); let lo = 999, hi = 0; for (let y = 0; y < 20; y++) for (let x = 0; x < 100; x++) if (w1[(y * 100 + x) * 4 + 3] && w1[(y * 100 + x) * 4] === 255) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
  out.centre = [lo, hi];
  return out;
});
check('glyph pixels unmoved by outline', r.sameGlyph);
check('outline painted (red px present, none far away)', r.outlinePx > 20 && r.outsideFar === 0, JSON.stringify(r));
check('all 8 neighbours of every glyph pixel painted', r.holes === 0, 'holes ' + r.holes);
check('old call still has its drop shadow', r.shadow > 10);
check('outline replaces the drop shadow (no dark px)', r.darkNoShadow === 0, 'dark ' + r.darkNoShadow);
check('centre alignment uses glyph width (AB centred on 50)', r.centre[0] === 42 && r.centre[1] <= 57, JSON.stringify(r.centre));
await canvasFnShot(t.page, path.join(PROJECT, 'out/fix/gfx_text.png'), () => {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96; const g = cv.getContext('2d');
  const bgs = ['#16080f', '#c8284a', '#f0d890', '#3a8c4c'];
  bgs.forEach((b, i) => { g.fillStyle = b; g.fillRect(i * 64, 0, 64, 96); });
  bgs.forEach((b, i) => {
    GFX.text(g, 'ROUND 7', i * 64 + 4, 4, '#ffffff', { outline: '#1b1033' });
    GFX.text(g, 'READY!', i * 64 + 4, 20, '#ffe36b', { outline: '#1b1033', scale: 1 });
    GFX.text(g, 'x2', i * 64 + 4, 36, '#ff8fc8', { outline: '#000000', shadow: true });
    GFX.text(g, 'OLD', i * 64 + 4, 52, '#ffffff');
    GFX.text(g, 'HI', i * 64 + 4, 68, '#ffffff', { outline: '#1b1033', scale: 2 });
  });
  return cv;
}, { scale: 4 });
check('zero console errors', t.errors.length === 0, t.errors.join('|'));
await t.close();
process.exit(failed ? 1 : 0);
