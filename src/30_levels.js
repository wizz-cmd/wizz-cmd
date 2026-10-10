/* FIZZ & POP — 30_levels.js
 * The 30 round definitions (SPEC §3.3). GENERATED from test/levels_defs_*.mjs by test/levels_gen.mjs
 * (re-run `node test/levels_gen.mjs` after editing a design); the maps below are plain literal data.
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
 *    1  Reef Terraces          symmetric zig-zag terraces, centre floor gap teaches the wrap; 3 Nibblers on separate tiers
 *    2  Coral Staircase        diagonal staircase climbing to the right, return shelf on top, left cascade; floor gap lands on the shelf
 *    3  Big Fish               pictogram: an outlined fish you can climb into; ring top and belly are the platforms, eye is a floating block
 *    4  Pebble Alley           Crabbit debut: five long lanes, one staggered hole each, crates in the corners - clear firing lines for pebbles
 *    5  Sea Fan                pictogram: four concentric coral-fan arcs on a rock; enemies drift down the arcs, first thunder bubbles
 *    6  Kelp Fronds            breather: three kelp strands of chunky leaf ledges zig-zagging up, two floor gaps between them
 *    7  Open Water             Jellop debut: wide-open sea with staggered floating islands, lots of room for diagonal bouncing
 *    8  Sea Turtle             pictogram: a turtle seen from above - grooved shell, head on top, four flippers; water bubbles flow down its back
 *    9  Kelp Tangle            dense thicket: irregular 1-thick ledges only 3 rows apart, short runs, very little open floor
 *   10  Seahorse               pictogram: a seahorse - the snout, S-curved body and curled tail; left rock ledges climb to the snout, free drop channels everywhere
 *   11  Anchor                 Springle debut: a ship anchor - ring, stock, shank and curved arms; two bowls for the bouncers
 *   12  Ship's Wheel           pictogram: a helm with rim, hub, eight spokes and handles; rim top and hub are the stages
 *   13  Galleon                pictogram: a sailing ship - hull, bow, two masts whose yards form a ladder of 4-row steps; docks and fenders on both sides
 *   14  Cargo Tetris           asymmetric cargo pile built from 2x-scaled tetrominoes; every piece is 2 or 4 rows tall, gaps of 2-4 columns
 *   15  Skull and Bones        pictogram: a pirate skull over crossed bones - sockets, nose and teeth are cut out; end-of-ship challenge
 *   16  Crystal Cavern         Glimmer debut: stalagmites, hanging stalactites that shield from sparks, flat-topped crystals floating between
 *   17  Great Diamond          pictogram: a cut diamond outline - table, girdle bar, V-shaped pavilion with facet shelves inside
 *   18  Sky Loop               wrap-around round: the top tiers sit 7 rows above the lower world - ride the floor gaps (or bubble-bounce) to get up, walk off the ledges to come down
 *   19  Frost Star             pictogram: an eight-armed snowflake built from ice beads - open on all sides, hop from bead to bead
 *   20  Nautilus               pictogram: a nautilus spiral - one long coiled ledge winding to the centre; end-of-caves challenge, 8 enemies
 *   21  Volcano                breather: a hollow volcano - thick basalt slopes around a magma chamber, crater on top
 *   22  Lava Falls             two aligned lava shafts run through every lane and out the floor gaps: whoever steps off the lane loops back to the top
 *   23  Trident                pictogram: Poseidon trident - three barbed prongs climbed like ladders, curved neck, short shaft
 *   24  Pearl Oyster           pictogram: an open oyster - arched upper shell, bowl below, a big pearl in the mouth; thunder bubbles
 *   25  Axolotl Face           pictogram: the heroes' own smile - round face, three gill frills per side, big eyes and a grin to walk on
 *   26  Temple Facade          breather: a temple front - pediment roof, four storeys of slabs; storeys alternate between pillared cells and open galleries
 *   27  Ziggurat               pictogram: a stepped pyramid with a raised base you can walk under and a shrine on top; water bubbles flow down the steps
 *   28  Abyssal Eye            pictogram: an almond eye - upper and lower lid arcs, ringed iris and pupil, lashes on the slopes
 *   29  The Crown              pictogram: the Kraken King's crown - three points and a jewelled band; its body is 6+ rows above the floor, so ride the centre floor gap (or bounce on bubbles) to the top
 *   30  Kraken King            boss arena: wide open water (the 6x6 Kraken starts top centre), two floor gaps that spit thunder bubbles, platforms at three heights to dodge ink
 */
const LEVELS = [
  // ---- Round 1: Reef Terraces (Coral Reef) -------------------------------------------------
  // symmetric zig-zag terraces, centre floor gap teaches the wrap; 3 Nibblers on separate tiers
  {
    name: 'Reef Terraces',
    map: [
      '##############....##############',  // row 0
      '##............................##',
      '##............................##',
      '##............................##',
      '##............................##',
      '##.........##########.........##',  // row 5
      '##.........##########.........##',
      '##............................##',
      '##............................##',
      '##.#########........#########.##',
      '##.#########........#########.##',  // row 10
      '##............................##',
      '##............................##',
      '##......################......##',
      '##......################......##',
      '##............................##',  // row 15
      '##............................##',
      '##.#########........#########.##',
      '##.#########........#########.##',
      '##............................##',
      '##............................##',  // row 20
      '##.......##############.......##',
      '##.......##############.......##',
      '##............................##',
      '##............................##',
      '##############....##############',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 12, r: 19, d: 1 },
      { t: 'nibbler', c: 10, r: 15, d: -1 },
      { t: 'nibbler', c: 21, r: 11, d: -1 },
    ],
    air: [[15.5, 3]],
    specials: [],
    hurry: 45,
    boss: false,
  },

  // ---- Round 2: Coral Staircase (Coral Reef) -----------------------------------------------
  // diagonal staircase climbing to the right, return shelf on top, left cascade; floor gap lands on the shelf
  {
    name: 'Coral Staircase',
    map: [
      '####################....########',  // row 0
      '##............................##',
      '##............................##',
      '##............................##',
      '##............................##',
      '##.####################.......##',  // row 5
      '##.####################.......##',
      '##............................##',
      '##............................##',
      '##.########........#######....##',
      '##.########........#######....##',  // row 10
      '##............................##',
      '##............................##',
      '##.#######.....#######........##',
      '##.#######.....#######........##',
      '##............................##',  // row 15
      '##............................##',
      '##.........#######............##',
      '##.........#######............##',
      '##............................##',
      '##............................##',  // row 20
      '##.....#######................##',
      '##.....#######................##',
      '##............................##',
      '##............................##',
      '####################....########',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 13, r: 15, d: 1 },
      { t: 'nibbler', c: 17, r: 11, d: -1 },
      { t: 'nibbler', c: 22, r: 7, d: -1 },
      { t: 'nibbler', c: 5, r: 7, d: 1 },
    ],
    air: [[13, 3.5]],
    specials: [],
    hurry: 42,
    boss: false,
  },

  // ---- Round 3: Big Fish (Coral Reef) ------------------------------------------------------
  // pictogram: an outlined fish you can climb into; ring top and belly are the platforms, eye is a floating block
  {
    name: 'Big Fish',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............................##',
      '##...........########.........##',
      '##...........########.........##',
      '##..........##########........##',  // row 5
      '##.........############.......##',
      '###......################.....##',
      '####....####..........####....##',
      '#####..###..............###...##',
      '######.##.............##.##...##',  // row 10
      '##.######.............##.##...##',
      '##...####................#....##',
      '##.######..#######.......#....##',
      '###.##.##..#######.......##...##',
      '#####..###..............###...##',  // row 15
      '####....####..........####....##',
      '###......################.....##',
      '##.........############.......##',
      '##.............####...........##',
      '##............................##',  // row 20
      '##......######......#####.....##',
      '##......######......#####.....##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 12, r: 19, d: 1 },
      { t: 'nibbler', c: 21, r: 19, d: -1 },
      { t: 'nibbler', c: 15, r: 1, d: 1 },
      { t: 'nibbler', c: 13, r: 11, d: 1 },
    ],
    air: [[17, 9]],
    specials: [],
    hurry: 36,
    boss: false,
  },

  // ---- Round 4: Pebble Alley (Coral Reef) --------------------------------------------------
  // Crabbit debut: five long lanes, one staggered hole each, crates in the corners - clear firing lines for pebbles
  {
    name: 'Pebble Alley',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............................##',
      '##.........................##.##',
      '##.........................##.##',
      '#################....###########',  // row 5
      '#################....###########',
      '##.##.........................##',
      '##.##.........................##',
      '######....######################',
      '######....######################',  // row 10
      '##.........................##.##',
      '##.........................##.##',
      '######################....######',
      '######################....######',
      '##.##.........................##',  // row 15
      '##.##.........................##',
      '############....################',
      '############....################',
      '##....................##......##',
      '##....................##......##',  // row 20
      '##.....##################.....##',
      '##.....##################.....##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'crabbit', c: 6, r: 11, d: 1 },
      { t: 'crabbit', c: 18, r: 15, d: -1 },
      { t: 'nibbler', c: 12, r: 19, d: 1 },
      { t: 'nibbler', c: 22, r: 7, d: -1 },
    ],
    air: [[15, 12]],
    specials: [],
    hurry: 36,
    boss: false,
  },

  // ---- Round 5: Sea Fan (Coral Reef) -------------------------------------------------------
  // pictogram: four concentric coral-fan arcs on a rock; enemies drift down the arcs, first thunder bubbles
  {
    name: 'Sea Fan',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............................##',
      '##...........######...........##',
      '##........############........##',
      '##......##............##......##',  // row 5
      '##....##................##....##',
      '##....#.......####.......#....##',
      '##........############........##',
      '##.......##..........##.......##',
      '##.....##..............##.....##',  // row 10
      '##....##......####......##....##',
      '##....#....##########....#....##',
      '##........##........##........##',
      '##.......##..........##.......##',
      '##......##.....##.....##......##',  // row 15
      '##......#....######....#......##',
      '##.....##...#......#...##.....##',
      '##.....#...##......##...#.....##',
      '##.....#...#........#...#.....##',
      '##.....#...#........#...#.....##',  // row 20
      '##............................##',
      '##...........######...........##',
      '##...........######...........##',
      '##...........######...........##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'crabbit', c: 16, r: 5, d: -1 },
      { t: 'crabbit', c: 14, r: 13, d: 1 },
      { t: 'nibbler', c: 11, r: 10, d: 1 },
      { t: 'nibbler', c: 19, r: 6, d: -1 },
      { t: 'nibbler', c: 14, r: 20, d: 1 },
    ],
    air: [[15.5, 6.5]],
    specials: ['thunder'],
    hurry: 38,
    boss: false,
  },

  // ---- Round 6: Kelp Fronds (Kelp Forest) ---------------------------------------------------
  // breather: three kelp strands of chunky leaf ledges zig-zagging up, two floor gaps between them
  {
    name: 'Kelp Fronds',
    map: [
      '###########...####...###########',  // row 0
      '##............................##',
      '##............................##',
      '##............................##',
      '##...........#####............##',
      '##.....#####.#####....#####...##',  // row 5
      '##.....#####..........#####...##',
      '##............................##',
      '##..............#####.........##',
      '##.#####........#####....#######',
      '##.#####.................#######',  // row 10
      '##............................##',
      '##..........#####.............##',
      '##....#####.#####....#####....##',
      '##....#####..........#####....##',
      '##............................##',  // row 15
      '##...............#####........##',
      '##.#####.........#####..#####.##',
      '##.#####................#####.##',
      '##............................##',
      '##...........#####............##',  // row 20
      '##......##########..#####.....##',
      '##......#####.......#####.....##',
      '##............................##',
      '##............................##',
      '###########...####...###########',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 8, r: 11, d: 1 },
      { t: 'nibbler', c: 18, r: 14, d: -1 },
      { t: 'nibbler', c: 22, r: 11, d: 1 },
      { t: 'nibbler', c: 8, r: 3, d: -1 },
    ],
    air: [[15.5, 10]],
    specials: [],
    hurry: 30,
    boss: false,
  },

  // ---- Round 7: Open Water (Kelp Forest) ----------------------------------------------------
  // Jellop debut: wide-open sea with staggered floating islands, lots of room for diagonal bouncing
  {
    name: 'Open Water',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............................##',
      '##............................##',
      '##............................##',
      '##.....#####.........#####....##',  // row 5
      '##.....#####.........#####....##',
      '##............................##',
      '##............................##',
      '##.#####......#####......####.##',
      '##.#####......#####......####.##',  // row 10
      '##............................##',
      '##............................##',
      '##.......#####.....#####......##',
      '##.......#####.....#####......##',
      '##............................##',  // row 15
      '##............................##',
      '##.#####......#####......####.##',
      '##.#####......#####......####.##',
      '##............................##',
      '##............................##',  // row 20
      '##.......#####.....#####......##',
      '##.......#####.....#####......##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'jellop', c: 6, r: 11, d: 1 },
      { t: 'jellop', c: 22, r: 7, d: -1 },
      { t: 'jellop', c: 15, r: 13, d: 1 },
      { t: 'nibbler', c: 10, r: 11, d: 1 },
      { t: 'nibbler', c: 15, r: 15, d: -1 },
    ],
    air: [[10, 3.5], [22, 3.5]],
    specials: [],
    hurry: 34,
    boss: false,
  },

  // ---- Round 8: Sea Turtle (Kelp Forest) ----------------------------------------------------
  // pictogram: a turtle seen from above - grooved shell, head on top, four flippers; water bubbles flow down its back
  {
    name: 'Sea Turtle',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............####............##',
      '##...........#.##.#...........##',
      '##...........######...........##',
      '##...####...########...####...##',  // row 5
      '##...######################...##',
      '##....####################....##',
      '##.....######..##..######.....##',
      '##......#####..##..#####......##',
      '##.......##############.......##',  // row 10
      '##.......######..######.......##',
      '##.......######..######.......##',
      '##.......##############.......##',
      '##......####..####..####......##',
      '##....######..####..######....##',  // row 15
      '##...######..######..######...##',
      '##...####......##......####...##',
      '##.............##.............##',
      '##............................##',
      '##............................##',  // row 20
      '##......######....######......##',
      '##......######....######......##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 10, r: 19, d: 1 },
      { t: 'nibbler', c: 19, r: 19, d: -1 },
      { t: 'crabbit', c: 9, r: 4, d: 1 },
      { t: 'jellop', c: 5, r: 10, d: 1 },
      { t: 'jellop', c: 24, r: 12, d: -1 },
    ],
    air: [[7.5, 3], [24.5, 3]],
    specials: ['water'],
    hurry: 38,
    boss: false,
  },

  // ---- Round 9: Kelp Tangle (Kelp Forest) ---------------------------------------------------
  // dense thicket: irregular 1-thick ledges only 3 rows apart, short runs, very little open floor
  {
    name: 'Kelp Tangle',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............................##',
      '##............................##',
      '##.......#####.......####.....##',
      '##............................##',  // row 5
      '##............................##',
      '##.#####......######.....#######',
      '##............................##',
      '##............................##',
      '##......######........######..##',  // row 10
      '##............................##',
      '##............................##',
      '##.######......######....#######',
      '##............................##',
      '##............................##',  // row 15
      '##.......#####.......######...##',
      '##............................##',
      '##............................##',
      '##.#####......######....#####.##',
      '##............................##',  // row 20
      '##............................##',
      '##......#####....######.......##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 17, r: 17, d: 1 },
      { t: 'crabbit', c: 9, r: 14, d: -1 },
      { t: 'nibbler', c: 16, r: 11, d: -1 },
      { t: 'crabbit', c: 8, r: 8, d: 1 },
      { t: 'nibbler', c: 15, r: 5, d: 1 },
      { t: 'jellop', c: 26, r: 2, d: -1 },
    ],
    air: [[11, 14], [23, 8]],
    specials: [],
    hurry: 40,
    boss: false,
  },

  // ---- Round 10: Seahorse (Kelp Forest) ------------------------------------------------------
  // pictogram: a seahorse - the snout, S-curved body and curled tail; left rock ledges climb to the snout, free drop channels everywhere
  {
    name: 'Seahorse',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............................##',
      '##............................##',
      '##.............####...........##',
      '##............#.###...........##',  // row 5
      '##......###########...........##',
      '##.....######.#####...........##',
      '##............#####...........##',
      '#####..........###............##',
      '#####.........####............##',  // row 10
      '##..........######............##',
      '##..........######............##',
      '#####.......#####.............##',
      '#####.......#####....#........##',
      '##......###.#####..#####......##',  // row 15
      '##...........####..##..##.....##',
      '#####.........####.#...##.....##',
      '#####..........###.....##.....##',
      '##..............##.....##.....##',
      '##...............#######......##',  // row 20
      '##......######....#####.......##',
      '##......######................##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 15, r: 2, d: -1 },
      { t: 'crabbit', c: 9, r: 4, d: 1 },
      { t: 'nibbler', c: 3, r: 11, d: 1 },
      { t: 'crabbit', c: 8, r: 13, d: 1 },
      { t: 'jellop', c: 22, r: 2, d: -1 },
      { t: 'nibbler', c: 11, r: 19, d: 1 },
    ],
    air: [[10, 4]],
    specials: ['fire'],
    hurry: 42,
    boss: false,
  },

  // ---- Round 11: Anchor (Sunken Ship) --------------------------------------------------------
  // Springle debut: a ship anchor - ring, stock, shank and curved arms; two bowls for the bouncers
  {
    name: 'Anchor',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............####............##',
      '##............####............##',
      '##...........##..##...........##',
      '##...........##..##...........##',  // row 5
      '##............####............##',
      '##.............##.............##',
      '##........############........##',
      '##........############........##',
      '##..##.........##.........##..##',  // row 10
      '##..###........##........###..##',
      '##..###........##........###..##',
      '##...###.......##.......###...##',
      '##...####......##......####...##',
      '##....####.....##.....####....##',  // row 15
      '##.....######..##..######.....##',
      '##......################......##',
      '##.......##############.......##',
      '##..........########..........##',
      '##............................##',  // row 20
      '##............................##',
      '##......#####......#####......##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'springle', c: 10, r: 14, d: 1 },
      { t: 'springle', c: 20, r: 14, d: -1 },
      { t: 'springle', c: 19, r: 6, d: -1 },
      { t: 'nibbler', c: 10, r: 6, d: 1 },
      { t: 'nibbler', c: 26, r: 8, d: -1 },
    ],
    air: [[16, 5]],
    specials: [],
    hurry: 36,
    boss: false,
  },

  // ---- Round 12: Ship's Wheel (Sunken Ship) --------------------------------------------------
  // pictogram: a helm with rim, hub, eight spokes and handles; rim top and hub are the stages
  {
    name: 'Ship\'s Wheel',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............................##',
      '##..........########..........##',
      '##.........##########.........##',
      '##.......####..##..####.......##',  // row 5
      '##.......###...##...###.......##',
      '##......#####..##..#####......##',
      '##......##..##.##.##..##......##',
      '##.....###...######...###.....##',
      '##..##.##.....####.....##.##..##',  // row 10
      '##..##.##################.##..##',
      '##..##.##.....####.....##.##..##',
      '##.....###...######...###.....##',
      '##......##..##.##.##..##......##',
      '##......#####..##..#####......##',  // row 15
      '##.......###...##...###.......##',
      '##.......####..##..####.......##',
      '##.....##..##########..##.....##',
      '##.....###..########..###.....##',
      '##............................##',  // row 20
      '##............................##',
      '##......####.........####.....##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 12, r: 1, d: 1 },
      { t: 'nibbler', c: 18, r: 1, d: -1 },
      { t: 'crabbit', c: 11, r: 9, d: 1 },
      { t: 'crabbit', c: 19, r: 9, d: -1 },
      { t: 'springle', c: 13, r: 16, d: 1 },
      { t: 'springle', c: 17, r: 16, d: -1 },
    ],
    air: [[16, 2], [6.5, 7], [25.5, 7]],
    specials: [],
    hurry: 40,
    boss: false,
  },

  // ---- Round 13: Galleon (Sunken Ship) -------------------------------------------------------
  // pictogram: a sailing ship - hull, bow, two masts whose yards form a ladder of 4-row steps; docks and fenders on both sides
  {
    name: 'Galleon',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............................##',
      '##.........#####..............##',
      '##..........##................##',
      '##..........##................##',  // row 5
      '##..........##................##',
      '##........#############.......##',
      '##..........##.....##.........##',
      '##..........##.....##.........##',
      '##..........##.....##.........##',  // row 10
      '##.......###############......##',
      '##..........##.....##.........##',
      '##..........##.....##..#......##',
      '##..........##.....##.##......##',
      '##......################......##',  // row 15
      '##.......##############.......##',
      '#####....##############....#####',
      '#####.....############.....#####',
      '##............................##',
      '##............................##',  // row 20
      '##............................##',
      '##.....####..........####.....##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 14, r: 13, d: 1 },
      { t: 'crabbit', c: 14, r: 9, d: -1 },
      { t: 'springle', c: 9, r: 13, d: 1 },
      { t: 'nibbler', c: 12, r: 1, d: 1 },
      { t: 'crabbit', c: 21, r: 9, d: -1 },
      { t: 'jellop', c: 4, r: 5, d: 1 },
    ],
    air: [[15.5, 5], [24.5, 8]],
    specials: ['water'],
    hurry: 40,
    boss: false,
  },

  // ---- Round 14: Cargo Tetris (Sunken Ship) --------------------------------------------------
  // asymmetric cargo pile built from 2x-scaled tetrominoes; every piece is 2 or 4 rows tall, gaps of 2-4 columns
  {
    name: 'Cargo Tetris',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............................##',
      '##............##..............##',
      '##............##..............##',
      '##..........########....####..##',  // row 5
      '##..........########....####..##',
      '##..##........................##',
      '##..##........................##',
      '##..######........####........##',
      '##..######........####........##',  // row 10
      '##........##......####........##',
      '##........##......####........##',
      '##........######......######..##',
      '##........######......######..##',
      '##................##..........##',  // row 15
      '##................##..........##',
      '##..########..######...####...##',
      '##..########..######...####...##',
      '##.....................####...##',
      '##.....................####...##',  // row 20
      '##......####........##........##',
      '##......####........##........##',
      '##........####....######......##',
      '##........####....######......##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 24, r: 3, d: -1 },
      { t: 'crabbit', c: 16, r: 3, d: 1 },
      { t: 'springle', c: 22, r: 11, d: -1 },
      { t: 'nibbler', c: 6, r: 7, d: 1 },
      { t: 'crabbit', c: 20, r: 7, d: -1 },
      { t: 'springle', c: 13, r: 11, d: 1 },
    ],
    air: [[15, 9.5]],
    specials: [],
    hurry: 40,
    boss: false,
  },

  // ---- Round 15: Skull and Bones (Sunken Ship) -----------------------------------------------
  // pictogram: a pirate skull over crossed bones - sockets, nose and teeth are cut out; end-of-ship challenge
  {
    name: 'Skull and Bones',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............................##',
      '##..........########..........##',
      '##........############........##',
      '##.......##############.......##',  // row 5
      '##......################......##',
      '##......################......##',
      '##.....####...####...####.....##',
      '##.....###.....##.....###.....##',
      '##......##.....##.....##......##',  // row 10
      '##...##.##.....##.....##.##...##',
      '##...#######.######.#######...##',
      '##....#########..#########....##',
      '##.......##############.......##',
      '##........############........##',  // row 15
      '##........############........##',
      '##.......##############.......##',
      '##.....#####........#####.....##',
      '##..######............######..##',
      '##...##..................##...##',  // row 20
      '##............................##',
      '##......#####......#####......##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 14, r: 1, d: 1 },
      { t: 'crabbit', c: 10, r: 10, d: 1 },
      { t: 'crabbit', c: 20, r: 10, d: -1 },
      { t: 'springle', c: 5, r: 9, d: 1 },
      { t: 'springle', c: 25, r: 9, d: -1 },
      { t: 'jellop', c: 3, r: 6, d: 1 },
    ],
    air: [[12.5, 10], [19.5, 10]],
    specials: ['thunder'],
    hurry: 42,
    boss: false,
  },

  // ---- Round 16: Crystal Cavern (Crystal Caves) ------------------------------------------------
  // Glimmer debut: stalagmites, hanging stalactites that shield from sparks, flat-topped crystals floating between
  {
    name: 'Crystal Cavern',
    map: [
      '################################',  // row 0
      '##.#####......#####.....####..##',
      '##..###........###.......###..##',
      '##............................##',
      '##............................##',
      '##......#####......#####......##',  // row 5
      '##.....#######....#######.....##',
      '##............................##',
      '##............................##',
      '##...####.....####.....####...##',
      '##..######...######...######..##',  // row 10
      '##............................##',
      '##............................##',
      '##.......####......####.......##',
      '##......######....######......##',
      '##............................##',  // row 15
      '##............................##',
      '##..####.....#####.....#####..##',
      '##.######...#######...#######.##',
      '##............................##',
      '##............................##',  // row 20
      '##.......###........###.......##',
      '##......####.......####.......##',
      '##......#####......#####......##',
      '##.....#######....#######.....##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'glimmer', c: 7, r: 12, d: 1 },
      { t: 'glimmer', c: 21, r: 15, d: -1 },
      { t: 'nibbler', c: 10, r: 11, d: 1 },
      { t: 'nibbler', c: 24, r: 7, d: -1 },
      { t: 'crabbit', c: 14, r: 15, d: 1 },
    ],
    air: [[11.5, 3.5], [21, 3.5]],
    specials: [],
    hurry: 34,
    boss: false,
  },

  // ---- Round 17: Great Diamond (Crystal Caves) -------------------------------------------------
  // pictogram: a cut diamond outline - table, girdle bar, V-shaped pavilion with facet shelves inside
  {
    name: 'Great Diamond',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............................##',
      '##.......#############........##',
      '##......###############.......##',
      '##......##.##.....##..##......##',  // row 5
      '##.....##..#.......##..##.....##',
      '##.....#..##........#..##.....##',
      '##....##..#.........##..##....##',
      '##....####################....##',
      '##....####################....##',  // row 10
      '##.....##..............##.....##',
      '##.....###............###.....##',
      '##......##............##......##',
      '##.......##..........##.......##',
      '##........##........##........##',  // row 15
      '##.........##########.........##',
      '##.........##########.........##',
      '##..........##....##..........##',
      '##...........##..##...........##',
      '##............####............##',  // row 20
      '##.............##.............##',
      '##............................##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 10, r: 1, d: 1 },
      { t: 'crabbit', c: 12, r: 7, d: 1 },
      { t: 'nibbler', c: 18, r: 7, d: -1 },
      { t: 'springle', c: 13, r: 14, d: 1 },
      { t: 'glimmer', c: 13, r: 5, d: 1 },
      { t: 'jellop', c: 3, r: 3, d: 1 },
    ],
    air: [[14, 6], [19, 13.5]],
    specials: [],
    hurry: 38,
    boss: false,
  },

  // ---- Round 18: Sky Loop (Crystal Caves) ------------------------------------------------------
  // wrap-around round: the top tiers sit 7 rows above the lower world - ride the floor gaps (or bubble-bounce) to get up, walk off the ledges to come down
  {
    name: 'Sky Loop',
    map: [
      '#########...########...#########',  // row 0
      '##............................##',
      '##............................##',
      '##............................##',
      '##............................##',
      '##............................##',  // row 5
      '##.##########......##########.##',
      '##.##########......##########.##',
      '##............................##',
      '##............................##',
      '##...........######...........##',  // row 10
      '##...........######...........##',
      '##............................##',
      '##............................##',
      '##............................##',
      '##............................##',  // row 15
      '##............................##',
      '##.#######..########..#######.##',
      '##.#######..########..#######.##',
      '##............................##',
      '##............................##',  // row 20
      '##...........######...........##',
      '##...........######...........##',
      '##............................##',
      '##............................##',
      '#########...########...#########',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 5, r: 4, d: 1 },
      { t: 'crabbit', c: 25, r: 4, d: -1 },
      { t: 'springle', c: 14, r: 8, d: 1 },
      { t: 'glimmer', c: 15, r: 3, d: 1 },
      { t: 'jellop', c: 6, r: 12, d: 1 },
      { t: 'nibbler', c: 13, r: 15, d: -1 },
      { t: 'crabbit', c: 17, r: 15, d: 1 },
    ],
    air: [[13, 9], [24.5, 14]],
    specials: [],
    hurry: 42,
    boss: false,
  },

  // ---- Round 19: Frost Star (Crystal Caves) ----------------------------------------------------
  // pictogram: an eight-armed snowflake built from ice beads - open on all sides, hop from bead to bead
  {
    name: 'Frost Star',
    map: [
      '################################',  // row 0
      '##............................##',
      '##.....##......##......##.....##',
      '##.....##......##......##.....##',
      '##............................##',
      '##............................##',  // row 5
      '##.........##..##..##.........##',
      '##.........##..##..##.........##',
      '##............................##',
      '##............................##',
      '##....##.##.##....##.##.##....##',  // row 10
      '##....##.##.##....##.##.##....##',
      '##............................##',
      '##............................##',
      '##.........##..##..##.........##',
      '##.........##..##..##.........##',  // row 15
      '##............................##',
      '##............................##',
      '##.....##......##......##.....##',
      '##.....##......##......##.....##',
      '##............................##',  // row 20
      '##............................##',
      '##.......####......####.......##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 11, r: 4, d: 1 },
      { t: 'crabbit', c: 19, r: 4, d: -1 },
      { t: 'springle', c: 12, r: 8, d: 1 },
      { t: 'nibbler', c: 21, r: 8, d: -1 },
      { t: 'springle', c: 15, r: 12, d: 1 },
      { t: 'glimmer', c: 5, r: 13, d: 1 },
      { t: 'jellop', c: 25, r: 13, d: -1 },
    ],
    air: [[15.5, 5], [22, 13]],
    specials: ['thunder'],
    hurry: 38,
    boss: false,
  },

  // ---- Round 20: Nautilus (Crystal Caves) ------------------------------------------------------
  // pictogram: a nautilus spiral - one long coiled ledge winding to the centre; end-of-caves challenge, 8 enemies
  {
    name: 'Nautilus',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............................##',
      '##............................##',
      '##...........########.........##',
      '##.........####....###........##',  // row 5
      '##........###........##.......##',
      '##........##..........##......##',
      '##.......##...#####...##......##',
      '##.......##..###..##...##.....##',
      '##.......##..##....##..##.....##',  // row 10
      '##.......##..##....##..##.....##',
      '##.......##........##..##.....##',
      '##.......##........##..##.....##',
      '##........##......###..##.....##',
      '##.........##....###...##.....##',  // row 15
      '##..........#######...##......##',
      '##............###....##.......##',
      '##..................###.......##',
      '##................####........##',
      '##...........#######..........##',  // row 20
      '##............###.............##',
      '##......#####......#####......##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 14, r: 2, d: 1 },
      { t: 'crabbit', c: 18, r: 2, d: -1 },
      { t: 'springle', c: 15, r: 6, d: 1 },
      { t: 'nibbler', c: 14, r: 18, d: 1 },
      { t: 'springle', c: 13, r: 14, d: 1 },
      { t: 'glimmer', c: 5, r: 10, d: 1 },
      { t: 'glimmer', c: 26, r: 8, d: -1 },
      { t: 'jellop', c: 12, r: 12, d: 1 },
    ],
    air: [[16.5, 3]],
    specials: [],
    hurry: 45,
    boss: false,
  },

  // ---- Round 21: Volcano (Volcanic Vents) -------------------------------------------------------
  // breather: a hollow volcano - thick basalt slopes around a magma chamber, crater on top
  {
    name: 'Volcano',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............................##',
      '##............................##',
      '##...........##..##...........##',
      '##..........###..###..........##',  // row 5
      '##..........########..........##',
      '##.........##########.........##',
      '##........####....####........##',
      '##........###......###........##',
      '##.......####......####.......##',  // row 10
      '##.......###........###.......##',
      '##......####........####......##',
      '##......###..........###......##',
      '##.....###............###.....##',
      '##....####............####....##',  // row 15
      '##....###..............###....##',
      '##...######################...##',
      '##...######################...##',
      '##............................##',
      '##............................##',  // row 20
      '##............................##',
      '##......#####......#####......##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'springle', c: 13, r: 15, d: 1 },
      { t: 'springle', c: 18, r: 15, d: -1 },
      { t: 'nibbler', c: 12, r: 2, d: 1 },
      { t: 'crabbit', c: 18, r: 2, d: -1 },
      { t: 'glimmer', c: 6, r: 5, d: 1 },
      { t: 'jellop', c: 24, r: 5, d: -1 },
    ],
    air: [[16, 5.5], [13.5, 13]],
    specials: [],
    hurry: 36,
    boss: false,
  },

  // ---- Round 22: Lava Falls (Volcanic Vents) ----------------------------------------------------
  // two aligned lava shafts run through every lane and out the floor gaps: whoever steps off the lane loops back to the top
  {
    name: 'Lava Falls',
    map: [
      '########...##########...########',  // row 0
      '##............................##',
      '##............................##',
      '##......................########',
      '##......................########',
      '########...##########.........##',  // row 5
      '########...##########.........##',
      '##......................########',
      '##......................########',
      '########...##########.........##',
      '########...##########.........##',  // row 10
      '##......................########',
      '##......................########',
      '########...##########.........##',
      '########...##########.........##',
      '##......................########',  // row 15
      '##......................########',
      '########...##########.........##',
      '########...##########.........##',
      '##......................########',
      '##......................########',  // row 20
      '##.........##########.........##',
      '##.........##########.........##',
      '##............................##',
      '##............................##',
      '########...##########...########',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 3, r: 7, d: 1 },
      { t: 'crabbit', c: 14, r: 11, d: -1 },
      { t: 'nibbler', c: 16, r: 3, d: 1 },
      { t: 'springle', c: 25, r: 9, d: -1 },
      { t: 'crabbit', c: 26, r: 5, d: -1 },
      { t: 'glimmer', c: 8, r: 12, d: 1 },
      { t: 'jellop', c: 21, r: 15, d: -1 },
    ],
    air: [[15.5, 8]],
    specials: ['fire'],
    hurry: 42,
    boss: false,
  },

  // ---- Round 23: Trident (Volcanic Vents) -------------------------------------------------------
  // pictogram: Poseidon trident - three barbed prongs climbed like ladders, curved neck, short shaft
  {
    name: 'Trident',
    map: [
      '################################',  // row 0
      '##............................##',
      '##.............##.............##',
      '##.....#......####.....#......##',
      '##....###....######...###.....##',
      '##...#####.....##....#####....##',  // row 5
      '##.....##......##......##.....##',
      '##.....##......##......##.....##',
      '##.....##......##......##.....##',
      '##...######..######..######...##',
      '##.....##......##......##.....##',  // row 10
      '##.....##......##......##.....##',
      '##.....##......##......##.....##',
      '##.....##......##......##.....##',
      '##......##............##......##',
      '##......####........####......##',  // row 15
      '##.......##############.......##',
      '##..........########..........##',
      '##.............##.............##',
      '##.......###...##...###.......##',
      '##.............##.............##',  // row 20
      '##............................##',
      '##......#####......#####......##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 13, r: 14, d: 1 },
      { t: 'crabbit', c: 17, r: 14, d: -1 },
      { t: 'nibbler', c: 5, r: 7, d: 1 },
      { t: 'crabbit', c: 25, r: 7, d: -1 },
      { t: 'springle', c: 17, r: 7, d: -1 },
      { t: 'glimmer', c: 11, r: 5, d: 1 },
      { t: 'jellop', c: 3, r: 12, d: 1 },
    ],
    air: [[11.5, 8], [20.5, 8]],
    specials: [],
    hurry: 42,
    boss: false,
  },

  // ---- Round 24: Pearl Oyster (Volcanic Vents) --------------------------------------------------
  // pictogram: an open oyster - arched upper shell, bowl below, a big pearl in the mouth; thunder bubbles
  {
    name: 'Pearl Oyster',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............................##',
      '##.............###............##',
      '##.........###########........##',
      '##.......###############......##',  // row 5
      '##......##################....##',
      '##.....#######......######....##',
      '##....#####............###....##',
      '##....####...............#....##',
      '##....###.....................##',  // row 10
      '##....###.###.######..........##',
      '##....###.###.######..........##',
      '##....###..........###........##',
      '##....####........#####.......##',
      '##......###.......#####.#.....##',  // row 15
      '##.......######...#######.....##',
      '##........###############.....##',
      '##.........###########........##',
      '##...............##...........##',
      '##............................##',  // row 20
      '##............................##',
      '##.....#####........#####.....##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 15, r: 1, d: 1 },
      { t: 'crabbit', c: 19, r: 2, d: -1 },
      { t: 'nibbler', c: 11, r: 2, d: 1 },
      { t: 'springle', c: 11, r: 14, d: 1 },
      { t: 'crabbit', c: 15, r: 9, d: 1 },
      { t: 'glimmer', c: 16, r: 7, d: 1 },
      { t: 'jellop', c: 24, r: 10, d: -1 },
    ],
    air: [[12, 9], [21.5, 10]],
    specials: ['thunder'],
    hurry: 40,
    boss: false,
  },

  // ---- Round 25: Axolotl Face (Volcanic Vents) --------------------------------------------------
  // pictogram: the heroes' own smile - round face, three gill frills per side, big eyes and a grin to walk on
  {
    name: 'Axolotl Face',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............................##',
      '##............................##',
      '##............####............##',
      '##.........##########.........##',  // row 5
      '##........####....####........##',
      '##...##..###........###..##...##',
      '##....#####..........#####....##',
      '##.....###.###....###.###.....##',
      '##......##.###....###.##......##',  // row 10
      '##......##.###....###.##......##',
      '##...#####............#####...##',
      '##......##............##......##',
      '##......##.##......##.##......##',
      '##......###.##....##.###......##',  // row 15
      '##.....#####.######.#####.....##',
      '##...###..####....####..###...##',
      '##.........##########.........##',
      '##............####............##',
      '##............................##',  // row 20
      '##............................##',
      '##.....#####........#####.....##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 14, r: 2, d: 1 },
      { t: 'crabbit', c: 16, r: 2, d: -1 },
      { t: 'springle', c: 12, r: 7, d: 1 },
      { t: 'springle', c: 18, r: 7, d: -1 },
      { t: 'nibbler', c: 5, r: 5, d: 1 },
      { t: 'nibbler', c: 25, r: 5, d: -1 },
      { t: 'glimmer', c: 14, r: 12, d: 1 },
      { t: 'jellop', c: 3, r: 3, d: 1 },
    ],
    air: [[16, 12.5]],
    specials: ['water'],
    hurry: 40,
    boss: false,
  },

  // ---- Round 26: Temple Facade (Abyss Temple) -------------------------------------------------
  // breather: a temple front - pediment roof, four storeys of slabs; storeys alternate between pillared cells and open galleries
  {
    name: 'Temple Facade',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............................##',
      '##...........######...........##',
      '##........############........##',
      '##............................##',  // row 5
      '##....####################....##',
      '##........##...##...##........##',
      '##........##...##...##........##',
      '##........##...##...##........##',
      '##....####################....##',  // row 10
      '##............................##',
      '##............................##',
      '##............................##',
      '##....####################....##',
      '##.......##..........##.......##',  // row 15
      '##.......##..........##.......##',
      '##.......##..........##.......##',
      '##....####################....##',
      '##..........##....##..........##',
      '##..........##....##..........##',  // row 20
      '##..........##....##..........##',
      '##......################......##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 12, r: 8, d: 1 },
      { t: 'crabbit', c: 6, r: 12, d: 1 },
      { t: 'nibbler', c: 22, r: 12, d: -1 },
      { t: 'springle', c: 14, r: 16, d: 1 },
      { t: 'glimmer', c: 3, r: 2, d: 1 },
      { t: 'jellop', c: 26, r: 2, d: -1 },
    ],
    air: [[14, 9], [9, 12.5]],
    specials: [],
    hurry: 38,
    boss: false,
  },

  // ---- Round 27: Ziggurat (Abyss Temple) ------------------------------------------------------
  // pictogram: a stepped pyramid with a raised base you can walk under and a shrine on top; water bubbles flow down the steps
  {
    name: 'Ziggurat',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............................##',
      '##............................##',
      '##............................##',
      '##............####............##',  // row 5
      '##............#..#............##',
      '##............#..#............##',
      '##............####............##',
      '##...........######...........##',
      '##...........######...........##',  // row 10
      '##...........######...........##',
      '##...........######...........##',
      '##.........##########.........##',
      '##.........##########.........##',
      '##.........##########.........##',  // row 15
      '##.........##########.........##',
      '##.......##############.......##',
      '##.......##############.......##',
      '##.......##############.......##',
      '##.......##############.......##',  // row 20
      '##.....##################.....##',
      '##............................##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 14, r: 3, d: 1 },
      { t: 'crabbit', c: 16, r: 3, d: -1 },
      { t: 'springle', c: 11, r: 11, d: 1 },
      { t: 'springle', c: 19, r: 11, d: -1 },
      { t: 'glimmer', c: 4, r: 6, d: 1 },
      { t: 'glimmer', c: 26, r: 8, d: -1 },
      { t: 'jellop', c: 6, r: 12, d: 1 },
    ],
    air: [[15.5, 3], [12.5, 8], [19.5, 8]],
    specials: ['water'],
    hurry: 38,
    boss: false,
  },

  // ---- Round 28: Abyssal Eye (Abyss Temple) ---------------------------------------------------
  // pictogram: an almond eye - upper and lower lid arcs, ringed iris and pupil, lashes on the slopes
  {
    name: 'Abyssal Eye',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............................##',
      '##............................##',
      '##....#......######......#....##',
      '##....##...##########...##....##',  // row 5
      '##.....#..###......###..#.....##',
      '##.....####..######..####.....##',
      '##.....###..########..###.....##',
      '##.....##..###....###..##.....##',
      '##....##...##..##..##...##....##',  // row 10
      '##...###..###.####.###..###...##',
      '##...##...###.####.###...##...##',
      '##...###...##.####.##...###...##',
      '##....##...##..##..##...##....##',
      '##.....##..####..####..##.....##',  // row 15
      '##.....###..########..###.....##',
      '##.......###..####..###.......##',
      '#####.....####....####.....#####',
      '#####......##########......#####',
      '##............####............##',  // row 20
      '##............................##',
      '##.....#####........#####.....##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 12, r: 2, d: 1 },
      { t: 'crabbit', c: 18, r: 2, d: -1 },
      { t: 'springle', c: 21, r: 14, d: -1 },
      { t: 'nibbler', c: 9, r: 14, d: 1 },
      { t: 'glimmer', c: 5, r: 2, d: 1 },
      { t: 'glimmer', c: 21, r: 2, d: -1 },
      { t: 'jellop', c: 22, r: 10, d: -1 },
    ],
    air: [[16, 2.5], [9, 13]],
    specials: [],
    hurry: 36,
    boss: false,
  },

  // ---- Round 29: The Crown (Abyss Temple) -----------------------------------------------------
  // pictogram: the Kraken King's crown - three points and a jewelled band; its body is 6+ rows above the floor, so ride the centre floor gap (or bounce on bubbles) to the top
  {
    name: 'The Crown',
    map: [
      '##############....##############',  // row 0
      '##............................##',
      '##............................##',
      '##............................##',
      '##.............##.............##',
      '##............####............##',  // row 5
      '##....##......####......##....##',
      '##...####....######....####...##',
      '##..#####....######....#####..##',
      '##..######..########..######..##',
      '##..#######.########.#######..##',  // row 10
      '##..########################..##',
      '##..########################..##',
      '##..########################..##',
      '##..########################..##',
      '##..##....####....####....##..##',  // row 15
      '##..########################..##',
      '##..########################..##',
      '##..########################..##',
      '##............................##',
      '##............................##',  // row 20
      '##............................##',
      '##............................##',
      '##............................##',
      '##............................##',
      '##############....##############',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 15, r: 2, d: 1 },
      { t: 'crabbit', c: 6, r: 4, d: 1 },
      { t: 'crabbit', c: 24, r: 4, d: -1 },
      { t: 'springle', c: 12, r: 5, d: 1 },
      { t: 'springle', c: 18, r: 5, d: -1 },
      { t: 'glimmer', c: 4, r: 2, d: 1 },
      { t: 'glimmer', c: 26, r: 2, d: -1 },
      { t: 'jellop', c: 10, r: 3, d: 1 },
    ],
    air: [[5.5, 4], [15.5, 2.5], [26, 4]],
    specials: ['fire', 'thunder'],
    hurry: 36,
    boss: false,
  },

  // ---- Round 30: Kraken King (Abyss Temple) ---------------------------------------------------
  // boss arena: wide open water (the 6x6 Kraken starts top centre), two floor gaps that spit thunder bubbles, platforms at three heights to dodge ink
  {
    name: 'Kraken King',
    map: [
      '###########...####...###########',  // row 0
      '##............................##',
      '##............................##',
      '##............................##',
      '##............................##',
      '##............................##',  // row 5
      '##............................##',
      '##............................##',
      '##............................##',
      '#######.......................##',
      '#######.......................##',  // row 10
      '##............................##',
      '##............................##',
      '##......#####......#####......##',
      '##......#####......#####......##',
      '##............................##',  // row 15
      '##............................##',
      '##.######....######....######.##',
      '##.######....######....######.##',
      '##............................##',
      '##............................##',  // row 20
      '##.....#####........#####.....##',
      '##.....#####........#####.....##',
      '##............................##',
      '##............................##',
      '###########...####...###########',  // row 25
    ],
    enemies: [
      { t: 'kraken', c: 14, r: 4, d: -1 },
    ],
    air: [[6, 14], [21.5, 10]],
    specials: ['thunder'],
    hurry: 150,
    boss: true,
  },
];
