// World canvas bake cost (synchronous drain = what a round start pays when the prefetch did not finish): levelCanvas + bgCanvas for all 30 rounds at several k
import fs from 'fs';
import { open, OUT } from './qa_v2_perf_lib.mjs';
const kList = (process.argv[2] || '2,3,4,6,8').split(',').map(Number);
const res = {};
for (const k of kList) {
  const t = await open({ vw: 1280, vh: 1000, dpr: 1 });
  const r = await t.page.evaluate((k) => {
    const fzp = window.__fizzpop, G = fzp.GFX; fzp.freeze(true);
    G._reset(); G.setScale(k);
    const L = fzp.LEVELS, out = [];
    let maxStep = 0;
    for (let i = 0; i < 30; i++) {
      G._reset(); G.setScale(k);                      // cold
      let a = performance.now(); G.bgCanvas(i); const bg = performance.now() - a;
      a = performance.now(); const lc = G.levelCanvas(i, L[i].map); const lv = performance.now() - a;
      out.push({ i, bg: +bg.toFixed(1), lv: +lv.toFixed(1), lvW: lc.width, lvH: lc.height });
    }
    const st = G._stats();
    return { out, kb: st.kb };
  }, k);
  const bgs = r.out.map((o) => o.bg), lvs = r.out.map((o) => o.lv);
  const f = (a) => `avg ${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1)} min ${Math.min(...a).toFixed(1)} max ${Math.max(...a).toFixed(1)}`;
  console.log(`k=${k} kb=${r.kb}: bgCanvas ${f(bgs)} ms | levelCanvas ${f(lvs)} ms | level canvas ${r.out[0].lvW}x${r.out[0].lvH}`);
  const worst = r.out.slice().sort((a, b) => (b.bg + b.lv) - (a.bg + a.lv)).slice(0, 3).map((o) => `R${o.i + 1} bg ${o.bg} lv ${o.lv}`).join('; ');
  console.log('   worst: ' + worst);
  res[k] = r;
  await t.close();
}
fs.writeFileSync(OUT + '/bake_world.json', JSON.stringify(res, null, 1));
