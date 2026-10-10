import { launch, fp, log, check } from './qa3_diffreview_lib.mjs';
for (const mode of ['missing', 'throwing', 'suspended-forever']) {
  const init = mode === 'missing' ? 'delete window.AudioContext; delete window.webkitAudioContext;'
    : mode === 'throwing' ? 'window.AudioContext = function () { throw new Error("no audio here"); }; window.webkitAudioContext = undefined;'
    : `(() => { const AC = window.AudioContext; window.AudioContext = class extends AC { constructor(o) { super(o); this.suspend(); } resume() { return new Promise(() => {}); } }; })();`;
  const t = await launch({ initScript: init });
  const g = fp(t.page); const wait = (ms) => t.page.waitForTimeout(ms);
  await g.scene();
  await t.page.keyboard.press('Enter'); await wait(300);
  for (let i = 0; i < 40 && (await g.scene()) !== 'play'; i++) { await t.page.keyboard.press('Enter'); await wait(150); }
  await wait(3500);
  const info = () => t.page.evaluate(() => ({ scene: __fizzpop.scene(), lvl: __fizzpop.Game.debug.state().level, phase: __fizzpop.Game.debug.state().phase, paused: __fizzpop._main.paused(), holds: __fizzpop._main.holds(), st: __fizzpop.AUDIO._state() }));
  let s = await info(); log(mode, 'in play', JSON.stringify(s));
  await t.page.keyboard.press('KeyP'); await wait(200);
  await t.page.evaluate(() => window.dispatchEvent(new Event('blur'))); await wait(500);
  await t.page.evaluate(() => window.dispatchEvent(new Event('focus'))); await wait(200);
  await t.page.keyboard.press('KeyP'); await wait(300);
  s = await info(); log(mode, 'after pause/blur/focus/resume', JSON.stringify(s));
  check(`NA1 [${mode}] game still running after pause/blur flow`, s.scene === 'play' && !s.paused, s);
  // wait through the round-1 start jingle: Game must start music even if audio is dead
  await wait(4000);
  s = await info();
  const hint = await t.page.evaluate(() => 0);
  check(`NA2 [${mode}] no page errors`, t.errors.length === 0, t.errors);
  await t.close();
}
