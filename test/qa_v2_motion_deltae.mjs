// pairwise colour distance (CIE76 dE in Lab) of each sprite's lit-pixel mean colour under CVD simulation; flags pairs that are colour-confusable
import { setup, OUT } from './qa_v2_motion_lib.mjs';
import fs from 'fs';
const { t, g, page } = await setup();
const res = await page.evaluate(() => {
  const GFX = window.__fizzpop.GFX; const k = 4; GFX.setScale(k);
  const items = [['P1', 'p1_idle', 0], ['P2', 'p2_idle', 0], ['nibbler', 'nibbler_move', 0], ['crabbit', 'crabbit_move', 0], ['jellop', 'jellop_move', 0], ['springle', 'springle_move', 0], ['glimmer', 'glimmer_move', 0], ['bonefin', 'bonefin', 0], ['kraken', 'kraken', 0],
    ['nibblerA', 'nibbler_angry', 0], ['crabbitA', 'crabbit_angry', 0], ['jellopA', 'jellop_angry', 0], ['springleA', 'springle_angry', 0], ['glimmerA', 'glimmer_angry', 0], ['krakenA', 'kraken_angry', 0],
    ['thunder', 'bubble_thunder', 0], ['fire', 'bubble_fire', 0], ['water', 'bubble_water', 0], ['letter', 'bubble_letter', 0], ['bubble', 'bubble', 0],
    ['pu_pink', 'pu_pink', 0], ['pu_blue', 'pu_blue', 0], ['pu_gold', 'pu_gold', 0], ['pu_shoes', 'pu_shoes', 0], ['pu_heart', 'pu_heart', 0], ['pu_clock', 'pu_clock', 0], ['pu_bomb', 'pu_bomb', 0], ['pu_parasol', 'pu_parasol', 0]];
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const toLab = (r, g, b) => { const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883; const f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))]; };
  const M = { normal: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]], protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]], tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]] };
  const desc = {};
  for (const [id, name] of items) {
    const sz = GFX.size(name); const W = Math.ceil((sz.w + 24) * k), H = Math.ceil((sz.h + 24) * k);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, W, H); c.setTransform(k, 0, 0, k, 0, 0); GFX.draw(c, name, 0, 12, 12);
    const d = c.getImageData(0, 0, W, H).data; let sr = 0, sg = 0, sb = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { const l = 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]); if (l > 0.25) { sr += lin(d[i]); sg += lin(d[i + 1]); sb += lin(d[i + 2]); n++; } }
    // saturated halo colour: pixels luma between .06 and .25 (the coloured glow around the white-hot core)
    let hr = 0, hg = 0, hb = 0, hn = 0;
    for (let i = 0; i < d.length; i += 4) { const l = 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]); if (l > 0.06 && l <= 0.25) { hr += lin(d[i]); hg += lin(d[i + 1]); hb += lin(d[i + 2]); hn++; } }
    desc[id] = { core: n ? [sr / n, sg / n, sb / n] : [0, 0, 0], halo: hn ? [hr / hn, hg / hn, hb / hn] : [0, 0, 0], n, hn };
  }
  const sim = (rgb, m) => { const A = M[m]; return [0, 1, 2].map(i => Math.max(0, Math.min(1, A[i][0] * rgb[0] + A[i][1] * rgb[1] + A[i][2] * rgb[2]))); };
  const out = {};
  for (const m of Object.keys(M)) {
    const labs = {}; for (const id of Object.keys(desc)) labs[id] = toLab(...sim(desc[id].halo, m));
    const pairs = []; const ids = Object.keys(desc);
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const a = labs[ids[i]], b = labs[ids[j]]; pairs.push([ids[i], ids[j], +Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]).toFixed(1)]); }
    pairs.sort((x, y) => x[2] - y[2]); out[m] = pairs;
  }
  out.desc = Object.fromEntries(Object.entries(desc).map(([k, v]) => [k, { halo: v.halo.map(x => +x.toFixed(3)), n: v.n, hn: v.hn }]));
  return out;
});
fs.writeFileSync(`${OUT}/cvd/deltaE.json`, JSON.stringify(res));
for (const m of ['normal', 'deutan', 'protan', 'tritan']) console.log(m, 'lowest dE (halo colour):', res[m].slice(0, 14).map(p => `${p[0]}~${p[1]}:${p[2]}`).join('  '));
await t.close();
