import { setup, OUT, save } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
const res = await page.evaluate(() => {
  const GFX = window.__fizzpop.GFX; const k = 4; GFX.setScale(k);
  const list = ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer'];
  const zoom = 2, cell = 24 * k;
  const cv = document.createElement('canvas'); cv.width = cell * 8; cv.height = cell * list.length;
  const c = cv.getContext('2d'); c.fillStyle = '#05070f'; c.fillRect(0, 0, cv.width, cv.height); c.setTransform(k, 0, 0, k, 0, 0);
  const stats = {};
  list.forEach((n, r) => {
    for (let f = 0; f < 4; f++) { GFX.draw(c, n + '_move', f, 4 + f * 24, 4 + r * 24); GFX.draw(c, n + '_angry', f, 4 + (f + 4) * 24, 4 + r * 24); }
    // halo (outside-box ring) energy per frame for angry
    const e = [];
    for (const nm of [n + '_move', n + '_angry']) {
      const row = [];
      for (let f = 0; f < 4; f++) {
        const t2 = document.createElement('canvas'); t2.width = 32 * k; t2.height = 32 * k; const g2 = t2.getContext('2d'); g2.setTransform(k, 0, 0, k, 0, 0); GFX.draw(g2, nm, f, 8, 8);
        const d = g2.getImageData(0, 0, t2.width, t2.height).data; let halo = 0, core = 0;
        for (let y = 0; y < t2.height; y++) for (let x = 0; x < t2.width; x++) { const a = d[(y * t2.width + x) * 4 + 3]; const inBox = x >= 8 * k && x < 24 * k && y >= 8 * k && y < 24 * k; if (a > 0) { if (inBox) core += a; else halo += a; } }
        row.push(+(halo / 255 / (k * k)).toFixed(1));
      }
      e.push(row);
    }
    stats[n] = e;
  });
  return { stats, url: cv.toDataURL('image/png') };
});
save(`${OUT}/enemies/angry_vs_calm_frames_k4.png`, res.url);
for (const [n, e] of Object.entries(res.stats)) { const r = e[1]; console.log(n.padEnd(9), 'calm halo alpha-energy per frame', e[0].join(' '), '| angry', r.join(' '), '| angry max/min', (Math.max(...r) / Math.min(...r)).toFixed(3)); }
await t.close();
