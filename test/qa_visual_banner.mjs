// ROUND n banner (2x, accent2, y=84..100, centred) legibility: share of banner-box pixels that are tile pixels within dE76<30 of the text colour.
import fs from 'fs';
import path from 'path';
import { launch, fp, PROJECT } from '../tools/harness.mjs';
const OUT = path.join(PROJECT, 'out/qa/visual/tiles');
const t = await launch(); const g = fp(t.page); await g.freeze(true);
const res = await g.evaluate(() => {
  const { GFX, LEVELS } = fz;
  const lab = (r, g, b) => { const f = (v) => { v /= 255; return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92; }; let R = f(r), G = f(g), B = f(b); let X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883; const h = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116); return [116 * h(Y) - 16, 500 * (h(X) - h(Y)), 200 * (h(Y) - h(Z))]; };
  const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const out = [];
  for (let r = 0; r < 30; r++) {
    const w = ('ROUND ' + (r + 1)).length * 16; const x0 = Math.round(128 - w / 2), y0 = 84 - 16; // y relative to map (MAP_Y=16)
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 208; const x = cv.getContext('2d', { willReadFrequently: true });
    x.drawImage(GFX.levelCanvas(r, LEVELS[r].map), 0, 0);
    const d = x.getImageData(x0, y0, w, 16).data; const txt = lab(...hex(GFX.theme(r).accent2)); let tile = 0, near = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 250) { tile++; if (dE(lab(d[i], d[i + 1], d[i + 2]), txt) < 30) near++; }
    out.push({ r: r + 1, text: GFX.theme(r).accent2, tileCover: +(tile / (w * 16)).toFixed(2), tilePxNearTextColour: +(near / (w * 16)).toFixed(2) });
  }
  return out;
});
fs.writeFileSync(path.join(OUT, 'banner_contrast.json'), JSON.stringify(res));
for (const o of res.filter((o) => o.tileCover > 0.1)) console.log(JSON.stringify(o));
await t.close();
