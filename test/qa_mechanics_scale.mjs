import { arenaBoot, OUT } from './qa_mechanics_lib.mjs';
const { t, g, ev } = await arenaBoot({ god: true });
await g.evaluate(() => { window.arena([]); });
const r = await ev((H) => {
  const S = H.S(); const res = {};
  const measure = (type, angry, lvl) => {
    S.level = lvl; S.enemies.length = 0;
    const p = H.P(); p.x = 16; p.y = 200; p.inv = 1e9;
    H.D.spawn(type, 60, 200); const e = S.enemies[0]; e.angry = angry; e.d = 1; e.vx = 0;
    if (type === 'jellop') { e.jx = 1; e.jy = 1; e.y = 100; }
    let dist = 0, px = e.x, py = e.y, n = 0;
    for (let i = 0; i < 40; i++) { H.step(1); dist += Math.hypot(e.x - px, e.y - py); px = e.x; py = e.y; n++; }
    return +(dist / n).toFixed(2);
  };
  for (const ty of ['nibbler', 'jellop']) for (const lvl of [1, 15, 29]) { res[`${ty}_L${lvl}`] = { normal: measure(ty, false, lvl), angry: measure(ty, true, lvl) }; }
  // springle: horizontal speed during hop
  S.level = 29; S.enemies.length = 0; H.D.spawn('springle', 60, 200); const e = S.enemies[0]; e.angry = true; e.d = 1;
  H.step(30); res.springle_L29_angry_vx = +e.vx.toFixed(2);
  return res;
});
console.log(JSON.stringify(r));
await t.close();
