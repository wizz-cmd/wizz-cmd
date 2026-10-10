import { boot, OUT, canvasShot } from './qa_mechanics_lib.mjs';
const out = {};
{
  const { t, g, ev, page } = await boot({ level: 1, god: false });
  out.death = await ev((H) => {
    const S = H.S(); const p = H.P(); p.inv = 0; p.power.shoes = true; p.power.blue = true;
    // kill by touching an enemy
    const e = S.enemies[0]; p.x = e.x; p.y = e.y;
    H.step(1);
    const tr = [{ f: 0, st: p.state, lives: p.lives, power: Object.keys(p.power).filter(k => p.power[k]) }];
    let last = p.state;
    for (let i = 1; i < 400; i++) { H.step(1); if (p.state !== last) { tr.push({ f: i, st: p.state, x: p.x, y: p.y, inv: p.inv, lives: p.lives }); last = p.state; } }
    return { tr, invAfter: p.inv };
  });
  // invulnerability: stand still on an enemy after respawn: survive 120 frames?
  out.inv = await ev((H) => {
    const S = H.S(); const p = H.P();
    S.hurry = false; const e = S.enemies.find(e => e.state === 'active');
    // wait for respawn inv period: force respawn by killing again
    p.inv = 0;
    const e2 = S.enemies.find(e => e.state === 'active'); p.x = e2.x; p.y = e2.y; H.step(1);
    let f = 0; while (p.state !== 'normal' && f < 200) { H.step(1); f++; }
    const inv0 = p.inv; // 120
    // sit on top of enemy every frame for 130 frames
    let diedAt = null;
    for (let i = 0; i < 160; i++) { const en = S.enemies.find(e => e.state === 'active'); if (en) { en.x = p.x; en.y = p.y; } H.step(1); if (p.state === 'dying') { diedAt = i; break; } }
    return { inv0, diedAfterInvFrames: diedAt, lives: p.lives };
  });
  // game over
  out.gameover = await ev((H) => {
    const S = H.S(); const p = H.P(); p.inv = 0;
    const tr = []; let last = '';
    for (let i = 0; i < 2000; i++) {
      const st = H.D.state();
      if (st.phase !== last) { tr.push({ i, ph: st.phase, lives: p.lives, st: p.state }); last = st.phase; }
      if (st.over) break;
      if (p.state === 'normal' && p.inv === 0) { const en = S.enemies.find(e => e.state === 'active'); if (en) { p.x = en.x; p.y = en.y; } }
      H.step(1);
    }
    return { tr, over: fz.Game.isOver(), res: fz.Game.result() };
  });
  console.log(JSON.stringify(out.death));
  console.log(JSON.stringify(out.inv));
  console.log(JSON.stringify(out.gameover));
  await t.close();
}
// extra life thresholds
{
  const { t, g, ev } = await boot({ level: 1, god: true });
  out.extra = await ev((H) => {
    const p = H.P(); const ev = [];
    let lives = p.lives;
    for (let s = 0; s < 450000; s += 1000) { H.D.addScore(0, 1000); if (p.lives !== lives) { ev.push({ score: p.score, lives: p.lives }); lives = p.lives; } }
    return ev;
  });
  console.log(JSON.stringify(out.extra));
  await t.close();
}
