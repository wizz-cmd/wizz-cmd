import { setup, sheet, OUT, canvasShot } from './qa_v2_motion_lib.mjs';
const level = +(process.argv[2] || 18);
const { t, g, page } = await setup();
await g.start(2, level, 11); await g.step(160);
await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.clearEnemies(); fz.Game.debug.god(true); fz.Game.debug.noClear(true); });
await g.step(100);
const st = () => g.state();
const free = await g.evaluate(() => { const S = fz.Game.debug._S(); return S.players[0].y; });
// spawn 6 enemies near each other and trap them via direct state: use bubbles of kind 'trapped' by shooting is slow; use spawn + shoot sequence from a fixed spot
async function trapOne(type, px, ex) {
  await g.evaluate(({ px }) => fz.Game.debug.setPlayer(0, { x: px, y: 200, vx: 0, vy: 0, face: 1 }), { px });
  await g.evaluate(({ ty, ex }) => { fz.Game.debug.spawn(ty, ex, 200); }, { ty: type, ex });
  const n0 = (await st()).bubbles.filter(b => b.kind === 'trapped').length;
  for (let i = 0; i < 200; i++) { await g.set(0, { fire: i % 15 === 0 }); await g.step(1); if ((await st()).bubbles.filter(b => b.kind === 'trapped').length > n0) break; }
  await g.set(0, { fire: false });
}
for (const ty of ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer', 'nibbler', 'crabbit']) { await trapOne(ty, 28, 60); await g.step(10); }
await g.step(150);
const s0 = await st();
console.log(JSON.stringify(s0.bubbles.map(b => [Math.round(b.x), Math.round(b.y), b.kind])));
const tb = s0.bubbles.filter(b => b.kind === 'trapped')[0];
await g.evaluate(({ x, y }) => fz.Game.debug.setPlayer(0, { x, y: y + 6, vx: 0, vy: 0 }), tb);
let shot = 0;
for (let i = 0; i < 60; i++) { await g.step(1); if ([6, 10, 14, 20, 30].includes(i)) await canvasShot(page, `${OUT}/chain/L${level}_big_f${i}.png`, { scale: 1 }); }
await t.close();
