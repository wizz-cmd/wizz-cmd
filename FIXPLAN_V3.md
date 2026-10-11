# FIXPLAN_V3 — v2.0 fix wave (lead designer's decisions)

Amends SPEC_V2.md. Scope = FIXPLAN_V2 (V1–V13, all still open) + the v2 QA findings in QA_V2_FINDINGS.md (IDs below).
Default = DO as suggested in the finding; deviations are stated here. No redesigns, no mechanics changes.

## GFX core — `src/10_gfx.js` (+ `09_neon.js` if needed)
- **One resolution, no resampling (X1, X3, X6, V10b):** every bake cache (sprites, text tiles, particles, world canvases)
  uses the exact quantised k (0.25 steps). Particles are drawn 1:1 in device pixels. Only one k generation is alive
  (plus the previous one while re-baking). Memory bound by count (X5): cap world canvases to current + next round.
- **Re-bake without hitches (V10c, X2):** time-sliced (≤ 3 ms per frame) and double-buffered; the warm-up queue also
  advances from rAF slices when requestIdleCallback starves. Warm Bonefin/Kraken/next-theme ahead (V10d).
- **postFX (V10a):** q0 = nothing, q1 = vignette only, q2 = bloom at ¼ res, refreshed every frame or pipelined so cost
  is steady (U7 is about this too).
- **No GPU stalls (X4):** no getImageData in hot or bake paths (bake core and halo as two layers instead of splitting);
  reduce distinct composite/filter states where cheap.
- **Theme 0 (L1):** Coral Reef platforms become azure/teal crystal with rose sea-fan accents (as the approved mockup),
  so Fizz (pink) never stands on pink. Re-check all 6 themes: no player hue on its platforms.
- **Font (X8):** dotted/slashed zero, distinct D/0/O and 8/B at k ≤ 1.5. **Pad clipping (X7):** larger pads where cut.
- **V9** sheet labels; **V11** `GFX.drawHero(ctx, who, x, y, scale, t, opts)` (+ `GFX.drawBig('kraken', …)` if Main needs it).

## Cast — `src/11_gfx_cast.js`
- **V1 frozen** (icy pale white-lilac frost, desaturated, crystalline sparkles; distinct from Pop cyan and every enemy) —
  provide what Game needs (e.g. `<e>_frozen` overlay sprites or a documented tint recipe) and coordinate via apiNotes.
- **C1 ink bullets:** white-hot core + saturated red-orange rim (#ff5a1f), never purple/pink; always visible over the Kraken.
- **C2 trap stages:** add non-hue cues — stage 1 faster shimmer + dashed/thicker rim, stage 2 pulsing rim + crack lines.
- **C3** Fizz brighter (highest-luminance creature with Pop); P1/P2 differ in luminance too, not only hue.
- **C4** angry = brighter, not darker (hot core, steam, brows); **C5** fire = flame tongues, water = droplet + wave lines.
- **V7** Kraken royal purple; **V8** power-up pearl icons (range = outward arrows, rate = double chevron, speed = comet).

## Game — `src/40_game.js`
- **G1 (photosensitivity, must):** ink telegraph = smooth glow ramp ≤ 3 Hz, no white strobe.
- **G3:** banners/large elements flash ≤ 3 Hz; invulnerability = smooth alpha pulse 0.4–1.0 at ≤ 4 Hz (reducedMotion:
  steady 0.6); freeze end / special expiry = gentle pulse, not on/off blink.
- **G2:** shockwave rings via baked `GFX.particle('ring')` (1 blit) instead of 3 stroked passes.
- **G4** reset trails on teleports; **G5** smooth sub-pixel transition scroll, items/plankton fade instead of pop;
  **G6** no join hint when join is impossible; **G7** remove the hot allocation sites; **G8** EXTEND unlit ≥ 3:1, round
  number labelled (e.g. “R01”) and inset.
- **V6** light budget for chains/bombs; frozen per V1 (use what cast provides).

## Main — `src/50_main.js`, `src/template.html`
- **Performance (U1–U4, U6, U7):** quality/resolution ladder driven by REAL frame time (rAF interval, which includes
  raster/commit), with hysteresis; render at most once per fixed update (no duplicate frames on > 60 Hz displays);
  static scenes (pause, how-to, scores, idle title after its intro) render only on change or at ≤ 20 fps;
  start-up calibration during LOADING (≤ 600 ms micro-benchmark) picks the initial k and quality so phones never spend
  seconds at 100+ ms frames; ending scene quality-gated.
- **UX (U8–U16, V2–V5):** focus overlay compact and clear of the menu rows; attract mode paused while the overlay is up and
  the first click lands on the title; pre-script CSS already matches the final layout (pointer: coarse media queries) so
  nothing jumps; touch rows ≥ 44 css px incl. CONTINUE; BUBBLE label fits; how-to back zone ≥ 44 px and clearly
  labelled; smallest text ≥ 7 css px cap height on phones; hi-score screen tidy (one score format, one back hint);
  how-to/story layout slips; ending crossfades (U5). Use `GFX.drawHero` (V11) instead of GFX_CAST internals.

## Audio — `src/20_audio.js` (mix and arrangement; the client is listening to the preview — composition-level
changes wait for that feedback)
- **A1** recalibrate SFX loudness against a running music bed (warm limiter), restore the quiet tier (menu_move, land).
- **A2** metal hats audible (+15–17 dB); **A5** cold arp audible in verses and drops (it is part of the brief);
  **A6** finger snaps audible in title/ending/entry.
- **A3** SFX must not pump the music: separate SFX limiter / lower SFX peaks so a single SFX ducks music ≤ 1.5 dB;
  **A4** critical cues (hurry, death, ghost, 1UP, letter, clear, power-up) ≥ +8 dB over the loudest drop (gentle music
  duck of ~3 dB under them is fine).
- **A7** four-on-the-floor kick in every drop (EDM pump); **A8** second loop pass differs (counter-melody, lead octave,
  fills) — keep seams clean.
- Reword comments that name third-party franchises (keep the shipped page free of them).

## Levels — `src/30_levels.js` (regression engineer)
- Rename visible round names “Cargo Tetris” → “Cargo Stack”, “Skull and Bones” → “Bone Reef” (trademark hygiene).

## Gates
`test/e2e_all.sh` green END TO END on the final build (V12). Re-measure SPEC_V2 §5 with the new real-frame-time metric;
report honestly what this CPU-raster VM can and cannot prove. Photosensitivity: no full-screen or large-area flash > 3 Hz.

## Release-gate policy (lead decision, added during regression)
This shared 4-core CPU-raster VM makes wall-clock measurements noisy. Therefore:
- **Blocking (must be green in ONE complete run):** every functional, contract, visual-legibility, photosensitivity,
  mechanics-equivalence, level, artifact-fragment and deterministic audio check (offline renders: loudness, peaks, seams,
  notation, runtime API semantics).
- **Advisory (separate `perf` step, best of 3, numbers reported, never blocking):** anything that gates on wall-clock or
  CPU share of a live context — audio_cpu*, cpu_sections, live-context dip/duck timing in v3_mix, e2e_budgets frame-time
  limits, main perf frame-time / late-frame counts. A consistent regression > 25 % against the recorded baseline
  (out/v3/regress/budgets_real_base.log) is still reported as a finding.
- Do not keep loosening thresholds to get green; move timing gates to the advisory step instead, unchanged.
