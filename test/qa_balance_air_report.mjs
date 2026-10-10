// QA balance lens: summarise out/qa/balance/air_NN.json
import fs from 'fs'; import path from 'path';
import { OUT, LEVELS, pad2 } from './qa_balance_lib.mjs';
const med = (a) => { a = a.filter((x) => x !== null && x !== undefined).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };
console.log('rnd air attractors        settle clusters (x,y -> n)                                  tSettle(med/max/unreach) tArrive(med/max) late>540  ceil overlap>.25 jitter(rev>8) trapT');
for (let lv = 1; lv <= 30; lv++) {
  const d = JSON.parse(fs.readFileSync(path.join(OUT, `air_${pad2(lv)}.json`)));
  const R = d.results.filter((x) => !x.err);
  const cl = new Map();
  for (const x of R) { const k = Math.round(x.settle[0] / 8) * 8 + ',' + Math.round(x.settle[1] / 8) * 8; cl.set(k, (cl.get(k) || 0) + 1); }
  const cls = [...cl.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).slice(0, 6).join(' ');
  const ts = R.map((x) => x.tSettle), unreach = R.filter((x) => x.tSettle === null).length;
  const ta = R.map((x) => x.tArrive);
  const late = R.filter((x) => x.tArrive !== null && x.tArrive > 540).length;
  const ceil = R.filter((x) => x.ceil).length, ov = R.filter((x) => x.overlap > 0.25).length, jit = R.filter((x) => x.rev > 8).length;
  const trapT = Math.max(240, 480 - 8 * (lv - 1));
  console.log(String(lv).padStart(2), JSON.stringify(LEVELS[lv - 1].air).padEnd(24), cls.padEnd(60), `${med(ts)}/${Math.max(...ts.map((x) => x ?? 0))}/${unreach}`.padEnd(24), `${med(ta)}/${Math.max(...ta.map((x) => x ?? 0))}`.padEnd(12), String(late).padStart(3), String(ceil).padStart(4), String(ov).padStart(5), String(jit).padStart(5), trapT);
}
