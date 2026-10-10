import { launch, fp, PROJECT } from '../tools/harness.mjs';
import fs from 'fs'; import path from 'path';
const SEED = +process.argv[5] || 1; const lv = +process.argv[2] || 1, every = +process.argv[3] || 30, maxF = +process.argv[4] || 1200;
const lib = fs.readFileSync(path.join(PROJECT, 'test', 'qa_balance_botlib.js'), 'utf8') + '\n' + fs.readFileSync(path.join(PROJECT, 'test', 'qa_balance_bot.js'), 'utf8');
const t = await launch(); const g = fp(t.page); await g.freeze(true);
await t.page.evaluate(() => { window.fz = window.__fizzpop; }); await t.page.evaluate(lib);
const r = await t.page.evaluate(([lv, every, maxF, SEED]) => QB.runClear(lv, SEED, { debug: every, maxFrames: maxF }), [lv, every, maxF, SEED]);
for (const d of r.dbg) console.log(JSON.stringify(d));
delete r.dbg; console.log(JSON.stringify(r)); console.log(t.errors); await t.close();
