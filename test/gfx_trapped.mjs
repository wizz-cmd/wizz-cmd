// node test/gfx_trapped.mjs [out.png] - every enemy's trapped frames under each trap_overlay stage, zoomed x8 (review aid)
import path from 'path';
import { launch, canvasFnShot, PROJECT } from '../tools/harness.mjs';
const out = process.argv[2] || path.join(PROJECT, 'out', 'gfx', 'trapped.png');
const t = await launch({ html: path.join(PROJECT, 'test', 'gfx_sheet.html') });
await canvasFnShot(t.page, out, () => {
  const names = ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer'];
  const Z = 6, cell = 16 * Z + 6;
  const cv = document.createElement('canvas'); cv.width = cell * 6; cv.height = cell * names.length;
  const g = cv.getContext('2d'); g.fillStyle = '#0d0b1a'; g.fillRect(0, 0, cv.width, cv.height);
  const tmp = document.createElement('canvas'); tmp.width = 16; tmp.height = 16; const tg = tmp.getContext('2d');
  names.forEach((n, r) => {
    for (let k = 0; k < 6; k++) {
      tg.clearRect(0, 0, 16, 16);
      GFX.draw(tg, n + '_trapped', k % 2, 0, 0); GFX.draw(tg, 'trap_overlay', k >> 1, 0, 0);
      g.imageSmoothingEnabled = false; g.drawImage(tmp, k * cell + 3, r * cell + 3, 16 * Z, 16 * Z);
    }
  });
  return cv;
}, { scale: 1 });
console.log(JSON.stringify({ out, errors: t.errors }));
await t.close();
