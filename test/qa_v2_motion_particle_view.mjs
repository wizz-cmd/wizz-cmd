import { setup, OUT, save } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
const url = await page.evaluate(() => {
  const GFX = window.__fizzpop.GFX;
  const rows = [['streak', [1, 1.6, 2.6, 3.2, 4.6, 6]], ['ring', [0.3, 0.6, 1, 1.6, 2.6, 4.6]], ['spark', [0.3, 0.6, 1, 1.6, 2.6, 4]], ['dot', [0.3, 0.6, 1, 1.6, 2.6, 4]]];
  const ks = [1.5, 2, 3];
  const zoom = 3, cell = 28;
  const blocks = [];
  for (const k of ks) {
    GFX.setScale(k);
    const cv = document.createElement('canvas'); cv.width = Math.ceil(cell * 6 * k); cv.height = Math.ceil(cell * rows.length * k);
    const c = cv.getContext('2d'); c.fillStyle = '#05070f'; c.fillRect(0, 0, cv.width, cv.height); c.setTransform(k, 0, 0, k, 0, 0); c.globalCompositeOperation = 'lighter';
    rows.forEach(([kind, sizes], r) => sizes.forEach((s, i) => { GFX.particle(c, kind, cell * i + cell / 2, cell * r + cell / 2, s, '#3cf2ff', 1, 0); }));
    blocks.push({ k, cv });
  }
  const out = document.createElement('canvas'); out.width = Math.max(...blocks.map(b => b.cv.width)) * zoom / 1; out.height = blocks.reduce((a, b) => a + b.cv.height * 1.5 + 14, 0);
  const o = out.getContext('2d'); o.fillStyle = '#000'; o.fillRect(0, 0, out.width, out.height); o.imageSmoothingEnabled = false; let y = 0;
  for (const b of blocks) { o.fillStyle = '#9bd'; o.font = '11px monospace'; o.fillText('k=' + b.k + ' rows: streak, ring, spark, dot; sizes grow left->right', 2, y + 10); y += 14; o.drawImage(b.cv, 0, y, b.cv.width * 1.5, b.cv.height * 1.5); y += b.cv.height * 1.5; }
  return out.toDataURL('image/png');
});
save(`${OUT}/gfx_particles.png`, url);
await t.close();
