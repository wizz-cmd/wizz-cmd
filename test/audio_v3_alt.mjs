// FIZZ & POP — test/audio_v3_alt.mjs   (FIXPLAN_V3 A8: the SECOND PASS of a loop differs -- counter-melody, lead octave, fills -- with clean seams)
// Sections may carry `alt: { p, mix, dbl }` (see the header of src/20_audio.js, §3.2): the version that sounds on every odd pass of the loop.  Checks:
//   STATIC (node, no WebAudio)  every track listed in ALT has second-pass sections; the second-pass notes stay inside C2..C7 and are mostly chord tones on the strong beats; they do not
//                               form minor-2nd / tritone clashes with the concurrent original notes (counted per track); the first pass (pass 0) is the unchanged original (no odd-only event is
//                               ever scheduled on pass 0); peak simultaneous sources of both passes <= 70
//   RENDER (Chromium offline)   intro + loop pass 0 + loop pass 1 + 8 s of pass 2 with the pass counter running (opts.alternate): finite, no clipping, true peak <= -1 dBFS, loudness of pass 1 within
//                               1.5 dB of pass 0, the alt sections really sound different between the passes (some octave band changes by >= 1.4 dB) while the sections without alt stay the same (median
//                               band change <= 1.3 dB; the tails of a neighbouring alt section are allowed), and both pass boundaries (0 -> 1 and 1 -> 2) are click-free with a level jump <= 6 dB
// Usage: node test/audio_v3_alt.mjs [--quick] [--only stage1,boss] [--src file.js]      (--quick: static checks only)
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { launch, PROJECT } from '../tools/harness.mjs';
import { DSP_SRC } from './audio_dsp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), QUICK = args.includes('--quick');
const only = args.indexOf('--only') >= 0 ? args[args.indexOf('--only') + 1].split(',') : null;
const SRC = args.includes('--src') ? path.resolve(args[args.indexOf('--src') + 1]) : path.join(ROOT, 'src', '20_audio.js');
const sandbox = { console, setTimeout, setInterval, clearInterval, performance };
vm.createContext(sandbox);
vm.runInContext([path.join(ROOT, 'src', '00_shared.js'), SRC].map((f) => fs.readFileSync(f, 'utf8')).join('\n') + '\n;globalThis.AUDIO = AUDIO;', sandbox);
const AUDIO = sandbox.AUDIO;

// which sections must have a second-pass version (the long-play tracks first; the one-off ending / jingles have none)
const ALT = { stage1: ['V', 'B1', 'D1', 'D2'], stage2: ['A', 'C', 'V2', 'D2'], boss: ['A', 'B', 'F'], title: ['A', 'B'], entry: ['E'] };
let fails = 0, n = 0;
const check = (name, ok, detail) => { n++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  ' + JSON.stringify(detail) : '')); };
const NN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'], nm = (m) => NN[m % 12] + (Math.floor(m / 12) - 1);
const tracks = Object.keys(ALT).filter((t) => !only || only.includes(t));

console.log('--- STATIC');
for (const t of tracks) {
  const info = AUDIO._info(t), d = AUDIO._dump(t), got = info.altSections.map((a) => a.name);
  check(`${t}: second-pass sections ${ALT[t].join(' ')} present (found ${got.join(' ') || 'none'})`, ALT[t].every((s) => got.indexOf(s) >= 0), got);
  check(`${t}: every second-pass version really differs from the original (odd/even event counts: ${info.altSections.map((a) => a.name + ' +' + a.odd + '/-' + a.even).join(' ')})`, info.altSections.every((a) => a.odd + a.even > 0), info.altSections);
  // pass 0 never schedules an odd-only event; pass 1 never an even-only one
  const e0 = AUDIO._events(t, 0), e1 = AUDIO._events(t, 1);
  check(`${t}: pass 0 = original only (no odd-only event), pass 1 = original + second pass`, e0.every((e) => e.o !== 1) && e1.every((e) => e.o !== 0) && e1.some((e) => e.o === 1) && e0.length > 0, { e0: e0.length, e1: e1.length });
  check(`${t}: no issue from the compiler, peak simultaneous sources (both passes) ${info.peakSources} <= 70`, d.issues.length === 0 && info.peakSources <= 70, d.issues);
  const alt = d.altNotes || [], BASSY = /^(bass|sub|riff)/, bad = alt.filter((x) => (BASSY.test(x.v) ? x.m < 28 : x.m < 36) || x.m > 96);
  check(`${t}: ${alt.length} second-pass notes inside C2..C7 (bass lanes >= E1)`, alt.length > 0 && bad.length === 0, bad.slice(0, 5).map((x) => nm(x.m) + '@' + x.s));
  // strong-beat chord tones of the second-pass melodic notes
  const chordAt = (s) => d.chords.find((c) => s >= c.s && s < c.s + c.n);
  const mel = alt.filter((x) => ['lead', 'bell', 'twang', 'vibes', 'alarm'].some((p) => x.v.indexOf(p) === 0));
  let strong = 0, tone = 0;
  for (const x of mel) if (x.s % 4 === 0) { const c = chordAt(x.s); if (!c) continue; strong++; if (c.ints.some((i) => (c.root + i) % 12 === x.m % 12)) tone++; }
  const pct = strong ? Math.round(100 * tone / strong) : 100;
  check(`${t}: second-pass melody notes on strong beats are chord tones (${pct}% of ${strong})`, pct >= 60, pct);
  // vertical clashes: a second-pass MELODIC note (lead / bell / twang / vibes / alarm) against the concurrent ORIGINAL melodic notes of another lane (minor 2nd / minor 9th / tritone)
  const MEL = /^(lead|bell|twang|vibes|alarm)/, by = new Map();
  for (const x of d.notes) if (MEL.test(x.v)) for (let k = 0; k < x.n; k++) { const l = by.get(x.s + k) || []; l.push(x); by.set(x.s + k, l); }
  const clash = new Set();
  for (const a of alt) if (MEL.test(a.v)) for (let k = 0; k < a.n; k++) for (const b of by.get(a.s + k) || []) {
    if (b.v === a.v) continue;
    const dv = Math.abs(a.m - b.m), ic = dv % 12;
    if ((ic === 1 || ic === 11 || ic === 6) && dv < 30) clash.add(a.s + ':' + a.v + nm(a.m) + '/' + b.v + nm(b.m));
  }
  check(`${t}: second-pass melodic notes do not clash (m2 / tritone) with the original melody (found ${clash.size} steps)`, clash.size === 0, [...clash].slice(0, 10));
}

if (!QUICK) {
  console.log('--- RENDER (offline, pass counter running)');
  const t = await launch({ html: path.join(PROJECT, 'test', 'audio_page.html') });
  await t.page.addScriptTag({ content: DSP_SRC });
  for (const name of tracks) {
    const r = await t.page.evaluate(async (name) => {
      const d = __dsp, info = AUDIO._info(name), dd = AUDIO._dump(name), sr = 24000, beat = 60 / dd.bpm;
      const total = info.introSeconds + 2 * info.loopSeconds + 8;
      const res = await AUDIO._renderOffline(name, total, { alternate: true });
      const ms = AUDIO._renderOffline.lastMs;
      const tAt = new Float64Array(dd.steps + 1); for (let q = 0; q < dd.steps; q++) tAt[q + 1] = tAt[q] + beat * [dd.swing / 2, dd.swing / 2, (1 - dd.swing) / 2, (1 - dd.swing) / 2][q & 3];
      const c0 = info.introSeconds, c1 = c0 + info.loopSeconds, c2 = c1 + info.loopSeconds;
      const slice = (a, b) => d.slice(res, Math.round(a * sr), Math.round(b * sr));
      // band difference between pass 0 (cycle 1) and pass 1 (cycle 2): averaged power spectrum of 2 s chunks in 7 octave bands, the largest band difference per chunk
      const N = 4096, EDGES = [90, 180, 355, 710, 1400, 2800, 5600, 11000], x = res.channels[0], off = Math.round(info.loopSeconds * sr);
      const bandsAt = (a) => {
        const acc = new Float64Array(EDGES.length - 1); let cnt = 0;
        for (let i = a; i + N <= Math.min(x.length, a + 2 * sr); i += N / 2) {
          const re = new Float64Array(N), im = new Float64Array(N);
          for (let k = 0; k < N; k++) re[k] = x[i + k] * (0.5 - 0.5 * Math.cos(2 * Math.PI * k / (N - 1)));
          for (let k = 1, j = 0; k < N; k++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (k < j) { let tt = re[k]; re[k] = re[j]; re[j] = tt; tt = im[k]; im[k] = im[j]; im[j] = tt; } }
          for (let len = 2; len <= N; len <<= 1) { const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang); for (let i2 = 0; i2 < N; i2 += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const ur = re[i2 + k], ui = im[i2 + k], vr = re[i2 + k + len / 2] * cr - im[i2 + k + len / 2] * ci, vi = re[i2 + k + len / 2] * ci + im[i2 + k + len / 2] * cr; re[i2 + k] = ur + vr; im[i2 + k] = ui + vi; re[i2 + k + len / 2] = ur - vr; im[i2 + k + len / 2] = ui - vi; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } } }
          for (let b = 1; b < N / 2; b++) { const f = b * sr / N; for (let e = 0; e < EDGES.length - 1; e++) if (f >= EDGES[e] && f < EDGES[e + 1]) { acc[e] += re[b] * re[b] + im[b] * im[b]; break; } }
          cnt++;
        }
        return Array.from(acc, (v) => 10 * Math.log10(v / Math.max(1, cnt) + 1e-9));
      };
      const secs = dd.sections.filter((s) => s.start >= dd.loopStart).map((s) => {
        const a = tAt[s.start] - tAt[dd.loopStart], b = tAt[s.start + s.steps] - tAt[dd.loopStart], diffs = [];
        for (let tt = a; tt + 2 <= b + 0.01; tt += 2) { const A = Math.round((c0 + tt) * sr), bx = bandsAt(A), by = bandsAt(A + off); diffs.push(Math.max(...bx.map((v, i) => Math.abs(v - by[i])))); }
        diffs.sort((p, q) => p - q);
        return { name: s.name, med: diffs[Math.floor(diffs.length / 2)], max: diffs[diffs.length - 1] };
      });
      const st = d.stats(res), tp = d.truePeak(res.channels);
      const L0 = d.lufs(slice(c0, c1), sr).lufs, L1 = d.lufs(slice(c1, c2), sr).lufs, w = Math.round(Math.min(info.loopSeconds, 4) * sr);
      const s01 = d.seam(res, Math.round(c1 * sr), w), s12 = d.seam(res, Math.round(c2 * sr), w);
      let base = null;                                                // a seam that is a big level jump by composition (the entry ballad) is compared with the same seam of a locked-pass render
      if (Math.abs(s01.levelJumpDb) > 5 || Math.abs(s12.levelJumpDb) > 5) { const r0 = await AUDIO._renderOffline(name, info.introSeconds + 2 * info.loopSeconds + 2, {}); const b0 = d.seam(r0, Math.round(c1 * sr), w); base = { jump: b0.levelJumpDb, click: b0.clickRatio }; }
      return { secs, nan: st.nan, clipped: st.clipped, tp: 20 * Math.log10(tp), L0, L1, s01: { jump: s01.levelJumpDb, click: s01.clickRatio }, s12: { jump: s12.levelJumpDb, click: s12.clickRatio }, base, ms };
    }, name);
    const altNames = new Set(AUDIO._info(name).altSections.map((a) => a.name)), f = (v) => v.toFixed(1);
    console.log(`  ${name}: LUFS pass 0 ${f(r.L0)} / pass 1 ${f(r.L1)}, seams 0->1 jump ${f(r.s01.jump)} dB click x${r.s01.click.toFixed(2)}, 1->2 jump ${f(r.s12.jump)} dB click x${r.s12.click.toFixed(2)}${r.base ? ' (locked-pass seam: jump ' + f(r.base.jump) + ' dB)' : ''}; spectral difference pass 1 vs pass 0 (largest octave-band change in dB; median / max over 2 s chunks): ${r.secs.map((s) => s.name + (altNames.has(s.name) ? '*' : '') + ' ' + f(s.med) + '/' + f(s.max)).join('  ')}  (${(r.ms / 1000).toFixed(0)} s render)`);
    check(`${name}: finite, no clipping, true peak ${f(r.tp)} dBFS <= -1 over intro + two passes`, !r.nan && r.clipped === 0 && r.tp <= -0.95, r);
    check(`${name}: pass 1 loudness within 1.5 dB of pass 0 (${(r.L1 - r.L0).toFixed(2)} dB)`, Math.abs(r.L1 - r.L0) <= 1.5, [r.L0, r.L1]);
    check(`${name}: every second-pass section is audibly different (an octave band changes by >= 1.4 dB somewhere: ${r.secs.filter((s) => altNames.has(s.name)).map((s) => s.name + ' ' + f(s.max)).join(' ')})`, r.secs.filter((s) => altNames.has(s.name)).every((s) => s.max >= 1.4), r.secs);
    check(`${name}: sections without a second-pass version stay the same (median band change <= 1.3 dB)`, r.secs.filter((s) => !altNames.has(s.name)).every((s) => s.med <= 1.3), r.secs.filter((s) => !altNames.has(s.name)));
    const ref = r.base ? r.base.jump : 0, cap = r.base ? 3 : 6;
    check(`${name}: pass boundaries 0 -> 1 and 1 -> 2 are clean (level jump within ${cap} dB of ${r.base ? 'the locked-pass seam' : 'zero'}, click ratio <= 3)`, Math.abs(r.s01.jump - ref) <= cap && Math.abs(r.s12.jump - ref) <= cap && r.s01.click <= 3 && r.s12.click <= 3, [r.s01, r.s12, r.base]);
  }
  check('zero console errors, scheduler fault counter 0', t.errors.length === 0 && (await t.page.evaluate(() => AUDIO._state().faults)) === 0, t.errors);
  await t.close();
}
console.log(`\n${n - fails}/${n} checks passed`);
process.exit(fails ? 1 : 0);
