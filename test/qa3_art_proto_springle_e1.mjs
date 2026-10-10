// QA3: minimal-edit variants of the SHIPPED Springle head/belly stamps (E1: short tube snout + no jaw + curved belly; E2: + bigger crest / forward chest)
import path from 'path';
import { protoPage, PROTO } from './qa3_art_protolib.mjs';
import { canvasFnShot } from '../tools/harness.mjs';
const t = await protoPage();
const dump = await t.page.evaluate(() => {
  const d = GFX._dbg;
  const mkFrame = (HEAD, FIN, key, dy, fin) => { let g = d.put(d.blank(16, 16), d.shiftGrid(d.stamp(HEAD.concat(FIN[fin])), 0, dy)); for (const [y, row] of d.SPRING_PARTS[key]) g = d.put(g, d.G(row), 0, y); return g; };
  const FIN = d.SPRING_FIN;
  const E1 = [
    [0, 4, 'pPpP'],
    [1, 3, 'pllvvm'],
    [2, 3, 'pllcemm'],
    [3, 3, 'Plleemmm'],                 // snout shortened by 1 px
    [4, 3, 'plmmmmmmm'],                // no dark 'd' jaw tip
    [5, 4, 'Plmmmm'], [5, 10, 'mm'],    // snout starts to drop
    [6, 4, 'pPmmm'], [6, 11, 'm'],      // tip curls down 2 rows
    [7, 3, 'pPlmmcccm'],                // chest pushes forward (x=11)
    [8, 3, 'PPlmccccmd'],
    [9, 4, 'Plmmcccmd'],
  ];
  const E2 = [
    [0, 4, 'pPpP'],
    [1, 3, 'pllvvm'],
    [2, 3, 'pllcemm'],
    [3, 3, 'Plleemm'],                  // snout only 2 px past the eye
    [4, 3, 'plmmmmmm'],
    [5, 4, 'Plmmmmm'],                  // snout drops immediately: tube hangs down-right
    [6, 4, 'pPmmmm'], [6, 10, 'd'],
    [7, 3, 'pPlmmccm'], [7, 11, 'd'],
    [8, 3, 'PPlmcccccd'],
    [9, 4, 'Plmccccmd'],
  ];
  const out = {};
  for (const [nm, H] of [['E1', E1], ['E2', E2]]) {
    const frames = [mkFrame(H, FIN, 'tall', 0, 0), mkFrame(H, FIN, 'tall', 0, 1), mkFrame(H, FIN, 'med', 1, 0), mkFrame(H, FIN, 'med', 1, 1)];
    const fin = d.sprite(nm.toLowerCase() + '_move', 16, 16, d.SPRING_PAL, frames);
    d.spriteFinished(nm.toLowerCase() + '_angry', 16, 16, d.SPRING_ANGRY, d.addSteam(fin, [[11, 1], [13, 3]]));
    out[nm] = frames[0];
  }
  return out;
});
for (const [k, g] of Object.entries(dump)) { console.log(k); g.forEach((r, i) => console.log(String(i).padStart(2), r)); }
await canvasFnShot(t.page, path.join(PROTO, 'springle_e12.png'), () => {
  const Z = 10, W = 16 * Z + 8, names = [['springle_move', 0], ['e1_move', 0], ['e2_move', 0], ['springle_angry', 0], ['e1_angry', 0], ['e2_angry', 0]];
  const cv = document.createElement('canvas'); cv.width = 6 * W + 8; cv.height = W + 100;
  const g = cv.getContext('2d'); g.fillStyle = '#251830'; g.fillRect(0, 0, cv.width, cv.height); g.imageSmoothingEnabled = false;
  const tmp = document.createElement('canvas'); tmp.width = 16; tmp.height = 16; const tg = tmp.getContext('2d');
  names.forEach(([n, f], i) => { tg.clearRect(0, 0, 16, 16); GFX.draw(tg, n, f, 0, 0); g.drawImage(tmp, 4 + i * W, 4, 16 * Z, 16 * Z); });
  const mkStrip = (name) => { const s = document.createElement('canvas'); s.width = 6 * 20; s.height = 18; const sg = s.getContext('2d'); [0, 5, 10, 15, 20, 25].forEach((b, i) => { sg.drawImage(GFX.bgCanvas(b), 40, 100, 20, 18, i * 20, 0, 20, 18); GFX.draw(sg, name, i % 4, i * 20 + 2, 1); }); return s; };
  [['springle_move', 0], ['e1_move', 1], ['e2_move', 2]].forEach(([n], i) => g.drawImage(mkStrip(n), 4 + i * 360, W + 12, 6 * 20 * 3, 54));
  return cv;
}, { scale: 1 });
await t.close();
