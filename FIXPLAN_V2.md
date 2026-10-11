# FIXPLAN_V2 — known issues after the v2.0 build (lead designer's decisions)

Amends SPEC_V2.md. These are already decided; the v2 QA lenses must not re-report them (they may add evidence).

- **V1 frozen ≠ Pop:** frozen enemies are currently tinted cyan = Pop's player colour (round 21 looks like a crowd
  of Pops). Frozen = icy pale white-lilac frost (desaturated body, frosted contour, small crystalline sparkles), clearly
  distinct from both players and from every enemy hue on all 6 themes. Fixes the pale frozen Springle too.
- **V2 HUD band:** the top 16 px must sit on the continuous water background (no flat black strip); a thin hairline may
  separate it.
- **V3 title:** closer to the approved mockup: near-black water (less violet), no help/control lines on the title (they
  live in HOW TO PLAY); one small footer line max; keep the sound hint.
- **V4 phone portrait:** no large dead bands; distribute canvas and controls sensibly within the 16 px gutters.
- **V5 ending:** no bubbles over headings/text (exclusion zones).
- **V6 light budget:** chain/bomb light pools are too heavy and multicoloured: cap total additive light per frame, fewer
  and smaller pools, tinted in the chain owner's colour; still within the §1 photosensitivity caps.
- **V7 Kraken colour:** royal purple as in the approved cast sheet, not magenta-pink (must not be confused with Fizz).
- **V8 power-up pearls:** pink/blue/gold pearls need distinct SHAPES/icons (colour-blind safe): range = outward arrows,
  rate = double chevron, speed = comet with motion lines; flippers/clock/bomb/heart/parasol stay distinct too.
- **V9 debug sheet:** label overlap in GFX.sheet() (cosmetic).
- **V10 performance:**
  a. postFX quality 1 = vignette only (sprite halos are baked); quality 2 = bloom at ¼ res with a cheap separable/downsample
     blur. Start quality 2 on fine-pointer devices, 1 on coarse-pointer devices.
  b. level/bg canvases are baked at the exact quantised k (0.25 steps) so no per-frame resampling.
  c. re-bake after a k change is time-sliced and double-buffered (keep drawing the previous bucket until the new one is
     ready): no frame > 50 ms from a k step.
  d. warm Bonefin/Kraken/next-theme bakes ahead of time (round before), no wasted title prefetch.
- **V11 contract hygiene:** Main must not reach into GFX_CAST internals; GFX exposes `GFX.drawHero(ctx, who, x, y, scale, t, opts)`
  for big title/ending twins (and similar for the big Kraken if Main needs it).
- **V12 release gate:** test/e2e_all.sh must be seen green end to end on the final build.
- **V13 audio:** nobody has heard it yet — the client will listen to the preview; until then audio fixes are limited to
  measurable problems (CPU of dense sections ≤ 6 %, bass audible on phone speakers via harmonics, entry loop seam step).
