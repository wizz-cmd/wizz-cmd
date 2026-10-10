# Concept C "ABYSS GLOW" - art director critique (fresh eyes)

Reviewed: `gameplay.png`, `title.png`, `cast.png` exactly as delivered by the first artist (before any fix), plus 1.6-2.4x crops of
Fizz, Pop, the bubbles, the sushi, the logo and the cast sheet. Binding sources: CONCEPTS.md (shared rules + Concept C direction).

## Verdict in one line
A coherent, clearly non-retro luminous-line-art game with real craft in the details, but it still reads as "neon sticker mascots on a
blueprint": the two things the player stares at (the twins and the bubbles) have the least presence in the frame, the world is evenly
lit instead of "living light on near-black", and the title wordmark is a stock neon-bar-sign font.

## The 5 biggest problems (most visible first)

1. **The heroes have no presence.** Fizz and Pop are the same chubby body built from hairline contours around a flat black fill; the
   "frilly gills" are bead-tipped spiky stalks (thistle / feather duster, and at 1x they turn into scribbles), the open mouth reads as a
   second nostril, the glow lives only on the outline so they look like stickers pasted on the scene, and Fizz stands in the dimmest
   corner of the frame. They are not the brightest, most volumetric objects on screen, which is what "readability first" demands.
2. **The bubbles - the game's central object - are generic glass rings.** The five ceiling bubbles are identical Olympic-ring clones with
   crossing outlines; there is no thin-film swirl across the surface, no refracted caustic inside, no soft body. The freshly blown bubble in
   front of Fizz is the dullest bubble in the frame (a dark disc with a rim), so the "mid-shot" beat the whole moment is about has no pay-off.
3. **Lighting and mood are flat, "blueprint" not "living light".** One even navy wash; the vignette is timid; the god-rays are invisible;
   the far jellyfish are grey smudges (the top-left one reads as a dirty blob); every platform edge is lit equally so nothing is the focal
   point; there is no light hierarchy between structure (should be dim) and life (should be bright).
4. **The platforms look like sci-fi HUD panels, not crystal/coral.** Seven identical chamfered slabs with a random triangle scribble that reads
   as cracks, and a top edge made of per-segment strokes whose round caps double-add into a dotted "LED strip". The brief asks for
   "glowing crystalline/coral edges"; there are no facets, no shards, no variation, no rhythm.
5. **The logo and title are a stock neon bar sign.** Thin monoline tubes in a font-like geometric sans (the 1980s neon-sign look sits next
   to "retro", the exact thing this concept must not be), a lumpy polygonal "&" that is heavier than the letters, no volume or material, a
   lens-flare "star" over the menu that is unrelated to anything, a spider-web of rings fighting the menu, and a dead band under the menu.

## Smaller problems
- Cast sheet: neighbouring sub-captions collide ("CLOCKWORK WALKER / PEBBLE THROWER", "CONSTANT BOUNCER / LANTERN HOVERER"), Bonefin's tail
  runs into Glimmer's lantern, the sushi and the power-up touch, the header has uneven spacing, the palette dots are specks.
- Kraken King still has a triangular "beak" under the eyes: reads as an owl, not a crowned octopus boss.
- Sushi reads as a mushroom (domed fish cap on a stem of rice); the "+2000" scrim is a grey pill that looks like a rendering artefact.
- EXTEND wall letters: unlit ones are nearly invisible, lit ones are fine; the lives pearls are tiny.
- Pop's jump trail is a faint streak; the thunder bubble's amber ring is clipped by its own halo.
- Everything breathes at the same strength, so stills read as "one brightness".

## Scores before fixes (out of 10)
| criterion | score | why |
|---|---|---|
| Contemporary appeal | 7.0 | modern and not retro in construction, but the neon-sign logo and HUD-panel slabs lean "80s sci-fi" |
| Faithfulness to the brief | 8.0 | every requested element is present and the palette/light model follows the brief; "glowing characters", "crystalline edges" and "chain/pop light" are only partly delivered |
| Readability | 7.0 | threats are clear, but heroes and bubbles are not the brightest/most structured things, and the shot bubble is dim |
| Cohesion | 8.0 | one luminous-contour language everywhere; slabs and logo are the odd ones out |
| Craft | 7.0 | clean vector painting, but gills, bubbles, lattice and "&" show seams at 2x |
| **Overall** | **7.4** | |

## Fix plan (executed in the code; see notes.md pass log)
1. Heroes: luminous translucent bodies with an inner light organ, lit belly, rounder petal gills (LOD for 1x), glossier eyes, Pop gets a dorsal
   crest and a different gill count so the twins differ by silhouette, a breath-puff linking Fizz to her bubble, a touch bigger.
2. Bubbles: soap-film swirl inside the sphere, tinted refracted caustic, dim/bright rim segments, a lit shot bubble, varied cluster.
3. Mood: darker world with a stronger vignette, visible soft god-rays, readable far jellyfish with glowing canals and bio-dots, far-tower
   silhouettes for depth, dimmer structure vs brighter life.
4. Platforms: faceted crystal fill (per-facet tint), continuous smooth top edge (no beads), crystal shards on tops and undersides.
5. Logo: hollow glass-tube lettering with inner liquid light, specular streak, a properly drawn "&", the star replaced by a clean pearl.
6. Cast: spacing, caption collisions, Kraken nose, header.

---

## After the fixes (same reviewer, same images, re-rendered; 4 improve passes, every PNG looked at after each)

| criterion | before | after | what moved it |
|---|---|---|---|
| Contemporary appeal | 7.0 | 8.5 | glass-tube wordmark instead of a neon bar sign, luminous lit heroes, soap-film bubbles, near-black mood with god-rays and readable giant jellyfish |
| Faithfulness to the brief | 8.0 | 8.5 | "characters are luminous outlined creatures with glowing gills and eyes", "glowing crystalline edges + subtle internal pattern", "soft halo around bubbles" are now actually delivered; still missing: a pop shockwave in the required moment (not allowed by the identical-moment rule) |
| Readability | 7.0 | 8.5 | twins are the only lit-bodied shapes (always the brightest), the shot bubble has its own light and film, enemies stay hollow contours, giant jellyfish moved to cool hues so they cannot merge with Jellop; the 384x336 thumbnail still reads Fizz, Pop, red Crabbit, trapped Nibbler, thunder, sushi |
| Cohesion | 8.0 | 8.5 | the logo is now made of the same dark-core / luminous-wall language as the creatures and bubbles; slabs carry the same facet-and-shard language |
| Craft | 7.0 | 8.0 | leaf gills with LOD, coloured irises, caustic + film on bubbles, smooth ampersand, butt-capped edges (no beads), no caption collisions; seams left: thin-triangle facets, regular hanging shards, additive crossings where bubble rims overlap |
| **Overall** | **7.4** | **8.4** | |

### The 5 problems, status
1. Heroes without presence - FIXED (lit bodies + inner light organ, leaf plumes, coloured irises, Pop's own silhouette, mouth + breath puffs, k 5.5 -> 5.9). One regression was caught on the way (first try = gel toys) and pulled back to a contour-led look.
2. Generic bubble rings - FIXED for the cluster and the shot bubble (film cap, caustic, lit-side rim, per-bubble tint); crossing rims of touching bubbles are still additive.
3. Flat blueprint mood - FIXED (near-black gradient, vignette 0.66, soft rays, luminous cool jellyfish, structure dimmer than life).
4. HUD-panel platforms - MOSTLY FIXED (faceted translucent crystal, light columns, hanging and end shards, smooth edge, sea-fan tufts); the pattern is still on the quiet side and a little regular.
5. Stock neon logo - FIXED to a large degree (hollow glass tubes with liquid light, smooth ampersand, pearl instead of lens flare); still a tube sign on a geometric stroke font.

### Still weakest (what I would do next)
- A custom-drawn wordmark (per-letter terminals, a bubble ligature in FIZZ) instead of the shared stroke font.
- Refraction / parallax inside the crystal and irregular shards; Plateau walls between touching bubbles.
- Give Nibbler and Jellop a touch more volume at 1x; a pop shockwave frame as an extra PNG outside the identical-moment contract.
