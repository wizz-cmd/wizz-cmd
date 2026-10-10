// Ink telegraph/fan geometry, tempo transitions (phase 2, hurry, death, defeat), fanfare timing + ending queue, intro inertness
import { boot, log, check } from './qa3_diffreview_lib.mjs';
const k = await boot({ players: 1, level: 30, seed: 5, god: false });
const R = await k.page.evaluate(() => {
  const D = fz.Game.debug; const out = {};
  const S = () => D._S(); const boss = () => S().enemies.find((e) => e.t === 'kraken');
  const tempos = []; const origT = fz.AUDIO.setTempo; fz.AUDIO.setTempo = function (v) { tempos.push(v); return origT.apply(this, arguments); };
  const calls = []; for (const n of ['jingle', 'music', 'stopMusic']) { const o = fz.AUDIO[n]; fz.AUDIO[n] = function () { calls.push([n, ...[...arguments].map((a) => (typeof a === 'function' ? 'fn' : a))].join(':') + '@f' + S().frame); return o.apply(this, arguments); }; }
  // ---- ink fan
  const P = S().players[0]; P.inv = 1e9; P.x = 24; P.y = 200;   // far corner
  boss().x = 150; boss().y = 60; boss().jx = 0; boss().jy = 0;
  out.fanFar = null; out.fanNear = null; out.windFrames = 0;
  for (let f = 0; f < 140 && !out.fanFar; f++) {
    fz.step(1);
    const e = boss(); e.x = 150; e.y = 60;
    if (e.inkT > 0 && e.inkT <= 22) out.windFrames++;
    const ink = S().proj.filter((q) => q.type === 'ink');
    if (ink.length) out.fanFar = ink.map((q) => +Math.atan2(q.vy, q.vx).toFixed(3));
  }
  S().proj.length = 0;
  P.x = 150 + 8; P.y = 60 + 40;   // near the boss centre
  for (let f = 0; f < 140 && !out.fanNear; f++) {
    fz.step(1); const e = boss(); e.x = 150; e.y = 60;
    const ink = S().proj.filter((q) => q.type === 'ink');
    if (ink.length) out.fanNear = ink.map((q) => +Math.atan2(q.vy, q.vx).toFixed(3));
  }
  // ---- tempo: phase 2
  tempos.length = 0;
  boss().hp = 19; fz.step(2);
  out.tempoPhase2 = tempos.slice();
  // hurry in phase 2
  tempos.length = 0; D.setHurryTimer(150 * 60 + 1); fz.step(2);
  out.tempoHurry = tempos.slice(); out.hurry = D.state().hurry;
  // player death resets hurry -> back to 1.1
  tempos.length = 0; P.inv = 0; D.god(false); S().god = false;
  const q = S().players[0]; q.inv = 0; q.x = boss().x + 20; q.y = boss().y + 20; fz.step(2);
  out.tempoDeath = tempos.slice(); out.hurryAfterDeath = D.state().hurry;
  return out;
});
log(JSON.stringify(R));
const deg = (a) => (a * 180 / Math.PI);
check('BF1 telegraph lasts 22 frames before the fan', R.windFrames >= 21 && R.windFrames <= 23, R.windFrames);
check('BF2 far fan = 4 bullets, none aimed at the centre', R.fanFar && R.fanFar.length === 4, R.fanFar);
check('BF3 near fan = only the 2 outer bullets', R.fanNear && R.fanNear.length === 2, R.fanNear);
check('BF4 phase 2 sets tempo 1.1', R.tempoPhase2.includes(1.1), R.tempoPhase2);
check('BF5 hurry in boss round = 1.15', R.tempoHurry.includes(1.15) && R.hurry, R.tempoHurry);
check('BF6 death clears hurry and returns to phase-2 tempo 1.1', R.tempoDeath.includes(1.1) && !R.hurryAfterDeath, R);
await k.t.close();

// ---- defeat + fanfare + ending queue (real timing through Game only)
const d = await boot({ players: 1, level: 30, seed: 5, god: true });
const Q = await d.page.evaluate(() => {
  const D = fz.Game.debug; const S = () => D._S(); const out = {};
  const calls = []; for (const n of ['jingle', 'music', 'stopMusic', 'setTempo']) { const o = fz.AUDIO[n]; fz.AUDIO[n] = function () { calls.push(n + '(' + [...arguments].map((a) => (typeof a === 'function' ? 'fn' : JSON.stringify(a))).join(',') + ')@f' + S().frame); return o.apply(this, arguments); }; }
  const sf = []; const os = fz.AUDIO.sfx; fz.AUDIO.sfx = function (n) { if (n === 'boss_die' || n === 'trap') sf.push(n + '@f' + S().frame); return os.apply(this, arguments); };
  const boss = () => S().enemies.find((e) => e.t === 'kraken');
  D.setHurryTimer(150 * 60 + 5); fz.step(2);
  out.hurryBefore = D.state().hurry;
  boss().hp = 1; boss().x = 60; boss().y = 60; boss().jx = 0; boss().jy = 0;
  // pop a thunder bubble to kill
  D.spawn('thunder', 160, 70); const th = S().bubbles[S().bubbles.length - 1]; th.att = null;
  const P = S().players[0]; P.x = 160; P.y = 70;
  for (let f = 0; f < 40 && S().bossPhase === 'fight'; f++) { boss().x = 60; boss().y = 60; fz.step(1); }
  out.phaseAfterHit = S().bossPhase;
  calls.length = 0;
  // go touch the boss bubble
  const bb = S().bossBubble; P.x = bb.x + 20; P.y = bb.y + 20;
  const f0 = S().frame;
  for (let f = 0; f < 120; f++) { fz.step(1); }
  out.calls = calls.slice(); out.sfx = sf.slice(); out.popFrame = f0;
  out.state = { phase: S().phase, bossPhase: S().bossPhase, hurry: D.state().hurry, ghost: D.state().ghost };
  return out;
});
log(JSON.stringify(Q));
check('BF7 hurry cleared at defeat and bossBusy blocks restart', !Q.state.hurry && !Q.state.ghost, Q.state);
check('BF8 stopMusic then (60 frames later) jingle clear_boss + music ending', Q.calls.some((c) => c.startsWith('stopMusic')) && Q.calls.some((c) => c.startsWith('jingle("clear_boss")')) && Q.calls.some((c) => c.startsWith('music("ending")')), Q.calls);
await d.t.close();

// ---- intro inertness
const i = await boot({ players: 1, level: 9, seed: 5, skipIntro: false });
const I = await i.page.evaluate(() => {
  const D = fz.Game.debug; const S = () => D._S(); const out = {};
  const P = S().players[0];
  let lostLifeDuringIntro = false, lives0 = P.lives;
  // walk the player into the enemies' spawn boxes during the intro
  const e0 = S().enemies[0];
  for (let f = 0; f < 150; f++) {
    // teleport player onto each enemy in turn
    const e = S().enemies[f % S().enemies.length]; P.x = e.x; P.y = e.y; P.vy = 0;
    fz.step(1);
    if (P.lives < lives0 || P.state !== 'normal') lostLifeDuringIntro = true;
  }
  out.lostLifeDuringIntro = lostLifeDuringIntro; out.phase = D.state().phase; out.inv = P.inv; out.enemyStates = S().enemies.map((e) => e.state);
  // now first play frames: enemy contact must not kill during the 60-frame grace
  P.x = S().enemies[0].x; P.y = S().enemies[0].y;
  for (let f = 0; f < 50; f++) { fz.step(1); }
  out.aliveAfter50 = P.state === 'normal' && P.lives === lives0;
  return out;
});
log(JSON.stringify(I));
check('IN1 no death during the intro even when standing on entering enemies', !I.lostLifeDuringIntro, I);
check('IN2 60-frame grace at play start', I.aliveAfter50, I);
await i.t.close();
