// first-draw (bake) cost of lazy / not-yet-warm sprites at several k; worst single-frame hitch candidates
import { launch, fp, OUT } from './qa_v2_motion_lib.mjs';
for (const [w, h, dpr] of [[1024, 768, 1], [390, 844, 3]]) {
  const t = await launch({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, touch: w < 500 });
  const g = fp(t.page);
  await g.wait(300);
  console.log('viewport', w, h, 'dpr', dpr, 'k', await g.evaluate(() => fz._main.k()));
  const early = await g.evaluate(() => { const s = fz.GFX._stats(); return JSON.stringify(s).slice(0, 300); });
  console.log(' stats@300ms', early);
  await g.wait(4000);
  console.log(' stats@4.3s', await g.evaluate(() => JSON.stringify(fz.GFX._stats()).slice(0, 300)));
  const r = await g.evaluate(() => {
    const GFX = fz.GFX; const k = fz._main.k(); const cv = document.createElement('canvas'); cv.width = 400; cv.height = 400; const c = cv.getContext('2d'); c.setTransform(k, 0, 0, k, 0, 0);
    const out = [];
    for (const d of GFX._registry()) { for (let f = 0; f < d.frames; f++) { if (d.baked > f && !d.lazy) { /* maybe baked */ } const t0 = performance.now(); GFX.draw(c, d.name, f, 10, 10); const dt = performance.now() - t0; if (dt > 2) out.push([d.name, f, +dt.toFixed(1)]); } }
    return out;
  });
  console.log(' first-draw >2ms after 4.3 s idle:', JSON.stringify(r));
  await t.close();
}
