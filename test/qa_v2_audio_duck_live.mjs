// QA v2 / lens "audio" -- live check of the priority-cue music duck (patched copy only): a silent SFX call (vol 0) fires 'death' / 'oneup' while stage1 D2 plays;
// the 50 ms RMS envelope of the captured MUSIC shows the dip depth and recovery.  Usage: AUDIO_SRC=<patched.js> node test/qa_v2_audio_duck_live.mjs [sfxname]
import fs from 'fs';
import path from 'path';
import { launch, PROJECT } from '../tools/harness.mjs';
const SRCARG = process.env.AUDIO_SRC || null, sfxName = process.argv[2] || 'death';
let pageHtml = path.join(PROJECT, 'test/audio_page.html');
if (SRCARG) { pageHtml = path.join(PROJECT, 'out/qa_v2/audio/_patched_page_' + path.basename(SRCARG) + '.html'); fs.writeFileSync(pageHtml, '<!DOCTYPE html><meta charset="utf-8"><title>p</title><script src="' + path.join(PROJECT, 'src/00_shared.js') + '"></script><script src="' + path.resolve(SRCARG) + '"></script>'); }
const t = await launch({ html: pageHtml });
const r = await t.page.evaluate(async (sfxName) => {
  AUDIO.init(); await new Promise((r) => setTimeout(r, 1200));
  const dd = AUDIO._dump('stage1'), D2 = dd.sections.find((s) => s.name === 'D2');
  AUDIO.music('stage1', { restart: true }); AUDIO._seek(D2.start + 16);
  await new Promise((r) => setTimeout(r, 1500));
  const cap = AUDIO._capture(6);
  await new Promise((r) => setTimeout(r, 1500));
  AUDIO.sfx(sfxName, { vol: 0 });
  const res = await cap;
  const sr = res.sampleRate, w = Math.round(0.1 * sr), out = [];
  for (let i = 0; i + w <= res.channels[0].length; i += w) { let s = 0; for (let k = i; k < i + w; k++) s += res.channels[0][k] ** 2 + res.channels[1][k] ** 2; out.push(+(10 * Math.log10(s / (2 * w) + 1e-12)).toFixed(1)); }
  return out;
}, sfxName);
console.log((SRCARG ? 'patched ' : 'original ') + sfxName + ' (silent sfx call at ~1.5 s): music RMS per 100 ms (dB)\n' + r.join(' '));
await t.close();
