// FIZZ & POP — test/levels_stuckmap.mjs
// Natural-spawn confinement check with a map picture (a re-implementation of qa_mechanics_stuck2 that also prints WHERE):
// every enemy of a round roams for N frames next to an idle god player (HURRY UP off); a walker / springle that spends
// >= MINRUN frames inside a 28 px box counts as stuck. The ASCII map marks the stuck anchors with '@'.
//   node test/levels_stuckmap.mjs [--html file] [--levels 11,12|all] [--seeds 3,11,29] [--frames 3000] [--minrun 900] [--ascii] [--target pad|none]
// --target pad (default, like qa_mechanics_stuck2): the god player idles on the P1 pad, so Springles that crowd around it count as 'stuck'
// (they are chasing, not trapped); --target none: nobody to chase (the player dies in an endless animation) = pure geometry.
// FIZZ_HTML env also selects the page (default dist/fizzpop.html). Exit code 1 when anything is stuck.
import { launch, fp } from '../tools/harness.mjs';
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const html = arg('--html', process.env.FIZZ_HTML || undefined);
const lv = arg('--levels', 'all');
const levels = lv === 'all' ? Array.from({ length: 29 }, (_, i) => i + 1) : lv.split(',').map(Number);
const seeds = arg('--seeds', '3,11,29').split(',').map(Number);
const FRAMES = +arg('--frames', 3000), MINRUN = +arg('--minrun', 900), ASCII = args.includes('--ascii'), TARGET = arg('--target', 'pad');

function sim(level, seed, frames, minrun, target) {
  const D = fz.Game.debug;
  fz.start(1, level, seed); D.god(true); D.noClear(true); D.skipIntro();
  const S = D._S();
  const anchor = S.enemies.map((e) => ({ e, x: e.x, y: e.y, since: 0, worst: 0, at: null }));   // tracked by object, not by index
  for (let i = 0; i < frames; i++) {
    S.hurryT = 0;
    if (target === 'none') { const P0 = S.players[0]; P0.state = 'dying'; P0.dieT = -1e9; P0.y = 400; }
    fz.Game.update(target === 'none' ? [] : [{ left: false, right: false, jump: false, fire: false, jumpPressed: false, firePressed: false }]);     // v2: Game.update only (fz.step would also render a k x 256 px frame each time: 10+ min for this audit)
    for (const a of anchor) {
      const e = a.e;
      if (e.t === 'jellop' || e.t === 'glimmer' || e.dead) continue;
      if (Math.abs(e.x - a.x) > 28 || Math.abs(e.y - a.y) > 28) { a.x = e.x; a.y = e.y; a.since = i; }
      const run = i - a.since;
      if (run > a.worst) { a.worst = run; a.at = [Math.round(a.x), Math.round(a.y)]; }
    }
  }
  const rep = [];
  for (const a of anchor) if (a.worst >= minrun) rep.push({ t: a.e.t, worst: a.worst, at: a.at });
  return { rep, map: S.map };
}
const t = await launch(html ? { html } : {});
const g = fp(t.page); await g.freeze(true);
let count = 0;
for (const L of levels) {
  const all = []; let map = null;
  for (const seed of seeds) {
    const r = await t.page.evaluate(`(${sim.toString()})(${L}, ${seed}, ${FRAMES}, ${MINRUN}, ${JSON.stringify(TARGET)})`);
    map = r.map;
    for (const x of r.rep) all.push({ seed, ...x });
  }
  count += all.length;
  if (all.length) console.log(`R${L}: ` + all.map((x) => `${x.t}@(${x.at}) c${Math.round(x.at[0] / 8)}/r${Math.round((x.at[1] - 16) / 8)} ${x.worst}f s${x.seed}`).join('; '));
  if (ASCII && all.length) {
    const mk = new Set(all.map((x) => `${Math.round(x.at[0] / 8)},${Math.round((x.at[1] - 16) / 8)}`));
    console.log(map.map((row, r) => String(r).padStart(2) + ' ' + [...row].map((ch, c) => (mk.has(`${c},${r}`) || mk.has(`${c - 1},${r}`) ? '@' : ch)).join('')).join('\n'));
  }
}
console.log('stuck count', count, t.errors.length ? 'ERRORS ' + t.errors.join(' | ') : 'no page errors');
await t.close();
process.exit(count ? 1 : 0);
