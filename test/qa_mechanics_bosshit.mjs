// Boss: probability that a thunder bolt (player faces the boss side) hits when popped at a random time,
// at the two attractor positions of round 30; plus fraction of time the boss overlaps each bolt row.
import { boot, OUT } from './qa_mechanics_lib.mjs';
const { t, g, ev } = await boot({ level: 30, god: true, seed: 5 });
const r = await ev((H) => {
  const S = H.S(); const boss = S.enemies[0]; const p = H.P(); p.inv = 1e9;
  const res = {};
  for (const [name, bx, by] of [['att1(48,128)', 40, 120], ['att2(172,96)', 164, 88], ['mid(124,60)', 116, 52]]) {
    let trials = 0, hits = 0, band = 0, frames = 0;
    boss.hp = 60; boss.state = 'active';
    for (let k = 0; k < 300; k++) {
      boss.hp = 60;
      H.step(7 + (k * 13) % 41);                           // advance boss to a pseudo-random phase
      S.proj.length = 0; S.bubbles.length = 0; S.bolts.length = 0;
      const bubY = by;
      const boltY = bubY + 4;
      if (boltY + 8 > boss.y + 6 && boltY < boss.y + 42) band++;
      frames++;
      H.D.spawn('thunder', bx, bubY); const tb = S.bubbles[0]; tb.att = null;
      const dir = (boss.x + 24) > (bx + 8) ? 1 : -1;
      p.x = bx - 6; p.y = bubY - 2; p.vy = 0; p.face = dir; p.noPopT = 0; p.onGround = false;
      H.step(1); p.x = 24; p.y = 200;
      const hp0 = boss.hp;
      for (let i = 0; i < 90; i++) { H.step(1); if (boss.hp < hp0) break; }
      trials++; if (boss.hp < hp0) hits++;
    }
    res[name] = { trials, hitRatePct: Math.round(hits / trials * 100), bandOverlapPct: Math.round(band / frames * 100) };
  }
  return res;
});
console.log(JSON.stringify(r));
await t.close();
