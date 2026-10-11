import { setup, sheet, OUT } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
await g.start(1, 1, 3);
await g.step(160);
await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.god(true); fz.Game.debug.noClear(true); });
await g.step(100);
await g.evaluate(() => fz.Game.debug.setHurryTimer(2700 - 5));
await page.evaluate(() => QA.reset());
for (let i = 0; i < 70; i++) {
  await g.step(1);
  if (i >= 4 && i < 40) await page.evaluate((l) => QA.push(48, 84, 160, 28, l), 'f' + i);
}
console.log(await sheet(page, `${OUT}/hurry/banner_every_frame.png`, { cols: 4, scale: 1 }));
await t.close();
