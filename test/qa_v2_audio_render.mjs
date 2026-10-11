// QA v2 / lens "audio" -- offline renders of every track to 16-bit stereo WAV (24 kHz engine rate) + quick stats.
// Usage: node test/qa_v2_audio_render.mjs [--tempo 1.3] [--loops 2] [--tag x] name1 name2 ...
//   loops: how many loop cycles after the intro (2 = seam material).  Output: out/qa_v2/audio/wav/<name>[_t<tempo>].wav
import fs from 'fs';
import path from 'path';
import { launch, PROJECT } from '../tools/harness.mjs';
import { DSP_SRC } from './audio_dsp.mjs';

const args = process.argv.slice(2);
const val = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const tempo = +val('--tempo', 1), loops = +val('--loops', 2), tag = val('--tag', '');
const names = args;
const OUT = path.join(PROJECT, 'out/qa_v2/audio/wav'); fs.mkdirSync(OUT, { recursive: true });
const t = await launch({ html: path.join(PROJECT, 'test/audio_page.html') });
await t.page.addScriptTag({ content: DSP_SRC });
for (const name of names) {
  const r = await t.page.evaluate(async ({ name, tempo, loops }) => {
    const info = AUDIO._info(name);
    const sec = info.kind === 'sfx' ? 2.5 : info.kind === 'loop' ? (info.introSeconds + loops * info.loopSeconds) / tempo + 0.6 : info.seconds + 3;
    const res = await AUDIO._renderOffline(name, sec, { tempo: tempo === 1 ? undefined : tempo });
    const sr = res.sampleRate, d = __dsp;
    const L = d.lufs(res.channels, sr);
    const st = d.stats(res);
    return { sec, ms: AUDIO._renderOffline.lastMs, lufs: L.lufs, mom: L.momMax, tp: d.truePeak(res.channels), st, info, wav: d.wavB64(res) };
  }, { name, tempo, loops });
  const f = path.join(OUT, name + (tempo !== 1 ? '_t' + tempo : '') + tag + '.wav');
  fs.writeFileSync(f, Buffer.from(r.wav, 'base64'));
  const f1 = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : String(x));
  console.log(`${name.padEnd(12)} t${tempo} dur ${f1(r.sec)}s LUFS ${f1(r.lufs)} momMax ${f1(r.mom)} TP ${f1(20 * Math.log10(r.tp))} peak ${f1(r.st.peak, 3)} clip ${r.st.clipped} nan ${r.st.nan} dc ${f1(r.st.dc * 1000)}m render ${f1(r.ms / 1000)}s (${f1(100 * r.ms / 1000 / r.sec, 0)}% of realtime)`);
}
if (t.errors.length) console.log('ERRORS', t.errors);
await t.close();
