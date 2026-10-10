// QA balance lens (e): run the boss bot. node test/qa_balance_boss.mjs [--seeds 6] [--players 1] [--minCluster 4] [--minHitFrac 0.6] [--debug 120]
import { launch, fp, PROJECT } from '../tools/harness.mjs';
import fs from 'fs'; import path from 'path';
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? +args[i + 1] : d; };
const seeds = arg('--seeds', 6), players = arg('--players', 1), minCluster = arg('--minCluster', 4), minHitFrac = arg('--minHitFrac', 0.6), debug = arg('--debug', 0), patience = arg('--patience', 500);
const lib = ['botlib', 'boss'].map((n) => fs.readFileSync(path.join(PROJECT, 'test', `qa_balance_${n}.js`), 'utf8')).join('\n');
const HTML = process.env.FP_HTML || undefined;
const t = await launch(HTML ? { html: HTML } : {}); const g = fp(t.page); await g.freeze(true);
await t.page.evaluate(() => { window.fz = window.__fizzpop; }); await t.page.evaluate(lib);
const res = [];
for (let seed = 1; seed <= seeds; seed++) {
  const r = await t.page.evaluate(([seed, o]) => QB.runBoss(seed, o), [seed, { players, minCluster, minHitFrac, debug, patience }]);
  res.push(r);
  console.log(`seed ${seed}: TTK ${r.ttk === null ? 'NOT KILLED (hp left ' + r.hpLeft + ')' : (r.ttk / 60).toFixed(1) + 's'} volleys ${r.stat.volleys.length} predictedHits ${r.stat.hitsPredicted} actualHits ${r.stat.boltsHit} bolts fired ${r.stat.boltsFired} hit ${r.stat.boltsHitObj} contacts boss/ink ${r.stat.contactsBoss}/${r.stat.contactsInk} ghost ${r.ghost}`);
  if (debug) for (const d of r.dbg) console.log('  ', JSON.stringify(d));
}
const tt = res.map((r) => r.ttk).filter((v) => v !== null).sort((a, b) => a - b);
console.log(`players ${players} minCluster ${minCluster} minHitFrac ${minHitFrac}: killed ${tt.length}/${res.length} median TTK ${tt.length ? (tt[Math.floor(tt.length / 2)] / 60).toFixed(1) : '-'}s min ${tt.length ? (tt[0] / 60).toFixed(1) : '-'} max ${tt.length ? (tt[tt.length - 1] / 60).toFixed(1) : '-'}`);
console.log(t.errors.length ? 'ERR ' + t.errors : 'no page errors'); await t.close();
