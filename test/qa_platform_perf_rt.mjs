// QA platform: REAL-TIME performance. The page's own RAF callbacks are wrapped (init script) to time update+render JS per frame;
// frame intervals from the RAF timestamps; main-thread busy ratio from CDP Performance.getMetrics (TaskDuration). CPU throttle 1/4/6.
import fs from 'fs'; import path from 'path';
import { launchBrowser, open, ev, OUT, log } from './qa_platform_lib.mjs';
const D = path.join(OUT, 'perf'); fs.mkdirSync(D, { recursive: true });
const init = `
  (() => { const raf = window.requestAnimationFrame.bind(window); window.__cb = []; window.__ts = []; window.__rec = false;
    window.requestAnimationFrame = (cb) => raf((now) => { const t0 = performance.now(); try { cb(now); } finally { if (window.__rec) { window.__cb.push(performance.now() - t0); window.__ts.push(now); } } }); })();`;
const browser = await launchBrowser({ autoplay: true });
const scenarios = {
  title: () => { fz.goto('title'); },
  l1_idle: () => { fz.start(2, 1, 5); fz.Game.debug.skipIntro(); fz.Game.debug.god(true); },
  bubbles40: () => {
    fz.start(2, 20, 8); const G = fz.Game.debug; G.skipIntro(); G.god(true);
    const r = fz.U.rng(3);
    for (let i = 0; i < 40; i++) G.spawn(['thunder', 'fire', 'water'][i % 3], r.int(30, 220), r.int(30, 190));
  },
  chain_cluster: () => {
    fz.start(2, 20, 8); const G = fz.Game.debug; G.skipIntro(); G.god(true);
    const r = fz.U.rng(4);
    for (let i = 0; i < 38; i++) G.spawn(['thunder', 'fire', 'water'][i % 3], 120 + r.int(-14, 14), 100 + r.int(-14, 14));
    G.spawn('nibbler', 60, 100); G.spawn('crabbit', 180, 100); G.spawn('jellop', 100, 60); G.spawn('glimmer', 160, 60);
    G.setPlayer(0, { x: 112, y: 96 });
  },
  boss: () => { fz.start(2, 30, 9); const G = fz.Game.debug; G.skipIntro(); G.god(true); for (let i = 0; i < 6; i++) G.spawn('thunder', 40 + i * 30, 180); },
  transition: () => { fz.start(1, 3, 2); const G = fz.Game.debug; G.skipIntro(); G.god(true); G.killAll(); },
};
const pct = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
const results = [];
for (const [vpName, vp, dpr] of [['1280x800@1', { width: 1280, height: 800 }, 1], ['1920x1080@1', { width: 1920, height: 1080 }, 1], ['1920x1080@2', { width: 1920, height: 1080 }, 2]]) {
  for (const rate of [1, 4, 6]) {
    if (vpName !== '1280x800@1' && rate === 6) continue;
    const t = await open({ browser, viewport: vp, dpr, initScript: init });
    await t.cdp.send('Performance.enable');
    await t.cdp.send('Emulation.setCPUThrottlingRate', { rate });
    for (const [name, setup] of Object.entries(scenarios)) {
      await ev(t.page, setup);
      await ev(t.page, () => { fz.freeze(false); });
      await t.page.waitForTimeout(600);
      // keep some input going so the scene stays busy
      await ev(t.page, () => { fz.input.set(0, { fire: true, left: true }); fz.input.set(1, { fire: true, right: true }); window.__cb.length = 0; window.__ts.length = 0; window.__rec = true; });
      const m0 = (await t.cdp.send('Performance.getMetrics')).metrics.reduce((o, m) => (o[m.name] = m.value, o), {});
      const w0 = Date.now();
      await t.page.waitForTimeout(3500);
      const m1 = (await t.cdp.send('Performance.getMetrics')).metrics.reduce((o, m) => (o[m.name] = m.value, o), {});
      const wall = (Date.now() - w0) / 1000;
      const r = await ev(t.page, () => { window.__rec = false; fz.input.clear(); const S = fz.Game.debug.state(); return { cb: window.__cb.slice().sort((a, b) => a - b), ts: window.__ts.slice(), bubbles: S.bubbles.length, enemies: S.enemies.length, phase: S.phase }; });
      const d = []; for (let i = 1; i < r.ts.length; i++) d.push(r.ts[i] - r.ts[i - 1]); const ds = d.slice().sort((a, b) => a - b);
      const row = { vp: vpName, rate, scene: name, fps: +(1000 * d.length / (r.ts[r.ts.length - 1] - r.ts[0])).toFixed(1), cb_mean: +(r.cb.reduce((a, b) => a + b, 0) / r.cb.length).toFixed(2), cb_p95: +pct(r.cb, .95).toFixed(2), cb_max: +r.cb[r.cb.length - 1].toFixed(2), dt_p99: +pct(ds, .99).toFixed(1), dt_max: +ds[ds.length - 1].toFixed(1), slow25: d.filter((x) => x > 25).length, slow50: d.filter((x) => x > 50).length, busy: +(((m1.TaskDuration - m0.TaskDuration) / wall) * 100 / 1).toFixed(0) + '%', script: +(((m1.ScriptDuration - m0.ScriptDuration) / wall) * 100).toFixed(0) + '%', bubbles: r.bubbles, enemies: r.enemies, phase: r.phase };
      results.push(row); log(JSON.stringify(row));
    }
    log('errors', JSON.stringify(t.errors));
    await t.close();
  }
}
fs.writeFileSync(path.join(D, 'perf_rt.json'), JSON.stringify(results, null, 1));
await browser.close();
