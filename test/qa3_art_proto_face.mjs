// QA3 art proposal: shift Fizz's face toward the facing side (eyes + mouth +1 px, far eye narrower) and compare L/R at x8 and 1x-in-game x5.
import path from 'path';
import { protoPage, PROTO } from './qa3_art_protolib.mjs';
import { canvasFnShot } from '../tools/harness.mjs';
const t = await protoPage();
const metrics = await t.page.evaluate(() => {
  const d = GFX._dbg;
  const fin = (g) => d.outlineGrid(g, 'o', false, d.SKIP_FRILL);
  const F = d.playerFrame;
  const A = F({});
  const B = F({ eyeX: [8, 11], mouthX: 9 });
  // C: B + the far eye (right one) loses its glint column so it reads narrower (3/4 view), blush on the near cheek stays
  const C = F({ eyeX: [8, 11], mouthX: 9 });
  d.spriteFinished('pfA', 16, 16, d.PAL_P1, [fin(A)]); d.spriteFinished('pfB', 16, 16, d.PAL_P1, [fin(B)]);
  d.spriteFinished('pfB2', 16, 16, d.PAL_P2, [fin(B)]); d.spriteFinished('pfA2', 16, 16, d.PAL_P2, [fin(A)]);
  const cen = (g) => { const xs = []; g.forEach((r) => r.split('').forEach((c, x) => { if (c === 'e') xs.push(x); })); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
  return { eyeCentreA: cen(A.slice(4, 7)), eyeCentreB: cen(B.slice(4, 7)) };
});
console.log(JSON.stringify(metrics));
await canvasFnShot(t.page, path.join(PROTO, 'face_cmp.png'), () => {
  const Z = 8, cv = document.createElement('canvas'); cv.width = 4 * (16 * Z + 10) + 10; cv.height = 2 * (16 * Z + 10) + 120;
  const g = cv.getContext('2d'); g.fillStyle = '#251830'; g.fillRect(0, 0, cv.width, cv.height); g.imageSmoothingEnabled = false;
  const tmp = document.createElement('canvas'); tmp.width = 16; tmp.height = 16; const tg = tmp.getContext('2d');
  [['pfA', 'pfB'], ['pfA2', 'pfB2']].forEach((pair, r) => pair.forEach((n, i) => [true, false].forEach((flip, k) => { tg.clearRect(0, 0, 16, 16); GFX.draw(tg, n, 0, 0, 0, { flip }); g.drawImage(tmp, 10 + (i * 2 + k) * (16 * Z + 10), 10 + r * (16 * Z + 10), 16 * Z, 16 * Z); })));
  // 1x on R1 backdrop, x5
  const s = document.createElement('canvas'); s.width = 100; s.height = 22; const sg = s.getContext('2d'); sg.drawImage(GFX.bgCanvas(0), 20, 150, 100, 22, 0, 0, 100, 22);
  [['pfA', true], ['pfA', false], ['pfB', true], ['pfB', false], ['pfA2', true], ['pfA2', false], ['pfB2', true], ['pfB2', false]].forEach(([n, fl], i) => GFX.draw(sg, n, 0, 2 + i * 12, 3, { flip: fl }));
  g.drawImage(s, 10, 2 * (16 * Z + 10) + 20, 100 * 8, 22 * 4.5);
  return cv;
}, { scale: 1 });
await t.close();
