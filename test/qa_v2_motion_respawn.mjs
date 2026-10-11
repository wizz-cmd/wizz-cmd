// respawn ghost: do stale trail samples from before the death draw ghosts at the old position after the respawn?
import { setup, sheet, OUT } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
await g.start(2, 1, 5); await g.step(160);
await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.clearEnemies(); fz.Game.debug.noClear(true); });
await g.step(150);
// make P1 walk right a bit then die at x~100
await g.evaluate(() => fz.Game.debug.setPlayer(0, { x: 100, y: 200, vx: 1.25 }));
await g.set(0, { right: true });
await g.step(10);
await g.evaluate(() => { fz.Game.debug.spawn('nibbler', 118, 200); });
await g.step(3);
await g.set(0, { right: false });
let died = false;
await page.evaluate(() => QA.reset());
let normalAgain = -1;
for (let i = 0; i < 160; i++) {
  await g.step(1);
  const p = (await g.state()).players[0];
  if (p.state === 'dying') died = true;
  if (died && p.state === 'normal' && normalAgain < 0) normalAgain = i;
  if (normalAgain >= 0 && i - normalAgain < 14) await page.evaluate(({ l }) => { QA.push(8, 170, 56, 54, l + ' respawn area'); QA.push(80, 170, 56, 54, l + ' death spot'); }, { l: 'f+' + (i - normalAgain) });
}
console.log('died', died, 'normalAgain', normalAgain);
console.log(await sheet(page, `${OUT}/players/respawn_ghost.png`, { cols: 6, scale: 1.5 }));
await t.close();
