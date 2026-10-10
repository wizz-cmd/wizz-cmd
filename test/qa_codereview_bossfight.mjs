// How long does the boss fight last for a competent (teleporting) player, and does it outlast the 60 s HURRY UP timer (=> bug #boss_hurry hits in nearly every real fight)?
import { boot, log } from './qa_codereview_lib.mjs';
for (const players of [1, 2]) {
  const b = await boot({ players, level: 30, seed: 21, god: true });
  const r = await b.page.evaluate(() => {
    const D = fz.Game.debug, S = D._S();
    let f = 0, shots = 0, hurryAt = -1;
    for (; f < 20000; f++) {
      if (S.bossPhase !== 'fight') break;
      const boss = S.enemies.find((e) => e.t === 'kraken' && !e.dead);
      const p = S.players[0];
      let moved = false;
      if (boss) {
        const by = boss.y + 24;
        for (const bu of S.bubbles) {
          if (bu.kind !== 'thunder' || bu.dead || bu.popAt) continue;
          const bolty = bu.y + 4 + 4;
          if (Math.abs(bolty - by) < 18) {                       // bolt row would cross the boss body (36 px tall hitbox)
            const dir = boss.x + 24 > bu.x ? 1 : -1;
            // bolt must start on the correct side of the boss
            if ((dir > 0 && bu.x < boss.x) || (dir < 0 && bu.x > boss.x + 24)) { p.x = bu.x; p.y = bu.y; p.face = dir; p.vy = 0; moved = true; shots++; break; }
          }
        }
      }
      if (!moved) { p.x = 20; p.y = 200; p.vy = 0; }
      fz.step(1);
      if (S.hurry && hurryAt < 0) hurryAt = f;
    }
    return { frames: f, secs: +(f / 60).toFixed(1), shots, hurryAt, bossHp: D.state().bossHp, phase: S.bossPhase };
  });
  log(`${players}P boss fight (teleporting bot, pops a thunder bubble only when the bolt row crosses the boss):`, JSON.stringify(r));
  await b.t.close();
}
