// QA balance lens: per-capture log of the clear bot (best-case time to reach the bubble vs trapTime, outcome). node test/qa_balance_traplog.mjs <round> [seeds]
import { launch, fp, PROJECT } from '../tools/harness.mjs';
import fs from 'fs'; import path from 'path';
const lv = +process.argv[2] || 27, seeds = +process.argv[3] || 4;
const lib = fs.readFileSync(path.join(PROJECT, 'test', 'qa_balance_botlib.js'), 'utf8') + '\n' + fs.readFileSync(path.join(PROJECT, 'test', 'qa_balance_bot.js'), 'utf8');
const t = await launch(); const g = fp(t.page); await g.freeze(true);
await t.page.evaluate(() => { window.fz = window.__fizzpop; }); await t.page.evaluate(lib);
for (let seed = 1; seed <= seeds; seed++) {
  const r = await t.page.evaluate(([lv, seed]) => QB.runClear(lv, seed, {}), [lv, seed]);
  console.log(`seed ${seed}: clear ${r.clearAt === null ? 'NO' : (r.clearAt / 60).toFixed(1) + 's'} traps ${r.traps} escapes ${r.escapes}`);
  for (const e of r.trapLog) console.log('   ', JSON.stringify(e));
}
await t.close();
