// Bake cost / memory per sprite and per bucket: bakes every registry sprite x frame at k = 1.5,2,3,4,5,6,8 (fresh page per k so no warm-up queue interferes),
// reports ms and pixels per sprite, totals, worst sprites, and the cache budget (MAX_PX) headroom.
import fs from 'fs';
import { open, OUT } from './qa_v2_perf_lib.mjs';
const kList = (process.argv[2] || '2,3,4,6,8').split(',').map(Number);
const res = {};
for (const k of kList) {
  const t = await open({ vw: 1280, vh: 1000, dpr: 1 });
  const r = await t.page.evaluate((k) => {
    const G = window.__fizzpop.GFX;
    window.__fizzpop.freeze(true);
    G._reset();                                   // stops the warm queue, drops everything
    G.setScale(k);
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64; const g = cv.getContext('2d');
    const reg = G._registry();
    const per = [];
    let totMs = 0, totPx = 0, n = 0;
    const s0 = G._stats();
    for (const d of reg) {
      let ms = 0;
      for (let f = 0; f < d.frames; f++) {
        const px0 = G._stats().px;
        const a = performance.now(); G.draw(g, d.name, f, 0, 0); const b = performance.now();
        ms += b - a; n++;
        totPx += G._stats().px - px0;
      }
      per.push({ name: d.name, frames: d.frames, w: d.w, h: d.h, ms: +ms.toFixed(2), msPerFrame: +(ms / d.frames).toFixed(2), lazy: d.lazy });
      totMs += ms;
    }
    const s1 = G._stats();
    per.sort((a, b) => b.ms - a.ms);
    return { kb: s1.kb, K: s1.k, defs: reg.length, entries: s1.entries, bakes: s1.bakes, totMs: +totMs.toFixed(0), px: s1.px, peakPx: s1.peakPx, maxPx: s1.maxPx, evictions: s1.evictions, top: per.slice(0, 14), medianMsPerFrame: per.map((p) => p.msPerFrame).sort((a, b) => a - b)[per.length >> 1] };
  }, k);
  res[k] = r;
  console.log(`k=${k} kb=${r.kb}: ${r.defs} defs, ${r.entries} frames baked in ${r.totMs} ms (${(r.totMs / r.entries).toFixed(2)} ms/frame avg, median sprite ${r.medianMsPerFrame}) | cache ${(r.px / 1e6).toFixed(1)} Mpx = ${(r.px * 4 / 1048576).toFixed(0)} MB of budget ${(r.maxPx / 1e6)} Mpx (peak ${(r.peakPx / 1e6).toFixed(1)} Mpx, evictions ${r.evictions})`);
  console.log('   worst: ' + r.top.slice(0, 8).map((p) => `${p.name} x${p.frames} ${p.ms}ms (${p.msPerFrame}/fr${p.lazy ? ' lazy' : ''})`).join('; '));
  await t.close();
}
fs.writeFileSync(OUT + '/bake_sprites.json', JSON.stringify(res, null, 1));
