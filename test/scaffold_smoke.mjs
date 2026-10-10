// Scaffold smoke test: boots dist/fizzpop.html in headless Chromium, starts a game through the
// debug hooks, steps 120 frames with scripted input, screenshots the canvas, checks state().
// Run: node test/scaffold_smoke.mjs [html]      Output: out/scaffold/*.png      Exit 1 on failure.
import path from 'path';
import { launch, canvasShot, canvasFnShot, fp, PROJECT } from '../tools/harness.mjs';

const OUT = path.join(PROJECT, 'out', 'scaffold');
let failed = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + extra}`);
  if (!cond) failed++;
};

const t = await launch({ html: process.argv[2] || undefined });
const g = fp(t.page);
try {
  check('window.__fizzpop exposes the full hook API', await g.evaluate(() =>
    ['Game', 'GFX', 'AUDIO', 'LEVELS', 'C', 'U'].every((k) => !!fz[k]) &&
    ['scene', 'goto', 'freeze', 'step', 'start'].every((k) => typeof fz[k] === 'function') &&
    typeof fz.input.set === 'function' && typeof fz.input.clear === 'function'));
  check('boots into the title scene', (await g.scene()) === 'title');
  await canvasShot(t.page, path.join(OUT, 'smoke_title.png'));

  await g.freeze(true);
  await g.start(1, 1, 1);
  check('start() enters play scene', (await g.scene()) === 'play');
  const s0 = await g.state();
  await g.set(0, { right: true });
  await g.step(30);
  await g.hold(0, { jump: true }, 1);       // 1 frame of jump = rising edge
  await g.step(60);
  await g.clear();
  await g.step(29);
  const s1 = await g.state();
  console.log('state after 120 frames:', JSON.stringify({ level: s1.level, phase: s1.phase, frame: s1.frame, p0: s1.players[0] }));
  check('state().frame advanced 120 frames', s1.frame - s0.frame === 120, `${s0.frame} -> ${s1.frame}`);
  check('player 1 moved right', s1.players[0].x > s0.players[0].x + 20, `${s0.players[0].x} -> ${s1.players[0].x}`);
  check('state() has the documented shape', ['level', 'phase', 'frame', 'players', 'enemies', 'bubbles', 'items', 'hurry', 'ghost', 'bossHp', 'letters'].every((k) => k in s1));
  await canvasShot(t.page, path.join(OUT, 'smoke_play.png'));

  // 2P + level jump + game over flow through the stub Game
  await g.start(2, 12, 5);
  await g.step(10);
  const s2 = await g.state();
  check('2P game has two players', s2.players.length === 2);
  check('start(2, 12) loads round 12', s2.level === 12, String(s2.level));
  await canvasShot(t.page, path.join(OUT, 'smoke_play_2p_r12.png'));
  await g.evaluate(() => fz.Game.debug.end(true));
  await g.step(1);
  check('Game.isOver() after debug.end -> scene returns to title', (await g.scene()) === 'title');

  // Game stub: three deaths of the only player end the game
  await g.start(1, 1, 9);
  await g.evaluate(() => { fz.Game.debug.die(0); fz.Game.debug.die(0); });
  check('2 deaths: not over yet', (await g.evaluate(() => fz.Game.isOver())) === false);
  await g.evaluate(() => fz.Game.debug.die(0));
  check('3 deaths: Game.isOver() and result().won === false', await g.evaluate(() => fz.Game.isOver() && fz.Game.result().won === false));

  // Real keyboard path through Main (RAF loop, not frozen): Enter on title starts a game
  await g.clear();
  await g.freeze(false);
  await g.goto('title');
  await t.page.keyboard.press('Enter');
  await t.page.waitForTimeout(100);                    // let the RAF loop consume the tap
  check('keyboard Enter starts a 1P game', (await g.scene()) === 'play');
  const k0 = await g.state();
  await t.page.keyboard.down('ArrowRight');
  await t.page.waitForTimeout(400);
  await t.page.keyboard.up('ArrowRight');
  const k1 = await g.state();
  check('keyboard ArrowRight moves P1 in the real loop', k1.players[0].x > k0.players[0].x + 10, `${k0.players[0].x} -> ${k1.players[0].x}`);
  await t.page.keyboard.press('KeyQ');                 // P2 bubble key in a 1P game = join
  await t.page.waitForTimeout(100);
  check('P2 bubble key joins a running 1P game', (await g.state()).players.length === 2);
  await t.page.keyboard.press('KeyP');
  const f0 = (await g.state()).frame;
  await t.page.waitForTimeout(200);
  check('P pauses (frame counter stops)', (await g.state()).frame === f0);
  await t.page.keyboard.press('KeyP');
  await t.page.waitForTimeout(200);
  check('P resumes', (await g.state()).frame > f0);
  await g.freeze(true);
  const f1 = (await g.state()).frame;
  await t.page.waitForTimeout(150);
  check('freeze(true) stops the loop from advancing updates', (await g.state()).frame === f1);

  // GFX stub sheet (also checks canvasFnShot)
  await canvasFnShot(t.page, path.join(OUT, 'smoke_sheet.png'), () => fz.GFX.sheet(), {});
} catch (e) {
  t.errors.push('smoke test exception: ' + (e && e.stack ? e.stack : e));
}
check('zero console/page errors', t.errors.length === 0, JSON.stringify(t.errors));
await t.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
