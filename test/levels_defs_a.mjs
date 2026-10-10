// FIZZ & POP — test/levels_defs_a.mjs : rounds 1-10 (Coral Reef + Kelp Forest)
import { walker as W, flyer as F } from './levels_dsl.mjs';

export const ROUNDS_A = [
  // ------------------------------------------------------------------------------------------ 1
  {
    name: 'Reef Terraces',
    concept: 'symmetric zig-zag terraces, centre floor gap teaches the wrap; 3 Nibblers on separate tiers',
    gaps: [[14, 17]],
    build(m) { m.T(21, 9, 22).TS(17, 3, 11).T(13, 8, 23).TS(9, 3, 11).T(5, 11, 20); },
    enemies: [W('nibbler', 12, 21, 1), W('nibbler', 10, 17, -1), W('nibbler', 21, 13, -1)],
    air: [[15.5, 3]],
    specials: [],
    hurry: 45,                                                                  // wave 3: round 1 is the first thing a newcomer plays; was 32 (HURRY UP + Bonefin before a beginner has learnt move / jump / shoot / pop)
  },
  // ------------------------------------------------------------------------------------------ 2
  {
    name: 'Coral Staircase',
    concept: 'diagonal staircase climbing to the right, return shelf on top, left cascade; floor gap lands on the shelf',
    gaps: [[20, 23]],
    build(m) {
      m.T(21, 7, 13).T(17, 11, 17).T(13, 15, 21).T(9, 19, 25).T(5, 3, 22);
      m.T(9, 3, 10).T(13, 3, 9);
    },
    enemies: [W('nibbler', 13, 17, 1), W('nibbler', 17, 13, -1), W('nibbler', 22, 9, -1), W('nibbler', 5, 9, 1)],
    air: [[13, 3.5]],                                                           // wave 2 (L5): one gathering point over the top shelf (was two far apart: chains of at most 2)
    specials: [],
    hurry: 42,                                                                  // wave 3: was 34 (round 2 is still a learning round)
  },
  // ------------------------------------------------------------------------------------------ 3
  {
    name: 'Big Fish',
    concept: 'pictogram: an outlined fish you can climb into; ring top and belly are the platforms, eye is a floating block',
    gaps: [],
    build(m) {
      m.ell(17, 12.5, 10.5, 7.2).ell(17, 12.5, 8.3, 5.0, '.');       // body ring
      m.poly([[7.5, 12.5], [2.4, 6.6], [2.4, 18.4]]);                // tail
      m.poly([[4.6, 12.5], [2.4, 10.8], [2.4, 14.2]], '.');          // tail notch
      m.poly([[12, 6.5], [13.5, 3.2], [20.5, 3.2], [22, 6.5]]);      // dorsal fin
      m.B(10, 11, 22, 23);                                           // eye
      m.X(12, 13, 26, 27).X(14, 14, 3, 3);                           // mouth, tidy a stray tail cell
      m.T(13, 11, 17);                                               // inner shelf
      m.T(21, 8, 13).T(21, 20, 24);                                  // lower shelves
    },
    enemies: [W('nibbler', 12, 21, 1), W('nibbler', 21, 21, -1), W('nibbler', 15, 3, 1), W('nibbler', 13, 13, 1)],
    air: [[17, 9]],
    specials: [],
    hurry: 36,
  },
  // ------------------------------------------------------------------------------------------ 4
  {
    name: 'Pebble Alley',
    concept: 'Crabbit debut: five long lanes, one staggered hole each, crates in the corners - clear firing lines for pebbles',
    gaps: [],
    build(m) {
      m.T(21, 7, 24);                                                             // bottom lane (open at both ends)
      m.T(17, 2, 11).T(17, 16, 29);                                               // each lane has one 4-wide hole, staggered
      m.T(13, 2, 21).T(13, 26, 29);
      m.T(9, 2, 5).T(9, 10, 29);
      m.T(5, 2, 16).T(5, 21, 29);
      m.B(19, 20, 22, 23).B(15, 16, 3, 4).B(11, 12, 27, 28).B(7, 8, 3, 4).B(3, 4, 27, 28);   // crates in the lane corners: cover for the crabbits
    },
    enemies: [W('crabbit', 6, 13, 1), W('crabbit', 18, 17, -1), W('nibbler', 12, 21, 1), W('nibbler', 22, 9, -1)],
    air: [[15, 12]],
    specials: [],
    hurry: 36,
  },
  // ------------------------------------------------------------------------------------------ 5
  {
    name: 'Sea Fan',
    concept: 'pictogram: four concentric coral-fan arcs on a rock; enemies drift down the arcs, first thunder bubbles',
    gaps: [],
    build(m) {
      for (const r of [4.6, 8.6, 12.6, 16.6]) m.ring(16, 20.5, r + 0.62, r - 0.62);
      m.X(21, 24, 2, 29);
      m.X(1, 20, 2, 5).X(1, 20, 26, 29);                                          // free drop channels along both walls: outer arcs stop 4 cols short
      m.B(22, 24, 13, 18);
    },
    enemies: [W('crabbit', 16, 7, -1), W('crabbit', 14, 15, 1), W('nibbler', 11, 12, 1), W('nibbler', 19, 8, -1), W('nibbler', 14, 22, 1)],
    air: [[15.5, 6.5]],                                                         // wave 2 (L6): was 5.5, bubbles sat inside the apex coral block
    specials: ['thunder'],
    hurry: 38,
  },
  // ------------------------------------------------------------------------------------------ 6
  {
    name: 'Kelp Fronds',
    concept: 'breather: three kelp strands of chunky leaf ledges zig-zagging up, two floor gaps between them',
    gaps: [[11, 13], [18, 20]],
    build(m) {
      const strand = (rows, cols, w) => rows.forEach((r, k) => m.T(r, cols[k], cols[k] + w - 1));
      strand([21, 17, 13, 9, 5], [8, 3, 6, 3, 7], 5);
      strand([20, 16, 12, 8, 4], [13, 17, 12, 16, 13], 5);
      strand([21, 17, 13, 9, 5], [20, 24, 21, 25, 22], 5);
    },
    enemies: [W('nibbler', 8, 13, 1), W('nibbler', 18, 16, -1), W('nibbler', 22, 13, 1), W('nibbler', 8, 5, -1)],
    air: [[15.5, 10]],
    specials: [],
    hurry: 30,
  },
  // ------------------------------------------------------------------------------------------ 7
  {
    name: 'Open Water',
    concept: 'Jellop debut: wide-open sea with staggered floating islands, lots of room for diagonal bouncing',
    gaps: [],
    build(m) {
      m.T(21, 9, 13).T(21, 19, 23);
      m.T(17, 3, 7).T(17, 14, 18).T(17, 25, 28);
      m.T(13, 9, 13).T(13, 19, 23);
      m.T(9, 3, 7).T(9, 14, 18).T(9, 25, 28);
      m.T(5, 7, 11).T(5, 21, 25);
    },
    enemies: [F('jellop', 6, 11, 1), F('jellop', 22, 7, -1), F('jellop', 15, 13, 1), W('nibbler', 10, 13, 1), W('nibbler', 15, 17, -1)],
    air: [[10, 3.5], [22, 3.5]],
    specials: [],
    hurry: 34,
  },
  // ------------------------------------------------------------------------------------------ 8
  {
    name: 'Sea Turtle',
    concept: 'pictogram: a turtle seen from above - grooved shell, head on top, four flippers; water bubbles flow down its back',
    gaps: [],
    build(m) {
      m.ell(16, 10.8, 7.0, 6.4);                                                  // shell
      m.ell(16, 4.2, 2.7, 2.4);                                                   // head
      m.B(5, 6, 14, 17);                                                          // neck
      m.X(3, 3, 14, 14).X(3, 3, 17, 17);                                          // eyes
      m.stroke([[10.0, 8.2, 2.0], [7.2, 6.6, 1.5], [5.6, 6.0, 1.0]]);            // front flippers (tips stay >= 3 cols from the walls: drop channels)
      m.stroke([[22.0, 8.2, 2.0], [24.8, 6.6, 1.5], [26.4, 6.0, 1.0]]);
      m.stroke([[10.5, 14.8, 1.8], [7.6, 16.4, 1.4], [6.0, 17.0, 1.0]]);          // back flippers
      m.stroke([[21.5, 14.8, 1.8], [24.4, 16.4, 1.4], [26.0, 17.0, 1.0]]);
      m.B(17, 18, 15, 16);                                                        // tail
      m.X(8, 9, 13, 14).X(8, 9, 17, 18).X(11, 12, 15, 16).X(14, 15, 12, 13).X(14, 15, 18, 19);   // scute holes
      m.T(21, 8, 13).T(21, 18, 23);                                               // low shelves
    },
    enemies: [W('nibbler', 10, 21, 1), W('nibbler', 19, 21, -1), W('crabbit', 9, 6, 1), F('jellop', 5, 10, 1), F('jellop', 24, 12, -1)],
    air: [[7.5, 3], [24.5, 3]],
    specials: ['water'],
    hurry: 38,
  },
  // ------------------------------------------------------------------------------------------ 9
  {
    name: 'Kelp Tangle',
    concept: 'dense thicket: irregular 1-thick ledges only 3 rows apart, short runs, very little open floor',
    gaps: [],
    build(m) {
      m.H(22, 8, 12).H(22, 17, 22);
      m.H(19, 3, 7).H(19, 14, 19).H(19, 24, 28);
      m.H(16, 9, 13).H(16, 21, 26);
      m.H(13, 3, 8).H(13, 15, 20).H(13, 25, 29);
      m.H(10, 8, 13).H(10, 22, 27);
      m.H(7, 3, 7).H(7, 14, 19).H(7, 25, 29);
      m.H(4, 9, 13).H(4, 21, 24);
    },
    enemies: [W('nibbler', 17, 19, 1), W('crabbit', 9, 16, -1), W('nibbler', 16, 13, -1), W('crabbit', 8, 10, 1), W('nibbler', 15, 7, 1), F('jellop', 26, 2, -1)],
    air: [[11, 14], [23, 8]],
    specials: [],
    hurry: 40,
  },
  // ------------------------------------------------------------------------------------------ 10
  {
    name: 'Seahorse',
    concept: 'pictogram: a seahorse - the snout, S-curved body and curled tail; left rock ledges climb to the snout, free drop channels everywhere',
    gaps: [],
    build(m) {
      m.stroke([[8.2, 7.2, 0.8], [13.0, 6.6, 0.9]]);                              // long tube snout
      m.stroke([[16.6, 6.2, 2.7], [16.4, 10.0, 1.5], [14.4, 13.6, 2.9], [15.6, 17.0, 1.7]]);   // head, neck, pot belly
      const cx = 21.2, cy = 17.6, pts = [];                                       // curled tail: an inward spiral
      for (let a = 190; a >= -170; a -= 20) { const t = (190 - a) / 360, r = 4.6 - 3.0 * t, rad = (a * Math.PI) / 180; pts.push([cx + r * Math.cos(rad), cy + r * Math.sin(rad), 0.85]); }
      m.stroke([[15.6, 17.0, 1.4], ...pts]);
      m.set(5, 15, '.');                                                          // eye
      m.T(21, 8, 13).T(17, 2, 4).T(13, 2, 4).T(9, 2, 4);                          // rock ledges: stairs up the left side (3-col drop channel to the body)
      m.H(15, 8, 10);                                                             // stepping stone in front of the belly
    },
    enemies: [W('nibbler', 15, 4, -1), W('crabbit', 9, 6, 1), W('nibbler', 3, 13, 1), W('crabbit', 8, 15, 1), F('jellop', 22, 2, -1), W('nibbler', 11, 21, 1)],
    air: [[10, 4]],
    specials: ['fire'],
    hurry: 42,
  },
];
