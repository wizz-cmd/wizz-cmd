import { setup, sheet, OUT } from './qa_v2_motion_lib.mjs';
const from = +(process.argv[2] || 1);
const { t, g, page } = await setup();
await g.start(1, from, 6);
await g.step(160);
await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.god(true); });
await g.step(60);
await g.evaluate(() => fz.Game.debug.killAll());
await page.evaluate(() => QA.reset());
const phases = [];
for (let i = 0; i < 520; i += 1) {
  await g.step(1);
  if (i % 6 === 0) { await page.evaluate((l) => QA.push(0, 0, 256, 224, l), 'f' + i); const s = await g.state(); phases.push(s.phase + ':' + s.level); }
}
const met = await page.evaluate(() => QA.metrics());
console.log(phases.join(' '));
console.log(met.map(m => `${m.lum}/${m.diff}`).join(' '));
console.log(await sheet(page, `${OUT}/transition/L${from}_to_next.png`, { cols: 8, scale: 0.35, smooth: true }));
await t.close();
