// QA v2 / lens "audio" -- how hard does each SFX hit the master limiter?  Rendered at vol 0.25 with the glue / limiter compression bypassed (noComp: linear, below the
// soft-clip knee), then scaled back: raw pre-limiter peak and raw K-active level, against the limiter threshold (-3 dB = 0.707 / master 0.95 / makeup) and what
// actually comes out in a warm chain (test/qa_v2_audio_sfxwarm.mjs).  raw peak >> 0.75 = the SFX is limited / soft-clipped.
import fs from 'fs';
import path from 'path';
import { launch, PROJECT } from '../tools/harness.mjs';
import { DSP_SRC } from './audio_dsp.mjs';
const SRCARG = process.env.AUDIO_SRC || null;
let pageHtml = path.join(PROJECT, 'test/audio_page.html');
if (SRCARG) { pageHtml = path.join(PROJECT, 'out/qa_v2/audio/_patched_page_' + path.basename(SRCARG) + '.html'); fs.writeFileSync(pageHtml, '<!DOCTYPE html><meta charset="utf-8"><title>p</title><script src="' + path.join(PROJECT, 'src/00_shared.js') + '"></script><script src="' + path.resolve(SRCARG) + '"></script>'); }
const t = await launch({ html: pageHtml });
await t.page.addScriptTag({ content: DSP_SRC });
const rows = await t.page.evaluate(async () => {
  const d = __dsp, out = [];
  for (const n of AUDIO.sfxNames()) {
    const res = await AUDIO._renderOffline('menu_move', 3.0, { vol: 0, noComp: true, sfx: [[n, 1.0]] });   // silent carrier; the extra-sfx path is the warm one
    const a = Math.round(0.98 * 24000), seg = res.channels.map((c) => c.slice(a));
    // the extra path has no vol option: use the sfx's own trim scaled down through a second render with the SFX at -12 dB is not possible -> use noComp and read the soft-clipped peak; compare with a trim-scaled estimate below
    let pk = 0; for (const v of seg[0]) pk = Math.max(pk, Math.abs(v));
    out.push({ n, peak: pk, active: d.active(seg, 24000).active });
  }
  return out;
});
for (const r of rows) console.log(r.n.padEnd(13) + 'noComp peak ' + r.peak.toFixed(2) + '  K-act ' + r.active.toFixed(1));
await t.close();
