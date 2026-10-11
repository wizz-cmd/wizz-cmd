// Every enemy type, calm vs angry, ~2s each, follow-cam crops (k=3 desktop). Theme chosen per level arg.
import { setup, sheet, OUT } from './qa_v2_motion_lib.mjs';
const level = +(process.argv[2] || 1);
const types = ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer'];
const { t, g, page } = await setup();
await g.start(1, level, 7);
await g.step(160);
await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.clearEnemies(); fz.Game.debug.god(true); fz.Game.debug.noClear(true); });
await g.step(100);
await g.evaluate(() => fz.Game.debug.setPlayer(0, { x: 230, y: 200 }));
for (const ty of types) {
  await page.evaluate(() => QA.reset());
  for (const angry of [false, true]) {
    await g.evaluate(() => fz.Game.debug.clearEnemies());
    await g.evaluate(([ty, ang]) => { fz.Game.debug.spawn(ty, 40, 184); const e = fz.Game.debug._S().enemies.filter(e => !e.dead).pop(); e.angry = ang; }, [ty, angry]);
    await g.step(3);
    for (let i = 0; i < 60; i += 3) {
      await g.step(3);
      const s = await g.state();
      const e = s.enemies[0];
      if (!e) break;
      await page.evaluate(({ x, y, l }) => QA.push(x - 16, y - 16, 48, 44, l), { x: Math.round(e.x), y: Math.round(e.y), l: `${ty}${angry ? ' ANGRY' : ''} f${i} ${e.state}` });
    }
  }
  console.log(await sheet(page, `${OUT}/enemies/L${level}_${ty}.png`, { cols: 10, scale: 1 }));
}
await t.close();
