// QA balance lens (d): projectile density per round (pebbles + sparks alive at once) with an idle god player on the P1 pad,
// calm phase (before HURRY) and angry phase (hurry forced). Also counts crabbit/glimmer in the round.
import { launch, fp } from '../tools/harness.mjs';
import { LEVELS } from './qa_balance_lib.mjs';
export function projSim(level, seed, angry, frames) {
  const G = fz.Game, D = G.debug; fz.start(1, level, seed); D.god(true); const S = D._S();
  const NO = { left: false, right: false, jump: false, fire: false, jumpPressed: false, firePressed: false };
  for (let i = 0; i < 160; i++) G.update([NO, NO]);
  if (angry) { for (const e of S.enemies) e.angry = true; D.setHurryTimer(40 * 60 * 10); }
  let sum = 0, max = 0, n = 0, shots = 0; const seen = new Set();
  for (let f = 0; f < frames; f++) { G.update([NO, NO]); const k = S.proj.length; sum += k; if (k > max) max = k; n++; for (const q of S.proj) if (!seen.has(q)) { seen.add(q); shots++; } }
  return { mean: sum / n, max, shots, perMin: shots / (frames / 3600) };
}
const t = await launch(); const g = fp(t.page); await g.freeze(true);
console.log('rnd crab glim | calm: mean alive / max / shots per min | angry: mean / max / shots per min');
for (let lv = 1; lv <= 29; lv++) {
  const def = LEVELS[lv - 1]; const cr = def.enemies.filter((e) => e.t === 'crabbit').length, gl = def.enemies.filter((e) => e.t === 'glimmer').length;
  if (!cr && !gl) continue;
  const agg = {}; for (const angry of [false, true]) { const rs = []; for (const seed of [1, 2, 3]) rs.push(await t.page.evaluate(`(${projSim.toString()})(${lv}, ${seed}, ${angry}, 1500)`)); agg[angry] = { mean: rs.reduce((a, r) => a + r.mean, 0) / 3, max: Math.max(...rs.map((r) => r.max)), pm: rs.reduce((a, r) => a + r.perMin, 0) / 3 }; }
  console.log(String(lv).padStart(2), cr, gl, '|', agg.false.mean.toFixed(2), agg.false.max, agg.false.pm.toFixed(1), '|', agg.true.mean.toFixed(2), agg.true.max, agg.true.pm.toFixed(1));
}
console.log(t.errors.length ? 'ERR ' + t.errors : 'no page errors'); await t.close();
