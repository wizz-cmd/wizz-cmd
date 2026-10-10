// QA (audio lens) -- VERIFY proposed SFX fixes WITHOUT touching src/: the audio source is copied to out/qa/audio/patched/,
// patched with replacement definitions, loaded in a throwaway page and measured with the same A-weighted / small-speaker metrics.
//   node test/qa_audio_proposals_sfx.mjs
import fs from 'fs';
import path from 'path';
import { launch, PROJECT } from '../tools/harness.mjs';
const P = path.join(PROJECT, 'out', 'qa', 'audio', 'patched');
fs.mkdirSync(P, { recursive: true });
let a = fs.readFileSync(path.join(PROJECT, 'src', '20_audio.js'), 'utf8');
const rep = (name, body) => {
  const re = new RegExp('    ' + name + ': \\{[\\s\\S]*?\\n    \\} \\},\\n');
  if (!re.test(a)) throw new Error('no match for ' + name);
  a = a.replace(re, body);
};
// ---- proposals -------------------------------------------------------------------------------------------------
rep('land', `    land: { max: 2, trim: 0.9, quiet: true, fn(k) {
      k.noise({ ft: 'bandpass', f: 1100, q: 1.2, d: 0.045, v: 0.35 });
      k.tone({ w: 'triangle', pts: [[0, 360], [0.05, 160]], d: 0.07, v: 0.4 });
      k.tone({ w: 'sine', pts: [[0, 130], [0.06, 70]], d: 0.08, v: 0.25 });
    } },
`);
rep('boss_hit', `    boss_hit: { max: 2, trim: 0.8, fn(k) {            // heavy thud + metallic clank (mid-heavy: survives small speakers)
      k.tone({ w: 'sine', pts: [[0, 300], [0.09, 70]], d: 0.24, v: 0.3 });
      k.tone({ w: 'saw', pts: [[0, 700], [0.14, 220]], d: 0.17, v: 0.55 });
      k.noise({ ft: 'bandpass', f: 2200, f2: 700, q: 0.9, d: 0.17, v: 1.0 });
      k.tone({ w: 0.5, f: 415, d: 0.1, v: 0.3 });
      k.tone({ w: 0.5, f: 637, d: 0.1, v: 0.26 });
    } },
`);
rep('thunder', `    thunder: { max: 1, trim: 0.73, fn(k) {
      k.noise({ ft: 'bandpass', f: 1800, f2: 300, q: 0.6, d: 0.55, v: 1.0 });
      k.tone({ w: 'saw', pts: [[0, 2000], [0.12, 160]], d: 0.16, v: 0.3 });
      k.tone({ w: 'saw', pts: [[0, 240], [0.45, 70]], d: 0.5, v: 0.3 });
      k.tone({ w: 'sine', pts: [[0, 95], [0.45, 34]], d: 0.5, v: 0.35 });
      [0.04, 0.1, 0.17, 0.27].forEach((at, i) => k.noise({ ft: 'highpass', f: 3000 + i * 800, d: 0.025, v: 0.3, at }));
    } },
`);
rep('bomb', `    bomb: { max: 1, trim: 0.58, fn(k) {
      k.noise({ ft: 'bandpass', f: 2600, f2: 300, q: 0.5, d: 0.75, v: 1.0 });
      k.tone({ w: 'saw', pts: [[0, 320], [0.5, 60]], d: 0.55, v: 0.3 });
      k.tone({ w: 'sine', pts: [[0, 150], [0.55, 30]], d: 0.65, v: 0.4 });
      k.noise({ ft: 'highpass', f: 2200, d: 0.07, v: 0.5 });
    } },
`);
fs.writeFileSync(path.join(P, '20_audio.patched.js'), a);
fs.writeFileSync(path.join(P, 'page.html'), `<!DOCTYPE html><html><body><script src="${path.join(PROJECT, 'src', '00_shared.js')}"></script><script src="${path.join(P, '20_audio.patched.js')}"></script></body></html>`);
fs.writeFileSync(path.join(P, 'page_orig.html'), `<!DOCTYPE html><html><body><script src="${path.join(PROJECT, 'src', '00_shared.js')}"></script><script src="${path.join(PROJECT, 'src', '20_audio.js')}"></script></body></html>`);

async function measure(html) {
  const t = await launch({ html });
  const out = await t.page.evaluate(async () => {
    const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));
    const aW = (f) => { if (f < 10) return 0; const f2 = f * f; const ra = (12194 ** 2 * f2 * f2) / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2)); return ra * ra * Math.pow(10, 0.2); };
    function fft(re, im) { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let tmp = re[i]; re[i] = re[j]; re[j] = tmp; tmp = im[i]; im[i] = im[j]; im[j] = tmp; } } for (let len = 2; len <= n; len <<= 1) { const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang); for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const ur = re[i + k], ui = im[i + k]; const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr; re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } } } }
    function hp(x, fc, sr) { const w0 = 2 * Math.PI * fc / sr, al = Math.sin(w0) / (2 * 0.707), c = Math.cos(w0), a0 = 1 + al; const b0 = (1 + c) / 2 / a0, b1 = -(1 + c) / a0, b2 = b0, a1 = -2 * c / a0, a2 = (1 - al) / a0; const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; y[i] = v; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; } return y; }
    function level(L, sr, N) {   // active A-weighted level + unweighted active RMS over frames within 30 dB of loudest
      const hop = N / 2; const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
      const frames = []; for (let s = 0; s + N <= L.length; s += hop) { let q = 0; for (let k = 0; k < N; k++) q += L[s + k] * L[s + k]; frames.push([s, q / N]); }
      const mx = Math.max(...frames.map((f) => f[1])); let aSum = 0, uSum = 0, c = 0;
      const re = new Float64Array(N), im = new Float64Array(N);
      for (const [s, p] of frames) { if (p < mx * 1e-3) continue; for (let k = 0; k < N; k++) { re[k] = L[s + k] * win[k]; im[k] = 0; } fft(re, im); let tot = 0, aw = 0; for (let b = 1; b < N / 2; b++) { const pw = re[b] * re[b] + im[b] * im[b]; tot += pw; aw += pw * aW(b * sr / N); } aSum += aw / Math.max(tot, 1e-30) * p; uSum += p; c++; }
      return { aDb: db(Math.sqrt(aSum / c)), rmsDb: db(Math.sqrt(uSum / c)) };
    }
    const A = (window.__fizzpop ? window.__fizzpop.AUDIO : AUDIO);
    const res = {};
    for (const n of ['jump', 'shoot', 'pop', 'trap', 'kill', 'food', 'land', 'boss_hit', 'thunder', 'bomb']) {
      const r = await A._renderOffline(n, 1.5, { noComp: true });
      const mono = new Float32Array(r.channels[0].length); for (let i = 0; i < mono.length; i++) mono[i] = (r.channels[0][i] + r.channels[1][i]) / 2;
      let pk = 0; for (const x of mono) pk = Math.max(pk, Math.abs(x));
      const full = level(mono, r.sampleRate, 2048), ph = level(hp(mono, 300, r.sampleRate), r.sampleRate, 2048);
      res[n] = { peak: +pk.toFixed(2), rms: +full.rmsDb.toFixed(1), aDb: +full.aDb.toFixed(1), phoneRms: +ph.rmsDb.toFixed(1), phoneLoss: +(full.rmsDb - ph.rmsDb).toFixed(1) };
    }
    return res;
  });
  await t.close();
  return out;
}
const o = await measure(path.join(P, 'page_orig.html')), n = await measure(path.join(P, 'page.html'));
console.log('sfx          | ORIGINAL: peak  rms   A-wtd  phone-loss | PROPOSED: peak  rms   A-wtd  phone-loss');
for (const k of Object.keys(o)) console.log(k.padEnd(12), '|', `${o[k].peak}  ${o[k].rms}  ${o[k].aDb}  ${o[k].phoneLoss}`.padEnd(30), '|', `${n[k].peak}  ${n[k].rms}  ${n[k].aDb}  ${n[k].phoneLoss}`);
