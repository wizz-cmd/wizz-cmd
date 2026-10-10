// QA visual: contrast of HUD round number vs wall, lives icons vs wall, EXTEND letters vs wall, for all 30 rounds.
import fs from 'fs';
import path from 'path';
import { launch, canvasShot, fp, PROJECT } from '../tools/harness.mjs';
const OUT = path.join(PROJECT, 'out/qa/visual/hud');
const t = await launch({ viewport: { width: 1280, height: 800 } });
const g = fp(t.page);
await g.freeze(true);
const res = await g.evaluate(() => {
  const out = [];
  const lum = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const cr = (a, b) => { const l1 = lum(...a), l2 = lum(...b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const cv = document.getElementById('screen'); const cx = cv.getContext('2d', { willReadFrequently: true });
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  for (let r = 1; r <= 30; r++) {
    fz.start(1, r, 7); fz.step(5);
    const th = fz.GFX.theme(r - 1);
    // sample wall region left x 0..16 at y 20..28 digit zone, plus a pure wall region above/below for baseline
    const d = cx.getImageData(0, 20, 16, 8).data;
    const acc = hex(th.accent2);
    let bgs = [], match = 0;
    for (let i = 0; i < d.length; i += 4) {
      const p = [d[i], d[i + 1], d[i + 2]];
      if (Math.abs(p[0] - acc[0]) + Math.abs(p[1] - acc[1]) + Math.abs(p[2] - acc[2]) < 12) match++; else bgs.push(p);
    }
    // wall colour: average of non-digit pixels in wall rows further down (y 130..150) (no HUD overlays)
    const w = cx.getImageData(0, 150, 16, 20).data;
    let wr = 0, wg = 0, wb = 0, n = 0;
    for (let i = 0; i < w.length; i += 4) { wr += w[i]; wg += w[i + 1]; wb += w[i + 2]; n++; }
    const wallAvg = [wr / n, wg / n, wb / n].map(Math.round);
    // life icon area (x 4..12, y 204..212) vs wall
    const wallLum = cr(acc, wallAvg);
    // pixel level: min contrast of digit colour vs each neighbouring non-digit pixel
    let worst = 99, best = 0; for (const p of bgs) { const c = cr(acc, p); worst = Math.min(worst, c); best = Math.max(best, c); }
    // pink life icon colour (P1) vs wall
    out.push({ r, theme: th.name, accent2: th.accent2, digitPx: match, wallAvg, cr_digit_vs_wallAvg: +wallLum.toFixed(2), worstPx: +worst.toFixed(2) });
  }
  return out;
});
for (const x of res) console.log(JSON.stringify(x));
fs.writeFileSync(path.join(OUT, 'round_digit_contrast.json'), JSON.stringify(res, null, 1));
// HUD closeups at x8 for rounds 1,6,11,16,21,26: left wall column top + bottom
for (const r of [1, 6, 11, 16, 21, 26]) {
  await g.start(1, r, 7); await g.step(5);
  await t.page.evaluate(({ r }) => { }, { r });
  await canvasShot(t.page, path.join(OUT, `hud_r${r}.png`), { scale: 1 });
}
console.log('errors', t.errors);
await t.close();
