# FIXPLAN — wave 2 (decisions by the lead designer)

Evidence for every ID is in `QA_FINDINGS.md` (same IDs). This file **amends SPEC.md**: where they
conflict, FIXPLAN wins. "DO" = implement as suggested in QA_FINDINGS (use the verified patches where
the finding mentions one); "DO*" = implement with the modification given here; "SKIP" = don't.

## 0. Contract extensions (backward compatible — feature-detect / ignore unknown options)

| API | Owner | Used by | Meaning |
|---|---|---|---|
| `GFX.text(ctx,s,x,y,color,{outline:'#rrggbb'})` | gfx | game, main | 1 px outline in all 8 directions behind the glyphs (old GFX ignores the option) |
| `GFX.bgCanvas(levelIndex)` → opaque 256×208 canvas, cached | gfx | game | subtle per-theme background (see G13). Game: `if (GFX.bgCanvas) draw it, else fill theme().bg` |
| `AUDIO.pause({suspend})` | audio | main | `suspend:true` (default, old behaviour): suspend context (blur / hidden tab). `suspend:false`: stop music scheduling + fade music out, keep the context running so menu SFX still play (manual pause). `AUDIO.resume()` undoes either |
| `AUDIO.sfx('clear')` | audio | game | NEW short (≤ 0.8 s) bright round-clear stinger |
| `AUDIO.sfx('kill',{pitch:k})` | audio | game | pitch (semitones) must audibly rise per chain index; make `kill` work well across +0…+12 |
| `Game.start({…, joinHint:'PUSH Q'})` | game | main | text blinked in the 2UP slot in 1P games; Main passes `''` when the device is touch-only without keyboard/pad |
| `dist/fizzpop.artifact.html` | main (build.sh) | deploy | build.sh additionally emits an Artifact *fragment*: the `<title>`, `<style>` blocks, body markup and the script — no doctype/html/head/body tags (the Artifact host wraps it in its own skeleton). `dist/fizzpop.html` stays a full standalone document. |

New tuning numbers (amend SPEC §4): boss HP **40 (1P) / 60 (2P)**; thunder bubbles in round 30 every
**30 frames, max 8**; round-30 `hurry` **150 s**; boss speed is a **net** speed 0.8 → 1.2 px/frame;
`TRAP_DECAY` 10 (trapTime = max(240, 480 − 10·(round−1))); angry walkers/springles capped at 1.2 px/f,
jellop angry ×1.35; pu_gold = shot speed 6 **and** range 64; fire flames spread up to 4 tiles each side.

## 1. Game (`src/40_game.js`) — all DO unless noted
- **Boss (M1, M6, M10, M11, M16, M24, M3, M7, M15, M21, M31):** numbers above; in the boss round thunder
  bolts fly toward the boss (`dir = sign(bossCx − bubbleCx)`); boss speed normalised to net magnitude;
  P2 join scales HP proportionally (hp·60/40, bossMax 60) and never heals; ink: 20–24-frame telegraph
  (white flash / angry frame) then a 4-bullet fan with no bullet aimed at the centre (±0.5, ±1.5 steps),
  only the two outer bullets when a player is within 48 px; at 50 % HP `AUDIO.setTempo(1.1)`; hurry in
  the boss round uses tempo 1.15 (not 1.3); `defeatBoss()` clears ghost/hurry/banner and resets tempo;
  hurry can't trigger while `bossPhase !== 'fight'`. Victory audio: `boss_die` sfx → ~60 frames later
  `AUDIO.jingle('clear_boss')` then `AUDIO.music('ending')` queued so the ending music follows seamlessly.
- **Stuck walkers (M2, M4):** non-player entities may rise to MAP_Y (ceiling clamp only for players, and
  never push an entity *down* into a platform); one-tile step-up for enemy walkers in moveX; watchdog: a
  walker that stays within 20 px for 6 s forces a jump toward the nearest player (or turns + drops).
  Verify with test/qa_codereview_stuck.mjs and test/qa_mechanics_stuck*.mjs: 0 stuck across all 29 rounds.
- **State bugs (M8/M14 zombie, M9 bounce clamp, M17 leadingPlayer, M23/M28):** DO. Intro: enemies stay
  inert (no contact, no AI) until phase `play`; players get `inv = 60` at play start.
- **Specials (M12, M13):** thunder in normal rounds fires TWO bolts (both directions; skip one that would
  be born inside a wall); fire spreads 4 tiles; water flows toward the nearest active enemy (fallback away
  from the nearer wall); gold per numbers above.
- **Feel (M25, M26, M27, M32):** foot overlap ≥ 4 px to stand + 5-frame coyote time; 4-frame fire buffer;
  bubble crowd spreads along the ceiling (PUSH_DIST 17, stronger horizontal repulsion near attractor
  rows; keep CHAIN_DIST 18 so neighbours still chain); angry caps per numbers above.
- **Presentation (M5, M18, M19, M20, M29, M22, M30, G5, G8 game side, G10, G13 game side):**
  every centred banner gets a dark translucent backing band (rgba(6,4,20,0.72), full inner width) and
  white/pale text with `outline`; round number + lives column + EXTEND panel get dark plates, uncollected
  EXTEND letters brighter (alpha ≥ 0.45); framed boss HP bar (dark plate, 1 px gold frame, crown icon at
  left, flash on hit, hidden during intro); victory text in 3 short lines, clear special/letter bubbles and
  projectiles at victory; popups stack with 9 px vertical offset and outline; EXTEND: all six letters lit
  and flashing during the extend phase before reset; frozen enemies: white-blue tint + 1 px pale-cyan
  outline (white silhouette offset ±1) + blinking sparkle pixels; thunder bolt: 2 afterimages (alpha
  0.5/0.25) + 3-frame screen flash on pop; `kill` sfx pitch = min(2k, 12) per chain index; drop the
  `land` volume override; `AUDIO.sfx('clear')` at beginClear; pre-build the next round's
  `GFX.levelCanvas` (and bgCanvas) during the clear phase so the transition doesn't hitch; draw
  `GFX.bgCanvas` when available.
- `joinHint` option per §0.
- SKIP U19 (render interpolation).

## 2. GFX (`src/10_gfx.js`) — palette plan first
Enemy hue plan (5 hues, none pink = Fizz, none aqua = Pop/bubbles): **Nibbler** gold-yellow (replace the
wind-up T-key by a small cog on the flank — G12), **Crabbit** warm orange/rust with pale-blue underside
and real raised pincers (G3, G12), **Jellop** violet (keep), **Springle** lime/green but rebuilt as an
unmistakable SEAHORSE: tube snout, round head with a small crest (no spikes), curled spiral tail on the
spring, dorsal fin, belly ridges — no dino jaw, no orange spikes (G1), **Glimmer** cobalt-blue with
yellow lantern (keep). **Angry (G4):** crimson/orange-red body (#e0201c family), dark shading, glowing
yellow pupils, plus a non-colour cue: 2–3 px steam puffs alternating per frame above the head.
- **G2 Fizz/Pop facing:** 3/4 view facing right: eyes shifted 2 px toward the facing side, mouth offset
  forward, clear tail fin trailing behind (wags in walk, raised in jump), near-side frills full, far-side
  frills partially hidden. Must survive the flip test (silhouette change ≥ 15 % when mirrored).
- DO: G6 (lilac-white glow halo), G7 (pair of webbed flippers, lime/teal), G8 (bolt: 2 px white-hot core,
  coloured edge, dark outline, vertically centred), G9 (lower value/saturation of clashing tile variants
  so sprites pop; esp. R1 so Fizz pink reads), G11 (1 px dark outer ring on all bubble sprites), G14 (open
  clam with pearl), G13 (`GFX.bgCanvas`: very low-contrast vertical gradient + 2–3 faint theme silhouettes —
  kelp fronds, ship ribs, crystal spikes, lava glow, temple pillars — alpha ≤ 0.12, hue varies slightly
  per variant), `text` outline option.
- G5: frozen look is drawn by Game (see §1); nothing required here.
- Gate: test/qa_visual_assert.mjs must pass G1 facing, G3 angry-vs-Fizz, G5 pearl halo (and the rest).

## 3. AUDIO (`src/20_audio.js`) — all DO
A1 (stage1 bridge section, order A A2 B C A3 ≈ 40 bars; stage2 more variation; per-section mix incl.
drum drop-outs/breakdowns; give stage2 its own lead timbre), A2 (perceptual loudness: re-fit SFX trims on
A-/K-weighted loudness; move energy of thunder/bomb/boss_hit/boss_die above 200 Hz; raise jump/spawn/ghost),
A3, A4 (try/catch, failure counter, single warn), A5 (clear_boss Picardy E major; title fanfare distinct),
A6 (new title hook; rewrite the copied title bars), A7 (gentler compressor, per-section dynamics),
A8 (bar-aligned loop→loop switch with short fade, ≤ 1.6 s wait), A9 (bass range up, richer harmonics,
shorter kick tail), A10 (boss riff tweak), A11 (HORIZON 0.28). Plus §0: `pause({suspend})`, new `clear`
sfx, `kill` pitch range, drop the chime tail of `boss_die` so `clear_boss` isn't masked, `land` audible.

## 4. LEVELS (`src/30_levels.js`) — all DO
L1 (R30 hurry 150), L2 (R19 air), L3 (R27/R12/R18 air), L5 (R11/R22 ≤ 2 nearby attractors; check the
split rounds), L6 (R5/R24/R3 air), L4: add a special to one of R18–R20 and to R25; from R22 on lower
hurry by 2 s per round (floor 30); optionally 9 enemies in R29. Also remove top-row 1-tile notches /
pockets that trap walkers in R11, R12, R13, R20, R23, R25, R26, R28 where a data change is the cleaner fix
(the Game fix in §1 is the safety net). Keep validate_levels at 0 errors / 0 warnings; re-run
test/qa_balance_air.mjs, test/qa_balance_chain.mjs, test/qa_balance_ceil.mjs.

## 5. MAIN + template + build.sh — all DO unless noted
U1 (IntersectionObserver + RAF-stall detection → onBlur/onFocus), U2 (choose portrait/landscape touch
layout by which yields the larger scale; vw ≥ 560 for landscape pads), U3/U10 (unlock re-arms on every
gesture while not running), U4, U5, U6 (ending tableau: Fizz & Pop at 2× flanking a big glowing Moon
Pearl with rotating rays, rising bubbles, then credits, then the cast waving), U7 (title: mascots perched
on/near the logo, one shared panel, ambient bubbles kept out of the menu column), U8 (scaling: crisp and
large — integer device-pixel scale when it uses ≥ 80 % of the space, otherwise sharp-bilinear: render
1:1, nearest-upscale to an integer-multiple backing store, CSS-scale smoothly; portrait: canvas at the
top with controls directly below, no dead band; pass `joinHint:''` on touch-only), U9 (pause uses
`AUDIO.pause({suspend:false})`, menu sounds in pause), U11 (touch menu pitch ≥ 44 css px, QUIT asks
YES/NO), U12 (title menu gains HOW TO PLAY and HI-SCORES; on touch without pad/keyboard show
"2 PLAYERS (KEYS/PAD)" or hide it; howto shows touch controls on touch), U13 (pointer capture), U14
(supported glyphs), U15 (join only via Q or pad 1 A/B), U16 (respect root padding / safe areas), U17
(touch wording "TAP TO PLAY", lighter veil, resume an auto-paused game on dismiss), U18 (hide the legend
when it costs a scale step; legend duplicates the H help page), U20/U21 (stable gamepad slots, filter
phantom HID devices), U22, U23 (scores footer + decoration), U24 (draw a "LOADING" frame before
GFX.init; skip the allocation work), U25 (pad + touch hints in howto and legend).
Template: Ut1 (no pinch/double-tap zoom, no overscroll), Ut2 (PAUSE/SOUND away from BUBBLE, fire on
pointerup), Ut3 (color-scheme: light on :root, `color-scheme: dark` inside both dark blocks; skip
wake-lock/fullscreen/hot-snapshot), Ut4 (`justify-content: safe center` or margin:auto). Story text
lines ≤ 26 chars. build.sh: emit `dist/fizzpop.artifact.html` (fragment, §0) in addition, and add a test
that loads the fragment inside a minimal `<!doctype html>` skeleton and boots with zero errors.
SKIP U19.

## 6. Process rules for fixers
- Before editing, back up your owned file(s) once: `mkdir -p backup/wave2 && [ -f backup/wave2/<f> ] || cp src/<f> backup/wave2/<f>`.
  If the backup already exists you are RESUMING an interrupted run: read `out/fix/<module>_progress.md`
  and `diff backup/wave2/<f> src/<f>` and continue where it stopped.
- After each finished item append one line to `out/fix/<module>_progress.md` (ID, what changed, how verified).
- Build only with `flock /tmp/fizzpop.build.lock <root>/build.sh` (other fixers build concurrently; a
  failure caused by another module's in-progress edit is not yours — retry later).
- Update your own module tests to the new intended behaviour; keep all of them green.
