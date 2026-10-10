// QA platform: normal blur/focus cycle restores audio (control), and the in-game pause->resume gesture recovers a context suspended externally.
import { launchBrowser, open, ev, log } from './qa_platform_lib.mjs';
const init = `(() => { const AC = window.AudioContext; window.__acs = []; window.AudioContext = class extends AC { constructor(...a) { super(...a); window.__acs.push(this); } }; })();`;
const browser = await launchBrowser({ autoplay: false });
const t = await open({ browser, initScript: init });
const P = t.page;
const st = () => ev(P, () => ({ ready: fz.AUDIO.ready(), state: window.__acs[0] && window.__acs[0].state, scene: fz.scene(), paused: fz._main.paused() }));
await P.keyboard.press('ArrowDown'); await P.waitForTimeout(300);                  // first gesture (key) unlocks
log('unlocked', JSON.stringify(await st()));
await ev(P, () => { window.dispatchEvent(new Event('blur')); }); await P.waitForTimeout(700);
log('after blur (title)', JSON.stringify(await st()));
await ev(P, () => { window.dispatchEvent(new Event('focus')); }); await P.waitForTimeout(500);
log('after focus (control: resumes via onFocus, gesture-less)', JSON.stringify(await st()));
// in a game: external suspend, then Esc, Esc (pause/resume gestures)
await ev(P, () => { fz.start(1, 1, 3); fz.Game.debug.skipIntro(); });
await ev(P, () => window.__acs[0].suspend()); await P.waitForTimeout(300);
log('game running, context suspended externally', JSON.stringify(await st()));
await P.keyboard.press('Space'); await P.keyboard.press('KeyZ'); await P.waitForTimeout(300);
log('after 2 more gestures (Space, Z)', JSON.stringify(await st()));
await P.keyboard.press('Escape'); await P.waitForTimeout(500); await P.keyboard.press('Escape'); await P.waitForTimeout(500);
log('after Esc, Esc (pause/resume)', JSON.stringify(await st()));
await t.close(); await browser.close();
