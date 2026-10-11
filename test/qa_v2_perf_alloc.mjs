// Allocation sampling (V8 sampling heap profiler) during real-time busy play: who produces the garbage (GC pressure)?
import fs from 'fs';
import { open, K_VIEWS, BUSY, DRIVE, sleep, OUT } from './qa_v2_perf_lib.mjs';
const k = +(process.argv[2] || 4), scene = process.argv[3] || 'busy', q = +(process.argv[4] || 2);
const [vw, vh, dpr] = K_VIEWS[k];
const t = await open({ vw, vh, dpr });
await t.page.evaluate(({ setup, q, drive }) => { fz = window.__fizzpop; fz.freeze(true); (0, eval)(setup); fz._main.setQuality(q, true); fz.freeze(false); const drv = (0, eval)('(' + drive + ')'); let n = 0; window.__drive = setInterval(() => { n++; drv(n); }, 16); }, { setup: BUSY, q, drive: DRIVE(scene === 'chain') });
await sleep(3000);
await t.cdp.send('HeapProfiler.enable');
await t.cdp.send('HeapProfiler.startSampling', { samplingInterval: 4096, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
const frames0 = await t.page.evaluate(() => performance.now());
await sleep(8000);
const { profile } = await t.cdp.send('HeapProfiler.stopSampling');
const frames1 = await t.page.evaluate(() => performance.now());
const byFn = new Map(); let total = 0;
const walk = (n) => { const self = n.selfSize; if (self) { const cf = n.callFrame; const key = (cf.functionName || '(anon)') + ' ' + (cf.url || '').split('/').pop() + ':' + cf.lineNumber; byFn.set(key, (byFn.get(key) || 0) + self); total += self; } for (const c of n.children || []) walk(c); };
walk(profile.head);
const secs = (frames1 - frames0) / 1000;
console.log(`k=${k} ${scene} q${q}: sampled live-at-stop allocations ${(total / 1024).toFixed(0)} KB over ${secs.toFixed(1)} s (sampling profile only reports objects still alive at stop; use GC counts for rate)`);
for (const [kk, v] of [...byFn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18)) console.log('  ', (v / 1024).toFixed(1).padStart(8), 'KB', kk);
// allocation RATE: sample JS heap before/after without GC via Runtime.getHeapUsage deltas between scavenges is noisy; use many short samples
const samples = [];
let prev = (await t.cdp.send('Runtime.getHeapUsage')).usedSize, drops = 0, grown = 0;
for (let i = 0; i < 200; i++) { await sleep(20); const u = (await t.cdp.send('Runtime.getHeapUsage')).usedSize; if (u < prev) drops++; else grown += u - prev; prev = u; }
console.log(`heap growth between scavenges: ${(grown / 1048576).toFixed(1)} MB in ~4 s (~${(grown / 1048576 / 4).toFixed(2)} MB/s allocation, ${drops} scavenges seen)`);
await t.close();
