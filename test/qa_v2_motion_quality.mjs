import { setup, sheet, OUT, save } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
await g.start(2, 18, 13);
await g.step(170);
await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.god(true); fz.Game.debug.noClear(true); });
await g.step(200);
await page.evaluate(() => QA.reset());
for (const q of [2, 1, 0]) {
  await g.evaluate((q) => fz._main.setQuality(q, true), q);
  await g.step(6); // bloom refresh cadence settle
  await g.evaluate(() => fz._main.renderNow());
  await page.evaluate((q) => QA.push(0, 16, 256, 208, 'quality ' + q), q);
}
const m = await page.evaluate(() => QA.metrics());
console.log(JSON.stringify(m));
console.log(await sheet(page, `${OUT}/quality_compare.png`, { cols: 3, scale: 0.8, smooth: true }));
await t.close();
