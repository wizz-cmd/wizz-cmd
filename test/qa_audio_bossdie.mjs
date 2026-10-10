// QA (audio lens) -- boss defeat: clear_boss jingle and boss_die sfx start in the same frame (Game.popBossBubble).
// Measures how much of the jingle is masked by boss_die, the peak of the sum, and note collisions (B5 vs C6 etc.).
import { launch } from '../tools/harness.mjs';
const t = await launch({});
const r = await t.page.evaluate(async () => {
  const A = window.__fizzpop.AUDIO, db = (x) => 20 * Math.log10(Math.max(x, 1e-9));
  const jing = await A._renderOffline('clear_boss', 4.5);
  const die = await A._renderOffline('boss_die', 4.5);
  const both = await A._renderOffline('clear_boss', 4.5, { sfx: [['boss_die', 0]] });
  const sr = jing.sampleRate;
  const rms = (res, a, b) => { let q = 0; const L = res.channels[0], R = res.channels[1]; for (let i = Math.round(a * sr); i < Math.round(b * sr); i++) q += (L[i] * L[i] + R[i] * R[i]) / 2; return db(Math.sqrt(q / ((b - a) * sr))); };
  const out = { windows: [] };
  for (const [a, b] of [[0, 0.5], [0.5, 1.0], [1.0, 1.5], [1.5, 2.0], [2.0, 2.5], [2.5, 3.1]]) out.windows.push({ w: `${a}-${b}s`, jingle: +rms(jing, a, b).toFixed(1), boss_die: +rms(die, a, b).toFixed(1), diff: +(rms(jing, a, b) - rms(die, a, b)).toFixed(1) });
  let pk = 0; for (const x of both.channels[0]) pk = Math.max(pk, Math.abs(x));
  out.peakBoth = +pk.toFixed(3);
  return out;
});
console.log('window      jingle dB   boss_die dB   jingle minus boss_die (negative = jingle masked)');
r.windows.forEach((w) => console.log(w.w.padEnd(10), String(w.jingle).padStart(8), String(w.boss_die).padStart(12), String(w.diff).padStart(14)));
console.log('peak of both together:', r.peakBoth);
await t.close();
