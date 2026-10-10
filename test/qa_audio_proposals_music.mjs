// QA (audio lens) -- VERIFY proposed compositional fixes WITHOUT touching src/: patched copy of 20_audio.js compiled in a vm,
// then validated (bar arithmetic), linted (chord tones / clashes / cross-track reuse / famous-window screen) and compared.
//   node test/qa_audio_proposals_music.mjs
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out', 'qa', 'audio', 'patched');
fs.mkdirSync(OUT, { recursive: true });
let a = fs.readFileSync(path.join(ROOT, 'src', '20_audio.js'), 'utf8');
const sub = (from, to) => { if (!a.includes(from)) throw new Error('patch anchor missing: ' + from.slice(0, 60)); a = a.replace(from, to); };

// ---- P1: stage1 gets a real bridge section C (8 new bars, 3-3-2 syncopation, rests, sparse drums) -> 40 bars / 64 s ----------------
sub(`    const S1A3 = Object.assign({}, S1A, {`, `    const S1C = {
      chords: '| Em | Bm | C | G | Em | Bm | Am7 | D |',
      lead: \`| e6/3 e6/3 d6/2 b5/3 g5/3 b5/2
             | d6/3 d6/3 b5/2 f#5/6 r/2
             | e6/3 e6/3 d6/2 c6/3 g5/3 c6/2
             | d6/3 d6/3 b5/2 g5/6 r/2
             | g6/4 e6/4 b5/4 e6/4
             | f#6/4 d6/4 b5/4 d6/4
             | e6/2 c6/2 a5/2 c6/2 e6/4 g6/4
             | a5/2 d6/2 f#6/2 a6/2 f#6/4 d6/4\`,
      harm: { arp: 'tender', gate: 0.8 },
      bass: 'half half half half half half bnc bnc',
      drums: 'g1d g1d g1d g1d g1c g1c g1c g1f',
      cfg: { lead: { vib: [5.6, 18, 0.1] } },
    };
    const S1A3 = Object.assign({}, S1A, {`);
sub(`sections: { A: S1A, A2: S1A2, B: S1B, A3: S1A3 },
      order: ['A', 'A2', 'B', 'A3'],`, `sections: { A: S1A, A2: S1A2, B: S1B, C: S1C, A3: S1A3 },
      order: ['A', 'A2', 'B', 'C', 'A3'],`);

// ---- P2: boss riff: avoid the exact Tetris-A outline (0 3 4 -2 -2) in bar 1 of A ---------------------------------------------------
sub(`lead: \`| e5/1 e5/1 e5/1 g5/1 b5/4 a5/1 g5/1 e5/1 g5/1 b5/4
             | e5/1 e5/1 e5/1 g5/1 b5/2 e6/2 d6/1 b5/1 a5/1 b5/1 g5/4`, `lead: \`| e5/1 e5/1 e5/1 g5/1 b5/4 d6/1 b5/1 g5/1 b5/1 e6/4
             | e5/1 e5/1 e5/1 g5/1 b5/2 e6/2 d6/1 b5/1 a5/1 b5/1 g5/4`);

// ---- P3: title: new, slower hook in bars 1-4 of T1 (no longer the stage1 hook) -----------------------------------------------------
sub(`    const T1 = {
      chords: '| G | Em | C | D | G | Em | C | D |',
      lead: \`| r/2 b5/2 d6/2 g6/3 f#6/1 e6/2 d6/2 b5/2
             | r/2 g5/2 b5/2 e6/3 d6/1 b5/2 g5/2 b5/2
             | r/2 e5/2 g5/2 c6/3 b5/1 g5/2 e5/2 g5/2
             | f#5/2 a5/2 d6/4 c6/2 a5/2 f#5/4`, `    const T1 = {
      chords: '| G | Em | C | D | G | Em | C | D |',
      lead: \`| g5/4 b5/4 d6/6 b5/2
             | e6/4 d6/4 b5/6 g5/2
             | c6/4 b5/4 g5/4 e5/4
             | f#5/2 a5/2 d6/4 f#6/4 e6/2 d6/2`);

// ---- P4: clear_boss: the E-minor boss resolves to E MAJOR (Picardy) -- new key + contour, 2 bars --------------------------------------
sub(`    D.clear_boss = {
      kind: 'jingle', bpm: 156, swing: 0.5, echo: 3, key: 7, mode: [0, 2, 4, 5, 7, 9, 11], gain: 1,
      sections: { J: {
        chords: '| G | C.G |',
        lead: \`| g5/2 b5/2 d6/2 g6/2 b6/2 g6/2 d6/2 b5/2
               | c6/2 e6/2 g6/2 e6/2 d6/2 g6/6\``, `    D.clear_boss = {
      kind: 'jingle', bpm: 156, swing: 0.5, echo: 3, key: 4, mode: [0, 2, 4, 5, 7, 9, 11], gain: 1,
      sections: { J: {
        chords: '| E | A/4.E/12 |',
        lead: \`| b5/2 e6/2 g#6/2 b6/4 g#6/2 e6/4
               | a5/2 c#6/2 g#6/2 b6/2 e6/8\``);
fs.writeFileSync(path.join(OUT, '20_audio.proposed.js'), a);

function load(srcText) {
  const src = [fs.readFileSync(path.join(ROOT, 'src', '00_shared.js'), 'utf8'), srcText].join('\n');
  const sandbox = { console, setTimeout, setInterval, clearInterval, performance };
  vm.createContext(sandbox);
  vm.runInContext(src + '\n;globalThis.AUDIO = AUDIO;', sandbox);
  return sandbox.AUDIO;
}
const orig = load(fs.readFileSync(path.join(ROOT, 'src', '20_audio.js'), 'utf8'));
const prop = load(a);
console.log('validate() original:', JSON.stringify(orig._validate()), ' proposed:', JSON.stringify(prop._validate()));

const NN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const nm = (m) => NN[m % 12] + (Math.floor(m / 12) - 1);
function analyse(A, n) {
  const d = A._dump(n), info = A._info(n);
  const chordAt = (s) => d.chords.find((c) => s >= c.s && s < c.s + c.n);
  let strong = 0, ct = 0; const bad = [];
  for (const x of d.lead) { const c = chordAt(x.s); if (!c) continue; const rel = ((x.m - c.root) % 12 + 12) % 12; if (x.s % 8 === 0 || x.n >= 4) { strong++; if (c.ints.includes(rel)) ct++; else bad.push(`${Math.floor(x.s / 16) + 1}.${x.s % 16} ${c.name} ${nm(x.m)}`); } }
  const sc = new Set(d.mode.map((x) => (d.key + x) % 12)); const chrom = d.lead.filter((x) => !sc.has(x.m % 12)).length;
  // lead coverage
  const sounding = new Array(info.steps).fill(false); for (const x of d.lead) for (let k = 0; k < x.n; k++) sounding[x.s + k] = true;
  const cov = sounding.slice(info.loopStart).filter(Boolean).length / (info.steps - info.loopStart);
  const lo = Math.min(...d.lead.map((x) => x.m)), hi = Math.max(...d.lead.map((x) => x.m));
  return { bars: info.bars, sec: +info.loopSeconds.toFixed(1), strongCT: +(100 * ct / strong).toFixed(0), nonCT: bad.join('; ') || '-', chromatic: chrom, coverage: +(100 * cov).toFixed(0), range: nm(lo) + '..' + nm(hi) };
}
for (const n of ['stage1', 'title', 'boss', 'clear_boss']) {
  console.log(`\n${n}\n  original:`, JSON.stringify(analyse(orig, n)), '\n  proposed:', JSON.stringify(analyse(prop, n)));
}
// vertical clashes (m2/M7 between sounding voices) per track, same method as qa_audio_score
function clashes(A, n) {
  const d = A._dump(n); const sound = new Array(d.steps).fill(0).map(() => ({ lead: [], harm: [], bass: [] }));
  for (const e of d.notes) if (sound[e.s]) for (let k = 0; k < Math.max(1, Math.round(e.n * 0.9)); k++) if (e.s + k < d.steps && e.v in sound[0]) sound[e.s + k][e.v].push(e.m);
  let c = 0; for (const vs of sound) for (const [X, Y] of [['lead', 'harm'], ['lead', 'bass'], ['harm', 'bass']]) for (const p of vs[X]) for (const q of vs[Y]) { const ic = Math.abs(p - q) % 12; if ((ic === 1 || ic === 11) && Math.abs(p - q) <= 30) c++; }
  return c;
}
console.log('\nm2/M7 step-pairs  stage1', clashes(orig, 'stage1'), '->', clashes(prop, 'stage1'), '  title', clashes(orig, 'title'), '->', clashes(prop, 'title'), '  boss', clashes(orig, 'boss'), '->', clashes(prop, 'boss'), '  clear_boss', clashes(orig, 'clear_boss'), '->', clashes(prop, 'clear_boss'));
// cross-track reuse
const iv = (A, n) => { const m = A._dump(n).lead.slice().sort((x, y) => x.s - y.s).map((x) => x.m); return m.slice(1).map((x, i) => x - m[i]); };
const reuse = (A, n1, n2) => { const a1 = iv(A, n1), b1 = iv(A, n2), key = (arr, i) => arr.slice(i, i + 8).join(','); const set = new Set(); for (let j = 0; j + 8 <= b1.length; j++) set.add(key(b1, j)); let c = 0; for (let i = 0; i + 8 <= a1.length; i++) if (new Set(a1.slice(i, i + 8)).size > 2 && set.has(key(a1, i))) c++; return c; };
console.log('stage1<->title shared 8-interval windows: original', reuse(orig, 'stage1', 'title'), '-> proposed', reuse(prop, 'stage1', 'title'));
const jing = ['start', 'extend', 'clear_boss'];
const first = (A, n) => iv(A, n).slice(0, 5).join(' ');
console.log('jingle first 5 intervals  original:', jing.map((n) => n + ': ' + first(orig, n)).join(' | '));
console.log('jingle first 5 intervals  proposed:', jing.map((n) => n + ': ' + first(prop, n)).join(' | '));
// Tetris outline check on boss
const T = [0, 3, 4, -2, -2]; const has = (A, n) => { const m = iv(A, n); for (let i = 0; i + 5 <= m.length; i++) if (T.every((v, k) => m[i + k] === v)) return i; return -1; };
console.log('boss lead contains the Tetris-A outline (0 3 4 -2 -2):  original at interval #' + has(orig, 'boss') + '  proposed at #' + has(prop, 'boss'));
fs.writeFileSync(path.join(OUT, 'stage1_C_scoredump.txt'), JSON.stringify(prop._dump('stage1').lead.filter((x) => x.s >= 384 && x.s < 512), null, 0));
