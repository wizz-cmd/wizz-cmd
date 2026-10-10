// BUG: a player who lost their LAST life (state 'dying', lives 0) while the round is being cleared by the partner
// is revived by startRound() with lives 0 (free life). 40_game.js beginTransition() only revives lives>0; startRound()
// (line ~352) revives every non-'out' player.
import { boot, log } from './qa_codereview_lib.mjs';
const b = await boot({ players: 2, level: 1, seed: 7 });
const { g, ev } = b;
await ev((H) => {
  H.D().clearEnemies();
  H.D().setPlayer(0, { lives: 1 });
  H.D().spawn('nibbler', H.P(0).x, H.P(0).y);       // touches P1 -> P1 dies on last life
  H.D().setPlayer(1, { x: 120, y: 200 });
});
await ev((H) => H.step(1));
log('after hit  ', JSON.stringify(await ev((H) => { const s = H.snap(); return { phase: s.phase, p0: s.players[0] }; })));
// partner (P2) grabs a PARASOL 5 frames later -> round cleared immediately, enemies removed
await ev((H) => { H.step(4); H.D().spawn('parasol', H.P(1).x, H.P(1).y); H.step(1); });
log('parasol    ', JSON.stringify(await ev((H) => { const s = H.snap(); return { phase: s.phase, p0state: H.P(0).state, dieT: H.P(0).dieT, lives0: H.P(0).lives }; })));
// run through clear + transition
let seen = [];
for (let i = 0; i < 400; i++) {
  await ev((H) => H.step(1));
  const r = await ev((H) => ({ ph: H.S().phase, lvl: H.S().level, st: H.P(0).state, lives: H.P(0).lives }));
  if (!seen.length || seen[seen.length - 1].ph !== r.ph || seen[seen.length - 1].st !== r.st) seen.push({ i, ...r });
}
log(JSON.stringify(seen));
const fin = await ev((H) => { const s = H.snap(); return { phase: s.phase, level: s.level, p0: { alive: s.players[0].alive, lives: s.players[0].lives, state: s.players[0].state } }; });
log('FINAL', JSON.stringify(fin));
log('BUG_REPRODUCED =', fin.p0.state === 'normal' && fin.p0.lives === 0);
log('errors', b.t.errors);
await b.t.close();
