// an enemy released from a bubble that has floated away: stale trail samples -> ghost at the old position?
import { setup, sheet, OUT } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
await g.start(1, 1, 11); await g.step(160);
await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.clearEnemies(); fz.Game.debug.god(true); fz.Game.debug.noClear(true); });
await g.step(100);
await g.evaluate(() => { fz.Game.debug.setPlayer(0, { x: 28, y: 200, vx: 0, vy: 0, face: 1 }); fz.Game.debug.spawn('nibbler', 56, 200); });
await g.step(2);
// remember where the nibbler walked just before being trapped
let trapPos = null;
for (let i = 0; i < 200; i++) {
  await g.set(0, { fire: i % 15 === 0 }); await g.step(1);
  const s = await g.state();
  const pre = s.enemies[0];
  if (s.bubbles.some(b => b.kind === 'trapped')) { trapPos = trapPos || (pre ? { x: pre.x, y: pre.y } : null); break; }
  if (pre) trapPos = { x: pre.x, y: pre.y };
}
await g.set(0, { fire: false });
console.log('last free position', JSON.stringify(trapPos));
await g.step(150);                         // bubble floats away
await g.evaluate(() => { fz.Game.debug.setPlayer(0, { x: 230, y: 200 }); });
const b = (await g.state()).bubbles.find(b => b.kind === 'trapped');
console.log('bubble now at', JSON.stringify(b));
await g.evaluate(() => { const bb = fz.Game.debug._S().bubbles.find(b => b.kind === 'trapped'); bb.trapT = bb.trapTime - 1; });
await page.evaluate(() => QA.reset());
for (let i = 0; i < 14; i++) {
  await g.step(1);
  const s = await g.state(); const e = s.enemies[0];
  await page.evaluate(({ tp, e, i }) => { QA.push(tp.x - 20, tp.y - 20, 56, 52, `f${i} old pos ${e ? e.state : ''}`); if (e) QA.push(e.x - 20, e.y - 20, 56, 52, `f${i} new pos`); else QA.push(0, 0, 8, 8, 'none'); }, { tp: trapPos, e, i });
}
console.log(await sheet(page, `${OUT}/enemies/release_ghost.png`, { cols: 6, scale: 1.5 }));
await t.close();
