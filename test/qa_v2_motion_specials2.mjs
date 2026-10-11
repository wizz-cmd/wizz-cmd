import { setup, sheet, OUT } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
for (const [kind, rect, every, n] of [['thunder', [8, 110, 240, 48], 2, 20], ['fire', [60, 120, 130, 48], 3, 20], ['water', [60, 120, 150, 90], 5, 20]]) {
  await g.start(1, 1, 8);
  await g.step(160);
  await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.god(true); fz.Game.debug.noClear(true); });
  await g.step(60);
  await g.evaluate((k) => { fz.Game.debug.spawn(k, 100, 150); }, kind);
  await g.step(2);
  await g.evaluate(() => { const S = fz.Game.debug._S(); const b = S.bubbles.find(b => ['thunder', 'fire', 'water'].includes(b.kind)); fz.Game.debug.setPlayer(0, { x: b.x, y: b.y + 8, vx: 0, vy: 0 }); });
  await page.evaluate(() => QA.reset());
  for (let i = 0; i < n * every; i += every) { await g.step(every); await page.evaluate(({ r, l }) => QA.push(r[0], r[1], r[2], r[3], l), { r: rect, l: kind + ' f' + i }); }
  console.log(await sheet(page, `${OUT}/specials/zoom_${kind}.png`, { cols: 4, scale: 1, smooth: false }));
}
await t.close();
