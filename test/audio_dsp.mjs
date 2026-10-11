// FIZZ & POP — test/audio_dsp.mjs
// In-page DSP helpers shared by the audio test tools (injected with page.addScriptTag({ content: DSP_SRC }) -> window.__dsp).
//   ITU-R BS.1770-4 K-weighting (high-shelf pre-filter + RLB high-pass, any sample rate), gated integrated loudness (LUFS),
//   momentary / short windows, "active" level of short sounds, 4x-oversampled true peak, stats (peak / RMS / clipping / DC / silence),
//   loop-seam metrics, spectral centroid, WAV encoder, small-speaker (phone) simulation.
// Level words used in the audio tests:  LUFS = K-weighted, gated, 400 ms blocks (music);  "K-active" = K-weighted mean power of the
// 10 ms windows within 25 dB of the loudest window (short SFX, where gating by 400 ms blocks makes no sense).
export const DSP_SRC = String.raw`
window.__dsp = (() => {
  const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));
  function runBiquad(x, b, a) {
    const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) { const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2; y[i] = v; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; }
    return y;
  }
  /** BS.1770 K-weighting of one channel */
  function kWeight(x, sr) {
    let K = Math.tan(Math.PI * 1681.974450955533 / sr);
    const Vh = Math.pow(10, 3.999843853973347 / 20), Vb = Math.pow(Vh, 0.4996667741545416), Q1 = 0.7071752369554196;
    let a0 = 1 + K / Q1 + K * K;
    const sb = [(Vh + Vb * K / Q1 + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q1 + K * K) / a0], sa = [1, 2 * (K * K - 1) / a0, (1 - K / Q1 + K * K) / a0];
    K = Math.tan(Math.PI * 38.13547087602444 / sr);
    const Q2 = 0.5003270373238773; a0 = 1 + K / Q2 + K * K;
    const hb = [1, -2, 1], ha = [1, 2 * (K * K - 1) / a0, (1 - K / Q2 + K * K) / a0];
    return runBiquad(runBiquad(x, sb, sa), hb, ha);
  }
  function blocks(chs, sr, ms, hopMs) {                 // K-weighted mean-square per block (summed over channels)
    const W = chs.map((c) => kWeight(c, sr)), w = Math.floor(sr * ms / 1000), hop = Math.floor(sr * hopMs / 1000), n = W[0].length, out = [];
    const cum = W.map((d) => { const c = new Float64Array(n + 1); for (let i = 0; i < n; i++) c[i + 1] = c[i] + d[i] * d[i]; return c; });
    for (let a = 0; a + w <= n; a += hop) { let z = 0; for (const c of cum) z += (c[a + w] - c[a]) / w; out.push(z); }
    return out;
  }
  const lk = (z) => -0.691 + 10 * Math.log10(z + 1e-18);
  /** integrated loudness (LUFS, absolute gate -70, relative gate -10 LU); also loudness range-ish max momentary */
  function lufs(chs, sr) {
    const z = blocks(chs, sr, 400, 100);
    if (!z.length) return { lufs: -Infinity, momMax: -Infinity, shortMax: -Infinity };
    const g1 = z.filter((v) => lk(v) > -70);
    if (!g1.length) return { lufs: -Infinity, momMax: -Infinity };
    const m1 = g1.reduce((a, b) => a + b, 0) / g1.length, g2 = g1.filter((v) => lk(v) > lk(m1) - 10);
    const m2 = (g2.length ? g2 : g1).reduce((a, b) => a + b, 0) / (g2.length || g1.length);
    return { lufs: lk(m2), momMax: lk(Math.max.apply(null, z)) };
  }
  /** K-weighted level (dB, LUFS-like scale) of short sounds: mean power of the 10 ms windows within 25 dB of the loudest, plus the
   *  loudest 100 ms / 400 ms windows */
  function active(chs, sr) {
    const z10 = blocks(chs, sr, 10, 10);
    let mx = 1e-18; for (const v of z10) if (v > mx) mx = v;
    const act = z10.filter((v) => 10 * Math.log10(v) > 10 * Math.log10(mx) - 25);
    const a = act.reduce((p, q) => p + q, 0) / Math.max(1, act.length);
    const z100 = blocks(chs, sr, 100, 10), z400 = blocks(chs, sr, 400, 10);
    return { active: lk(a), m100: z100.length ? lk(Math.max.apply(null, z100)) : -Infinity, m400: z400.length ? lk(Math.max.apply(null, z400)) : -Infinity };
  }
  // 4x oversampled true peak: 48-tap windowed-sinc, 4 polyphase branches of 12 taps
  const TP = (() => {
    const L = 4, T = 12, h = [];
    for (let p = 0; p < L; p++) {
      const taps = new Float64Array(T);
      for (let k = 0; k < T; k++) {
        const x = (k - T / 2 + 1) - p / L;                 // distance in input samples
        const s = Math.abs(x) < 1e-9 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
        const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * (k + 1 - p / L) / (T + 1));
        taps[k] = s * w;
      }
      h.push(taps);
    }
    return h;
  })();
  function truePeak(chs) {
    let pk = 0;
    for (const d of chs) {
      const n = d.length;
      for (let i = 0; i < n; i++) {
        const a = d[i] < 0 ? -d[i] : d[i]; if (a > pk) pk = a;
        if (a < pk * 0.5) continue;                       // cheap skip: only loud neighbourhoods can hide an inter-sample peak
        for (let p = 1; p < 4; p++) {
          let s = 0; const t = TP[p];
          for (let k = 0; k < 12; k++) { const j = i + k - 5; if (j >= 0 && j < n) s += d[j] * t[k]; }
          if (Math.abs(s) > pk) pk = Math.abs(s);
        }
      }
    }
    return pk;
  }
  function stats(res, from, to) {
    const ch = res.channels, sr = res.sampleRate;
    from = from || 0; to = Math.min(to || ch[0].length, ch[0].length);
    let peak = 0, sq = 0, clipped = 0, nan = 0, n = 0, dc = 0;
    for (let c = 0; c < ch.length; c++) {
      const d = ch[c]; let cs = 0;
      for (let i = from; i < to; i++) {
        const x = d[i];
        if (!Number.isFinite(x)) { nan++; continue; }
        const a = Math.abs(x); if (a > peak) peak = a; if (a >= 0.999) clipped++;
        sq += x * x; cs += x; n++;
      }
      dc = Math.max(dc, Math.abs(cs / Math.max(1, to - from)));
    }
    const w = Math.max(1, Math.floor(sr * 0.01)), wins = [];
    for (let i = from; i + w <= to; i += w) { let s = 0; for (const d of ch) for (let k = i; k < i + w; k++) s += d[k] * d[k]; wins.push(Math.sqrt(s / (w * ch.length))); }
    let last = 0; wins.forEach((x, i) => { if (db(x) > -55) last = i + 1; });
    const silent = wins.filter((x) => db(x) < -60).length / Math.max(1, wins.length);
    return { dur: (to - from) / sr, peak, rmsDb: db(Math.sqrt(sq / Math.max(1, n))), clipped, nan, dc, silence: silent, effDur: last * 0.01 };
  }
  function slice(res, from, to) { return res.channels.map((c) => c.slice(from || 0, to || c.length)); }
  function winRms(chs, sr, ms, from, to) {
    const w = Math.max(1, Math.floor(sr * ms / 1000)), out = [];
    for (let i = from; i + w <= to; i += w) { let s = 0; for (const d of chs) for (let k = i; k < i + w; k++) s += d[k] * d[k]; out.push(Math.sqrt(s / (w * chs.length))); }
    return out;
  }
  /** loop seam between two steady cycles: envelope difference of the cycle before / after the seam, level jump, click ratio */
  function seam(res, seamAt, cycleLen) {
    const L = res.channels[0], R = res.channels[1], sr = res.sampleRate;
    const A = winRms(res.channels, sr, 50, seamAt - cycleLen, seamAt), B = winRms(res.channels, sr, 50, seamAt, seamAt + cycleLen);
    let sumd = 0, cnt = 0, maxd = 0;
    for (let i = 0; i < Math.min(A.length, B.length); i++) {
      if (db(A[i]) < -42 && db(B[i]) < -42) continue;       // quiet windows: residuals of near-cancelling partials, not audible
      const d = Math.abs(db(A[i]) - db(B[i])); sumd += d; cnt++; maxd = Math.max(maxd, d);
    }
    const w = Math.floor(sr * 0.04);
    const rms = (from) => { let s = 0; for (let i = from; i < from + w; i++) s += L[i] * L[i] + R[i] * R[i]; return Math.sqrt(s / (2 * w)); };
    const steps = new Float32Array(cycleLen - 1);
    for (let i = 1; i < cycleLen; i++) steps[i - 1] = Math.abs(L[seamAt - cycleLen + i] - L[seamAt - cycleLen + i - 1]);
    steps.sort();
    const p999 = steps[Math.floor(steps.length * 0.999)] || 1e-9;
    let seamStep = 0; const k = Math.floor(sr * 0.001);
    for (let i = seamAt - k; i <= seamAt + k; i++) seamStep = Math.max(seamStep, Math.abs(L[i] - L[i - 1]));
    return { envDiffDb: sumd / Math.max(1, cnt), envMaxDb: maxd, levelJumpDb: db(rms(seamAt)) - db(rms(seamAt - w)), clickRatio: seamStep / p999 };
  }
  function tailDb(res, ms) {
    const n = Math.floor(res.sampleRate * ms / 1000), len = res.channels[0].length; let s = 0;
    for (const d of res.channels) for (let i = len - n; i < len; i++) s += d[i] * d[i];
    return db(Math.sqrt(s / (n * res.channels.length)));
  }
  function hp2(x, fc, sr) {
    const w0 = 2 * Math.PI * fc / sr, al = Math.sin(w0) / (2 * Math.SQRT1_2), c = Math.cos(w0), a0 = 1 + al;
    return runBiquad(x, [(1 + c) / 2 / a0, -(1 + c) / a0, (1 + c) / 2 / a0], [1, -2 * c / a0, (1 - al) / a0]);
  }
  function lp2(x, fc, sr) {
    const w0 = 2 * Math.PI * fc / sr, al = Math.sin(w0) / (2 * Math.SQRT1_2), c = Math.cos(w0), a0 = 1 + al;
    return runBiquad(x, [(1 - c) / 2 / a0, (1 - c) / a0, (1 - c) / 2 / a0], [1, -2 * c / a0, (1 - al) / a0]);
  }
  /** phone-class speaker: 4th-order 300 Hz high-pass.  Returns the K-active / LUFS-ish drop in dB and the share of power below 200 Hz */
  function phone(chs, sr) {
    const ph = chs.map((c) => hp2(hp2(c, 300, sr), 300, sr));
    let pl = 0, pt = 0; const lo = chs.map((c) => lp2(lp2(c, 200, sr), 200, sr));
    for (let c = 0; c < chs.length; c++) for (let i = 0; i < chs[c].length; i++) { pt += chs[c][i] * chs[c][i]; pl += lo[c][i] * lo[c][i]; }
    return { chs: ph, lowShare: pt > 0 ? pl / pt : 0 };
  }
  function fftMag(x, a, N) {                              // magnitude spectrum of N samples starting at a (Hann)
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) { const k = a + i; re[i] = k < x.length ? x[k] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1))) : 0; }
    for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let len = 2; len <= N; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < N; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } }
    }
    const m = new Float64Array(N / 2); for (let b = 0; b < N / 2; b++) m[b] = re[b] * re[b] + im[b] * im[b];
    return m;
  }
  /** spectral centroid (Hz) of the left channel over [fromS,toS) seconds */
  function centroid(res, fromS, toS) {
    const sr = res.sampleRate, N = 8192, a = Math.round(fromS * sr), x = res.channels[0].subarray(0, Math.min(res.channels[0].length, Math.round(toS * sr)));
    const m = fftMag(x, a, N); let num = 0, den = 0;
    for (let b = 2; b < N / 2; b++) { num += m[b] * b * sr / N; den += m[b]; }
    return den > 0 ? num / den : 0;
  }
  /** band energy shares (sub <90, bass 90-250, low-mid 250-1k, mid 1-4k, high >4k) of a whole render (Welch-ish: 16 windows) */
  function bands(res) {
    const sr = res.sampleRate, N = 4096, x = res.channels[0], acc = new Float64Array(N / 2), n = Math.min(24, Math.floor(x.length / N));
    for (let i = 0; i < n; i++) { const m = fftMag(x, Math.floor(i * (x.length - N) / Math.max(1, n - 1)), N); for (let b = 0; b < N / 2; b++) acc[b] += m[b]; }
    const edges = [0, 90, 250, 1000, 4000, 1e9], out = [0, 0, 0, 0, 0]; let tot = 0;
    for (let b = 1; b < N / 2; b++) { const f = b * sr / N; for (let e = 0; e < 5; e++) if (f >= edges[e] && f < edges[e + 1]) { out[e] += acc[b]; break; } tot += acc[b]; }
    return out.map((v) => v / Math.max(1e-18, tot));
  }
  function wavB64(res, from, to) {
    const sr = res.sampleRate, ch = res.channels; from = from || 0; to = Math.min(to || ch[0].length, ch[0].length);
    const n = to - from, buf = new ArrayBuffer(44 + n * 4), v = new DataView(buf);
    const wr = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    wr(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); wr(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, 2, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
    wr(36, 'data'); v.setUint32(40, n * 4, true);
    let o = 44;
    for (let i = from; i < to; i++) for (let c = 0; c < 2; c++) { const x = Math.max(-1, Math.min(1, ch[c][i])); v.setInt16(o, x < 0 ? x * 32768 : x * 32767, true); o += 2; }
    const bytes = new Uint8Array(buf); let bin = ''; const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(bin);
  }
  return { db, kWeight, lufs, active, truePeak, stats, slice, winRms, seam, tailDb, phone, centroid, bands, wavB64, hp2, lp2 };
})();
`;
