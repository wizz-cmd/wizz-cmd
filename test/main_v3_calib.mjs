// Calibration probe numbers per profile (diagnostic): what does the start-up micro-benchmark say for each environment, and what does it pick?
import { open, PROFILES, sleep } from './main_v3_lib.mjs';
const rows = [['desk1', 1], ['desk2', 1], ['deskhd', 1], ['phone', 1], ['phone', 4], ['phone', 6], ['desk2', 4], ['desk1', 6]];
for (const [profile, cpu] of rows) {
  const t = await open({ profile, cpu });
  const r = await t.ev(() => ({ c: fz._main.calibration(), q: fz.quality, k: fz._main.k(), boot: fz.bootMs, prof: fz.bootProfile, fs: fz._main.frameStats() }));
  console.log(`${profile} cpu${cpu}: probe ${r.c.probeMs.toFixed(2)} ms (${r.c.runs} runs, ${r.c.ms} ms) pred q0/1/2 ${r.c.pred.join('/')} -> q${r.q} k${r.k} cap ${r.c.kCap} | boot ${r.boot} ms rMax ${r.fs.rMax.toFixed(1)}`);
  await t.close();
}
