// QA balance lens (c): CATCH COVERAGE. For every standable surface run (rows >= 3) of every round: can a bubble shot from a position the
// player can physically reach (P1 pad data) hit an enemy standing on it?  (shot reaches |dx| < 71, |dy| < 13, passes through blocks)
import { LEVELS, loadReach, surfaceRuns, tBox, pad2 } from './qa_balance_lib.mjs';
let bad = 0;
for (let lv = 1; lv <= 30; lv++) {
  const def = LEVELS[lv - 1], R = loadReach(lv, 1);
  const unc = [], slow = [];
  for (const run of surfaceRuns(def)) {
    if (run.r < 3) continue;
    const sy = run.r * 8; const x0 = run.c0 * 8 - 2, x1 = (run.c1 + 1) * 8 - 14;
    let worst = 0;
    for (let x = x0; x <= x1; x += 4) { const v = tBox(R, x - 70, x + 70, sy - 12, sy + 12); if (v > worst) worst = v; }
    if (worst === 65535) unc.push(`r${run.r}c${run.c0}-${run.c1}`); else if (worst > 240) slow.push(`r${run.r}c${run.c0}-${run.c1}:${(worst / 60).toFixed(1)}s`);
  }
  if (unc.length || slow.length) { bad++; console.log(`R${pad2(lv)} uncovered: ${unc.join(' ') || '-'}  slow(>4s to get a shot): ${slow.join(' ') || '-'}`); }
}
console.log(bad ? '' : 'all surfaces of all rounds are inside the bubble coverage of the P1-pad reachable set');
