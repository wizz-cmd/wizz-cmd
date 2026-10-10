// QA3 art proposal: pu_shoes (flippers). Old vs new at x10, and 1x-on-bg strip x4.
import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';
import { protoPage, PROTO } from './qa3_art_protolib.mjs';
import { canvasFnShot } from '../tools/harness.mjs';
const design = (await import(pathToFileURL(path.resolve(process.argv[2])).href)).default;
const norm = (s) => s.trim().split('\n').map((r) => r.trim());
const t = await protoPage();
await t.page.evaluate(({ grids, pal }) => { const d = GFX._dbg; d.sprite('fl_new', 16, 16, pal, grids.map((g) => g)); }, { grids: design.frames.map(norm), pal: design.pal });
await canvasFnShot(t.page, path.join(PROTO, process.argv[3] || 'flippers_v1.png'), () => {
  const Z = 12, n = GFX.frames('fl_new'), cv = document.createElement('canvas'); cv.width = (2 + n) * (16 * Z + 10) + 10; cv.height = 16 * Z + 20 + 90;
  const g = cv.getContext('2d'); g.fillStyle = '#251830'; g.fillRect(0, 0, cv.width, cv.height); g.imageSmoothingEnabled = false;
  const tmp = document.createElement('canvas'); tmp.width = 16; tmp.height = 16; const tg = tmp.getContext('2d');
  const items = [['pu_shoes', 0], ...Array.from({ length: n }, (_, i) => ['fl_new', i])];
  items.forEach(([nm, f], i) => { tg.clearRect(0, 0, 16, 16); GFX.draw(tg, nm, f, 0, 0); g.drawImage(tmp, 10 + i * (16 * Z + 10), 10, 16 * Z, 16 * Z); });
  // 1x on backdrops with other power-ups for scale comparison, x4
  const s = document.createElement('canvas'); s.width = 12 * 18; s.height = 18; const sg = s.getContext('2d');
  const row = ['pu_shoes', 'fl_new', 'pu_pink', 'pu_blue', 'pu_gold', 'pu_parasol', 'pu_clock', 'pu_bomb', 'pu_heart', 'food_2', 'food_4', 'food_7'];
  [0, 5, 10, 15, 20, 25].forEach((b, k) => sg.drawImage(GFX.bgCanvas(b), 40, 100, 36, 18, k * 36, 0, 36, 18));
  row.forEach((nm, i) => GFX.draw(sg, nm, 0, i * 18 + 1, 1));
  g.drawImage(s, 10, 16 * Z + 20, 12 * 18 * 4, 72);
  return cv;
}, { scale: 1 });
console.log(t.errors);
await t.close();
