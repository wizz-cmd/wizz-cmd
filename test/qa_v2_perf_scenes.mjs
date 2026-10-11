// Per-scene frame cost (update+render+postFX with raster flush) for every non-play scene at k=3,4,6 and quality 0/2, + break-down of postFX share
import fs from 'fs';
import { open, K_VIEWS, stat, OUT } from './qa_v2_perf_lib.mjs';
const out = {};
for (const k of [3, 4, 6]) {
  const [vw, vh, dpr] = K_VIEWS[k];
  const t = await open({ vw, vh, dpr });
  await t.page.evaluate(() => { fz = window.__fizzpop; fz.freeze(true); });
  await t.page.waitForTimeout(500);
  for (const sc of ['title', 'story', 'howto', 'scores', 'entry', 'ending']) {
    for (const q of [0, 2]) {
      const r = await t.page.evaluate(({ sc, q }) => {
        try { fz._main.setQuality(q, true); fz.goto(sc, sc === 'story' ? { next: { players: 1, level: 1, seed: 1 } } : sc === 'entry' ? { entries: [{ pi: 0, score: 12345, round: 5 }], players: 1 } : sc === 'ending' ? { players: 1, scores: [100000, 0] } : null); } catch (e) { return { err: String(e) }; }
        const cx = document.getElementById('screen').getContext('2d');
        for (let i = 0; i < 40; i++) fz.step(1);
        const a = [];
        for (let i = 0; i < 120; i++) { const t0 = performance.now(); fz.step(1); cx.getImageData(0, 0, 1, 1); a.push(performance.now() - t0); }
        return { a, scene: fz.scene() };
      }, { sc, q });
      if (r.err) { console.log(k, sc, 'ERR', r.err.slice(0, 120)); continue; }
      const s = stat(r.a);
      out[`k${k}|${sc}|q${q}`] = s;
      console.log(`k=${k} ${sc.padEnd(7)} (${r.scene}) q${q}: avg ${s.avg} med ${s.med} p95 ${s.p95} max ${s.max}`);
    }
  }
  await t.close();
}
fs.writeFileSync(OUT + '/scenes.json', JSON.stringify(out, null, 1));
