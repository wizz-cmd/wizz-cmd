// Audio unlock/recovery: real autoplay policy. Simulate an external suspend (iOS 'interrupted' / OS audio focus loss /
// Chrome autoplay re-suspend) while the game is NOT paused and not blurred, then press keys / tap and see whether the
// AudioContext comes back by itself.
import { open, ev, save } from './qa_platform_r2_lib.mjs';
const init = `(() => { const A = window.AudioContext; window.__acs = [];
  window.AudioContext = function (...a) { const c = new A(...a); window.__acs.push(c); return c; };
  window.AudioContext.prototype = A.prototype; })();`;
const out = {};
const t = await open({ initScript: init, autoplay: false });
const st = () => t.page.evaluate(() => ({ ac: window.__acs.map((c) => c.state), audio: window.__fizzpop.AUDIO._state(), scene: window.__fizzpop.scene() }));
out.initial = await st();
await t.page.keyboard.press('Enter'); await t.page.waitForTimeout(500);
out.afterEnter = await st();
// externally suspend (what iOS does on interruption / what Chrome may do when the tab was backgrounded and audio focus lost)
await t.page.evaluate(() => window.__acs[0].suspend()); await t.page.waitForTimeout(300);
out.afterExternalSuspend = await st();
for (let i = 0; i < 3; i++) { await t.page.keyboard.press('ArrowLeft'); await t.page.waitForTimeout(150); }
await t.page.mouse.click(300, 300); await t.page.waitForTimeout(400);
out.afterKeysAndClick = await st();
// now tap canvas via touch events (a real gesture)
await t.page.waitForTimeout(500);
out.later = await st();
// blur/focus path
await t.page.evaluate(() => { window.dispatchEvent(new Event('blur')); }); await t.page.waitForTimeout(300);
await t.page.evaluate(() => { window.dispatchEvent(new Event('focus')); }); await t.page.waitForTimeout(400);
out.afterBlurFocus = await st();
out.errors = t.errors;
save('audiounlock.json', out);
console.log(JSON.stringify(out, null, 1));
await t.close();
