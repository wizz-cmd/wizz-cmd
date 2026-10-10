# Concept C - ABYSS GLOW (bioluminescent neon, minimal)

Open `mockup.html#gameplay | #title | #cast` (animated) or add `?still` to freeze a frame (`?still&t=7.5` renders another moment,
`?chain=0.3` previews a chain-reaction frame on #gameplay). `node render.mjs [gameplay|title|cast]` writes the PNGs with Playwright
(zero console errors). `parts/*.js` are the readable sources, `build.sh` concatenates them into the single `mockup.js`.
`#dev` is the design lab used for close-ups (not linked in the nav). Everything is Canvas 2D: no images, no fonts, no `fillText`,
no network. The only text drawn by the browser is the three nav links of the page chrome.
`critique.md` holds the art-director critique (scores before / after) of the first delivery and what was fixed.

## The look in one paragraph
The deep sea at night, where everything is made of living light. Near-black water with a few soft god-rays and three huge, clearly readable
distant jellyfish; every creature is a luminous contour (white-hot core line, coloured halo) around a dark translucent body. The twins are the
only creatures with LIT bodies (a tinted fill plus an inner "light organ" glow in the chest and head), so they are always the brightest,
most volumetric shapes on screen; enemies stay hollow contours, each with one neon hue and one silhouette. Platforms are azure crystal slabs
built from the real round-1 map: bright smooth top edge, faceted translucent body (each facet tinted separately, dark patches left on purpose),
thin light columns hanging from every top face, crystal shards under the slabs and at the ends of the tops, rose sea-fan tufts. Bubbles are real
soap bubbles: a thin lit rim, a near-invisible body, a thin-film colour cap pooled at the top-left, a refracted caustic crescent at the bottom-right,
a ring of light around them, the captive visible inside. The wordmark is hollow glass tubing with liquid light inside, and the HUD is thin
wide-tracked stroke lettering. It is clearly not retro: nothing is pixel-aligned, nothing is flat, every line is resolution independent.

## How it is drawn
**Coordinates.** The game's 256x224 logical space is untouched. Gameplay/title render at S = 4 (1024x896); the cast sheet uses its own
pixel space. Entities are authored in a 16x16 unit box (Kraken 48x48), drawn through `placeSprite(ctx, {x, y, k, face})` with
k = output px per unit. Players are drawn at k = 5.9 and enemies at 4.8 (a "luminous overdraw" of 1.2-1.35 x the 16 px hitbox, gills/tail/
claws overhang); the hitboxes do not change. Stroke width is `2.1 * (k/4.8)^0.45` px, so lines stay elegant from 1x to hero size.

**The one primitive: `neon(ctx, path, colour, w, opts)`.** Two wide faint halo strokes + a coloured core + a white-hot centre line, all
`lighter` (additive); optional gradient so the top-left rim is hotter (key light) and `cap:'butt'` for edges built from many segments (no beads
where round caps overlap). `body()` gives a creature its dark occluding fill (so it reads as a solid in front of the lit world), a hue-tinted
gradient, an optional soft inner highlight, an optional inner light organ (`core`) and an inner rim glow (clipped wide strokes).
Silhouette first (Path2D / SVG path strings, Catmull-Rom splines, `taper()` ribbons for gills, tails, tentacles), then material
(fill + rim), then detail (eyes, freckles, suckers, cog teeth, bio-dots).

**Heroes (`drawPlayer`).** Material = dark occluder + tint 0.8 + chest/head light organ (breathing) + rim 0.95 + a soft body aura. Gills are rounded
leaf-like plumes with a vein, a petal fill that gets hotter toward the tip and a soft glowing tip (no bead, no needle); a close-up LOD (k > 7.5) adds
scalloped edges and feathery barbs, at 1x they stay clean fat leaves so they never turn spiky. Fizz = three broad plumes, freckles, short curled tail;
Pop = four slender upright plumes, a long finned tail with a dorsal sail, a cool constellation of spots - the twins differ by silhouette, not only hue.
Eyes = pale lit sclera, coloured iris, deep pupil, two highlights. Mid-shot Fizz gets a pursed mouth and a few micro-bubbles streaming into the shot bubble.

**Light.** `glow()` = additive radial sprite (one cached 128 px gradient per quantised colour, drawn with one `drawImage`). Everything alive casts a
coloured pool: Fizz magenta, Pop cyan, angry Crabbit red, thunder amber, sushi ember, the shot bubble cyan. The pools also tint the crystal: platform top
edges near a light blend toward its colour and brighten (`drawPlatforms(..., lights)`); creatures get a contact glow where their feet meet crystal instead
of a drop shadow. Structure is deliberately dimmer than life (edges at 0.8 breathing, walls' facets halved) so the eye goes to creatures and bubbles.

**Bloom (`bloom()`).** Bright-pass without any filter (self-multiply, v -> v^4 at 1/4 res), mip chain 1/4, 1/8, 1/16, 1/32, `blur()` on the
small levels only, levels merged coarse -> fine at low resolution, then ONE full-resolution additive blend. Finish layer = vignette (0.66) + 1 % black/white
grain (anti-banding in the dark gradients), baked once into one overlay bitmap.

**World.** `bgGradient` (#060d22 -> #050b1c -> #03070f -> #02040a) + a cool surface haze from above and a violet tint from below + depth fog, baked once
per size. ONE low-resolution (1/3) light layer holds the 4 surface god-rays (each = 4 nested soft polygons, no hard edges) and the 3 giant distant
jellyfish (luminous fresnel membrane, canals, rim bio-dots, oral arms, gradient-faded tentacles); it is blurred once and added with one full-screen blend.
The jellyfish are cobalt/teal and cobalt/violet, never Jellop's violet. 150 drifting plankton specks, 10 bokeh motes at 4-8 % alpha.
Platforms: solid tiles -> boundary edges -> closed loops -> merged collinear vertices -> chamfered convex corners; the same polygon drives the fill,
the facets (jittered triangular grid, per-facet tint, up-facing facets catch the key light, brightest near faces), the light columns, the shards
(underside: hanging crystals, dim and violet-leaning; tops: tiny facets at the ends only, the middle stays clean for the characters), the top/side/underside
edges (hierarchy 1.0 / 0.46 / 0.34) and the sea-fan tufts. Built once per level and cached; only the edge shimmer, glints and tufts are dynamic.

**Bubbles (`drawBubble(ctx, kind, x, y, r, opts)`).** kinds: empty, shot, trapped (stage 0 cyan / 1 amber warning / 2 red), thunder, fire, water.
Ring-shaped halo (zero in the middle so the contents stay visible), near-transparent fresnel body, a refracted caustic pool in the lower-right, a thin-film
cap (three conic-gradient bands whose alpha peaks at the top-left, drifting slowly; skipped below r = 7 px), a thin rim that is brighter and thicker on the
two lit sides, a window highlight + a tinted secondary reflection with a white core, wobble. `opts.tint`, `opts.halo`, `opts.film` give per-bubble variety
(the ceiling cluster uses five slightly different tints and brightnesses). Trapped enemies are drawn inside on a dark backing disc.
Thunder = bolt + crackling arcs, fire = double flame, water = gradient droplet. `drawPop()` = shockwave rings + droplets,
`drawChainFlash()` = expanding ring + whole-screen additive wash (call before bloom; `?chain=0.3` previews it).

**Type/UI.** A stroke font (`GLYPH`: A-Z 0-9 and punctuation as polylines/arcs, cap height = 1) drawn through `neon()`; HUD = labels in
tracked caps + thin tabular numerals, EXTEND letters in the walls (lit = ringed + glowing), lives = tiny glowing pearls. The logo uses the same glyph paths
but renders them as GLASS TUBES (`logoLayers`): each stroke is a tube of width 0.17 cap whose wall is "tube minus interior" (two contour lines, hot line on the
outer edge), with a translucent coloured interior, a blurred liquid-light core and a specular streak clipped to the interior, over an opaque near-black
occluder; glow = three blurred copies of the wall. Two cached bitmaps (occluder, lit layer drawn additively); only the bubble-O and the rising bubbles are
live. The ampersand is its own Catmull-Rom path (smooth, same weight as the letters), the O of POP is a live bubble.

**Reusable per-entity API (also exposed as `window.AbyssGlow`):** `drawPlayer(ctx, 'fizz'|'pop', {x,y,k,face,t,pose,mouth})`,
`drawEnemy(ctx, type, {x,y,k,face,t,state,angry})`, `drawBubble`, `drawFood`, `drawPowerup`, `drawPlatforms(ctx, geo, S, t, theme, lights)`,
`buildLevelGeo(map)`, `drawBackground`, `drawHud`, `drawPopup`, `drawLogo`, `drawMenu`, `drawText`, `drawTrail`, `drawPop`,
`drawChainFlash`, `bloom`, `drawFinish`.

## Cost per frame
Measured here: headless Chromium, SOFTWARE raster (no GPU in this container), 1024x896, everything redrawn from vectors every frame
(`node perf.mjs`; the stage split uses `window.__prof`, which forces a pixel read-back after each stage, so the stages add up to a little more
than the whole; the single-entity numbers are 40 draws followed by one read-back). Run-to-run noise is about +-8 ms on the whole frame.

| | ms |
|---|---|
| whole gameplay frame | 85-97 (first naive version of the first delivery: 470; first optimised delivery: 80-87) |
| title / cast sheet | 84-92 / 107-124 |
| background blit + god-rays + 3 far jellyfish (one low-res layer, one blend) + 150 plankton | 15 |
| platforms (cached static layer blit + dynamic edges, glints, light pools, tufts) | 16 |
| Fizz / Pop each (isolated) | 4.2 / 4.8 |
| enemy (Crabbit angry / Jellop) | 2.3 / 1.8 |
| bubble: empty r = 32 px with film cap / tiny r = 6 px / trapped r = 46 px | 1.4 / 0.3 / 3.0 |
| all bubbles + food in the gameplay moment (15 bubbles) | 13 |
| HUD | 5.5 |
| bloom | 13 |
| vignette + grain overlay | 0.9 (baked) |

What the optimisation rounds did: glow gradients -> cached sprites, bright-pass by self-multiply instead of CSS filters, bloom levels merged
at low res, the jellyfish blurred once instead of per stroke, god-rays folded into the jellyfish layer (saves one full-screen blend, about 7 ms),
tentacles as one gradient-faded polyline each, film bands skipped on tiny bubbles, static background/overlay/logo baked.

Production plan: bake every sprite frame once (`GFX.init`): 8 frames of the angry Crabbit cost 4.4 ms to bake in total; blitting 30 sprites
costs 1.2 ms per frame (both measured in the first delivery). With baked sprites + the cached level layer + jellyfish/rays refreshed at ~10 Hz the same CPU
raster should land at roughly 35-45 ms/frame (the bloom and the full-screen blends dominate); on a GPU-accelerated canvas I expect single-digit
milliseconds. That last number is an ESTIMATE, I could not measure a GPU here. Memory: ~60 sprite frames x ~100x100 px, plus ~15 MB of
screen-sized cache/scratch canvases (background, level layer, overlay, bloom chain, logo layers).

## What it would take to become the game's GFX module
- Keep the SPEC 3.1 contract. `GFX.init()` runs `drawPlayer/drawEnemy/drawBubble/...` into offscreen canvases (registry name x frame x
  flip, `t` = frame / frames x period) at the display scale and re-bakes on resize; `GFX.draw(ctx, name, frame, x, y, {flip, alpha, white})`
  becomes `drawImage`; `white:true` = a second bake with `source-in` white (hit flash). Bubbles bake per (kind, radius bucket) with the film phase as a frame.
- `GFX.levelCanvas` = `renderLevelStatic` (already cached per level/size, now including facets, columns and shards) + the dynamic edge pass;
  `GFX.theme(i)` returns the platform edge/body/accent colours: coral = azure + rose tufts (shown), kelp = teal + lime, ship = amber + magenta, crystal
  caves = violet + ice, volcanic = ember + gold (angry red must stay clearly redder), abyss temple = gold + cobalt. A palette swap, no new art.
- `GFX.text/drawLogo` = the stroke font and the glass-tube logo; add the missing glyphs (c, heart, star, arrows).
- One new call, `GFX.post(ctx)` (bloom + finish), from Main after `Game.render`. The canvas stops being 256x224 `pixelated` and becomes a
  resolution-independent canvas of N x logical size (fit to the viewport); game logic, audio, input, hitboxes stay untouched.
- Size: ~123 KB source for the engine part (mockup.js is 147 KB including the three scenes and the dev lab), ~44 KB gzipped, zero assets.
- Rough effort: sprite-bake registry and frame timing 1 day, per-theme palettes + level cache 0.5 day, remaining sprites (letters, die/stun
  poses, flames, water, pearl, 8 foods, 7 power-ups) 1 day, quality toggles + QA 1 day.

## Risks
- Fill rate: additive full-screen passes on low-end phones. Mitigation: start the bloom chain at 1/8, render the world at 0.5-0.75 scale
  and let the CSS upscale (the look is soft anyway), a "reduced effects" switch.
- `ctx.filter = blur()` is missing in older Safari: bloom, the far jellyfish and the logo glow silently fall back to bilinear-only glow (blockier, still
  works; the logo glow then needs `shadowBlur`, which is available everywhere). A manual 3-tap blur on the small levels is the fallback.
  `createConicGradient` is missing in older browsers: the bubble film bands are skipped and the rim falls back to a two-colour linear sweep.
- Thin strokes on small screens: HUD letters get a minimum stroke width of 1.2-1.5 px, but at phone sizes the numbers should switch to a heavier
  stroke (one parameter). The glass-tube logo is 17 % of its cap height thick, so it survives down to ~40 px caps.
- Photosensitivity: chain-reaction flashes light up the whole screen. Cap the wash at ~12 % alpha, no flicker above 3 Hz, honour
  `prefers-reduced-motion`.
- Colour-blind safety relies on silhouette first (horizontal fish+cog / wide crab / bell / seahorse on a spring / lantern fish / bones),
  hue second. Angry red is about 32 degrees of hue away from Fizz's magenta (and clearly redder in value) and carries steam + brows + a pulsing halo as shape cues.
  The twins differ by silhouette too (3 broad plumes + short tail vs 4 slender plumes + finned tail).
- Pop (cyan) vs bubbles (cyan film) vs crystal (azure): separated by value (twins are the brightest and the only lit-bodied shapes), by
  the dark body fill, and by making the empty bubbles dimmer; platforms use an azure that is pulled away from Pop's aqua, and the background jellyfish are
  cobalt/teal so they never match Jellop's violet.
- Perceived "too clean": the minimal look needs motion to sell it (breathing light, trails, plankton, drifting rays). Stills undersell it.
- Crystal shards hang under the slabs and stand at the ends of the tops: they are decoration only and must never be treated as collision geometry.

## Critique passes (demanding art-director view) and what changed
**Delivery 1, passes 1-4 (first artist).** Bubbles were solid blue balls -> ring-shaped halo, near-transparent body, dark backing behind captives;
the crystal got an edge hierarchy; ghosts replaced by one tapered light ribbon; sushi, Kraken, Springle, Bonefin redesigned; glow pools, contact glows and a
colour-keyed vignette added; the render was optimised from 470 to ~80 ms (pixel-diff 0.2/255); angry crimson moved to #ff2a2a (about 32 degrees from Fizz's
magenta); readability checked on a 384x336 thumbnail.
**Passes 5-8 (art-director review, see critique.md; 7.4 -> 8.4).**
- Pass 5, heroes + bubbles. Found: the twins were identical hairline stickers with spiky bead-tipped gills and no volume; the bubbles were generic
  rings (Olympic-ring cluster, a dull shot bubble). First try over-filled the bodies (gel toys, Concept B territory), so the fill was cut back to tint 0.8
  with an inner light organ. Changed: leaf-like plumes with LOD, coloured irises, lit bodies, Pop's different silhouette (4 plumes, finned tail, dorsal sail),
  mouth + breath micro-bubbles; thin-film cap, caustic crescent, lit-side rim, per-bubble tint/brightness, a brighter shot bubble with its own light pool.
- Pass 6, mood + platforms. Found: one even navy wash, grey-smudge jellyfish, invisible rays, timid vignette, HUD-panel slabs with scribbled lattice and a
  beaded edge. Changed: darker gradient, visible soft god-rays, luminous jellyfish in cool hues, vignette 0.66, per-facet crystal tint with dark patches,
  light columns, shards, smooth butt-capped top edges, sea-fan tufts, dimmer walls and slabs relative to life. Pass 6b removed 7 ms (rays folded into the jellyfish layer).
- Pass 7, logo + title. Found: a thin monoline neon-sign wordmark, lumpy polygon ampersand, a lens-flare star over the menu, huge smeared jellyfish behind
  the logo. Changed: glass-tube lettering, smooth ampersand, a clean pearl, smaller and fainter jellyfish placed beside the menu, calmer tower rings.
- Pass 8, cast + details. Colliding captions (smaller, tighter), Bonefin/Glimmer overlap, touching food/power-up, uneven header, owl-like Kraken beak (now a
  frown with fangs), sushi proportions (flatter fish on a squarer rice block), grey popup scrim, nearly invisible unlit EXTEND letters.

## Weakest spots still (honest list)
1. The wordmark is better than a neon bar sign but is still a glass-tube sign built on a geometric stroke font: no per-letter personality (no custom Z/P terminals,
   no bubble ligatures beyond the O).
2. Platform facets read as thin triangles; the hanging shards are a bit regular (icicle feel) and there is no refraction/parallax inside the crystal.
3. Overlapping bubble rims still just add (no flattened Plateau walls between touching bubbles); the shot bubble is subtler than the cluster in a still.
4. Enemies were only touched where they collided with the brief (Kraken face, sushi); they remain hollow contours with less volume than the twins (by design,
   but Nibbler and Jellop are small at 1x).
5. The pop shockwave rings exist as code (`drawPop`, `?chain=`) but the required moment contains no pop, so the stills do not show one.
6. Stills undersell the animation (breathing light, drifting rays, gill sway); the full-vector redraw is ~90 ms in software raster, so the real-time claim
   rests on the baked-sprite plan above.
