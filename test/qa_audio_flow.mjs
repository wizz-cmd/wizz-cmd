// QA (audio lens) -- scene-flow behaviour in the REAL game (dist/fizzpop.html): which music/jingle is active at each
// point, tempo handling, pause/blur/mute semantics.  Logs AUDIO calls through wrappers.
//   node test/qa_audio_flow.mjs [A|B|C|D|E|F|G|H|I]   (default: all)
import fs from 'fs';
import path from 'path';
import { launch, fp, PROJECT } from '../tools/harness.mjs';
const OUT = path.join(PROJECT, 'out', 'qa', 'audio');
fs.mkdirSync(OUT, { recursive: true });
const only = process.argv[2] || 'all';
const want = (k) => only === 'all' || only === k;
const log = (...a) => console.log(...a);
const results = [];
const check = (name, ok, detail) => { results.push([name, ok]); log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '   ' + JSON.stringify(detail) : '')); };

const INSTALL = `
window.fz = window.__fizzpop;
window.__alog = [];
(() => {
  const A = fz.AUDIO, T0 = performance.now();
  const snap = () => { let ph = null, lv = null; try { const s = fz.Game.debug.state(); ph = s.phase; lv = s.level; } catch (e) {} const st = A._state(), ss = A._stats(); return { t: Math.round(performance.now() - T0), scene: fz.scene(), phase: ph, lvl: lv, music: st.music, jingle: st.jingle, tempo: st.tempo, ctx: st.ctxState, paused: st.paused, muted: st.muted, pk: st.pauseKind, groups: ss.groups, cur: ss.current, pos: ss.curPos, cnt: ss.curCount }; };
  window.__snap = snap;
  for (const k of ['music', 'jingle', 'stopMusic', 'setTempo', 'sfx', 'pause', 'resume', 'setMuted', 'toggleMuted', 'init']) {
    const orig = A[k].bind(A);
    A[k] = function () {
      const before = snap();
      const r = orig.apply(null, arguments);
      const after = snap();
      __alog.push({ t: before.t, call: k, args: Array.prototype.slice.call(arguments).map((x) => (typeof x === 'function' ? 'fn' : x)), scene: before.scene, phase: before.phase, ctxBefore: before.ctx, groupsDelta: after.groups - before.groups, after: { music: after.music, jingle: after.jingle, tempo: after.tempo } });
      return r;
    };
  }
  window.__timeline = [];
  window.__tl = setInterval(() => { const s = snap(); const l = __timeline[__timeline.length - 1]; if (!l || l.scene !== s.scene || l.phase !== s.phase || l.music !== s.music || l.jingle !== s.jingle || l.tempo !== s.tempo || l.ctx !== s.ctx || l.paused !== s.paused) __timeline.push(s); }, 40);
})();`;

async function boot(extra = {}) {
  const t = await launch(extra);
  const g = fp(t.page);
  await t.page.evaluate(INSTALL);
  const call = (fn, ...a) => g.evaluate(fn, ...a);
  const snap = () => t.page.evaluate(() => window.__snap());
  const alog = () => t.page.evaluate(() => window.__alog.slice());
  const clearLog = () => t.page.evaluate(() => { window.__alog.length = 0; window.__timeline.length = 0; });
  const timeline = () => t.page.evaluate(() => window.__timeline.slice());
  const key = async (k, wait = 120) => { await t.page.keyboard.press(k); await t.page.waitForTimeout(wait); };
  return { t, g, call, snap, alog, clearLog, timeline, key };
}
const fmtTL = (tl) => tl.map((s) => `  ${String(s.t).padStart(6)}ms ${s.scene}/${s.phase || '-'} lvl ${s.lvl || '-'} music=${s.music} jingle=${s.jingle} tempo=${s.tempo} ctx=${s.ctx}${s.paused ? ' PAUSED' : ''}${s.muted ? ' MUTED' : ''}`).join('\n');

// ------------------------------------------------------------------------------------------------------------------
if (want('A')) {
  log('\n=== A. boot, first gesture, title/attract music continuity');
  const b = await boot();
  let s = await b.snap();
  log('before gesture:', JSON.stringify(s));
  check('A1 before the first gesture no AudioContext exists and the title loop is only "pending"', s.ctx === 'none' && s.music === 'title', s);
  await b.key('ArrowDown', 400);
  s = await b.snap();
  log('after first key:', JSON.stringify(s));
  check('A2 first key press (Down arrow) creates + starts the context and title loop plays', s.ctx === 'running' && s.cur === 'title' && s.cnt > 0, s);
  await b.key('ArrowUp', 100);
  // run the attract screens and check there is no music restart
  const before = await b.snap();
  const restarts = [];
  for (const sc of ['story', 'howto', 'scores', 'title']) {
    const pre = await b.snap();
    await b.call((n) => { fz.goto(n, n === 'story' ? { next: { players: 1, level: 1, seed: 1 } } : undefined); }, sc);
    await b.t.page.waitForTimeout(250);
    const post = await b.snap();
    if (post.cur !== 'title' || post.cnt < pre.cnt) restarts.push({ sc, pre, post });
  }
  check('A3 title music continues (no restart/stop) across story/howto/scores/title scenes', restarts.length === 0, restarts);
  log('errors:', b.t.errors);
  await b.t.close();
}

// ------------------------------------------------------------------------------------------------------------------
if (want('B')) {
  log('\n=== B. title -> story -> play: start jingle then stage1; time of loop start vs play start');
  const b = await boot();
  await b.key('ArrowDown', 300); await b.key('ArrowUp', 300);           // unlock audio
  await b.clearLog();
  await b.key('Enter', 400);                                              // 1 PLAYER -> story
  log('scene after Enter:', (await b.snap()).scene);
  await b.key('Enter', 100);                                              // skip story -> play
  await b.t.page.waitForTimeout(6500);
  const tl = await b.timeline();
  log(fmtTL(tl));
  const al = await b.alog();
  log(al.filter((x) => x.call !== 'sfx').map((x) => `  ${x.t}ms ${x.call}(${JSON.stringify(x.args)}) in ${x.scene}/${x.phase}`).join('\n'));
  const play0 = tl.find((x) => x.scene === 'play');
  const j0 = tl.find((x) => x.jingle === 'start');
  const stage = tl.find((x) => x.music === 'stage1');
  const intro1 = tl.find((x) => x.scene === 'play' && x.phase === 'play');
  log('play scene entered', play0 && play0.t, ' start jingle at', j0 && j0.t, ' stage1 at', stage && stage.t, ' phase=play at', intro1 && intro1.t);
  check('B1 start jingle plays right at game start', !!j0 && j0.t - play0.t < 150, { play: play0 && play0.t, j: j0 && j0.t });
  check('B2 stage1 loop follows the jingle (one music at a time)', !!stage && tl.every((x) => !(x.music && x.jingle)), null);
  if (stage && intro1) log(`  -> stage1 loop starts ${stage.t - intro1.t} ms ${stage.t > intro1.t ? 'AFTER' : 'before'} the player gets control (phase=play)`);
  log('errors:', b.t.errors);
  await b.t.close();
}

// ------------------------------------------------------------------------------------------------------------------
if (want('C')) {
  log('\n=== C. in-play: stage1 -> stage2 -> boss switching, continuity across rounds');
  const b = await boot();
  await b.key('ArrowDown', 300);
  await b.call(() => { fz.start(1, 1, 7); });
  await b.t.page.waitForTimeout(3600);                                   // start jingle ends
  await b.clearLog();
  const seq = [];
  for (const lv of [2, 15, 16, 29, 30]) {
    await b.call((l) => { fz.Game.debug.god(true); fz.Game.debug.setLevel(l); }, lv);
    await b.t.page.waitForTimeout(500);
    const s = await b.snap(); seq.push([lv, s.music, s.cnt]);
  }
  log('level -> music:', JSON.stringify(seq));
  check('C1 rounds 2/15 -> stage1, 16/29 -> stage2, 30 -> boss', seq[0][1] === 'stage1' && seq[1][1] === 'stage1' && seq[2][1] === 'stage2' && seq[3][1] === 'stage2' && seq[4][1] === 'boss', seq);
  // natural round clear flow with stage change 15 -> 16: music switch point vs bar line
  await b.call(() => { fz.Game.debug.setLevel(15); fz.Game.debug.skipIntro(); });
  await b.t.page.waitForTimeout(700);
  const pre = await b.snap();
  await b.call(() => { fz.Game.debug.killAll(); });
  await b.t.page.waitForTimeout(500);
  log('after killAll at r15:', JSON.stringify(await b.snap()));
  await b.clearLog();
  // wait for clear + transition + intro of 16 (<= 9 s)
  await b.t.page.waitForTimeout(9000);
  const tl = await b.timeline();
  log(fmtTL(tl));
  const al = (await b.alog()).filter((x) => x.call !== 'sfx');
  log(al.map((x) => `  ${x.t}ms ${x.call}(${JSON.stringify(x.args)}) in ${x.scene}/${x.phase}`).join('\n'));
  const sw = al.find((x) => x.call === 'music' && x.args[0] === 'stage2');
  check('C2 natural 15 -> 16 transition switches to stage2 exactly once', !!sw && al.filter((x) => x.call === 'music' && x.args[0] === 'stage2').length === 1, al.length);
  log('errors:', b.t.errors);
  await b.t.close();
}

// ------------------------------------------------------------------------------------------------------------------
if (want('D')) {
  log('\n=== D. pause menu: sound feedback + blur/visibility');
  const b = await boot();
  await b.key('ArrowDown', 300);
  await b.call(() => { fz.start(1, 3, 3); fz.Game.debug.god(true); fz.Game.debug.skipIntro(); });
  await b.t.page.waitForTimeout(4200);
  await b.clearLog();
  await b.key('Escape', 700);                                                  // pause
  let s = await b.snap();
  log('paused:', JSON.stringify(s));
  // WAVE 2 (FIXPLAN section 0 / U9): a MANUAL pause is a soft pause -- music stops (nothing scheduled) but the context keeps running so the
  // pause-menu sounds stay audible (D3/D4). The hard suspend is reserved for blur / hidden tab (D6/D9).
  check('D1 Esc pauses audio: soft pause (paused flag, music off, context still running for menu sfx)', s.paused && s.pk === 'soft' && s.ctx === 'running' && s.groups === 0, s);
  await b.key('ArrowDown', 150); await b.key('ArrowUp', 150); await b.key('ArrowDown', 150);
  await b.key('ArrowUp', 150);
  await b.key('Escape', 500);                                                  // resume
  s = await b.snap();
  const al = await b.alog();
  log(al.map((x) => `  ${x.t}ms ${x.call}(${JSON.stringify(x.args)}) ctxBefore=${x.ctxBefore} groupsDelta=${x.groupsDelta}`).join('\n'));
  const pauseBlip = al.find((x) => x.call === 'sfx' && x.args[0] === 'pause');
  const moves = al.filter((x) => x.call === 'sfx' && x.args[0] === 'menu_move');
  const sel = al.filter((x) => x.call === 'sfx' && x.args[0] === 'menu_select');
  check('D2 "pause" blip is audible when pausing', pauseBlip && pauseBlip.groupsDelta > 0, pauseBlip);
  check('D3 menu_move in the pause menu is audible', moves.length > 0 && moves.every((x) => x.groupsDelta > 0), moves.map((x) => [x.ctxBefore, x.groupsDelta]));
  check('D4 menu_select on RESUME is audible', sel.length > 0 && sel.every((x) => x.groupsDelta > 0), sel.map((x) => [x.ctxBefore, x.groupsDelta]));
  check('D5 music resumes after un-pausing', s.ctx === 'running' && !s.paused && s.music === 'stage1', s);

  // blur / focus while playing
  await b.clearLog();
  await b.call(() => { window.dispatchEvent(new Event('blur')); });
  await b.t.page.waitForTimeout(600);
  s = await b.snap();
  log('after blur in play:', JSON.stringify(s), ' main paused:', await b.call(() => fz._main.paused()));
  check('D6 blur pauses game + audio', s.paused && s.ctx === 'suspended' && (await b.call(() => fz._main.paused())) === true, s);
  await b.call(() => { window.dispatchEvent(new Event('focus')); });
  await b.t.page.waitForTimeout(400);
  s = await b.snap();
  log('after focus:', JSON.stringify(s), ' main paused:', await b.call(() => fz._main.paused()));
  check('D7 focus return keeps game paused AND audio paused (consistent)', s.paused === (await b.call(() => fz._main.paused())), s);
  await b.key('Escape', 500);
  s = await b.snap();
  check('D8 manual un-pause after blur restores audio', !s.paused && s.ctx === 'running', s);

  // hidden tab on title
  await b.call(() => { fz.goto('title'); });
  await b.t.page.waitForTimeout(500);
  await b.call(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await b.t.page.waitForTimeout(600);
  s = await b.snap();
  check('D9 hidden tab on title suspends audio', s.paused && s.ctx === 'suspended', s);
  await b.call(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await b.t.page.waitForTimeout(500);
  s = await b.snap();
  check('D10 visible again resumes title audio', !s.paused && s.ctx === 'running' && s.music === 'title', s);
  log('errors:', b.t.errors);
  await b.t.close();
}

// ------------------------------------------------------------------------------------------------------------------
if (want('E')) {
  log('\n=== E. mute: key M in title/play, persists, jingle onEnd flow unaffected');
  const b = await boot();
  await b.key('ArrowDown', 300);
  await b.key('m', 300);
  let s = await b.snap();
  check('E1 M mutes (title)', s.muted === true, s);
  const stored = await b.call(() => localStorage.getItem('fizzpop.v1.muted'));
  check('E2 mute persisted in localStorage', stored === 'true', stored);
  await b.call(() => { fz.start(1, 1, 5); });
  await b.t.page.waitForTimeout(3700);
  s = await b.snap();
  check('E3 muted game start: jingle finishes and stage1 loop becomes current (timeline keeps running)', s.music === 'stage1' && s.muted, s);
  await b.key('m', 300);
  s = await b.snap();
  check('E4 unmute mid-game keeps the loop', !s.muted && s.music === 'stage1' && s.ctx === 'running', s);
  log('errors:', b.t.errors);
  await b.t.close();
}

// ------------------------------------------------------------------------------------------------------------------
if (want('F')) {
  log('\n=== F. HURRY UP: tempo set, reset on player death / clear / round / quit');
  const b = await boot();
  await b.key('ArrowDown', 300);
  await b.call(() => { fz.start(1, 2, 11); fz.Game.debug.skipIntro(); fz.Game.debug.god(true); });
  await b.t.page.waitForTimeout(3800);
  await b.clearLog();
  const tempoOf = () => b.call(() => fz.AUDIO._state().tempo);
  await b.call(() => { fz.freeze(true); fz.Game.debug.setHurryTimer(60 * 60); fz.step(5); });
  log('after hurry timer set: tempo', await tempoOf(), 'hurry flag', await b.call(() => fz.Game.debug.state().hurry));
  check('F1 HURRY UP sets tempo 1.3', Math.abs((await tempoOf()) - 1.3) < 1e-6, await tempoOf());
  // kill the player via an enemy
  await b.call(() => { fz.Game.debug.god(false); fz.Game.debug.setPlayer(0, { inv: 0 }); const p = fz.Game.debug.state().players[0]; fz.Game.debug.spawn('nibbler', p.x, p.y); fz.step(10); });
  log('after player death: tempo', await tempoOf(), JSON.stringify(await b.call(() => ({ hurry: fz.Game.debug.state().hurry, ghost: fz.Game.debug.state().ghost, ph: fz.Game.debug.state().players[0].alive }))));
  check('F2 player death resets tempo to 1.0', Math.abs((await tempoOf()) - 1.0) < 1e-6, await tempoOf());
  // hurry again, then clear the round
  await b.call(() => { fz.Game.debug.god(true); fz.Game.debug.setHurryTimer(60 * 60); fz.step(300); });
  log('hurry again: tempo', await tempoOf());
  await b.call(() => { fz.Game.debug.killAll(); fz.step(200); });
  log('after killAll+200 frames: tempo', await tempoOf(), 'phase', await b.call(() => fz.Game.debug.state().phase));
  check('F3 round clear resets tempo', Math.abs((await tempoOf()) - 1.0) < 1e-6, await tempoOf());
  // hurry then quit to title
  await b.call(() => { fz.Game.debug.setLevel(4); fz.Game.debug.skipIntro(); fz.Game.debug.setHurryTimer(60 * 60); fz.step(5); });
  log('hurry in r4: tempo', await tempoOf());
  await b.call(() => { fz.goto('title'); });
  await b.t.page.waitForTimeout(300);
  check('F4 quitting to the title resets tempo', Math.abs((await tempoOf()) - 1.0) < 1e-6, await tempoOf());
  // hurry + extend jingle: tempo during resume
  log('errors:', b.t.errors);
  await b.t.close();
}

// ------------------------------------------------------------------------------------------------------------------
if (want('G')) {
  log('\n=== G. game over -> entry/scores -> title (real time)');
  const b = await boot();
  await b.key('ArrowDown', 300);
  await b.call(() => { fz.start(1, 3, 21); fz.Game.debug.skipIntro(); });
  await b.t.page.waitForTimeout(3700);
  await b.call(() => { fz.Game.debug.addScore(0, 5000); fz.Game.debug.setPlayer(0, { lives: 0 }); fz.Game.debug.god(false); const p = fz.Game.debug.state().players[0]; fz.Game.debug.spawn('nibbler', p.x, p.y); });
  await b.clearLog();
  await b.t.page.waitForTimeout(13000);
  const tl = await b.timeline();
  log(fmtTL(tl));
  const al = (await b.alog()).filter((x) => x.call !== 'sfx');
  log(al.map((x) => `  ${x.t}ms ${x.call}(${JSON.stringify(x.args)}) in ${x.scene}/${x.phase}`).join('\n'));
  const go = tl.find((x) => x.jingle === 'gameover'), en = tl.find((x) => x.music === 'entry');
  if (go && en) log(`  -> gameover jingle starts ${go.t} ms; entry music starts ${en.t} ms; silent gap after jingle(4.3 s): ~${(en.t - go.t - 4290)} ms`);
  check('G1 gameover jingle plays (stage music stopped first)', !!go, go);
  log('errors:', b.t.errors);
  await b.t.close();
}

// ------------------------------------------------------------------------------------------------------------------
if (want('H')) {
  log('\n=== H. boss kill -> clear_boss jingle -> pearl -> victory -> ending music (silent gap?)');
  const b = await boot();
  await b.key('ArrowDown', 300);
  await b.call(() => { fz.start(1, 30, 5); fz.Game.debug.skipIntro(); fz.Game.debug.god(true); });
  await b.t.page.waitForTimeout(4200);
  await b.clearLog();
  await b.call(() => { fz.Game.debug.killAll(); });
  // keep the player inside the boss bubble, then on the pearl
  let t0 = Date.now();
  for (let i = 0; i < 160; i++) {
    await b.call(() => {
      const S = fz.Game.debug._S();
      const p = S.players[0];
      if (S.bossBubble) { p.x = S.bossBubble.x + 24; p.y = S.bossBubble.y + 24; p.vy = 0; }
      else { const pearl = S.items.find((it) => it.kind === 'moonpearl'); if (pearl) { p.x = pearl.x + 8; p.y = pearl.y + 8; p.vy = 0; } }
    });
    await b.t.page.waitForTimeout(100);
    if ((await b.snap()).scene !== 'play') break;
  }
  await b.t.page.waitForTimeout(3000);
  const tl = await b.timeline();
  log(fmtTL(tl));
  const al = (await b.alog()).filter((x) => x.call !== 'sfx');
  log(al.map((x) => `  ${x.t}ms ${x.call}(${JSON.stringify(x.args)}) in ${x.scene}/${x.phase}`).join('\n'));
  const jc = tl.find((x) => x.jingle === 'clear_boss'), jEnd = tl.find((x) => x.t > (jc ? jc.t : 0) && !x.jingle), endMusic = tl.find((x) => x.music === 'ending');
  if (jc && endMusic) log(`  -> clear_boss at ${jc.t} ms, jingle ends ~${jc.t + 3100}, ending music at ${endMusic.t}: silent gap ~${endMusic.t - jc.t - 3100} ms`);
  check('H1 clear_boss jingle then ending loop reachable', !!jc && !!endMusic, { jc: jc && jc.t, end: endMusic && endMusic.t });
  log('errors:', b.t.errors);
  await b.t.close();
}

// ------------------------------------------------------------------------------------------------------------------
if (want('I')) {
  log('\n=== I. extend jingle during play (resume) and hurry tempo interplay');
  const b = await boot();
  await b.key('ArrowDown', 300);
  await b.call(() => { fz.start(1, 3, 21); fz.Game.debug.skipIntro(); fz.Game.debug.god(true); });
  await b.t.page.waitForTimeout(3800);
  await b.clearLog();
  // collect all six letters by giving the player letters
  await b.call(() => { const S = fz.Game.debug._S(); const p = S.players[0]; p.letters = [true, true, true, true, true, false]; fz.Game.debug.spawn('letter', p.x, p.y); });
  await b.t.page.waitForTimeout(300);
  await b.call(() => { const S = fz.Game.debug._S(); const bub = S.bubbles.find((x) => x.kind === 'letter'); const p = S.players[0]; if (bub) { p.x = bub.x - 4; p.y = bub.y - 4; } });
  await b.t.page.waitForTimeout(5200);
  const tl = await b.timeline();
  log(fmtTL(tl));
  const al = (await b.alog()).filter((x) => x.call !== 'sfx');
  log(al.map((x) => `  ${x.t}ms ${x.call}(${JSON.stringify(x.args)}) in ${x.scene}/${x.phase}`).join('\n'));
  log('errors:', b.t.errors);
  await b.t.close();
}

const bad = results.filter((r) => !r[1]);
log(`\n${results.length - bad.length}/${results.length} checks passed` + (bad.length ? '; FAILED: ' + bad.map((r) => r[0]).join(', ') : ''));
