// FIZZ & POP — test/audio_stems.mjs   (composer tool, v2.0 soundtrack)
// Per-lane STEM report of a track: every lane is rendered alone (all other lanes skipped, no glue compressor) through AUDIO._renderOffline in real Chromium and
// measured K-weighted (ITU-R BS.1770, test/audio_dsp.mjs) per SECTION, next to the full mix.  Shows what carries each section, whether the hook (melody lanes) sits
// above the bed, and how the loudness arc is built.  Columns are sections of intro + one loop cycle.
// Usage: node test/audio_stems.mjs <track> [--tempo 1.3] [--lanes a,b,c] [--csv file] [--mixonly] [--bars]
//   --mixonly  render only the full mix (one render, ~5 s): section arc.     --bars   also print the loudness of the full mix bar by bar (builds, breakdowns)
//   Values are LUFS of that lane's stem in that section (-70 = tacet).  `mix` rows: the full arrangement; `lead-bed` = best melody stem minus the rest of the mix.
import fs from 'fs';
import path from 'path';
import { launch, PROJECT } from '../tools/harness.mjs';
import { DSP_SRC } from './audio_dsp.mjs';

const args = process.argv.slice(2);
const argVal = (k) => (args.indexOf(k) >= 0 ? args[args.indexOf(k) + 1] : null);
const name = args.find((a) => !a.startsWith('--') && a !== argVal('--tempo') && a !== argVal('--lanes') && a !== argVal('--csv'));
const MIXONLY = args.includes('--mixonly'), BARS = args.includes('--bars');
if (!name) { console.error('usage: node test/audio_stems.mjs <track> [--tempo x] [--lanes a,b]'); process.exit(2); }
const tempo = argVal('--tempo') ? +argVal('--tempo') : undefined;
const only = argVal('--lanes') ? argVal('--lanes').split(',') : null;

const t = await launch({ html: path.join(PROJECT, 'test', 'audio_page.html') });
await t.page.addScriptTag({ content: DSP_SRC });
const out = await t.page.evaluate(async ({ n, tempo, only, MIXONLY, BARS }) => {
  const info = AUDIO._info(n), dd = AUDIO._dump(n), d = __dsp;
  const total = info.kind === 'loop' ? info.introSeconds + info.loopSeconds + 0.5 : info.seconds + 2.5;
  const beat = 60 / (dd.bpm * (tempo || 1));
  const fr = (st) => [dd.swing / 2, dd.swing / 2, (1 - dd.swing) / 2, (1 - dd.swing) / 2][st & 3];
  const tAt = new Float64Array(dd.steps + 1); for (let q = 0; q < dd.steps; q++) tAt[q + 1] = tAt[q] + beat * fr(q);
  const secs = dd.sections.map((x) => ({ name: x.name, a: tAt[x.start], b: tAt[x.start + x.steps], bars: x.steps / 16 }));
  const names = dd.lanes.map((l) => l.name);
  const groups = [['mix', []], ...(MIXONLY ? [] : names.filter((l) => !only || only.includes(l)).map((l) => [l, names.filter((x) => x !== l)]))];
  let bars = null, bandRows = null;
  const rows = [];
  for (const [lane, skip] of groups) {
    const res = await AUDIO._renderOffline(n, total, { skip, tempo, noComp: lane !== 'mix', pass: 0 });
    const sr = res.sampleRate;
    const per = secs.map((s) => {
      const r = d.lufs(d.slice(res, Math.round(s.a * sr), Math.round(Math.min(total, s.b) * sr)), sr);
      return Number.isFinite(r.lufs) ? r.lufs : -70;
    });
    rows.push({ lane, per, peak: d.stats(res).peak });
    if (lane === 'mix') bandRows = secs.map((x) => d.bands({ sampleRate: sr, channels: d.slice(res, Math.round(x.a * sr), Math.round(Math.min(total, x.b) * sr)) }));
    if (lane === 'mix' && BARS) {                      // loudness of every bar of the (intro + loop) timeline, K-weighted
      bars = [];
      const nb = Math.floor(dd.steps / 16);
      for (let b = 0; b < nb; b++) {
        const r = d.lufs(d.slice(res, Math.round(tAt[b * 16] * sr), Math.round(Math.min(total, tAt[b * 16 + 16]) * sr)), sr);
        bars.push(Number.isFinite(r.lufs) ? r.lufs : -70);
      }
    }
  }
  return { secs, rows, bpm: dd.bpm, bars, bandRows };
}, { n: name, tempo, only, MIXONLY, BARS });
const pad = (s, w) => String(s).padEnd(w);
console.log(`${name}: stems per section (LUFS, K-weighted)${tempo ? ' at tempo ' + tempo : ''}`);
console.log(pad('lane', 10) + out.secs.map((s) => pad(s.name + '(' + s.bars + ')', 9)).join(''));
for (const r of out.rows) console.log(pad(r.lane, 10) + r.per.map((v) => pad(v <= -69 ? '-' : v.toFixed(1), 9)).join('') + '  peak ' + r.peak.toFixed(2));
const mix = out.rows[0].per;
const lead = out.rows.filter((r) => /^(lead|twang|alarm|bell|vibes)/.test(r.lane));
if (lead.length) console.log(pad('best melody', 10) + out.secs.map((_, i) => pad(Math.max(...lead.map((r) => r.per[i])) <= -69 ? '-' : (Math.max(...lead.map((r) => r.per[i])) - mix[i]).toFixed(1), 9)).join('') + '  (dB relative to the mix of the section)');
const arc = mix.filter((v) => v > -69);
if (out.bandRows) console.log(pad('bands %', 10) + out.bandRows.map((b) => pad(b.map((v) => Math.round(100 * v)).join('/'), 11)).join('') + '  (magnitude share: <90 / <250 / <1k / <4k / >4k Hz)');
if (out.bars) { console.log('per bar (LUFS):'); for (let i = 0; i < out.bars.length; i += 16) console.log('  ' + String(i + 1).padStart(3) + ': ' + out.bars.slice(i, i + 16).map((v) => v.toFixed(0).padStart(4)).join('')); }
console.log('arc spread: ' + (Math.max(...arc) - Math.min(...arc)).toFixed(1) + ' dB');
if (argVal('--csv')) fs.writeFileSync(argVal('--csv'), ['lane,' + out.secs.map((s) => s.name).join(','), ...out.rows.map((r) => r.lane + ',' + r.per.map((v) => v.toFixed(1)).join(','))].join('\n'));
if (t.errors.length) console.log('console errors: ' + t.errors.join(' | '));
await t.close();
