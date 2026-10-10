// join() in every phase, endGame() paths, zombie players, parasol skip, extend in every phase: no exceptions, sane end state
import { boot, log, check } from './qa3_diffreview_lib.mjs';
const b = await boot({ players: 1, level: 3, seed: 9, god: false, skipIntro: false });
const R = await b.page.evaluate(() => {
  const D = fz.Game.debug; const S = () => D._S(); const out = []; const errs = [];
  const tryit = (label, f) => { try { const r = f(); out.push({ label, ...(r || {}) }); } catch (e) { errs.push(label + ': ' + e.message); } };
  const fresh = (lvl) => { fz.start(1, lvl, 9); };
  // join in the intro
  tryit('join intro', () => { fresh(3); fz.Game.join(1); fz.step(5); return { players: S().players.length, phase: D.state().phase }; });
  tryit('join play', () => { fresh(3); D.skipIntro(); fz.step(20); fz.Game.join(1); fz.step(5); return { players: S().players.length, inv: S().players[1].inv }; });
  tryit('join clear', () => { fresh(3); D.skipIntro(); D.killAll(); for (let f = 0; f < 400 && D.state().phase !== 'clear'; f++) fz.step(1); const ph = D.state().phase; fz.Game.join(1); fz.step(2); return { ph, players: S().players.length }; });
  tryit('join transition', () => { fresh(3); D.skipIntro(); D.killAll(); for (let f = 0; f < 900 && D.state().phase !== 'transition'; f++) fz.step(1); const ph = D.state().phase; fz.Game.join(1); const pend = S().pendingJoin; for (let f = 0; f < 200; f++) fz.step(1); return { ph, pend, players: S().players.length, phaseAfter: D.state().phase, level: D.state().level }; });
  tryit('join gameover', () => { fresh(3); D.skipIntro(); const p = S().players[0]; p.lives = 1; p.state = 'dying'; p.dieT = 0; p.lives = 0; for (let f = 0; f < 400 && D.state().phase !== 'gameover'; f++) fz.step(1); const ph = D.state().phase; fz.Game.join(1); return { ph, players: S().players.length }; });
  // dying with 0 lives when round clears in 2P -> zombie
  tryit('2P: P2 dies last life while round clears', () => { fz.start(2, 3, 9); D.skipIntro(); const p2 = S().players[1]; p2.lives = 1; p2.inv = 0; p2.state = 'dying'; p2.dieT = 0; p2.lives = 0; D.killAll(); for (let f = 0; f < 1200 && D.state().phase !== 'play' && f < 1200; f++) { fz.step(1); if (D.state().level === 4) break; } return { level: D.state().level, p2state: S().players[1].state, phase: D.state().phase }; });
  // all players out at transition
  tryit('all out at beginTransition', () => { fz.start(2, 3, 9); D.skipIntro(); D.noClear(true); for (const p of S().players) { p.lives = 0; p.state = 'dying'; p.dieT = 0; } D.killAll(); D.noClear(false); for (let f = 0; f < 1500 && !fz.Game.isOver(); f++) fz.step(1); return { over: fz.Game.isOver(), phase: D.state().phase }; });
  // parasol at 29 / extend in clear
  tryit('parasol at 27', () => { fz.start(1, 27, 9); D.skipIntro(); D.give(0, 'parasol'); for (let f = 0; f < 900 && D.state().level === 27; f++) fz.step(1); return { level: D.state().level }; });
  tryit('parasol at 29', () => { fz.start(1, 29, 9); D.skipIntro(); D.give(0, 'parasol'); for (let f = 0; f < 900 && D.state().level === 29; f++) fz.step(1); return { level: D.state().level }; });
  tryit('extend completes during clear', () => {
    fz.start(1, 3, 9); D.skipIntro(); D.noClear(false); const p = S().players[0]; p.letters = [true, true, true, true, true, false];
    D.killAll(); for (let f = 0; f < 400 && D.state().phase !== 'clear'; f++) fz.step(1);
    D.spawn('letter', p.x, p.y); const lb = S().bubbles.find((q) => q.kind === 'letter'); lb.letter = 'D'; lb.x = p.x; lb.y = p.y; p.inv = 9999;
    fz.step(2); const ph = D.state().phase; for (let f = 0; f < 400; f++) fz.step(1);
    return { ph, phaseAfter: D.state().phase, level: D.state().level, lives: p.lives };
  });
  tryit('extend in boss round', () => { fz.start(1, 30, 9); D.skipIntro(); const p = S().players[0]; p.letters = [true, true, true, true, true, false]; D.spawn('letter', p.x, p.y); const lb = S().bubbles.find((q) => q.kind === 'letter'); lb.letter = 'D'; lb.x = p.x; lb.y = p.y; p.inv = 9999; fz.step(2); const ph = D.state().phase; for (let f = 0; f < 250; f++) fz.step(1); return { ph, phaseAfter: D.state().phase, bossPhase: D.state().bossPhase }; });
  return { out, errs };
});
for (const o of R.out) log(JSON.stringify(o));
log('exceptions', JSON.stringify(R.errs));
check('PJ1 no exceptions in any phase scenario', R.errs.length === 0, R.errs);
check('PJ2 errors', b.t.errors.length === 0, b.t.errors);
await b.t.close();
