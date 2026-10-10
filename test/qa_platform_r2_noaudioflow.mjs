// Does the game flow (jingle-gated phases, game over, victory) still progress when audio never starts (no gesture / no AudioContext / suspended)?
import { launchBrowser, open, ev, sleep } from './qa_platform_r2_lib.mjs';
const browser = await launchBrowser({ autoplay: false });
for (const [label, init] of [['no-gesture(suspended/never created)', ''], ['AudioContext missing', 'window.AudioContext=undefined;window.webkitAudioContext=undefined;'], ['ctx created but stays suspended', `(()=>{const A=window.AudioContext;window.AudioContext=function(...a){const c=new A(...a);c.resume=()=>Promise.resolve();return c;};window.AudioContext.prototype=A.prototype;})();`]]) {
  const t = await open({ browser, initScript: init, autoplay: false });
  // a real key press so AUDIO.init() runs in the "suspended" variant
  if (label.startsWith('ctx created')) await t.page.keyboard.press('KeyM'), await t.page.keyboard.press('KeyM');
  await ev(t.page, () => { fz.start(1, 1, 3); fz.Game.debug.god(false); });
  const seq = [];
  for (let i = 0; i < 16; i++) { await sleep(500); const s = await ev(t.page, () => { const s = fz.Game.debug.state(); return [s.phase, s.frame]; }); seq.push(s.join(':')); }
  // let all lives go: kill players via setPlayer? use debug if present
  const aud = await ev(t.page, () => fz.AUDIO._state());
  console.log(label, '| phases/frames over 8s:', seq.join(' '), '| audio', JSON.stringify({ inited: aud.inited, ctx: aud.ctxState, jingle: aud.jingle, music: aud.music }), '| errors', JSON.stringify(t.errors));
  await t.close();
}
await browser.close();
