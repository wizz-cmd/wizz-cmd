import path from 'path';
import { launch, canvasFnShot, fp, PROJECT } from '../tools/harness.mjs';
const OUT = path.join(PROJECT, 'out/qa/visual/anim');
const t = await launch(); const g = fp(t.page); await g.freeze(true);
await canvasFnShot(t.page, path.join(OUT, 'items_zoom.png'), () => {
  const G = fz.GFX; const S = 12;
  const list = [['pu_shoes', 0], ['food_3', 0], ['food_2', 0], ['pu_pink', 0], ['pu_gold', 0], ['food_7', 0], ['moonpearl', 0], ['pu_bomb', 0]];
  const out = document.createElement('canvas'); out.width = list.reduce((a, [n]) => a + G.size(n).w * S + 10, 10); out.height = 32 * S + 20;
  const c = out.getContext('2d'); c.imageSmoothingEnabled = false; c.fillStyle = '#16080f'; c.fillRect(0, 0, out.width, out.height);
  let x = 10;
  list.forEach(([n, f]) => { const sz = G.size(n); const t = document.createElement('canvas'); t.width = sz.w; t.height = sz.h; G.draw(t.getContext('2d'), n, f, 0, 0); c.drawImage(t, x, 10, sz.w * S, sz.h * S); x += sz.w * S + 10; });
  return out;
}, { scale: 1 });
await t.close();
