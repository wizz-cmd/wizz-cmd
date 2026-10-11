import { setup, sheet, OUT } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
await g.start(2, 1, 5);
await g.step(160);
await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.clearEnemies(); fz.Game.debug.noClear(true); });
await g.step(150);
// P1 dies: spawn a nibbler on top of P1
await g.evaluate(() => { fz.Game.debug.setPlayer(0, { x: 100, y: 200, vx: 0, vy: 0 }); fz.Game.debug.spawn('nibbler', 100, 200); });
await page.evaluate(() => QA.reset());
for (let i = 0; i < 150; i += 3) {
  await g.step(3);
  const p = (await g.state()).players[0];
  await page.evaluate(({ x, y, l }) => QA.push(60, 150, 100, 70, l), { x: p.x, y: p.y, l: `P1 ${p.state} f${i} inv${p.inv}` });
}
console.log(await sheet(page, `${OUT}/players/death_respawn.png`, { cols: 10, scale: 1 }));
// stun via flame
await g.evaluate(() => { const S = fz.Game.debug._S(); const p = S.players[1]; fz.Game.debug.setPlayer(1, { x: 150, y: 200, vx: 0, vy: 0, stunT: 60, inv: 0 }); });
await page.evaluate(() => QA.reset());
for (let i = 0; i < 90; i += 3) { await g.step(3); const p = (await g.state()).players[1]; await page.evaluate(({ l }) => QA.push(120, 160, 70, 60, l), { l: `P2 ${p.state} stun${p.stun} f${i}` }); }
console.log(await sheet(page, `${OUT}/players/stun.png`, { cols: 10, scale: 1 }));
await t.close();
