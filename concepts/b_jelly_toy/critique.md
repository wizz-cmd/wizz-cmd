# Concept B "JELLY TOY" - art director critique (fresh eyes)

Reviewed: `gameplay.png`, `title.png`, `cast.png` as delivered by the first artist (before my fixes), plus 2x crops of
the bubbles, Fizz, Pop, the sushi and the logo. Binding sources: CONCEPTS.md (shared rules + Concept B direction).

## Verdict in one line
A genuinely cute, coherent toy-diorama that is clearly not pixel art, but it is still "nice mockup" rather than
"shipped 2026 casual hit": the logo, the bubbles and the lighting - the three things a client reads first - are the
weakest-rendered parts, and the pink slabs out-shout the heroes.

## The 5 biggest problems (most visible first)

1. **The logo is an outlined neon-tube font, not inflated balloon lettering.** Five stacked monoline strokes give a
   hollow "double line" look (a white core line runs along every stroke), colour bands are flat, there is no volume,
   no reflected light, no puffy highlight windows. On the title - the very first thing the client sees - it reads as
   "rounded font on a sticker", not "glossy inflated toy". The brief explicitly asks for "puffy, glossy, outlined".
2. **The heroes are not the focal point and their gills read as balloon animals.** Fizz/Pop are small next to the
   slabs, the "frilly" gills are stalks with beaded lollipop tips (Pop's look like teal broccoli / cotton buds), there is
   no feathery fringe. On the title Fizz (pink) stands on a pink slab (same hue, same chroma) and nearly dissolves.
3. **The platforms are the loudest thing on screen.** Seven identical hot-pink pills with cream scallops cover
   ~25 % of the playfield at the same hue/saturation as Fizz and the angry Crabbit; they read as iced cake rolls /
   sausages and pull the eye away from characters and bubbles (the brief: "readability first").
4. **The bubbles - the game's main object - are glass beads, not soap bubbles.** A dark cartoon outline, a thin
   rainbow rim and a plain transparent body; no thin-film swirl across the surface, no second reflection, no
   refraction. Stage-1 warning: the additive yellow halo is drawn *behind the whole bubble*, so the water seen through
   it turns yellow and the gold Nibbler inside dissolves into it (gold on yellow); the enemy is simply pasted in.
5. **Lighting and mood are flatter than the pitch.** The playfield is a murky mid-blue; the far Sunken-Tower/reef layers
   are nearly invisible (so the "tilt-shift diorama" claim is not delivered); the sun exists only in the HUD strip; no
   readable light shafts crossing the scene, no colour grade, no warm/cool separation between key and shadow side.
   It feels evenly lit - "sunny aquarium" needs one clear light story.

## Smaller problems
- Sushi: the nori is a fat black bar that sticks out above the fish and under the rice - reads as a pill with a handle
  (a ladybird), not nigiri. The "+2000" popup lands on the slab icing above it and fights the scallops.
- EXTEND wells are muddy brown discs, letters at ~20 % contrast; an empty life slot (P2) looks like a rendering bug.
- Title: five identical heavy-navy menu slabs dominate the centre and feel like a utility UI inside an airy world;
  Fizz and Pop stand far out at the edges; the HI SCORE chip floats alone at the bottom.
- Cast sheet: Springle is half the size of everybody else, Bonefin is pale on pale, a sushi sparkle lands on the
  THUNDER label, the Kraken stands on a podium the tentacles cover and its label sits on the tentacles, ANGRY Crabbit's
  steam clips against the row above.
- Crabbit's steam / eye glints on gameplay are two stray white dots that look like dirt.
- Nothing else in the frame animates "light": caustics are a uniform net at low alpha, no specular response on the slabs.

## Scores before fixes (out of 10)
| criterion | score | why |
|---|---|---|
| Contemporary appeal | 7.0 | clearly modern and not retro, but the logo/bubbles/mood are template-grade |
| Faithfulness to the brief | 8.0 | every requested element is placed, palette and materials follow the brief; "puffy balloon" logo, "real soap bubbles" and "tilt-shift" are only partly met |
| Readability | 6.5 | threats are fine, but hero vs slab hue clash, gold-in-yellow Nibbler, low-contrast EXTEND wells |
| Cohesion | 8.0 | one language everywhere (pills, chips, gloss); the navy menu slabs are the odd ones out |
| Craft | 7.0 | solid vector painting, but the logo/bubble/sushi/gill details show seams at 2x zoom |
| **Overall** | **7.3** | |

## Fix plan (executed in the code, see notes.md pass log)
logo -> mask-based inflated letters (inner highlight, inner shadow, aqua bounce, crisp specular streak) ;
bubbles -> drained thin-film swirl, second window, refracted + squirming enemy, ring-only warning halo ;
heroes -> bigger, feathery frond gills, lighter podiums on the title ;
platforms -> calmer coral, less chroma, frosting keeps the "walkable line" ;
mood -> clear key-light story (warm top-left shafts, cool deep bottom), visible far reef/tower, grade ;
details -> sushi, EXTEND wells, life slots, menu pills, cast layout.


---------------------------------------------------------------------------------------------------

# After the fixes (same reviewer, final renders)

All five big problems were attacked in code (`parts/*.js` -> `mockup.js`), three review rounds, every PNG re-read at 1x,
2x crops and half size:

| # | problem | what changed | verdict |
|---|---|---|---|
| 1 | neon-tube logo | `drawInflated`: per-glyph cached sprites shaded from the stroke mask (inner shadow, aqua bounce, warm highlight, crisp specular streak), cream + ink sticker, '&' / O / P counters opened | solved: reads as inflated vinyl balloon letters |
| 2 | heroes / gills | gills = stalk + feathery frond plume + tip fan, heroes 1.3x with a key-light edge, calmer podiums | mostly solved: reads as frilly axolotl gills; fronds are still a little plant-like |
| 3 | loud slabs | calm lower-chroma coral, per-slab colour drift, frosting keeps the walkable line | mostly solved: characters and bubbles now lead, slabs are still a big repeated shape |
| 4 | glass-bead bubbles | drained iridescent film bands, 2nd window, fainter contour, magnified squirming enemy, ring-only halo, stronger inner ring on bright water | solved: reads as soap film; Nibbler is gold on blue again |
| 5 | flat mood | luminous gradient, warm sun, live god rays (behind + over), visible pastel far reef, sea-glass mid layer, deep-water grounding on the title | solved for "sunny aquarium"; true tilt-shift DOF still not delivered (stated honestly in notes) |

Also fixed: sushi, steam clouds (stray white dots), EXTEND wells, phantom life slot, jellop stain shadow, frosted-glass menu, cast
sheet backdrop / Springle / Bonefin / Kraken podium / label collisions, glint shard bug.

## Scores after fixes (out of 10)
| criterion | before | after | why |
|---|---|---|---|
| Contemporary appeal | 7.0 | 8.5 | inflated logo, soap bubbles and one clear light story give it a shipped-game finish |
| Faithfulness to the brief | 8.0 | 8.7 | puffy glossy outlined logo, real soap bubbles, sunny aquarium, blurred reef, frosted pills; tilt-shift only implied |
| Readability | 6.5 | 8.0 | heroes / threats / bubbles beat the slabs, gold-on-blue Nibbler, legible EXTEND; risk = 1.6x overdraw and a pale title mid-zone |
| Cohesion | 8.0 | 8.7 | navy = info chip, frosted = button, lemon = selected; cast sheet now lit like the game |
| Craft | 7.0 | 8.3 | no stray shards / dots, counters open, details hold at 2x; software-raster cost ~ +30 % |
| **Overall** | **7.3** | **8.4** | |

## What is still weakest
1. The slabs are still one repeated pill; only the reef theme exists, so "other themes are a small swap" is untested.
2. No real depth-of-field: the diorama feel comes from blurred background layers and foreground bokeh only.
3. Character finesse: Fizz's open mouth reads as a flat red O, arms are thin sticks, gill fronds are slightly plant-like.
4. The title mid-zone (tower + frosted pills) is pale; the heroes sit far out at the edges instead of owning the centre.
5. Drawn overdraw (heroes ~1.6x, enemies ~1.4x the 16 px box), animation judged only for "no errors" (stills reviewed), CPU
   timings are software-raster and pessimistic, GPU numbers are estimates.
