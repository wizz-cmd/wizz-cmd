// Boot + warm-up timeline: rAF intervals, long tasks, GFX bake stats over time from navigation start, then a game start, a round change.
// usage: node boot.mjs [cpu=1] [phone=0] [vw vh dpr]
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { HTML, OUT, sleep, stat } from './qa_v2_perf_lib.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const cpu = +(process.argv[2] || 1), phone = process.argv[3] === '1';
const [vw, vh, dpr] = phone ? [390, 844, 3] : [+(process.argv[4] || 1280), +(process.argv[5] || 1000), +(process.argv[6] || 1)];
const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr, hasTouch: phone, isMobile: phone });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
await page.addInitScript(() => {
  window.__fr = []; window.__lt = []; window.__t0 = performance.now();
  let last = performance.now();
  const tick = (ts) => { window.__fr.push([+(ts).toFixed(0), +(ts - last).toFixed(1)]); last = ts; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([+e.startTime.toFixed(0), +e.duration.toFixed(0)]); }).observe({ entryTypes: ['longtask'] }); } catch (e) {}
  window.__snaps = [];
  setInterval(() => { const f = window.__fizzpop; if (f && f.GFX) { const s = f.GFX._stats(); window.__snaps.push({ t: Math.round(performance.now()), bakes: s.bakes, bakeMs: Math.round(s.bakeMs), px: s.px, warmQ: s.warmQueue, jobs: s.jobs, k: s.k }); } }, 250);
});
await page.goto('file://' + path.resolve(process.env.VARIANT_HTML || HTML));
await page.waitForFunction(() => !!window.__fizzpop && window.__fizzpop.bootMs >= 0, null, { timeout: 90000 });
const boot = await page.evaluate(() => ({ bootMs: __fizzpop.bootMs, loadingMs: __fizzpop.loadingMs, prof: __fizzpop.bootProfile, k: __fizzpop._main.k(), q: __fizzpop.quality }));
console.log('boot', JSON.stringify(boot));
await sleep(8000 * Math.max(1, cpu / 2));
const phaseA = await page.evaluate(() => ({ now: Math.round(performance.now()), fr: window.__fr.slice(), lt: window.__lt.slice(), snaps: window.__snaps.slice() }));
// start a game (real-time) and play 12 s
await page.evaluate(() => { fz = window.__fizzpop; window.__mark = Math.round(performance.now()); fz.start(1, 1, 7); fz.Game.debug.god(true); let n = 0; window.__drive = setInterval(() => { n++; fz.input.set(0, { right: (n >> 5) % 2 === 0, left: (n >> 5) % 2 === 1, fire: n % 6 < 3, jump: n % 40 === 0 }); }, 16); });
await sleep(14000);
const phaseB = await page.evaluate(() => ({ now: Math.round(performance.now()), mark: window.__mark, fr: window.__fr.slice(), lt: window.__lt.slice(), snaps: window.__snaps.slice(), k: __fizzpop._main.k(), q: __fizzpop.quality }));
const fr = phaseB.fr;
const rel = (arr) => arr.map((x) => x);
const hitches = fr.filter((x) => x[1] > 34).map((x) => x[0] + 'ms:' + x[1]);
const before = fr.filter((x) => x[0] < phaseB.mark).map((x) => x[1]);
const after = fr.filter((x) => x[0] >= phaseB.mark).map((x) => x[1]);
console.log('title phase rAF', JSON.stringify(stat(before)), ' | play phase rAF', JSON.stringify(stat(after)));
console.log('frames > 34 ms (t:ms)', hitches.slice(0, 40).join(' '), hitches.length > 40 ? '... (' + hitches.length + ')' : '');
console.log('long tasks (t:ms)', phaseB.lt.map((x) => x[0] + ':' + x[1]).join(' '));
const sn = phaseB.snaps;
const pick = (t) => sn.find((s) => s.t >= t) || sn[sn.length - 1];
for (const t of [boot.bootMs + 300, 1500, 3000, 6000, 10000, phaseB.mark, phaseB.mark + 500, phaseB.mark + 3000, phaseB.mark + 10000]) { const s = pick(t); console.log(`  t=${s.t}ms bakes=${s.bakes} bakeMs=${s.bakeMs} px=${(s.px / 1e6).toFixed(2)}M warmQ=${s.warmQ} jobs=${s.jobs} k=${s.k}`); }
fs.writeFileSync(OUT + `/boot_cpu${cpu}${phone ? '_phone' : ''}.json`, JSON.stringify({ boot, phaseB: { ...phaseB, fr: undefined }, hitches }, null, 1));
await browser.close();
