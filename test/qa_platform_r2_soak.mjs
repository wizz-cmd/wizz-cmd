// Soak: 24 000 fixed steps of bot play (god mode, level hopping) with forced GC between samples, then 40 scene/game cycles.
// Tracks JS heap (post-gc), DOM counters, event listeners, audio voices/tracks, canvas count.
import { open, ev, save, sleep } from './qa_platform_r2_lib.mjs';
const t = await open({ autoplay: true });
const cdp = t.cdp;
await cdp.send('Performance.enable');
const metrics = async () => { const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value])); return { nodes: m.Nodes, listeners: m.JSEventListeners, docs: m.Documents, heapKB: Math.round(m.JSHeapUsedSize / 1024) }; };
const sample = async (label) => { await t.page.evaluate(() => window.gc && window.gc()); await sleep(50); const m = await metrics(); const x = await ev(t.page, () => ({ audio: fz.AUDIO._stats(), canvases: document.querySelectorAll('canvas').length, enemies: fz.Game.debug.state().enemies.length, bubbles: fz.Game.debug.state().bubbles.length, level: fz.Game.debug.state().level })); return { label, ...m, ...x.audio && { voices: x.audio.voices, tracks: x.audio.tracks, groups: x.audio.groups }, canvases: x.canvases, level: x.level }; };
const rows = [];
await ev(t.page, () => { fz.freeze(true); fz.start(2, 1, 11); fz.Game.debug.skipIntro(); fz.Game.debug.god(true); });
rows.push(await sample('start'));
let times = [];
for (let chunk = 1; chunk <= 12; chunk++) {
  const r = await ev(t.page, (chunk) => {
    const rng = fz.U.rng(chunk * 31); let worst = 0; const t0 = performance.now();
    for (let i = 0; i < 2000; i++) {
      if (i % 9 === 0) for (const pi of [0, 1]) fz.input.set(pi, { left: rng.chance(0.45), right: rng.chance(0.45), jump: rng.chance(0.3), fire: rng.chance(0.55) });
      if (i % 700 === 350) fz.Game.debug.killAll();
      const a = performance.now(); fz.step(1); worst = Math.max(worst, performance.now() - a);
      if (fz.scene() !== 'play') fz.start(2, 1 + (chunk * 5) % 30, chunk);
      const s = fz.Game.debug.state();
      if (s.phase === 'gameover' || s.phase === 'victory') { fz.start(2, 1 + (chunk * 7) % 30, chunk); fz.Game.debug.god(true); }
    }
    fz.input.clear();
    return { ms: performance.now() - t0, worst };
  }, chunk);
  const s = await sample('steps ' + chunk * 2000); s.msPer1000 = +(r.ms / 2).toFixed(0); s.worstStep = +r.worst.toFixed(1);
  rows.push(s); console.log(JSON.stringify(s));
}
// scene/game cycles
for (let c = 0; c < 40; c++) {
  await ev(t.page, (c) => {
    fz.start((c % 2) + 1, 1 + (c % 30), c); fz.step(200);
    fz.goto('title'); fz.step(30); fz.goto('story', { attract: true }); fz.step(20); fz.goto('howto', { page: c % 5 }); fz.step(20); fz.goto('scores', {}); fz.step(20);
    fz.goto('entry', { entries: [{ pi: 0, score: 50000 + c, round: 3 }] }); fz.step(40); fz.goto('title');
  }, c);
}
const fin = await sample('after 40 scene cycles'); rows.push(fin); console.log(JSON.stringify(fin));
save('soak.json', rows);
console.log('errors', JSON.stringify(t.errors));
await t.close();
