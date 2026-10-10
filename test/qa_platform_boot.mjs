// QA platform: first-load time (file:// and http), under CPU throttling; CPU profile of boot to see where time goes.
import fs from 'fs'; import path from 'path';
import { launchBrowser, serve, DIST, OUT, log } from './qa_platform_lib.mjs';
const D = path.join(OUT, 'perf'); fs.mkdirSync(D, { recursive: true });
const html = fs.readFileSync(DIST, 'utf8');
const srv = await serve({ '/g.html': { body: html } });
const browser = await launchBrowser({ autoplay: true });
const init = `window.__t = {}; const raf = window.requestAnimationFrame.bind(window); let n = 0; window.requestAnimationFrame = (cb) => raf((now) => { if (++n === 1) window.__t.firstRaf = performance.now(); if (n === 2) window.__t.secondRaf = performance.now(); cb(now); });
  new MutationObserver(() => {}).observe(document, { childList: true, subtree: true }); document.addEventListener('DOMContentLoaded', () => { window.__t.dcl = performance.now(); });`;
for (const rate of [1, 4, 6]) {
  const runs = [];
  for (let k = 0; k < 3; k++) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    await page.addInitScript(init);
    await page.goto(`http://127.0.0.1:${srv.port}/g.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__t && window.__t.secondRaf, null, { timeout: 60000 });
    const t = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { ...window.__t, domInteractive: n.domInteractive, load: n.loadEventEnd, resp: n.responseEnd }; });
    runs.push(t); await ctx.close();
  }
  const med = (k) => runs.map((r) => r[k]).sort((a, b) => a - b)[1];
  log(`rate ${rate}x  (phone 390x844@3, median of 3): responseEnd ${med('resp').toFixed(0)} ms, DOMContentLoaded ${med('dcl').toFixed(0)} ms, load ${med('load').toFixed(0)} ms, first RAF ${med('firstRaf').toFixed(0)} ms, second RAF ${med('secondRaf').toFixed(0)} ms`);
}
// CPU profile of boot at 1x and 4x
for (const rate of [1, 4]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  await cdp.send('Profiler.start');
  await page.goto(`http://127.0.0.1:${srv.port}/g.html`, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  const { profile } = await cdp.send('Profiler.stop');
  const byId = new Map(profile.nodes.map((n) => [n.id, n])); const self = new Map();
  const dt = profile.timeDeltas; profile.samples.forEach((id, i) => { self.set(id, (self.get(id) || 0) + (dt[i] || 0)); });
  const agg = new Map(); for (const [id, us] of self) { const n = byId.get(id); const k = `${n.callFrame.functionName || '(anon)'}:${n.callFrame.lineNumber}`; agg.set(k, (agg.get(k) || 0) + us); }
  const tot = [...agg.values()].reduce((a, b) => a + b, 0);
  log(`boot CPU profile @${rate}x: total sampled ${(tot / 1000).toFixed(0)} ms; top self:`, JSON.stringify([...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => [k, +(v / 1000).toFixed(0)])));
  await ctx.close();
}
await browser.close(); await srv.close();
