// QA3 art proposal: lightning bolt that reads as lightning. Compares the shipped bolt with 3 variants at x8, x1-on-tiles x4 and in-game afterimage trail.
import path from 'path';
import { protoPage, PROTO } from './qa3_art_protolib.mjs';
import { canvasFnShot } from '../tools/harness.mjs';
const t = await protoPage();
await t.page.evaluate(() => {
  const d = GFX._dbg, P = { y: '#ffe23a', w: '#ffffff', o: '#7a4a00' };
  const mk = (pts, thick, core) => {
    let g = d.polyline(16, 8, pts, 'y', thick);
    g = d.polyline(16, 8, pts.map(([x, y]) => [x, y]), 'w', core, g);
    return g;
  };
  // B: sharp saw-tooth, 2 px yellow body + 1 px white core on top
  const B1 = mk([[0, 3], [2, 1], [4, 5], [6, 1], [8, 5], [10, 1], [12, 5], [15, 3]], 2, 1);
  const B2 = mk([[0, 3], [2, 5], [4, 1], [6, 5], [8, 1], [10, 5], [12, 1], [15, 3]], 2, 1);
  // C: three big zigs (stairs) - reads like the classic bolt icon turned sideways
  const C1 = mk([[0, 1], [5, 1], [5, 1], [3, 4], [9, 4], [7, 6], [15, 6]], 2, 1);
  const C2 = mk([[0, 1], [4, 1], [2, 4], [8, 4], [6, 6], [15, 6]], 2, 1);
  // D: jagged lightning with a forked tip: main trunk + short branch
  const D1 = mk([[0, 3], [3, 1], [6, 5], [9, 2], [12, 5], [15, 3]], 2, 1);
  const D2 = mk([[0, 3], [3, 5], [6, 1], [9, 4], [12, 1], [15, 3]], 2, 1);
  d.sprite('bB', 16, 8, P, [B1, B2], { diag: true });
  d.sprite('bC', 16, 8, P, [C1, C2], { diag: true });
  d.sprite('bD', 16, 8, P, [D1, D2], { diag: true });
});
await canvasFnShot(t.page, path.join(PROTO, 'bolt_variants.png'), () => {
  const names = ['bolt', 'bB', 'bC', 'bD'];
  const Z = 8, cv = document.createElement('canvas'); cv.width = 4 * (16 * Z + 10) + 10; cv.height = 2 * (8 * Z + 10) + 200;
  const g = cv.getContext('2d'); g.fillStyle = '#251830'; g.fillRect(0, 0, cv.width, cv.height); g.imageSmoothingEnabled = false;
  const tmp = document.createElement('canvas'); tmp.width = 16; tmp.height = 8; const tg = tmp.getContext('2d');
  names.forEach((n, i) => [0, 1].forEach((f) => { tg.clearRect(0, 0, 16, 8); GFX.draw(tg, n, f, 0, 0); g.drawImage(tmp, 10 + i * (16 * Z + 10), 10 + f * (8 * Z + 10), 16 * Z, 8 * Z); }));
  // in-game look: bolt with afterimages over R12 / R6 backdrops, x4
  const y0 = 2 * (8 * Z + 10) + 20;
  names.forEach((n, i) => {
    const s = document.createElement('canvas'); s.width = 56; s.height = 14; const sg = s.getContext('2d');
    sg.drawImage(GFX.bgCanvas(i % 2 ? 11 : 5), 40, 120, 56, 14, 0, 0, 56, 14);
    sg.globalAlpha = 0.25; GFX.draw(sg, n, 0, 6, 3); sg.globalAlpha = 0.5; GFX.draw(sg, n, 0, 18, 3); sg.globalAlpha = 1; GFX.draw(sg, n, 0, 30, 3);
    g.drawImage(s, 10 + i * (16 * Z + 10), y0, 56 * 2.2, 14 * 2.2);
    const s2 = document.createElement('canvas'); s2.width = 56; s2.height = 14; const sg2 = s2.getContext('2d');
    sg2.drawImage(GFX.bgCanvas(i % 2 ? 11 : 5), 40, 120, 56, 14, 0, 0, 56, 14);
    sg2.globalAlpha = 0.25; GFX.draw(sg2, n, 1, 6, 3); sg2.globalAlpha = 0.5; GFX.draw(sg2, n, 1, 18, 3); sg2.globalAlpha = 1; GFX.draw(sg2, n, 1, 30, 3);
    g.drawImage(s2, 10 + i * (16 * Z + 10), y0 + 40, 56 * 2.2, 14 * 2.2);
  });
  return cv;
}, { scale: 1 });
console.log(t.errors);
await t.close();
