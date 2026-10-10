# Concept A, PIXEL DELUXE: how it is drawn

Modern high-density pixel art with a real light layer on top. It keeps the retro pleasure (crisp chunky pixels,
hue-shifted ramps, readable silhouettes) but nothing about it is an 8-bit console look: 4x the pixel budget per
sprite, no ordered dither anywhere, clean hand-painted colour clusters, a dynamic light layer, bloom, god-rays,
caustics and parallax depth.

Everything is code: `mockup.html` + `mockup.js` draw all views with Canvas 2D (no images, no fonts, no network).
Views are hash-routed: `#gameplay`, `#title`, `#cast` (plus `#hero` = Fizz/Pop poses at 9x, 2x and 1x, `#debug` = every sprite at 5x,
`#logo`). The real round-1 map is read from `../../src/30_levels.js` (`LEVELS[0].map`); `render.mjs` renders the PNGs with
Playwright and writes `palette.json`. Console errors: 0 on all three views.

## Resolution and scaling

| Layer | Resolution | Scaling to output |
|---|---|---|
| Pixel layer (everything sprite-like) | 512x448 internal, tiles 16x16, characters 32x32 (box), Kraken 96x96 | integer x2, nearest, to 1024x896 |
| Light layer (ambient, lights, rays, bloom) | 1/4 of the output (256x224) | smooth (bilinear), 3 full-res passes |
| Cast sheet | 534x200 internal | integer x3 (96 px characters, 288 px Kraken), cropped to 1600x600 (presentation zoom; gameplay is x2) |

Character sprite canvases are 40x40 with the 32x32 box at (4,8), so gills, steam and lantern stalks may overshoot the box.
The title portraits of Fizz and Pop use the same sculptor with `scale: 2.5` and the `fine` gill option (more, thinner barbs):
finer detail, same pixel size, not scaled pixels.

## The techniques

1. **Pixel sculptor** (`sculpt()` in mockup.js). Characters are not hand-typed grids and not smoothed vectors:
   each is a list of parts (shaded ellipsoids, tapered capsules, bevelled polygons, flat decals). Every part gets an analytic
   surface normal; one directional light (top-left, in front) is dotted with it and the result is quantised into **hard bands**
   of a 6-step hue-shifted ramp (cool violet shadows, warm yellow highlights, `makeRamp`). The bands are clean shape-following
   clusters: **no ordered dither at all**; a 2-pass orphan clean-up removes single-pixel noise. On top of that:
   - **coloured inner lines**: where part B overlaps part A, B's shadow-side boundary pixels take the ramp's deep colour;
   - **selective outer outline**: dark ink tinted by the neighbouring material, lighter on the lit side, only on the outside;
   - **cast shadows** of the head on the body, **top rim light** from the surface, a **cool bounce tint** on downward-facing shadow
     edges (a tinted shadow colour, never brighter than the base);
   - squash and stretch, lean (rotation), mirroring: all are parameter changes of the part list, re-shaded afterwards, so the light never flips.
2. **Heroes (redesigned in the AD pass).** Chibi axolotls: big round head with a muzzle bump (facing direction reads at a glance),
   big glossy eye with two highlights and a coloured lower crescent, cheek blush, smile or open "shot" mouth, a real torso with a lighter
   belly, and a tail that curls up behind with a light crest fin. Gills are **three separated stalks** with a barb pair ending in glowing
   bulbs (plus one darker far-side stalk): saturated red-magenta with pale-pink tips for Fizz, violet with lilac tips for Pop. Pose parameters:
   `mouth, bob, jump, walk, sway, blink, arm, tail, gillOff, barbs, fine`; the jump pose has trailing legs, a raised far arm, a lifted tail
   and drooping gills.
3. **Autotiled masonry** (`buildTerrain`): the REAL map becomes a 512x448 mask; rounded corners, dripping undersides, 16x8 brick
   courses with chiselled bevels, three close stone ramps (dusk mauve, violet, rose), sea-foam moss lips (the walkable-edge cue),
   fossils, glowing barnacles, coral clumps on platform ends, dark ink outline (teal under moss). The masonry is deliberately
   **desaturated and darker than the cast** so heroes, bubbles and enemies read first. Texture is low-frequency cluster noise
   thresholded into hard steps; no per-pixel noise and no Bayer pattern. A soft contact shadow (down-chain blur) sits under every slab.
4. **Three parallax layers**: far = sunken tower silhouettes (flat-banded flanks, lit cornices, crenellations, dark arched openings,
   ruined bridge) under cool haze, drawn with rectangles (10 ms); mid = kelp with leaf blades, sea fans, tube sponges and fish schools
   (sculpted, dark, desaturated); near = marine snow and tiny rising bubbles, with exclusion zones so they never sit on a bubble or sprite.
   Water is **12 hue-stepped bands whose edges are warped by low-frequency noise** (painted, not dithered).
5. **Bubbles** (`drawBubble`): per-pixel rim (aqua on the lit side, warm magenta shift on the shadow side), refraction crescent,
   specular arc, a second faint reflection arc bottom-right, glints, cached by (size, tint, wobble). Tints for trap stage 0/1/2, thunder,
   fire, water, letter (tints are kept low-alpha so contents never turn muddy); the trapped enemy is drawn inside on a dark violet backing
   disc so it stays readable; special icons are sculpted.
6. **Light layer** (`compositeLit`): (a) multiply map = depth ambient + diagonal warm/cool grade + vignette, with point lights punching
   through; (b) additive glow map = god-ray layer + coloured point lights + **bloom** (scene to 1/4 res, luma-weighted threshold 214 so pale
   pinks do not bloom and only true emissives do, 3-level down-chain, up-chain, add). Lights carry separate `lift` (multiply) and `add`
   (additive) scales: heroes get a **key light** that lifts them out of the dark without washing them in colour. The god-rays live on
   their own 1/4-res layer so the **masonry occludes them** (light falls between the slabs, not through them); one broad warm
   **shaft pours through the ceiling gap** onto the bubble cluster, the hero light of the room. Only three full-resolution passes:
   scene x2, multiply, add.
7. **Caustics**: two moving sine-ridge webs, quantised to 3 pixel levels, masked onto the sunlit band below the moss.
8. **Font and logo**: 5x7 source glyphs, Scale2x/EPX smoothing to 10x14 (diagonals, round corners), hard-banded vertical
   gradient, 1px outline, 1px shadow. The **logo** is stroke paths (F I Z Z & P O P) to a mask, an inside-distance field, puffy
   tube normals, the same banded-ramp shader, 5px extruded depth and an ink outline; on the title it is bloomed only lightly so its
   pixels stay crisp.
9. **Juice shown in the stills**: squash/stretch + lean (Pop mid-jump with speed lines, Fizz mid-shot), dust puffs (drawn after the
   light layer so they stay light), droplets at the mouth, bubble wobble, shake marks on the trapped bubble (about to burst), sideways angry
   steam, thunder arcs, sparkles, bioluminescent plankton motes. Not visible in stills but supported: screen-shake (offset the pixel layer
   before the x2 blit), pop droplets, chain flashes (extra lights).

## Palette

`palette.json`: 10 anchor colours (deep water, reef blue, dusk mauve, coral, sea-foam, bubble aqua, gold, ink, lavender, crimson);
`Dusk Mauve #84506c` is the masonry and is new in the AD pass. Each material derives a 6-step ramp from one base colour, used as 4-5 hard
bands. The Coral Reef theme uses about 13 ramps (about 80 colours) plus 12 water bands, so it is richer than the "~32 colours" guideline;
merging the three stone ramps, the polyp ramps and quantising the water to 6 bands brings it to about 55. Crimson is reserved for
danger (angry enemies, warning bubbles) so threats always read. Hot pink is reserved for Fizz and the logo (coral polyps are toned down).

## Per-frame cost (measured, then projected)

Measured in headless Chromium on 4 shared CPU cores with **software canvas** (no GPU), i.e. a pessimistic upper bound:

| Item | ms | In the real game |
|---|---|---|
| Sculpt one 32x32 sprite frame | 2.1 | baked once at `GFX.init()`: ~130 frames (+ flipped copies) = ~0.3 s here, ~0.1 s on a desktop |
| Sculpt Kraken 96x96 | 15.6 | once |
| Terrain bake per level (mask, bricks, moss, outline, clumps) | 78 | once per round, 3 MB with its caches |
| Far towers (rectangles, not per pixel) | 9.6 | once per theme |
| Water bands (12 bands, noise-warped edges) | 20 | once per theme |
| Logo build | ~100 (first artist's measurement, unchanged code) | once |
| 30 sprite blits | 0.07 | per frame |
| Bubble draws (20) | 0.8 | per frame (cached sprites) |
| Marine snow + tiny bubbles | 1.2 | per frame |
| Caustics as written (pixel loop) | 7.3 | replace with two pre-baked tileable 128x128 textures scrolled and masked: < 0.5 |
| HUD, uncached text | 2.8 | cache each string canvas, redraw on change: ~0.1 |
| **Light composite** (3 full-res passes + 14 lights + masked rays + shaft + bloom) | **12.5** | GPU canvas: ~1-2 ms; can run the light layer at 30 Hz |
| Bloom pyramid only | 1.0 | threshold readback is the one GPU stall risk (see risks) |

Steady-state frame budget: about **3-4 ms on a GPU-accelerated canvas**, about **22 ms on pure CPU raster** (then drop bloom/rays or
update the light layer every 2nd frame). Memory: sprite atlas ~1.7 MB (130 frames x 40x40x4, plus flipped), terrain + shadow +
caustic mask ~3 MB per level, light canvases 0.7 MB, so < 10 MB. A cold full render of any of the three views (everything baked
from scratch) takes 0.3-0.6 s in this environment.

## Turning it into the GFX module (SPEC section 3.1)

- `GFX.init()` = `initMaterials()` + bake every frame through `charSprite(kind, pose)` into one atlas; names map to (kind, pose) rows
  (`p1_walk` = fizz + walk phase k/4, `nibbler_angry` = nibbler + `{angry:1}` ...). `GFX.draw(ctx,name,frame,x,y,opts)` = `blit`
  with a x2 transform (logical coordinates stay 256x224; the canvas becomes 512x448). `white:true` = flat-white shade.
- `GFX.levelCanvas` = `buildTerrain(map)` (now 512x416); `GFX.theme(i)` = a ramp set (stone, moss, towers, kelp, coral, water
  band colours); `GFX.text` = `textCanvas` (`scale` maps to EPX level); `GFX.drawLogo`, `GFX.sheet` (= `#debug`) exist already.
- Public entry points already shaped for it: `drawPlayer`, `drawEnemy(type,state)`, `drawBoss`, `drawFood`, `drawPowerup`,
  `drawBubble(kind)`, `drawBackground`, `drawPlatforms`, `drawHud`, `drawLogo`, `compositeLit` (object `GFX_A` at the end of the file).
- Main needs a render path change only: draw the pixel layer to a 512x448 canvas, then call `compositeLit` into the visible canvas
  (pass `rayMask: levelCanvas` so the slabs occlude the rays).

## Risks

1. **Content volume**: 6 themes x (bg layers, ramps, props) and ~130 animated frames. The sculptor makes poses parametric
   (walk phase, squash, angry), but every walk cycle still needs tuning by eye.
2. **Tiny gills and tails**: the heroes' feathery gills are 1-2 px features at 32x32; they read in stills but will flicker if the
   stalk angles animate by sub-pixel amounts. Animate gills in 1-px steps or pre-bake 4 sway frames.
3. **Small and phone screens**: 32 px sprites drawn at fractional scales blur. Keep integer scales (x1 on a 360 px phone is tiny),
   keep `image-rendering: pixelated`, and let the light layer carry the polish.
4. **GPU stalls**: the bloom threshold uses `getImageData` on a 128x112 canvas; in production use a blend-mode trick or WebGL.
5. **CPU-only devices**: ~22 ms/frame; needs a quality switch (no bloom/rays, light layer at 30 Hz).
6. **Band-edge swim**: the water bands' warped edges are screen-anchored. The playfield is static so it is fine, but the round-to-round
   scroll must use world-anchored noise or the bands will swim.
7. **Outline readability in the dark themes**: ink outlines vanish on the near-black abyss (rounds 26-30); the top rim light and
   a brighter bounce tint must carry the silhouette there.
8. **Palette discipline**: more colours than a strict retro look; if the client wants a hard cap, quantise ramps per theme.
9. **Bubble transparency over busy backgrounds** can hurt enemy readability; mitigated by the dark backing disc, low-alpha tints and
   keeping the far layers low-contrast.

## Critique passes (what changed)

**First artist, pass 1-3.** Blown-out bloom, hazy grade, sushi that read as a burger, collapsed Kraken tentacles, grey Springle spring,
tombstone windows, colliding cast labels, muddy trapped Nibbler, washed thunder bolt, bloom/lights lifting the multiply map, 212 ms light
composite (rebuilt to 3 full-res passes), brick patchwork, steam hitting the platform above, P1/P2 hard to find (floating tags), sushi popup
colliding with a platform. All fixed then.

**Art-director pass (fresh eyes), see `critique.md` for the scores.** The five biggest problems and what was done:
1. *Heroes were airbrushed blobs with a noisy gill cloud.* Redesigned Fizz and Pop (chibi proportions, separated gill stalks, big glossy eye,
   curled finned tail, cleaner bands, no belly bounce smudge), jump pose reworked, a hero key light that does not wash colour.
2. *Ordered dither everywhere.* Removed from sprites, terrain, moss, far towers, water and the cast backdrop; replaced by hard clustered
   bands and noise-warped band edges.
3. *Masonry out-shouted the cast and shared Fizz's hue.* Re-ramped to desaturated dusk mauve, lower mortar contrast, coral polyps toned down.
4. *Flat murky lighting.* Far towers rebuilt as clean banded silhouettes; rays moved to an occludable layer; a warm shaft through the ceiling
   gap lights the bubble cluster; luma-weighted bloom; bioluminescent plankton motes; dust and speed lines moved above the light layer.
5. *Logo, title, cast.* Title: Kraken lowered so the crown and glowing eyes read under a shorter menu, footer moved onto a floor plaque,
   particles moved behind the UI, logo bloom reduced; cast: clean backdrop, brighter labels, palette chips with hex codes, Springle redrawn
   with a bent-head tube snout, pot belly and dorsal fan so it reads as a seahorse.

Still weakest: the heroes are still the smallest bright thing on screen at 64 px (the bubble cluster and thunder bubble out-shout them);
the Pop gills read slightly tangled at 2x; the cast sheet is x3 while gameplay is x2 (presentation only); the far-tower layer is flat
(fine as a backdrop); Springle and Bonefin are the least charming enemies.

## Files

`mockup.html`, `mockup.js` (all drawing code), `render.mjs` (Playwright, run `node render.mjs [gameplay|title|cast]`),
`gameplay.png` (1024x896), `title.png` (1024x896), `cast.png` (1600x600), `palette.json`, `notes.md`, `critique.md`.
