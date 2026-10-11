// QA v2 / lens "audio" -- does an SFX push the MUSIC down?  Each SFX fired alone (1.5 s apart) over the loudest drop (stage1 D2 by default); the music-only render is the
// reference: gain_music(t) = <(mix + mixWithInvertedSfxPolarity)/2, music> / <music, music> over 25 ms windows (1.0 = untouched).  Reports the deepest dip (dB) and the time until the music is back
// within 1 dB, per SFX.  Usage: [AUDIO_SRC=patched.js] node test/qa_v2_audio_pump.mjs [track] [section] [sfx ...]
import fs from 'fs';
import path from 'path';
import { launch, PROJECT } from '../tools/harness.mjs';
import { DSP_SRC } from './audio_dsp.mjs';
const argv = process.argv.slice(2);
const track = argv[0] || 'stage1', sec = argv[1] || 'D2', only = argv.slice(2);
const SRCARG = process.env.AUDIO_SRC || path.join(PROJECT, 'out/qa_v2/audio/patched/20_audio_meas.js');   // measurement copy: only adds the SFX polarity argument
let pageHtml = path.join(PROJECT, 'test/audio_page.html');
if (SRCARG) { pageHtml = path.join(PROJECT, 'out/qa_v2/audio/_patched_page_' + path.basename(SRCARG) + '.html'); fs.writeFileSync(pageHtml, '<!DOCTYPE html><meta charset="utf-8"><title>p</title><script src="' + path.join(PROJECT, 'src/00_shared.js') + '"></script><script src="' + path.resolve(SRCARG) + '"></script>'); }
const t = await launch({ html: pageHtml });
await t.page.addScriptTag({ content: DSP_SRC });
const rows = await t.page.evaluate(async ({ track, sec, only }) => {
  const d = __dsp, dd = AUDIO._dump(track), beat = 60 / dd.bpm, sr = 24000;
  const tAt = new Float64Array(dd.steps + 1); for (let q = 0; q < dd.steps; q++) tAt[q + 1] = tAt[q] + beat * [dd.swing / 2, dd.swing / 2, (1 - dd.swing) / 2, (1 - dd.swing) / 2][q & 3];
  const S = dd.sections.find((x) => x.name === sec), a0 = tAt[S.start] + 1.0;
  const names = only.length ? only : ['jump', 'shoot', 'pop', 'kill', 'bounce', 'land', 'enemy_shot', 'menu_move', 'food', 'death', 'oneup', 'clear'];
  const per = 1.5, end = a0 + names.length * per + 0.5;
  const base = await AUDIO._renderOffline(track, end, {});
  const mix = await AUDIO._renderOffline(track, end, { sfx: names.map((n, i) => [n, a0 + i * per]) });
  const neg = await AUDIO._renderOffline(track, end, { sfx: names.map((n, i) => [n, a0 + i * per, -1]) });      // same SFX with inverted polarity: (mix + neg) / 2 cancels the SFX itself and leaves the MUSIC as the chain left it
  const w = Math.round(0.025 * sr), out = [];
  names.forEach((n, i) => {
    const a = Math.round((a0 + i * per) * sr), len = Math.round(1.0 * sr), g = [];
    for (let k = 0; k + w <= len; k += w) {
      let xy = 0, xx = 0; for (let j = 0; j < w; j++) { const m = base.channels[0][a + k + j], y = 0.5 * (mix.channels[0][a + k + j] + neg.channels[0][a + k + j]); xy += m * y; xx += m * m; }
      g.push(xx > 1e-6 ? xy / xx : 1);
    }
    const dips = g.map((x) => 20 * Math.log10(Math.max(1e-3, x)));
    const min = Math.min.apply(null, dips); let rec = 0; for (let k = 0; k < dips.length; k++) if (dips[k] < -1) rec = (k + 1) * 0.025;
    out.push({ n, dipDb: min, recoverS: rec });
  });
  return out;
}, { track, sec, only });
console.log(`${SRCARG ? '[patched] ' : ''}music dip under single SFX over ${track} ${sec} (dB, time until back within 1 dB):`);
console.log(rows.map((r) => `${r.n}: ${r.dipDb.toFixed(1)} dB / ${(r.recoverS * 1000).toFixed(0)} ms`).join('   '));
await t.close();
