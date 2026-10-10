// FIZZ & POP — test/levels_defs_b.mjs : rounds 11-20 (Sunken Ship + Crystal Caves)
import { walker as W, flyer as F } from './levels_dsl.mjs';

export const ROUNDS_B = [
  // ------------------------------------------------------------------------------------------ 11
  {
    name: 'Anchor',
    concept: 'Springle debut: a ship anchor - ring, stock, shank and curved arms; two bowls for the bouncers',
    gaps: [],
    build(m) {
      m.ring(16, 4.8, 2.8, 1.3);                                                  // ring
      m.T(8, 10, 21);                                                             // stock
      m.B(10, 17, 15, 16);                                                        // shank
      m.stroke([[5, 11, 1.2], [6.8, 14.8, 1.4], [10.5, 17.6, 1.5], [16, 18.8, 1.6], [21.5, 17.6, 1.5], [25.2, 14.8, 1.4], [27, 11, 1.2]]);   // arms
      m.poly([[3.2, 10.5], [7.2, 11.2], [5.6, 14.2]]).poly([[28.8, 10.5], [24.8, 11.2], [26.4, 14.2]]);                                       // flukes
      m.H(22, 8, 12).H(22, 19, 23);                                               // dock planks (wave 2: thin, a Springle hops onto them from the floor)
    },
    enemies: [W('springle', 10, 16, 1), W('springle', 20, 16, -1), W('springle', 19, 8, -1), W('nibbler', 10, 8, 1), W('nibbler', 26, 10, -1)],
    air: [[16, 5]],                                                             // wave 2 (L5): one gathering point (was 3: bubbles split left / right and no chain was possible)
    specials: [],
    hurry: 36,
  },
  // ------------------------------------------------------------------------------------------ 12
  {
    name: 'Ship\'s Wheel',
    concept: 'pictogram: a helm with rim, hub, eight spokes and handles; rim top and hub are the stages',
    gaps: [],
    build(m) {
      m.ring(16, 11.5, 8.9, 6.7);                                                 // rim
      m.ell(16, 11.5, 2.5, 2.5);                                                  // hub
      m.stroke([[8, 11.5, 0.7], [24, 11.5, 0.7]]).stroke([[16, 3.5, 0.7], [16, 19.5, 0.7]]);
      m.stroke([[10.3, 5.8, 0.6], [21.7, 17.2, 0.6]]).stroke([[21.7, 5.8, 0.6], [10.3, 17.2, 0.6]]);
      for (const k of [0, 1, 3, 4]) {                                            // handles: E, W and the two lower ones. Wave 2: no NW / NE handles - with the rim they made 1-tile notches under the ceiling that held walkers for good; k=2 / 6 sit on the spokes' ends
        const a = (k * Math.PI) / 4;
        m.ell(16 + Math.cos(a) * 10.9, 11.5 + Math.sin(a) * 10.9, 1.3, 1.3);
      }
      m.H(22, 8, 11).H(22, 21, 24);                                               // planks (wave 2: thin, see round 11)
    },
    enemies: [W('nibbler', 12, 3, 1), W('nibbler', 18, 3, -1), W('crabbit', 11, 11, 1), W('crabbit', 19, 11, -1), W('springle', 13, 18, 1), W('springle', 17, 18, -1)],
    air: [[16, 2], [6.5, 7], [25.5, 7]],                                        // wave 2 (L3): side attractors moved up and in (were [3,12] / [29,12]: corner ceiling clusters 33 / 30 px from a straight-jump spot, now 3 px)
    specials: [],
    hurry: 40,
  },
  // ------------------------------------------------------------------------------------------ 13
  {
    name: 'Galleon',
    concept: 'pictogram: a sailing ship - hull, bow, two masts whose yards form a ladder of 4-row steps; docks and fenders on both sides',
    gaps: [],
    build(m) {
      m.poly([[8, 15], [24, 15], [22, 18.9], [10, 18.9]]);                        // hull
      m.poly([[21.5, 15], [23.8, 12.4], [23.8, 15]]);                             // bow
      m.B(3, 14, 12, 13).B(7, 14, 19, 20);                                        // masts (wave 2: the second mast stops at its yard - its 2-row stub above the yard walled walkers into the gap between the masts)
      m.H(11, 9, 23).H(7, 10, 16).H(7, 17, 22).H(3, 11, 15);                      // yards (a ladder of 4-row steps)
      m.H(22, 7, 10).H(22, 21, 24);                                               // docks (wave 2: thin planks, see round 11)
      m.T(17, 2, 4).T(17, 27, 29);                                                // fenders (3 columns of free air between them and the hull)
    },
    enemies: [W('nibbler', 14, 15, 1), W('crabbit', 14, 11, -1), W('springle', 9, 15, 1), W('nibbler', 12, 3, 1), W('crabbit', 21, 11, -1), F('jellop', 4, 5, 1)],
    air: [[15.5, 5], [24.5, 8]],
    specials: ['water'],
    hurry: 40,
  },
  // ------------------------------------------------------------------------------------------ 14
  {
    name: 'Cargo Tetris',
    concept: 'asymmetric cargo pile built from 2x-scaled tetrominoes; every piece is 2 or 4 rows tall, gaps of 2-4 columns',
    gaps: [],
    build(m) {
      // floor layer
      m.B(21, 22, 8, 11).B(23, 24, 10, 13);                                       // Z
      m.B(23, 24, 18, 23).B(21, 22, 20, 21);                                      // T
      // second layer
      m.B(17, 18, 4, 11);                                                         // I
      m.B(17, 18, 14, 19).B(15, 16, 18, 19);                                      // L
      m.B(17, 20, 23, 26);                                                        // O
      // third layer
      m.B(13, 14, 10, 15).B(11, 12, 10, 11);                                      // J
      m.B(13, 14, 22, 27);
      // fourth layer
      m.B(9, 10, 4, 9).B(7, 8, 4, 5);                                             // L
      m.B(9, 12, 18, 21);                                                         // O
      // top layer
      m.B(5, 6, 12, 19).B(3, 4, 14, 15);                                          // T
      m.B(5, 6, 24, 27);
    },
    enemies: [W('nibbler', 24, 5, -1), W('crabbit', 16, 5, 1), W('springle', 22, 13, -1), W('nibbler', 6, 9, 1), W('crabbit', 20, 9, -1), W('springle', 13, 13, 1)],
    air: [[15, 9.5]],
    specials: [],
    hurry: 40,
  },
  // ------------------------------------------------------------------------------------------ 15
  {
    name: 'Skull and Bones',
    concept: 'pictogram: a pirate skull over crossed bones - sockets, nose and teeth are cut out; end-of-ship challenge',
    gaps: [],
    build(m) {
      m.ell(16, 9.2, 8.6, 6.6);                                                   // cranium
      m.B(13, 17, 10, 21);                                                        // jaw
      m.ell(12.5, 10.2, 2.4, 2.4, '.').ell(19.5, 10.2, 2.4, 2.4, '.');           // sockets
      m.poly([[16, 12.4], [14.8, 13.9], [17.2, 13.9]], '.');                     // nose
      m.X(15, 17, 12, 12).X(15, 17, 14, 14).X(15, 17, 17, 17).X(15, 17, 19, 19); // teeth
      m.stroke([[6.6, 12.6, 1.0], [25.4, 19.6, 1.0]]).stroke([[25.4, 12.6, 1.0], [6.6, 19.6, 1.0]]);  // crossbones (ends keep 3+ columns from the walls)
      m.ell(5.8, 12.0, 1.4, 1.3).ell(26.2, 12.0, 1.4, 1.3).ell(5.8, 19.8, 1.4, 1.2).ell(26.2, 19.8, 1.4, 1.2);   // bone knobs
      m.H(22, 8, 12).H(22, 19, 23);                                               // dock planks (wave 2: thin, see round 11)
    },
    enemies: [W('nibbler', 14, 3, 1), W('crabbit', 10, 12, 1), W('crabbit', 20, 12, -1), W('springle', 5, 11, 1), W('springle', 25, 11, -1), F('jellop', 3, 6, 1)],
    air: [[12.5, 10], [19.5, 10]],
    specials: ['thunder'],
    hurry: 42,
  },
  // ------------------------------------------------------------------------------------------ 16
  {
    name: 'Crystal Cavern',
    concept: 'Glimmer debut: stalagmites, hanging stalactites that shield from sparks, flat-topped crystals floating between',
    gaps: [],
    build(m) {
      // flat-topped crystal slab: 3 cells wide on top, 6 on the lower row
      const slab = (cx, top) => m.poly([[cx - 1.6, top], [cx + 1.6, top], [cx + 3.2, top + 1], [cx + 3.2, top + 2], [cx - 3.2, top + 2], [cx - 3.2, top + 1]]);
      m.poly([[7, 25], [9.4, 21], [11.6, 21], [14, 25]]);                         // stalagmites (4 free floor columns between them)
      m.poly([[18, 25], [20.4, 21], [22.6, 21], [25, 25]]);
      m.poly([[3, 1], [8, 1], [5.5, 6.4]]).poly([[14, 1], [19, 1], [16.5, 6.4]]).poly([[24, 1], [28.4, 1], [26.2, 5.4]]); m.X(3, 6, 2, 29);   // stalactites, cut to 2 rows (wave 3, K6): the old 5-6 row ones walled both row-5 slab rooms in; a walker on a slab, even a 1-cell tip beside its fall line, could not leave
      slab(6, 17); slab(15.5, 17); slab(25.5, 17);
      slab(11, 13); slab(21, 13);
      slab(7, 9); slab(16, 9); slab(25, 9);
      slab(10.5, 5); slab(21.5, 5);
    },
    enemies: [F('glimmer', 7, 12, 1), F('glimmer', 21, 15, -1), W('nibbler', 10, 13, 1), W('nibbler', 24, 9, -1), W('crabbit', 14, 17, 1)],
    air: [[11.5, 3.5], [21, 3.5]],
    specials: [],
    hurry: 34,
  },
  // ------------------------------------------------------------------------------------------ 17
  {
    name: 'Great Diamond',
    concept: 'pictogram: a cut diamond outline - table, girdle bar, V-shaped pavilion with facet shelves inside',
    gaps: [],
    build(m) {
      m.H(3, 10, 21).H(4, 10, 21);                                                // table
      m.stroke([[10, 3.6, 0.8], [6.6, 9, 0.8]]).stroke([[21.4, 3.6, 0.8], [25.4, 9, 0.8]]);   // crown sides
      m.stroke([[13, 4, 0.7], [10.2, 9, 0.7]]).stroke([[18.4, 4, 0.7], [21.2, 9, 0.7]]);      // crown facets
      m.T(9, 6, 25);                                                              // girdle (3 free columns between it and each wall)
      m.stroke([[6.8, 10.4, 0.85], [15.5, 21.3, 0.85]]).stroke([[25.2, 10.4, 0.85], [16.5, 21.3, 0.85]]);   // pavilion sides
      m.T(16, 11, 20);                                                            // facet shelf
    },
    enemies: [W('nibbler', 10, 3, 1), W('crabbit', 12, 9, 1), W('nibbler', 18, 9, -1), W('springle', 13, 16, 1), F('glimmer', 13, 5, 1), F('jellop', 3, 3, 1)],
    air: [[14, 6], [19, 13.5]],
    specials: [],
    hurry: 38,
  },
  // ------------------------------------------------------------------------------------------ 18
  {
    name: 'Sky Loop',
    concept: 'wrap-around round: the top tiers sit 7 rows above the lower world - ride the floor gaps (or bubble-bounce) to get up, walk off the ledges to come down',
    gaps: [[9, 11], [20, 22]],
    build(m) {
      m.T(6, 3, 12).T(6, 19, 28).T(10, 13, 18);                                   // upper world (lands under the ceiling gaps)
      m.T(17, 3, 9).T(17, 12, 19).T(17, 22, 28).T(21, 13, 18);                    // lower world
    },
    enemies: [W('nibbler', 5, 6, 1), W('crabbit', 25, 6, -1), W('springle', 14, 10, 1), F('glimmer', 15, 3, 1), F('jellop', 6, 12, 1), W('nibbler', 13, 17, -1), W('crabbit', 17, 17, 1)],
    air: [[13, 9], [24.5, 14]],                                                 // wave 2 (L3): was [15.5,8]; ceiling cluster moved above the end of the upper-left tier (22 px -> 2 px from a straight-jump spot)
    specials: [],
    hurry: 42,
  },
  // ------------------------------------------------------------------------------------------ 19
  {
    name: 'Frost Star',
    concept: 'pictogram: an eight-armed snowflake built from ice beads - open on all sides, hop from bead to bead',
    gaps: [],
    build(m) {
      const bead = (x, y) => m.B(y - 1, y, x - 1, x);                              // 2x2 ice bead with its bottom-right corner at (x, y)
      for (let k = 1; k <= 3; k++) { bead(16 - 3 * k, 11); bead(16 + 3 * k, 11); }   // horizontal arm (open hub: a 4-column hole to drop through)
      for (let k = 1; k <= 2; k++) { bead(16, 11 - 4 * k); bead(16, 11 + 4 * k); }   // vertical / diagonal beads are 4 apart: head room to stand
      for (let k = 1; k <= 2; k++) for (const sx of [-1, 1]) for (const sy of [-1, 1]) bead(16 + sx * 4 * k, 11 + sy * 4 * k);
      m.H(22, 9, 12).H(22, 19, 22);                                               // planks (wave 2: thin, see round 11; wave 3 K6: the outer ends moved in one column, so a Springle hopping in a corner can clear the plank from the wall instead of ping-ponging between wall and plank end)
    },
    enemies: [W('nibbler', 11, 6, 1), W('crabbit', 19, 6, -1), W('springle', 12, 10, 1), W('nibbler', 21, 10, -1), W('springle', 15, 14, 1), F('glimmer', 5, 13, 1), F('jellop', 25, 13, -1)],
    air: [[15.5, 5], [22, 13]],                                                 // wave 2 (L2): 24 -> 22, bubbles ended in the unreachable ceiling-bead pocket
    specials: ['thunder'],                                                      // wave 2 (L4): fills the special-free R16-R21 stretch
    hurry: 38,
  },
  // ------------------------------------------------------------------------------------------ 20
  {
    name: 'Nautilus',
    concept: 'pictogram: a nautilus spiral - one long coiled ledge winding to the centre; end-of-caves challenge, 8 enemies',
    gaps: [],
    build(m) {
      const turns = 1.75, steps = 90, rIn = 2.2, rOut = 9.4, cx = 16, cy = 11.6;
      const phi0 = Math.PI / 2 + 0.2 - turns * 2 * Math.PI;                       // outer end finishes near the bottom
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps, a = phi0 + t * turns * 2 * Math.PI, r = rIn + (rOut - rIn) * t;
        pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a), 0.85]);
      }
      m.stroke(pts);
      m.H(22, 8, 12).H(22, 19, 23);                                               // planks (wave 2: thin, see round 11)
    },
    enemies: [W('nibbler', 14, 4, 1), W('crabbit', 18, 4, -1), W('springle', 15, 8, 1), W('nibbler', 14, 20, 1), W('springle', 13, 16, 1), F('glimmer', 5, 10, 1), F('glimmer', 26, 8, -1), F('jellop', 12, 12, 1)],
    air: [[16.5, 3]],                                                           // wave 2 (L5): one gathering point on top of the spiral (was the chamber + the top right: 8 enemies split 2,2,2,1,1)
    specials: [],
    hurry: 45,
  },
];
