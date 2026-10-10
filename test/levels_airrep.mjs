// FIZZ & POP — test/levels_airrep.mjs : summary of a qa_balance_air run (tag) for chosen rounds, plus ceiling-gather spot distance.
//   FP_TAG=_w3 node test/qa_balance_air.mjs --levels 16,19,27 ; node test/levels_airrep.mjs _w3 16,19,27
import fs from 'fs'; import path from 'path';
import { OUT, LEVELS, pad2, loadReach } from './qa_balance_lib.mjs';
const tag = process.argv[2] || '', lvs = (process.argv[3] || '16,19,27').split(',').map(Number);
for (const lv of lvs) {
  const d = JSON.parse(fs.readFileSync(path.join(OUT, `air${tag}_${pad2(lv)}.json`)));
  const R = d.results.filter((x) => !x.err);
  const cl = new Map();
  for (const x of R) { const k = Math.round(x.settle[0] / 4) * 4 + ',' + Math.round(x.settle[1] / 4) * 4; cl.set(k, (cl.get(k) || 0) + 1); }
  const cls = [...cl.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join(' ');
  const ts = R.map((x) => x.tSettle).filter((x) => x !== null).sort((a, b) => a - b);
  const unreach = R.filter((x) => x.tSettle === null).length;
  console.log(`R${lv} air ${JSON.stringify(LEVELS[lv - 1].air)}  shots ${R.length}  tSettle med ${ts[ts.length >> 1]} max ${ts[ts.length - 1]} unreach ${unreach}`);
  console.log('   clusters ' + cls);
  const reach = loadReach(lv, 1), cc = new Map();
  for (const x of R) { if (!x.ceil) continue; const k = Math.round(x.settle[0] / 4) * 4; cc.set(k, (cc.get(k) || 0) + 1); }
  const out = [];
  for (const [x, n] of cc) { let best = 1e9; for (const nd of reach.nodes) if (nd[1] <= 78 && nd[1] >= 10) best = Math.min(best, Math.abs(nd[0] - x)); out.push(`x${x}(${n}) dx=${best.toFixed(0)}${best > 10 ? ' DIAGONAL' : ''}`); }
  console.log('   ceiling ' + (out.join('  ') || '-'));
}
