import { setup, sheet, OUT } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
await g.start(1, 1, 5);
await g.step(160);
await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.clearEnemies(); fz.Game.debug.god(true); fz.Game.debug.noClear(true); });
await g.step(80);
const pl = async () => (await g.state()).players[0];
async function seqFixed(name, n, every, setIn, rect, cols = 8, scale = 1) {
  await page.evaluate(() => QA.reset());
  for (let i = 0; i < n; i += every) {
    await setIn(i);
    await g.step(every);
    await page.evaluate(({ r, label }) => QA.push(r[0], r[1], r[2], r[3], label), { r: rect, label: name + ' f' + i });
  }
  console.log(await sheet(page, `${OUT}/players/${name}.png`, { cols, scale }));
}
await g.evaluate(() => fz.Game.debug.setPlayer(0, { x: 28, y: 200, vx: 0, vy: 0 }));
await g.step(10);
console.log(JSON.stringify(await pl()));
await seqFixed('jump_fixed', 100, 4, async (i) => { await g.set(0, { right: i > 0 && i < 40, left: false, jump: i === 0, fire: false }); }, [16, 140, 88, 80], 10);
await g.set(0, { right: false, jump: false });
await t.close();
