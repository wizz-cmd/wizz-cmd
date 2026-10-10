// "Teleport bot": plays every round with the real capture/pop/food/clear/transition logic (player is teleported next to targets,
// so level geometry is not tested). Verifies every round (1-29) can be cleared by the rules and moves on to the next level.
import { boot, log } from './qa_codereview_lib.mjs';
const b = await boot({ players: 1, level: 1, seed: 1 });
const SRC = (L) => `(() => {
  fz.start(1, ${L}, 77); const D = fz.Game.debug; D.god(true);
  const S = D._S(); const p = S.players[0];
  let f = 0, cleared = -1, trapEvents = 0, popped = 0, maxLetters = 0;
  for (; f < 5000; f++) {
    fz.input.clear();
    if (S.phase === 'intro') { D.skipIntro(); }
    const tb = S.bubbles.find((x) => x.kind === 'trapped' && !x.dead);
    if (S.phase === 'play' || S.phase === 'clear') {
      if (tb && S.phase === 'play') { p.x = tb.x; p.y = tb.y; p.vy = 0; }
      else {
        const e = S.enemies.filter((x) => x.state === 'active' || x.state === 'frozen').sort((a, b) => a.x - b.x)[0];
        if (e) { const dir = e.x > 128 ? 1 : -1; p.x = Math.max(16, Math.min(224, e.x - dir * 12)); p.y = e.y; p.vy = 0; p.face = dir; if (f % 3 === 0) fz.input.set(0, { fire: true }); }
      }
      // collect food
      const it = S.items.find((i) => i.kind.startsWith('food_') || i.kind.startsWith('pu_'));
      if (it && S.enemies.length === 0) { p.x = it.x; p.y = it.y; p.vy = 0; }
    }
    fz.step(1);
    if (S.level !== ${L}) { cleared = f; break; }
  }
  return { L: ${L}, cleared, level: S.level, frames: f, phase: S.phase, left: S.enemies.map((e) => e.t + ':' + e.state), score: p.score };
})()`;
let bad = 0;
for (let L = 1; L <= 29; L++) {
  const r = await b.page.evaluate(SRC(L));
  const ok = r.cleared >= 0;
  if (!ok) bad++;
  log(`R${String(L).padStart(2)} ${ok ? 'cleared in ' + r.cleared + ' frames -> round ' + r.level : 'NOT CLEARED after ' + r.frames + ' phase=' + r.phase + ' left=' + JSON.stringify(r.left)} score=${r.score}`);
}
log('uncleared rounds:', bad, 'errors', b.t.errors);
await b.t.close();
