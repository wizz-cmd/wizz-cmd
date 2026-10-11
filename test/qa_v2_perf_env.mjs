import { launch, fp } from '../tools/harness.mjs';
const t = await launch({ viewport: { width: 1280, height: 800 } });
const info = await t.page.evaluate(() => ({
  hc: navigator.hardwareConcurrency, dm: navigator.deviceMemory, ua: navigator.userAgent,
  q: window.__fizzpop && window.__fizzpop.quality, k: window.__fizzpop && window.__fizzpop._main.k(),
  perfMem: performance.memory && { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize },
}));
console.log(info);
const t2 = await t.browser.newPage();
await t2.goto('chrome://gpu');
await t2.waitForTimeout(1500);
const txt = await t2.evaluate(() => document.body.innerText);
console.log(txt.slice(0, 2500));
await t.close();
