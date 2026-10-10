import { boot, OUT, canvasShot } from './qa_mechanics_lib.mjs';
import fs from 'fs';
const { t, g, ev, page } = await boot({ level: 1, god: true, clear: true });
const r = await ev((H) => {
  const p = H.P(); p.x = 80; p.y = 72; p.vy = 0; p.onGround = true; p.face = 1; H.step(1);
  let last = null;
  for (let i = 0; i < 60; i++) { fz.input.clear(); fz.input.set(0, { right: true }); fz.step(1); if (!p.onGround) break; last = p.x; }
  fz.input.clear();
  // rewind one frame: put player on the last grounded x
  p.x = last; p.y = 72; p.vy = 0; p.onGround = true; H.step(0);
  return { lastGroundedX: last, edge: 96, overhang: last + 16 - 96 };
});
console.log(JSON.stringify(r));
await ev((H) => { const p = H.P(); fz.step(1); });
await canvasShot(page, OUT + '/edge_hang_real.png', { scale: 4 });
await t.close();
