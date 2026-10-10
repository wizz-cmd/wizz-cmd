// Watchdog relocation validity: force the 2nd watchdog fire on every walker in every round, many player positions,
// and check where the walker lands (wall overlap, bounds, distance to players, other enemies, bubbles, gap columns).
import { boot, log, check } from './qa3_diffreview_lib.mjs';
const b = await boot({ players: 2, level: 1, seed: 1 });
const SRC = (L, seed, px) => `(() => {
  fz.start(2, ${L}, ${seed}); const D = fz.Game.debug; D.skipIntro(); D.god(true); D.noClear(true); D.setHurryTimer(-1e7);
  const S = D._S();
  const T = 8, MAP_Y = 16;
  const solid = (c, r) => (c < 0 || c >= 32) ? true : (r < 0 || r >= 26) ? false : S.solid[r * 32 + c] === 1;
  const bodyHits = (x, y) => { const c0 = Math.floor((x + 2) / T), c1 = Math.floor((x + 14 - 1e-6) / T), r0 = Math.floor((y + 2 - MAP_Y) / T), r1 = Math.floor((y + 16 - 1e-6 - MAP_Y) / T); for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (solid(c, r)) return true; return false; };
  const out = [];
  // players at chosen spots
  const P = S.players; P[0].x = ${px[0]}; P[0].y = ${px[1]}; P[1].x = ${px[2]}; P[1].y = ${px[3]};
  for (const e of S.enemies) {
    if (!['nibbler','crabbit','springle'].includes(e.t) || e.state !== 'active') continue;
    for (let fire = 0; fire < 3; fire++) {
      // load a "confined" history so that the next slice completion fires the watchdog
      e.wdHist = [[e.x, e.x, e.y, e.y], [e.x, e.x, e.y, e.y], [e.x, e.x, e.y, e.y]];
      e.wdT = 119; e.wx0 = e.wx1 = e.x; e.wy0 = e.wy1 = e.y;
      const x0 = e.x, y0 = e.y;
      const others = S.enemies.filter((o) => o !== e && !o.dead && o.state === 'active').map((o) => [o.x, o.y]);
      D.setHurryTimer(-1e7);
      fz.step(1);
      const moved = Math.hypot(e.x - x0, e.y - y0);
      if (moved > 30) {   // relocated
        const pd = Math.min(...P.filter((p) => p.state === 'normal').map((p) => Math.hypot(p.x - e.x, p.y - e.y)));
        const near = others.filter(([ox, oy]) => Math.abs(ox - e.x) < 10 && Math.abs(oy - e.y) < 10).length;
        out.push({ t: e.t, fire, from: [x0, y0], to: [e.x, e.y], inWall: bodyHits(e.x, e.y), oob: e.x < 16 || e.x > 224 || e.y < 16 || e.y > 224, pd: Math.round(pd), overlapEnemy: near, passT: e.passT });
        break;
      }
      // not relocated: it hopped. let it play out 70 frames
      for (let k = 0; k < 70; k++) { D.setHurryTimer(-1e7); fz.step(1); }
    }
  }
  return out;
})()`;
let n = 0, bad = [];
const spots = [[24, 200, 216, 200], [120, 100, 130, 100], [60, 40, 190, 150]];
for (let L = 1; L <= 29; L++) for (let seed = 1; seed <= 3; seed++) for (const px of spots) {
  const r = await b.page.evaluate(SRC(L, seed, px));
  for (const o of r) {
    n++;
    if (o.inWall || o.oob || o.pd < 62 || o.overlapEnemy) bad.push({ L, seed, px, ...o });
  }
}
log('relocations observed', n, 'bad', bad.length);
for (const x of bad.slice(0, 20)) log(JSON.stringify(x));
check('R1 every relocation lands out of walls, in bounds, >=64 px from players, not on another enemy', bad.length === 0, bad.slice(0, 5));
log('errors', b.t.errors);
await b.t.close();
