// FIZZ & POP — test/levels_wave3_check.mjs
// Data assertions for the wave-3 level fixes (FIXPLAN2 K6 + the first-round hurry polish). Node only, no browser.
//   node test/levels_wave3_check.mjs [levels.js]     exit code 1 when any assertion fails
//   (pass the pre-wave-3 file, backup/wave3/30_levels.js, to see the checks fail on the old data: they prove the fixes)
import path from 'path';
import { fileURLToPath } from 'url';
import { loadLevels } from '../tools/validate_levels.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LEVELS = loadLevels(process.argv[2] ? path.resolve(process.argv[2]) : path.join(HERE, '..', 'src', '30_levels.js'));
const L = (n) => LEVELS[n - 1];
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? 'ok    ' : 'FAIL  ') + msg); };
const solid = (lv, c, r) => c < 0 || c >= 32 || (r >= 0 && r < 26 && lv.map[r][c] === '#');
const landable = (lv, c, r) => r >= 1 && r < 26 && solid(lv, c, r) && !solid(lv, c, r - 1);
const runs = (lv, row) => {                                    // landable runs of one surface row
  const out = []; let c = 2;
  while (c < 30) { if (landable(lv, c, row)) { const c0 = c; while (c < 30 && landable(lv, c, row)) c++; out.push([c0, c - 1]); } else c++; }
  return out;
};

// K6 / R16: the two slab rooms under the stalactites ------------------------------------------------------------------------
// A walker (2x2 tiles) standing on a slab top (surface row s) leaves it by walking off an end: it steps off (box rows s-2..s-1), falls the
// one tile onto the slab's wing (surface row s+1, box rows s-1..s) and keeps walking, drifting ~7 px sideways while it falls. So the three
// rows s-2..s beside each end, 3 columns wide, must be free of blocks: a stalactite tip there (even a single block) bumps the falling walker
// back onto the slab, and a stalactite wall beside the end blocks the first step altogether.
function exits(lv, s, c0, c1) {
  const free = (ca, cb, ra, rb) => { for (let r = ra; r <= rb; r++) for (let c = ca; c <= cb; c++) if (solid(lv, c, r)) return false; return true; };
  return { left: free(c0 - 3, c0 - 1, s - 2, s), right: free(c1 + 1, c1 + 3, s - 2, s) };
}
const slabs16 = runs(L(16), 5);
check(slabs16.length === 2, `K6 round 16: two slabs on surface row 5 (${slabs16.map((r) => r.join('-')).join(', ')})`);
for (const [c0, c1] of slabs16) {
  const e = exits(L(16), 5, c0, c1);
  check(e.left && e.right, `K6 round 16: a walker can walk off both ends of the row-5 slab cols ${c0}-${c1} (left ${e.left}, right ${e.right})`);
}
const deepest = Math.max(...[...L(16).map.keys()].filter((r) => r >= 1 && r <= 4).flatMap((r) => [...L(16).map[r]].map((ch, c) => (ch === '#' && c >= 2 && c <= 29 ? r : 0))));
check(deepest <= 2, `K6 round 16: the stalactites hang at most to row 2 (deepest block above the slabs: row ${deepest})`);
check([...L(16).map[1]].filter((ch, c) => ch === '#' && c >= 2 && c <= 29).length >= 10, 'K6 round 16: the stalactites are still there (>= 10 blocks on row 1)');

// K6 / R19: the planks' outer ends --------------------------------------------------------------------------------------------
{
  const cols = [...L(19).map[22]].map((ch, c) => (ch === '#' && c >= 2 && c <= 29 ? c : -1)).filter((c) => c >= 0);
  check(cols.join() === [9, 10, 11, 12, 19, 20, 21, 22].join(), `K6 round 19: planks on row 22 at cols 9-12 and 19-22 (got ${cols.join(',')})`);
  const pads = [];
  for (let r = 21; r <= 24; r++) for (const c of [2, 3, 4, 5, 6, 25, 26, 27, 28, 29]) if (solid(L(19), c, r)) pads.push(`${c},${r}`);
  check(pads.length === 0, 'K6 round 19: both spawn pads (cols 2-6 / 25-29, rows 21-24) stay free');
}

// K6 / R27: ceiling gather spots ---------------------------------------------------------------------------------------------
// Bubbles shot from above an attractor's row rise to the ceiling and slide to the attractor column (bubble x = col * 8 - 8). A plain
// straight-up jump pops them from a standing spot within 10 px of that x, on a surface at row <= 9 (feet y <= 78). Standing: >= 4 px
// of the 12 px body over the platform -> sprite x in [c0 * 8 - 10, (c1 + 1) * 8 - 6].
function jumpSpotDx(lv, clusterX) {
  let best = Infinity;
  for (let s = 2; s <= 9; s++) for (const [c0, c1] of runs(lv, s)) {
    const a = c0 * 8 - 10, b = (c1 + 1) * 8 - 6;
    best = Math.min(best, clusterX < a ? a - clusterX : clusterX > b ? clusterX - b : 0);
  }
  return best;
}
for (const [ax, ay] of L(27).air) {
  const dx = jumpSpotDx(L(27), ax * 8 - 8);
  check(dx <= 10, `K6 round 27: ceiling cluster above air point [${ax},${ay}] (x=${ax * 8 - 8}) is ${dx.toFixed(0)} px from a straight-jump spot (<= 10)`);
}
check(L(27).air.every(([ax, ay]) => !solid(L(27), Math.floor(ax), Math.floor(ay))), 'K6 round 27: no attractor centre inside a block');

// hurry schedule -------------------------------------------------------------------------------------------------------------
const ramp = [22, 23, 24, 25, 26, 27, 28, 29].map((n) => L(n).hurry);
check(ramp.every((h) => h >= 36 && h <= 42), `K6 hurry R22-R29 within 36..42 s: ${ramp.join(' ')}`);
check(ramp.every((h, i) => i === 0 || h <= ramp[i - 1]) && ramp[0] > ramp[7], `K6 hurry R22-R29 is still a ramp (never rises, ends lower than it starts): ${ramp.join(' ')}`);
check(L(1).hurry >= 45 && L(2).hurry >= 42, `polish: round 1 / 2 hurry ${L(1).hurry} / ${L(2).hurry} s (a newcomer needs time to learn move / jump / shoot / pop)`);
check(L(30).hurry >= 150, `round 30 hurry stays ${L(30).hurry} s`);

console.log(bad ? `\n${bad} assertion(s) FAILED` : '\nall wave-3 level data checks passed');
process.exit(bad ? 1 : 0);
