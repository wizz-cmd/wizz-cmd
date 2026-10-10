// False auto-pause probes: long main-thread hitches, CPU throttling, tiny visibility, partially off-screen canvas.
import { launch, fp, log, check } from './qa3_diffreview_lib.mjs';
const t = await launch({});
const g = fp(t.page);
const wait = (ms) => t.page.waitForTimeout(ms);
const info = () => t.page.evaluate(() => ({ holds: __fizzpop._main.holds(), paused: __fizzpop._main.paused(), scene: __fizzpop.scene(), ctx: __fizzpop.AUDIO._state().ctxState, apaused: __fizzpop.AUDIO._state().paused }));
await t.page.keyboard.press('Enter'); await wait(300);
await t.page.keyboard.press('Enter'); await wait(200); // story skip
for (let i = 0; i < 60 && (await g.scene()) !== 'play'; i++) await wait(100);
log('scene', await g.scene());
await wait(500);
// 1. single long hitch of various lengths
for (const ms of [800, 1200, 2000, 4000]) {
  await t.page.evaluate((ms) => { setTimeout(() => { const t0 = performance.now(); while (performance.now() - t0 < ms); }, 0); }, ms);
  await wait(ms + 1200);
  const s = await info();
  log('hitch', ms, JSON.stringify(s));
  check(`H1 a ${ms} ms main-thread hitch does not auto-pause the game`, !s.paused && s.holds.length === 0, s);
  if (s.paused) { await t.page.keyboard.press('KeyP'); await wait(200); }
}
// 2. repeated hitches of 600ms (below stall threshold) back to back
for (let i = 0; i < 4; i++) { await t.page.evaluate(() => { const t0 = performance.now(); while (performance.now() - t0 < 600); }); await wait(100); }
await wait(1200);
let s = await info();
check('H2 repeated 600 ms hitches do not pause', !s.paused && s.holds.length === 0, s);
// 3. CDP CPU throttle x20 (a slow phone)
const cdp = await t.context.newCDPSession(t.page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 20 });
await wait(4000);
s = await info();
log('throttle x20', JSON.stringify(s));
check('H3 CPU throttle x20 does not auto-pause', !s.paused && s.holds.length === 0, s);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
// 4. a hitch while the user holds a key
await t.page.keyboard.down('ArrowRight');
await t.page.evaluate(() => { setTimeout(() => { const t0 = performance.now(); while (performance.now() - t0 < 1600); }, 0); });
await wait(3000);
await t.page.keyboard.up('ArrowRight');
s = await info();
check('H4 hitch during held key does not pause', !s.paused, s);
log('errors', t.errors);
await t.close();
