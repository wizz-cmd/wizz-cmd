// Facing-direction legibility: how many opaque pixels differ between a sprite and its own mirror (left-right asymmetry). Enemies for reference.
import fs from 'fs';
import path from 'path';
import { launch, fp, PROJECT } from '../tools/harness.mjs';
const t = await launch(); const g = fp(t.page); await g.freeze(true);
const res = await g.evaluate(() => {
  const G = fz.GFX; const out = {};
  const names = ['p1_idle', 'p1_walk', 'p1_jump', 'p1_fall', 'p1_shoot', 'p2_idle', 'p2_walk', 'nibbler_move', 'crabbit_move', 'jellop_move', 'springle_move', 'glimmer_move', 'kraken'];
  for (const n of names) {
    const sz = G.size(n); const arr = [];
    for (let f = 0; f < G.frames(n); f++) {
      const a = document.createElement('canvas'); a.width = sz.w; a.height = sz.h; const ax = a.getContext('2d', { willReadFrequently: true }); G.draw(ax, n, f, 0, 0);
      const b = document.createElement('canvas'); b.width = sz.w; b.height = sz.h; const bx = b.getContext('2d', { willReadFrequently: true }); G.draw(bx, n, f, 0, 0, { flip: true });
      const da = ax.getImageData(0, 0, sz.w, sz.h).data, db = bx.getImageData(0, 0, sz.w, sz.h).data; let op = 0, diff = 0, sil = 0;
      for (let i = 0; i < da.length; i += 4) { const oa = da[i + 3] > 128, ob = db[i + 3] > 128; if (oa || ob) op++; if (oa !== ob) sil++; if ((oa || ob) && (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2] || oa !== ob)) diff++; }
      arr.push({ f, opaque: op, silhouetteDiffPct: +(100 * sil / op).toFixed(1), colourDiffPct: +(100 * diff / op).toFixed(1) });
    }
    out[n] = arr;
  }
  return out;
});
fs.writeFileSync(path.join(PROJECT, 'out/qa/visual/anim/symmetry.json'), JSON.stringify(res, null, 1));
for (const [n, a] of Object.entries(res)) console.log(n.padEnd(14), a.map((x) => `${x.silhouetteDiffPct}/${x.colourDiffPct}`).join('  '));
await t.close();
