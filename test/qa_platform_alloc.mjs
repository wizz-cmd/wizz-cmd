// QA platform: JS allocation rate per frame (positive deltas of precise usedJSHeapSize) and GC pause visibility, per scene, real-time loop.
import { launchBrowser, open, ev, log } from './qa_platform_lib.mjs';
const b = await launchBrowser({ autoplay: true });
const t = await open({ browser: b });
const cdp = t.cdp;
const scenes = { title: () => { fz.goto('title'); }, play_l1: () => { fz.start(2, 1, 5); fz.Game.debug.skipIntro(); fz.Game.debug.god(true); }, bubbles40: () => { fz.start(2, 20, 8); const G = fz.Game.debug; G.skipIntro(); G.god(true); for (let i = 0; i < 40; i++) G.spawn(['thunder', 'fire', 'water'][i % 3], 30 + (i * 37) % 190, 40 + (i * 53) % 150); }, boss: () => { fz.start(2, 30, 9); const G = fz.Game.debug; G.skipIntro(); G.god(true); } };
for (const [name, setup] of Object.entries(scenes)) {
  await ev(t.page, setup); await t.page.waitForTimeout(500);
  const r = await ev(t.page, () => new Promise((res) => {
    fz.input.set(0, { fire: true, right: true }); fz.input.set(1, { fire: true, left: true });
    let prev = performance.memory.usedJSHeapSize, alloc = 0, gcs = 0, n = 0, gcFrames = []; const t0 = performance.now(); let lastT = t0, long = 0;
    const f = (now) => { const u = performance.memory.usedJSHeapSize; const dt = now - lastT; lastT = now; if (u >= prev) alloc += u - prev; else { gcs++; gcFrames.push(+dt.toFixed(1)); } prev = u; n++; if (n < 600) requestAnimationFrame(f); else { fz.input.clear(); res({ bytesPerFrame: Math.round(alloc / n), gcEvents: gcs, framesAtGc: gcFrames.slice(0, 8), seconds: +((performance.now() - t0) / 1000).toFixed(1) }); } };
    requestAnimationFrame(f);
  }));
  log(name, JSON.stringify(r));
}
await t.close(); await b.close();
