// QA platform: 20 000-step soak (random seeded input, god mode, cycling rounds), heap after forced GC every 2000 steps,
// array sizes of the game state, allocation sampling (HeapProfiler) to see what allocates per frame.
import fs from 'fs'; import path from 'path';
import { launchBrowser, open, ev, OUT, log } from './qa_platform_lib.mjs';
const D = path.join(OUT, 'perf'); fs.mkdirSync(D, { recursive: true });
const browser = await launchBrowser({ autoplay: true });
const t = await open({ browser, viewport: { width: 1024, height: 768 } });
const cdp = t.cdp;
await cdp.send('HeapProfiler.enable');
const heap = async () => { await cdp.send('HeapProfiler.collectGarbage'); const m = await t.page.evaluate(() => ({ used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize })); return m; };
await ev(t.page, () => { fz.freeze(true); fz.start(2, 1, 77); fz.Game.debug.skipIntro(); fz.Game.debug.god(true); });
log('start heap', JSON.stringify(await heap()));
const rows = [];
await cdp.send('HeapProfiler.startSampling', { samplingInterval: 2048 });
for (let chunk = 0; chunk < 10; chunk++) {
  const info = await ev(t.page, (chunk) => {
    const r = fz.U.rng(100 + chunk); let maxStep = 0; const t0 = performance.now();
    for (let i = 0; i < 2000; i++) {
      if (i % 6 === 0) { for (const pi of [0, 1]) fz.input.set(pi, { left: r.chance(.45), right: r.chance(.45), jump: r.chance(.25), fire: r.chance(.5) }); }
      if (i % 700 === 0) fz.Game.debug.setLevel(1 + ((chunk * 3 + (i / 700 | 0) * 7) % 30));
      if (fz.scene() !== 'play') fz.start(2, 1 + (chunk * 5) % 30, 5 + chunk);       // game over -> restart
      const s0 = performance.now(); fz.step(1); const d = performance.now() - s0; if (d > maxStep) maxStep = d;
    }
    fz.input.clear();
    const S = fz.Game.debug._S();
    return { ms: performance.now() - t0, maxStep, level: S.level, arr: { bubbles: S.bubbles.length, fx: S.fx.length, popups: S.popups.length, proj: S.proj.length, items: S.items.length, flames: S.flames.length, streams: S.streams.length, bolts: S.bolts.length, drops: S.drops.length, enemies: S.enemies.length } };
  }, chunk);
  const h = await heap();
  rows.push({ steps: (chunk + 1) * 2000, used_kb: Math.round(h.used / 1024), total_kb: Math.round(h.total / 1024), ms_per_step: +(info.ms / 2000).toFixed(3), maxStep: +info.maxStep.toFixed(1), level: info.level, arr: info.arr });
  log(JSON.stringify(rows[rows.length - 1]));
}
const prof = await cdp.send('HeapProfiler.stopSampling');
// aggregate self sizes by function
const agg = new Map();
const walk = (n) => { const k = `${n.callFrame.functionName || '(anon)'}@${(n.callFrame.url || '').split('/').pop()}:${n.callFrame.lineNumber}`; agg.set(k, (agg.get(k) || 0) + n.selfSize); n.children.forEach(walk); };
walk(prof.profile.head);
const top = [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
const totalAlloc = [...agg.values()].reduce((a, b) => a + b, 0);
log('sampled live-at-end allocation total KB (retained at sampling end):', Math.round(totalAlloc / 1024));
log('top retained allocators (KB):', JSON.stringify(top.map(([k, v]) => [k, Math.round(v / 1024)])));
const slope = (rows[rows.length - 1].used_kb - rows[1].used_kb) / (rows.length - 2);
log('heap slope after GC: KB per 2000 steps =', slope.toFixed(1));
fs.writeFileSync(path.join(D, 'soak.json'), JSON.stringify(rows, null, 1));
log('errors', JSON.stringify(t.errors));
await t.close(); await browser.close();
