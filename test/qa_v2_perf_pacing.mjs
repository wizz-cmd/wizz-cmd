// Frame-time pattern: bloom is refreshed every 2nd frame (q2) / 3rd (q1) and the logo layer every 3rd: do they line up into 6-frame spikes?
import { open, K_VIEWS, BUSY, DRIVE, stat } from './qa_v2_perf_lib.mjs';
const k = +(process.argv[2] || 4);
const [vw, vh, dpr] = K_VIEWS[k];
const t = await open({ html: process.env.VARIANT_HTML || undefined, vw, vh, dpr });
for (const sc of ['busy', 'title']) {
  const r = await t.page.evaluate(({ sc, setup, drive }) => {
    fz = window.__fizzpop; fz.freeze(true); fz._main.setQuality(2, true);
    if (sc === 'title') fz.goto('title'); else (0, eval)(setup);
    const drv = (0, eval)('(' + drive + ')'); const cx = document.getElementById('screen').getContext('2d');
    for (let i = 0; i < 90; i++) { if (sc === 'busy') drv(i); fz.step(1); }
    const a = [];
    for (let i = 0; i < 120; i++) { if (sc === 'busy') drv(i); const t0 = performance.now(); fz.step(1); cx.getImageData(0, 0, 1, 1); a.push(performance.now() - t0); }
    return a;
  }, { sc, setup: BUSY, drive: DRIVE(false) });
  const mod6 = [0, 1, 2, 3, 4, 5].map((m) => { const v = r.filter((_, i) => i % 6 === m); return +(v.reduce((x, y) => x + y, 0) / v.length).toFixed(1); });
  const s = stat(r);
  console.log(`k=${k} ${sc} q2: avg ${s.avg} p95 ${s.p95} max ${s.max} | mean cost by frame index mod 6: ${mod6.join(' / ')} | frames over 16.7 ms: ${(r.filter((x) => x > 16.7).length / r.length * 100).toFixed(0)} %`);
  console.log('   first 24 frames: ' + r.slice(0, 24).map((x) => x.toFixed(0)).join(' '));
}
await t.close();
