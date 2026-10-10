// QA (audio lens) -- (1) small-speaker simulation (2nd-order HPF 300 Hz + LPF 9 kHz) for every sfx + music stems,
//                    (2) SFX-vs-music masking: per 1/3-octave band, SFX level minus the music bed level in the same window.
//   node test/qa_audio_masking.mjs
import fs from 'fs';
import path from 'path';
import { launch, PROJECT } from '../tools/harness.mjs';
const OUT = path.join(PROJECT, 'out', 'qa', 'audio');
const t = await launch({});
await t.page.addScriptTag({ content: `
window.__mk = (() => {
  const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));
  function biquad(type, fc, q, sr) {
    const w0 = 2 * Math.PI * fc / sr, al = Math.sin(w0) / (2 * q), c = Math.cos(w0);
    let b0, b1, b2;
    if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; } else { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
    const a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
    return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
  }
  function filt(x, f) { const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < x.length; i++) { const v = f.b0 * x[i] + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2; y[i] = v; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; } return y; }
  function smallSpeaker(res, hp) {
    const sr = res.sampleRate, h = biquad('hp', hp, 0.707, sr), l = biquad('lp', 9000, 0.707, sr);
    return { sampleRate: sr, channels: res.channels.map((c) => filt(filt(c, h), l)) };
  }
  function activeRms(res, from, to, gateDb) {
    const L = res.channels[0], R = res.channels[1], w = 2048; const fr = [];
    for (let s = from; s + w <= to; s += w) { let q = 0; for (let k = 0; k < w; k++) q += (L[s + k] * L[s + k] + R[s + k] * R[s + k]) / 2; fr.push(q / w); }
    const mx = Math.max(...fr, 1e-12); const thr = mx * Math.pow(10, -Math.abs(gateDb) / 10);
    let sum = 0, c = 0; fr.forEach((p) => { if (p >= thr && p > 1e-10) { sum += p; c++; } });
    return db(Math.sqrt(sum / Math.max(1, c)));
  }
  function effEnd(res) { const L = res.channels[0], R = res.channels[1], sr = res.sampleRate, w = Math.floor(sr * 0.005); let last = 0; for (let i = 0; i + w <= L.length; i += w) { let q = 0; for (let k = i; k < i + w; k++) q += (L[k] * L[k] + R[k] * R[k]) / 2; if (db(Math.sqrt(q / w)) > -50) last = i + w; } return last; }
  function fft(re, im) { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let tmp = re[i]; re[i] = re[j]; re[j] = tmp; tmp = im[i]; im[i] = im[j]; im[j] = tmp; } } for (let len = 2; len <= n; len <<= 1) { const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang); for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const ur = re[i + k], ui = im[i + k]; const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr; re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } } } }
  const CF = [125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000];
  // 1/3-octave band powers over [from,to) (mono), N=1024 hann frames
  function thirds(res, from, to) {
    const sr = res.sampleRate, N = 1024, win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
    const P = new Float64Array(CF.length); const re = new Float64Array(N), im = new Float64Array(N); let fr = 0;
    const L = res.channels[0], R = res.channels[1];
    for (let s = from; s + N <= to + N / 2; s += N / 2) {
      for (let k = 0; k < N; k++) { const i = s + k; re[k] = i < L.length ? ((L[i] + R[i]) / 2) * win[k] : 0; im[k] = 0; }
      fft(re, im); fr++;
      for (let b = 1; b < N / 2; b++) { const f = b * sr / N; const p = re[b] * re[b] + im[b] * im[b]; for (let j = 0; j < CF.length; j++) if (f >= CF[j] / 1.1225 && f < CF[j] * 1.1225) { P[j] += p; break; } }
    }
    return Array.from(P).map((p) => p / Math.max(fr, 1));
  }
  return { smallSpeaker, activeRms, effEnd, thirds, CF, db };
})();
` });
const A = () => window.__fizzpop.AUDIO;
const names = await t.page.evaluate(() => ({ tracks: window.__fizzpop.AUDIO.trackNames(), sfx: window.__fizzpop.AUDIO.sfxNames() }));
const f1 = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : String(x));
const report = { phone: {}, mask: {} };

if (process.argv[2] !== 'mask') {
console.log('#### small-speaker simulation: active level (dB, raw RMS) full-range vs after 2nd-order HPF 300 Hz / LPF 9 kHz  (laptop 150 Hz in brackets)');
for (const n of names.sfx) {
  const r = await t.page.evaluate(async (n) => {
    const res = await window.__fizzpop.AUDIO._renderOffline(n, 2.8, { noComp: true });
    const e = __mk.effEnd(res), end = Math.max(e, 4096);
    const full = __mk.activeRms(res, 0, end, 30);
    const ph = __mk.activeRms(__mk.smallSpeaker(res, 300), 0, end, 30);
    const lp = __mk.activeRms(__mk.smallSpeaker(res, 150), 0, end, 30);
    return { full, ph, lp };
  }, n);
  report.phone[n] = r;
  console.log(n.padEnd(12), `full ${f1(r.full)}  phone ${f1(r.ph)} (loss ${f1(r.full - r.ph)} dB)   laptop ${f1(r.lp)} (loss ${f1(r.full - r.lp)} dB)`);
}
console.log('');
for (const n of ['stage1', 'stage2', 'boss', 'title', 'entry', 'ending']) {
  const r = await t.page.evaluate(async (n) => {
    const a = window.__fizzpop.AUDIO, secs = 20;
    const out = {};
    for (const [k, skip] of Object.entries({ all: [], lead: ['harm', 'bass', 'drum'], harm: ['lead', 'bass', 'drum'], bass: ['lead', 'harm', 'drum'], drum: ['lead', 'harm', 'bass'] })) {
      const res = await a._renderOffline(n, secs, { skip, noComp: true });
      const n1 = res.channels[0].length;
      out[k] = { full: __mk.activeRms(res, 0, n1, 40), phone: __mk.activeRms(__mk.smallSpeaker(res, 300), 0, n1, 40) };
    }
    return out;
  }, n);
  report.phone[n] = r;
  console.log(n.padEnd(8), ['all', 'lead', 'harm', 'bass', 'drum'].map((k) => `${k} ${f1(r[k].full)}->${f1(r[k].phone)}`).join('   '));
}

}
if (process.argv[2] === 'phone') { await t.close(); process.exit(0); }
console.log('\n#### masking: per sfx, share of SFX energy that lies in 1/3-oct bands where SFX level > music-bed level (same window), and mean SMR (dB) energy-weighted');
const beds = process.argv[3] ? process.argv[3].split(',') : ['stage1', 'stage2', 'boss'];
const gameplay = process.argv[4] ? process.argv[4].split(',') : ['jump', 'shoot', 'pop', 'trap', 'kill', 'bounce', 'food', 'land', 'enemy_shot', 'spawn', 'letter', 'powerup', 'item_appear', 'hurry', 'ghost', 'boss_hit', 'thunder', 'water', 'fire', 'death', 'freeze', 'bomb', 'menu_select'];
for (const s of gameplay) {
  const row = [];
  for (const bed of beds) {
    const r = await t.page.evaluate(async ({ s, bed }) => {
      const a = window.__fizzpop.AUDIO, sr = 44100;
      const sf = await a._renderOffline(s, 2.8);
      const e = __mk.effEnd(sf);
      // choose 6 offsets within the bed (different musical moments) and average the SMR
      const offs = [2.1, 5.3, 8.7, 12.4, 17.9, 23.2];
      const bedRes = await a._renderOffline(bed, 26);
      const S = __mk.thirds(sf, 0, e);
      let wSum = 0, smrSum = 0, aud = 0, tot = 0;
      for (const o of offs) {
        const from = Math.round(o * sr);
        const B = __mk.thirds(bedRes, from, from + e);
        for (let j = 0; j < S.length; j++) { const smr = 10 * Math.log10((S[j] + 1e-14) / (B[j] + 1e-14)); tot += S[j]; wSum += S[j]; smrSum += S[j] * Math.max(-30, Math.min(30, smr)); if (smr > 0) aud += S[j]; }
      }
      return { smr: smrSum / wSum, aud: aud / tot };
    }, { s, bed });
    row.push(`${bed}: ${(100 * r.aud).toFixed(0)}% audible, SMR ${f1(r.smr)} dB`);
    report.mask[s + '@' + bed] = r;
  }
  console.log(s.padEnd(12), row.join('   |   '));
}
fs.writeFileSync(path.join(OUT, 'measure_masking.json'), JSON.stringify(report, null, 1));
console.log('\nerrors:', t.errors.length ? t.errors : 'none');
await t.close();
