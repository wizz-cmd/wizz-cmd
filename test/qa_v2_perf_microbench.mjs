// Micro-benchmark of Canvas2D op costs on the CPU rasteriser (per call and per px), to build a cost model for the frame breakdown.
import fs from 'fs';
import { open, OUT } from './qa_v2_perf_lib.mjs';
const t = await open({ vw: 1280, vh: 1000, dpr: 1 });
const res = await t.page.evaluate(() => {
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const dst = mk(1024, 896), g = dst.getContext('2d');
  g.fillStyle = '#05080f'; g.fillRect(0, 0, 1024, 896);
  const spr = (S) => { const c = mk(S, S), x = c.getContext('2d'); const gr = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(60,242,255,0.6)'); gr.addColorStop(1, 'rgba(60,242,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, S, S); return c; };
  const S = { 16: spr(16), 32: spr(32), 64: spr(64), 96: spr(96), 128: spr(128), 512: spr(512) };
  const out = [];
  const flush = () => g.getImageData(0, 0, 1, 1);
  const bench = (label, fn, n, px) => {
    for (let i = 0; i < 20; i++) fn(i);
    flush();
    const t0 = performance.now();
    for (let i = 0; i < n; i++) fn(i);
    flush();
    const ms = performance.now() - t0;
    out.push({ label, us: +(ms / n * 1000).toFixed(2), nsPx: px ? +((ms / n * 1e6) / px).toFixed(2) : null });
  };
  // tiny flush overhead
  bench('noop fillRect 0x0 + (flush amortised)', () => g.fillRect(0, 0, 0, 0), 2000, 0);
  for (const op of ['source-over', 'lighter', 'screen']) {
    for (const a of [1, 0.4]) {
      for (const [sz, dsz] of [[16, 11], [32, 28], [64, 60], [128, 100], [128, 128], [128, 200]]) {
        g.globalCompositeOperation = op; g.globalAlpha = a; g.imageSmoothingEnabled = true;
        bench(`drawImage ${op} a=${a} ${sz}->${dsz} smooth`, (i) => g.drawImage(S[sz], 100 + (i % 20) * 30, 100 + (i % 7) * 40, dsz, dsz), 400, dsz * dsz);
      }
    }
  }
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  // smoothing off, same size 1:1
  for (const op of ['source-over', 'lighter']) {
    g.globalCompositeOperation = op; g.imageSmoothingEnabled = false;
    bench(`drawImage ${op} 128->128 nosmooth`, (i) => g.drawImage(S[128], 100 + (i % 20) * 30, 100 + (i % 7) * 40, 128, 128), 400, 128 * 128);
  }
  g.imageSmoothingEnabled = true; g.globalCompositeOperation = 'source-over';
  // full-frame passes
  const half = mk(512, 448); half.getContext('2d').fillStyle = 'rgba(30,60,90,1)'; half.getContext('2d').fillRect(0, 0, 512, 448);
  const full = mk(1024, 896); full.getContext('2d').fillStyle = 'rgba(30,60,90,0.5)'; full.getContext('2d').fillRect(0, 0, 1024, 896);
  const opq = mk(1024, 896); opq.getContext('2d').fillStyle = '#103050'; opq.getContext('2d').fillRect(0, 0, 1024, 896);
  const px = 1024 * 896;
  for (const op of ['source-over', 'lighter', 'screen', 'copy']) {
    g.globalCompositeOperation = op;
    g.imageSmoothingEnabled = false; bench(`FULL 2x nearest ${op} 512x448->1024x896`, () => g.drawImage(half, 0, 0, 1024, 896), 40, px);
    g.imageSmoothingEnabled = true; bench(`FULL 2x bilinear ${op} 512x448->1024x896`, () => g.drawImage(half, 0, 0, 1024, 896), 40, px);
    bench(`FULL 1:1 ${op} translucent 1024x896`, () => g.drawImage(full, 0, 0), 40, px);
    bench(`FULL 1:1 ${op} opaque 1024x896`, () => g.drawImage(opq, 0, 0), 40, px);
  }
  g.globalCompositeOperation = 'source-over';
  bench('fillRect full solid', () => { g.fillStyle = '#02040a'; g.fillRect(0, 0, 1024, 896); }, 40, px);
  bench('fillRect full alpha', () => { g.fillStyle = 'rgba(2,4,10,0.5)'; g.fillRect(0, 0, 1024, 896); }, 40, px);
  const gr = g.createRadialGradient(512, 448, 300, 512, 448, 700); gr.addColorStop(0, 'rgba(2,3,8,0)'); gr.addColorStop(1, 'rgba(2,3,8,0.62)');
  bench('fillRect full radial gradient (live vignette)', () => { g.fillStyle = gr; g.fillRect(0, 0, 1024, 896); }, 40, px);
  // downsample reads
  const q = mk(512, 448), qg = q.getContext('2d'); qg.imageSmoothingQuality = 'low';
  bench('downsample main 1024x896->512x448 (copy, low)', () => { qg.globalCompositeOperation = 'copy'; qg.drawImage(dst, 0, 0, 512, 448); qg.getImageData(0, 0, 1, 1); }, 40, 512 * 448);
  const q2 = mk(256, 224), q2g = q2.getContext('2d'); q2g.imageSmoothingQuality = 'low';
  bench('downsample main 1024x896->256x224 (copy, low) direct 4:1', () => { q2g.globalCompositeOperation = 'copy'; q2g.drawImage(dst, 0, 0, 256, 224); q2g.getImageData(0, 0, 1, 1); }, 40, 256 * 224);
  q2g.imageSmoothingQuality = 'medium';
  bench('downsample main 1024x896->256x224 (copy, medium)', () => { q2g.globalCompositeOperation = 'copy'; q2g.drawImage(dst, 0, 0, 256, 224); q2g.getImageData(0, 0, 1, 1); }, 40, 256 * 224);
  q2g.imageSmoothingQuality = 'high';
  bench('downsample main 1024x896->256x224 (copy, high)', () => { q2g.globalCompositeOperation = 'copy'; q2g.drawImage(dst, 0, 0, 256, 224); q2g.getImageData(0, 0, 1, 1); }, 40, 256 * 224);
  // blur filter on small canvases
  const b = mk(256, 224), bg = b.getContext('2d');
  for (const px_ of [1.2, 2.6, 3.2]) bench(`blur(${px_}px) 256x224`, () => { bg.globalCompositeOperation = 'copy'; bg.filter = 'blur(' + px_ + 'px)'; bg.drawImage(q2, 0, 0); bg.filter = 'none'; bg.getImageData(0, 0, 1, 1); }, 40, 256 * 224);
  const b2 = mk(128, 112), bg2 = b2.getContext('2d');
  bench('blur(2px) 128x112', () => { bg2.globalCompositeOperation = 'copy'; bg2.filter = 'blur(2px)'; bg2.drawImage(q2, 0, 0, 128, 112); bg2.filter = 'none'; bg2.getImageData(0, 0, 1, 1); }, 40, 128 * 112);
  // strokes: rings
  g.globalCompositeOperation = 'lighter';
  for (const r of [10, 30, 80, 160]) {
    bench(`stroke circle r=${r} lw3.2 lighter`, () => { g.beginPath(); g.arc(512, 448, r, 0, 6.2832); g.lineWidth = 12; g.strokeStyle = 'rgba(60,242,255,0.16)'; g.stroke(); }, 60, 2 * Math.PI * r * 12);
    bench(`stroke circle r=${r} lw1.3 lighter`, () => { g.beginPath(); g.arc(512, 448, r, 0, 6.2832); g.lineWidth = 5; g.strokeStyle = 'rgba(60,242,255,0.5)'; g.stroke(); }, 60, 2 * Math.PI * r * 5);
    g.globalCompositeOperation = 'source-over';
    bench(`stroke circle r=${r} lw1.3 source-over`, () => { g.beginPath(); g.arc(512, 448, r, 0, 6.2832); g.lineWidth = 5; g.strokeStyle = 'rgba(60,242,255,0.5)'; g.stroke(); }, 60, 2 * Math.PI * r * 5);
    g.globalCompositeOperation = 'lighter';
    bench(`ring sprite 512 scaled to r=${r} (bbox ${2 * r + 14}) lighter`, () => g.drawImage(S[512], 512 - r - 7, 448 - r - 7, 2 * r + 14, 2 * r + 14), 60, (2 * r + 14) ** 2);
  }
  g.globalCompositeOperation = 'source-over';
  // text-like small tile blits (source-over) 48x48 1:1 and sprite 96x96 1:1 / flipped
  bench('tile 48x48 1:1 source-over', (i) => g.drawImage(S[64], 100 + (i % 20) * 30, 100 + (i % 7) * 40, 48, 48), 400, 48 * 48);
  bench('sprite 96x96 1:1 source-over', (i) => g.drawImage(S[96], 100 + (i % 20) * 30, 100 + (i % 7) * 40), 400, 96 * 96);
  bench('sprite 96x96 flipped (save/translate/scale/restore)', (i) => { g.save(); g.translate(2 * (100 + (i % 20) * 30) + 96, 0); g.scale(-1, 1); g.drawImage(S[96], 100 + (i % 20) * 30, 100 + (i % 7) * 40); g.restore(); }, 400, 96 * 96);
  return out;
});
for (const r of res) console.log(r.label.padEnd(64), String(r.us).padStart(9) + ' us', r.nsPx === null ? '' : String(r.nsPx).padStart(7) + ' ns/px');
fs.writeFileSync(OUT + '/microbench.json', JSON.stringify(res, null, 1));
await t.close();
