import { boot, arenaBoot, OUT, canvasShot } from './qa_mechanics_lib.mjs';
const out = {};
{
  const { t, g, ev, page } = await boot({ level: 6, god: false });
  out.shoes = await ev((H) => {
    const p = H.P(); p.inv = 1e7; H.D.clearEnemies(); H.D.noClear(true);
    H.D.spawn('shoes', 24, 200); p.x = 24; p.y = 200; H.step(1);
    const x0 = p.x; H.step(30, () => [{ right: true }]);
    return { powers: p.power, perFrame: (p.x - x0) / 30, score: p.score };
  });
  out.blue = await ev((H) => {
    const p = H.P(); H.S().bubbles.length = 0; p.power.blue = true; p.x = 100; p.y = 200; p.cooldown = 0; H.step(2);
    const fr = [];
    for (let i = 0; i < 60; i++) { const n0 = H.S().bubbles.length; fz.input.clear(); fz.input.set(0, { fire: i % 2 === 0 }); fz.step(1); if (H.S().bubbles.length > n0) fr.push(i); }
    fz.input.clear(); p.power.blue = false;
    return { shotIntervals: fr.slice(1).map((f, k) => f - fr[k]) };
  });
  // clock
  out.clock = await ev((H) => {
    const S = H.S(); S.enemies.length = 0; H.D.noClear(true);
    const p = H.P(); p.x = 24; p.y = 200; p.inv = 0;
    H.D.spawn('nibbler', 150, 200); H.D.spawn('jellop', 180, 100); H.D.spawn('glimmer', 100, 60);
    H.D.give(0, 'clock');
    const st0 = S.enemies.map(e => e.state);
    const pos0 = S.enemies.map(e => [e.x, e.y]);
    H.step(100);
    const moved = S.enemies.map((e, i) => Math.hypot(e.x - pos0[i][0], e.y - pos0[i][1]));
    // touching frozen enemy harmless?
    p.x = S.enemies[0].x; p.y = S.enemies[0].y; H.step(2);
    const alive = p.state;
    H.step(250);
    const st1 = S.enemies.map(e => e.state);
    return { st0, moved, aliveAfterTouch: alive, afterFreeze: st1 };
  });
  out.heart = await ev((H) => { const p = H.P(); const l = p.lives; H.D.give(0, 'heart'); return { before: l, after: p.lives }; });
  await t.close();
}
{
  const { t, g, ev } = await boot({ level: 6, god: false });
  out.bomb = await ev((H) => {
    const S = H.S(); const p = H.P(); p.inv = 1e7; p.score = 0;
    H.D.skipIntro && 0;
    const n = S.enemies.length; H.step(1);
    // wait for entering enemies to become active
    for (let i = 0; i < 200; i++) H.step(1);
    const act = S.enemies.filter(e => e.state === 'active').length;
    H.D.give(0, 'bomb');
    H.step(5);
    return { enemies: n, active: act, score: p.score, states: S.enemies.map(e => e.state) };
  });
  out.afterBomb = await ev((H) => {
    const S = H.S(); const p = H.P(); const tr = []; let last = S.phase;
    for (let i = 0; i < 1000; i++) { H.step(1); if (S.phase !== last) { tr.push({ i, ph: S.phase, lvl: S.level, score: p.score }); last = S.phase; } }
    return tr;
  });
  await t.close();
}
{
  const { t, g, ev } = await boot({ level: 6, god: true });
  out.parasol = await ev((H) => {
    const S = H.S(); const p = H.P(); const tr = []; let last = S.phase;
    for (let i = 0; i < 200; i++) H.step(1);
    H.D.give(0, 'parasol');
    for (let i = 0; i < 700; i++) { H.step(1); if (S.phase !== last) { tr.push({ i, ph: S.phase, lvl: S.level, score: p.score }); last = S.phase; } }
    return tr;
  });
  await t.close();
}
{
  const { t, g, ev } = await boot({ level: 26, god: true });
  out.parasol26 = await ev((H) => {
    const S = H.S(); const tr = []; let last = S.phase;
    for (let i = 0; i < 200; i++) H.step(1);
    H.D.give(0, 'parasol');
    for (let i = 0; i < 700; i++) { H.step(1); if (S.phase !== last) { tr.push({ i, ph: S.phase, lvl: S.level }); last = S.phase; } }
    return tr;
  });
  await t.close();
}
console.log(JSON.stringify(out, null, 1));
