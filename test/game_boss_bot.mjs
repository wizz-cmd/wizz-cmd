// FIZZ & POP — game module: realistic boss-fight bot (navigates with real physics, waits for thunder clusters).
//   node test/game_boss_bot.mjs [--seeds 6] [--players 1|2] [--max 150]      HTML via FP_HTML (default dist/fizzpop.html)
// Reports time-to-kill per seed; exits 1 when the median exceeds --max seconds or the boss is not killed.
import { launch, fp, PROJECT } from '../tools/harness.mjs';
import fs from 'fs'; import path from 'path';
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? +args[i + 1] : d; };
const seeds = arg('--seeds', 6), players = arg('--players', 1), maxMedian = arg('--max', 150), minCluster = arg('--minCluster', 4), minHitFrac = arg('--minHitFrac', 0.6);
const lib = [path.join(PROJECT, 'test', 'qa_balance_botlib.js'), path.join(PROJECT, 'test', 'game_boss_botlib.js')].map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const t = await launch(process.env.FP_HTML ? { html: process.env.FP_HTML } : {});
const g = fp(t.page); await g.freeze(true);
await t.page.evaluate(() => { window.fz = window.__fizzpop; }); await t.page.evaluate(lib);
const tt = [];
for (let seed = 1; seed <= seeds; seed++) {
  const r = await t.page.evaluate(([seed, o]) => QB.runBossG(seed, o), [seed, { players, minCluster, minHitFrac }]);
  console.log(`seed ${seed}: TTK ${r.ttk === null ? 'NOT KILLED (hp left ' + r.hpLeft + ')' : (r.ttk / 60).toFixed(1) + 's'}  bolts fired ${r.stat.boltsFired} hit ${r.stat.boltsHitObj}  contacts boss/ink ${r.stat.contactsBoss}/${r.stat.contactsInk}  ghost ${r.ghost}`);
  if (r.ttk !== null) tt.push(r.ttk / 60);
}
tt.sort((a, b) => a - b);
const med = tt.length ? tt[Math.floor(tt.length / 2)] : Infinity;
console.log(`players ${players}: killed ${tt.length}/${seeds}  median ${med.toFixed(1)}s  min ${tt[0] ? tt[0].toFixed(1) : '-'}  max ${tt.length ? tt[tt.length - 1].toFixed(1) : '-'}   (limit ${maxMedian}s)`);
console.log(t.errors.length ? 'ERR ' + t.errors : 'no page errors');
await t.close();
process.exit(tt.length === seeds && med <= maxMedian && !t.errors.length ? 0 : 1);
