// FIZZ & POP — test/audio_notation_test.mjs
// Unit tests of the composition notation documented in the header of src/20_audio.js (§3): the compiler is exercised in Node (vm sandbox, no WebAudio) through
// AUDIO._define(name, def) / _events / _dump, then one feature song that uses every notation element is RENDERED in Chromium (non-silent, finite, no clipping).
// Usage: node test/audio_notation_test.mjs
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { launch, PROJECT } from '../tools/harness.mjs';
import { DSP_SRC } from './audio_dsp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv.includes('--src') ? path.resolve(process.argv[process.argv.indexOf('--src') + 1]) : path.join(ROOT, 'src', '20_audio.js');
const code = [path.join(ROOT, 'src', '00_shared.js'), SRC].map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const sandbox = { console, setTimeout, setInterval, clearInterval, performance };
vm.createContext(sandbox);
vm.runInContext(code + '\n;globalThis.AUDIO = AUDIO;', sandbox);
const AUDIO = sandbox.AUDIO;

let fails = 0, n = 0;
const check = (name, ok, detail) => { n++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  ' + JSON.stringify(detail) : '')); };
let uid = 0;
/** compile a one-section song; returns {issues, ev (events), dump} */
function song(lanes, sec, extra) {
  const name = 'demo_t' + (++uid);
  const def = Object.assign({ kind: 'jingle', bpm: 120, swing: 0.5, key: 4, mode: [0, 2, 3, 5, 7, 8, 10], lanes, sections: { S: sec }, order: ['S'] }, extra || {});
  const issues = AUDIO._define(name, def);
  return { name, issues, ev: AUDIO._events(name), dump: AUDIO._dump(name) };
}
// ---------------------------------------------------------------------------------------------------------------- the shipped songs
{
  const issues = AUDIO._validate();
  check('shipped songs + demos compile without issues', issues.length === 0, issues);
  const names = AUDIO.trackNames();
  check('10 tracks: 6 loops + 4 jingles', names.length === 10 && AUDIO._info('title').kind === 'loop' && AUDIO._info('start').kind === 'jingle');
  check('K7: start jingle <= 2.4 s', AUDIO._info('start').seconds <= 2.4 && AUDIO._info('start').seconds >= 1.8, AUDIO._info('start').seconds);
}

const C4 = '| Em | C | G | D |';

// ---------------------------------------------------------------------------------------------------------------- notes
{
  const r = song({ lead: { inst: 'lead' } }, { chords: '| Em |', p: { lead: "e5/4' g5/2, b5/4 [e4,g4,b4]/4 r/2" } });
  const notes = r.ev.filter((e) => e.k === 'n');
  check('notes: no issues', r.issues.length === 0, r.issues);
  check('notes: 4 events (rest skipped), pitches e5 g5 b5 + chord', notes.length === 4 && notes[0].m[0] === 76 && notes[1].m[0] === 79 && notes[2].m[0] === 83 && notes[3].m.length === 3, notes.map((x) => x.m));
  check('notes: accent x1.28, soft x0.6', Math.abs(notes[0].vel - 1.28) < 0.01 && Math.abs(notes[1].vel - 0.6) < 0.01 && Math.abs(notes[2].vel - 1) < 0.01, notes.map((x) => x.vel));
  check('notes: lengths and steps', notes[0].n === 4 && notes[1].step === 4 && notes[1].n === 2 && notes[3].step === 10, notes.map((x) => [x.step, x.n]));
  const bad = song({ lead: { inst: 'lead' } }, { chords: '| Em |', p: { lead: 'e5/4 g5/4' } });
  check('notes: a short bar is reported', bad.issues.some((x) => /steps/.test(x)), bad.issues);
  const bad2 = song({ lead: { inst: 'lead' } }, { chords: '| Em |', p: { lead: 'h9/4 e5/12' } });
  check('notes: a bad token is reported', bad2.issues.some((x) => /bad token/.test(x)), bad2.issues);
}
// ---------------------------------------------------------------------------------------------------------------- chords
{
  const quals = ['', 'm', '7', 'm7', 'maj7', 'm7b5', 'dim', 'dim7', 'sus', 'sus2', 'sus4', '7sus', '6', 'm6', '5', 'add9', 'madd9', 'maj9', 'm9', '9', 'm11', 'aug', '7b9', '7#9', 'mmaj7', '69', 'maj7#11', 'm7b9'];
  const r = song({ pad: { inst: 'pad' } }, { chords: '| ' + quals.map((q) => 'C' + q).join(' | ') + ' |', p: { pad: 'hold' } });
  check('chords: all 28 qualities compile', r.issues.length === 0 && r.dump.chords.length === quals.length, r.issues);
  const r2 = song({ pad: { inst: 'pad' } }, { chords: '| Bbm7 | F#.C#/8 | Ab@C |', p: { pad: 'hold' } }, { kind: 'jingle' });
  check('chords: flats / sharps / slash bass parse; a bar with one explicit length (`F#.C#/8`) gives the other chord the rest', r2.issues.length === 0 && r2.dump.chords[0].root === 10 && r2.dump.chords[1].n === 8 && r2.dump.chords[2].n === 8 && r2.dump.chords[3].bass === 0, r2.dump.chords.map((c) => [c.name, c.n]));
  const r3 = song({ pad: { inst: 'pad' } }, { chords: '| Xm |', p: { pad: 'hold' } });
  check('chords: a bad chord is reported', r3.issues.some((x) => /bad chord/.test(x)));
  const r4 = song({ pad: { inst: 'pad' } }, { chords: '| Em.Am7 | C/8.G/8 |', p: { pad: 'hold' } });
  check('chords: `.` splits a bar, `/n` sets lengths', r4.dump.chords.map((c) => c.n).join() === '8,8,8,8', r4.dump.chords.map((c) => c.n));
}
// ---------------------------------------------------------------------------------------------------------------- relative / grid patterns
{
  const r = song({ bass: { inst: 'pick' }, lead: { inst: 'lead' } }, { chords: '| Em | C |', p: { bass: '1-8-5-3-1-----1_.^..' } });
  check('rel: bad cell length is reported', r.issues.some((x) => /must divide 16/.test(x)), r.issues);
  const t = song({ bass: { inst: 'pick' } }, { chords: '| Em | C |', p: { bass: '1-8-5-3-' } });
  const b = t.dump.notes.filter((x) => x.v === 'bass');
  check('rel: an 8-char cell tiles; root of Em = E2 (40), 8 = +12, 5 = B2, 3 = G2', b.length === 16 && b[0].m === 40 && b[1].m === 52 && b[2].m === 47 && b[3].m === 43, b.slice(0, 4).map((x) => x.m));
  check('rel: chord change follows the chord (C root = 48 in the pick range)', b[8].m === 48, b[8]);
  const o = song({ bass: { inst: 'pick' } }, { chords: '| Em |', p: { bass: "1^1_1'1,............" } });
  const ob = o.ev.filter((e) => e.k === 'n');
  check('rel: ^ / _ shift an octave, \' / , scale the velocity', ob.length === 4 && ob[0].m[0] === 52 && ob[1].m[0] === 28 && Math.abs(ob[2].vel - 1.28) < 0.01 && Math.abs(ob[3].vel - 0.6) < 0.01, ob.map((e) => [e.m[0], e.vel]));
  const h = song({ pad: { inst: 'pad' } }, { chords: '| Em | C |', p: { pad: 'hold' } });
  const hn = h.ev.filter((e) => e.k === 'n');
  check('chord grid: `x---` held across a chord change re-triggers the new chord', hn.length === 2 && hn[0].n === 16 && hn[1].step === 16, hn.map((e) => [e.step, e.n]));
  const s2 = song({ pad: { inst: 'pad' } }, { chords: '| Em | C | G | D |', p: { pad: 'x---------------*1 ................*2 x...............' } });
  check('grid: name*N repetition and multi-cell cycling', s2.issues.length === 0 && s2.ev.filter((e) => e.k === 'n').length === 2, s2.issues);
  const s3 = song({ pad: { inst: 'pad' } }, { chords: '| Em | C | G | D |', p: { pad: 'x...............x...............' } });
  check('grid: a 32-char cell spans 2 bars', s3.ev.filter((e) => e.k === 'n').length === 4 && s3.ev.filter((e) => e.k === 'n').map((e) => e.step).join() === '0,16,32,48', s3.ev.filter((e) => e.k === 'n').map((e) => e.step));
  const sl = song({ bass: { inst: 'pick' } }, { chords: '| Am7@E |', p: { bass: '1---------------' } });
  check('slash chord: `1` on a bass lane plays the slash bass (E), the root stays A', sl.dump.notes.filter((x) => x.v === 'bass')[0].m % 12 === 4, sl.dump.notes);
  const nn = song({ bass: { inst: 'pick' } }, { chords: '| Em |', p: { bass: 'n: e2/8 g2/8' } });
  check('n: prefix forces notes on a relative lane', nn.issues.length === 0 && nn.dump.notes.filter((x) => x.v === 'bass').map((x) => x.m).join() === '40,43', nn.issues);
  const named = song({ pad: { inst: 'pad' } }, { chords: '| Em | Em |', pats: { mine: 'x.......x.......' }, p: { pad: 'mine*2' } });
  check('section `pats` names resolve', named.issues.length === 0 && named.ev.filter((e) => e.k === 'n').length === 4, named.issues);
  const unk = song({ pad: { inst: 'pad' } }, { chords: '| Em |', p: { pad: 'x', ghost: 'x' } });
  check('an undeclared lane is reported', unk.issues.some((x) => /undeclared lane/.test(x)), unk.issues);
  const kl = song({ pad: { inst: 'pad' } }, { chords: '| Em |', p: { kick: 'K...K...K...K...' } });
  check('a drum lane written as a pitched pattern is reported', kl.issues.some((x) => /drum-kit lane/.test(x)), kl.issues);
}
// ---------------------------------------------------------------------------------------------------------------- voicing
{
  const r = song({ pad: { inst: 'pad' } }, { chords: '| Em | C | G | D |', p: { pad: 'hold' } });
  const v = r.ev.filter((e) => e.k === 'n').map((e) => e.m);
  const move = v.slice(1).map((m, i) => m.reduce((a, x, k) => a + Math.abs(x - v[i][k]), 0));
  check('voicing: 4 notes per chord inside the pad range (50..74)', v.every((m) => m.length === 4 && Math.min(...m) >= 48 && Math.max(...m) <= 76), v);
  check('voicing: smooth voice leading (total movement <= 12 semitones between chords)', move.every((x) => x <= 12), move);
}
// ---------------------------------------------------------------------------------------------------------------- drums, rolls, sidechain
{
  const r = song({ bass: { inst: 'sub', duck: 0.6 }, pad: { inst: 'pad', duck: 0.5 } }, { chords: '| Em | C |', p: { bass: 'root', drums: 'K...s...q...h... RRRRRRRRRRRRRRRR' } });
  const d = r.ev.filter((e) => e.k === 'd'), u = r.ev.filter((e) => e.k === 'u');
  check('drums: no issues, kick / snare / hat routed to their lanes', r.issues.length === 0 && d.find((e) => e.step === 0).lane === 'kick' && d.find((e) => e.step === 4).lane === 'snare' && d.find((e) => e.step === 12).lane === 'hats', r.issues);
  const roll = d.filter((e) => e.step >= 16).map((e) => e.vel);
  check('drums: R = snare roll, velocity ramps up over the run', roll.length === 16 && roll[0] < 0.4 && roll[15] > 1.0 && roll.every((x, i) => i === 0 || x > roll[i - 1]), roll.map((x) => +x.toFixed(2)));
  check('sidechain: kick K and the silent q trigger each ducked lane (2 lanes x 2 triggers)', u.length === 4 && u.filter((e) => e.lane === 'bass').length === 2 && Math.abs(u.find((e) => e.lane === 'bass').depth - 0.6) < 1e-9, u.map((e) => [e.step, e.lane]));
  const off = song({ bass: { inst: 'sub', duck: 0.6 } }, { chords: '| Em |', duck: false, p: { bass: 'root', drums: 'K...K...K...K...' } });
  check('sidechain: section `duck:false` removes the ducking', off.ev.filter((e) => e.k === 'u').length === 0, off.ev.filter((e) => e.k === 'u').length);
  const ov = song({ bass: { inst: 'sub' } }, { chords: '| Em |', duck: { bass: 0.8 }, p: { bass: 'root', drums: 'K...K...K...K...' } });
  check('sidechain: `duck: {lane: depth}` enables it on a lane without static depth', ov.ev.filter((e) => e.k === 'u').length === 4 && Math.abs(ov.ev.find((e) => e.k === 'u').depth - 0.8) < 1e-9);
  const bad = song({ pad: { inst: 'pad' } }, { chords: '| Em |', p: { pad: 'hold', drums: 'K...!...........' } });
  check('drums: an unknown char is reported', bad.issues.some((x) => /unknown drum char/.test(x)), bad.issues);
  const kinds = 'kKbsSynBpfrtuvhomMdcxXzwq'.split('');
  const all = song({ pad: { inst: 'pad' } }, { chords: '| Em | Em |', p: { pad: 'hold', drums: kinds.slice(0, 16).join('') + ' ' + kinds.slice(16).join('').padEnd(16, '.') } });
  check('drums: every documented char (' + kinds.length + ') is accepted', all.issues.length === 0, all.issues);
}
// ---------------------------------------------------------------------------------------------------------------- automation
{
  const r = song({ super: { inst: 'super' } }, { chords: '| Em | C | G | D |', p: { super: 'hold' }, auto: { 'super.lpf': [400, 8000, 'exp'], 'master.hpf': [20, 800, 'exp', 1, 3], 'super.vol': [[0, 0], [2, 1], [4, 0.5]] } });
  const a = r.ev.filter((e) => e.k === 'a');
  const lpf = a.filter((e) => e.lane === 'super' && e.p === 'lpf'), hp = a.filter((e) => e.lane === 'master' && e.p === 'hpf'), vol = a.filter((e) => e.lane === 'super' && e.p === 'vol');
  check('auto: one segment per step (64 steps x 3 params)', r.issues.length === 0 && lpf.length === 64 && hp.length === 64 && vol.length === 64, [r.issues, lpf.length, hp.length, vol.length]);
  check('auto: exp sweep runs 400 -> 8000 across the section, continuous between steps', Math.abs(lpf[0].v0 - 400) < 1e-6 && Math.abs(lpf[63].v1 - 8000) < 1e-3 && lpf.every((x, i) => i === 0 || Math.abs(x.v0 - lpf[i - 1].v1) < 1e-6), [lpf[0].v0, lpf[63].v1]);
  check('auto: startBar / endBar hold the ends (master.hpf stays 20 until bar 1, 800 from bar 3)', Math.abs(hp[0].v0 - 20) < 1e-6 && Math.abs(hp[16].v0 - 20) < 1e-6 && Math.abs(hp[63].v1 - 800) < 1e-3 && hp[47].v1 > 790, [hp[16].v0, hp[47].v1]);
  check('auto: breakpoints [[bar, v], ...] interpolate linearly', Math.abs(vol[32].v0 - 1) < 1e-6 && Math.abs(vol[16].v0 - 0.5) < 1e-6 && Math.abs(vol[63].v1 - 0.5) < 0.02, [vol[16].v0, vol[32].v0, vol[63].v1]);
  const two = AUDIO._define('demo_t_auto2', { kind: 'jingle', bpm: 120, lanes: { super: { inst: 'super', lpf: 9000 } }, sections: { B: { chords: '| Em |', p: { super: 'hold' }, auto: { 'super.lpf': [400, 9000, 'exp'] } }, D: { chords: '| Em |', p: { super: 'hold' } } }, order: ['B', 'D'] });
  const ev2 = AUDIO._events('demo_t_auto2').filter((e) => e.k === 'a' && e.step >= 16);
  check('auto: a section that does not automate the param resets it to the lane default (the drop)', two.length === 0 && ev2.length === 1 && ev2[0].step === 16 && ev2[0].v0 === 9000, ev2);
  const badp = song({ pad: { inst: 'pad' } }, { chords: '| Em |', p: { pad: 'hold' }, auto: { 'pad.nope': [0, 1] } });
  check('auto: an unknown param is reported', badp.issues.some((x) => /unknown param/.test(x)), badp.issues);
  const dr = song({ pad: { inst: 'pad' } }, { chords: '| Em |', p: { pad: 'hold', drums: 'K...K...K...K...' }, auto: { 'drums.vol': [1, 0.2] } });
  check('auto: `drums.` automates every kit lane', dr.ev.filter((e) => e.k === 'a').length === 16 * 4, dr.ev.filter((e) => e.k === 'a').length);
}
// ---------------------------------------------------------------------------------------------------------------- fx lane, mix, cfg
{
  const r = song({ pad: { inst: 'pad' } }, { chords: '| Em | C | G | D |', p: { pad: 'hold' }, fx: 'riser@0/2b impact@2b down@3b/1b:0.5 swell@4 zap@8/2' });
  const f = r.ev.filter((e) => e.k === 'f');
  const fb = Object.fromEntries(f.map((e) => [e.name, e]));
  check('fx: tokens with bar / step units and velocity', r.issues.length === 0 && f.length === 5 && fb.riser.n === 32 && fb.impact.step === 32 && fb.down.step === 48 && fb.down.n === 16 && Math.abs(fb.down.vel - 0.5) < 1e-9 && fb.swell.step === 4 && fb.zap.n === 2, f.map((e) => [e.name, e.step, e.n, e.vel]));
  const bad = song({ pad: { inst: 'pad' } }, { chords: '| Em |', p: { pad: 'hold' }, fx: 'whoosh@0' });
  check('fx: an unknown fx name is reported', bad.issues.some((x) => /bad token/.test(x)), bad.issues);
  const m = song({ pad: { inst: 'pad' }, bass: { inst: 'sub' } }, { chords: '| Em |', p: { pad: 'hold', bass: 'root', drums: 'K...............' }, mix: { pad: 0, drums: 0.5, bass: 0.5 } });
  check('mix: 0 = lane tacet, other values scale the velocities', m.ev.filter((e) => e.lane === 'pad').length === 0 && Math.abs(m.ev.find((e) => e.lane === 'bass' && e.k === 'n').vel - 0.5) < 1e-9 && Math.abs(m.ev.find((e) => e.k === 'd').vel - 0.5) < 1e-9, m.ev.length);
  const c = AUDIO._define('demo_t_cfg', { kind: 'jingle', bpm: 120, lanes: { pad: { inst: 'pad', cut: 1500 } }, sections: { S: { chords: '| Em |', p: { pad: 'hold' }, cfg: { pad: { cut: 3000 } } } }, order: ['S'] });
  check('cfg: section cfg overrides instrument params', c.length === 0);
}
// ---------------------------------------------------------------------------------------------------------------- alt: second-pass versions of loop sections (FIXPLAN_V3 A8)
{
  const lanes = { lead: { inst: 'lead' }, bell: { inst: 'bell' }, twang: { inst: 'twang' }, pad: { inst: 'pad', duck: 0.5 } };
  const sec = { chords: '| Em | C |', p: { pad: 'hold', lead: '| e5/4 g5/4 b5/8 | c6/8 e6/8 |', drums: 'K...s...K...s... K...s...K...s...' },
    alt: { p: { bell: '| r/8 b5/4 e6/4 | r/16 |', drums2: 'h.h.h.h.h.h.h.h. ................' }, dbl: { lead: { semi: 12, to: 'twang', vel: 0.5, bars: [1, 1] } }, mix: { pad: 0.5 } } };
  const r = song(lanes, sec, { kind: 'loop' });
  const e0 = AUDIO._events(r.name, 0), e1 = AUDIO._events(r.name, 1), odd = e1.filter((e) => e.o === 1), even = e0.filter((e) => e.o === 0);      // _events(name, pass): the events that sound on that pass
  check('alt: compiles clean in a loop, original events stay unflagged, the second-pass additions are flagged odd-only', r.issues.length === 0 && odd.length > 0 && e0.every((e) => e.o !== 1) && e1.every((e) => e.o !== 0), r.issues);
  check('alt: new lane (bell) and a new drum grid (hats) sound only on odd passes', odd.some((e) => e.lane === 'bell') && odd.some((e) => e.lane === 'hats') && !e0.some((e) => e.lane === 'bell' || e.lane === 'hats') && e1.some((e) => e.lane === 'bell'), odd.map((e) => e.lane));
  const dbl = odd.filter((e) => e.k === 'n' && e.lane === 'twang');
  check('alt: dbl copies the lead notes of bar 1 an octave up onto another lane at half velocity (bars range respected)', dbl.length === 3 && dbl[0].m[0] === 76 + 12 && dbl[1].m[0] === 79 + 12 && dbl[2].m[0] === 83 + 12 && Math.abs(dbl[0].vel - 0.5) < 1e-9 && dbl.every((e) => e.step < 16), dbl.map((e) => [e.step, e.m, e.vel]));
  check('alt: `mix` is merged over the section mix for the second version (pad 0.5 on odd passes, 1 on even passes)', Math.abs(e1.find((e) => e.k === 'n' && e.lane === 'pad').vel - 0.5) < 1e-9 && Math.abs(e0.find((e) => e.k === 'n' && e.lane === 'pad').vel - 1) < 1e-9 && even.some((e) => e.lane === 'pad') && odd.some((e) => e.lane === 'pad'), [e0.find((e) => e.lane === 'pad'), e1.find((e) => e.lane === 'pad')]);
  check('alt: identical drum events of both versions are kept once, unflagged (kick + snare of the groove)', e0.filter((e) => e.lane === 'kick').length === 4 && e1.filter((e) => e.lane === 'kick').length === 4 && e1.filter((e) => e.lane === 'kick').every((e) => e.o === undefined));
  check('alt: _dump exposes the second-pass notes and _info the altered sections', r.dump.altNotes.length >= 4 && AUDIO._info(r.name).altSections.length === 1 && AUDIO._info(r.name).altSections[0].name === 'S', r.dump.altNotes);
  const jg = song(lanes, sec, { kind: 'jingle' });
  check('alt: not allowed in a jingle (reported)', jg.issues.some((x) => /alt only makes sense/.test(x)), jg.issues);
  const same = song(lanes, Object.assign({}, sec, { alt: { mix: { pad: 1 } } }), { kind: 'loop' });
  check('alt: a version identical to the original is reported', same.issues.some((x) => /identical/.test(x)), same.issues);
  const badk = song(lanes, Object.assign({}, sec, { alt: { p: { bell: '| r/16 | r/16 |' }, nope: 1 } }), { kind: 'loop' });
  check('alt: an unknown key is reported', badk.issues.some((x) => /unknown key/.test(x)), badk.issues);
  const badd = song(lanes, Object.assign({}, sec, { alt: { dbl: { lead: { semi: 12, to: 'ghost_lane' } } } }), { kind: 'loop' });
  check('alt: dbl onto an undeclared lane is reported', badd.issues.some((x) => /dbl|undeclared/.test(x)), badd.issues);
}
// ---------------------------------------------------------------------------------------------------------------- render a feature song in the browser
const feature = {
  kind: 'loop', bpm: 120, swing: 0.5, key: 4, mode: [0, 2, 3, 5, 7, 8, 10], echo: 3, fb: 0.4, gain: 1,
  lanes: {
    pad: { inst: 'pad', hall: 0.3, duck: 0.4, vib: [5, 12] }, choir: { inst: 'choir', hall: 0.4 }, super: { inst: 'super', n: 5, duck: 0.7, lpf: 9000 }, stab: { inst: 'stab', duck: 0.6 },
    bass: { inst: 'pick', chorus: { rate: 0.4, depth: 0.003, base: 0.015, mix: 0.7 } }, sub: { inst: 'sub', drive: 2.5, lpf: 700, duck: 0.9 }, riff: { inst: 'riff', drive: 7, lpf: 3600 },
    arp: { inst: 'arp', dly: 0.4, hall: 0.2 }, lead: { inst: 'lead', dly: 0.3 }, alarm: { inst: 'alarm', drive: 2 }, twang: { inst: 'twang', trem: { rate: 4.4, depth: 0.5 }, spr: 0.4, hall: 0.3, hpf: 140 },
    bell: { inst: 'bell', hall: 0.3 }, vibes: { inst: 'vibes', trem: { rate: 5, depth: 0.3 } }, wood: { inst: 'wood', drive: 1.8, dgain: 0.2 }, fx: { inst: 'fx' }, snare: { crush: 6 }, perc: { hall: 0.2 },
  },
  sections: {
    A: { chords: '| Em | C | Am7@E | D |', pats: { riffy: '1181118111811181' },
      p: { pad: 'hold', choir: 'hold', super: 'stab', stab: '..x...x...x...x.', bass: 'root8*3 oct8', sub: 'root2', riff: 'riffy', arp: 'arp16', wood: '1---3---5---6---',
        lead: "| e5/2 g5/2' b5/4 r/8 | c6/16 | e5/8 g5/8 | f#5/16 |", alarm: 'n: | e5/2 b5/2 e5/2 b5/2 e5/2 b5/2 e5/2 b5/2 | c5/16 | g5/16 | d5/16 |', twang: '| e4/6 g4/2 b4/8 | c5/16 | b4/16 | a4/16 |',
        bell: '| [e5,b5]/8 r/8 | r/16 | r/16 | r/16 |', vibes: '| e5/16 | c5/16 | g5/16 | f#5/16 |',
        drums: "K...s...Kk..s... S...y...n...p... f...r...t.u.v... h.o.m.M.d...c... x...X...z...w...", fx: 'riser@0/1b impact@2b' },
      auto: { 'super.lpf': [600, 9000, 'exp'], 'master.hpf': [20, 400, 'exp', 0, 2] }, mix: { choir: 0.6 } },
    B: { chords: '| Em | C |', p: { pad: 'hold', super: 'x---------------', sub: 'root', drums: 'q...q...q...q... ................' }, duck: { pad: 0.8 } },
  },
  order: ['A', 'B'],
};
const t = await launch({ html: path.join(PROJECT, 'test', 'audio_page.html') });
await t.page.addScriptTag({ content: DSP_SRC });
const rr = await t.page.evaluate(async (def) => {
  const issues = AUDIO._define('demo_feature', def);
  const info = AUDIO._info('demo_feature');
  const res = await AUDIO._renderOffline('demo_feature', info.seconds + 1.5);
  const st = __dsp.stats(res), lo = __dsp.lufs(res.channels, res.sampleRate);
  return { issues, st, lufs: lo.lufs, tp: __dsp.truePeak(res.channels), seconds: info.seconds, peakSources: info.peakSources };
}, feature);
check('feature song (every instrument, kit char, fx, automation, sidechain, chorus, tremolo, vibrato) compiles clean', rr.issues.length === 0, rr.issues);
check('feature song renders: finite, audible, no clipping, true peak <= -0.9 dBFS', rr.st.nan === 0 && rr.st.peak > 0.05 && rr.st.clipped === 0 && rr.tp < 0.905 && rr.lufs > -40, { peak: rr.st.peak, tp: rr.tp, lufs: rr.lufs });
check('zero console errors', t.errors.length === 0, t.errors);
await t.close();
console.log(`\n${n - fails}/${n} checks passed`);
process.exit(fails ? 1 : 0);
