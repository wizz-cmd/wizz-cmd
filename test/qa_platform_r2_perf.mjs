// Perf under CPU throttling. Separate update vs render timing (wrapping Game.update/render), real RAF fps, long tasks,
// JS-heap allocation rate + GC count from performance.memory sawtooth. Desktop 1280x800@1 and phone 390x844@3.
import { launchBrowser, open, ev, save, sleep } from './qa_platform_r2_lib.mjs';
const browser = await launchBrowser({ autoplay: true });
const scenarios = {
  title: () => { fz.goto('title'); },
  l1_idle_2p: () => { fz.start(2, 1, 5); fz.Game.debug.skipIntro(); fz.Game.debug.god(true); },
  bubbles40: () => {
    fz.start(2, 20, 8); const G = fz.Game.debug; G.skipIntro(); G.god(true);
    const r = fz.U.rng(3);
    for (let i = 0; i < 40; i++) G.spawn(['thunder', 'fire', 'water'][i % 3], r.int(30, 220), r.int(30, 190));
    G.setPlayer(0, { x: 120, y: 120 });
  },
  chain_cluster: () => {
    fz.start(2, 20, 8); const G = fz.Game.debug; G.skipIntro(); G.god(true);
    const r = fz.U.rng(4);
    for (let i = 0; i < 38; i++) G.spawn(['thunder', 'fire', 'water'][i % 3], 120 + r.int(-14, 14), 100 + r.int(-14, 14));
    G.spawn('nibbler', 60, 100); G.spawn('crabbit', 180, 100); G.spawn('jellop', 100, 60); G.spawn('glimmer', 160, 60);
    G.setPlayer(0, { x: 112, y: 96 });
  },
  water_fire: () => {
    fz.start(1, 12, 8); const G = fz.Game.debug; G.skipIntro(); G.god(true);
    G.setPlayer(0, { x: 120, y: 60 });
    for (let i = 0; i < 6; i++) G.spawn(i % 2 ? 'water' : 'fire', 60 + i * 24, 150);
  },
  boss: () => { fz.start(2, 30, 9); const G = fz.Game.debug; G.skipIntro(); G.god(true); for (let i = 0; i < 6; i++) G.spawn('thunder', 40 + i * 30, 180); },
  transition: () => { fz.start(1, 3, 2); const G = fz.Game.debug; G.skipIntro(); G.god(true); G.clearEnemies(); },
};
const wrap = () => {
  if (window.__wrapped) return; window.__wrapped = true;
  window.__T = { u: [], r: [] };
  const G = fz.Game, u = G.update, r = G.render;
  G.update = function (...a) { const t = performance.now(); const x = u.apply(this, a); window.__T.u.push(performance.now() - t); return x; };
  G.render = function (...a) { const t = performance.now(); const x = r.apply(this, a); window.__T.r.push(performance.now() - t); return x; };
};
const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const rows = [];
for (const [dev, vp, dpr, touch] of [['desktop', { width: 1280, height: 800 }, 1, false], ['phone', { width: 390, height: 844 }, 3, true]]) {
  for (const rate of [1, 4, 6]) {
    const t = await open({ browser, viewport: vp, dpr, touch, autoplay: true });
    await t.cdp.send('Emulation.setCPUThrottlingRate', { rate });
    await ev(t.page, wrap);
    for (const [name, setup] of Object.entries(scenarios)) {
      await ev(t.page, setup);
      await ev(t.page, () => { fz.freeze(false); window.__T.u.length = 0; window.__T.r.length = 0; });
      await sleep(600);
      // measurement window: real loop, 4 s; RAF intervals, long tasks, heap sawtooth
      const m = await ev(t.page, () => new Promise((res) => {
        window.__T.u.length = 0; window.__T.r.length = 0;
        const ts = [], heap = []; let long = 0, longMax = 0;
        let po = null; try { po = new PerformanceObserver((l) => { for (const e of l.getEntries()) { long++; longMax = Math.max(longMax, e.duration); } }); po.observe({ entryTypes: ['longtask'] }); } catch (e) {}
        if (window.gc) window.gc();
        const f = (now) => { ts.push(now); heap.push(performance.memory.usedJSHeapSize); if (now - ts[0] < 4000) requestAnimationFrame(f); else {
          if (po) po.disconnect();
          const d = []; for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]); d.sort((a, b) => a - b); const n = d.length;
          let alloc = 0, gcs = 0; for (let i = 1; i < heap.length; i++) { const dd = heap[i] - heap[i - 1]; if (dd >= 0) alloc += dd; else gcs++; }
          res({ fps: +(1000 * n / (ts[ts.length - 1] - ts[0])).toFixed(1), p95: d[Math.floor(n * .95)], p99: d[Math.floor(n * .99)], max: d[n - 1], over25: d.filter((x) => x > 25).length, over50: d.filter((x) => x > 50).length, long, longMax, allocKBps: Math.round(alloc / 1024 / 4), gcs, u: window.__T.u.slice(), r: window.__T.r.slice() });
        } };
        requestAnimationFrame(f);
      }));
      const row = { dev, rate, scene: name, fps: m.fps, rafP95: +m.p95.toFixed(1), rafMax: +m.max.toFixed(1), over25: m.over25, over50: m.over50, longTasks: m.long, longMax: +m.longMax.toFixed(0),
        upd_mean: +(m.u.reduce((a, b) => a + b, 0) / Math.max(1, m.u.length)).toFixed(2), upd_p99: +pct(m.u, 0.99).toFixed(2), upd_max: +Math.max(...m.u).toFixed(1),
        rnd_mean: +(m.r.reduce((a, b) => a + b, 0) / Math.max(1, m.r.length)).toFixed(2), rnd_p99: +pct(m.r, 0.99).toFixed(2), rnd_max: +Math.max(...m.r).toFixed(1),
        allocKBps: m.allocKBps, gcs: m.gcs };
      rows.push(row); console.log(JSON.stringify(row));
    }
    console.log(dev, rate, 'errors', JSON.stringify(t.errors));
    await t.close();
  }
}
await browser.close();
save('perf.json', rows);
