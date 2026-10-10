// Lineup at 1x/2x/4x colour + silhouettes + greyscale to judge distinctness
import path from 'path';
import { launch, canvasFnShot, fp, PROJECT } from '../tools/harness.mjs';
const OUT = path.join(PROJECT, 'out/qa/visual/anim');
const t = await launch(); const g = fp(t.page); await g.freeze(true);
await canvasFnShot(t.page, path.join(OUT, 'lineup.png'), () => {
  const G = fz.GFX; const names = ['p1_idle', 'p2_idle', 'nibbler_move', 'crabbit_move', 'jellop_move', 'springle_move', 'glimmer_move', 'bonefin', 'nibbler_angry', 'crabbit_angry', 'jellop_angry', 'springle_angry', 'glimmer_angry'];
  const S = 4; const W = names.length * 16 * S + 40, rowH = 16 * S + 8;
  const out = document.createElement('canvas'); out.width = W; out.height = rowH * 4 + 20;
  const c = out.getContext('2d'); c.imageSmoothingEnabled = false; c.fillStyle = '#16080f'; c.fillRect(0, 0, W, out.height);
  const tmp = (n, o) => { const sz = G.size(n); const t = document.createElement('canvas'); t.width = sz.w; t.height = sz.h; G.draw(t.getContext('2d'), n, 0, 0, 0, o); return t; };
  names.forEach((n, i) => { c.drawImage(tmp(n), 6 + i * 16 * S, 4, 16 * S, 16 * S); });
  // silhouette (white)
  names.forEach((n, i) => { c.drawImage(tmp(n, { white: true }), 6 + i * 16 * S, rowH + 4, 16 * S, 16 * S); });
  // greyscale
  c.save(); c.filter = 'grayscale(1)'; names.forEach((n, i) => { c.drawImage(tmp(n), 6 + i * 16 * S, 2 * rowH + 4, 16 * S, 16 * S); }); c.restore();
  // actual size x1 and x2 on dark
  names.forEach((n, i) => { c.drawImage(tmp(n), 6 + i * 16 * S, 3 * rowH + 8, 16, 16); c.drawImage(tmp(n), 6 + i * 16 * S + 24, 3 * rowH + 8, 32, 32); });
  return out;
}, { scale: 1 });
await t.close();
