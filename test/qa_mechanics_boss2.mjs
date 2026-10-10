import { boot, OUT, canvasShot } from './qa_mechanics_lib.mjs';
const out = {};
{
  const { t, g, ev, page } = await boot({ level: 30, god: true });
  out.kinematics = await ev((H) => {
    const S = H.S(); const boss = S.enemies[0]; const r = {};
    // speed at various HP
    for (const hp of [60, 45, 30, 15, 1]) {
      boss.hp = hp; boss.x = 100; boss.y = 80; boss.jx = 1; boss.jy = 1;
      const x0 = boss.x, y0 = boss.y; H.step(10);
      r['hp' + hp] = { dx: +((boss.x - x0) / 10).toFixed(3), dy: +((boss.y - y0) / 10).toFixed(3), angry: boss.angry };
    }
    boss.hp = 60;
    // ink cadence: count ink spawns
    S.proj.length = 0; const inkFrames = []; let prev = 0;
    boss.inkT = 120;
    for (let i = 0; i < 500; i++) { const n0 = S.proj.filter(q => q.type === 'ink').length; H.step(1); const n1 = S.proj.filter(q => q.type === 'ink').length; if (n1 >= n0 + 5) inkFrames.push(i); S.proj = S.proj.filter(q => q.type !== 'ink' || q.age < 1); }
    r.inkFrames = inkFrames;
    // thunder spawn cadence
    S.bubbles.length = 0; const tf = []; let lastN = 0;
    S.thunderT = 45;
    for (let i = 0; i < 400; i++) { H.step(1); const n = S.bubbles.filter(b => b.kind === 'thunder').length; if (n > lastN) tf.push(i); lastN = n; if (n >= 6) break; }
    r.thunderSpawnFrames = tf;
    return r;
  });
  console.log(JSON.stringify(out.kinematics));
  // trapped boss at left wall: screenshot
  await ev((H) => { const S = H.S(); const boss = S.enemies[0]; boss.x = 16; boss.y = 120; H.D.killAll(); H.step(1); S.proj.length = 0; });
  await canvasShot(page, OUT + '/boss_trapped_wall.png');
  const r2 = await ev((H) => {
    const S = H.S(); const p = H.P(); const tr = []; let last = S.phase + '/' + S.bossPhase;
    const bb = S.bossBubble;
    const info = { bb: { x: bb.x, y: bb.y } };
    // let the bubble rise for 200 frames, check position
    H.step(200); info.bbAfter = S.bossBubble && { x: S.bossBubble.x, y: S.bossBubble.y };
    // pop it
    const b2 = S.bossBubble; p.x = b2.x + 20; p.y = b2.y + 20; p.vy = 0;
    for (let i = 0; i < 800; i++) {
      H.step(1);
      const k = S.phase + '/' + S.bossPhase; if (k !== last) { tr.push({ i, k, score: p.score }); last = k; }
      if (S.items.some(it => it.kind === 'moonpearl') && !info.pearlSeen) { const pearl = S.items.find(it => it.kind === 'moonpearl'); info.pearlSeen = { x: pearl.x, y: pearl.y, i }; }
      if (S.items.some(it => it.kind === 'moonpearl')) { const pearl = S.items.find(it => it.kind === 'moonpearl'); if (pearl.vy === 0 && !info.pearlLanded) info.pearlLanded = { y: pearl.y, i }; }
      if (S.phase === 'pearl' || S.bossPhase === 'pearl') { /* wait */ }
      if (i === 120) { const pearl = S.items.find(it => it.kind === 'moonpearl'); if (pearl) { p.x = pearl.x + 8; p.y = pearl.y + 8; } }
      if (fz.Game.isOver()) { info.overAt = i; break; }
    }
    return { info, tr, over: fz.Game.isOver(), res: fz.Game.result() };
  });
  console.log(JSON.stringify(r2));
  await canvasShot(page, OUT + '/boss_after.png');
  await t.close();
}
