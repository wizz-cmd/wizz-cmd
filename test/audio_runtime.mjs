// FIZZ & POP — test/audio_runtime.mjs
// Real-time AudioContext test in headless Chromium: exercises the public AUDIO API with scripted sequences and
// checks behaviour + the internal leak counters (AUDIO._stats(): voices / tracks / groups).
// An AnalyserNode on the final output (AUDIO._tap()) proves that sound is (not) produced.
// Usage: node test/audio_runtime.mjs [--strict]       (exit code 1 on any failed check)
import fs from 'fs';
import path from 'path';
import { launch, PROJECT } from '../tools/harness.mjs';

// --strict: run the same checks against the code wrapped the way build.sh wraps it (one strict-mode IIFE).
let html = path.join(PROJECT, 'test', 'audio_page.html');
if (process.argv.includes('--strict')) {
  const src = ['00_shared.js', '20_audio.js'].map((f) => fs.readFileSync(path.join(PROJECT, 'src', f), 'utf8')).join('\n');
  html = path.join(PROJECT, 'out', 'audio', 'strict_page.html');
  fs.writeFileSync(html, '<!DOCTYPE html><meta charset="utf-8"><title>strict</title><script>(() => { "use strict";\n' + src + '\nwindow.AUDIO = AUDIO; window.U = U;\n})();<' + '/script>');
}
const t = await launch({ html });
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); };
const ev = (fn, ...a) => t.page.evaluate(fn, ...a);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// helpers living in the page
await ev(() => {
  window.T = {
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    // peak of the final output over `ms`
    async peak(ms) {
      const tap = AUDIO._tap(); const buf = new Float32Array(tap.fftSize); let mx = 0;
      const end = performance.now() + ms;
      while (performance.now() < end) { await T.sleep(20); tap.getFloatTimeDomainData(buf); for (let i = 0; i < buf.length; i++) mx = Math.max(mx, Math.abs(buf[i])); }
      return mx;
    },
    ended: [],
  };
});

// ------------------------------------------------------------------------------------------------
// 1. before init(): everything is a silent no-op, never throws
const pre = await ev(async () => {
  const out = { threw: null };
  try {
    AUDIO.sfx('pop'); AUDIO.sfx('does_not_exist'); AUDIO.stopMusic(); AUDIO.setTempo(1.3); AUDIO.setTempo(1);
    AUDIO.pause(); AUDIO.resume();
    out.ready = AUDIO.ready();
    AUDIO.music('title');                       // remembered, starts at init()
    out.stateBefore = AUDIO._state().music;
    const t0 = performance.now();
    AUDIO.jingle('start', { onEnd: () => { T.ended.push(['start-pre', performance.now() - t0]); } });
  } catch (e) { out.threw = String(e); }
  return out;
});
check('pre-init calls never throw', pre.threw === null, pre.threw);
check('ready() false before init', pre.ready === false);
check('pre-init music() is remembered (not playing)', pre.stateBefore === 'title');

// 2. init is idempotent and starts the remembered loop -- (a pre-init jingle cleared it: re-request after)
await ev(() => { AUDIO.init(); AUDIO.init(); AUDIO.init(); });
await wait(300);
let st = await ev(() => ({ s: AUDIO._stats(), r: AUDIO.ready() }));
check('init() creates a running context', st.s.ctxState === 'running' && st.r, st.s);
check('only one context / no track yet (pre-init jingle cancelled the pending loop)', st.s.tracks === 0, st.s);
const preJingle = await ev(async () => { await T.sleep(2700); return T.ended.slice(); });
check('pre-init jingle onEnd fired after the nominal length (~2.25 s; FIXPLAN2 K7: start <= 2.4 s)', preJingle.length === 1 && preJingle[0][1] > 2000 && preJingle[0][1] <= 2500, preJingle);

// 3. music plays and makes sound; same name is a no-op
await ev(() => AUDIO.music('title'));
await wait(400);
let peak = await ev(() => T.peak(500));
check('title music produces output', peak > 0.02, peak);
await ev(() => { AUDIO.music('title'); AUDIO.music('title'); AUDIO.music('title'); });
await wait(100);
st = await ev(() => AUDIO._stats());
check('music(same) does not stack tracks', st.tracks === 1 && st.active === 1, st);
await ev(() => AUDIO.music('title', { restart: true }));
await wait(500);
st = await ev(() => AUDIO._stats());
check('music(restart) replaces without leaving the old one', st.tracks === 1, st);

// 4. mute: silent but timeline keeps running; unmute restores
await ev(() => AUDIO.setMuted(true));
await wait(250);
peak = await ev(() => T.peak(400));
check('muted -> output silent', peak < 0.001, peak);
const c1 = (await ev(() => AUDIO._stats())).curCount;
// regression pass (wave 3): the step counter advances in lookahead bursts (3-4 steps per 500 ms were observed, >3 failed once in
// ~5 runs), so the same rate threshold (> 6 steps/s of 10) is measured over 1 s instead of 0.5 s; a stopped sequencer gives 0.
await wait(1000);
const c2 = (await ev(() => AUDIO._stats())).curCount;
check('muted: sequencer keeps running', c2 - c1 > 6, [c1, c2]);
check('isMuted() true + persisted', await ev(() => AUDIO.isMuted() && JSON.parse(localStorage.getItem('fizzpop.v1.muted')) === true));
await ev(() => AUDIO.setMuted(false));
await wait(300);
peak = await ev(() => T.peak(500));
check('unmuted -> sound back', peak > 0.02, peak);
check('toggleMuted returns new state', await ev(() => { const a = AUDIO.toggleMuted(); const b = AUDIO.toggleMuted(); return a === true && b === false; }));

// 5. setTempo applies mid-loop: steps per second scale with the tempo
await ev(() => AUDIO.music('stage1', { restart: true }));
await wait(600);
// steps per second of MUSICAL time: step count over the audio-clock time of the next unscheduled step (immune to the look-ahead jitter)
const rate = async (ms) => { const a = await ev(() => AUDIO._stats()); await wait(ms); const b = await ev(() => AUDIO._stats()); return (b.curCount - a.curCount) / (b.curNext - a.curNext); };
const r1 = await rate(1500);
await ev(() => AUDIO.setTempo(1.3));
await wait(400);
const r2 = await rate(1500);
await ev(() => AUDIO.setTempo(1));
await wait(400);
const r3 = await rate(1500);
check('tempo 1.0 = 10 steps/s at 150 bpm', Math.abs(r1 - 10) < 0.3, r1);
check('tempo 1.3 applied to the running loop', Math.abs(r2 / r1 - 1.3) < 0.05, [r1, r2]);
check('tempo back to 1.0', Math.abs(r3 - r1) < 0.3, r3);

// 5b. real-time loop wrap: fast tempo so the 16-bar title loop wraps within ~16 s; the step clock must stay steady
const wrap = await ev(async () => {
  AUDIO.setTempo(2); AUDIO.music('title', { restart: true });
  const r0 = AUDIO._stats().resyncs; const samples = [];
  let wraps = 0, lastPos = -1;
  const t0 = performance.now();
  while (performance.now() - t0 < 17500) {
    await T.sleep(100);
    const s = AUDIO._stats(); samples.push([performance.now() - t0, s.curCount]);
    if (lastPos > 100 && s.curPos < lastPos - 100) wraps++;
    lastPos = s.curPos;
  }
  AUDIO.setTempo(1);
  // steps/second between consecutive 1 s windows must stay ~ constant (144 bpm = 9.6 steps/s, x2 = 19.2 steps/s)
  const rates = [];
  for (let i = 10; i < samples.length; i += 10) rates.push((samples[i][1] - samples[i - 10][1]) / ((samples[i][0] - samples[i - 10][0]) / 1000));
  return { wraps, rates, resyncs: AUDIO._stats().resyncs - r0 };
});
check('title loop wrapped (intro played once, loop repeats)', wrap.wraps >= 1, wrap.wraps);
check('step clock steady across the loop wrap (no stalls, no resyncs)', wrap.resyncs === 0 && Math.max(...wrap.rates) - Math.min(...wrap.rates) < 2.5, wrap);

// 6. jingle + resume: previous loop continues afterwards; onEnd called once
const jr = await ev(async () => {
  AUDIO.music('stage1', { restart: true });
  await T.sleep(1500);
  const before = AUDIO._stats();
  let ends = 0, tEnd = 0; const t0 = performance.now();
  AUDIO.jingle('extend', { resume: true, onEnd: () => { ends++; tEnd = performance.now() - t0; } });
  await T.sleep(300);
  const during = AUDIO._state();
  const duringStats = AUDIO._stats();
  const pk = await T.peak(300);
  await T.sleep(3500);
  const after = AUDIO._state(); const afterStats = AUDIO._stats();
  await T.sleep(1500);
  const afterStats2 = AUDIO._stats();
  return { before, during, duringStats, pk, after, afterStats: afterStats2, ends, tEnd };
});
check('jingle replaces the loop while playing', jr.during.jingle === 'extend' && jr.during.music === null, jr.during);
check('jingle produces sound', jr.pk > 0.02, jr.pk);
check('jingle onEnd fired exactly once at ~3.2 s', jr.ends === 1 && jr.tEnd > 2900 && jr.tEnd < 3900, [jr.ends, Math.round(jr.tEnd)]);
check('resume:true brings stage1 back', jr.after.music === 'stage1' && jr.after.jingle === null, jr.after);
check('resumed loop restarted at the bar where it was interrupted', jr.afterStats.curPos - jr.afterStats.curCount === Math.floor(jr.before.curPos / 16) * 16, [jr.before.curPos, jr.afterStats.curPos, jr.afterStats.curCount]);
check('no stacked tracks after jingle+resume (finished jingle freed after its tail)', jr.afterStats.active === 1 && jr.afterStats.tracks === 1, jr.afterStats);

// 7. jingle without resume: silence afterwards ; interrupted jingle drops its onEnd
const jn = await ev(async () => {
  AUDIO.music('stage2', { restart: true }); await T.sleep(400);
  let ends = 0;
  AUDIO.jingle('gameover', { onEnd: () => ends++ });
  await T.sleep(500);
  AUDIO.music('boss', { restart: true });    // restart:true interrupts the jingle immediately
  await T.sleep(4500);
  const a = { ends, state: AUDIO._state(), stats: AUDIO._stats() };
  let ends2 = 0;
  AUDIO.stopMusic();
  AUDIO.jingle('start', { onEnd: () => ends2++ });
  await T.sleep(3600);
  return { a, ends2, state: AUDIO._state(), stats: AUDIO._stats() };
});
check('interrupted jingle: onEnd dropped, boss plays', jn.a.ends === 0 && jn.a.state.music === 'boss' && jn.a.stats.tracks === 1, jn.a);
check('jingle without resume: nothing afterwards, onEnd once', jn.ends2 === 1 && jn.state.music === null && jn.state.jingle === null, jn);

// 7b. music() during a jingle queues the loop behind it (jingle is not chopped, onEnd still fires)
const jq = await ev(async () => {
  AUDIO.stopMusic(); await T.sleep(200);
  let ends = 0; const t0 = performance.now(); let tEnd = 0;
  AUDIO.jingle('start', { onEnd: () => { ends++; tEnd = performance.now() - t0; } });
  await T.sleep(600);
  AUDIO.music('stage2');                      // e.g. Game asks for the round music while the start jingle still rings
  const during = AUDIO._state();
  await T.sleep(2100);
  const after = AUDIO._state(); const st = AUDIO._stats();
  return { ends, tEnd, during, after, st };
});
check('music() during a jingle is queued: jingle keeps playing', jq.during.jingle === 'start' && jq.ends >= 0, jq.during);
check('queued loop starts after the jingle; onEnd delivered', jq.after.music === 'stage2' && jq.ends === 1 && jq.tEnd > 2000, jq);

// 7c. re-entrancy: onEnd may start music or another jingle
const re = await ev(async () => {
  AUDIO.stopMusic(); await T.sleep(150);
  AUDIO.jingle('start', { onEnd: () => AUDIO.music('stage1') });
  await T.sleep(3500);
  const a = AUDIO._state();
  let chained = 0;
  AUDIO.jingle('extend', { resume: true, onEnd: () => { chained++; AUDIO.jingle('clear_boss', { resume: true, onEnd: () => { chained++; } }); } });
  await T.sleep(3500 + 3300);
  return { a, chained, b: AUDIO._state(), st: AUDIO._stats() };
});
check('onEnd -> music(): loop starts right after the jingle', re.a.music === 'stage1', re.a);
check('onEnd -> jingle(): chained jingles run, loop resumes, no stacking', re.chained === 2 && re.b.music === 'stage1' && re.st.tracks <= 2, re);

// 7d. FIXPLAN2 K7: the start jingle is over before the 2.5 s round-1 intro (<= 2.4 s), and the stage loop it hands over to starts
//     sample-accurately on the jingle's end line (the downbeat right after it), whether the loop is requested from onEnd (what Game
//     does) or earlier while the jingle is still sounding.
check('K7: start jingle nominal length <= 2.4 s', await ev(() => { const i = AUDIO._info('start'); return i.steps / 4 * 60 / i.bpm; }).then((x) => x <= 2.4 && x >= 1.8), undefined);
for (const mode of ['onEnd', 'early']) {
  const k7 = await ev(async (mode) => {
    AUDIO.stopMusic(); await T.sleep(250);
    AUDIO.music('title', { restart: true }); await T.sleep(600);                       // the title is sounding when a game starts
    let tEnd = 0, endStats = null; const t0 = performance.now();
    AUDIO.jingle('start', { onEnd: () => { tEnd = performance.now() - t0; if (mode === 'onEnd') AUDIO.music('stage1'); endStats = AUDIO._stats(); } });
    if (mode === 'early') { await T.sleep(900); AUDIO.music('stage1'); }               // requested while the jingle sounds (before its last notes are scheduled)
    await T.sleep(2700);
    const st = AUDIO._stats(), s = AUDIO._state();
    return { tEnd, endStats, st, s };
  }, mode);
  const startAt = mode === 'onEnd' ? k7.endStats.curStartAt : k7.st.curStartAt, jend = k7.st.lastJingleEnd;
  check(`K7 (${mode}): jingle over in <= 2.4 s, stage1 plays, and its first step is on the jingle's end line (|d| < 2 ms)`,
    k7.tEnd > 2000 && k7.tEnd <= 2400 && k7.s.music === 'stage1' && k7.s.jingle === null && k7.st.current === 'stage1' && jend !== null && Math.abs(startAt - jend) < 0.002,
    { tEnd: Math.round(k7.tEnd), music: k7.s.music, startAt, jend, d: startAt - jend });
}

// 7e. a loop requested at ANY moment of a jingle still starts behind it (regression: a request in the last ~0.4 s was dropped
//     because pump() had already chained/consumed the jingle's resume target -- silent entry / scores screens after GAME OVER)
const race = await ev(async () => {
  const secs = (() => { const i = AUDIO._info('start'); return i.steps / 4 * 60 / i.bpm; })();
  const rows = [];
  for (const d of [0.2, 1.0, 1.7, 1.85, 1.95, 2.0, 2.05, 2.1, 2.15, 2.2, 2.25, 2.3, 2.4, 2.6]) {
    AUDIO.stopMusic(); await T.sleep(300);
    AUDIO.jingle('start');
    await T.sleep(d * 1000);
    AUDIO.music('entry');
    await T.sleep(Math.max(0, secs - d) * 1000 + 1200);
    const s = AUDIO._state();
    rows.push({ d, music: s.music, jingle: s.jingle, cur: AUDIO._stats().current });
  }
  return rows;
});
check('music() requested at any moment of a jingle starts behind it (14 delays incl. its last 0.4 s)', race.every((r) => r.music === 'entry' && r.cur === 'entry' && r.jingle === null), race.filter((r) => r.music !== 'entry' || r.cur !== 'entry'));
const race2 = await ev(async () => {          // same for a jingle that resumes a loop (extend), asking for a different loop late in it
  const rows = [];
  for (const d of [0.5, 2.9, 3.05, 3.15, 3.3]) {
    AUDIO.music('stage1', { restart: true }); await T.sleep(500);
    AUDIO.jingle('extend', { resume: true });
    await T.sleep(d * 1000);
    AUDIO.music('boss');
    await T.sleep((3.2 - d) * 1000 + 2200);
    const s = AUDIO._state(), st = AUDIO._stats();
    rows.push({ d, music: s.music, cur: st.current, tracks: st.tracks });
  }
  return rows;
});
check('music(other loop) during/after a resuming jingle: the requested loop wins, nothing stacks', race2.every((r) => r.music === 'boss' && r.cur === 'boss' && r.tracks <= 2), race2);

// 8. onEnd fires even when muted
const jm = await ev(async () => {
  AUDIO.setMuted(true);
  let ends = 0; const t0 = performance.now(); let tEnd = 0;
  AUDIO.jingle('clear_boss', { onEnd: () => { ends++; tEnd = performance.now() - t0; } });
  await T.sleep(3500);
  AUDIO.setMuted(false);
  return { ends, tEnd };
});
check('muted jingle still calls onEnd (~3.1 s)', jm.ends === 1 && jm.tEnd > 2800 && jm.tEnd < 3800, jm);

// 9. pause/resume (music ducks at once, context suspends after ~0.3 s so the pause blip is heard), stopMusic with fade
const ps = await ev(async () => {
  AUDIO.music('entry', { restart: true }); await T.sleep(500);
  const p0 = await T.peak(300);
  AUDIO.pause();
  AUDIO.sfx('pause');                                   // played right after pause(): still audible (window before suspend)
  const gDuring = AUDIO._stats().groups;
  const ready0 = AUDIO.ready();
  await T.sleep(250);
  const pDucked = await T.peak(120);                    // music gone (sfx blip is over by now)
  await T.sleep(350);
  const s1 = AUDIO._stats();
  const c0 = s1.curCount; AUDIO.sfx('pop'); const g = AUDIO._stats().groups;
  await T.sleep(500);
  const c1 = AUDIO._stats().curCount;
  AUDIO.resume();
  await T.sleep(500);
  const s2 = AUDIO._stats(); const ready2 = AUDIO.ready();
  const p2 = await T.peak(400);
  AUDIO.stopMusic(0.3);
  await T.sleep(700);
  const p3 = await T.peak(300);
  await T.sleep(500);
  return { p0, gDuring, ready0, pDucked, s1, g, frozen: c1 - c0, s2, ready2, p2, p3, after: AUDIO._stats() };
});
check('pause(): ready() false at once, pause blip still allowed', ps.ready0 === false && ps.gDuring === 1, [ps.ready0, ps.gDuring]);
check('pause(): music ducks out immediately', ps.pDucked < 0.01, ps.pDucked);
check('pause suspends the context after the blip window', ps.s1.ctxState === 'suspended', ps.s1);
check('pause: later sfx ignored, sequencer frozen', ps.g === 0 && ps.frozen <= 2, [ps.g, ps.frozen]);
check('resume restores playback', ps.s2.ctxState === 'running' && ps.ready2 && ps.p2 > 0.02, [ps.s2.ctxState, ps.p2]);
check('stopMusic(fade) silences (only the echo tail remains)', ps.p3 < 0.08, ps.p3);
check('stopMusic frees the track', ps.after.tracks === 0 && ps.after.voices <= 12, ps.after);

// 10. rapid scene switching: never stacks, never leaks
const rs = await ev(async () => {
  const seq = ['music:stage1', 'music:stage2', 'jingle:start', 'stop', 'music:boss', 'jingle:extend:r', 'music:title', 'jingle:gameover', 'music:entry', 'music:ending', 'jingle:clear_boss:r'];
  let maxTracks = 0, maxActive = 0, errors = 0;
  for (let i = 0; i < 220; i++) {
    const [kind, name, flag] = seq[i % seq.length].split(':');
    try {
      if (kind === 'music') AUDIO.music(name, i % 7 === 0 ? { restart: true } : undefined);
      else if (kind === 'jingle') AUDIO.jingle(name, flag ? { resume: true } : undefined);
      else AUDIO.stopMusic(i % 2 ? 0.05 : 0);
    } catch (e) { errors++; }
    await T.sleep(i % 5 === 0 ? 3 : (i % 3 === 0 ? 40 : 12));
    const s = AUDIO._stats(); maxTracks = Math.max(maxTracks, s.tracks); maxActive = Math.max(maxActive, s.active);
  }
  AUDIO.stopMusic();
  await T.sleep(1200);
  return { maxTracks, maxActive, errors, after: AUDIO._stats() };
});
check('rapid switching: no exceptions', rs.errors === 0, rs.errors);
check('rapid switching: one scheduling track at a time; faded-out ones are freed within ~0.15 s', rs.maxActive <= 2 && rs.maxTracks <= 20, rs);
check('rapid switching: everything released after stopMusic', rs.after.tracks === 0 && rs.after.voices === 0, rs.after);

// 11. sfx: voice limits, unknown names warn once, all sfx play, nothing leaks
const sf = await ev(async () => {
  for (let i = 0; i < 30; i++) AUDIO.sfx('pop');
  const g1 = AUDIO._stats().groups;
  AUDIO.sfx('nope'); AUDIO.sfx('nope'); AUDIO.sfx('nope2');
  AUDIO.sfx('jump', { pitch: 7, vol: 0.5 }); AUDIO.sfx('shoot', { vol: 5 });
  const names = AUDIO.sfxNames();
  for (const n of names) { AUDIO.sfx(n); await T.sleep(30); }
  const peak = await T.peak(150);
  await T.sleep(3500);
  return { g1, n: names.length, after: AUDIO._stats(), peak };
});
check('sfx(pop) x30 limited to <= 3 concurrent groups', sf.g1 <= 3, sf.g1);
check('all 28 sfx names listed (27 + the new round-clear stinger)', sf.n === 28, sf.n);
check('sfx are audible', sf.peak > 0.02, sf.peak);
check('sfx leave no voices/groups behind', sf.after.voices === 0 && sf.after.groups === 0, sf.after);
const odd = await ev(() => { try { AUDIO.sfx('constructor'); AUDIO.sfx('__proto__'); AUDIO.sfx(undefined); AUDIO.sfx(42); AUDIO.sfx('pop', null); AUDIO.sfx('pop', { pitch: 'x', vol: 'y' }); AUDIO.music({}); AUDIO.jingle(null); return null; } catch (e) { return String(e); } });
check('odd sfx/music arguments never throw', odd === null, odd);
const warns = t.logs.filter((l) => l.includes('unknown sfx'));
check('unknown sfx warns once per name (no repeats), no error', new Set(warns).size === warns.length && warns.length >= 6 && t.errors.length === 0, warns);

// 12. every track starts and plays 0.5 s without errors; names API
const tr = await ev(async () => {
  const out = [];
  for (const n of AUDIO.trackNames()) {
    const isJingle = ['start', 'extend', 'gameover', 'clear_boss'].includes(n);
    if (isJingle) AUDIO.jingle(n); else AUDIO.music(n, { restart: true });
    await T.sleep(500);
    out.push([n, +(await T.peak(150)).toFixed(3)]);
  }
  AUDIO.stopMusic();
  await T.sleep(800);
  return { out, names: AUDIO.trackNames(), after: AUDIO._stats() };
});
check('every track audible', tr.out.every(([, p]) => p > 0.01), tr.out);
check('trackNames lists 6 loops + 4 jingles', tr.names.length === 10, tr.names);
check('no leaks after all tracks', tr.after.voices === 0 && tr.after.tracks === 0, tr.after);

// 13. unknown music / jingle names
const un = await ev(async () => { let ends = 0; AUDIO.music('zzz'); AUDIO.jingle('zzz', { onEnd: () => ends++ }); await T.sleep(100); return { ends, st: AUDIO._stats() }; });
check('unknown music/jingle: no throw, jingle onEnd still fires', un.ends === 1 && un.st.tracks === 0, un);


// ------------------------------------------------------------------------------------------------
// 13b. wave 2 -- bar-aligned loop switch (QA A8): the old loop plays to the end of its bar, the new one lands on the line
const sw = await ev(async () => {
  AUDIO.music('stage1', { restart: true }); await T.sleep(1300);
  AUDIO.music('stage2');
  const imm = AUDIO._state(), stImm = AUDIO._stats();
  await T.sleep(2300);
  const after = AUDIO._stats();
  // asking for the sounding loop again cancels a pending switch
  AUDIO.music('stage2', { restart: true }); await T.sleep(500);
  AUDIO.music('boss'); const pend = AUDIO._stats().switching;
  AUDIO.music('stage2'); const cancelled = AUDIO._stats().switching; const nameAfterCancel = AUDIO._state().music;
  await T.sleep(1800);
  const kept = AUDIO._state().music;
  // restart:true is still immediate
  AUDIO.music('boss', { restart: true });
  const immediate = AUDIO._stats();
  await T.sleep(300);
  return { imm, stImm: { current: stImm.current, switching: stImm.switching }, after, pend, cancelled, nameAfterCancel, kept, immediate: { current: immediate.current, switching: immediate.switching } };
});
check('loop->loop: the request is reported at once, the old loop keeps sounding', sw.imm.music === 'stage2' && sw.stImm.current === 'stage1' && sw.stImm.switching, [sw.imm.music, sw.stImm]);
check('loop->loop: lands on a half-bar/bar line within 1.9 s (<= 1.6 s of unscheduled music)', sw.after.current === 'stage2' && sw.after.lastSwitch && sw.after.lastSwitch.from === 'stage1' && sw.after.lastSwitch.pos % 8 === 0 && (sw.after.lastSwitch.at - sw.after.lastSwitch.requested) < 1.9, sw.after.lastSwitch);
check('loop->loop: faded-out loop is released, one track left', sw.after.tracks === 1 && sw.after.active === 1, [sw.after.tracks, sw.after.active]);
check('music(sounding loop) cancels a pending switch', sw.pend === true && sw.cancelled === false && sw.nameAfterCancel === 'stage2' && sw.kept === 'stage2', [sw.pend, sw.cancelled, sw.kept]);
check('music(restart:true) still switches at once', sw.immediate.current === 'boss' && sw.immediate.switching === false, sw.immediate);

// the switch itself must be click-free: capture the real output around it and compare the sample steps at the line with the rest
const sc = await ev(async () => {
  AUDIO.music('stage1', { restart: true }); await T.sleep(800);
  const cap = AUDIO._capture(4.5);
  await T.sleep(1200);
  AUDIO.music('boss');
  const rec = await cap;
  if (!rec) return null;
  const ls = AUDIO._stats().lastSwitch;
  const L = rec.channels[0], sr = rec.sampleRate, d = new Float32Array(L.length - 1);
  for (let i = 1; i < L.length; i++) d[i - 1] = Math.abs(L[i] - L[i - 1]);
  const sorted = Float32Array.from(d).sort(), p999 = sorted[Math.floor(sorted.length * 0.999)] || 1e-9;
  const at = Math.round((ls.at - rec.t0) * sr);
  let mx = 0; for (let i = Math.max(1, at - 220); i < Math.min(L.length - 1, at + 220); i++) mx = Math.max(mx, d[i - 1]);
  const rms = (a, b) => { let q = 0; for (let i = a; i < b; i++) q += L[i] * L[i]; return Math.sqrt(q / (b - a)); };
  return { ls, ratio: mx / p999, at, n: L.length, before: 20 * Math.log10(rms(at - 4410, at) + 1e-9), after: 20 * Math.log10(rms(at + 4410, at + 8820) + 1e-9) };
});
check('loop switch is click-free (sample step at the line <= 2.5 x the 99.9th percentile) and level-continuous', sc !== null && sc.ratio < 2.5 && Math.abs(sc.after - sc.before) < 12, sc);

const sj = await ev(async () => {
  AUDIO.music('title', { restart: true }); await T.sleep(1000);
  let ends = 0; let t0 = 0; let tEnd = 0;
  const cap = AUDIO._capture(2.0);
  await T.sleep(500);
  const tCall = AUDIO._stats().time;                         // audio-clock time of the call (the capture started ~0.5 s earlier)
  t0 = performance.now();
  AUDIO.jingle('start', { onEnd: () => { ends++; tEnd = performance.now() - t0; } });
  const imm = AUDIO._state(), st0 = AUDIO._stats();
  const rec = await cap;
  const L = rec.channels[0], sr = rec.sampleRate, d = new Float32Array(L.length - 1);
  for (let i = 1; i < L.length; i++) d[i - 1] = Math.abs(L[i] - L[i - 1]);
  const at = Math.round((tCall - rec.t0) * sr);
  // the title loop (fading out under the jingle) must not click: the sample steps in the 50 ms after the call (before the jingle's
  // first note starts, START_DELAY = 60 ms) stay within the range the loop itself produced before the call
  const before = Float32Array.from(d.subarray(Math.max(0, at - 22050), at)).sort();
  const ref = before[Math.floor(before.length * 0.9999)] || 1e-9;
  let mx = 0; for (let i = at; i < Math.min(d.length, at + 2205); i++) mx = Math.max(mx, d[i]);
  await T.sleep(2000);
  return { imm, cur: st0.current, ends, tEnd, ratio: mx / ref };
});
check('start jingle replacing a loop starts at once, the loop fades under it without a click, onEnd once at ~2.3 s',
  sj.imm.jingle === 'start' && sj.cur === 'start' && sj.ends === 1 && sj.tEnd > 2000 && sj.tEnd <= 2500 && sj.ratio < 1.5, [sj.imm.jingle, sj.cur, sj.ends, Math.round(sj.tEnd), +sj.ratio.toFixed(2)]);

// 13c. loop pass counter / key lift (QA A1) and the boss tempo cap
const pc = await ev(async () => {
  AUDIO.music('stage1', { restart: true }); await T.sleep(300);
  const p0 = AUDIO._stats().curPass, lift = AUDIO._info('stage1').lift, steps = AUDIO._info('stage1').bars * 16;
  AUDIO._seek(steps - 4); await T.sleep(700);
  const p1 = AUDIO._stats().curPass;
  AUDIO._seek(steps - 4); await T.sleep(700);
  const p2 = AUDIO._stats().curPass;
  return { p0, p1, p2, lift, titleLift: AUDIO._info('title').lift };
});
check('stage1 loop pass counter increments at the loop wrap (pass 1 is key-lifted)', pc.p0 === 0 && pc.p1 === 1 && pc.p2 === 2 && pc.lift === 2 && pc.titleLift === 0, pc);
const bt = await ev(async () => {
  AUDIO.setTempo(1.5); AUDIO.music('boss', { restart: true }); await T.sleep(700);
  const a = AUDIO._stats(); await T.sleep(1500); const b = AUDIO._stats();
  AUDIO.setTempo(1);
  return { rate: (b.curCount - a.curCount) / (b.curNext - a.curNext), cap: AUDIO._info('boss').maxTempo };
});
check('boss tempo is capped (1.5 requested -> 1.2 x 170 bpm = 13.6 steps/s)', Math.abs(bt.rate - 13.6) < 0.3 && bt.cap === 1.2, bt);

// 13d. look-ahead (QA A11): a 200 ms main-thread stall must not cost the music clock anything
const jk = await ev(async () => {
  AUDIO.music('stage1', { restart: true }); await T.sleep(1500);
  const out = [];
  for (const stall of [120, 200]) {
    const s0 = AUDIO._stats(); const t0 = performance.now(); while (performance.now() - t0 < stall) { /* block */ }
    await T.sleep(1200);
    const s1 = AUDIO._stats();
    out.push({ stall, resyncs: s1.resyncs - s0.resyncs, slip: +((s1.time - s0.time) * 10 - (s1.curCount - s0.curCount)).toFixed(1) });
  }
  return out;
});
check('main-thread stalls of 120 / 200 ms: no resync, no lost steps', jk.every((r) => r.resyncs === 0 && r.slip <= 2), jk);

// 13e. pause({suspend:false}) -- the manual pause screen: music gone, context alive, menu sfx audible, timelines frozen
const sp = await ev(async () => {
  AUDIO.music('stage1', { restart: true }); await T.sleep(700);
  AUDIO.pause({ suspend: false });
  const ready0 = AUDIO.ready(), st0 = AUDIO._state();
  await T.sleep(700);
  const ctxState = AUDIO._stats().ctxState;
  const pDucked = await T.peak(150);
  AUDIO.sfx('menu_select'); AUDIO.sfx('menu_move');
  const g = AUDIO._stats().groups;
  const pSfx = await T.peak(300);
  const c0 = AUDIO._stats().curCount; await T.sleep(600); const c1 = AUDIO._stats().curCount;
  const stillRunning = AUDIO._stats().ctxState;
  AUDIO.resume(); await T.sleep(700);
  const ready2 = AUDIO.ready(), p2 = await T.peak(400), st2 = AUDIO._stats();
  // soft -> hard -> soft again
  AUDIO.pause({ suspend: false }); AUDIO.pause(); await T.sleep(700); const hard = AUDIO._stats().ctxState;
  AUDIO.pause({ suspend: false }); await T.sleep(300); const soft = AUDIO._stats().ctxState;
  AUDIO.resume(); await T.sleep(300);
  return { ready0, kind: st0.pauseKind, ctxState, pDucked, g, pSfx, frozen: c1 - c0, stillRunning, ready2, p2, resyncs: st2.resyncs, hard, soft, after: AUDIO._state() };
});
check('pause({suspend:false}): ready() false, context keeps running', sp.ready0 === false && sp.kind === 'soft' && sp.ctxState === 'running' && sp.stillRunning === 'running', [sp.ready0, sp.kind, sp.ctxState]);
check('pause({suspend:false}): music ducked out, menu sfx audible, sequencer frozen', sp.pDucked < 0.01 && sp.g >= 1 && sp.pSfx > 0.02 && sp.frozen <= 2, [sp.pDucked, sp.g, sp.pSfx, sp.frozen]);
check('resume() after a soft pause restores the music without a resync', sp.ready2 === true && sp.p2 > 0.02 && sp.resyncs === 0, [sp.ready2, sp.p2, sp.resyncs]);
check('soft pause can be upgraded to a suspend and downgraded again', sp.hard === 'suspended' && sp.soft === 'running' && sp.after.paused === false, [sp.hard, sp.soft, sp.after.paused]);
const sj2 = await ev(async () => {
  AUDIO.stopMusic(); await T.sleep(200);
  let ends = 0; const t0 = performance.now();
  AUDIO.jingle('extend', { onEnd: () => { ends++; } });
  await T.sleep(1000);
  AUDIO.pause({ suspend: false });
  await T.sleep(3000);                                  // longer than the whole jingle
  const endsDuringPause = ends;
  AUDIO.resume();
  await T.sleep(1000); const e1 = ends; const jingleState = AUDIO._state().jingle;
  await T.sleep(2800);
  return { endsDuringPause, e1, jingleState, e2: ends };
});
check('a jingle paused (soft) for 3 s plays out after resume: pause time is not counted against it', sj2.endsDuringPause === 0 && sj2.e1 === 0 && sj2.jingleState === 'extend' && sj2.e2 === 1, sj2);

// 13f. kill pitch ladder and the new stinger exist and play
const kp = await ev(async () => {
  for (const p of [0, 2, 4, 6, 8, 10, 12]) { AUDIO.sfx('kill', { pitch: p }); await T.sleep(60); }
  AUDIO.sfx('clear'); await T.sleep(100);
  const pk = await T.peak(300);
  await T.sleep(1200);
  return { pk, names: AUDIO.sfxNames().includes('clear'), after: AUDIO._stats() };
});
check('kill at pitch 0..12 and clear play, leave nothing behind', kp.pk > 0.02 && kp.names && kp.after.voices === 0 && kp.after.groups === 0, kp);

// 14. mute persists across page loads
await ev(() => AUDIO.setMuted(true));
await t.page.reload();
const persisted = await ev(() => AUDIO.isMuted());
check('mute persisted via U.store across reload', persisted === true);
await ev(() => AUDIO.setMuted(false));

check('zero console errors', t.errors.length === 0, t.errors);

// ------------------------------------------------------------------------------------------------
// 15. A3: slow ctx.resume() (mobile) must not truncate a half-played jingle after a long hard pause
{
  const t3 = await launch({ html, initScript: `(() => { const o = AudioContext.prototype.resume; AudioContext.prototype.resume = function () { const c = this; return new Promise((res) => setTimeout(() => res(o.call(c)), 120)); }; })();` });
  const ev3 = (fn, ...a) => t3.page.evaluate(fn, ...a);
  const r = await ev3(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    AUDIO.init(); await sleep(400);
    let ends = 0; AUDIO.jingle('start', { onEnd: () => { ends++; } });
    await sleep(700);
    AUDIO.pause(); await sleep(5500);                   // far beyond the jingle's wall-clock deadline
    AUDIO.resume();
    const rows = [];
    for (let i = 0; i < 12; i++) { rows.push([AUDIO._state().jingle, ends]); await sleep(40); }
    await sleep(3200);
    return { rows, ends };
  });
  check('slow ctx.resume(): the paused jingle is not cut (A3)', r.rows.every(([j, e]) => j === 'start' && e === 0) && r.ends === 1, r);
  check('A3 run: zero console errors', t3.errors.length === 0, t3.errors);
  await t3.close();
}

// 16. A4: a failing WebAudio call must not flood the console or freeze the game; the music is switched off after ~20 failures
{
  const t4 = await launch({ html });
  const ev4 = (fn, ...a) => t4.page.evaluate(fn, ...a);
  const r = await ev4(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    AUDIO.init(); AUDIO.music('stage1', { restart: true }); await sleep(500);
    const orig = OscillatorNode.prototype.start;
    // (a) a short burst of failures heals: not disabled, the counter drains again
    OscillatorNode.prototype.start = function () { throw new Error('injected start failure (burst)'); };
    await sleep(450);
    OscillatorNode.prototype.start = orig;
    const burst = AUDIO._state().faults;
    await sleep(2600);
    const healed = AUDIO._state();
    // (b) a persistent failure: counted, then the music is switched off; sfx / jingle / music calls never throw
    OscillatorNode.prototype.start = function () { throw new Error('injected start failure'); };
    let threw = null;
    try { for (let i = 0; i < 12; i++) { AUDIO.sfx('pop'); AUDIO.sfx('jump'); AUDIO.jingle('extend'); AUDIO.music('boss'); await sleep(60); } } catch (e) { threw = String(e); }
    await sleep(2800);
    const st = AUDIO._state();
    OscillatorNode.prototype.start = orig;
    await sleep(800);
    return { burst, healedDisabled: healed.disabled, healedFaults: healed.faults, threw, disabled: st.disabled, faults: st.faults, after: AUDIO._stats(), state: AUDIO._state() };
  });
  const warns = t4.logs.filter((l) => l.includes('AUDIO:') && !l.includes('unknown'));
  check('A4: a short burst of failures does not kill the music (counter drains again)', r.burst >= 1 && r.healedDisabled === false && r.healedFaults < r.burst, [r.burst, r.healedDisabled, r.healedFaults]);
  check('A4: persistent faults are counted, the music is disabled after the limit, nothing throws into the caller', r.threw === null && r.disabled === true && r.faults >= 20, [r.threw, r.disabled, r.faults]);
  check('A4: one console.warn per failure class (music, each failing sfx), zero page errors', t4.errors.length === 0 && warns.some((w) => w.includes('music disabled')) && warns.length <= 4 && new Set(warns).size === warns.length, { errors: t4.errors.slice(0, 3), warns });
  check('A4: no leaked voices / tracks after the music was switched off', r.after.tracks === 0 && r.after.voices === 0, r.after);
  await t4.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
await t.close();
process.exit(failed.length ? 1 : 0);
