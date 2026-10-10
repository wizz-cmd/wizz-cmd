// FIZZ & POP — test/levels_defs_c.mjs : rounds 21-30 (Volcanic Vents + Abyss Temple + boss)
import { walker as W, flyer as F } from './levels_dsl.mjs';

export const ROUNDS_C = [
  // ------------------------------------------------------------------------------------------ 21
  {
    name: 'Volcano',
    concept: 'breather: a hollow volcano - thick basalt slopes around a magma chamber, crater on top',
    gaps: [],
    build(m) {
      m.poly([[4.5, 18.9], [12.4, 5.2], [13.4, 3.6], [18.6, 3.6], [19.6, 5.2], [27.5, 18.9]]);   // cone
      m.poly([[9, 17], [14.4, 7.8], [17.6, 7.8], [23, 17]], '.');                 // magma chamber
      m.poly([[14.0, 3.6], [18.0, 3.6], [16, 7.0]], '.');                         // crater
      m.H(22, 8, 12).H(22, 19, 23);                                               // base planks (wave 2: thin, see round 11 of the Sunken Ship)
    },
    enemies: [W('springle', 13, 17, 1), W('springle', 18, 17, -1), W('nibbler', 12, 4, 1), W('crabbit', 18, 4, -1), F('glimmer', 6, 5, 1), F('jellop', 24, 5, -1)],
    air: [[16, 5.5], [13.5, 13]],
    specials: [],
    hurry: 36,
  },
  // ------------------------------------------------------------------------------------------ 22
  {
    name: 'Lava Falls',
    concept: 'two aligned lava shafts run through every lane and out the floor gaps: whoever steps off the lane loops back to the top',
    gaps: [[8, 10], [21, 23]],
    build(m) {
      for (const r of [17, 13, 9, 5]) m.T(r, 2, 7);                               // left column of lanes
      for (const r of [21, 17, 13, 9, 5]) m.T(r, 11, 20);                         // middle column
      for (const r of [19, 15, 11, 7, 3]) m.T(r, 24, 29);                         // right column, two rows higher
    },
    enemies: [W('nibbler', 3, 9, 1), W('crabbit', 14, 13, -1), W('nibbler', 16, 5, 1), W('springle', 25, 11, -1), W('crabbit', 26, 7, -1), F('glimmer', 8, 12, 1), F('jellop', 21, 15, -1)],
    air: [[15.5, 8]],                                                           // wave 2 (L5): one gathering point (was 3 lane columns: no chain was possible)
    specials: ['fire'],
    hurry: 42,                                                                  // wave 3 (K6): softened ramp for R22-R29: 42 42 40 40 38 38 36 36 (wave 2 had 40 .. 30; never below 36)
  },
  // ------------------------------------------------------------------------------------------ 23
  {
    name: 'Trident',
    concept: 'pictogram: Poseidon trident - three barbed prongs climbed like ladders, curved neck, short shaft',
    gaps: [],
    build(m) {
      m.B(6, 13, 7, 8).B(5, 13, 15, 16).B(6, 13, 23, 24);                         // prong shafts
      m.poly([[7.5, 2.6], [10.6, 6], [4.4, 6]]).poly([[23.5, 2.6], [26.6, 6], [20.4, 6]]);   // side arrowheads
      m.poly([[16, 1.4], [19.2, 5], [12.8, 5]]);                                  // centre arrowhead
      m.H(9, 5, 10).H(9, 21, 26).H(9, 13, 18);                                    // collars
      m.stroke([[7.5, 12.4, 1.0], [10, 16, 1.0], [16, 17.6, 1.1], [22, 16, 1.0], [24.5, 12.4, 1.0]]);   // neck
      m.B(18, 20, 15, 16);                                                        // shaft stub
      m.H(22, 8, 12).H(22, 19, 23);                                               // planks (wave 2: thin, see round 11)
      m.H(19, 9, 11).H(19, 20, 22);                                               // steps between the planks and the neck (the planks are now 6 rows below it)
    },
    enemies: [W('nibbler', 13, 16, 1), W('crabbit', 17, 16, -1), W('nibbler', 5, 9, 1), W('crabbit', 25, 9, -1), W('springle', 17, 9, -1), F('glimmer', 11, 5, 1), F('jellop', 3, 12, 1)],
    air: [[11.5, 8], [20.5, 8]],
    specials: [],
    hurry: 42,
  },
  // ------------------------------------------------------------------------------------------ 24
  {
    name: 'Pearl Oyster',
    concept: 'pictogram: an open oyster - arched upper shell, bowl below, a big pearl in the mouth; thunder bubbles',
    gaps: [],
    build(m) {
      m.poly([[6, 12], [6, 8.6], [10, 4.8], [16, 3.2], [22, 4.2], [26, 6.8], [26, 10], [22, 7.8], [16, 6.8], [11, 8.4], [8.4, 12]]);   // upper shell, lifted at the mouth
      m.poly([[6, 13], [8.4, 16.4], [12, 19.2], [19, 19.6], [24.5, 17.6], [26, 14.4], [22.5, 16], [16, 16.8], [11, 15.6], [8.4, 13.2]]);  // lower shell
      m.B(10, 14, 6, 8);                                                          // hinge (shell stays 4 columns clear of both walls)
      m.ell(20.5, 14.8, 2.2, 2.2);                                                // pearl
      m.T(11, 14, 19).T(11, 10, 12);                                              // tongue + inner ledge inside the mouth
      m.H(22, 7, 11).H(22, 20, 24);                                               // low shelves
    },
    enemies: [W('nibbler', 15, 3, 1), W('crabbit', 19, 4, -1), W('nibbler', 11, 4, 1), W('springle', 11, 16, 1), W('crabbit', 15, 11, 1), F('glimmer', 16, 7, 1), F('jellop', 24, 10, -1)],
    air: [[12, 9], [21.5, 10]],                                                 // wave 2 (L6): 11 -> 12, the left cluster sat inside the shell
    specials: ['thunder'],
    hurry: 40,
  },
  // ------------------------------------------------------------------------------------------ 25
  {
    name: 'Axolotl Face',
    concept: 'pictogram: the heroes\' own smile - round face, three gill frills per side, big eyes and a grin to walk on',
    gaps: [],
    build(m) {
      m.ell(16, 12, 8.4, 7.8).ell(16, 12, 6.4, 5.8, '.');                         // face ring
      m.stroke([[8.2, 9.2, 0.7], [5.6, 7.4, 0.7]]).stroke([[7.8, 12.8, 0.7], [5.2, 12.2, 0.7]]).stroke([[8.2, 16.6, 0.7], [5.6, 17.6, 0.7]]);   // left frills (tips stay 3 columns from the wall)
      m.stroke([[23.8, 9.2, 0.7], [26.4, 7.4, 0.7]]).stroke([[24.2, 12.8, 0.7], [26.8, 12.2, 0.7]]).stroke([[23.8, 16.6, 0.7], [26.4, 17.6, 0.7]]);   // right frills
      m.ell(12.5, 10.5, 1.5, 1.5).ell(19.5, 10.5, 1.5, 1.5);                      // eyes
      m.stroke([[11.4, 14.4, 0.7], [13.6, 16.0, 0.7], [16, 16.8, 0.7], [18.4, 16.0, 0.7], [20.6, 14.4, 0.7]]);   // smile
      m.H(22, 7, 11).H(22, 20, 24);                                               // planks (wave 2: thin, see round 11)
    },
    enemies: [W('nibbler', 14, 4, 1), W('crabbit', 16, 4, -1), W('springle', 12, 9, 1), W('springle', 18, 9, -1), W('nibbler', 5, 7, 1), W('nibbler', 25, 7, -1), F('glimmer', 14, 12, 1), F('jellop', 3, 3, 1)],
    air: [[16, 12.5]],
    specials: ['water'],                                                        // wave 2 (L4)
    hurry: 40,
  },
  // ------------------------------------------------------------------------------------------ 26
  {
    name: 'Temple Facade',
    concept: 'breather: a temple front - pediment roof, four storeys of slabs; storeys alternate between pillared cells and open galleries',
    gaps: [],
    build(m) {
      m.poly([[6.5, 5.5], [16, 2.6], [25.5, 5.5]]);                               // pediment (wave 2: apex at 2.6 - the old apex row sat on top of the roof and was a 1-tile wall under the ceiling)
      m.H(6, 6, 25).H(10, 6, 25).H(14, 6, 25).H(18, 6, 25).H(22, 8, 23);         // storey slabs (4 free columns along each wall)
      for (const c of [10, 15, 20]) m.B(7, 9, c, c + 1);                          // top storey: pillared cells
      for (const c of [9, 21]) m.B(15, 17, c, c + 1);                             // third storey: two pillars
      for (const c of [12, 18]) m.B(19, 21, c, c + 1);                            // ground storey: two pillars
    },
    enemies: [W('nibbler', 12, 10, 1), W('crabbit', 6, 14, 1), W('nibbler', 22, 14, -1), W('springle', 14, 18, 1), F('glimmer', 3, 2, 1), F('jellop', 26, 2, -1)],
    air: [[14, 9], [9, 12.5]],
    specials: [],
    hurry: 38,
  },
  // ------------------------------------------------------------------------------------------ 27
  {
    name: 'Ziggurat',
    concept: 'pictogram: a stepped pyramid with a raised base you can walk under and a shrine on top; water bubbles flow down the steps',
    gaps: [],
    build(m) {
      m.B(21, 21, 7, 24);                                                         // raised base slab (free passage underneath)
      m.B(17, 20, 9, 22).B(13, 16, 11, 20).B(9, 12, 13, 18);                      // three tiers above
      m.B(5, 8, 14, 17);                                                          // shrine block
      m.X(6, 7, 15, 16);                                                          // shrine doorway
    },
    enemies: [W('nibbler', 14, 5, 1), W('crabbit', 16, 5, -1), W('springle', 11, 13, 1), W('springle', 19, 13, -1), F('glimmer', 4, 6, 1), F('glimmer', 26, 8, -1), F('jellop', 6, 12, 1)],
    air: [[15.5, 3], [12.5, 8], [19.5, 8]],                                     // wave 2 (L3): 15 -> 9 (136 px below the ceiling = every bubble went to the ceiling); wave 3 (K6): 9.5/22.5 -> 12.5/19.5 and row 8, so the ceiling clusters (x 92 / 148) sit above the row-9 tier shoulders: a straight jump pops them (was 26 px from the nearest straight-jump spot)
    specials: ['water'],
    hurry: 38,
  },
  // ------------------------------------------------------------------------------------------ 28
  {
    name: 'Abyssal Eye',
    concept: 'pictogram: an almond eye - upper and lower lid arcs, ringed iris and pupil, lashes on the slopes',
    gaps: [],
    build(m) {
      m.stroke([[5.6, 12.4, 1.0], [8.5, 8.6, 1.0], [12, 5.8, 1.0], [16, 4.6, 1.0], [20, 5.8, 1.0], [23.5, 8.6, 1.0], [26.4, 12.4, 1.0]]);   // upper lid (corners keep 3 columns from the walls)
      m.stroke([[5.6, 12.4, 1.0], [8.5, 16.2, 1.0], [12, 19.0, 1.0], [16, 20.2, 1.0], [20, 19.0, 1.0], [23.5, 16.2, 1.0], [26.4, 12.4, 1.0]]);   // lower lid
      m.ring(16, 12.4, 5.6, 3.4);                                                 // iris
      m.ell(16, 12.4, 2.2, 2.2);                                                  // pupil
      m.stroke([[8.2, 7.6, 0.6], [6.4, 4.6, 0.6]]).stroke([[23.8, 7.6, 0.6], [25.6, 4.6, 0.6]]);   // lashes (only on the slopes: surfaces near the ceiling must stay free of walls)
      m.H(22, 7, 11).H(22, 20, 24);                                               // low shelves
      m.T(18, 2, 4).T(18, 27, 29);                                                // side ledges leading up to the lower lid
    },
    enemies: [W('nibbler', 12, 4, 1), W('crabbit', 18, 4, -1), W('springle', 21, 16, -1), W('nibbler', 9, 16, 1), F('glimmer', 5, 2, 1), F('glimmer', 21, 2, -1), F('jellop', 22, 10, -1)],
    air: [[16, 2.5], [9, 13]],
    specials: [],
    hurry: 36,
  },
  // ------------------------------------------------------------------------------------------ 29
  {
    name: 'The Crown',
    concept: 'pictogram: the Kraken King\'s crown - three points and a jewelled band; its body is 6+ rows above the floor, so ride the centre floor gap (or bounce on bubbles) to the top',
    gaps: [[14, 17]],
    build(m) {
      m.poly([[3.6, 19.5], [3.6, 9.5], [7, 5.4], [11.4, 11.4], [16, 2.6], [20.6, 11.4], [25, 5.4], [28.4, 9.5], [28.4, 19.5]]);
      m.X(15, 15, 6, 9).X(15, 15, 22, 25).X(15, 15, 14, 17);                      // jewel slots (one row high: no pockets)
    },
    enemies: [W('nibbler', 15, 4, 1), W('crabbit', 6, 6, 1), W('crabbit', 24, 6, -1), W('springle', 12, 7, 1), W('springle', 18, 7, -1), F('glimmer', 4, 2, 1), F('glimmer', 26, 2, -1), F('jellop', 10, 3, 1)],
    air: [[5.5, 4], [15.5, 2.5], [26, 4]],
    specials: ['fire', 'thunder'],
    hurry: 36,
  },
  // ------------------------------------------------------------------------------------------ 30
  {
    name: 'Kraken King',
    concept: 'boss arena: wide open water (the 6x6 Kraken starts top centre), two floor gaps that spit thunder bubbles, platforms at three heights to dodge ink',
    gaps: [[11, 13], [18, 20]],
    build(m) {
      m.T(21, 7, 11).T(21, 20, 24);                                               // low stones next to the pads
      m.T(17, 3, 8).T(17, 23, 28).T(17, 13, 18);                                  // mid ledges
      m.T(13, 8, 12).T(13, 19, 23);                                               // upper ledges (stay clear of the Kraken's 6x6 start box)
      m.T(9, 2, 6);                                                               // top-left perch: the only place to reach bubbles that drift to the ceiling on that side
    },
    enemies: [{ t: 'kraken', c: 14, r: 4, d: -1 }],
    air: [[6, 14], [21.5, 10]],
    specials: ['thunder'],
    hurry: 150,                                                                 // wave 2 (L1): was 60; the Kraken fight takes minutes, HURRY / Bonefin must not be guaranteed
  },
];
