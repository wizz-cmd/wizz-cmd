import { launch, fp, log, check } from './qa3_diffreview_lib.mjs';
const t = await launch({});
await t.page.waitForFunction(() => !!window.__fizzpop); await t.page.evaluate(() => window.__fizzpop.scene());
const r = await t.page.evaluate(() => {
  const fz = window.__fizzpop; const out = [];
  for (let i = 0; i < 30; i++) {
    const t0 = performance.now(); fz.GFX.levelCanvas(i, fz.LEVELS[i].map); const t1 = performance.now(); fz.GFX.bgCanvas(i); const t2 = performance.now();
    out.push([i + 1, +(t1 - t0).toFixed(1), +(t2 - t1).toFixed(1)]);
  }
  return out;
});
log('level, levelCanvas ms, bgCanvas ms');
log(r.map((x) => x.join(',')).join(' | '));
const worstL = Math.max(...r.map((x) => x[1])), worstB = Math.max(...r.map((x) => x[2]));
log('worst levelCanvas', worstL, 'worst bgCanvas', worstB);
await t.close();
