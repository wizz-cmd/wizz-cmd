// Determinism / state-reset-between-games: the same seed + same scripted input must give bit-identical simulations, even when an
// unrelated (dirty) game ran before in the same page. Differences = state leaking across Game.start() or unseeded randomness.
import { boot, log } from './qa_codereview_lib.mjs';
const b = await boot({ players: 1, level: 1, seed: 1 });
const SRC = (dirty) => `(() => {
  const D = fz.Game.debug;
  if (${dirty}) {                         // dirty the page first: play a messy game with hurry, boss, extend, power-ups, 2P
    fz.start(2, 29, 999); D.skipIntro(); D.god(true);
    for (let i = 0; i < 1500; i++) { if (i === 200) D.give(0, 'shoes'); if (i === 300) D.give(1, 'gold'); if (i === 400) D.setHurryTimer(4000); if (i === 600) D.give(0, 'clock'); if (i === 800) D.killAll(); fz.input.set(0, { fire: i % 7 === 0, left: i % 90 < 45, right: i % 90 >= 45 }); fz.step(1); }
    D.setLevel(30); for (let i = 0; i < 300; i++) fz.step(1);
    fz.input.clear();
  }
  fz.start(2, 5, 123); D.skipIntro(); D.god(true);
  const r = fz.U.rng(7); const h = [];
  for (let i = 0; i < 3000; i++) {
    if (i % 5 === 0) for (let p = 0; p < 2; p++) fz.input.set(p, { left: r.chance(0.3), right: r.chance(0.3), jump: r.chance(0.2), fire: r.chance(0.5) });
    fz.step(1);
    if (i % 250 === 0) { const s = D.state(); h.push(JSON.stringify([s.level, s.phase, s.players.map((p) => [p.x, p.y, p.lives, p.score]), s.enemies.map((e) => [e.t, e.x, e.y, e.state]), s.bubbles.length])); }
  }
  fz.input.clear();
  return h;
})()`;
const a = await b.page.evaluate(SRC(false));
const c = await b.page.evaluate(SRC(false));
const d = await b.page.evaluate(SRC(true));
const same = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);
log('clean run == clean run  :', same(a, c));
log('clean run == after dirty :', same(a, d));
if (!same(a, d)) { const i = a.findIndex((v, k) => v !== d[k]); log('first divergence at sample', i, '\n clean:', a[i].slice(0, 300), '\n dirty:', d[i].slice(0, 300)); }
if (!same(a, c)) { const i = a.findIndex((v, k) => v !== c[k]); log('a vs c first divergence at sample', i, '\n a:', a[i] && a[i].slice(0, 400), '\n c:', c[i] && c[i].slice(0, 400)); }
const e = await b.page.evaluate(SRC(false));
log('4th run (clean) == 1st:', same(a, e), ' == 2nd:', same(c, e));
log('errors', b.t.errors);
await b.t.close();
