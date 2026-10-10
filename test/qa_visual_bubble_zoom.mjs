// Zoomed bubble-over-tile crops for the worst hue clashes + numeric rim contrast.
import path from 'path';
import { launch, canvasFnShot, fp, PROJECT } from '../tools/harness.mjs';
const OUT = path.join(PROJECT, 'out/qa/visual/tiles');
const t = await launch({ viewport: { width: 1280, height: 800 } });
const g = fp(t.page); await g.freeze(true);
const worst = [0, 7, 9, 12, 15, 17, 27, 19, 3];
await canvasFnShot(t.page, path.join(OUT, 'bubble_zoom_worst.png'), (rows) => {
  const { GFX, LEVELS } = fz;
  const out = document.createElement('canvas'); const cw = 72, ch = 40, S = 5;
  out.width = rows.length * (cw * S + 8); out.height = ch * S + 16;
  const c = out.getContext('2d'); c.imageSmoothingEnabled = false; c.fillStyle = '#000'; c.fillRect(0, 0, out.width, out.height);
  rows.forEach((r, i) => {
    const lv = LEVELS[r], th = GFX.theme(r);
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 208; const cx = cv.getContext('2d');
    cx.fillStyle = th.bg; cx.fillRect(0, 0, 256, 208); cx.drawImage(GFX.levelCanvas(r, lv.map), 0, 0);
    let best = null;
    for (let rr = 4; rr < 22; rr++) { let run = 0; for (let c2 = 2; c2 <= 30; c2++) { const solid = c2 < 30 && lv.map[rr][c2] === '#'; if (solid) run++; else { if (run >= 5 && (!best || run > best.run)) best = { r: rr, c: c2 - run, run }; run = 0; } } }
    const px = best.c * 8, py = best.r * 8;
    GFX.draw(cx, 'bubble', 0, px + 2, py - 6);
    GFX.draw(cx, 'bubble', 1, px + 22, py - 14);
    GFX.draw(cx, 'bubble', 0, px + 42, py - 2);
    const sx = Math.max(16, Math.min(256 - cw, px - 4)), sy = Math.max(0, py - 26);
    c.drawImage(cv, sx, sy, cw, ch, i * (cw * S + 8), 16, cw * S, ch * S);
    c.fillStyle = '#9ab'; c.font = '12px monospace'; c.fillText('R' + (r + 1) + ' ' + th.name, i * (cw * S + 8) + 2, 12);
  });
  return out;
}, { args: [worst], scale: 1 });
// rim colours of the bubble sprite and numeric contrast vs each theme's block colours (sampled from levelCanvas)
const rep = await g.evaluate(() => {
  const { GFX, LEVELS } = fz;
  const lum = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const cr = (a, b) => { const l1 = lum(...a), l2 = lum(...b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const bc = document.createElement('canvas'); bc.width = 16; bc.height = 16; const bx = bc.getContext('2d', { willReadFrequently: true }); GFX.draw(bx, 'bubble', 0, 0, 0);
  const bd = bx.getImageData(0, 0, 16, 16).data;
  // rim pixels: outermost opaque pixels on row 8
  const rim = []; for (let x = 0; x < 16; x++) { const i = (8 * 16 + x) * 4; if (bd[i + 3] > 200) { rim.push([bd[i], bd[i + 1], bd[i + 2]]); } }
  const out = { rimRow8: rim.map((p) => p.join(',')) , per: [] };
  for (let r = 0; r < 30; r++) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 208; const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(GFX.levelCanvas(r, LEVELS[r].map), 0, 0);
    const d = cx.getImageData(0, 0, 256, 208).data;
    // average colour of opaque tile pixels
    let n = 0, R = 0, G = 0, B = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 250) { R += d[i]; G += d[i + 1]; B += d[i + 2]; n++; }
    const avg = [R / n, G / n, B / n].map(Math.round);
    // contrast of outer (first) rim colour and bright cyan highlight rim vs avg tile colour
    out.per.push({ r: r + 1, tileAvg: avg.join(','), outer: +cr(rim[0], avg).toFixed(2), inner: +cr(rim[1] || rim[0], avg).toFixed(2) });
  }
  return out;
});
console.log(JSON.stringify(rep.rimRow8));
for (const p of rep.per) console.log(JSON.stringify(p));
console.log(t.errors);
await t.close();
