// Animation strength: pixel differences between consecutive frames of looping sprites (out of opaque px).
import { launch, fp } from '../tools/harness.mjs';
const t = await launch(); const g = fp(t.page); await g.freeze(true);
const res = await g.evaluate(() => {
  const G = fz.GFX; const o = {};
  const names = ['p1_idle', 'p1_walk', 'p1_shoot', 'p2_walk', 'nibbler_move', 'crabbit_move', 'jellop_move', 'springle_move', 'glimmer_move', 'bonefin', 'bubble', 'kraken', 'nibbler_trapped', 'jellop_trapped', 'bubble_thunder', 'flame', 'moonpearl', 'water_flow', 'spark', 'ink'];
  for (const n of names) {
    const sz = G.size(n), nf = G.frames(n); const data = [];
    for (let f = 0; f < nf; f++) { const c = document.createElement('canvas'); c.width = sz.w; c.height = sz.h; const x = c.getContext('2d', { willReadFrequently: true }); G.draw(x, n, f, 0, 0); data.push(x.getImageData(0, 0, sz.w, sz.h).data); }
    const opq = (d) => { let k = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 128) k++; return k; };
    const diff = (a, b) => { let k = 0; for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) k++; return k; };
    const pairs = []; for (let f = 0; f < nf; f++) pairs.push(diff(data[f], data[(f + 1) % nf]));
    o[n] = { frames: nf, opaque: opq(data[0]), consecutiveDiffPx: pairs };
  }
  return o;
});
for (const [n, v] of Object.entries(res)) console.log(n.padEnd(16), 'opaque', String(v.opaque).padStart(3), 'diff', v.consecutiveDiffPx.join(','));
await t.close();
