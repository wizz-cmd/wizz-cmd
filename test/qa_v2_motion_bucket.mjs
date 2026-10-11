// Scale-bucket art drift: per-sprite light energy (sum of luminance per logical px^2) and contour thickness proxy across k.
import { setup, OUT, save } from './qa_v2_motion_lib.mjs';
import fs from 'fs';
const { t, g, page } = await setup();
const res = await page.evaluate(() => {
  const GFX = window.__fizzpop.GFX;
  const names = ['p1_idle', 'p2_walk', 'nibbler_move', 'crabbit_angry', 'jellop_move', 'springle_move', 'glimmer_move', 'bonefin', 'bubble', 'trap_overlay', 'food_0', 'pu_gold', 'bubble_thunder'];
  const ks = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75, 4, 4.5, 5, 6];
  const out = {};
  const dataUrls = {};
  for (const n of names) {
    out[n] = [];
    for (const k of ks) {
      GFX.setScale(k);
      const M = 10, W = Math.ceil((16 + 2 * M) * k), H = W;
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const c = cv.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, W, H); c.setTransform(k, 0, 0, k, 0, 0);
      GFX.draw(c, n, 0, M, M);
      const d = c.getImageData(0, 0, W, H).data;
      let e = 0, bright = 0, nb = 0;
      for (let i = 0; i < d.length; i += 4) { const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; e += l; if (l > 140) { bright++; } }
      out[n].push({ k, energy: +(e / (k * k) / 255).toFixed(2), hotArea: +(bright / (k * k)).toFixed(2) });
    }
  }
  return out;
});
fs.writeFileSync(`${OUT}/bucket_energy.json`, JSON.stringify(res));
const ks = res.p1_idle.map(r => r.k);
console.log('energy per logical px^2 (sum luma/255), lower k -> higher k');
console.log('sprite'.padEnd(16) + ks.map(k => String(k).padStart(6)).join(''));
for (const [n, rows] of Object.entries(res)) console.log(n.padEnd(16) + rows.map(r => String(r.energy).padStart(6)).join(''));
console.log('hot (luma>140) area in logical px^2');
for (const [n, rows] of Object.entries(res)) console.log(n.padEnd(16) + rows.map(r => String(r.hotArea).padStart(6)).join(''));
await t.close();
