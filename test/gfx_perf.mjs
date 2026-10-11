// GFX performance: init() time in a fresh page (median of 5 loads) + draw() / text() throughput + full-registry bake cost.
// Usage: node test/gfx_perf.mjs      Bars: init < 150 ms (v2: baking is lazy, so init is ~1 ms); warm draw <= 80 us, warm text <= 150 us; bake of every sprite frame at k=4 <= 3 s (CPU raster).
// v2.0 RE-BASE (SPEC_V2 section 1 + 5): the pixel-era loop measured draws of 16x16 bitmaps; the same loop now measures blits of baked k-scaled canvases under setTransform(k).
import path from 'path';
import { launch, PROJECT } from '../tools/harness.mjs';
const html = path.join(PROJECT, 'test', 'gfx_sheet.html');
const times = [];
let lastLint = [], thr = null;
for (let i = 0; i < 5; i++) {
  const t = await launch({ html });
  times.push(await t.page.evaluate(() => T.initMs));
  if (i === 4) {
    thr = await t.page.evaluate(() => {
      const K = 3; GFX.setScale(K);
      const cv = document.createElement('canvas'); cv.width = 256 * K; cv.height = 224 * K; const g = cv.getContext('2d'); g.setTransform(K, 0, 0, K, 0, 0);
      const names = ['p1_walk', 'nibbler_move', 'bubble', 'crabbit_angry', 'jellop_move', 'food_3', 'kraken'];
      for (let k = 0; k < 200; k++) GFX.draw(g, names[k % names.length], k >> 3, (k * 7) % 240, (k * 5) % 200, { flip: k & 1 });          // warm: first draws bake lazily
      GFX.warm && GFX.warm(); GFX._warmNow && GFX._warmNow(4000);
      const t0 = performance.now(); let n = 0;
      for (let k = 0; k < 20000; k++) { GFX.draw(g, names[k % names.length], k >> 3, (k * 7) % 240, (k * 5) % 200, { flip: k & 1 }); n++; }
      g.getImageData(0, 0, 1, 1);                                                                                                         // flush the raster queue
      const t1 = performance.now();
      for (let k = 0; k < 2000; k++) GFX.text(g, 'SCORE 012345 ROUND 12', 8, (k % 20) * 8, '#ffe36b');
      g.getImageData(0, 0, 1, 1);
      const t2 = performance.now();
      // cold bake cost of the whole registry at k=4 (every sprite x frame, lazy ones included)
      GFX.setScale(4); const g4 = document.createElement('canvas').getContext('2d'); g4.canvas.width = 64; g4.canvas.height = 64; g4.setTransform(4, 0, 0, 4, 0, 0);
      const b0 = performance.now(); let frames = 0;
      for (const { name, frames: fr } of GFX._registry()) for (let f = 0; f < fr; f++) { GFX.draw(g4, name, f, 2, 2); frames++; }
      g4.getImageData(0, 0, 1, 1);
      const b1 = performance.now();
      return { drawUsEach: ((t1 - t0) / n) * 1000, textUsEach: ((t2 - t1) / 2000) * 1000, bakeAllMs: b1 - b0, bakedFrames: frames, stats: GFX._stats() };
    });
    console.log('throughput', JSON.stringify({ ...thr, stats: undefined }), 'cache', JSON.stringify({ px: thr.stats.px, maxPx: thr.stats.maxPx, entries: thr.stats.entries, evictions: thr.stats.evictions }));
    lastLint = await t.page.evaluate(() => T.lint());
  }
  await t.close();
}
times.sort((a, b) => a - b);
console.log('init ms (5 runs):', times.map((x) => x.toFixed(1)).join(', '), ' median', times[2].toFixed(1), times[2] < 150 ? 'OK' : 'TOO SLOW');
if (lastLint.length) console.log('lint:', lastLint);
const ok = times[2] < 150 && !lastLint.length && thr.drawUsEach <= 80 && thr.textUsEach <= 150 && thr.bakeAllMs <= 3000;
if (!ok) console.log('FAIL: draw ' + thr.drawUsEach.toFixed(1) + ' us (<= 80), text ' + thr.textUsEach.toFixed(1) + ' us (<= 150), bake-all ' + thr.bakeAllMs.toFixed(0) + ' ms (<= 3000)');
process.exit(ok ? 0 : 1);
