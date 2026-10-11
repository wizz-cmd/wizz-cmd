// FIZZ & POP — test/audio_v3_kicks.mjs   (FIXPLAN_V3 A7: four-on-the-floor in every drop)
// Node-only (no WebAudio): compiles every song and counts the kick voices (Linn / EDM / boom) per bar and per beat.  Every bar of a DROP section must carry a kick on all four beats
// (steps 0, 4, 8, 12) -- the EDM pump of the side-chained supersaw -- except the bars that are deliberately different: the half-time bars (stage1 D2 9-12) and the snare-roll bar that
// leads out of a drop.  The verses / builds / breakdowns are reported for comparison (verse 3 per bar, builds 4 per bar, breakdowns 0 audible kicks).
// Usage: node test/audio_v3_kicks.mjs [--src file.js] [--table]
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const SRC = args.includes('--src') ? path.resolve(args[args.indexOf('--src') + 1]) : path.join(ROOT, 'src', '20_audio.js');
const sandbox = { console, setTimeout, setInterval, clearInterval, performance };
vm.createContext(sandbox);
vm.runInContext([path.join(ROOT, 'src', '00_shared.js'), SRC].map((f) => fs.readFileSync(f, 'utf8')).join('\n') + '\n;globalThis.AUDIO = AUDIO;', sandbox);
const AUDIO = sandbox.AUDIO;

// drop sections and the 1-based bars that are allowed to differ (half-time, roll bar into the next section)
const DROPS = {
  stage1: { D1: [16], D2: [9, 10, 11, 12, 16] },
  stage2: { C: [16], D2: [16] },
  boss: { B: [8], F: [8] },
  title: { B: [8], Bf: [8] },
  ending: { FI: [12] },
};
const KICKS = new Set(['kMachine', 'kEdm', 'kBoom']);
let fails = 0, n = 0;
const check = (name, ok, detail) => { n++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  ' + JSON.stringify(detail) : '')); };

for (const track of Object.keys(DROPS)) {
  const d = AUDIO._dump(track), ev = AUDIO._events(track, 0).filter((e) => e.k === 'd' && KICKS.has(e.fn));
  const byStep = new Map(); for (const e of ev) byStep.set(e.step, (byStep.get(e.step) || 0) + 1);
  const row = [];
  for (const sec of d.sections) {
    const bars = sec.steps / 16, per = [];
    for (let b = 0; b < bars; b++) {
      let c = 0; const beats = [];
      for (let q = 0; q < 16; q++) if (byStep.has(sec.start + b * 16 + q)) { c++; if (q % 4 === 0) beats.push(q); }
      per.push({ count: c, onBeats: beats.length });
    }
    const avg = per.reduce((a, x) => a + x.count, 0) / bars;
    row.push(`${sec.name} ${avg.toFixed(1)}`);
    const drop = DROPS[track][sec.name];
    if (drop) {
      const bad = [];
      per.forEach((x, i) => { if (!drop.includes(i + 1) && x.onBeats < 4) bad.push(`bar ${i + 1}: ${x.onBeats}/4 beats`); });
      check(`${track} ${sec.name} (drop): a kick on all four beats in every groove bar (${bars - drop.length} of ${bars} bars; avg ${avg.toFixed(1)} kicks/bar)`, bad.length === 0, bad);
    }
  }
  console.log(`  ${track} kicks per bar by section: ${row.join('  ')}`);
}
console.log(`\n${n - fails}/${n} checks passed`);
process.exit(fails ? 1 : 0);
