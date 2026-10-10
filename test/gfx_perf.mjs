// GFX performance: init() time in a fresh page (median of 5 loads) + draw() throughput.
// Usage: node test/gfx_perf.mjs      Bar: init < 150 ms
import path from 'path';
import { launch, PROJECT } from '../tools/harness.mjs';
const html = path.join(PROJECT, 'test', 'gfx_sheet.html');
const times = [];
let lastLint = [];
for (let i = 0; i < 5; i++) {
  const t = await launch({ html });
  times.push(await t.page.evaluate(() => T.initMs));
  if (i === 4) {
    const r = await t.page.evaluate(() => {
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 224; const g = cv.getContext('2d');
      const names = ['p1_walk', 'nibbler_move', 'bubble', 'crabbit_angry', 'jellop_move', 'food_3', 'kraken'];
      const t0 = performance.now(); let n = 0;
      for (let k = 0; k < 20000; k++) { GFX.draw(g, names[k % names.length], k >> 3, (k * 7) % 240, (k * 5) % 200, { flip: k & 1 }); n++; }
      const t1 = performance.now();
      for (let k = 0; k < 2000; k++) GFX.text(g, 'SCORE 012345 ROUND 12', 8, (k % 20) * 8, '#ffe36b');
      const t2 = performance.now();
      return { drawUsEach: ((t1 - t0) / n) * 1000, textUsEach: ((t2 - t1) / 2000) * 1000 };
    });
    console.log('throughput', JSON.stringify(r));
    lastLint = await t.page.evaluate(() => T.lint());
  }
  await t.close();
}
times.sort((a, b) => a - b);
console.log('init ms (5 runs):', times.map((x) => x.toFixed(1)).join(', '), ' median', times[2].toFixed(1), times[2] < 150 ? 'OK' : 'TOO SLOW');
if (lastLint.length) console.log('lint:', lastLint);
process.exit(times[2] < 150 && !lastLint.length ? 0 : 1);
