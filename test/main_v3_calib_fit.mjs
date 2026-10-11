// Fit of the calibration model: reference probe (full-frame additive blit at 512x448) vs the real busy-frame cost (BUSY scene, step + flush) per (environment, quality).
import { open, sleep } from './main_v3_lib.mjs';
import { K_VIEWS, BUSY, DRIVE } from './qa_v2_perf_lib.mjs';
const profiles = [['desk k1', K_VIEWS[1], 1, false], ['desk k2', K_VIEWS[2], 1, false], ['desk k3', K_VIEWS[3], 1, false], ['desk k4', K_VIEWS[4], 1, false], ['desk k5.5', K_VIEWS[5.5], 1, false], ['desk k6', K_VIEWS[6], 1, false], ['desk k8', K_VIEWS[8], 1, false],
  ['phone dpr3 cpu1', [390, 844, 3], 1, true], ['phone dpr3 cpu3', [390, 844, 3], 3, true], ['phone dpr3 cpu6', [390, 844, 3], 6, true], ['phone dpr2 cpu4', [360, 640, 2], 4, true], ['desk k3 cpu4', K_VIEWS[3], 4, false]];
for (const [label, [vw, vh, dpr], cpu, touch] of profiles) {
  const t = await open({ vw, vh, dpr, cpu, touch });
  await sleep(1500);
  const r = await t.page.evaluate(({ setup, drive }) => {
    fz = window.__fizzpop; fz.freeze(true);
    const c = fz._main.calibration();
    const cv = document.getElementById('screen'), g = cv.getContext('2d');
    const out = { probe: c.probeMs, pick: [fz.quality, c.kCap] };
    fz._main.setKCap(null);
    out.W = cv.width; out.H = cv.height; out.k = fz._main.k();
    (0, eval)(setup);
    const drv = (0, eval)('(' + drive + ')');
    for (const q of [0, 1, 2]) {
      fz._main.setQuality(q, true);
      for (let i = 0; i < 40; i++) { drv(i); fz.step(1); }
      const a = []; for (let i = 0; i < 60; i++) { drv(i); const t0 = performance.now(); fz.step(1); g.getImageData(0, 0, 1, 1); a.push(performance.now() - t0); }
      a.sort((x, y) => x - y);
      out['q' + q] = a[a.length >> 1];
    }
    return out;
  }, { setup: BUSY, drive: DRIVE(false) });
  const ref = (r.k / 2) ** 2;
  console.log(`${label.padEnd(16)} k${r.k} ${r.W}x${r.H} probe ${r.probe.toFixed(2)} (x(k/2)^2 = ${(r.probe * ref).toFixed(2)}) | busy med q0 ${r.q0.toFixed(1)} q1 ${r.q1.toFixed(1)} q2 ${r.q2.toFixed(1)} | ratio q0 ${(r.q0 / (r.probe * ref)).toFixed(1)} q1 ${(r.q1 / (r.probe * ref)).toFixed(1)} q2 ${(r.q2 / (r.probe * ref)).toFixed(1)} | picked q${r.pick[0]} cap ${r.pick[1]}`);
  await t.close();
}
