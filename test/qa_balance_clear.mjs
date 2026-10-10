// QA balance lens (d): bot clear times per round. usage: node test/qa_balance_clear.mjs --levels 1,2,3|all [--seeds 3] [--pad 1]
import { launch, fp, PROJECT } from '../tools/harness.mjs';
import fs from 'fs'; import path from 'path';
import { OUT, LEVELS } from './qa_balance_lib.mjs';
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const levels = arg('--levels', '1') === 'all' ? Array.from({ length: 29 }, (_, i) => i + 1) : arg('--levels', '1').split(',').map(Number);
const seeds = +arg('--seeds', 3), pad = +arg('--pad', 1), tag = arg('--tag', 'clear');
const lib = fs.readFileSync(path.join(PROJECT, 'test', 'qa_balance_botlib.js'), 'utf8') + '\n' + fs.readFileSync(path.join(PROJECT, 'test', 'qa_balance_bot.js'), 'utf8');
const t = await launch(process.env.FP_HTML ? { html: process.env.FP_HTML } : {}); const g = fp(t.page); await g.freeze(true);
await t.page.evaluate(() => { window.fz = window.__fizzpop; });
await t.page.evaluate(lib);
const all = [];
for (const lv of levels) {
  const row = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const t0 = Date.now();
    const r = await t.page.evaluate(([lv, seed, pad]) => QB.runClear(lv, seed, { pad }), [lv, seed, pad]);
    r.ms = Date.now() - t0; row.push(r);
  }
  all.push(...row);
  const hz = LEVELS[lv - 1].hurry;
  console.log(`R${String(lv).padStart(2)} n=${row[0].enemies} hurry ${hz}s | clear(s after READY): ${row.map((r) => r.clearAt === null ? 'NO(' + r.left + ' left)' : (r.clearAt / 60).toFixed(1)).join(' ')} | traps ${row.map((r) => r.traps).join(',')} esc ${row.map((r) => r.escapes).join(',')} shots ${row.map((r) => r.shots).join(',')} | contacts e/p/g ${row.map((r) => r.contacts.enemy + '/' + r.contacts.proj + '/' + r.contacts.ghost).join(' ')} | hurry@ ${row.map((r) => r.hurryAt === null ? '-' : (r.hurryAt / 60).toFixed(0)).join(',')} | ${row[0].ms}ms`);
}
fs.writeFileSync(path.join(OUT, `${tag}_${levels[0]}_p${pad}.json`), JSON.stringify(all));
console.log(t.errors.length ? 'ERR ' + t.errors : 'no page errors'); await t.close();
