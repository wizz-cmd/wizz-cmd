import { setup, OUT, save } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
const url = await page.evaluate(() => {
  const GFX = window.__fizzpop.GFX;
  const ks = [1.25, 1.5, 2, 3];
  const lines = ['0123456789 ABCDEFGHIJKLM', 'NOPQRSTUVWXYZ .,:!?-+/<>()', 'O0 8B 5S 2Z 1I L1 6G 9Q U V W M N H'];
  const pad = 4, rowH = 12, W = 220;
  const sheets = [];
  for (const k of ks) {
    GFX.setScale(k);
    const cv = document.createElement('canvas'); cv.width = Math.ceil(W * k); cv.height = Math.ceil((lines.length * rowH + pad) * k);
    const c = cv.getContext('2d'); c.fillStyle = '#070a1c'; c.fillRect(0, 0, cv.width, cv.height); c.setTransform(k, 0, 0, k, 0, 0); c.imageSmoothingEnabled = true;
    lines.forEach((s, i) => GFX.text(c, s, 4, 8 + i * rowH, '#d8ecff', { align: 'left' }));
    // also a dim-coloured sample as used in HUD for labels
    sheets.push({ k, cv });
  }
  const zoom = 3;
  const out = document.createElement('canvas'); out.width = Math.max(...sheets.map(s => s.cv.width)) * zoom; out.height = sheets.reduce((a, s) => a + s.cv.height * zoom + 14, 0);
  const o = out.getContext('2d'); o.fillStyle = '#000'; o.fillRect(0, 0, out.width, out.height); o.imageSmoothingEnabled = false;
  let y = 0;
  for (const s of sheets) { o.fillStyle = '#9bd'; o.font = '11px monospace'; o.fillText('k=' + s.k + ' (shown ' + zoom + 'x nearest)', 2, y + 10); y += 14; o.drawImage(s.cv, 0, y, s.cv.width * zoom, s.cv.height * zoom); y += s.cv.height * zoom; }
  return out.toDataURL('image/png');
});
save(`${OUT}/smallk/font_k.png`, url);
await t.close();
