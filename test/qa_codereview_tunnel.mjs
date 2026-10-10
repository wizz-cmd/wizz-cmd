// Tunnelling fuzz: random players on all 30 real levels, random inputs, check that a falling body never ends a frame
// with its feet below a landable tile top it was above at the start of the frame (and never rests inside solid).
import { boot, log } from './qa_codereview_lib.mjs';
const b = await boot({ players: 1, level: 1, seed: 1 });
const r = await b.page.evaluate(() => {
  const D = fz.Game.debug, rnd = fz.U.rng(4242);
  const res = { frames: 0, tunnel: [], inside: [], landedOnTopOfNothing: 0 };
  for (let L = 1; L <= 30; L++) {
    D.setLevel(L); D.skipIntro(); D.clearEnemies(); D.noClear(true); D.god(true);
    const S = D._S();
    const solid = (c, r) => c < 0 || c >= 32 ? true : (r < 0 || r >= 26 ? false : S.solid[r * 32 + c] === 1);
    const landable = (c, r) => r >= 1 && r < 26 && solid(c, r) && !solid(c, r - 1);
    for (let trial = 0; trial < 8; trial++) {
      const p = S.players[0];
      // random free position
      for (let k = 0; k < 50; k++) {
        p.x = rnd.int(16, 224); p.y = rnd.int(24, 190); p.vy = rnd.float(-3, 2); p.vx = 0;
        const c0 = Math.floor((p.x + 2) / 8), c1 = Math.floor((p.x + 13.99) / 8), r0 = Math.floor((p.y + 2 - 16) / 8), r1 = Math.floor((p.y + 15.99 - 16) / 8);
        let ok = true; for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (solid(c, r)) ok = false;
        if (ok) break;
      }
      for (let f = 0; f < 500; f++) {
        if (f % 5 === 0) fz.input.set(0, { left: rnd.chance(0.3), right: rnd.chance(0.3), jump: rnd.chance(0.3), fire: false });
        const f0 = p.y + 16, vy0 = p.vy, ph0 = S.phase;
        fz.step(1); res.frames++;
        if (ph0 === 'transition' || S.phase === 'transition' || S.phase === 'extend' || ph0 === 'extend') continue;
        // player may have been moved by a bubble bounce; ignore frames where a bounce happened (vy set to -3.75)
        const f1 = p.y + 16;
        if (p.vy < 0) continue;
        if (f1 < f0 - 1e-9) continue; // wrapped
        const c0 = Math.floor((p.x + 2) / 8), c1 = Math.floor((p.x + 13.99) / 8);
        for (let c = c0; c <= c1; c++) {
          for (let r = 1; r < 26; r++) {
            const top = 16 + r * 8;
            if (landable(c, r) && f0 <= top + 1e-6 && f1 > top + 1e-6) { res.tunnel.push({ L, c, r, f0, f1, vy0, x: p.x }); }
          }
        }
        // resting inside solid
        if (p.onGround) {
          const r0 = Math.floor((p.y + 2 - 16) / 8), r1 = Math.floor((p.y + 15.99 - 16) / 8);
          for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (solid(c, r)) res.inside.push({ L, c, r, y: p.y, x: p.x, rowsAbove: [0,1,2].map((d) => solid(c, r - d + 1) ? 1 : 0).join('') });
        }
      }
    }
    fz.input.clear();
  }
  return res;
});
log('frames', r.frames, 'tunnel events', r.tunnel.length, 'rest-inside-solid', r.inside.length);
log(JSON.stringify(r.tunnel.slice(0, 5)), JSON.stringify(r.inside.slice(0, 5)));
log('errors', b.t.errors);
await b.t.close();
