// QA platform: robustness. localStorage throwing, AudioContext missing/throwing, tiny viewports, rapid resize, long stall / hidden tab.
import fs from 'fs'; import path from 'path';
import { launchBrowser, open, ev, OUT, log } from './qa_platform_lib.mjs';
const D = path.join(OUT, 'robust'); fs.mkdirSync(D, { recursive: true });
const browser = await launchBrowser({ autoplay: false });
const fullFlow = async (t, label) => {
  const P = t.page;
  await ev(P, () => { fz._main.resetScores && 0; });
  await P.keyboard.press('Enter'); await P.waitForTimeout(300);           // title -> story
  await P.waitForTimeout(500); await P.keyboard.press('Enter'); await P.waitForTimeout(400);   // skip story -> play
  const sc1 = await ev(P, () => fz.scene());
  await P.keyboard.press('KeyM'); await P.keyboard.press('KeyP'); await P.waitForTimeout(150); await P.keyboard.press('KeyP');
  // finish a game with a high score: set score then kill all lives via debug
  await ev(P, () => { fz.Game.debug.addScore(0, 50000); fz.Game.debug.god(false); for (let i = 0; i < 4; i++) fz.Game.debug.setPlayer(0, { lives: 0 }); });
  await ev(P, () => { fz.goto('entry', { entries: [{ pi: 0, score: 99999, round: 4 }] }); });
  await P.keyboard.press('Enter'); await P.waitForTimeout(100); await P.waitForTimeout(500);
  for (let i = 0; i < 3; i++) { await P.keyboard.press('Space'); await P.waitForTimeout(80); }
  await P.waitForTimeout(1500);
  const sc2 = await ev(P, () => ({ scene: fz.scene(), scores: fz._main.scores().slice(0, 3), muted: fz.AUDIO.isMuted(), ready: fz.AUDIO.ready() }));
  log(label, 'scene after play:', sc1, '| after entry:', JSON.stringify(sc2), '| errors:', JSON.stringify(t.errors), '| warnings:', JSON.stringify(t.logs.filter((l) => /\[warning\]/.test(l)).slice(0, 3)));
};
// 1) localStorage throws on every access (what a sandboxed iframe without allow-same-origin does)
{
  const t = await open({ browser, initScript: `Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } }); Object.defineProperty(window, 'sessionStorage', { get() { throw new DOMException('denied', 'SecurityError'); } });` });
  await fullFlow(t, 'localStorage getter throws:'); await t.close();
}
{
  const t = await open({ browser, initScript: `Storage.prototype.getItem = () => { throw new Error('quota'); }; Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };` });
  await fullFlow(t, 'getItem/setItem throw:'); await t.close();
}
{
  // corrupt stored values
  const t = await open({ browser, initScript: `localStorage.setItem('fizzpop.v1.scores', '{not json'); localStorage.setItem('fizzpop.v1.muted', '"yes"');` });
  log('corrupt stored values: scores table size', await ev(t.page, () => fz._main.scores().length), 'muted', await ev(t.page, () => fz.AUDIO.isMuted()), 'errors', JSON.stringify(t.errors));
  await t.close();
}
{
  const t = await open({ browser, initScript: `localStorage.setItem('fizzpop.v1.scores', JSON.stringify([{name:'<img src=x onerror=alert(1)>',score:'1e999',round:99},{name:null,score:-5},{score:5e20},'x',null, {name:'AAA',score:NaN}]));` });
  log('hostile stored scores ->', JSON.stringify(await ev(t.page, () => fz._main.scores())), 'errors', JSON.stringify(t.errors));
  await t.close();
}
// 2) AudioContext missing / throwing
for (const [label, script] of [['no AudioContext', `delete window.AudioContext; delete window.webkitAudioContext;`], ['AudioContext ctor throws', `window.AudioContext = function () { throw new DOMException('no audio device', 'NotSupportedError'); }; window.webkitAudioContext = undefined;`],
  ['resume() rejects, state stays suspended', `const AC = window.AudioContext; window.AudioContext = class extends AC { resume() { return Promise.reject(new DOMException('blocked', 'NotAllowedError')); } };`]]) {
  const t = await open({ browser, initScript: script });
  await fullFlow(t, label + ':'); await t.close();
}
// 3) tiny viewports
for (const [w, h, touch] of [[1, 1, false], [50, 50, false], [120, 80, false], [200, 100, true], [240, 320, true], [100, 600, true], [2000, 80, false]]) {
  const t = await open({ browser, viewport: { width: w, height: h }, touch });
  await t.page.waitForTimeout(150);
  const r = await ev(t.page, () => { const c = document.getElementById('screen').getBoundingClientRect(); const de = document.documentElement; return { lay: fz._main.layout(), cv: [Math.round(c.width), Math.round(c.height)], scroll: [de.scrollWidth, de.scrollHeight], client: [de.clientWidth, de.clientHeight], nan: Object.values(fz._main.layout()).some((v) => typeof v === 'number' && !isFinite(v)) }; });
  log(`viewport ${w}x${h} touch=${touch}: canvas ${r.cv.join('x')} scroll ${r.scroll.join('x')} client ${r.client.join('x')} NaN=${r.nan} errors=${t.errors.length}`);
  await t.close();
}
// 4) rapid resize storm (100 random sizes + touch toggles) while the game runs, then final-size consistency
{
  const t = await open({ browser, viewport: { width: 800, height: 600 }, touch: true });
  await ev(t.page, () => { fz.start(1, 1, 3); fz.Game.debug.skipIntro(); });
  const r = Math.random; let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const t0 = Date.now();
  for (let i = 0; i < 120; i++) { await t.page.setViewportSize({ width: 200 + Math.floor(rnd() * 1700), height: 200 + Math.floor(rnd() * 900) }); if (i % 3 === 0) await t.page.waitForTimeout(5); }
  await t.page.setViewportSize({ width: 412, height: 915 }); await t.page.waitForTimeout(400);
  const fin = await ev(t.page, () => { const c = document.getElementById('screen').getBoundingClientRect(); return { lay: fz._main.layout(), cv: [c.width, c.height], scene: fz.scene() }; });
  log('resize storm: 120 resizes in', Date.now() - t0, 'ms; final', JSON.stringify(fin), 'errors', JSON.stringify(t.errors));
  await t.close();
}
// 5) long stall / hidden tab: hold RAF for 90 s of timestamp, then release; and a visibilitychange cycle during play
{
  const t = await open({ browser, autoplay: true, viewport: { width: 1024, height: 768 }, initScript: `(() => { const raf = window.requestAnimationFrame.bind(window); window.__hold = false; window.__held = []; window.__jump = 0;
    window.requestAnimationFrame = (cb) => raf((now) => { if (window.__hold) { window.__held.push(cb); return; } cb(now + window.__jump); }); window.__release = () => { const h = window.__held.splice(0); h.forEach((cb) => raf((n) => cb(n + window.__jump))); }; })();` });
  await ev(t.page, () => { fz.start(1, 1, 3); fz.Game.debug.skipIntro(); fz.Game.debug.god(true); });
  await t.page.waitForTimeout(300);
  const f0 = await ev(t.page, () => fz.Game.debug.state().frame);
  await ev(t.page, () => { window.__hold = true; });
  await t.page.waitForTimeout(200);
  await ev(t.page, () => { window.__jump = 90000; window.__hold = false; window.__release(); });   // 90 s later
  await t.page.waitForTimeout(500);
  const f1 = await ev(t.page, () => fz.Game.debug.state().frame);
  log('90 s timestamp jump: game frames advanced', f1 - f0, '(~30 expected for 0.5 s wall; an unclamped catch-up would be 5400)');
  // visibility hidden/visible cycle
  await ev(t.page, () => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  const p1 = await ev(t.page, () => fz._main.paused());
  await t.page.waitForTimeout(300);
  const g1 = await ev(t.page, () => fz.Game.debug.state().frame);
  await ev(t.page, () => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await t.page.waitForTimeout(300);
  const g2 = await ev(t.page, () => ({ frame: fz.Game.debug.state().frame, paused: fz._main.paused() }));
  log('hidden -> paused', p1, '; frames while hidden/paused', g2.frame - g1, '; after becoming visible: still paused', g2.paused);
  log('errors', JSON.stringify(t.errors)); await t.close();
}
await browser.close();
