// requestIdleCallback behaviour of the warm-up under load: how many callbacks, how many with didTimeout (timeRemaining()==0 -> warmStep never runs), bakes per callback
import path from 'path';
import { createRequire } from 'module';
import { HTML, K_VIEWS, sleep } from './qa_v2_perf_lib.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const k = +(process.argv[2] || 6);
const [vw, vh, dpr] = K_VIEWS[k];
const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr });
const page = await context.newPage();
await page.addInitScript(() => {
  const o = window.requestIdleCallback.bind(window);
  window.__ric = { n: 0, timeout: 0, trSum: 0, withIdle: 0, bakesAtTimeout: [], log: [] };
  window.requestIdleCallback = (cb, opt) => o((d) => {
    const R = window.__ric; R.n++; const tr = d.timeRemaining(); R.trSum += tr; if (d.didTimeout) R.timeout++; else R.withIdle++;
    const f = window.__fizzpop; const b0 = f && f.GFX ? f.GFX._stats().bakes : 0;
    const r = cb(d);
    const b1 = f && f.GFX ? f.GFX._stats().bakes : 0;
    if (R.log.length < 40) R.log.push([Math.round(performance.now()), d.didTimeout ? 'T' : 'I', +tr.toFixed(1), b1 - b0]);
    return r;
  }, opt);
});
await page.goto('file://' + HTML);
await page.waitForFunction(() => !!window.__fizzpop && window.__fizzpop.bootMs >= 0);
await page.evaluate(() => window.__fizzpop._main.setQuality(2, true));
await sleep(12000);
const r = await page.evaluate(() => ({ ric: window.__ric, st: window.__fizzpop.GFX._stats() }));
console.log(`k=${r.st.k}: rIC callbacks ${r.ric.n}: with idle time ${r.ric.withIdle}, didTimeout ${r.ric.timeout} (mean timeRemaining ${(r.ric.trSum / r.ric.n).toFixed(2)} ms); warm queue left ${r.st.warmQueue}, sprite entries baked ${r.st.entries}`);
console.log(r.ric.log.slice(0, 24).map((x) => x.join(':')).join('  '));
await browser.close();
