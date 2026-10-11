// reduced motion: does a stage-2 trapped bubble still shake and a warn bubble still alternate frames?
import { setup, OUT } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
await g.start(1, 1, 11); await g.step(160);
await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.clearEnemies(); fz.Game.debug.god(true); fz.Game.debug.noClear(true); });
await g.step(100);
await g.evaluate(() => fz.Game.setOptions({ reducedMotion: true, quality: 2 }));
// trap a nibbler
await g.evaluate(() => { fz.Game.debug.setPlayer(0, { x: 28, y: 200, vx: 0, vy: 0, face: 1 }); fz.Game.debug.spawn('nibbler', 56, 200); });
for (let i = 0; i < 200; i++) { await g.set(0, { fire: i % 15 === 0 }); await g.step(1); const s = await g.state(); if (s.bubbles.some(b => b.kind === 'trapped')) break; }
await g.set(0, { fire: false });
await g.evaluate(() => { const b = fz.Game.debug._S().bubbles.find(b => b.kind === 'trapped'); b.trapT = b.trapTime * 0.9; });
const meas = async (label, frac) => {
  await g.evaluate((f) => { const b = fz.Game.debug._S().bubbles.find(b => b.kind === 'trapped'); b.trapT = b.trapTime * f; }, frac);
  await page.evaluate(() => QA.reset());
  for (let i = 0; i < 12; i++) { await g.step(1); const b = (await g.state()).bubbles.find(b => b.kind === 'trapped'); await page.evaluate(({ x, y }) => QA.push(x - 4, y - 4, 24, 24, ''), b); }
  const m = await page.evaluate(() => QA.metrics());
  console.log(label, 'per-frame pixel diff of the bubble crop:', m.map(x => x.diff).join(' '));
};
await meas('reducedMotion=1 stage1 (65%)', 0.65);
await meas('reducedMotion=1 stage2 (90%)', 0.9);
await g.evaluate(() => fz.Game.setOptions({ reducedMotion: false }));
await meas('reducedMotion=0 stage1 (65%)', 0.65);
await meas('reducedMotion=0 stage2 (90%)', 0.9);
await t.close();
