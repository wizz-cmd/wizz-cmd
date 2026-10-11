// Baseline: per-frame cost of the busy / typical scenes at k = 2,3,4 and quality 0/1/2, measured with a forced raster flush (getImageData 1x1),
// split into update (no render), render without flush (recording only) and render with flush (true CPU raster cost).
import fs from 'fs';
import { open, K_VIEWS, BUSY, TYPICAL, DRIVE, stat, OUT } from './qa_v2_perf_lib.mjs';
const only = process.argv[2] ? process.argv[2].split(',').map(Number) : [2, 3, 4];
const res = {};
for (const k of only) {
  const [vw, vh, dpr] = K_VIEWS[k];
  const t = await open({ vw, vh, dpr });
  const kk = await t.page.evaluate(() => window.__fizzpop._main.k());
  await t.page.evaluate(() => { window.__fizzpop.freeze(true); });
  await t.page.waitForTimeout(800);
  for (const [scene, setup, chain] of [['typical', TYPICAL, false], ['busy', BUSY, false], ['busy+chain', BUSY, true]]) {
    await t.page.evaluate(setup);
    for (const q of [0, 1, 2]) {
      const r = await t.page.evaluate(({ q, drive }) => {
        fz._main.setQuality(q, true);
        const drv = (0, eval)('(' + drive + ')');
        const cx = document.getElementById('screen').getContext('2d');
        const fl = () => cx.getImageData(0, 0, 1, 1);
        const upd = [], recOnly = [], renFlush = [], full = [];
        for (let i = 0; i < 80; i++) { drv(i); fz.step(1); }
        for (let i = 0; i < 160; i++) {
          drv(i);
          // update only: step(1) does update+render; so time Game.update separately via tick isn't exposed -> use step minus render below
          let a = performance.now(); fz.step(1); fl(); let b = performance.now(); full.push(b - a);
          a = performance.now(); fz._main.renderNow(); b = performance.now(); recOnly.push(b - a);
          a = performance.now(); fl(); b = performance.now(); renFlush.push(b - a + recOnly[recOnly.length - 1]);
        }
        return { full, recOnly, renFlush, k: fz._main.k(), canvas: [cx.canvas.width, cx.canvas.height], parts: fz.Game.debug.fxStats() };
      }, { q, drive: DRIVE(chain) });
      const row = { k: r.k, canvas: r.canvas, step_flush: stat(r.full), render_record_only: stat(r.recOnly), render_flush: stat(r.renFlush), fx: r.parts && r.parts.drawn };
      res[`k${kk}|${scene}|q${q}`] = row;
      console.log(`k=${kk} ${scene.padEnd(10)} q${q}  step+flush avg ${row.step_flush.avg} p95 ${row.step_flush.p95} | render rec ${row.render_record_only.avg} | render+flush avg ${row.render_flush.avg} p95 ${row.render_flush.p95} max ${row.render_flush.max}`);
    }
  }
  await t.close();
}
fs.writeFileSync(OUT + '/baseline_' + only.join('') + '.json', JSON.stringify(res, null, 1));
