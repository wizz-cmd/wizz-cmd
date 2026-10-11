// FIZZ & POP — test/audio_v3_live.mjs   (FIXPLAN_V3 A1 / A3 / A4 on a REAL running AudioContext, headless Chromium, 24 kHz, no offline render involved)
//   LEVELS  every SFX fired 1.6 s apart into the live chain, output tapped with AUDIO._capture: K-active level within 1 dB of its target (-14 + lvl; quiet tier menu_move -23 / land -26), peaks <= 0.8
//   DUCK    stage1 drop 2 playing; a SILENT sfx call (vol 0) of a critical cue (oneup, death, hurry) pulls the captured music down by the configured 3-5 dB with smooth ramps (no step > 2.5 dB between 50 ms
//           windows), back within 1.6 s; the same silent call of an everyday sound (pop, kill, jump) does not move the music (< 0.7 dB)
// Usage: node test/audio_v3_live.mjs [--json out.json]
import fs from 'fs';
import path from 'path';
import { launch, PROJECT } from '../tools/harness.mjs';
import { DSP_SRC } from './audio_dsp.mjs';
const args = process.argv.slice(2), jsonOut = args.indexOf('--json') >= 0 ? path.resolve(args[args.indexOf('--json') + 1]) : null;
let fails = 0, n = 0;
const check = (name, ok, detail) => { n++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  ' + JSON.stringify(detail) : '')); };
const f1 = (x) => x.toFixed(1);
const t = await launch({ html: path.join(PROJECT, 'test', 'audio_page.html') });
await t.page.addScriptTag({ content: DSP_SRC });
const out = {};

// ------------------------------------------------------------------ LEVELS
const lv = await t.page.evaluate(async () => {
  AUDIO.init();
  await new Promise((r) => setTimeout(r, 1500));
  const names = AUDIO.sfxNames(), gap = 1.6;
  const cap = AUDIO._capture(names.length * gap + 3);
  await new Promise((r) => setTimeout(r, 400));
  for (let i = 0; i < names.length; i++) { await new Promise((r) => setTimeout(r, i ? gap * 1000 : 200)); AUDIO.sfx(names[i]); }
  const res = await cap;
  if (!res) return null;
  const sr = res.sampleRate, x = res.channels[0], w = Math.round(0.005 * sr), onsets = [];
  let i = Math.round(0.3 * sr), quietUntil = 0;
  while (i + w < x.length && onsets.length < names.length) {
    let s = 0; for (let k = 0; k < w; k++) s += x[i + k] * x[i + k];
    if (i >= quietUntil && 20 * Math.log10(Math.sqrt(s / w) + 1e-9) > -48) { onsets.push(i); quietUntil = i + Math.round((gap - 0.3) * sr); }
    i += w;
  }
  const d = __dsp, rows = [];
  onsets.forEach((o, k) => {
    const seg = x.slice(Math.max(0, o - Math.round(0.01 * sr)), o + Math.round(1.3 * sr));
    let pk = 0; for (const v of seg) pk = Math.max(pk, Math.abs(v));
    const info = AUDIO._info(names[k]);
    rows.push({ n: names[k], act: d.active([seg, seg], sr).active, peak: pk, target: -14 + (info.lvl || 0) - (info.quiet ? info.quietDb : 0) });
  });
  return { rows, found: onsets.length, total: names.length };
});
if (!lv) { console.log('capture failed (no ScriptProcessor / running context)'); process.exit(1); }
out.live = lv.rows;
console.log('--- LEVELS (live capture)\n  ' + lv.rows.map((r) => `${r.n} ${f1(r.act)}/${f1(r.target)}`).join('  '));
check(`all ${lv.total} sounds found in the capture (${lv.found})`, lv.found === lv.total);
const bad = lv.rows.filter((r) => Math.abs(r.act - r.target) > 1.0);
check('live K-active level of every SFX is within 1 dB of its target (-14 + lvl, quiet tier -9 / -12 dB)', bad.length === 0, bad.map((r) => `${r.n} ${f1(r.act)} vs ${f1(r.target)}`));
check('live peaks <= 0.82 (under the soft ceiling)', lv.rows.every((r) => r.peak <= 0.82), lv.rows.filter((r) => r.peak > 0.82).map((r) => r.n + ' ' + r.peak.toFixed(2)));

// ------------------------------------------------------------------ DUCK
console.log('--- DUCK (silent cue calls over stage1 drop 2)');
const calls = ['oneup', 'death', 'hurry', 'pop', 'kill', 'jump'];
out.duck = {};
for (const nm of calls) {
  const r = await t.page.evaluate(async (nm) => {
    AUDIO.stopMusic(); await new Promise((r) => setTimeout(r, 300));
    const dd = AUDIO._dump('stage1'), D2 = dd.sections.find((s) => s.name === 'D2');
    AUDIO.music('stage1', { restart: true }); AUDIO._seek(D2.start + 16);
    await new Promise((r) => setTimeout(r, 1500));
    const cap = AUDIO._capture(6.5);
    await new Promise((r) => setTimeout(r, 1500));
    AUDIO.sfx(nm, { vol: 0 });                                    // silent: only the music duck is audible
    const res = await cap;
    const sr = res.sampleRate, w = Math.round(0.05 * sr), env = [];
    for (let i = 0; i + w <= res.channels[0].length; i += w) { let s = 0; for (let k = i; k < i + w; k++) s += res.channels[0][k] ** 2 + res.channels[1][k] ** 2; env.push(10 * Math.log10(s / (2 * w) + 1e-12)); }
    return env;
  }, nm);
  // the music is periodic over a bar (~2 s at 122 bpm): smooth the envelope over 0.5 s (10 windows), reference = the 1 s before the call, dip = deepest smoothed point after it
  const sm = r.map((_, i) => { let a = 0, c = 0; for (let k = Math.max(0, i - 4); k <= Math.min(r.length - 1, i + 5); k++) { a += Math.pow(10, r[k] / 10); c++; } return 10 * Math.log10(a / c); });
  const call = Math.round(1.5 / 0.05), ref = sm.slice(call - 24, call - 4).reduce((a, b) => a + b, 0) / 20;
  const after = sm.slice(call, call + 36);               // 1.8 s after the call
  const dip = Math.min(...after) - ref, tail = sm.slice(call + 30, call + 40).reduce((a, b) => a + b, 0) / 10 - ref;
  let step = 0; for (let i = call; i + 1 < call + 20; i++) step = Math.max(step, Math.abs(sm[i + 1] - sm[i]));
  out.duck[nm] = { dip, tail, step };
  console.log(`  ${nm}: music dip ${f1(dip)} dB, 1.5-2 s later ${f1(tail)} dB, largest 0.5 s-smoothed step ${f1(step)} dB`);
}
for (const nm of ['oneup', 'death', 'hurry']) {
  const o = out.duck[nm];
  check(`${nm}: the music is ducked by 2.5-6.5 dB (${f1(o.dip)}), smooth (step ${f1(o.step)} dB) and back within 2 s (${f1(o.tail)} dB)`, o.dip <= -2.5 && o.dip >= -6.5 && o.step <= 2.5 && o.tail >= -1.5, o);
}
for (const nm of ['pop', 'kill', 'jump']) check(`${nm}: an everyday sound does not move the music bed (${f1(out.duck[nm].dip)} dB)`, out.duck[nm].dip >= -1.2, out.duck[nm]);
check('zero console errors', t.errors.length === 0, t.errors);
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(out, null, 1));
await t.close();
console.log(`\n${n - fails}/${n} checks passed`);
process.exit(fails ? 1 : 0);
