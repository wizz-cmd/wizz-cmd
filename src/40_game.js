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
 *  - Presentation: every centred banner sits on a dark translucent band across the playfield; round number, lives and
 *    EXTEND panel have dark plates; chain popups stack 9 px apart; the next round's level canvas / backdrop are built
 *    during the clear phase. The backdrop comes from GFX.bgCanvas when the GFX module has it (feature-detected), and
 *    GFX.text gets {outline} (older GFX ignores it).
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
  const THUNDER_FLASH_COOL = 20;             // frames between thunder screen flashes (<= 3 per second)
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

  const PLAYER_COLOR = ['#ff6fae', '#6fd8ff'];
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
  const popupColor = (pts) => (pts >= 4000 ? '#ff7a5e' : pts >= 2000 ? '#ffb347' : pts >= 1000 ? '#ffe36b' : '#ffffff');

  function addFx(sprite, x, y, dur, tick, o) {
    if (S.fx.length >= FX_CAP) S.fx.shift();
    S.fx.push(Object.assign({ sprite, x, y, t: 0, dur, tick: tick || 4, vx: 0, vy: 0, g: 0, dead: false }, o));
  }
  const poof = (x, y) => addFx('poof', x, y, 18, 6);
  const sparkle = (x, y) => addFx('sparkle', x, y, 16, 4);

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
    S.hurry = false; S.hurryT = 0; S.hurryBanner = 0; S.flashT = 0; S.flashDur = 14; S.flashA = 0.85; S.thunderFlashCool = 0;
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
  /** Screen flash: `dur` frames, fading from peak alpha `a` (a stronger flash already running wins). */
  function flash(dur, a) {
    if (S.flashT > 0 && S.flashA * (S.flashT / S.flashDur) >= a) return;
    S.flashT = dur; S.flashDur = dur; S.flashA = a;
  }

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
      if (S.thunderFlashCool <= 0) { flash(3, 0.32); S.thunderFlashCool = THUNDER_FLASH_COOL; }   // chained thunder pops must not strobe the screen
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
      if (!e.dead && e.state === 'active' && e.t !== 'kraken') { e.state = 'frozen'; e.freezeT = FREEZE_FRAMES; }
    }
  }

  function bomb(p) {
    sfx('bomb');
    flash(14, 0.85);
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
    if (S.flashT > 0) S.flashT--;
    if (S.thunderFlashCool > 0) S.thunderFlashCool--;
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
  // Rendering
  // ================================================================================================
  const tintCache = new Map();
  /** Cached single-colour silhouette of a sprite frame (frozen enemies get a blue tint over the sprite). */
  function tinted(name, frame, flip, color) {
    const key = name + '|' + frame + '|' + (flip ? 1 : 0) + '|' + color;
    let cv = tintCache.get(key);
    if (cv === undefined) {
      cv = null;
      const sz = GFX.size(name);
      if (typeof document !== 'undefined' && sz.w > 0 && sz.h > 0) {
        cv = document.createElement('canvas');
        cv.width = sz.w; cv.height = sz.h;
        const g = cv.getContext('2d');
        GFX.draw(g, name, frame, 0, 0, { flip, white: true });
        g.globalCompositeOperation = 'source-in';
        g.fillStyle = color;
        g.fillRect(0, 0, sz.w, sz.h);
      }
      tintCache.set(key, cv);
    }
    return cv;
  }

  function drawTinted(ctx, name, frame, x, y, flip, color, alpha) {
    const cv = tinted(name, frame, flip, color);
    if (!cv) { GFX.draw(ctx, name, frame, x, y, { flip, white: true, alpha }); return; }
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * alpha;
    ctx.drawImage(cv, Math.round(x), Math.round(y));
    ctx.globalAlpha = prev;
  }

  const auraCache = new Map();
  const AURA_RING = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  /** Cached warm-orange silhouette of a sprite frame grown by 1 px in all 8 directions (one canvas, so the pulse alpha is
   *  uniform along the whole ring), 2 px larger than the sprite: draw it at (x - 1, y - 1). */
  function aura(name, frame, flip) {
    const key = name + '|' + frame + '|' + (flip ? 1 : 0);
    let cv = auraCache.get(key);
    if (cv === undefined) {
      cv = null;
      const sil = tinted(name, frame, flip, '#ffa21f');
      if (sil) {
        cv = document.createElement('canvas');
        cv.width = sil.width + 2; cv.height = sil.height + 2;
        const g = cv.getContext('2d');
        for (const [dx, dy] of AURA_RING) g.drawImage(sil, 1 + dx, 1 + dy);
      }
      auraCache.set(key, cv);
    }
    return cv;
  }

  /** Angry enemies (hurry up) get a pulsing yellow-orange rim behind the sprite so they stay readable
   *  on red / crimson tiles and against their own crimson body colour. Alpha pulses 0.35 .. 0.70 (period 40 frames). */
  function drawAngryAura(ctx, name, frame, x, y, flip) {
    const cv = aura(name, frame, flip);
    if (!cv) return;
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * (0.525 + 0.175 * Math.sin((S.frame * Math.PI * 2) / 40));
    ctx.drawImage(cv, Math.round(x) - 1, Math.round(y) - 1);
    ctx.globalAlpha = prev;
  }

  function drawPlayer(ctx, p) {
    if (p.state === 'out') return;
    const pre = 'p' + (p.i + 1);
    let name, frame = 0;
    if (p.state === 'dying') { name = pre + '_die'; frame = Math.floor(p.dieT / 6) % 4; }
    else {
      if (p.inv > 0 && Math.floor(p.inv / 3) % 2 === 0) return;               // blink while invulnerable
      if (p.stunT > 0) { name = pre + '_stun'; frame = Math.floor(p.animT / 8) % 2; }
      else if (p.shootT > 0) { name = pre + '_shoot'; frame = p.shootT > 4 ? 1 : 0; }
      else if (!p.onGround) name = pre + (p.vy < 0 ? '_jump' : '_fall');
      else if (p.vx !== 0) { name = pre + '_walk'; frame = Math.floor(p.animT / 5) % 4; }
      else { name = pre + '_idle'; frame = p.animT % 180 >= 172 ? 1 : 0; }
    }
    GFX.draw(ctx, name, frame, p.x, p.y, { flip: p.face < 0 });
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
    // action poses have *_angry twins (GFX wave 3) so the angry cue never drops out; the twin is looked up only for these three
    else if (e.t === 'crabbit' && e.pauseT > 0) name = actionPose('crabbit_throw', e);
    else if (e.t === 'springle' && e.onGround && e.sqT > 0) name = actionPose('springle_squash', e);
    else if (e.t === 'glimmer' && e.poseT > 0) name = actionPose('glimmer_fire', e);
    else { name = e.t + (e.angry ? '_angry' : '_move'); frame = Math.floor(e.animT / 6) % 4; }
    if (e.state === 'enter') o.alpha = Math.min(1, Math.max(0, e.enterT) / 30);
    if (e.state === 'frozen') { frame = 0; drawFrozen(ctx, e, name, frame, o.flip); return; }
    if (e.angry && e.state === 'active') drawAngryAura(ctx, name, frame, e.x, e.y, o.flip);
    GFX.draw(ctx, name, frame, e.x, e.y, o);
  }

  const FROZEN_EDGE = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  /** Ice look for the clock power-up: pale-cyan 1 px outline (silhouette offset +-1), a white-blue wash over the
   *  sprite (so even the blue Glimmer changes) and twinkling pixels. Blinks off during the last second.
   *  The twinkle positions come from an integer hash of the frame: rendering never touches the game RNG. */
  function drawFrozen(ctx, e, name, frame, flip) {
    if (e.freezeT <= 60 && Math.floor(e.freezeT / 4) % 2 === 1) { GFX.draw(ctx, name, frame, e.x, e.y, { flip }); return; }
    for (const [dx, dy] of FROZEN_EDGE) drawTinted(ctx, name, frame, e.x + dx, e.y + dy, flip, '#aef0ff', 1);
    GFX.draw(ctx, name, frame, e.x, e.y, { flip });
    drawTinted(ctx, name, frame, e.x, e.y, flip, '#e4f6ff', 0.7);
    const k = Math.floor(S.frame / 5);
    for (let i = 0; i < 3; i++) {
      const h = (Math.imul(k + i * 31 + (e.sx | 0), 2654435761) >>> 0);
      ctx.fillStyle = (k + i) % 2 ? '#ffffff' : '#8fe6ff';
      ctx.fillRect(Math.round(e.x) + 2 + (h % 12), Math.round(e.y) + 2 + ((h >>> 8) % 12), 1, 1);
    }
  }

  function drawBoss(ctx, e) {
    const wind = e.state === 'active' && inkWinding(e);                  // ink telegraph: angry face + pulsing white flash
    const name = e.angry || wind ? 'kraken_angry' : 'kraken';
    const fr = Math.floor(e.animT / 14) % 2;
    const o = { flip: false, alpha: e.state === 'enter' ? Math.min(1, Math.max(0, e.enterT) / 30) : 1 };
    GFX.draw(ctx, name, fr, e.x, e.y, o);
    if (e.flashT > 0) GFX.draw(ctx, name, fr, e.x, e.y, { white: true });
    else if (wind && Math.floor(e.inkT / 3) % 2 === 0) GFX.draw(ctx, name, fr, e.x, e.y, { white: true, alpha: 0.55 });
  }

  function drawBubble(ctx, b) {
    if (b.dead) return;
    const t = b.age;
    if (b.state === 'shot') {
      GFX.draw(ctx, 'bubble_shot', Math.min(2, Math.floor((b.dist / b.range) * 3)), b.x, b.y);
      return;
    }
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
        GFX.draw(ctx, 'bubble_letter', Math.floor(t / 12) % 2, b.x, b.y, { alpha: b.life - b.age < 90 && Math.floor(t / 4) % 2 ? 0.5 : 1 });
        GFX.text(ctx, b.letter, b.x + 8, b.y + 4, '#ffffff', { align: 'center' });
        break;
      default:
        GFX.draw(ctx, 'bubble_' + b.kind, Math.floor(t / 12) % 2, b.x, b.y, { alpha: b.life - b.age < 90 && Math.floor(t / 4) % 2 ? 0.5 : 1 });
    }
  }

  function drawItem(ctx, it) {
    if (it.dead) return;
    if (it.kind === 'moonpearl') { GFX.draw(ctx, 'moonpearl', Math.floor(it.age / 10) % 2, it.x, it.y); return; }
    const left = it.life - it.age;
    if (left < FOOD_BLINK && Math.floor(left / 4) % 2) return;
    const bob = it.kind.startsWith('pu_') ? Math.round(Math.sin(it.age / 10) * 1.5) : 0;
    GFX.draw(ctx, it.kind, 0, it.x, it.y + bob);
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
      GFX.draw(ctx, 'bolt', fr, bo.x - bo.dir * 12, bo.y, { flip, alpha: 0.25 });
      GFX.draw(ctx, 'bolt', fr, bo.x - bo.dir * 6, bo.y, { flip, alpha: 0.5 });
      GFX.draw(ctx, 'bolt', fr, bo.x, bo.y, { flip });
    }
    for (const d of S.drops) GFX.draw(ctx, 'fire_drop', Math.floor(d.age / 3) % 2, d.x, d.y);
    for (const f of S.fx) drawFx(ctx, f);
    if (S.flashT > 0) {
      ctx.globalAlpha = S.flashA * Math.min(1, S.flashT / S.flashDur);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, MAP_Y, C.W, MAP_H);
      ctx.globalAlpha = 1;
    }
  }

  /** Score / life popups, drawn after the banner plates (renderOverlays) so a popup rising through a banner band stays
   *  fully bright and unsliced. Clipped to the playfield. */
  function drawPopups(ctx) {
    if (!S.popups.length) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, MAP_Y, C.W, MAP_H);
    ctx.clip();
    for (const q of S.popups) {
      const x = U.clamp(q.x, 16 + (q.text.length * 4), 240 - q.text.length * 4);
      GFX.text(ctx, q.text, x, q.y, q.color, { align: 'center', outline: OUTLINE });
    }
    ctx.restore();
  }

  const PLATE = 'rgba(6,4,20,0.72)', HUD_PLATE = 'rgba(14,6,28,0.78)', OUTLINE = '#1b1033';

  /** Round number on the left wall: white on a dark plate with a theme-coloured underline (legible on every wall look). */
  function drawRoundNumber(ctx, n, y) {
    ctx.fillStyle = HUD_PLATE;
    ctx.fillRect(0, y - 2, 16, 12);
    ctx.fillStyle = GFX.theme(n - 1).accent2;
    ctx.fillRect(1, y + 9, 14, 1);
    GFX.text(ctx, String(n).padStart(2, '0'), 0, y, '#ffffff');
  }

  /** Round backdrop: GFX.bgCanvas (subtle themed art) when the GFX module has it, else the flat theme colour. */
  function drawBackdrop(ctx, levelIndex, y) {
    if (typeof GFX.bgCanvas === 'function') { ctx.drawImage(GFX.bgCanvas(levelIndex), 0, y); return; }
    ctx.fillStyle = GFX.theme(levelIndex).bg;
    ctx.fillRect(0, y, C.W, MAP_H);
  }

  function renderPlayfield(ctx) {
    drawBackdrop(ctx, S.level - 1, MAP_Y);
    ctx.drawImage(GFX.levelCanvas(S.level - 1, S.map), 0, MAP_Y);
    drawWorldEntities(ctx);
  }

  function renderTransition(ctx) {
    const tr = S.tr;
    const k = ease(Math.min(1, tr.t / TRANSITION_FRAMES));
    const off = Math.round(k * MAP_H);
    const from = LEVELS[tr.from - 1], to = LEVELS[tr.to - 1];
    drawBackdrop(ctx, tr.from - 1, MAP_Y - off);
    ctx.drawImage(GFX.levelCanvas(tr.from - 1, from.map), 0, MAP_Y - off);
    drawBackdrop(ctx, tr.to - 1, MAP_Y + MAP_H - off);
    ctx.drawImage(GFX.levelCanvas(tr.to - 1, to.map), 0, MAP_Y + MAP_H - off);
    drawRoundNumber(ctx, tr.from, MAP_Y + 4 - off);
    drawRoundNumber(ctx, tr.to, MAP_Y + 4 + MAP_H - off);
    for (const p of S.players) {                                           // players ride bubbles to their spawn
      if (p.state !== 'normal') continue;
      GFX.draw(ctx, 'p' + (p.i + 1) + '_idle', 0, p.x, p.y, { flip: p.face < 0 });
      GFX.draw(ctx, 'bubble', Math.floor(tr.t / 12) % 2, p.x, p.y);
    }
  }

  const pad6 = (n) => String(Math.max(0, Math.floor(n))).padStart(6, '0');

  function renderHud(ctx) {
    const p1 = S.players[0], p2 = S.players[1];
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, C.W, MAP_Y);
    GFX.text(ctx, '1UP', 16, 0, PLAYER_COLOR[0]);
    GFX.text(ctx, 'HI SCORE', 128, 0, '#ff6a5e', { align: 'center' });
    if (p2) GFX.text(ctx, '2UP', 240, 0, PLAYER_COLOR[1], { align: 'right' });
    else if (S.joinHint && Math.floor(S.frame / 30) % 2 === 0) GFX.text(ctx, S.joinHint, 240, 0, PLAYER_COLOR[1], { align: 'right' });
    GFX.text(ctx, pad6(p1.score), 64, 8, '#ffffff', { align: 'right' });
    GFX.text(ctx, pad6(Math.max(S.hiScore, p1.score, p2 ? p2.score : 0)), 152, 8, '#ffffff', { align: 'right' });
    if (p2) GFX.text(ctx, pad6(p2.score), 240, 8, '#ffffff', { align: 'right' });
    if (S.phase !== 'transition') drawRoundNumber(ctx, S.level, MAP_Y + 4);
    S.players.forEach((p, i) => {
      const x = i === 0 ? 4 : 244;
      const reserve = Math.min(8, Math.max(0, p.lives - 1));
      if (reserve > 0) {                                                    // lives column on a dark plate
        ctx.fillStyle = HUD_PLATE;
        ctx.fillRect(i === 0 ? 1 : 241, 204 - (reserve - 1) * 10 - 2, 14, (reserve - 1) * 10 + 12);
      }
      for (let k = 0; k < reserve; k++) GFX.draw(ctx, 'p' + (i + 1) + '_icon', 0, x, 204 - k * 10);
      ctx.fillStyle = HUD_PLATE;                                            // EXTEND letters down the side walls
      ctx.fillRect(i === 0 ? 1 : 241, MAP_Y + 4 * T - 1, 14, 6 * T + 2);
      const extending = S.phase === 'extend' && S.extend && S.extend.pi === i;   // all six lit and flashing
      const lit = extending && Math.floor(S.phaseT / 4) % 2 === 0 ? '#ffffff' : PLAYER_COLOR[i];
      for (let k = 0; k < 6; k++) {
        const y = MAP_Y + (4 + k) * T, cx = i === 0 ? 8 : 248;
        if (p.letters[k]) GFX.text(ctx, LETTERS[k], cx, y, lit, { align: 'center' });
        else GFX.text(ctx, LETTERS[k], cx, y, 'rgba(255,255,255,0.5)', { align: 'center', shadow: false });
      }
    });
  }

  /** Framed boss gauge on a dark plate in the ceiling row: crown icon, gold frame, quarter ticks, white flash on a hit.
   *  Hidden during the intro. */
  function renderBossBar(ctx) {
    const boss = S.enemies.find((e) => e.t === 'kraken' && !e.dead);
    if (!boss || S.phase === 'intro' || boss.state === 'enter') return;
    const hit = boss.flashT > 0;
    ctx.fillStyle = 'rgba(6,4,20,0.92)';
    ctx.fillRect(54, MAP_Y, 148, 10);
    const crown = [[0, 0], [4, 0], [8, 0], [0, 1], [1, 1], [3, 1], [4, 1], [5, 1], [7, 1], [8, 1]];   // 9x4 crown, 3 points
    ctx.fillStyle = '#ffd24a';
    for (const [cx, cy] of crown) ctx.fillRect(58 + cx, MAP_Y + 3 + cy, 1, 1);
    ctx.fillRect(58, MAP_Y + 5, 9, 1);
    ctx.fillStyle = '#c9892a';
    ctx.fillRect(58, MAP_Y + 6, 9, 1);
    ctx.fillStyle = '#ff4a6a';
    ctx.fillRect(62, MAP_Y + 5, 1, 1);
    const x = 70, y = MAP_Y + 2, w = 128, h = 5;                            // gauge interior at (x+1, y+1), frame around it
    ctx.fillStyle = hit ? '#ffffff' : '#ffd24a';
    ctx.fillRect(x, y, w + 2, 1); ctx.fillRect(x, y + h + 1, w + 2, 1); ctx.fillRect(x, y, 1, h + 2); ctx.fillRect(x + w + 1, y, 1, h + 2);
    ctx.fillStyle = '#1b1033';
    ctx.fillRect(x + 1, y + 1, w, h);
    const fw = Math.round((w * Math.max(0, boss.hp)) / S.bossMax);
    ctx.fillStyle = hit ? '#ffffff' : boss.angry ? '#ff3b5c' : '#c05cff';
    ctx.fillRect(x + 1, y + 1, fw, h);
    ctx.fillStyle = hit ? '#ffffff' : boss.angry ? '#ff9aa8' : '#e6b8ff';   // top highlight row
    ctx.fillRect(x + 1, y + 1, fw, 1);
    ctx.fillStyle = 'rgba(27,16,51,0.7)';
    for (let q = 1; q <= 3; q++) ctx.fillRect(x + 1 + Math.round((w * q) / 4), y + 1, 1, h);
  }

  /** Dark translucent band across the whole inner width behind a centred banner (optional 1 px accent edges). */
  function bannerPlate(ctx, y0, y1, accent) {
    ctx.fillStyle = PLATE;
    ctx.fillRect(C.INNER_L, y0, C.INNER_R - C.INNER_L, y1 - y0);
    if (accent) {
      ctx.fillStyle = accent;
      ctx.fillRect(C.INNER_L, y0, C.INNER_R - C.INNER_L, 1);
      ctx.fillRect(C.INNER_L, y1 - 1, C.INNER_R - C.INNER_L, 1);
    }
  }

  function renderOverlays(ctx) {
    const th = GFX.theme(S.level - 1);
    const center = (str, y, color, scale) => GFX.text(ctx, str, 128, y, color, { align: 'center', scale: scale || 1, outline: OUTLINE });
    if (S.phase === 'intro') {
      const boss = S.level === 30;
      bannerPlate(ctx, 78, boss ? 140 : 124, th.accent2);
      center('ROUND ' + S.level, 84, '#ffffff', 2);
      if (boss) center('THE KRAKEN KING!', 108, '#ffa090');
      if (S.phaseT > 60 && Math.floor(S.phaseT / 8) % 4 !== 3) center('READY!', boss ? 124 : 108, '#fff2b0');
    }
    if (S.hurryBanner > 0 && Math.floor(S.hurryBanner / 5) % 2 === 0) {
      // hostile moment (every enemy turns angry): outlined text on a faint plate just as wide as the text and only while the
      // text is lit, so enemies, pebbles and ink in the rows behind it stay readable
      ctx.fillStyle = 'rgba(6,4,20,0.3)';
      ctx.fillRect(48, 93, 160, 22);
      center('HURRY UP!', 96, '#ff7a6a', 2);
    }
    if (S.phase === 'extend') {
      const hue = (S.frame * 12) % 360;
      bannerPlate(ctx, 84, 134);
      center('EXTEND!', 92, `hsl(${hue},100%,70%)`, 2);
      center('1UP', 116, '#9dffa8');
    }
    if (S.phase === 'gameover') { bannerPlate(ctx, 88, 120); center('GAME OVER', 96, '#ffffff', 2); }
    if (S.phase === 'victory') {
      bannerPlate(ctx, 68, 138, '#ffe36b');
      center('THE MOON', 76, '#ffe36b', 2);
      center('PEARL IS', 96, '#ffe36b', 2);
      center('SAFE!', 116, '#ffffff', 2);
    }
    drawPopups(ctx);
    if (lvDef().boss && S.bossPhase === 'fight') renderBossBar(ctx);
  }

  function render(ctx) {
    if (!S) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, C.W, C.H); return; }
    ctx.fillStyle = '#000';
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
  function start(opts) {
    const o = opts || {};
    const n = o.players === 2 ? 2 : 1;
    S = {
      rng: U.rng(o.seed === undefined ? 12345 : o.seed), frame: 0, phase: 'intro', phaseT: 0,
      level: 1, highest: 1, hiScore: o.hiScore | 0, over: false, won: false, god: false, noClear: false,
      pendingJoin: false, joinHint: o.joinHint === undefined ? 'PUSH Q' : String(o.joinHint),
      players: [], enemies: [], bubbles: [], proj: [], bolts: [], drops: [], flames: [], streams: [], items: [], fx: [], popups: [],
      ghost: null, bossBubble: null, bossPhase: '', bossPhase2: false, fanfareT: 0, hurry: false, hurryT: 0, hurryBanner: 0,
      flashT: 0, flashDur: 14, flashA: 0.85, thunderFlashCool: 0,
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
  };

  return { start, update, render, join, isOver, result, debug };
})();
