import { setup, OUT, save } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
const url = await page.evaluate(() => {
  const GFX = window.__fizzpop.GFX;
  const names = ['bubble', 'bubble_thunder', 'bubble_fire', 'bubble_water', 'bubble_letter', 'pu_pink', 'pu_blue', 'pu_gold', 'pu_shoes', 'pu_clock', 'pu_bomb', 'pu_heart', 'pu_parasol'];
  const ks = [1.5, 2]; const zoom = 4; const cell = 20;
  const modes = ['normal', 'deutan', 'gray'];
  const out = document.createElement('canvas'); out.width = names.length * (cell * 2 * zoom + 2); out.height = ks.length * modes.length * (cell * 2 * zoom + 14);
  const o = out.getContext('2d'); o.fillStyle = '#000'; o.fillRect(0, 0, out.width, out.height); o.imageSmoothingEnabled = false;
  let row = 0;
  for (const k of ks) { GFX.setScale(k); for (const m of modes) {
    names.forEach((n, i) => { const cv = document.createElement('canvas'); cv.width = Math.ceil(cell * k); cv.height = Math.ceil(cell * k); const c = cv.getContext('2d'); c.fillStyle = '#080c22'; c.fillRect(0, 0, cv.width, cv.height); c.setTransform(k, 0, 0, k, 0, 0); GFX.draw(c, n, 0, 2, 2); const s = QA.simCanvas(cv, m); const y = row * (cell * 2 * zoom + 14); o.drawImage(s, i * (cell * 2 * zoom + 2), y + 14, cell * 2 * zoom, cell * 2 * zoom); if (i === 0) { o.fillStyle = '#9bd'; o.font = '10px monospace'; o.fillText('k=' + k + ' ' + m + ': ' + names.join(' '), 2, y + 10); } });
    row++; } }
  return out.toDataURL('image/png');
});
save(`${OUT}/cvd/specials_items_icons.png`, url);
await t.close();
