// FIZZ & POP — test/audio_lint.mjs
// Node-only composition lint: compiles every song (no WebAudio needed) and checks
//  - bar arithmetic (validated by AUDIO._validate), pitch ranges, leap sizes
//  - harmony: share of strong-beat lead notes that are chord tones / scale tones, chromatic notes
//  - "originality guard": prints each loop's main melody as note names + interval signature and flags any
//    4+ note interval run that matches a small list of famous melodic openings.
//  - wave 2 structure checks: stage1/stage2 are >= 40 bars with >= 30 distinct lead bars (QA A1), the title shares almost no
//    8-interval window with stage1 (A6), the clear_boss jingle resolves to E major and opens differently from start / title
//    (A5), no bass note below G2 (A9), lead + loop-pass lift stays <= C7, the boss riff no longer outlines Tetris A (A10).
// Usage: node test/audio_lint.mjs [--melody] [--full]     (--full prints every loop's lead as note names, bar by bar)
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = ['00_shared.js', '20_audio.js'].map((f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8')).join('\n');
const sandbox = { console, setTimeout, setInterval, clearInterval, performance };
vm.createContext(sandbox);
vm.runInContext(src + '\n;globalThis.AUDIO = AUDIO;', sandbox);
const AUDIO = sandbox.AUDIO;

const NN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const name = (m) => NN[m % 12] + (Math.floor(m / 12) - 1);
let errors = 0, warns = 0;
const err = (s) => { errors++; console.log('  ERROR ' + s); };
const warn = (s) => { warns++; console.log('  warn  ' + s); };

const issues = AUDIO._validate();
issues.forEach(err);
console.log('validate(): ' + issues.length + ' issue(s)');

// famous openings as interval signatures (semitone steps) -- any 5-interval window matching is flagged
const FAMOUS = {
  'Ode to Joy': [0, 2, 2, 1, -2],
  'Frere Jacques': [2, 2, -4, 0, 2],
  'Twinkle': [0, 7, 0, 2, 0],
  'Happy Birthday': [0, 2, -2, 5, -1],
  'Mario overworld': [0, 0, 0, -4, 0],
  'Tetris A': [-2, -2, 2, 2, 1],
  'Tetris A (QA outline)': [0, 3, 4, -2, -2],
  'Fur Elise': [-1, 1, -1, 1, -1],
  'Jingle Bells': [0, 0, 0, 0, 0],
};

for (const n of AUDIO.trackNames()) {
  const d = AUDIO._dump(n);
  const info = AUDIO._info(n);
  console.log(`\n${n}  [${d.kind}] ${d.bpm} bpm swing ${d.swing}  ${info.bars} bars  ${info.seconds.toFixed(1)} s (loop ${info.loopSeconds.toFixed(1)} s)`);
  const leads = d.lead.slice().sort((a, b) => a.s - b.s);
  const lo = Math.min(...leads.map((x) => x.m)), hi = Math.max(...leads.map((x) => x.m));
  console.log(`  lead range ${name(lo)}..${name(hi)}  (${leads.length} notes)`);
  if (hi > 96) warn('lead goes above C7');
  if (lo < 60) warn('lead below C4');
  // leaps
  let big = 0;
  for (let i = 1; i < leads.length; i++) if (Math.abs(leads[i].m - leads[i - 1].m) > 12) big++;
  if (big) warn(big + ' leap(s) > octave');
  // chord/scale check on strong beats (step % 4 == 0)
  const chordAt = (s) => d.chords.find((c) => s >= c.s && s < c.s + c.n);
  const scale = new Set(d.mode.map((x) => (d.key + x) % 12));
  let strong = 0, strongChord = 0, strongScale = 0, chromatic = [];
  for (const x of leads) {
    const c = chordAt(x.s);
    if (!c) continue;
    const pcs = new Set(c.ints.map((i) => (c.root + i) % 12));
    if (!scale.has(x.m % 12)) chromatic.push(name(x.m) + '@' + x.s);
    if (x.s % 4 === 0) {
      strong++;
      if (pcs.has(x.m % 12)) strongChord++;
      if (scale.has(x.m % 12)) strongScale++;
    }
  }
  if (strong) {
    const pct = Math.round(100 * strongChord / strong);
    console.log(`  strong-beat notes: ${strong}, chord tones ${pct}%, in-scale ${Math.round(100 * strongScale / strong)}%`);
    if (pct < 60) warn('few strong-beat chord tones');
  }
  if (chromatic.length) console.log('  chromatic notes (outside key scale): ' + chromatic.join(' '));
  // vertical clashes: pitch-class pairs a semitone / tritone apart that sound together for >= 2 steps between voices
  const clashes = {};
  const notes = d.notes;
  for (const a of notes) for (const b of notes) {
    if (a === b || a.v >= b.v && a.v !== b.v) continue;       // each pair once (voice names sort lead < harm < bass? handled below)
  }
  const byStep = {};
  for (const x of notes) for (let k = 0; k < x.n; k++) (byStep[x.s + k] = byStep[x.s + k] || []).push(x);
  for (const [st, list] of Object.entries(byStep)) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const A = list[i], B = list[j]; if (A.v === B.v) continue;
      const ic = Math.abs(A.m - B.m) % 12;
      if ((ic === 1 || ic === 11 || ic === 6) && Math.abs(A.m - B.m) < 30) {
        const key = A.v + '/' + B.v + ' ' + name(A.m) + '-' + name(B.m) + (ic === 6 ? ' (tt)' : ' (m2)');
        const sNum = +st;
        (clashes[key] = clashes[key] || []).push(sNum);
      }
    }
  }
  const ck = Object.entries(clashes).filter(([, v]) => v.length >= 2).sort((a, b) => b[1].length - a[1].length);
  if (ck.length) console.log('  vertical clashes (steps sounding together): ' + ck.slice(0, 8).map(([k, v]) => k + ' x' + v.length).join(', '));
  // famous interval windows
  const iv = [];
  for (let i = 1; i < leads.length; i++) iv.push(leads[i].m - leads[i - 1].m);
  for (const [fn, sig] of Object.entries(FAMOUS)) {
    for (let i = 0; i + sig.length <= iv.length; i++) {
      if (sig.every((v, k) => iv[i + k] === v) && sig.some((v) => v !== 0)) warn('interval window matches ' + fn + ' at note ' + i);
    }
  }
  if (process.argv.includes('--melody') || ['title', 'stage1', 'stage2', 'boss', 'entry', 'ending'].includes(n)) {
    const first = leads.slice(0, 16).map((x) => name(x.m)).join(' ');
    console.log('  opening: ' + first);
  }
}
// ---------------------------------------------------------------------------------------------------------------
// wave-2 structure checks
const leadOf = (n) => AUDIO._dump(n).lead.slice().sort((a, b) => a.s - b.s);
const ivs = (L) => L.slice(1).map((x, i) => x.m - L[i].m);
console.log('\nstructure:');
for (const n of ['stage1', 'stage2']) {
  const info = AUDIO._info(n), L = leadOf(n);
  const bars = new Map();
  for (let b = 0; b < info.bars; b++) {
    const key = L.filter((x) => x.s >= b * 16 && x.s < b * 16 + 16).map((x) => (x.s - b * 16) + ':' + x.m + ':' + x.n).join(' ');
    bars.set(key, (bars.get(key) || 0) + 1);
  }
  console.log(`  ${n}: ${info.bars} bars, ${info.loopSeconds.toFixed(1)} s, ${bars.size} distinct lead bars, key lift ${info.lift} st`);
  if (info.bars < 40) err(n + ': fewer than 40 bars');
  if (bars.size < 30) err(n + ': only ' + bars.size + ' distinct lead bars (want >= 30)');
  if (!info.lift) err(n + ': no loop-pass key lift configured');
  const hi = Math.max(...L.map((x) => x.m)) + (info.lift || 0);
  if (hi > 96) warn(n + ': lead + lift reaches ' + name(hi));
}
// title vs stage1: identical 8-interval windows
{
  const w = (n) => { const iv = ivs(leadOf(n)), set = new Set(); for (let i = 0; i + 8 <= iv.length; i++) set.add(iv.slice(i, i + 8).join(',')); return set; };
  const a = w('stage1'), b = w('title'); let shared = 0; for (const k of b) if (a.has(k)) shared++;
  console.log(`  title / stage1 share ${shared} identical 8-interval windows (was 72)`);
  if (shared > 12) err('title and stage1 share ' + shared + ' identical 8-interval windows (want <= 12)');
}
// jingles: clear_boss in E major (Picardy), different opening shape from start / title fanfare
{
  const cb = AUDIO._dump('clear_boss'), L = leadOf('clear_boss'), last = L[L.length - 1], lastChord = cb.chords[cb.chords.length - 1];
  const isMajor = lastChord.ints[1] === 4;
  console.log(`  clear_boss: key pc ${cb.key} (E = 4), final chord ${lastChord.name}, last note ${name(last.m)}, opening intervals ${ivs(L).slice(0, 5).join(' ')}`);
  if (cb.key !== 4 || !isMajor || lastChord.root !== 4 || last.m % 12 !== 4) err('clear_boss must resolve to the E major tonic');
  const open = (n) => ivs(leadOf(n)).slice(0, 4).join(' ');
  for (const o of ['start', 'title']) if (open(o) === open('clear_boss')) err('clear_boss opens with the same intervals as ' + o);
  const ti = AUDIO._dump('title').lead.slice().sort((a, b) => a.s - b.s).slice(0, 7).map((x) => x.m);
  if (ti.join() === [79, 79, 83, 83, 86, 86, 91].join()) err('title fanfare is still the G-G-B-B-D-D-G triad of the old version');
}
// bass register + boss riff
for (const n of AUDIO.trackNames()) {
  const bn = AUDIO._dump(n).notes.filter((x) => x.v === 'bass');
  if (bn.length && Math.min(...bn.map((x) => x.m)) < 43) err(n + ': bass note below G2 (' + name(Math.min(...bn.map((x) => x.m))) + ')');
}
{
  const iv = ivs(leadOf('boss')), sig = [0, 3, 4, -2, -2]; let found = 0;
  for (let i = 0; i + 5 <= iv.length; i++) if (sig.every((v, k) => iv[i + k] === v)) found++;
  if (found) err('boss lead still contains the Tetris-A outline (0 3 4 -2 -2) x' + found);
}
if (process.argv.includes('--full')) {
  for (const n of ['title', 'stage1', 'stage2', 'boss', 'entry', 'ending', 'start', 'extend', 'gameover', 'clear_boss']) {
    const d = AUDIO._dump(n);
    console.log('\n' + n + ' (' + d.bpm + ' bpm)');
    for (const s of d.sections) {
      console.log('  section ' + s.name);
      for (let b = 0; b < Math.ceil(s.steps / 16); b++) {
        const s0 = s.start + b * 16, s1 = Math.min(s0 + 16, s.start + s.steps);
        const ch = d.chords.filter((c) => c.s >= s0 && c.s < s1).map((c) => c.name).join('.');
        console.log('    ' + String(b + 1).padStart(2) + '  ' + ch.padEnd(10) + d.lead.filter((x) => x.s >= s0 && x.s < s1).sort((x, y) => x.s - y.s).map((x) => name(x.m) + '/' + x.n).join(' '));
      }
    }
  }
}
console.log(`\nlint done: ${errors} error(s), ${warns} warning(s)`);
process.exit(errors ? 1 : 0);
