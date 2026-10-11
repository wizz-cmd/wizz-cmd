# FIZZ & POP v2.0 — “ABYSS GLOW” + new soundtrack (lead designer's spec)

Amends SPEC.md, FIXPLAN.md, FIXPLAN2.md. Where they conflict, this file wins.
v1.0 (8-bit) is frozen in git branch `fizzpop-v1.0-8bit`; do not try to keep the pixel look alive.

**Unchanged:** all game mechanics, numbers, levels, entity hitboxes, round flow, scenes and their
logic, input, hi-scores, the 256×224 logical coordinate system, every public API that is not
extended below, and every sprite / sfx / track NAME. All existing functional tests must stay green.
**Changes:** the complete look (client-approved concept C, “Abyss Glow”) and the complete music and
sound design (new style brief §6).

Visual references (binding): `concepts/c_abyss_glow/{gameplay,title,cast}.png`, its `notes.md`,
`critique.md`, `palette.json` and its source `concepts/c_abyss_glow/parts/*.js` + `mockup.js` — the
approved mockup. Port from it; match it; improve where the critique says it is weak.

---------------------------------------------------------------------------------------------------

## 1. Render architecture (contract between Main, GFX, Game)

- **Resolution-independent rendering.** Main sizes the canvas backing store to its CSS size × devicePixelRatio
  (`k = backingWidth / 256`, quantised to 0.25 steps, clamp 1…8) and every frame sets
  `ctx.setTransform(k, 0, 0, k, 0, 0)`; `ctx.imageSmoothingEnabled = true`. Scenes and Game keep drawing in
  LOGICAL units (256×224) exactly as today. Main calls `GFX.setScale(k)` whenever k changes (resize, DPR change).
  No integer/sharp-bilinear pixel scaling any more; CSS `image-rendering` back to auto.
- **Baked sprites.** Everything with a registry name is drawn ONCE per (name, frame, variant, k-bucket) into a
  cached canvas at k× resolution and blitted with one `drawImage` per entity. Never draw the vector art live per
  frame (the mockup costs ~90 ms/frame live). Baking is lazy (first draw) plus an idle-time warm-up queue so the
  first seconds don't hitch; `GFX.setScale` invalidates by bucket (old buckets dropped).
- **Overdraw:** a sprite's visual may extend beyond its registry box (luminous overdraw): heroes ≤ 1.35× box
  height, enemies ≤ 1.25×, items ≤ 1.2×, anchored bottom-centre for walkers/items, centre for bubbles/flyers.
  `GFX.draw(x, y)` still takes the box's top-left; GFX applies the per-sprite pad. Hitboxes unchanged.
- **Additive light.** Glow is part of the baked sprites (halo) and of a final bloom pass. Light sources composite
  with `globalCompositeOperation = 'lighter'`.
- **Post FX:** after the scene's render Main calls `GFX.postFX(ctx, quality)` (bloom at ¼ resolution, vignette,
  optional subtle grain). `quality`: 2 = full, 1 = bloom at ⅛ res / no grain, 0 = off.
- **Auto quality (Main):** start at 2 (1 on coarse-pointer devices); if the 2-s average of update+render+postFX
  exceeds 12 ms drop one level; raise again after 10 s under 6 ms. Expose current level in `__fizzpop`.
- **Photosensitivity & reduced motion (binding):** full-screen flashes ≤ 12 % alpha and ≤ 3 per second; no
  strobing. If `prefers-reduced-motion: reduce`: no screen shake, no full-screen flashes, trails off, ambient
  particle count halved. Main passes the flag via `Game.setOptions({reducedMotion, quality})` (new, see §4).

## 2. GFX v2 — files and API

Split for parallel work (build.sh already concatenates `src/NN_*.js` in order):
- `src/09_neon.js` → `const NEON` — pure drawing primitives ported from the mockup parts (`neon`, `body`,
  `glow`, `dot`, `sparkle`, `taper`, `spline`, `poly`, `arcPts`, `quadPts`, `circlePath`, `ellipsePath`,
  `sampleSpline`, `starPath`, `rgba`, `mixc`, `hot`, `hex`, `lwFor`, colour constants …) with the SAME
  signatures as in the mockup, plus their small caches. No game knowledge.
- `src/10_gfx.js` → `const GFX` (core + world): bake cache, scale handling, `define`, `draw`, `frames`, `size`,
  `has`, text/font, `levelCanvas`, `bgCanvas`, `theme`, `drawLogo`, `postFX`, `particle`, `sheet`.
- `src/11_gfx_cast.js` → `const GFX_CAST` — calls `GFX.define(...)` at load for EVERY registry sprite (players,
  enemies, boss, bubbles, projectiles, effects, foods, power-ups, moon pearl). It may use `GFX` and `NEON` at load
  time (explicit exception to the lazy-reference rule).

API (existing calls keep their meaning; additions marked NEW):
```js
GFX.init()                      // idempotent; cheap now (baking is lazy)
GFX.setScale(k)                 // NEW: bake resolution (output px per logical px)
GFX.define(name, { w, h, frames, pad: {l,r,t,b}, draw(ctx, frame, opts) })   // NEW (used by 11_gfx_cast.js)
                                //   draw() paints the frame in LOGICAL units with origin = box top-left;
                                //   GFX bakes it at k with the pad margin
GFX.draw(ctx, name, frame, x, y, opts)   // opts: flip, alpha, white (white silhouette),
                                //   tint: '#rrggbb' NEW (tinted silhouette over the sprite, e.g. frozen ice),
                                //   glow: 0..1 NEW (extra halo intensity, default 1)
GFX.frames / size / has         // unchanged; size() = registry box
GFX.text(ctx, s, x, y, color, {align, scale, shadow, outline, glow})  // glow NEW (default true)
GFX.textWidth(s, scale)         // unchanged metrics: 8 logical px advance per glyph at scale 1 (layouts depend on it)
GFX.levelCanvas(i, map)         // returns a canvas of 256k×208k (draw it at 0,MAP_Y with size 256×208)
GFX.bgCanvas(i)                 // 256k×208k, opaque
GFX.theme(i) -> { bg, accent, accent2, glow, edge, name }   // glow/edge NEW
GFX.drawLogo(ctx, cx, y, t)     // neon glass-tube wordmark (mockup), animated by t
GFX.postFX(ctx, quality)        // NEW (§1)
GFX.particle(ctx, kind, x, y, size, color, alpha)  // NEW: cached additive sprites; kind 'dot'|'ring'|'spark'|'streak'
GFX.sheet()                     // debug sheet of everything
```
**Art direction (from the approved mockup):** near-black water; every creature a luminous contour (white-hot
core line + coloured halo) around a dark translucent body; ONLY Fizz & Pop have lit bodies with an inner light
organ so they are always the brightest shapes; each enemy one neon hue + one silhouette (Nibbler amber + cog,
Crabbit ember with raised pincers, Jellop violet, Springle lime seahorse on a spring, Glimmer cobalt with an amber
lantern, Bonefin cold cyan skeleton, Kraken royal purple with gold crown); angry = crimson #ff2a2a contour + steam
puffs + slanted brows + pulsing heat halo baked into the `_angry` frames (Game's old K4 aura is REMOVED); frozen =
Game draws the sprite with `tint` icy cyan + sparkle particles; bubbles = real soap bubbles (thin lit rim, near-invisible
body, thin-film cap, caustic crescent, halo; trapped enemy visible inside; `trap_overlay` stages tint the film
neutral → amber → crimson); thunder/fire/water bubbles carry glowing icons.
**Themes (6, each with 5 variants by hue shift / pattern):** platforms are glowing crystalline slabs built from the
map (merge tiles into outline polygons; bright top edge, faceted translucent body, hanging shards/light columns):
0 Coral Reef — rose/magenta crystal + sea-fan tufts; 1 Kelp Forest — lime/teal, kelp ribbons in the bg;
2 Sunken Ship — amber/brass plank lines, ship ribs bg; 3 Crystal Caves — azure/cyan (as mockup);
4 Volcanic Vents — ember edges, lava glow below, rising sparks; 5 Abyss Temple — violet + gold trim, pillars.
Backgrounds: black-blue gradient, faint god-rays, 1–3 huge distant silhouettes per theme (jellyfish, kelp,
ribs, crystals, vents, pillars), fog. Enemy hue vs theme: every enemy must stay distinct on every theme
(white-hot core + silhouette carry it; check ember Crabbit on Volcanic, violet Jellop on Temple).
**Font:** thin, wide-tracked geometric stroke font (mockup `glyphPaths`), monospace 8-px advance, all SPEC glyphs.

## 3. Main v2 (`src/50_main.js`, `src/template.html`)
§1 canvas/DPR/transform/setScale/postFX/auto-quality/reduced-motion; remove the pixel-scaling code paths (keep
the layout logic: gutters, touch layouts, safe areas). Draw a “LOADING” frame before heavy work. Restyle every
scene (title, story, howto, scores, entry, pause, ending, focus overlay hints) to the new look: translucent
near-black panels with 1 px cyan hairlines and glow text instead of opaque plates; title per mockup (neon
wordmark, glowing twins, menu in thin wide-tracked type, distant jellyfish). Page chrome (template CSS tokens,
touch buttons) restyled to the Abyss palette in dark mode (light mode: keep a light page around the dark canvas,
buttons with dark-navy ink). Legend/help text unchanged in content.

## 4. Game v2 (`src/40_game.js`)
- `Game.setOptions({ reducedMotion, quality })` NEW (default false / 2).
- Ambient: drifting plankton specks (GFX.particle 'dot', 40–80 by quality), slow light motes near bubbles.
- Motion trails for moving players/enemies (quality ≥ 1, not reducedMotion), shockwave rings on every pop,
  spark bursts on kills, glow pulse on food/items, chain reactions light the screen within the §1 caps.
- HUD: thin glowing numbers (mockup HUD), lives as small glowing pearls in player colour, EXTEND letters as small
  glowing letters (lit / dim), round number thin; boss gauge as a thin neon bar with crown glyph.
- Banners (ROUND n, READY!, HURRY UP!, EXTEND, GAME OVER, victory): neon text over a soft dark gradient band
  (no opaque rectangles), still legible on every theme.
- Remove the K4 angry aura (now baked in sprites); frozen → `tint` + sparkles; keep every mechanic identical.

## 5. Performance budgets (gates)
Desktop (no throttle): update+render+postFX ≤ 4 ms average in a busy scene (40 bubbles, 8 enemies, chain).
6× CPU throttle at 390×844 DPR 3 with auto-quality: p95 ≤ 16 ms after the first 3 s. Boot to interactive title
≤ 1.5 s at 4× throttle. No frame > 50 ms after warm-up. Bundle ≤ 1.5 MB.

## 6. Music & sound v2 (`src/20_audio.js`) — style brief from the client

**“80s dark wave with modern EDM elements and a touch of industrial — like a Twin Peaks soundtrack made by Linkin
Park.”** Translate that into: the dreamy, melancholic, slow-burning noir atmosphere of early-90s TV-mystery
scores (lush cold pads, reverb-drenched twangy clean-guitar-like plucks with tremolo, jazzy minor/maj7/add9
harmony, finger snaps) + 80s dark-wave machinery (chorus-drenched melodic high bass lines, cold arpeggiated
synths, LinnDrum-style kicks, gated-reverb snares) + modern EDM dynamics (builds with risers, snare rolls and filter
sweeps, drops with side-chain pumping supersaw chords and an 808 sub, white-noise sweeps, impacts) + industrial
edge and nu-metal weight (distorted saw riff bass, metallic clangs, noise hits, bit-crushed snares, hard half-time
sections; quiet-verse/loud-drop contrast). **Strictly original:** never quote or paraphrase any existing theme
(explicitly not the Twin Peaks themes, not any Linkin Park song, not Bubble Bobble); style only.

**Engine (pure WebAudio, procedural, no samples):** instruments — supersaw (5–7 detuned saws) pad/chords, chorus
pick-bass (saw/pulse + LP filter + modulated-delay chorus), 808 sub (sine + pitch drop + soft saturation),
distorted riff bass (saw → WaveShaper drive + LP), cold arp synth (pulse/saw with filter envelope), twang pluck
(Karplus-Strong via short feedback delay, tremolo, spring-ish reverb), FM bell/vibes, choir-ish pad (filtered
detuned saws with formant-ish band-pass), drums (Linn kick, EDM kick with click, gated-reverb snare, clap,
hats incl. metallic 808 hat, rimshot/snap, toms), industrial hits (inharmonic FM/ring-mod clangs, noise bursts,
WaveShaper bit-crush quantisation), FX (risers, down-sweeps, reverse swells, impacts). Buses: ConvolverNode
reverbs with procedurally generated impulse responses (room + hall), tempo-synced ping-pong delay, chorus,
side-chain ducking (scheduled gain automation per kick on pad/bass/arp buses), bus compressor, master limiter.
Keep the WHOLE existing AUDIO API and semantics (look-ahead scheduler, setTempo mid-loop, bar-aligned loop
switches, jingle queue/resume/onEnd, pause({suspend}), mute persistence, `_renderOffline` through the identical
code path, voice limits, try/catch guards). CPU: ≤ 6 % of one desktop core; cap simultaneous voices.

**Tracks (names unchanged; all seamless loops except jingles):**
| name | feel | BPM / key | form (≥) |
|---|---|---|---|
| `title` | “Neon Abyss”: dreamy noir intro (pads, twang melody, snaps), beat and chorus bass join, hook | 92 · D minor | 32 bars |
| `stage1` (R1–15) | “Sunken Pulse”: driving dark wave, EDM build/drop, light industrial accents | 122 · E minor | intro 8 · verse 16 · build 8 · drop 16 · dreamy breakdown 8 · build 8 · drop 2 16 (≈ 80 bars) |
| `stage2` (R16–29) | “Iron Tide”: heavier, distorted riff bass, metal percussion, half-time breakdown, Phrygian ♭2 colour | 126 · C♯ minor | ≈ 80 bars |
| `boss` | “Crown of the Deep”: aggressive industrial EDM, alarm lead, double-time hats, half-time drop | 140 · F minor | 48 bars |
| `entry` | “Midnight Diner”: slow jazz-noir, walking bass, brushed noise snare, vibes, pad | 76 · A minor (maj7 colours) | 16 bars |
| `ending` | “Return of the Light”: dreamy → huge supersaw finale, minor → major (Picardy) | 100 · D minor→major | 40 bars |
| `start` jingle | riser + impact + 3-note motif | ≤ 2.4 s (K7 timing) | — |
| `extend` jingle | bright arp up + supersaw stab | ≈ 3 s | — |
| `gameover` jingle | low boom, reverse swell, descending dark pad | ≈ 4 s | — |
| `clear_boss` jingle | triumphant lift, big reverb | ≈ 3 s | — |
HURRY UP keeps `setTempo(1.3)` (boss 1.15) — arrangements must still sound good at those tempos.

**SFX (all 28 names, restyled to the new world — glassy, digital, neon, with a short shared reverb):** bubbles =
glassy plinks; pop = crisp bright pop with a tiny sub thump; trap = shimmering upward chime; kill = punchy digital
zap with a metallic transient (pitch rises per chain index as now); bounce = rubbery synth blip; food = sparkle
chime; powerup = rising supersaw arp; letter = bright bell; oneup = triumphant arp; death = descending glitch +
boom; hurry = dark synth alarm; ghost = eerie detuned whisper; thunder = electric crack; fire = whoosh + crackle;
water = bubbly swoosh; freeze = crystalline down-shimmer; bomb = industrial impact + sub drop; boss_hit = metallic
clang; boss_die = big industrial explosion + reverse swell; menu sounds = soft clean ticks/chimes; clear = bright
stinger ≤ 0.8 s. Perceptual loudness consistent (K-weighted, as in wave 2); SFX sit clearly above the music.
**Mix targets:** music integrated loudness ≈ −18 LUFS-ish (K-weighted RMS −20…−16 dB), true peak ≤ −1 dBFS,
no clipping, sub content controlled (phones: bass must still read through harmonics), loop seams click-free.

## 7. Tests
All functional suites stay green (`test/e2e_all.sh`). Visual gates that encode the PIXEL look (qa_visual_assert,
game_visual V-gates, gfx_camo, check_gfx pixel assumptions) must be re-based on the new look with equivalent
intent (legibility, distinctness, contrast, no overlap) — never deleted silently. New gates: §5 budgets,
photosensitivity caps, reduced-motion behaviour, bake-cache bounds (memory), every registry sprite defined at
every frame count, audio analysis (loudness, peaks, seams, CPU) for the new tracks.
