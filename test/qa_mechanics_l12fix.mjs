// L12 pocket: does a hop *toward* the wall (instead of away) let walkers climb out? (emulating the proposed fix)
import { boot, OUT } from './qa_mechanics_lib.mjs';
const { t, g, ev } = await boot({ level: 12, god: true, seed: 3 });
const r = await ev((H) => {
  const S = H.S(); S.noClear = true;
  for (let i = 0; i < 600; i++) { S.hurryT = 0; fz.step(1); }
  const nib = S.enemies[0];
  const info = { before: [Math.round(nib.x), Math.round(nib.y)] };
  // emulate fix: every time the nibbler is on ground and d points away from the nearest wall, flip; hop when blocked
  let escaped = null;
  for (let i = 0; i < 600; i++) {
    S.hurryT = 0;
    if (nib.onGround && nib.hitWall) { nib.d = nib.d; nib.vy = -3.75; nib.onGround = false; nib.d = -nib.d; /* undo the flip done on bump */ }
    fz.step(1);
    if (nib.y > 60 && escaped === null) escaped = i;
  }
  info.after = [Math.round(nib.x), Math.round(nib.y)]; info.escapedAt = escaped;
  return info;
});
console.log(JSON.stringify(r));
await t.close();
