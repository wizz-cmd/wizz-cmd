import path from 'path';
import { launch, canvasFnShot, PROJECT } from '../tools/harness.mjs';
import fs from 'fs';
const O = path.join(PROJECT, 'out/qa3/art/sheets'); fs.mkdirSync(O, { recursive: true });
const t = await launch({});
await t.page.waitForFunction(() => !!window.__fizzpop);
// generic sheet maker: list of [name, frame] cells at zoom Z on a given bg
const mk = (file, cells, Z, per, bg) => canvasFnShot(t.page, path.join(O, file), (cells, Z, per, bg) => {
  const G = fz.GFX; G.init();
  const cw = 32 * Z + 6, rows = Math.ceil(cells.length / per);
  const cv = document.createElement('canvas'); cv.width = per * cw + 4; cv.height = rows * (32 * Z + 18) + 4;
  const g = cv.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, cv.width, cv.height); g.imageSmoothingEnabled = false;
  cells.forEach(([n, f], i) => {
    const sz = G.size(n); const tmp = document.createElement('canvas'); tmp.width = sz.w; tmp.height = sz.h; const tg = tmp.getContext('2d');
    G.draw(tg, n, f, 0, 0);
    const x = 2 + (i % per) * cw, y = 2 + Math.floor(i / per) * (32 * Z + 18);
    g.drawImage(tmp, x + (32 * Z - sz.w * Z) / 2, y + (32 * Z - sz.h * Z) / 2, sz.w * Z, sz.h * Z);
    g.fillStyle = '#9a96c8'; g.font = '11px monospace'; g.fillText(n + (G.frames(n) > 1 ? ':' + f : ''), x, y + 32 * Z + 12);
  });
  return cv;
}, { scale: 1, args: [cells, Z, per, bg] });
const foods = [...Array(8).keys()].map((i) => ['food_' + i, 0]);
await mk('food.png', foods, 6, 4, '#1a1230');
const pus = ['pu_shoes', 'pu_pink', 'pu_blue', 'pu_gold', 'pu_parasol', 'pu_clock', 'pu_bomb', 'pu_heart'].map((n) => [n, 0]);
await mk('powerups.png', pus, 6, 4, '#1a1230');
const bub = [['bubble', 0], ['bubble', 1], ['bubble_warn', 0], ['bubble_warn', 1], ['bubble_thunder', 0], ['bubble_thunder', 1], ['bubble_fire', 0], ['bubble_fire', 1], ['bubble_water', 0], ['bubble_water', 1], ['bubble_letter', 0], ['bubble_letter', 1], ['bubble_shot', 0], ['bubble_shot', 1], ['bubble_shot', 2], ['bubble_pop', 0], ['bubble_pop', 1], ['bubble_pop', 2], ['trap_overlay', 0], ['trap_overlay', 1], ['trap_overlay', 2]];
await mk('bubbles.png', bub, 6, 6, '#1a1230');
const proj = [['pebble', 0], ['pebble', 1], ['spark', 0], ['spark', 1], ['ink', 0], ['ink', 1], ['bolt', 0], ['bolt', 1], ['fire_drop', 0], ['fire_drop', 1], ['flame', 0], ['flame', 1], ['flame', 2], ['water_flow', 0], ['water_flow', 1], ['water_fall', 0], ['water_fall', 1], ['sparkle', 0], ['sparkle', 1], ['sparkle', 2], ['sparkle', 3], ['poof', 0], ['poof', 1], ['poof', 2], ['bonefin', 0], ['bonefin', 1]];
await mk('projectiles.png', proj, 8, 6, '#1a1230');
await mk('moonpearl.png', [['moonpearl', 0], ['moonpearl', 1]], 8, 2, '#1a1230');
await t.close();
