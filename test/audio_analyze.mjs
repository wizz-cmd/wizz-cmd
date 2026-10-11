// FIZZ & POP — test/audio_analyze.mjs   (v2.0 soundtrack, SPEC_V2 §6)
// Renders every music track (intro + 3 loop cycles), every SFX and every instrument demo through AUDIO._renderOffline in real Chromium, writes WAVs and prints
// tables.  Loudness is ITU-R BS.1770 K-weighted (test/audio_dsp.mjs): integrated LUFS (400 ms blocks, gated) for music, "K-active" level (10 ms windows within 25 dB
// of the loudest) for short sounds, 4x-oversampled true peak.
// Checks (exit code 1 on failure):
//   MUSIC  no NaN, zero clipped samples, TRUE PEAK <= -1 dBFS (+0.05 tolerance), integrated loudness of a steady loop cycle -18 LUFS +-3 (warn outside +-2), DC < 0.01,
//          loop seam (cycle 2 == cycle 3 envelope, no level jump / click at the boundary), key-lifted pass checked too, per-section loudness arc printed,
//          bass stem still audible on a phone-class speaker (300 Hz high-pass: the stem may lose at most 14 dB), jingles end clean (last 50 ms silent),
//          form gates of the SPEC_V2 §6 table (bars / bpm) unless the song is flagged `placeholder`.
//   SFX    (FIXPLAN_V3 A1: every SFX is rendered WARM -- started at 1.0 s on an already running chain, the way the game plays it; the old t=0 render hit the cold
//          master limiter, which swallowed up to 14 dB of the quiet sounds and mis-fitted every trim)  every non-quiet SFX sits on the same K-active level (target SFX_TARGET +- 1.0 dB incl. its `lvl` bonus), quiet ones (`quiet`) that many dB below,
//          true peak <= -1 dBFS, zero clipping, DC, tail silent, durations (clear <= 0.8 s, mostly < 0.45 s), SFX are clearly above the music (>= +3 dB K-active vs
//          the music median), the `kill` pitch ladder (+0..+12: level within 3 dB, spectral centroid rising), a phone-speaker check (<= 6 dB loss).
//   DEMOS  every instrument demo renders clean (no NaN / clipping / over-peak) and is within +-4 dB of its calibration target.
//   MIX    the loudest music with a pile of loud SFX stays below the ceiling (no clipping, true peak <= -0.9 dBFS).
// Usage: node test/audio_analyze.mjs [--only name1,name2] [--nowav] [--out dir] [--src file.js] [--apply-trims] [--fit-music] [--apply-gains] [--quick]
//   --only names    restrict to these tracks / sfx / demos            --nowav   do not write WAVs         --out dir   WAV directory (default out/v2/audio/wav)
//   --src file.js   analyse another audio source (e.g. the parts assembly)
//   --apply-trims   rewrite the per-sfx `trim` constants so every SFX lands on its K-active target (run until flat)
//   --fit-music     print the track `gain` that moves each loop to -18 LUFS;  --apply-gains writes them into the source
//   --quick         music: one loop cycle only, no stems / stress (CI smoke)
import fs from 'fs';
import path from 'path';
import { launch, PROJECT } from '../tools/harness.mjs';
import { DSP_SRC } from './audio_dsp.mjs';

const args = process.argv.slice(2);
const argVal = (k) => (args.indexOf(k) >= 0 ? args[args.indexOf(k) + 1] : null);
const onlyArg = argVal('--only') ? argVal('--only').split(',') : null;
const NOWAV = args.includes('--nowav'), QUICK = args.includes('--quick');
const OUT = argVal('--out') ? path.resolve(argVal('--out')) : path.join(PROJECT, 'out', 'v2', 'audio', 'wav');
fs.mkdirSync(OUT, { recursive: true });
const SRC_FILE = argVal('--src') ? path.resolve(argVal('--src')) : path.join(PROJECT, 'src', '20_audio.js');
const MUSIC_TARGET = -18, SFX_TARGET = -14;                // LUFS (music, integrated) / K-active dB (non-quiet SFX)
const JINGLE_TARGET = { start: -16, extend: -16, gameover: -18, clear_boss: -15 };   // integrated LUFS of the jingles

let pageHtml = path.join(PROJECT, 'test', 'audio_page.html');
if (argVal('--src')) {
  pageHtml = path.join(OUT, '_analyze_page.html');
  fs.writeFileSync(pageHtml, '<!DOCTYPE html><meta charset="utf-8"><title>analyze</title><script src="' + path.join(PROJECT, 'src', '00_shared.js') + '"></script><script src="' + SRC_FILE + '"></script>');
}
const t = await launch({ html: pageHtml });
await t.page.addScriptTag({ content: DSP_SRC });
// FIXPLAN_V3 A1: warm SFX render = the sound starts at 1.0 s of a silent running chain (a muted carrier), the result is cut at 0.98 s
await t.page.addScriptTag({ content: `window.warmSfx = async (n, pitch) => {
  const r = await AUDIO._renderOffline('menu_move', 3.9, { vol: 0, sfx: [[n, 1.0, 0, pitch || 0]] }), a = Math.round(0.98 * r.sampleRate);
  return { sampleRate: r.sampleRate, channels: r.channels.map((c) => c.slice(a)) };
};` });

const names = await t.page.evaluate(() => ({ tracks: AUDIO.trackNames(), sfx: AUDIO.sfxNames(), demos: AUDIO._demoNames() }));
const want = (n) => !onlyArg || onlyArg.includes(n);
const rows = [], problems = [], warnings = [];
const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : String(x));
const dbOf = (x) => 20 * Math.log10(Math.max(x, 1e-9));
const TP_LIMIT = 0.891 * 1.006;                                // -1 dBFS (+0.05 dB tolerance of the 4x estimator)

// SPEC_V2 §6 form table (gates unless the song is flagged placeholder)
const FORM = { title: { bpm: 92, bars: 32 }, stage1: { bpm: 122, bars: 72 }, stage2: { bpm: 126, bars: 72 }, boss: { bpm: 140, bars: 48 }, entry: { bpm: 76, bars: 16 }, ending: { bpm: 100, bars: 40 } };
const JINGLE_LEN = { start: [1.8, 2.4], extend: [2.6, 3.4], gameover: [3.4, 4.6], clear_boss: [2.6, 3.4] };

// ---------------------------------------------------------------- music
const musicLufs = [];
for (const name of names.tracks.filter(want)) {
  const info = await t.page.evaluate((n) => AUDIO._info(n), name);
  const isLoop = info.kind === 'loop', cycles = QUICK ? 2 : 3;
  const total = isLoop ? info.introSeconds + cycles * info.loopSeconds + 0.5 : info.seconds + 3.5;
  const r = await t.page.evaluate(async ({ n, total, isLoop, info, QUICK }) => {
    const res = await AUDIO._renderOffline(n, total);
    const sr = res.sampleRate, out = { renderMs: AUDIO._renderOffline.lastMs };
    const d = __dsp;
    if (isLoop) {
      const c1 = Math.round((info.introSeconds + info.loopSeconds) * sr), c2 = Math.round((info.introSeconds + 2 * info.loopSeconds) * sr);
      const cyc = d.slice(res, c1, c2);
      out.cycle = d.stats({ channels: cyc, sampleRate: sr });
      out.lufs = d.lufs(cyc, sr);
      out.tp = d.truePeak(d.slice(res));
      out.all = d.stats(res);
      if (!QUICK) out.seam = d.seam(res, c2, c2 - c1);
      const dd = AUDIO._dump(n), beat = 60 / dd.bpm;
      const fr = (st) => [dd.swing / 2, dd.swing / 2, (1 - dd.swing) / 2, (1 - dd.swing) / 2][st & 3];
      const tAt = new Float64Array(dd.steps + 1); for (let q = 0; q < dd.steps; q++) tAt[q + 1] = tAt[q] + beat * fr(q);
      const cyc0 = c1 / sr - tAt[dd.loopStart];
      out.arc = dd.sections.filter((x) => x.start >= dd.loopStart).map((x) => {
        const a = Math.round((cyc0 + tAt[x.start]) * sr), b = Math.round((cyc0 + tAt[x.start + x.steps]) * sr);
        return { sec: x.name, lufs: d.lufs(d.slice(res, a, b), sr).lufs };
      });
      if (info.lift) { const r2 = await AUDIO._renderOffline(n, info.introSeconds + info.loopSeconds + 0.5, { pass: 1 }); out.lifted = d.stats(r2); out.liftedTp = d.truePeak(r2.channels); }
      out.wav = d.wavB64(res, 0, Math.round((info.introSeconds + info.loopSeconds + 4) * sr));
      // bass stem on a phone-class speaker
      if (!QUICK) {
        const lanes = dd.lanes, bassL = lanes.filter((l) => ['pick', 'wood', 'sub', 'riff'].includes(l.inst)).map((l) => l.name);
        if (bassL.length) {
          const rb = await AUDIO._renderOffline(n, Math.min(20, info.loopSeconds), { skip: lanes.map((l) => l.name).filter((x) => bassL.indexOf(x) < 0), noComp: true, pass: 0 });
          const full = d.lufs(rb.channels, rb.sampleRate).lufs, ph = d.lufs(d.phone(rb.channels, rb.sampleRate).chs, rb.sampleRate).lufs;
          out.bassPhone = { full, phone: ph };
        }
      }
    } else {
      out.cycle = d.stats(res); out.all = out.cycle;
      out.lufs = d.lufs(res.channels, sr); out.active = d.active(res.channels, sr);
      out.tp = d.truePeak(res.channels);
      out.tail = d.tailDb(res, 50); out.endAt = info.seconds;
      out.wav = d.wavB64(res, 0, Math.round((info.seconds + 2.5) * sr));
      const L = res.channels[0], w = Math.floor(sr * 0.01); let lastAudible = 0;
      for (let i = 0; i + w <= L.length; i += w) { let s = 0; for (let k = i; k < i + w; k++) s += L[k] * L[k]; if (20 * Math.log10(Math.sqrt(s / w) + 1e-9) > -55) lastAudible = (i + w) / sr; }
      out.lastAudible = lastAudible;
    }
    return out;
  }, { n: name, total, isLoop, info, QUICK });
  if (!NOWAV) fs.writeFileSync(path.join(OUT, name + '.wav'), Buffer.from(r.wav, 'base64'));
  const s = r.cycle, tpDb = dbOf(r.tp);
  const ln = r.lufs.lufs;
  if (isLoop) musicLufs.push(ln);
  rows.push({ name, kind: info.kind, dur: isLoop ? info.loopSeconds : info.seconds, bars: info.bars, peak: s.peak, tpDb, lufs: ln, mom: r.lufs.momMax, clipped: r.all.clipped, silence: s.silence, dc: s.dc, nan: s.nan,
    extra: isLoop ? (r.seam ? `seam: env ${fmt(r.seam.envDiffDb, 2)}dB (max ${fmt(r.seam.envMaxDb, 1)}) jump ${fmt(r.seam.levelJumpDb)}dB click x${fmt(r.seam.clickRatio)}` : '') : `tail50ms ${fmt(r.tail, 1)}dB, audible to ${fmt(r.lastAudible)}s (timeline ${fmt(r.endAt)}s)`, ln: info.placeholder ? 'placeholder' : '' });
  if (r.all.nan) problems.push(`${name}: NaN samples`);
  if (r.all.clipped) problems.push(`${name}: ${r.all.clipped} clipped samples`);
  if (r.tp > TP_LIMIT) problems.push(`${name}: true peak ${fmt(tpDb)} dBFS > -1`);
  if (s.dc > 0.01) problems.push(`${name}: DC offset ${fmt(s.dc, 4)}`);
  if (isLoop) {
    if (r.lifted) {
      console.log(`  ${name}: lifted pass (+${info.lift} st): peak ${fmt(r.lifted.peak, 3)} clipped ${r.lifted.clipped}`);
      if (r.lifted.clipped || r.liftedTp > TP_LIMIT) problems.push(`${name}: lifted pass peak/clipping (tp ${fmt(dbOf(r.liftedTp))})`);
    }
    const vals = r.arc.map((x) => x.lufs).filter(Number.isFinite);
    console.log(`  ${name}: section arc (LUFS)  ` + r.arc.map((x) => `${x.sec} ${fmt(x.lufs, 1)}`).join('  ') + `   spread ${fmt(Math.max(...vals) - Math.min(...vals), 1)} dB`);
    if (!info.placeholder && ['stage1', 'stage2', 'ending', 'boss', 'title'].includes(name) && Math.max(...vals) - Math.min(...vals) < 2.5) warnings.push(`${name}: flat dynamic arc (spread ${fmt(Math.max(...vals) - Math.min(...vals), 1)} dB; quiet verse / loud drop contrast wanted)`);
    if (ln < MUSIC_TARGET - 3 || ln > MUSIC_TARGET + 3) problems.push(`${name}: integrated ${fmt(ln, 1)} LUFS outside ${MUSIC_TARGET}+-3`);
    else if (ln < MUSIC_TARGET - 2 || ln > MUSIC_TARGET + 2) warnings.push(`${name}: integrated ${fmt(ln, 1)} LUFS outside ${MUSIC_TARGET}+-2`);
    if (r.seam) {
      if (r.seam.envDiffDb > 1.2 || r.seam.envMaxDb > 9) problems.push(`${name}: loop not periodic (envelope diff mean ${fmt(r.seam.envDiffDb, 2)} dB, max ${fmt(r.seam.envMaxDb, 1)} dB)`);
      if (Math.abs(r.seam.levelJumpDb) > 6) warnings.push(`${name}: level jump ${fmt(r.seam.levelJumpDb)} dB at the loop seam (can be musical)`);
      if (r.seam.clickRatio > 3) problems.push(`${name}: click at seam x${fmt(r.seam.clickRatio)}`);
    }
    if (r.bassPhone) {
      const loss = r.bassPhone.full - r.bassPhone.phone;
      console.log(`  ${name}: bass stem ${fmt(r.bassPhone.full, 1)} LUFS -> ${fmt(r.bassPhone.phone, 1)} on a phone-class speaker (loss ${fmt(loss, 1)} dB)`);
      if (loss > 14) problems.push(`${name}: the bass stem loses ${fmt(loss, 1)} dB on a phone-class speaker (add harmonics: lane drive / lpf)`);
    }
    const f = FORM[name];
    if (f && !info.placeholder) {
      if (info.bpm !== f.bpm) problems.push(`${name}: ${info.bpm} bpm, SPEC_V2 says ${f.bpm}`);
      if (info.bars < f.bars) problems.push(`${name}: ${info.bars} bars, SPEC_V2 says >= ${f.bars}`);
    }
  } else {
    if (r.tail > -60) problems.push(`${name}: jingle does not end clean (last 50 ms ${fmt(r.tail, 1)} dB)`);
    const jl = JINGLE_LEN[name];
    if (jl && (info.seconds < jl[0] || info.seconds > jl[1])) problems.push(`${name}: ${fmt(info.seconds)} s outside ${jl[0]}..${jl[1]} s`);
    if (name === 'start' && info.seconds > 2.4) problems.push('start: > 2.4 s (FIXPLAN2 K7)');
    if (JINGLE_TARGET[name] !== undefined && Math.abs(ln - JINGLE_TARGET[name]) > 3) problems.push(`${name}: integrated ${fmt(ln, 1)} LUFS is ${fmt(ln - JINGLE_TARGET[name], 1)} dB from its target ${JINGLE_TARGET[name]}`);
    if (r.lastAudible > r.endAt + 1.8) warnings.push(`${name}: tail rings ${fmt(r.lastAudible - r.endAt)} s past the timeline end`);
  }
}
const musicMedian = musicLufs.length ? musicLufs.slice().sort((a, b) => a - b)[Math.floor(musicLufs.length / 2)] : MUSIC_TARGET;

// ---------------------------------------------------------------- sfx
const sfxRows = [];
for (const name of names.sfx.filter(want)) {
  const info = await t.page.evaluate((n) => AUDIO._info(n), name);
  const r = await t.page.evaluate(async (n) => {
    const res = await warmSfx(n), d = __dsp, st = d.stats(res);
    const end = Math.round(Math.min(res.channels[0].length, (st.effDur + 0.1) * res.sampleRate));
    const chs = d.slice(res, 0, end), ph = d.phone(chs, res.sampleRate);
    return { st, act: d.active(chs, res.sampleRate), tp: d.truePeak(res.channels), phoneAct: d.active(ph.chs, res.sampleRate).active, lowShare: ph.lowShare, tail: d.tailDb(res, 100),
      wav: d.wavB64(res, 0, Math.round(Math.min(res.channels[0].length, (st.effDur + 0.2) * res.sampleRate))) };
  }, name);
  if (!NOWAV) fs.writeFileSync(path.join(OUT, 'sfx_' + name + '.wav'), Buffer.from(r.wav, 'base64'));
  sfxRows.push({ name, quiet: info.quiet, quietDb: info.quietDb, lvl: info.lvl || 0, st: r.st, act: r.act.active, m100: r.act.m100, tpDb: dbOf(r.tp), phoneAct: r.phoneAct, lowShare: r.lowShare, tail: r.tail });
  if (r.st.nan) problems.push(`sfx ${name}: NaN`);
  if (r.st.clipped) problems.push(`sfx ${name}: clipped`);
  if (r.tp > TP_LIMIT) problems.push(`sfx ${name}: true peak ${fmt(dbOf(r.tp))} dBFS > -1`);
  if (r.tail > -70) problems.push(`sfx ${name}: tail not silent (${fmt(r.tail, 1)} dB)`);
  if (r.st.dc > 0.01) problems.push(`sfx ${name}: DC offset ${fmt(r.st.dc, 4)}`);
  if (r.st.effDur > 1.5 && name !== 'boss_die') warnings.push(`sfx ${name}: long (${fmt(r.st.effDur)} s)`);
  else if (r.st.effDur > 0.5 && !['boss_die', 'ghost', 'death', 'bomb', 'oneup', 'powerup', 'thunder', 'freeze', 'fire', 'water', 'letter', 'hurry', 'clear', 'trap', 'food', 'item_appear', 'spawn'].includes(name)) warnings.push(`sfx ${name}: ${fmt(r.st.effDur)} s (spec: mostly < 0.45 s)`);
}
const nonQuiet = sfxRows.filter((x) => !x.quiet);
const tgt = (x) => SFX_TARGET + x.lvl - (x.quiet ? x.quietDb : 0);
const median = nonQuiet.length ? nonQuiet.map((x) => x.act - x.lvl).sort((a, b) => a - b)[Math.floor(nonQuiet.length / 2)] : SFX_TARGET;
for (const x of sfxRows) {
  const d = x.act - tgt(x);
  if (Math.abs(d) > 1.0) problems.push(`sfx ${x.name}: K-active ${fmt(x.act, 1)} dB is ${fmt(d, 1)} dB from its target ${fmt(tgt(x), 1)}`);
  if (!x.quiet && x.act - x.phoneAct > 6) warnings.push(`sfx ${x.name}: loses ${fmt(x.act - x.phoneAct, 1)} dB on a phone-class speaker (300 Hz high-pass)`);
  if (x.name === 'clear' && x.st.effDur > 0.8) problems.push(`sfx clear: ${fmt(x.st.effDur)} s long (spec: <= 0.8 s)`);
}
if (nonQuiet.length >= 10 && musicLufs.length && median < musicMedian + 3) problems.push(`SFX median K-active ${fmt(median, 1)} dB is not clearly above the music (${fmt(musicMedian, 1)} LUFS; want >= +3 dB)`);

// ---------------------------------------------------------------- kill pitch ladder
if (!onlyArg || onlyArg.includes('kill')) {
  const ladder = await t.page.evaluate(async () => {
    const out = [], d = __dsp;
    for (const pitch of [0, 2, 4, 6, 8, 10, 12]) {
      const res = await warmSfx('kill', pitch);
      const st = d.stats(res), end = Math.round(Math.min(res.channels[0].length, (st.effDur + 0.1) * res.sampleRate));
      out.push({ pitch, peak: st.peak, act: d.active(d.slice(res, 0, end), res.sampleRate).active, tp: d.truePeak(res.channels), cen: d.centroid(res, 0, 0.17) });
    }
    return out;
  });
  console.log('kill pitch ladder: ' + ladder.map((r) => `+${r.pitch}: ${fmt(r.act, 1)} dB, pk ${fmt(r.peak)}, centroid ${Math.round(r.cen)} Hz`).join(' | '));
  const aMin = Math.min(...ladder.map((r) => r.act)), aMax = Math.max(...ladder.map((r) => r.act));
  if (aMax - aMin > 3) problems.push(`kill: K-active level varies ${fmt(aMax - aMin, 1)} dB across pitch +0..+12 (limit 3 dB)`);
  for (let i = 1; i < ladder.length; i++) if (ladder[i].cen < ladder[i - 1].cen * 1.02) problems.push(`kill: spectral centroid does not rise from +${ladder[i - 1].pitch} to +${ladder[i].pitch} (${Math.round(ladder[i - 1].cen)} -> ${Math.round(ladder[i].cen)} Hz)`);
  if (ladder.some((r) => r.tp > TP_LIMIT)) problems.push('kill: true peak > -1 dBFS at some pitch');
}

// ---------------------------------------------------------------- instrument demos
const demoRows = [];
const DEMO_TARGET = { demo_kit: -21, demo_industrial: -21, demo_fx: -22, demo_arp: -11.5 };      // demo_arp: FIXPLAN_V3 A5 raised INST.arp lv by 21 dB (the cold arp was 20-37 dB under its band at the authored lane vols of 0.3), so its demo sits 12.5 dB above the -24 convention
for (const name of names.demos.filter((n) => !onlyArg || onlyArg.includes(n) || onlyArg.includes('demos'))) {
  if (onlyArg && !onlyArg.includes(name) && !onlyArg.includes('demos')) continue;
  if (!onlyArg && QUICK) continue;
  const info = await t.page.evaluate((n) => AUDIO._info(n), name);
  const r = await t.page.evaluate(async ({ n, sec }) => {
    const res = await AUDIO._renderOffline(n, sec + 2.5), d = __dsp, st = d.stats(res);
    const lo = d.lufs(res.channels, res.sampleRate);
    return { st, lufs: lo.lufs, mom: lo.momMax, tp: d.truePeak(res.channels), ms: AUDIO._renderOffline.lastMs, wav: d.wavB64(res), bands: d.bands(res) };
  }, { n: name, sec: info.seconds });
  if (!NOWAV) fs.writeFileSync(path.join(OUT, name + '.wav'), Buffer.from(r.wav, 'base64'));
  demoRows.push({ name, dur: info.seconds, peakSources: info.peakSources, peak: r.st.peak, tpDb: dbOf(r.tp), lufs: r.lufs, clipped: r.st.clipped, ms: r.ms, bands: r.bands });
  if (r.st.nan) problems.push(`${name}: NaN`);
  if (r.st.clipped) problems.push(`${name}: ${r.st.clipped} clipped samples`);
  if (r.tp > TP_LIMIT * 1.03 && name !== 'demo_stress') problems.push(`${name}: true peak ${fmt(dbOf(r.tp))} dBFS`);
  const tg = DEMO_TARGET[name] !== undefined ? DEMO_TARGET[name] : (['demo_dense', 'demo_stress', 'demo_build', 'demo_stab', 'demo_sub'].includes(name) ? null : -24);
  if (tg !== null && Math.abs(r.lufs - tg) > 4) problems.push(`${name}: ${fmt(r.lufs, 1)} LUFS is ${fmt(r.lufs - tg, 1)} dB from its calibration target ${tg}`);
}

// ---------------------------------------------------------------- stems / mix stress
if (!onlyArg && !QUICK) {
  const pile = [['bomb', 2], ['thunder', 2.05], ['boss_hit', 2.1], ['boss_die', 3], ['death', 3.2], ['kill', 3.3], ['kill', 3.35], ['pop', 3.4], ['pop', 3.42], ['pop', 3.44],
    ['oneup', 5], ['powerup', 5.05], ['freeze', 5.1], ['fire', 6], ['water', 6.02], ['bomb', 6.05], ['boss_hit', 6.1], ['boss_hit', 6.15]];
  for (const n of ['boss', 'stage1', 'title']) {
    const st = await t.page.evaluate(async ({ n, pile }) => {
      const res = await AUDIO._renderOffline(n, 10, { sfx: pile });
      return { st: __dsp.stats(res), tp: __dsp.truePeak(res.channels) };
    }, { n, pile });
    console.log(`mix stress ${n} + ${pile.length} sfx: peak ${fmt(st.st.peak, 3)}, true peak ${fmt(dbOf(st.tp))} dBFS, clipped ${st.st.clipped}, RMS ${fmt(st.st.rmsDb, 1)} dB`);
    if (st.st.clipped || st.tp > 0.9047) problems.push(`mix stress ${n}: peak ${fmt(st.st.peak, 3)} true peak ${fmt(dbOf(st.tp))} dBFS clipped ${st.st.clipped}`);
  }
}

// ---------------------------------------------------------------- print
const pad = (s, n) => String(s).padEnd(n);
console.log('\nMUSIC (loops: one steady-state cycle; jingles: whole)   LUFS = K-weighted integrated, mom = loudest 400 ms, TP = true peak');
console.log(pad('name', 12) + pad('kind', 7) + pad('bars', 6) + pad('dur s', 8) + pad('peak', 7) + pad('TP dB', 7) + pad('LUFS', 7) + pad('mom', 7) + pad('clip', 6) + pad('DC', 8) + 'notes');
for (const r of rows) console.log(pad(r.name, 12) + pad(r.kind, 7) + pad(fmt(r.bars, 1), 6) + pad(fmt(r.dur, 1), 8) + pad(fmt(r.peak), 7) + pad(fmt(r.tpDb, 1), 7) + pad(fmt(r.lufs, 1), 7) + pad(fmt(r.mom, 1), 7) + pad(r.clipped, 6) + pad(fmt(r.dc, 4), 8) + r.extra + (r.ln ? '  [' + r.ln + ']' : ''));
if (sfxRows.length) {
  console.log('\nSFX   (K-act = K-weighted active level dB; target ' + SFX_TARGET + ' (+lvl, quiet: minus); m100 = loudest 100 ms; phone = K-act drop after a 300 Hz high-pass; <200 = power share below 200 Hz)');
  console.log(pad('name', 13) + pad('eff s', 7) + pad('peak', 7) + pad('TP dB', 7) + pad('K-act', 7) + pad('target', 8) + pad('m100', 7) + pad('phone', 7) + pad('<200', 6) + pad('clip', 6) + pad('DC', 8) + 'trim hint');
  for (const x of sfxRows) {
    const hint = Math.pow(10, (tgt(x) - x.act) / 20);
    console.log(pad(x.name + (x.quiet ? '*' : ''), 13) + pad(fmt(x.st.effDur), 7) + pad(fmt(x.st.peak), 7) + pad(fmt(x.tpDb, 1), 7) + pad(fmt(x.act, 1), 7) + pad(fmt(tgt(x), 1), 8) + pad(fmt(x.m100, 1), 7) + pad(fmt(x.phoneAct - x.act, 1), 7) + pad(Math.round(100 * x.lowShare) + '%', 6) + pad(x.st.clipped, 6) + pad(fmt(x.st.dc, 4), 8) + 'x' + fmt(hint, 3));
  }
  console.log('\nSFX median K-active (lvl removed): ' + fmt(median, 1) + ' dB;  music median ' + fmt(musicMedian, 1) + ' LUFS');
}
if (demoRows.length) {
  console.log('\nINSTRUMENT DEMOS (calibration: pitched -24 LUFS at lane vol 1, kit -21, fx -22)');
  console.log(pad('name', 17) + pad('dur', 6) + pad('srcs', 6) + pad('peak', 7) + pad('TP dB', 7) + pad('LUFS', 7) + pad('render %cpu', 13) + 'bands <90/<250/<1k/<4k/>4k %');
  for (const x of demoRows) console.log(pad(x.name, 17) + pad(fmt(x.dur, 1), 6) + pad(x.peakSources, 6) + pad(fmt(x.peak), 7) + pad(fmt(x.tpDb, 1), 7) + pad(fmt(x.lufs, 1), 7) + pad(fmt(100 * x.ms / 1000 / (x.dur + 2.5), 1), 13) + x.bands.map((b) => Math.round(100 * b)).join('/'));
}
// ---------------------------------------------------------------- fit / apply
if (args.includes('--apply-trims')) {
  // rewrite the per-sfx `trim` constants in the source so every SFX hits its K-active target (run repeatedly until the table is flat)
  let code = fs.readFileSync(SRC_FILE, 'utf8');
  const changes = [];
  for (const x of sfxRows) {
    const hint = Math.pow(10, (tgt(x) - x.act) / 20);
    const re = new RegExp('(\\n    ' + x.name + ': \\{ max: \\d+, rev: [0-9.]+, trim: )([0-9.]+)');
    const m = re.exec(code);
    if (!m) { console.log('apply-trims: no trim field for ' + x.name); continue; }
    const nv = Math.round(parseFloat(m[2]) * hint * 1000) / 1000;
    if (Math.abs(nv - parseFloat(m[2])) >= 0.002) changes.push(x.name + ' ' + m[2] + ' -> ' + nv);
    code = code.replace(re, '$1' + nv);
  }
  fs.writeFileSync(SRC_FILE, code);
  console.log('apply-trims: ' + (changes.length ? changes.join(', ') : 'nothing to change'));
}
if (args.includes('--fit-music') || args.includes('--apply-gains')) {
  let code = fs.readFileSync(SRC_FILE, 'utf8');
  const sugg = [];
  for (const r of rows) {
    const info = await t.page.evaluate((n) => AUDIO._info(n), r.name);
    const tgtL = r.kind === 'loop' ? MUSIC_TARGET : JINGLE_TARGET[r.name];
    if (tgtL === undefined) continue;
    const g = +(info.gain * Math.pow(10, (tgtL - r.lufs) / 20)).toFixed(3);
    sugg.push(`${r.name}: gain ${fmt(info.gain, 3)} -> ${g}  (${fmt(r.lufs, 1)} LUFS now)`);
    if (args.includes('--apply-gains')) {
      const i = code.indexOf('\n    D.' + r.name + ' = {') + 1;
      if (i >= 0) { const j = code.indexOf('gain:', i), k = code.indexOf('\n    D.', i + 5); if (j >= 0 && (k < 0 || j < k)) code = code.slice(0, j) + 'gain: ' + g + code.slice(j).replace(/^gain: [0-9.]+/, ''); }
    }
  }
  console.log('fit-music: ' + sugg.join('\n           '));
  if (args.includes('--apply-gains')) fs.writeFileSync(SRC_FILE, code);
}
if (t.errors.length) problems.push('console errors: ' + t.errors.join(' | '));
warnings.forEach((w) => console.log('warn: ' + w));
problems.forEach((p) => console.log('PROBLEM: ' + p));
console.log(`\n${problems.length} problem(s), ${warnings.length} warning(s)`);
await t.close();
process.exit(problems.length ? 1 : 0);
