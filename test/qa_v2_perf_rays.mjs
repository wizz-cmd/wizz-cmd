import { open } from './qa_v2_perf_lib.mjs';
const t = await open({ vw: 1280, vh: 1000, dpr: 1 });
const r = await t.page.evaluate(() => {
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const cv = mk(1024, 896), g = cv.getContext('2d'); g.setTransform(4, 0, 0, 4, 0, 0);
  g.fillStyle = '#05080f'; g.fillRect(0, 0, 256, 224);
  const out = [], fl = () => g.getImageData(0, 0, 1, 1);
  const bench = (label, fn, n = 30) => { for (let i = 0; i < 5; i++) fn(i); fl(); const t0 = performance.now(); for (let i = 0; i < n; i++) fn(i); fl(); out.push([label, +((performance.now() - t0) / n).toFixed(2)]); };
  const R = 190, N = 14, cx = 128, cy = 98;
  const wedges = (style, comp) => (t) => {
    g.save(); g.globalCompositeOperation = comp;
    const gr = style === 'grad' ? (() => { const q = g.createRadialGradient(cx, cy, 8, cx, cy, R); q.addColorStop(0, 'rgba(200,225,255,0.11)'); q.addColorStop(1, 'rgba(220,240,255,0)'); return q; })() : 'rgba(200,225,255,0.05)';
    g.fillStyle = gr;
    for (let layer = 0; layer < 2; layer++) { const rot = (layer ? -1 : 1) * t * 0.0045 + layer * 0.2; for (let k = 0; k < N; k++) { const ang = rot + k * Math.PI * 2 / N, w = 0.045 + 0.025 * Math.sin(k * 1.7 + layer); g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(ang - w) * R, cy + Math.sin(ang - w) * R); g.lineTo(cx + Math.cos(ang + w) * R, cy + Math.sin(ang + w) * R); g.closePath(); g.fill(); } }
    g.restore();
  };
  bench('28 wedges, radial gradient, lighter (current)', wedges('grad', 'lighter'));
  bench('28 wedges, radial gradient, source-over', wedges('grad', 'source-over'));
  bench('28 wedges, flat colour, lighter', wedges('flat', 'lighter'));
  bench('28 wedges, flat colour, source-over', wedges('flat', 'source-over'));
  const warm = (full) => () => { const q = g.createLinearGradient(0, 224 * 0.45, 0, 224); q.addColorStop(0, 'rgba(255,170,120,0)'); q.addColorStop(1, 'rgba(255,170,120,0.16)'); g.fillStyle = q; if (full) g.fillRect(0, 0, 256, 224); else g.fillRect(0, 224 * 0.45, 256, 224 * 0.55); };
  bench('warm gradient full-frame fillRect (current)', warm(true));
  bench('warm gradient lower 55 % only', warm(false));
  // pre-baked warm gradient drawn 1:1
  const wc = mk(1024, 896), wg = wc.getContext('2d'); wg.setTransform(4, 0, 0, 4, 0, 0); { const q = wg.createLinearGradient(0, 224 * 0.45, 0, 224); q.addColorStop(0, 'rgba(255,170,120,0)'); q.addColorStop(1, 'rgba(255,170,120,0.16)'); wg.fillStyle = q; wg.fillRect(0, 224 * 0.45, 256, 224 * 0.55); }
  bench('warm gradient pre-baked, 1:1 drawImage (lower 55 % rect)', () => { g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(wc, 0, 0, 1024, 896, 0, 896 * 0.45, 1024, 896 * 0.55); g.setTransform(4, 0, 0, 4, 0, 0); });
  return out;
});
for (const [l, ms] of r) console.log(String(ms).padStart(7), 'ms', l);
await t.close();
