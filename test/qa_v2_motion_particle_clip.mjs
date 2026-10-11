// GFX.particle cached additive sprites: alpha on the outer ring of their painted bounding box (a hard cut = clipped halo)
import { setup, OUT } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
const res = await page.evaluate(() => {
  const GFX = window.__fizzpop.GFX; const out = [];
  for (const k of [1, 1.5, 2, 3, 4]) {
    GFX.setScale(k);
    for (const kind of ['dot', 'ring', 'spark', 'streak']) for (const size of [0.3, 0.6, 1, 1.6, 2.6, 3.2, 4.6, 6, 8, 12]) for (const col of ['#ffffff', '#ff2a2a', '#3cf2ff']) {
      const W = Math.ceil(120 * k), H = W; const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d'); c.setTransform(k, 0, 0, k, 0, 0);
      c.globalCompositeOperation = 'lighter';
      try { if (kind === 'ring') GFX.particle(c, kind, 60, 60, size, col, 1); else GFX.particle(c, kind, 60, 60, size, col, 1, kind === 'streak' ? 0 : undefined); } catch (e) { continue; }
      const d = c.getImageData(0, 0, W, H).data; let x0 = W, y0 = H, x1 = -1, y1 = -1;
      const A = (x, y) => d[(y * W + x) * 4 + 3];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (A(x, y) > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 < 0) continue;
      let edge = 0; for (let x = x0; x <= x1; x++) edge = Math.max(edge, A(x, y0), A(x, y1)); for (let y = y0; y <= y1; y++) edge = Math.max(edge, A(x0, y), A(x1, y));
      out.push({ k, kind, size, col, edge, w: x1 - x0 + 1, h: y1 - y0 + 1 });
    }
  }
  return out;
});
const bad = res.filter(r => r.edge >= 14);
console.log('checked', res.length, 'flagged (outer ring value >= 14/255):', bad.length);
const by = {}; for (const b of bad) { const key = `${b.kind} size ${b.size}`; (by[key] = by[key] || []).push(`k${b.k}:${b.col.slice(1)}:${b.edge}`); }
for (const [k, v] of Object.entries(by).slice(0, 25)) console.log(k.padEnd(18), v.slice(0, 6).join(' '));
await t.close();
