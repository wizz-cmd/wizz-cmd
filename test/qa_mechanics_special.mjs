// Section: thunder / fire / water specials
import { arenaBoot, OUT, canvasShot } from './qa_mechanics_lib.mjs';
const { t, g, ev, page } = await arenaBoot({ god: true });
const out = {};
// ---------- thunder ----------
await g.evaluate(() => { window.arena([[8, 12, 23, 12]]); });
out.thunder = await ev((H) => {
  const S = H.S(); S.bubbles.length = 0; S.enemies.length = 0; S.bolts.length = 0;
  const p = H.P(); p.x = 120; p.y = 200; p.face = 1; p.inv = 99999; p.noPopT = 0; H.step(2);
  // enemies in a row at bolt height (bubble y=100 -> bolt y=104..112)
  for (const x of [150, 170, 200]) { H.D.spawn('jellop', x, 98); const e = S.enemies[S.enemies.length - 1]; e.state = 'frozen'; e.freezeT = 9999; }
  H.D.spawn('jellop', 60, 98); S.enemies[S.enemies.length - 1].state = 'frozen'; S.enemies[S.enemies.length - 1].freezeT = 9999;
  H.D.spawn('thunder', 120, 100);
  const sb = S.bubbles[S.bubbles.length - 1]; sb.att = null;
  // pop by touching
  p.x = 114; p.y = 94; p.vy = 0; p.score = 0; p.face = 1; H.step(1); p.y = 5000;
  const evs = []; let last = 0;
  for (let i = 0; i < 80; i++) { H.step(1); if (p.score !== last) { evs.push({ f: i, d: p.score - last }); last = p.score; } }
  return { evs, remaining: S.enemies.filter(e => e.state !== 'dying' && !e.dead).length, left: S.enemies.filter(e => !e.dead && e.x < 100 && e.state === 'frozen').length };
});
// thunder facing left near wall
out.thunderWallLeft = await ev((H) => {
  const S = H.S(); S.bubbles.length = 0; S.enemies.length = 0; S.bolts.length = 0;
  const p = H.P(); p.inv = 99999; p.face = -1;
  H.D.spawn('thunder', 20, 100); S.bubbles[S.bubbles.length - 1].att = null;
  p.x = 16; p.y = 94; p.vy = 0; p.face = -1; H.step(1); p.y = 5000;
  return { bolts: S.bolts.length, bubbles: S.bubbles.length };
});
// thunder: bolt bubble-height vs enemy height window (which dy kill?)
out.thunderWindow = await ev((H) => {
  const S = H.S(); const p = H.P(); const res = [];
  for (const dy of [-14, -12, -8, 0, 8, 12, 14, 16]) {
    S.bubbles.length = 0; S.enemies.length = 0; S.bolts.length = 0;
    H.D.spawn('jellop', 180, 100 + dy); const e = S.enemies[0]; e.state = 'frozen'; e.freezeT = 9999;
    H.D.spawn('thunder', 120, 100); S.bubbles[0].att = null;
    p.x = 114; p.y = 94; p.vy = 0; p.face = 1; p.inv = 99999; p.noPopT = 0; H.step(1); p.y = 5000;
    H.step(40);
    res.push({ dy, killed: e.state === 'dying' || e.dead });
  }
  return res;
});
// ---------- fire ----------
await g.evaluate(() => { window.arena([[8, 12, 23, 12]]); });
out.fire = await ev((H) => {
  const S = H.S(); S.bubbles.length = 0; S.enemies.length = 0; S.flames.length = 0; S.drops.length = 0;
  const p = H.P(); p.inv = 99999; p.noPopT = 0;
  H.D.spawn('fire', 120, 60); S.bubbles[0].att = null;
  p.x = 114; p.y = 56; p.vy = 0; p.face = 1; H.step(1); p.y = 5000;
  // enemies on the platform near drop
  H.D.spawn('nibbler', 100, 96); S.enemies[0].state = 'frozen'; S.enemies[0].freezeT = 9999;
  let landF = null;
  for (let i = 0; i < 100; i++) { H.step(1); if (S.flames.length && landF === null) landF = i; }
  const fl = S.flames.map(f => ({ x: f.x, y: f.y })); 
  return { landedAfter: landF, flames: fl.length, xs: fl.map(f => f.x), y: fl[0] && fl[0].y, enemyState: S.enemies[0].state };
});
// flame lifetime & player stun
out.stun = await ev((H) => {
  const S = H.S(); const p = H.P(); p.inv = 0; p.state; S.god = true;
  S.flames.length = 0; S.drops.length = 0; S.bubbles.length = 0; S.enemies.length = 0;
  // spawn drop directly above platform (use special bubble)
  H.D.spawn('fire', 120, 60); S.bubbles[0].att = null; p.noPopT = 0; p.x = 114; p.y = 56; p.vy = 0; H.step(1);
  p.y = 100 - 0; p.x = 130; p.vy = 0; p.onGround = false; p.inv = 0;
  const r = { stunFrames: 0, firstStun: null, restuns: 0 };
  let wasStun = false;
  for (let i = 0; i < 300; i++) {
    fz.input.set(0, { right: true, left: false }); fz.step(1); fz.input.clear();
    if (p.stunT > 0) { r.stunFrames++; if (r.firstStun === null) r.firstStun = i; if (!wasStun) r.restuns++; wasStun = true; } else wasStun = false;
  }
  r.flamesAlive = S.flames.length;
  return r;
});
console.log(JSON.stringify(out, null, 1));
console.log('errors', t.errors);
await t.close();
