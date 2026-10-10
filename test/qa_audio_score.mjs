// QA (audio lens) -- score reconstruction + composition analysis.  Node only (vm sandbox), reads src/20_audio.js.
// Writes out/qa/audio/score.txt and prints the analysis tables.
//   node test/qa_audio_score.mjs
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out', 'qa', 'audio');
fs.mkdirSync(OUT, { recursive: true });
let src = ['00_shared.js', '20_audio.js'].map((f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8')).join('\n');
src = src.replace('return { init, ready, music: playMusic', 'globalThis.__I = { songDefs, DRUMS, BASS, ARP, VOICE, QUAL, getProg, thirdBelow, BASS_LO, ARP_LO, rootMidi }; return { init, ready, music: playMusic');
const sandbox = { console, setTimeout, setInterval, clearInterval, performance };
vm.createContext(sandbox);
vm.runInContext(src + '\n;globalThis.AUDIO = AUDIO;', sandbox);
const { AUDIO, __I: I } = sandbox;

const NN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const nm = (m) => NN[m % 12] + (Math.floor(m / 12) - 1);
const lines = [];
const P = (s = '') => { lines.push(s); };
const names = ['stage1', 'stage2', 'boss', 'title', 'entry', 'ending', 'start', 'extend', 'gameover', 'clear_boss'];
const out = {};

for (const n of names) {
  const d = AUDIO._dump(n), info = AUDIO._info(n), def = I.songDefs()[n];
  P(`\n=================== ${n}  [${d.kind}] ${d.bpm} bpm swing ${d.swing}  key pc ${d.key}  ${info.bars} bars ${info.seconds.toFixed(1)} s (loop ${info.loopSeconds.toFixed(1)} s)`);
  const chordAt = (s) => d.chords.find((c) => s >= c.s && s < c.s + c.n);
  for (const sec of d.sections) {
    const sd = def.sections[sec.name];
    P(`--- section ${sec.name} steps ${sec.start}..${sec.start + sec.steps}  bass:${sd.bass}  arp:${sd.harm && (sd.harm.arp || (sd.harm.thirds ? 'THIRDS' : ''))}  drums:${sd.drums}`);
    for (let b = 0; b < sec.steps / 16; b++) {
      const s0 = sec.start + b * 16;
      const cs = d.chords.filter((c) => c.s >= s0 && c.s < s0 + 16).map((c) => c.name).join('.');
      const ls = d.lead.filter((x) => x.s >= s0 && x.s < s0 + 16).map((x) => nm(x.m) + '/' + x.n).join(' ');
      P(`  bar ${String(b + 1).padStart(2)}  ${cs.padEnd(9)} ${ls}`);
    }
  }
}
fs.writeFileSync(path.join(OUT, 'score.txt'), lines.join('\n'));

// ---------------------------------------------------------------- diversity / repetition analysis
function barsOf(n) {
  const d = AUDIO._dump(n), bars = [];
  const total = d.steps / 16;
  for (let b = 0; b < total; b++) {
    const s0 = b * 16, notes = d.lead.filter((x) => x.s >= s0 && x.s < s0 + 16);
    bars.push({ pitch: notes.map((x) => x.m).join(','), rhythm: notes.map((x) => (x.s - s0) + ':' + x.n).join(','), notes });
  }
  return bars;
}
console.log('\n#### melodic bar diversity (lead only)');
const stats = {};
for (const n of ['stage1', 'stage2', 'boss', 'title', 'entry', 'ending']) {
  const bars = barsOf(n);
  const info = AUDIO._info(n);
  const loopBars = bars.slice(info.loopStart / 16);
  const uniqP = new Set(loopBars.map((b) => b.pitch)).size;
  const uniqR = new Set(loopBars.map((b) => b.rhythm)).size;
  // fraction of loop bars whose pitch sequence appears elsewhere in the loop (exact)
  const cnt = {}; loopBars.forEach((b) => { cnt[b.pitch] = (cnt[b.pitch] || 0) + 1; });
  const dup = loopBars.filter((b) => cnt[b.pitch] > 1).length;
  // near-duplicate: >=75% of notes identical (same step+pitch) with another bar
  let near = 0;
  loopBars.forEach((b, i) => {
    const sa = new Set(b.notes.map((x) => (x.s % 16) + '@' + x.m));
    let best = 0;
    loopBars.forEach((c, j) => { if (i === j) return; const sb = new Set(c.notes.map((x) => (x.s % 16) + '@' + x.m)); let k = 0; sa.forEach((v) => { if (sb.has(v)) k++; }); best = Math.max(best, k / Math.max(1, sa.size)); });
    if (best >= 0.75) near++;
  });
  // rhythm density per bar (notes) and unique-time budget: 'effective unique bars'
  stats[n] = { bars: loopBars.length, uniquePitchBars: uniqP, uniqueRhythmBars: uniqR, exactDupBars: dup, nearDupBars: near, loopSec: +info.loopSeconds.toFixed(1) };
  console.log(n.padEnd(8), JSON.stringify(stats[n]));
}

// ---------------------------------------------------------------- section similarity
console.log('\n#### section-to-section lead similarity (shared step@pitch / notes)');
for (const n of ['stage1', 'stage2', 'boss', 'title', 'ending']) {
  const d = AUDIO._dump(n);
  const secs = d.sections.filter((s) => s.steps > 0);
  const set = (s) => new Set(d.lead.filter((x) => x.s >= s.start && x.s < s.start + s.steps).map((x) => (x.s - s.start) + '@' + x.m));
  const row = [];
  for (let i = 0; i < secs.length; i++) for (let j = i + 1; j < secs.length; j++) {
    if (secs[i].steps !== secs[j].steps) continue;
    const a = set(secs[i]), b = set(secs[j]); let k = 0; a.forEach((v) => { if (b.has(v)) k++; });
    row.push(`${secs[i].name}~${secs[j].name} ${(100 * k / Math.max(a.size, b.size)).toFixed(0)}%`);
  }
  console.log(n.padEnd(8), row.join('  '));
}

// ---------------------------------------------------------------- harmonic check: all voices vs chord, + vertical dissonance
const DISS = { 1: 1, 2: 0.25, 6: 0.55, 10: 0.2, 11: 1 };      // interval class weight (m2 / M7 harsh, tritone medium)
console.log('\n#### vertical dissonance (lead x harm x bass, sounding together, weighted by overlap steps)');
for (const n of ['stage1', 'stage2', 'boss', 'title', 'entry', 'ending']) {
  const d = AUDIO._dump(n);
  const gateOf = { lead: 0.92, harm: 0.55, bass: 0.88 };
  const evs = d.notes.filter((e) => e.v === 'lead' || e.v === 'harm' || e.v === 'bass');
  // per step list of sounding notes per voice (use written length*gate)
  const sound = new Array(d.steps).fill(0).map(() => ({ lead: [], harm: [], bass: [] }));
  for (const e of evs) for (let k = 0; k < Math.max(1, Math.round(e.n * 0.9)); k++) if (e.s + k < d.steps) sound[e.s + k][e.v].push(e.m);
  const worst = [];
  let total = 0, harsh = 0;
  const chordAt = (s) => d.chords.find((c) => s >= c.s && s < c.s + c.n);
  const perBar = new Array(d.steps / 16).fill(0);
  const detail = [];
  for (let s = 0; s < d.steps; s++) {
    const vs = sound[s];
    const pairs = [['lead', 'harm'], ['lead', 'bass'], ['harm', 'bass']];
    for (const [A, B] of pairs) for (const a of vs[A]) for (const b of vs[B]) {
      const ic = Math.abs(a - b) % 12, ic2 = Math.min(ic, 12 - ic);
      const cls = ic2;
      const w = DISS[cls] !== undefined && (cls !== 10) ? DISS[cls] : (cls === 2 ? 0.25 : 0);
      // only count if the interval is actually "close" enough to beat: within 2 octaves (low-register m2/M2 are muddy)
      const span = Math.abs(a - b);
      if (w > 0 && span <= 30) {
        const lowMud = Math.min(a, b) < 48 && (cls === 1 || cls === 2) ? 1.5 : 1;
        perBar[Math.floor(s / 16)] += w * lowMud;
        total += 1; if (cls === 1 || cls === 11) harsh += 1;
        if (cls === 1 || cls === 11) detail.push({ s, bar: Math.floor(s / 16) + 1, chord: (chordAt(s) || {}).name, A, B, a: nm(a), b: nm(b), cls });
      }
    }
  }
  // collapse detail
  const key = {};
  detail.forEach((x) => { const k = `${x.bar}:${x.chord}:${x.A}-${x.B}:${x.a}-${x.b}`; key[k] = (key[k] || 0) + 1; });
  const top = Object.entries(key).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const worstBars = perBar.map((v, i) => [i + 1, +v.toFixed(1)]).sort((a, b) => b[1] - a[1]).slice(0, 4);
  console.log(`${n.padEnd(8)} m2/M7 step-pairs: ${harsh}   worst bars (bar,score): ${JSON.stringify(worstBars)}`);
  console.log('         top m2/M7 clashes (bar:chord:voices:notes -> steps):', top.map(([k, v]) => k + '->' + v).join(' | '));
}

// ---------------------------------------------------------------- lead vs chord: non-chord tones on strong beats / long notes
console.log('\n#### lead vs chord (strong = step%8==0 or length>=4)');
const PCN = { 0: 'R', 1: 'b9', 2: '9', 3: 'b3', 4: '3', 5: '11', 6: '#11/b5', 7: '5', 8: 'b13', 9: '13/6', 10: 'b7', 11: '7' };
for (const n of ['stage1', 'stage2', 'boss', 'title', 'entry', 'ending']) {
  const d = AUDIO._dump(n);
  const chordAt = (s) => d.chords.find((c) => s >= c.s && s < c.s + c.n);
  const bad = [];
  let strong = 0, ct = 0;
  for (const x of d.lead) {
    const c = chordAt(x.s); if (!c) continue;
    const rel = ((x.m - c.root) % 12 + 12) % 12;
    const inChord = c.ints.includes(rel);
    const isStrong = x.s % 8 === 0 || x.n >= 4;
    if (isStrong) { strong++; if (inChord) ct++; else bad.push(`bar${Math.floor(x.s / 16) + 1}.${x.s % 16} ${c.name} ${nm(x.m)}/${x.n}=${PCN[rel]}`); }
  }
  console.log(`${n.padEnd(8)} strong notes ${strong}, chord tones ${(100 * ct / strong).toFixed(0)}%   non-chord strong: ${bad.join('; ') || '-'}`);
}

// ---------------------------------------------------------------- bass register
console.log('\n#### bass register (phone speakers roll off < ~150 Hz)');
const f = (m) => 440 * Math.pow(2, (m - 69) / 12);
for (const n of names) {
  const d = AUDIO._dump(n);
  const b = d.notes.filter((e) => e.v === 'bass');
  if (!b.length) continue;
  const ms = b.map((e) => e.m);
  const below = (hz) => (100 * ms.filter((m) => f(m) < hz).length / ms.length).toFixed(0);
  console.log(`${n.padEnd(10)} bass notes ${ms.length}  range ${nm(Math.min(...ms))} (${f(Math.min(...ms)).toFixed(0)} Hz) .. ${nm(Math.max(...ms))} (${f(Math.max(...ms)).toFixed(0)} Hz)   <82 Hz: ${below(82)}%   <100 Hz: ${below(100)}%  <150 Hz: ${below(150)}%`);
}

// ---------------------------------------------------------------- hook interval signatures
console.log('\n#### hook interval signatures (semitone steps of first 14 lead notes; Parsons)');
const PAR = (a) => a.slice(1).map((x, i) => (x > a[i] ? 'U' : x < a[i] ? 'D' : 'R')).join('');
for (const n of names) {
  const d = AUDIO._dump(n);
  const L = d.lead.slice().sort((a, b) => a.s - b.s);
  const ms = L.slice(0, 14).map((x) => x.m);
  console.log(n.padEnd(10), ms.slice(1).map((x, i) => x - ms[i]).join(' ').padEnd(48), PAR(ms));
}
fs.writeFileSync(path.join(OUT, 'score_stats.json'), JSON.stringify(stats, null, 1));
console.log('\nwrote', path.join(OUT, 'score.txt'));
