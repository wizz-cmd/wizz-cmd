// QA platform: update+render cost and real frame rate in busy scenes under CPU throttling (CDP Emulation.setCPUThrottlingRate).
// frozen step timing (update+render, includes canvas draw calls) + real RAF loop frame-time distribution.
import fs from 'fs'; import path from 'path';
import { launchBrowser, open, ev, OUT, log } from './qa_platform_lib.mjs';
const D = path.join(OUT, 'perf'); fs.mkdirSync(D, { recursive: true });
const browser = await launchBrowser({ autoplay: true });
const scenarios = {
  title: () => { fz.goto('title'); },
  l1_idle: () => { fz.start(2, 1, 5); fz.Game.debug.skipIntro(); fz.Game.debug.god(true); },
  bubbles40: () => {
    fz.start(2, 20, 8); const G = fz.Game.debug; G.skipIntro(); G.god(true);
    const r = fz.U.rng(3);
    // 40 float bubbles: specials (they float like empty bubbles) spread across the screen
    for (let i = 0; i < 40; i++) G.spawn(['thunder', 'fire', 'water'][i % 3], r.int(30, 220), r.int(30, 190));
    G.setPlayer(0, { x: 120, y: 120 });
  },
  chain_cluster: () => {
    fz.start(2, 20, 8); const G = fz.Game.debug; G.skipIntro(); G.god(true);
    const r = fz.U.rng(4);
    for (let i = 0; i < 38; i++) G.spawn(['thunder', 'fire', 'water'][i % 3], 120 + r.int(-14, 14), 100 + r.int(-14, 14));
    G.spawn('nibbler', 60, 100); G.spawn('crabbit', 180, 100); G.spawn('jellop', 100, 60); G.spawn('glimmer', 160, 60);
    G.setPlayer(0, { x: 112, y: 96 });          // stand in the cluster -> chain pops, bolts, flames, streams
  },
  boss: () => {
    fz.start(2, 30, 9); const G = fz.Game.debug; G.skipIntro(); G.god(true);
    for (let i = 0; i < 6; i++) G.spawn('thunder', 40 + i * 30, 180);
  },
  transition: () => { fz.start(1, 3, 2); const G = fz.Game.debug; G.skipIntro(); G.god(true); G.clearEnemies(); },
};
const results = [];
for (const rate of [1, 4, 6]) {
  const t = await open({ browser, viewport: { width: 1280, height: 800 } });
  await t.cdp.send('Emulation.setCPUThrottlingRate', { rate });
  for (const [name, setup] of Object.entries(scenarios)) {
    await ev(t.page, setup);
    await ev(t.page, () => { fz.freeze(true); });
    // scene warm-up so caches (glyph tints, gradients) are filled
    await ev(t.page, () => { fz.step(60); });
    // frozen stepping with random-ish input: update+render ms
    const stepStats = await ev(t.page, (name) => {
      const times = []; const r = fz.U.rng(11);
      for (let i = 0; i < 400; i++) {
        if (i % 7 === 0) { fz.input.set(0, { left: r.chance(.5), right: r.chance(.5), jump: r.chance(.3), fire: r.chance(.5) }); fz.input.set(1, { left: r.chance(.5), right: r.chance(.5), jump: r.chance(.3), fire: r.chance(.5) }); }
        if (name === 'chain_cluster' && i % 60 === 0) { fz.Game.debug.setPlayer(0, { x: 112, y: 96, vy: 0 }); }
        if (name === 'transition' && i === 1) fz.Game.debug.killAll();
        const t0 = performance.now(); fz.step(1); times.push(performance.now() - t0);
      }
      fz.input.clear();
      times.sort((a, b) => a - b); const n = times.length;
      const S = fz.Game.debug.state ? fz.Game.debug.state() : null;
      return { mean: times.reduce((a, b) => a + b, 0) / n, p50: times[n >> 1], p95: times[Math.floor(n * .95)], p99: times[Math.floor(n * .99)], max: times[n - 1], bubbles: S ? S.bubbles.length : -1, phase: S ? S.phase : '' };
    }, name);
    // real-time RAF loop: frame interval distribution over ~3 s
    await ev(t.page, () => { fz.freeze(false); });
    const raf = await ev(t.page, () => new Promise((res) => {
      const ts = []; const t0 = performance.now();
      const f = (now) => { ts.push(now); if (now - ts[0] < 3000) requestAnimationFrame(f); else { const d = []; for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]); d.sort((a, b) => a - b); const n = d.length; res({ fps: +(1000 * n / (ts[ts.length - 1] - ts[0])).toFixed(1), p50: d[n >> 1], p95: d[Math.floor(n * .95)], p99: d[Math.floor(n * .99)], max: d[n - 1], over25: d.filter((x) => x > 25).length, over50: d.filter((x) => x > 50).length, frames: n }); } };
      requestAnimationFrame(f);
    }));
    const row = { rate, scene: name, step_mean: +stepStats.mean.toFixed(2), step_p95: +stepStats.p95.toFixed(2), step_p99: +stepStats.p99.toFixed(2), step_max: +stepStats.max.toFixed(2), bubbles: stepStats.bubbles, fps: raf.fps, raf_p95: +raf.p95.toFixed(1), raf_max: +raf.max.toFixed(1), over25: raf.over25, over50: raf.over50 };
    results.push(row); log(JSON.stringify(row));
  }
  log('errors', JSON.stringify(t.errors));
  await t.close();
}
fs.writeFileSync(path.join(D, 'perf.json'), JSON.stringify(results, null, 1));
await browser.close();
