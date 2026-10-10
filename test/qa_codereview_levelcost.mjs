// First-use cost of GFX.levelCanvas per level (hitch when a new round's art is built lazily during play/transition).
import { boot, log } from './qa_codereview_lib.mjs';
const b = await boot({});
const r = await b.page.evaluate(() => {
  const out = [];
  for (let i = 0; i < 30; i++) { const t0 = performance.now(); fz.GFX.levelCanvas(i, fz.LEVELS[i].map); out.push(+(performance.now() - t0).toFixed(1)); }
  return out;
});
log('first-use ms per level (levels 1..30; levels already built by boot show ~0):', r.join(' '));
log('max', Math.max(...r), 'sum', r.reduce((a, b) => a + b, 0).toFixed(1));
await b.t.close();
