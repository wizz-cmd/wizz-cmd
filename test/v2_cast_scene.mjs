// FIZZ & POP v2 - cast in context (role "gfxcast").   node test/v2_cast_scene.mjs [--cast=<rel path>] [--out=<dir>] [--k=2]
// Composes the whole cast like the game would (twins, five enemies angry + calm, trapped captives in bubbles, bubble cluster, food, power-ups,
// projectiles, effects) on a dark gradient with crystal-like slabs at k = 1, 2 and 4 (baked at that k, 1:1 blits) so legibility, hue separation
// and the overdraw can be judged at the real sizes; plus a 2x2 "thumbnail" (k = 1, upscaled) for the at-a-glance read.
import fs from 'fs';
import path from 'path';
import { launch, canvasFnShot, PROJECT } from '../tools/harness.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const a = args.find((x) => x.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3) : d; };
const OUT = opt('out', path.join(PROJECT, 'out', 'v2', 'gfxcast'));
const cast = opt('cast', '../src/11_gfx_cast.js');
fs.mkdirSync(OUT, { recursive: true });
const t = await launch({ html: path.join(PROJECT, 'test', 'v2_cast_harness.html') + '?gfx=stub&cast=' + encodeURIComponent(cast), viewport: { width: 1400, height: 900 } });
await t.page.waitForFunction(() => window.__castReady === true);

const SCENE = () => {
  const items = [];
  const plat = [[8, 60, 112], [136, 60, 112], [8, 112, 112], [136, 112, 112], [40, 164, 176], [0, 208, 256]];
  const at = (name, f, x, y, flip, alpha) => items.push({ name, f, x, y, flip, alpha });
  // row 1 (y = 60 - 16): trapped captives in bubbles + a pop
  at('nibbler_trapped', 0, 20, 44); at('trap_overlay', 0, 20, 44);
  at('crabbit_trapped', 1, 44, 44); at('trap_overlay', 1, 44, 44);
  at('jellop_trapped', 0, 68, 44); at('trap_overlay', 2, 68, 44);
  at('bubble', 0, 92, 40); at('bubble_pop', 1, 100, 46);
  at('bubble_thunder', 0, 148, 44); at('bubble_fire', 1, 172, 44); at('bubble_water', 0, 196, 44); at('bubble_letter', 1, 220, 44);
  // row 2 (y = 112 - 16): enemies walking, calm and angry
  at('nibbler_move', 1, 14, 96); at('crabbit_move', 2, 38, 96); at('jellop_move', 0, 62, 96); at('springle_move', 0, 86, 96); at('glimmer_move', 1, 150, 90); at('bonefin', 0, 180, 92, false, 0.85);
  at('nibbler_angry', 1, 204, 96); at('crabbit_angry', 2, 228, 96, true);
  // row 3 (y = 164 - 16)
  at('springle_angry', 1, 44, 148); at('glimmer_angry', 2, 68, 144); at('jellop_angry', 3, 92, 148); at('crabbit_throw', 0, 116, 148); at('pebble', 1, 140, 156); at('spark', 1, 152, 150); at('ink', 0, 164, 156);
  at('food_4', 0, 184, 148); at('pu_heart', 0, 202, 148); at('food_7', 0, 220, 148);
  // row 4 (y = 208 - 16): the twins, items
  at('p1_idle', 0, 20, 192); at('p1_walk', 1, 44, 192); at('p1_shoot', 1, 68, 192); at('bubble_shot', 2, 84, 190); at('p2_jump', 0, 120, 176, true); at('p2_walk', 2, 150, 192, true); at('p2_idle', 1, 176, 192, true);
  at('food_0', 0, 200, 192); at('food_1', 0, 216, 192); at('food_2', 0, 232, 192);
  at('bolt', 0, 106, 196); at('flame', 1, 96, 192); at('sparkle', 1, 120, 196); at('poof', 1, 128, 192);
  return { items, plat };
};

for (const k of [1, 2, 4]) {
  await canvasFnShot(t.page, path.join(OUT, `scene_k${k}.png`), (k, src) => { const s = (0, eval)('(' + src + ')')(); return T.scene(s.items, k, 256, 224, { plat: s.plat }); }, { args: [k, SCENE.toString()], scale: k === 1 ? 4 : 1 });
}
// second scene: all foods + power-ups + effects in a grid at k = 2
await canvasFnShot(t.page, path.join(OUT, 'scene_items_k2.png'), () => {
  const names = ['food_0', 'food_1', 'food_2', 'food_3', 'food_4', 'food_5', 'food_6', 'food_7', 'pu_shoes', 'pu_pink', 'pu_blue', 'pu_gold', 'pu_parasol', 'pu_clock', 'pu_bomb', 'pu_heart'];
  const items = names.map((n, i) => ({ name: n, f: 0, x: 8 + (i % 8) * 30, y: 20 + Math.floor(i / 8) * 30 }));
  return T.scene(items, 2, 256, 80, { plat: [[0, 36, 256], [0, 66, 256]] });
}, { scale: 1 });
console.log('errors', t.errors);
await t.close();
