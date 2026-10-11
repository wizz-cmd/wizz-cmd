import { setup, OUT, save } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
const url = await page.evaluate(() => {
  const GFX = window.__fizzpop.GFX; const zoom = 5;
  const items = [['bubble_thunder', 0], ['bubble_thunder', 1], ['bolt', 0], ['bolt', 1], ['crabbit_trapped', 1], ['glimmer_trapped', 1]];
  const ks = [1.25, 1.5, 2, 3];
  const cell = 26;
  const out = document.createElement('canvas'); out.width = items.length * (cell * 3 * zoom / 3 + 4) * 1.0; 
  const tiles = [];
  for (const k of ks) { GFX.setScale(k); for (const [n, f] of items) { const cv = document.createElement('canvas'); cv.width = Math.ceil(cell * k); cv.height = Math.ceil(cell * k); const c = cv.getContext('2d'); c.fillStyle = '#04060e'; c.fillRect(0, 0, cv.width, cv.height); c.setTransform(k, 0, 0, k, 0, 0); c.globalCompositeOperation = 'source-over'; const sz = GFX.size(n); GFX.draw(c, n, f, (cell - sz.w) / 2, (cell - sz.h) / 2); tiles.push({ cv, k, n, f }); } }
  const cw = cell * 4 * 1.4, rows = ks.length; const W = items.length * (cell * 4 * 1.25 + 4), H = rows * (cell * 4 * 1.25 + 16);
  const o = document.createElement('canvas'); o.width = W; o.height = H; const c = o.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, W, H); c.imageSmoothingEnabled = false;
  tiles.forEach((t, i) => { const r = Math.floor(i / items.length), cc = i % items.length; const s = cell * 4 * 1.25; c.drawImage(t.cv, cc * (s + 4), r * (s + 16) + 14, s, s); c.fillStyle = '#9bd'; c.font = '10px monospace'; c.fillText(`k${t.k} ${t.n} f${t.f}`, cc * (s + 4) + 2, r * (s + 16) + 10); });
  return o.toDataURL('image/png');
});
save(`${OUT}/gfx_clip_view.png`, url);
await t.close();
