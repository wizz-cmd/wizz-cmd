// FIZZ & POP — test/audio_analyze.mjs
// Renders every music track (intro + 3 loop cycles) and every SFX through AUDIO._renderOffline in real Chromium,
// writes WAVs to out/audio/ and prints a table: duration, peak, RMS dBFS, clipped samples, silence ratio, DC offset.
// Checks (exit code 1 on failure):
//   - no NaN/Inf, peak <= 0.9, zero clipped samples
//   - music RMS between -22 and -14 dBFS (target -20..-16)
//   - SFX loudness is judged PERCEPTUALLY (wave 2, QA A2): A-weighted "active" level (IEC 61672 A filter run in the time
//     domain, mean power of the 10 ms windows within 25 dB of the loudest) must be within +-2.5 dB of the median of the
//     non-quiet SFX (quiet ones sit quietDb below it; very short, fast-decaying ones carry a small `lvl` bonus because the ear
//     integrates over 100-200 ms; the QA script test/qa_audio_measure.mjs sfx, whose frames are 46 ms, agrees: spread 2.6 dB, was
//     16.6 dB).  The unweighted level is printed as well and must stay within
//     +-9 dB of its own median; low-end-heavy sounds are also checked against a small-speaker simulation (2nd-order 300 Hz
//     high-pass): the A-weighted level may drop at most 6 dB.
//   - loop seam: cycle 2 == cycle 3 (same 50 ms RMS envelope), no level jump / click at the boundary
//   - key-lifted second pass (stage1 / stage2): peak / clipping / RMS checked too
//   - per-section loudness arc of every loop is printed (A-weighted mean level of each section)
//   - jingles end cleanly (last 50 ms silent) ; sfx tails end silent
// Usage: node test/audio_analyze.mjs [--only name1,name2] [--nowav] [--out dir] [--src file.js] [--trims] [--apply-trims]
//   --out dir    where WAVs go (default out/audio)           --src file.js   analyse another audio source (e.g. a backup)
//   --apply-trims  rewrite the per-sfx `trim` constants so every non-quiet SFX lands on the A-weighted target (run until flat)
//   --target dB    A-weighted active level the trims aim at (default: median of the current table)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { launch, PROJECT } from '../tools/harness.mjs';

const args = process.argv.slice(2);
const argVal = (k) => (args.indexOf(k) >= 0 ? args[args.indexOf(k) + 1] : null);
const onlyArg = argVal('--only') ? argVal('--only').split(',') : null;
const NOWAV = args.includes('--nowav');
const OUT = argVal('--out') ? path.resolve(argVal('--out')) : path.join(PROJECT, 'out', 'audio');
fs.mkdirSync(OUT, { recursive: true });
const SRC_FILE = argVal('--src') ? path.resolve(argVal('--src')) : path.join(PROJECT, 'src', '20_audio.js');

let pageHtml = path.join(PROJECT, 'test', 'audio_page.html');
if (argVal('--src')) {                     // throwaway host page for an alternative audio source
  pageHtml = path.join(OUT, '_analyze_page.html');
  fs.writeFileSync(pageHtml, '<!DOCTYPE html><meta charset="utf-8"><title>analyze</title><script src="' + path.join(PROJECT, 'src', '00_shared.js') + '"></script><script src="' + SRC_FILE + '"></script>');
}
const t = await launch({ html: pageHtml });

// ---- in-page analysis helpers ----
await t.page.addScriptTag({ content: `
window.__an = (() => {
  const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));
  function winRms(ch, sr, ms, from, to) {          // per-window RMS (mono sum of both channels' power)
    const w = Math.max(1, Math.floor(sr * ms / 1000)), out = [];
    for (let i = from; i + w <= to; i += w) {
      let s = 0;
      for (let c = 0; c < ch.length; c++) { const d = ch[c]; for (let k = i; k < i + w; k++) s += d[k] * d[k]; }
      out.push(Math.sqrt(s / (w * ch.length)));
    }
    return out;
  }
  // ---- IEC 61672 A-weighting as a cascade of biquads (bilinear transform of the analog poles), 0 dB at 1 kHz ----
  function biquadFromAnalog(n, d, fs) {            // n = [n2,n1,n0], d = [d2,d1,d0] in s
    const c = 2 * fs;
    const num = [n[0] * c * c + n[1] * c + n[2], -2 * n[0] * c * c + 2 * n[2], n[0] * c * c - n[1] * c + n[2]];
    const den = [d[0] * c * c + d[1] * c + d[2], -2 * d[0] * c * c + 2 * d[2], d[0] * c * c - d[1] * c + d[2]];
    return { b: num.map((x) => x / den[0]), a: [1, den[1] / den[0], den[2] / den[0]] };
  }
  function runBiquad(x, f) {
    const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    const b = f.b, a = f.a;
    for (let i = 0; i < x.length; i++) { const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2; y[i] = v; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; }
    return y;
  }
  function firstOrderHP(w, sr) {                     // s/(s+w) by the bilinear transform, kept as a (degenerate) biquad
    const c = 2 * sr, k = c / (c + w);
    return { b: [k, -k, 0], a: [1, (w - c) / (c + w), 0] };
  }
  function aWeightFilters(sr) {
    const w = (f) => 2 * Math.PI * f, w1 = w(20.598997), w2 = w(107.65265), w3 = w(737.86223), w4 = w(12194.217);
    const secs = [
      biquadFromAnalog([1, 0, 0], [1, 2 * w1, w1 * w1], sr),              // s^2 / (s+w1)^2
      biquadFromAnalog([0, 0, w4 * w4], [1, 2 * w4, w4 * w4], sr),        // w4^2 / (s+w4)^2
      firstOrderHP(w2, sr),                                               // s / (s+w2)
      firstOrderHP(w3, sr),                                               // s / (s+w3)
    ];
    // gain at 1 kHz -> normalise
    const mag = (f) => {
      let re = 1, im = 0; const th = 2 * Math.PI * f / sr;
      for (const q of secs) {
        const nr = q.b[0] + q.b[1] * Math.cos(th) + q.b[2] * Math.cos(2 * th), ni = -(q.b[1] * Math.sin(th) + q.b[2] * Math.sin(2 * th));
        const dr = 1 + q.a[1] * Math.cos(th) + q.a[2] * Math.cos(2 * th), di = -(q.a[1] * Math.sin(th) + q.a[2] * Math.sin(2 * th));
        const m = (dr * dr + di * di), qr = (nr * dr + ni * di) / m, qi = (ni * dr - nr * di) / m;
        const r2 = re * qr - im * qi; im = re * qi + im * qr; re = r2;
      }
      return Math.hypot(re, im);
    };
    return { secs, norm: 1 / mag(1000) };
  }
  function aWeight(x, sr) {
    const f = aWeightFilters(sr); let y = x;
    for (const q of f.secs) y = runBiquad(y, q);
    const out = new Float32Array(y.length); for (let i = 0; i < y.length; i++) out[i] = y[i] * f.norm;
    return out;
  }
  function hp2(x, fc, sr) {                         // 2nd-order Butterworth high-pass (RBJ)
    const w0 = 2 * Math.PI * fc / sr, al = Math.sin(w0) / (2 * Math.SQRT1_2), c = Math.cos(w0), a0 = 1 + al;
    return runBiquad(x, { b: [(1 + c) / 2 / a0, -(1 + c) / a0, (1 + c) / 2 / a0], a: [1, -2 * c / a0, (1 - al) / a0] });
  }
  function lp2(x, fc, sr) {
    const w0 = 2 * Math.PI * fc / sr, al = Math.sin(w0) / (2 * Math.SQRT1_2), c = Math.cos(w0), a0 = 1 + al;
    return runBiquad(x, { b: [(1 - c) / 2 / a0, (1 - c) / a0, (1 - c) / 2 / a0], a: [1, -2 * c / a0, (1 - al) / a0] });
  }
  function activeOf(chs, sr, ms) {                  // mean power of the windows within 25 dB of the loudest, in dB
    const w = Math.max(1, Math.floor(sr * ms / 1000)), p = [];
    for (let i = 0; i + w <= chs[0].length; i += w) { let s = 0; for (const d of chs) for (let k = i; k < i + w; k++) s += d[k] * d[k]; p.push(s / (w * chs.length)); }
    let mx = 1e-18; for (const x of p) if (x > mx) mx = x;
    const act = p.filter((x) => 10 * Math.log10(x) > 10 * Math.log10(mx) - 25);
    return 10 * Math.log10(act.reduce((a, b) => a + b, 0) / Math.max(1, act.length) + 1e-18);
  }
  /** loudest ms-long window (sliding, 10 ms hop) of the mean A-weighted power, in dB: a temporal-integration ("fast") loudness; short sounds
   *  that are only 60-100 ms long are averaged over the whole window, so they rate lower than a sustained sound of equal peak level */
  function loudestWindow(chs, sr, ms) {
    const w = Math.max(1, Math.floor(sr * ms / 1000)), hop = Math.floor(sr * 0.01), n = chs[0].length;
    const cum = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) { let q = 0; for (const d of chs) q += d[i] * d[i]; cum[i + 1] = cum[i] + q / chs.length; }
    let best = 0;
    for (let a = 0; a < n; a += hop) { const b = Math.min(n, a + w); const p = (cum[b] - cum[a]) / w; if (p > best) best = p; }
    return 10 * Math.log10(best + 1e-18);
  }
  function a50(res, from, to) {
    const sr = res.sampleRate; from = from || 0; to = Math.min(to || res.channels[0].length, res.channels[0].length);
    return loudestWindow(res.channels.map((c) => aWeight(c.slice(from, to), sr)), sr, 50);
  }
  /** perceptual figures of a stereo render: A-weighted active level, small-speaker (300 Hz HPF) A-level, share of power below 200 Hz */
  function percept(res, from, to) {
    const sr = res.sampleRate; from = from || 0; to = Math.min(to || res.channels[0].length, res.channels[0].length);
    const chs = res.channels.map((c) => c.slice(from, to));
    const A = chs.map((c) => aWeight(c, sr));
    const aDb = activeOf(A, sr, 10);
    const a100 = loudestWindow(A, sr, 100);
    const ph = chs.map((c) => aWeight(hp2(hp2(c, 300, sr), 300, sr), sr));       // 4th order total (two 2nd-order stages): a typical phone speaker
    const phoneDb = activeOf(ph, sr, 10);
    let pl = 0, pt = 0; const lo = chs.map((c) => lp2(lp2(c, 200, sr), 200, sr));
    for (let c = 0; c < chs.length; c++) for (let i = 0; i < chs[c].length; i++) { pt += chs[c][i] * chs[c][i]; pl += lo[c][i] * lo[c][i]; }
    return { aDb, a100, phoneDb, lowShare: pt > 0 ? pl / pt : 0 };
  }
  /** mean A-weighted level (dB) of [from,to) seconds -- used for the per-section arc */
  function aLevel(res, fromS, toS) {
    const sr = res.sampleRate, a = Math.round(fromS * sr), b = Math.min(Math.round(toS * sr), res.channels[0].length);
    const A = res.channels.map((c) => aWeight(c.slice(a, b), sr)); let s = 0, n = 0;
    for (const d of A) for (let i = 0; i < d.length; i++) { s += d[i] * d[i]; n++; }
    return 10 * Math.log10(s / Math.max(1, n) + 1e-18);
  }
  function stats(res, from, to) {
    const ch = res.channels, sr = res.sampleRate;
    from = from || 0; to = Math.min(to || ch[0].length, ch[0].length);
    let peak = 0, sum = 0, sq = 0, clipped = 0, nan = 0, n = 0, dc = 0;
    for (let c = 0; c < ch.length; c++) {
      const d = ch[c]; let cs = 0;
      for (let i = from; i < to; i++) {
        const x = d[i];
        if (!Number.isFinite(x)) { nan++; continue; }
        const a = Math.abs(x); if (a > peak) peak = a; if (a >= 0.999) clipped++;
        sq += x * x; cs += x; n++;
      }
      dc = Math.max(dc, Math.abs(cs / (to - from)));
    }
    const rms = Math.sqrt(sq / Math.max(1, n));
    const wins = winRms(ch, sr, 10, from, to);
    const silent = wins.filter((x) => db(x) < -60).length / Math.max(1, wins.length);
    // "active" loudness: mean power of the 10 ms windows within 25 dB of the loudest window
    let mx = 1e-9; for (const x of wins) if (x > mx) mx = x; const act = wins.filter((x) => db(x) > db(mx) - 25);
    const actRms = Math.sqrt(act.reduce((a, b) => a + b * b, 0) / Math.max(1, act.length));
    // effective length: last window above -55 dBFS
    let last = 0; wins.forEach((x, i) => { if (db(x) > -55) last = i + 1; });
    return { dur: (to - from) / sr, peak, rmsDb: db(rms), clipped, nan, silence: silent, dc, activeDb: db(actRms), effDur: last * 0.01 };
  }
  function seam(res, seamAt, cycleLen) {           // seamAt: sample index of a boundary between two steady cycles
    const L = res.channels[0], R = res.channels[1], sr = res.sampleRate;
    // periodicity: 50 ms RMS envelope of the cycle before vs after the seam (the engine snaps note starts to the audio
    // render quantum, so cycles with a fractional-sample length differ sample-wise; the envelope must still match)
    const A = winRms(res.channels, sr, 50, seamAt - cycleLen, seamAt), B = winRms(res.channels, sr, 50, seamAt, seamAt + cycleLen);
    let sumd = 0, cnt = 0, maxd = 0;
    for (let i = 0; i < Math.min(A.length, B.length); i++) {
      if (db(A[i]) < -50 && db(B[i]) < -50) continue;
      const d = Math.abs(db(A[i]) - db(B[i])); sumd += d; cnt++; maxd = Math.max(maxd, d);
    }
    // level jump: RMS 40 ms before vs after
    const w = Math.floor(sr * 0.04);
    const rms = (from) => { let s = 0; for (let i = from; i < from + w; i++) s += L[i] * L[i] + R[i] * R[i]; return Math.sqrt(s / (2 * w)); };
    const before = rms(seamAt - w), after = rms(seamAt);
    // click: biggest sample step within +-1 ms of seam vs 99.9th percentile of steps over the cycle
    const steps = new Float32Array(cycleLen - 1);
    for (let i = 1; i < cycleLen; i++) steps[i - 1] = Math.abs(L[seamAt - cycleLen + i] - L[seamAt - cycleLen + i - 1]);
    steps.sort();
    const p999 = steps[Math.floor(steps.length * 0.999)] || 1e-9;
    let seamStep = 0; const k = Math.floor(sr * 0.001);
    for (let i = seamAt - k; i <= seamAt + k; i++) seamStep = Math.max(seamStep, Math.abs(L[i] - L[i - 1]));
    return { envDiffDb: sumd / Math.max(1, cnt), envMaxDb: maxd, levelJumpDb: db(after) - db(before), clickRatio: seamStep / p999 };
  }
  function tailDb(res, ms) {                       // RMS of the last ms
    const n = Math.floor(res.sampleRate * ms / 1000), len = res.channels[0].length; let s = 0;
    for (const d of res.channels) for (let i = len - n; i < len; i++) s += d[i] * d[i];
    return db(Math.sqrt(s / (n * res.channels.length)));
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
  /** unweighted RMS (dB) of a stereo render, plain and after the phone-speaker high-pass (2 x 2nd-order 300 Hz) */
  function stemLoss(res) {
    const sr = res.sampleRate; let a = 0, b = 0, n = 0;
    for (const c of res.channels) { const h = hp2(hp2(c, 300, sr), 300, sr); for (let i = 0; i < c.length; i++) { a += c[i] * c[i]; b += h[i] * h[i]; n++; } }
    const db = (x) => 10 * Math.log10(x / n + 1e-18);
    return { full: db(a), phone: db(b) };
  }
  /** spectral centroid (Hz) of the left channel over [from,to) seconds (Hann window, plain FFT) */
  function centroid(res, fromS, toS) {
    const sr = res.sampleRate, N = 8192, x = res.channels[0], a = Math.round(fromS * sr);
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) { const k = a + i; re[i] = k < x.length && k < Math.round(toS * sr) ? x[k] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1))) : 0; }
    for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let len = 2; len <= N; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < N; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } }
    }
    let num = 0, den = 0; for (let b = 2; b < N / 2; b++) { const p = re[b] * re[b] + im[b] * im[b]; num += p * b * sr / N; den += p; }
    return den > 0 ? num / den : 0;
  }
  return { stats, seam, tailDb, wavB64, percept, aLevel, centroid, stemLoss, a50 };
})();
` });

const names = await t.page.evaluate(() => ({ tracks: AUDIO.trackNames(), sfx: AUDIO.sfxNames() }));
const want = (n) => !onlyArg || onlyArg.includes(n);
const rows = [], problems = [], warnings = [];
const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : String(x));

// ---- music ----
for (const name of names.tracks.filter(want)) {
  const info = await t.page.evaluate((n) => AUDIO._info(n), name);
  const isLoop = info.kind === 'loop';
  const total = isLoop ? info.introSeconds + 3 * info.loopSeconds + 0.5 : info.seconds + 3.5;
  const r = await t.page.evaluate(async ({ n, total, isLoop, info }) => {
    const res = await AUDIO._renderOffline(n, total);
    const sr = res.sampleRate;
    const out = {};
    if (isLoop) {
      const c1 = Math.round((info.introSeconds + info.loopSeconds) * sr), c2 = Math.round((info.introSeconds + 2 * info.loopSeconds) * sr);
      out.cycle = __an.stats(res, c1, c2);                              // steady-state cycle (2nd)
      out.seam = __an.seam(res, c2, c2 - c1);
      out.all = __an.stats(res);
      // per-section A-weighted level over the 2nd cycle (the dynamic arc of the loop)
      const d = AUDIO._dump(n), beat = 60 / d.bpm;
      const fr = (st) => [d.swing / 2, d.swing / 2, (1 - d.swing) / 2, (1 - d.swing) / 2][st & 3];
      const tAt = new Float64Array(d.steps + 1); for (let q = 0; q < d.steps; q++) tAt[q + 1] = tAt[q] + beat * fr(q);
      const cyc = c1 / sr - tAt[d.loopStart];
      out.arc = d.sections.filter((x) => x.start >= d.loopStart).map((x) => ({ sec: x.name, db: __an.aLevel(res, cyc + tAt[x.start], cyc + tAt[x.start + x.steps]) }));
      if (info.lift) {                                                  // the key-lifted second pass must be as clean as the first
        const r2 = await AUDIO._renderOffline(n, info.introSeconds + info.loopSeconds + 0.5, { pass: 1 });
        out.lifted = __an.stats(r2);
        out.liftedWav = __an.wavB64(r2, 0, Math.round((info.introSeconds + info.loopSeconds) * sr));
      }
      out.wav = __an.wavB64(res, 0, Math.round((info.introSeconds + info.loopSeconds + 4) * sr));
    } else {
      out.all = __an.stats(res);
      out.cycle = out.all;
      out.tail = __an.tailDb(res, 50);
      out.endAt = info.seconds;
      out.wav = __an.wavB64(res, 0, Math.round((info.seconds + 2.5) * sr));
      // time after the timeline end until the signal is gone
      const wins = []; const L = res.channels[0]; const w = Math.floor(sr * 0.01); let lastAudible = 0;
      for (let i = 0; i + w <= L.length; i += w) { let s = 0; for (let k = i; k < i + w; k++) s += L[k] * L[k]; if (20 * Math.log10(Math.sqrt(s / w) + 1e-9) > -55) lastAudible = (i + w) / sr; }
      out.lastAudible = lastAudible;
    }
    return out;
  }, { n: name, total, isLoop, info });
  if (!NOWAV) fs.writeFileSync(path.join(OUT, name + '.wav'), Buffer.from(r.wav, 'base64'));
  if (!NOWAV && r.liftedWav) fs.writeFileSync(path.join(OUT, name + '_pass2_lifted.wav'), Buffer.from(r.liftedWav, 'base64'));
  const s = r.cycle;
  rows.push({ name, kind: info.kind, dur: isLoop ? info.loopSeconds : info.seconds, peak: s.peak, rmsDb: s.rmsDb, clipped: s.clipped, silence: s.silence, dc: s.dc, nan: s.nan,
    extra: isLoop ? `seam: env diff ${fmt(r.seam.envDiffDb, 2)}dB (max ${fmt(r.seam.envMaxDb, 1)}) jump ${fmt(r.seam.levelJumpDb)}dB click x${fmt(r.seam.clickRatio)}` : `tail50ms ${fmt(r.tail, 1)}dB, audible to ${fmt(r.lastAudible)}s (timeline ${fmt(r.endAt)}s)` });
  if (s.nan) problems.push(`${name}: NaN samples`);
  if (r.all.peak > 0.9) problems.push(`${name}: peak ${fmt(r.all.peak, 3)} > 0.9`);
  if (r.all.clipped) problems.push(`${name}: ${r.all.clipped} clipped samples`);
  if (isLoop && r.lifted) {
    console.log(`  ${name}: lifted pass (+${info.lift} st): peak ${fmt(r.lifted.peak, 3)} RMS ${fmt(r.lifted.rmsDb, 1)} dB clipped ${r.lifted.clipped}`);
    if (r.lifted.peak > 0.9 || r.lifted.clipped) problems.push(`${name}: lifted pass peak ${fmt(r.lifted.peak, 3)} clipped ${r.lifted.clipped}`);
    if (Math.abs(r.lifted.rmsDb - r.all.rmsDb) > 2) warnings.push(`${name}: lifted pass level differs by ${fmt(r.lifted.rmsDb - r.all.rmsDb, 1)} dB`);
  }
  if (isLoop && r.arc) {
    const vals = r.arc.map((x) => x.db);
    console.log(`  ${name}: section arc (A-weighted dB)  ` + r.arc.map((x) => `${x.sec} ${fmt(x.db, 1)}`).join('  ') + `   spread ${fmt(Math.max(...vals) - Math.min(...vals), 1)} dB`);
    if (['stage1', 'stage2', 'ending'].includes(name) && Math.max(...vals) - Math.min(...vals) < 1.5) warnings.push(`${name}: flat dynamic arc (spread ${fmt(Math.max(...vals) - Math.min(...vals), 1)} dB)`);
  }
  if (isLoop) {
    if (s.rmsDb < -22 || s.rmsDb > -14) problems.push(`${name}: RMS ${fmt(s.rmsDb, 1)} dBFS outside -22..-14`);
    else if (s.rmsDb < -20 || s.rmsDb > -16) warnings.push(`${name}: RMS ${fmt(s.rmsDb, 1)} dBFS outside the -20..-16 target`);
    if (r.seam.envDiffDb > 0.5 || r.seam.envMaxDb > 8) problems.push(`${name}: loop not periodic (envelope diff mean ${fmt(r.seam.envDiffDb, 2)} dB, max ${fmt(r.seam.envMaxDb, 1)} dB)`);
    if (Math.abs(r.seam.levelJumpDb) > 6) warnings.push(`${name}: level jump ${fmt(r.seam.levelJumpDb)} dB at seam (can be musical)`);
    if (r.seam.clickRatio > 3) problems.push(`${name}: click at seam x${fmt(r.seam.clickRatio)}`);
  } else {
    if (r.tail > -60) problems.push(`${name}: jingle does not end clean (last 50 ms ${fmt(r.tail, 1)} dB)`);
    if (s.rmsDb < -26 || s.rmsDb > -10) warnings.push(`${name}: jingle RMS ${fmt(s.rmsDb, 1)} dBFS`);
    if (r.lastAudible > r.endAt + 1.6) warnings.push(`${name}: tail rings ${fmt(r.lastAudible - r.endAt)} s past the timeline end`);
  }
}

// ---- sfx ----
const sfxRows = [];
for (const name of names.sfx.filter(want)) {
  const info = await t.page.evaluate((n) => AUDIO._info(n), name);
  const r = await t.page.evaluate(async (n) => {
    const res = await AUDIO._renderOffline(n, 2.6);
    const st = __an.stats(res);
    const end = Math.round(Math.min(res.channels[0].length, (st.effDur + 0.1) * res.sampleRate));
    return { st, pc: __an.percept(res, 0, end), tail: __an.tailDb(res, 100), wav: __an.wavB64(res, 0, Math.round(Math.min(res.channels[0].length, (st.effDur + 0.2) * res.sampleRate))) };
  }, name);
  if (!NOWAV) fs.writeFileSync(path.join(OUT, 'sfx_' + name + '.wav'), Buffer.from(r.wav, 'base64'));
  r.st.aDb = r.pc.aDb; r.st.a100 = r.pc.a100; r.st.phoneDb = r.pc.phoneDb; r.st.lowShare = r.pc.lowShare;
  sfxRows.push({ name, quiet: info.quiet, quietDb: info.quietDb, lvl: info.lvl || 0, st: r.st, tail: r.tail });
  if (r.st.nan) problems.push(`sfx ${name}: NaN`);
  if (r.st.peak > 0.9) problems.push(`sfx ${name}: peak ${fmt(r.st.peak, 3)} > 0.9`);
  if (r.st.clipped) problems.push(`sfx ${name}: clipped`);
  if (r.tail > -70) problems.push(`sfx ${name}: tail not silent (${fmt(r.tail, 1)} dB)`);
  if (r.st.effDur > 1.0 && !['boss_die', 'ghost'].includes(name)) warnings.push(`sfx ${name}: long (${fmt(r.st.effDur)} s)`);
  else if (r.st.effDur > 0.45 && !['boss_die', 'ghost', 'death', 'bomb', 'oneup', 'powerup', 'thunder', 'freeze', 'fire', 'water', 'letter', 'hurry', 'clear'].includes(name)) warnings.push(`sfx ${name}: ${fmt(r.st.effDur)} s (spec: mostly < 0.4 s)`);
}
const med = (arr) => { const a = arr.slice().sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : 0; };
const median = med(sfxRows.filter((x) => !x.quiet).map((x) => x.st.aDb));            // A-weighted median of the full-level sfx
const medianU = med(sfxRows.filter((x) => !x.quiet).map((x) => x.st.activeDb));      // unweighted (informational + sanity)
const medianP = med(sfxRows.filter((x) => !x.quiet).map((x) => x.st.phoneDb));       // what is left after a phone-class speaker
for (const x of sfxRows) {
  const d = x.st.aDb - median - x.lvl, du = x.st.activeDb - medianU - x.lvl, loss = x.st.aDb - x.st.phoneDb;
  if (!x.quiet && Math.abs(d) > 2.5) problems.push(`sfx ${x.name}: A-weighted loudness ${fmt(x.st.aDb, 1)} dB is ${fmt(d, 1)} dB from median ${fmt(median, 1)}`);
  if (!x.quiet && Math.abs(du) > 9) problems.push(`sfx ${x.name}: unweighted active level ${fmt(x.st.activeDb, 1)} dB is ${fmt(du, 1)} dB from median ${fmt(medianU, 1)}`);
  if (x.quiet) { const want = -(x.quietDb || 9); if (Math.abs(d - want) > 2.5) problems.push(`sfx ${x.name}: quiet sfx at ${fmt(d, 1)} dB vs median (want ${want} +-2.5)`); }
  if (!x.quiet && loss > 4) warnings.push(`sfx ${x.name}: loses ${fmt(loss, 1)} dB on a phone-class speaker (300 Hz high-pass)`);
  if (!x.quiet && Math.abs(x.st.phoneDb - medianP - x.lvl) > 3.5) problems.push(`sfx ${x.name}: on a phone-class speaker it is ${fmt(x.st.phoneDb - medianP, 1)} dB from the median (limit +-3.5)`);
  if (x.name === 'clear' && x.st.effDur > 0.8) problems.push(`sfx clear: ${fmt(x.st.effDur)} s long (spec: <= 0.8 s)`);
}

// ---- kill pitch ladder (the chain escalation: Game plays kill with pitch = min(2k, 12)) ----
if (!onlyArg || onlyArg.includes('kill')) {
  const ladder = await t.page.evaluate(async () => {
    const out = [];
    for (const pitch of [0, 2, 4, 6, 8, 10, 12]) {
      const res = await AUDIO._renderOffline('kill', 1.2, { pitch });
      const st = __an.stats(res);
      const end = Math.round(Math.min(res.channels[0].length, (st.effDur + 0.1) * res.sampleRate));
      out.push({ pitch, peak: st.peak, aDb: __an.percept(res, 0, end).aDb, cen: __an.centroid(res, 0, 0.17) });
    }
    return out;
  });
  console.log('kill pitch ladder: ' + ladder.map((r) => `+${r.pitch}: A ${fmt(r.aDb, 1)} dB, pk ${fmt(r.peak)}, centroid ${Math.round(r.cen)} Hz`).join(' | '));
  const aMin = Math.min(...ladder.map((r) => r.aDb)), aMax = Math.max(...ladder.map((r) => r.aDb));
  if (aMax - aMin > 3) problems.push(`kill: A-weighted level varies ${fmt(aMax - aMin, 1)} dB across pitch +0..+12 (limit 3 dB)`);
  for (let i = 1; i < ladder.length; i++) if (ladder[i].cen < ladder[i - 1].cen * 1.03) problems.push(`kill: spectral centroid does not rise from +${ladder[i - 1].pitch} to +${ladder[i].pitch} (${Math.round(ladder[i - 1].cen)} -> ${Math.round(ladder[i].cen)} Hz)`);
  if (ladder.some((r) => r.peak > 0.9)) problems.push('kill: peak > 0.9 at some pitch');
}

// ---- stems on a phone-class speaker (QA A9): what is left of bass / drums / lead after a 300 Hz high-pass ----
if (!onlyArg || onlyArg.includes('stems')) {
  const stems = await t.page.evaluate(async () => {
    const out = {};
    for (const n of ['stage1', 'stage2', 'boss', 'title']) {
      out[n] = {};
      for (const [k, skip] of Object.entries({ lead: ['harm', 'bass', 'drum'], bass: ['lead', 'harm', 'drum'], drum: ['lead', 'harm', 'bass'] })) {
        const res = await AUDIO._renderOffline(n, 16, { skip, noComp: true });
        out[n][k] = __an.stemLoss(res);
      }
    }
    return out;
  });
  console.log('stems (unweighted RMS dB full -> after a 300 Hz high-pass; loss):');
  for (const [n, v] of Object.entries(stems)) {
    console.log('  ' + n.padEnd(7) + Object.entries(v).map(([k, x]) => `${k} ${fmt(x.full, 1)} -> ${fmt(x.phone, 1)} (${fmt(x.full - x.phone, 1)})`).join('   '));
    if (v.bass.full - v.bass.phone > 10) warnings.push(`${n}: the bass stem loses ${fmt(v.bass.full - v.bass.phone, 1)} dB on a phone-class speaker`);
  }
}

// ---- mix stress: loudest music with the loudest SFX piled on top must still stay below the ceiling ----
if (!onlyArg) {
  const pile = [['bomb', 2], ['thunder', 2.05], ['boss_hit', 2.1], ['boss_die', 3], ['death', 3.2], ['kill', 3.3], ['kill', 3.35], ['pop', 3.4], ['pop', 3.42], ['pop', 3.44],
    ['oneup', 5], ['powerup', 5.05], ['freeze', 5.1], ['fire', 6], ['water', 6.02], ['bomb', 6.05], ['boss_hit', 6.1], ['boss_hit', 6.15]];
  for (const n of ['boss', 'stage1', 'title']) {
    const st = await t.page.evaluate(async ({ n, pile }) => {
      const res = await AUDIO._renderOffline(n, 10, { sfx: pile });
      return __an.stats(res);
    }, { n, pile });
    console.log(`mix stress ${n} + ${pile.length} sfx: peak ${fmt(st.peak, 3)}, clipped ${st.clipped}, RMS ${fmt(st.rmsDb, 1)} dB`);
    if (st.peak > 0.9 || st.clipped) problems.push(`mix stress ${n}: peak ${fmt(st.peak, 3)} clipped ${st.clipped}`);
  }
}

// ---- print ----
const pad = (s, n) => String(s).padEnd(n);
console.log('\nMUSIC (loops: one steady-state cycle; jingles: whole)');
console.log(pad('name', 12) + pad('kind', 7) + pad('dur s', 8) + pad('peak', 7) + pad('RMS dB', 8) + pad('clip', 6) + pad('silence', 9) + pad('DC', 9) + 'notes');
for (const r of rows) console.log(pad(r.name, 12) + pad(r.kind, 7) + pad(fmt(r.dur, 1), 8) + pad(fmt(r.peak), 7) + pad(fmt(r.rmsDb, 1), 8) + pad(r.clipped, 6) + pad(fmt(r.silence, 3), 9) + pad(fmt(r.dc, 5), 9) + r.extra);
console.log('\nSFX   (A-dB = A-weighted active level; phone = same after a 300 Hz high-pass; <200 = share of power below 200 Hz)');
console.log(pad('name', 13) + pad('eff s', 7) + pad('peak', 7) + pad('RMS dB', 8) + pad('act dB', 8) + pad('A-dB', 8) + pad('vs med', 12) + pad('phone', 7) + pad('<200', 7) + pad('clip', 6) + pad('DC', 9) + 'trim hint (A-weighted)');
for (const x of sfxRows) {
  const target = median + x.lvl - (x.quiet ? (x.quietDb || 9) : 0);
  const hint = Math.pow(10, (target - x.st.aDb) / 20);
  console.log(pad(x.name + (x.quiet ? '*' : ''), 13) + pad(fmt(x.st.effDur), 7) + pad(fmt(x.st.peak), 7) + pad(fmt(x.st.rmsDb, 1), 8) + pad(fmt(x.st.activeDb, 1), 8) + pad(fmt(x.st.aDb, 1), 8) + pad(fmt(x.st.aDb - median, 1) + (x.lvl ? ' (+' + x.lvl + ')' : ''), 12) + pad(fmt(x.st.phoneDb - x.st.aDb, 1), 7) + pad(Math.round(100 * x.st.lowShare) + '%', 7) + pad(x.st.clipped, 6) + pad(fmt(x.st.dc, 5), 9) + 'x' + fmt(hint, 2));
}
console.log('\nSFX median active loudness: A-weighted ' + fmt(median, 1) + ' dB, unweighted ' + fmt(medianU, 1) + ' dBFS');
if (args.includes('--apply-trims')) {
  // rewrite the per-sfx `trim` constants in src/20_audio.js so every non-quiet SFX hits the A-weighted target loudness
  // (quiet ones: target - quietDb). Run repeatedly until the table is flat.
  const file = SRC_FILE;
  let code = fs.readFileSync(file, 'utf8');
  const changes = [];
  const tgt = argVal('--target') !== null ? +argVal('--target') : median;
  for (const x of sfxRows) {
    const target = tgt + x.lvl - (x.quiet ? (x.quietDb || 9) : 0);
    const hint = Math.pow(10, (target - x.st.aDb) / 20);
    const re = new RegExp('(\\n    ' + x.name + ': \\{ max: \\d+, trim: )([0-9.]+)');
    const m = re.exec(code);
    if (!m) { console.log('apply-trims: no trim field for ' + x.name); continue; }
    const nv = Math.round(parseFloat(m[2]) * hint * 100) / 100;
    if (Math.abs(nv - parseFloat(m[2])) >= 0.01) changes.push(x.name + ' ' + m[2] + ' -> ' + nv);
    code = code.replace(re, '$1' + nv);
  }
  fs.writeFileSync(file, code);
  console.log('apply-trims: ' + (changes.length ? changes.join(', ') : 'nothing to change'));
}
if (args.includes('--trims')) console.log('trim hints: ' + JSON.stringify(Object.fromEntries(sfxRows.map((x) => [x.name, +Math.pow(10, (median - x.st.aDb) / 20).toFixed(2)]))));
if (t.errors.length) problems.push('console errors: ' + t.errors.join(' | '));
warnings.forEach((w) => console.log('warn: ' + w));
problems.forEach((p) => console.log('PROBLEM: ' + p));
console.log(`\n${problems.length} problem(s), ${warnings.length} warning(s)`);
await t.close();
process.exit(problems.length ? 1 : 0);
