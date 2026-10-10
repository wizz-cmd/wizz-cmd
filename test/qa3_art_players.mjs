// QA3 art: Fizz/Pop poses left+right side by side at x4 (and x1 tiny strip enlarged x3 to judge 1x readability).
import path from 'path';
import { launch, canvasFnShot, PROJECT } from '../tools/harness.mjs';
const O = path.join(PROJECT, 'out/qa3/art');
const t = await launch({});
await t.page.waitForFunction(() => !!window.__fizzpop);
await canvasFnShot(t.page, path.join(O, 'players_x4.png'), () => {
  const G = fz.GFX; G.init();
  const rows = [];
  for (const pre of ['p1', 'p2']) {
    const cells = [['idle', 0], ['idle', 1], ['walk', 0], ['walk', 1], ['walk', 2], ['walk', 3], ['jump', 0], ['fall', 0], ['shoot', 0], ['shoot', 1], ['stun', 0]];
    rows.push(cells.map(([k, f]) => [pre + '_' + k, f]));
  }
  const Z = 4, cw = 16 * Z * 2 + 14, rh = 16 * Z + 10;
  const cv = document.createElement('canvas'); cv.width = 11 * cw + 4; cv.height = rows.length * rh + 4;
  const g = cv.getContext('2d'); g.fillStyle = '#14102a'; g.fillRect(0, 0, cv.width, cv.height); g.imageSmoothingEnabled = false;
  const tmp = document.createElement('canvas'); tmp.width = 16; tmp.height = 16; const tg = tmp.getContext('2d');
  rows.forEach((row, ri) => row.forEach(([n, f], ci) => {
    for (const [fi, flip] of [[0, true], [1, false]]) {
      tg.clearRect(0, 0, 16, 16); G.draw(tg, n, f, 0, 0, { flip });
      g.drawImage(tmp, 2 + ci * cw + fi * (16 * Z + 4), 2 + ri * rh, 16 * Z, 16 * Z);
    }
    g.fillStyle = '#8a86b8'; g.font = '9px monospace'; g.fillText(n.slice(3) + f, 2 + ci * cw, 2 + ri * rh + 16 * Z + 8);
  }));
  return cv;
}, { scale: 1 });
// 1x context: both players on a platform, walking each way, real game render
const g = (await import('../tools/harness.mjs')).fp(t.page);
await g.freeze(true); await g.start(2, 1, 5);
await g.step(200);
await g.evaluate(() => fz.Game.debug.god(true));
for (const [name, a, b] of [['walkR', 'right', 'right'], ['walkL', 'left', 'left'], ['cross', 'right', 'left'], ['cross2', 'left', 'right']]) {
  await g.hold(0, { [a]: true }, 40); await g.hold(1, { [b]: true }, 0);
  await g.set(0, { [a]: true }); await g.set(1, { [b]: true }); await g.step(30);
  await g.shot(path.join(O, `game_${name}_x3.png`), { scale: 3 });
  await g.clear();
}
console.log('errors', t.errors);
await t.close();
