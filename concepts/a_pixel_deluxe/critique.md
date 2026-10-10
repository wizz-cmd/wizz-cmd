# Concept A, PIXEL DELUXE: art-director critique (fresh eyes)

Reviewed: `gameplay.png`, `title.png`, `cast.png` as delivered by the first artist, plus the `#debug` sprite sheet at 5x and 3x crops of every hot spot.

## Scores BEFORE the fix (out of 10)

| Criterion | Before | One-line reason |
|---|---|---|
| Contemporary appeal | 6.0 | Light layer, bubbles and logo feel 2026. Ordered-dither everywhere, airbrushed sprites and heavy brick slabs feel 1994. |
| Faithfulness to CONCEPTS.md | 7.5 | Resolution, cast, moment, HUD, logo, 3 parallax layers, caustics, bloom, god-rays are all there. Misses: "no pillow shading", "anti-aliased clusters", "3-4 shade ramps" (it uses 6 plus dither), "~32 colours". |
| Readability | 6.0 | Fizz (pink) stands on and under pink brick; the Nibbler in its bubble is mud; the HUD is fine. The first-glance read of "where am I" is weak. |
| Cohesion | 6.5 | Title heroes (x2.5 detail) and gameplay heroes (x1) look like different games; cast sheet is x3, gameplay x2; logo is glossy 3D while the rest is flat-shaded. |
| Craft | 6.5 | Terrain and bubbles are well made. Heroes, background and HUD wall furniture are not at the same level. |

## The 5 biggest problems (most damaging first)

1. **The heroes are the weakest thing on screen.** Fizz and Pop are 64 px airbrushed blobs. The gills are a noisy cloud of pink pixels (reads as hair or thorns, not three feathery frills), the head is a flat oval with a dark-oval eye and no charm, the belly gets a white-pink bounce-light smudge, the tail is a paddle, and the shading is a speckle of ordered dither. Pop reads as a cyan frog or tadpole. A client's eye goes to the heroes first; right now they look less finished than the bricks. Fix: redesign both on the sculptor with a clean 3-4 step ramp, hard cluster edges, a clear three-frond gill fan, a bigger eye with a proper highlight, a smile, a finned tail.

2. **Ordered (Bayer) dither is used on almost every surface.** Water gradient, far towers, every brick, moss, character band edges: a screen-door pattern at 2x. This is the visual signature of 16-bit hardware and directly contradicts "modern high-detail pixel art" and "anti-aliased pixel clusters". It also makes the smooth light layer look like a CRT filter laid over a halftone. Fix: remove the Bayer from rampCol/gradients/sprites; use clean banded steps with organic (noise-warped) band edges and hand-placed texture clusters.

3. **The masonry out-shouts the cast.** Four huge slabs of mid-value rose brick with high-contrast mortar and dither noise occupy about 35 % of the playfield and share Fizz's hue and value. The player has to hunt for the pink hero on pink stone. The platform top (walkable-edge cue) is good; the platform body should recede: darker, less saturated, lower-contrast mortar, smooth slab-scale light falloff, with saturated accents kept for characters, bubbles and coral.

4. **Lighting and mood are flat murky blue.** The whole frame sits in one mid-navy value; god-rays are barely visible; tower silhouettes sit at the same value as the platforms; there is no value hierarchy (bright centre / dark edges / dark far layers) and no warm-vs-cool storytelling beyond the pink bricks. Fix: darker far layers, a visible surface light pool and rays at the top, stronger vignette, warm key accents around heroes and pickups, a clear cool/warm split.

5. **Logo, title and cast sheet: right idea, uneven execution.** (a) The logo has blown-out white cores on P/O, a glow haze that softens the pixel crispness, and a gradient that splits into too many hues. (b) On the title, the menu panel and the copyright line collide with the lurking Kraken King and the menu text is low-contrast periwinkle on navy. (c) The cast sheet characters are x3 while the game is x2 (visibly chunkier pixels), the logo header is larger than any character, the palette chips are unlabeled, and large areas are dead dark blue.

## Smaller notes (not fixed unless time allows)

- Far tower layer is flat blocks; the bridge arches read as noise.
- Nibbler inside the trapped bubble is a muddy yellow smear; Springle is the weakest enemy; the Bonefin is a thin outline.
- HUD "ROUND" label touches the wall edge; EXTEND niches are heavier than the info they carry.
- Bubble rims are lovely but all identical; no iridescent thin-film sweep.
- Per-theme palette is ~80 colours, not ~32 (documented, but it bites the retro promise).


---

# AFTER the fix (same reviewer, same criteria, after three render-and-look passes)

| Criterion | Before | After | What moved it |
|---|---|---|---|
| Contemporary appeal | 6.0 | 8.0 | Dither gone everywhere (clean banded clusters), calmer mauve masonry, ceiling light shaft with occluded rays, luma-weighted bloom, plankton motes. |
| Faithfulness to CONCEPTS.md | 7.5 | 8.5 | "No dither / anti-aliased clusters / hue-shifted ramps", three parallax layers with clean far towers, caustics, bloom, rays, bubbles all hold; Springle now really reads as a seahorse. Still over the ~32-colour guideline (documented). |
| Readability | 6.0 | 8.0 | Cast now out-saturates the terrain; heroes get a key light; coral polyps no longer compete with Fizz; trapped Nibbler is legible; title menu, Kraken and footer no longer collide. |
| Cohesion | 6.5 | 7.5 | One shading language (hard bands) from heroes to logo to terrain; title portraits and gameplay heroes share one design. Cast sheet still x3 vs x2 (labelled as presentation zoom). |
| Craft | 6.5 | 7.5 | Heroes redesigned and checked at 9x, 2x and 1x; far-tower cost 151 ms to 10 ms; light composite 12.5 ms. |

## What was fixed, by problem

1. Heroes: new chibi axolotl construction (round head, muzzle bump, glossy eye, three separated gill stalks with bulb-tipped barbs, real torso, curled finned tail); open-mouth shot, blink and jump poses; `fine` portrait mode for the title.
2. Dither: `bandIdx`, `rampCol`, water gradient, far towers, brick/moss noise and the cast backdrop no longer use the Bayer matrix.
3. Masonry: `#84506c` family (dusk mauve), lower mortar contrast, polyps desaturated, rays and caustics keep the tops lively.
4. Lighting: separate occludable ray layer, broad warm shaft through the ceiling gap, per-light `lift`/`add`, hero key lights, bloom threshold on luma, dust/speed lines above the light layer.
5. Logo/title/cast: logo bloom reduced (no more smeared "&" or blown "P"), Kraken lowered so crown and eyes read, shorter menu panel, footer on a floor plaque, particles behind UI; cast backdrop cleaned, brighter labels, palette chips with hex codes.

## Still weakest (honest)

- At 64 px the heroes are still the smallest bright objects; the bubble cluster and the thunder bubble out-shout them.
- Pop's gills read slightly tangled at 2x; both tails are a plain leaf paddle at title scale.
- Springle and Bonefin are the least charming enemies; the far-tower layer is still flat blocks (acceptable as a backdrop).
- The cast sheet is x3 where the game is x2.
- Palette is richer than ~32 colours (about 80 plus 12 water bands).
