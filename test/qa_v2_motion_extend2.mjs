import { setup, sheet, OUT, save } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
await g.start(2, 1, 5);
await g.step(160);
await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.clearEnemies(); fz.Game.debug.god(true); fz.Game.debug.noClear(true); });
await g.step(200);
await g.evaluate(() => { const S = fz.Game.debug._S(); S.players[0].letters = [1, 1, 0, 1, 0, 0]; S.players[1].letters = [0, 1, 1, 0, 0, 1]; });
await page.evaluate(() => QA.reset());
for (let i = 0; i < 8; i++) { await g.step(7); await page.evaluate((l) => QA.push(0, 32, 24, 70, l), 'f' + i * 7); }
console.log(await sheet(page, `${OUT}/cvd/extend_left_anim.png`, { cols: 8, scale: 2, smooth: false }));
await t.close();
