// QA v2 / lens "audio" -- hook / melody statistics + self-similarity across tracks (originality is checked against the soundtrack itself; no external scores offline).
// For every melody lane: pitch range, share of repeated notes / steps / leaps, rhythmic variety, number of distinct 4-note interval n-grams, and the 5-interval n-grams
// shared between DIFFERENT tracks.  Also the chord progression (roman-numeral skeleton) of every section so identical skeletons across tracks show up.
import fs from 'fs';
import path from 'path';
import { launch, PROJECT } from '../tools/harness.mjs';
const t = await launch({ html: path.join(PROJECT, 'test/audio_page.html') });
const tracks = ['title', 'stage1', 'stage2', 'boss', 'entry', 'ending', 'start', 'extend', 'gameover', 'clear_boss'];
const all = {};
for (const n of tracks) all[n] = await t.page.evaluate((n) => { const d = AUDIO._dump(n); return { bpm: d.bpm, key: d.key, mode: d.mode, chords: d.chords, notes: d.notes.filter((x) => ['lead', 'twang', 'alarm', 'vibes', 'bell'].includes(x.v)), sections: d.sections, loopStart: d.loopStart }; }, n);
const NN = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const nn = (m) => NN[m % 12] + (Math.floor(m / 12) - 1);
const ROM = ['I', 'bII', 'II', 'bIII', 'III', 'IV', '#IV', 'V', 'bVI', 'VI', 'bVII', 'VII'];
const out = {};
const grams = {};
for (const n of tracks) {
  const d = all[n];
  // roman skeleton per section (one symbol per chord, repeats collapsed)
  const secs = d.sections.map((s) => {
    const cs = d.chords.filter((c) => c.s >= s.start && c.s < s.start + s.steps);
    const seq = []; for (const c of cs) { const q = /m(?!aj)/.test(c.name.replace(/^[A-G][#b]?/, '')) ? 'm' : ''; const sym = ROM[((c.root - d.key) % 12 + 12) % 12] + q; if (seq[seq.length - 1] !== sym) seq.push(sym); }
    return s.name + ': ' + seq.join(' ');
  });
  const lanes = {};
  for (const v of ['lead', 'twang', 'alarm', 'vibes', 'bell']) {
    const ns = d.notes.filter((x) => x.v === v).sort((a, b) => a.s - b.s);
    if (ns.length < 4) continue;
    const iv = []; for (let i = 1; i < ns.length; i++) iv.push(ns[i].m - ns[i - 1].m);
    const rep = iv.filter((x) => x === 0).length / iv.length, step = iv.filter((x) => Math.abs(x) >= 1 && Math.abs(x) <= 2).length / iv.length, leap = iv.filter((x) => Math.abs(x) >= 5).length / iv.length;
    const durs = new Set(ns.map((x) => x.n));
    const g4 = new Set(); for (let i = 0; i + 4 <= iv.length; i++) g4.add(iv.slice(i, i + 4).join(','));
    const g5 = []; for (let i = 0; i + 5 <= iv.length; i++) g5.push(iv.slice(i, i + 5).join(','));
    (grams[n] = grams[n] || {})[v] = new Set(g5);
    lanes[v] = { notes: ns.length, range: nn(Math.min(...ns.map((x) => x.m))) + '-' + nn(Math.max(...ns.map((x) => x.m))), repeatedPct: Math.round(100 * rep), stepPct: Math.round(100 * step), leapPct: Math.round(100 * leap), distinctDurations: durs.size, distinct4grams: g4.size, of4grams: Math.max(0, iv.length - 3) };
  }
  out[n] = { secs, lanes };
}
// shared 5-interval n-grams between different tracks (ignoring the all-zero / trivial ones)
const shared = [];
for (let i = 0; i < tracks.length; i++) for (let j = i + 1; j < tracks.length; j++) {
  const A = new Set(), B = new Set();
  for (const v of Object.values(grams[tracks[i]] || {})) for (const g of v) if (!/^(0,){4}0$/.test(g)) A.add(g);
  for (const v of Object.values(grams[tracks[j]] || {})) for (const g of v) if (!/^(0,){4}0$/.test(g)) B.add(g);
  const common = [...A].filter((g) => B.has(g));
  if (common.length) shared.push({ a: tracks[i], b: tracks[j], count: common.length, of: Math.min(A.size, B.size), examples: common.slice(0, 4) });
}
fs.writeFileSync(path.join(PROJECT, 'out/qa_v2/audio/hooks.json'), JSON.stringify({ out, shared }, null, 1));
for (const n of tracks) {
  console.log('\n== ' + n);
  for (const s of out[n].secs) console.log('   ' + s);
  for (const [v, l] of Object.entries(out[n].lanes)) console.log(`   ${v.padEnd(6)} ${String(l.notes).padStart(4)} notes ${l.range.padEnd(8)} repeated ${l.repeatedPct}%  stepwise ${l.stepPct}%  leaps>=P4 ${l.leapPct}%  durations ${l.distinctDurations}  distinct 4-grams ${l.distinct4grams}/${l.of4grams}`);
}
console.log('\nshared 5-interval n-grams between tracks:');
for (const s of shared.sort((a, b) => b.count - a.count)) console.log(`  ${s.a} <-> ${s.b}: ${s.count} (of ${s.of})  e.g. ${s.examples.join(' | ')}`);
await t.close();
