import path from 'path';
import { protoPage, PROTO } from './qa3_art_protolib.mjs';
import { canvasFnShot } from '../tools/harness.mjs';
const t = await protoPage();
const dump = await t.page.evaluate(() => {
  const d = GFX._dbg, P = { y: '#ffe23a', w: '#ffffff' };
  const mk = (pts, thick, core) => { let g = d.polyline(16, 8, pts, 'y', thick); return d.polyline(16, 8, pts, 'w', core, g); };
  const A = mk([[0, 1], [4, 1], [2, 3], [8, 3], [6, 5], [15, 5]], 2, 1);
  const B = mk([[0, 5], [4, 5], [2, 3], [8, 3], [6, 1], [15, 1]], 2, 1);          // vertical mirror: shimmer frame
  const A2 = mk([[0, 1], [5, 1], [3, 3], [9, 3], [7, 5], [15, 5]], 2, 1);
  const B2 = mk([[0, 1], [3, 1], [1, 3], [7, 3], [5, 5], [15, 5]], 2, 1);
  d.sprite('bE', 16, 8, P, [A, B], { diag: true });
  d.sprite('bF', 16, 8, P, [A2, B2], { diag: true });
  return { A, B, A2, B2 };
});
for (const [k, g] of Object.entries(dump)) { console.log(k); g.forEach((r) => console.log('  ' + r)); }
await canvasFnShot(t.page, path.join(PROTO, 'bolt_variants2.png'), () => {
  const names = ['bolt', 'bE', 'bF'];
  const Z = 8, cv = document.createElement('canvas'); cv.width = 3 * (16 * Z + 10) + 10; cv.height = 2 * (8 * Z + 10) + 330;
  const g = cv.getContext('2d'); g.fillStyle = '#251830'; g.fillRect(0, 0, cv.width, cv.height); g.imageSmoothingEnabled = false;
  const tmp = document.createElement('canvas'); tmp.width = 16; tmp.height = 8; const tg = tmp.getContext('2d');
  names.forEach((n, i) => [0, 1].forEach((f) => { tg.clearRect(0, 0, 16, 8); GFX.draw(tg, n, f, 0, 0); g.drawImage(tmp, 10 + i * (16 * Z + 10), 10 + f * (8 * Z + 10), 16 * Z, 8 * Z); }));
  const y0 = 2 * (8 * Z + 10) + 20;
  [['bolt', 11], ['bE', 11], ['bF', 11], ['bolt', 5], ['bE', 5], ['bF', 5]].forEach(([n, b], i) => {
    const s = document.createElement('canvas'); s.width = 64; s.height = 24; const sg = s.getContext('2d');
    sg.drawImage(GFX.bgCanvas(b), 40, 120, 64, 24, 0, 0, 64, 24);
    const fr = 0; sg.globalAlpha = 0.25; GFX.draw(sg, n, fr, 4, 8); sg.globalAlpha = 0.5; GFX.draw(sg, n, fr, 14, 8); sg.globalAlpha = 1; GFX.draw(sg, n, fr, 24, 8);
    sg.drawImage(GFX.levelCanvas ? GFX.bgCanvas(b) : s, 0, 0, 0, 0);
    g.drawImage(s, 10 + (i % 3) * (16 * Z + 10), y0 + Math.floor(i / 3) * 150, 64 * 2, 24 * 2 * 2);
  });
  return cv;
}, { scale: 1 });
await t.close();
