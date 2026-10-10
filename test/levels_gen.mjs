// FIZZ & POP — test/levels_gen.mjs
// Authoring pipeline for src/30_levels.js:   node test/levels_gen.mjs
// The round designs live in test/levels_defs_*.mjs (DSL from test/levels_dsl.mjs). This script builds
// every map, runs structural sanity checks and WRITES src/30_levels.js as plain literal data
// (26 strings per map) so the shipped file needs no builder code at runtime.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MapBuilder } from './levels_dsl.mjs';
import { ROUNDS_A } from './levels_defs_a.mjs';
import { ROUNDS_B } from './levels_defs_b.mjs';
import { ROUNDS_C } from './levels_defs_c.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..', 'src', '30_levels.js');
const THEMES = ['Coral Reef', 'Kelp Forest', 'Sunken Ship', 'Crystal Caves', 'Volcanic Vents', 'Abyss Temple'];

const defs = [...ROUNDS_A, ...ROUNDS_B, ...ROUNDS_C];
if (process.env.LEVELS_PARTIAL) {            // work-in-progress mode: pad with copies of round 1 so tools can run
  while (defs.length < 30) defs.push({ ...ROUNDS_A[0], name: `TODO ${defs.length + 1}` });
}
if (defs.length !== 30) throw new Error(`expected 30 round definitions, got ${defs.length}`);

const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const num = (v) => String(v);

function emitRound(def, idx) {
  const m = new MapBuilder(def.gaps || []);
  def.build(m);
  const rows = m.rows();
  const L = [];
  L.push(`  // ---- Round ${idx + 1}: ${def.name} (${THEMES[Math.floor(idx / 5)]}) ${'-'.repeat(Math.max(2, 62 - def.name.length))}`);
  L.push(`  // ${def.concept}`);
  L.push('  {');
  L.push(`    name: ${q(def.name)},`);
  L.push('    map: [');
  rows.forEach((row, r) => L.push(`      ${q(row)},${r % 5 === 0 ? `  // row ${r}` : ''}`));
  L.push('    ],');
  L.push('    enemies: [');
  def.enemies.forEach((e) => L.push(`      { t: ${q(e.t)}, c: ${num(e.c)}, r: ${num(e.r)}, d: ${num(e.d)} },`));
  L.push('    ],');
  L.push(`    air: [${def.air.map((p) => `[${p[0]}, ${p[1]}]`).join(', ')}],`);
  L.push(`    specials: [${(def.specials || []).map(q).join(', ')}],`);
  L.push(`    hurry: ${def.hurry},`);
  L.push(`    boss: ${idx === 29 ? 'true' : 'false'},`);
  L.push('  },');
  return L.join('\n');
}

const concepts = defs.map((d, i) => ` *   ${String(i + 1).padStart(2)}  ${d.name.padEnd(22)} ${d.concept}`).join('\n');

const header = `/* FIZZ & POP — 30_levels.js
 * The 30 round definitions (SPEC §3.3). GENERATED from test/levels_defs_*.mjs by test/levels_gen.mjs
 * (re-run \`node test/levels_gen.mjs\` after editing a design); the maps below are plain literal data.
 *
 * Shape of one round (all tile coordinates; map is 32 cols x 26 rows, '#' block, '.' empty):
 *   name      short title of the round's silhouette (extra, optional for consumers; may be shown on the banner)
 *   map       26 strings x 32 chars. Cols 0-1 / 30-31 outer walls, rows 0 / 25 ceiling / floor; every floor
 *             gap column is also a ceiling gap column (falling out of the bottom re-enters at the top)
 *   enemies   { t, c, r, d }  (c, r) = top-left tile of the spawn box (2x2 tiles; the Kraken 6x6), d = facing (1 / -1)
 *   air       1-3 attractor points [col, row] (may be .5) = bubble CENTRES in tile units (px = col*8, 16 + row*8).
 *             Each sits in open water 2-4 rows above a platform (a player can walk or jump into the cluster)
 *   specials  'thunder' | 'fire' | 'water' bubbles that spawn in this round (11 of the 25 rounds 5-29 have some)
 *   hurry     seconds of play until HURRY UP: 30-45 by map size / enemy count / difficulty; rounds 1 and 2 get 45 / 42 s (a newcomer
 *             must be able to learn move / jump / shoot / pop first); rounds 22-29 ramp down gently, 42 42 40 40 38 38 36 36 (never
 *             below 36); the boss round gets 150 (a Kraken fight takes minutes - HURRY UP / Bonefin must not be guaranteed)
 *   boss      true only for round 30
 *
 * Design rules followed (in addition to SPEC §3.3; test/levels_check.mjs verifies them with a model of the real
 * movement physics, tools/validate_levels.mjs checks the contract):
 *  - Platforms are one-way, so vertical routes are built from surfaces <= 4 rows apart (5 only where a bubble
 *    bounce makes it fair). Walls on platforms are <= 4 rows high. Platforms 2 thick use a 4-row pitch.
 *  - Nobody can get trapped: every region has a drop-off of >= 3 free columns (the 12 px hitbox needs 2+; 3 is
 *    comfortable) so a player who jumped up can always walk down again; pictograms keep >= 3 columns of free air
 *    between their parts and the side walls. Near the ceiling (surface rows 3-6) players cannot jump high
 *    (nothing may stand there as an obstacle). Wrap-around rounds (1, 2, 6, 18, 22, 29, 30) use floor gaps.
 *  - Spawn pads (cols 2-6 / 25-29, rows 21-24) stay free; no enemy starts within 6 columns / 10 rows of a pad.
 *  - Enemy schedule: 3 in round 1 ramping to 6 by round 17-20, then 6-8; breathers at 6, 11, 16, 21, 26; a new
 *    enemy type debuts in a round built to show it off (4 Crabbit lanes, 7 Jellop open sea, 11 Springle bowls,
 *    16 Glimmer cavern whose stalactites shield from sparks).
 *  - Specials: thunder 5, 15, 19, 24, 29, 30; water 8, 13, 25, 27; fire 10, 22, 29.
 *  - Wave 2 (QA fixes): air points keep a straight-jump platform within reach of the ceiling cluster (R12, R18, R19, R27)
 *    and sit in open water (R5, R24); rounds 11 and 22 gather every bubble in ONE cluster so chains are possible.
 *    Walkers must always be able to leave: no pit under the ceiling (surface rows <= 6) and no 1-row bump on top of a
 *    platform there (R12 notches, R26 pediment, R13 mast stub); the floor shelves are 1-row planks 3 rows above the
 *    floor (a Springle's hop is 4 rows, so a 2-row shelf with its top exactly 4 rows up held it in the corner).
 *  - Wave 3 (K6): the Crystal Cavern stalactites are only 2 rows deep (the old 5-6 row ones walled both row-5 slab rooms in: a
 *    Nibbler / Crabbit that walked onto a slab could not reach either end and was held until the watchdog fired, ~8 s). Round 19's planks
 *    start one column further in (cols 9-12 / 19-22): with the old 8-12 / 19-23 a Springle in a bottom corner hopped back and forth between
 *    wall and plank end (both hops landed outside the window in which a hop clears the plank), 300-700 frames per visit. Round 27's
 *    bubble gathering points sit above the row-9 tier shoulders (12.5 / 19.5, row 8), so the ceiling clusters are straight-jump spots.
 *
 * Round index (concept per round):
${concepts}
 */`;

const body = defs.map(emitRound).join('\n\n');
const text = `${header}\nconst LEVELS = [\n${body}\n];\n`;
fs.writeFileSync(OUT, text);
console.log(`wrote ${OUT} (${text.length} bytes, ${defs.length} rounds)`);
