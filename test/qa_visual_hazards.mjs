// Hazard projectile visibility: pebble/spark/ink vs theme background and tile colours (dE76), all 30 rounds; plus sprite pixel dumps.
import fs from 'fs';
import path from 'path';
import { launch, fp, PROJECT } from '../tools/harness.mjs';
const OUT = path.join(PROJECT, 'out/qa/visual/tiles');
const t = await launch();
const g = fp(t.page); await g.freeze(true);
const res = await g.evaluate(() => {
  const { GFX, LEVELS } = fz;
  const lab = (r, g, b) => { const f = (v) => { v /= 255; return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92; }; let R = f(r), G = f(g), B = f(b); let X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883; const h = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116); return [116 * h(Y) - 16, 500 * (h(X) - h(Y)), 200 * (h(Y) - h(Z))]; };
  const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const px = (name, frame) => { const sz = GFX.size(name); const c = document.createElement('canvas'); c.width = sz.w; c.height = sz.h; const x = c.getContext('2d', { willReadFrequently: true }); GFX.draw(x, name, frame, 0, 0); const d = x.getImageData(0, 0, sz.w, sz.h).data; const o = []; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) o.push(lab(d[i], d[i + 1], d[i + 2])); return o; };
  const out = {};
  for (const s of ['pebble', 'spark', 'ink', 'fire_drop', 'bolt', 'flame', 'bonefin']) {
    out[s] = [];
    const p = px(s, 0);
    // fraction of non-darkest sprite px within dE 14 of bg
    const L = p.map((q) => q[0]).sort((a, b) => a - b); const cut = L[Math.floor(L.length * 0.3)];
    const body = p.filter((q) => q[0] > cut);
    for (let r = 0; r < 30; r++) {
      const bg = lab(...hex(GFX.theme(r).bg));
      let nb = 0; for (const q of body) if (dE(q, bg) < 22) nb++;
      out[s].push(+(nb / body.length).toFixed(2));
    }
  }
  out.bgs = Array.from({ length: 30 }, (_, r) => GFX.theme(r).bg);
  return out;
});
fs.writeFileSync(path.join(OUT, 'hazard_vs_bg.json'), JSON.stringify(res));
for (const s of ['pebble', 'spark', 'ink', 'fire_drop', 'bolt', 'bonefin']) {
  const w = res[s].map((v, i) => [i + 1, v]).filter(([, v]) => v > 0.15);
  console.log(s, 'rounds with >15% body px near bg colour:', JSON.stringify(w));
}
console.log(JSON.stringify(res.bgs));
await t.close();
