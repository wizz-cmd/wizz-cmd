// trapped enemies x 3 film stages (+ warning/bubble variants) on the 6 theme backgrounds' dark water; CVD modes
import { setup, OUT, save } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
const url = await page.evaluate(() => {
  const GFX = window.__fizzpop.GFX; const k = 4; GFX.setScale(k);
  const types = ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer'];
  const modes = ['normal', 'deutan', 'protan', 'tritan', 'gray'];
  const cell = 22 * k, gap = 2;
  const out = document.createElement('canvas'); out.width = 40 + 15 * (cell + gap); out.height = modes.length * (cell + gap) + 14;
  const o = out.getContext('2d'); o.fillStyle = '#000'; o.fillRect(0, 0, out.width, out.height);
  const tiles = [];
  types.forEach((ty, ti) => [0, 1, 2].forEach((st) => {
    const cv = document.createElement('canvas'); cv.width = cell; cv.height = cell; const c = cv.getContext('2d');
    const g2 = c.createRadialGradient(cell / 2, cell / 2, 0, cell / 2, cell / 2, cell * 0.8); g2.addColorStop(0, '#0b1230'); g2.addColorStop(1, '#04060f'); c.fillStyle = g2; c.fillRect(0, 0, cell, cell);
    c.setTransform(k, 0, 0, k, 0, 0);
    GFX.draw(c, ty + '_trapped', 0, 3, 3); GFX.draw(c, 'trap_overlay', st, 3, 3);
    tiles.push(cv);
  }));
  modes.forEach((m, r) => { o.fillStyle = '#9bd'; o.font = '10px monospace'; o.fillText(m, 1, r * (cell + gap) + 14 + 12); tiles.forEach((cv, i) => o.drawImage(QA.simCanvas(cv, m), 40 + i * (cell + gap), 14 + r * (cell + gap))); });
  o.fillStyle = '#9bd'; types.forEach((ty, ti) => o.fillText(ty + ' s0/s1/s2', 40 + ti * 3 * (cell + gap), 10));
  return out.toDataURL('image/png');
});
save(`${OUT}/cvd/trapped_stages.png`, url);
await t.close();
