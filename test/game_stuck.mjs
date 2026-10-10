// FIZZ & POP — game module: stuck-walker audit over rounds 1..29 (idle god player, hurry disabled).
//   node test/game_stuck.mjs [seeds=3] [frames=4500] [limit=700]    HTML via FIZZ_HTML (default dist/fizzpop.html)
// For every walker/springle the longest stretch (frames) it stays inside a 28 px box is measured; any stretch
// longer than `limit` frames is reported. Exit code 1 when anything is stuck.
import { launch, fp } from '../tools/harness.mjs';
const seeds = +(process.argv[2] || 3), frames = +(process.argv[3] || 4500), limit = +(process.argv[4] || 700);
const t = await launch({ html: process.env.FIZZ_HTML || undefined });
const g = fp(t.page); await g.freeze(true);
const res = await t.page.evaluate(({ seeds, frames, limit }) => {
  window.fz = window.__fizzpop;
  const bad = [], worstByLevel = {};
  for (let seed = 1; seed <= seeds; seed++) for (let lvl = 1; lvl <= 29; lvl++) {
    fz.start(1, lvl, seed * 7 + 1); const D = fz.Game.debug; D.god(true); D.noClear(true); D.skipIntro();
    const S = D._S();
    const anc = S.enemies.map((e) => ({ x: e.x, y: e.y, since: 0, worst: 0, at: null }));
    for (let i = 0; i < frames; i++) {
      S.hurryT = 0; fz.step(1);
      S.enemies.forEach((e, k) => {
        if (e.t === 'jellop' || e.t === 'glimmer' || e.state !== 'active') return;
        const a = anc[k];
        if (Math.abs(e.x - a.x) > 28 || Math.abs(e.y - a.y) > 28) { a.x = e.x; a.y = e.y; a.since = i; }
        if (i - a.since > a.worst) { a.worst = i - a.since; a.at = [Math.round(a.x), Math.round(a.y)]; }
      });
    }
    anc.forEach((a, k) => {
      worstByLevel[lvl] = Math.max(worstByLevel[lvl] || 0, a.worst);
      if (a.worst > limit) bad.push({ lvl, seed, t: S.enemies[k].t, frames: a.worst, at: a.at });
    });
  }
  return { bad, worstByLevel };
}, { seeds, frames, limit });
console.log('worst confined stretch per round (frames):', JSON.stringify(res.worstByLevel));
for (const b of res.bad) console.log('STUCK', JSON.stringify(b));
console.log(res.bad.length ? `FAIL ${res.bad.length} stuck walkers` : 'PASS no walker confined for more than ' + limit + ' frames', t.errors.length ? 'ERRORS ' + t.errors : '');
await t.close();
process.exit(res.bad.length || t.errors.length ? 1 : 0);
