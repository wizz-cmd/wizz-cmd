// Randomised blur / focus / hidden / visible / P / Esc / Enter / QUIT sequences in the real page.  Invariants checked after each settle.
import { launch, fp, log, check } from './qa3_diffreview_lib.mjs';
const seed0 = +(process.argv[2] || 7), N = +(process.argv[3] || 250);
const t = await launch({});
const page = t.page, g = fp(page);
const wait = (ms) => page.waitForTimeout(ms);
let seed = seed0 >>> 0; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const S = () => page.evaluate(() => { const a = __fizzpop.AUDIO._state(); return { ctx: a.ctxState, ap: a.paused, pk: a.pauseKind, holds: __fizzpop._main.holds(), scene: __fizzpop.scene(), mp: __fizzpop._main.paused(), cq: __fizzpop._main.confirmQuit(), music: a.music, jingle: a.jingle }; });
await page.keyboard.press('ArrowDown'); await wait(300); await page.keyboard.press('ArrowUp');
let hidden = false, blurred = false;
const ev = {
  // wave-3 regression pass (R2): a lone blur event while document.hasFocus() is still true is healed after 1.5 s on purpose, so a
  // faithful model of a REAL blur also makes document.hasFocus() report false (such a hold is never healed) until the focus event.
  blur: () => page.evaluate(() => { document.hasFocus = () => false; window.dispatchEvent(new Event('blur')); }).then(() => { blurred = true; }),
  focus: () => page.evaluate(() => { delete document.hasFocus; window.dispatchEvent(new Event('focus')); }).then(() => { blurred = false; }),
  hide: () => page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); }).then(() => { hidden = true; }),
  show: () => page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); }).then(() => { hidden = false; }),
  P: () => page.keyboard.press('KeyP'), Esc: () => page.keyboard.press('Escape'), Enter: () => page.keyboard.press('Enter'),
  Down: () => page.keyboard.press('ArrowDown'), Up: () => page.keyboard.press('ArrowUp'),
};
const names = ['blur', 'focus', 'hide', 'show', 'P', 'Esc', 'Enter', 'Down', 'Up', 'Enter', 'P'];
const bad = []; const hist = [];
for (let i = 0; i < N; i++) {
  let n = names[Math.floor(rnd() * names.length)];
  if ((blurred || hidden) && ['P', 'Esc', 'Enter', 'Down', 'Up'].includes(n)) n = rnd() < 0.5 ? 'focus' : 'show';   // a blurred / hidden page receives no key presses
  hist.push(n);
  await ev[n]();
  await wait(rnd() < 0.3 ? 360 : 40);
  if (rnd() < 0.5) {
    await wait(380);
    const s = await S();
    const expHeld = blurred || hidden;
    const issues = [];
    if (JSON.stringify(s.holds.slice().sort()) !== JSON.stringify([...(blurred ? ['blur'] : []), ...(hidden ? ['hidden'] : [])].sort())) issues.push('holds ' + s.holds + ' vs model blur=' + blurred + ' hidden=' + hidden);
    if (expHeld && !(s.ap && s.pk === 'hard' && s.ctx === 'suspended')) issues.push('held but audio not hard-paused/suspended');
    if (!expHeld) {
      const wantSoft = s.scene === 'play' && s.mp;
      if (wantSoft && !(s.ap && s.pk === 'soft' && s.ctx === 'running')) issues.push('game paused but audio not soft-paused');
      if (!wantSoft && s.ap) issues.push('audio paused although nothing is');
      if (!wantSoft && s.ctx !== 'running') issues.push('ctx ' + s.ctx);
    }
    if (expHeld && s.scene === 'play' && !s.mp) issues.push('held in play but game running');
    if (issues.length) { bad.push({ i, n, s, issues, hist: hist.slice(-6) }); log('BAD', JSON.stringify(bad[bad.length - 1])); if (bad.length > 6) break; }
  }
}
log('events', hist.length, 'bad', bad.length, 'errors', t.errors);
check('HF1 audio/game pause state is consistent with the blur/hidden model after random event sequences', bad.length === 0, bad.slice(0, 2));
check('HF2 no page errors', t.errors.length === 0, t.errors);
await t.close();
