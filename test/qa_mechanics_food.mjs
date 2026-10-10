// Food scatter after a 6-chain at the L1 attractor; clear window vs travel needed
import { boot, OUT, canvasShot } from './qa_mechanics_lib.mjs';
const { t, g, ev, page } = await boot({ level: 1, god: true });
const r = await ev((H) => {
  const S = H.S(); S.noClear = true;
  // replace enemies with 6 jellops trapped in a cluster at attractor (124, ~36)
  S.enemies.length = 0; S.bubbles.length = 0;
  const p = H.P(); p.noPopT = 1e7;
  const pos = [];
  for (let k = 0; k < 6; k++) pos.push([100 + (k % 3) * 15, 24 + Math.floor(k / 3) * 15]);
  for (const [x, y] of pos) { H.D.spawn('jellop', x, y); const e = S.enemies[S.enemies.length - 1]; e.state = 'frozen'; e.freezeT = 1e6; }
  pos.forEach(([x, y], k) => { p.x = x - 28; p.y = y; p.vy = 0; p.face = 1; p.cooldown = 0; p.onGround = true; H.step(1, () => [{ fire: true }]); for (let i = 0; i < 5; i++) { p.y = y; p.vy = 0; H.step(1); } });
  const bs = S.bubbles.filter(b => b.kind === 'trapped'); bs.forEach((b, i) => { b.x = pos[i][0]; b.y = pos[i][1]; b.att = null; });
  const n = bs.length;
  p.noPopT = 0; p.x = bs[0].x - 6; p.y = bs[0].y - 1; p.vy = 0; p.onGround = false; H.step(1); p.x = 24; p.y = 200;
  // wait for foods to land
  for (let i = 0; i < 200; i++) H.step(1);
  const food = S.items.filter(it => it.kind.startsWith('food_')).map(it => ({ k: it.kind, x: Math.round(it.x), y: Math.round(it.y) }));
  return { n, food, phase: S.phase };
});
console.log(JSON.stringify(r));
await canvasShot(page, OUT + '/food_scatter.png');
await t.close();
