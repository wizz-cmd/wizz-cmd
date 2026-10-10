// QA balance lens (e): oracle boss fight (teleporting popper) = supply/alignment-limited lower bound of TTK.
// node test/qa_balance_bossoracle.mjs [html] [boltH]
import { launch, fp, PROJECT } from '../tools/harness.mjs';
import fs from 'fs'; import path from 'path';
const html = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : undefined, boltH = +process.argv[3] || 8;
const lib = ['botlib', 'boss'].map((n) => fs.readFileSync(path.join(PROJECT, 'test', `qa_balance_${n}.js`), 'utf8')).join('\n');
const t = await launch(html ? { html } : {}); const g = fp(t.page); await g.freeze(true);
await t.page.evaluate(() => { window.fz = window.__fizzpop; }); await t.page.evaluate(lib);
for (const players of [1, 2]) for (const rule of ['any', 'c2']) {
  const res = [];
  for (let seed = 1; seed <= 6; seed++) res.push(await t.page.evaluate(([seed, o]) => QB.runBossOracle(seed, o), [seed, { players, rule, boltH }]));
  const tt = res.map((r) => r.ttk).filter((v) => v !== null).sort((a, b) => a - b);
  console.log(`${html ? path.basename(html) : 'dist'} players ${players} rule ${rule.padEnd(4)}: killed ${tt.length}/6 TTK median ${tt.length ? (tt[Math.floor(tt.length / 2)] / 60).toFixed(0) : '-'}s (min ${tt.length ? (tt[0] / 60).toFixed(0) : '-'}, max ${tt.length ? (tt[tt.length - 1] / 60).toFixed(0) : '-'})`);
}
console.log(t.errors.length ? 'ERR ' + t.errors : 'no page errors'); await t.close();
