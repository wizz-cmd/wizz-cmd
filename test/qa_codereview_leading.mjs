// BUG: leadingPlayer() (40_game.js ~684) starts with best=0 and only compares alive players, so when P1 is 'out' with the
// higher score the periodic EXTEND letter is generated for P1 (all letters missing) -> P2 (the only player left) mostly
// gets letters he already owns (worth only +500) and EXTEND becomes very hard to complete.
import { boot, log } from './qa_codereview_lib.mjs';
const b = await boot({ players: 2, level: 1, seed: 1 });
const { ev } = b;
await ev((H) => { H.D().clearEnemies(); H.D().noClear(true); H.D().god(true); });
const N = 60; let dCount = 0, total = 0; const letters = {};
for (let i = 0; i < N; i++) {
  const l = await ev((H, i) => {
    const S = H.S();
    S.rng = fz.U.rng(1000 + i);
    S.bubbles = [];
    S.players[0].state = 'out'; S.players[0].lives = 0; S.players[0].score = 5000;
    S.players[1].score = 100; S.players[1].letters = [true, true, true, true, true, false]; // needs only 'D'
    // force the periodic letter roll to succeed
    S.rng = { ...S.rng, chance: () => true };
    S.letterT = 1;
    H.step(1);
    const lb = S.bubbles.find((x) => x.kind === 'letter');
    return lb ? lb.letter : null;
  }, i);
  if (l) { total++; letters[l] = (letters[l] || 0) + 1; if (l === 'D') dCount++; }
}
log('letter bubbles spawned:', total, 'distribution', JSON.stringify(letters));
log('fraction that is the needed D:', (dCount / total).toFixed(2), '(expected 1.00 if correct, ~0.17 with the bug)');
log('BUG_REPRODUCED =', dCount / total < 0.5);
log('errors', b.t.errors);
await b.t.close();
