// Player feel: foot-support / coyote / double jump / fire buffer, on a custom flat arena (S.solid edited in place).
import { boot, log, check } from './qa3_diffreview_lib.mjs';
const b = await boot({ players: 1, level: 1, seed: 1, god: true });
const R = await b.page.evaluate(() => {
  const D = fz.Game.debug; D.noClear(true); D.clearEnemies(); D.setHurryTimer(-1e7);
  const S = D._S();
  const T = 8;
  // arena: empty except a platform on row 12, cols 10..19 (80 px) and the floor
  const set = (c, r, v) => { S.solid[r * 32 + c] = v; };
  for (let r = 1; r < 25; r++) for (let c = 2; c < 30; c++) set(c, r, 0);
  for (let c = 10; c <= 19; c++) set(c, 12, 1);
  const platTop = 16 + 12 * T;   // 112
  const P = S.players[0];
  const out = {};
  const place = (x) => { P.x = x; P.y = platTop - 16; P.vx = 0; P.vy = 0; P.onGround = true; P.coyote = 5; P.jumpBuf = 0; P.inv = 0; P.state = 'normal'; P.cooldown = 0; P.fireBuf = 0; fz.input.clear(); fz.step(2); };
  // 1. foot support: body = x+2 .. x+14. platform right edge at x=160. body overlap = 160 - (x+2)
  const probe = (x) => { place(x); const g0 = P.onGround; fz.step(10); return { x, ground: P.onGround, y: P.y }; };
  out.support = [];
  for (const ov of [3.0, 3.5, 3.9, 3.99, 4.0, 4.01, 4.5, 5]) out.support.push({ overlap: ov, ...probe(160 - ov - 2) });
  // left edge: platform left edge at x=80. body = x+2..x+14, overlap = (x+14) - 80
  out.supportL = [];
  for (const ov of [3.0, 3.9, 4.0, 4.1, 5]) out.supportL.push({ overlap: ov, ...probe(80 + ov - 14) });
  // 2. coyote: walk right off the edge, press jump k frames after leaving the platform
  out.coyote = [];
  for (let k = 0; k <= 9; k++) {
    place(140);   // standing near right side
    let leaveF = -1, jumpedF = -1, vy0 = null;
    for (let f = 0; f < 80; f++) {
      fz.input.clear();
      const inp = { right: true };
      if (leaveF >= 0 && f === leaveF + k) inp.jump = true;
      fz.input.set(0, inp);
      const wasG = P.onGround;
      fz.step(1);
      if (leaveF < 0 && wasG && !P.onGround && P.vy >= 0 && P.vy < 0.4) leaveF = f;
      if (jumpedF < 0 && P.vy < -3) { jumpedF = f; break; }
    }
    fz.input.clear();
    out.coyote.push({ k, leaveF, jumped: jumpedF >= 0 });
  }
  // 3. double jump: jump from ground, then mash jump during the whole air time
  place(120);
  let jumps = 0, maxRise = 0, y0 = P.y, lastVy = 0;
  for (let f = 0; f < 120; f++) {
    fz.input.clear(); fz.input.set(0, { jump: f % 3 === 0 }); fz.step(1);
    if (P.vy < -3.6 && lastVy >= -3.6) jumps++;   // a fresh upward launch
    lastVy = P.vy; maxRise = Math.max(maxRise, y0 - P.y);
  }
  out.mash = { jumps, maxRise };
  // 4. jump after walking off then land on the platform again, coyote must reset; jumping twice in a row on landing
  // 5. fire buffer: press fire while cooldown running, count bubbles
  place(120); fz.input.clear();
  fz.input.set(0, { fire: true }); fz.step(1); fz.input.clear();
  const n0 = S.bubbles.filter((b) => !b.dead).length;
  const cd = P.cooldown;
  // press again with cd-3 left
  fz.step(cd - 3); fz.input.set(0, { fire: true }); fz.step(1); fz.input.clear(); fz.step(8);
  const n1 = S.bubbles.filter((b) => !b.dead).length;
  out.fireBuf = { cd, shots_after: n1 - n0 };
  // press way too early (cooldown 12 left): must NOT fire later
  place(120); P.cooldown = 0; fz.input.set(0, { fire: true }); fz.step(1); fz.input.clear();
  const m0 = S.bubbles.filter((b) => !b.dead).length;
  fz.step(2); fz.input.set(0, { fire: true }); fz.step(1); fz.input.clear();   // 11 left
  fz.step(30);
  out.fireBuf2 = { shotsAfterEarlyPress: S.bubbles.filter((b) => !b.dead).length - m0 };
  return out;
});
log(JSON.stringify(R, null, 1).slice(0, 4000));
check('F1 overlap<4 falls, >=4 stands (right edge)', R.support.every((s) => (s.overlap >= 4 ? s.ground : !s.ground)), R.support);
check('F2 overlap<4 falls, >=4 stands (left edge)', R.supportL.every((s) => (s.overlap >= 4 ? s.ground : !s.ground)), R.supportL);
check('F3 coyote window 0..4 frames jumps, >=6 does not', R.coyote.filter((c) => c.k <= 4).every((c) => c.jumped) && R.coyote.filter((c) => c.k >= 6).every((c) => !c.jumped), R.coyote);
check('F4 mashing jump never gives a double jump', R.mash.jumps <= 3 && R.mash.maxRise <= 46, R.mash);
await b.t.close();
