import { boot, OUT, canvasShot } from './qa_mechanics_lib.mjs';
const out = {};
{
  const { t, g, ev, page } = await boot({ level: 1, god: true });
  out.timeline = await ev((H) => {
    const S = H.S(); const tr = []; let hurry = false, ghost = false, angry = false;
    for (let i = 0; i < 3000; i++) {
      H.step(1);
      const st = H.D.state();
      if (st.hurry && !hurry) { hurry = true; tr.push({ ev: 'hurry', playFrame: S.hurryT, angry: S.enemies.every(e => e.angry) }); }
      if (st.ghost && !ghost) { ghost = true; tr.push({ ev: 'ghost', playFrame: S.hurryT, g: { x: S.ghost.x, y: S.ghost.y } }); break; }
    }
    return tr;
  });
  // ghost chase: speed & whether kills; with god off
  out.ghost = await ev((H) => {
    const S = H.S(); S.god = false; const p = H.P(); p.inv = 0;
    const g0 = { x: S.ghost.x, y: S.ghost.y };
    let n = 0; const tr = [];
    p.x = 200; p.y = 200;
    for (let i = 0; i < 1500 && p.state === 'normal'; i++) { H.step(1); n++; if (i % 150 === 0) tr.push({ i, gx: Math.round(S.ghost.x), gy: Math.round(S.ghost.y), px: Math.round(p.x), py: Math.round(p.y) }); }
    return { framesUntilDeath: n, tr, hurryAfter: S.hurry, ghostAfter: !!S.ghost, lives: p.lives, angryEnemies: S.enemies.filter(e => e.angry).length, total: S.enemies.length, hurryT: S.hurryT };
  });
  await canvasShot(page, OUT + '/hurry_ghost.png');
  await t.close();
}
console.log(JSON.stringify(out, null, 1));
