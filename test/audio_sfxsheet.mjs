// FIZZ & POP — test/audio_sfxsheet.mjs
// Contact sheet: a small log-frequency spectrogram per SFX (0.8 s each, 50 Hz..12 kHz) -> out/audio/sfx_sheet.png
// Usage: node test/audio_sfxsheet.mjs [seconds=0.8] [out.png]
import fs from 'fs';
import path from 'path';
import { launch, PROJECT } from '../tools/harness.mjs';
const SEC = +(process.argv[2] || 0.8);
const OUT_PNG = process.argv[3] || path.join(PROJECT, 'out', 'audio', 'sfx_sheet.png');
const t = await launch({ html: path.join(PROJECT, 'test', 'audio_page.html') });
const dataUrl = await t.page.evaluate(async (SEC) => {
  const names = AUDIO.sfxNames();
  const cols = 6, TW = 240, TH = 150, pad = 18;
  const rows = Math.ceil(names.length / cols);
  const cv = document.createElement('canvas'); cv.width = cols * (TW + 6); cv.height = rows * (TH + pad + 6);
  const g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height);
  const N = 1024, HOP = 220;
  const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
  const re = new Float32Array(N), im = new Float32Array(N);
  const rev = new Uint16Array(N); for (let i = 0; i < N; i++) { let r = 0; for (let b = 0; b < 10; b++) r |= ((i >> b) & 1) << (9 - b); rev[i] = r; }
  function fft() {
    for (let i = 0; i < N; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let size = 2; size <= N; size <<= 1) { const half = size >> 1, ang = -2 * Math.PI / size;
      for (let i = 0; i < N; i += size) for (let k = 0; k < half; k++) { const wr = Math.cos(ang * k), wi = Math.sin(ang * k), a = i + k, b = a + half;
        const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr; re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; } }
  }
  names.forEach(async () => {});
  for (let n = 0; n < names.length; n++) {
    const res = await AUDIO._renderOffline(names[n], SEC + 0.1);
    const sr = res.sampleRate, L = res.channels[0];
    const frames = Math.floor((SEC * sr - N) / HOP);
    const ox = (n % cols) * (TW + 6), oy = Math.floor(n / cols) * (TH + pad + 6);
    const img = g.createImageData(TW, TH);
    for (let x = 0; x < TW; x++) {
      const base = Math.floor(x / TW * frames) * HOP;
      for (let i = 0; i < N; i++) { re[i] = L[base + i] * win[i]; im[i] = 0; }
      fft();
      for (let y = 0; y < TH; y++) {
        const f = 50 * Math.pow(12000 / 50, 1 - y / (TH - 1)), b0 = Math.floor(f * N / sr);
        const dbv = 20 * Math.log10(Math.hypot(re[b0], im[b0]) / (N / 4) + 1e-9);
        const v = Math.max(0, Math.min(1, (dbv + 85) / 60));
        const p = (y * TW + x) * 4;
        img.data[p] = Math.min(255, v * 2.2 * 255); img.data[p + 1] = Math.max(0, Math.min(255, (v - 0.35) * 2.6 * 255)); img.data[p + 2] = v < 0.5 ? v * 330 : Math.max(0, 255 - (v - 0.5) * 700); img.data[p + 3] = 255;
      }
    }
    g.putImageData(img, ox, oy + pad);
    g.fillStyle = '#fff'; g.font = '12px monospace'; g.fillText(names[n], ox + 2, oy + 13);
  }
  return cv.toDataURL('image/png');
}, SEC);
const out = OUT_PNG;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
console.log(out, t.errors);
await t.close();
