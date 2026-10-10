// Let each level's real enemies roam for N frames (player god, parked at spawn): record the walker surface cells they end up
// on and compare with the validator's P1 reachability model; also detect enemies stuck in place (soft-lock candidates).
// Usage: node test/qa_codereview_roam.mjs [frames=3600]
import { boot, log } from './qa_codereview_lib.mjs';
import { reachability } from '../tools/validate_levels.mjs';
const frames = +(process.argv[2] || 3600);
const b = await boot({ players: 1, level: 1, seed: 1 });
const SRC = (L, frames) => `(() => {
  const D = fz.Game.debug;
  D.setLevel(${L}); D.skipIntro(); D.god(true); D.noClear(true);
  const S = D._S();
  const out = { cells: {}, stuck: [], oob: 0, hist: [] };
  const track = S.enemies.map((e) => ({ e, ax: e.x, ay: e.y, since: 0, worst: 0 }));
  for (let f = 0; f < ${frames}; f++) {
    fz.step(1);
    for (const t of track) {
      const e = t.e;
      if (e.dead || e.state !== 'active') continue;
      if (Math.abs(e.x - t.ax) > 6 || Math.abs(e.y - t.ay) > 6) { t.ax = e.x; t.ay = e.y; t.since = 0; } else { t.since++; if (t.since > t.worst) t.worst = t.since; }
      if (e.t === 'nibbler' || e.t === 'crabbit' || e.t === 'springle') {
        if (e.onGround && f % 4 === 0) { const c = Math.round(e.x / 8), s = Math.round(e.y / 8); out.cells[c + ',' + s] = (out.cells[c + ',' + s] || 0) + 1; }
      }
      if (e.y > 224 || e.y < 0 || e.x < 15 || e.x > 225) out.oob++;
    }
  }
  out.stuck = track.filter((t) => t.worst > 900).map((t) => ({ t: t.e.t, worst: t.worst, x: Math.round(t.e.x), y: Math.round(t.e.y), state: t.e.state }));
  out.n = track.length;
  return out;
})()`;
let totalStuck = 0, unreachedAll = [];
for (let L = 1; L <= 29; L++) {
  const r = await b.page.evaluate(SRC(L, frames));
  const map = await b.page.evaluate((L) => fz.LEVELS[L - 1].map, L);
  const { reach } = reachability(map);
  const unreached = [];
  for (const k of Object.keys(r.cells)) {
    const [c, s] = k.split(',').map(Number);
    // tolerate +-1 column (enemy x is not tile aligned)
    const ok = [0, -1, 1].some((d) => reach.has(s * 32 + (c + d)));
    if (!ok) unreached.push({ c, s, frames: r.cells[k] });
  }
  totalStuck += r.stuck.length;
  log(`R${String(L).padStart(2)} enemies=${r.n} stuck=${JSON.stringify(r.stuck)} oob=${r.oob} cellsVisited=${Object.keys(r.cells).length} onUnreachedSurface=${unreached.length}${unreached.length ? ' ' + JSON.stringify(unreached.slice(0, 6)) : ''}`);
  if (unreached.length) unreachedAll.push({ L, unreached });
}
log('stuck total', totalStuck, 'levels with enemies on model-unreachable surfaces:', unreachedAll.map((x) => x.L).join(','));
log('errors', b.t.errors);
await b.t.close();
