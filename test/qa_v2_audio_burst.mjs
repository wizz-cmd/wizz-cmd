// QA v2 / lens "audio" -- SFX bursts over the loudest music: a chain reaction (6 kills + 3 pops + trap + food + item) 0.1 s apart on stage1 D2 / boss F.
// Measures sample / true peak, share of samples in the soft-ceiling shoulder (> 0.56), and how much the MUSIC itself is pushed down (least-squares projection of the
// music as left by the chain -- (mix + inverted-SFX-polarity mix) / 2 -- onto the music-only render in 50 ms windows: 1.0 = untouched, 0.7 = -3 dB) -- i.e. limiter pumping / soft-clip intermodulation.
import fs from 'fs';
import path from 'path';
import { launch, PROJECT } from '../tools/harness.mjs';
import { DSP_SRC } from './audio_dsp.mjs';
const SRCARG = process.env.AUDIO_SRC || path.join(PROJECT, 'out/qa_v2/audio/patched/20_audio_meas.js');   // measurement copy (adds an SFX polarity argument only)           // QA: run against a patched copy of the audio module (never edits src/)
let pageHtml = path.join(PROJECT, 'test/audio_page.html');
if (SRCARG) { pageHtml = path.join(PROJECT, 'out/qa_v2/audio/_patched_page_' + path.basename(SRCARG) + '.html'); fs.writeFileSync(pageHtml, '<!DOCTYPE html><meta charset="utf-8"><title>p</title><script src="' + path.join(PROJECT, 'src/00_shared.js') + '"></script><script src="' + path.resolve(SRCARG) + '"></script>'); }
const t = await launch({ html: pageHtml });
await t.page.addScriptTag({ content: DSP_SRC });
for (const [track, sec] of [['stage1', 'D2'], ['boss', 'F'], ['stage2', 'D2']]) {
  const r = await t.page.evaluate(async ({ track, sec }) => {
    const d = __dsp, dd = AUDIO._dump(track), beat = 60 / dd.bpm, sr = 24000;
    const tAt = new Float64Array(dd.steps + 1); for (let q = 0; q < dd.steps; q++) tAt[q + 1] = tAt[q] + beat * [dd.swing / 2, dd.swing / 2, (1 - dd.swing) / 2, (1 - dd.swing) / 2][q & 3];
    const S = dd.sections.find((x) => x.name === sec), a0 = tAt[S.start] + 2 * 16 * beat / 4 * 0 + 1.5;
    const burst = [['kill', 0], ['pop', 0.1], ['kill', 0.2], ['pop', 0.3], ['kill', 0.4], ['trap', 0.5], ['kill', 0.6], ['pop', 0.7], ['kill', 0.8], ['food', 0.9], ['kill', 1.0], ['item_appear', 1.1], ['powerup', 1.3]];
    const end = a0 + 4;
    const base = await AUDIO._renderOffline(track, end, {});
    const mix = await AUDIO._renderOffline(track, end, { sfx: burst.map(([n, dt]) => [n, a0 + dt]) });
    const neg = await AUDIO._renderOffline(track, end, { sfx: burst.map(([n, dt]) => [n, a0 + dt, -1]) });      // inverted SFX polarity: (mix + neg) / 2 = the music as the chain left it
    const a = Math.round(a0 * sr), len = Math.round(2.4 * sr), w = Math.round(0.05 * sr);
    let minRatio = 9, nOver = 0, nSh = 0, peak = 0, nTot = 0; const ratios = [];
    for (let i = 0; i + w <= len; i += w) {
      let xy = 0, xx = 0; for (let k = 0; k < w; k++) { const m = base.channels[0][a + i + k], y = 0.5 * (mix.channels[0][a + i + k] + neg.channels[0][a + i + k]); xy += m * y; xx += m * m; }
      const rr = xy / Math.max(1e-12, xx); ratios.push(+rr.toFixed(2)); if (xx > 1e-5) minRatio = Math.min(minRatio, rr);
    }
    for (let i = a; i < a + len; i++) for (const c of mix.channels) { const v = Math.abs(c[i]); peak = Math.max(peak, v); nTot++; if (v > 0.56) nSh++; if (v > 0.74) nOver++; }
    const seg = mix.channels.map((c) => c.slice(a, a + len)), segb = base.channels.map((c) => c.slice(a, a + len));
    return { minRatio, ratios, peak, tp: 20 * Math.log10(d.truePeak(seg)), shoulderPct: 100 * nSh / nTot, atCeilingPct: 100 * nOver / nTot, lufsMix: d.lufs(seg, sr).lufs, lufsBase: d.lufs(segb, sr).lufs, momMix: d.lufs(seg, sr).momMax, momBase: d.lufs(segb, sr).momMax };
  }, { track, sec });
  console.log(`${track} ${sec}: peak ${r.peak.toFixed(3)} TP ${r.tp.toFixed(1)} dBFS  >0.56: ${r.shoulderPct.toFixed(1)}%  >0.74: ${r.atCeilingPct.toFixed(2)}%  music gain min ${r.minRatio.toFixed(2)} (${(20 * Math.log10(r.minRatio)).toFixed(1)} dB)  LUFS music ${r.lufsBase.toFixed(1)} -> with burst ${r.lufsMix.toFixed(1)}  mom ${r.momBase.toFixed(1)} -> ${r.momMix.toFixed(1)}`);
  console.log('   music gain per 50 ms: ' + r.ratios.join(' '));
}
await t.close();
