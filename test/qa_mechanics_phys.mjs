// Section: player physics (walk, jump, air control, one-way platforms, walls, wrap)
import { arenaBoot, fmt, OUT } from './qa_mechanics_lib.mjs';
const { t, g, ev } = await arenaBoot({ god: true });
const out = {};
await g.evaluate(() => { window.arena([]); });
// 1. walk speed
out.walk = await ev((H) => {
  const p = H.P(); p.x = 40; p.y = 200; H.step(1);
  const x0 = p.x; H.step(30, () => [{ right: true }]);
  const d = p.x - x0;
  return { perFrame: d / 30 };
});
// time to cross playfield 16..224 (inner)
out.cross = await ev((H) => {
  const p = H.P(); p.x = 16; p.y = 200; H.step(1);
  let n = 0; while (p.x < 224 - 0.01 && n < 1000) { H.step(1, () => [{ right: true }]); n++; }
  return { frames: n, seconds: n / 60 };
});
// 2. jump
out.jump = await ev((H) => {
  const p = H.P(); p.x = 100; p.y = 200; p.vy = 0; p.onGround = true; H.step(2);
  const y0 = p.y; let min = y0, n = 0, apexAt = 0, left = false;
  H.step(1, () => [{ jump: true }]); n++;
  for (let i = 0; i < 200; i++) { H.step(1, () => [{ jump: true }]); n++; if (p.y < min) { min = p.y; apexAt = n; } if (p.onGround) break; }
  // note jump held the whole time -> does it re-jump on landing?
  return { apex: y0 - min, airFrames: n, apexAt, y: p.y, onGround: p.onGround, vy: p.vy };
});
// hold jump: after landing does it rejump? (check next 10 frames)
out.holdRejump = await ev((H) => {
  const p = H.P(); p.x = 100; p.y = 200; p.vy = 0; p.onGround = true; H.step(2);
  let jumps = 0, prevG = true;
  for (let i = 0; i < 300; i++) { fz.input.set(0, { jump: true }); fz.step(1); if (prevG && !p.onGround) jumps++; prevG = p.onGround; }
  fz.input.clear();
  return { jumpsIn300FramesHoldingJump: jumps };
});
// 3. air control: jump and hold right, horizontal distance
out.air = await ev((H) => {
  const p = H.P(); p.x = 60; p.y = 200; p.vy = 0; p.onGround = true; H.step(2);
  const x0 = p.x; let n = 0;
  H.step(1, () => [{ jump: true, right: true }]); n++;
  while (!p.onGround && n < 200) { H.step(1, () => [{ right: true }]); n++; }
  const dxRight = p.x - x0;
  // reverse in mid air
  p.x = 100; p.y = 200; p.vy = 0; p.onGround = true; H.step(2);
  H.step(1, () => [{ jump: true, right: true }]);
  H.step(10, () => [{ right: true }]);
  const xm = p.x; H.step(10, () => [{ left: true }]);
  return { airDistance: dxRight, airFrames: n, reverseWorks: p.x < xm, vxAfter: p.vx, face: p.face };
});
// jump height variability: tap vs hold  (fixed height per spec)
out.tap = await ev((H) => {
  const p = H.P(); p.x = 100; p.y = 200; p.vy = 0; p.onGround = true; H.step(2);
  let min = 200;
  H.step(1, () => [{ jump: true }]);
  for (let i = 0; i < 100; i++) { H.step(1); if (p.y < min) min = p.y; }
  return { apexTap: 200 - min };
});
console.log(JSON.stringify(out, null, 1));
console.log('errors', t.errors);
await t.close();
