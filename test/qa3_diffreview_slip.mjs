// FOOT_SUPPORT edge case: falling with < 4 px of the body over a platform's top edge. The player sinks INTO the platform, ends up
// overlapping solid tiles and (because blocks only stop an entity that is not already overlapping solid) can then walk through the block.
import { boot, log, check } from './qa3_diffreview_lib.mjs';
const b = await boot({ players: 1, level: 1, seed: 1, god: true });
const R = await b.page.evaluate(() => {
  const D = fz.Game.debug; D.noClear(true); D.clearEnemies(); D.setHurryTimer(-1e7);
  const S = D._S(); const T = 8, MAP_Y = 16;
  const set = (c, r, v) => { S.solid[r * 32 + c] = v; };
  const solid = (c, r) => (c < 0 || c >= 32) ? true : (r < 0 || r >= 26) ? false : S.solid[r * 32 + c] === 1;
  const bodyHits = (x, y) => { const c0 = Math.floor((x + 2) / T), c1 = Math.floor((x + 14 - 1e-6) / T), r0 = Math.floor((y + 2 - MAP_Y) / T), r1 = Math.floor((y + 16 - 1e-6 - MAP_Y) / T); for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (solid(c, r)) return true; return false; };
  const P = S.players[0];
  const out = {};
  const arena = (thick) => {
    for (let r = 1; r < 25; r++) for (let c = 2; c < 30; c++) set(c, r, 0);
    for (let c = 10; c <= 19; c++) for (let k = 0; k < thick; k++) set(c, 12 + k, 1);
  };
  const drop = (overlap, thick, side, label, hold) => {
    arena(thick);
    // platform left edge x=80, right edge x=160.  side 'L': body's right part over the platform's left edge
    const x = side === 'L' ? 80 + overlap - 14 : 160 - overlap - 2;
    P.x = x; P.y = 60; P.vx = 0; P.vy = 0; P.onGround = false; P.coyote = -1; P.state = 'normal';
    const trace = []; let embFrames = 0, maxDepth = 0, tunnelled = false;
    for (let f = 0; f < 90; f++) {
      fz.input.clear(); if (hold && f > 8) fz.input.set(0, hold);
      fz.step(1);
      if (bodyHits(P.x, P.y)) embFrames++;
      if (f % 6 === 0) trace.push([Math.round(P.x * 10) / 10, Math.round(P.y * 10) / 10, P.onGround ? 1 : 0]);
    }
    fz.input.clear();
    out[label] = { x0: x, endX: P.x, endY: P.y, ground: P.onGround, embFrames, trace: trace.slice(0, 10).map((t) => t.join(',')).join(' | ') };
  };
  drop(3.5, 1, 'L', 'thin_left_3.5');
  drop(3.5, 3, 'L', 'thick3_left_3.5');
  drop(3.5, 3, 'R', 'thick3_right_3.5');
  // holding toward the platform while sunk in: can the player walk through the block?
  drop(3.5, 3, 'R', 'thick3_right_3.5_walk_into', { left: true });
  drop(3.5, 6, 'R', 'thick6_right_3.5_walk_into', { left: true });
  return out;
});
for (const [k, v] of Object.entries(R)) log(k.padEnd(30), `start x=${v.x0} end x=${v.endX.toFixed(1)} y=${v.endY.toFixed(1)} ground=${v.ground} embeddedFrames=${v.embFrames}  ${v.trace}`);
check('SL1 a failed landing (<4 px over a platform edge) must not leave the player embedded in the platform', R['thick3_right_3.5'].embFrames === 0, R['thick3_right_3.5']);
check('SL2 holding toward the platform after slipping must not let the player tunnel through it', R['thick3_right_3.5_walk_into'].endX >= 150 - 1 || R['thick3_right_3.5_walk_into'].embFrames === 0, R['thick3_right_3.5_walk_into']);
await b.t.close();
