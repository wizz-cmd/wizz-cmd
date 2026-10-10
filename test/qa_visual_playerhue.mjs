import { launch, fp } from '../tools/harness.mjs';
const t = await launch(); const g = fp(t.page); await g.freeze(true);
const res = await g.evaluate(() => {
  const G = fz.GFX;
  const lab = (r, g, b) => { const f = (v) => { v /= 255; return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92; }; let R = f(r), G2 = f(g), B = f(b); let X = (R * 0.4124 + G2 * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G2 * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G2 * 0.1192 + B * 0.9505) / 1.08883; const h = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116); return [116 * h(Y) - 16, 500 * (h(X) - h(Y)), 200 * (h(Y) - h(Z))]; };
  const mean = (n) => { const sz = G.size(n); const c = document.createElement('canvas'); c.width = sz.w; c.height = sz.h; const x = c.getContext('2d', { willReadFrequently: true }); G.draw(x, n, 0, 0, 0); const d = x.getImageData(0, 0, sz.w, sz.h).data; const px = []; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) px.push(lab(d[i], d[i + 1], d[i + 2])); const L = px.map((p) => p[0]).sort((a, b) => a - b); const cut = L[Math.floor(L.length * 0.3)]; const b = px.filter((p) => p[0] > cut); return [0, 1, 2].map((k) => b.reduce((a, p) => a + p[k], 0) / b.length); };
  const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const o = {};
  for (const p of ['p1_idle', 'p2_idle']) for (const e of ['nibbler_angry', 'crabbit_angry', 'jellop_angry', 'springle_angry', 'glimmer_angry', 'bubble']) o[p + ' vs ' + e] = +dE(mean(p), mean(e)).toFixed(1);
  return o;
});
console.log(JSON.stringify(res, null, 1));
await t.close();
