# Concept B - JELLY TOY (soft-3D glossy vinyl diorama)

Files: `mockup.html` (+ `mockup.js`), `render.mjs` (Playwright, writes the PNGs), `gameplay.png`, `title.png`,
`cast.png`, `palette.json`, `critique.md` (art-director review, before/after). `parts/*.js` are the readable sources;
`build.sh` concatenates them into `mockup.js` (the page only needs `mockup.js`). Open `mockup.html#gameplay | #title | #cast`
(animated) or add `?still` for a frozen frame. Everything is Canvas 2D, 100 % procedural: no images, no fonts, no `fillText`,
no network. The gameplay moment is drawn on the REAL round-1 map (`LEVELS[0].map`, loaded from `../../src/30_levels.js`).

## The look in one paragraph
A sunny aquarium diorama populated by glossy soft-vinyl toys, lit by ONE story: a warm key light from the sun at the top left
(god rays slanting down to the right, warm-white edge light on every toy), an aqua bounce light from below, soft contact shadows.
Platforms are calm candy-coral pill slabs with a cream frosting cap on every walkable top edge (the frosting is the loud
"you can stand here" cue, the body stays recessive so toys and bubbles win the eye); the outer frame is warm sand-clay.
Bubbles are real soap bubbles (thin-film rim, drained iridescent bands in the lower half, two reflection windows, milky fresnel
edge) with the trapped enemy visibly inside, magnified and squirming. The HUD is a set of glass chips, life icons are tiny axolotl
heads, the logo is inflated balloon lettering on a cream + ink sticker. Nothing is pixel-snapped; it is resolution independent.

## How it is drawn (techniques)
- **Coordinate system.** Every entity is drawn in LOGICAL px (the game's 256x224, entity box 16x16) under a base transform
  `scale(S)`. S = 4 for gameplay/title (1024x896), 6.7-7 for the cast sheet. Same code, any output size. Entities are authored in
  a 100-unit design space and scaled by 0.19-0.2 x a per-scene factor (heroes 1.3, enemies 1.2 on the gameplay shot = about
  1.6x / 1.4x the 16 px hitbox as drawn overdraw; hitboxes untouched). Players have feet at the origin, enemies the box centre.
- **Light model (`paint()`).** One call shades any `Path2D`: radial base gradient (warm hi-light -> cool violet shadow,
  hue-shifted ramps from `ramp(base)`), bottom rim light in water colour (clipped offset stroke, vertical fade), NEW key-light
  edge (outline shifted toward the light, clipped, warm white, fades by half height), tinted contour, soft specular blob.
  `JT.F` mirrors the highlight when the sprite is flipped so the key light stays top-left when a character faces left.
  Gradients only: no `shadowBlur` in per-frame entity code. `fastBlob()` = 3x cheaper variant for many tiny parts (gill fronds).
- **Secondary motion.** Tubes (`tubeShape`, variable-width polyline -> polygon with round caps) build stalks, tails, tentacles,
  snouts, arms, the seahorse. Gills = tapered stalk + 5 alternating feather fronds (longer at the base) + a 3-leaf fan, every
  frond sways on its own phase. Squash & stretch is a transform around the feet; blink = eye scale; steam / sparkles are time-looped.
- **Materials.** glossy vinyl (Fizz, Pop, Nibbler, Glimmer, Springle), translucent jelly (Jellop), matte clay (Crabbit shell,
  weaker edge light), ghost gel + vinyl bone (Bonefin, now a violet-blue gel so it separates from the water), brushed gold crown.
- **Bubbles (`drawBubble`).** Order: ring halo (stage 1 amber / stage 2 red, a RING that hugs the film and never tints the water seen
  through it) -> contents (enemy: backing shade, 1.05x magnification, rotation / squash wobble) -> milky fresnel body -> icon ->
  soft blue ring -> wide conic sheen -> drained-film bands (magenta -> gold -> cyan -> mint, pooled at the bottom, sliding slowly;
  weaker when an enemy is inside) -> crisp conic rim -> inner white edge -> faint contour -> top-left window + small bottom-right
  window + glints. Thunder / fire / water are glossy jelly icons.
- **Platforms (`buildLevelLayer`).** The real tile map is traced into outline loops (edge following, collinear merge), convex
  corners rounded, concave corners filleted; one function handles all 30 maps. Layers: two cast shadows (tight + wide,
  `shadowBlur`), per-slab depth gradient (each slab drifts a little toward peach or bubblegum), inner bevel via the evenodd-shadow
  trick, frosting cap with drips along every top-exposed run, polyps, pebble inlays on the frame. Rendered once into a cached canvas
  and blitted. `contactShadow()` ray-casts down the map and clips the shadow to the solids it falls on. `drawGlints()` twinkles
  four-point sparkles on the cap ends (skips spots under characters).
- **Background (`buildBackgroundStatic` + live layers).** Cached: luminous gradient (mint-turquoise surface -> cerulean floor,
  never murky), warm sun bloom top-left, cool bounce pool on the floor, FAR layer (Sunken Tower + domes + coral arches, pastel and
  strongly blurred = atmospheric perspective), MID layer (kelp + finger coral in sea-glass teal / lilac, lightly blurred), soft
  vignette. Live: `drawGodRays` (6 swaying shafts, once behind the slabs, once faint over everything), tileable caustic texture
  drawn twice (half-res composite), bokeh discs, marine snow, foreground out-of-focus bubbles at the screen edges. Blur =
  `ctx.filter` where present, else down/up-scale blur. The "diorama / tilt-shift" feel comes from the blurred depth layers and the
  foreground bokeh only: there is NO real depth-of-field pass (blurring the floor would blur the hero standing on it).
- **Post.** `postBloom`: plain downscale to 1/4 and 1/14, luminance threshold on the SMALL canvas, bilinear upscale, additive. UI
  is drawn after the bloom so it stays crisp. Adaptive: the live page drops the bloom if frames get slow.
- **Type / UI.** `GLYPHS` = SVG-path skeletons of a rounded monoline font. Inflated lettering (`drawInflated`) renders each glyph
  ONCE into a cached sprite using the glyph stroke as a mask: body gradient, inner shadow (mask minus mask shifted up-left),
  aqua bounce (bottom band), warm highlight (top / left band), crisp specular streak (thin band inset from the top-left edge), all
  clipped to the mask again; the cream + ink sticker rings and the soft shadow are separate sprites so neighbouring letters merge
  into one sticker. Per frame a letter is one `drawImage` (jiggle = transform). Glyphs with enclosed loops (& 8 0 O P R B Q) get a
  lighter stroke so the counters stay open. Flat UI text uses the same skeleton. Pills / chips: gradient + top gloss + aqua bounce +
  drop shadow; title menu = frosted-glass pills (navy = information chip, frosted = button, lemon = selected).
- **Per-entity API** (ready for the game): `drawPlayer(ctx,'p1'|'p2',{x,y,facing,pose,t,mouth,blink,scale})`,
  `drawNibbler/Crabbit/Jellop/Springle/Glimmer/Bonefin(ctx,{x,y,facing,t,angry,trapped,...})`, `drawKraken`,
  `drawBubble(ctx,x,y,r,{kind,stage,t,inside})`, `drawSushi/Heart/Pearl`, `drawPopup`, `drawHud`, `drawText`, `drawInflated`,
  `drawLogo`, `buildLevelLayer(map,S,key)`, `drawBackground`, `drawGodRays`, `drawCaustics`, `drawGlints`, `postBloom`.

## Readability decisions
Fizz = bubblegum pink, Pop = lavender with aqua gills + freckles (different hue AND pattern); facing = gills + tail trail behind,
snout / eyes / mouth / blush in front, pupils look ahead. Angry = crimson re-skin + slanted brows + anger vein + cartoon steam
clouds (same silhouette per species). Warning stage of a trapped bubble = amber ring + pulsing halo, stage 2 red; the water inside
stays blue so the gold Nibbler keeps its contrast (backing shade + ring-only halo). Platform bodies are deliberately calmer
(lower chroma) than every character; the frosting line marks the walkable edge. Each enemy owns a silhouette (cog-backed fish on
legs / raised claws + ear stalks / bell + tentacles / S-curve seahorse on a helix spring / fish with lantern + teeth / skeleton +
ghost / crowned octopus). Checked at 512x448 (half size): heroes, threats, trapped bubble, thunder bubble, the 5-bubble cluster
and the sushi all still read.

## Per-frame cost (measured / estimated)
Measured on headless Chromium with CPU rasterisation (no GPU), 1024x896 gameplay frame, forced flush after each loop, ms, noisy
(+-30 % between runs): cached background blit 20-30, god rays 4-6, caustics 14-16 per pass (two passes per frame, full-screen
additive blends are the slow part on CPU), 5 empty bubbles ~4, trapped bubble with enemy 3-5, Fizz 4-9, Crabbit 4-5, Jellop 2-3,
sushi 1-1.5, HUD 6-9 (chips use shadowBlur: must be cached), logo (10 inflated letters, cached sprites) 9-12 in software, bloom
50-70. Whole frame: 85-120 ms without bloom, 140-180 with, in pure software, which is NOT representative. The same harness gave
57-70 / 115-140 ms for the first version of this concept, i.e. this pass costs about +30 %. One-time init: inflated logo sprites
45-70 (once per size), caustic texture 17, level layer 9, background 55 (cacheable per theme).
Estimate for a GPU-backed canvas after the production changes below: ~5-8 ms per frame on desktop, ~12-16 ms on a mid phone:
HUD chips cached to a canvas and redrawn only when a number changes (-9), bubble film pre-rendered per radius into sprites and
rotated with `drawImage` (conic gradients and the drained bands are the costliest bubble ops), bokeh / snow / god rays baked into
the half-res caustic composite, caustics + bloom at 1/2 and 1/4 resolution, characters drawn live (secondary motion is the point)
- 8-12 live characters x 60-130 path ops is fine; 40 bubbles need the sprite path. Memory: ~4 MB per full-screen cache (level,
background) + ~1.5 MB for caustic / bloom buffers + ~1-2 MB of inflated-letter sprites per size.

## Pass log
**First artist, passes 1-3** (structure -> characters / materials -> depth / polish): tile tracer fixed, warning tint moved to the
film, title recomposed, cast re-laid out; Springle redesigned as a seahorse, bubbles thinned, icing peach, shadows clipped to solids;
bloom, Sunken Tower backdrop, adaptive quality, measured costs.
**Art-director review (critique.md, scores 7.3 -> 8.4).**
Pass 1 - the five biggest problems: logo rebuilt as inflated balloon lettering (mask-based shading, counters kept open); soap bubbles
re-done (drained iridescent film, second window, magnified squirming enemy, ring-only halo so Nibbler is no longer gold-on-yellow,
fainter contour); gills re-drawn as feathery frond plumes; platforms recoloured to a calm coral so heroes / threats lead; background
re-lit (luminous gradient, warm sun, live god rays, visible pastel far reef, sea-glass mid layer). Also: cartoon steam clouds (the
old steam read as stray dots), sushi redrawn (thin nori belt clipped to fish + rice, marbled salmon, visible rice), EXTEND wells
engraved with a legible letter, empty life slot reduced to a dashed ring, jellop stain shadow removed, frosted-glass title menu,
cast sheet re-lit to match + Springle bigger + Bonefin a deeper gel + Kraken standing on its podium + label collisions fixed.
Pass 2 - after reading the renders at 2x and half size: bubble cluster gained contrast (water behind it more saturated, stronger
inner ring), key-light edge on all glossy parts, per-slab colour drift, twinkle glints (and their stray-shard bug fixed), '&' counters
opened, heroes 1.34 -> 1.3 / enemies 1.22 -> 1.2 to keep the overdraw honest, fastBlob for gill fronds, rice warmed.
Pass 3 - title: the lower third sinks into deeper cerulean (podiums, floor crowd and the tower's lit windows carry the contrast), tower
windows glow, sun glare behind the logo halved; final PNGs re-rendered and re-read, zero console errors on all three scenes (still and live).

## Risks / open points
- **Overdraw vs hitbox.** Heroes are drawn ~1.6x and enemies ~1.4x the 16 px box (gills / claws / crown stick out further).
  Hitboxes are unchanged, so verify fairness in playtests; the scale factor is one number per scene (fallback 1.15).
- **Fill-rate.** Full-screen additive passes (caustics, bloom, god rays) are cheap on GPUs, expensive on CPU canvases / old phones;
  the page already auto-drops bloom, the game needs a quality switch.
- **Browser support.** `createConicGradient`, `roundRect`, `ctx.filter` (Safari lag; the inflated-letter bands and the blurred
  layers use it, with a down/up-scale fallback for the backgrounds only) - verify on Safari / Firefox before committing; the conic
  film would become a pre-rendered sprite.
- **Per-frame vector cost.** Looks great live, but 40 bubbles + 8 enemies + 2 players needs the sprite path; budget a profiling pass.
- **Frame furniture.** At 16 px rows the HUD is cramped; chips overlay the water above the ceiling (no gameplay impact). Ledges
  attached to walls (e.g. rounds 8, 18) will show a rounded join - extend the platform loop into the wall tile there.
- **Themes.** Only the coral reef is built; 5 more themes = swap `MATS` ramps, background tints, frosting colour (kelp green, ship
  wood, ice, basalt + lava glow, temple gold) - small, but untested, and art time for 30 round variants is real.
- **Not shown.** No stage-2 (red) trapped bubble on the cast sheet (the 3x3 panel is full; it exists in code: `stage: 2`), no
  true depth-of-field, no hurry-up / death / pop animations (static mockups).
- **Audio / feel mismatch.** The current chiptune score and 8-bit SFX would clash with this look; plan a softer (marimba /
  bubble-pop foley) audio pass.
