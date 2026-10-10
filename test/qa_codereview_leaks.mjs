// Leak probe: DOM/JS-listener counters (CDP Memory.getDOMCounters), JS heap, AUDIO voices/tracks and GFX/Game cache sizes after many
// scene changes / game starts / pause cycles with live audio. Anything that grows linearly with the number of cycles is a leak.
import { launch, fp, log } from './qa_codereview_lib.mjs';
const t = await launch({});
const g = fp(t.page);
await t.page.keyboard.press('ShiftRight');
const cdp = await t.context.newCDPSession(t.page);
await cdp.send('Memory.getDOMCounters').catch(() => {});
const snap = async (label) => {
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  const c = await cdp.send('Memory.getDOMCounters').catch(() => ({}));
  const m = await g.evaluate(() => ({ heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(2), a: fz.AUDIO._stats() }));
  log(label.padEnd(14), JSON.stringify({ listeners: c.jsEventListeners, nodes: c.nodes, heapMB: m.heapMB, voices: m.a.voices, tracks: m.a.tracks, groups: m.a.groups, active: m.a.active }));
};
await snap('boot');
for (let round = 1; round <= 3; round++) {
  for (let i = 0; i < 25; i++) {
    await g.evaluate((i) => { fz.start(1 + (i % 2), 1 + (i * 7) % 30, i + 1); fz.Game.debug.skipIntro(); fz.AUDIO.sfx('pop'); }, i);
    await t.page.waitForTimeout(40);
    await g.evaluate(() => { fz.goto('pause'); });
    await t.page.waitForTimeout(20);
    await g.evaluate(() => { fz.goto(['title', 'scores', 'howto', 'story', 'entry'][Math.floor(Math.random() * 5)], {}); });
    await t.page.waitForTimeout(20);
  }
  await snap('after ' + round * 25);
}
log('errors', t.errors);
await t.close();
