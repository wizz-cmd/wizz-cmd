// Feel probes: fire press swallowed during cooldown (no buffer); edge-hang visual
import { arenaBoot, OUT, canvasShot } from './qa_mechanics_lib.mjs';
const { t, g, ev, page } = await arenaBoot({ god: true });
await g.evaluate(() => { window.arena([[8, 12, 23, 12]]); });
const r = await ev((H) => {
  const S = H.S(); const p = H.P(); S.bubbles.length = 0;
  p.x = 100; p.y = 200; p.cooldown = 0; p.vy = 0; p.onGround = true; H.step(2);
  // press fire at frame 0, then again at frame 10 (cooldown remaining 4), release, nothing else for 30 frames
  const shots = [];
  for (let i = 0; i < 40; i++) {
    fz.input.clear(); fz.input.set(0, { fire: i === 0 || i === 10 }); const n0 = S.bubbles.length; fz.step(1); if (S.bubbles.length > n0) shots.push(i);
  }
  fz.input.clear();
  return { shotsFiredAtFrames: shots, note: 'second press at frame 10 (cooldown 4 frames left) is swallowed; no shot until the player presses again' };
});
console.log(JSON.stringify(r));
// edge hang
const e = await ev((H) => {
  const p = H.P(); p.x = 150; p.y = 96; p.vy = 0; p.onGround = false; H.step(1);
  // walk right until just before falling
  let last = null;
  for (let i = 0; i < 40; i++) { const x0 = p.x; fz.input.clear(); fz.input.set(0, { right: true }); fz.step(1); if (!p.onGround) break; last = p.x; }
  fz.input.clear();
  return { lastGroundedX: last, platformRightEdge: 192, spriteOverhangPx: (last + 16) - 192, bodyOverlapPx: 192 - (last + 2) };
});
console.log(JSON.stringify(e));
await ev((H) => { const p = H.P(); p.x = 190 - 0; p.y = 96; p.vy = 0; p.onGround = true; p.face = 1; H.step(1); H.step(1); });
await canvasShot(page, OUT + '/edge_hang.png');
await t.close();
