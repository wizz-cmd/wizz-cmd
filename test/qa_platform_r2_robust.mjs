// Robustness: storage throwing, audio missing/throwing, missing APIs, tiny viewports, rapid resize, long stalls / frozen tab.
import { open, launchBrowser, ev, save, sleep, OUT } from './qa_platform_r2_lib.mjs';
const out = {};
const browser = await launchBrowser({ autoplay: false });
async function drive(t, label) {
  // title -> play -> die -> game over -> entry -> scores, all through the public hooks (+ real input via keyboard)
  const r = {};
  await t.page.keyboard.press('KeyM'); await sleep(100);   // mute toggle (writes storage)
  await t.page.keyboard.press('KeyM'); await sleep(100);
  await ev(t.page, () => { fz.start(1, 1, 5); fz.Game.debug.god(false); });
  await sleep(500);
  r.scene = await ev(t.page, () => fz.scene());
  // force game over quickly: set lives 0 & kill
  await ev(t.page, () => { fz.goto('entry', { entries: [{ pi: 0, score: 40000, round: 9 }] }); });
  await sleep(800);
  // type initials: bubble confirm 3x
  for (let i = 0; i < 4; i++) { await t.page.keyboard.press('Space'); await sleep(120); }
  await sleep(1500);
  r.sceneAfterEntry = await ev(t.page, () => fz.scene());
  r.scores = await ev(t.page, () => fz._main.scores().slice(0, 3));
  r.errors = t.errors.slice();
  return r;
}
// 1 storage getter throws
{
  const t = await open({ browser, initScript: `Object.defineProperty(window,'localStorage',{get(){throw new DOMException('The operation is insecure.','SecurityError')}});`, autoplay: false });
  out.storageGetterThrows = await drive(t, 'storage'); await t.close();
}
// 2 storage quota throws on set
{
  const t = await open({ browser, initScript: `Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError')}; `, autoplay: false });
  out.storageSetThrows = await drive(t, 'quota'); await t.close();
}
// 3 corrupted stored data
{
  const t = await open({ browser, initScript: `try{localStorage.setItem('fizzpop.v1.scores','{bad json');localStorage.setItem('fizzpop.v1.muted','"x"')}catch(e){}`, autoplay: false });
  out.corruptStore = await drive(t, 'corrupt'); await t.close();
}
// 4 AudioContext missing
{
  const t = await open({ browser, initScript: `delete window.AudioContext; delete window.webkitAudioContext; window.AudioContext = undefined;`, autoplay: false });
  out.noAudioContext = await drive(t, 'noaudio'); out.noAudioContext.state = await ev(t.page, () => fz.AUDIO._state()); await t.close();
}
// 5 AudioContext constructor throws
{
  const t = await open({ browser, initScript: `window.AudioContext = function(){ throw new DOMException('no audio device','NotSupportedError'); }; window.webkitAudioContext = window.AudioContext;`, autoplay: false });
  out.audioCtorThrows = await drive(t, 'audiothrow'); await t.close();
}
// 6 missing getGamepads / matchMedia / visualViewport / requestAnimationFrame fine
{
  const t = await open({ browser, initScript: `navigator.getGamepads = undefined; window.matchMedia = undefined; Object.defineProperty(window,'visualViewport',{value:undefined});`, autoplay: false });
  out.missingApis = await drive(t, 'apis'); await t.close();
}
// 7 tiny / odd viewports
out.tiny = {};
for (const [w, h] of [[300, 150], [600, 300], [320, 200], [200, 200], [100, 100], [50, 50], [1, 1], [2000, 120], [120, 2000]]) {
  const t = await open({ browser, viewport: { width: w, height: h }, autoplay: false });
  await sleep(250);
  out.tiny[`${w}x${h}`] = await t.page.evaluate(() => { const c = document.getElementById('screen').getBoundingClientRect(); const de = document.documentElement; return { canvas: `${c.width.toFixed(0)}x${c.height.toFixed(0)}@(${c.x.toFixed(0)},${c.y.toFixed(0)})`, scrollW: de.scrollWidth, scrollH: de.scrollHeight, inner: `${innerWidth}x${innerHeight}`, legend: (() => { const l = document.getElementById('legend').getBoundingClientRect(); return `${l.width.toFixed(0)}x${l.height.toFixed(0)}`; })() }; });
  out.tiny[`${w}x${h}`].errors = t.errors.length;
  await t.page.screenshot({ path: `${OUT}/tiny_${w}x${h}.png` });
  await t.close();
}
// 8 rapid resize storm during play
{
  const t = await open({ browser, autoplay: true });
  await ev(t.page, () => fz.start(1, 3, 5));
  const cdp = t.cdp;
  const t0 = Date.now();
  for (let i = 0; i < 300; i++) {
    const w = 200 + ((i * 97) % 1200), h = 150 + ((i * 53) % 800);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1 + (i % 3), mobile: i % 2 === 0 });
  }
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await sleep(500);
  out.resizeStorm = await t.page.evaluate(() => ({ layout: window.__fizzpop._main.layout(), canvas: (() => { const c = document.getElementById('screen').getBoundingClientRect(); return `${c.width}x${c.height}`; })(), touchMode: window.__fizzpop._main.touchMode() }));
  out.resizeStorm.errors = t.errors; out.resizeStorm.ms = Date.now() - t0;
  await t.close();
}
// 9 long stall: main thread blocked 6 s (simulates a backgrounded tab resumed / device sleep) -> no time jump explosion
{
  const t = await open({ browser, autoplay: true });
  await ev(t.page, () => { fz.start(1, 4, 5); });
  await sleep(3500);
  const f0 = await ev(t.page, () => fz.Game.debug.state().frame);
  await t.page.evaluate(() => { const s = performance.now(); while (performance.now() - s < 6000); });
  await sleep(60);
  const f1 = await ev(t.page, () => fz.Game.debug.state().frame);
  await sleep(500);
  const f2 = await ev(t.page, () => fz.Game.debug.state().frame);
  out.stall6s = { f0, f1, f2, framesRunOnResume: f1 - f0, perSecondAfter: (f2 - f1) / 0.5 };
  out.stall6s.errors = t.errors;
  await t.close();
}
// 10 frozen lifecycle (CDP) 10 s then active
{
  const t = await open({ browser, autoplay: true });
  await ev(t.page, () => { fz.start(1, 4, 5); });
  await sleep(3500);
  const f0 = await ev(t.page, () => fz.Game.debug.state().frame);
  await t.cdp.send('Page.enable'); await t.cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
  await sleep(10000);
  await t.cdp.send('Page.setWebLifecycleState', { state: 'active' });
  await sleep(100);
  const f1 = await ev(t.page, () => fz.Game.debug.state().frame);
  await sleep(500);
  const f2 = await ev(t.page, () => fz.Game.debug.state().frame);
  out.frozen10s = { f0, f1, f2, framesAdvancedWhileFrozenPlusResume: f1 - f0, rateAfter: (f2 - f1) / 0.5, paused: await ev(t.page, () => fz._main.paused()) };
  out.frozen10s.errors = t.errors;
  await t.close();
}
await browser.close();
save('robust.json', out);
console.log(JSON.stringify(out, null, 1));
