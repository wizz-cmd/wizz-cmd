// CDP tracing of the real rAF loop: where does wall time go per thread (JS, GC, raster, compositor)? usage: node trace.mjs k scene q [cpu] [dpr/touch phone]
import fs from 'fs';
import { open, K_VIEWS, BUSY, TYPICAL, DRIVE, stat, sleep, OUT } from './qa_v2_perf_lib.mjs';
const [kS, scene, qS, cpuS, phone] = [process.argv[2] || '4', process.argv[3] || 'busy', process.argv[4] || '2', process.argv[5] || '1', process.argv[6] || ''];
const k = +kS, q = +qS, cpu = +cpuS;
let cfg = K_VIEWS[k];
if (phone) cfg = [390, 844, 3];
const t = await open({ vw: cfg[0], vh: cfg[1], dpr: cfg[2], touch: !!phone, cpu });
await t.page.evaluate(({ setup, q, drive, lock }) => {
  fz = window.__fizzpop;
  fz.freeze(true); (0, eval)(setup);
  if (lock) fz._main.setQuality(q, true);
  fz.freeze(false);
  const drv = (0, eval)('(' + drive + ')'); let n = 0;
  window.__drive = setInterval(() => { n++; drv(n); }, 16);
  window.__fr = []; let last = performance.now(); const tick = (ts) => { window.__fr.push(ts - last); last = ts; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
}, { setup: scene === 'typical' ? TYPICAL : BUSY, q, drive: DRIVE(scene === 'chain'), lock: !phone });
await sleep(phone ? 9000 : 2500);
const chunks = [];
t.cdp.on('Tracing.dataCollected', (e) => chunks.push(...e.value));
const done = new Promise((r) => t.cdp.once('Tracing.tracingComplete', r));
await t.page.evaluate(() => { window.__fr.length = 0; });
await t.cdp.send('Tracing.start', { transferMode: 'ReportEvents', categories: 'devtools.timeline,disabled-by-default-devtools.timeline,v8,v8.execute,blink,cc,gpu,viz,disabled-by-default-v8.gc_stats,toplevel,latencyInfo,skia', options: 'sampling-frequency=10000' });
await sleep(5000);
await t.cdp.send('Tracing.end');
await done;
const fr = await t.page.evaluate(() => window.__fr.slice());
const meta = {};
for (const e of chunks) if (e.ph === 'M' && e.name === 'thread_name') meta[e.pid + ':' + e.tid] = e.args.name;
const pmeta = {};
for (const e of chunks) if (e.ph === 'M' && e.name === 'process_name') pmeta[e.pid] = e.args.name;
// aggregate complete events (X) by thread + name; also B/E pairs ignored
const agg = new Map();
for (const e of chunks) {
  if (e.ph !== 'X' || !e.dur) continue;
  const th = (pmeta[e.pid] || e.pid) + '/' + (meta[e.pid + ':' + e.tid] || e.tid);
  const key = th + ' | ' + e.name;
  const a = agg.get(key) || { n: 0, ms: 0, max: 0 };
  a.n++; a.ms += e.dur / 1000; a.max = Math.max(a.max, e.dur / 1000); agg.set(key, a);
}
const wall = 5000;
const rows = [...agg.entries()].map(([k, v]) => ({ k, ...v })).sort((a, b) => b.ms - a.ms);
const byThread = new Map();
for (const r of rows) { const th = r.k.split(' | ')[0]; if (r.k.endsWith('RunTask') || r.k.endsWith('ThreadControllerImpl::RunTask') ) byThread.set(th, (byThread.get(th) || 0) + r.ms); }
console.log(`k=${t.page && k} ${scene} q${q} cpu${cpu}  rAF`, JSON.stringify(stat(fr)));
console.log('--- busy ms of RunTask per thread over', wall, 'ms');
for (const [th, ms] of [...byThread.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log('  ', th.padEnd(60), ms.toFixed(0), 'ms', (ms / wall * 100).toFixed(1) + '%');
console.log('--- top events');
for (const r of rows.filter((r) => !/RunTask|ThreadController|MessageLoop/.test(r.k)).slice(0, 40)) console.log('  ', r.ms.toFixed(1).padStart(8), 'ms  n=' + String(r.n).padStart(5), 'max', r.max.toFixed(1).padStart(6), r.k);
fs.writeFileSync(OUT + `/trace_k${k}_${scene}_q${q}_cpu${cpu}${phone ? '_phone' : ''}.summary.json`, JSON.stringify({ rAF: stat(fr), rows: rows.slice(0, 120) }, null, 1));
await t.close();
