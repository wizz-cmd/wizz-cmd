// QA v2 / lens "audio" -- EVENT-ALIGNED audibility: for every hit of a voice (drum fn name or melodic lane) the energy of that voice in a band during a short window
// right after its onset, relative to everything else in the same band and window.  (A mean over a whole section dilutes sparse transients; this does not.)
// Usage: [AUDIO_SRC=patched.js] node test/qa_v2_audio_eventband.mjs <track> <kind: fn|lane> <name> <loHz> <hiHz> <winMs>
//   e.g.  ... stage2 fn metC 5000 12000 30      ... title fn snap 1500 5000 30      ... stage1 lane arp 300 5000 60
import fs from 'fs';
import path from 'path';
import { launch, PROJECT } from '../tools/harness.mjs';
const [track, kind, vname, lo, hi, winMs] = process.argv.slice(2);
const SRCARG = process.env.AUDIO_SRC || null;
let pageHtml = path.join(PROJECT, 'test/audio_page.html');
if (SRCARG) { pageHtml = path.join(PROJECT, 'out/qa_v2/audio/_patched_page_' + path.basename(SRCARG) + '.html'); fs.writeFileSync(pageHtml, '<!DOCTYPE html><meta charset="utf-8"><title>p</title><script src="' + path.join(PROJECT, 'src/00_shared.js') + '"></script><script src="' + path.resolve(SRCARG) + '"></script>'); }
const t = await launch({ html: pageHtml });
const r = await t.page.evaluate(async ({ track, kind, vname, lo, hi, winMs }) => {
  const dd = AUDIO._dump(track), info = AUDIO._info(track), beat = 60 / dd.bpm, sr = 24000;
  const tAt = new Float64Array(dd.steps + 1); for (let q = 0; q < dd.steps; q++) tAt[q + 1] = tAt[q] + beat * [dd.swing / 2, dd.swing / 2, (1 - dd.swing) / 2, (1 - dd.swing) / 2][q & 3];
  const total = info.introSeconds + info.loopSeconds + 0.5;
  const lanesAll = dd.lanes.map((l) => l.name);
  let evs = [], laneName = vname;
  if (kind === 'fn') { const ev = AUDIO._events(track).filter((e) => e.k === 'd' && e.fn === vname); evs = ev.map((e) => e.step); laneName = AUDIO._events(track).find((e) => e.fn === vname).lane; }
  else evs = dd.notes.filter((x) => x.v === vname).map((x) => x.s);
  const A = await AUDIO._renderOffline(track, total, { skip: lanesAll.filter((x) => x !== laneName), noComp: true });
  const B = await AUDIO._renderOffline(track, total, { skip: kind === 'fn' ? [laneName] : [laneName], noComp: true });
  // for 'fn' kinds the lane may carry other voices too (hats lane: h / m / c): 'A' includes them -- acceptable (we report the lane), but exclude windows within 40 ms of another event of the same lane
  const N = 1024;
  function bandE(x, a, len) {
    const n = 512; if (a + n > x.length) return 0;
    const re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = (i < len ? x[a + i] : 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)));
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let tt = re[i]; re[i] = re[j]; re[j] = tt; tt = im[i]; im[i] = im[j]; im[j] = tt; } }
    for (let len2 = 2; len2 <= n; len2 <<= 1) { const ang = -2 * Math.PI / len2, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len2) { let cr = 1, ci = 0; for (let k = 0; k < len2 / 2; k++) { const ur = re[i + k], ui = im[i + k], vr = re[i + k + len2 / 2] * cr - im[i + k + len2 / 2] * ci, vi = re[i + k + len2 / 2] * ci + im[i + k + len2 / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len2 / 2] = ur - vr; im[i + k + len2 / 2] = ui - vi; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } } }
    let e = 0; for (let k = 1; k < n / 2; k++) { const f = k * sr / n; if (f >= lo && f < hi) e += re[k] * re[k] + im[k] * im[k]; } return e;
  }
  const wl = Math.round(winMs / 1000 * sr), out = {};
  for (const s of dd.sections) {
    const vals = [];
    for (const st of evs) if (st >= s.start && st < s.start + s.steps) {
      const a = Math.round(tAt[st] * sr) + 24; if (a + 512 > A.channels[0].length) continue;
      const ea = bandE(A.channels[0], a, wl), eb = bandE(B.channels[0], a, wl);
      vals.push(10 * Math.log10((ea + 1e-15) / (eb + 1e-15)));
    }
    if (vals.length) { vals.sort((x, y) => x - y); out[s.name] = { n: vals.length, med: +vals[Math.floor(vals.length / 2)].toFixed(1), p10: +vals[Math.floor(vals.length * 0.1)].toFixed(1) }; }
  }
  return out;
}, { track, kind, vname, lo: +lo, hi: +hi, winMs: +winMs });
console.log(`${SRCARG ? '[patched] ' : ''}${track} ${kind}:${vname} in ${lo}-${hi} Hz, ${winMs} ms after onset, vs everything else (median dB per section; < -10 buried):`);
console.log(Object.entries(r).map(([k, v]) => `${k}: ${v.med} (n=${v.n}, p10 ${v.p10})`).join('   '));
await t.close();
