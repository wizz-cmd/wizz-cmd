// QA v2 / lens "audio" -- per-SECTION measurements of the full mix of every loop (intro + loop cycle, tempo 1 or --tempo x):
//   K-weighted integrated loudness, loudest momentary (400 ms) and short-term (3 s) windows, true peak, crest, octave-band shares,
//   phone-speaker simulation (4th-order 300 Hz high-pass: loudness LOST and what is left), mono fold-down loss, stereo correlation.
// Usage: node test/qa_v2_audio_sections.mjs [--tempo 1.3] track ...   -> out/qa_v2/audio/sections_<track>[_t].json + console table
import fs from 'fs';
import path from 'path';
import { launch, PROJECT } from '../tools/harness.mjs';
import { DSP_SRC } from './audio_dsp.mjs';
const args = process.argv.slice(2);
const val = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const tempo = +val('--tempo', 1);
const names = args;
const OUT = path.join(PROJECT, 'out/qa_v2/audio'); fs.mkdirSync(OUT, { recursive: true });
const t = await launch({ html: path.join(PROJECT, 'test/audio_page.html') });
await t.page.addScriptTag({ content: DSP_SRC });
for (const name of names) {
  const r = await t.page.evaluate(async ({ name, tempo }) => {
    const d = __dsp, info = AUDIO._info(name), dd = AUDIO._dump(name);
    const total = (info.kind === 'loop' ? info.introSeconds + info.loopSeconds : info.seconds) / tempo + 0.8;
    const res = await AUDIO._renderOffline(name, total, { tempo: tempo === 1 ? undefined : tempo });
    const sr = res.sampleRate, beat = 60 / (dd.bpm * tempo);
    const fr = (st) => [dd.swing / 2, dd.swing / 2, (1 - dd.swing) / 2, (1 - dd.swing) / 2][st & 3];
    const tAt = new Float64Array(dd.steps + 1); for (let q = 0; q < dd.steps; q++) tAt[q + 1] = tAt[q] + beat * fr(q);
    const secs = dd.kind === 'jingle' ? [{ name: 'J', a: 0, b: Math.min(total, info.seconds) }] : dd.sections.map((x) => ({ name: x.name, a: tAt[x.start], b: tAt[x.start + x.steps], bars: x.steps / 16 }));
    // simple radix-2 FFT power spectrum, octave bands
    function pspec(x, a, N) {
      const re = new Float64Array(N), im = new Float64Array(N);
      for (let i = 0; i < N; i++) { const k = a + i; re[i] = k < x.length ? x[k] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1))) : 0; }
      for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let tt = re[i]; re[i] = re[j]; re[j] = tt; tt = im[i]; im[i] = im[j]; im[j] = tt; } }
      for (let len = 2; len <= N; len <<= 1) { const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
        for (let i = 0; i < N; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
          re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } } }
      const m = new Float64Array(N / 2); for (let b = 0; b < N / 2; b++) m[b] = re[b] * re[b] + im[b] * im[b]; return m;
    }
    const EDGES = [20, 60, 120, 250, 500, 1000, 2000, 4000, 8000, 12000];
    function octBands(chs, from, to) {
      const N = 4096, acc = new Float64Array(N / 2), x = chs[0].subarray(from, to);
      const n = Math.max(1, Math.min(32, Math.floor(x.length / N)));
      for (let i = 0; i < n; i++) { const m = pspec(x, Math.floor(i * Math.max(0, x.length - N) / Math.max(1, n - 1)), N); for (let b = 0; b < N / 2; b++) acc[b] += m[b]; }
      const out = new Float64Array(EDGES.length - 1); let tot = 0;
      for (let b = 1; b < N / 2; b++) { const f = b * sr / N; tot += acc[b]; for (let e = 0; e < EDGES.length - 1; e++) if (f >= EDGES[e] && f < EDGES[e + 1]) { out[e] += acc[b]; break; } }
      return Array.from(out, (v) => v / Math.max(1e-18, tot));
    }
    const out = [];
    for (const s of secs) {
      const a = Math.round(s.a * sr), b = Math.min(res.channels[0].length, Math.round(s.b * sr));
      const sl = res.channels.map((c) => c.subarray(a, b));
      const L = d.lufs(sl, sr);
      // short-term 3 s max (K-weighted)
      const z = (function () { const W = sl.map((c) => d.kWeight(c, sr)), w = Math.floor(3 * sr), hop = Math.floor(0.5 * sr); let mx = -Infinity; for (let p = 0; p + w <= W[0].length; p += hop) { let q = 0; for (const c of W) { let acc = 0; for (let i = p; i < p + w; i++) acc += c[i] * c[i]; q += acc / w; } mx = Math.max(mx, -0.691 + 10 * Math.log10(q + 1e-18)); } return mx; })();
      const ph = d.phone(sl, sr), Lp = d.lufs(ph.chs, sr);
      const mono = [new Float32Array(sl[0].length)]; for (let i = 0; i < mono[0].length; i++) mono[0][i] = 0.5 * (sl[0][i] + sl[1][i]);
      const Lm = d.lufs(mono, sr);
      let sLR = 0, sLL = 0, sRR = 0; for (let i = 0; i < sl[0].length; i += 3) { sLR += sl[0][i] * sl[1][i]; sLL += sl[0][i] * sl[0][i]; sRR += sl[1][i] * sl[1][i]; }
      const st = d.stats({ channels: sl, sampleRate: sr });
      out.push({ sec: s.name, bars: s.bars, lufs: L.lufs, mom: L.momMax, short: z, tp: 20 * Math.log10(d.truePeak(sl)), rms: st.rmsDb, crest: 20 * Math.log10(st.peak) - st.rmsDb,
        phoneLufs: Lp.lufs, phoneLoss: L.lufs - Lp.lufs, lowShare200: ph.lowShare, monoLoss: L.lufs - Lm.lufs, corr: sLR / Math.sqrt(sLL * sRR + 1e-18), bands: octBands(res.channels, a, b), centroid: d.centroid(res, s.a, Math.min(s.b, total - 0.1)) });
    }
    return { out, total, ms: AUDIO._renderOffline.lastMs };
  }, { name, tempo });
  fs.writeFileSync(path.join(OUT, `sections_${name}${tempo !== 1 ? '_t' + tempo : ''}.json`), JSON.stringify(r, null, 1));
  const f1 = (x, dd = 1) => (Number.isFinite(x) ? x.toFixed(dd) : String(x)), pad = (s, w) => String(s).padEnd(w);
  console.log(`\n== ${name} tempo ${tempo}   (LUFS=K-weighted integrated, mom/short = loudest 400 ms / 3 s, phone = 300 Hz HP x4th order)`);
  console.log(pad('sec', 5) + pad('bars', 5) + pad('LUFS', 7) + pad('mom', 7) + pad('short', 7) + pad('TP', 7) + pad('crest', 7) + pad('phone', 7) + pad('loss', 6) + pad('<200Hz%', 8) + pad('monoLoss', 9) + pad('corr', 6) + pad('cent', 6) + 'octave bands % (20-60|-120|-250|-500|-1k|-2k|-4k|-8k|-12k)');
  for (const o of r.out) console.log(pad(o.sec, 5) + pad(o.bars || '-', 5) + pad(f1(o.lufs), 7) + pad(f1(o.mom), 7) + pad(f1(o.short), 7) + pad(f1(o.tp), 7) + pad(f1(o.crest), 7) + pad(f1(o.phoneLufs), 7) + pad(f1(o.phoneLoss), 6) + pad(f1(100 * o.lowShare200, 0), 8) + pad(f1(o.monoLoss, 2), 9) + pad(f1(o.corr, 2), 6) + pad(f1(o.centroid, 0), 6) + o.bands.map((v) => Math.round(v * 100)).join('|'));
}
if (t.errors.length) console.log('ERRORS', t.errors);
await t.close();
