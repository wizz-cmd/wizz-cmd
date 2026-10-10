// QA (audio lens) -- per-section loudness (dynamic arc) for each loop, rendered offline with the full chain.
//   node test/qa_audio_dynamics.mjs
import { launch } from '../tools/harness.mjs';
const t = await launch({});
const r = await t.page.evaluate(async () => {
  const A = window.__fizzpop.AUDIO, out = {};
  const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));
  for (const n of ['stage1', 'stage2', 'boss', 'title', 'ending', 'entry']) {
    const d = A._dump(n), info = A._info(n);
    const beat = 60 / d.bpm;
    const secs = info.seconds + 1;
    const res = await A._renderOffline(n, secs);
    const sr = res.sampleRate, L = res.channels[0], R = res.channels[1];
    // section time boundaries from step indices using swing-aware step times
    const fr = (st) => [d.swing / 2, d.swing / 2, (1 - d.swing) / 2, (1 - d.swing) / 2][st & 3];
    const tAt = new Float64Array(d.steps + 1); for (let s = 0; s < d.steps; s++) tAt[s + 1] = tAt[s] + beat * fr(s);
    out[n] = d.sections.map((sec) => {
      const a = Math.round((tAt[sec.start] + 0.06) * sr), b = Math.round((tAt[sec.start + sec.steps] + 0.06) * sr);
      let q = 0, pk = 0; for (let i = a; i < b && i < L.length; i++) { q += (L[i] * L[i] + R[i] * R[i]) / 2; pk = Math.max(pk, Math.abs(L[i])); }
      return { sec: sec.name, rmsDb: +db(Math.sqrt(q / Math.max(1, b - a))).toFixed(2), peak: +pk.toFixed(2) };
    });
  }
  return out;
});
for (const [k, v] of Object.entries(r)) {
  const vals = v.map((x) => x.rmsDb);
  console.log(k.padEnd(8), v.map((x) => `${x.sec}: ${x.rmsDb} dB`).join('   '), `   => spread ${(Math.max(...vals) - Math.min(...vals)).toFixed(2)} dB`);
}
await t.close();
