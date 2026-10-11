// First-use cost of derived sprite variants: glow split (getImageData + JS loop), white silhouette, tint (colour-blend), per sprite, at k=4 and 6.
import fs from 'fs';
import { open, OUT } from './qa_v2_perf_lib.mjs';
const out = {};
for (const k of [4, 6]) {
  const t = await open({ vw: 1280, vh: 1000, dpr: 1 });
  const r = await t.page.evaluate((k) => {
    const G = window.__fizzpop.GFX; window.__fizzpop.freeze(true); G._reset(); G.setScale(k);
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256; const g = cv.getContext('2d');
    const reg = G._registry();
    const rows = { glow: [], white: [], tint: [] };
    const items = reg.filter((d) => /^(food_|pu_|moonpearl)/.test(d.name));
    const enemies = reg.filter((d) => /^(nibbler|crabbit|jellop|springle|glimmer)_move$/.test(d.name));
    const fl = () => g.getImageData(0, 0, 1, 1);
    for (const d of items) { G.draw(g, d.name, 0, 10, 10); fl(); const a = performance.now(); G.draw(g, d.name, 0, 10, 10, { glow: 0.5 }); fl(); rows.glow.push([d.name, performance.now() - a]); }
    for (const d of enemies.concat(items.slice(0, 3))) { G.draw(g, d.name, 0, 10, 10); fl(); const a = performance.now(); G.draw(g, d.name, 0, 10, 10, { white: true }); fl(); rows.white.push([d.name, performance.now() - a]); }
    for (const d of enemies) { for (let f = 0; f < d.frames; f++) { G.draw(g, d.name, f, 10, 10); fl(); const a = performance.now(); G.draw(g, d.name, f, 10, 10, { tint: '#4fc8ff' }); fl(); rows.tint.push([d.name + '#' + f, performance.now() - a]); } }
    const sum = (a) => a.reduce((x, y) => x + y[1], 0);
    const mx = (a) => a.reduce((x, y) => Math.max(x, y[1]), 0);
    return { glow: { n: rows.glow.length, avg: sum(rows.glow) / rows.glow.length, max: mx(rows.glow), total: sum(rows.glow) }, white: { n: rows.white.length, avg: sum(rows.white) / rows.white.length, max: mx(rows.white) }, tint: { n: rows.tint.length, avg: sum(rows.tint) / rows.tint.length, max: mx(rows.tint) }, itemSizes: items.slice(0, 3).map((d) => d.name + ' ' + d.w + 'x' + d.h) };
  }, k);
  out[k] = r;
  console.log(`k=${k}: glow-split first use: n=${r.glow.n} avg ${r.glow.avg.toFixed(2)} ms max ${r.glow.max.toFixed(2)} (total ${r.glow.total.toFixed(0)} ms for all items) | white: avg ${r.white.avg.toFixed(2)} max ${r.white.max.toFixed(2)} | tint (frozen): n=${r.tint.n} avg ${r.tint.avg.toFixed(2)} max ${r.tint.max.toFixed(2)}`);
  await t.close();
}
fs.writeFileSync(OUT + '/variants.json', JSON.stringify(out, null, 1));
