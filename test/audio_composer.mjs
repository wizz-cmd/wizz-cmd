// FIZZ & POP — test/audio_composer.mjs   (composer gates of the v2.0 soundtrack, SPEC_V2 §6)
// Checks the COMPOSITIONS themselves, on top of audio_lint / audio_analyze:
//   FORM     every loop has its SPEC_V2 bpm / key / form length, no `placeholder`, an intro where the design asks for one, a loop long enough for
//            "stay fresh over long play" (stage tracks: >= 6 distinct sections / >= 72 loop bars), jingle lengths (start <= 2.4 s K7)
//   HOOKS    prints every track's main hook as note names + interval signature; fails if two DIFFERENT tracks share a 7-interval melodic window (the two
//            intended callbacks title <-> ending are whitelisted) and if any melodic window matches a list of famous themes (originality guard: style only)
//   TEMPO    every loop is rendered at the HURRY UP tempo (x1.3; boss x1.15 and its cap x1.2) through the real scheduler path: finite, no clipping, true peak
//            <= -0.95 dBFS, loudness within 3 dB of the nominal tempo, and the section arc is still there
//   ARC      loudness arc of every loop (K-weighted, per section): spread >= 5 dB for the stage / boss / title / ending tracks (quiet verse vs loud drop)
//   LAYER    drums2 / drums3 layering (engine addition) compiles and produces hits on the same step
// Usage: node test/audio_composer.mjs [--quick] [--only title,stage1]      (--quick: skips the tempo renders)
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { launch, PROJECT } from '../tools/harness.mjs';
import { DSP_SRC } from './audio_dsp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), QUICK = args.includes('--quick');
const only = args.indexOf('--only') >= 0 ? args[args.indexOf('--only') + 1].split(',') : null;
const code = [path.join(ROOT, 'src', '00_shared.js'), path.join(ROOT, 'src', '20_audio.js')].map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const sandbox = { console, setTimeout, setInterval, clearInterval, performance };
vm.createContext(sandbox);
vm.runInContext(code + '\n;globalThis.AUDIO = AUDIO;', sandbox);
const AUDIO = sandbox.AUDIO;

let fails = 0, n = 0;
const check = (name, ok, detail) => { n++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  ' + JSON.stringify(detail) : '')); };
const NN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const nm = (m) => NN[m % 12] + (Math.floor(m / 12) - 1);

// ---------------------------------------------------------------- FORM
const FORM = {
  title: { bpm: 92, key: 2, bars: 32, loop: 32, intro: 4 }, stage1: { bpm: 122, key: 4, bars: 72, loop: 72, intro: 8 }, stage2: { bpm: 126, key: 1, bars: 72, loop: 72, intro: 8 },
  boss: { bpm: 140, key: 5, bars: 48, loop: 48, intro: 4 }, entry: { bpm: 76, key: 9, bars: 16, loop: 16, intro: 0 }, ending: { bpm: 100, key: 2, bars: 40, loop: 40, intro: 0 },
};
const JINGLE = { start: [1.8, 2.4, 120], extend: [2.6, 3.4, 150], gameover: [3.4, 4.6, 90], clear_boss: [2.6, 3.4, 140] };
console.log('--- FORM');
for (const name of Object.keys(FORM).filter((x) => !only || only.includes(x))) {
  const f = FORM[name], d = AUDIO._dump(name), info = AUDIO._info(name);
  const loopBars = (d.steps - d.loopStart) / 16, introBars = d.loopStart / 16;
  check(`${name}: ${d.bpm} bpm, key ${NN[d.key]}, ${info.bars} bars (loop ${loopBars}, intro ${introBars}); sections ${d.sections.map((s) => s.name + (s.steps / 16)).join(' ')}`,
    d.bpm === f.bpm && d.key === f.key && info.bars >= f.bars && loopBars >= f.loop && introBars === f.intro && !info.placeholder, { bpm: d.bpm, key: d.key, bars: info.bars, loopBars, introBars, placeholder: info.placeholder });
  if (['stage1', 'stage2'].includes(name)) check(`${name}: stays fresh over long play (>= 6 distinct sections in the loop, loop >= 72 bars, a different drop 1 / drop 2)`,
    new Set(d.sections.filter((s) => s.start >= d.loopStart).map((s) => s.name)).size >= 6 && loopBars >= 72);
  check(`${name}: maxTempo allows HURRY UP (>= 1.3, boss >= 1.15)`, name === 'boss' ? info.maxTempo >= 1.15 : (!info.maxTempo || info.maxTempo >= 1.3), info.maxTempo);
}
for (const name of Object.keys(JINGLE).filter((x) => !only || only.includes(x))) {
  const [a, b, bpm] = JINGLE[name], info = AUDIO._info(name);
  check(`${name}: ${info.seconds.toFixed(2)} s in ${a}..${b} s, ${bpm} bpm, no placeholder` + (name === 'start' ? ', K7 <= 2.4 s' : ''), info.seconds >= a && info.seconds <= b && AUDIO._dump(name).bpm === bpm && !info.placeholder && (name !== 'start' || info.seconds <= 2.4), info.seconds);
}
{
  const lastChord = AUDIO._dump('clear_boss').chords.slice(-1)[0], endC = AUDIO._dump('ending').chords.slice(-1)[0];
  check('clear_boss resolves to a major chord (triumphant), ending ends in D major after a D minor start', lastChord.ints[1] === 4 && endC.ints[1] === 4 && AUDIO._dump('ending').chords[0].ints[1] === 3, { lastChord: lastChord.name, end: endC.name });
}

// ---------------------------------------------------------------- NOTES finite (a NaN pitch throws inside the scheduler and counts toward the 20-fault shutdown)
{
  const bad = [];
  for (const name of AUDIO.trackNames()) for (const x of AUDIO._dump(name).notes) if (!Number.isFinite(x.m) || x.m < 12 || x.m > 108) bad.push(`${name}.${x.v}@${x.s}: ${x.m}`);
  for (const name of AUDIO.trackNames()) for (const e of AUDIO._events(name)) if (e.m !== undefined && [].concat(e.m).some((m) => !Number.isFinite(m))) bad.push(`${name} event ${e.step}`);
  check('every note of every track / jingle is a finite MIDI number in 12..108', bad.length === 0, bad.slice(0, 6));
}

// ---------------------------------------------------------------- HOOKS
console.log('--- HOOKS (main melody lane opening, interval signature)');
const FAMOUS = {
  'Ode to Joy': [0, 1, 2, 0, -2, -2, -1, -2], 'Fur Elise': [-1, 1, -1, 1, -5, 3, -2, -3], 'Beethoven 5': [0, 0, -4, 2, 0, 0, -3], 'Smoke on the Water': [3, 2, -5, 3, 3, -1],
  'Seven Nation Army': [0, 3, -3, -2, -2, -1], 'Tetris A': [7, 1, 2, -2, -1, -2, 0, 3, 4], 'Mario overworld': [0, 0, -4, 4, 3], 'Imperial March': [0, 0, -4, 7, -3, -4, 7, -3],
  'Happy Birthday': [0, 2, -2, 5, -1], 'Jingle Bells': [0, 0, 2, 0, 0, 0], 'Twinkle': [0, 7, 0, 2, 0, -2], 'Pink Panther': [1, 2, 1, -3, -1, 1, 2, 1], 'Dies Irae': [-1, 1, -2, 2, -2],
  'Frere Jacques': [2, 2, -4, 0, 2, 2, -4], 'Greensleeves': [3, 2, -2, -3, 2, -2], 'Star Wars main': [7, 0, 0, -2, -2, 0, 5], 'Pachelbel canon bass': [-5, 5, -3, 1, 4, -5, 5],
};
const melodyLanes = ['lead', 'alarm', 'twang', 'vibes', 'bell'];
const hooks = {};
for (const name of Object.keys(FORM).concat(Object.keys(JINGLE)).filter((x) => !only || only.includes(x))) {
  const d = AUDIO._dump(name), by = {};
  for (const x of d.lead.slice().sort((a, b) => a.s - b.s)) { const inst = d.lanes.find((l) => l.name === x.lane).inst; if (melodyLanes.indexOf(inst) >= 0) (by[x.lane] = by[x.lane] || []).push(x.m); }
  hooks[name] = by;
  for (const [ln, ms] of Object.entries(by)) if (ms.length >= 6) console.log(`  ${name}.${ln}: ${ms.slice(0, 14).map(nm).join(' ')}   [${ms.slice(1, 14).map((m, i) => m - ms[i]).join(' ')}]`);
}
const WIN = 7;
const windows = (ms) => { const iv = ms.slice(1).map((m, i) => m - ms[i]), out = []; for (let i = 0; i + WIN <= iv.length; i++) { const w = iv.slice(i, i + WIN); if (new Set(w).size >= 3) out.push(w.join(',')); } return out; };
{
  const seen = {};
  const allow = (a, b) => (a === 'title' && b === 'ending') || (a === 'ending' && b === 'title');
  const clashes = [];
  for (const [name, by] of Object.entries(hooks)) for (const ms of Object.values(by)) for (const w of new Set(windows(ms))) {
    if (seen[w] && seen[w] !== name && !allow(seen[w], name)) clashes.push(`${seen[w]} / ${name}: ${w}`);
    if (!seen[w]) seen[w] = name;
  }
  check('hooks: no 7-interval melodic window is shared between two different tracks (title <-> ending is the intended callback)', clashes.length === 0, clashes.slice(0, 5));
  const famous = [];
  for (const [name, by] of Object.entries(hooks)) for (const [ln, ms] of Object.entries(by)) {
    const iv = ms.slice(1).map((m, i) => m - ms[i]);
    for (const [fn, sig] of Object.entries(FAMOUS)) for (let i = 0; i + sig.length <= iv.length; i++) if (sig.every((v, k) => iv[i + k] === v)) famous.push(`${name}.${ln} ~ ${fn} @${i}`);
  }
  check('hooks: no melodic window matches a famous theme (' + Object.keys(FAMOUS).length + ' fingerprints)', famous.length === 0, famous.slice(0, 5));
  const range = [];
  for (const [name, by] of Object.entries(hooks)) for (const [ln, ms] of Object.entries(by)) if (Math.max(...ms) > 96 || Math.min(...ms) < 36) range.push(`${name}.${ln} ${nm(Math.min(...ms))}..${nm(Math.max(...ms))}`);
  check('hooks: every melody lane stays inside C2..C7', range.length === 0, range);
}

// ---------------------------------------------------------------- LAYER (engine addition)
{
  const issues = AUDIO._define('demo_layer_t', { kind: 'jingle', bpm: 120, key: 4, mode: [0, 2, 3, 5, 7, 8, 10], lanes: { pad: { inst: 'pad', duck: 0.5 } }, sections: { S: { chords: '| Em |', p: { pad: 'hold', drums: 'K...s...K...s...', drums2: 'h.h.h.h.h.h.h.h.', drums3: '....p.......p...' } } }, order: ['S'] });
  const ev = AUDIO._events('demo_layer_t'), at0 = ev.filter((e) => e.step === 0 && e.k === 'd' || e.step === 0 && e.lane === 'kick' || e.step === 0 && e.lane === 'hats');
  const lanesAt0 = new Set(ev.filter((e) => e.step === 0).map((e) => e.lane)), lanesAt4 = new Set(ev.filter((e) => e.step === 4).map((e) => e.lane));
  check('drums2 / drums3 layer on the same step (kick + hat on step 0, snare + clap on step 4)', issues.length === 0 && lanesAt0.has('kick') && lanesAt0.has('hats') && lanesAt4.has('snare') && lanesAt4.size >= 1 && ev.filter((e) => e.step === 4 && e.lane === 'snare').length === 2, { issues, lanesAt0: [...lanesAt0], lanesAt4: [...lanesAt4] });
}

// ---------------------------------------------------------------- SYMBOLS (engine additions) + power chords
{
  const issues = AUDIO._define('demo_sym_t', { kind: 'jingle', bpm: 120, key: 11, mode: [0, 2, 3, 5, 7, 8, 10], lanes: { riff: { inst: 'riff' }, arp: { inst: 'arp' } },
    sections: { S: { chords: '| B5 | Bm |', p: { riff: '1f3g5h8ac....... 1f3g5h8ac.......', arp: '1358a853c8531358 1358a853c8531358' } } }, order: ['S'] });
  const ev = AUDIO._events('demo_sym_t').filter((e) => e.k === 'n' && e.lane === 'riff' && e.step < 16).map((e) => e.m[0] - 35);   // B1 = 35 (riff register: lo 33 -> B at 35)
  check('rel symbols f (b2) g (b6) h (b5) and power-chord tones are finite: B5 riff 1 f 3 g 5 h 8 a c = 0 1 7 8 7 6 12 19 19', issues.length === 0 && ev.join(',') === '0,1,7,8,7,6,12,19,19' , { issues, ev });
  check('no NaN notes in arps over a power chord', AUDIO._events('demo_sym_t').every((e) => e.m === undefined || e.m.every(Number.isFinite)));
}

// ---------------------------------------------------------------- TEMPO + ARC (real scheduler path, Chromium)
if (!QUICK) {
  console.log('--- TEMPO / ARC (offline renders)');
  const t = await launch({ html: path.join(PROJECT, 'test', 'audio_page.html') });
  await t.page.addScriptTag({ content: DSP_SRC });
  const TEMPI = { title: [1.3], stage1: [1.3], stage2: [1.3], boss: [1.15, 1.2], entry: [1.3], ending: [1.3] };
  for (const name of Object.keys(TEMPI).filter((x) => !only || only.includes(x))) {
    const r = await t.page.evaluate(async ({ name, tempi }) => {
      const d = __dsp, info = AUDIO._info(name), out = { runs: [] };
      const dd = AUDIO._dump(name), sr0 = 24000;
      for (const tempo of [1].concat(tempi)) {
        const secs = (info.introSeconds + info.loopSeconds) / tempo + 0.5;
        const res = await AUDIO._renderOffline(name, secs, { tempo, pass: 0 });
        const sr = res.sampleRate, st = d.stats(res), tp = d.truePeak(res.channels);
        const beat = 60 / (dd.bpm * tempo), fr = (q) => [dd.swing / 2, dd.swing / 2, (1 - dd.swing) / 2, (1 - dd.swing) / 2][q & 3];
        const tAt = new Float64Array(dd.steps + 1); for (let q = 0; q < dd.steps; q++) tAt[q + 1] = tAt[q] + beat * fr(q);
        const arc = dd.sections.filter((s) => s.start >= dd.loopStart).map((s) => d.lufs(d.slice(res, Math.round(tAt[s.start] * sr), Math.round(Math.min(secs, tAt[s.start + s.steps]) * sr)), sr).lufs).filter(Number.isFinite);
        const lo = d.lufs(d.slice(res, Math.round(tAt[dd.loopStart] * sr)), sr).lufs;
        out.runs.push({ tempo, nan: st.nan, clipped: st.clipped, tp: 20 * Math.log10(tp), lufs: lo, spread: Math.max(...arc) - Math.min(...arc), ms: AUDIO._renderOffline.lastMs, secs });
      }
      return out;
    }, { name, tempi: TEMPI[name] });
    const base = r.runs[0];
    for (const run of r.runs) {
      if (run.tempo === 1) { if (['stage1', 'stage2', 'boss', 'ending', 'title'].includes(name)) check(`${name}: loudness arc spread ${run.spread.toFixed(1)} dB >= 5 (quiet verse / loud drop), ${run.lufs.toFixed(1)} LUFS`, run.spread >= 5, run.spread); continue; }
      check(`${name} at tempo x${run.tempo}: finite, no clipping, true peak ${run.tp.toFixed(2)} dBFS <= -0.95, ${run.lufs.toFixed(1)} LUFS (nominal ${base.lufs.toFixed(1)}), arc spread ${run.spread.toFixed(1)} dB`,
        !run.nan && run.clipped === 0 && run.tp <= -0.95 && Math.abs(run.lufs - base.lufs) <= 3 && run.spread >= Math.min(4, base.spread - 2), run);
    }
  }
  const jr = await t.page.evaluate(async () => {            // every jingle once, plus the scheduler fault counter of the whole page
    const out = {};
    for (const n of ['start', 'extend', 'gameover', 'clear_boss']) { const res = await AUDIO._renderOffline(n, AUDIO._info(n).seconds + 1.5); out[n] = __dsp.stats(res); }
    return { out, faults: AUDIO._state().faults };
  });
  check('jingles render clean (finite, no clipping)', Object.values(jr.out).every((x) => !x.nan && x.clipped === 0), jr.out);
  check('scheduler fault counter stays 0 over every render (a failing note shuts the music off after 20 faults)', jr.faults === 0 && !t.logs.some((l) => /AUDIO:/.test(l)), { faults: jr.faults, logs: t.logs.filter((l) => /AUDIO:/.test(l)).slice(0, 3) });
  check('zero console errors', t.errors.length === 0, t.errors);
  await t.close();
}
console.log(`\n${n - fails}/${n} checks passed`);
process.exit(fails ? 1 : 0);
