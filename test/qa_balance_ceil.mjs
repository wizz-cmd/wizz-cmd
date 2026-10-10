// QA balance lens (a): ceiling gather spots. For every settle cluster that rests at the ceiling (bubble y <= 25) with >= 3 of the 52 shots,
// how far (px) is the nearest grounded spot from which a plain straight-up jump touches it (needs a standing node with |dx|<=10 and feet row y <= by+54)?
import fs from 'fs'; import path from 'path';
import { OUT, LEVELS, loadReach, pad2 } from './qa_balance_lib.mjs';
console.log('rnd ceiling cluster x (shots) -> nearest straight-jump spot dx px / needs diagonal jump?');
for (let lv = 1; lv <= 30; lv++) {
  const d = JSON.parse(fs.readFileSync(path.join(OUT, `air_${pad2(lv)}.json`))); const R = loadReach(lv, 1);
  const cl = new Map();
  for (const x of d.results) { if (x.err || !x.ceil) continue; const k = Math.round(x.settle[0] / 4) * 4; cl.set(k, (cl.get(k) || 0) + 1); }
  const out = [];
  for (const [x, n] of cl) {
    if (n < 3) continue;
    let best = 1e9; for (const nd of R.nodes) if (nd[1] <= 24 + 54 && nd[1] >= 24 - 14) best = Math.min(best, Math.abs(nd[0] - x));
    out.push(`x${x}(${n}) dx=${best > 1e8 ? 'none' : best.toFixed(0)}${best > 10 ? ' DIAGONAL' : ''}`);
  }
  if (out.length) console.log(String(lv).padStart(2), out.join('  '));
}
