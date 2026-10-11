// QA v2 / lens "audio" -- per-LANE stems per SECTION, full-range AND through a phone-speaker model (4th-order 300 Hz high-pass).
// Every lane is rendered alone (no glue compressor, like test/audio_stems.mjs); the mix row is the real full mix (with glue).
// Output: LUFS of the stem per section (full / phone) + 'phone retention' = phone LUFS - full LUFS (0 = nothing lost, -20 = inaudible on a phone).
// Usage: node test/qa_v2_audio_stemphone.mjs <track> [--tempo 1.3] [--lanes a,b]  -> out/qa_v2/audio/stemphone_<track>.json
import fs from 'fs';
import path from 'path';
import { launch, PROJECT } from '../tools/harness.mjs';
import { DSP_SRC } from './audio_dsp.mjs';
const args = process.argv.slice(2);
const val = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const tempo = +val('--tempo', 1), only = val('--lanes', null);
const name = args[0];
const OUT = path.join(PROJECT, 'out/qa_v2/audio'); fs.mkdirSync(OUT, { recursive: true });
const t = await launch({ html: path.join(PROJECT, 'test/audio_page.html') });
await t.page.addScriptTag({ content: DSP_SRC });
const r = await t.page.evaluate(async ({ n, tempo, only }) => {
  const d = __dsp, info = AUDIO._info(n), dd = AUDIO._dump(n);
  const total = (info.kind === 'loop' ? info.introSeconds + info.loopSeconds : info.seconds) / tempo + 0.6;
  const beat = 60 / (dd.bpm * tempo);
  const fr = (st) => [dd.swing / 2, dd.swing / 2, (1 - dd.swing) / 2, (1 - dd.swing) / 2][st & 3];
  const tAt = new Float64Array(dd.steps + 1); for (let q = 0; q < dd.steps; q++) tAt[q + 1] = tAt[q] + beat * fr(q);
  const secs = dd.sections.map((x) => ({ name: x.name, a: tAt[x.start], b: tAt[x.start + x.steps], bars: x.steps / 16 }));
  const names = dd.lanes.map((l) => l.name);
  const groups = [['mix', []], ...names.filter((l) => !only || only.split(',').includes(l)).map((l) => [l, names.filter((x) => x !== l)])];
  const rows = [];
  for (const [lane, skip] of groups) {
    const res = await AUDIO._renderOffline(n, total, { skip, tempo: tempo === 1 ? undefined : tempo, noComp: lane !== 'mix' });
    const sr = res.sampleRate;
    const per = secs.map((s) => {
      const sl = d.slice(res, Math.round(s.a * sr), Math.round(Math.min(total, s.b) * sr));
      const L = d.lufs(sl, sr), ph = d.phone(sl, sr), Lp = d.lufs(ph.chs, sr);
      return { f: Number.isFinite(L.lufs) ? L.lufs : -70, p: Number.isFinite(Lp.lufs) ? Lp.lufs : -70 };
    });
    rows.push({ lane, per });
  }
  return { secs, rows, inst: Object.fromEntries(dd.lanes.map((l) => [l.name, l.inst])) };
}, { n: name, tempo, only });
fs.writeFileSync(path.join(OUT, `stemphone_${name}${tempo !== 1 ? '_t' + tempo : ''}.json`), JSON.stringify(r, null, 1));
const pad = (s, w) => String(s).padEnd(w), f1 = (x) => (x <= -69 ? '-' : x.toFixed(1));
console.log(`${name}: stems per section, LUFS full / phone (300 Hz HP)  [stem alone, no glue]`);
console.log(pad('lane(inst)', 16) + r.secs.map((s) => pad(s.name + '(' + s.bars + ')', 14)).join(''));
for (const row of r.rows) console.log(pad(row.lane + (r.inst[row.lane] ? '(' + r.inst[row.lane] + ')' : ''), 16) + row.per.map((p) => pad(f1(p.f) + '/' + f1(p.p), 14)).join(''));
const mix = r.rows[0].per;
console.log('--- bass-lane phone level relative to the PHONE mix (dB; > -12 reads, < -20 is gone):');
for (const row of r.rows.slice(1)) if (['sub', 'riff', 'bass', 'kick'].includes(row.lane)) console.log(pad(row.lane, 16) + row.per.map((p, i) => pad(p.p <= -69 ? '-' : (p.p - mix[i].p).toFixed(1), 14)).join(''));
console.log('--- melody stems relative to the full mix (dB), full / phone:');
for (const row of r.rows.slice(1)) if (['lead', 'twang', 'alarm', 'bell', 'vibes'].includes(row.lane)) console.log(pad(row.lane, 16) + row.per.map((p, i) => pad(p.f <= -69 ? '-' : (p.f - mix[i].f).toFixed(1) + '/' + (p.p - mix[i].p).toFixed(1), 14)).join(''));
if (t.errors.length) console.log('ERRORS', t.errors);
await t.close();
