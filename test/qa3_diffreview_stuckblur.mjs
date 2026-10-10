// A window 'blur' that is never followed by a 'focus' event while document.hasFocus() is true again (host moved focus around,
// extension popup, devtools, Firefox/Safari quirks): the 'blur' hold is never released -> audio stays suspended, no overlay, no hint.
import { launch, fp, log, check } from './qa3_diffreview_lib.mjs';
const t = await launch({});
const page = t.page, g = fp(page);
const wait = (ms) => page.waitForTimeout(ms);
const S = () => page.evaluate(() => { const a = __fizzpop.AUDIO._state(); return { ctx: a.ctxState, paused: a.paused, pk: a.pauseKind, music: a.music, holds: __fizzpop._main.holds(), hasFocus: document.hasFocus(), overlayHidden: document.getElementById('focus').hidden, scene: __fizzpop.scene(), gamePaused: __fizzpop._main.paused() }; });
await page.keyboard.press('ArrowDown'); await wait(500);
log('baseline', JSON.stringify(await S()));
await page.evaluate(() => window.dispatchEvent(new Event('blur')));   // blur WITHOUT a later focus event
await wait(1200);
let s = await S(); log('after lone blur', JSON.stringify(s));
for (let i = 0; i < 6; i++) { await page.keyboard.press('ArrowDown'); await wait(120); }
await page.mouse.click(300, 300); await wait(300);
s = await S(); log('after keys + click', JSON.stringify(s));
check('SB1 a lone blur (page really has focus) must not leave audio suspended after the user interacts', s.ctx === 'running' && !s.paused, s);
// same in a running game
await page.evaluate(() => { __fizzpop.goto('play', { players: 1, level: 3, seed: 1 }); });
await wait(600);
await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await wait(800);
s = await S(); log('game + lone blur', JSON.stringify(s));
await page.mouse.click(300, 300); await wait(300);
s = await S(); log('after click', JSON.stringify(s));
log('errors', t.errors);
await t.close();
