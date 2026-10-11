// QA v2 / lens "audio" -- harmony sanity: every melody note vs the chord that sounds under it, and every simultaneous m2/M7/m9 between
// DIFFERENT lanes (that is not part of the chord's own definition).  Reads the compiled song (AUDIO._dump), no rendering.
// Usage: node test/qa_v2_audio_harmony.mjs [track ...]  -> out/qa_v2/audio/harmony_<track>.json + console summary
import fs from 'fs';
import path from 'path';
import { launch, PROJECT } from '../tools/harness.mjs';
const OUT = path.join(PROJECT, 'out/qa_v2/audio'); fs.mkdirSync(OUT, { recursive: true });
const names = process.argv.slice(2).length ? process.argv.slice(2) : ['title', 'stage1', 'stage2', 'boss', 'entry', 'ending', 'start', 'extend', 'gameover', 'clear_boss'];
const t = await launch({ html: path.join(PROJECT, 'test/audio_page.html') });
const NN = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const nn = (m) => NN[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
const MELODY = new Set(['lead', 'twang', 'bell', 'vibes', 'alarm']);
for (const name of names) {
  const d = await t.page.evaluate((n) => { const x = AUDIO._dump(n); return { bpm: x.bpm, key: x.key, mode: x.mode, steps: x.steps, loopStart: x.loopStart, chords: x.chords, notes: x.notes, sections: x.sections, lanes: x.lanes.map((l) => l.name + ':' + l.inst) }; }, name);
  const chordAt = (s) => { let c = null; for (const k of d.chords) if (k.s <= s && s < k.s + k.n) c = k; return c; };
  const secAt = (s) => { for (const k of d.sections) if (k.start <= s && s < k.start + k.steps) return k.name + ' bar ' + (1 + Math.floor((s - k.start) / 16)); return '?'; };
  const laneOf = (v) => v;
  const res = { track: name, lanes: d.lanes, melody: {}, clashes: [] };
  const stats = {};
  for (const x of d.notes) {
    if (!MELODY.has(x.v)) continue;
    const c = chordAt(x.s); if (!c) continue;
    const pc = ((x.m - c.root) % 12 + 12) % 12;
    const ints = c.ints.map((i) => i % 12);
    const scale = d.mode.map((i) => (i + d.key) % 12);
    const inChord = ints.includes(pc);
    const ext = [2, 5, 9].includes(pc) && !inChord;           // 9 / 11 / 13 colour
    const inScale = scale.includes(((x.m % 12) + 12) % 12);
    const kind = inChord ? 'chord' : ext ? 'ext' : inScale ? 'scale' : 'chromatic';
    (stats[x.v] = stats[x.v] || { chord: 0, ext: 0, scale: 0, chromatic: 0, n: 0 })[kind]++; stats[x.v].n++;
    if (kind === 'chromatic' && x.n >= 2) (res.melody.chromatic = res.melody.chromatic || []).push(`${secAt(x.s)} step ${x.s % 16} ${x.v} ${nn(x.m)} over ${c.name} len ${x.n}`);
  }
  res.stats = stats;
  // cross-lane minor-2nd / major-7th / minor-9th (pitch distance 1, 11, 13) between sounding notes, both lasting >= 2 steps overlap, different lanes, not both chord-voices of the same lane
  const notes = d.notes.filter((x) => x.n >= 1 && !['sub'].includes(x.v) || true);
  const byStep = new Map();
  for (const x of d.notes) for (let s = x.s; s < x.s + Math.min(x.n, 64); s++) { let a = byStep.get(s); if (!a) byStep.set(s, a = []); a.push(x); }
  const seen = new Set();
  for (const x of d.notes) {
    if (!MELODY.has(x.v)) continue;
    for (let s = x.s; s < x.s + Math.min(x.n, 64); s++) for (const y of byStep.get(s) || []) {
      if (y === x || y.v === x.v) continue;
      if (y.v === 'arp' && x.v === 'arp') continue;
      const dist = Math.abs(x.m - y.m);
      if (!(dist === 1 || dist === 11 || dist === 13 || dist === 2 && false)) continue;
      const c = chordAt(x.s);
      // is that interval inherent to the chord (e.g. Cmaj7 root + maj7 -> M7; B7b9)?  both pcs chord tones -> intentional
      const cp = (m) => ((m - c.root) % 12 + 12) % 12;
      const ints = c.ints.map((i) => i % 12);
      const bothChord = ints.includes(cp(x.m)) && ints.includes(cp(y.m));
      const key = x.s + '|' + x.v + x.m + '|' + y.v + y.m;
      if (seen.has(key)) continue; seen.add(key);
      const ov = Math.min(x.s + x.n, y.s + y.n) - Math.max(x.s, y.s);
      if (ov < 2) continue;
      res.clashes.push({ where: secAt(Math.max(x.s, y.s)), chord: c.name, a: `${x.v} ${nn(x.m)}`, b: `${y.v} ${nn(y.m)}`, dist, overlapSteps: ov, bothChordTones: bothChord });
    }
  }
  const hard = res.clashes.filter((c) => !c.bothChordTones);
  fs.writeFileSync(path.join(OUT, `harmony_${name}.json`), JSON.stringify(res, null, 1));
  console.log(`\n== ${name}  melody-note classes per lane (chord / ext / scale / chromatic):`);
  for (const [v, s] of Object.entries(stats)) console.log(`   ${v.padEnd(6)} n=${String(s.n).padStart(4)}  chord ${s.chord}  ext ${s.ext}  scale ${s.scale}  chromatic ${s.chromatic}`);
  console.log(`   cross-lane m2/M7/m9 overlaps >=2 steps involving a melody lane: ${res.clashes.length}, of which not both chord tones: ${hard.length}`);
  for (const c of hard.slice(0, 25)) console.log(`     ${c.where.padEnd(10)} ${c.chord.padEnd(8)} ${c.a} vs ${c.b} (d=${c.dist}, ${c.overlapSteps} steps)`);
  if (res.melody.chromatic) { console.log('   chromatic melody notes (>=2 steps):'); for (const s of res.melody.chromatic.slice(0, 20)) console.log('     ' + s); }
}
await t.close();
