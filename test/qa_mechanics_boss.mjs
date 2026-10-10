// Boss: HP, speed, ink cadence, thunder cadence, bot lower bound for kill time
import { boot, OUT, canvasShot } from './qa_mechanics_lib.mjs';
const out = {};
const run = async (players, seed, popGap) => {
  const { t, g, ev, page } = await boot({ level: 30, players, god: true, seed });
  const r = await ev((H, popGap) => {
    const S = H.S(); const tr = {};
    const boss = S.enemies[0];
    tr.hp0 = boss.hp; tr.bossMax = S.bossMax;
    let lastPop = -999, popsTotal = 0, bolts = 0, frame = 0, firstHp = boss.hp, speeds = [], inkAt = [], thunderSpawn = [];
    let prevInk = 0, prevThunder = 0, hits = 0, prevHp = boss.hp; const hpTime = {};
    let maxThunder = 0;
    for (let i = 0; i < 12000; i++) {
      frame = i;
      const p = H.P(0);
      // bot
      if (i - lastPop >= popGap && boss.state === 'active') {
        const th = S.bubbles.filter(b => b.kind === 'thunder' && !b.dead && !b.popAt);
        let best = null;
        for (const b of th) {
          const bc = boss.x + 24, by = b.y + 4;
          const vOk = by + 8 > boss.y + 6 && by < boss.y + 42;
          if (!vOk) continue;
          const dir = bc > b.x + 8 ? 1 : -1;
          // need room: distance to boss
          if (Math.abs(bc - (b.x + 8)) < 24) continue;
          best = { b, dir }; break;
        }
        if (best) {
          const pl = H.P(0);
          pl.x = best.b.x - 6; pl.y = best.b.y - 2; pl.vy = 0; pl.face = best.dir; pl.noPopT = 0; pl.onGround = false;
          lastPop = i; popsTotal++;
        }
      } else if (i - lastPop === 3) { const pl = H.P(0); pl.x = 24; pl.y = 200; }
      H.step(1);
      if (boss.hp !== prevHp) { hits += prevHp - boss.hp; prevHp = boss.hp; }
      const ths = S.bubbles.filter(b => b.kind === 'thunder' && !b.dead).length; maxThunder = Math.max(maxThunder, ths);
      if (boss.dead || S.bossPhase !== 'fight') { tr.killFrame = i; break; }
    }
    return Object.assign(tr, { frames: frame, seconds: +(frame / 60).toFixed(1), pops: popsTotal, hitsLanded: hits, hpLeft: boss.hp, maxThunder, phase: S.bossPhase, hurry: S.hurry, ghost: !!S.ghost, score: H.P(0).score });
  }, popGap);
  out[`p${players}_seed${seed}_gap${popGap}`] = r;
  await t.close();
};
await run(1, 1, 30);
await run(1, 2, 30);
await run(1, 3, 60);
await run(2, 1, 30);
console.log(JSON.stringify(out, null, 1));
