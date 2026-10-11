import { setup, sheet, OUT, canvasShot } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
await g.goto('ending', { entries: [], res: { won: true, level: 30, scores: [123400, 0], players: 1 } });
await page.evaluate(() => QA.reset());
for (let i = 0; i < 1800; i += 1) {
  await g.step(1);
  if (i % 60 === 0) await page.evaluate((l) => QA.push(0, 0, 256, 224, l), 'f' + i);
}
console.log(await sheet(page, `${OUT}/ending/ending_overview.png`, { cols: 6, scale: 0.4, smooth: true }));
await t.close();
