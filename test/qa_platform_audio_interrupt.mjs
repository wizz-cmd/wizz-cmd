// QA platform: AudioContext interrupted/suspended by the OS or browser after the first unlock (iOS call/lock screen/app switch, Chrome tab
// discarding...). Does a later user gesture bring the sound back? (real autoplay policy, AudioContext captured via a subclass.)
import { launchBrowser, open, ev, log } from './qa_platform_lib.mjs';
const init = `(() => { const AC = window.AudioContext; window.__acs = []; window.AudioContext = class extends AC { constructor(...a) { super(...a); window.__acs.push(this); } }; })();`;
const browser = await launchBrowser({ autoplay: false });
const t = await open({ browser, initScript: init, viewport: { width: 1024, height: 768 } });
const P = t.page;
const st = () => ev(P, () => ({ ready: fz.AUDIO.ready(), state: window.__acs[0] && window.__acs[0].state, n: window.__acs.length, scene: fz.scene(), paused: fz._main.paused() }));
log('before gesture', JSON.stringify(await st()));
await P.mouse.click(300, 300); await P.waitForTimeout(500);
log('after first click', JSON.stringify(await st()));
// OS interruption: suspend from outside (as iOS does) -- no blur/visibility events fire (e.g. incoming call banner, Siri, headphone unplug, Bluetooth)
await ev(P, () => window.__acs[0].suspend()); await P.waitForTimeout(400);
log('after external suspend', JSON.stringify(await st()));
await P.keyboard.press('ArrowDown'); await P.waitForTimeout(100); await P.mouse.click(400, 400); await P.waitForTimeout(100); await P.keyboard.press('Space'); await P.waitForTimeout(600);
log('after further key + click gestures (sound should be back)', JSON.stringify(await st()));
// variant: hide/show cycle where resume() is rejected once (as on iOS outside a gesture) -- then user taps
await ev(P, () => { const ac = window.__acs[0]; const orig = ac.resume.bind(ac); ac.__rejectOnce = true; ac.resume = function () { if (ac.__rejectOnce) { ac.__rejectOnce = false; return Promise.reject(new DOMException('needs gesture', 'NotAllowedError')); } return orig(); }; });
await ev(P, () => window.__acs[0].suspend()); await P.waitForTimeout(300);
await ev(P, () => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });   // simulated app switch back (resume rejected)
await P.waitForTimeout(400);
log('after app-switch-back with rejected resume', JSON.stringify(await st()));
await P.keyboard.press('ArrowDown'); await P.mouse.click(500, 300); await P.waitForTimeout(600);
log('after user gestures following the rejection', JSON.stringify(await st()));
log('errors', JSON.stringify(t.errors));
await t.close(); await browser.close();
