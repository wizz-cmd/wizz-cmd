// First-load cost: navigation timing, FCP, time inside script evaluation (boot), long tasks, heap after boot. CPU throttle 1/4/6.
import { launchBrowser, DIST, save } from './qa_platform_r2_lib.mjs';
const browser = await launchBrowser({ autoplay: false });
const rows = [];
for (const rate of [1, 4, 6]) {
  for (let run = 0; run < 3; run++) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    await page.addInitScript(`window.__lt=[];try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lt.push([Math.round(e.startTime),Math.round(e.duration)])}).observe({entryTypes:['longtask']})}catch(e){}`);
    const t0 = Date.now();
    await page.goto('file://' + DIST, { waitUntil: 'load' });
    const wall = Date.now() - t0;
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => {
      const n = performance.getEntriesByType('navigation')[0];
      const fcp = performance.getEntriesByType('paint').find((p) => p.name === 'first-contentful-paint');
      return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), fcp: fcp ? Math.round(fcp.startTime) : null, long: window.__lt, heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1), bootDone: !!window.__fizzpop, canvasCount: document.querySelectorAll('canvas').length };
    });
    rows.push({ rate, run, wall, ...m });
    console.log(JSON.stringify({ rate, run, wall, ...m }));
    await ctx.close();
  }
}
await browser.close();
save('boot.json', rows);
