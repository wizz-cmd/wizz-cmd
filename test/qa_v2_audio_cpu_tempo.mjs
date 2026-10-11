// QA v2 / lens audio: audio_cpu_sections.mjs variant with --tempo (HURRY UP 1.3 / boss 1.15) on the densest sections
// audio_cpu.mjs --tracks measures a track from its START (intro, quiet).  This one seeks every loop to its DENSEST section (the drops / finale / fury) with AUDIO._seek() and
// measures the live incremental CPU there: CDP SystemInfo.getProcessInfo cpu time of all browser processes with the section playing minus the same with the context running
// silent (median of 3 windows), plus the peak of AUDIO._stats().voices.  Also reports the section's compile-time source estimate.
// The reference workload (40 sawtooth oscillators, as in audio_cpu.mjs) gives the machine factor: normalised = raw * REF_DESKTOP / ref_here  (informational).
// GATES: raw incremental <= RAW_LIMIT % (default 16, this slow VM; audio_cpu.mjs uses the same), peak voices <= 120.
// Usage: node test/audio_cpu_sections.mjs [--secs 3] [--ref-desktop 0.8] [--raw-limit 16] [--only stage1,boss]
import fs from 'fs';
import path from 'path';
import { launch, PROJECT } from '../tools/harness.mjs';

const args = process.argv.slice(2);
const argVal = (k, d) => (args.indexOf(k) >= 0 ? args[args.indexOf(k) + 1] : d);
const SECS = +argVal('--secs', 3), REF_DESKTOP = +argVal('--ref-desktop', 0.8), RAW_LIMIT = +argVal('--raw-limit', 16);
const ONLY = argVal('--only', null) ? argVal('--only', '').split(',') : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
const problems = [];
// (track, section) pairs: the loudest / densest section of each loop (+ the second drop of the boss)
const TARGETS = [['stage1', 'D2'], ['stage2', 'D2'], ['boss', 'F'], ['title', 'Bf']];

const html = path.join(PROJECT, 'out', 'v2', 'audio', '_cpu_page.html');
fs.mkdirSync(path.dirname(html), { recursive: true });
fs.writeFileSync(html, '<!DOCTYPE html><meta charset="utf-8"><title>cpu</title><script src="' + path.join(PROJECT, 'src', '00_shared.js') + '"></script><script src="' + path.join(PROJECT, 'src', '20_audio.js') + '"></script>');
const t = await launch({ html });
const bs = await t.browser.newBrowserCDPSession();
const procs = async () => (await bs.send('SystemInfo.getProcessInfo')).processInfo;
async function window(ms) {
  const a = await procs(), w0 = Date.now();
  await sleep(ms);
  const b = await procs(), w = (Date.now() - w0) / 1000;
  let tot = 0;
  for (const p of b) { const q = a.find((x) => x.id === p.id); tot += q ? p.cpuTime - q.cpuTime : p.cpuTime; }
  return 100 * tot / w;
}
const TEMPO = +argVal('--tempo', 1);
await t.page.evaluate(() => AUDIO.init());
await sleep(1200);

// machine factor
await t.page.evaluate(() => { window.__rc = new AudioContext({ latencyHint: 'interactive', sampleRate: 24000 }); const g = __rc.createGain(); g.gain.value = 0.0001; g.connect(__rc.destination); window.__rg = g; });
await sleep(800);
const ri = []; for (let i = 0; i < 3; i++) ri.push(await window(2500));
await t.page.evaluate(() => { window.__ro = []; for (let i = 0; i < 40; i++) { const o = __rc.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 100 + i * 9; o.connect(__rg); o.start(); __ro.push(o); } });
await sleep(800);
const rb = []; for (let i = 0; i < 3; i++) rb.push(await window(2500));
await t.page.evaluate(() => { __ro.forEach((o) => o.stop()); __rc.close(); });
const factor = Math.max(0.5, (median(rb) - median(ri)) / REF_DESKTOP);
console.log(`reference workload: +${(median(rb) - median(ri)).toFixed(2)} % here (desktop ~${REF_DESKTOP} %) -> machine factor x${factor.toFixed(2)}`);

const rows = [];
for (const [name, sec] of TARGETS.filter(([n]) => !ONLY || ONLY.includes(n))) {
  const dd = await t.page.evaluate((n) => AUDIO._dump(n), name);
  const s = dd.sections.find((x) => x.name === sec);
  if (!s) { problems.push(`${name}: no section ${sec}`); continue; }
  await t.page.evaluate(() => AUDIO.stopMusic()); await sleep(1500);
  const idle = []; for (let i = 0; i < 3; i++) idle.push(await window(SECS * 500));
  await t.page.evaluate(({ n, step, TEMPO_ }) => { AUDIO.setTempo(TEMPO_); AUDIO.music(n, { restart: true }); AUDIO._seek(step); }, { n: name, step: s.start, TEMPO_: TEMPO });
  await sleep(1800);
  const busy = []; let peak = 0;
  for (let i = 0; i < 3; i++) { busy.push(await window(SECS * 1000)); peak = Math.max(peak, await t.page.evaluate(() => AUDIO._stats().voices)); }
  const where = await t.page.evaluate(() => { const st = AUDIO._stats(); return st.curPos; });
  await t.page.evaluate(() => AUDIO.stopMusic());
  const incr = median(busy) - median(idle);
  rows.push({ name: name + '.' + sec, idle: median(idle), busy: median(busy), incr, norm: incr / factor, peak, pos: where, inside: where >= s.start && where < s.start + s.steps });
}
console.log('\nLIVE CPU in the densest sections (% of one core; incremental = playing - idle)');
console.log('section'.padEnd(14) + 'idle'.padEnd(8) + 'playing'.padEnd(10) + 'incremental'.padEnd(13) + 'normalised (desktop)'.padEnd(22) + 'peak voices');
for (const r of rows) {
  console.log(r.name.padEnd(14) + r.idle.toFixed(1).padEnd(8) + r.busy.toFixed(1).padEnd(10) + r.incr.toFixed(1).padEnd(13) + r.norm.toFixed(1).padEnd(22) + r.peak + (r.inside ? '' : '   (left the section while measuring)'));
  if (r.incr > RAW_LIMIT) problems.push(`${r.name}: ${r.incr.toFixed(1)} % of a core here (raw limit ${RAW_LIMIT} %)`);
  if (r.peak > 120) problems.push(`${r.name}: peak ${r.peak} simultaneous source nodes (> 120)`);
}
if (t.errors.length) problems.push('console errors: ' + t.errors.join(' | '));
problems.forEach((p) => console.log('PROBLEM: ' + p));
console.log(`\n${problems.length} problem(s)`);
await t.close();
process.exit(problems.length ? 1 : 0);
