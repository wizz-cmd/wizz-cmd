// FIZZ & POP — test/audio_spectro.mjs
// Renders a track/sfx offline and draws a log-frequency spectrogram PNG so the result can be inspected
// without listening (notes show up as horizontal lines, drums as vertical broadband bars).
// Usage: node test/audio_spectro.mjs <name> [startSec=0] [durSec=10] [out.png] [--tempo x]
import fs from 'fs';
import path from 'path';
import { launch, PROJECT } from '../tools/harness.mjs';

const argv = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const name = argv[0];
const start = +(argv[1] || 0), dur = +(argv[2] || 10);
const out = argv[3] || path.join(PROJECT, 'out', 'audio', `spec_${name}_${start}.png`);
if (!name) { console.error('usage: node test/audio_spectro.mjs <name> [start] [dur] [out.png]'); process.exit(2); }

const t = await launch({ html: path.join(PROJECT, 'test', 'audio_page.html') });
const dataUrl = await t.page.evaluate(async ({ name, start, dur }) => {
  const res = await AUDIO._renderOffline(name, start + dur);
  const sr = res.sampleRate, L = res.channels[0], R = res.channels[1];
  const N = 2048, HOP = 441;                       // 10 ms hop
  const frames = Math.floor((dur * sr - N) / HOP);
  const W = Math.min(frames, 1600), H = 360;
  const cv = document.createElement('canvas'); cv.width = W + 40; cv.height = H + 20;
  const g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height);
  const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
  const re = new Float32Array(N), im = new Float32Array(N);
  const rev = new Uint16Array(N); for (let i = 0; i < N; i++) { let r = 0; for (let b = 0; b < 11; b++) r |= ((i >> b) & 1) << (10 - b); rev[i] = r; }
  function fft() {
    for (let i = 0; i < N; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let size = 2; size <= N; size <<= 1) {
      const half = size >> 1, ang = -2 * Math.PI / size;
      for (let i = 0; i < N; i += size) for (let k = 0; k < half; k++) {
        const wr = Math.cos(ang * k), wi = Math.sin(ang * k), a = i + k, b = a + half;
        const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }
  const fmin = 50, fmax = 12000, off = Math.floor(start * sr);
  const img = g.createImageData(W, H);
  for (let x = 0; x < W; x++) {
    const base = off + Math.floor(x * (frames / W)) * HOP;
    for (let i = 0; i < N; i++) { re[i] = (L[base + i] + R[base + i]) * 0.5 * win[i]; im[i] = 0; }
    fft();
    for (let y = 0; y < H; y++) {
      const f = fmin * Math.pow(fmax / fmin, 1 - y / (H - 1));
      const bin = f * N / sr, b0 = Math.floor(bin);
      const m = Math.hypot(re[b0], im[b0]) / (N / 4);
      const dbv = 20 * Math.log10(m + 1e-9);
      const v = Math.max(0, Math.min(1, (dbv + 105) / 62));
      const c = [Math.min(255, v * 2 * 255), Math.max(0, Math.min(255, (v - 0.4) * 2.5 * 255)), v < 0.5 ? v * 300 : Math.max(0, 255 - (v - 0.5) * 600)];
      const p = (y * W + x) * 4; img.data[p] = c[0]; img.data[p + 1] = c[1]; img.data[p + 2] = c[2]; img.data[p + 3] = 255;
    }
  }
  g.putImageData(img, 40, 0);
  g.fillStyle = '#9ad'; g.font = '10px monospace';
  for (const f of [100, 200, 500, 1000, 2000, 5000, 10000]) {
    const y = (1 - Math.log(f / fmin) / Math.log(fmax / fmin)) * (H - 1);
    g.fillRect(36, y, 4, 1); g.fillText(f >= 1000 ? f / 1000 + 'k' : String(f), 2, y + 3);
  }
  for (let s = 0; s <= dur; s += (dur > 20 ? 5 : 1)) { const x = 40 + (s / dur) * W; g.fillRect(x, H, 1, 4); g.fillText(String(start + s), x, H + 14); }
  return cv.toDataURL('image/png');
}, { name, start, dur });
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
console.log(out, t.errors.length ? t.errors : '');
await t.close();
