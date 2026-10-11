/* FIZZ & POP — 40_game.js
 * Everything that happens during play (SPEC §3.4 and §4): world, physics, players, bubbles, enemies,
 * specials, items, round flow, boss, HUD, in-play music/sfx.
 *
 * Architecture
 *  - One private state object `S` per game. Entity arrays per kind (players, enemies, bubbles, proj,
 *    bolts, drops, flames, streams, items, fx, popups). Every update pass only marks entities `dead`;
 *    `compact()` filters the arrays once at the end of the frame (never splice while iterating).
 *  - One shared physics helper `physStep` for every walker (players, Nibbler, Crabbit, Springle, dying
 *    enemies) implementing the one-way platform rules of SPEC §4.1. Flyers move by their own rules.
 *  - Explicit phase machine: intro -> play -> clear -> transition -> intro ...; plus extend, gameover,
 *    victory. Per-player states (normal / dying / out) are separate; the phase reported by
 *    debug.state() is 'dying' while nobody can act but somebody is still in the death animation.
 *  - All randomness goes through the seeded U.rng stored in S (render never consumes randomness).
 *
 * Choices where the SPEC is silent (all tunable via the named constants below); FIXPLAN wave 2 amends SPEC §4
 *  - Jump: y += (vy + vy') / 2 (exact kinematics) gives an apex of 43.9 px for vy0 = -3.75, g = 0.16.
 *    A 4-frame jump buffer is added so a press just before landing is not lost; a 4-frame FIRE buffer remembers
 *    presses made while the bubble cooldown is still running; 5 frames of coyote time after walking off an edge.
 *  - Landable surfaces: a solid tile whose tile above is empty (rows 1..25). Thick platforms therefore
 *    only catch from their top face; falling through their inside never snaps to an inner row. Players stand
 *    only with 4 px of the 12 px body over a platform (no floating beyond the edge); enemies land on any overlap.
 *  - A bubble the player has just shot cannot be popped by that player until it has floated out of
 *    contact with the shooter (otherwise shooting at point blank against a wall would pop it at once).
 *  - After a bounce a player cannot pop bubbles for 10 frames (the player is still touching the top of
 *    the bubble for a few frames while rising). Bubbles with no room above them (ceiling) pop instead of bouncing.
 *  - Attractor (`air`) points are bubble CENTRES: x = col*8, y = 16 + row*8. Bubbles starting below the
 *    attractor row rise to it and hover (wobble) there; bubbles above it rise to the ceiling and slide
 *    to the attractor column while touching the ceiling. A crowd fans out sideways along the ceiling
 *    (PUSH_DIST 17 < CHAIN_DIST 18, so neighbours stay chain-connected).
 *  - Special bubbles (thunder/fire/water) also react to chain reactions started by neighbouring bubbles.
 *    Thunder fires TWO bolts (both ways, never one that would be born inside a wall) that score as one chain;
 *    in the boss round ONE bolt flies toward the Kraken and drifts toward its height (BOLT_HOMING px/frame).
 *    Fire spreads 4 tiles each side; water flows toward the nearest enemy (prefers the platform it lands on).
 *  - Periodic EXTEND letters are not spawned in the boss round; EXTEND completion there only grants the life.
 *    During the extend phase all six letters stay lit (flashing) on the wall panel; they reset when it ends.
 *  - Parasol: clears the round immediately (no score) and skips to min(29, round + 4); in round 29 the
 *    next round is the boss round.
 *  - Walkers: bumping into walls 4 times within 90 frames makes them hop (pits/notches must never hold an enemy
 *    forever). Enemy walkers climb one-tile steps and may rise into the ceiling row (players stop at row 1).
 *    WATCHDOG: a walker's travel is boxed in 120-frame slices; one whose last 3 slices (6 s) fit in 64x72 px gets a
 *    50-frame "free pass" hop (blocks ignored) toward the nearest player; still confined one slice later it is
 *    poofed to a standable spot >= 64 px from every player.
 *  - Intro: enemies fly in and then wait INERT at their spawn (no contact, no AI) until phase `play`; players get
 *    60 frames of grace at play start. The Kraken glides in over the whole intro and starts in a seeded-random direction.
 *  - A player on 0 lives who is still dying when the round ends is `out` (never revived); if nobody is left the game ends.
 *  - Flames stun a player for 60 frames and grant 60 frames of flame immunity afterwards (no stun-lock).
 *  - Water stream carries enemies on its head; they die (chain) when the stream ends and are flung like
 *    any other kill, so the food lands near the end point.
 *  - Boss: 40 HP (60 in 2P; P2 joining scales the pool proportionally and never heals), NET speed 0.8 -> 1.2 px/frame,
 *    shot bubbles pass through it; only thunder bolts hurt it (each bolt hits once). Ink: 22-frame telegraph (angry face
 *    + white pulses), then a 4-bullet fan with no bullet at the centre (outer two only when a player is within 48 px).
 *    Phase 2 (< 50 % HP) = angry + music tempo 1.1; hurry in the boss round = tempo 1.15. When HP is 0 the boss bubble
 *    (`kraken_trapped`) floats upward at 0.3 px/frame and is popped by touch: boss_die at once, clear_boss fanfare 60 frames
 *    later with the ending music queued behind it. Beating the Kraken clears Bonefin / HURRY UP for good.
 *  - Presentation (v2 "Abyss Glow", SPEC_V2 sec. 1 and 4): chain popups stack 9 px apart; the next round's level canvas / backdrop
 *    are built during the clear phase and drawn at 256 x 208 logical px (GFX returns k x resolution canvases). Everything the
 *    player sees beyond the sprites is COSMETIC and lives in separate state (S.parts, S.vrng, the trail buffers) that no mechanic
 *    reads: ambient plankton + light motes (stateless, a function of S.frame), motion trails (ghost blits of the baked sprite),
 *    shockwave rings on every pop, spark bursts on kills / pickups, glow pulse on items, chain light (a tinted wash, see flash()),
 *    HUD of thin glowing numbers + pearls, neon banners on a soft dark gradient band, boss gauge = thin neon bar with a crown.
 *    The cosmetic RNG is its own stream (S.vrng): the game's S.rng is never consumed by effects, so every seed plays out exactly as
 *    before. Photosensitivity (binding): full-screen flashes are <= 12 % alpha and their onsets >= 20 frames apart (<= 3 per second).
 *    Game.setOptions({reducedMotion, quality}): reducedMotion = no flashes, no trails, half the ambient particles, steady instead of
 *    blinking cues; quality 0 / 1 / 2 scales ambient count, particle cap and burst size (trails need quality >= 1).
 *    GFX.particle / GFX.draw {tint, glow} are feature-detected (typeof GFX.particle === 'function'); without them simple canvas
 *    fallbacks are drawn. The banner text asks for {outline}.
 *  - Debug extras (non-contract): debug._S(), skipIntro(), clearEnemies(), noClear(on), setPlayer(),
 *    setHurryTimer(), give(), addScore(). `spawn` also accepts 'bonefin', 'kraken', 'letter', 'food_N',
 *    'pu_xxx' (or just 'shoes'...), 'moonpearl'.
 *  - Game.start({joinHint}) = text blinked in the 2UP slot of 1P games (default 'PUSH Q'; '' hides it).
 *
 * Sprites used: p1_/p2_ idle walk jump fall shoot die stun icon; bubble_shot bubble bubble_warn
 * bubble_pop trap_overlay bubble_thunder bubble_fire bubble_water bubble_letter; <e>_move <e>_angry
 * <e>_trapped <e>_die for nibbler crabbit jellop springle glimmer; crabbit_throw springle_squash
 * glimmer_fire bonefin kraken kraken_angry kraken_trapped pebble spark ink bolt fire_drop flame
 * water_flow water_fall sparkle poof food_0..7 pu_shoes pu_pink pu_blue pu_gold pu_parasol pu_clock
 * pu_bomb pu_heart moonpearl.
 * SFX used: jump shoot pop trap kill bounce food powerup item_appear letter oneup death hurry ghost
 * thunder fire water freeze bomb boss_hit boss_die enemy_shot spawn land clear.
 * Tracks: music stage1 stage2 boss ending; jingles start extend gameover clear_boss.
 */
const Game = (() => {
  // ================================================================================================
  // Tuning constants (SPEC §4). Speeds are px/frame, times are frames.
  // ================================================================================================
  const T = C.TILE, MAP_Y = C.MAP_Y, COLS = C.COLS, ROWS = C.ROWS;
  const MAP_H = ROWS * T;                    // 208
  const PLAY_TOP = MAP_Y + T;                // entities cannot rise above this y (row 1)
  const SCREEN_H = C.H;                      // 224: wrap line for things that fall out of the bottom
  const FLOOR_ROW_Y = MAP_Y + (ROWS - 1) * T;// 216: top of the floor row
  const EPS = 1e-4;

  // physics (players and walkers)
  const GRAVITY = 0.16, TERMINAL = 2.0, JUMP_V = -3.75;
  const BODY_X = 2, BODY_W = 12, BODY_Y = 2, BODY_H = 14;   // collision / hit box inset of 16x16 sprites
  const JUMP_BUFFER = 4, FIRE_BUFFER = 4, COYOTE_FRAMES = 5;
  const FOOT_SUPPORT = 4;                    // px of the 12 px body that must overlap a platform for a player to stand

  // players
  const LIVES_START = 3;
  const WALK = 1.25, WALK_SHOES = 1.75;
  const SPAWN_X = [24, 216], SPAWN_Y = 200;
  const DIE_FRAMES = 90, RESPAWN_INV = 120, JOIN_INV = 120;
  const SHOOT_COOLDOWN = 14, SHOOT_COOLDOWN_BLUE = 8, SHOOT_POSE = 10, SHOT_OFFSET = 10;
  const EXTRA_LIFE_FIRST = 30000, EXTRA_LIFE_EVERY = 100000;
  const STUN_FRAMES = 60, FLAME_IMMUNE_FRAMES = 60;
  const BOUNCE_NOPOP = 10;

  // bubbles
  const SHOT_SPEED = 4.0, SHOT_SPEED_GOLD = 6.0, SHOT_RANGE = 48, SHOT_RANGE_PINK = 80, SHOT_RANGE_GOLD = 64;
  const FLOAT_SPEED = 0.5, ATTRACT_WINDOW = 24;
  const EMPTY_LIFE = 660, WARN_FRAMES = 120, SPECIAL_LIFE = 900, BUBBLE_CAP = 40;
  const TRAP_MIN = 240, TRAP_BASE = 480, TRAP_DECAY = 10;
  const PUSH_DIST = 17, PUSH_MAX = 1.5, CHAIN_DIST = 18, CHAIN_DELAY = 4;
  const POP_ANIM_FRAMES = 9;
  const SCORE_EMPTY = 10, CHAIN_BASE = 1000, CHAIN_CAP = 64000;
  const CHAIN_LETTER_KILLS = 3;
  const BOUNCE_V = -3.75;

  // enemies
  const ENTER_FRAMES = 90, ENTER_STAGGER = 6;
  const DYING_MIN = 40, DYING_MAX = 900;
  const FOOD_POINTS = [500, 700, 1000, 1500, 2000, 3000, 5000, 8000];
  const FOOD_LIFE = 600, FOOD_BLINK = 120;
  const ANGRY_MULT = 1.6, SPEED_PER_ROUND = 0.01, SPEED_CAP = 0.30;
  const ANGRY_CAP = 1.2, JELLOP_ANGRY_MULT = 1.35;      // angry walkers / springles never outrun the player (WALK 1.25)
  const NIBBLER_SPEED = 0.6, CRABBIT_SPEED = 0.5, JELLOP_SPEED = 0.6, SPRINGLE_VX = 0.8, GLIMMER_SPEED = 0.5;
  const SPRINGLE_HOP = -3.2, SQUASH_FRAMES = 6;
  const JUMP_CHANCE = 1 / 90, JUMP_RANGE_X = 48, DROP_CHANCE = 1 / 150;
  const BUMP_WINDOW = 90, BUMP_ESCAPE = 4;               // 4 wall bumps within 90 frames: jump out of a pit/notch
  const WD_STEP = 120, WD_SPAN = 3, WD_BOX_X = 64, WD_BOX_Y = 72, WD_PASS = 50, WD_REPEAT = 1500;   // walker watchdog (see watchdogTick)
  const STEP_UP = 8;                                      // enemy walkers climb one-tile steps
  const CRAB_THROW_RANGE = 120, CRAB_STOP = 20, CRAB_COOLDOWN = 150, CRAB_COOLDOWN_ANGRY = 90, PEBBLE_SPEED = 2.0;
  const GLIMMER_COOLDOWN = 180, GLIMMER_COOLDOWN_ANGRY = 100, SPARK_SPEED = 1.5, GLIMMER_POSE = 14;
  const GHOST_DELAY = 600, GHOST_SPEED = 0.7, HURRY_BANNER = 120, HURRY_TEMPO = 1.3, HURRY_TEMPO_BOSS = 1.15;
  const FREEZE_FRAMES = 300;

  // specials, letters, items
  const SPECIAL_MIN = 360, SPECIAL_MAX = 600, SPECIAL_ALIVE_MAX = 2;
  const BOLT_SPEED = 4.0, BOLT_HOMING = 0.5, DROP_SPEED = 2.0, FLAME_FRAMES = 240, FLAME_SPREAD = 4;
  const STREAM_FALL = 3.0, STREAM_FLOW = 2.0, STREAM_SEGMENTS = 12, STREAM_LIFE = 360;
  const LETTERS = 'EXTEND', LETTER_PERIOD = 900, LETTER_DUP_BONUS = 500;
  const PU_MIN = 600, PU_MAX = 1200, PU_LIFE = 600, PU_POINTS = 1000, PU_AVOID = 32;
  const PU_WEIGHTS = [['shoes', 15], ['pink', 15], ['blue', 15], ['gold', 12], ['clock', 12],
                      ['bomb', 8], ['parasol', 5], ['heart', 3]];

  // round flow
  const INTRO_FRAMES = 150, CLEAR_MAX = 300, CLEAR_IDLE = 60, TRANSITION_FRAMES = 120, INTRO_INV = 60;
  const GAMEOVER_FRAMES = 240, VICTORY_FRAMES = 240, EXTEND_FRAMES = 180;
  const PARASOL_SKIP = 4;                    // next round = round + 4 (skips three)

  // boss (SPEC §4.5)
  const BOSS_HP_1P = 40, BOSS_HP_2P = 60, BOSS_SPEED_MIN = 0.8, BOSS_SPEED_MAX = 1.2;   // speeds are NET (diagonal) magnitudes
  const BOSS_INK_PERIOD = 120, INK_WIND = 22, INK_NEAR = 48, INK_STEP = 0.3, INK_SPEED = 1.4, BOSS_FLASH = 4;
  const BOSS_THUNDER_PERIOD = 30, BOSS_THUNDER_MAX = 8, BOSS_PHASE2_TEMPO = 1.1;
  const BOSS_BUBBLE_RISE = 0.3, PEARL_POINTS = 100000, BOSS_HIT_POINTS = 100, FANFARE_DELAY = 60;

  // caps (keep entity counts bounded)
  const FX_CAP = 160, POPUP_CAP = 60, PROJ_CAP = 80, POPUP_STACK = 9;

  // v2 presentation (cosmetic only; see the header). Quality-indexed tables are [0, 1, 2].
  const FLASH_MAX = 0.12, FLASH_COOL = 20;          // photosensitivity: full-screen flash <= 12 % alpha, onsets >= 20 frames apart (<= 3 / s)
  const PART_CAP = [80, 140, 220];                   // live cosmetic particles
  const AMBIENT_N = [40, 56, 80];                    // drifting plankton specks (halved under reduced motion)
  const MOTE_MAX = 14;                               // slow light motes orbiting floating bubbles
  const TRAIL_N = 8, TRAIL_BACK = [3, 6], TRAIL_A = [0.24, 0.12];   // trail ring buffer, ghost offsets (frames back), ghost alpha

  const PLAYER_COLOR = ['#ff3ea5', '#3cf2ff'], PLAYER_HOT = ['#ffd9ee', '#d9fcff'];
  const HUE = { cyan: '#3cf2ff', magenta: '#ff3ea5', lime: '#b6ff3b', amber: '#ffb23e', violet: '#8a5cff', white: '#eaffff', ember: '#ff6a3d',
                cobalt: '#3d7bff', crimson: '#ff2a2a', purple: '#bb4fd9', gold: '#ffd23f', ice: '#aef0ff', mint: '#7dffb0' };
  const ENEMY_HUE = { nibbler: HUE.amber, crabbit: HUE.ember, jellop: HUE.violet, springle: HUE.lime, glimmer: HUE.cobalt, kraken: HUE.purple };
  const FOOD_HUE = [HUE.amber, '#ff9a5a', '#ffe27a', HUE.ember, HUE.magenta, HUE.lime, HUE.cyan, HUE.white];
  const PU_HUE = { shoes: HUE.cyan, pink: HUE.magenta, blue: HUE.cobalt, gold: HUE.gold, parasol: HUE.violet, clock: '#9cecff', bomb: HUE.ember, heart: '#ff4a7a' };
  const OPT = { reducedMotion: false, quality: 2 };
  const ENEMY_TYPES = ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer', 'kraken'];
  const NO_INPUT = Object.freeze({ left: false, right: false, jump: false, fire: false, jumpPressed: false, firePressed: false });

  // ================================================================================================
  // State
  // ================================================================================================
  let S = null;
  let musicSerial = 0;                         // invalidates stale jingle onEnd callbacks across games/rounds

    const lvDef = () => LEVELS[S.level - 1];
  const hurrySeconds = (L) => (L.hurry > 0 ? L.hurry : 40);
  const sfx = (name, opts) => { AUDIO.sfx(name, opts); };
  const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
  const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

  function makePlayer(i) {
    return {
      i, x: SPAWN_X[i], y: SPAWN_Y, vx: 0, vy: 0, face: i === 0 ? 1 : -1, onGround: true,
      state: 'normal',                       // 'normal' | 'dying' | 'out'
      lives: LIVES_START, score: 0, nextLife: EXTRA_LIFE_FIRST,
      power: { shoes: false, pink: false, blue: false, gold: false },
      letters: [false, false, false, false, false, false],
      cooldown: 0, shootT: 0, inv: 0, stunT: 0, flameImmune: 0, jumpBuf: 0, fireBuf: 0, coyote: -1, noPopT: 0,
      dieT: 0, animT: 0, inputJump: false, hitWall: false,
    };
  }

  // ================================================================================================
  // Map queries and physics
  // ================================================================================================
  /** Solid tile test: outer columns are always solid; rows above the map are empty (top entry) and rows
   *  below are empty (things fall out and wrap). */
  function isSolid(c, r) {
    if (c < 0 || c >= COLS) return true;
    if (r < 0 || r >= ROWS) return false;
    return S.solid[r * COLS + c] === 1;
  }
  /** A tile that catches a falling entity: solid, with empty space above, never row 0. */
  function isLandable(c, r) { return r >= 1 && r < ROWS && isSolid(c, r) && !isSolid(c, r - 1); }

  /** Does the 12x14 body box of a 16x16 sprite at (x, y) overlap any solid tile? */
  function bodyHitsSolid(x, y) {
    const c0 = Math.floor((x + BODY_X) / T), c1 = Math.floor((x + BODY_X + BODY_W - EPS) / T);
    const r0 = Math.floor((y + BODY_Y - MAP_Y) / T), r1 = Math.floor((y + BODY_Y + BODY_H - EPS - MAP_Y) / T);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (isSolid(c, r)) return true;
    return false;
  }

  /** Tile-top y an entity with horizontal extent [xa, xb) lands on when its feet go from f0 to f1 (falling).
   *  Returns null when nothing catches it. Requires feet to have been at/above the tile top before.
   *  `minSup` = how many px of [xa, xb) must lie over landable tiles (default: any overlap; players are eased off thin edges by easeOffEdge). */
  function landingY(xa, xb, f0, f1, minSup) {
    const rb = Math.ceil((f0 - MAP_Y - EPS) / T);
    if (rb < 1 || rb >= ROWS) return null;
    const top = MAP_Y + rb * T;
    if (top > f1 + EPS) return null;
    const c0 = Math.floor(xa / T), c1 = Math.floor((xb - EPS) / T);
    let sup = 0;
    for (let c = c0; c <= c1; c++) if (isLandable(c, rb)) sup += Math.min(xb, (c + 1) * T) - Math.max(xa, c * T);
    return sup >= (minSup || 1e-6) ? top : null;
  }

  /** Top y of the first landable surface at or below feet line `f0` over [xa, xb), or null (open floor gap). */
  function surfaceBelow(xa, xb, f0) {
    const c0 = Math.floor(xa / T), c1 = Math.floor((xb - EPS) / T);
    for (let rb = Math.max(1, Math.ceil((f0 - MAP_Y - EPS) / T)); rb < ROWS; rb++) {
      for (let c = c0; c <= c1; c++) if (isLandable(c, rb)) return MAP_Y + rb * T;
    }
    return null;
  }

  /** Horizontal move with outer-wall clamp and block collision. Returns true when blocked.
   *  Blocks only stop an entity that is not already overlapping solid tiles (SPEC §4.1).
   *  Enemy walkers (anything with a type `t`, never the Kraken) climb one-tile steps instead of bumping. */
  function moveX(e, dx, blockInner) {
    let nx = e.x + dx, blocked = false;
    if (nx < C.INNER_L) { nx = C.INNER_L; blocked = true; }
    else if (nx > C.INNER_R - 16) { nx = C.INNER_R - 16; blocked = true; }
    if (blockInner && !bodyHitsSolid(e.x, e.y) && bodyHitsSolid(nx, e.y)) {
      if (e.t && e.t !== 'kraken' && e.y - STEP_UP >= MAP_Y && !bodyHitsSolid(nx, e.y - STEP_UP)) {
        e.y -= STEP_UP; e.x = nx;
        return blocked;
      }
      if (dx > 0) {
        const col = Math.floor((nx + BODY_X + BODY_W - EPS) / T);
        nx = Math.max(e.x, col * T - BODY_X - BODY_W);
      } else {
        const col = Math.floor((nx + BODY_X) / T);
        nx = Math.min(e.x, (col + 1) * T - BODY_X);
      }
      blocked = true;
    }
    e.x = nx;
    return blocked;
  }

  /** Players need FOOT_SUPPORT px of body over a platform to stand. A landing always happens on ANY overlap (a failed
   *  landing would sink the body into the platform end), but a player whose platform carries less than that is eased
   *  0.75 px/frame away from the platform's centre of support until the overlap is gone, so they slide off the edge
   *  and fall beside the block. Never nudges the body into a wall. */
  function easeOffEdge(e, top) {
    const rb = Math.round((top - MAP_Y) / T), xa = e.x + BODY_X, xb = xa + BODY_W;
    let sup = 0, cx = 0;
    for (let c = Math.floor(xa / T); c <= Math.floor((xb - EPS) / T); c++) {
      if (!isLandable(c, rb)) continue;
      const o = Math.min(xb, (c + 1) * T) - Math.max(xa, c * T);
      sup += o; cx += o * (c * T + T / 2);
    }
    if (!(sup > 0 && sup < FOOT_SUPPORT)) return;
    const nx = U.clamp(e.x + ((xa + BODY_W / 2) - cx / sup >= 0 ? 0.75 : -0.75), C.INNER_L, C.INNER_R - 16);
    if (!bodyHitsSolid(nx, e.y)) e.x = nx;
  }

  /** Shared walker physics: x move, gravity, one-way landing, ceiling, bottom wrap.
   *  Players stop at row 1 and are eased off platform edges that carry < FOOT_SUPPORT px (easeOffEdge); enemies (they
   *  have a type `t`) land on any overlap and may rise into the ceiling row, so a hop can always clear a 1-tile lip
   *  (the clamp never pushes an entity that is already above the limit back down into a platform). */
  function physStep(e, blockInner, canLand) {
    e.hitWall = e.vx !== 0 ? moveX(e, e.vx, blockInner) : false;
    const vy1 = Math.min(e.vy + GRAVITY, TERMINAL);
    const dy = (e.vy + vy1) / 2;
    const y0 = e.y;
    e.y += dy;
    e.vy = vy1;
    e.onGround = false;
    if (dy >= 0) {
      if (canLand) {
        const top = landingY(e.x + BODY_X, e.x + BODY_X + BODY_W, y0 + 16, e.y + 16, 0);
        if (top !== null) {
          e.y = top - 16; e.vy = 0; e.onGround = true;
          if (!e.t) easeOffEdge(e, top);
        }
      }
    } else {
      const ceil = e.t ? MAP_Y : PLAY_TOP;
      if (e.y < ceil) { e.y = Math.min(y0, ceil); e.vy = 0; }
    }
    if (e.y > SCREEN_H) e.y -= SCREEN_H;                // fell out of a floor gap: re-enter from the top
  }

  const playerRect = (p) => [p.x + BODY_X, p.y + BODY_Y, BODY_W, BODY_H];
  function foeRect(e) { return e.t === 'kraken' ? [e.x + 6, e.y + 6, 36, 36] : [e.x + 2, e.y + 2, 12, 12]; }
  const hits = (a, b) => U.overlap(a[0], a[1], a[2], a[3], b[0], b[1], b[2], b[3]);

  function nearestPlayer(cx, cy) {
    let best = null, bd = Infinity;
    for (const p of S.players) {
      if (p.state !== 'normal') continue;
      const d = Math.hypot(p.x + 8 - cx, p.y + 8 - cy);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  // ================================================================================================
  // Scoring, popups, particles
  // ================================================================================================
  /** Floating score text. Popups that would overlap a live one (same spot, chain kills) stack upward. */
  function popup(x, y, text, color) {
    if (S.popups.length >= POPUP_CAP) S.popups.shift();
    text = String(text);
    let yy = y;
    for (let k = 0; k < 8; k++) {
      yy = y - k * POPUP_STACK;
      if (!S.popups.some((q) => Math.abs(q.x - x) < (q.text.length + text.length) * 4 && Math.abs(q.y - yy) < POPUP_STACK)) break;
    }
    S.popups.push({ x, y: yy, text, color: color || '#fff', t: 0 });
  }
  const popupColor = (pts) => (pts >= 4000 ? '#ff7a5e' : pts >= 2000 ? '#ffb23e' : pts >= 1000 ? '#ffe27a' : '#eaffff');

  function addFx(sprite, x, y, dur, tick, o) {
    if (S.fx.length >= FX_CAP) S.fx.shift();
    S.fx.push(Object.assign({ sprite, x, y, t: 0, dur, tick: tick || 4, vx: 0, vy: 0, g: 0, dead: false }, o));
  }
  const poof = (x, y) => addFx('poof', x, y, 18, 6);
  const sparkle = (x, y) => addFx('sparkle', x, y, 16, 4);

  // ---- v2 cosmetic effects: particles, rings, bursts, flash, trail buffers ---------------------------------------------------
  // Nothing in here is read by a mechanic. Spawning happens in update (fixed step) and uses ONLY the cosmetic stream S.vrng.
  const qScale = () => [0.4, 0.7, 1][OPT.quality] * (OPT.reducedMotion ? 0.6 : 1);

  function addPart(p) {
    const L = S.parts, cap = PART_CAP[OPT.quality];
    while (L.length >= cap) L.shift();                                      // oldest goes first (also trims the pool after a quality drop)
    p.t = 0; p.dead = false;
    L.push(p);
  }
  /** Expanding (r1 > r0) or imploding (r1 < r0) neon ring: the shockwave of a pop. */
  function ring(x, y, col, r0, r1, dur, a) {
    addPart({ k: 'ring', x, y, vx: 0, vy: 0, g: 0, dur, s0: r0, s1: r1, col, a: a === undefined ? 0.85 : a, rot: 0 });
  }
  /** A soft additive light pool (chain light) that swells and fades. */
  function pool(x, y, col, size, dur, a) {
    addPart({ k: 'dot', x, y, vx: 0, vy: 0, g: 0, dur, s0: size, s1: size * 1.25, col, a, rot: 0 });
  }
  /** n sparks / droplets / streaks flying out of (x, y); n is scaled by quality and reduced motion. */
  function burst(x, y, col, n, speed, o) {
    n = Math.round(n * qScale());
    n = Math.min(n, Math.max(3, S.burstBudget));                              // a mass kill (bomb, long chain) must not blow the frame out to white
    S.burstBudget -= n;
    if (n <= 0) return;
    const R = S.vrng, g = o && o.g !== undefined ? o.g : 0.035, sz = (o && o.size) || 1.5, life = (o && o.life) || 28;
    for (let i = 0; i < n; i++) {
      const a = R.float(0, Math.PI * 2), sp = speed * R.float(0.45, 1), m = i % 3;
      addPart({
        k: m === 0 ? 'spark' : m === 1 ? 'dot' : 'streak', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.15, g,
        dur: Math.max(6, Math.round(life * R.float(0.7, 1.2))), s0: m === 0 ? sz : m === 1 ? sz * 0.55 : sz * 3.4, s1: m === 0 ? sz * 0.35 : m === 1 ? sz * 0.3 : sz * 1.4,
        col: i % 5 === 0 ? HUE.white : col, a: 0.85, rot: R.float(0, 6.28),
      });
    }
  }
  /** A single ember / mote drifting up (flames, bolts, drops). */
  function ember(x, y, col, vx, vy, life, size) {
    if (OPT.quality < 1) return;
    addPart({ k: 'dot', x, y, vx, vy, g: -0.004, dur: life, s0: size, s1: size * 0.4, col, a: 0.85, rot: 0 });
  }
  function updateParts() {
    const L = S.parts;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.t++; p.x += p.vx; p.y += p.vy; p.vy += p.g;
      if (p.t >= p.dur) p.dead = true;
    }
    prune(L);
  }

  /** Full-screen flash: `dur` frames, fading from peak alpha `a` (a stronger flash already running wins).
   *  Photosensitivity (SPEC_V2 sec. 1): never above FLASH_MAX (12 %), onsets at least FLASH_COOL (20) frames apart whoever asks
   *  (thunder, bomb, chain light, boss death) = at most 3 per second, none at all under reduced motion. */
  function flash(dur, a, col) {
    if (!S || OPT.reducedMotion || !(a > 0)) return;
    a = Math.min(a, FLASH_MAX);
    if (S.flashCool > 0) return;
    if (S.flashT > 0 && S.flashA * (S.flashT / S.flashDur) >= a) return;
    S.flashT = dur; S.flashDur = dur; S.flashA = a; S.flashCol = col || '#ffffff'; S.flashCool = FLASH_COOL;
  }
  const flashAlpha = () => (S && S.flashT > 0 ? S.flashA * Math.min(1, S.flashT / S.flashDur) : 0);

  /** Colour of a bubble's shockwave. */
  function bubbleHue(b) {
    switch (b.kind) {
      case 'thunder': return HUE.amber;
      case 'fire': return HUE.ember;
      case 'water': return HUE.cobalt;
      case 'letter': return HUE.white;
      case 'trapped': { const f = b.trapTime ? b.trapT / b.trapTime : 0; return f < 0.5 ? HUE.cyan : f < 0.8 ? HUE.amber : HUE.crimson; }
      default: return HUE.cyan;
    }
  }
  /** Shockwave rings (+ droplets) for a popped bubble; `quiet` = it just expired / was released (smaller, dimmer). */
  function popFx(b, quiet) {
    if (!S) return;
    const x = b.x + 8, y = b.y + 8, col = bubbleHue(b), big = b.kind === 'thunder' ? 1.6 : b.kind === 'empty' ? 1 : 1.25;
    ring(x, y, col, 4, (quiet ? 10 : 15) * big, quiet ? 11 : 15, quiet ? 0.4 : 0.9);
    if (quiet) return;
    ring(x, y, HUE.white, 3, 9 * big, 10, 0.5);
    burst(x, y, col, 7, 1.15, { size: 1.0, life: 20, g: 0.02 });
  }
  /** Chain light: a soft coloured pool at the kill + a faint full-screen wash (<= 12 %, rate-limited by flash()). */
  function chainLight(x, y, col, n) {
    if (!(n & 1)) pool(x, y, col, 2.0 + Math.min(n, 7) * 0.25, 12, 0.17);             // every other kill: pools cost fill rate
    flash(10, 0.045 + 0.012 * n, col);
  }
  function killFx(e, k) {
    if (!S) return;
    const x = e.x + 8, y = e.y + 8, hue = e.angry ? HUE.crimson : (ENEMY_HUE[e.t] || HUE.white);
    ring(x, y, hue, 3, 21, 16, 0.8);
    burst(x, y, hue, 8 + Math.min(k, 4) * 2, 2.1, { size: 1.6, life: 34 });
    if (k >= 2) chainLight(x, y, hue, k + 1);
  }
  const itemHue = (kind) => (kind.startsWith('pu_') ? PU_HUE[kind.slice(3)] || HUE.cyan : kind === 'moonpearl' ? HUE.white : FOOD_HUE[+kind.slice(5)] || HUE.amber);

  // trail ring buffers: positions of a moving entity, one sample per update frame (WeakMap: cosmetic, entities stay plain objects)
  const TRAILS = new WeakMap();
  function trailPush(e) {
    let t = TRAILS.get(e);
    if (!t) { t = { b: new Float32Array(2 * TRAIL_N), h: 0, n: 0 }; TRAILS.set(e, t); }
    t.h = (t.h + 1) % TRAIL_N; t.b[2 * t.h] = e.x; t.b[2 * t.h + 1] = e.y;
    if (t.n < TRAIL_N) t.n++;
  }
  const TP = [0, 0];
  /** Position `back` samples ago into TP; false when the buffer is not that deep. */
  function trailAt(e, back) {
    const t = TRAILS.get(e);
    if (!t || back >= t.n) return false;
    const i = (t.h - back + 4 * TRAIL_N) % TRAIL_N;
    TP[0] = t.b[2 * i]; TP[1] = t.b[2 * i + 1];
    return true;
  }
  function sampleTrails() {
    if (OPT.reducedMotion || OPT.quality < 1) return;
    for (const p of S.players) if (p.state === 'normal') trailPush(p);
    for (const e of S.enemies) if (!e.dead && e.t !== 'kraken' && (e.state === 'active' || e.state === 'dying')) trailPush(e);
  }

  function addScore(pi, pts) {
    const p = S.players[pi];
    if (!p || pts <= 0) return;
    p.score += pts;
    if (p.score > S.hiScore) S.hiScore = p.score;
    while (p.score >= p.nextLife) {
      p.nextLife = p.nextLife === EXTRA_LIFE_FIRST ? EXTRA_LIFE_EVERY : p.nextLife + EXTRA_LIFE_EVERY;
      p.lives++;
      sfx('oneup');
      popup(p.x + 8, p.y - 8, '1UP', '#7dff8a');
    }
  }

  const newChain = (owner) => ({ owner, kills: 0 });

  // ================================================================================================
  // Round setup
  // ================================================================================================
  function analyseMap(map) {
    const runs = [];
    let c = 2;
    while (c < 30) {
      if (map[ROWS - 1][c] !== '#') {
        const c0 = c;
        while (c < 30 && map[ROWS - 1][c] !== '#') c++;
        runs.push([c0, c - 1]);
      } else c++;
    }
    return runs;
  }

  /** Standable 16x16 spots (feet on a surface, two empty rows above) for power-up placement. */
  function findSpots() {
    const spots = [];
    for (let r = 2; r < ROWS; r++) {
      for (let c = 2; c <= 28; c++) {
        if (!isLandable(c, r) || !isLandable(c + 1, r)) continue;
        if (isSolid(c, r - 1) || isSolid(c + 1, r - 1) || isSolid(c, r - 2) || isSolid(c + 1, r - 2)) continue;
        spots.push({ x: c * T, y: MAP_Y + r * T - 16 });
      }
    }
    return spots;
  }

  function buildSolid(map) {
    const g = new Uint8Array(COLS * ROWS);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) g[r * COLS + c] = map[r][c] === '#' ? 1 : 0;
    return g;
  }

  function trackFor(level) { return level >= 30 ? 'boss' : level >= 16 ? 'stage2' : 'stage1'; }

  function makeEnemy(def, idx, total) {
    const big = def.t === 'kraken';
    const sx = def.c * T, sy = MAP_Y + def.r * T;
    const stagger = big ? 0 : Math.min(ENTER_STAGGER, Math.floor(50 / Math.max(1, total)));
    return {
      t: def.t, x: big ? 104 : 120, y: big ? MAP_Y - 48 : MAP_Y - 16, sx, sy, ex0: big ? 104 : 120, ey0: big ? MAP_Y - 48 : MAP_Y - 16,
      vx: 0, vy: 0, d: def.d || 1, state: 'enter', enterT: -idx * stagger - 1, enterLen: big ? INTRO_FRAMES : ENTER_FRAMES,
      angry: S.hurry, onGround: false, hitWall: false,
      animT: S.rng.int(0, 60), ledge: 0, turnCool: 0, bump: 0, bumpT: 0, pauseT: 0, cool: S.rng.int(30, 90), sqT: S.rng.int(0, 20),
      poseT: 0, freezeT: 0, dieT: 0, foodIdx: 0, baseY: sy, jx: def.d || 1, jy: S.rng.chance(0.5) ? 1 : -1,
      bubble: null, hp: big ? S.bossMax : 0, flashT: 0, inkT: BOSS_INK_PERIOD, dead: false, stream: null,
      wx0: sx, wx1: sx, wy0: sy, wy1: sy, wdT: 0, wdHist: [], wdFires: 0, wdLast: -1e9, fx: 0, fy: 0, passT: 0,
    };
  }

  /** Create an already-active enemy at (x, y) (debug.spawn, bubble release helpers). */
  function makeActiveEnemy(type, x, y) {
    const e = makeEnemy({ t: type, c: 0, r: 0, d: 1 }, 0, 1);
    e.x = x; e.y = y; e.sx = x; e.sy = y; e.baseY = y; e.state = 'active'; e.enterT = e.enterLen; resetWatch(e);
    if (type === 'kraken') { e.hp = S.bossMax; e.jx = -1; e.jy = 1; }
    return e;
  }

  function startRound(n, first) {
    n = U.clamp(n | 0, 1, 30);
    S.level = n;
    S.highest = Math.max(S.highest, n);
    const L = lvDef();
    S.map = L.map;
    S.solid = buildSolid(L.map);
    S.gaps = analyseMap(L.map);
    S.spots = findSpots();
    S.bossMax = S.players.length > 1 ? BOSS_HP_2P : BOSS_HP_1P;
    S.bubbles = []; S.proj = []; S.bolts = []; S.drops = []; S.flames = []; S.streams = [];
    S.items = []; S.fx = []; S.popups = [];
    S.ghost = null; S.bossBubble = null; S.bossPhase = L.boss ? 'fight' : ''; S.bossPhase2 = false; S.fanfareT = 0;
    S.hurry = false; S.hurryT = 0; S.hurryBanner = 0; S.flashT = 0; S.flashDur = 14; S.flashA = 0; S.flashCool = 0; S.flashCol = '#ffffff';
    S.parts = [];
    S.specialT = S.rng.int(SPECIAL_MIN, SPECIAL_MAX);
    S.thunderT = BOSS_THUNDER_PERIOD;
    S.letterT = LETTER_PERIOD;
    S.puT = L.boss ? -1 : S.rng.int(PU_MIN, PU_MAX);
    S.skipTo = 0; S.tr = null; S.clearT = 0; S.idleT = 0;
    if (S.pendingJoin) { S.pendingJoin = false; addPlayer2(); }
    for (const p of S.players) {
      // a player who lost the last life and is still in the death animation is out, not revived (M8/M14)
      if (p.state === 'out' || (p.state === 'dying' && p.lives <= 0)) { p.state = 'out'; continue; }
      p.state = 'normal'; p.x = SPAWN_X[p.i]; p.y = SPAWN_Y; p.vx = 0; p.vy = 0; p.onGround = true;
      p.face = p.i === 0 ? 1 : -1; p.stunT = 0; p.cooldown = 0; p.shootT = 0; p.jumpBuf = 0; p.fireBuf = 0; p.coyote = -1;
    }
    S.enemies = L.enemies.map((d, i) => makeEnemy(d, i, L.enemies.length));
    S.phase = 'intro'; S.phaseT = 0;
    AUDIO.setTempo(1.0);
    if (S.players.every((p) => p.state === 'out')) { endGame(); return; }
    startMusic(first);
  }

  function startMusic(first) {
    const track = trackFor(S.level);
    const tok = ++musicSerial;
    if (first) AUDIO.jingle('start', { onEnd: () => { if (S && tok === musicSerial && !S.over) AUDIO.music(track); } });
    else AUDIO.music(track);
  }

  function addPlayer2() {
    const p = makePlayer(1);
    p.inv = JOIN_INV;
    S.players.push(p);
    if (lvDef().boss && S.bossMax === BOSS_HP_1P) {          // scale the boss pool, keeping the damage already dealt (never heals)
      S.bossMax = BOSS_HP_2P;
      for (const e of S.enemies) {
        if (e.t === 'kraken' && !e.dead && e.hp > 0) e.hp = Math.min(BOSS_HP_2P, Math.max(1, Math.floor((e.hp * BOSS_HP_2P) / BOSS_HP_1P)));
      }
    }
  }

  // ================================================================================================
  // Players (SPEC §4.1)
  // ================================================================================================
  function updatePlayer(p, inp) {
    p.animT++;
    if (p.state === 'out') return;
    if (p.state === 'dying') { updateDyingPlayer(p); return; }
    p.inputJump = !!inp.jump;
    if (p.cooldown > 0) p.cooldown--;
    if (p.shootT > 0) p.shootT--;
    if (p.inv > 0) p.inv--;
    if (p.noPopT > 0) p.noPopT--;
    if (p.flameImmune > 0) p.flameImmune--;
    const stunned = p.stunT > 0;
    if (stunned) p.stunT--;
    const dir = stunned ? 0 : (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    p.vx = dir * (p.power.shoes ? WALK_SHOES : WALK);
    if (dir) p.face = dir;
    if (inp.jumpPressed && !stunned) p.jumpBuf = JUMP_BUFFER; else if (p.jumpBuf > 0) p.jumpBuf--;
    if (p.onGround) p.coyote = COYOTE_FRAMES; else if (p.coyote >= 0) p.coyote--;       // coyote time after walking off an edge
    if (p.jumpBuf > 0 && (p.onGround || p.coyote >= 0) && !stunned) {
      p.vy = JUMP_V; p.onGround = false; p.jumpBuf = 0; p.coyote = -1;
      sfx('jump');
    }
    const wasAir = !p.onGround, vyIn = p.vy;
    physStep(p, true, true);
    if (wasAir && p.onGround && vyIn > 1.8) sfx('land');
    if (inp.firePressed && !stunned) p.fireBuf = FIRE_BUFFER + 1;                           // a press up to FIRE_BUFFER frames early is remembered
    if (p.fireBuf > 0) {
      if (p.cooldown === 0 && !stunned) { p.fireBuf = 0; shoot(p); } else p.fireBuf--;
    }
  }

  function shoot(p) {
    const v0 = p.power.gold ? SHOT_SPEED_GOLD : SHOT_SPEED;
    const range = p.power.pink ? SHOT_RANGE_PINK : p.power.gold ? SHOT_RANGE_GOLD : SHOT_RANGE;
    const b = makeBubble('empty', U.clamp(p.x + p.face * SHOT_OFFSET, C.INNER_L, C.INNER_R - 16), p.y);
    b.state = 'shot'; b.dir = p.face; b.v = v0; b.decel = (v0 * v0) / (2 * range); b.range = range;
    b.owner = p.i; b.grace = p.i; b.life = EMPTY_LIFE;
    S.bubbles.push(b);
    capBubbles();
    p.cooldown = p.power.blue ? SHOOT_COOLDOWN_BLUE : SHOOT_COOLDOWN;
    p.shootT = SHOOT_POSE;
    sfx('shoot');
  }

  /** Kill a player (touch of enemy, projectile, Bonefin or boss). Returns true when it took effect. */
  function killPlayer(p) {
    if (p.state !== 'normal' || p.inv > 0 || S.god) return false;
    p.state = 'dying'; p.dieT = 0; p.vx = 0; p.vy = -3.0; p.stunT = 0; p.jumpBuf = 0; p.fireBuf = 0;
    p.lives = Math.max(0, p.lives - 1);
    p.power = { shoes: false, pink: false, blue: false, gold: false };
    sfx('death');
    ring(p.x + 8, p.y + 8, PLAYER_COLOR[p.i], 4, 28, 20, 0.9);
    burst(p.x + 8, p.y + 8, PLAYER_COLOR[p.i], 14, 2.6, { size: 1.7, life: 38 });
    resetHurry();
    return true;
  }

  function updateDyingPlayer(p) {
    p.dieT++;
    p.vy = Math.min(p.vy + 0.12, 3.5);
    p.y += p.vy;
    if (p.dieT >= DIE_FRAMES) {
      if (p.lives > 0) respawn(p); else p.state = 'out';
    }
  }

  function respawn(p) {
    p.state = 'normal'; p.x = SPAWN_X[p.i]; p.y = SPAWN_Y; p.vx = 0; p.vy = 0; p.onGround = true;
    p.face = p.i === 0 ? 1 : -1; p.inv = RESPAWN_INV; p.cooldown = 0; p.stunT = 0; p.fireBuf = 0; p.coyote = -1;
  }

  // ================================================================================================
  // Bubbles (SPEC §4.2)
  // ================================================================================================
  function makeBubble(kind, x, y) {
    return {
      kind, x, y, state: 'float', age: 0, owner: -1, grace: -1, popAt: 0, chain: null, dead: false,
      enemy: null, trapT: 0, trapTime: 0, att: null, life: kind === 'empty' ? EMPTY_LIFE : SPECIAL_LIFE,
      dir: 1, v: 0, decel: 0, range: 1, dist: 0, letter: '', chainImmune: 0,
    };
  }

  function pickAttractor(b) {
    const air = lvDef().air || [];
    const cx = b.x + 8;
    let best = null, bd = Infinity;
    for (const a of air) {
      const d = Math.abs(a[0] * T - cx);
      if (d < bd) { bd = d; best = a; }
    }
    b.att = best ? { x: best[0] * T, y: MAP_Y + best[1] * T } : null;
  }

  function silentPop(b) {
    b.dead = true;
    addFx('bubble_pop', b.x, b.y, POP_ANIM_FRAMES, 3);
    popFx(b, true);
  }

  function capBubbles() {
    let n = 0;
    for (const b of S.bubbles) if (!b.dead) n++;
    while (n > BUBBLE_CAP) {
      let old = null;
      for (const b of S.bubbles) if (!b.dead && b.kind === 'empty' && b.state === 'float' && !b.popAt && (!old || b.age > old.age)) old = b;
      if (!old) break;
      silentPop(old);
      n--;
    }
  }

  function endShot(b) { b.state = 'float'; pickAttractor(b); }

  function findCapturable(b) {
    const br = [b.x + 1, b.y + 1, 14, 14];
    for (const e of S.enemies) {
      if (e.dead || e.t === 'kraken') continue;
      if (e.state !== 'active' && e.state !== 'frozen') continue;
      if (hits(br, foeRect(e))) return e;
    }
    return null;
  }

  function trapEnemy(b, e) {
    b.kind = 'trapped'; b.state = 'float'; b.enemy = e; b.trapT = 0; b.age = 0;
    b.trapTime = Math.max(TRAP_MIN, TRAP_BASE - TRAP_DECAY * (S.level - 1));
    e.state = 'trapped'; e.bubble = b; e.vx = 0; e.vy = 0;
    pickAttractor(b);
    sfx('trap');
    ring(b.x + 8, b.y + 8, HUE.cyan, 17, 8, 10, 0.8);                    // the bubble closes around its captive
  }

  function releaseEnemy(b) {
    const e = b.enemy;
    silentPop(b);
    sfx('pop', { vol: 0.6 });
    if (e && e.state === 'trapped') {
      e.state = 'active'; e.bubble = null; e.angry = true; e.x = b.x; e.y = b.y; e.baseY = b.y;
      e.vx = 0; e.vy = 0; e.onGround = false; e.ledge = 0; e.turnCool = 20;
    }
  }

  function updateShot(b) {
    b.x += b.dir * b.v;
    b.dist += b.v;
    b.v -= b.decel;
    let wall = false;
    if (b.x <= C.INNER_L) { b.x = C.INNER_L; wall = true; }
    else if (b.x >= C.INNER_R - 16) { b.x = C.INNER_R - 16; wall = true; }
    const e = findCapturable(b);
    if (e) { trapEnemy(b, e); return; }
    if (wall || b.v <= 0) endShot(b);
  }

  function updateFloat(b) {
    if (b.popAt) return;                                      // chain-reaction pop pending: hold still
    if (b.kind === 'trapped') {
      b.trapT++;
      if (b.trapT >= b.trapTime) { releaseEnemy(b); return; }
    } else if (b.age >= b.life) { silentPop(b); return; }
    let dx = 0, dy = -FLOAT_SPEED;
    const a = b.att;
    if (a) {
      const cx = b.x + 8, cy = b.y + 8;
      if (Math.abs(cy - a.y) < ATTRACT_WINDOW || b.y <= PLAY_TOP + EPS) dx = U.clamp((a.x - cx) * 0.1, -FLOAT_SPEED, FLOAT_SPEED);
      if (cy <= a.y && cy > a.y - ATTRACT_WINDOW) {           // at the attractor row: hover with a gentle wobble
        dy = Math.sin(b.age / 18) * 0.12;
        dx += Math.cos(b.age / 23) * 0.08;
      }
    }
    b.x = U.clamp(b.x + dx, C.INNER_L, C.INNER_R - 16);
    b.y = Math.max(PLAY_TOP, b.y + dy);
  }

  /** A bubble that has reached its hover row (or is pinned under the ceiling): the crowd spreads sideways there. */
  const settled = (b) => b.y <= PLAY_TOP + 0.5 || (!!b.att && Math.abs(b.y + 8 - b.att.y) < ATTRACT_WINDOW);

  /** Floating bubbles closer than PUSH_DIST push each other apart (soft); settled neighbours push mostly
   *  sideways so a crowd fans out along the ceiling instead of piling into one blob (CHAIN_DIST > PUSH_DIST
   *  keeps neighbours chain-connected). */
  function pushApart() {
    const L = S.bubbles;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (a.dead || a.state !== 'float' || a.popAt) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (b.dead || b.state !== 'float' || b.popAt) continue;
        let dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= PUSH_DIST) continue;
        if (d < 0.01) { dx = (i + j) % 2 ? 1 : -1; dy = 0; } else { dx /= d; dy /= d; }
        const push = Math.min(PUSH_MAX, (PUSH_DIST - d) * 0.25 + 0.02);   // soft near PUSH_DIST, strong when really overlapping
        const both = settled(a) && settled(b), wx = both ? 2 : 1, wy = both ? 0.75 : 1;
        a.x -= dx * push * wx; a.y -= dy * push * wy; b.x += dx * push * wx; b.y += dy * push * wy;
      }
    }
    for (const b of L) {
      if (b.dead || b.state !== 'float') continue;
      b.x = U.clamp(b.x, C.INNER_L, C.INNER_R - 16);
      b.y = Math.max(PLAY_TOP, b.y);
    }
  }

  function playerBubbleContacts() {
    for (const p of S.players) {
      if (p.state !== 'normal') continue;
      const pr = playerRect(p);
      for (const b of S.bubbles) {
        if (b.dead || b.state !== 'float') continue;
        const touching = hits(pr, [b.x + 2, b.y + 2, 12, 12]);
        if (b.grace === p.i) { if (!touching) b.grace = -1; continue; }
        if (!touching || b.popAt) continue;
        // land on the upper half while holding jump (not when there is no room above it: ceiling bubbles just pop)
        if (p.vy > 0 && p.inputJump && p.noPopT === 0 && b.y - 14 >= PLAY_TOP && p.y + 16 <= b.y + 9 + p.vy) {
          p.y = Math.max(PLAY_TOP, Math.min(p.y, b.y - 14)); p.vy = BOUNCE_V; p.onGround = false; p.noPopT = BOUNCE_NOPOP; p.coyote = -1;
          sfx('bounce');
          break;
        }
        if (p.noPopT > 0) continue;
        doPop(b, newChain(p.i));
      }
    }
  }

  function tickChainPops() {
    const n = S.bubbles.length;
    for (let i = 0; i < n; i++) {
      const b = S.bubbles[i];
      if (!b.dead && b.popAt && S.frame >= b.popAt) doPop(b, b.chain || newChain(0));
    }
  }

  function updateBubbles() {
    const n = S.bubbles.length;
    for (let i = 0; i < n; i++) {
      const b = S.bubbles[i];
      if (b.dead) continue;
      b.age++;
      if (b.state === 'shot') updateShot(b); else updateFloat(b);
    }
    pushApart();
    playerBubbleContacts();
    tickChainPops();
    for (const b of S.bubbles) if (!b.dead && b.enemy && b.enemy.state === 'trapped') { b.enemy.x = b.x; b.enemy.y = b.y; }
  }

  /** Pop a bubble: scoring / effect by kind, then start the chain reaction on neighbours. */
  function doPop(b, chain) {
    if (b.dead) return;
    b.dead = true;
    addFx('bubble_pop', b.x, b.y, POP_ANIM_FRAMES, 3);
    popFx(b, false);
    const cx = b.x + 8;
    switch (b.kind) {
      case 'empty':
        addScore(chain.owner, SCORE_EMPTY); popup(cx, b.y, SCORE_EMPTY); sfx('pop');
        break;
      case 'trapped': {
        sfx('pop');
        const e = b.enemy;
        if (e && e.state === 'trapped') { e.bubble = null; e.x = b.x; e.y = b.y; killEnemy(e, chain); }
        break;
      }
      case 'letter':
        collectLetter(chain.owner, b.letter, cx, b.y);
        break;
      default:
        sfx('pop');
        triggerSpecial(b, chain);
    }
    for (const o of S.bubbles) {
      if (o.dead || o === b || o.state !== 'float' || o.popAt || o.age < o.chainImmune) continue;
      if (Math.hypot(o.x - b.x, o.y - b.y) <= CHAIN_DIST) { o.popAt = S.frame + CHAIN_DELAY; o.chain = chain; }
    }
  }

  /** k-th kill of a chain scores 1000 * 2^k (cap 64000); enemy is flung and turns into food. */
  function killEnemy(e, chain) {
    if (e.dead || e.state === 'dying') return;
    const k = chain.kills++;
    const pts = Math.min(CHAIN_BASE * Math.pow(2, k), CHAIN_CAP);
    addScore(chain.owner, pts);
    popup(e.x + 8, e.y, pts, popupColor(pts));
    e.stream = null; e.bubble = null;
    e.state = 'dying'; e.dieT = 0; e.foodIdx = Math.min(k, FOOD_POINTS.length - 1);
    e.vx = (S.rng.chance(0.5) ? 1 : -1) * S.rng.float(1.5, 2.5);
    e.vy = -3.5; e.onGround = false;
    sfx('kill', { pitch: Math.min(2 * k, 12) });                 // the chain is audible: each kill rings higher
    killFx(e, k);
    if (chain.kills === CHAIN_LETTER_KILLS) spawnLetterBubble(chain.owner, e.x, e.y);
  }

  // ---- EXTEND letters -------------------------------------------------------------------------
  function spawnLetterBubble(forPlayer, x, y) {
    if (lvDef().boss && S.bossPhase !== 'fight') return;
    if (S.bubbles.some((b) => !b.dead && b.kind === 'letter')) return;
    const p = S.players[forPlayer];
    if (!p) return;
    const missing = [];
    for (let i = 0; i < 6; i++) if (!p.letters[i]) missing.push(LETTERS[i]);
    if (!missing.length) return;
    const b = makeBubble('letter', U.clamp(x, C.INNER_L, C.INNER_R - 16), Math.max(PLAY_TOP, y));
    b.letter = S.rng.pick(missing);
    b.chainImmune = 30;                                       // a letter born inside a chain must not be popped by it
    pickAttractor(b);
    S.bubbles.push(b);
    sfx('item_appear', { vol: 0.6 });
  }

  function collectLetter(pi, ch, x, y) {
    const p = S.players[pi];
    if (!p) return;
    let slot = -1;
    for (let i = 0; i < 6; i++) if (!p.letters[i] && LETTERS[i] === ch) { slot = i; break; }
    sfx('letter');
    if (slot < 0) { addScore(pi, LETTER_DUP_BONUS); popup(x, y, LETTER_DUP_BONUS, '#ffe36b'); return; }
    p.letters[slot] = true;
    popup(x, y, ch, '#7dff8a');
    if (p.letters.every(Boolean)) beginExtend(p);
  }

  /** Index of the living player with the highest score (a player who is out never gets the letter). */
  const leadingPlayer = () => {
    let best = -1;
    S.players.forEach((p, i) => { if (p.state !== 'out' && (best < 0 || p.score > S.players[best].score)) best = i; });
    return best < 0 ? 0 : best;
  };

  // ---- rising points for specials / letters -------------------------------------------------------
  function risePoint() {
    if (S.gaps.length) {
      const run = S.rng.pick(S.gaps);
      const x0 = run[0] * T, x1 = (run[1] + 1) * T - 16;
      return { x: S.rng.int(x0, Math.max(x0, x1)), y: SCREEN_H - 16 };
    }
    return { x: S.rng.int(C.INNER_L, C.INNER_R - 16), y: FLOOR_ROW_Y - 16 };
  }

  function spawnSpecialBubble(kind) {
    const pt = risePoint();
    const b = makeBubble(kind, pt.x, pt.y);
    pickAttractor(b);
    S.bubbles.push(b);
    return b;
  }

  const countBubbles = (pred) => S.bubbles.reduce((n, b) => n + (!b.dead && pred(b) ? 1 : 0), 0);
  const isSpecialKind = (k) => k === 'thunder' || k === 'fire' || k === 'water';

  // ================================================================================================
  // Specials: thunder / fire / water (SPEC §4.4)
  // ================================================================================================
  const activeBoss = () => S.enemies.find((e) => e.t === 'kraken' && !e.dead && e.state === 'active') || null;

  /** Direction a water stream should flow: toward the nearest enemy (preferring the platform it will land on),
   *  otherwise toward the farther side wall. */
  function waterDir(b) {
    const cx = b.x + 8;
    const land = surfaceBelow(b.x + 4, b.x + 12, b.y + 16);
    let best = null, bd = Infinity;
    for (const e of S.enemies) {
      if (e.dead || e.t === 'kraken' || (e.state !== 'active' && e.state !== 'frozen')) continue;
      const dy = land === null ? 0 : Math.abs(e.y + 16 - land);
      const d = Math.abs(e.x + 8 - cx) + (dy <= 20 ? 0 : 60 + dy);
      if (d < bd) { bd = d; best = e; }
    }
    if (best && Math.abs(best.x + 8 - cx) > 4) return best.x + 8 > cx ? 1 : -1;
    return cx < C.W / 2 ? 1 : -1;
  }

  function triggerSpecial(b, chain) {
    const owner = S.players[chain.owner];
    if (b.kind === 'thunder') {
      sfx('thunder');
      flash(9, FLASH_MAX, '#ffe9b8');                              // chained thunder pops must not strobe the screen: flash() rate-limits every flash
      const ch = newChain(chain.owner);                            // both bolts of one pop score as one chain
      const boss = lvDef().boss ? activeBoss() : null;
      let dirs;
      if (boss) {                                                  // boss round: the bolt always flies toward the Kraken
        const dx = boss.x + 24 - (b.x + 8);
        dirs = [dx > 0 ? 1 : dx < 0 ? -1 : (owner && owner.face) || 1];
      } else {                                                     // otherwise both ways, except into a wall
        dirs = [1, -1].filter((d) => (d > 0 ? b.x + 16 + BOLT_SPEED < C.INNER_R : b.x - BOLT_SPEED > C.INNER_L));
      }
      for (const dir of dirs) S.bolts.push({ x: b.x, y: b.y + 4, dir, owner: chain.owner, chain: ch, hitBoss: false, dead: false, age: 0, seek: !!boss });
    } else if (b.kind === 'fire') {
      sfx('fire');
      S.drops.push({ x: b.x + 4, y: b.y + 4, owner: chain.owner, chain: newChain(chain.owner), dead: false, age: 0 });
    } else if (b.kind === 'water') {
      sfx('water');
      S.streams.push({
        owner: chain.owner, chain: newChain(chain.owner), x: b.x + 4, y: b.y + 4, mode: 'fall',
        dir: waterDir(b), trail: [], acc: 0, age: 0, carried: [], dead: false,
      });
    }
  }

  /** Boss-round bolts drift toward the Kraken's height while it is still ahead of them (the boss keeps moving,
   *  and a thunder pop is the only way to hurt it). */
  function seekBoss(bo) {
    const boss = activeBoss();
    if (!boss || (bo.dir > 0 ? boss.x + 42 < bo.x : boss.x + 6 > bo.x + 16)) return;
    bo.y += U.clamp(boss.y + 24 - 4 - bo.y, -BOLT_HOMING, BOLT_HOMING);
  }

  function updateBolts() {
    const n = S.bolts.length;
    for (let i = 0; i < n; i++) {
      const bo = S.bolts[i];
      if (bo.dead) continue;
      bo.age++;
      bo.x += bo.dir * BOLT_SPEED;
      if (bo.seek) seekBoss(bo);
      if (bo.age % 3 === 0) ember(bo.x + 8 - bo.dir * 6, bo.y + 4, HUE.amber, S.vrng.float(-0.2, 0.2), S.vrng.float(-0.25, 0.1), 12, 1.1);
      if (bo.dir > 0 ? bo.x + 16 >= C.INNER_R : bo.x <= C.INNER_L) { bo.dead = true; continue; }
      const br = [bo.x, bo.y, 16, 8];
      for (const e of S.enemies) {
        if (e.dead) continue;
        if (e.t === 'kraken') {
          if (e.state === 'active' && !bo.hitBoss && hits(br, foeRect(e))) { bo.hitBoss = true; damageBoss(e, bo.owner); }
        } else if ((e.state === 'active' || e.state === 'frozen') && hits(br, foeRect(e))) killEnemy(e, bo.chain);
      }
    }
  }

  function updateDrops() {
    const n = S.drops.length;
    for (let i = 0; i < n; i++) {
      const d = S.drops[i];
      if (d.dead) continue;
      d.age++;
      if (d.age % 4 === 0) ember(d.x + 4, d.y, HUE.ember, S.vrng.float(-0.15, 0.15), -0.2, 14, 1.0);
      const y0 = d.y;
      d.y += DROP_SPEED;
      const top = landingY(d.x, d.x + 8, y0 + 8, d.y + 8);
      if (top !== null) { ignite(d, top); d.dead = true; }
      else if (d.y > SCREEN_H) d.dead = true;
    }
  }

  function ignite(d, top) {
    const r = Math.round((top - MAP_Y) / T);
    const c = Math.floor((d.x + 4) / T);
    for (let cc = c - FLAME_SPREAD; cc <= c + FLAME_SPREAD; cc++) {
      if (cc >= 2 && cc <= 29 && isLandable(cc, r)) S.flames.push({ x: cc * T, y: top - 16, t: 0, owner: d.owner, chain: d.chain, dead: false });
    }
  }

  function updateFlames() {
    const n = S.flames.length;
    for (let i = 0; i < n; i++) {
      const f = S.flames[i];
      if (f.dead) continue;
      if (++f.t >= FLAME_FRAMES) { f.dead = true; continue; }
      if ((f.t + (f.x >> 3) * 5) % 18 === 0) ember(f.x + 4 + S.vrng.float(-2, 2), f.y + 6, f.t % 2 ? HUE.ember : HUE.amber, S.vrng.float(-0.1, 0.1), -0.32, 28, 0.9);
      const fr = [f.x + 1, f.y + 2, 6, 14];
      for (const e of S.enemies) {
        if (!e.dead && e.t !== 'kraken' && (e.state === 'active' || e.state === 'frozen') && hits(fr, foeRect(e))) killEnemy(e, f.chain);
      }
      for (const p of S.players) {
        if (p.state === 'normal' && p.stunT === 0 && p.flameImmune === 0 && hits(fr, playerRect(p))) {
          p.stunT = STUN_FRAMES; p.flameImmune = STUN_FRAMES + FLAME_IMMUNE_FRAMES; p.vx = 0;
        }
      }
    }
  }

  function updateStreams() {
    const n = S.streams.length;
    for (let i = 0; i < n; i++) {
      const s = S.streams[i];
      if (s.dead) continue;
      s.age++;
      let step;
      if (s.mode === 'fall') {
        const y0 = s.y;
        s.y += STREAM_FALL; step = STREAM_FALL;
        const top = landingY(s.x, s.x + 8, y0 + 8, s.y + 8);
        if (top !== null) { s.y = top - 8; s.mode = 'flow'; if (s.x + 4 < 24) s.dir = 1; else if (s.x + 4 > 232) s.dir = -1; }
        else if (s.y > SCREEN_H) { endStream(s, true); continue; }
      } else {
        step = STREAM_FLOW;
        const lead = s.dir > 0 ? s.x + 8 : s.x - 1;
        const col = Math.floor((lead + s.dir * STREAM_FLOW) / T);
        const row = Math.floor((s.y + 4 - MAP_Y) / T);
        if (isSolid(col, row)) s.dir = -s.dir; else s.x += s.dir * STREAM_FLOW;
        const below = Math.floor((s.y + 8 - MAP_Y + 0.5) / T);
        if (!isLandable(Math.floor((s.x + 4) / T), below)) s.mode = 'fall';
      }
      s.acc += step;
      if (s.acc >= 8) {
        s.acc -= 8;
        s.trail.push({ x: s.x, y: s.y, k: s.mode });
        if (s.trail.length > STREAM_SEGMENTS - 1) s.trail.shift();
      }
      const hr = [s.x - 1, s.y - 1, 10, 10];
      for (const e of S.enemies) {
        if (!e.dead && e.t !== 'kraken' && (e.state === 'active' || e.state === 'frozen') && hits(hr, foeRect(e))) {
          e.state = 'carried'; e.stream = s; s.carried.push(e);
        }
      }
      s.carried.forEach((e, k) => { e.x = U.clamp(s.x - 4 + (k % 2) * 2, C.INNER_L, C.INNER_R - 16); e.y = s.y - 8 - (k % 3); });
      if (s.age >= STREAM_LIFE) endStream(s, false);
    }
  }

  function endStream(s, exited) {
    s.dead = true;
    for (const e of s.carried) {
      if (e.dead || e.state !== 'carried') continue;
      e.x = U.clamp(s.x - 4, C.INNER_L, C.INNER_R - 16);
      e.y = exited ? 4 : Math.max(PLAY_TOP, s.y - 8);
      killEnemy(e, s.chain);
    }
    s.carried = [];
    if (!exited) sparkle(s.x, s.y);
  }

  // ================================================================================================
  // Enemies (SPEC §4.3)
  // ================================================================================================
  const foeScale = () => 1 + Math.min(SPEED_CAP, SPEED_PER_ROUND * (S.level - 1));
  const isWalker = (e) => e.t === 'nibbler' || e.t === 'crabbit' || e.t === 'springle';
  /** Per-frame speed. Angry walkers / springles are capped below the player's walk speed, angry jellops use
   *  a gentler multiplier (their diagonal motion is already fast), glimmers keep the full multiplier. */
  function foeSpeed(e, base) {
    const v = base * foeScale();
    if (!e.angry) return v;
    if (e.t === 'jellop') return v * JELLOP_ANGRY_MULT;
    if (isWalker(e)) return Math.min(v * ANGRY_MULT, ANGRY_CAP);
    return v * ANGRY_MULT;
  }

  function updateEnemies() {
    const n = S.enemies.length;
    for (let i = 0; i < n; i++) {
      const e = S.enemies[i];
      if (e.dead) continue;
      switch (e.state) {
        case 'enter': updateEnter(e); break;
        case 'active': updateActiveEnemy(e); break;
        case 'frozen':
          e.animT++;
          if (isWalker(e)) { e.vx = 0; physStep(e, true, true); }
          if (--e.freezeT <= 0) e.state = 'active';
          break;
        case 'dying': updateDyingEnemy(e); break;
        default: break;                                       // trapped / carried follow their owner
      }
    }
    // contact with players: only truly active enemies hurt
    for (const e of S.enemies) {
      if (e.dead || e.state !== 'active') continue;
      const er = foeRect(e);
      for (const p of S.players) if (p.state === 'normal' && hits(er, playerRect(p))) killPlayer(p);
    }
  }

  /** Enemies fly in and then wait, inert, at their spawn until the intro is over (phase `play`). */
  function updateEnter(e) {
    if (e.enterT < e.enterLen) e.enterT++;                    // starts at -idx*stagger-1, so every enemy (idx 0 too) passes through 0 once
    if (e.enterT < 0) return;
    if (e.enterT === 0) { poof(e.x, Math.max(MAP_Y, e.y)); sfx('spawn'); }
    const k = Math.min(1, e.enterT / e.enterLen), s = k * k * (3 - 2 * k);
    e.x = U.lerp(e.ex0, e.sx, s) + Math.sin(k * Math.PI * 2) * 10 * (1 - k);
    e.y = U.lerp(e.ey0, e.sy, s);
    if (e.enterT >= e.enterLen) {
      e.x = e.sx; e.y = e.sy;
      if (!e.arrived) { e.arrived = true; poof(e.x, e.y); }
      if (S.phase !== 'intro') {
        e.state = 'active'; resetWatch(e);
        if (e.t === 'kraken') { e.jx = S.rng.chance(0.5) ? 1 : -1; e.jy = S.rng.chance(0.5) ? 1 : -1; }   // seeded, not a fixed first path
      }
    }
  }

  const resetWatch = (e) => { e.wx0 = e.wx1 = e.x; e.wy0 = e.wy1 = e.y; e.wdT = 0; e.wdHist.length = 0; };

  /** Walker watchdog. The travel of every walker is boxed in slices of WD_STEP frames; a walker whose last
   *  WD_SPAN slices (6 s) fit inside WD_BOX_X x WD_BOX_Y px (pacing in a pit, notch or sealed room it cannot hop
   *  out of) is forced out: a hop toward the nearest player during which blocks do not stop it (WD_PASS frames).
   *  If it is still confined one slice (2 s) after that, it is poofed to a free standable spot >= 64 px from
   *  every player. Worst case from getting trapped to being freed: about 8 s + 4 s. */
  function watchdogTick(e) {
    if (e.passT > 0) e.passT--;
    if (e.x < e.wx0) e.wx0 = e.x; else if (e.x > e.wx1) e.wx1 = e.x;
    if (e.y < e.wy0) e.wy0 = e.y; else if (e.y > e.wy1) e.wy1 = e.y;
    if (++e.wdT < WD_STEP) return;
    e.wdHist.push([e.wx0, e.wx1, e.wy0, e.wy1]);
    if (e.wdHist.length > WD_SPAN) e.wdHist.shift();
    e.wx0 = e.wx1 = e.x; e.wy0 = e.wy1 = e.y; e.wdT = 0;
    const repeat = e.animT - e.wdLast < WD_REPEAT && Math.abs(e.x - e.fx) <= WD_BOX_X && Math.abs(e.y - e.fy) <= WD_BOX_Y;   // still where the last hop started
    const need = repeat ? 1 : WD_SPAN;
    if (e.wdHist.length < need) return;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let k = e.wdHist.length - need; k < e.wdHist.length; k++) {
      const b = e.wdHist[k];
      x0 = Math.min(x0, b[0]); x1 = Math.max(x1, b[1]); y0 = Math.min(y0, b[2]); y1 = Math.max(y1, b[3]);
    }
    if (x1 - x0 > WD_BOX_X || y1 - y0 > WD_BOX_Y) return;
    e.wdHist.length = 0;
    e.wdLast = e.animT; e.fx = e.x; e.fy = e.y;
    e.wdFires = repeat ? e.wdFires + 1 : 1;
    if (e.wdFires >= 2 && relocate(e)) { e.wdFires = 0; return; }
    const t = nearestPlayer(e.x + 8, e.y + 8);
    if (t && Math.abs(t.x - e.x) > 4) e.d = sign(t.x - e.x); else e.d = S.rng.chance(0.5) ? 1 : -1;
    e.vy = JUMP_V; e.onGround = false; e.passT = WD_PASS; e.pauseT = 0; e.turnCool = 0;
    if (e.t === 'springle') e.vx = e.d * foeSpeed(e, SPRINGLE_VX);
  }

  /** Move a stuck walker to a random standable spot at least 64 px from every player (a dying player counts as standing on
   *  the respawn pad they are about to return to) and not on top of another enemy. */
  function relocate(e) {
    if (!S.spots.length) return false;
    for (let tries = 0; tries < 24; tries++) {
      const sp = S.rng.pick(S.spots);
      if (S.players.some((p) => {
        if (p.state === 'normal') return Math.hypot(p.x - sp.x, p.y - sp.y) < 64;
        return p.state === 'dying' && p.lives > 0 && Math.hypot(SPAWN_X[p.i] - sp.x, SPAWN_Y - sp.y) < 64;
      })) continue;
      if (S.enemies.some((o) => o !== e && !o.dead && (o.state === 'active' || o.state === 'frozen') && Math.abs(o.x - sp.x) < 16 && Math.abs(o.y - sp.y) < 16)) continue;
      poof(e.x, e.y);
      e.x = sp.x; e.y = sp.y; e.vx = 0; e.vy = 0; e.onGround = false; resetWatch(e); e.passT = 0;
      poof(e.x, e.y);
      return true;
    }
    return false;
  }

  function updateActiveEnemy(e) {
    e.animT++;
    if (S.hurry) e.angry = true;
    if (isWalker(e)) watchdogTick(e);
    switch (e.t) {
      case 'nibbler': case 'crabbit': updateWalker(e); break;
      case 'springle': updateSpringle(e); break;
      case 'jellop': updateJellop(e); break;
      case 'glimmer': updateGlimmer(e); break;
      case 'kraken': updateBoss(e); break;
      default: break;
    }
  }

  function groundAhead(e) {
    const px = e.x + 8 + e.d * 4;
    const row = Math.floor((e.y + 16 - MAP_Y + 0.5) / T);
    return isLandable(Math.floor(px / T), row);
  }

  function updateWalker(e) {
    const spd = foeSpeed(e, e.t === 'crabbit' ? CRABBIT_SPEED : NIBBLER_SPEED);
    if (e.cool > 0) e.cool--;
    if (e.turnCool > 0) e.turnCool--;
    if (e.pauseT > 0) {                                       // Crabbit winding up a throw
      e.pauseT--; e.vx = 0;
      physStep(e, e.passT <= 0, true);
      if (e.pauseT === 0) throwPebble(e);
      return;
    }
    if (e.onGround) walkerThink(e); else e.ledge = 0;
    if (e.pauseT > 0) { e.vx = 0; physStep(e, true, true); return; }
    e.vx = e.d * spd;
    physStep(e, e.passT <= 0, true);
    if (e.bumpT > 0) e.bumpT--;
    if (e.hitWall) {
      e.d = -e.d;
      e.bump = e.bumpT > 0 ? e.bump + 1 : 1;
      e.bumpT = BUMP_WINDOW;
      if (e.bump >= BUMP_ESCAPE && e.onGround) { e.vy = JUMP_V; e.onGround = false; e.bump = 0; }   // walled in: hop out of the pit
    }
  }

  function walkerThink(e) {
    const target = nearestPlayer(e.x + 8, e.y + 8);
    if (target) {
      const dxp = target.x - e.x, above = e.y - target.y;
      if (above > 12 && Math.abs(dxp) <= JUMP_RANGE_X) {                   // player is above: maybe jump
        const chance = JUMP_CHANCE * (e.angry ? 2 : 1) * (e.t === 'crabbit' ? 0.5 : 1);
        if (S.rng.chance(chance)) {
          if (Math.abs(dxp) > 4) e.d = sign(dxp);
          e.vy = JUMP_V; e.onGround = false; e.ledge = 0;
          return;
        }
      }
      if (e.angry && e.animT % 120 === 0 && Math.abs(dxp) > 8 && S.rng.chance(0.5)) e.d = sign(dxp);
      if (target.y > e.y + 12 && Math.abs(dxp) <= JUMP_RANGE_X && Math.abs(dxp) > 8 && S.rng.chance(DROP_CHANCE)) {
        e.d = sign(dxp); e.turnCool = 0;                                      // player is below: head for the edge and drop
      }
      if (e.t === 'crabbit' && e.cool <= 0 && Math.abs(target.y - e.y) < 8 && (target.x - e.x) * e.d > 0
          && Math.abs(dxp) <= CRAB_THROW_RANGE) {
        e.pauseT = CRAB_STOP;
        return;
      }
    }
    if (e.turnCool === 0 && !groundAhead(e)) {                              // ledge: turn back or walk off
      if (e.ledge === 0) {
        const below = target && target.y > e.y + 12 && Math.abs(target.x - e.x) < 64;
        const pDrop = below ? (e.angry ? 1 : 0.85) : 0.5;
        if (S.rng.chance(pDrop)) e.ledge = 1; else { e.d = -e.d; e.turnCool = 12; }
      }
    } else if (e.turnCool === 0) e.ledge = 0;
  }

  function throwPebble(e) {
    if (S.proj.length < PROJ_CAP) {
      S.proj.push({ type: 'pebble', x: e.x + (e.d > 0 ? 12 : -4), y: e.y + 4, vx: e.d * PEBBLE_SPEED, vy: 0, age: 0, dead: false });
      sfx('enemy_shot');
    }
    e.cool = e.angry ? CRAB_COOLDOWN_ANGRY : CRAB_COOLDOWN;
  }

  function updateSpringle(e) {
    const wasGround = e.onGround;
    if (e.onGround) {
      if (e.sqT > 0) e.sqT--;
      if (e.sqT === 0) {                                                    // hop
        if (S.rng.chance(0.3)) {
          const t = nearestPlayer(e.x + 8, e.y + 8);
          if (t && Math.abs(t.x - e.x) > 4) e.d = sign(t.x - e.x);
        }
        e.vy = SPRINGLE_HOP; e.vx = e.d * foeSpeed(e, SPRINGLE_VX); e.onGround = false;
      } else e.vx = 0;
    }
    physStep(e, e.passT <= 0, true);
    if (e.hitWall) { e.d = -e.d; e.vx = -e.vx; }
    if (!wasGround && e.onGround) { e.sqT = SQUASH_FRAMES; e.vx = 0; }
  }

  function updateJellop(e) {
    const spd = foeSpeed(e, JELLOP_SPEED);
    e.x += e.jx * spd; e.y += e.jy * spd;
    if (e.x < C.INNER_L) { e.x = C.INNER_L; e.jx = 1; } else if (e.x > C.INNER_R - 16) { e.x = C.INNER_R - 16; e.jx = -1; }
    if (e.y < PLAY_TOP) { e.y = PLAY_TOP; e.jy = 1; } else if (e.y > FLOOR_ROW_Y - 16) { e.y = FLOOR_ROW_Y - 16; e.jy = -1; }
    e.d = e.jx;
    if (e.angry && e.animT % 90 === 0 && S.rng.chance(0.5)) {              // angry: lean toward the nearest player
      const t = nearestPlayer(e.x + 8, e.y + 8);
      if (t) { e.jy = t.y > e.y ? 1 : -1; e.jx = t.x > e.x ? 1 : -1; }
    }
  }

  function updateGlimmer(e) {
    const spd = foeSpeed(e, GLIMMER_SPEED);
    e.x += e.d * spd;
    if (e.x < C.INNER_L) { e.x = C.INNER_L; e.d = 1; } else if (e.x > C.INNER_R - 16) { e.x = C.INNER_R - 16; e.d = -1; }
    if (e.angry) {                                                          // angry: drift toward the player's height
      const t = nearestPlayer(e.x + 8, e.y + 8);
      if (t) e.baseY = U.clamp(e.baseY + U.clamp(t.y - e.baseY, -0.25, 0.25), PLAY_TOP + 4, FLOOR_ROW_Y - 20);
    }
    e.y = e.baseY + Math.sin(e.animT / 20) * 4;
    if (e.poseT > 0) e.poseT--;
    if (e.cool > 0) { e.cool--; return; }
    const t = nearestPlayer(e.x + 8, e.y + 8);
    if (t && t.y > e.y + 8 && Math.abs(t.x + 8 - (e.x + 8)) < 24 && S.proj.length < PROJ_CAP) {
      S.proj.push({ type: 'spark', x: e.x + 4, y: e.y + 12, vx: 0, vy: SPARK_SPEED, age: 0, dead: false });
      e.poseT = GLIMMER_POSE;
      e.cool = e.angry ? GLIMMER_COOLDOWN_ANGRY : GLIMMER_COOLDOWN;
      sfx('enemy_shot');
    }
  }

  function updateDyingEnemy(e) {
    e.dieT++;
    physStep(e, false, e.dieT >= DYING_MIN);
    if (e.hitWall) e.vx = -e.vx;                                           // bounce off the outer walls
    if (e.onGround || e.dieT > DYING_MAX) {
      if (!e.onGround) { e.y = FLOOR_ROW_Y - 16; }
      becomeFood(e);
    }
  }

  function becomeFood(e) {
    e.dead = true;
    S.items.push({ kind: 'food_' + e.foodIdx, x: e.x, y: e.y, age: 0, life: FOOD_LIFE, dead: false });
    sparkle(e.x + 4, e.y + 4);
  }

  // ---- hurry up / Bonefin ----------------------------------------------------------------------
  /** Music tempo for the current state: hurry speeds the loop up (less in the boss round, whose loop is
   *  already fast), the Kraken's second phase gets a small push, everything else plays at 1.0. */
  function currentTempo() {
    const boss = lvDef().boss;
    if (S.hurry) return boss ? HURRY_TEMPO_BOSS : HURRY_TEMPO;
    if (boss && S.bossPhase === 'fight' && S.bossPhase2) return BOSS_PHASE2_TEMPO;
    return 1.0;
  }

  function startHurry() {
    S.hurry = true; S.hurryBanner = HURRY_BANNER;
    sfx('hurry');
    AUDIO.setTempo(currentTempo());
    for (const e of S.enemies) if (!e.dead) e.angry = true;
  }

  function resetHurry() {
    const was = S.hurry || S.ghost;
    S.hurry = false; S.hurryT = 0; S.hurryBanner = 0; S.ghost = null;
    if (was) AUDIO.setTempo(currentTempo());
  }

  function spawnGhost() {
    S.ghost = { x: 120, y: MAP_Y - 16, vx: 0, vy: 0, age: 0 };
    sfx('ghost');
  }

  function updateGhost() {
    const g = S.ghost;
    if (!g) return;
    g.age++;
    const t = nearestPlayer(g.x + 8, g.y + 8);
    if (t) {
      const dx = t.x - g.x, dy = t.y - g.y, d = Math.hypot(dx, dy) || 1;
      g.vx = (dx / d) * GHOST_SPEED; g.vy = (dy / d) * GHOST_SPEED;
    } else { g.vx = 0; g.vy = 0; }
    g.x += g.vx; g.y += g.vy;
    const gr = [g.x + 3, g.y + 3, 10, 10];
    for (const p of S.players) if (p.state === 'normal' && hits(gr, playerRect(p)) && killPlayer(p)) break;
  }

  // ---- projectiles ----------------------------------------------------------------------------
  function updateProjectiles() {
    const n = S.proj.length;
    for (let i = 0; i < n; i++) {
      const q = S.proj[i];
      if (q.dead) continue;
      q.age++;
      q.x += q.vx; q.y += q.vy;
      const cx = q.x + 4, cy = q.y + 4;
      if (q.type === 'ink') {
        if (cx < C.INNER_L || cx > C.INNER_R || cy < PLAY_TOP || cy > FLOOR_ROW_Y) { q.dead = true; continue; }
      } else if (q.type === 'spark') {
        if (isSolid(Math.floor(cx / T), Math.floor((q.y + 8 - MAP_Y) / T)) || q.y > SCREEN_H) { q.dead = true; continue; }
      } else {
        const fx = cx + Math.sign(q.vx) * 4;
        if (isSolid(Math.floor(fx / T), Math.floor((cy - MAP_Y) / T))) { q.dead = true; continue; }
      }
      const qr = [q.x + 1, q.y + 1, 6, 6];
      for (const p of S.players) if (p.state === 'normal' && hits(qr, playerRect(p)) && killPlayer(p)) { q.dead = true; break; }
    }
  }

  // ================================================================================================
  // Boss: Kraken King (SPEC §4.5)
  // ================================================================================================
  /** The Kraken bounces diagonally at a NET speed of 0.8 -> 1.2 px/frame (slower than the player at 1.25).
   *  Phase 2 (below 50 % HP) turns it angry and nudges the music tempo up once. */
  function updateBoss(e) {
    if (e.flashT > 0) e.flashT--;
    const frac = e.hp / S.bossMax;
    const spd = U.lerp(BOSS_SPEED_MIN, BOSS_SPEED_MAX, 1 - frac) * Math.SQRT1_2;
    e.angry = frac < 0.5;
    if (e.angry && !S.bossPhase2) { S.bossPhase2 = true; AUDIO.setTempo(currentTempo()); }
    e.x += e.jx * spd; e.y += e.jy * spd;
    const xmax = C.INNER_R - 48, ymax = FLOOR_ROW_Y - 48;
    if (e.x < C.INNER_L) { e.x = C.INNER_L; e.jx = 1; } else if (e.x > xmax) { e.x = xmax; e.jx = -1; }
    if (e.y < PLAY_TOP) { e.y = PLAY_TOP; e.jy = 1; } else if (e.y > ymax) { e.y = ymax; e.jy = -1; }
    e.d = e.jx;
    if (--e.inkT <= 0) { e.inkT = BOSS_INK_PERIOD; fireInk(e); }     // the last INK_WIND frames before this are the telegraph
  }

  const inkWinding = (e) => e.inkT > 0 && e.inkT <= INK_WIND;

  /** 4-bullet fan with no bullet aimed at the centre (so standing still is survivable beyond arm's reach);
   *  with a player within INK_NEAR px only the two outer bullets fly, the body is the threat there. */
  function fireInk(e) {
    const cx = e.x + 24, cy = e.y + 24;
    const t = nearestPlayer(cx, cy);
    const base = t ? Math.atan2(t.y + 8 - cy, t.x + 8 - cx) : Math.PI / 2;
    const near = !!t && Math.hypot(t.x + 8 - cx, t.y + 8 - cy) <= INK_NEAR;
    for (const k of near ? [-1.5, 1.5] : [-1.5, -0.5, 0.5, 1.5]) {
      if (S.proj.length >= PROJ_CAP) break;
      const a = base + k * INK_STEP;
      S.proj.push({ type: 'ink', x: cx - 4, y: cy - 4, vx: Math.cos(a) * INK_SPEED, vy: Math.sin(a) * INK_SPEED, age: 0, dead: false });
    }
    sfx('enemy_shot');
  }

  function damageBoss(e, owner) {
    e.hp = Math.max(0, e.hp - 1);
    e.flashT = BOSS_FLASH;
    addScore(owner, BOSS_HIT_POINTS);
    sfx('boss_hit');
    ring(e.x + 24, e.y + 24, HUE.purple, 10, 34, 14, 0.7);
    burst(e.x + 24, e.y + 24, HUE.purple, 8, 2.2, { size: 1.7, life: 30 });
    if (e.hp <= 0) defeatBoss(e);
  }

  function defeatBoss(e) {
    e.dead = true;
    S.proj = S.proj.filter((q) => q.type !== 'ink');
    S.bossPhase = 'trapped';
    S.ghost = null; S.hurry = false; S.hurryT = 0; S.hurryBanner = 0;            // the fight is won: no more threats or HURRY UP
    AUDIO.setTempo(currentTempo());
    S.bossBubble = { x: e.x + 24 - 32, y: e.y + 24 - 32, age: 0 };
    sfx('trap');
    for (let i = 0; i < 8; i++) sparkle(e.x + S.rng.int(0, 40), e.y + S.rng.int(0, 40));
    ring(e.x + 24, e.y + 24, HUE.purple, 8, 52, 22, 0.8);
    burst(e.x + 24, e.y + 24, HUE.purple, 16, 2.6, { size: 1.9, life: 40 });
  }

  function updateBossBubble() {
    const bb = S.bossBubble;
    if (!bb) return;
    bb.age++;
    bb.y = Math.max(PLAY_TOP, bb.y - BOSS_BUBBLE_RISE);
    const br = [bb.x + 6, bb.y + 6, 52, 52];
    for (const p of S.players) {
      if (p.state === 'normal' && hits(playerRect(p), br)) { popBossBubble(bb); break; }
    }
  }

  function popBossBubble(bb) {
    S.bossBubble = null;
    S.bossPhase = 'pearl';
    S.ghost = null; S.hurry = false; S.hurryT = 0; S.hurryBanner = 0;
    AUDIO.setTempo(currentTempo());
    AUDIO.stopMusic(0.25);                                   // clean air for the explosion, then the fanfare (see update)
    sfx('boss_die');
    S.fanfareT = FANFARE_DELAY;
    for (let i = 0; i < 40; i++) {
      const a = S.rng.float(0, Math.PI * 2), sp = S.rng.float(0.6, 2.4);
      addFx('sparkle', bb.x + 28, bb.y + 28, S.rng.int(30, 60), 4, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0.02 });
    }
    addFx('bubble_pop', bb.x + 24, bb.y + 24, POP_ANIM_FRAMES, 3);
    ring(bb.x + 32, bb.y + 32, HUE.white, 8, 70, 24, 0.9);
    ring(bb.x + 32, bb.y + 32, HUE.purple, 6, 120, 34, 0.7);
    ring(bb.x + 32, bb.y + 32, HUE.gold, 4, 170, 44, 0.5);
    burst(bb.x + 32, bb.y + 32, HUE.gold, 30, 3.0, { size: 1.9, life: 50 });
    flash(16, FLASH_MAX, '#fff1d0');
    S.items.push({ kind: 'moonpearl', x: U.clamp(bb.x + 16, C.INNER_L, C.INNER_R - 32), y: PLAY_TOP, age: 0, life: 1e9, vy: 0, dead: false });
  }

  // ================================================================================================
  // Items: food, power-ups, Moon Pearl (SPEC §4.4)
  // ================================================================================================
  function weightedPick(table) {
    let total = 0;
    for (const [, w] of table) total += w;
    let r = S.rng.float(0, total);
    for (const [k, w] of table) { if ((r -= w) < 0) return k; }
    return table[0][0];
  }

  function spawnPowerUp() {
    if (!S.spots.length) return;
    const kind = weightedPick(PU_WEIGHTS);
    let spot = null;
    for (let tries = 0; tries < 24 && !spot; tries++) {
      const s = S.rng.pick(S.spots);
      if (S.players.every((p) => p.state !== 'normal' || Math.hypot(p.x - s.x, p.y - s.y) >= PU_AVOID)) spot = s;
    }
    if (!spot) spot = S.rng.pick(S.spots);
    S.items.push({ kind: 'pu_' + kind, x: spot.x, y: spot.y, age: 0, life: PU_LIFE, dead: false });
    sfx('item_appear');
  }

  function updatePearl(it) {
    it.vy = Math.min(it.vy + 0.04, 1.5);
    const y0 = it.y;
    it.y += it.vy;
    const top = landingY(it.x + 4, it.x + 28, y0 + 32, it.y + 32);
    if (top !== null) { it.y = top - 32; it.vy = 0; }
    else if (it.y > FLOOR_ROW_Y - 32) { it.y = FLOOR_ROW_Y - 32; it.vy = 0; }
  }

  function updateItems() {
    const n = S.items.length;
    for (let i = 0; i < n; i++) {
      const it = S.items[i];
      if (it.dead) continue;
      it.age++;
      const pearl = it.kind === 'moonpearl';
      if (pearl) updatePearl(it);
      else if (it.age >= it.life) { it.dead = true; poof(it.x, it.y); continue; }
      const r = pearl ? [it.x + 4, it.y + 4, 24, 24] : [it.x + 2, it.y + 2, 12, 12];
      for (const p of S.players) {
        if (p.state === 'normal' && hits(playerRect(p), r)) { collectItem(it, p); break; }
      }
    }
  }

  function collectItem(it, p) {
    it.dead = true;
    const ih = itemHue(it.kind), big = it.kind === 'moonpearl' ? 16 : 8;
    ring(it.x + big, it.y + big, ih, 3, 4 + big * 1.6, 14, 0.8);
    burst(it.x + big, it.y + big, ih, it.kind === 'moonpearl' ? 18 : 7, 1.6, { size: 1.4, life: 26 });
    if (it.kind === 'moonpearl') {
      addScore(p.i, PEARL_POINTS);
      popup(it.x + 16, it.y, PEARL_POINTS, '#ffe36b');
      sfx('powerup');
      beginVictory();
    } else if (it.kind.startsWith('food_')) {
      const pts = FOOD_POINTS[+it.kind.slice(5)];
      addScore(p.i, pts);
      popup(it.x + 8, it.y, pts, popupColor(pts));
      sfx('food');
    } else {
      addScore(p.i, PU_POINTS);
      popup(it.x + 8, it.y, PU_POINTS, '#ffe36b');
      sfx('powerup');
      applyPower(p, it.kind.slice(3));
    }
  }

  function applyPower(p, kind) {
    switch (kind) {
      case 'shoes': case 'pink': case 'blue': case 'gold': p.power[kind] = true; break;
      case 'clock': freezeEnemies(); break;
      case 'bomb': bomb(p); break;
      case 'parasol': parasol(); break;
      case 'heart': p.lives++; sfx('oneup'); popup(p.x + 8, p.y - 8, '1UP', '#7dff8a'); break;
      default: break;
    }
  }

  function freezeEnemies() {
    sfx('freeze');
    for (const e of S.enemies) {
      if (!e.dead && e.state === 'active' && e.t !== 'kraken') {
        e.state = 'frozen'; e.freezeT = FREEZE_FRAMES;
        ring(e.x + 8, e.y + 8, HUE.ice, 3, 17, 14, 0.8);
        burst(e.x + 8, e.y + 8, HUE.ice, 5, 1.0, { size: 1.3, life: 24, g: 0.01 });
      }
    }
  }

  function bomb(p) {
    sfx('bomb');
    flash(14, FLASH_MAX, '#ffd9b0');
    ring(p.x + 8, p.y + 8, HUE.ember, 6, 160, 26, 0.7);
    ring(p.x + 8, p.y + 8, HUE.white, 4, 100, 20, 0.5);
    const chain = newChain(p.i);
    for (const e of S.enemies) {
      if (e.dead || e.t === 'kraken') continue;
      if (e.state === 'active' || e.state === 'frozen' || e.state === 'trapped') {
        if (e.bubble) { silentPop(e.bubble); e.bubble = null; }
        killEnemy(e, chain);
      }
    }
  }

  function parasol() {
    S.skipTo = S.level >= 29 ? 30 : Math.min(29, S.level + PARASOL_SKIP);
    for (const e of S.enemies) {
      if (e.dead || e.t === 'kraken') continue;
      if (e.bubble) { silentPop(e.bubble); e.bubble = null; }
      poof(e.x, e.y);
      e.dead = true;
    }
  }

  // ================================================================================================
  // Round flow (SPEC §4.5)
  // ================================================================================================
  function playLogic() {
    if (S.phase !== 'play') return;
    const L = lvDef();
    S.hurryT++;
    const hurryAt = hurrySeconds(L) * C.FPS;
    const bossBusy = L.boss && S.bossPhase !== 'fight';           // once the Kraken is beaten nothing hurries the player
    if (!S.hurry && !bossBusy && S.hurryT >= hurryAt) startHurry();
    if (S.hurry && !S.ghost && !bossBusy && S.hurryT >= hurryAt + GHOST_DELAY) spawnGhost();

    if (L.boss) {
      if (S.bossPhase === 'fight' && --S.thunderT <= 0) {
        S.thunderT = BOSS_THUNDER_PERIOD;
        if (countBubbles((b) => b.kind === 'thunder') < BOSS_THUNDER_MAX) spawnSpecialBubble('thunder');
      }
    } else {
      const specials = L.specials || [];
      if (specials.length && --S.specialT <= 0) {
        S.specialT = S.rng.int(SPECIAL_MIN, SPECIAL_MAX);
        if (countBubbles((b) => isSpecialKind(b.kind)) < SPECIAL_ALIVE_MAX) spawnSpecialBubble(S.rng.pick(specials));
      }
      if (--S.letterT <= 0) {
        S.letterT = LETTER_PERIOD;
        if (S.rng.chance(0.5)) { const pt = risePoint(); spawnLetterBubble(leadingPlayer(), pt.x, pt.y); }
      }
      if (S.puT > 0 && --S.puT === 0) spawnPowerUp();
      if (!S.noClear && S.enemies.length === 0) beginClear();
    }
  }

  function beginClear() {
    S.phase = 'clear'; S.phaseT = 0; S.clearT = 0; S.idleT = 0;
    S.ghost = null; S.hurry = false; S.hurryBanner = 0; S.proj = [];
    AUDIO.setTempo(1.0);
    sfx('clear');
  }

  /** Round to scroll in after this one (parasol may have set skipTo). */
  const nextRound = () => Math.min(30, S.skipTo || S.level + 1);

  /** Build the next round's art ahead of the scroll: the level canvas first, the backdrop a few frames later,
   *  so neither lands in a transition frame (and the two never share a frame). */
  function prebuildNext(t) {
    const to = nextRound();
    if (to === S.level || !LEVELS[to - 1]) return;
    if (t === 6) GFX.levelCanvas(to - 1, LEVELS[to - 1].map);
    else if (t === 14 && typeof GFX.bgCanvas === 'function') GFX.bgCanvas(to - 1);
  }

  function clearLogic() {
    S.clearT++;
    prebuildNext(S.clearT);
    const pickups = S.items.some((it) => !it.dead && (it.kind.startsWith('food_') || it.kind.startsWith('pu_')));
    if (pickups) S.idleT = 0; else S.idleT++;
    if (S.idleT >= CLEAR_IDLE || S.clearT >= CLEAR_MAX) beginTransition();
  }

  function beginTransition() {
    const to = nextRound();
    for (const p of S.players) {
      if (p.state === 'dying') { if (p.lives > 0) { p.state = 'normal'; p.inv = 0; } else p.state = 'out'; }
    }
    if (S.players.every((p) => p.state === 'out')) { endGame(); return; }      // nobody left to carry on
    S.phase = 'transition'; S.phaseT = 0;
    S.tr = { from: S.level, to, t: 0, start: S.players.map((p) => ({ x: p.x, y: p.y })) };
    for (const p of S.players) { p.stunT = 0; p.vx = 0; p.vy = 0; }
    S.bubbles = []; S.items = []; S.proj = []; S.bolts = []; S.drops = []; S.flames = []; S.streams = [];
    S.popups = []; S.enemies = []; S.fx = []; S.bossBubble = null;
    resetHurry();
  }

  function updateTransition() {
    const tr = S.tr;
    tr.t++;
    const k = ease(Math.min(1, tr.t / TRANSITION_FRAMES));
    S.players.forEach((p, i) => {
      if (p.state !== 'normal') return;
      const s0 = tr.start[i] || { x: SPAWN_X[i], y: SPAWN_Y };
      p.animT++;
      p.x = U.lerp(s0.x, SPAWN_X[i], k) + Math.sin(k * Math.PI * 4) * 3 * (1 - k);
      p.y = U.lerp(s0.y, SPAWN_Y, k) - Math.sin(k * Math.PI) * 28;
      p.onGround = false;
    });
    updateFx();
    if (tr.t >= TRANSITION_FRAMES) startRound(tr.to, false);
  }

  /** All six letters are kept (lit and flashing on the wall panel) for the whole extend phase; they reset when it ends. */
  function beginExtend(p) {
    p.lives++;
    S.extend = { ret: S.phase === 'extend' ? 'play' : S.phase, pi: p.i };
    S.phase = 'extend'; S.phaseT = 0;
    AUDIO.jingle('extend', { resume: true });
  }

  function updateExtend(ins) {
    updateWorld(ins, false);
    if (S.extend) prebuildNext(S.phaseT);
    if (S.phaseT < EXTEND_FRAMES) return;
    const ex = S.extend;
    S.extend = null;
    if (ex && S.players[ex.pi]) S.players[ex.pi].letters = [false, false, false, false, false, false];
    if (lvDef().boss) { S.phase = ex && ex.ret ? ex.ret : 'play'; S.phaseT = 0; return; }
    for (const e of S.enemies) if (!e.dead) { poof(e.x, e.y); e.dead = true; if (e.bubble) { silentPop(e.bubble); e.bubble = null; } }
    S.enemies = [];
    beginTransition();
  }

  function endGame() {
    S.phase = 'gameover'; S.phaseT = 0;
    S.ghost = null; S.hurry = false;
    AUDIO.setTempo(1.0);
    AUDIO.stopMusic();
    AUDIO.jingle('gameover');
  }

  function checkGameOver() {
    if (S.phase === 'gameover' || S.phase === 'victory' || S.phase === 'transition') return;
    if (S.players.every((p) => p.state === 'out')) endGame();
  }

  /** The pearl is taken: a calm victory screen (special / letter bubbles and projectiles are cleared away). */
  function beginVictory() {
    S.phase = 'victory'; S.phaseT = 0; S.bossPhase = 'victory';
    for (const b of S.bubbles) if (!b.dead) silentPop(b);
    S.proj = []; S.bolts = []; S.drops = []; S.flames = []; S.streams = [];
    for (const p of S.players) if (p.state === 'dying' && p.lives > 0) respawn(p);
  }

  function updateVictory(ins) {
    updateWorld(ins, false);
    if (S.phaseT % 4 === 0) addFx('sparkle', S.rng.int(C.INNER_L, C.INNER_R - 8), S.rng.int(PLAY_TOP, FLOOR_ROW_Y - 8), 20, 5);
    if (S.phaseT >= VICTORY_FRAMES) { S.over = true; S.won = true; }
  }

  // ================================================================================================
  // Per-frame driver
  // ================================================================================================
  function updateFx() {
    for (const f of S.fx) {
      f.t++; f.x += f.vx; f.y += f.vy; f.vy += f.g;
      if (f.t >= f.dur) f.dead = true;
    }
    for (const q of S.popups) { q.t++; q.y -= 0.5; }
    S.popups = S.popups.filter((q) => q.t < 40);
  }

  function prune(a) {
    let j = 0;
    for (let i = 0; i < a.length; i++) if (!a[i].dead) a[j++] = a[i];
    a.length = j;
  }

  function compact() {
    prune(S.enemies); prune(S.bubbles); prune(S.proj); prune(S.bolts); prune(S.drops);
    prune(S.flames); prune(S.streams); prune(S.items); prune(S.fx);
  }

  /** hostile=false freezes everything that can hurt a player (used by the extend / victory phases). */
  function updateWorld(ins, hostile) {
    for (const p of S.players) updatePlayer(p, ins[p.i] || NO_INPUT);
    if (hostile) { updateEnemies(); updateGhost(); }
    updateBubbles();
    if (hostile) { updateProjectiles(); updateBolts(); updateDrops(); updateFlames(); updateStreams(); }
    updateBossBubble();
    updateItems();
    updateFx();
    if (S.hurryBanner > 0) S.hurryBanner--;
    sampleTrails();
    compact();
    checkGameOver();
  }

  /** READY! is over: enemies wake up, players get a short grace period. */
  function beginPlay() {
    S.phase = 'play'; S.phaseT = 0;
    for (const p of S.players) if (p.state === 'normal') p.inv = Math.max(p.inv, INTRO_INV);
  }

  function update(inputs) {
    if (!S || S.over) return;
    const ins = [(inputs && inputs[0]) || NO_INPUT, (inputs && inputs[1]) || NO_INPUT];
    S.frame++; S.phaseT++;
    S.burstBudget = 28;
    if (S.flashT > 0) S.flashT--;                              // cosmetic timers run in every phase
    if (S.flashCool > 0) S.flashCool--;
    updateParts();
    if (S.fanfareT > 0 && --S.fanfareT === 0) {                // boss down: fanfare after the explosion, ending music queued behind it
      AUDIO.jingle('clear_boss');
      AUDIO.music('ending');
    }
    switch (S.phase) {
      case 'intro':
        updateWorld(ins, true);
        if (S.phase === 'intro' && S.phaseT >= INTRO_FRAMES) beginPlay();
        break;
      case 'play': updateWorld(ins, true); playLogic(); break;
      case 'clear': updateWorld(ins, true); if (S.phase === 'clear') clearLogic(); break;
      case 'transition': updateTransition(); break;
      case 'extend': updateExtend(ins); break;
      case 'gameover':
        updateWorld(ins, true);
        if (S.phaseT >= GAMEOVER_FRAMES) S.over = true;
        break;
      case 'victory': updateVictory(ins); break;
      default: break;
    }
  }

  // ================================================================================================
  // Rendering (v2 "Abyss Glow": resolution independent, everything in logical 256 x 224 units)
  // ================================================================================================
  const OUTLINE = '#02040a';
  const TAU = Math.PI * 2;
  const RSTAT = { ghosts: 0, ambient: 0, motes: 0, parts: 0, calls: 0 };          // what the last render() drew (debug.fxStats)
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; };
  const hasV2 = () => typeof GFX.particle === 'function';

  /** Additive cached particle ('dot' | 'ring' | 'spark' | 'streak'), with a plain canvas fallback when the GFX module has no particle cache. */
  function P(ctx, kind, x, y, size, col, a, rot) {
    if (!(a > 0.004) || !(size > 0)) return;
    if (typeof GFX.particle === 'function') { GFX.particle(ctx, kind, x, y, size, col, a > 1 ? 1 : a, rot); return; }
    const ga = ctx.globalAlpha, go = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ga * (a > 1 ? 1 : a);
    if (kind === 'ring') { ctx.strokeStyle = col; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(x, y, size, 0, TAU); ctx.stroke(); }
    else { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, kind === 'dot' ? size * 1.8 : kind === 'streak' ? size * 0.35 : size, 0, TAU); ctx.fill(); }
    ctx.globalCompositeOperation = go; ctx.globalAlpha = ga;
  }

  /** Soft dark pool (radial, feathered): keeps HUD glyphs legible on bright wall looks without an opaque plate. */
  function softDark(ctx, cx, cy, rx, ry, a) {
    ctx.save(); ctx.translate(cx, cy); ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, 'rgba(2,4,10,' + a + ')'); g.addColorStop(0.62, 'rgba(2,4,10,' + (a * 0.72).toFixed(3) + ')'); g.addColorStop(1, 'rgba(2,4,10,0)');
    ctx.fillStyle = g; ctx.fillRect(-rx, -rx, 2 * rx, 2 * rx);
    ctx.restore();
  }

  /** Dark translucent band across the whole canvas width with feathered top / bottom edges (no opaque rectangle) behind a centred
   *  banner; optional accent hairlines fading out toward the sides. */
  function band(ctx, y0, y1, accent, a, feather) {
    a = a === undefined ? 0.74 : a;
    const f = feather === undefined ? 8 : feather, h = y1 - y0 + 2 * f, s = f / h;
    const g = ctx.createLinearGradient(0, y0 - f, 0, y1 + f);
    g.addColorStop(0, 'rgba(2,5,12,0)'); g.addColorStop(s, 'rgba(2,5,12,' + a + ')'); g.addColorStop(1 - s, 'rgba(2,5,12,' + a + ')'); g.addColorStop(1, 'rgba(2,5,12,0)');
    ctx.fillStyle = g; ctx.fillRect(0, y0 - f, C.W, h);
    if (accent) {
      const hl = ctx.createLinearGradient(0, 0, C.W, 0);
      hl.addColorStop(0, rgba(accent, 0)); hl.addColorStop(0.18, rgba(accent, 0.55)); hl.addColorStop(0.5, rgba(accent, 0.8)); hl.addColorStop(0.82, rgba(accent, 0.55)); hl.addColorStop(1, rgba(accent, 0));
      const go = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = hl;
      ctx.fillRect(0, y0, C.W, 0.7); ctx.fillRect(0, y1 - 0.7, C.W, 0.7);
      ctx.globalCompositeOperation = go;
    }
  }

  // ---- ambient: drifting plankton (stateless: a pure function of S.frame, so freeze / pause / step all stay consistent) --------------
  const AMB = (() => {
    let s = 0x2545f491;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const out = [];
    for (let i = 0; i < 80; i++) out.push({ x: rnd() * 224, y: rnd() * 208, vy: 0.03 + rnd() * 0.1, dx: (rnd() - 0.5) * 0.04, ph: rnd() * TAU, sz: 0.32 + rnd() * 0.4, w: 0.012 + rnd() * 0.03, c: i % 6 });
    return out;
  })();
  function drawAmbient(ctx, level) {
    const n = AMBIENT_N[OPT.quality] >> (OPT.reducedMotion ? 1 : 0), f = S.frame;
    RSTAT.ambient = n;
    const th = typeof GFX.theme === 'function' ? GFX.theme(level) : null;
    const cols = th ? [th.glow || HUE.cyan, '#bfe8ff', th.accent || HUE.cyan, th.glow || HUE.cyan, '#d9f4ff', th.accent2 || HUE.violet] : [HUE.cyan, '#bfe8ff', HUE.cyan, HUE.cyan, '#d9f4ff', HUE.violet];
    const plain = OPT.quality < 1;                                          // quality 0: plain additive specks instead of cached glow dots
    const go = ctx.globalCompositeOperation;
    if (plain) ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const a = AMB[i];
      const x = C.INNER_L + (((a.x + f * a.dx + Math.sin(f * a.w + a.ph) * 4) % 224) + 224) % 224;
      const y = MAP_Y + (((a.y - f * a.vy) % MAP_H) + MAP_H) % MAP_H;
      const al = 0.14 + 0.32 * (0.5 + 0.5 * Math.sin(f * 0.035 + a.ph * 3));
      if (plain) { ctx.fillStyle = rgba(cols[a.c], (al * 0.8).toFixed(2)); ctx.fillRect(x - 0.45, y - 0.45, 0.9, 0.9); }
      else P(ctx, 'dot', x, y, a.sz, cols[a.c], al);
    }
    if (plain) ctx.globalCompositeOperation = go;
  }
  /** Slow light motes orbiting floating bubbles. */
  function drawMotes(ctx) {
    RSTAT.motes = 0;
    if (OPT.quality < 1) return;
    const cap = MOTE_MAX >> (OPT.reducedMotion ? 1 : 0);
    let n = 0;
    for (const b of S.bubbles) {
      if (b.dead || b.state === 'shot') continue;
      if (n++ >= cap) break;
      RSTAT.motes = n;
      const a = b.age * 0.035 + n * 2.1, r = 9.5 + 1.5 * Math.sin(b.age * 0.05 + n);
      P(ctx, 'dot', b.x + 8 + Math.cos(a) * r, b.y + 8 + Math.sin(a) * r * 0.85, 0.6, bubbleHue(b), 0.5);
    }
  }
  /** Shockwaves are stroked directly (crisp at any radius, and cheap: cost ~ circumference instead of the sprite's whole bounding box). */
  function bigRing(ctx, x, y, r, col, a) {
    const go = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    ctx.lineWidth = 3.2; ctx.strokeStyle = rgba(col, (0.16 * a).toFixed(3)); ctx.stroke();
    ctx.lineWidth = 1.3; ctx.strokeStyle = rgba(col, (0.55 * a).toFixed(3)); ctx.stroke();
    ctx.lineWidth = 0.55; ctx.strokeStyle = 'rgba(255,255,255,' + (0.6 * a).toFixed(3) + ')'; ctx.stroke();
    ctx.globalCompositeOperation = go;
  }
  function drawParts(ctx) {
    RSTAT.parts = S.parts.length;
    for (const p of S.parts) {
      const u = p.t / p.dur, k = 1 - u;
      switch (p.k) {
        case 'ring': {
          const r = p.s0 + (p.s1 - p.s0) * (1 - k * k), a = p.a * k * Math.sqrt(k);
          if (r >= 5) bigRing(ctx, p.x, p.y, r, p.col, a); else P(ctx, 'ring', p.x, p.y, r, p.col, a);     // direct strokes: a ring sprite's blit costs its whole bounding box
          break;
        }
        case 'dot': P(ctx, 'dot', p.x, p.y, p.s0 + (p.s1 - p.s0) * u, p.col, p.a * k); break;
        case 'spark': P(ctx, 'spark', p.x, p.y, p.s0 + (p.s1 - p.s0) * u, p.col, p.a * Math.min(1, k * 2.2) * (0.75 + 0.25 * Math.sin(p.t * 1.9 + p.rot * 5)), p.rot + p.t * 0.12); break;
        default: P(ctx, 'streak', p.x, p.y, p.s0 + (p.s1 - p.s0) * u, p.col, p.a * k, Math.atan2(p.vy, p.vx)); break;
      }
    }
  }

  // ---- sprites -------------------------------------------------------------------------------------------------------------------
  /** Motion trail: faint additive ghosts of the baked sprite at its earlier positions (only while it really moves). */
  function drawGhosts(ctx, e, name, frame, flip) {
    if (OPT.reducedMotion || OPT.quality < 1) return;
    const n = OPT.quality >= 2 ? 2 : 1;
    let on = false, go = '';
    for (let g = 0; g < n; g++) {
      if (!trailAt(e, TRAIL_BACK[g])) break;
      const dx = TP[0] - e.x, dy = TP[1] - e.y;
      if (dx * dx + dy * dy < 4 + g * 2) continue;
      if (!on) { go = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter'; on = true; }
      RSTAT.ghosts++;
      GFX.draw(ctx, name, frame, TP[0], TP[1], { flip, alpha: TRAIL_A[g] });
    }
    if (on) ctx.globalCompositeOperation = go;
  }

  function drawPlayer(ctx, p) {
    if (p.state === 'out') return;
    const pre = 'p' + (p.i + 1);
    let name, frame = 0, alpha = 1;
    if (p.state === 'dying') { name = pre + '_die'; frame = Math.floor(p.dieT / 6) % 4; }
    else {
      if (p.inv > 0) {                                                          // invulnerable: blink (steady half-bright under reduced motion)
        if (OPT.reducedMotion) alpha = 0.55; else if (Math.floor(p.inv / 3) % 2 === 0) alpha = 0.3;
      }
      if (p.stunT > 0) { name = pre + '_stun'; frame = Math.floor(p.animT / 8) % 2; }
      else if (p.shootT > 0) { name = pre + '_shoot'; frame = p.shootT > 4 ? 1 : 0; }
      else if (!p.onGround) name = pre + (p.vy < 0 ? '_jump' : '_fall');
      else if (p.vx !== 0) { name = pre + '_walk'; frame = Math.floor(p.animT / 5) % 4; }
      else { name = pre + '_idle'; frame = p.animT % 180 >= 172 ? 1 : 0; }
      drawGhosts(ctx, p, name, frame, p.face < 0);
      if (OPT.quality >= 2) P(ctx, 'dot', p.x + 8, p.y + 9, 2.6, PLAYER_COLOR[p.i], 0.14 * alpha);        // the twin lights the water around it
    }
    GFX.draw(ctx, name, frame, p.x, p.y, alpha === 1 ? { flip: p.face < 0 } : { flip: p.face < 0, alpha });
  }

  function actionPose(base, e) { return e.angry && GFX.has(base + '_angry') ? base + '_angry' : base; }

  function drawEnemy(ctx, e) {
    if (e.dead || e.state === 'trapped') return;
    if (e.state === 'enter' && e.enterT < 0) return;
    if (e.t === 'kraken') { drawBoss(ctx, e); return; }
    const o = { flip: e.d < 0 };
    let name, frame = 0;
    if (e.state === 'dying') { name = e.t + '_die'; frame = Math.floor(e.dieT / 5) % 4; o.flip = false; }
    else if (e.state === 'carried') { name = e.t + '_trapped'; frame = Math.floor(S.frame / 6) % 2; }
    // action poses have *_angry twins so the angry cue never drops out; the twin is looked up only for these three
    else if (e.t === 'crabbit' && e.pauseT > 0) name = actionPose('crabbit_throw', e);
    else if (e.t === 'springle' && e.onGround && e.sqT > 0) name = actionPose('springle_squash', e);
    else if (e.t === 'glimmer' && e.poseT > 0) name = actionPose('glimmer_fire', e);
    else { name = e.t + (e.angry ? '_angry' : '_move'); frame = Math.floor(e.animT / 6) % 4; }
    if (e.state === 'enter') o.alpha = Math.min(1, Math.max(0, e.enterT) / 30);
    if (e.state === 'frozen') { frame = 0; drawFrozen(ctx, e, name, frame, o.flip); return; }
    if (e.state === 'active' || e.state === 'dying') drawGhosts(ctx, e, name, frame, o.flip);
    // the angry look (crimson contour, steam, brows, pulsing heat halo) is baked into the *_angry frames (the K4 aura is gone); Game adds only a faint steady red light pool
    if (e.angry && e.state === 'active' && OPT.quality >= 2) P(ctx, 'dot', e.x + 8, e.y + 9, 3.2, HUE.crimson, 0.1);                   // steady (not pulsing: no K4 aura)
    GFX.draw(ctx, name, frame, e.x, e.y, o);
  }

  /** Ice look for the clock power-up: the sprite tinted icy cyan (GFX tint), a cold light pool and twinkling sparks. Blinks off during
   *  the last second (a steady fade under reduced motion). Twinkle positions come from an integer hash of the frame: render never
   *  touches any RNG. Without GFX.particle: a white silhouette wash instead. */
  function drawFrozen(ctx, e, name, frame, flip) {
    const last = e.freezeT <= 60;
    if (last && !OPT.reducedMotion && Math.floor(e.freezeT / 4) % 2 === 1) { GFX.draw(ctx, name, frame, e.x, e.y, { flip }); return; }
    if (!hasV2()) {
      GFX.draw(ctx, name, frame, e.x, e.y, { flip });
      GFX.draw(ctx, name, frame, e.x, e.y, { flip, white: true, alpha: 0.5 });
      return;
    }
    if (OPT.quality >= 2) P(ctx, 'dot', e.x + 8, e.y + 9, 3.0, HUE.ice, 0.18);
    const fa = last && OPT.reducedMotion ? 0.7 : 1;
    GFX.draw(ctx, name, frame, e.x, e.y, { flip, tint: '#4fc8ff', alpha: fa });   // icy cyan body ...
    const go = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    GFX.draw(ctx, name, frame, e.x, e.y, { flip, white: true, alpha: (e.t === 'glimmer' ? 0.24 : 0.1) * fa });                         // ... with a frosty white sheen on top (integrator: 0.2 -> 0.1: the colour-blend tint keeps its detail; with the bloom a stronger sheen blew the light bodies out to white)
    ctx.globalCompositeOperation = go;
    const step = OPT.reducedMotion ? 15 : 5, k = Math.floor(S.frame / step), ns = OPT.quality >= 1 ? 3 : 1;
    const u = (S.frame % step) / step;
    for (let i = 0; i < ns; i++) {
      const h = Math.imul(k + i * 31 + (e.sx | 0), 2654435761) >>> 0;
      P(ctx, 'spark', e.x + 1 + (h % 14), e.y + 1 + ((h >>> 8) % 14), 1.0 + 0.7 * Math.sin(u * Math.PI), (k + i) % 2 ? '#ffffff' : '#8fe6ff', 0.4 + 0.55 * Math.sin(u * Math.PI));
    }
  }

  function drawBoss(ctx, e) {
    const wind = e.state === 'active' && inkWinding(e);                  // ink telegraph: angry face + pulsing white flash
    const name = e.angry || wind ? 'kraken_angry' : 'kraken';
    const fr = Math.floor(e.animT / 14) % 2;
    const o = { flip: false, alpha: e.state === 'enter' ? Math.min(1, Math.max(0, e.enterT) / 30) : 1 };
    if (OPT.quality >= 2) P(ctx, 'dot', e.x + 24, e.y + 26, 6, e.angry ? HUE.crimson : HUE.purple, 0.12);
    GFX.draw(ctx, name, fr, e.x, e.y, o);
    if (e.flashT > 0) GFX.draw(ctx, name, fr, e.x, e.y, { white: true });
    else if (wind) {
      if (OPT.reducedMotion) GFX.draw(ctx, name, fr, e.x, e.y, { white: true, alpha: 0.3 });
      else if (Math.floor(e.inkT / 3) % 2 === 0) GFX.draw(ctx, name, fr, e.x, e.y, { white: true, alpha: 0.55 });
    }
  }

  function drawBubble(ctx, b) {
    if (b.dead) return;
    const t = b.age;
    if (b.state === 'shot') {
      GFX.draw(ctx, 'bubble_shot', Math.min(2, Math.floor((b.dist / b.range) * 3)), b.x, b.y);
      return;
    }
    // end-of-life warning of special / letter bubbles: blink (steady half-bright under reduced motion)
    const dying = b.life - b.age < 90, fade = !dying ? 1 : OPT.reducedMotion ? 0.7 : Math.floor(t / 4) % 2 ? 0.5 : 1;
    switch (b.kind) {
      case 'trapped': {
        const e = b.enemy;
        const frac = b.trapT / b.trapTime, stage = frac < 0.5 ? 0 : frac < 0.8 ? 1 : 2;
        const jx = stage === 2 && t % 4 < 2 ? 1 : 0;
        if (e) GFX.draw(ctx, e.t + '_trapped', Math.floor(t / 8) % 2, b.x + jx, b.y, { flip: e.d < 0 });
        GFX.draw(ctx, 'trap_overlay', stage, b.x + jx, b.y);
        break;
      }
      case 'empty':
        if (b.life - b.age <= WARN_FRAMES) GFX.draw(ctx, 'bubble_warn', Math.floor(t / 6) % 2, b.x, b.y);
        else GFX.draw(ctx, 'bubble', Math.floor(t / 16) % 2, b.x, b.y);
        break;
      case 'letter':
        GFX.draw(ctx, 'bubble_letter', Math.floor(t / 12) % 2, b.x, b.y, { alpha: fade });
        // integrator: SPEC_V2 documents only {align, scale, shadow, outline, glow} for GFX.text -> fade through ctx.globalAlpha (GFX.text multiplies it)
        { const ga = ctx.globalAlpha; ctx.globalAlpha = ga * fade; GFX.text(ctx, b.letter, b.x + 8, b.y + 4, '#ffffff', { align: 'center' }); ctx.globalAlpha = ga; }
        break;
      default:
        GFX.draw(ctx, 'bubble_' + b.kind, Math.floor(t / 12) % 2, b.x, b.y, { alpha: fade });
    }
  }

  function drawItem(ctx, it) {
    if (it.dead) return;
    const pearl = it.kind === 'moonpearl';
    const left = it.life - it.age;
    let a = 1;
    if (!pearl && left < FOOD_BLINK) a = OPT.reducedMotion ? 0.7 : 0.3 + 0.7 * (0.5 + 0.5 * Math.cos(left * Math.PI / 12));    // expiry cue: smooth pulse, never a hard strobe
    const bob = it.kind.startsWith('pu_') ? Math.round(Math.sin(it.age / 10) * 1.5) : 0;
    const pulse = 0.5 + 0.5 * Math.sin(it.age * 0.11 + it.x * 0.05), hue = itemHue(it.kind);
    if (pearl) P(ctx, 'dot', it.x + 16, it.y + 17, 4.6 + pulse * 0.8, hue, (0.16 + 0.16 * pulse) * a);
    else P(ctx, 'dot', it.x + 8, it.y + 9 + bob, 2.6 + pulse * 0.6, hue, (0.2 + 0.22 * pulse) * a);        // glow pulse
    const gl = 0.5 + 0.5 * pulse;                                                                       // the sprite's own halo breathes with the pulse (GFX {glow}; plain draw without v2 GFX)
    if (pearl) GFX.draw(ctx, 'moonpearl', Math.floor(it.age / 10) % 2, it.x, it.y, { glow: gl });
    else GFX.draw(ctx, it.kind, 0, it.x, it.y + bob, a === 1 ? { glow: gl } : { alpha: a, glow: gl });
  }

  function drawFx(ctx, f) {
    if (f.dead) return;
    const nf = GFX.frames(f.sprite) || 1;
    const frame = Math.min(nf - 1, Math.floor(f.t / f.tick));
    const fade = f.dur - f.t < 10 ? (f.dur - f.t) / 10 : 1;
    GFX.draw(ctx, f.sprite, frame, f.x, f.y, fade < 1 ? { alpha: fade } : undefined);
  }

  function drawWorldEntities(ctx) {
    for (const f of S.flames) {
      if (f.t > FLAME_FRAMES - 30 && Math.floor(f.t / 3) % 2) continue;
      GFX.draw(ctx, 'flame', Math.floor(f.t / 4) % 3, f.x, f.y);
    }
    for (const it of S.items) drawItem(ctx, it);
    for (const e of S.enemies) drawEnemy(ctx, e);
    for (const s of S.streams) {
      const fr = Math.floor(S.frame / 5) % 2;
      for (const seg of s.trail) GFX.draw(ctx, seg.k === 'fall' ? 'water_fall' : 'water_flow', fr, seg.x, seg.y);
      GFX.draw(ctx, s.mode === 'fall' ? 'water_fall' : 'water_flow', fr, s.x, s.y);
    }
    for (const b of S.bubbles) drawBubble(ctx, b);
    if (S.bossBubble) GFX.draw(ctx, 'kraken_trapped', 0, S.bossBubble.x, S.bossBubble.y);
    for (const p of S.players) drawPlayer(ctx, p);
    if (S.ghost) {
      const g = S.ghost;
      GFX.draw(ctx, 'bonefin', Math.floor(g.age / 10) % 2, g.x, g.y, { flip: g.vx < 0, alpha: 0.85 });
    }
    for (const q of S.proj) GFX.draw(ctx, q.type, Math.floor(q.age / 4) % 2, q.x, q.y);
    for (const bo of S.bolts) {                                           // bolt with two fading afterimages
      const fr = Math.floor(bo.age / 2) % 2, flip = bo.dir < 0;
      if (OPT.quality >= 1) P(ctx, 'dot', bo.x + 8, bo.y + 4, 2.4, HUE.amber, 0.2);
      GFX.draw(ctx, 'bolt', fr, bo.x - bo.dir * 12, bo.y, { flip, alpha: 0.25 });
      GFX.draw(ctx, 'bolt', fr, bo.x - bo.dir * 6, bo.y, { flip, alpha: 0.5 });
      GFX.draw(ctx, 'bolt', fr, bo.x, bo.y, { flip });
    }
    for (const d of S.drops) { P(ctx, 'dot', d.x + 4, d.y + 4, 1.8, HUE.ember, 0.2); GFX.draw(ctx, 'fire_drop', Math.floor(d.age / 3) % 2, d.x, d.y); }
    for (const f of S.fx) drawFx(ctx, f);
    drawMotes(ctx);
    drawParts(ctx);
    if (S.flashT > 0) {                                                    // chain / thunder / bomb light: a faint tinted wash, <= FLASH_MAX
      ctx.globalAlpha = flashAlpha();
      ctx.fillStyle = S.flashCol;
      ctx.fillRect(0, MAP_Y, C.W, MAP_H);
      ctx.globalAlpha = 1;
    }
  }

  /** Score / life popups, drawn after the banner bands (renderOverlays) so a popup rising through a band stays fully bright.
   *  Clipped to the playfield; fades out over its last 12 frames. */
  function drawPopups(ctx) {
    if (!S.popups.length) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, MAP_Y, C.W, MAP_H);
    ctx.clip();
    for (const q of S.popups) {
      const x = U.clamp(q.x, 16 + (q.text.length * 4), 240 - q.text.length * 4);
      const a = q.t > 28 ? Math.max(0, (40 - q.t) / 12) : 1;
      if (OPT.quality >= 2) P(ctx, 'dot', x, q.y + 4.5, 1.9, q.color, 0.14 * a);
      { const ga = ctx.globalAlpha; if (a !== 1) ctx.globalAlpha = ga * a;      // integrator: fade via globalAlpha (contract: no `alpha` text option)
        GFX.text(ctx, q.text, x, q.y, q.color, { align: 'center', outline: OUTLINE }); ctx.globalAlpha = ga; }
    }
    ctx.restore();
  }

  /** Round number on the left wall: thin glowing digits on a soft dark pool (legible on every wall look). */
  function drawRoundNumber(ctx, n, y) {
    softDark(ctx, 8, y + 4, 12, 9, 0.66);
    GFX.text(ctx, String(n).padStart(2, '0'), 0, y, '#cffaff', { outline: OUTLINE });
    const go = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgba(GFX.theme(n - 1).accent2, 0.6);
    ctx.fillRect(2, y + 9.2, 12, 0.6);
    ctx.globalCompositeOperation = go;
  }

  /** Round backdrop: GFX.bgCanvas (drawn at 256 x 208 logical px, whatever its backing size) when the GFX module has it, else the flat theme colour. */
  function drawBackdrop(ctx, levelIndex, y) {
    if (typeof GFX.bgCanvas === 'function') { ctx.drawImage(GFX.bgCanvas(levelIndex), 0, y, C.W, MAP_H); return; }
    ctx.fillStyle = GFX.theme(levelIndex).bg;
    ctx.fillRect(0, y, C.W, MAP_H);
  }

  function renderPlayfield(ctx) {
    drawBackdrop(ctx, S.level - 1, MAP_Y);
    drawAmbient(ctx, S.level - 1);
    ctx.drawImage(GFX.levelCanvas(S.level - 1, S.map), 0, MAP_Y, C.W, MAP_H);
    if (OPT.quality >= 2 && typeof GFX.levelGlints === 'function') GFX.levelGlints(ctx, S.level - 1, S.map, S.frame / 60);   // travelling glints on the lit top faces
    drawWorldEntities(ctx);
  }

  function renderTransition(ctx) {
    const tr = S.tr;
    const k = ease(Math.min(1, tr.t / TRANSITION_FRAMES));
    const off = Math.round(k * MAP_H);
    const from = LEVELS[tr.from - 1], to = LEVELS[tr.to - 1];
    drawBackdrop(ctx, tr.from - 1, MAP_Y - off);
    ctx.drawImage(GFX.levelCanvas(tr.from - 1, from.map), 0, MAP_Y - off, C.W, MAP_H);
    drawBackdrop(ctx, tr.to - 1, MAP_Y + MAP_H - off);
    ctx.drawImage(GFX.levelCanvas(tr.to - 1, to.map), 0, MAP_Y + MAP_H - off, C.W, MAP_H);
    drawRoundNumber(ctx, tr.from, MAP_Y + 4 - off);
    drawRoundNumber(ctx, tr.to, MAP_Y + 4 + MAP_H - off);
    for (const p of S.players) {                                           // players ride bubbles to their spawn
      if (p.state !== 'normal') continue;
      P(ctx, 'dot', p.x + 8, p.y + 9, 3.0, PLAYER_COLOR[p.i], 0.13);
      GFX.draw(ctx, 'p' + (p.i + 1) + '_idle', 0, p.x, p.y, { flip: p.face < 0 });
      GFX.draw(ctx, 'bubble', Math.floor(tr.t / 12) % 2, p.x, p.y);
    }
  }

  const pad6 = (n) => String(Math.max(0, Math.floor(n))).padStart(6, '0');

  /** A life pearl: glowing core + faint ring in the player's colour. */
  function drawPearl(ctx, x, y, i) {
    const br = 0.9 + 0.1 * Math.sin(S.frame / 28 + y * 0.3);
    P(ctx, 'ring', x, y, 2.9, PLAYER_COLOR[i], 0.65 * br);
    P(ctx, 'dot', x, y, 1.35, PLAYER_HOT[i], 0.95 * br);
  }

  function renderHud(ctx) {
    const p1 = S.players[0], p2 = S.players[1];
    ctx.fillStyle = '#02040a';
    ctx.fillRect(0, 0, C.W, MAP_Y);
    GFX.text(ctx, '1UP', 16, 0, PLAYER_COLOR[0]);
    GFX.text(ctx, 'HI SCORE', 128, 0, HUE.amber, { align: 'center' });
    P(ctx, 'dot', 12.2, 4.2, 0.7, PLAYER_COLOR[0], 0.9);
    if (p2) { GFX.text(ctx, '2UP', 240, 0, PLAYER_COLOR[1], { align: 'right' }); P(ctx, 'dot', 243.8, 4.2, 0.7, PLAYER_COLOR[1], 0.9); }
    else if (S.joinHint && Math.floor(S.frame / 30) % 2 === 0) GFX.text(ctx, S.joinHint, 240, 0, PLAYER_COLOR[1], { align: 'right' });
    GFX.text(ctx, pad6(p1.score), 64, 8, PLAYER_HOT[0], { align: 'right' });
    GFX.text(ctx, pad6(Math.max(S.hiScore, p1.score, p2 ? p2.score : 0)), 152, 8, '#fff1d6', { align: 'right' });
    if (p2) GFX.text(ctx, pad6(p2.score), 240, 8, PLAYER_HOT[1], { align: 'right' });
    if (S.phase !== 'transition') drawRoundNumber(ctx, S.level, MAP_Y + 4);
    S.players.forEach((p, i) => {
      const x = i === 0 ? 8 : 248;
      const reserve = Math.min(8, Math.max(0, p.lives - 1));
      if (reserve > 0) {                                                    // lives: small glowing pearls up the foot of the wall
        softDark(ctx, x, 207 - (reserve - 1) * 3.5, 8, (reserve * 7 + 6) / 2, 0.5);
        for (let k = 0; k < reserve; k++) drawPearl(ctx, x, 207 - k * 7, i);
      }
      softDark(ctx, x, MAP_Y + 4 * T + 3 * T - 1, 9, 31, 0.5);              // EXTEND letters down the side walls: lit = ringed + glowing, dim = faint
      const extending = S.phase === 'extend' && S.extend && S.extend.pi === i;   // all six lit and pulsing (slowly; steady under reduced motion)
      const hotNow = extending && !OPT.reducedMotion && Math.floor(S.phaseT / 14) % 2 === 0;
      for (let k = 0; k < 6; k++) {
        const y = MAP_Y + (4 + k) * T;
        if (p.letters[k]) {
          P(ctx, 'dot', x, y + 4, 3.4, PLAYER_COLOR[i], 0.2);
          P(ctx, 'ring', x, y + 4, 3.7, PLAYER_COLOR[i], 0.55);
          GFX.text(ctx, LETTERS[k], x, y, hotNow ? '#ffffff' : PLAYER_HOT[i], { align: 'center' });
        } else GFX.text(ctx, LETTERS[k], x, y, 'rgba(120,205,230,0.36)', { align: 'center', shadow: false, glow: false });
      }
    });
  }

  /** Boss gauge: a thin neon bar in the ceiling row with a glowing crown glyph; white flash on a hit. Hidden during the intro. */
  function crownGlyph(ctx, x, y, col) {
    const pts = [[0, 5.5], [0, 1.2], [2.6, 3.4], [5, 0], [7.4, 3.4], [10, 1.2], [10, 5.5]];
    ctx.save();
    ctx.translate(x, y); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(col, 0.2); ctx.lineWidth = 3.4; ctx.stroke();
    ctx.strokeStyle = rgba(col, 0.55); ctx.lineWidth = 1.7; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,248,225,0.95)'; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.restore();
    for (const j of [[0, 1.2], [5, 0], [10, 1.2]]) P(ctx, 'dot', x + j[0], y + j[1], 0.7, HUE.white, 0.9);
  }
  function renderBossBar(ctx) {
    const boss = S.enemies.find((e) => e.t === 'kraken' && !e.dead);
    if (!boss || S.phase === 'intro' || boss.state === 'enter') return;
    const hit = boss.flashT > 0;
    const x0 = 74, x1 = 198, y = MAP_Y + 5.5;
    softDark(ctx, 128, y, 84, 9, 0.5);
    const frac = U.clamp(boss.hp / S.bossMax, 0, 1);
    const col = hit ? '#ffffff' : boss.angry ? '#ff3b5c' : '#c05cff', core = hit ? '#ffffff' : boss.angry ? '#ffc4cc' : '#f2dcff';
    const seg = (xa, xb) => { ctx.beginPath(); ctx.moveTo(xa, y); ctx.lineTo(xb, y); ctx.stroke(); };
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(150,170,230,0.32)'; ctx.lineWidth = 3.4; seg(x0, x1);                  // track: hairline rim ...
    ctx.strokeStyle = 'rgba(3,6,16,0.85)'; ctx.lineWidth = 2.3; seg(x0, x1);                         // ... around a dark core
    if (frac > 0) {
      const xf = x0 + (x1 - x0) * frac;
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(col, 0.2); ctx.lineWidth = 6.5; seg(x0, xf);
      ctx.strokeStyle = rgba(col, 0.62); ctx.lineWidth = 2.3; seg(x0, xf);
      ctx.strokeStyle = core; ctx.lineWidth = 0.9; seg(x0, xf);
      ctx.globalCompositeOperation = 'source-over';
      P(ctx, 'dot', xf, y, 1.3, core, 0.9);
    }
    ctx.fillStyle = 'rgba(3,6,16,0.8)';                                                              // quarter ticks
    for (let q = 1; q <= 3; q++) ctx.fillRect(x0 + ((x1 - x0) * q) / 4 - 0.3, y - 1.4, 0.6, 2.8);
    ctx.restore();
    crownGlyph(ctx, 59, MAP_Y + 2.5, hit ? '#ffffff' : HUE.gold);
  }

  const EXTEND_COLS = [HUE.magenta, HUE.amber, '#ffe27a', HUE.lime, HUE.cyan, HUE.violet];

  function renderOverlays(ctx) {
    const th = GFX.theme(S.level - 1);
    const center = (str, y, color, scale) => GFX.text(ctx, str, 128, y, color, { align: 'center', scale: scale || 1, outline: OUTLINE });
    if (S.phase === 'intro') {
      const boss = S.level === 30;
      band(ctx, 78, boss ? 140 : 124, th.accent2);
      center('ROUND ' + S.level, 84, '#eaffff', 2);
      if (boss) center('THE KRAKEN KING!', 108, '#ffa090');
      if (S.phaseT > 60 && (OPT.reducedMotion || Math.floor(S.phaseT / 8) % 4 !== 3)) center('READY!', boss ? 124 : 108, '#fff2b0');
    }
    if (S.hurryBanner > 0 && (OPT.reducedMotion || Math.floor(S.hurryBanner / 5) % 2 === 0)) {
      // hostile moment (every enemy turns angry): outlined text on a faint soft band, so enemies, pebbles and ink in the rows behind stay readable
      band(ctx, 96, 112, null, 0.34, 6);
      center('HURRY UP!', 96, '#ff6a5e', 2);
    }
    if (S.phase === 'extend') {
      band(ctx, 84, 134);
      center('EXTEND!', 92, EXTEND_COLS[Math.floor(S.frame / 14) % 6], 2);
      center('1UP', 116, '#9dffa8');
    }
    if (S.phase === 'gameover') { band(ctx, 88, 120); center('GAME OVER', 96, '#eaffff', 2); }
    if (S.phase === 'victory') {
      band(ctx, 68, 138, '#ffe27a');
      center('THE MOON', 76, '#ffe27a', 2);
      center('PEARL IS', 96, '#ffe27a', 2);
      center('SAFE!', 116, '#ffffff', 2);
    }
    drawPopups(ctx);
    if (lvDef().boss && S.bossPhase === 'fight') renderBossBar(ctx);
  }

  // ---- warm-up: bake the glyph tiles of the popup colours and the particle sprites of every effect hue during the first frames of a game
  // (drawn far outside the canvas: only the cache fill matters), so the first chain does not hitch on first-use bakes ---------------
  const WARM_TEXT = ['#ff7a5e', '#ffb23e', '#ffe27a', '#eaffff', '#7dff8a', '#ffe36b'];
  const WARM_HUES = [HUE.cyan, HUE.amber, HUE.ember, HUE.crimson, HUE.white, HUE.violet, HUE.lime, HUE.cobalt, HUE.purple, HUE.gold, HUE.ice, HUE.magenta, HUE.mint];
  function warmFx(ctx) {
    const i = S.warm++;
    if (i < WARM_TEXT.length * 2) {
      GFX.text(ctx, i & 1 ? '1UPEXTND' : '0123456789', -300, -300, WARM_TEXT[i >> 1], { outline: OUTLINE });
    } else if (i < WARM_TEXT.length * 2 + WARM_HUES.length) {
      const h = WARM_HUES[i - WARM_TEXT.length * 2];
      P(ctx, 'dot', -300, -300, 0.9, h, 0.5); P(ctx, 'dot', -300, -300, 1.9, h, 0.5); P(ctx, 'ring', -300, -300, 3, h, 0.5);
      P(ctx, 'spark', -300, -300, 1.6, h, 0.5); P(ctx, 'streak', -300, -300, 5.4, h, 0.5, 0);
    }
  }

  function render(ctx) {
    if (!S) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, C.W, C.H); return; }
    RSTAT.ghosts = 0;
    if (S.warm < 40 && OPT.quality >= 1 && hasV2()) warmFx(ctx);
    ctx.fillStyle = '#02040a';
    ctx.fillRect(0, 0, C.W, C.H);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, MAP_Y, C.W, MAP_H);
    ctx.clip();
    if (S.phase === 'transition') renderTransition(ctx); else renderPlayfield(ctx);
    ctx.restore();
    renderHud(ctx);
    if (S.phase !== 'transition') renderOverlays(ctx);
  }

  // ================================================================================================
  // Public API
  // ================================================================================================
  /** Presentation options (SPEC_V2 sec. 1 / 4): reducedMotion (no flashes, no trails, half the ambient particles, steady instead of blinking cues)
   *  and quality 0 / 1 / 2 (2 = full; 1 = fewer ambient specks and smaller bursts; 0 = minimal, no trails / motes). Callable at any time, also
   *  before start(); the values persist across games. Returns the active options. Purely cosmetic: no mechanic reads them. */
  function setOptions(o) {
    if (o && typeof o === 'object') {
      if (o.reducedMotion !== undefined) OPT.reducedMotion = !!o.reducedMotion;
      if (o.quality !== undefined) { const q = Math.round(+o.quality); if (q === q) OPT.quality = q < 0 ? 0 : q > 2 ? 2 : q; }
    }
    if (S && OPT.reducedMotion) { S.flashT = 0; S.flashCool = 0; }
    return { reducedMotion: OPT.reducedMotion, quality: OPT.quality };
  }

  function start(opts) {
    const o = opts || {};
    const n = o.players === 2 ? 2 : 1;
    S = {
      rng: U.rng(o.seed === undefined ? 12345 : o.seed), frame: 0, phase: 'intro', phaseT: 0,
      level: 1, highest: 1, hiScore: o.hiScore | 0, over: false, won: false, god: false, noClear: false,
      pendingJoin: false, joinHint: o.joinHint === undefined ? 'PUSH Q' : String(o.joinHint),
      players: [], enemies: [], bubbles: [], proj: [], bolts: [], drops: [], flames: [], streams: [], items: [], fx: [], popups: [],
      ghost: null, bossBubble: null, bossPhase: '', bossPhase2: false, fanfareT: 0, hurry: false, hurryT: 0, hurryBanner: 0,
      flashT: 0, flashDur: 14, flashA: 0, flashCool: 0, flashCol: '#ffffff', parts: [], burstBudget: 28, warm: 0,
      vrng: U.rng(((o.seed === undefined ? 12345 : o.seed) ^ 0x5bd1e995) >>> 0),          // cosmetic stream: effects never consume S.rng
      specialT: 0, thunderT: 0, letterT: 0, puT: 0, skipTo: 0, tr: null, clearT: 0, idleT: 0,
      extend: null, map: null, solid: null, gaps: [], spots: [], bossMax: BOSS_HP_1P,
    };
    for (let i = 0; i < n; i++) S.players.push(makePlayer(i));
    startRound(U.clamp((o.level | 0) || 1, 1, 30), true);
    S.highest = S.level;
  }

  function join(pi) {
    if (!S || pi !== 1 || S.over || S.players.length > 1 || S.pendingJoin) return;
    if (S.phase === 'gameover' || S.phase === 'victory') return;
    if (S.players[0].state === 'out') return;
    if (S.phase === 'transition') { S.pendingJoin = true; return; }
    addPlayer2();
  }

  const isOver = () => !!S && S.over;
  const result = () => ({
    won: !!(S && S.won), level: S ? S.highest : 1,
    scores: [S ? S.players[0].score : 0, S && S.players[1] ? S.players[1].score : 0],
    players: S ? S.players.length : 1,
  });

  function stateSnapshot() {
    if (!S) return { level: 0, phase: 'none', frame: 0, players: [], enemies: [], bubbles: [], items: [], hurry: false, ghost: false, bossHp: 0, letters: [[], []] };
    const noOneActs = S.players.every((p) => p.state !== 'normal');
    const phase = S.over ? 'gameover' : S.phase === 'play' && noOneActs && S.players.some((p) => p.state === 'dying') ? 'dying' : S.phase;
    const boss = S.enemies.find((e) => e.t === 'kraken' && !e.dead);
    const bubbles = S.bubbles.filter((b) => !b.dead).map((b) => ({ x: b.x, y: b.y, kind: b.kind, state: b.popAt ? 'pop' : b.state }));
    if (S.bossBubble) bubbles.push({ x: S.bossBubble.x, y: S.bossBubble.y, kind: 'kraken', state: 'float' });
    return JSON.parse(JSON.stringify({
      level: S.level, phase: S.over && S.won ? 'victory' : phase, frame: S.frame, phaseT: S.phaseT,
      players: S.players.map((p) => ({
        x: p.x, y: p.y, vx: p.vx, vy: p.vy, lives: p.lives, score: p.score, onGround: p.onGround, face: p.face,
        alive: p.state !== 'out' && !(p.state === 'dying' && p.lives === 0), state: p.state, inv: p.inv, stun: p.stunT,
        power: Object.keys(p.power).filter((k) => p.power[k]),
      })),
      enemies: S.enemies.filter((e) => !e.dead).map((e) => ({ t: e.t, x: e.x, y: e.y, state: e.state, angry: e.angry, hp: e.hp })),
      bubbles,
      items: S.items.filter((it) => !it.dead).map((it) => ({ kind: it.kind, x: it.x, y: it.y })),
      hurry: S.hurry, hurryT: S.hurryT, ghost: !!S.ghost, bossHp: boss ? boss.hp : 0, bossMax: S.bossMax, bossPhase: S.bossPhase,
      letters: [0, 1].map((i) => (S.players[i] ? S.players[i].letters.map((h, k) => (h ? LETTERS[k] : '')).filter(Boolean) : [])),
      counts: { proj: S.proj.length, bolts: S.bolts.length, flames: S.flames.length, streams: S.streams.length, fx: S.fx.length, popups: S.popups.length },
      over: S.over, won: S.won,
    }));
  }

  const debug = {
    setLevel(n) { if (S) startRound(n, false); },
    killAll() {
      if (!S) return;
      const first = S.players.findIndex((p) => p.state !== 'out');
      const chain = newChain(Math.max(0, first));
      for (const e of S.enemies) {
        if (e.dead || e.state === 'dying') continue;
        if (e.t === 'kraken') { e.hp = 0; defeatBoss(e); continue; }
        if (e.bubble) { silentPop(e.bubble); e.bubble = null; }
        killEnemy(e, chain);
      }
    },
    god(on) { if (S) S.god = on !== false; },
    state: stateSnapshot,
    spawn(type, x, y) {
      if (!S) return;
      x = x === undefined ? 128 : x; y = y === undefined ? 100 : y;
      if (ENEMY_TYPES.includes(type)) S.enemies.push(makeActiveEnemy(type, x, y));
      else if (type === 'bonefin') { S.ghost = { x, y, vx: 0, vy: 0, age: 0 }; }
      else if (isSpecialKind(type)) { const b = makeBubble(type, x, y); pickAttractor(b); S.bubbles.push(b); }
      else if (type === 'letter') {
        const p = S.players[0], miss = [];
        for (let i = 0; i < 6; i++) if (!p.letters[i]) miss.push(LETTERS[i]);
        const b = makeBubble('letter', x, y); b.letter = miss.length ? miss[0] : 'E'; pickAttractor(b); S.bubbles.push(b);
      } else if (type === 'moonpearl' || type.startsWith('food_') || type.startsWith('pu_')) {
        S.items.push({ kind: type, x, y, age: 0, life: type === 'moonpearl' ? 1e9 : PU_LIFE, vy: 0, dead: false });
      } else if (PU_WEIGHTS.some(([k]) => k === type)) S.items.push({ kind: 'pu_' + type, x, y, age: 0, life: PU_LIFE, dead: false });
    },
    // ---- non-contract helpers for tests ---------------------------------------------------------
    _S: () => S,
    skipIntro() {
      if (!S || S.phase !== 'intro') return;
      for (const e of S.enemies) if (e.state === 'enter') { e.state = 'active'; e.x = e.sx; e.y = e.sy; e.enterT = e.enterLen; resetWatch(e); if (e.t === 'kraken') { e.jx = -1; e.jy = 1; } }
      S.phase = 'play'; S.phaseT = 0;
    },
    clearEnemies() {
      if (!S) return;
      for (const e of S.enemies) { e.dead = true; if (e.bubble) { silentPop(e.bubble); e.bubble = null; } }
      prune(S.enemies);
    },
    noClear(on) { if (S) S.noClear = on !== false; },
    setPlayer(i, props) { if (S && S.players[i]) Object.assign(S.players[i], props); },
    setHurryTimer(frames) { if (S) S.hurryT = frames; },
    give(i, kind) { if (S && S.players[i]) applyPower(S.players[i], kind); },
    addScore(i, pts) { if (S) addScore(i, pts); },
    // ---- presentation probes (v2 tests; non-contract) ----------------------------------------------------------------
    options() { return { reducedMotion: OPT.reducedMotion, quality: OPT.quality }; },
    /** Current full-screen flash alpha as rendered this frame (0 = none) and the frames until the next flash may start. */
    flash() { return S ? { alpha: flashAlpha(), t: S.flashT, cool: S.flashCool, col: S.flashCol, max: FLASH_MAX, cooldown: FLASH_COOL } : { alpha: 0, t: 0, cool: 0, col: '#fff', max: FLASH_MAX, cooldown: FLASH_COOL }; },
    /** Live cosmetic counts and the caps they must respect. */
    fxStats() { return S ? { parts: S.parts.length, partCap: PART_CAP[OPT.quality], ambient: AMBIENT_N[OPT.quality] >> (OPT.reducedMotion ? 1 : 0), fx: S.fx.length, fxCap: FX_CAP, popups: S.popups.length, popupCap: POPUP_CAP,
      drawn: { ghosts: RSTAT.ghosts, ambient: RSTAT.ambient, motes: RSTAT.motes, parts: RSTAT.parts } } : null; },
    /** Spawn a cosmetic effect by name (visual tests only): 'ring' | 'burst' | 'chain' | 'flash'. */
    _fx(kind, x, y, arg) {
      if (!S) return;
      if (kind === 'ring') ring(x, y, arg || HUE.cyan, 4, 18, 15, 0.9);
      else if (kind === 'burst') burst(x, y, arg || HUE.amber, 12, 2.2, { size: 1.6, life: 34 });
      else if (kind === 'chain') chainLight(x, y, arg || HUE.cyan, 6);
      else if (kind === 'flash') flash(10, arg || FLASH_MAX);
    },
  };

  return { start, update, render, join, isOver, result, setOptions, debug };
})();
