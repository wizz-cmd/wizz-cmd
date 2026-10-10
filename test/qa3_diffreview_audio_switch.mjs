// Bar-aligned loop switching / jingle / pause fuzz against the real AUDIO engine (real AudioContext, real time).
// Invariants after every settle: no leaked tracks, no stuck "switching", state().music == the last explicit request (when no jingle/stop involved),
// no faults, no page errors.  Usage: node test/qa3_diffreview_audio_switch.mjs [seconds=90] [seed=1]
import { launch, log, check } from './qa3_diffreview_lib.mjs';
const secs = +(process.argv[2] || 90), seed0 = +(process.argv[3] || 1);
const t = await launch({ html: new URL('./audio_page.html', import.meta.url).pathname });
const page = t.page;
await page.evaluate(() => { window.A = AUDIO; A.init(); });
await page.waitForTimeout(300);
const st = () => page.evaluate(() => ({ s: A._state(), x: A._stats() }));
log('ctx', (await st()).s.ctxState);

// ---- directed scenarios first -------------------------------------------------------------------------------
const wait = (ms) => page.waitForTimeout(ms);
async function scenario(name, fn, expect) {
  await page.evaluate(() => { A.stopMusic(0); A.setTempo(1); A.resume(); });
  await wait(1500);
  await fn();
  await wait(4500);
  const { s, x } = await st();
  const ok = expect(s, x);
  check(name, ok, { music: s.music, jingle: s.jingle, sw: s.switching, tracks: x.tracks, active: x.active, faults: x.faults, cur: x.current, last: x.lastSwitch && { from: x.lastSwitch.from, to: x.lastSwitch.to } });
}
await scenario('S1 music(a) then music(b) twice quickly -> b, one track', async () => { await page.evaluate(() => { A.music('stage1'); }); await wait(2500); await page.evaluate(() => { A.music('stage2'); A.music('stage2'); }); }, (s, x) => s.music === 'stage2' && !s.switching && x.active === 1 && x.tracks <= 2);
await scenario('S2 switch requested then cancelled by asking for the sounding loop', async () => { await page.evaluate(() => { A.music('stage1'); }); await wait(2500); await page.evaluate(() => { A.music('boss'); }); await wait(100); await page.evaluate(() => { A.music('stage1'); }); }, (s, x) => s.music === 'stage1' && !s.switching && x.active === 1);
await scenario('S3 stopMusic during pending switch -> silence, nothing starts later', async () => { await page.evaluate(() => { A.music('stage1'); }); await wait(2500); await page.evaluate(() => { A.music('boss'); A.stopMusic(0.1); }); }, (s, x) => s.music === null && x.active === 0 && x.current === null);
await scenario('S4 switch a -> b -> c within one bar', async () => { await page.evaluate(() => { A.music('stage1'); }); await wait(2500); await page.evaluate(() => { A.music('stage2'); }); await wait(300); await page.evaluate(() => { A.music('boss'); }); await wait(200); await page.evaluate(() => { A.music('title'); }); }, (s, x) => s.music === 'title' && x.active === 1);
await scenario('S5 setTempo while a switch is pending', async () => { await page.evaluate(() => { A.music('stage1'); }); await wait(2500); await page.evaluate(() => { A.music('stage2'); A.setTempo(1.3); }); await wait(500); await page.evaluate(() => A.setTempo(1.0)); }, (s, x) => s.music === 'stage2' && !s.switching && x.active === 1);
await scenario('S6 jingle(resume) over a pending switch resumes the NEW loop', async () => { await page.evaluate(() => { A.music('stage1'); }); await wait(2500); await page.evaluate(() => { A.music('stage2'); A.jingle('extend', { resume: true }); }); }, (s, x) => s.music === 'stage2' && !s.jingle && x.active === 1);
await scenario('S7 soft pause during pending switch then resume', async () => { await page.evaluate(() => { A.music('stage1'); }); await wait(2500); await page.evaluate(() => { A.music('stage2'); A.pause({ suspend: false }); }); await wait(1500); await page.evaluate(() => A.resume()); }, (s, x) => s.music === 'stage2' && !s.paused && x.active === 1 && x.ctxState === 'running');
await scenario('S8 hard pause during pending switch then resume', async () => { await page.evaluate(() => { A.music('stage1'); }); await wait(2500); await page.evaluate(() => { A.music('stage2'); A.pause(); }); await wait(1500); await page.evaluate(() => A.resume()); }, (s, x) => s.music === 'stage2' && !s.paused && x.active === 1 && x.ctxState === 'running');
await scenario('S9 music() while soft-paused, then resume -> plays', async () => { await page.evaluate(() => { A.music('stage1'); }); await wait(2500); await page.evaluate(() => { A.pause({ suspend: false }); A.music('title'); }); await wait(1200); await page.evaluate(() => A.resume()); }, (s, x) => s.music === 'title' && !s.paused && x.active === 1 && x.curCount > 0);
await scenario('S10 jingle during soft pause, resume, onEnd music follows', async () => { await page.evaluate(() => { window.__ended = 0; A.music('stage1'); }); await wait(2500); await page.evaluate(() => { A.pause({ suspend: false }); A.jingle('extend', { resume: true, onEnd: () => { window.__ended++; } }); }); await wait(800); await page.evaluate(() => A.resume()); await wait(3500); }, (s, x) => s.music === 'stage1' && !s.jingle && x.active === 1);
log('ended count', await page.evaluate(() => window.__ended));

// ---- random fuzz ---------------------------------------------------------------------------------------------
let seed = seed0 >>> 0;
const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const loops = ['title', 'stage1', 'stage2', 'boss', 'entry', 'ending'], jings = ['start', 'extend', 'gameover', 'clear_boss'];
const t0 = Date.now(); let ops = 0, last = null, lastWasPlainMusic = false;
await page.evaluate(() => { A.stopMusic(0); A.setTempo(1); A.resume(); });
const hist = [];
while (Date.now() - t0 < secs * 1000) {
  const r = rnd(); let op;
  if (r < 0.45) { const n = loops[Math.floor(rnd() * loops.length)]; op = ['music', n]; last = n; lastWasPlainMusic = true; }
  else if (r < 0.55) { op = ['jingle', jings[Math.floor(rnd() * jings.length)], rnd() < 0.7]; lastWasPlainMusic = false; }
  else if (r < 0.62) { op = ['stop', rnd() < 0.5 ? 0 : 0.3]; last = null; lastWasPlainMusic = false; }
  else if (r < 0.72) { op = ['tempo', [1, 1.1, 1.15, 1.3, 0.8][Math.floor(rnd() * 5)]]; }
  else if (r < 0.79) { op = ['pause', rnd() < 0.5]; }
  else if (r < 0.88) { op = ['resume']; }
  else if (r < 0.94) { op = ['sfx', ['pop', 'jump', 'kill', 'clear'][Math.floor(rnd() * 4)]]; }
  else { op = ['restart', loops[Math.floor(rnd() * loops.length)]]; last = op[1]; lastWasPlainMusic = true; }
  hist.push(op);
  await page.evaluate((op) => {
    if (op[0] === 'music') A.music(op[1]);
    else if (op[0] === 'restart') A.music(op[1], { restart: true });
    else if (op[0] === 'jingle') A.jingle(op[1], { resume: op[2] });
    else if (op[0] === 'stop') A.stopMusic(op[1]);
    else if (op[0] === 'tempo') A.setTempo(op[1]);
    else if (op[0] === 'pause') op[1] ? A.pause() : A.pause({ suspend: false });
    else if (op[0] === 'resume') A.resume();
    else if (op[0] === 'sfx') A.sfx(op[1]);
  }, op);
  ops++;
  await wait(Math.floor(rnd() * rnd() * 1400));
  const { s, x } = await st();
  if (x.tracks > 6 || x.active > 3 || x.faults > 0) { check('F0 no leaks mid-fuzz', false, { op, s, x, hist: hist.slice(-8) }); break; }
}
await page.evaluate(() => { A.resume(); });
await wait(300);
// final settle: plain request
await page.evaluate(() => { A.setTempo(1); A.music('stage1'); });
await wait(5000);
const f = await st();
check('F1 after fuzz+settle: stage1 playing, one active track, no switching, no faults', f.s.music === 'stage1' && !f.s.switching && f.x.active === 1 && f.x.faults === 0 && f.x.tracks <= 2, { s: f.s, x: f.x });
log('ops', ops, 'errors', t.errors);
check('F2 no page errors / console errors', t.errors.length === 0, t.errors);
await t.close();
