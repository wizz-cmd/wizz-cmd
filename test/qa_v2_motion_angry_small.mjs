// calm/angry enemy silhouettes at the real small render scales (native device px) on a mid-theme background, 4x nearest zoom for review
import { setup, OUT, save } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
const url = await page.evaluate(() => {
  const GFX = window.__fizzpop.GFX;
  const names = [['nibbler_move', 'nibbler_angry'], ['crabbit_move', 'crabbit_angry'], ['jellop_move', 'jellop_angry'], ['springle_move', 'springle_angry'], ['glimmer_move', 'glimmer_angry'], ['p1_idle', 'p2_idle']];
  const ks = [1.25, 1.5, 2];
  const zoom = 4, cell = 22;
  const rows = [];
  for (const k of ks) {
    GFX.setScale(k);
    const cv = document.createElement('canvas'); cv.width = Math.ceil(cell * 12 * k); cv.height = Math.ceil(cell * k);
    const c = cv.getContext('2d'); const g2 = c.createLinearGradient(0, 0, cv.width, 0); g2.addColorStop(0, '#0a1030'); g2.addColorStop(1, '#10163a'); c.fillStyle = g2; c.fillRect(0, 0, cv.width, cv.height); c.setTransform(k, 0, 0, k, 0, 0);
    let x = 3;
    for (const pair of names) for (const n of pair) { GFX.draw(c, n, 0, x, 3); x += cell; }
    rows.push({ k, cv });
  }
  const out = document.createElement('canvas'); out.width = Math.max(...rows.map(r => r.cv.width)) * zoom; out.height = rows.reduce((a, r) => a + r.cv.height * zoom + 14, 0);
  const o = out.getContext('2d'); o.fillStyle = '#000'; o.fillRect(0, 0, out.width, out.height); o.imageSmoothingEnabled = false; let y = 0;
  for (const r of rows) { o.fillStyle = '#9bd'; o.font = '11px monospace'; o.fillText('k=' + r.k + '  (nibbler calm/angry, crabbit, jellop, springle, glimmer, P1/P2)', 2, y + 10); y += 14; o.drawImage(r.cv, 0, y, r.cv.width * zoom, r.cv.height * zoom); y += r.cv.height * zoom; }
  return out.toDataURL('image/png');
});
save(`${OUT}/smallk/angry_calm_small.png`, url);
await t.close();
