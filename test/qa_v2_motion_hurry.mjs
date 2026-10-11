// HURRY UP banner + all enemies turning angry + Bonefin ghost motion.
import { setup, sheet, OUT } from './qa_v2_motion_lib.mjs';
const level = +(process.argv[2] || 1);
const { t, g, page } = await setup();
await g.start(1, level, 3);
await g.step(160);
await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.god(true); fz.Game.debug.noClear(true); });
await g.step(100);
await g.evaluate(() => { const S = fz.Game.debug._S(); fz.Game.debug.setHurryTimer(0); });
const hurryAt = await g.evaluate(() => { const s = fz.Game.debug.state(); return s.hurryT; });
// jump timer to just before hurry
await g.evaluate(() => fz.Game.debug.setHurryTimer(2700 - 20));
console.log(JSON.stringify(await g.evaluate(() => { const s = fz.Game.debug.state(); return { hurry: s.hurry, hurryT: s.hurryT }; })));
await page.evaluate(() => QA.reset());
for (let i = 0; i < 150; i += 5) {
  await g.step(5);
  await page.evaluate((l) => QA.push(0, 0, 256, 224, l), 'f' + i);
}
const met = await page.evaluate(() => QA.metrics());
console.log(met.map(m => m.lum).join(' '));
console.log(await sheet(page, `${OUT}/hurry/L${level}_hurry_banner.png`, { cols: 6, scale: 0.5, smooth: true }));
// bonefin: set timer past ghost delay
await g.evaluate(() => fz.Game.debug.setHurryTimer(3300 - 10));
await g.step(20);
const s = await g.state();
console.log('ghost', s.ghost, s.hurry);
await page.evaluate(() => QA.reset());
for (let i = 0; i < 160; i += 4) {
  await g.step(4);
  const gs = await g.evaluate(() => { const S = fz.Game.debug._S(); return S.ghost ? { x: S.ghost.x, y: S.ghost.y } : null; });
  if (gs) await page.evaluate(({ x, y, l }) => QA.push(x - 24, y - 20, 64, 48, l), { x: Math.round(gs.x), y: Math.round(gs.y), l: 'f' + i });
}
console.log(await sheet(page, `${OUT}/hurry/L${level}_bonefin.png`, { cols: 10, scale: 1 }));
await t.close();
