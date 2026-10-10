// Player facing/charm zoom: p1/p2 idle+walk(4)+jump+fall+shoot(2) at x10, normal and flipped; plus 1x/2x actual size.
import path from 'path';
import { launch, canvasFnShot, fp, PROJECT } from '../tools/harness.mjs';
const OUT = path.join(PROJECT, 'out/qa/visual/anim');
const t = await launch();
const g = fp(t.page); await g.freeze(true);
await canvasFnShot(t.page, path.join(OUT, 'players_zoom_x10.png'), () => {
  const G = fz.GFX; const S = 10;
  const list = [['p1_idle', 0], ['p1_idle', 1], ['p1_walk', 0], ['p1_walk', 1], ['p1_walk', 2], ['p1_walk', 3], ['p1_jump', 0], ['p1_fall', 0], ['p1_shoot', 0], ['p1_shoot', 1]];
  const out = document.createElement('canvas'); out.width = list.length * (16 * S + 6) + 6; out.height = 4 * (16 * S + 6) + 6;
  const c = out.getContext('2d'); c.imageSmoothingEnabled = false; c.fillStyle = '#18102a'; c.fillRect(0, 0, out.width, out.height);
  [['p1', false], ['p1', true], ['p2', false], ['p2', true]].forEach(([pre, flip], row) => {
    list.forEach(([n, f], i) => {
      const tc = document.createElement('canvas'); tc.width = 16; tc.height = 16; G.draw(tc.getContext('2d'), n.replace('p1', pre), f, 0, 0, { flip });
      c.drawImage(tc, 6 + i * (16 * S + 6), 6 + row * (16 * S + 6), 16 * S, 16 * S);
    });
  });
  return out;
}, { scale: 1 });
await t.close();
