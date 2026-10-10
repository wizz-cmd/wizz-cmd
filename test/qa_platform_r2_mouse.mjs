// Mouse on the touch controls (hybrid laptop / desktop with touch layout): drag off the pad and release elsewhere -> stuck key?
import { launchBrowser, open, ev, save, sleep } from './qa_platform_r2_lib.mjs';
const browser = await launchBrowser({ autoplay: true });
const t = await open({ browser, viewport: { width: 700, height: 800 }, touch: true, dpr: 1, autoplay: true });
await ev(t.page, () => { fz.start(1, 3, 2); fz.Game.debug.skipIntro(); fz.Game.debug.god(true); });
await sleep(400);
const R = await t.page.evaluate(() => { const r = document.querySelector('#touch [data-k=right]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
const X = () => ev(t.page, () => fz.Game.debug.state().players[0].x);
const on = () => t.page.evaluate(() => [...document.querySelectorAll('#touch [data-k].on')].map((b) => b.dataset.k));
const x0 = await X();
await t.page.mouse.move(R.x, R.y); await t.page.mouse.down(); await sleep(150);
const during = await on();
await t.page.mouse.move(R.x, 100, { steps: 6 });      // drag up to canvas area
await sleep(150);
const dragged = await on();
await t.page.mouse.up();
await sleep(500);
const x1 = await X(); await sleep(400); const x2 = await X();
console.log(JSON.stringify({ during, dragged, afterRelease_on: await on(), x0, x1, x2, stillRunning: x2 - x1 > 1 }));
// release outside the window
await t.page.mouse.move(R.x, R.y); await t.page.mouse.down(); await sleep(100);
await t.page.mouse.move(R.x, 900, { steps: 4 });   // below viewport
await t.page.mouse.up(); await sleep(400);
const y1 = await X(); await sleep(400); const y2 = await X();
console.log(JSON.stringify({ afterOutsideRelease_on: await on(), y1, y2, stillRunning: y2 - y1 > 1 }));
await browser.close();
