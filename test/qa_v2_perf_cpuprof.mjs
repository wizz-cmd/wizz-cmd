// V8 CPU profile (sampling) of a phase: boot | title | play. Reports self-time by function (with file:line) and by "inclusive" for the bundle's named functions.
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { HTML, OUT, sleep, K_VIEWS, BUSY, DRIVE } from './qa_v2_perf_lib.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const phase = process.argv[2] || 'boot', cpu = +(process.argv[3] || 1), kS = process.argv[4] || '4', q = process.argv[5];
const [vw, vh, dpr] = K_VIEWS[+kS];
const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
if (phase === 'boot') await cdp.send('Profiler.start');
await page.goto('file://' + path.resolve(HTML));
await page.waitForFunction(() => !!window.__fizzpop && window.__fizzpop.bootMs >= 0, null, { timeout: 90000 });
if (phase === 'boot') await sleep(1500);
else {
  if (phase === 'play') {
    await page.evaluate((setup) => { fz = window.__fizzpop; fz.freeze(true); (0, eval)(setup); }, BUSY);
    if (q !== undefined) await page.evaluate((q) => fz._main.setQuality(+q, true), q);
    await page.evaluate((drive) => { fz.freeze(false); const drv = (0, eval)('(' + drive + ')'); let n = 0; window.__drive = setInterval(() => { n++; drv(n); }, 16); }, DRIVE(false));
  } else if (q !== undefined) await page.evaluate((q) => { fz = window.__fizzpop; fz._main.setQuality(+q, true); }, q);
  await sleep(2500);
  await cdp.send('Profiler.start');
  await sleep(6000);
}
const { profile } = await cdp.send('Profiler.stop');
const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const dt = profile.timeDeltas; let total = 0;
for (let i = 0; i < profile.samples.length; i++) { const id = profile.samples[i]; self.set(id, (self.get(id) || 0) + (dt[i] || 0)); total += dt[i] || 0; }
const byFn = new Map();
for (const [id, us] of self) {
  const n = nodes.get(id), cf = n.callFrame;
  const key = (cf.functionName || '(anon)') + ' ' + path.basename(cf.url || '') + ':' + cf.lineNumber;
  byFn.set(key, (byFn.get(key) || 0) + us);
}
console.log(`phase=${phase} cpu=${cpu} total sampled ${(total / 1000).toFixed(0)} ms`);
for (const [k, us] of [...byFn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log('  ', (us / 1000).toFixed(1).padStart(8), 'ms', (us / total * 100).toFixed(1).padStart(5) + '%', k);
fs.writeFileSync(OUT + `/cpuprof_${phase}_k${kS}_cpu${cpu}.json`, JSON.stringify([...byFn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 80)));
await browser.close();
