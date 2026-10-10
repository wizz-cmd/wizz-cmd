// QA (audio lens) -- originality screen.  Compares every compiled lead melody (all notes, sliding windows) with a list of famous
// tunes written as semitone-interval sequences from memory.  Flags (a) exact interval-window matches >= 5 intervals and
// (b) contour (Parsons) + rhythm-agnostic matches >= 9 notes with <= 1 semitone interval deviation per interval.
// NOTE: the Bubble Bobble main theme cannot be reproduced reliably from memory, so it is NOT in the list; see the QA report.
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = ['00_shared.js', '20_audio.js'].map((f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8')).join('\n');
const sandbox = { console, setTimeout, setInterval, clearInterval, performance };
vm.createContext(sandbox);
vm.runInContext(src + '\n;globalThis.AUDIO = AUDIO;', sandbox);
const { AUDIO } = sandbox;
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midi = (s) => s.trim().split(/\s+/).map((t) => { const m = /^([A-G])([#b]?)(\d)$/.exec(t); return 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); });
const FAMOUS = {
  'Ode to Joy': 'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4 D4 D4',
  'Twinkle Twinkle': 'C4 C4 G4 G4 A4 A4 G4 F4 F4 E4 E4 D4 D4 C4',
  'Frere Jacques': 'C4 D4 E4 C4 C4 D4 E4 C4 E4 F4 G4 E4 F4 G4',
  'Happy Birthday': 'G4 G4 A4 G4 C5 B4 G4 G4 A4 G4 D5 C5',
  'Mario overworld': 'E5 E5 E5 C5 E5 G5 G4 C5 G4 E4 A4 B4 Bb4 A4',
  'Tetris (Korobeiniki)': 'E5 B4 C5 D5 C5 B4 A4 A4 C5 E5 D5 C5 B4 C5 D5 E5 C5 A4 A4',
  'Fur Elise': 'E5 D#5 E5 D#5 E5 B4 D5 C5 A4 C4 E4 A4 B4',
  'Beethoven 5th': 'G4 G4 G4 Eb4 F4 F4 F4 D4',
  'Jingle Bells': 'E4 E4 E4 E4 E4 E4 E4 G4 C4 D4 E4 F4 F4 F4 F4 F4 E4 E4 E4 E4 D4 D4 E4 D4 G4',
  'Canon in D': 'F#5 E5 D5 C#5 B4 A4 B4 C#5 D5 C#5 B4 A4 G4 F#4 G4 E4',
  'Imperial March': 'G4 G4 G4 Eb4 Bb4 G4 Eb4 Bb4 G4',
  'Star Wars main': 'G4 G4 G4 C5 G5 F5 E5 D5 C6 G5 F5 E5 D5 C6 G5',
  'Nokia tune': 'E5 D5 F#4 G#4 C#5 B4 D4 E4 B4 A4 C#4 E4 A4',
  'Pachelbel/Greensleeves-ish (Greensleeves)': 'A4 C5 D5 E5 F5 E5 D5 B4 G4 A4 B4 C5 A4 A4 G#4 A4 B4 G#4 E4',
  'When the Saints': 'C4 E4 F4 G4 C4 E4 F4 G4 C4 E4 F4 G4 E4 C4 E4 D4',
  'Hall of the Mountain King': 'B3 C#4 D4 E4 F#4 D4 F#4 F4 C#4 F4 B3 C#4 D4 E4 F#4 D4 F#4 B4 A#4 F#4 D4 F#4 A#4',
  'Seven Nation Army': 'E4 E4 G4 E4 D4 C4 B3',
  'Axel F': 'F4 Ab4 F4 F4 Bb4 F4 Eb4 F4 C5 F4 F4 Db5 C5 Ab4 F4 C5 F5',
  'Popcorn': 'G4 F4 G4 D4 Bb3 D4 G3 G4 F4 G4 D4 Bb3 D4 G3 G4 A4 Bb4 A4 Bb4 G4 A4 G4 A4 F4 G4 F4 G4 E4 G4',
  'Pac-Man intro': 'B4 B5 F#5 D#5 B5 F#5 D#5 C5 C6 G5 E5 C6 G5 E5',
  'Super Mario underground': 'C4 C5 A3 A4 Bb3 Bb4',
  'Over the Rainbow': 'C4 C5 B4 G4 A4 B4 C5 C4 A4 G4',
  'La Cucaracha': 'C4 C4 C4 F4 A4 F4 C4 C4 C4 F4 A4 F4',
  'Yankee Doodle': 'C4 C4 D4 E4 C4 E4 D4 G3 C4 C4 D4 E4 C4 B3',
  'Hot Cross Buns': 'E4 D4 C4 E4 D4 C4 C4 C4 C4 C4 D4 D4 D4 D4 E4 D4 C4',
  'Hallelujah (Handel)': 'D5 D5 D5 D5 D5 D5 D5 D5 C#5 D5 E5 F#5 D5',
  'William Tell finale': 'C5 C5 C5 G4 C5 C5 C5 G4 C5 C5 C5 G4 C5 E5 G5 E5 C5',
  'Ride of the Valkyries': 'D4 D4 D4 G4 G4 G4 G4 D5 D5 B4 G4 D5 D5',
};
const iv = (a) => a.slice(1).map((x, i) => x - a[i]);
const sig = (a) => iv(a);
const names = ['stage1', 'stage2', 'boss', 'title', 'entry', 'ending', 'start', 'extend', 'gameover', 'clear_boss'];
let hits = 0;
for (const n of names) {
  const L = AUDIO._dump(n).lead.slice().sort((a, b) => a.s - b.s).map((x) => x.m);
  const mi = iv(L);
  for (const [fn, str] of Object.entries(FAMOUS)) {
    const fi = iv(midi(str));
    // (a) exact interval windows (>=5 intervals)
    for (let w = Math.min(fi.length, 12); w >= 5; w--) {
      let found = false;
      for (let i = 0; i + w <= fi.length && !found; i++) {
        for (let j = 0; j + w <= mi.length; j++) {
          let ok = true; for (let k = 0; k < w; k++) if (mi[j + k] !== fi[i + k]) { ok = false; break; }
          if (ok) { console.log(`MATCH exact ${w} intervals: ${n} lead note #${j} == ${fn} interval #${i}   (${mi.slice(j, j + w).join(' ')})`); hits++; found = true; break; }
        }
      }
      if (found) break;
    }
    // (b) fuzzy: every interval within +-1 semitone for >= 9 consecutive intervals AND not just repeated notes
    const W = 9;
    for (let i = 0; i + W <= fi.length; i++) {
      if (new Set(fi.slice(i, i + W)).size < 3) continue;
      for (let j = 0; j + W <= mi.length; j++) {
        let ok = true; for (let k = 0; k < W; k++) if (Math.abs(mi[j + k] - fi[i + k]) > 1) { ok = false; break; }
        if (ok) { console.log(`fuzzy(+-1) ${W} intervals: ${n} lead #${j} ~ ${fn} #${i}   ours ${mi.slice(j, j + W).join(' ')}  theirs ${fi.slice(i, i + W).join(' ')}`); hits++; break; }
      }
    }
  }
}
console.log(hits ? `${hits} suspicious window(s) above` : 'no exact (>=5 intervals) or fuzzy (>=9 intervals) matches against the reference list');
// self-reuse across tracks: shared 8-note interval windows between different tracks
console.log('\ncross-track reuse (identical 8-interval windows shared between different tracks):');
const lead = {}; for (const n of names) lead[n] = iv(AUDIO._dump(n).lead.slice().sort((a, b) => a.s - b.s).map((x) => x.m));
const key = (a, i) => a.slice(i, i + 8).join(',');
for (let a = 0; a < names.length; a++) for (let b = a + 1; b < names.length; b++) {
  const A = lead[names[a]], B = lead[names[b]]; const setB = new Set(); for (let j = 0; j + 8 <= B.length; j++) setB.add(key(B, j));
  let c = 0; for (let i = 0; i + 8 <= A.length; i++) if (new Set(A.slice(i, i + 8)).size > 2 && setB.has(key(A, i))) c++;
  if (c) console.log(`  ${names[a]} <-> ${names[b]}: ${c} shared windows (of ${A.length - 7})`);
}
