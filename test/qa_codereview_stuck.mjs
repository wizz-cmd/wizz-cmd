// Soft-lock hunt: enemies that stay inside a ~20 px window for > 1200 frames while active, hurry disabled, no player interaction.
// Usage: node test/qa_codereview_stuck.mjs [seeds=4] [frames=4500]
import { boot, log } from './qa_codereview_lib.mjs';
const seeds = +(process.argv[2] || 4), frames = +(process.argv[3] || 4500);
const only = process.argv[4] ? process.argv[4].split(',').map(Number) : null;   // optional level list, e.g. 12,26
const b = await boot({ players: 1, level: 1, seed: 1 });
const SRC = (L, seed, frames) => `(() => {
  fz.start(1, ${L}, ${seed}); const D = fz.Game.debug; D.skipIntro(); D.god(true); D.noClear(true); D.setHurryTimer(-1e7);
  const S = D._S();
  const track = S.enemies.map((e, i) => ({ i, e, ax: e.x, ay: e.y, since: 0, worst: 0, wx: 0, wy: 0 }));
  for (let f = 0; f < ${frames}; f++) {
    D.setHurryTimer(-1e7); fz.step(1);
    for (const t of track) {
      const e = t.e; if (e.dead || e.state !== 'active') { t.since = 0; t.ax = e.x; t.ay = e.y; continue; }
      if (Math.abs(e.x - t.ax) > 10 || Math.abs(e.y - t.ay) > 10) { t.ax = e.x; t.ay = e.y; t.since = 0; } else { t.since++; if (t.since > t.worst) { t.worst = t.since; t.wx = t.ax; t.wy = t.ay; } }
    }
  }
  return track.filter((t) => t.worst > 1200).map((t) => ({ idx: t.i, t: t.e.t, worst: t.worst, x: Math.round(t.wx), y: Math.round(t.wy), c: Math.round(t.wx / 8), r: Math.round((t.wy - 16) / 8) }));
})()`;
const found = [];
for (let seed = 1; seed <= seeds; seed++) for (let L = 1; L <= 29; L++) {
  if (only && !only.includes(L)) continue;
  const r = await b.page.evaluate(SRC(L, seed, frames));
  if (r.length) { found.push({ L, seed, r }); log(`R${L} seed${seed}: ${JSON.stringify(r)}`); }
}
log('total stuck enemy instances', found.reduce((n, f) => n + f.r.length, 0), 'in levels', [...new Set(found.map((f) => f.L))].join(','));
log('errors', b.t.errors);
await b.t.close();
