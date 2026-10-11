// FIZZ & POP — test/audio_v3_proof.mjs   (FIXPLAN_V3 A2 / A5 / A6: a picture of what the mix fixes do)
// Renders the same passages with the v2.0 audio module (backup/v3/audio_20_audio.js, or --before file) and with the current src/20_audio.js, draws log-frequency spectrograms (200 Hz - 12 kHz) and puts
// them side by side in out/v3/audio/proof_mix.png:  stage2 verse A (metal 16th hats = vertical streaks at 6.5-12 kHz, cold arp = notes at 300-3000 Hz) and the title intro (finger snaps = short
// vertical ticks at 1.5-5 kHz).  Level scale identical for both sides (dB).  Usage: node test/audio_v3_proof.mjs [--before file.js] [--out file.png]
import fs from 'fs';
import path from 'path';
import { launch, PROJECT } from '../tools/harness.mjs';

const args = process.argv.slice(2);
const argVal = (k, d) => (args.indexOf(k) >= 0 ? args[args.indexOf(k) + 1] : d);
const BEFORE = path.resolve(argVal('--before', path.join(PROJECT, 'backup', 'v3', 'audio_20_audio.js')));
const AFTER = path.join(PROJECT, 'src', '20_audio.js');
const OUT = path.resolve(argVal('--out', path.join(PROJECT, 'out', 'v3', 'audio', 'proof_mix.png')));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const PASSAGES = [
  { label: 'stage2 verse A, bars 1-4 (metal hats 6.5-12 kHz, cold arp 0.3-3 kHz)', track: 'stage2', sec: 'A', bars: 4 },
  { label: 'title intro, bars 1-4 (finger snaps 1.5-5 kHz)', track: 'title', sec: 'I', bars: 4 },
];

async function spectro(srcFile, p) {
  const html = path.join(PROJECT, 'out', 'v3', 'audio', '_proof_' + path.basename(srcFile) + '.html');
  fs.writeFileSync(html, '<!DOCTYPE html><meta charset="utf-8"><title>p</title><script src="' + path.join(PROJECT, 'src/00_shared.js') + '"></script><script src="' + srcFile + '"></script>');
  const t = await launch({ html });
  const url = await t.page.evaluate(async ({ p }) => {
    const dd = AUDIO._dump(p.track), beat = 60 / dd.bpm;
    const tAt = new Float64Array(dd.steps + 1); for (let q = 0; q < dd.steps; q++) tAt[q + 1] = tAt[q] + beat * [dd.swing / 2, dd.swing / 2, (1 - dd.swing) / 2, (1 - dd.swing) / 2][q & 3];
    const S = dd.sections.find((x) => x.name === p.sec), start = tAt[S.start], dur = tAt[S.start + p.bars * 16] - start;
    const res = await AUDIO._renderOffline(p.track, start + dur + 0.2);
    const sr = res.sampleRate, L = res.channels[0], R = res.channels[1], N = 2048, HOP = 240, frames = Math.floor((dur * sr - N) / HOP), W = Math.min(frames, 900), H = 300;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'), img = g.createImageData(W, H);
    const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
    const re = new Float32Array(N), im = new Float32Array(N), rev = new Uint16Array(N);
    for (let i = 0; i < N; i++) { let r = 0; for (let b = 0; b < 11; b++) r |= ((i >> b) & 1) << (10 - b); rev[i] = r; }
    const fft = () => {
      for (let i = 0; i < N; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
      for (let size = 2; size <= N; size <<= 1) { const half = size >> 1, ang = -2 * Math.PI / size; for (let i = 0; i < N; i += size) for (let k = 0; k < half; k++) { const wr = Math.cos(ang * k), wi = Math.sin(ang * k), a = i + k, b = a + half, tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr; re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; } }
    };
    const fmin = 200, fmax = 11500, off = Math.floor(start * sr);
    for (let x = 0; x < W; x++) {
      const base = off + Math.floor(x * (frames / W)) * HOP;
      for (let i = 0; i < N; i++) { re[i] = (L[base + i] + R[base + i]) * 0.5 * win[i]; im[i] = 0; }
      fft();
      for (let y = 0; y < H; y++) {
        const f = fmin * Math.pow(fmax / fmin, 1 - y / (H - 1)), bin = f * N / sr, b0 = Math.floor(bin), m = Math.hypot(re[b0], im[b0]) / (N / 4), dbv = 20 * Math.log10(m + 1e-9), v = Math.max(0, Math.min(1, (dbv + 88) / 62));
        const q = (y * W + x) * 4; img.data[q] = Math.min(255, v * 2 * 255); img.data[q + 1] = Math.max(0, Math.min(255, (v - 0.4) * 2.5 * 255)); img.data[q + 2] = v < 0.5 ? v * 300 : Math.max(0, 255 - (v - 0.5) * 600); img.data[q + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return { url: cv.toDataURL('image/png'), dur };
  }, { p });
  await t.close();
  return url;
}

const shots = {};
for (const [lab, file] of [['before (v2.0)', BEFORE], ['after (FIXPLAN_V3)', AFTER]]) { shots[lab] = []; for (const p of PASSAGES) shots[lab].push(await spectro(file, p)); }
const t = await launch({ html: 'about:blank', viewport: { width: 1860, height: 760 } });
const rows = PASSAGES.map((p, i) => `<div class="row"><div class="cap">${p.label}</div>${Object.keys(shots).map((lab) => `<figure><img src="${shots[lab][i].url}"><figcaption>${lab} - ${shots[lab][i].dur.toFixed(1)} s, 200 Hz at the bottom, 11.5 kHz at the top</figcaption></figure>`).join('')}</div>`).join('');
await t.page.setContent(`<style>body{background:#10131a;color:#cde;font:13px monospace;margin:10px}.row{margin-bottom:14px}.cap{font-size:15px;margin:4px 0}figure{display:inline-block;margin:0 10px 0 0;vertical-align:top}img{width:900px;height:300px;image-rendering:auto;border:1px solid #345}figcaption{margin-top:3px}</style>${rows}`);
await t.page.screenshot({ path: OUT });
console.log(OUT);
await t.close();
