// Main-thread load of "nothing happens" states at 60 Hz: title idle, paused game, how-to, scores (battery / thermal on phones)
import { open, K_VIEWS, BUSY, TYPICAL, sleep, traceRun } from './qa_v2_perf_lib.mjs';
const k = +(process.argv[2] || 4), q = +(process.argv[3] || 2);
const [vw, vh, dpr] = K_VIEWS[k];
const t = await open({ html: process.env.VARIANT_HTML || undefined, vw, vh, dpr });
await t.page.evaluate((q) => { fz = window.__fizzpop; fz._main.setQuality(q, true); window.__fr = []; let last = performance.now(); const tick = (ts) => { window.__fr.push(ts - last); last = ts; requestAnimationFrame(tick); }; requestAnimationFrame(tick); }, q);
for (const [label, setup] of [['title idle', "fz.goto('title')"], ['how-to', "fz.goto('howto')"], ['scores', "fz.goto('scores')"], ['play (typical, god)', TYPICAL.replace(/^\(\(\) => \{|\}\)\(\)$/g, '')], ['play PAUSED', "fz._main.setPaused(true)"]]) {
  await t.page.evaluate(label.startsWith('play (') ? TYPICAL : `(() => { fz = window.__fizzpop; ${setup}; })()`);
  await sleep(2500);
  const r = await traceRun(t, 5);
  const busy = r.perFrame.beginMainFrame * r.frames / 5000 * 100;
  console.log(`k=${k} q${q} ${label.padEnd(22)} main-thread frame ${String(r.perFrame.beginMainFrame).padStart(5)} ms x ${r.frames} frames => ${busy.toFixed(0)}% of one core | viz ${r.perFrame.vizDrawAndSwap} ms | rAF ${r.rAF.avg}`);
}
await t.close();
