// BUG repro: bouncing on a bubble that hugs the ceiling shoves the player above PLAY_TOP (y<24) and re-bounces every other frame.
import { arenaBoot, OUT, canvasShot } from './qa_mechanics_lib.mjs';
const { t, g, ev, page } = await arenaBoot({ god: true });
await g.evaluate(() => { window.arena([]); });
const r = await ev((H) => {
  const S = H.S(); const p = H.P(); S.bubbles.length = 0;
  const b = H.mkBubble(100, 28);                 // bubble hugging the ceiling (rises to y=24 and stays)
  p.x = 100; p.y = 24; p.vy = 0; p.onGround = false; p.noPopT = 0;
  const ys = [];
  for (let i = 0; i < 40; i++) { fz.input.set(0, { jump: true }); fz.step(1); ys.push(+p.y.toFixed(1)); }
  fz.input.clear();
  return { minY: Math.min(...ys), PLAY_TOP: 24, ys: ys.slice(0, 30), bubbleY: b.y, bubbleAlive: !b.dead };
});
console.log(JSON.stringify(r));
await t.close();
