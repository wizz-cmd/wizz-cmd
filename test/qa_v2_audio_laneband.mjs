// QA v2 / lens "audio" -- how loud is one lane's energy inside a frequency band compared with everything else in that band?  (masking proxy for
// buried voices: the metallic hats, the arp, the sub on phones ...).  Renders the lane alone and the rest alone (no glue), integrates FFT power per section.
// Usage: node test/qa_v2_audio_laneband.mjs <track> <lane> <loHz> <hiHz> [tempo]
import fs from 'fs';
import path from 'path';
import { launch, PROJECT } from '../tools/harness.mjs';
const [track, lane, lo, hi, tempoArg] = process.argv.slice(2);
const tempo = +(tempoArg || 1);
const SRCARG = process.env.AUDIO_SRC || null;           // QA: run against a patched copy of the audio module (never edits src/)
let pageHtml = path.join(PROJECT, 'test/audio_page.html');
if (SRCARG) { pageHtml = path.join(PROJECT, 'out/qa_v2/audio/_patched_page_' + path.basename(SRCARG) + '.html'); fs.writeFileSync(pageHtml, '<!DOCTYPE html><meta charset="utf-8"><title>p</title><script src="' + path.join(PROJECT, 'src/00_shared.js') + '"></script><script src="' + path.resolve(SRCARG) + '"></script>'); }
const t = await launch({ html: pageHtml });
const r = await t.page.evaluate(async ({ track, lane, lo, hi, tempo }) => {
  const dd = AUDIO._dump(track), info = AUDIO._info(track);
  const total = (info.introSeconds + info.loopSeconds) / tempo + 0.5, beat = 60 / (dd.bpm * tempo);
  const fr = (st) => [dd.swing / 2, dd.swing / 2, (1 - dd.swing) / 2, (1 - dd.swing) / 2][st & 3];
  const tAt = new Float64Array(dd.steps + 1); for (let q = 0; q < dd.steps; q++) tAt[q + 1] = tAt[q] + beat * fr(q);
  const names = dd.lanes.map((l) => l.name);
  const kit = ['kick', 'snare', 'hats', 'perc'];
  const A = await AUDIO._renderOffline(track, total, { skip: names.filter((x) => x !== lane), noComp: true, tempo: tempo === 1 ? undefined : tempo });
  const B = await AUDIO._renderOffline(track, total, { skip: [lane], noComp: true, tempo: tempo === 1 ? undefined : tempo });
  const sr = 24000, N = 2048;
  function band(x, a, b) {
    let acc = 0, n = 0;
    for (let p = a; p + N <= b; p += N) {
      const re = new Float64Array(N), im = new Float64Array(N);
      for (let i = 0; i < N; i++) re[i] = x[p + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
      for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let tt = re[i]; re[i] = re[j]; re[j] = tt; tt = im[i]; im[i] = im[j]; im[j] = tt; } }
      for (let len = 2; len <= N; len <<= 1) { const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
        for (let i = 0; i < N; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
          re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } } }
      for (let k = 1; k < N / 2; k++) { const f = k * sr / N; if (f >= lo && f < hi) acc += re[k] * re[k] + im[k] * im[k]; }
      n++;
    }
    return acc / Math.max(1, n);
  }
  const out = [];
  for (const s of dd.sections) {
    const a = Math.round(tAt[s.start] * sr), b = Math.min(A.channels[0].length, Math.round(tAt[s.start + s.steps] * sr));
    const ea = band(A.channels[0], a, b), eb = band(B.channels[0], a, b);
    out.push({ sec: s.name, laneVsRestDb: 10 * Math.log10((ea + 1e-18) / (eb + 1e-18)) });
  }
  return out;
}, { track, lane, lo: +lo, hi: +hi, tempo });
console.log(`${track}: ${lane} energy in ${lo}-${hi} Hz relative to the REST of the mix in the same band (dB; < -10 = buried, < -20 = inaudible)`);
console.log(r.map((x) => `${x.sec}:${x.laneVsRestDb.toFixed(1)}`).join('  '));
await t.close();
