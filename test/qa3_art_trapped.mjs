import path from 'path';
import fs from 'fs';
import { launch, canvasFnShot, PROJECT } from '../tools/harness.mjs';
const O = path.join(PROJECT, 'out/qa3/art/sheets'); fs.mkdirSync(O, { recursive: true });
const t = await launch({});
await t.page.waitForFunction(() => !!window.__fizzpop);
// trapped enemies inside bubble: 5 types x (stage 0, 1, 2) on the R1 backdrop and on the R16 backdrop (x6)
await canvasFnShot(t.page, path.join(O, 'trapped_x6.png'), () => {
  const G = fz.GFX; G.init(); const Z = 6;
  const types = ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer'];
  const cv = document.createElement('canvas'); cv.width = types.length * (16 * Z + 6) + 6; cv.height = 3 * (16 * Z + 6) + 6;
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  const stage = document.createElement('canvas'); stage.width = 16; stage.height = 16; const sg = stage.getContext('2d');
  for (let st = 0; st < 3; st++) types.forEach((ty, i) => {
    sg.clearRect(0, 0, 16, 16);
    const bgc = G.bgCanvas(st === 1 ? 15 : 0); sg.drawImage(bgc, 20 + i * 3, 60, 16, 16, 0, 0, 16, 16);
    G.draw(sg, ty + '_trapped', i % 2, 0, 0); G.draw(sg, 'trap_overlay', st, 0, 0);
    g.drawImage(stage, 6 + i * (16 * Z + 6), 6 + st * (16 * Z + 6), 16 * Z, 16 * Z);
  });
  return cv;
}, { scale: 1 });
await canvasFnShot(t.page, path.join(O, 'kraken_x4.png'), () => {
  const G = fz.GFX; G.init(); const Z = 4;
  const cells = [['kraken', 0], ['kraken', 1], ['kraken_angry', 0], ['kraken_angry', 1], ['kraken_trapped', 0]];
  const cv = document.createElement('canvas'); cv.width = 64 * Z * 3 + 20; cv.height = 64 * Z * 2 + 14;
  const g = cv.getContext('2d'); g.fillStyle = '#10101c'; g.fillRect(0, 0, cv.width, cv.height); g.imageSmoothingEnabled = false;
  cells.forEach(([n, f], i) => { const sz = G.size(n); const tmp = document.createElement('canvas'); tmp.width = sz.w; tmp.height = sz.h; G.draw(tmp.getContext('2d'), n, f, 0, 0); g.drawImage(tmp, 4 + (i % 3) * (64 * Z + 6), 4 + Math.floor(i / 3) * (64 * Z + 6), sz.w * Z, sz.h * Z); });
  return cv;
}, { scale: 1 });
await t.close();
