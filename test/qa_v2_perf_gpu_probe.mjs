// What does the canvas GPU code path (SwiftShader) cost per frame? Timeline of rAF intervals right after load, k=2 window.
import { open, BUSY, DRIVE, sleep, stat } from './qa_v2_perf_lib.mjs';
const t = await open({ vw: 560, vh: 560, dpr: 1 });
await t.page.evaluate(({ setup, drive }) => {
  fz = window.__fizzpop; fz.freeze(true); (0, eval)(setup); fz.freeze(false);
  window.__fr = []; let last = performance.now(); const tick = (ts) => { window.__fr.push(+(ts - last).toFixed(1)); last = ts; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
}, { setup: BUSY, drive: DRIVE(false) });
for (let i = 0; i < 6; i++) { await sleep(3000); const r = await t.page.evaluate(() => { const a = window.__fr.splice(0); return a; }); console.log(`t=${(i + 1) * 3}s n=${r.length}`, JSON.stringify(stat(r)), r.slice(0, 12).join(',')); }
await t.close();
