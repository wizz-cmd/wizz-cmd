// QA (audio lens) -- main-thread stall resilience of the look-ahead scheduler (HORIZON 0.14 s, pump every 25 ms).
// Blocks the page's main thread for N ms while stage1 plays, then reports resyncs and how far the musical clock slipped
// relative to wall time (steps scheduled vs expected).
//   node test/qa_audio_jank.mjs
import { launch, fp } from '../tools/harness.mjs';
const t = await launch({}); const g = fp(t.page);
await t.page.keyboard.press('ArrowDown'); await t.page.waitForTimeout(300);
await g.evaluate(() => { fz.start(1, 3, 3); fz.Game.debug.god(true); fz.freeze(true); });
await t.page.waitForTimeout(4200);
for (const stall of [60, 120, 160, 200, 300, 400, 800]) {
  const r = await g.evaluate(async (stall) => {
    const A = fz.AUDIO;
    await new Promise((r) => setTimeout(r, 1500));
    const s0 = A._stats(), c0 = s0.time, k0 = s0.curCount, r0 = s0.resyncs;
    const t0 = performance.now(); while (performance.now() - t0 < stall) { /* block */ }
    await new Promise((r) => setTimeout(r, 2000));
    const s1 = A._stats();
    // expected steps in (ctx time delta) at 150 bpm = 10 steps/s *(ctx time)
    const dt = s1.time - c0, expected = dt * 10, got = s1.curCount - k0;
    return { stall, resyncs: s1.resyncs - r0, ctxDt: +dt.toFixed(2), stepsExpected: +expected.toFixed(1), stepsGot: got, slipSteps: +(expected - got).toFixed(1) };
  }, stall);
  console.log(JSON.stringify(r), r.slipSteps > 2 ? '  <-- music clock slipped' : '');
}
console.log('errors:', t.errors);
await t.close();
