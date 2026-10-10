# FIZZ & POP — three contemporary look concepts (lead designer's briefs)

The game (mechanics, levels, 32×26 tile grid, 256×224 logical playfield, entity sizes) stays exactly as
it is in v1.0. Only the LOOK changes. Each concept is rendered as mockups so the client can choose.
Two concepts are clearly NOT retro; exactly one (A) is a retro-gaming look, but a modern one.

## Shared rules for all mockups

- **Procedural only, like the real game:** one standalone HTML page per concept that draws everything
  with Canvas 2D (or WebGL) code — no images, no external fonts, no network. A system font stack
  (`system-ui, -apple-system, "Segoe UI", sans-serif`) is allowed ONLY for small UI text; logos and big
  titles are drawn procedurally (paths/shapes). Write the drawing code as reusable per-entity functions
  (drawPlayer, drawEnemy(type, state), drawBubble(kind), drawPlatformTile, drawBackground, drawHud …):
  the chosen concept will later become the new GFX module, so the mockup is also a feasibility proof.
- **Same moment in all three concepts** (so the client compares looks, not compositions). Use the REAL
  round-1 map: load `../src/00_shared.js` and `../src/30_levels.js` and read `LEVELS[0].map`
  (26 rows × 32 cols, `#` = block; tile (c,r) → logical x = 8c, y = 16 + 8r; logical screen 256×224).
  Place, snapping to the nearest real platform surface where needed:
  - Fizz (P1) standing on the floor around tile (5,23), facing right, mid-shot (mouth open), a freshly
    blown bubble ~14 logical px in front of her.
  - Pop (P2) mid-jump around tile (24,15), facing left.
  - A Nibbler trapped in a bubble around (14,9) — trap stage 1 (yellowish warning tint).
  - An ANGRY Crabbit walking on a platform around (20,11).
  - A Jellop flying around (9,6).
  - 4–5 empty bubbles clustered under the ceiling around the attractor (15.5, 2).
  - A sushi food item on a platform around (8,17) with a “+2000” score popup above it.
  - A thunder special bubble rising around (27,20).
  - HUD: 1UP 012300 · HI SCORE 050000 · 2UP 008700, round “01”, lives P1 = 2 icons, P2 = 1 icon,
    EXTEND letters: P1 has E and X lit.
- **Outputs** (to `concepts/<key>/`): `gameplay.png` 1024×896 (= 4× logical, 8:7), `title.png`
  1024×896 (logo “FIZZ & POP”, tagline “The Sunken Tower”, Fizz & Pop, menu 1 PLAYER / 2 PLAYERS /
  HOW TO PLAY / HI-SCORES / SOUND ON, hi score), `cast.png` 1600×600 (big lineup: Fizz, Pop, Nibbler,
  Crabbit, Jellop, Springle (seahorse!), Glimmer, Bonefin, Kraken King, and bubble states: empty,
  trapped-with-enemy, thunder, fire, water; plus one food and one power-up), `palette.json`
  (`[{name, hex, role}]`, 6–10 entries), `notes.md` (how it is drawn, which techniques, per-frame cost
  estimate, risks). Render with Playwright (createRequire, Chromium preinstalled, never install).
- **Cast identities to keep** (from SPEC): Fizz = pink axolotl, Pop = aqua/lavender axolotl (frilly
  gills, big eyes, tail); Nibbler = gold clockwork fish on legs with a cog; Crabbit = orange crab with
  raised pincers; Jellop = violet jellyfish; Springle = green SEAHORSE on a spring tail; Glimmer =
  cobalt anglerfish with a yellow lantern; Bonefin = skeletal ghost fish; Kraken King = crowned purple
  octopus. Angry = crimson + steam cue. Readability first: the player must spot Fizz, threats and
  bubbles instantly; facing direction must be obvious.
- Quality bar: this is a pitch to a client. It must look like a real, polished, contemporary game —
  not programmer art. Look at your PNGs with the Read tool and critique them hard.

## Concept A — “PIXEL DELUXE” (the retro one, but 2026-modern)

Modern high-detail pixel art in the spirit of today's indie pixel games (dense pixel art + modern
lighting), not an 8-bit console.
- **Resolution:** double density — internal 512×448, tiles 16×16, characters 32×32 (Kraken 96×96),
  integer-upscaled ×2 for the 1024×896 output (crisp, no smoothing). Sub-pixel smooth motion allowed.
- **Pixel craft:** hue-shifted shading (cool shadows, warm highlights), selective outlines (dark only on
  the outside, coloured inner lines), anti-aliased pixel clusters, 3–4 shade ramps per material, no
  pillow shading. Rich per-theme palette (~32 colours).
- **Light:** a dynamic light layer on top: bioluminescent point lights (Glimmer's lantern, glowing
  bubbles, thunder bubble, food sparkle), soft god-rays from the surface above, a gentle vignette, colour
  grading per theme. Bloom = blurred additive copy of the bright pixels (render the light layer at low
  res, upscale smoothly, add).
- **Depth:** 3 parallax background layers (far tower silhouettes, mid coral/kelp, near drifting
  particles), caustic light patterns crawling over the platform tops.
- **Juice:** squash & stretch, dust puffs, bubble wobble, droplets on pop, screen-shake on chains.
- **Type/HUD:** a detailed 2× pixel font with gradient + 1 px shadow; HUD in rounded pixel panels.
- Palette direction (coral-reef theme): deep water #0d1b3a → #13315c, coral #ff6f91, peach #ffb38a,
  sea-foam #7ff0d4, bubble aqua #8be9ff, gold #ffd166, ink #1a0f2e.

## Concept B — “JELLY TOY” (soft 3D, glossy vinyl-toy diorama)

A bright, tactile, contemporary casual-game look: everything looks like glossy soft-vinyl / jelly toys
in a sunny aquarium diorama. Resolution-independent vector art, crisp on any screen.
- **Shapes & materials:** rounded, chunky, friendly forms; platforms are pill-shaped rounded slabs
  (candy coral with a soft bevel, top highlight, darker underside, soft contact shadow below); materials:
  glossy candy (coral, sand-clay), translucent jelly (Jellop, bubbles), matte clay (Crabbit shell).
- **Light model:** one soft key light from top-left, specular highlight “windows” on glossy parts, rim
  light from below in water colour, soft ambient-occlusion contact shadows (blurred ellipses).
- **Bubbles:** real soap bubbles — thin rim, mostly transparent body, iridescent thin-film sheen
  (cyan→magenta→gold sweep along the rim), a bright window highlight; trapped enemies visibly inside.
- **Characters:** smooth vector axolotls with big glossy eyes (two highlights), soft gradients, wobbly
  frills; designed for procedural squash & stretch and secondary motion.
- **World:** bright aquarium gradient (sunny turquoise top → deeper blue bottom), dancing sun caustics,
  out-of-focus bokeh bubbles and soft-blurred background reef layers (tilt-shift diorama feel).
- **Type/UI:** rounded heavy display letters for the logo (procedural, puffy, glossy, outlined); UI as
  pill buttons and soft cards; HUD as small rounded chips (score chips, life hearts as tiny axolotl
  heads).
- Palette direction: aqua #3ed3d8, deep #1d3b6e, coral #ff7a8a, lemon #ffd45c, lilac #a98bff,
  mint #7fe3b0, cream #fff4e6, ink #24324f.

## Concept C — “ABYSS GLOW” (bioluminescent neon, minimal)

The deep sea at night: everything is made of living light on near-black. Elegant, minimal,
high-contrast, very contemporary indie aesthetic (luminous line art, glow, particles).
- **Shapes:** geometric and outline-driven — luminous 2–3 px strokes with soft inner gradients;
  platforms are glowing crystalline/coral edges (bright top edge line, faint fill, subtle internal
  pattern), not filled bricks. Characters are luminous outlined creatures with glowing gills and eyes;
  each enemy type owns one neon hue AND a distinct silhouette (colour-blind safe).
- **Light:** additive blending, bloom (blurred glow layers rendered at reduced resolution), light trails
  behind moving creatures, soft halo around bubbles, shockwave rings on pops; chain reactions light up the
  whole screen. Everything gently pulses (breathing light).
- **World:** black-blue gradient with drifting plankton specks, faint depth fog, a few huge distant
  glowing jellyfish silhouettes far in the background.
- **Type/UI:** thin, wide-tracked geometric sans drawn procedurally as strokes (elegant), minimal HUD
  (thin numbers top-left/top-right, tiny glowing dots for lives, EXTEND as small glowing letters).
- Palette direction: void #05070f, abyss #0b1a33, cyan #3cf2ff, magenta #ff3ea5, lime #b6ff3b,
  amber #ffb23e, violet #8a5cff, white-hot #eaffff.
