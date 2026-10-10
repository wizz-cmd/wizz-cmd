// Section: shooting - cooldown, shot speed/range, capture, point-blank, walls, float
import { arenaBoot, OUT } from './qa_mechanics_lib.mjs';
const { t, g, ev } = await arenaBoot({ god: true });
const out = {};
await g.evaluate(() => { window.arena([]); });
// A. cooldown: hold fire each frame (pressed edge every frame) -> bubbles per 120 frames
out.cooldown = await ev((H) => {
  const p = H.P(); p.x = 100; p.y = 200; H.step(2);
  let shots = 0, frames = [];
  for (let i = 0; i < 120; i++) { const n0 = H.S().bubbles.length; fz.input.clear(); fz.input.set(0, { fire: i % 2 === 0 }); fz.step(1); if (H.S().bubbles.length > n0) { shots++; frames.push(i); } }
  fz.input.clear();
  return { shotsIn120: shots, frames: frames.slice(0, 8), intervals: frames.slice(1, 8).map((f, k) => f - frames[k]) };
});
// does holding fire (no new edge) auto-repeat?
out.holdFire = await ev((H) => {
  H.S().bubbles.length = 0;
  const p = H.P(); p.x = 100; p.y = 200; p.cooldown = 0; H.step(2);
  fz.input.set(0, { fire: true });
  const n0 = H.S().bubbles.length; fz.step(120); fz.input.clear();
  return { bubblesFromHolding120f: H.S().bubbles.length - n0 };
});
// B. shot trajectory
out.shot = await ev((H) => {
  H.S().bubbles.length = 0;
  const p = H.P(); p.x = 100; p.y = 200; p.face = 1; p.cooldown = 0; H.step(2);
  H.step(1, () => [{ fire: true }]);
  const b = H.S().bubbles[0]; const x0 = b.x; const tr = [];
  let n = 0;
  while (b.state === 'shot' && n < 100) { H.step(1); n++; tr.push(+(b.x - x0).toFixed(1)); }
  return { spawnOffsetFromPlayer: x0 - 100, frames: n, travel: b.x - x0, travelFromPlayer: b.x - 100, v0: 4, trace: tr.filter((_, i) => i % 3 === 0), stateAfter: b.state };
});
// gold / pink
out.shotPink = await ev((H) => {
  H.S().bubbles.length = 0; const p = H.P(); p.power.pink = true; p.x = 60; p.y = 200; p.face = 1; p.cooldown = 0; H.step(2);
  H.step(1, () => [{ fire: true }]);
  const b = H.S().bubbles[0]; const x0 = b.x; let n = 0;
  while (b.state === 'shot' && n < 100) { H.step(1); n++; }
  p.power.pink = false;
  return { frames: n, travel: b.x - x0 };
});
out.shotGold = await ev((H) => {
  H.S().bubbles.length = 0; const p = H.P(); p.power.gold = true; p.x = 60; p.y = 200; p.face = 1; p.cooldown = 0; H.step(2);
  H.step(1, () => [{ fire: true }]);
  const b = H.S().bubbles[0]; const x0 = b.x; let n = 0;
  while (b.state === 'shot' && n < 100) { H.step(1); n++; }
  p.power.gold = false;
  return { frames: n, travel: b.x - x0 };
});
// C. range vs enemy: place a nibbler at distance d in front; at what d does the shot capture?
out.captureRange = await ev((H) => {
  const res = [];
  for (const d of [16, 32, 48, 56, 64, 72, 80]) {
    H.S().bubbles.length = 0; H.S().enemies.length = 0;
    const p = H.P(); p.x = 60; p.y = 200; p.face = 1; p.cooldown = 0; H.S().phase = 'play'; H.step(2);
    H.D.spawn('jellop', 60 + d, 200); const e = H.S().enemies[0]; e.state = 'frozen'; e.freezeT = 9999; // frozen walker-ish: stays (jellop frozen doesn't move)
    H.step(1, () => [{ fire: true }]);
    H.step(40);
    res.push({ d, captured: H.S().enemies[0] ? H.S().enemies[0].state === 'trapped' : false });
    H.S().enemies.length = 0; H.S().bubbles.length = 0;
  }
  return res;
});
// D. point-blank at enemy adjacent
out.pointBlank = await ev((H) => {
  H.S().bubbles.length = 0; H.S().enemies.length = 0;
  const p = H.P(); p.x = 60; p.y = 200; p.face = 1; p.cooldown = 0; H.step(2);
  H.D.spawn('jellop', 74, 200); H.S().enemies[0].state = 'frozen'; H.S().enemies[0].freezeT = 9999;
  H.step(1, () => [{ fire: true }]);
  return { trapped: H.S().enemies[0].state, bubbleKind: H.S().bubbles[0] && H.S().bubbles[0].kind };
});
// E. enemy overlapping the player (touching) while shooting -> player dies? (no god here)
// F. wall shot: player at left wall facing left
out.wallShot = await ev((H) => {
  H.S().bubbles.length = 0; H.S().enemies.length = 0;
  const p = H.P(); p.x = 16; p.y = 200; p.face = -1; p.cooldown = 0; H.step(2);
  H.step(1, () => [{ fire: true }]);
  const b = H.S().bubbles[0]; const r = { x: b.x, state: b.state };
  H.step(30); r.afterX = b.x; r.afterY = b.y; r.state = b.state; r.alive = !b.dead;
  H.step(60); r.alive60 = !b.dead; r.score = p.score;
  return r;
});
// G. walk away from wall bubble and walk back -> pops?
console.log(JSON.stringify(out, null, 1));
console.log('errors', t.errors);
await t.close();
