# FIZZ & POP — The Sunken Tower

A Bubble Bobble–style single-screen arcade platformer. **All graphics, music and sound are original**
(no ripped assets, no copied melodies, no Taito names/characters). Delivered as ONE self-contained
HTML file (no network requests, no external fonts/scripts/images/audio), later published as a
claude.ai Artifact.

This document is the contract between all modules. If something is unspecified, choose the option
closest to the arcade original's *feel*, keep it simple, and document the choice in your module's
header comment. **Never change another module's public API**; if a contract is wrong, report it.

Project root: `PROJECT=/tmp/claude-0/-home-user-wizz-cmd/513fa6d7-0d66-572a-84bd-f54579a0dbcb/scratchpad/fizzpop`

---------------------------------------------------------------------------------------------------

## 1. Concept

**Story.** The Kraken King stole the Moon Pearl that lights the reef. Axolotl twins **Fizz** (P1,
pink) and **Pop** (P2, aqua/lavender) dive 30 floors down the flooded **Sunken Tower** to get it
back. Trap the tower's creatures in bubbles, pop them, collect the treats. Round 30: the Kraken King.

**Mode.** 1 or 2 players, simultaneous local co-op (same keyboard and/or gamepads; touch = P1 only).

**Themes** (one per 5 rounds; each round inside a theme gets its own colour/pattern variant):

| Theme | Rounds | Name            | Mood / palette                                    |
|-------|--------|-----------------|---------------------------------------------------|
| 0     | 1–5    | Coral Reef      | pinks, corals, warm orange                        |
| 1     | 6–10   | Kelp Forest     | greens, olive, teal                               |
| 2     | 11–15  | Sunken Ship     | wood browns, brass, rope                          |
| 3     | 16–20  | Crystal Caves   | cyan, violet, icy white highlights                |
| 4     | 21–25  | Volcanic Vents  | basalt black/grey, lava red/orange glow           |
| 5     | 26–30  | Abyss Temple    | deep blue stone, gold trim; round 30 = boss arena |

Background is near-black with a subtle theme hue (arcade readability first).

**Cast** (internal ids in `code`):

| id         | Name        | Role                                                                    |
|------------|-------------|-------------------------------------------------------------------------|
| `p1`/`p2`  | Fizz / Pop  | Upright axolotls, frilly gills, big eyes, short arms, tail. Face right. |
| `nibbler`  | Nibbler     | Wind-up clockwork fish on little legs. Walker.                          |
| `crabbit`  | Crabbit     | Crab with long bunny-like eye stalks. Walker, throws pebbles.           |
| `jellop`   | Jellop      | Jellyfish. Diagonal flyer, bounces off borders.                         |
| `springle` | Springle    | Seahorse with a coiled spring tail. Constant bouncer.                   |
| `glimmer`  | Glimmer     | Anglerfish with lantern. Hovering flyer, drops sparks downward.         |
| `bonefin`  | Bonefin     | Skeletal ghost fish. HURRY-UP chaser, invincible.                       |
| `kraken`   | Kraken King | Final boss (48×48), crowned octopus.                                    |

---------------------------------------------------------------------------------------------------

## 2. Technical architecture

### 2.1 Files

```
fizzpop/
  SPEC.md                 this file (read-only for agents)
  build.sh                bash build → dist/fizzpop.html (+ dist/bundle.js for node --check)
  src/template.html       page shell: CSS, <canvas id="screen">, touch controls, <!--@@SCRIPTS@@-->
  src/00_shared.js        C (constants) + U (utilities, seeded RNG, safe storage)
  src/10_gfx.js           const GFX     — procedural pixel art, font, tiles, logo
  src/20_audio.js         const AUDIO   — WebAudio chiptune music sequencer + SFX synth
  src/30_levels.js        const LEVELS  — 30 round definitions
  src/40_game.js          const Game    — everything that happens during play (incl. HUD)
  src/50_main.js          const Main    — boot, loop, input, scenes, hi-scores, touch, debug hooks
  tools/harness.mjs       Playwright helpers (shared by all tests)
  tools/shot.mjs          CLI: screenshot + console-error dump of any HTML file
  tools/validate_levels.mjs  structural + reachability checks for LEVELS
  test/                   per-module harness pages/scripts (prefix files with module name)
  out/                    screenshots, reports, rendered audio analyses (scratch)
  dist/fizzpop.html       THE deliverable
```

**Ownership:** each agent edits only the files it owns. Shared tooling (`build.sh`, `tools/*`) is
owned by the scaffold/integration step. Module agents put their own tests in `test/<module>_*`
and outputs in `out/<module>/`.

### 2.2 Bundling rules

`build.sh` concatenates `src/[0-9][0-9]_*.js` in lexical order into a single
`<script>(() => { "use strict"; … })();</script>` that replaces the line `<!--@@SCRIPTS@@-->` in
`src/template.html`, writes `dist/fizzpop.html`, writes the same JS to `dist/bundle.js`, runs
`node --check dist/bundle.js`, and prints the byte size. Exit non-zero on any failure.

Each module file declares **exactly one** top-level binding, built with an IIFE:

```js
const GFX = (() => { /* private stuff */ return { /* public API */ }; })();
```

(`00_shared.js` declares `C` and `U`.) No other top-level declarations, no globals except the debug
hook `window.__fizzpop` (set by Main). Modules may reference other modules' bindings only lazily
(inside functions called after load), never at load time — except everyone may use `C` and `U` at
load time. Modules must also work when loaded as separate classic `<script>` tags in the same order
(that is how per-module test pages load them).

Target: modern evergreen browsers, ES2020, no transpiling. File size target < 600 KB.

### 2.3 Coordinates and timing

- Logical screen **256×224** px, drawn into a `<canvas width=256 height=224>` that is scaled with CSS
  (`image-rendering: pixelated`; `ctx.imageSmoothingEnabled = false`).
- Fixed timestep **60 updates/s** (accumulator; max 5 catch-up steps; render once per RAF).
  All speeds below are px/frame, all times are frames unless stated otherwise.
- Tile = 8 px. Map = **32 cols × 26 rows**, drawn at screen y offset `C.MAP_Y = 16`
  (rows 0–1 of the screen = 16 px HUD). Tile (c, r) → x = c·8, y = 16 + r·8.
- World coordinates == screen coordinates. Entities store `x, y` = top-left of their sprite box (floats);
  draw at `Math.round`.
- Columns 0–1 and 30–31 are the solid outer walls (always). Inner horizontal play range x ∈ [16, 240).

### 2.4 `00_shared.js` contract

```js
const C = Object.freeze({
  W: 256, H: 224, TILE: 8, COLS: 32, ROWS: 26, MAP_Y: 16, FPS: 60,
  INNER_L: 16, INNER_R: 240,            // x bounds inside the outer walls
  STORE_PREFIX: 'fizzpop.v1.',
});
const U = {
  clamp(v, a, b), lerp(a, b, t), sign(v), approach(v, target, step),
  overlap(ax, ay, aw, ah, bx, by, bw, bh) -> bool,
  rng(seed) -> { next() /*[0,1)*/, int(a, b) /*inclusive*/, float(a, b), pick(arr), chance(p) },  // mulberry32
  store: { get(key, fallback), set(key, value) },  // JSON in localStorage, every access in try/catch,
                                                    // falls back to an in-memory map when storage throws
};
```

### 2.5 Page / Artifact rules (owned by Main, `src/template.html`)

- `<title>Fizz & Pop</title>`, `<meta charset>`, `<meta name="viewport" content="width=device-width,initial-scale=1">`.
- Page colours are CSS custom properties on `:root`; redefine them for dark mode under
  `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }` **and** under
  `:root[data-theme="dark"] { … }`. `body` gets an explicit background. (The game canvas itself
  is always dark; only the page chrome around it follows the theme.)
- No external resources of any kind. No horizontal page scroll; works at 360 px phone width with
  16 px side gutters. `localStorage` only via `U.store` (try/catch).
- Canvas scaling: largest integer scale ≥ 2 that fits the viewport (minus gutters and, on touch
  devices, the touch-control area); if even ×2 doesn't fit, fit width exactly (fractional) — keep
  aspect ratio. Recompute on resize/orientation change.
- Touch controls (shown on `(pointer: coarse)` or after the first touch event): ◀ ▶ on the left,
  JUMP and BUBBLE on the right, small PAUSE and SOUND buttons. Pointer events, true multi-touch,
  `touch-action: none` on the controls, no text selection, no long-press menu.
- Keyboard focus: if the document doesn't have focus (Artifact iframe), show a "Click to play"
  overlay; clicking focuses and unlocks audio. Prevent default scrolling for game keys.

---------------------------------------------------------------------------------------------------

## 3. Module contracts

### 3.1 GFX (`src/10_gfx.js`)

All art is generated at runtime from **hand-authored palette-indexed string grids** inside the file
(e.g. `'..1122..'` rows + a palette map), rendered once into offscreen canvases. Every sprite exists
facing right; flipping is a draw option (pre-flip into cached canvases for speed).

```js
GFX.init()                                  // build everything; idempotent; call once before drawing
GFX.draw(ctx, name, frame, x, y, opts?)     // opts: {flip:false, alpha:1, white:false}
                                            //  frame is taken modulo frame count; x,y rounded
                                            //  white:true draws a pure-white silhouette (hit flash)
GFX.frames(name) -> int     GFX.size(name) -> {w, h}     GFX.has(name) -> bool
GFX.text(ctx, str, x, y, color = '#fff', opts?)  // opts: {align:'left'|'center'|'right', scale:1, shadow:true}
                                            //  8×8 pixel font, monospace 8 px advance (×scale);
                                            //  shadow = 1 px dark drop shadow down-right; color = any CSS colour (tinted glyph cache)
GFX.textWidth(str, scale = 1) -> px
GFX.levelCanvas(levelIndex /*0-29*/, map /*26 strings*/) -> HTMLCanvasElement 256×208, cached by levelIndex
                                            //  blocks + Bubble-Bobble-style drop shadows (dark offset to the
                                            //  lower-right of solid tiles onto empty tiles); TRANSPARENT where empty
GFX.theme(levelIndex) -> { bg:'#rrggbb', accent:'#rrggbb', accent2:'#rrggbb', name:'Coral Reef' }
GFX.drawLogo(ctx, cx, y, t)                 // big bubbly "FIZZ & POP" title logo (~200×48), animated by frame counter t
GFX.sheet() -> HTMLCanvasElement            // debug: every sprite × every frame, labelled, on a dark grid
```

Font glyphs required: `A–Z 0–9 space ! ? . , : ; - + = & ' " / ( ) % * # < > _` plus `©`, `♥`,
`★`, `←`, `→` (map unknown chars to `?`). Lower-case renders as upper-case.

**Sprite registry** (exact names; sizes w×h; frame counts). All `16×16` unless noted.

| name(s)                                   | frames | notes |
|-------------------------------------------|--------|-------|
| `p1_idle` `p2_idle`                       | 2      | frame 1 = blink |
| `p1_walk` `p2_walk`                       | 4      | |
| `p1_jump` `p2_jump`                       | 1      | rising |
| `p1_fall` `p2_fall`                       | 1      | |
| `p1_shoot` `p2_shoot`                     | 2      | cheeks puffed → mouth open |
| `p1_die` `p2_die`                         | 4      | spin/dizzy collapse |
| `p1_stun` `p2_stun`                       | 2      | dizzy (fire) |
| `p1_icon` `p2_icon`                       | 1      | **8×8** head icon for lives |
| `bubble_shot`                             | 3      | growing (small → full) |
| `bubble`                                  | 2      | floating wobble; translucent aqua with highlight |
| `bubble_warn`                             | 2      | about to pop (reddish / flicker) |
| `bubble_pop`                              | 3      | burst |
| `trap_overlay`                            | 3      | drawn over an enemy's `_trapped` frame; frame = stage 0 aqua / 1 yellow / 2 red |
| `bubble_thunder` `bubble_fire` `bubble_water` | 2  | special bubbles, clearly iconic (bolt / flame / droplet inside) |
| `bubble_letter`                           | 2      | empty, vivid letter bubble; game prints the letter glyph centred on it |
| `<e>_move`                                | 4      | e ∈ nibbler crabbit jellop springle glimmer |
| `<e>_angry`                               | 4      | same frames, angry palette (hot pink/red, darker eyes) |
| `<e>_trapped`                             | 2      | struggling pose |
| `<e>_die`                                 | 4      | flung/dizzy — 0°/90°/180°/270° rotations of one pose are fine |
| `crabbit_throw` `springle_squash` `glimmer_fire` | 1 | action poses |
| `bonefin`                                 | 2      | |
| `kraken` `kraken_angry`                   | 2      | **48×48** |
| `kraken_trapped`                          | 1      | **64×64**, boss inside a giant bubble |
| `pebble` `spark` `ink`                    | 2      | **8×8** projectiles |
| `bolt`                                    | 2      | **16×8** horizontal lightning segment |
| `fire_drop`                               | 2      | **8×8** falling fireball |
| `flame`                                   | 3      | **8×16** floor flame |
| `water_flow` `water_fall`                 | 2      | **8×8** water stream tiles |
| `sparkle`                                 | 4      | **8×8** |
| `poof`                                    | 3      | enemy materialise / vanish smoke |
| `food_0` … `food_7`                       | 1      | sea grapes, kelp roll, clam, shrimp tempura, sushi, pudding, sundae, golden crown |
| `pu_shoes` `pu_pink` `pu_blue` `pu_gold` `pu_parasol` `pu_clock` `pu_bomb` `pu_heart` | 1 | power-ups (flippers, pink/blue/gold pearl, parasol, clock, star bomb, heart) |
| `moonpearl`                               | 2      | **32×32**, shimmering final treasure |

### 3.2 AUDIO (`src/20_audio.js`)

Pure WebAudio synthesis (oscillators, PeriodicWave pulse waves, noise buffers, gain envelopes,
filters). Look-ahead scheduler (`setInterval` ~25 ms, schedule ~120 ms ahead) driven by
`AudioContext.currentTime` — never by animation frames. Buses: music gain + sfx gain → master gain
→ `DynamicsCompressor` → destination.

```js
AUDIO.init()            // create/resume AudioContext; idempotent; safe to call on every user gesture
AUDIO.ready() -> bool
AUDIO.music(name, opts?)  // looped track; if `name` is already playing, do nothing unless opts.restart
AUDIO.jingle(name, opts?) // one-shot track; stops current music; opts.resume:true resumes the previous
                          //  loop afterwards; opts.onEnd callback (called even when muted)
AUDIO.stopMusic(fadeSec = 0)
AUDIO.setTempo(scale)   // 1.0 normal; 1.3 for HURRY UP (applies to the running loop immediately)
AUDIO.sfx(name, opts?)  // opts: {pitch: semitone offset, vol: 0..1}. Unknown names: console.warn once, no throw
AUDIO.setMuted(bool)  AUDIO.toggleMuted() -> bool  AUDIO.isMuted() -> bool   // persisted via U.store
AUDIO.pause() / AUDIO.resume()     // suspend/resume context (pause screen, tab hidden)
AUDIO.trackNames() -> []  AUDIO.sfxNames() -> []
AUDIO._renderOffline(name, seconds) -> Promise<{sampleRate, channels:[Float32Array,…]}>
                        // debug/test: renders a track or sfx through the SAME synth code into an
                        // OfflineAudioContext (so the synth must take ctx/destination as parameters)
```

All calls before `init()` (or with a suspended/missing context) must be silent no-ops, never throw.

**Loops:** `title`, `stage1` (rounds 1–15), `stage2` (rounds 16–29), `boss` (round 30), `entry`
(name entry), `ending`.
**Jingles:** `start` (game start, ~3 s), `extend` (~3 s), `gameover` (~4 s), `clear_boss` (~3 s).
**SFX:** `jump shoot pop trap kill bounce food powerup item_appear letter oneup death hurry ghost
thunder fire water freeze bomb menu_move menu_select pause boss_hit boss_die enemy_shot spawn land`.

### 3.3 LEVELS (`src/30_levels.js`)

```js
const LEVELS = [ /* exactly 30 objects, index = round − 1 */
  {
    map: [ /* 26 strings × 32 chars; '#' = block, '.' = empty */ ],
    enemies: [ { t: 'nibbler', c: 12, r: 4, d: 1 }, … ],   // t = type id, (c,r) = top-left tile of the
                                                           // 2×2 tile box, d = initial facing (1 right, −1 left)
    air: [ [15, 2], … ],     // 1–3 attractor points (tile coords, may be .5) where floating bubbles gather
    specials: [],            // subset of 'thunder' | 'fire' | 'water' spawning in this round
    hurry: 40,               // seconds until HURRY UP
    boss: false,             // true only for round 30
  },
];
```

Map rules (validated by `tools/validate_levels.mjs`):
1. 26 rows × 32 chars, only `#` and `.`.
2. Columns 0, 1, 30, 31 are `#` in every row.
3. Row 0 (ceiling) and row 25 (floor) are `#` except for optional gaps in cols 2–29. **Every floor
   gap column is also a ceiling gap column** (things that fall out the bottom re-enter from the top).
   Each contiguous floor-gap run is ≥ 2 tiles wide (an entity hitbox is 12 px).
4. Spawn pads: row 25 is `#` at cols 2–6 (P1) and 25–29 (P2); rows 21–24 are `.` at cols 2–6 and 25–29.
5. Walker enemies (`nibbler crabbit springle`): their 2×2 box is empty and row r+2 under it is solid
   at col c or c+1. Flyers (`jellop glimmer`): box empty, anywhere in rows 2–22.
6. Reachability (approximate jump model: a standing player can reach any platform surface up to
   **5 tiles higher** whose span is within **4 tiles horizontally**; can walk along surfaces, drop off
   edges, and wrap through floor gaps): every walker spawn surface must be reachable from the P1 pad.
7. Enemy counts: round 1 → 3, ramping to 6–8 by round 20+. Type introduction: nibbler 1+, crabbit
   4+, jellop 7+, springle 11+, glimmer 16+; later rounds mix types.
8. Round 30: `boss: true`, `enemies: [{t:'kraken', c:14, r:4, d:-1}]`, open arena with a few
   platforms and floor gaps (thunder bubbles rise from them), `specials: ['thunder']`.
9. Vertical distance between stacked platform surfaces ≤ 5 tiles (prefer 4). Platforms are
   one-way (jump through from below), so a "ceiling" never blocks except the top border.

Design for variety: symmetric classics, asymmetric mazes, staircases, pictograms (anchor, fish,
trident, shell, pearl, axolotl face, crown…), open arenas, narrow towers. No two rounds alike.
`specials` appear in roughly a third of rounds 5–29 (thunder/fire/water mixed).

### 3.4 Game (`src/40_game.js`)

Everything that happens during play: world, physics, entities, scoring, specials, round flow,
transitions, HUD, in-play music/sfx. Uses `GFX`, `AUDIO`, `LEVELS`, `C`, `U`.

```js
Game.start({ players: 1|2, level: 1, seed: 12345, hiScore: 0 })
Game.update(inputs)   // inputs = [in1, in2]; in = {left,right,jump,fire,jumpPressed,firePressed}
                      // (booleans; *Pressed = rising edge this frame; in2 all-false in 1P games)
Game.render(ctx)      // full 256×224 frame including HUD
Game.join(playerIndex) // 1 → P2 joins a running 1P game (only while alive players exist; 3 lives)
Game.isOver() -> bool  // true after the game-over sequence finished, or after the victory sequence
Game.result() -> { won, level /*highest round reached*/, scores: [s1, s2], players }
Game.debug = {
  setLevel(n),        // jump to round n (1–30) immediately (fresh round, keeps players' stats)
  killAll(),          // kill every enemy on screen as a chain (normal scoring, food drops)
  god(on),            // players can't die
  state() -> { level, phase, frame, players:[{x,y,vx,vy,lives,score,alive,onGround,power}],
               enemies:[{t,x,y,state,angry}], bubbles:[{x,y,kind,state}], items:[…],
               hurry, ghost, bossHp, letters:[…] }   // plain JSON-safe object
  spawn(type, x, y)   // spawn enemy / item / special bubble by id for tests
}
```

Game phases: `intro` (round banner "ROUND n" + "READY!", enemies fly in) → `play` → `clear`
(collect-food window) → `transition` (scroll to next round) → … ; plus `dying`, `gameover`,
`extend`, `victory`.

### 3.5 Main (`src/50_main.js` + `src/template.html`)

Boot (`GFX.init()`), canvas + scaling, input (keyboard, gamepad, touch → two virtual pads with edge
detection), fixed-step loop, scenes, hi-scores, pause, mute, focus overlay, debug hooks.

**Controls**

| | P1 | P2 |
|---|---|---|
| move | ← → | A D |
| jump | ↑ or X | W |
| bubble | Space or Z | Q or Left-Shift |
| gamepad | pad 0: stick/d-pad, A = jump, B/X = bubble | pad 1 (same) |

Enter = start/confirm, P or Esc = pause, M = mute. Touch = P1. In a 1P game, P2's bubble key (or
pad 1 A/B) calls `Game.join(1)`.

**Scenes:** `title` (logo, animated Fizz & Pop, menu: 1 PLAYER / 2 PLAYERS / CONTINUE ROUND n (only
if a previous game this session reached round ≥ 6 — continue from the first round of that theme,
score 0) / SOUND ON|OFF; music `title`) → idle 10 s cycles attract screens `story`, `howto` (cast
with names, items and point values), `scores` (top-8 table) → back. Start → `story` intro (4 s,
skippable) → `play` (Game) with `pause` overlay (RESUME / QUIT) → when `Game.isOver()`: `ending`
(if won: scrolling victory + credits, music `ending`) → `entry` (3-letter initials for each
qualifying player: ←/→ or ↑/↓ cycle the current letter, bubble/Enter confirms it, jump deletes
the last one; touch: ◀ ▶ cycle, BUBBLE confirm; music `entry`) → `scores` → `title`. Auto-pause on blur / `visibilitychange`.

Hi-scores: top 8 `{name, score, round}` in `U.store` key `scores`; default table of 8 fun entries
(FIZ, POP, KRK, …) with modest scores. Pass the current top score to `Game.start({hiScore})`.

**Debug hooks** (always present, harmless):

```js
window.__fizzpop = {
  Game, GFX, AUDIO, LEVELS, C, U,
  scene() -> name, goto(name, args?),
  input: { set(playerIndex, {left,right,jump,fire}), clear() },   // ORed with real input
  freeze(bool),          // stop the RAF loop from advancing updates (rendering continues)
  step(n),               // run n fixed updates synchronously (uses virtual input), then render
  start(players, level, seed), // jump straight into play
}
```

---------------------------------------------------------------------------------------------------

## 4. Gameplay rules (numbers are starting values; tune for feel, keep them as named constants)

### 4.1 Players
- Box 16×16, hitbox inset (2, 2, 12×14). Start lives 3 (2 reserve icons shown). Spawn: P1 (24, y),
  P2 (216, y) standing on row 25 (y = 16 + 23·8 = 200), P1 faces right, P2 faces left.
- Walk 1.25 (with `pu_shoes` 1.75). Full air control. Jump: fixed height, vy0 = −3.75, gravity
  0.16, terminal fall 2.0 → apex ≈ 44 px (clears 5 tiles). No double jump. Jump only when grounded.
- **Tile collision:** inner blocks are **one-way platforms**: an entity lands on a solid tile only
  when falling (vy ≥ 0) and its feet were at/above the tile top in the previous frame. Horizontal
  movement is blocked by solid tiles only if the entity is *not already overlapping* solid tiles
  (so you can move sideways while jumping up through a platform, but cannot walk into a block
  wall). Outer walls (cols 0–1, 30–31) are always solid. Ceiling: entities can't move above
  y = 16 + 8 (row 1) while rising.
- **Wrap:** an entity whose top passes y > 224 re-enters at y = 16 − 16 + (y − 224) (falls in through
  the ceiling gap). Bubbles never wrap. Render the playfield clipped to y ≥ 16. Map row 0 is never
  landable (entities entering from the top always pass through it).
- **Shooting:** firePressed and cooldown 0 → spawn a bubble in front (x ± 10, clamped inside walls),
  `shoot` pose 10 frames, sfx `shoot`. Cooldown 14 (`pu_blue` 8).
- **Death:** touching an active enemy, projectile, Bonefin or the boss → `die` animation 90 frames
  (sfx `death`), lose all power-ups, then respawn at spawn with 120 frames invulnerability
  (blinking). On any player death: hurry timer restarts, Bonefin leaves (enemies stay angry).
  A player with 0 lives is out; when all players are out → `gameover` (jingle `gameover`,
  "GAME OVER" 240 frames) → `Game.isOver()`.
- Extra life at 30 000, 100 000, then every 100 000 (sfx `oneup`).

### 4.2 Bubbles
- **Shot phase:** speed 4.0 (`pu_gold` 6.0), decelerating to 0 over range 48 px (`pu_pink` 80 px),
  `bubble_shot` frames while growing. Captures the first active (non-entering/dying) enemy it
  overlaps → trapped bubble (sfx `trap`). Stops at outer walls; passes through inner blocks.
- **Float phase:** 0.5 px/frame, ignoring inner blocks, staying within walls and below row 1.
  Each bubble picks the level `air` attractor with the smallest |dx| when it starts floating: it
  rises vertically, and steers horizontally toward the attractor once within 24 px of its row;
  gentle wobble near the attractor; bubbles closer than 14 px push each other apart (soft).
- **Lifetimes:** empty bubble 660 frames (last 120 → `bubble_warn`), then pops silently.
  Trapped enemy: `trapTime = max(240, 480 − 8·(round−1))` frames; stage 0 → 1 at 50 %, → 2 at 80 %
  (`trap_overlay` frame = stage); then the enemy breaks out **angry**. Cap 40 floating bubbles
  (pop the oldest empty one when exceeded).
- **Player contact:** touching a floating bubble pops it (sfx `pop`), EXCEPT when the player is
  falling onto its upper half while holding jump → bounce (vy = −3.75, sfx `bounce`, bubble survives).
  Shot-phase bubbles don't interact with players.
- **Chain reaction:** a popped bubble pops every bubble within 18 px (centre distance) after a
  4-frame delay, recursively. Each chain belongs to the player who started it.
- **Scoring:** empty bubble 10. Enemies killed in one chain: 1000, 2000, 4000, 8000, 16000, 32000,
  64000 (k-th kill ×2, cap 64000). Score popups float up 40 frames using the 8×8 font.
- A chain with ≥ 3 kills spawns a letter bubble.

### 4.3 Enemies (common)
- States: `enter` (fly from top-centre to spawn box over 90 frames, inert, `poof` at start, sfx
  `spawn`), `active`, `trapped` (owned by a bubble), `dying`, `frozen` (clock).
- `dying`: flung in an arc (vx ±1.5…2.5 random, vy −3.5), rotating via `<e>_die`, bounces off outer
  walls, after ≥ 40 frames lands on a platform → becomes food (`food_k`, k = its index in the kill
  chain, cap 7) + `sparkle`. Food points: 500, 700, 1000, 1500, 2000, 3000, 5000, 8000; food lasts
  600 frames (blink last 120), sfx `food` on pickup.
- **Angry** (escaped a bubble, or HURRY UP): speed ×1.6, `<e>_angry` sprites, more aggressive.
- Base speed scales mildly with round (+1 % per round, cap +30 %).
- Behaviours:
  - `nibbler` walker 0.6: turns at walls; at ledges 50 % turn / 50 % walk off; if a player is above
    within 48 px horizontally, 1/90 chance per frame to jump (same jump as players); may deliberately
    drop when the player is below.
  - `crabbit` walker 0.5 + Nibbler logic (jumps less): if a player is on the same row (|dy| < 8),
    in front within 120 px and cooldown 0 → stop 20 frames (`crabbit_throw`), throw `pebble`
    horizontally 2.0 (sfx `enemy_shot`); cooldown 150 (angry 90). Pebbles die at walls/solid tiles.
  - `jellop` flyer: diagonal 0.6/0.6, ignores inner blocks, bounces off outer walls, ceiling
    (row 1) and floor (row 24).
  - `springle` bouncer: whenever grounded, hops (vy −3.2) with vx 0.8, `springle_squash` 6 frames
    on landing; turns at walls; 30 % chance per hop to turn toward the nearest player.
  - `glimmer` flyer: horizontal 0.5 with ±4 px sine bob, turns at walls; every 180 frames, if a
    player is below within 24 px horizontally, `glimmer_fire` pose and drops a `spark` (1.5 down,
    dies on the first solid tile it touches).
- **HURRY UP:** at `level.hurry` s of play: flashing "HURRY UP!" 120 frames, sfx `hurry`,
  `AUDIO.setTempo(1.3)`, all enemies angry. 600 frames later **Bonefin** enters from the top centre
  (sfx `ghost`): homes on the nearest living player at 0.7, passes through everything, invincible,
  untrappable. Leaves on player death or round end.

### 4.4 Specials, letters, items
- Rounds with `specials` spawn one special bubble every 360–600 frames (max 2 alive), rising from a
  random floor-gap column (or a random x at row 24 if there are no floor gaps). They float like
  bubbles and expire after 900 frames.
  - **thunder:** on pop (sfx `thunder`) a `bolt` flies horizontally from the bubble in the popping
    player's facing direction at 4.0 until an outer wall; kills active enemies it touches (chain
    scoring per bolt); damages the boss.
  - **fire:** on pop (sfx `fire`) a `fire_drop` falls at 2.0 until it lands on a solid tile; then
    `flame`s burn on that tile and up to 2 tiles left/right where floor exists, 240 frames. Flames
    kill enemies; players touching flames are stunned 60 frames (`<p>_stun`, can't move) — not killed.
  - **water:** on pop (sfx `water`) a stream of up to 12 segments: the head falls at 3.0, on
    landing flows horizontally at 2.0 (away from the nearer outer wall), falls off ledges, reverses
    at walls, exits through floor gaps (or evaporates after 360 frames). Enemies touched by the head
    are carried and die when the stream ends (chain scoring; food at the end point). Players ignore water.
- **EXTEND letters:** every 900 frames 50 % chance (and on ≥ 3-kill chains) a letter bubble rises like
  a special, carrying one of E X T E N D that the leading player still lacks. Popping collects it
  for that player (sfx `letter`; +500 if already owned). Collected letters are shown down the side
  walls (P1 left, P2 right). All six → `extend` phase: jingle `extend`, "EXTEND" banner, +1 life,
  letters reset, then the round is cleared (skip to transition).
- **Power-up item:** once per round (not boss), at a random time 600–1200 frames into play, one
  power-up appears on a random standable spot not within 32 px of a player (sfx `item_appear`),
  lasts 600 frames. Pickup = 1000 points + effect (sfx `powerup`). Weights: shoes 15, pink 15,
  blue 15, gold 12, clock 12, bomb 8, parasol 5, heart 3.
  - shoes/pink/blue/gold: lasting buffs until death. clock: freeze all enemies 300 frames (sfx
    `freeze`; frozen enemies are harmless and trappable, drawn with blue tint/blink).
    bomb: screen flash, kill all active enemies as one chain (sfx `bomb`). parasol: clear round now
    and skip 3 rounds (never past 29). heart: +1 life.

### 4.5 Round flow
- `intro` 150 frames: "ROUND n" then "READY!", enemies `enter`. Music by round (`stage1`, `stage2`,
  `boss`), tempo 1.0. First round of a game: jingle `start` first, then the loop.
- Round is cleared when no enemies are active/trapped/dying/entering. Then `clear` phase: up to 300
  frames to grab food (ends 60 frames after the last food is taken). Then `transition`: 120-frame
  vertical scroll (old round slides up, new round comes in from below) while players ride bubbles
  to their spawn points; leftover bubbles/items vanish; extra lives granted mid-scroll are fine.
- Round 30 (boss): Kraken King, 48×48 box (hitbox inset 6), HP 60 (90 in 2P); bounces diagonally
  0.8 (speeds up to 1.4 as HP drops; `kraken_angry` below 50 %); every 120 frames a 5-way `ink`
  spread toward the nearest player (1.4). Thunder bubbles rise every 45 frames (max 6). Each bolt hit:
  −1 HP, +100, sfx `boss_hit`, white flash 4 frames. HP 0 → `kraken_trapped` floats slowly upward;
  touching it pops it (jingle `clear_boss`, sfx `boss_die`, particle burst) → `moonpearl` drops,
  collect for 100 000 → `victory` 240 frames ("THE MOON PEARL IS SAFE!") → `isOver()` with
  `won: true`.
- After round 29 is cleared → round 30. HURRY UP also applies in round 30 (Bonefin included).

### 4.6 HUD (drawn by Game)
Screen row 0: `1UP` (P1 colour, left), `HI SCORE` (centre, red/coral), `2UP` (P2 colour, right; in a
1P game blink "PUSH Q"). Screen row 1: the three scores right-aligned under their labels. Round
number printed on the left wall at map rows 0–1 (2 digits, theme accent colour). Lives: reserve
icons stacked on the bottom of the outer walls (P1 left, P2 right). Collected EXTEND letters down
the side walls (rows 4–9).

---------------------------------------------------------------------------------------------------

## 5. Art direction (GFX)

- Cute, chunky, high-contrast arcade pixel art, a "Bubble Bobble meets aquarium" vibe — but every
  design original. 1 px dark outline (`#1b1033`-ish, not pure black) on characters/items, light from
  top-left, ≤ 8 colours per sprite plus outline, consistent proportions (big heads, readable at ×1).
- Fizz: bubblegum pink body, magenta frills (3 per side), white eye highlights, cream belly.
  Pop: same shape, aqua/lavender palette. Distinguishable instantly.
- Bubbles: translucent (partial-alpha pixels allowed) aqua with bright crescent highlight; must
  read clearly over every theme's blocks.
- Enemies: distinct silhouettes and colours per type (readable at a glance); angry palette = hot
  pink/red with darker eyes.
- Tiles: 30 distinct round looks = 6 theme patterns × 5 colour/detail variants (e.g. coral knobs,
  kelp-wrapped stones, wooden planks with nails, faceted crystals, cracked basalt with lava seams,
  gold-trimmed temple bricks). BB-style dark drop shadow onto empty tiles to the lower-right.
- Font: chunky 8×8 arcade font, original glyph shapes, legible at ×1.
- Logo: puffy bubble letters, pink→aqua gradient, outline, highlight, gentle wobble/shine.

## 6. Audio direction (AUDIO)

- 4-voice chiptune feel: pulse lead (25 % duty), pulse harmony/arpeggio (12.5 %), triangle bass,
  noise drums (kick/snare/hat via filtered noise + pitch-swept sine kick). Optional light echo on lead.
- **Original compositions only** — do not quote or paraphrase the Bubble Bobble theme or any known tune.
- `stage1`: bouncy, catchy major-key "underwater carnival", ~150 BPM, swung 8ths, clear hook,
  A–A–B–A form, ≥ 32 bars before looping, seamless loop. `stage2`: same energy but mysterious
  (dorian/minor), new melody. `boss`: driving minor, ~170 BPM. `title`: short fanfare into a hook.
  `entry`: relaxed loop. `ending`: triumphant then tender. Jingles: crisp and recognisable.
- SFX: bubbly and juicy — pitch sweeps, blips, filtered noise. Short (mostly < 0.4 s), clearly
  distinguishable, consistent loudness, per-sfx voice limiting (e.g. ≤ 3 concurrent `pop`).
- Mix: no clipping (peak < 0.9 after the compressor), music sits under SFX, nothing piercing.
- Store compositions compactly (tracker-like strings or arrays), tempo-independent so
  `setTempo` works mid-loop.

---------------------------------------------------------------------------------------------------

## 7. Testing conventions

- Playwright: `const { chromium } = createRequire(import.meta.url)('playwright')` works (global
  install, `NODE_PATH` is set). Chromium is pre-installed — **never run `playwright install`**.
  `tools/harness.mjs` wraps launching, console/pageerror capture, `__fizzpop` helpers, screenshots
  (upscaled ×3 nearest-neighbour for viewing).
- You can **look at screenshots** with the Read tool (PNG) — do it, judge them critically, iterate.
- Determinism: use `__fizzpop.freeze(true)` + `step(n)` + `input.set(...)` for scripted play;
  `Game.start({seed})` makes runs reproducible.
- Every test run must report console errors/page errors; zero is the bar.
- Write outputs to `out/<area>/`; keep test scripts in `test/` so others can re-run them.

## 8. Definition of done

`./build.sh` succeeds; `dist/fizzpop.html` opens with zero console errors; title → 1P/2P game →
all 30 rounds reachable (`debug.setLevel`/`killAll`) → boss defeatable → ending → name entry →
hi-score table; works with keyboard, gamepad code paths, and touch at phone size; audio starts on
first gesture, mute persists, no clipping; 60 fps with ≤ 3 ms update+render on a desktop.
