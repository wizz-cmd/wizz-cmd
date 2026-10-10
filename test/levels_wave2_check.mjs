// FIZZ & POP — test/levels_wave2_check.mjs
// Data assertions for the wave-2 level fixes (FIXPLAN section 4 / QA_FINDINGS L1-L6). Node only, no browser.
//   node test/levels_wave2_check.mjs        exit code 1 when any assertion fails
import path from 'path';
import { fileURLToPath } from 'url';
import { loadLevels } from '../tools/validate_levels.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LEVELS = loadLevels(path.join(HERE, '..', 'src', '30_levels.js'));
const L = (n) => LEVELS[n - 1];
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? 'ok    ' : 'FAIL  ') + msg); };
const dist = (a, b) => Math.hypot((a[0] - b[0]) * 8, (a[1] - b[1]) * 8);
const solid = (lv, c, r) => c < 0 || c >= 32 || (r >= 0 && r < 26 && lv.map[r][c] === '#');

// L1 -------------------------------------------------------------------------------------------------
check(L(30).hurry >= 150, `L1 round 30 hurry ${L(30).hurry} >= 150 s (the Kraken fight must not guarantee HURRY UP / Bonefin)`);

// L2 / L3 / L6: attractor positions ---------------------------------------------------------------------
const has = (n, p) => L(n).air.some((a) => a[0] === p[0] && a[1] === p[1]);
check(has(19, [22, 13]) && !L(19).air.some((a) => a[0] === 24), 'L2 round 19: attractor [22,13] replaces [24,13] (ceiling-bead pocket)');
check(L(27).air.every((a) => a[1] <= 9 || a[1] === 3), 'L3 round 27: no attractor 136 px below the ceiling (rows <= 9)');
check(!L(12).air.some((a) => a[0] <= 3 || a[0] >= 29), 'L3 round 12: no attractor on the wall columns');
check(has(18, [13, 9]) && !has(18, [15.5, 8]), 'L3 round 18: attractor [13,9] replaces [15.5,8] (ceiling cluster above the tier end)');
check(has(5, [15.5, 6.5]) && has(24, [12, 9]), 'L6 rounds 5 / 24: attractors out of the apex coral block / the shell');
// no attractor centre inside a block, in any round (bubbles sit in open water)
for (let n = 1; n <= 30; n++) for (const [ax, ay] of L(n).air) {
  const r = Math.floor(ay), c = Math.floor(ax);
  if (solid(L(n), c, r)) check(false, `round ${n}: air point [${ax},${ay}] has its centre inside a block`);
}

// L5: rounds 11 and 22 gather every bubble in one place -------------------------------------------------------
for (const n of [11, 22]) {
  const a = L(n).air;
  const maxD = Math.max(0, ...a.flatMap((p, i) => a.slice(i + 1).map((q) => dist(p, q))));
  check(a.length <= 2 && maxD <= 40, `L5 round ${n}: ${a.length} attractor(s), farthest pair ${maxD.toFixed(0)} px (<= 2 attractors within 40 px)`);
}

// L4: specials and hurry ramp ------------------------------------------------------------------------------------
check(['18', '19', '20'].some((n) => L(+n).specials.length > 0), `L4 a special in one of R18-R20 (R19: ${L(19).specials})`);
check(L(25).specials.length > 0, `L4 round 25 has a special (${L(25).specials})`);
let gap = 0, run = 0;
for (let n = 5; n <= 29; n++) { if (L(n).specials.length) run = 0; else gap = Math.max(gap, ++run); }
check(gap <= 3, `L4 no stretch of more than 3 special-free rounds in R5-R29 (longest ${gap})`);
const ramp = [22, 23, 24, 25, 26, 27, 28, 29].map((n) => L(n).hurry);
check(ramp.every((h, i) => h >= 30 && (i === 0 || h <= ramp[i - 1])), `L4 hurry from R22 never rises and stays >= 30: ${ramp.join(' ')}`);
// (wave 3, K6 softened the ramp to 42 42 40 40 38 38 36 36 instead of -2 s per round down to 30: see levels_wave3_check.mjs)
check(L(29).enemies.length <= 8, 'L4 round 29 keeps <= 8 enemies (validate_levels warns above 8 for rounds >= 20)');

// pockets: no walker-sized pit (a landable run with a taller wall on BOTH sides) under the ceiling in the rounds that had one.
// Near the ceiling a walker cannot jump out (the old Game clamped its jump at row 1), so R12's rim notches and the gap between R13's
// masts held walkers for good; R26's 1-row roof bump made the springles crawl against it.
function pits(lv, maxRow) {
  const out = [];
  for (let s = 2; s <= maxRow; s++) for (let c = 2; c < 30; c++) {
    const land = (x) => solid(lv, x, s) && !solid(lv, x, s - 1);
    if (!land(c) || (c > 2 && land(c - 1))) continue;
    let c1 = c; while (c1 + 1 < 30 && land(c1 + 1)) c1++;
    if (c > 2 && c1 < 29 && solid(lv, c - 1, s - 1) && solid(lv, c1 + 1, s - 1) && c1 - c + 1 >= 2) out.push(`row ${s} cols ${c}-${c1}`);
  }
  return out;
}
for (const [n, maxRow] of [[12, 8], [13, 8], [26, 8]]) {
  const p = pits(L(n), maxRow);
  check(p.length === 0, `pockets round ${n}: no pit under the ceiling (surface rows <= ${maxRow})${p.length ? ': ' + p.join('; ') : ''}`);
}
const roof = [...L(26).map[2]].filter((ch) => ch === '#').length - 4;   // 4 = the outer wall tiles of the row
check(roof === 0, 'pockets round 26: nothing on row 2 (no 1-row bump on the pediment)');
// floor planks: a 2-row shelf with its top 4 rows above the floor is exactly a Springle's hop apex (32 px) and holds it in the
// corner for good; the low shelves of these rounds are 1-row planks on row 22 (top 3 rows above the floor)
for (const n of [11, 12, 13, 15, 19, 20, 21, 23, 25]) {
  const lv = L(n);
  let planks = 0, shelves = 0;
  for (let c = 7; c <= 24; c++) if (solid(lv, c, 22) && !solid(lv, c, 21)) planks++;
  for (let c = 2; c <= 29; c++) if (solid(lv, c, 22) && solid(lv, c, 21) && !solid(lv, c, 23)) shelves++;
  check(planks > 0 && shelves === 0, `pockets round ${n}: floor shelves are row-22 planks (${planks} plank tiles, ${shelves} tiles of 2-row shelf)`);
}

console.log(bad ? `\n${bad} assertion(s) FAILED` : '\nall wave-2 level data checks passed');
process.exit(bad ? 1 : 0);
