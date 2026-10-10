// Figure/ground: for each sprite (players + 5 enemies, normal+angry) and each of 30 tile looks, how many of the sprite's body pixels
// are within dE76 < 14 of ANY tile palette colour (camouflage fraction). Also sprite-to-sprite dE between the 5 enemies' mean colours.
import fs from 'fs';
import path from 'path';
import { launch, fp, PROJECT } from '../tools/harness.mjs';
const OUT = path.join(PROJECT, 'out/qa/visual/tiles');
const t = await launch();
const g = fp(t.page); await g.freeze(true);
const res = await g.evaluate(() => {
  const { GFX, LEVELS } = fz;
  const lab = (r, g, b) => {
    const f = (v) => { v /= 255; return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92; };
    let R = f(r), G = f(g), B = f(b);
    let X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    const h = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
    return [116 * h(Y) - 16, 500 * (h(X) - h(Y)), 200 * (h(Y) - h(Z))];
  };
  const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const spritePx = (name, frame) => {
    const sz = GFX.size(name); const c = document.createElement('canvas'); c.width = sz.w; c.height = sz.h; const x = c.getContext('2d', { willReadFrequently: true });
    GFX.draw(x, name, frame, 0, 0); const d = x.getImageData(0, 0, sz.w, sz.h).data; const px = [];
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) px.push([d[i], d[i + 1], d[i + 2]]);
    // drop outline: darkest 25% by L*
    const L = px.map((p) => lab(...p)[0]); const sorted = [...L].sort((a, b) => a - b); const cut = sorted[Math.floor(sorted.length * 0.3)];
    return px.filter((p, i) => L[i] > cut).map((p) => ({ rgb: p, lab: lab(...p) }));
  };
  const sprites = ['p1_idle', 'p2_idle', 'nibbler_move', 'crabbit_move', 'jellop_move', 'springle_move', 'glimmer_move', 'nibbler_angry', 'crabbit_angry', 'jellop_angry', 'springle_angry', 'glimmer_angry'];
  const sp = {}; for (const s of sprites) sp[s] = spritePx(s, 0);
  const tilePal = (r) => {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 208; const x = cv.getContext('2d', { willReadFrequently: true });
    x.drawImage(GFX.levelCanvas(r, LEVELS[r].map), 0, 0); const d = x.getImageData(0, 0, 256, 208).data; const cnt = new Map();
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 250) { const k = d[i] + ',' + d[i + 1] + ',' + d[i + 2]; cnt.set(k, (cnt.get(k) || 0) + 1); }
    const tot = [...cnt.values()].reduce((a, b) => a + b, 0);
    return [...cnt.entries()].filter(([, n]) => n / tot > 0.015).map(([k]) => lab(...k.split(',').map(Number)));
  };
  const out = { camo: {}, enemyMeanDE: {} };
  for (let r = 0; r < 30; r++) {
    const pal = tilePal(r); out.camo[r + 1] = {};
    for (const s of sprites) {
      let near = 0; for (const p of sp[s]) { let m = 1e9; for (const q of pal) m = Math.min(m, dE(p.lab, q)); if (m < 14) near++; }
      out.camo[r + 1][s] = +(near / sp[s].length).toFixed(2);
    }
  }
  const mean = (arr) => { const n = arr.length; return [0, 1, 2].map((k) => arr.reduce((a, p) => a + p.lab[k], 0) / n); };
  const names = ['nibbler_move', 'crabbit_move', 'jellop_move', 'springle_move', 'glimmer_move'];
  for (const a of names) for (const b of names) if (a < b) out.enemyMeanDE[a + ' vs ' + b] = +dE(mean(sp[a]), mean(sp[b])).toFixed(1);
  out.playersVsEnemies = {}; for (const p of ['p1_idle', 'p2_idle']) for (const e of names) out.playersVsEnemies[p + ' vs ' + e] = +dE(mean(sp[p]), mean(sp[e])).toFixed(1);
  return out;
});
fs.writeFileSync(path.join(OUT, 'camouflage.json'), JSON.stringify(res, null, 1));
console.log('enemy mean dE', JSON.stringify(res.enemyMeanDE));
console.log('players vs enemies', JSON.stringify(res.playersVsEnemies));
// worst combos
const rows = [];
for (const [r, o] of Object.entries(res.camo)) for (const [s, f] of Object.entries(o)) rows.push([+r, s, f]);
rows.sort((a, b) => b[2] - a[2]);
console.log('worst 40 camo (round, sprite, fraction of body px within dE14 of a tile colour):');
for (const x of rows.slice(0, 40)) console.log(x.join('  '));
// per sprite average over rounds
const avg = {}; for (const [r, s, f] of rows) { avg[s] = (avg[s] || 0) + f / 30; }
console.log('avg per sprite', JSON.stringify(Object.fromEntries(Object.entries(avg).map(([k, v]) => [k, +v.toFixed(2)]))));
await t.close();
