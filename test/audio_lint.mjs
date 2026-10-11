// FIZZ & POP — test/audio_lint.mjs   (v2.0 soundtrack: dark wave x EDM x industrial)
// Node-only composition lint: compiles every song (no WebAudio needed) and checks
//  - notation: every bar adds up (AUDIO._validate()), unknown lanes / chars / patterns, every lane's instrument exists
//  - ranges: melodic notes C2..C7 (lift included), bass notes >= E1 (MIDI 28) and bass-lane roots in range, chord voicings inside the instrument range
//  - harmony: share of strong-beat melody notes that are chord tones / scale tones, chromatic notes (info), vertical m2 / tritone clashes (info)
//  - form (SPEC_V2 §6 table): bpm, key tonic, minimum bars, jingle lengths (start <= 2.4 s K7) -- skipped for `placeholder` songs (reported), enforced otherwise
//  - engine budgets: peak simultaneous source nodes per loop (AUDIO._info().peakSources) <= SOURCE_LIMIT (CPU), lane count <= 16, notes per chord <= 5
//  - originality guard: prints each loop's main melody as note names, flags any 5-interval window that matches a short list of famous melodic openings
//    (style only: never quote or paraphrase an existing theme: not Twin Peaks, not Linkin Park, not Bubble Bobble)
// Usage: node test/audio_lint.mjs [--melody] [--full] [--final]
//   --full   print every lane's notes bar by bar        --melody  print the opening of every melody
//   --final  treat `placeholder` songs as errors (use when the composer has delivered the final tracks)
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv.includes('--src') ? path.resolve(process.argv[process.argv.indexOf('--src') + 1]) : path.join(ROOT, 'src', '20_audio.js');
const src = [path.join(ROOT, 'src', '00_shared.js'), SRC].map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const sandbox = { console, setTimeout, setInterval, clearInterval, performance };
vm.createContext(sandbox);
vm.runInContext(src + '\n;globalThis.AUDIO = AUDIO;', sandbox);
const AUDIO = sandbox.AUDIO;
const FINAL = process.argv.includes('--final');

const NN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const name = (m) => NN[m % 12] + (Math.floor(m / 12) - 1);
let errors = 0, warns = 0;
const err = (s) => { errors++; console.log('  ERROR ' + s); };
const warn = (s) => { warns++; console.log('  warn  ' + s); };

const SOURCE_LIMIT = 70;                 // peak simultaneous source nodes of a loop (see header §3.9)
const FORM = {                           // SPEC_V2 §6
  title: { bpm: 92, key: 2, bars: 32 }, stage1: { bpm: 122, key: 4, bars: 72 }, stage2: { bpm: 126, key: 1, bars: 72 }, boss: { bpm: 140, key: 5, bars: 48 },
  entry: { bpm: 76, key: 9, bars: 16 }, ending: { bpm: 100, key: 2, bars: 40 },
};
const JINGLE_SEC = { start: [1.8, 2.4], extend: [2.6, 3.4], gameover: [3.4, 4.6], clear_boss: [2.6, 3.4] };
const BASS_INST = ['pick', 'wood', 'sub', 'riff'];
const MELODY_INST = ['lead', 'alarm', 'twang', 'bell', 'vibes', 'arp'];

const issues = AUDIO._validate();
issues.forEach(err);
console.log('validate(): ' + issues.length + ' issue(s)');
console.log('instruments: ' + AUDIO._instruments().join(' ') + '\nkit chars: ' + AUDIO._kit().join('') + '\nglobal patterns: ' + AUDIO._pats().join(' '));

// famous openings as interval signatures (semitone steps) -- any 5-interval window matching is flagged
const FAMOUS = {
  'Ode to Joy': [0, 2, 2, 1, -2], 'Frere Jacques': [2, 2, -4, 0, 2], 'Twinkle': [0, 7, 0, 2, 0], 'Happy Birthday': [0, 2, -2, 5, -1],
  'Mario overworld': [0, 0, 0, -4, 0], 'Tetris A': [-2, -2, 2, 2, 1], 'Tetris A (QA outline)': [0, 3, 4, -2, -2], 'Fur Elise': [-1, 1, -1, 1, -1],
  'Jingle Bells': [0, 0, 0, 0, 0], 'Imperial March': [0, 0, 0, -4, 3], 'Pink Panther': [1, 2, 1, -3, -1], 'Dies Irae': [-1, 1, -2, 2, -2],
};

const ivs = (L) => L.slice(1).map((x, i) => x.m - L[i].m);
const all = AUDIO.trackNames().concat(AUDIO._demoNames());
for (const n of all) {
  const d = AUDIO._dump(n), info = AUDIO._info(n), isDemo = n.startsWith('demo_');
  const tag = info.placeholder ? '  [PLACEHOLDER]' : '';
  console.log(`\n${n}  [${d.kind}] ${d.bpm} bpm swing ${d.swing}  ${info.bars} bars  ${info.seconds.toFixed(1)} s (loop ${info.loopSeconds.toFixed(1)} s)  lanes ${d.lanes.map((l) => l.name + ':' + l.inst).join(' ')}  peakSources ${info.peakSources}${tag}`);
  if (info.placeholder && FINAL) err('placeholder song left in --final mode');
  if (info.peakSources > SOURCE_LIMIT && !isDemo) err(`peak simultaneous source nodes ${info.peakSources} > ${SOURCE_LIMIT} (CPU budget: reduce chord notes, unison n, overlapping arps)`);
  if (d.lanes.length > 16) err('more than 16 lanes');
  const inst = Object.fromEntries(d.lanes.map((l) => [l.name, l.inst]));
  // ranges per lane
  const byLane = {};
  for (const x of d.notes) (byLane[x.v] = byLane[x.v] || []).push(x);
  for (const [ln, list] of Object.entries(byLane)) {
    const lo = Math.min(...list.map((x) => x.m)), hi = Math.max(...list.map((x) => x.m));
    const lift = info.lift || 0;
    if (BASS_INST.indexOf(inst[ln]) >= 0 && lo < 28) err(`${ln}: bass note below E1 (${name(lo)}) -- phones cannot reproduce it, use a drive stage`);
    if (BASS_INST.indexOf(inst[ln]) >= 0 && hi + lift > 67) warn(`${ln}: bass lane reaches ${name(hi + lift)}`);
    if (MELODY_INST.indexOf(inst[ln]) >= 0 && (lo < 36 || hi + lift > 96)) warn(`${ln}: melodic range ${name(lo)}..${name(hi + lift)} (C2..C7 expected)`);
    if (['super', 'stab', 'pad', 'choir'].indexOf(inst[ln]) >= 0 && (lo < 43 || hi > 88)) warn(`${ln}: chord voicing ${name(lo)}..${name(hi)} outside G2..E6`);
    const maxPoly = (() => { const by = {}; for (const x of list) by[x.s] = (by[x.s] || 0) + 1; return Math.max(...Object.values(by)); })();
    if (maxPoly > 5) warn(`${ln}: ${maxPoly} notes in one chord (CPU)`);
  }
  if (isDemo) continue;
  const chordAt = (s) => d.chords.find((c) => s >= c.s && s < c.s + c.n);
  const scale = new Set(d.mode.map((x) => (d.key + x) % 12));
  const lead = d.lead.slice().sort((a, b) => a.s - b.s);
  if (lead.length) {
    // melody statistics on the melodic lanes
    let strong = 0, strongChord = 0, strongScale = 0; const chromatic = [];
    for (const x of lead) {
      const c = chordAt(x.s); if (!c) continue;
      const pcs = new Set(c.ints.map((i) => (c.root + i) % 12));
      if (!scale.has(x.m % 12)) chromatic.push(name(x.m) + '@' + x.s);
      if (x.s % 4 === 0) { strong++; if (pcs.has(x.m % 12)) strongChord++; if (scale.has(x.m % 12)) strongScale++; }
    }
    if (strong) {
      const pct = Math.round(100 * strongChord / strong);
      console.log(`  melody (${lead.length} notes): strong-beat chord tones ${pct}%, in-scale ${Math.round(100 * strongScale / strong)}%`);
      if (pct < 55 && !info.placeholder) warn('few strong-beat chord tones');
    }
    if (chromatic.length) console.log('  chromatic notes (outside key scale): ' + chromatic.slice(0, 24).join(' ') + (chromatic.length > 24 ? ' ...' : ''));
    for (const ln of new Set(lead.map((x) => x.lane))) {
      const L = lead.filter((x) => x.lane === ln), iv = ivs(L);
      let big = 0; for (const v of iv) if (Math.abs(v) > 12) big++;
      if (big) warn(`${ln}: ${big} leap(s) > octave`);
      for (const [fn, sig] of Object.entries(FAMOUS)) for (let i = 0; i + sig.length <= iv.length; i++) if (sig.every((v, k) => iv[i + k] === v) && sig.some((v) => v !== 0)) warn(`${ln}: interval window matches ${fn} at note ${i}`);
      if (process.argv.includes('--melody') || d.kind === 'loop') console.log(`  ${ln} opening: ` + L.slice(0, 14).map((x) => name(x.m)).join(' '));
    }
  }
  // vertical clashes between voices (info)
  const byStep = {};
  for (const x of d.notes) for (let k = 0; k < x.n; k++) (byStep[x.s + k] = byStep[x.s + k] || []).push(x);
  const clashes = {};
  for (const [st, list] of Object.entries(byStep)) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const A = list[i], B = list[j]; if (A.v === B.v) continue;
    const ic = Math.abs(A.m - B.m) % 12;
    if ((ic === 1 || ic === 11 || ic === 6) && Math.abs(A.m - B.m) < 30) { const key = A.v + '/' + B.v + ' ' + name(A.m) + '-' + name(B.m) + (ic === 6 ? ' (tt)' : ' (m2)'); (clashes[key] = clashes[key] || []).push(+st); }
  }
  const ck = Object.entries(clashes).filter(([, v]) => v.length >= 3).sort((a, b) => b[1].length - a[1].length);
  if (ck.length) console.log('  vertical clashes (steps sounding together): ' + ck.slice(0, 6).map(([k, v]) => k + ' x' + v.length).join(', '));
  // form gates (SPEC_V2 §6)
  const f = FORM[n];
  if (f) {
    const bad = (s) => (info.placeholder && !FINAL ? warn('form (placeholder): ' + s) : err(s));
    if (d.bpm !== f.bpm) err(`${d.bpm} bpm, SPEC_V2 says ${f.bpm}`);
    if (d.key !== f.key) err(`key pitch class ${d.key}, SPEC_V2 says ${f.key} (${NN[f.key]})`);
    if (info.bars < f.bars) bad(`${info.bars} bars, SPEC_V2 says >= ${f.bars}`);
    if (!d.chords.length) err('no chords');
  }
  if (JINGLE_SEC[n]) {
    const [a, b] = JINGLE_SEC[n];
    if (info.seconds < a || info.seconds > b) err(`jingle length ${info.seconds.toFixed(2)} s outside ${a}..${b} s`);
    if (n === 'start' && info.seconds > 2.4) err('start jingle longer than 2.4 s (FIXPLAN2 K7)');
  }
  if (n === 'clear_boss') {
    const lastChord = d.chords[d.chords.length - 1];
    if (!(lastChord.ints[1] === 4)) warn('clear_boss: the SPEC asks for a triumphant (major) resolution');
  }
  if (n === 'ending') {
    const first = d.chords[0], last = d.chords[d.chords.length - 1];
    console.log(`  ending chords: first ${first.name}, last ${last.name} (SPEC: minor -> major Picardy)`);
  }
  if (process.argv.includes('--full')) {
    for (const s of d.sections) {
      console.log('  section ' + s.name);
      for (let b = 0; b < Math.ceil(s.steps / 16); b++) {
        const s0 = s.start + b * 16, s1 = Math.min(s0 + 16, s.start + s.steps);
        const ch = d.chords.filter((c) => c.s >= s0 && c.s < s1).map((c) => c.name).join('.');
        const lanes = Object.entries(byLane).map(([ln, list]) => { const L = list.filter((x) => x.s >= s0 && x.s < s1); return L.length ? ln + ': ' + L.map((x) => name(x.m) + '/' + x.n).join(' ') : ''; }).filter(Boolean);
        console.log('    ' + String(b + 1).padStart(2) + '  ' + ch.padEnd(10) + lanes.join(' | '));
      }
    }
  }
}
// bass register + lift sanity across tracks
for (const n of AUDIO.trackNames()) {
  const info = AUDIO._info(n);
  if (info.lift && info.lift > 4) warn(`${n}: key lift of ${info.lift} semitones per second pass is large`);
  if (info.maxTempo && n !== 'boss' && info.maxTempo < 1.3) warn(`${n}: maxTempo ${info.maxTempo} < 1.3 would cap the HURRY UP tempo`);
}
{
  const b = AUDIO._info('boss');
  if (b.maxTempo < 1.15) err('boss: maxTempo must allow the 1.15 boss HURRY UP tempo');
}
console.log(`\nlint done: ${errors} error(s), ${warns} warning(s)`);
process.exit(errors ? 1 : 0);
