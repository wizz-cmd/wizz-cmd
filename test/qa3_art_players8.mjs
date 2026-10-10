import path from 'path';
import { launch, canvasFnShot, PROJECT } from '../tools/harness.mjs';
const O = path.join(PROJECT, 'out/qa3/art');
const t = await launch({});
await t.page.waitForFunction(() => !!window.__fizzpop);
for (const [tag, list] of [['A', [['idle', 0], ['walk', 0], ['walk', 2]]], ['B', [['jump', 0], ['fall', 0], ['shoot', 0], ['shoot', 1]]]]) {
  for (const pre of ['p1', 'p2']) {
    await canvasFnShot(t.page, path.join(O, `players8_${pre}_${tag}.png`), (pre, list) => {
      const G = fz.GFX; G.init(); const Z = 8;
      const cv = document.createElement('canvas'); cv.width = list.length * (16 * Z * 2 + 24) + 8; cv.height = 16 * Z + 24;
      const g = cv.getContext('2d'); g.fillStyle = '#14102a'; g.fillRect(0, 0, cv.width, cv.height); g.imageSmoothingEnabled = false;
      const tmp = document.createElement('canvas'); tmp.width = 16; tmp.height = 16; const tg = tmp.getContext('2d');
      list.forEach(([k, f], ci) => {
        [[0, true], [1, false]].forEach(([fi, flip]) => {
          tg.clearRect(0, 0, 16, 16); G.draw(tg, pre + '_' + k, f, 0, 0, { flip });
          g.drawImage(tmp, 8 + ci * (16 * Z * 2 + 24) + fi * (16 * Z + 4), 8, 16 * Z, 16 * Z);
        });
        g.fillStyle = '#aaa'; g.font = '12px monospace'; g.fillText(k + f + ' (L | R)', 8 + ci * (16 * Z * 2 + 24), 16 * Z + 20);
      });
      return cv;
    }, { scale: 1, args: [pre, list] });
  }
}
await t.close();
