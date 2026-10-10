// FIZZ & POP — physics reachability check of the LEVELS against the REAL Game physics.
// Breadth-first search over player macro-moves (walk, jump with horizontal hold patterns) simulated through
// Game.update itself, starting at the P1 pad. Reports walker spawn surfaces and platform surfaces that no
// macro sequence reaches. Complements tools/validate_levels.mjs (which uses an approximate jump model).
//   node test/game_reach.mjs [--levels 1,2,3 | all] [--stub]      default: rounds 1..10 of the real src/30_levels.js
import { launch, PROJECT } from '../tools/harness.mjs';
import path from 'path';

const args = process.argv.slice(2);
const useStub = args.includes('--stub');
const li = args.indexOf('--levels');
let which = li >= 0 ? args[li + 1] : '1,2,3,4,5,6,7,8,9,10';
const t = await launch({ html: path.join(PROJECT, 'test', 'game_harness.html') + (useStub ? '' : '?real=gfx') });
// real LEVELS need the all-real page
if (!useStub) { await t.close(); }
const tt = useStub ? t : await launch({ html: path.join(PROJECT, 'test', 'game_harness.html') + '?real=1' + (process.env.BASE ? '&base=' + process.env.BASE : '') + (process.env.GAME ? '&game=' + process.env.GAME : '') });   // BASE / GAME: see test/game_tests.mjs
const page = tt.page;
await page.evaluate(() => __t.freeze(true));
const nLevels = await page.evaluate(() => LEVELS.length);
const list = which === 'all' ? Array.from({ length: nLevels }, (_, i) => i + 1) : which.split(',').map(Number);

let bad = 0;
for (const lv of list) {
  const r = await page.evaluate((level) => {
    const T = __t;
    T.arena({ level, empty: true, noClear: true });
    Game.debug.god(true);
    const S = T.S(), p = S.players[0];
    const def = LEVELS[level - 1];
    const NO = { left: false, right: false, jump: false, fire: false, jumpPressed: false, firePressed: false };
    const solid = (c, r) => c < 0 || c >= 32 || (r >= 0 && r < 26 && def.map[r][c] === '#');
    const landable = (c, r) => r >= 1 && r < 26 && solid(c, r) && !solid(c, r - 1);
    const QX = 4;
    const key = (x, y) => Math.round(x / QX) + ',' + Math.round(y);
    const seen = new Map();                    // key -> [x, y]
    const queue = [];
    const add = (x, y) => { const k = key(x, y); if (!seen.has(k)) { seen.set(k, [x, y]); queue.push([x, y]); } };

    function place(x, y) {
      // isolate the physics: no spawns, items, bubbles or power-ups may interfere with the macro
      S.bubbles.length = 0; S.items.length = 0; S.proj.length = 0; S.puT = -1; S.specialT = 1e9; S.letterT = 1e9; S.hurryT = 0; S.ghost = null;
      p.power = { shoes: false, pink: false, blue: false, gold: false };
      p.x = x; p.y = y; p.vx = 0; p.vy = 0; p.onGround = true; p.state = 'normal'; p.stunT = 0; p.face = 1; p.inv = 0; p.jumpBuf = 0; }
    /** Run one macro; every grounded position seen is reported through add(). */
    function macro(x, y, dir, jump, holdFrames) {
      place(x, y);
      let airborne = false, stuck = 0, lastX = p.x, frames = 0;
      for (let f = 0; f < 260; f++) {
        const hold = dir !== 0 && (holdFrames < 0 || f < holdFrames);
        const inp = { left: hold && dir < 0, right: hold && dir > 0, jump: f === 0 && jump, fire: false, jumpPressed: f === 0 && jump, firePressed: false };
        Game.update([inp, NO]);
        frames++;
        if (!p.onGround) airborne = true;
        else { add(p.x, p.y); if (airborne) return; }
        if (p.y > 224 || p.y < 0) { /* wrapped: keep simulating */ }
        if (Math.abs(p.x - lastX) < 0.001 && !jump && p.onGround) { if (++stuck > 4) return; } else stuck = 0;
        lastX = p.x;
        if (!jump && !hold && p.onGround && f > 2) return;
      }
    }

    add(24, 200);
    const holds = [0, 5, 10, 15, 20, 25, 30, 38, -1];
    let steps = 0;
    while (queue.length && steps < 4000) {
      const [x, y] = queue.shift(); steps++;
      for (const dir of [-1, 1]) macro(x, y, dir, false, -1);                 // walk / drop off the edge
      for (const dir of [-1, 0, 1]) for (const h of holds) { if (dir === 0 && h !== 0) continue; macro(x, y, dir, true, h); }
    }
    // evaluate surfaces
    const reachedOnRow = (y) => [...seen.values()].filter((v) => Math.abs(v[1] - y) < 0.5);
    const runs = [];                           // all landable surface runs
    for (let r = 1; r < 26; r++) {
      let c = 2;
      while (c < 30) {
        if (landable(c, r)) { const c0 = c; while (c < 30 && landable(c, r)) c++; runs.push([r, c0, c - 1]); } else c++;
      }
    }
    const runReached = (run) => {
      const [r, c0, c1] = run, y = 16 + r * 8 - 16;
      return reachedOnRow(y).some((v) => v[0] + 14 > c0 * 8 && v[0] + 2 < (c1 + 1) * 8);
    };
    const unreachedRuns = runs.filter((rn) => !runReached(rn)).map((rn) => ({ row: rn[0], c0: rn[1], c1: rn[2] }));
    const walkerBad = [];
    const walkers = new Set(['nibbler', 'crabbit', 'springle']);
    def.enemies.forEach((e, i) => {
      if (!walkers.has(e.t)) return;
      const r = e.r + 2;
      const run = runs.find((rn) => rn[0] === r && ((e.c >= rn[1] && e.c <= rn[2]) || (e.c + 1 >= rn[1] && e.c + 1 <= rn[2])));
      if (!run) { walkerBad.push({ i, t: e.t, c: e.c, r: e.r, why: 'no surface' }); return; }
      if (!runReached(run)) walkerBad.push({ i, t: e.t, c: e.c, r: e.r, why: 'unreached run row ' + run[0] + ' cols ' + run[1] + '-' + run[2] });
    });
    return { positions: seen.size, steps, runs: runs.length, unreachedRuns, walkerBad, map: def.map, pts: [...seen.values()] };
  }, lv);
  const flag = r.walkerBad.length ? 'ERR ' : r.unreachedRuns.length ? 'warn' : 'ok  ';
  if (r.walkerBad.length) bad++;
  console.log(`round ${String(lv).padStart(2)}  ${flag} positions ${String(r.positions).padStart(4)}  surfaces ${String(r.runs).padStart(3)}  unreached surfaces ${r.unreachedRuns.length}  unreachable walker spawns ${r.walkerBad.length}`);
  for (const w of r.walkerBad) console.log('        walker spawn:', JSON.stringify(w));
  for (const u of r.unreachedRuns.slice(0, 8)) console.log('        unreached surface: row', u.row, 'cols', u.c0 + '-' + u.c1);
  if (args.includes('--pts')) console.log(JSON.stringify(r.pts.map((v) => [Math.round(v[0]), Math.round(v[1] * 10) / 10]).sort((a, b) => a[1] - b[1] || a[0] - b[0])));
  if (args.includes('--ascii')) {
    const grid = r.map.map((row) => row.split(''));
    for (const [x, y] of r.pts) { const row = Math.round((y + 16 - 16) / 8); const c0 = Math.floor((x + 2) / 8), c1 = Math.floor((x + 13.99) / 8); for (let c = c0; c <= c1; c++) if (grid[row] && grid[row][c] === '#') grid[row][c] = '='; }
    console.log('     ' + '0123456789'.repeat(4).slice(0, 32));
    grid.forEach((g, i) => console.log(String(i).padStart(3) + '  ' + g.join('')));
  }
}
console.log(tt.errors.length ? 'errors: ' + tt.errors.join(' | ') : 'no page errors');
await tt.close();
process.exit(bad || tt.errors.length ? 1 : 0);
