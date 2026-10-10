// Bubble visibility over all 30 tile looks: bubble, bubble_warn, bubble_thunder/fire/water/letter, trapped nibbler, over block / straddling / empty.
import path from 'path';
import fs from 'fs';
import { launch, canvasFnShot, fp, PROJECT } from '../tools/harness.mjs';
const OUT = path.join(PROJECT, 'out/qa/visual/tiles');
const t = await launch({ viewport: { width: 1280, height: 800 } });
const g = fp(t.page); await g.freeze(true);
const fn = (rows) => {
  const { GFX, LEVELS } = fz;
  const lum = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const cellW = 96, cellH = 48, scale = 3;
  const cols = 5, nR = rows.length;
  const out = document.createElement('canvas');
  const perRow = 6; // tiles per output row
  out.width = perRow * (cellW * scale / 1 + 6) / 1; out.height = Math.ceil(nR / perRow) * (cellH * scale + 18);
  out.width = perRow * (cellW * 2 + 6); out.height = Math.ceil(nR / perRow) * (cellH * 2 + 16);
  const c = out.getContext('2d'); c.imageSmoothingEnabled = false; c.fillStyle = '#000'; c.fillRect(0, 0, out.width, out.height);
  const stats = [];
  rows.forEach((r, idx) => {
    const lv = LEVELS[r], th = GFX.theme(r);
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 208; const cx = cv.getContext('2d');
    cx.fillStyle = th.bg; cx.fillRect(0, 0, 256, 208); cx.drawImage(GFX.levelCanvas(r, lv.map), 0, 0);
    // find longest interior platform run (rows 3..22) with empty above
    let best = null;
    for (let rr = 4; rr < 22; rr++) { let run = 0; for (let c2 = 2; c2 <= 30; c2++) { const solid = c2 < 30 && lv.map[rr][c2] === '#'; if (solid) run++; else { if (run >= 5 && (!best || run > best.run)) best = { r: rr, c: c2 - run, run }; run = 0; } } }
    if (!best) best = { r: 10, c: 8, run: 5 };
    const px = best.c * 8, py = best.r * 8;
    // 3 bubbles: centred on block (y = py - 4 => overlaps block 12/16), straddle (y = py - 8), clear above (y = py - 24)
    cx.imageSmoothingEnabled = false;
    GFX.draw(cx, 'bubble', 0, px + 4, py - 6);
    GFX.draw(cx, 'bubble_thunder', 0, px + 28, py - 6);
    GFX.draw(cx, 'bubble_letter', 0, px + 12 + 28, py - 6);
    GFX.draw(cx, 'nibbler_trapped', 0, px + 4 + 56, py - 6); GFX.draw(cx, 'trap_overlay', 0, px + 4 + 56, py - 6);
    GFX.draw(cx, 'bubble_warn', 0, px + 4 + 76, py - 6);
    GFX.draw(cx, 'bubble', 0, px + 4 + 100, py - 26);
    GFX.draw(cx, 'bubble_water', 0, px + 4 + 120, py - 6);
    GFX.draw(cx, 'bubble_fire', 0, px + 4 + 140, py - 6);
    // crop region 96x48 around platform start
    const sx = Math.max(16, Math.min(256 - 160, px - 8)), sy = Math.max(0, py - 32);
    const ox = (idx % perRow) * (cellW * 2 + 6), oy = Math.floor(idx / perRow) * (cellH * 2 + 16);
    c.drawImage(cv, sx, sy, cellW * 2 / 2 * 1, cellH, 0, 0, 0, 0);
    c.drawImage(cv, sx, sy, 96, 48, ox, oy + 14, 192, 96);
    c.fillStyle = '#9ab'; c.font = '11px monospace'; c.fillText('R' + (r + 1) + ' ' + th.name, ox + 2, oy + 11);
  });
  return out;
};
await canvasFnShot(t.page, path.join(OUT, 'bubbles_on_tiles_all30.png'), `(() => { const f = ${fn.toString()}; return f(Array.from({length:30},(_, i)=>i)); })()`, { scale: 1 });
console.log(t.errors);
await t.close();
