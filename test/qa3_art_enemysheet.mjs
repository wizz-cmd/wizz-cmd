import path from 'path';
import { launch, canvasFnShot, PROJECT } from '../tools/harness.mjs';
const O = path.join(PROJECT, 'out/qa3/art/sheets'); import fs from 'fs'; fs.mkdirSync(O, { recursive: true });
const t = await launch({});
await t.page.waitForFunction(() => !!window.__fizzpop);
const act = { nibbler: null, crabbit: 'crabbit_throw', jellop: null, springle: 'springle_squash', glimmer: 'glimmer_fire' };
for (const e of Object.keys(act)) {
  await canvasFnShot(t.page, path.join(O, `enemy_${e}.png`), (e, actName) => {
    const G = fz.GFX; G.init(); const Z = 8, P = 16 * Z + 8;
    const rows = [
      [0, 1, 2, 3].map((f) => [e + '_move', f]),
      [0, 1, 2, 3].map((f) => [e + '_angry', f]),
      [[e + '_trapped', 0], [e + '_trapped', 1], [e + '_die', 0], actName ? [actName, 0] : [e + '_move', 0]],
    ];
    const cv = document.createElement('canvas'); cv.width = 4 * P + 8; cv.height = 3 * P + 8;
    const g = cv.getContext('2d'); g.fillStyle = '#251830'; g.fillRect(0, 0, cv.width, cv.height); g.imageSmoothingEnabled = false;
    const tmp = document.createElement('canvas'); tmp.width = 16; tmp.height = 16; const tg = tmp.getContext('2d');
    rows.forEach((row, ri) => row.forEach(([n, f], ci) => { tg.clearRect(0, 0, 16, 16); G.draw(tg, n, f, 0, 0); g.drawImage(tmp, 4 + ci * P, 4 + ri * P, 16 * Z, 16 * Z); }));
    return cv;
  }, { scale: 1, args: [e, act[e]] });
}
await t.close();
