// Cost of a NON-bucket k: world canvases / sprites are blitted scaled (KB != K). Sweep K via the resolution lever on a big window, busy scene, quality 0 (no post FX)
import fs from 'fs';
import { open, BUSY, DRIVE, stat, OUT } from './qa_v2_perf_lib.mjs';
const t = await open({ vw: 1700, vh: 1400, dpr: 1 });
await t.page.evaluate(() => { fz = window.__fizzpop; fz.freeze(true); });
await t.page.waitForTimeout(600);
await t.page.evaluate(BUSY);
const rows = [];
for (const kc of [2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75, 4, 4.25, 4.5, 4.75, 5, 5.5, 6]) {
  const r = await t.page.evaluate(async ({ kc, drive }) => {
    fz = window.__fizzpop;
    fz._main.setKCap(kc); fz._main.setQuality(0, true);
    const drv = (0, eval)('(' + drive + ')');
    const cx = document.getElementById('screen').getContext('2d');
    for (let i = 0; i < 120; i++) { drv(i); fz.step(1); }
    const a = [];
    for (let i = 0; i < 150; i++) { drv(i); const t0 = performance.now(); fz.step(1); cx.getImageData(0, 0, 1, 1); a.push(performance.now() - t0); }
    const st = fz.GFX._stats();
    return { K: fz._main.k(), kb: st.kb, a, px: st.px, worldPx: st.worldPx };
  }, { kc, drive: DRIVE(false) });
  const s = stat(r.a);
  rows.push({ K: r.K, kb: r.kb, ...s, mpx: +(256 * r.K * 224 * r.K / 1e6).toFixed(2), spritePx: r.px, worldPx: r.worldPx });
  console.log(`K=${String(r.K).padEnd(5)} kb=${String(r.kb).padEnd(4)} canvas ${(256 * r.K * 224 * r.K / 1e6).toFixed(2)} Mpx  frame avg ${s.avg} p95 ${s.p95}  per-Mpx ${(s.avg / (256 * r.K * 224 * r.K / 1e6)).toFixed(2)} ms  (sprite bake ${(r.px / 1e6).toFixed(1)} Mpx, world ${(r.worldPx / 1e6).toFixed(1)} Mpx)`);
}
fs.writeFileSync(OUT + '/ksweep.json', JSON.stringify(rows, null, 1));
await t.close();
