// screen wrap (falling out of the bottom gap, reappearing at the top): trails / ghosts at the seam
import { setup, sheet, OUT } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
await g.start(1, 1, 5); await g.step(160);
await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.clearEnemies(); fz.Game.debug.god(true); fz.Game.debug.noClear(true); });
await g.step(150);
await g.evaluate(() => fz.Game.debug.setPlayer(0, { x: 120, y: 196, vx: 0, vy: 0 }));
await page.evaluate(() => QA.reset());
for (let i = 0; i < 70; i++) {
  await g.step(1);
  const p = (await g.state()).players[0];
  if (i >= 8 && i < 62 && i % 2 === 0) await page.evaluate(({ l }) => { QA.push(96, 150, 64, 74, l + ' bottom'); QA.push(96, 14, 64, 74, l + ' top'); }, { l: `f${i} y${p.y.toFixed(0)}` });
}
console.log(await sheet(page, `${OUT}/players/wrap_seam.png`, { cols: 8, scale: 1 }));
await t.close();
