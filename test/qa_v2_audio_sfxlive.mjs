// QA v2 / lens "audio" -- LIVE cross-check of the SFX levels: a real running AudioContext (24 kHz, headless Chromium), every SFX fired 1.4 s apart,
// output tapped with AUDIO._capture, K-active level + peak per sound.  Compare with test/qa_v2_audio_sfxwarm.mjs (warm offline) and the composer's table (cold).
import fs from 'fs';
import path from 'path';
import { launch, PROJECT } from '../tools/harness.mjs';
import { DSP_SRC } from './audio_dsp.mjs';
const t = await launch({ html: path.join(PROJECT, 'test/audio_page.html') });
await t.page.addScriptTag({ content: DSP_SRC });
const rows = await t.page.evaluate(async () => {
  AUDIO.init();
  await new Promise((r) => setTimeout(r, 1500));
  const names = AUDIO.sfxNames(), gap = 1.6;
  const cap = AUDIO._capture(names.length * gap + 3);
  await new Promise((r) => setTimeout(r, 400));
  const fire = [];
  for (let i = 0; i < names.length; i++) { await new Promise((r) => setTimeout(r, i ? gap * 1000 : 200)); fire.push({ n: names[i], wall: performance.now() }); AUDIO.sfx(names[i]); }
  const res = await cap;
  if (!res) return null;
  // locate each sound by its onset: first window above -50 dBFS after the previous window
  const sr = res.sampleRate, x = res.channels[0], w = Math.round(0.005 * sr), onsets = [];
  let i = Math.round(0.3 * sr), quietUntil = 0;
  while (i + w < x.length && onsets.length < names.length) {
    let s = 0; for (let k = 0; k < w; k++) s += x[i + k] * x[i + k];
    if (i >= quietUntil && 20 * Math.log10(Math.sqrt(s / w) + 1e-9) > -45) { onsets.push(i); quietUntil = i + Math.round((gap - 0.3) * sr); }
    i += w;
  }
  const d = __dsp, out = [];
  onsets.forEach((o, k) => {
    const seg = [x.slice(Math.max(0, o - Math.round(0.01 * sr)), o + Math.round(1.3 * sr))];
    let pk = 0; for (const v of seg[0]) pk = Math.max(pk, Math.abs(v));
    out.push({ n: names[k], liveActive: d.active([seg[0], seg[0]], sr).active, livePeak: pk });
  });
  return { out, found: onsets.length };
});
if (!rows) { console.log('capture failed'); process.exit(1); }
fs.writeFileSync(path.join(PROJECT, 'out/qa_v2/audio/sfx_live.json'), JSON.stringify(rows, null, 1));
const warm = JSON.parse(fs.readFileSync(path.join(PROJECT, 'out/qa_v2/audio/sfx_warm.json'), 'utf8'));
console.log('found', rows.found, 'of 28');
console.log('sfx'.padEnd(13) + 'live K-act'.padEnd(12) + 'warm offline'.padEnd(14) + 'cold offline'.padEnd(14) + 'live peak');
for (const r of rows.out) { const w = warm.find((q) => q.n === r.n); console.log(r.n.padEnd(13) + r.liveActive.toFixed(1).padEnd(12) + w.warmActive.toFixed(1).padEnd(14) + w.coldActive.toFixed(1).padEnd(14) + r.livePeak.toFixed(2)); }
await t.close();
