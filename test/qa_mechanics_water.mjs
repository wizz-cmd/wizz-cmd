import { arenaBoot, OUT, canvasShot } from './qa_mechanics_lib.mjs';
const { t, g, ev, page } = await arenaBoot({ god: true });
const out = {};
const run = async (label, blocks, gaps, popX, popY, enemyAt) => {
  await g.evaluate((b, gp) => { window.arena(b, gp); }, blocks, gaps);
  const r = await ev((H, popX, popY, enemyAt) => {
    const S = H.S(); const p = H.P(); S.streams.length = 0; S.bubbles.length = 0; S.enemies.length = 0; S.items.length = 0;
    p.inv = 9999; p.noPopT = 0; p.score = 0;
    for (const [type, x, y] of enemyAt) { H.D.spawn(type, x, y); const e = S.enemies[S.enemies.length - 1]; e.state = 'frozen'; e.freezeT = 99999; }
    H.D.spawn('water', popX, popY); S.bubbles[0].att = null; p.x = popX - 6; p.y = popY - 6; p.vy = 0; H.step(1); p.y = 5000;
    const log = []; let endF = null; const st = S.streams[0];
    for (let i = 1; i < 500; i++) {
      H.step(1);
      if (i % 20 === 0 && st && !st.dead) log.push({ i, x: Math.round(st.x), y: Math.round(st.y), mode: st.mode, trail: st.trail.length, carried: st.carried.length });
      if (st && st.dead && endF === null) { endF = i; break; }
    }
    H.step(120);
    return { endF, log, score: p.score, items: S.items.map(i => i.kind + '@' + Math.round(i.x) + ',' + Math.round(i.y)), enemies: S.enemies.map(e => e.state) };
  }, popX, popY, enemyAt);
  out[label] = r;
};
await run('platformNoGaps_enemyInPath', [[8, 12, 23, 12]], [], 120, 60, [['jellop', 90, 96], ['nibbler', 62, 96]]);
await run('platformWithGap_enemyInPath', [[8, 12, 23, 12]], [[14, 16]], 120, 60, [['jellop', 90, 96]]);
await run('rightSide', [[8, 12, 23, 12]], [], 160, 60, [['jellop', 190, 96]]);
for (const k of Object.keys(out)) { out[k].log = out[k].log.filter((_, i) => i % 3 === 0); }
console.log(JSON.stringify(out, null, 1));
console.log('errors', t.errors);
await t.close();
