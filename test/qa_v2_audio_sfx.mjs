// QA v2 / lens "audio" -- every SFX rendered alone through AUDIO._renderOffline: duration, onset, peak / true peak, K-weighted active level,
// loudest 100 / 400 ms, spectral centroid, octave-band shares, phone-speaker (300 Hz HP) loss.  Chain pitches for kill / pop included.
// Usage: node test/qa_v2_audio_sfx.mjs   -> out/qa_v2/audio/sfx_table.json + wav/sfx_<name>.wav (a few) + console table
import fs from 'fs';
import path from 'path';
import { launch, PROJECT } from '../tools/harness.mjs';
import { DSP_SRC } from './audio_dsp.mjs';
const OUT = path.join(PROJECT, 'out/qa_v2/audio'); fs.mkdirSync(path.join(OUT, 'wav'), { recursive: true });
const t = await launch({ html: path.join(PROJECT, 'test/audio_page.html') });
await t.page.addScriptTag({ content: DSP_SRC });
const rows = await t.page.evaluate(async () => {
  const d = __dsp, names = AUDIO.sfxNames(), out = [];
  const cases = names.map((n) => ({ n, pitch: 0 })).concat([{ n: 'kill', pitch: 6 }, { n: 'kill', pitch: 12 }, { n: 'pop', pitch: 6 }]);
  function pspec(x, N) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = i < x.length ? x[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1))) : 0;
    for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let tt = re[i]; re[i] = re[j]; re[j] = tt; tt = im[i]; im[i] = im[j]; im[j] = tt; } }
    for (let len = 2; len <= N; len <<= 1) { const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < N; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } } }
    const m = new Float64Array(N / 2); for (let b = 0; b < N / 2; b++) m[b] = re[b] * re[b] + im[b] * im[b]; return m;
  }
  const EDGES = [20, 120, 250, 500, 1000, 2000, 4000, 8000, 12000];
  for (const c of cases) {
    const res = await AUDIO._renderOffline(c.n, 3.0, { pitch: c.pitch });
    const sr = res.sampleRate, st = d.stats(res), A = d.active(res.channels, sr), tp = d.truePeak(res.channels);
    const ph = d.phone(res.channels, sr), Ap = d.active(ph.chs, sr);
    // onset: first 2 ms window above -40 dBFS
    const w = Math.floor(sr * 0.002); let onset = 0; const x = res.channels[0];
    for (let i = 0; i + w < x.length; i += w) { let s = 0; for (let k = 0; k < w; k++) s += x[i + k] * x[i + k]; if (20 * Math.log10(Math.sqrt(s / w) + 1e-9) > -40) { onset = i / sr; break; } }
    const N = 8192, m = pspec(x.subarray(Math.floor(onset * sr)), N), bands = new Float64Array(EDGES.length - 1); let tot = 0, num = 0;
    for (let b = 1; b < N / 2; b++) { const f = b * sr / N; tot += m[b]; num += m[b] * f; for (let e = 0; e < EDGES.length - 1; e++) if (f >= EDGES[e] && f < EDGES[e + 1]) { bands[e] += m[b]; break; } }
    // -30 dB duration after the peak (K-active tail)
    out.push({ n: c.n, pitch: c.pitch, onset, dur: st.effDur - onset, peak: st.peak, tp: 20 * Math.log10(tp), active: A.active, m100: A.m100, m400: A.m400, phoneActive: Ap.active, phoneLoss: A.active - Ap.active, centroid: num / Math.max(1e-18, tot), bands: Array.from(bands, (v) => v / Math.max(1e-18, tot)), info: AUDIO._info(c.n) });
  }
  return out;
});
fs.writeFileSync(path.join(OUT, 'sfx_table.json'), JSON.stringify(rows, null, 1));
const f1 = (x, dd = 1) => (Number.isFinite(x) ? x.toFixed(dd) : String(x)), pad = (s, w) => String(s).padEnd(w);
console.log(pad('sfx', 14) + pad('onset', 7) + pad('dur', 6) + pad('peak', 7) + pad('TP dB', 7) + pad('active', 8) + pad('m100', 7) + pad('m400', 7) + pad('phone', 7) + pad('loss', 6) + pad('cent', 6) + 'bands% (-120|-250|-500|-1k|-2k|-4k|-8k|-12k)');
for (const r of rows) console.log(pad(r.n + (r.pitch ? '+' + r.pitch : ''), 14) + pad(f1(r.onset * 1000, 0) + 'ms', 7) + pad(f1(r.dur, 2), 6) + pad(f1(r.peak, 2), 7) + pad(f1(r.tp), 7) + pad(f1(r.active), 8) + pad(f1(r.m100), 7) + pad(f1(r.m400), 7) + pad(f1(r.phoneActive), 7) + pad(f1(r.phoneLoss), 6) + pad(f1(r.centroid, 0), 6) + r.bands.map((v) => Math.round(v * 100)).join('|'));
if (t.errors.length) console.log('ERRORS', t.errors);
await t.close();
