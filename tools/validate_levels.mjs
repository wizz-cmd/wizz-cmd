#!/usr/bin/env node
// FIZZ & POP — tools/validate_levels.mjs
// Structural + reachability validation of LEVELS (SPEC §3.3).
//
// Usage:
//   node tools/validate_levels.mjs [levelsFile] [--ascii N] [--reach] [--only N] [--quiet] [--json]
//     levelsFile  path of a file declaring `const LEVELS = ...` (default src/30_levels.js).
//                 It is concatenated after src/00_shared.js and evaluated in a node vm context.
//     --ascii N   additionally print round N as ASCII art with enemies marked
//                 (N/n nibbler, C/c crabbit, J/j jellop, S/s springle, G/g glimmer, K/k kraken;
//                  capital = top-left tile of the box, '*' = air attractor)
//     --reach     with --ascii: mark platform tiles the BFS reaches ('=') and fails to reach ('!')
//     --only N    validate just round N (1-30)
//     --quiet     print only rounds with errors/warnings, plus the summary
//     --json      machine-readable report on stdout
//   Exit code 1 if any ERROR was found (warnings never fail the run).
//
// Library use:  import { loadLevels, validateLevels } from './validate_levels.mjs'
//
// ERRORS  = map rules 1-5, 8 and 9(reachability of walker spawns) of SPEC §3.3, field validity.
// WARNINGS= unreachable non-spawn platforms, enemy-count / type-introduction schedule (rule 7),
//           stack gaps > 5 tiles, duplicate maps, special distribution.
//
// Reachability model (approximate, deliberately simple):
//   standing position (c, s): body = 2x2 tiles at cols c..c+1, rows s-2..s-1 (all empty), feet on
//   row s with solid at col c or c+1; c in 2..28, s in 3..25.
//   moves: walk +-1 col along a surface; walk off an edge and fall straight down with up to +-2
//   cols of drift, landing on the first surface (falling out of a floor gap wraps to the top);
//   jump to any standing position with 0 <= s-s' <= 5 and |c'-c| <= 4 (platforms are one-way, so
//   nothing in between blocks). BFS starts at the P1 spawn pad (col 3, row 25).
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, '..');

export const COLS = 32, ROWS = 26;
export const WALKERS = ['nibbler', 'crabbit', 'springle'];
export const FLYERS = ['jellop', 'glimmer'];
export const ENEMY_TYPES = [...WALKERS, ...FLYERS];
export const SPECIALS = ['thunder', 'fire', 'water'];
export const INTRO_ROUND = { nibbler: 1, crabbit: 4, jellop: 7, springle: 11, glimmer: 16 };
export const THEME_NAMES = ['Coral Reef', 'Kelp Forest', 'Sunken Ship', 'Crystal Caves', 'Volcanic Vents', 'Abyss Temple'];

const JUMP_UP_MAX = 5;        // tiles
const JUMP_DX_MAX = 4;        // tiles (body-left col difference)
const FALL_DRIFT = 2;         // cols
const P1_START = { c: 3, s: 25 };
const P2_START = { c: 26, s: 25 };

// ---------------------------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------------------------
export function loadLevels(file = path.join(PROJECT, 'src', '30_levels.js')) {
  const shared = fs.readFileSync(path.join(PROJECT, 'src', '00_shared.js'), 'utf8');
  const levels = fs.readFileSync(file, 'utf8');
  const sandbox = { console, window: {}, Math };
  vm.createContext(sandbox);
  // One script so `const C/U/LEVELS` share a scope; the trailing expression is the result.
  return vm.runInContext(`${shared}\n;\n${levels}\n;\nLEVELS`, sandbox, { filename: file });
}

// ---------------------------------------------------------------------------------------------
// Map helpers
// ---------------------------------------------------------------------------------------------
function makeGrid(map) {
  const solid = (c, r) => {
    if (c < 0 || c >= COLS) return true;       // outside left/right is wall
    if (r < 0 || r >= ROWS) return false;      // above/below the map is open (wraps)
    return map[r][c] === '#';
  };
  const supported = (c, s) => solid(c, s) || solid(c + 1, s);
  const bodyEmpty = (c, s) =>
    !solid(c, s - 2) && !solid(c + 1, s - 2) && !solid(c, s - 1) && !solid(c + 1, s - 1);
  const valid = (c, s) =>
    c >= 2 && c <= 28 && s >= 3 && s <= 25 && supported(c, s) && bodyEmpty(c, s);
  return { solid, supported, bodyEmpty, valid };
}

const key = (c, s) => s * COLS + c;

/** Positions reachable from `start` under the movement model. */
export function reachability(map, start = P1_START) {
  const g = makeGrid(map);
  const all = [];
  for (let s = 3; s <= 25; s++) for (let c = 2; c <= 28; c++) if (g.valid(c, s)) all.push({ c, s });
  const reach = new Set();
  if (!g.valid(start.c, start.s)) return { all, reach, grid: g };

  /** Positions where a body at (c0, s0) (unsupported, in the air) lands, drifting +-FALL_DRIFT. */
  const fall = (c0, s0, wrapped, out) => {
    for (let d = -FALL_DRIFT; d <= FALL_DRIFT; d++) {
      const c1 = c0 + d;
      if (c1 < 2 || c1 > 28) continue;
      let t = s0;
      for (; t <= 25; t++) {
        if (!g.bodyEmpty(c1, t)) break;                      // blocked by solid
        if (g.supported(c1, t) && (t > s0 || d !== 0)) {
          if (g.valid(c1, t)) out.push({ c: c1, s: t });
          break;
        }
        if (t === 25) {
          // body feet row 25 and nothing underneath: falls out of the floor gap -> wraps to top
          if (!wrapped) fall(c1, 2, true, out);
        }
      }
    }
  };

  const queue = [start];
  reach.add(key(start.c, start.s));
  const push = (p) => {
    const k = key(p.c, p.s);
    if (!reach.has(k)) { reach.add(k); queue.push(p); }
  };
  while (queue.length) {
    const { c, s } = queue.pop();
    for (const dc of [-1, 1]) {
      const c2 = c + dc;
      if (c2 < 2 || c2 > 28) continue;
      if (g.valid(c2, s)) push({ c: c2, s });                // walk
      else if (!g.supported(c2, s) && g.bodyEmpty(c2, s)) {  // walk off an edge
        const out = [];
        fall(c2, s, false, out);
        out.forEach(push);
      }
    }
    for (let s2 = Math.max(3, s - JUMP_UP_MAX); s2 <= s; s2++) {   // jump up / same level
      for (let c2 = Math.max(2, c - JUMP_DX_MAX); c2 <= Math.min(28, c + JUMP_DX_MAX); c2++) {
        if ((c2 !== c || s2 !== s) && g.valid(c2, s2)) push({ c: c2, s: s2 });
      }
    }
  }
  return { all, reach, grid: g };
}

/** Group valid positions into horizontal surface runs: [{s, c0, c1, reached:bool[]}]. */
function surfaceRuns(all, reach) {
  const runs = [];
  const sorted = [...all].sort((a, b) => a.s - b.s || a.c - b.c);
  let cur = null;
  for (const p of sorted) {
    if (cur && cur.s === p.s && p.c === cur.c1 + 1) { cur.c1 = p.c; cur.n++; if (reach.has(key(p.c, p.s))) cur.hit++; }
    else {
      cur = { s: p.s, c0: p.c, c1: p.c, n: 1, hit: reach.has(key(p.c, p.s)) ? 1 : 0 };
      runs.push(cur);
    }
  }
  return runs;
}

// ---------------------------------------------------------------------------------------------
// Per-round validation
// ---------------------------------------------------------------------------------------------
function boxEmpty(g, c, r, w, h) {
  for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) if (g.solid(x, y)) return false;
  return true;
}

function gapRuns(row) {
  const runs = [];
  let start = -1;
  for (let c = 2; c <= 29; c++) {
    const gap = row[c] === '.';
    if (gap && start < 0) start = c;
    if ((!gap || c === 29) && start >= 0) {
      const end = gap ? c : c - 1;
      runs.push([start, end]);
      start = -1;
    }
  }
  return runs;
}

function validateRound(lv, idx) {
  const round = idx + 1;
  const errors = [];
  const warnings = [];
  const E = (m) => errors.push(m);
  const W = (m) => warnings.push(m);
  const info = { round, theme: THEME_NAMES[Math.floor(idx / 5)] || '?', enemyCount: 0, types: {}, reachPct: null, reachN: 0, reachTotal: 0 };

  if (!lv || typeof lv !== 'object') { E('level is not an object'); return { errors, warnings, info }; }
  const map = lv.map;
  // ---- Rule 1: dimensions and characters -------------------------------------------------
  let mapOk = Array.isArray(map) && map.length === ROWS;
  if (!Array.isArray(map)) E('map is not an array');
  else if (map.length !== ROWS) E(`map has ${map.length} rows, expected ${ROWS}`);
  if (Array.isArray(map)) {
    map.forEach((row, r) => {
      if (typeof row !== 'string') { E(`row ${r} is not a string`); mapOk = false; return; }
      if (row.length !== COLS) { E(`row ${r} has ${row.length} chars, expected ${COLS}`); mapOk = false; }
      const bad = row.replace(/[#.]/g, '');
      if (bad) { E(`row ${r} has illegal characters "${[...new Set(bad)].join('')}" (only # and .)`); mapOk = false; }
    });
  } else mapOk = false;

  // ---- non-map fields ----------------------------------------------------------------------
  if (!Array.isArray(lv.enemies)) E('enemies is not an array');
  if (!Array.isArray(lv.air) || lv.air.length < 1 || lv.air.length > 3) E('air must be an array of 1-3 points');
  else lv.air.forEach((p, i) => {
    if (!Array.isArray(p) || p.length !== 2 || !p.every((v) => typeof v === 'number' && Number.isFinite(v))) { E(`air[${i}] must be [x, y] numbers`); return; }
    if (p[0] < 2 || p[0] > 30 || p[1] < 1 || p[1] > 25) E(`air[${i}] = [${p}] is outside the playfield (x 2..30, y 1..25)`);
    if ((p[0] * 2) % 1 !== 0 || (p[1] * 2) % 1 !== 0) W(`air[${i}] = [${p}] is not a multiple of 0.5`);
  });
  if (!Array.isArray(lv.specials)) E('specials is not an array');
  else {
    lv.specials.forEach((s) => { if (!SPECIALS.includes(s)) E(`unknown special "${s}"`); });
    if (new Set(lv.specials).size !== lv.specials.length) W('duplicate entries in specials');
  }
  // wave 2 (FIXPLAN sec. 4 / L1): the boss round runs on a 150 s hurry timer, every other round stays in 20..60
  const hurryMax = lv.boss ? 180 : 60;
  if (typeof lv.hurry !== 'number' || !(lv.hurry >= 20 && lv.hurry <= hurryMax)) E(`hurry must be a number in 20..${hurryMax} (got ${lv.hurry})`);
  if (typeof lv.boss !== 'boolean') E('boss must be a boolean');

  if (!mapOk) return { errors, warnings, info };

  // ---- Rule 2: outer walls -----------------------------------------------------------------
  for (let r = 0; r < ROWS; r++) {
    for (const c of [0, 1, 30, 31]) {
      if (map[r][c] !== '#') { E(`outer wall missing at col ${c}, row ${r}`); break; }
    }
  }
  // ---- Rule 3: ceiling / floor gaps --------------------------------------------------------
  const ceil = map[0], floor = map[ROWS - 1];
  const floorGaps = gapRuns(floor);
  floorGaps.forEach(([a, b]) => {
    if (b - a + 1 < 2) E(`floor gap at col ${a} is only 1 tile wide (need >= 2)`);
    for (let c = a; c <= b; c++) if (ceil[c] !== '.') { E(`floor gap col ${c} has no matching ceiling gap`); break; }
  });
  info.floorGaps = floorGaps.map(([a, b]) => `${a}-${b}`);
  // ---- Rule 4: spawn pads ------------------------------------------------------------------
  for (const [name, a, b] of [['P1', 2, 6], ['P2', 25, 29]]) {
    for (let c = a; c <= b; c++) {
      if (floor[c] !== '#') { E(`${name} pad: floor (row 25) col ${c} must be solid`); break; }
    }
    let padOk = true;
    for (let r = 21; r <= 24 && padOk; r++) {
      for (let c = a; c <= b; c++) if (map[r][c] !== '.') { E(`${name} pad: row ${r} col ${c} must be empty`); padOk = false; break; }
    }
  }

  // ---- Rules 5 / 8: enemies ----------------------------------------------------------------
  const g = makeGrid(map);
  const enemies = Array.isArray(lv.enemies) ? lv.enemies : [];
  info.enemyCount = enemies.length;
  const boxes = [];
  enemies.forEach((e, i) => {
    const tag = `enemy #${i} ${e && e.t}`;
    if (!e || typeof e !== 'object') { E(`${tag}: not an object`); return; }
    info.types[e.t] = (info.types[e.t] || 0) + 1;
    if (!Number.isInteger(e.c) || !Number.isInteger(e.r)) { E(`${tag}: c/r must be integers`); return; }
    if (e.d !== 1 && e.d !== -1) E(`${tag}: d must be 1 or -1 (got ${e.d})`);
    const isBoss = e.t === 'kraken';
    if (!ENEMY_TYPES.includes(e.t) && !isBoss) { E(`${tag}: unknown enemy type "${e.t}"`); return; }
    if (isBoss && !lv.boss) E(`${tag}: kraken is only allowed in the boss round`);
    const w = isBoss ? 6 : 2, h = isBoss ? 6 : 2;
    if (e.c < 2 || e.c + w - 1 > 29 || e.r < 1 || e.r + h - 1 > 24) { E(`${tag} at (${e.c},${e.r}): box leaves the playfield`); return; }
    if (!boxEmpty(g, e.c, e.r, w, h)) { E(`${tag} at (${e.c},${e.r}): spawn box overlaps solid tiles`); return; }
    if (WALKERS.includes(e.t)) {
      if (e.r + 2 > 25 || !g.supported(e.c, e.r + 2)) E(`${tag} at (${e.c},${e.r}): walker needs solid ground at row ${e.r + 2}, col ${e.c} or ${e.c + 1}`);
    } else if (FLYERS.includes(e.t)) {
      if (e.r < 2 || e.r > 22) E(`${tag} at (${e.c},${e.r}): flyer row must be in 2..22`);
    }
    boxes.push({ i, e, w, h });
  });
  for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
    const A = boxes[a], B = boxes[b];
    if (A.e.c < B.e.c + B.w && B.e.c < A.e.c + A.w && A.e.r < B.e.r + B.h && B.e.r < A.e.r + A.h) {
      W(`enemy #${A.i} ${A.e.t} and #${B.i} ${B.e.t} spawn boxes overlap`);
    }
  }

  // ---- Boss rules (round 30) ---------------------------------------------------------------
  if (round === 30) {
    if (lv.boss !== true) E('round 30 must have boss: true');
    const es = enemies;
    if (es.length !== 1 || es[0].t !== 'kraken' || es[0].c !== 14 || es[0].r !== 4 || es[0].d !== -1) {
      E("round 30 enemies must be exactly [{t:'kraken', c:14, r:4, d:-1}]");
    }
    if (!Array.isArray(lv.specials) || lv.specials.length !== 1 || lv.specials[0] !== 'thunder') E("round 30 specials must be ['thunder']");
    if (floorGaps.length < 1) E('round 30 needs floor gaps (thunder bubbles rise from them)');
    let platRows = 0;
    for (let r = 2; r <= 23; r++) if (/#/.test(map[r].slice(2, 30))) platRows++;
    if (platRows < 2) W('round 30 should have a few platforms');
  } else if (lv.boss === true) E('boss: true is only allowed for round 30');

  // ---- Rule 6: reachability ------------------------------------------------------------------
  const { all, reach } = reachability(map);
  info.reachTotal = all.length;
  info.reachN = all.filter((p) => reach.has(key(p.c, p.s))).length;
  info.reachPct = all.length ? Math.round((100 * info.reachN) / all.length) : 0;
  if (!reach.size) E('P1 spawn pad position is not a valid standing position (check pad rules)');
  boxes.forEach(({ i, e }) => {
    if (WALKERS.includes(e.t) && g.valid(e.c, e.r + 2) && !reach.has(key(e.c, e.r + 2))) {
      E(`enemy #${i} ${e.t} at (${e.c},${e.r}): spawn surface (row ${e.r + 2}) is NOT reachable from the P1 pad`);
    }
  });
  const runs = surfaceRuns(all, reach);
  info.unreachedRuns = [];
  runs.forEach((run) => {
    if (run.hit === 0) {
      const desc = `row ${run.s} cols ${run.c0}-${run.c1 + 1}`;
      info.unreachedRuns.push(desc);
      W(`platform surface ${desc} is not reachable from the P1 pad`);
    }
  });
  if (!reach.has(key(P2_START.c, P2_START.s)) && g.valid(P2_START.c, P2_START.s)) W('P2 spawn pad is not reachable from the P1 pad');

  // ---- Rule 9: stacked surfaces <= 5 tiles apart --------------------------------------------
  // Enforced through the reachability model above: a surface that sits more than 5 tiles above
  // everything a player can stand on (and is not reached by falling) shows up as unreachable.

  // ---- Rule 7: enemy count / type introduction schedule (warnings) ----------------------------
  if (!lv.boss) {
    const n = enemies.length;
    const target = round >= 20 ? 6 : 3 + Math.round(((round - 1) * 3) / 19);
    const lo = round >= 20 ? 6 : Math.max(3, target - 1);
    const hi = round >= 20 ? 8 : target + 2;
    if (round === 1 && n !== 3) W(`round 1 should have exactly 3 enemies (has ${n})`);
    else if (n < lo || n > hi) W(`${n} enemies; schedule suggests ${lo}-${hi} for round ${round}`);
    const kinds = Object.keys(info.types);
    kinds.forEach((t) => { if (INTRO_ROUND[t] && round < INTRO_ROUND[t]) W(`${t} appears in round ${round} before its introduction round ${INTRO_ROUND[t]}`); });
    ENEMY_TYPES.forEach((t) => { if (INTRO_ROUND[t] === round && !info.types[t]) W(`${t} should be introduced in round ${round}`); });
    if (round >= 7 && kinds.length < 2) W('later rounds should mix enemy types');
  }
  return { errors, warnings, info };
}

// ---------------------------------------------------------------------------------------------
// Whole-set validation
// ---------------------------------------------------------------------------------------------
export function validateLevels(LEVELS, { only } = {}) {
  const rounds = [];
  const globalErrors = [];
  const globalWarnings = [];
  if (!Array.isArray(LEVELS)) { globalErrors.push('LEVELS is not an array'); return { rounds, globalErrors, globalWarnings, errors: 1, warnings: 0 }; }
  if (LEVELS.length !== 30) globalErrors.push(`LEVELS has ${LEVELS.length} entries, expected exactly 30`);
  LEVELS.forEach((lv, idx) => {
    if (only && idx + 1 !== only) return;
    rounds.push(validateRound(lv, idx));
  });
  if (!only) {
    const seen = new Map();
    LEVELS.forEach((lv, idx) => {
      if (!lv || !Array.isArray(lv.map)) return;
      const k = lv.map.join('|');
      if (!seen.has(k)) seen.set(k, []);
      seen.get(k).push(idx + 1);
    });
    const dups = [...seen.values()].filter((v) => v.length > 1);
    if (dups.length) globalWarnings.push(`identical maps shared by rounds: ${dups.map((v) => v.join('=')).join(', ')} (design goal: no two rounds alike)`);
    const sp = LEVELS.slice(4, 29).filter((lv) => lv && Array.isArray(lv.specials) && lv.specials.length).length;
    if (sp < 5 || sp > 12) globalWarnings.push(`specials appear in ${sp}/25 of rounds 5-29 (target: roughly a third, 7-10)`);
    const hurryVals = new Set(LEVELS.map((lv) => lv && lv.hurry));
    if (hurryVals.size === 1) globalWarnings.push('every round has the same hurry value');
  }
  const errors = globalErrors.length + rounds.reduce((a, r) => a + r.errors.length, 0);
  const warnings = globalWarnings.length + rounds.reduce((a, r) => a + r.warnings.length, 0);
  return { rounds, globalErrors, globalWarnings, errors, warnings };
}

// ---------------------------------------------------------------------------------------------
// ASCII rendering
// ---------------------------------------------------------------------------------------------
export function asciiRound(lv, { reach: showReach = false } = {}) {
  const grid = lv.map.map((row) => row.split(''));
  if (showReach) {
    const { all, reach } = reachability(lv.map);
    all.forEach((p) => {
      for (const cc of [p.c, p.c + 1]) {
        if (lv.map[p.s][cc] === '#') {
          if (reach.has(key(p.c, p.s))) grid[p.s][cc] = '=';
          else if (grid[p.s][cc] !== '=') grid[p.s][cc] = '!';
        }
      }
    });
  }
  const letter = { nibbler: 'n', crabbit: 'c', jellop: 'j', springle: 's', glimmer: 'g', kraken: 'k' };
  (lv.enemies || []).forEach((e) => {
    const ch = letter[e.t] || '?';
    const n = e.t === 'kraken' ? 6 : 2;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const row = grid[e.r + y]; if (row && row[e.c + x] !== undefined) row[e.c + x] = ch;
    }
    if (grid[e.r] && grid[e.r][e.c] !== undefined) grid[e.r][e.c] = ch.toUpperCase();
  });
  (lv.air || []).forEach(([x, y]) => {
    const r = Math.round(y), c = Math.round(x);
    if (grid[r] && grid[r][c] === '.') grid[r][c] = '*';
  });
  const tens = '   ' + Array.from({ length: COLS }, (_, c) => (c % 10 === 0 ? String(c / 10) : ' ')).join('');
  const ones = '   ' + Array.from({ length: COLS }, (_, c) => c % 10).join('');
  const body = grid.map((row, r) => String(r).padStart(2, ' ') + ' ' + row.join(''));
  return [tens, ones, ...body].join('\n');
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------
function cli() {
  const argv = process.argv.slice(2);
  const opt = { quiet: false, json: false, reach: false };
  let file = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ascii') opt.ascii = +argv[++i];
    else if (a === '--only') opt.only = +argv[++i];
    else if (a === '--quiet' || a === '-q') opt.quiet = true;
    else if (a === '--json') opt.json = true;
    else if (a === '--reach') opt.reach = true;
    else if (a.startsWith('--')) { console.error('unknown option ' + a); process.exit(2); }
    else file = a;
  }
  const levelsFile = file ? path.resolve(file) : path.join(PROJECT, 'src', '30_levels.js');
  let LEVELS;
  try { LEVELS = loadLevels(levelsFile); }
  catch (e) { console.error(`cannot load ${levelsFile}: ${e && e.message}`); process.exit(1); }

  const rep = validateLevels(LEVELS, { only: opt.only });
  if (opt.json) {
    console.log(JSON.stringify(rep, null, 2));
    process.exit(rep.errors ? 1 : 0);
  }
  console.log(`FIZZ & POP level validation: ${levelsFile}`);
  for (const r of rep.rounds) {
    const i = r.info;
    const types = Object.entries(i.types).map(([t, n]) => `${t}x${n}`).join(' ') || '-';
    const status = r.errors.length ? 'ERR' : r.warnings.length ? 'warn' : 'ok';
    if (opt.quiet && status === 'ok') continue;
    const lv = LEVELS[i.round - 1] || {};
    console.log(
      `R${String(i.round).padStart(2, '0')} ${String(i.theme).padEnd(14)} enemies ${String(i.enemyCount).padStart(2)} [${types}]` +
      `  air ${Array.isArray(lv.air) ? lv.air.length : '?'}  specials ${(lv.specials || []).join(',') || '-'}  hurry ${lv.hurry}` +
      `  reach ${i.reachPct === null ? '?' : i.reachPct + '% (' + i.reachN + '/' + i.reachTotal + ')'}  ${status}`);
    r.errors.forEach((m) => console.log('     ERROR ' + m));
    r.warnings.forEach((m) => console.log('     warn  ' + m));
  }
  rep.globalErrors.forEach((m) => console.log('ERROR ' + m));
  rep.globalWarnings.forEach((m) => console.log('warn  ' + m));
  if (opt.ascii) {
    const lv = LEVELS[opt.ascii - 1];
    if (!lv) console.log(`no round ${opt.ascii}`);
    else {
      console.log(`\nRound ${opt.ascii} (${(lv.enemies || []).map((e) => `${e.t}@${e.c},${e.r}`).join(' ')})`);
      console.log(asciiRound(lv, { reach: opt.reach }));
      console.log('legend: # block  . empty  * air point  letters = enemy boxes (capital = top-left)' + (opt.reach ? '  = reachable surface  ! unreachable surface' : ''));
    }
  }
  console.log(`\nSummary: ${rep.rounds.length} rounds checked, ${rep.errors} error(s), ${rep.warnings} warning(s)`);
  process.exit(rep.errors ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli();
