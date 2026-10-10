// QA (audio lens) -- compressor pumping probe: gain applied to the 500-3000 Hz band (lead/arp region) in 10 ms windows,
// compressor ON vs OFF, per track; reports mean/min GR, p95 dip, and how much the midrange gain breathes with the kick.
//   node test/qa_audio_pump.mjs
import { launch } from '../tools/harness.mjs';
const t = await launch({});
const r = await t.page.evaluate(async () => {
  const A = window.__fizzpop.AUDIO, out = {};
  const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));
  function bp(x, sr, lo, hi) {   // 2-pole HP at lo then 2-pole LP at hi (RBJ biquads)
    const bq = (type, fc) => { const w0 = 2 * Math.PI * fc / sr, al = Math.sin(w0) / (2 * 0.707), c = Math.cos(w0); let b0, b1, b2; if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; } else { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; } const a0 = 1 + al; return [b0 / a0, b1 / a0, b2 / a0, -2 * c / a0, (1 - al) / a0]; };
    const run = (x, f) => { const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < x.length; i++) { const v = f[0] * x[i] + f[1] * x1 + f[2] * x2 - f[3] * y1 - f[4] * y2; y[i] = v; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; } return y; };
    return run(run(x, bq('hp', lo)), bq('lp', hi));
  }
  for (const n of ['stage1', 'stage2', 'boss', 'title', 'entry', 'ending']) {
    const secs = 20;
    const on = await A._renderOffline(n, secs), off = await A._renderOffline(n, secs, { noComp: true });
    const sr = on.sampleRate, w = Math.floor(sr * 0.01);
    const a = bp(on.channels[0], sr, 500, 3000), b = bp(off.channels[0], sr, 500, 3000);
    const g = [];
    for (let i = 4 * sr; i + w <= a.length; i += w) { let p = 0, q = 0; for (let k = i; k < i + w; k++) { p += a[k] * a[k]; q += b[k] * b[k]; } if (q > 1e-9) g.push(db(Math.sqrt(p / q))); }
    g.sort((x, y) => x - y);
    const mean = g.reduce((x, y) => x + y, 0) / g.length;
    out[n] = { meanGain: +mean.toFixed(2), p5: +g[Math.floor(g.length * 0.05)].toFixed(2), p95: +g[Math.floor(g.length * 0.95)].toFixed(2), min: +g[0].toFixed(2), max: +g[g.length - 1].toFixed(2) };
  }
  return out;
});
for (const [k, v] of Object.entries(r)) console.log(k.padEnd(8), `midband gain applied by compressor: mean ${v.meanGain} dB, 5th pct ${v.p5}, 95th pct ${v.p95}, min ${v.min}, max ${v.max}   => breathing depth (p95-p5) ${(v.p95 - v.p5).toFixed(1)} dB`);
await t.close();
