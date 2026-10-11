import { setup, sheet, OUT } from './qa_v2_motion_lib.mjs';
const level = +(process.argv[2] || 1);
const { t, g, page } = await setup();
for (const kind of ['thunder', 'fire', 'water']) {
  await g.start(1, level, 8);
  await g.step(160);
  await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.god(true); fz.Game.debug.noClear(true); });
  await g.step(60);
  // enemies: leave them (targets for fire/water/thunder)
  await g.evaluate((k) => { fz.Game.debug.spawn(k, 100, 150); }, kind);
  await g.step(2);
  await g.evaluate(() => { const S = fz.Game.debug._S(); const b = S.bubbles.find(b => ['thunder', 'fire', 'water'].includes(b.kind)); fz.Game.debug.setPlayer(0, { x: b.x, y: b.y + 8, vx: 0, vy: 0 }); });
  await page.evaluate(() => QA.reset());
  for (let i = 0; i < 150; i += 3) { await g.step(3); await page.evaluate((l) => QA.push(0, 0, 256, 224, l), kind + ' f' + i); }
  console.log(await sheet(page, `${OUT}/specials/L${level}_${kind}.png`, { cols: 10, scale: 0.4, smooth: true }));
}
await t.close();
