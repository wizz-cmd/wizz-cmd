// FIZZ & POP — test/levels_check.mjs
// Extra level analysis on top of tools/validate_levels.mjs (which is the contract check).
//   node test/levels_check.mjs [--only N] [--quiet] [--json]
//
// 1. FAIRNESS      enemy spawn boxes close above a spawn pad (a player would be attacked while still "READY").
// 2. PHYSICS       a frame-accurate model of SPEC §4.1 (walk 1.25, jump vy -3.75, gravity 0.16, one-way tiles,
//                  walls block only when not already overlapping, wrap through floor gaps, wave 3: land on any overlap, eased off edges with < 4 px of foot support) is explored from the P1
//                  pad with walk / jump / air-steer macros. Reports: spawn surfaces of walkers that cannot be
//                  reached, positions a player can reach but never leave (TRAPS = not in the pad's strongly
//                  connected component), P2 reachability and whether the P2 pad can get back to P1.
// 3. AIR           for every air attractor: from how many reachable standing positions can a player pop a bubble
//                  sitting there (walk into it or jump into it)? 0 = unreachable gathering spot.
// 4. COVERAGE      per-round stats (solid tile count, floor gaps, platform rows) to spot samey rounds.
//
// The model is deliberately conservative: it only knows jump macros "hold direction h1 for t1 frames, then h2",
// with or without a jump at frame 0, so real players (who can steer continuously) can do at least as well.
import path from 'path';
import { fileURLToPath } from 'url';
import { loadLevels } from '../tools/validate_levels.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const COLS = 32, ROWS = 26, TILE = 8, MAP_Y = 16;
const WALK = 1.25, GRAV = 0.16, VTERM = 2.0, VJUMP = -3.75;
const BOX = 16, HB_L = 2, HB_R = 14, HB_T = 2;           // 16x16 box, hitbox inset (2,2) size 12x14
const X_MIN = 16, X_MAX = 224;                            // box x clamp used by Game (INNER_L .. INNER_R - 16)
const Y_CEIL = MAP_Y + TILE;                              // can't rise above row 1
const WRAP_Y = 224;
const GRID = 2;                                           // state grid in px
const T1 = [0, 2, 4, 6, 8, 10, 13, 16, 20, 24, 28, 33, 38, 44, 52, 60];
const MAX_FRAMES = 240;
const BUBBLE_HALF = 7;                                    // popping box of a floating bubble (px, half size)

// ---------------------------------------------------------------------------------------------
// Mirrors src/40_game.js physStep / landingY / moveX (same constants, same landable-tile rule).
const EPS = 1e-4;
function world(map) {
  const solid = (c, r) => (c < 0 || c >= COLS ? true : r < 0 || r >= ROWS ? false : map[r][c] === '#');
  const landable = (c, r) => r >= 1 && r < ROWS && solid(c, r) && !solid(c, r - 1);   // solid with empty space above, never row 0
  return { map, solid, landable };
}

/** Does the 12x14 body box of the 16x16 sprite at (x, y) overlap any solid tile? */
function overlapsInner(w, x, y) {
  const c0 = Math.floor((x + HB_L) / TILE), c1 = Math.floor((x + HB_R - EPS) / TILE);
  const r0 = Math.floor((y + HB_T - MAP_Y) / TILE), r1 = Math.floor((y + BOX - EPS - MAP_Y) / TILE);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (w.solid(c, r)) return true;
  return false;
}

/** Tile-top y the body lands on when its feet go from f0 to f1 (falling), or null. Wave 3 (Game.landingY with minSup 0): a landing
 *  happens on ANY overlap with a landable tile (a failed landing would sink the body into the platform end); a player whose platform
 *  carries less than FOOT_SUPPORT px of the 12 px body is then eased off the edge (easeOff), see below. */
const FOOT_SUPPORT = 4;
function landingY(w, xa, xb, f0, f1) {
  const rb = Math.ceil((f0 - MAP_Y - EPS) / TILE);
  if (rb < 1 || rb >= ROWS) return null;
  const top = MAP_Y + rb * TILE;
  if (top > f1 + EPS) return null;
  const c0 = Math.floor(xa / TILE), c1 = Math.floor((xb - EPS) / TILE);
  let sup = 0;
  for (let c = c0; c <= c1; c++) if (w.landable(c, rb)) sup += Math.min(xb, (c + 1) * TILE) - Math.max(xa, c * TILE);
  return sup >= 1e-6 ? top : null;
}

/** Mirrors Game.easeOffEdge: a grounded player with 0 < support < FOOT_SUPPORT px is nudged 0.75 px/frame away from the centre of
 *  its support (never into a wall) until the overlap is gone and it falls. Sets st.thin so that explore() does not record such a
 *  landing as a standing state. */
function easeOff(w, st, top) {
  const rb = Math.round((top - MAP_Y) / TILE), xa = st.x + HB_L, xb = st.x + HB_R;
  let sup = 0, cx = 0;
  for (let c = Math.floor(xa / TILE); c <= Math.floor((xb - EPS) / TILE); c++) {
    if (!w.landable(c, rb)) continue;
    const o = Math.min(xb, (c + 1) * TILE) - Math.max(xa, c * TILE);
    sup += o; cx += o * (c * TILE + TILE / 2);
  }
  st.thin = sup > 0 && sup < FOOT_SUPPORT;
  if (!st.thin) return;
  const nx = Math.min(X_MAX, Math.max(X_MIN, st.x + ((xa + (HB_R - HB_L) / 2) - cx / sup >= 0 ? 0.75 : -0.75)));
  if (!overlapsInner(w, nx, st.y)) st.x = nx;
}

/** One 60 Hz tick. st = {x, y, vy, g}. h = -1/0/1, jump = bool (only effective when grounded). */
function tick(w, st, h, jump) {
  if (jump && st.g) { st.vy = VJUMP; st.g = false; }
  if (h) {
    let nx = st.x + h * WALK;
    nx = nx < X_MIN ? X_MIN : nx > X_MAX ? X_MAX : nx;
    if (!overlapsInner(w, st.x, st.y) && overlapsInner(w, nx, st.y)) {          // walls block only when not already inside solid
      if (h > 0) { const col = Math.floor((nx + HB_R - EPS) / TILE); nx = Math.max(st.x, col * TILE - HB_R); }
      else { const col = Math.floor((nx + HB_L) / TILE); nx = Math.min(st.x, (col + 1) * TILE - HB_L); }
    }
    st.x = nx;
  }
  const vy1 = Math.min(st.vy + GRAV, VTERM);
  const dy = (st.vy + vy1) / 2, y0 = st.y;
  st.y += dy; st.vy = vy1; st.g = false; st.thin = false;
  if (dy >= 0) {
    const top = landingY(w, st.x + HB_L, st.x + HB_R, y0 + BOX, st.y + BOX);
    if (top !== null) { st.y = top - BOX; st.vy = 0; st.g = true; easeOff(w, st, top); }
  } else if (st.y < Y_CEIL) { st.y = Y_CEIL; st.vy = 0; }
  if (st.y > WRAP_Y) { st.y -= WRAP_Y; st.wrapped = true; }
}

const keyOf = (x, s) => `${Math.round(x / GRID)}_${s}`;
const rowOf = (y) => Math.round(y / TILE);                // surface row of a grounded box (y = 8 * s)

/** Explore every state reachable from `start` and the macro edges between them. */
function explore(w, start, airPts) {
  const states = new Map();      // key -> {x, s}
  const edges = new Map();       // key -> Set(key)
  const pops = airPts.map(() => new Set());   // keys of states that can pop attractor i
  const queue = [];
  const add = (x, s) => {
    const k = keyOf(x, s);
    if (!states.has(k)) { states.set(k, { x, s, k }); edges.set(k, new Set()); queue.push(k); }
    return k;
  };
  add(start.x, start.s);
  const probe = (st, k) => {
    // does the hitbox at st overlap a bubble resting on an air point?
    const cx = st.x + (HB_L + HB_R) / 2, cy = st.y + HB_T + (BOX - HB_T) / 2;
    for (let i = 0; i < airPts.length; i++) {
      const [ax, ay] = airPts[i];
      if (Math.abs(cx - ax * TILE) < 6 + BUBBLE_HALF && Math.abs(cy - (MAP_Y + ay * TILE)) < 7 + BUBBLE_HALF) pops[i].add(k);
    }
  };
  while (queue.length) {
    const k0 = queue.pop();
    const S = states.get(k0);
    for (const jump of [false, true]) for (const h1 of [-1, 0, 1]) for (const h2 of [-1, 0, 1]) {
      for (const t1 of T1) {
        if (h1 === h2 && t1 > 0) continue;                        // same direction in both phases: t1 is irrelevant
        if (!jump && h1 === 0 && h2 === 0) continue;              // standing still
        const st = { x: S.x, y: S.s * TILE, vy: 0, g: true, wrapped: false };
        let airborne = false;
        for (let f = 0; f < MAX_FRAMES; f++) {
          tick(w, st, f < t1 ? h1 : h2, jump && f === 0);
          probe(st, k0);
          if (!st.g) airborne = true;
          if (st.g && !st.thin && (airborne || (f >= t1 + 20))) {   // landed with enough foot support (or finished a pure walk)
            if (airborne || Math.abs(st.x - S.x) > 0.5) {
              const k = add(st.x, rowOf(st.y));
              if (k !== k0) edges.get(k0).add(k);
            }
            break;
          }
        }
      }
    }
  }
  return { states, edges, pops };
}

/** Tarjan SCC (iterative). Returns comp id per key. */
function scc(edges) {
  const index = new Map(), low = new Map(), on = new Set(), comp = new Map();
  let idx = 0, cid = 0;
  const stack = [];
  for (const root of edges.keys()) {
    if (index.has(root)) continue;
    const work = [[root, [...edges.get(root)], 0]];
    index.set(root, idx); low.set(root, idx); idx++; stack.push(root); on.add(root);
    while (work.length) {
      const frame = work[work.length - 1];
      const [v, nbrs] = frame;
      if (frame[2] < nbrs.length) {
        const u = nbrs[frame[2]++];
        if (!index.has(u)) {
          index.set(u, idx); low.set(u, idx); idx++; stack.push(u); on.add(u);
          work.push([u, [...edges.get(u)], 0]);
        } else if (on.has(u)) low.set(v, Math.min(low.get(v), index.get(u)));
      } else {
        if (low.get(v) === index.get(v)) {
          let u;
          do { u = stack.pop(); on.delete(u); comp.set(u, cid); } while (u !== v);
          cid++;
        }
        work.pop();
        if (work.length) { const p = work[work.length - 1][0]; low.set(p, Math.min(low.get(p), low.get(v))); }
      }
    }
  }
  return comp;
}

// ---------------------------------------------------------------------------------------------
const PADS = [{ name: 'P1', cx: 24 + 8, x0: 16, x1: 56 }, { name: 'P2', cx: 216 + 8, x0: 200, x1: 240 }];

function fairness(lv) {
  const out = [];
  for (const e of lv.enemies) {
    const size = e.t === 'kraken' ? 48 : 16;
    const cx = e.c * TILE + size / 2, bottom = MAP_Y + (e.r) * TILE + size;
    for (const p of PADS) {
      const dx = Math.abs(cx - p.cx), dy = 216 - bottom;     // 216 = pad floor top (row 25)
      if (dx < 48 && dy < 80) out.push(`${e.t}@${e.c},${e.r} is only ${Math.round(dx / 8)} cols / ${Math.round(dy / 8)} rows from the ${p.name} pad`);
    }
  }
  return out;
}

function runLevel(lv, idx) {
  const w = world(lv.map);
  const air = lv.air || [];
  const startP1 = { x: 24, s: 25 }, startP2 = { x: 216, s: 25 };
  const t0 = Date.now();
  // every attractor is probed twice: at its own spot and at the ceiling above it (Game: bubbles that start above the
  // attractor row rise to the ceiling and slide to the attractor column)
  const probes = air.flatMap(([ax, ay]) => [[ax, ay], [ax, 2.0]]);
  const ex = explore(w, startP1, probes);
  const comp = scc(ex.edges);
  const kStart = keyOf(startP1.x, startP1.s);
  const home = comp.get(kStart);
  const states = [...ex.states.values()];
  const traps = states.filter((s) => comp.get(s.k) !== home);
  const rep = { round: idx + 1, states: states.length, ms: Date.now() - t0, issues: [], notes: [] };
  // P2
  const p2Near = states.some((s) => s.s === 25 && Math.abs(s.x - startP2.x) <= 6);
  if (!p2Near) rep.issues.push('P2 pad is not reachable from P1 (physics model)');
  else if (!states.some((s) => s.s === 25 && Math.abs(s.x - startP2.x) <= 6 && comp.get(s.k) === home)) rep.issues.push('P2 pad cannot reach the P1 pad again (physics model)');
  // walkers
  for (const e of lv.enemies) {
    if (!['nibbler', 'crabbit', 'springle'].includes(e.t)) continue;
    const s = e.r + 2;
    const ok = states.some((st) => st.s === s && Math.abs(st.x - e.c * TILE) <= 8);
    if (!ok) rep.issues.push(`walker ${e.t}@${e.c},${e.r}: surface row ${s} not reachable in the physics model`);
  }
  // traps: group by row for a compact message
  if (traps.length) {
    const byRow = new Map();
    for (const t of traps) { const a = byRow.get(t.s) || []; a.push(t.x); byRow.set(t.s, a); }
    const parts = [...byRow.entries()].map(([s, xs]) => `row ${s}: x ${Math.min(...xs)}..${Math.max(...xs)} (${xs.length})`);
    rep.issues.push(`TRAP: ${traps.length} reachable standing spots cannot get back to the pad: ${parts.slice(0, 6).join('; ')}`);
  }
  // air
  rep.air = air.map((p, i) => ({ at: p, poppableFrom: ex.pops[2 * i].size, ceilFrom: ex.pops[2 * i + 1].size }));
  rep.air.forEach((a) => {
    if (a.poppableFrom === 0) rep.issues.push(`air point [${a.at}] cannot be reached by walking or jumping`);
    else if (a.poppableFrom < 6) rep.notes.push(`air point [${a.at}] is reachable from only ${a.poppableFrom} standing spots`);
    if (a.ceilFrom === 0) rep.issues.push(`ceiling cluster above air point [${a.at}] (x=${a.at[0]}, y=2) cannot be popped from anywhere`);
    else if (a.ceilFrom < 8) rep.notes.push(`ceiling cluster above air point [${a.at}] is reachable from only ${a.ceilFrom} standing spots`);
  });
  rep.debugMap = () => {
    const g = lv.map.map((r) => r.split(''));
    for (const st of states) {
      const c = Math.min(29, Math.max(2, Math.round((st.x + 8) / TILE))), r = st.s;
      const home2 = comp.get(st.k) === home;
      if (g[r][c] === '.' || g[r][c] === 'o') g[r][c] = home2 ? 'o' : 'T';
      else if (g[r][c] === '#' && !home2) g[r][c] = 't';
    }
    return g.map((r, i) => String(i).padStart(2) + ' ' + r.join('')).join('\n');
  };
  // attractor sitting inside solid blocks looks odd (bubbles ignore blocks, but the gathering spot should be in open water)
  air.forEach(([ax, ay]) => {
    let solidCells = 0, total = 0;
    for (let r = Math.floor(ay - 1); r <= Math.ceil(ay + 1) - 1; r++) for (let c = Math.floor(ax - 1); c <= Math.ceil(ax + 1) - 1; c++) { total++; if (lv.map[r] && lv.map[r][c] === '#') solidCells++; }
    const centreSolid = lv.map[Math.floor(ay)] && lv.map[Math.floor(ay)][Math.floor(ax)] === '#';
    if (centreSolid || solidCells > total * 0.4) rep.issues.push(`AIR point [${ax}, ${ay}] sits inside blocks (${solidCells}/${total} bubble cells solid${centreSolid ? ', centre solid' : ''})`);
  });
  rep.fair = fairness(lv);
  rep.fair.forEach((m) => rep.issues.push('FAIR: ' + m));
  // coverage stats
  let solid = 0;
  for (let r = 1; r <= 24; r++) for (let c = 2; c <= 29; c++) if (lv.map[r][c] === '#') solid++;
  rep.solid = solid;
  rep.gaps = (lv.map[25].slice(2, 30).match(/\.+/g) || []).length;
  return rep;
}

// ---------------------------------------------------------------------------------------------
function cli() {
  const argv = process.argv.slice(2);
  const opt = { quiet: false, json: false, only: 0 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--only') opt.only = +argv[++i];
    else if (argv[i] === '--map') opt.map = true;
    else if (argv[i] === '--quiet') opt.quiet = true;
    else if (argv[i] === '--json') opt.json = true;
  }
  const LEVELS = loadLevels(path.join(HERE, '..', 'src', '30_levels.js'));
  const reps = [];
  LEVELS.forEach((lv, i) => { if (!opt.only || opt.only === i + 1) reps.push(runLevel(lv, i)); });
  if (opt.json) { console.log(JSON.stringify(reps, null, 1)); return; }
  let bad = 0;
  for (const r of reps) {
    const flag = r.issues.length ? 'ISSUES' : 'ok';
    if (r.issues.length) bad++;
    if (opt.quiet && !r.issues.length) continue;
    console.log(`R${String(r.round).padStart(2, '0')} ${flag.padEnd(6)} states ${String(r.states).padStart(4)} solid ${String(r.solid).padStart(3)} floor-gaps ${r.gaps}  air ${r.air.map((a) => `${a.poppableFrom}+${a.ceilFrom}c`).join('/')}  (${r.ms} ms)`);
    r.issues.forEach((m) => console.log('      ISSUE ' + m));
    r.notes.forEach((m) => console.log('      note  ' + m));
    if (opt.map) console.log(r.debugMap());
  }
  console.log(`\n${reps.length} rounds analysed, ${bad} with issues`);
  process.exit(bad ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli();
export { world, tick, explore, scc, keyOf, runLevel };
