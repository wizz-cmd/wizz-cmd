// QA v2 / lens "audio" -- loudness of every drum character at the lane volumes the songs use (stage1 / stage2 / boss kit lanes), K-active + phone loss.
// Shows which kit voices are buried (e.g. the metallic 808 hat 'm' vs snare 's').
import fs from 'fs';
import path from 'path';
import { launch, PROJECT } from '../tools/harness.mjs';
import { DSP_SRC } from './audio_dsp.mjs';
const SRCARG = process.argv.indexOf('--src') > 0 ? process.argv[process.argv.indexOf('--src') + 1] : null;
let pageHtml = path.join(PROJECT, 'test/audio_page.html');
if (SRCARG) { pageHtml = path.join(PROJECT, 'out/qa_v2/audio/_patched_page.html'); fs.writeFileSync(pageHtml, '<!DOCTYPE html><meta charset="utf-8"><title>p</title><script src="' + path.join(PROJECT, 'src/00_shared.js') + '"></script><script src="' + path.resolve(SRCARG) + '"></script>'); }
const t = await launch({ html: pageHtml });
await t.page.addScriptTag({ content: DSP_SRC });
const rows = await t.page.evaluate(async () => {
  const d = __dsp, out = [];
  const lanes = { stage1: { kick: { vol: 1.2, drive: 1.6 }, snare: { vol: 0.5, hall: 0.12 }, hats: { vol: 0.4 }, perc: { vol: 0.3 } },
                  stage2: { kick: { vol: 1.2, drive: 2 }, snare: { vol: 0.45, hall: 0.12 }, hats: { vol: 0.4 }, perc: { vol: 0.3 } },
                  boss: { kick: { vol: 1.2, drive: 2.2 }, snare: { vol: 0.45, hall: 0.12 }, hats: { vol: 0.4 }, perc: { vol: 0.3 } } };
  const chars = 'kKbsSynBpfrtuvhomMdcxXzw'.split('');
  for (const song of ['stage1', 'stage2', 'boss']) {
    for (const ch of chars) {
      for (const vel of ['', ',', "'"]) {
        if (vel && !'hmsSK'.includes(ch)) continue;
        const def = { kind: 'jingle', bpm: 120, swing: 0.5, echo: 3, fb: 0.3, key: 4, mode: [0, 2, 3, 5, 7, 8, 10], gain: 1, lanes: lanes[song], sections: { D: { chords: '| Em | Em | Em |', p: { drums: '................ ' + ch + vel + '............... ................' } } }, order: ['D'] };
        const iss = AUDIO._define('demo_hit', def);
        const res0 = await AUDIO._renderOffline('demo_hit', 4.0, {});
        const res = { sampleRate: res0.sampleRate, channels: res0.channels.map((c) => c.slice(Math.round(1.98 * res0.sampleRate))) };
        const A = d.active(res.channels, res.sampleRate), ph = d.phone(res.channels, res.sampleRate), Ap = d.active(ph.chs, res.sampleRate);
        out.push({ song, ch: ch + vel, active: A.active, m100: A.m100, phone: Ap.active, peak: d.stats(res).peak, issues: iss.length });
      }
    }
  }
  return out;
});
const pad = (s, w) => String(s).padEnd(w);
for (const song of ['stage1', 'stage2', 'boss']) {
  console.log('\n' + song + ' kit lanes: K-active (dB), phone K-active');
  console.log(rows.filter((r) => r.song === song).map((r) => `${pad(r.ch, 3)} ${r.active.toFixed(1).padStart(6)} ${r.phone.toFixed(1).padStart(6)}`).join('\n'));
}
fs.writeFileSync(path.join(PROJECT, 'out/qa_v2/audio/kit_levels.json'), JSON.stringify(rows, null, 1));
await t.close();
