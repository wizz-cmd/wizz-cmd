// Real-time soak with live audio: random inputs + random debug events for N seconds; samples AUDIO._stats() (voices / tracks /
// groups must stay bounded), JS heap, entity counts, frame time. Usage: node test/qa_codereview_soak.mjs [seconds=45]
import { launch, fp, log } from './qa_codereview_lib.mjs';
const secs = +(process.argv[2] || 45);
const t = await launch({});
const g = fp(t.page);
await t.page.keyboard.press('ShiftRight');
await g.evaluate(() => { fz.start(2, 1, 99); fz.Game.debug.god(true); });
await t.page.evaluate(() => {
  const rnd = fz.U.rng(5), D = fz.Game.debug;
  window.__soak = setInterval(() => {
    for (let i = 0; i < 2; i++) fz.input.set(i, { left: rnd.chance(0.35), right: rnd.chance(0.35), jump: rnd.chance(0.3), fire: rnd.chance(0.5) });
    if (rnd.chance(0.15)) D.spawn(rnd.pick(['thunder', 'fire', 'water', 'nibbler', 'crabbit', 'jellop', 'glimmer', 'springle']), rnd.int(24, 216), rnd.int(40, 190));
    if (rnd.chance(0.03)) D.give(rnd.int(0, 1), rnd.pick(['clock', 'bomb', 'heart', 'shoes', 'gold', 'blue', 'pink']));
    if (rnd.chance(0.02)) D.setHurryTimer(4000);
    if (rnd.chance(0.01)) D.setLevel(rnd.int(1, 30));
    if (rnd.chance(0.02)) D.skipIntro();
    if (fz.scene() !== 'play') { fz.start(2, rnd.int(1, 30), 7); D.god(true); }
  }, 120);
  window.__ft = []; let last = performance.now();
  (function loop(now) { window.__ft.push(now - last); last = now; if (window.__ft.length > 4000) window.__ft.shift(); requestAnimationFrame(loop); })(last);
});
const rows = [];
for (let i = 0; i < secs / 5; i++) {
  await t.page.waitForTimeout(5000);
  rows.push(await g.evaluate(() => {
    const s = fz.AUDIO._stats(), st = fz.Game.debug.state(), S = fz.Game.debug._S();
    const ft = window.__ft.slice(-300).sort((a, b) => a - b);
    return { heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null, voices: s.voices, tracks: s.tracks, groups: s.groups, resyncs: s.resyncs, active: s.active, lvl: st.level, phase: st.phase,
      ent: { b: S.bubbles.length, e: S.enemies.length, fx: S.fx.length, pr: S.proj.length, it: S.items.length, fl: S.flames.length, st: S.streams.length }, p95ms: +ft[Math.floor(ft.length * 0.95)].toFixed(1) };
  }));
  log(JSON.stringify(rows[rows.length - 1]));
}
log('errors', t.errors);
await t.close();
