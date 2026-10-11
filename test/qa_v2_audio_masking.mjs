// QA v2 / lens "audio" -- are the SFX audible OVER the music?  For several music contexts (the loudest drops, a verse, a menu) every SFX is mixed into the real
// render at a known time (AUDIO._renderOffline opts.sfx), the music-only render is subtracted, and the SFX contribution is compared with the music in the same
// window:  (1) snrActive = K-weighted power of the SFX in its active 10 ms frames vs the music in the same frames;  (2) audible% = share of the SFX's energy
// (1/2-octave bands 125 Hz..8 kHz, 43 ms frames) that sits at or above the music's band energy (SNR >= 0 dB) -- the simple masking criterion.
// Usage: node test/qa_v2_audio_masking.mjs [ctx ...]   ctx = stage1_D2 stage2_C boss_F stage1_V title_B   -> out/qa_v2/audio/masking_<ctx>.json + console table
import fs from 'fs';
import path from 'path';
import { launch, PROJECT } from '../tools/harness.mjs';
import { DSP_SRC } from './audio_dsp.mjs';
const OUT = path.join(PROJECT, 'out/qa_v2/audio'); fs.mkdirSync(OUT, { recursive: true });
const CTX = {
  stage1_D2: { track: 'stage1', sec: 'D2' }, stage1_D1: { track: 'stage1', sec: 'D1' }, stage2_C: { track: 'stage2', sec: 'C' }, boss_F: { track: 'boss', sec: 'F' },
  stage1_V: { track: 'stage1', sec: 'V' }, title_B: { track: 'title', sec: 'B', only: ['menu_move', 'menu_select', 'pause'] },
};
const want = process.argv.slice(2).length ? process.argv.slice(2) : ['stage1_D2', 'stage2_C', 'boss_F', 'stage1_V', 'title_B'];
const SRCARG = process.env.AUDIO_SRC || path.join(PROJECT, 'out/qa_v2/audio/patched/20_audio_meas.js');   // measurement copy of src/20_audio.js: only adds an SFX polarity argument to the extra-sfx option           // QA: run against a patched copy of the audio module (never edits src/)
let pageHtml = path.join(PROJECT, 'test/audio_page.html');
if (SRCARG) { pageHtml = path.join(PROJECT, 'out/qa_v2/audio/_patched_page_' + path.basename(SRCARG) + '.html'); fs.writeFileSync(pageHtml, '<!DOCTYPE html><meta charset="utf-8"><title>p</title><script src="' + path.join(PROJECT, 'src/00_shared.js') + '"></script><script src="' + path.resolve(SRCARG) + '"></script>'); }
const t = await launch({ html: pageHtml });
t.page.on('crash', () => console.log('PAGE CRASH')); t.page.on('console', (m) => { if (m.type() !== 'log') console.log('[page]', m.text().slice(0, 200)); });
await t.page.addScriptTag({ content: DSP_SRC });
for (const cname of want) {
  const cx = CTX[cname];
  const res = await t.page.evaluate(async ({ cx }) => {
    const d = __dsp, dd = AUDIO._dump(cx.track), bpm = dd.bpm, beat = 60 / bpm;
    const fr = (st) => [dd.swing / 2, dd.swing / 2, (1 - dd.swing) / 2, (1 - dd.swing) / 2][st & 3];
    const tAt = new Float64Array(dd.steps + 1); for (let q = 0; q < dd.steps; q++) tAt[q + 1] = tAt[q] + beat * fr(q);
    const S = dd.sections.find((x) => x.name === cx.sec), a0 = tAt[S.start], b0 = tAt[S.start + S.steps];
    const names = (cx.only || AUDIO.sfxNames()).concat(cx.only ? [] : ['kill:6', 'kill:12', 'pop:6']);
    // one render per batch of slots (3 s apart inside the section)
    const slot = 3.0, per = Math.max(1, Math.floor((b0 - a0 - 2.5) / slot));
    const batches = []; for (let i = 0; i < names.length; i += per) batches.push(names.slice(i, i + per));
    const sr = 24000, N = 1024, EDGES = [125, 177, 250, 354, 500, 707, 1000, 1414, 2000, 2828, 4000, 5657, 8000];
    function pspec(x, a) {
      const re = new Float64Array(N), im = new Float64Array(N);
      for (let i = 0; i < N; i++) { const k = a + i; re[i] = k < x.length ? x[k] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1))) : 0; }
      for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let tt = re[i]; re[i] = re[j]; re[j] = tt; tt = im[i]; im[i] = im[j]; im[j] = tt; } }
      for (let len = 2; len <= N; len <<= 1) { const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
        for (let i = 0; i < N; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
          re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } } }
      const out = new Float64Array(EDGES.length - 1);
      for (let b = 1; b < N / 2; b++) { const f = b * sr / N; for (let e = 0; e < EDGES.length - 1; e++) if (f >= EDGES[e] && f < EDGES[e + 1]) { out[e] += re[b] * re[b] + im[b] * im[b]; break; } }
      return out;
    }
    const rows = [];
    const endT = b0 + 1.0;
    const base = await AUDIO._renderOffline(cx.track, endT, {});
    for (const batch of batches) {
      const list = batch.map((nm, i) => { const [n, p] = nm.split(':'); return [n, a0 + 1.0 + i * slot, p ? +p : 0, nm]; });
      // pitch option is not supported by opts.sfx (it renders at pitch 0): render pitched variants through the SFX table instead (see below)
      const mix = await AUDIO._renderOffline(cx.track, endT, { sfx: list.filter((l) => !l[2]).map((l) => [l[0], l[1]]) });
      const neg = await AUDIO._renderOffline(cx.track, endT, { sfx: list.filter((l) => !l[2]).map((l) => [l[0], l[1], -1]) });      // inverted SFX polarity: (mix - neg) / 2 = the SFX alone, (mix + neg) / 2 = the music as the chain left it (ducked / pumped included)
      for (const [n, at, p, nm] of list) {
        if (p) { rows.push({ n: nm, skipped: 'pitched variant: not mixable via opts.sfx' }); continue; }
        const a = Math.round((at - 0.02) * sr), len = Math.round(1.6 * sr);
        const sfx = mix.channels.map((c, ci) => { const o = new Float32Array(len); for (let i = 0; i < len; i++) o[i] = 0.5 * (c[a + i] - neg.channels[ci][a + i]); return o; });
        const mus = mix.channels.map((c, ci) => { const o = new Float32Array(len); for (let i = 0; i < len; i++) o[i] = 0.5 * (c[a + i] + neg.channels[ci][a + i]); return o; });
        // active frames of the SFX: 10 ms K-weighted
        const kw = sfx.map((c) => d.kWeight(c, sr)), km = mus.map((c) => d.kWeight(c, sr)), w = Math.round(0.01 * sr);
        const pw = (K, i) => { let s = 0; for (const c of K) for (let k = i; k < i + w; k++) s += c[k] * c[k]; return s / (w * K.length); };
        const ps = [], pm = []; for (let i = 0; i + w <= len; i += w) { ps.push(pw(kw, i)); pm.push(pw(km, i)); }
        const mx = Math.max.apply(null, ps), act = ps.map((v) => 10 * Math.log10(v + 1e-18) > 10 * Math.log10(mx) - 12);   // 12 dB: the (mix - inverted mix) / 2 estimate leaves a music-correlated residual about 20-30 dB down that a 25 dB window would average in
        let sa = 0, ma = 0, na = 0; ps.forEach((v, i) => { if (act[i]) { sa += v; ma += pm[i]; na++; } });
        const snrActive = 10 * Math.log10(sa / Math.max(1e-18, ma));
        const sfxK = -0.691 + 10 * Math.log10(sa / Math.max(1, na) + 1e-18), musK = -0.691 + 10 * Math.log10(ma / Math.max(1, na) + 1e-18);
        // band masking
        let eT = 0, eA = 0, eHalf = 0; const bandAud = new Float64Array(EDGES.length - 1), bandTot = new Float64Array(EDGES.length - 1);
        for (let i = 0; i + N <= len; i += N / 2) {
          const bs = pspec(sfx[0], i), bm = pspec(mus[0], i);
          for (let e = 0; e < bs.length; e++) { eT += bs[e]; bandTot[e] += bs[e]; if (bs[e] >= bm[e]) { eA += bs[e]; bandAud[e] += bs[e]; } if (bs[e] >= bm[e] * 0.5) eHalf += bs[e]; }
        }
        rows.push({ n: nm, sfxK, musK, snrActive, audible: eA / Math.max(1e-18, eT), audible3: eHalf / Math.max(1e-18, eT), peakMix: d.stats({ channels: mix.channels.map((c) => c.subarray(a, a + len)), sampleRate: sr }).peak });
      }
    }
    return { rows, a0, b0, per };
  }, { cx });
  fs.writeFileSync(path.join(OUT, `masking_${cname}.json`), JSON.stringify(res, null, 1));
  const f1 = (x, dd = 1) => (Number.isFinite(x) ? x.toFixed(dd) : String(x)), pad = (s, w) => String(s).padEnd(w);
  console.log(`\n== SFX over ${cname} (${cx.track} ${cx.sec})  sfxK / musK = K-weighted level of the SFX / of the music in the SFX's active 10 ms frames; SNR = difference; audible = share of SFX energy at or above the music per half-octave band`);
  console.log(pad('sfx', 13) + pad('sfxK', 7) + pad('musK', 7) + pad('SNR', 7) + pad('audible%', 9) + pad('aud(-3dB)%', 11) + 'peak');
  for (const r of res.rows) if (r.skipped) continue; else console.log(pad(r.n, 13) + pad(f1(r.sfxK), 7) + pad(f1(r.musK), 7) + pad(f1(r.snrActive), 7) + pad(f1(100 * r.audible, 0), 9) + pad(f1(100 * r.audible3, 0), 11) + f1(r.peakMix, 2));
}
if (t.errors.length) console.log('ERRORS', t.errors);
await t.close();
