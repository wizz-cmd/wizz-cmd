// QA3 art: how visible is the bgCanvas silhouette art per round? dE76 of each pixel vs the row-median colour (= the base gradient); also vs the
// tile colours and the sprite colours that must stay readable (bubble fill, Fizz/Pop body).
import path from 'path';
import fs from 'fs';
import { launch, PROJECT } from '../tools/harness.mjs';
import { patchDist } from './qa3_art_patchlib.mjs';
const patched = process.argv.includes('--patched') ? patchDist('fizzpop_bgsil.html', [['const silhouette = rgbOf(pal[4]), layers = [];', 'const silhouette = (() => { const c = rgbOf(pal[4]); const k = [2, 5].includes(themeOf(idx)) ? 0.55 : 0; return c.map((v) => v + (255 - v) * k); })(), layers = [];']]) : null;
const t = await launch(patched ? { html: patched } : {});
await t.page.waitForFunction(() => !!window.__fizzpop);
const r = await t.page.evaluate(() => {
  const lab = (r, g, b) => { const f = (v) => { v /= 255; return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92; }; const R = f(r), G = f(g), B = f(b); const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883; const h = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116); return [116 * h(Y) - 16, 500 * (h(X) - h(Y)), 200 * (h(Y) - h(Z))]; };
  const out = [];
  for (let r = 0; r < 30; r++) {
    const cv = window.__fizzpop.GFX.bgCanvas(r); const x = cv.getContext('2d', { willReadFrequently: true }); const d = x.getImageData(0, 0, 256, 208).data;
    const devs = []; let lmax = 0, lsum = 0;
    for (let y = 0; y < 208; y++) {
      const row = []; for (let xx = 0; xx < 256; xx++) { const i = (y * 256 + xx) * 4; row.push(lab(d[i], d[i + 1], d[i + 2])); }
      const med = [0, 1, 2].map((k) => row.map((p) => p[k]).sort((a, b) => a - b)[128]);
      for (const p of row) { devs.push(Math.hypot(p[0] - med[0], p[1] - med[1], p[2] - med[2])); lsum += p[0]; lmax = Math.max(lmax, p[0]); }
    }
    devs.sort((a, b) => a - b);
    out.push({ round: r + 1, p90: +devs[Math.floor(devs.length * 0.9)].toFixed(2), p99: +devs[Math.floor(devs.length * 0.99)].toFixed(2), max: +devs[devs.length - 1].toFixed(2), meanL: +(lsum / devs.length).toFixed(2), maxL: +lmax.toFixed(2) });
  }
  return out;
});
for (const o of r) console.log(JSON.stringify(o));
fs.writeFileSync(path.join(PROJECT, patched ? 'out/qa3/art/bgstats_patched.json' : 'out/qa3/art/bgstats.json'), JSON.stringify(r, null, 1));
await t.close();
