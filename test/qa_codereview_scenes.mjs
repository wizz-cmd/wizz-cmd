// Scene-hopping fuzz through Main: random goto() sequences (with and without args), random virtual input incl. pause/up/down,
// during and after games; checks for console/page errors and scene soundness.
import { launch, fp, log } from './qa_codereview_lib.mjs';
const t = await launch({});
const g = fp(t.page);
await g.freeze(true);
const res = await g.evaluate(() => {
  const rnd = fz.U.rng(31337);
  const names = ['title', 'story', 'howto', 'scores', 'entry', 'ending', 'play', 'title', 'play', 'play'];
  const errs = [], seen = {};
  for (let i = 0; i < 400; i++) {
    const n = rnd.pick(names);
    try {
      const args = rnd.chance(0.5) ? undefined : (n === 'entry' ? { entries: [{ pi: 0, score: rnd.int(0, 60000), round: rnd.int(1, 30) }, { pi: 1, score: rnd.int(0, 60000), round: 30 }].slice(0, rnd.int(0, 2)) }
        : n === 'ending' ? { res: { won: true, level: 30, scores: [rnd.int(0, 99999), rnd.int(0, 99999)], players: rnd.int(1, 2) }, entries: [{ pi: 0, score: 100, round: 30 }] }
        : n === 'play' ? { players: rnd.int(1, 2), level: rnd.int(1, 30), seed: rnd.int(1, 999) }
        : n === 'story' ? { attract: rnd.chance(0.5), next: { players: 1, level: 1, seed: 3 } } : n === 'howto' ? { page: rnd.int(-1, 7), attract: rnd.chance(0.3) } : { afterGame: rnd.chance(0.5), highlight: [rnd.int(0, 9)] });
      fz.goto(n, args);
    } catch (e) { errs.push('goto ' + n + ': ' + e.message); }
    const steps = rnd.int(1, 120);
    for (let s = 0; s < steps; s++) {
      if (s % 9 === 0) { for (let p = 0; p < 2; p++) fz.input.set(p, { left: rnd.chance(0.3), right: rnd.chance(0.3), jump: rnd.chance(0.3), fire: rnd.chance(0.4), up: rnd.chance(0.2), down: rnd.chance(0.2), pause: rnd.chance(0.05) }); }
      try { fz.step(1); } catch (e) { errs.push('step in ' + fz.scene() + ': ' + e.message); break; }
      seen[fz.scene()] = (seen[fz.scene()] || 0) + 1;
    }
  }
  fz.input.clear();
  return { errs: errs.slice(0, 10), nerr: errs.length, seen };
});
log(JSON.stringify(res));
log('console errors', JSON.stringify(t.errors));
await t.close();
