import { arenaBoot, OUT, canvasShot } from './qa_mechanics_lib.mjs';
const { t, g, ev, page } = await arenaBoot({ god: false });
await g.evaluate(() => { window.arena([[8, 12, 23, 12]]); });
const out = {};
out.stun = await ev((H) => {
  const S = H.S(); const p = H.P(); S.flames.length = 0; S.drops.length = 0; S.bubbles.length = 0; S.enemies.length = 0;
  p.inv = 0; p.noPopT = 0;
  H.D.spawn('fire', 120, 60); S.bubbles[0].att = null; p.x = 114; p.y = 56; p.vy = 0; H.step(1);
  const log = [];
  log.push({ drops: S.drops.length, bubbles: S.bubbles.length, st: p.state, sc: p.score });
  p.x = 170; p.y = 96; p.vy = 0; p.onGround = true; H.step(2);
  for (let i = 0; i < 200; i++) {
    fz.input.clear(); fz.input.set(0, { left: i > 20 }); fz.step(1); fz.input.clear();
    if (i % 10 === 0) log.push({ i, x: p.x, y: p.y, stun: p.stunT, fl: S.flames.length, gr: p.onGround, st: p.state });
  }
  return log;
});
console.log(JSON.stringify(out.stun));
console.log('errors', t.errors);
await t.close();
