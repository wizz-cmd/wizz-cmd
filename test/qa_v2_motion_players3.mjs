// close-up of walk cycle for P1 and P2 (follow cam, no trail comparison), quality 2 vs reduced motion
import { setup, sheet, OUT } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
await g.start(2, 1, 5);
await g.step(160);
await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.clearEnemies(); fz.Game.debug.god(true); fz.Game.debug.noClear(true); });
await g.step(130);
for (const pi of [0, 1]) {
  await g.evaluate((pi) => fz.Game.debug.setPlayer(pi, { x: pi ? 200 : 28, y: 200, vx: 0, vy: 0 }), pi);
}
await g.step(5);
for (const rm of [false, true]) {
  await g.evaluate((rm) => fz.Game.setOptions({ reducedMotion: rm, quality: 2 }), rm);
  for (const pi of [0, 1]) {
    await page.evaluate(() => QA.reset());
    await g.evaluate((pi) => fz.Game.debug.setPlayer(pi, { x: pi ? 200 : 28, y: 200 }), pi);
    for (let i = 0; i < 40; i += 2) {
      await g.set(pi, pi ? { left: true, right: false } : { right: true, left: false });
      await g.step(2);
      const p = (await g.state()).players[pi];
      await page.evaluate(({ x, y, l }) => QA.push(x - 10, y - 8, 36, 36, l), { x: Math.round(p.x), y: Math.round(p.y), l: `P${pi + 1} rm${rm ? 1 : 0} f${i} x${p.x.toFixed(1)}` });
    }
    await g.set(pi, { left: false, right: false });
    console.log(await sheet(page, `${OUT}/players/walkzoom_p${pi + 1}_rm${rm ? 1 : 0}.png`, { cols: 10, scale: 1, smooth: false }));
  }
}
await t.close();
