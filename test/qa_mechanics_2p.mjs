import { boot, OUT, canvasShot } from './qa_mechanics_lib.mjs';
const out = {};
{
  const { t, g, ev, page } = await boot({ level: 1, god: false, players: 1 });
  out.join = await ev((H) => {
    const S = H.S(); const r = {};
    r.n0 = S.players.length;
    fz.Game.join(1); r.n1 = S.players.length;
    const p2 = S.players[1]; r.p2 = { x: p2.x, y: p2.y, lives: p2.lives, inv: p2.inv, face: p2.face };
    // joining again
    fz.Game.join(1); r.n2 = S.players.length;
    // independent scoring: P2 pops an empty bubble
    const b = H.mkBubble(100, 120, 1);
    const q = S.players[1]; q.x = 94; q.y = 114; q.vy = 0; q.noPopT = 0; q.onGround = false; H.step(1);
    r.scores = S.players.map(p => p.score);
    r.state = H.D.state().players.length;
    return r;
  });
  console.log(JSON.stringify(out.join));
  // One player out: P1 loses all lives, P2 continues; check phase and nearestPlayer targeting; check isOver only when both out
  out.oneOut = await ev((H) => {
    const S = H.S(); const p1 = S.players[0], p2 = S.players[1];
    p2.inv = 1e9; p1.lives = 1; p1.inv = 0;
    const e = S.enemies.find(e => e.state === 'active') || S.enemies[0];
    S.enemies.forEach(e => { e.state = 'active'; });
    p1.x = e.x; p1.y = e.y; H.step(1);
    const r = { p1state: p1.state, lives: p1.lives };
    H.step(100);
    r.p1After = p1.state; r.phase = S.phase; r.over = fz.Game.isOver();
    // P2 still plays
    H.step(60, () => [{}, { right: true }]);
    r.p2x = p2.x;
    // P1's bubble key presses do nothing
    H.step(30, () => [{ fire: true, jump: true }, {}]);
    r.p1stillOut = p1.state;
    r.join = (fz.Game.join(1), S.players.length);
    // now P2 dies too
    p2.inv = 0; p2.lives = 1; const e2 = S.enemies.find(e => e.state === 'active'); p2.x = e2.x; p2.y = e2.y; H.step(1);
    for (let i = 0; i < 400 && !fz.Game.isOver(); i++) H.step(1);
    r.endPhase = H.D.state().phase; r.over2 = fz.Game.isOver();
    return r;
  });
  console.log(JSON.stringify(out.oneOut));
  await t.close();
}
// Hurry with 2P: ghost targets nearest; hurry resets when ANY player dies
{
  const { t, g, ev } = await boot({ level: 1, god: false, players: 2 });
  out.hurry2p = await ev((H) => {
    const S = H.S(); S.players.forEach(p => p.inv = 1e9);
    for (let i = 0; i < 2600; i++) { H.step(1); if (S.ghost) break; }
    const r = { ghost: !!S.ghost, hurry: S.hurry };
    S.players[1].inv = 0; const e = S.enemies.find(e => e.state === 'active'); S.players[1].x = e.x; S.players[1].y = e.y; H.step(1);
    r.afterP2death = { hurry: S.hurry, ghost: !!S.ghost, hurryT: S.hurryT, p1state: S.players[0].state, enemiesAngry: S.enemies.every(e => e.angry) };
    return r;
  });
  console.log(JSON.stringify(out.hurry2p));
  await t.close();
}
// P2 joins during a transition / in boss round
{
  const { t, g, ev } = await boot({ level: 30, god: true, players: 1 });
  out.bossJoin = await ev((H) => {
    const S = H.S(); const boss = S.enemies[0]; const r = { hp0: boss.hp, max0: S.bossMax };
    fz.Game.join(1); r.hp1 = boss.hp; r.max1 = S.bossMax; r.n = S.players.length;
    // damage then check join after damage
    boss.hp = 10; S.players.pop(); 
    return r;
  });
  console.log(JSON.stringify(out.bossJoin));
  await t.close();
}
