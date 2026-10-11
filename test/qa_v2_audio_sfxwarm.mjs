// QA v2 / lens "audio" -- SFX levels in a WARM chain.  AUDIO._renderOffline(sfxName) starts the sound at context time 0, where the master DynamicsCompressor
// (limiter) is still cold, and the sound comes out up to 14 dB too quiet (quiet sounds most).  The live game plays SFX into a running chain.  Here every SFX is
// started at t = 1.0 s through the extra-sfx option on a silent carrier, so the level is the live one; a real-time capture (AUDIO._capture) cross-checks.
import fs from 'fs';
import path from 'path';
import { launch, PROJECT } from '../tools/harness.mjs';
import { DSP_SRC } from './audio_dsp.mjs';
const SRCARG = process.env.AUDIO_SRC || null;           // QA: run against a patched copy of the audio module (never edits src/)
let pageHtml = path.join(PROJECT, 'test/audio_page.html');
if (SRCARG) { pageHtml = path.join(PROJECT, 'out/qa_v2/audio/_patched_page_' + path.basename(SRCARG) + '.html'); fs.writeFileSync(pageHtml, '<!DOCTYPE html><meta charset="utf-8"><title>p</title><script src="' + path.join(PROJECT, 'src/00_shared.js') + '"></script><script src="' + path.resolve(SRCARG) + '"></script>'); }
const t = await launch({ html: pageHtml });
await t.page.addScriptTag({ content: DSP_SRC });
const rows = await t.page.evaluate(async () => {
  const d = __dsp, sr = 24000, out = [];
  for (const n of AUDIO.sfxNames()) {
    const cold = await AUDIO._renderOffline(n, 3.0, {});
    const warm = await AUDIO._renderOffline('menu_move', 4.0, { vol: 0, sfx: [[n, 1.0]] });
    const a = Math.round(0.98 * sr), seg = warm.channels.map((c) => c.slice(a));
    const Ac = d.active(cold.channels, sr), Aw = d.active(seg, sr);
    let pc = 0, pw = 0; for (const v of cold.channels[0]) pc = Math.max(pc, Math.abs(v)); for (const v of seg[0]) pw = Math.max(pw, Math.abs(v));
    out.push({ n, coldActive: Ac.active, warmActive: Aw.active, warmM100: Aw.m100, warmM400: Aw.m400, coldPeak: pc, warmPeak: pw, warmTP: 20 * Math.log10(d.truePeak(seg)), delta: Aw.active - Ac.active });
  }
  return out;
});
fs.writeFileSync(path.join(PROJECT, 'out/qa_v2/audio/sfx_warm.json'), JSON.stringify(rows, null, 1));
const pad = (s, w) => String(s).padEnd(w), f1 = (x) => x.toFixed(1);
console.log(pad('sfx', 13) + pad('cold(t=0) K-act', 17) + pad('warm K-act', 12) + pad('delta', 7) + pad('warm m100', 11) + pad('warm m400', 11) + pad('coldPk', 8) + pad('warmPk', 8) + 'warmTP');
for (const r of rows) console.log(pad(r.n, 13) + pad(f1(r.coldActive), 17) + pad(f1(r.warmActive), 12) + pad(f1(r.delta), 7) + pad(f1(r.warmM100), 11) + pad(f1(r.warmM400), 11) + pad(r.coldPeak.toFixed(2), 8) + pad(r.warmPeak.toFixed(2), 8) + f1(r.warmTP));
await t.close();
