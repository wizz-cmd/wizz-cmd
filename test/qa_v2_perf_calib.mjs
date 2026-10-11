// Does a 10-20 ms start-up probe (4 full-frame 'lighter' blits + one flush) predict the real frame cost? Compare to the busy-scene cost at q0/q1/q2.
import { open, K_VIEWS, BUSY, DRIVE, stat } from './qa_v2_perf_lib.mjs';
const profiles = [['desk k2', K_VIEWS[2], 1, false], ['desk k3', K_VIEWS[3], 1, false], ['desk k4', K_VIEWS[4], 1, false], ['desk k6', K_VIEWS[6], 1, false], ['phone dpr3 cpu3', [390, 844, 3], 3, true], ['phone dpr3 cpu6', [390, 844, 3], 6, true], ['phone dpr2 cpu4', [360, 640, 2], 4, true]];
for (const [label, [vw, vh, dpr], cpu, touch] of profiles) {
  const t = await open({ vw, vh, dpr, cpu, touch });
  const r = await t.page.evaluate(({ setup, drive }) => {
    fz = window.__fizzpop; fz.freeze(true);
    const cv = document.getElementById('screen'), g = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const src = document.createElement('canvas'); src.width = W; src.height = H; const sg = src.getContext('2d'); sg.fillStyle = 'rgba(30,60,90,0.5)'; sg.fillRect(0, 0, W, H);
    const probe = () => { g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'lighter'; const t0 = performance.now(); for (let i = 0; i < 4; i++) g.drawImage(src, 0, 0); g.getImageData(0, 0, 1, 1); const dt = (performance.now() - t0) / 4; g.restore(); return dt; };
    probe();
    const probes = []; for (let i = 0; i < 3; i++) probes.push(probe());
    const out = { W, H, probe: probes.sort((a, b) => a - b)[1] };
    (0, eval)(setup);
    const drv = (0, eval)('(' + drive + ')');
    for (const q of [0, 1, 2]) {
      fz._main.setQuality(q, true);
      for (let i = 0; i < 60; i++) { drv(i); fz.step(1); }
      const a = []; for (let i = 0; i < 80; i++) { drv(i); const t0 = performance.now(); fz.step(1); g.getImageData(0, 0, 1, 1); a.push(performance.now() - t0); }
      out['q' + q] = a.reduce((x, y) => x + y, 0) / a.length;
    }
    return out;
  }, { setup: BUSY, drive: DRIVE(false) });
  console.log(`${label.padEnd(16)} canvas ${r.W}x${r.H} probe ${r.probe.toFixed(2)} ms/blit | busy frame q0 ${r.q0.toFixed(1)} q1 ${r.q1.toFixed(1)} q2 ${r.q2.toFixed(1)} | ratio q0/probe ${(r.q0 / r.probe).toFixed(1)} q1/probe ${(r.q1 / r.probe).toFixed(1)} q2/probe ${(r.q2 / r.probe).toFixed(1)}`);
  await t.close();
}
