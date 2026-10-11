import { setup, sheet, OUT, save } from './qa_v2_motion_lib.mjs';
const level = +(process.argv[2] || 1);
const { t, g, page } = await setup();
await g.start(1, level, 11);
await g.step(160);
await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.clearEnemies(); fz.Game.debug.god(true); fz.Game.debug.noClear(true); });
await g.step(100);
const st = () => g.state();
async function trapOne(type) {
  await g.evaluate(() => fz.Game.debug.setPlayer(0, { x: 28, y: 200, vx: 0, vy: 0, face: 1 }));
  await g.evaluate((ty) => { fz.Game.debug.spawn(ty, 60, 200); }, type);
  const n0 = (await st()).bubbles.filter(b => b.kind === 'trapped').length;
  for (let i = 0; i < 200; i++) {
    await g.set(0, { fire: i % 15 === 0, right: false, left: false, jump: false });
    await g.step(1);
    const s = await st();
    if (s.bubbles.filter(b => b.kind === 'trapped').length > n0) break;
  }
  await g.set(0, { fire: false });
}
for (const ty of ['nibbler', 'crabbit', 'jellop', 'springle']) { await trapOne(ty); await g.step(20); }
await g.step(200);
const s0 = await st();
const tb = s0.bubbles.find(b => b.kind === 'trapped');
await g.evaluate(({ x, y }) => fz.Game.debug.setPlayer(0, { x, y: y + 6, vx: 0, vy: 0 }), tb);
await page.evaluate(() => QA.reset());
for (let i = 0; i < 24; i += 1) {
  await g.step(1);
  await page.evaluate((l) => QA.push(0, 0, 256, 224, l), 'f' + i);
  const fl = await g.evaluate(() => fz.Game.debug.flash());
  console.log(i, JSON.stringify(fl), JSON.stringify(await g.evaluate(() => fz.Game.debug.fxStats())));
}
console.log(await sheet(page, `${OUT}/chain/L${level}_chain_fine.png`, { cols: 6, scale: 0.75, smooth: true }));
await t.close();
