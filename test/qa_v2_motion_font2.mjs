import { setup, OUT, save } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
const res = await page.evaluate(() => {
  const GFX = window.__fizzpop.GFX; const out = {}; const pairs = [['O', '0'], ['I', '1'], ['S', '5'], ['B', '8'], ['Z', '2'], ['G', '6'], ['U', 'V'], ['D', '0']];
  const cells = [];
  for (const k of [1.25, 1.5, 2, 3]) {
    GFX.setScale(k);
    const row = [];
    for (const [a, b] of pairs) {
      const px = (ch) => { const cv = document.createElement('canvas'); cv.width = Math.ceil(12 * k); cv.height = Math.ceil(12 * k); const c = cv.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, cv.width, cv.height); c.setTransform(k, 0, 0, k, 0, 0); GFX.text(c, ch, 2, 6, '#ffffff', { align: 'left', glow: false, shadow: false }); return { cv, d: c.getImageData(0, 0, cv.width, cv.height).data }; };
      const A = px(a), B = px(b); let diff = 0, sum = 0; for (let i = 0; i < A.d.length; i += 4) { diff += Math.abs(A.d[i] - B.d[i]); sum += Math.max(A.d[i], B.d[i]); }
      row.push([a + b, +(diff / sum).toFixed(2)]); cells.push({ cv: A.cv, k }); cells.push({ cv: B.cv, k });
    }
    out[k] = row;
  }
  return out;
});
for (const [k, row] of Object.entries(res)) console.log('k=' + k, row.map(r => r.join(':')).join('  '), '   (1.0 = totally different pixels, 0 = identical)');
await t.close();
