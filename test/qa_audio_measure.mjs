// QA (audio lens) -- offline render measurements in real Chromium via AUDIO._renderOffline (dist/fizzpop.html).
//   node test/qa_audio_measure.mjs [music|sfx|stems|duck|all]
// Writes out/qa/audio/measure_*.json and prints tables.  No WAVs are written.
import fs from 'fs';
import path from 'path';
import { launch, PROJECT } from '../tools/harness.mjs';

const mode = process.argv[2] || 'all';
const OUT = path.join(PROJECT, 'out', 'qa', 'audio');
fs.mkdirSync(OUT, { recursive: true });
const t = await launch({});
await t.page.addScriptTag({ content: `
window.__qa = (() => {
  const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let tmp = re[i]; re[i] = re[j]; re[j] = tmp; tmp = im[i]; im[i] = im[j]; im[j] = tmp; } }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const ur = re[i + k], ui = im[i + k];
          const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
          re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
          const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
        }
      }
    }
  }
  const aW = (f) => { if (f < 10) return 0; const f2 = f * f; const ra = (12194 ** 2 * f2 * f2) / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2)); return ra * ra * Math.pow(10, 0.2); }; // power gain
  const BANDS = [[20, 60], [60, 150], [150, 500], [500, 2000], [2000, 6000], [6000, 22050]];
  const FPB = [[20,100],[100,200],[200,400],[400,800],[800,1600],[1600,3200],[3200,6400],[6400,22050]];
  /** analyse a stereo result: spectrum-based metrics over [from,to) samples */
  function analyse(res, from, to, opt) {
    opt = opt || {};
    const sr = res.sampleRate, L = res.channels[0], R = res.channels[1];
    from = from || 0; to = Math.min(to || L.length, L.length);
    const N = 4096, hop = 2048;
    const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
    const bandP = new Float64Array(BANDS.length); let totP = 0, aP = 0, cenNum = 0, cenDen = 0;
    const fp = FPB.map(() => 0);
    let peak = 0, sq = 0, n = 0, clipped = 0, over55 = 0;
    for (let i = from; i < to; i++) { const a = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (a > peak) peak = a; sq += (L[i] * L[i] + R[i] * R[i]) / 2; n++; if (a >= 0.999) clipped++; if (a > 0.55) over55++; }
    let frames = 0, activeFrames = 0, aSum = 0;
    // per-frame RMS gate for 'active' stats
    const frameRms = [];
    for (let s = from; s + N <= to; s += hop) { let q = 0; for (let k = 0; k < N; k++) { const m = (L[s + k] + R[s + k]) / 2; q += m * m; } frameRms.push(Math.sqrt(q / N)); }
    let mx = 0; for (const x of frameRms) if (x > mx) mx = x;
    const gate = opt.gateDb !== undefined ? mx * Math.pow(10, opt.gateDb / 20) : 0;
    let fi = 0;
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let s = from; s + N <= to; s += hop, fi++) {
      if (frameRms[fi] < gate || frameRms[fi] < 1e-5) continue;
      for (let k = 0; k < N; k++) { re[k] = ((L[s + k] + R[s + k]) / 2) * win[k]; im[k] = 0; }
      fft(re, im);
      activeFrames++;
      for (let b = 1; b < N / 2; b++) {
        const f = b * sr / N, p = (re[b] * re[b] + im[b] * im[b]);
        totP += p; aP += p * aW(f); cenNum += p * f; cenDen += p;
        for (let j = 0; j < BANDS.length; j++) if (f >= BANDS[j][0] && f < BANDS[j][1]) { bandP[j] += p; break; }
        for (let j = 0; j < FPB.length; j++) if (f >= FPB[j][0] && f < FPB[j][1]) { fp[j] += p; break; }
      }
    }
    const rms = Math.sqrt(sq / Math.max(1, n));
    // active rms (frames within gate)
    let aq = 0, ac = 0; frameRms.forEach((x) => { if (x >= gate && x >= 1e-5) { aq += x * x; ac++; } });
    const activeRms = Math.sqrt(aq / Math.max(1, ac));
    const bf = Array.from(bandP).map((p) => p / Math.max(totP, 1e-30));
    // A-weighted loudness relative to unweighted: apply the weighting ratio to the active rms
    const aRatio = aP / Math.max(totP, 1e-30);                // mean A-weight power gain across the (power-weighted) spectrum
    const fpn = fp.map((p) => p / Math.max(totP, 1e-30));
    return { dur: (to - from) / sr, peak, rmsDb: db(rms), activeDb: db(activeRms), aDb: db(activeRms) + 10 * Math.log10(Math.max(aRatio, 1e-12)),
      centroid: cenNum / Math.max(cenDen, 1e-30), bandsPct: bf.map((x) => +(100 * x).toFixed(2)), fp: fpn, clipped, pctOver55: +(100 * over55 / Math.max(1, n)).toFixed(3), activeFrames };
  }
  /** effective duration (above -50 dBFS) */
  function effDur(res) {
    const sr = res.sampleRate, L = res.channels[0], R = res.channels[1], w = Math.floor(sr * 0.005);
    let last = 0, first = -1;
    for (let i = 0; i + w <= L.length; i += w) { let q = 0; for (let k = i; k < i + w; k++) q += (L[k] * L[k] + R[k] * R[k]) / 2; if (db(Math.sqrt(q / w)) > -50) { last = (i + w) / sr; if (first < 0) first = i / sr; } }
    return { dur: last, first };
  }
  /** one-pole x2 lowpass RMS (dB) over [from,to) of the left channel -- used for the music-bass ducking probe */
  function lowRms(res, fc, from, to) {
    const L = res.channels[0], sr = res.sampleRate; const a = 1 - Math.exp(-2 * Math.PI * fc / sr);
    let y1 = 0, y2 = 0, q = 0, n = 0;
    for (let i = 0; i < to; i++) { y1 += a * (L[i] - y1); y2 += a * (y1 - y2); if (i >= from) { q += y2 * y2; n++; } }
    return db(Math.sqrt(q / Math.max(1, n)));
  }
  function rmsWin(res, from, to) { const L = res.channels[0], R = res.channels[1]; let q = 0; for (let i = from; i < to; i++) q += (L[i] * L[i] + R[i] * R[i]) / 2; return db(Math.sqrt(q / Math.max(1, to - from))); }
  return { analyse, effDur, lowRms, rmsWin, db };
})();
` });

const names = await t.page.evaluate(() => ({ tracks: window.__fizzpop.AUDIO.trackNames(), sfx: window.__fizzpop.AUDIO.sfxNames() }));
const f1 = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : String(x));
const result = {};

if (mode === 'music' || mode === 'all') {
  console.log('\n#### MUSIC (one intro+loop pass)   active = frames within 25 dB of loudest   bands: <60 | 60-150 | 150-500 | .5-2k | 2-6k | >6k  (% of power)');
  result.music = {};
  for (const n of names.tracks) {
    const r = await t.page.evaluate(async (n) => {
      const A = window.__fizzpop.AUDIO, info = A._info(n);
      const secs = info.kind === 'loop' ? info.introSeconds + info.loopSeconds : info.seconds + 1.5;
      const res = await A._renderOffline(n, secs);
      const a = __qa.analyse(res, 0, 0, { gateDb: -25 });
      return { info, a, peak: a.peak };
    }, n);
    result.music[n] = r.a;
    console.log(n.padEnd(10), `${f1(r.a.dur)}s  peak ${f1(r.a.peak, 3)}  rms ${f1(r.a.rmsDb)} dB  A-wtd active ${f1(r.a.aDb)} dB  centroid ${f1(r.a.centroid, 0)} Hz  bands ${r.a.bandsPct.map((x) => f1(x)).join(' | ')}   >0.55: ${r.a.pctOver55}%`);
  }
}

if (mode === 'sfx' || mode === 'all') {
  console.log('\n#### SFX  (effDur = time above -50 dBFS; A = A-weighted active level; fp = 8-band fingerprint)');
  result.sfx = {};
  for (const n of names.sfx) {
    const r = await t.page.evaluate(async (n) => {
      const A = window.__fizzpop.AUDIO;
      const res = await A._renderOffline(n, 2.8);
      const e = __qa.effDur(res);
      const a = __qa.analyse(res, 0, Math.round(Math.min(res.channels[0].length, (e.dur + 0.05) * res.sampleRate)), { gateDb: -30 });
      return { e, a, info: A._info(n) };
    }, n);
    result.sfx[n] = Object.assign({ effDur: r.e.dur, quiet: r.info.quiet, max: r.info.max }, r.a);
    const a = r.a;
    console.log(n.padEnd(12), `dur ${f1(r.e.dur, 2)}s peak ${f1(a.peak, 2)} active ${f1(a.activeDb)} dB  A-wtd ${f1(a.aDb)} dB  centroid ${f1(a.centroid, 0).padStart(5)} Hz  >6k ${f1(a.bandsPct[5])}%  <150 ${f1(a.bandsPct[0] + a.bandsPct[1])}%  max ${r.info.max}${r.info.quiet ? ' quiet' : ''}`);
  }
  // distinctness: cosine similarity of (8-band fingerprint) -- plus duration proximity
  const ks = Object.keys(result.sfx);
  const cos = (a, b) => { let d = 0, na = 0, nb = 0; a.forEach((x, i) => { const u = Math.sqrt(x), v = Math.sqrt(b[i]); d += u * v; na += u * u; nb += v * v; }); return d / Math.sqrt(na * nb); };
  const pairs = [];
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
    const A = result.sfx[ks[i]], B = result.sfx[ks[j]];
    pairs.push({ a: ks[i], b: ks[j], sim: cos(A.fp, B.fp), dd: Math.abs(A.effDur - B.effDur), dc: Math.abs(A.centroid - B.centroid) });
  }
  pairs.sort((x, y) => y.sim - x.sim);
  console.log('\nmost similar sfx pairs (spectral cosine; also centroid delta Hz and duration delta s):');
  pairs.slice(0, 14).forEach((p) => console.log(`  ${p.a} ~ ${p.b}  sim ${f1(p.sim, 3)}  dCentroid ${f1(p.dc, 0)} Hz  dDur ${f1(p.dd, 2)} s`));
  result.sfxPairs = pairs.slice(0, 30);
}

if (mode === 'stems' || mode === 'all') {
  console.log('\n#### STEMS (A-weighted active dB per voice; skip option isolates voices)');
  result.stems = {};
  for (const n of ['stage1', 'stage2', 'boss', 'title', 'entry', 'ending']) {
    const r = await t.page.evaluate(async (n) => {
      const A = window.__fizzpop.AUDIO, info = A._info(n);
      const secs = Math.min(info.kind === 'loop' ? info.introSeconds + info.loopSeconds : info.seconds, 26);
      const out = {};
      for (const [k, skip] of Object.entries({ all: [], lead: ['harm', 'bass', 'drum'], harm: ['lead', 'bass', 'drum'], bass: ['lead', 'harm', 'drum'], drum: ['lead', 'harm', 'bass'], nodrum: ['drum'], leadbass: ['harm', 'drum'] })) {
        const res = await A._renderOffline(n, secs, { skip, noComp: true });
        out[k] = __qa.analyse(res, 0, 0, { gateDb: -40 });
      }
      return out;
    }, n);
    result.stems[n] = r;
    const row = (k) => `${k} ${f1(r[k].aDb)}(rms ${f1(r[k].rmsDb)},pk ${f1(r[k].peak, 2)})`;
    console.log(n.padEnd(8), ['all', 'lead', 'harm', 'bass', 'drum'].map(row).join('   '));
    console.log('         bass-only bands:', r.bass.bandsPct.map((x) => f1(x)).join(' | '), `centroid ${f1(r.bass.centroid, 0)} Hz`, '   drums-only bands:', r.drum.bandsPct.map((x) => f1(x)).join(' | '), `   all bands:`, r.all.bandsPct.map((x) => f1(x)).join(' | '));
  }
}

if (mode === 'duck' || mode === 'all') {
  console.log('\n#### SFX-over-music ducking probe: low-band (<250 Hz) level of the MUSIC bed during an sfx, with the real compressor on, vs music only');
  result.duck = {};
  for (const bed of ['boss', 'stage1']) {
    for (const probe of ['pop', 'kill', 'trap', 'hurry', 'thunder', 'bomb', 'death', 'boss_hit', 'fire']) {
      const r = await t.page.evaluate(async ({ bed, probe }) => {
        const A = window.__fizzpop.AUDIO, sr = 44100;
        const at = 5.0, secs = 8.0;
        const base = await A._renderOffline(bed, secs);
        const withS = await A._renderOffline(bed, secs, { sfx: [[probe, at]] });
        const dur = Math.max(0.15, __qa.effDur(await A._renderOffline(probe, 2.8)).dur);
        const f = Math.round(at * sr), t1 = Math.round((at + dur) * sr), pre = Math.round((at - 0.5) * sr);
        const lowBase = __qa.lowRms(base, 250, f, t1), lowWith = __qa.lowRms(withS, 250, f, t1);
        // 400ms after the sfx ended (recovery), 250 Hz lowpass
        const r0 = Math.round((at + dur) * sr), r1 = Math.round((at + dur + 0.4) * sr);
        return { dur, dip: lowWith - lowBase, rec: __qa.lowRms(withS, 250, r0, r1) - __qa.lowRms(base, 250, r0, r1), full: __qa.rmsWin(withS, f, t1) - __qa.rmsWin(base, f, t1) };
      }, { bed, probe });
      result.duck[bed + '+' + probe] = r;
      console.log(`${bed.padEnd(7)} + ${probe.padEnd(9)} sfx ${f1(r.dur, 2)}s: music low-band change during sfx ${f1(r.dip)} dB, recovery(0.4 s after) ${f1(r.rec)} dB, total bus change ${f1(r.full)} dB`);
    }
  }
}
fs.writeFileSync(path.join(OUT, `measure_${mode}.json`), JSON.stringify(result, null, 1));
console.log('\nconsole errors:', t.errors.length ? t.errors : 'none');
await t.close();
