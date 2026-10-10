// FIZZ & POP — test/levels_pockets.mjs
// Pocket finder: which standing cells of a round are "pockets" that hold a walker for good?
// For every standable 2x2 box position of a round the script spawns a walker (nibbler / springle) in the REAL game
// (debug.spawn), parks a god player on the P1 pad, disables HURRY UP and lets everybody roam for N frames. A start
// cell is a POCKET when, during the last WINDOW frames, the walker stayed inside a small box (default <= 64 x 40 px)
// although it could roam (a free walker covers a whole platform or falls to the next one).
// Several start cells resting in the same spot are listed together: more starts than the pocket has cells means
// walkers from elsewhere really walk / fall into it.
//
//   node test/levels_pockets.mjs [--html file] [--levels 12,26|all] [--types nibbler,springle] [--frames 4500]
//                                [--window 3000] [--ascii] [--seeds 1] [--target none|pad|roam]
// --target none (default): the player is parked in a never-ending death animation, so nobody chases it and the result is
// the pure geometry of the round; --target pad: a god player idles on the P1 pad (springles drift towards it);
// --target roam: the god player teleports to a random standing cell every 150 frames (walkers react like in play).
// FIZZ_HTML env also selects the page (default dist/fizzpop.html).
import { launch, fp } from '../tools/harness.mjs';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const html = arg('--html', process.env.FIZZ_HTML || undefined);
const lv = arg('--levels', 'all');
const levels = lv === 'all' ? Array.from({ length: 29 }, (_, i) => i + 1) : lv.split(',').map(Number);
const types = arg('--types', 'nibbler,springle').split(',');
const FRAMES = +arg('--frames', 4500), WINDOW = +arg('--window', 3000);
const ASCII = args.includes('--ascii');
const seeds = +arg('--seeds', 1);
const BOX_W = +arg('--boxw', 64), BOX_H = +arg('--boxh', 40);
const TARGET = arg('--target', 'none');

function sim(level, type, seed, frames, windowF, target) {
  const G = fz.Game, D = G.debug;
  fz.start(1, level, seed); D.skipIntro(); D.clearEnemies(); D.noClear(true); D.god(true); D.setHurryTimer(-1e7);
  const S = D._S(); const map = S.map;
  const solid = (c, r) => c < 0 || c >= 32 || (r >= 0 && r < 26 && map[r][c] === '#');
  const landable = (c, r) => r >= 1 && r < 26 && solid(c, r) && !solid(c, r - 1);
  S.puT = -1; S.specialT = 1e9; S.letterT = 1e9;
  const starts = [];
  for (let s = 3; s <= 24; s++) for (let c = 2; c <= 28; c++) {
    // 2x2 box at cols c..c+1, rows s-2..s-1 free; the sprite is held by the surface under it
    if (solid(c, s - 1) || solid(c + 1, s - 1) || solid(c, s - 2) || solid(c + 1, s - 2)) continue;
    if (!(landable(c, s) || landable(c + 1, s))) continue;
    starts.push({ c, s });
  }
  // spawn pads stay free for the player
  const ents = starts.map((q) => {
    D.spawn(type, q.c * 8, q.s * 8);
    const e = S.enemies[S.enemies.length - 1]; e.d = (q.c + q.s) % 2 ? 1 : -1; return e;
  });
  const trk = ents.map((e) => ({ e, x0: [], pts: [] }));
  const P0 = S.players[0];
  for (let f = 0; f < frames; f++) {
    if (target === 'none') { P0.state = 'dying'; P0.dieT = -1e9; P0.y = 400; }
    else if (target === 'roam' && f % 150 === 0) {
      const q = starts[(f * 7919 + level * 31) % starts.length];
      D.setPlayer(0, { x: q.c * 8, y: q.s * 8, vx: 0, vy: 0, onGround: true, inv: 1e9, state: 'normal' });
    }
    fz.step(1);
    if (f % 10 === 0 && f >= frames - windowF) for (const t of trk) t.pts.push([t.e.x, t.e.y]);
  }
  const out = [];
  trk.forEach((t, i) => {
    const xs = t.pts.map((p) => p[0]), ys = t.pts.map((p) => p[1]);
    const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
    const cells = new Set(t.pts.map((p) => `${Math.round(p[0] / 8)},${Math.round(p[1] / 8)}`));
    out.push({ c: starts[i].c, s: starts[i].s, bw: Math.round(bw), bh: Math.round(bh), cells: cells.size,
      mx: Math.round((Math.min(...xs) + Math.max(...xs)) / 2), my: Math.round((Math.min(...ys) + Math.max(...ys)) / 2),
      dead: t.e.dead || t.e.state !== 'active' });
  });
  return { n: starts.length, out, map };
}

const t = await launch(html ? { html } : {});
const g = fp(t.page); await g.freeze(true);
let total = 0;
for (const L of levels) for (const type of types) {
  const pockets = new Map();                     // key "mx,my" -> {n, starts:[], bw, bh}
  let n = 0, map = null;
  for (let seed = 1; seed <= seeds; seed++) {
    const r = await t.page.evaluate(`(${sim.toString()})(${L}, ${JSON.stringify(type)}, ${seed}, ${FRAMES}, ${WINDOW}, ${JSON.stringify(TARGET)})`);
    n = r.n; map = r.map;
    for (const o of r.out) {
      if (o.dead || o.bw > BOX_W || o.bh > BOX_H) continue;
      const key = `${Math.round(o.mx / 8)},${Math.round(o.my / 8) - 2}`;           // resting tile (col, surface row)
      const p = pockets.get(key) || { key, starts: [], bw: 0, bh: 0, mx: o.mx, my: o.my };
      p.starts.push(`${o.c},${o.s}`); p.bw = Math.max(p.bw, o.bw); p.bh = Math.max(p.bh, o.bh);
      pockets.set(key, p);
    }
  }
  const rows = [...pockets.values()];
  total += rows.length;
  console.log(`R${L} ${type}: ${n} starts, ${rows.length} pocket(s)` + rows.map((p) => `\n   rest@col${p.mx / 8 | 0}/row${(p.my / 8 | 0)} box ${p.bw}x${p.bh}  starts=${p.starts.length} [${p.starts.slice(0, 8).join(' ')}${p.starts.length > 8 ? ' ...' : ''}]`).join(''));
  if (ASCII && rows.length && map) {
    const mark = new Map(); for (const p of rows) for (const s of p.starts) mark.set(s, '+');
    const rest = new Set(); for (const p of rows) for (const dx of [-8, 0, 8]) rest.add(`${Math.round((p.mx + dx) / 8)},${Math.round(p.my / 8) - 1}`);
    const lines = map.map((row, r) => [...row].map((ch, c) => (ch === '#' ? '#' : rest.has(`${c},${r}`) ? 'X' : mark.has(`${c},${r + 1}`) || mark.has(`${c - 1},${r + 1}`) ? '+' : '.')).join(''));
    console.log(lines.map((l, r) => String(r).padStart(2) + ' ' + l).join('\n'));
  }
}
console.log('TOTAL pockets', total, t.errors.length ? 'ERRORS ' + t.errors.join(' | ') : 'no page errors');
await t.close();
