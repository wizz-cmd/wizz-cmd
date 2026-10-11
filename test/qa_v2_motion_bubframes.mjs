// all frames of the bubble family at k=4 for luminance/shape differences between frames (blink amplitude)
import { setup, OUT, save } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
const out = await page.evaluate(() => {
  const GFX = window.__fizzpop.GFX; const k = 4; GFX.setScale(k);
  const names = [['bubble', 2], ['bubble_warn', 2], ['bubble_shot', 3], ['trap_overlay', 3], ['bubble_pop', 3], ['bubble_thunder', 2], ['bubble_fire', 2], ['bubble_water', 2], ['bubble_letter', 2], ['nibbler_trapped', 2], ['p1_idle', 2], ['p1_walk', 4], ['nibbler_move', 4], ['nibbler_angry', 4], ['crabbit_move', 4], ['crabbit_angry', 4], ['jellop_move', 4], ['springle_move', 4], ['glimmer_move', 4], ['bonefin', 2], ['sparkle', 4], ['poof', 3], ['flame', 3]];
  const res = []; const cells = [];
  for (const [n, f] of names) {
    const row = [];
    for (let i = 0; i < f; i++) {
      const cv = document.createElement('canvas'); cv.width = 24 * k; cv.height = 24 * k; const c = cv.getContext('2d'); c.fillStyle = '#05070f'; c.fillRect(0, 0, cv.width, cv.height); c.setTransform(k, 0, 0, k, 0, 0);
      GFX.draw(c, n, i, 4, 4);
      const d = c.getImageData(0, 0, cv.width, cv.height).data; let e = 0; for (let p = 0; p < d.length; p += 4) e += 0.2126 * d[p] + 0.7152 * d[p + 1] + 0.0722 * d[p + 2];
      row.push(+(e / (k * k) / 255).toFixed(1)); cells.push({ n, i, cv });
    }
    res.push([n, row]);
  }
  const cols = 8, cw = 24 * k, rows = Math.ceil(cells.length / cols);
  const o = document.createElement('canvas'); o.width = cols * (cw + 2); o.height = rows * (cw + 14);
  const c = o.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, o.width, o.height);
  cells.forEach((cell, j) => { const x = (j % cols) * (cw + 2), y = Math.floor(j / cols) * (cw + 14); c.drawImage(cell.cv, x, y + 12); c.fillStyle = '#9bd'; c.font = '9px monospace'; c.fillText(cell.n + ' ' + cell.i, x + 1, y + 9); });
  return { res, url: o.toDataURL('image/png') };
});
save(`${OUT}/bubbles/frames_k4.png`, out.url);
for (const [n, row] of out.res) console.log(n.padEnd(16), row.join('  '), row.length > 1 ? ' ratio ' + (Math.max(...row) / Math.min(...row)).toFixed(2) : '');
await t.close();
