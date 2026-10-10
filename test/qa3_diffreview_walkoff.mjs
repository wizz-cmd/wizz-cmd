// Walking off a ledge and releasing the key as soon as the player leaves the ground (the normal "step off the edge" input):
// how many frames does the body spend inside the platform's end tiles, and how deep?
import { boot, log, check } from './qa3_diffreview_lib.mjs';
const out = {};
for (const [label, html] of [['new', process.cwd() + '/dist/fizzpop.html'], ['old', process.cwd() + '/out/qa3/diffreview/old.html'], ['patched', process.cwd() + '/out/qa3/diffreview/patched2.html']]) {
  process.env.FIZZ_HTML = html;
  const b = await boot({ players: 1, level: 1, seed: 1, god: true });
  out[label] = await b.page.evaluate(() => {
    const D = fz.Game.debug; D.noClear(true); D.clearEnemies(); D.setHurryTimer(-1e7);
    const S = D._S(); const T = 8, MAP_Y = 16;
    const set = (c, r, v) => { S.solid[r * 32 + c] = v; };
    const solid = (c, r) => (c < 0 || c >= 32) ? true : (r < 0 || r >= 26) ? false : S.solid[r * 32 + c] === 1;
    const depthOf = (x, y) => { let best = 0; const L = x + 2, R = x + 14, Tp = y + 2, B = y + 16; for (let r = Math.floor((Tp - MAP_Y) / T); r <= Math.floor((B - 1e-6 - MAP_Y) / T); r++) for (let c = Math.floor(L / T); c <= Math.floor((R - 1e-6) / T); c++) if (solid(c, r)) { const ox = Math.min(R, (c + 1) * T) - Math.max(L, c * T), oy = Math.min(B, MAP_Y + (r + 1) * T) - Math.max(Tp, MAP_Y + r * T); best = Math.max(best, Math.min(ox, oy)); } return best; };
    const P = S.players[0]; const res = {};
    for (const thick of [1, 3]) {
      for (let r = 1; r < 25; r++) for (let c = 2; c < 30; c++) set(c, r, 0);
      for (let c = 10; c <= 19; c++) for (let k = 0; k < thick; k++) set(c, 12 + k, 1);
      const runs = [];
      for (const hold of [0, 1, 2, 3]) {   // keep pressing right for `hold` more frames after leaving the ground
        P.x = 140; P.y = 96; P.vx = 0; P.vy = 0; P.onGround = true; P.coyote = 5; P.state = 'normal'; fz.input.clear(); fz.step(2);
        let left = -1, emb = 0, maxDepth = 0, f = 0;
        for (; f < 80; f++) {
          fz.input.clear();
          if (left < 0 || f - left < hold) fz.input.set(0, { right: true });
          fz.step(1);
          if (left < 0 && !P.onGround) left = f;
          const d = depthOf(P.x, P.y); if (left >= 0 && d > 0) { emb++; maxDepth = Math.max(maxDepth, d); }
        }
        runs.push({ hold, embFrames: emb, maxDepth: +maxDepth.toFixed(2), endX: +P.x.toFixed(1), endY: +P.y.toFixed(1) });
      }
      res['thick' + thick] = runs;
    }
    return res;
  });
  await b.t.close();
}
for (const k of ['old', 'new', 'patched']) for (const t of ['thick1', 'thick3']) log(k, t, JSON.stringify(out[k][t]));
const newWorst = Math.max(...out.new.thick3.map((r) => r.embFrames)), oldWorst = Math.max(...out.old.thick3.map((r) => r.embFrames));
log('patched worst', Math.max(...out.patched.thick3.map((r) => r.embFrames)));
check('WO1 stepping off a ledge and releasing the key must not drag the body through the platform end (embedded frames)', newWorst <= 2, { newWorst, oldWorst });
