import { arenaBoot, OUT, canvasShot } from './qa_mechanics_lib.mjs';
const { t, g, ev, page } = await arenaBoot({ god: true });
await g.evaluate(() => { window.arena([]); });
const out = {};
out.bounceHold = await ev((H) => {
  const S = H.S(); const p = H.P();
  const b = H.mkBubble( 100, 150);
  p.x = 100; p.y = 80; p.vy = 0; p.onGround = false; p.noPopT = 0;
  let bounced = null, minY = 999, log = [];
  for (let i = 0; i < 120; i++) { fz.input.set(0, { jump: true }); fz.step(1); const sc = p.vy; if (bounced === null && p.vy < -3) bounced = i; if (p.y < minY && bounced !== null) minY = p.y; }
  fz.input.clear();
  return { bounced, bubbleAlive: !b.dead, minY, bubbleY: b.y, score: p.score };
});
out.noHold = await ev((H) => {
  const S = H.S(); const p = H.P();
  const b = H.mkBubble( 100, 150);
  p.x = 100; p.y = 80; p.vy = 0; p.onGround = false; p.noPopT = 0; p.score = 0;
  let pop = null;
  for (let i = 0; i < 120; i++) { fz.step(1); if (b.dead && pop === null) pop = i; }
  return { popped: pop, score: p.score };
});
// bounce height when holding jump: how high (rel to bubble)
out.bounceHeight = await ev((H) => {
  const S = H.S(); const p = H.P();
  const b = H.mkBubble( 100, 150);
  p.x = 100; p.y = 100; p.vy = 0; p.onGround = false; p.noPopT = 0;
  let apex = 1e9, impactY = null, wasDown = true;
  for (let i = 0; i < 150; i++) { fz.input.set(0, { jump: true }); fz.step(1); if (p.vy < 0 && impactY === null) impactY = p.y; if (impactY !== null && p.y < apex) apex = p.y; }
  fz.input.clear();
  return { impactY, apex, rise: impactY - apex, bubbleY: b.y };
});
// bounce chain: repeated bounces on a column of bubbles; "bubble ladder": each bubble survives?
out.ladder = await ev((H) => {
  const S = H.S(); const p = H.P(); S.bubbles.length = 0;
  const bs = [];
  for (let k = 0; k < 4; k++) { const b = H.mkBubble( 100, 160 - k * 36); bs.push(b); }
  // mk clears bubbles each time -> keep only last; rebuild manually
  return { note: 'mk resets bubbles; skip', n: S.bubbles.length };
});
// landing from the side onto the lower half pops
out.sideTouch = await ev((H) => {
  const S = H.S(); const p = H.P();
  const b = H.mkBubble( 100, 150);
  p.x = 70; p.y = 150; p.vy = 0; p.onGround = false; p.noPopT = 0; p.score = 0;
  // walk into it horizontally at same height; gravity pulls; keep resetting y
  let pop = null;
  for (let i = 0; i < 40; i++) { p.y = 150; p.vy = 0; fz.input.set(0, { right: true }); fz.step(1); if (b.dead && pop === null) pop = i; }
  fz.input.clear();
  return { popped: pop, score: p.score };
});
// Falling onto bubble holding jump when bubble is rising (relative speed) at the 'upper half' boundary: sample y offsets
out.upperHalf = await ev((H) => {
  const S = H.S(); const p = H.P(); const res = [];
  for (const dy of [-12, -8, -4, 0, 2, 4, 6, 8]) {
    const b = H.mkBubble( 100, 150);
    // player feet at bubble.y + 16*? start with player above; fall naturally but force vertical position so impact is at bubble.y+dy
    p.x = 100; p.y = 150 - 16 + dy - 6; p.vy = 1.0; p.onGround = false; p.noPopT = 0;
    let r = 'none';
    for (let i = 0; i < 30; i++) { fz.input.set(0, { jump: true }); fz.step(1); if (p.vy < -3) { r = 'bounce'; break; } if (b.dead) { r = 'pop'; break; } }
    fz.input.clear();
    res.push({ feetAtImpactRel: dy, r });
  }
  return res;
});
console.log(JSON.stringify(out, null, 1));
console.log('errors', t.errors);
await t.close();
