// trap time per round, stages, escape->angry, enemy speeds, AI behaviours
import { arenaBoot, boot, OUT, canvasShot } from './qa_mechanics_lib.mjs';
const out = {};
{
  const { t, g, ev, page } = await arenaBoot({ god: true });
  await g.evaluate(() => { window.arena([[8, 12, 23, 12]]); });
  out.trapTimes = await ev((H) => {
    const res = [];
    const S = H.S();
    for (const lvl of [1, 5, 10, 20, 30]) {
      S.level = lvl;
      S.bubbles.length = 0; S.enemies.length = 0;
      const p = H.P(); p.x = 40; p.y = 200; p.face = 1; p.cooldown = 0; p.inv = 99999; p.noPopT = 1e7; H.step(2);
      H.D.spawn('jellop', 80, 200); const e = S.enemies[0]; e.state = 'frozen'; e.freezeT = 999999;
      H.step(1, () => [{ fire: true }]); H.step(12);
      const b = S.bubbles.find(b => b.kind === 'trapped');
      let n = 13, s1 = null, s2 = null, rel = null;
      while (n < 900) { H.step(1); n++; const f = b.trapT / b.trapTime; if (s1 === null && f >= 0.5) s1 = n; if (s2 === null && f >= 0.8) s2 = n; if (b.dead) { rel = n; break; } }
      res.push({ lvl, trapTime: b.trapTime, stage1At: s1, stage2At: s2, releasedAt: rel, enemyState: e.state, angry: e.angry });
    }
    return res;
  });
  await t.close();
}
console.log(JSON.stringify(out.trapTimes));
// enemy speed measurement on open arena
{
  const { t, g, ev, page } = await arenaBoot({ god: true });
  await g.evaluate(() => { window.arena([]); });
  out.speeds = await ev((H) => {
    const S = H.S(); const res = {};
    const measure = (type, angry, frames = 60) => {
      S.enemies.length = 0; S.level = 1;
      const p = H.P(); p.x = 16; p.y = 200; p.inv = 99999;
      H.D.spawn(type, 100, 200); const e = S.enemies[0]; e.angry = angry; e.d = 1; e.vx = 0;
      if (type === 'jellop') { e.jx = 1; e.jy = 1; e.y = 100; }
      const x0 = e.x, y0 = e.y; let dist = 0;
      let px = e.x, py = e.y;
      for (let i = 0; i < frames; i++) { H.step(1); dist += Math.hypot(e.x - px, e.y - py); px = e.x; py = e.y; if (e.x > 200 || e.x < 30) break; }
      return +(dist / frames).toFixed(3);
    };
    for (const ty of ['nibbler', 'crabbit', 'jellop', 'glimmer']) res[ty] = { normal: measure(ty, false), angry: measure(ty, true) };
    return res;
  });
  console.log(JSON.stringify(out.speeds));
  await t.close();
}
