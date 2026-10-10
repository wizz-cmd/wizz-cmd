// Pause / visibility races through the REAL loop (no freeze): (a) blur during story -> game starts unpaused in the
// background; (b) blur during play pauses; focus keeps it paused; (c) key held across pause does not re-fire.
import { launch, fp, log } from './qa_codereview_lib.mjs';
const t = await launch({});
const g = fp(t.page);
await t.page.keyboard.press('ShiftRight');
const st = () => g.evaluate(() => ({ scene: fz.scene(), paused: fz.__m ? 0 : fz._main.paused(), frame: fz.Game.debug.state().frame, phase: fz.Game.debug.state().phase, audioPaused: fz.AUDIO._state().paused }));
// (a) blur during the story intro
await g.evaluate(() => fz.goto('story', { next: { players: 1, level: 1, seed: 9 } }));
await t.page.evaluate(() => window.dispatchEvent(new Event('blur')));
log('story + blur   ', JSON.stringify(await st()));
await t.page.waitForTimeout(5200);
const a1 = await st();
await t.page.waitForTimeout(1500);
const a2 = await st();
log('5 s later      ', JSON.stringify(a1));
log('+1.5 s         ', JSON.stringify(a2), ' game advanced while window blurred:', a2.frame > a1.frame && a2.scene === 'play' && !a2.paused);
// (b) blur in play
await t.page.evaluate(() => window.dispatchEvent(new Event('blur')));
const b0 = await st(); await t.page.waitForTimeout(300); const b1 = await st();
log('blur in play   ', JSON.stringify(b0), '->', JSON.stringify(b1), ' frozen:', b0.frame === b1.frame);
await t.page.evaluate(() => window.dispatchEvent(new Event('focus')));
await t.page.waitForTimeout(200);
const b2 = await st(); await t.page.waitForTimeout(300); const b3 = await st();
log('focus (no click)', JSON.stringify(b2), '->', JSON.stringify(b3), ' still paused:', b2.paused && b2.frame === b3.frame);
// (c) edge detection across pause. Resume the game from (b), then pause again and resume with Space / X / Z
//     (those are the fire / jump keys AND the pause-menu confirm keys): the press that confirms RESUME must not shoot/jump.
await t.page.keyboard.press('KeyP'); await t.page.waitForTimeout(150);       // resume (was paused by blur)
const q = () => g.evaluate(() => ({ paused: fz._main.paused(), bubbles: fz.Game.debug._S().bubbles.length, vy: fz.Game.debug._S().players[0].vy, y: fz.Game.debug._S().players[0].y, onGround: fz.Game.debug._S().players[0].onGround }));
for (const key of ['Space', 'KeyX', 'KeyZ', 'Enter']) {
  await t.page.keyboard.press('KeyP'); await t.page.waitForTimeout(120);     // pause
  const before = await q();
  await t.page.keyboard.down(key); await t.page.waitForTimeout(250);          // confirm RESUME with the key and keep holding
  const mid = await q();
  await t.page.waitForTimeout(250);
  const after = await q();
  await t.page.keyboard.up(key); await t.page.waitForTimeout(150);
  log('resume via', key.padEnd(6), 'before', JSON.stringify(before), 'resumed', JSON.stringify(mid), '+250ms held', JSON.stringify(after));
}
log('errors', t.errors);
await t.close();
