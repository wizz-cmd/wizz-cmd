/* FIZZ & POP v2.0 — 50_main.js  (Platform / UX layer, SPEC 2.5 + 3.5, SPEC_V2 sec. 1 + 3: "Abyss Glow")
 *
 * v3 (FIXPLAN_V3 Main: U1..U16, V2..V5, V11) — what changed in this file:
 *   LADDER (U1)   The auto quality ladder is driven by the interval the player sees (rAF to rAF: JS + canvas raster + commit), not by the callback's own cost. R = the calm
 *                 frame period (the shortest recent interval, >= one fixed step; the display refresh is measured at boot so a 30 Hz power-saving display is not "late"); a frame
 *                 later than 1.45 R counts as `dt - 0.25 R` (autoQ.feed), a window drops when its average is > 12 ms OR one frame in ten is late, and a raise needs cheap AND on-time
 *                 frames (no frame > 50 ms, <= 2 % late) in a GAMEPLAY window (menus / pause never raise). A drop soon after a raise doubles the wait on every path (fast path too).
 *                 The first 90 updates of a scene are ignored (its sprites bake then).
 *   LOOP (U2, U3) At most one render per fixed update (a 120 / 144 Hz display costs what 60 Hz does); static scenes render rarely: the idle title (after its intro), how-to and scores
 *                 at 20 fps, a paused game at 15 fps and not at all behind the click-to-resume overlay or while the page is not live; input / resize / toast / focus change /
 *                 scene change mark the frame dirty and render at once (and the scene stays at full rate for 40 updates after an input). See renderEvery(), frameStats().
 *   CALIBRATION (U4) finishBoot() runs a <= 400 ms micro-benchmark (full-frame additive blits of a 512 x 448 canvas, read-back to wait for the raster / GPU, best of 4) and starts at
 *                 the quality / k that the prediction (CAL_RATIO x blit x (k/2)^2, fitted on the CPU-raster VM) says fits CAL_BUDGET_MS: phones at once, desktops only when far
 *                 over budget. __fizzpop._main.calibration() reports it; the ladder fine-tunes from there.
 *   ENDING (U5, U6, V5) section changes (tableau -> credits -> finale -> entry) dissolve through the abyss colour over ~30 frames (no hard cut, no one-frame luminance drop);
 *                 light rays / the warm wash cost by quality (28 / 14 / 6 wedges; the wash fills only its visible 55 %); ambient and celebration bubbles keep out of the text zones.
 *   UX (U8..U16, V3, V4) compact click-to-play overlay (the title draws no menu behind it; the attract run waits; the first click lands on the title; a key that wakes the overlay is
 *                 spent on that), pre-script CSS that matches the final layout, every touch row >= 44 css px (secondary rows pair up when the list would not fit), pad labels that
 *                 scale with the button, a 44 css px BACK plate (+ a dead band above it) on the touch how-to, text >= 7 css px caps on phones, one score format, a title without help
 *                 lines (one footer line), a portrait phone with the picture + PAUSE strip centred above the pads. Fizz and Pop at 3x come from GFX.drawHero (V11).
 *
 * Boot, canvas / DPR handling, post FX + auto quality, input (keyboard / gamepad / touch / virtual), the fixed-step loop,
 * every non-gameplay scene, hi-scores, pause, mute, focus overlay and the window.__fizzpop hooks.
 *
 * RENDER   (SPEC_V2 sec. 1) The visible canvas is resolution independent: its backing store is 256k x 224k, k = css width x devicePixelRatio / 256
 *          quantised to 0.25 steps and clamped to 1..8 (see `pickScale`: when a whole step of device pixels costs <= 8 % / 6.5 % of the free space
 *          the picture is fitted to it, 1 backing px per device px; otherwise it fills the space and the browser resamples smoothly). Every frame
 *          sets ctx.setTransform(k,0,0,k,0,0) with imageSmoothingEnabled = true; scenes and Game keep drawing in LOGICAL units (256 x 224).
 *          GFX.setScale(k) is called whenever k changes (resize, DPR change, zoom). After the scene's render Main calls GFX.postFX(ctx, quality).
 *          Everything new is feature-detected (GFX.setScale / postFX / bgCanvas / levelCanvas / particle, Game.setOptions), so older modules and the
 *          stub modules of the tests keep working.
 *   Quality  0 / 1 / 2 (2 = full bloom + grain, 1 = bloom at 1/8 res, 0 = off). Starts at 2 (1 on coarse-pointer devices). Auto quality: when the
 *          2-s average of update + render + post FX exceeds 12 ms one level is dropped; 10 s of 2-s windows under 6 ms raise one again (a raise that
 *          is undone by a drop soon after doubles the next wait, up to 80 s). The level is pushed to Game.setOptions({ quality }) and readable as
 *          __fizzpop.quality / _main.quality().
 *          Integrator addition: below quality 0 auto quality also lowers the render scale k (a resolution lever, one GFX bucket step per window, css size
 *          unchanged), and a severe overload (0.5 s average > 24 ms) steps down at once; both are raised again by the same calm rule. See Q_SEVERE_MS.
 *   Reduced motion  prefers-reduced-motion: reduce -> Game.setOptions({ reducedMotion: true }), no full-screen flash anywhere in the scenes,
 *          half the ambient bubbles / plankton. Photosensitivity: no scene flashes the whole screen brighter than 12 % alpha (the story's single
 *          pearl-grab flash is capped at 12 % and absent with reduced motion); Main blinks nothing faster than 2 Hz.
 *   Cost    The backdrop of a scene (water, tower shaft, crystal ledges) is painted once per scale into a static layer and copied 1:1; the glass-tube
 *          logo is refreshed every 3rd frame; Fizz and Pop on the title / ending come from GFX.drawHero (GFX bakes and caches them).
 *          LOADING: the very first paint (at the final resolution) is a LOADING frame, before GFX.init and the first scene's bakes.
 *
 * SCENES   title -> (story ->) play -> [ending] -> entry -> scores -> title
 *          title idles 10 s -> attract: story -> howto (6 pages: rules, controls, cast, treats, power-ups, bubbles) -> scores -> title.
 *          ending = victory tableau (Fizz & Pop 2x around a glowing Moon Pearl) -> credits (rolling inside a clipped band above the
 *          Fizz / Pearl / Pop tableau, key hint on its own strip) -> the cast waves.
 *          'pause' is an overlay of the play scene (scene() keeps answering 'play'; see _main.paused()).
 *          Look: near-black water, translucent glass panels with 1 px cyan hairlines and corner ticks, thin wide-tracked glow text, neon chevrons
 *          around the selected row (concepts/c_abyss_glow/title.png).
 *
 * INPUT    One sampler runs once per fixed update and produces
 *            - two game pads {left,right,jump,fire,jumpPressed,firePressed} (rising edges computed HERE,
 *              from the OR of keyboard + gamepad + touch (P1 only) + virtual input), and
 *            - a UI view for menus: up/down/left/right (with auto-repeat), ok, alt, bksp, pause, mute, ...
 *          A key pressed AND released between two ticks still counts for one tick (the `tapped` set;
 *          touch buttons use the same trick), so quick taps and Playwright keyboard.press() are not lost.
 *          step(n) uses ONLY virtual input (input.set); the real RAF loop ORs real + virtual.
 *
 * CHOICES where the SPEC is silent (documented here, all easy to change):
 *   - Menu keys: arrows / W S navigate (left/up = previous, right/down = next), Enter / Space / Z / Q /
 *     Shift / gamepad B,X,Start / touch BUBBLE confirm (`ok`); X / gamepad A / touch JUMP are the
 *     alternative confirm (`alt`) and DELETE in the initials entry; P / Esc / Start = pause or back.
 *     H = how-to-play, T = hi-score table (also menu rows on the title screen, so touch players reach them).
 *   - Taps / clicks on the canvas: menu rows are tappable; on other scenes a tap counts as `ok`. On touch the
 *     title and pause menus use a pitch of ~44 css px per row (drawn as glass pills) and QUIT asks YES / NO.
 *   - Touch-only devices (touch UI, no key press and no gamepad seen yet): no "2 PLAYERS" row, no "PUSH Q" blink
 *     (joinHint ''), "TAP" wording everywhere.
 *   - Join: only Q or pad 1 A/B join a P2 into a 1P game (Left Shift is just an extra P2 fire key once P2 plays).
 *   - Pad slots: only usable pads (>= 4 buttons and 2 axes or "standard" mapping) take a player slot, at their first
 *     button press, and keep it until they disconnect or the title screen is entered again (unplugging pad 0
 *     never moves pad 1 onto P1; a new session starts with nobody assigned).
 *   - QUIT in the pause menu abandons the game and returns to the title (no hi-score entry).
 *   - Initials: A-Z and 0-9, 3 slots, 30 s per player (time out = the letters shown; the timer stands still while the
 *     page is blurred / hidden), players enter one after the other. On a keyboard the letters / digits are TYPED (they are
 *     letters here, never hotkeys: M does not mute, Z / Q / X confirm nothing); arrows cycle, Enter confirms, Backspace steps back.
 *     Gamepad / touch keep: left / right cycle, bubble = OK, jump = back. A game that missed the table shows "YOUR SCORE" on the
 *     scores screen; when localStorage is unavailable (sandboxed iframe) that screen says the table is kept for this visit only.
 *     A player qualifies with score > 0 and a score above the 8th place (or a free slot). Ties rank below.
 *   - Hi-scores live in U.store key 'scores' ({name,score,round} x8, sanitised on load).
 *     The title shows CONTINUE ROUND n when a game in this page session reached round >= 6; it restarts at the
 *     first round of that theme (1, 6, 11, ... ), score 0, same number of players (also after QUIT).
 *   - "Not live" reasons (blur, hidden tab, iframe scrolled / display:none = IntersectionObserver, rAF stall > 700 ms)
 *     are tracked as a set. The first one auto-pauses a running game and suspends the audio; the last one resumes the
 *     audio. The game stays on its RESUME / QUIT menu (clicking the "click to play" overlay resumes it; the overlay then says
 *     CLICK TO RESUME and the in-canvas menu is not drawn under it). A 'blur' that no 'focus' ever follows (host quirks) is
 *     released by proof of life: a real key / pointer event, or the 500 ms poll once document.hasFocus() has been true for 1.5 s.
 *     A manual pause plays sfx 'pause' and calls AUDIO.pause({suspend:false}) so menu sounds stay audible.
 *   - Audio unlock: every gesture calls AUDIO.init() while the context is not running (iOS "interrupted", calls, Siri).
 *   - Layout (fit): the page box minus the root padding (Artifact skeleton / safe areas) minus 16 px gutters; the picture takes the largest
 *     scale that fits (continuous: no pixel-grid steps), then `pickScale` snaps it as described under RENDER. Touch: portrait stack (picture on
 *     top, pads right below, buttons grow with the free height) or landscape side pads, whichever gives the larger picture (landscape needs
 *     vw >= 560); frames too small for either (best scale < 1) overlay translucent pads on the picture margins. The desktop legend is hidden
 *     when it would cost the picture more than 14 % of its scale. Portrait: the page is as tall as the padded viewport (--page-h), the controls
 *     rest at its bottom (thumb zone), the picture is centred in the space above them. The fixed side pads sit inside the measured root padding
 *     (--pad-l/r/t/b), whichever mechanism the host uses for safe areas.
 *   - Ambient bubbles (title, story, how-to, scores, entry) never cross text, sprites or panels: those scenes draw their content
 *     on a transparent layer (at the canvas resolution) while every text run / sprite / plate / panel is recorded, then the bubbles are drawn
 *     under the layer and fade out near every recorded rectangle (`layered`).
 *   - The first touch on a device with a fine primary pointer flips the page to the touch layout; the tap is mapped through the
 *     canvas rectangle taken BEFORE the flip, so it hits the row the finger was on.
 *   - A scene that throws on 90 consecutive frames is abandoned for the title (soft-lock guard).
 *   - Touch controls hide again when a real key is pressed on a device without a coarse pointer.
 *   - Boot paints a LOADING frame first; window.__fizzpop exists at once and finishes the boot on first use.
 *
 * DEBUG   window.__fizzpop = the SPEC 3.5 contract (Game, GFX, AUDIO, LEVELS, C, U, scene, goto, input, freeze, step, start)
 *          plus non-contract extras under `_main` (layout, fit, paused, setPaused, holds, scores, resetScores, session, toast,
 *          touchMode, touchOnly, sceneTime, entry, padSlots, rows, confirmQuit, ambient, ambientReset, endingBand, howtoPage,
 *          persistent) and the v2 ones: k(), scaleLog(), quality(), setQuality(q, lock), autoQuality(), autoQualityFeed(costMs, dtMs),
 *          autoQualityReset(), reducedMotion(), setReducedMotion(b | null), options(), perf(), renderNow(), bigHeroes(), frameStats(), calibration(), invalidate(), howtoNav(); __fizzpop.quality
 *          (getter), __fizzpop.bootMs (getter, -1 until the first title paint), __fizzpop.loadingMs (the LOADING frame) and __fizzpop.bootProfile
 *          (ms per boot phase). layout() additionally carries k, snapped, backW, backH.
 *          Every hook finishes the boot on first use. goto('pause') pauses a running game; input.set() additionally accepts
 *          {up, down, pause}; goto('entry'|'ending') take {entries:[{pi,score,round}], res:{won,level,scores,players}}.
 *
 *  * The file ends with `Main.boot();` (SPEC build notes). Every DOM lookup is null-safe so the module also
 *    runs on minimal test pages that only contain <canvas id="screen">.
 */
const Main = (() => {
  // ===================================================================================================
  // Constants
  // ===================================================================================================
  const STEP_MS = 1000 / C.FPS;
  const MAX_CATCHUP = 5;
  const GUTTER = 16;                 // page side gutter in px (SPEC 2.5)
  const V_PAD = 8;                   // page top/bottom padding in px
  const LEGEND_GAP = 12;
  const K_MIN = 1, K_MAX = 8, K_STEP = 0.25;   // render scale k = backing px per logical px (SPEC_V2 sec. 1): quantised to 0.25 steps, clamp 1..8
  const SNAP_TOL = 0.065, BUCKET_TOL = 0.08;            // the picture is fitted to whole 0.25 steps of device pixels (1:1, crisp) when that costs <= 6.5 % of the free space
  const LEGEND_KEEP = 0.86;          // the desktop legend stays while it costs the picture at most 14 % of its scale
  const Q_DROP_MS = 12, Q_RAISE_MS = 6, Q_WINDOW_MS = 2000, Q_RAISE_AFTER_MS = 10000, Q_WAIT_MAX_MS = 80000;   // auto quality (SPEC_V2 sec. 1)
  // Integrator (v2.0): a resolution lever BELOW quality 0 and a fast path for severe overload. SPEC_V2 5 asks p95 <= 16 ms after the first 3 s at 6x CPU throttle on a
  // 390x844 DPR 3 phone; a software rasteriser pays per backing pixel (k 4 = 1024x896: ~30 ms at 6x even at quality 0, k 2: ~10 ms), so when quality 0 is not enough Main renders
  // at a smaller k (the css size is unchanged, the browser upscales smoothly), one GFX bake bucket step (<= 80 % of k, never below 1.5) per window, and raises it again
  // after the same calm period + anti-flap wait as the quality levels. Severe overload (a 0.4 s window of >= 5 frames whose MEDIAN cost is > 24 ms: one hitch is not overload)
  // steps down immediately instead of waiting for a 2 s window, and the lever jumps straight to the k whose predicted cost (~ k^2) is back under 12 ms, so the ladder settles in ~2-3 s.
  const Q_SEVERE_MS = 24, Q_FAST_WINDOW_MS = 400, Q_FAST_MIN_FRAMES = 5, K_CAP_MIN = 1.5, K_CAP_STEP = 0.8, Q_SKIP_FRAMES = 3;
  // v3 (FIXPLAN_V3 Main, U1 / U2 / U3 / U4): the ladder is driven by what the player SEES. The rAF callback's own cost (update + render + post FX) leaves out the canvas raster / commit
  // that the browser does after it (up to 90 % of a frame on a software rasteriser), so every frame that arrives late counts with its real interval: `eff = dt - 0.25 R` when dt > 1.45 R
  // (R = the calm frame period: the shortest recent interval, never below one fixed step and never above the display's refresh measured at boot).
  const LATE_RATIO = 1.45, LATE_SHARE = 0.25, R_WIN = 120, R_MAX_DEFAULT = 17.5, Q_LATE_FRAC = 0.1;
  const SCENE_SETTLE = 90;           // updates after a scene change that the ladder ignores: the first frames of a scene bake its sprites (a one-off hitch, not load)
  const STATIC_EVERY = 3;            // updates per render in static scenes (how-to, scores, the idle title): 20 fps (U3)
  const PAUSE_EVERY = 4;             // ... the paused game: 15 fps, and none at all while the click-to-resume overlay is up or the page is not live
  const TITLE_SETTLE = 90, ACTIVE_GRACE = 40;   // the title runs at full rate for 1.5 s after its intro and for 40 updates after any input
  // start-up calibration (U4): a micro-benchmark of full-frame additive blits on the real raster path (CPU raster or GPU) predicts the busy-frame cost of every ladder state
  const CAL_REF_W = 512, CAL_REF_H = 448, CAL_BUDGET_MS = 11.5, CAL_FINE_SLACK = 4, CAL_MAX_MS = 400, CAL_RATIO = [5, 9.5, 15];   // ratio of a busy frame to one full-frame blit, per quality 0 / 1 / 2 (measured 2.5..4.9 / 5.7..8.8 / 10..15 on the CPU-raster VM, k 2..8, 1x..6x throttle)
  const STALL_MS = 700;              // no rAF for this long (iframe hidden / throttled) = the page is not live
  const TOUCH_ROW_CSS = 44;          // minimum tappable menu row height in css px
  const PILL_H = 44, ROW_GAP = 10, CTRL_PAD = 8, BTN_GAP = 8, PAD_SPREAD = 16, BTN_MAX_W = 92, BTN_MAX_H = 220;   // (v3 V4: taller pads on tall phones: fewer empty pixels)
  const GAP_TOP_SHARE = 0.5;         // portrait: this share of the free height above the controls goes over the picture, the rest between picture and controls
  const LAND_MIN_VW = 560;           // landscape side pads need at least this much width
  const IDLE_FRAMES = 10 * C.FPS;    // title idle time before the attract cycle
  const STORY_FRAMES = 6 * C.FPS;    // story intro before play (the last, gold rules line is typed by frame ~214: >= 2 s to read it)
  const ATTRACT_STORY_FRAMES = 5 * C.FPS;
  const HOWTO_PAGE_FRAMES = 4 * C.FPS;
  const ATTRACT_SCORES_FRAMES = 6 * C.FPS;
  const AFTER_GAME_SCORES_FRAMES = 10 * C.FPS;
  const INPUT_GUARD = 20;            // frames after a scene starts in which confirm presses are ignored
  const PAD_DEAD = 0.45;             // analogue stick dead zone
  const REPEAT_DELAY = 18, REPEAT_PERIOD = 5;
  const ENTRY_SECONDS = 30, NAME_LEN = 3;
  const NAME_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const TOP_N = 8;
  const CONTINUE_MIN_ROUND = 6;
  const TOAST_FRAMES = 100;
  const FAIL_LIMIT = 90;
  const PAD_SOUND_HINT = 45;          // frames of "audio not running" before TAP FOR SOUND shows
  const FADE_IN_FRAMES = 16;          // a scene entered from the ending fades in from the abyss colour over this many updates

  // Abyss palette (concepts/c_abyss_glow/palette.json): cyan = Pop / 2UP / text, magenta = Fizz / 1UP, amber = HI SCORE / highlights,
  // ember = warnings, lime = OK, white-hot = the brightest few percent. Text greys are cool cyan tints (never neutral grey).
  const COL = {
    fizz: '#ff3ea5', pop: '#3cf2ff', gold: '#ffb23e', coral: '#ff6a3d', white: '#eaffff',
    hi: '#d4fbff', text: '#8eeaff', dim: '#6cc4dc', dimmer: '#5aa2c0', green: '#b6ff3b', violet: '#8a5cff', crimson: '#ff2a2a', void: '#04060d',
  };
  const PLAYER_COL = [COL.fizz, COL.pop];

  const GAME_ACTIONS = ['left', 'right', 'jump', 'fire'];
  const KEYS = [
    { left: ['ArrowLeft'], right: ['ArrowRight'], jump: ['ArrowUp', 'KeyX'], fire: ['Space', 'KeyZ'] },
    { left: ['KeyA'], right: ['KeyD'], jump: ['KeyW'], fire: ['KeyQ', 'ShiftLeft'] },
  ];
  const UI_KEYS = {
    up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
    ok: ['Enter', 'NumpadEnter', 'Space', 'KeyZ', 'KeyQ', 'ShiftLeft'],
    alt: ['KeyX'], bksp: ['Backspace'], pause: ['KeyP', 'Escape'], mute: ['KeyM'], help: ['KeyH'], table: ['KeyT'],
  };
  const UI_ACTIONS = Object.keys(UI_KEYS);
  const REPEATING = new Set(['up', 'down', 'left', 'right']);
  const HIT_ACTIONS = ['up', 'down', 'left', 'right', 'ok', 'alt', 'bksp', 'pause', 'help', 'table'];
  const HANDLED_KEYS = new Set([].concat(...Object.values(KEYS).map((k) => [].concat(...Object.values(k))),
    ...Object.values(UI_KEYS)));

  const DEFAULT_SCORES = Object.freeze([
    { name: 'FIZ', score: 32000, round: 12 }, { name: 'POP', score: 27500, round: 10 },
    { name: 'KRK', score: 21000, round: 8 }, { name: 'NIB', score: 15500, round: 7 },
    { name: 'CRB', score: 11000, round: 5 }, { name: 'JLP', score: 7500, round: 4 },
    { name: 'SPR', score: 4200, round: 3 }, { name: 'GLM', score: 2000, round: 2 },
  ]);

  // ===================================================================================================
  // State
  // ===================================================================================================
  // canvas = the visible #screen (backing store 256k x 224k); ctx = vctx = its context: every frame sets ctx.setTransform(k,0,0,k,0,0) and the scenes
  // keep drawing in LOGICAL units (256 x 224). (`ctx` is temporarily the layer context while a `layered` scene records its content.)
  let canvas = null, ctx = null, vctx = null, rootEl = null, legendEl = null, touchEl = null, focusEl = null, soundBtn = null;
  let K = 1;                                            // current render scale (output px per logical px), 0.25 steps, 1..8
  let kCap = Infinity, kNat = 1;                         // resolution lever (auto quality below level 0): the cap on K, and the k the layout would use without it
  let quality = 2, qualityLocked = false, maxQuality = 2;   // post FX / particle level 0..2 (auto quality moves it unless locked)
  let reducedMotion = false, reducedOverride = null, motionMq = null, dprMq = null;
  let renderCount = 0, bootMs = -1, loadingMs = -1, sceneReady = false;                // sceneReady: the first scene has been entered (before that a resize must not paint it)
  let booted = false, bootDone = false, frozen = false, paused = false, pauseSel = 0, confirmQuit = false, autoPaused = false;
  let scene = 'title', sceneT = 0, sceneArgs = null;
  let acc = 0, last = 0, lastRaf = 0, failStreak = 0;
  let dirty = true, sinceRender = 0, activeUntil = 0, pendingSpan = 0, lastRenderAt = 0, calib = null, refreshMs = 0;   // render gating (U2 / U3), boot measurements (U1 / U4)
  const frameStats = { rafs: 0, renders: 0, updates: 0, skippedDup: 0, skippedStatic: 0 };
  let touchMode = false, touchSeen = false, coarse = false, keyboardSeen = false, padSeen = false;
  let audioSynced = false, focusDismissed = false, deadAudioT = 0;
  let toastMsg = '', toastT = 0, toastColor = COL.gold, fadeIn = 0;
  let pointerEvt = null;
  let layout = { scale: 0, w: 0, h: 0, vw: 0, vh: 0, touch: false, land: false, mode: 'desk', sharp: false, m: 1, k: 1, dpr: 1 };
  const holds = new Set();                              // reasons the page is not live: blur, hidden, offscreen, stall
  const session = { reached: 0, lastPlayers: 1 };      // survives game-over, lives as long as the page
  const reported = new Set();

  const down = new Set();                               // physical keys currently held
  const tapped = new Set();                             // keys (and touch buttons) pressed since the last real tick
  const virt = [blankVirt(), blankVirt()];              // virtual (debug) input per player
  const prevPad = [{}, {}];                             // previous combined pad state, for edge detection
  const uiHeld = {};                                    // frames each UI action has been held
  UI_ACTIONS.forEach((a) => { uiHeld[a] = 0; });

  const touchPtr = new Map();                           // pointerId -> touch button key
  const touchHeld = { left: false, right: false, jump: false, fire: false };
  const touchTap = new Set();                           // direction/jump/fire taps since the last real tick
  const typed = [];                                     // letters / digits typed on a keyboard while the name entry is up (R6)

  function blankVirt() { return { left: false, right: false, jump: false, fire: false, up: false, down: false, pause: false }; }

  // ===================================================================================================
  // Small helpers
  // ===================================================================================================
  const fmtScore = (n, w = 6) => String(Math.max(0, Math.floor(n) || 0)).padStart(w, '0');
  const ORD = ['1ST', '2ND', '3RD', '4TH', '5TH', '6TH', '7TH', '8TH'];
  const ordinal = (i) => ORD[i] || (i + 1) + 'TH';
  const ease = (t) => t * t * (3 - 2 * t);
  const clamp01 = (v) => U.clamp(v, 0, 1);
  const blink = (t, period = 30) => Math.floor(t / period) % 2 === 0;
  // Exclusion recording (K1): while `rec` is an array, every text run, sprite, plate and panel a scene draws is noted as a rectangle
  // [x0, y0, x1, y1]; the ambient bubbles then keep out of all of them (see `layered`).
  let rec = null;
  const note = (x0, y0, x1, y1) => { if (rec) rec.push([x0, y0, x1, y1]); };
  const text = (s, x, y, color, opts) => {
    if (rec) {
      const sc = (opts && opts.scale) || 1, w = GFX.textWidth(s, sc), al = opts && opts.align;
      const x0 = al === 'center' ? x - w / 2 : al === 'right' ? x - w : x;
      note(x0, y, x0 + w, y + 8 * sc);
    }
    if (opts && opts.alpha !== undefined) {                          // (alpha is not a GFX.text option: Main applies it itself)
      const o = Object.assign({}, opts), ga = ctx.globalAlpha;
      delete o.alpha;
      ctx.globalAlpha = ga * opts.alpha;
      try { GFX.text(ctx, s, x, y, color, o); } finally { ctx.globalAlpha = ga; }
      return;
    }
    GFX.text(ctx, s, x, y, color, opts);
  };
  const ctext = (s, y, color, opts) => text(s, C.W / 2, y, color, Object.assign({ align: 'center' }, opts));
  const spr = (name, frame, x, y, opts) => {
    if (!GFX.has(name)) return;
    if (rec) { const sz = GFX.size(name); note(x, y, x + sz.w, y + sz.h); }
    GFX.draw(ctx, name, frame, x, y, opts);
  };
  const sprC = (name, frame, cx, y, opts) => { if (GFX.has(name)) spr(name, frame, cx - GFX.size(name).w / 2, y, opts); };
  /** A translucent near-black panel (recorded, so the ambient bubbles keep out of it) with a 1 px cyan hairline and four brighter corner ticks.
   *  o = { a: fill alpha (default 0.62), edge: hairline alpha (default 0.42; 0 = none), col: hairline colour [r,g,b] (default cyan), ticks: false }. */
  const CYAN = [60, 242, 255];
  function panel(x, y, w, h, o) {
    o = o || {};
    note(x, y, x + w, y + h);
    const a = o.a === undefined ? 0.62 : o.a, edge = o.edge === undefined ? 0.42 : o.edge, col = o.col || CYAN, hw = 1.2 / K;
    ctx.fillStyle = 'rgba(3,6,16,' + a.toFixed(3) + ')';
    ctx.fillRect(x, y, w, h);
    if (edge <= 0) return;
    ctx.save();
    ctx.lineWidth = hw;
    ctx.strokeStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + edge.toFixed(3) + ')';
    ctx.strokeRect(x + hw / 2, y + hw / 2, w - hw, h - hw);
    if (o.ticks !== false && w > 12 && h > 12) {                      // corner ticks: the hairline is brighter where it turns
      const L = Math.min(4, w / 3, h / 3);
      ctx.strokeStyle = 'rgba(' + Math.min(255, col[0] + 120) + ',' + Math.min(255, col[1] + 10) + ',255,' + Math.min(1, edge * 1.9).toFixed(3) + ')';
      ctx.lineWidth = hw * 1.4;
      ctx.beginPath();
      for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
        ctx.moveTo(cx + sx * L, cy + sy * hw * 0.7); ctx.lineTo(cx + sx * hw * 0.7, cy + sy * hw * 0.7); ctx.lineTo(cx + sx * hw * 0.7, cy + sy * L);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  /** A horizontal hairline that fades out at both ends (section rules under headings). */
  function rule(cx, y, halfW, col, a) {
    note(cx - halfW, y - 1, cx + halfW, y + 1);
    const g = ctx.createLinearGradient(cx - halfW, 0, cx + halfW, 0), c = col || CYAN, A = a === undefined ? 0.5 : a;
    g.addColorStop(0, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0)'); g.addColorStop(0.5, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + A.toFixed(3) + ')'); g.addColorStop(1, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - halfW, y, halfW * 2, 1.2 / K);
  }
  // Cast sprite id: most creatures animate as '<id>_move'; the Bonefin ghost is simply 'bonefin' (SPEC 3.1).
  // (e2e fix: the how-to cast page and the credits asked for a non-existent 'bonefin_move' and drew nothing.)
  const castSprite = (id) => (id === 'bonefin' ? id : id + '_move');
  const touchLabel = () => (touchMode ? 'TAP' : 'ENTER');
  /** A touch device with neither a key press nor a gamepad seen yet: P2 has no controls, so 2 PLAYERS / PUSH Q are hidden. */
  const touchOnly = () => touchMode && !keyboardSeen && !padSeen;
  const rgba = (r, g, b, a) => 'rgba(' + r + ',' + g + ',' + b + ',' + a.toFixed(3) + ')';

  // ---------------------------------------------------------------------------------------------------
  // Big heroes (title, ending): Fizz and Pop at 2-3x the game size. GFX bakes and caches them (GFX.drawHero, v3 V11: Main never reaches into the cast's art); on a GFX without
  // drawHero (the stub modules of some tests) the registry sprite is drawn at its normal size instead.
  // ---------------------------------------------------------------------------------------------------
  const bigHeroes = (() => {
    let calls = 0;
    /** who 'fizz' | 'pop'; (cx, by) = bottom centre of the 16 x 16 box in logical px; S = size factor; frame f of nf (loop phase). */
    function draw(who, pose, f, nf, cx, by, S, flip, alpha) {
      calls++;
      note(cx - 8 * S, by - 16 * S, cx + 8 * S, by);
      if (typeof GFX.drawHero === 'function') { GFX.drawHero(ctx, who, cx, by, S, 0, { pose, frame: f, frames: nf, flip: !!flip, alpha }); return; }
      const name = (who === 'pop' ? 'p2_' : 'p1_') + (pose === 'puff' ? 'shoot' : pose === 'blink' ? 'idle' : pose);
      if (GFX.has(name)) GFX.draw(ctx, name, pose === 'blink' || pose === 'puff' ? (pose === 'blink' ? 1 : 0) : f % Math.max(1, GFX.frames(name)), cx - 8, by - 16, { flip, alpha });
    }
    return { draw, clear() {}, px: () => 0, count: () => calls };
  })();

  /** The Moon Pearl at any size: pastel sphere, pearl-white highlight, thin-film bands, a luminous rim, soft halo and a few orbiting sparks. */
  function pearl(cx, cy, r, t, a) {
    a = a === undefined ? 1 : a;
    const pul = 0.92 + Math.sin(t / 22) * 0.08;
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.globalCompositeOperation = 'lighter';
    let g = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 3.4 * pul);
    g.addColorStop(0, 'rgba(150,170,255,0.3)'); g.addColorStop(0.4, 'rgba(90,110,255,0.1)'); g.addColorStop(1, 'rgba(60,80,255,0)');
    ctx.fillStyle = g; ctx.fillRect(cx - r * 3.6, cy - r * 3.6, r * 7.2, r * 7.2);
    g = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 1.9);
    g.addColorStop(0, 'rgba(60,242,255,0.24)'); g.addColorStop(1, 'rgba(60,242,255,0)');
    ctx.fillStyle = g; ctx.fillRect(cx - r * 2, cy - r * 2, r * 4, r * 4);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(4,6,14,0.9)';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    g = ctx.createRadialGradient(cx - r * 0.32, cy - r * 0.38, 0, cx - r * 0.1, cy - r * 0.1, r * 1.25);
    g.addColorStop(0, 'rgba(255,255,255,0.6)'); g.addColorStop(0.28, 'rgba(255,190,230,0.4)'); g.addColorStop(0.62, 'rgba(120,200,255,0.36)'); g.addColorStop(1, 'rgba(160,100,255,0.55)');
    ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    if (ctx.createConicGradient) {
      const cg = ctx.createConicGradient(t / 90, cx, cy);
      ['rgba(60,242,255,0.34)', 'rgba(138,92,255,0.34)', 'rgba(255,62,165,0.34)', 'rgba(255,178,62,0.3)', 'rgba(60,242,255,0.34)'].forEach((c, i) => cg.addColorStop(i / 4, c));
      ctx.lineWidth = r * 0.5; ctx.strokeStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, r * 0.74, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = Math.max(1.3 / K, r * 0.07);
    ctx.strokeStyle = 'rgba(210,250,255,0.95)';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = Math.max(1.6 / K, r * 0.09); ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.7, Math.PI * 1.1, Math.PI * 1.4); ctx.stroke();
    ctx.restore();
    if (typeof GFX.particle === 'function') {
      for (let i = 0; i < 3; i++) {
        const an = t / 28 + i * 2.1;
        GFX.particle(ctx, 'spark', cx + Math.cos(an) * r * 1.55, cy + Math.sin(an) * r * 1.35, Math.max(1.4, r * 0.17), i === 1 ? '#ffd98a' : '#ffffff', 0.9 * a * (0.7 + 0.3 * Math.sin(t / 7 + i)));
      }
    }
  }

  /** Log an error once per distinct message; the loop keeps running. */
  function reportError(where, e) {
    const msg = where + ': ' + (e && e.message ? e.message : String(e));
    if (reported.has(msg) || reported.size > 20) return;
    reported.add(msg);
    console.error('[Main] ' + msg + (e && e.stack ? '\n' + e.stack : ''));
  }

  // Backdrop of every non-play scene: the round-1 water of GFX (near-black gradient, god-rays, giant distant jellyfish), stretched over the full frame.
  const BG_TITLE = 0;
  function drawBg(i) {
    let cv = null;
    try { if (typeof GFX.bgCanvas === 'function') cv = GFX.bgCanvas(i === undefined ? BG_TITLE : i); } catch (e) { reportError('bgCanvas', e); }
    if (cv && cv.width > 8) ctx.drawImage(cv, 0, 0, cv.width, cv.height, 0, 0, C.W, C.H);
    else { ctx.fillStyle = COL.void; ctx.fillRect(0, 0, C.W, C.H); }
  }
  /** A soft dark wash from the edges toward `y0` (keeps text legible over the busiest part of the water). */
  function dim(a, y0 = 0, y1 = C.H) {
    ctx.fillStyle = 'rgba(3,5,14,' + a.toFixed(3) + ')';
    ctx.fillRect(0, y0, C.W, y1 - y0);
  }

  /** Round-1 tower walls + floor of the crystal tower (the "frame" of story / how-to / scores), cropped from the real level canvas. */
  function towerFrame() {
    let lc = null;
    try { if (typeof GFX.levelCanvas === 'function') lc = GFX.levelCanvas(0, LEVELS[0].map); } catch (e) { reportError('towerFrame', e); }
    if (!lc || lc.width < 8) return;
    const sx = lc.width / C.W, sy = lc.height / 208;
    ctx.drawImage(lc, 0, 0, 16 * sx, 208 * sy, 0, C.MAP_Y, 16, 208);
    ctx.drawImage(lc, 240 * sx, 0, 16 * sx, 208 * sy, 240, C.MAP_Y, 16, 208);
    ctx.drawImage(lc, 16 * sx, 200 * sy, 224 * sx, 8 * sy, 16, C.MAP_Y + 200, 224, 8);
  }

  // ---------------------------------------------------------------------------------------------------
  // Static back layers: the backdrop of a scene (water + shaft + ledges ...) never changes, so it is painted ONCE per render scale into a
  // canvas of the visible size and copied 1:1 every frame (a 1:1 copy is ~10x cheaper than the scaled blits of the baked world canvases).
  // At most two are kept (the current scene's and the previous one's).
  // ---------------------------------------------------------------------------------------------------
  const statics = new Map();
  function staticBack(key, paintFn) {
    const W = canvas.width, H = canvas.height;
    let e = statics.get(key);
    if (e) { statics.delete(key); statics.set(key, e); }
    if (!e || e.w !== W || e.h !== H || e.k !== K) {
      if (!e) {
        while (statics.size >= 2) { const k0 = statics.keys().next().value; const o = statics.get(k0); o.cv.width = 1; o.cv.height = 1; statics.delete(k0); }
        e = { cv: document.createElement('canvas'), w: 0, h: 0, k: 0 };
        statics.set(key, e);
      }
      e.cv.width = W; e.cv.height = H; e.w = W; e.h = H; e.k = K;
      const g = e.cv.getContext('2d'), main = ctx;
      g.setTransform(K, 0, 0, K, 0, 0); g.imageSmoothingEnabled = true;
      ctx = g;
      try { paintFn(); } catch (err) { reportError('staticBack ' + key, err); } finally { ctx = main; }
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(e.cv, 0, 0);
    ctx.restore();
  }
  function dropStatics() { for (const e of statics.values()) { e.cv.width = 1; e.cv.height = 1; } statics.clear(); }

  /** The glass-tube wordmark costs ~6 ms per frame in a software rasteriser, and only its bubbles move: it is drawn into a small layer that is
   *  refreshed every 3rd frame (20 Hz is plenty for rising bubbles) and copied 1:1 in between. Returns { total, uy } like GFX.drawLogo. */
  const logoLayer = { cv: null, k: 0, w: 0, at: -99, info: null };
  const LOGO_BOX = { x: 0, y: 0, w: 256, h: 86 };
  function drawLogoCached(cx, y, t, every, alpha) {
    const W = Math.ceil(LOGO_BOX.w * K), H = Math.ceil(LOGO_BOX.h * K), L = logoLayer;
    if (alpha !== undefined && alpha <= 0.001) return L.info || { total: 208, uy: y + 32 };       // not drawn (nor baked) yet
    const stale = !L.cv || L.k !== K || L.y !== y || L.cx !== cx || t < L.t || t - L.t >= (every || 3) / 60 - 1e-9;
    if (stale) {
      if (!L.cv) L.cv = document.createElement('canvas');
      if (L.cv.width !== W || L.cv.height !== H) { L.cv.width = W; L.cv.height = H; } else L.cv.getContext('2d').clearRect(0, 0, W, H);
      const g = L.cv.getContext('2d'), main = ctx;
      g.setTransform(K, 0, 0, K, -LOGO_BOX.x * K, -LOGO_BOX.y * K); g.imageSmoothingEnabled = true;
      ctx = g;
      try { L.info = GFX.drawLogo(g, cx, y, t); } catch (err) { reportError('drawLogo', err); } finally { ctx = main; }
      L.k = K; L.y = y; L.cx = cx; L.t = t;
    }
    if (L.cv) {
      ctx.save();
      if (alpha !== undefined && alpha < 1) ctx.globalAlpha *= alpha;
      ctx.drawImage(L.cv, 0, 0, L.cv.width, L.cv.height, LOGO_BOX.x, LOGO_BOX.y, L.cv.width / K, L.cv.height / K);
      ctx.restore();
    }
    return L.info || { total: 208, uy: y + 32 };
  }

  // ===================================================================================================
  // Ambient bubbles + plankton (title, story, how-to, scores, entry, ending)
  // ===================================================================================================
  const BUBBLE_SIZE = 16, BUBBLE_FADE = 10;
  /** Alpha of a 16 px bubble whose box starts at (x, y): `alpha` far from every rectangle of `avoid`, fading to 0 as its box nears one (and 0 whenever it touches one). */
  function bubbleAlpha(x, y, alpha, avoid) {
    let a = alpha;
    if (avoid) {
      for (let i = 0; i < avoid.length && a > 0; i++) {
        const q = avoid[i];
        const dx = Math.max(q[0] - (x + BUBBLE_SIZE), 0, x - q[2]), dy = Math.max(q[1] - (y + BUBBLE_SIZE), 0, y - q[3]);
        a = Math.min(a, alpha * clamp01((Math.sqrt(dx * dx + dy * dy) - 2) / BUBBLE_FADE));
      }
    }
    return a;
  }
  const ambient = (() => {
    const list = [], specks = [];
    let r = null;
    const KINDS = ['', '', '', '', 'nibbler', '', '', 'jellop', '', '', 'crabbit', '', '', 'springle'];
    function reset() {                                    // the seeded start state (also a test hook: runs become comparable frame by frame)
      r = U.rng(2024);
      list.length = 0; specks.length = 0;
      for (let i = 0; i < KINDS.length; i++) {
        list.push({ x: r.int(4, 236), y: r.int(0, C.H), vy: r.float(0.22, 0.55), ph: r.float(0, 6.28), kind: KINDS[i] });
      }
      for (let i = 0; i < 48; i++) specks.push({ x: r.float(0, C.W), y: r.float(0, C.H), vy: r.float(0.05, 0.2), vx: r.float(-0.04, 0.04), s: r.float(0.5, 1.1), a: r.float(0.1, 0.34), ph: r.float(0, 6.28), c: i % 5 === 0 ? '#ffb23e' : i % 3 === 0 ? '#ff3ea5' : '#3cf2ff' });
    }
    reset();
    const shown = [];                                     // x, y, alpha of every bubble the last draw() really drew (debug / tests)
    return {
      update() {
        for (const b of list) {
          b.y -= b.vy;
          if (b.y < -20) { b.y = C.H + 6; b.x = r.int(4, 236); }
        }
        for (const p of specks) {
          p.y -= p.vy; p.x += p.vx;
          if (p.y < -2) { p.y = C.H + 2; p.x = r.float(0, C.W); }
          if (p.x < -2) p.x = C.W + 2; else if (p.x > C.W + 2) p.x = -2;
        }
      },
      /** withEnemies=false: plain faint bubbles only (text-heavy scenes stay legible).
       *  avoid = [[x0,y0,x1,y1], ...]: a bubble fades out as its 16 px box nears one of these rectangles (menu column, every text run,
       *  panel and sprite of the scene) and is invisible whenever its box touches one: bubbles never cross text or panels (K1).
       *  Reduced motion halves the number of bubbles and specks (SPEC_V2 sec. 1). */
      draw(t, alpha = 0.7, withEnemies = true, avoid = null) {
        shown.length = 0;
        const nSpecks = quality < 1 ? 0 : (reducedMotion ? 12 : quality >= 2 ? 48 : 28);
        if (nSpecks && typeof GFX.particle === 'function') {
          for (let i = 0; i < nSpecks; i++) {
            const p = specks[i], tw = 0.7 + 0.3 * Math.sin(t / 40 + p.ph);
            GFX.particle(ctx, 'dot', p.x, p.y, p.s, p.c, p.a * tw * (alpha > 0.5 ? 1 : 0.7));
          }
        }
        const n = reducedMotion ? list.length >> 1 : list.length;
        for (let bi = 0; bi < n; bi++) {
          const b = list[bi];
          const x = b.x + Math.sin(t / 38 + b.ph) * 5, y = b.y;
          const a = bubbleAlpha(x, y, alpha, avoid);
          if (avoid && a < 0.03) continue;
          shown.push(x, y, a);
          if (withEnemies && b.kind && a > alpha * 0.9 && GFX.has(b.kind + '_trapped')) {
            GFX.draw(ctx, b.kind + '_trapped', Math.floor(t / 12), x, y);
            if (GFX.has('trap_overlay')) GFX.draw(ctx, 'trap_overlay', 0, x, y);
          } else if (GFX.has('bubble')) GFX.draw(ctx, 'bubble', Math.floor(t / 14), x, y, { alpha: a });
        }
      },
      shown: () => shown.slice(),
      reset,
    };
  })();

  /** Scenes with ambient bubbles draw their content on a transparent layer while every text run, sprite and panel is recorded;
   *  the bubbles are then drawn over the backdrop but UNDER that layer, avoiding every recorded rectangle (plus `extra`).
   *  The layer has the visible canvas' resolution (k x), so nothing is resampled. */
  let layerCv = null, layerCtx = null, lastAvoid = [];
  function layered(t, alpha, withEnemies, backFn, contentFn, extra) {
    const W = canvas.width, H = canvas.height;
    if (!layerCv) { layerCv = document.createElement('canvas'); layerCtx = layerCv.getContext('2d'); }
    if (layerCv.width !== W || layerCv.height !== H) { layerCv.width = W; layerCv.height = H; }
    const main = ctx, prevRec = rec;
    backFn();
    layerCtx.setTransform(1, 0, 0, 1, 0, 0);
    layerCtx.clearRect(0, 0, W, H);
    layerCtx.setTransform(K, 0, 0, K, 0, 0);
    layerCtx.globalAlpha = 1; layerCtx.globalCompositeOperation = 'source-over'; layerCtx.imageSmoothingEnabled = true;
    const mine = [];
    ctx = layerCtx; rec = mine;
    try { contentFn(); } finally { ctx = main; rec = prevRec; }        // a throwing scene never leaves the recorder or the layer switched on
    const avoid = extra ? mine.concat(extra) : mine;
    lastAvoid = avoid;
    ambient.draw(t, alpha, withEnemies, avoid);
    main.drawImage(layerCv, 0, 0, W, H, 0, 0, C.W, C.H);
  }

  // ===================================================================================================
  // Hi-scores
  // ===================================================================================================
  let scoresCache = null;

  function cleanName(s) {
    const n = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, NAME_LEN);
    return n.padEnd(NAME_LEN, 'A');
  }

  function sanitizeScores(raw) {
    if (!Array.isArray(raw)) return null;
    const out = [];
    for (const r of raw) {
      if (!r || typeof r !== 'object' || !Number.isFinite(+r.score)) continue;
      out.push({ name: cleanName(r.name), score: Math.max(0, Math.floor(+r.score)), round: U.clamp(Math.floor(+r.round) || 1, 1, 30) });
    }
    if (!out.length) return null;
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, TOP_N);
  }

  function loadScores() {
    if (scoresCache) return scoresCache;
    let t = null;
    try { t = sanitizeScores(U.store.get('scores', null)); } catch (e) { reportError('loadScores', e); }
    scoresCache = t || DEFAULT_SCORES.map((s) => ({ ...s }));
    return scoresCache;
  }

  function refreshScores() { scoresCache = null; return loadScores(); }
  function saveScores(list) { scoresCache = list; try { U.store.set('scores', list); } catch (e) { reportError('saveScores', e); } }
  /** True when localStorage really keeps data (a sandboxed Artifact iframe without allow-same-origin throws): U.store then lives in memory only. */
  function storagePersistent() {
    try {
      const k = '__fizzpop_probe';
      window.localStorage.setItem(k, '1');
      const ok = window.localStorage.getItem(k) === '1';
      window.localStorage.removeItem(k);
      return ok;
    } catch (e) { return false; }
  }
  const topScore = () => loadScores()[0].score;
  function qualifies(score) {
    const t = loadScores();
    return score > 0 && (t.length < TOP_N || score > t[t.length - 1].score);
  }
  /** Rank (0-based) a score would take; ties rank below existing entries. */
  function rankOf(score) {
    const t = loadScores();
    const i = t.findIndex((e) => score > e.score);
    return i < 0 ? t.length : i;
  }
  function insertScore(name, score, round) {
    const t = loadScores().map((e) => ({ ...e }));
    const idx = rankOf(score);
    t.splice(idx, 0, { name: cleanName(name), score, round });
    t.length = Math.min(t.length, TOP_N);
    saveScores(t);
    return idx < TOP_N ? idx : -1;
  }

  // ===================================================================================================
  // Input
  // ===================================================================================================
  const padSlot = new Map();                            // gamepad.index -> player slot 0 | 1, stable until the pad disconnects
  let prevJoin = false;

  /** A pad worth listening to: phantom HID "gamepads" (receivers, dongles) report no buttons / axes (U20). */
  const usablePad = (g) => !!(g && g.connected !== false && g.buttons && g.buttons.length >= 4 &&
    ((g.axes && g.axes.length >= 2) || g.mapping === 'standard'));

  function padState(g) {
    const ax = (g.axes && g.axes[0]) || 0, ay = (g.axes && g.axes[1]) || 0;
    const b = (n) => !!(g.buttons && g.buttons[n] && (g.buttons[n].pressed || g.buttons[n].value > 0.5));
    const st = {
      left: ax < -PAD_DEAD || b(14), right: ax > PAD_DEAD || b(15), up: ay < -PAD_DEAD || b(12), down: ay > PAD_DEAD || b(13),
      jump: b(0), fire: b(1) || b(2), start: b(9),
    };
    st.active = st.left || st.right || st.up || st.down || st.jump || st.fire || st.start || b(3);
    return st;
  }

  /** Poll the pads; returns [P1 state | null, P2 state | null]; never throws. A usable pad claims the lowest free
   *  player slot at its first button press / stick push and keeps it until it disconnects (U20, U21). */
  function readGamepads() {
    const out = [null, null];
    let list = [];
    try { list = Array.from((navigator.getGamepads && navigator.getGamepads()) || []); } catch (e) { list = []; }
    const present = new Set();
    for (const g of list) {
      if (!usablePad(g)) continue;
      present.add(g.index);
      const st = padState(g);
      let slot = padSlot.get(g.index);
      if (slot === undefined && st.active) {
        const used = new Set(padSlot.values());
        slot = !used.has(0) ? 0 : (!used.has(1) ? 1 : undefined);
        if (slot !== undefined) { padSlot.set(g.index, slot); padSeen = true; }
      }
      if (slot !== undefined) out[slot] = st;
    }
    for (const idx of Array.from(padSlot.keys())) if (!present.has(idx)) padSlot.delete(idx);
    return out;
  }

  function sampleInput(useReal) {
    const gp = useReal ? readGamepads() : [null, null];
    const held = (codes) => useReal && codes.some((c) => down.has(c) || tapped.has(c));
    const touch = (k) => useReal && (touchHeld[k] || touchTap.has(k));
    const gpAny = (k) => !!((gp[0] && gp[0][k]) || (gp[1] && gp[1][k]));
    const virtAny = (k) => !!(virt[0][k] || virt[1][k]);

    // --- the two game pads -------------------------------------------------------------------------
    const pads = [];
    for (let i = 0; i < 2; i++) {
      const cur = {};
      for (const a of GAME_ACTIONS) cur[a] = !!virt[i][a] || held(KEYS[i][a]) || !!(gp[i] && gp[i][a]) || (i === 0 && touch(a));
      pads.push({
        left: cur.left, right: cur.right, jump: cur.jump, fire: cur.fire,
        jumpPressed: cur.jump && !prevPad[i].jump, firePressed: cur.fire && !prevPad[i].fire,
      });
      prevPad[i] = cur;
    }
    // Asking P2 to join a running 1P game: the Q key or pad 1 A / B (rising edge) -- NOT Left Shift, which sits next to
    // P1's bubble key Z (U15). Virtual input for player 1's bubble counts as the Q key.
    const joinCur = !!virt[1].fire || held(['KeyQ']) || !!(gp[1] && (gp[1].fire || gp[1].jump));
    const joinHit = joinCur && !prevJoin;
    prevJoin = joinCur;

    // --- UI view (menus) ---------------------------------------------------------------------------
    const lvl = {
      up: held(UI_KEYS.up) || gpAny('up') || virtAny('up'),
      down: held(UI_KEYS.down) || gpAny('down') || virtAny('down'),
      left: held(UI_KEYS.left) || gpAny('left') || touch('left') || virtAny('left'),
      right: held(UI_KEYS.right) || gpAny('right') || touch('right') || virtAny('right'),
      ok: held(UI_KEYS.ok) || gpAny('fire') || gpAny('start') || touch('fire') || virtAny('fire'),
      alt: held(UI_KEYS.alt) || gpAny('jump') || touch('jump') || virtAny('jump'),
      bksp: held(UI_KEYS.bksp),
      pause: held(UI_KEYS.pause) || gpAny('start') || virtAny('pause'),
      mute: held(UI_KEYS.mute),
      help: held(UI_KEYS.help),
      table: held(UI_KEYS.table),
    };
    const p = {};
    for (const a of UI_ACTIONS) {
      uiHeld[a] = lvl[a] ? uiHeld[a] + 1 : 0;
      const n = uiHeld[a];
      p[a] = n === 1 || (REPEATING.has(a) && n > REPEAT_DELAY && (n - REPEAT_DELAY) % REPEAT_PERIOD === 0);
    }
    return {
      pads, p, h: lvl, joinHit,
      hit: HIT_ACTIONS.some((a) => p[a]),
      heldAny: UI_ACTIONS.some((a) => lvl[a]) || (useReal && tapped.size > 0),
    };
  }

  function onKeyDown(e) {
    unlockAudio();
    if (e.isTrusted) {
      healBlur();
      keyboardSeen = true;
      if (touchSeen && !coarse) { touchSeen = false; refreshTouchMode(); }
    }
    if (scene === 'entry' && !e.ctrlKey && !e.metaKey && !e.altKey && /^[a-z0-9]$/i.test(e.key || '')) {
      e.preventDefault();                                 // initials are typed: the letter is a letter, never a hotkey (M mutes, P pauses, ...)
      if (!e.repeat && typed.length < 4) typed.push(e.key.toUpperCase());
      if (focusEl && !focusEl.hidden) dismissFocus();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || !HANDLED_KEYS.has(e.code)) return;
    e.preventDefault();                                   // no page scroll, no button activation
    if (e.repeat) return;
    if (!down.has(e.code)) tapped.add(e.code);
    down.add(e.code);
    if (focusUp()) dismissFocus();                       // any game key also wakes the overlay
  }
  function onKeyUp(e) { down.delete(e.code); }

  function releaseAllInput() {
    down.clear();
    tapped.clear();
    for (const id of Array.from(touchPtr.keys())) touchRelease(id, null);
  }

  // ---- touch buttons (pointer events, true multi-touch) ---------------------------------------------
  const PAD_BUTTONS = new Set(['left', 'right', 'jump', 'fire']);
  const pillOver = new Map();                           // pointerId -> is the finger still on its PAUSE / SOUND button?

  function syncTouchUI() {
    for (const k of Object.keys(touchHeld)) touchHeld[k] = false;
    const pressed = new Set(touchPtr.values());
    for (const k of pressed) if (k in touchHeld) touchHeld[k] = true;
    if (touchEl) {
      for (const b of touchEl.querySelectorAll('[data-k]')) b.classList.toggle('on', pressed.has(b.dataset.k));
    }
  }

  function touchPress(id, k) {
    if (!k) return;
    touchPtr.set(id, k);
    if (PAD_BUTTONS.has(k)) touchTap.add(k); else pillOver.set(id, true);
    syncTouchUI();
  }
  /** Release a touch pointer. PAUSE / SOUND are rarely wanted and sit near the busiest button, so they act on release,
   *  and only when the finger is still on that button (Ut2). `e` = the pointerup event (null for cancel / forced). */
  function touchRelease(id, e) {
    const k = touchPtr.get(id);
    if (k === undefined) return;
    touchPtr.delete(id);
    if (!PAD_BUTTONS.has(k)) {
      let on = pillOver.get(id) !== false;
      if (e && e.type === 'pointerup' && (e.clientX || e.clientY)) {
        try { on = buttonKey(document.elementFromPoint(e.clientX, e.clientY)) === k; } catch (err) { /* keep on */ }
      }
      if (e && e.type === 'pointerup' && on) tapped.add(k === 'pause' ? 'KeyP' : 'KeyM');
    }
    pillOver.delete(id);
    syncTouchUI();
  }
  const buttonKey = (el) => { const b = el && el.closest ? el.closest('[data-k]') : null; return b ? b.dataset.k : null; };

  function bindTouchControls() {
    if (!touchEl) return;
    touchEl.addEventListener('pointerdown', (e) => {
      const k = buttonKey(e.target);
      if (!k) return;
      e.preventDefault();
      noteTouch(e);
      unlockAudio();
      try { e.target.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer ids, old browsers */ }   // a mouse has no implicit capture (U13)
      touchPress(e.pointerId, k);
    });
    touchEl.addEventListener('pointermove', (e) => {
      if (!touchPtr.has(e.pointerId)) return;
      const cur = touchPtr.get(e.pointerId);
      let k = null;
      try { k = buttonKey(document.elementFromPoint(e.clientX, e.clientY)); } catch (err) { k = null; }
      if (!PAD_BUTTONS.has(cur)) { pillOver.set(e.pointerId, k === cur); return; }
      if (!PAD_BUTTONS.has(k)) k = null;                   // sliding between pad buttons works; PAUSE/SOUND never trigger by sliding
      if (k) { if (k !== cur) { touchPtr.set(e.pointerId, k); touchTap.add(k); syncTouchUI(); } }
      else touchRelease(e.pointerId, null);
    });
    // Release anywhere, also when a mouse is let go off the pad (U13).
    for (const type of ['pointerup', 'pointercancel']) {
      window.addEventListener(type, (e) => { if (touchPtr.has(e.pointerId)) touchRelease(e.pointerId, e); }, true);
    }
    touchEl.addEventListener('lostpointercapture', (e) => touchRelease(e.pointerId, null));
    touchEl.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function noteTouch(e) {
    if (e && e.pointerType === 'touch' && !touchSeen) { touchSeen = true; refreshTouchMode(); }
  }
  /** The first touch on a device that reports a fine pointer (touch-screen laptop, hybrid) flips the page into the touch layout. The
   *  finger went down on the OLD layout, so the canvas rectangle is taken before that happens and the tap keeps its meaning (R1). */
  let tapRect = null, tapFlipped = false;
  function beforeGesture(e) {
    try { tapRect = canvas ? canvas.getBoundingClientRect() : null; } catch (err) { tapRect = null; }
    const was = touchMode;
    noteTouch(e);
    tapFlipped = touchMode !== was;
    unlockAudio();
    if (e && e.isTrusted) healBlur();                       // a real gesture is proof of life (R2)
  }

  function refreshTouchMode() {
    const want = coarse || touchSeen;
    if (want !== touchMode) { touchMode = want; }
    fit();
  }

  // ---- canvas taps / clicks -----------------------------------------------------------------------------
  function onCanvasPointer(e) {
    const r = tapRect || canvas.getBoundingClientRect();
    tapRect = null;
    noteTouch(e);
    unlockAudio();
    if (!r.width || !r.height) return;
    pointerEvt = { x: (e.clientX - r.left) * C.W / r.width, y: (e.clientY - r.top) * C.H / r.height, flipped: tapFlipped };
    tapFlipped = false;
  }

  // ===================================================================================================
  // Audio glue
  // ===================================================================================================
  /** Called from every gesture: while the context is not running (first visit, iOS "interrupted", a call, Siri) a gesture
   *  must retry the resume INSIDE the handler. AUDIO.init() is idempotent and leaves a deliberate pause() alone (U3, U10). */
  function unlockAudio() {
    try { if (!AUDIO.ready()) AUDIO.init(); } catch (e) { reportError('AUDIO.init', e); }
  }

  /** Music that belongs to the current scene (play manages its own). Requests made before the first
   *  gesture are dropped by the audio module, so we re-issue them once the context is ready. */
  function syncSceneMusic() {
    const s = scenes[scene];
    if (s && s.music && !(scene === 'play')) { try { AUDIO.music(s.music); } catch (e) { reportError('AUDIO.music', e); } }
  }

  function toggleMute() {
    let m = false;
    try { m = AUDIO.toggleMuted(); } catch (e) { reportError('toggleMuted', e); }
    toast(m ? 'SOUND OFF' : 'SOUND ON', m ? COL.coral : COL.green);
    syncSoundButton();
    return m;
  }
  function syncSoundButton() {
    if (!soundBtn) return;
    let m = false;
    try { m = AUDIO.isMuted(); } catch (e) { /* ignore */ }
    const v = m ? '1' : '0';
    if (soundBtn.dataset.muted !== v) { soundBtn.dataset.muted = v; soundBtn.setAttribute('aria-pressed', m ? 'true' : 'false'); }
  }
  function toast(msg, color) { toastMsg = msg; toastT = TOAST_FRAMES; toastColor = color || COL.gold; dirty = true; }

  /** Small crossed-out speaker (thin crimson strokes + halo), drawn at the top-right corner while muted. */
  function drawMuteIcon(x, y) {
    const w = 1.1 / K * 1.6;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const sp = new Path2D();
    sp.moveTo(x, y + 2.4); sp.lineTo(x + 2, y + 2.4); sp.lineTo(x + 4.4, y + 0.4); sp.lineTo(x + 4.4, y + 7.6); sp.lineTo(x + 2, y + 5.6); sp.lineTo(x, y + 5.6); sp.closePath();
    const cross = new Path2D();
    cross.moveTo(x + 6, y + 2.2); cross.lineTo(x + 9.2, y + 5.8); cross.moveTo(x + 9.2, y + 2.2); cross.lineTo(x + 6, y + 5.8);
    for (const [path, col, wd] of [[sp, '255,255,255', 1], [cross, '255,42,42', 1.2]]) {
      ctx.strokeStyle = 'rgba(' + col + ',0.16)'; ctx.lineWidth = w * 4; ctx.stroke(path);
      ctx.strokeStyle = 'rgba(' + col + ',0.9)'; ctx.lineWidth = w * wd; ctx.stroke(path);
    }
    ctx.restore();
  }

  /** Toast / hint: glowing text on a soft dark band (no opaque plate). */
  function bandText(msg, y, color) {
    const w = GFX.textWidth(msg);
    const g = ctx.createLinearGradient(C.W / 2 - w / 2 - 22, 0, C.W / 2 + w / 2 + 22, 0);
    g.addColorStop(0, 'rgba(3,6,16,0)'); g.addColorStop(0.18, 'rgba(3,6,16,0.72)'); g.addColorStop(0.82, 'rgba(3,6,16,0.72)'); g.addColorStop(1, 'rgba(3,6,16,0)');
    ctx.fillStyle = g;
    ctx.fillRect(Math.round(C.W / 2 - w / 2) - 22, y - 2, w + 44, 12);
    ctext(msg, y, color);
  }

  function drawOverlays() {
    let m = false;
    try { m = AUDIO.isMuted(); } catch (e) { /* ignore */ }
    if (m) drawMuteIcon(244, 4);
    const y = scene === 'play' ? 16 : 212;
    if (toastT > 0) bandText(toastMsg, y, toastColor);
    else if (deadAudioT > PAD_SOUND_HINT && blink(deadAudioT, 24)) bandText(touchMode ? 'TAP FOR SOUND' : 'PRESS A KEY FOR SOUND', y, COL.gold);
  }

  // ===================================================================================================
  // Pause (overlay of the play scene) and the "page is live" bookkeeping
  // ===================================================================================================
  /** Manual pause: sfx 'pause' + a soft AUDIO.pause (music off, context keeps running so the menu sounds stay audible, U9).
   *  Auto pause (the page is not live): a hard AUDIO.pause that suspends the context. */
  function setPaused(on, auto) {
    if (scene !== 'play' || paused === on) return;
    paused = on;
    dirty = true;
    pauseSel = 0;
    confirmQuit = false;
    const wasAuto = autoPaused;
    autoPaused = on && !!auto;
    try {
      if (on) {
        if (auto) AUDIO.pause();
        else { AUDIO.sfx('pause'); AUDIO.pause({ suspend: false }); }
      } else {
        AUDIO.resume();
        if (wasAuto) setTimeout(() => { try { AUDIO.sfx('menu_select'); } catch (e) { /* ignore */ } }, 70);   // the context may still be waking up
        else AUDIO.sfx('menu_select');
      }
    } catch (e) { reportError('pause audio', e); }
  }

  /** The page stopped being "live" (window blur, hidden tab, iframe hidden / scrolled away, no animation frames). The first
   *  reason pauses the game and suspends the audio; the last one to go away resumes the audio (not the game). */
  function hold(reason) {
    if (reason === 'blur' && !holds.has('blur')) blurAt = performance.now();
    holds.add(reason);
    dirty = true;
    releaseAllInput();
    setPaused(true, true);
    try { AUDIO.pause(); } catch (e) { /* ignore */ }
  }
  function release(reason) {
    if (!holds.delete(reason)) return;
    dirty = true;                                          // (the picture may have been left unrendered while the page was not live)
    if (holds.size) return;
    try {
      if (scene === 'play' && paused) AUDIO.pause({ suspend: false });   // still on the pause menu: keep its sounds audible
      else AUDIO.resume();
    } catch (e) { reportError('audio restore', e); }
  }
  const isHeld = () => holds.size > 0;
  function documentFocused() { try { return document.hasFocus(); } catch (e) { return true; } }
  /** A window 'blur' that no 'focus' ever follows (focus bouncing through a host frame, an extension popup) must not hold the game
   *  and the audio for ever: proof of life (the document has focus, or a real key / pointer event arrived) releases it (R2). */
  const BLUR_HEAL_MS = 1500;                              // a blur must be this old before the poll (not a real key / click) lets it go
  let blurAt = 0;
  function healBlur(minAge = 0) {
    if (focusEl && !focusEl.hidden) return;               // the click-to-play overlay is up: its click / key handler resumes the round (U17)
    if (holds.has('blur') && documentFocused() && performance.now() - blurAt >= minAge) {
      focusDismissed = false;
      release('blur');
      updateFocusOverlay();
    }
  }

  function onBlur() {
    hold('blur');
    if (focusEl && !document.hasFocus()) { focusDismissed = false; updateFocusOverlay(); }
  }
  function onFocus() {
    focusDismissed = false;
    updateFocusOverlay();
    release('blur');
  }

  // ---- focus overlay ("Click to play" / "Tap to play") --------------------------------------------------------
  function updateFocusOverlay() {
    if (!focusEl) return;
    let has = true;
    try { has = document.hasFocus(); } catch (e) { has = true; }
    const show = !(has || focusDismissed);
    if (show) {                                           // wording follows the device and the situation
      const mid = scene === 'play' && paused;            // a round that was paused by the blur: say so (P2)
      const cta = focusEl.querySelector('.cta'), sub = focusEl.querySelector('small');
      const c = mid ? (autoPaused ? (touchMode ? 'TAP TO RESUME' : 'CLICK TO RESUME') : (touchMode ? 'TAP TO FOCUS' : 'CLICK TO FOCUS'))
        : (touchMode ? 'TAP TO PLAY' : 'CLICK TO PLAY');
      const u = mid ? 'Game paused' : (touchMode ? 'Sound starts on your first tap' : 'Click here to focus the game and switch the sound on');
      if (cta && cta.textContent !== c) cta.textContent = c;
      if (sub && sub.textContent !== u) sub.textContent = u;
    }
    if (!focusEl.hidden === show) return;
    focusEl.hidden = !show;
    dirty = true;                                          // the scenes draw differently while the overlay is up (title rows, the paused panel)
  }
  /** An attract run (the title idling into story -> how-to -> scores) is on: nobody asked for it, so nothing waits behind a click-to-play overlay (U9). */
  const attractRun = () => (scene === 'story' || scene === 'howto' || scene === 'scores') && !!(sceneArgs && sceneArgs.attract);
  function dismissFocus() {
    const wasUp = focusUp();
    focusDismissed = true;
    try { window.focus(); } catch (e) { /* ignore */ }
    unlockAudio();
    release('blur');                                       // a click / key press is proof of life even if no focus event comes
    updateFocusOverlay();
    if (autoPaused && !isHeld() && scene === 'play' && paused) setPaused(false);   // only the blur paused it: carry on (U17)
    if (wasUp && sceneReady && attractRun()) { gotoScene('title'); tapped.clear(); down.clear(); touchTap.clear(); }   // the first click / key lands on the title menu, not on a how-to page, and is spent on that (U9)
    dirty = true;
  }

  // ===================================================================================================
  // Scenes
  // ===================================================================================================
  const scenes = {};

  function gotoScene(name, args) {
    const next = scenes[name];
    if (!next) throw new Error('Main.goto: unknown scene ' + name);
    const prev = scenes[scene];
    if (prev && prev.leave) prev.leave(name);
    fadeIn = scene === 'ending' ? FADE_IN_FRAMES : 0;      // the ending's last picture dissolves into the next scene instead of cutting (U5)
    scene = name;
    sceneT = 0;
    sceneArgs = args || null;
    dirty = true; activeUntil = 0; sinceRender = 0;
    next.enter(sceneArgs);
  }

  function startGame(players, level) {
    gotoScene('story', { next: { players, level, seed: (Date.now() & 0xffff) || 1 } });
  }
  const continueRound = () => Math.floor((Math.max(1, session.reached) - 1) / 5) * 5 + 1;

  /** Called when Game.isOver(): decide where the result goes. */
  function finishGame() {
    const res = Game.result();
    session.reached = Math.max(session.reached, res.level || 1);
    session.lastPlayers = res.players === 2 ? 2 : 1;
    const entries = [];
    for (let i = 0; i < (res.players === 2 ? 2 : 1); i++) {
      const s = (res.scores && res.scores[i]) || 0;
      if (s > 0) entries.push({ pi: i, score: s, round: res.level || 1 });
    }
    if (res.won) gotoScene('ending', { res, entries });
    else if (entries.length) gotoScene('entry', { entries });
    else gotoScene('scores', { afterGame: true });
  }

  /** Hit-test helper for tappable menu rows: row i spans [top + i*pitch, top + (i+1)*pitch). Returns the row index or -1. */
  function rowAt(x, y, top, pitch, n, x0 = 32, x1 = 224) {
    if (x < x0 || x > x1) return -1;
    const i = Math.floor((y - top) / pitch);
    return i >= 0 && i < n ? i : -1;
  }

  const rgbOf = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  /** Game-pixel pitch of a tappable row: >= TOUCH_ROW_CSS css px, but never more than `room` / n allows. */
  function touchPitch(n, room, cap = 40) {
    const k = layout.scale || 1;
    return Math.max(14, Math.min(Math.ceil(TOUCH_ROW_CSS / k), cap, Math.floor(room / n)));
  }

  // ---- shared UI pieces of the Abyss look (logical units) ------------------------------------------------------------
  /** A soft coloured light pool (additive radial gradient); sy < 1 flattens it. */
  function glowAt(x, y, r, hex, a, sy) {
    const c = rgbOf(hex);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (sy) { ctx.translate(x, y); ctx.scale(1, sy); x = 0; y = 0; }
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a.toFixed(3) + ')'); g.addColorStop(1, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }

  /** Thin neon line: a soft wide halo, a coloured core and a hot centre, all additive. col = [r,g,b]. */
  function glowStroke(path, col, w, a) {
    a = a === undefined ? 1 : a;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + (0.13 * a).toFixed(3) + ')'; ctx.lineWidth = w * 5; ctx.stroke(path);
    ctx.strokeStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + (0.34 * a).toFixed(3) + ')'; ctx.lineWidth = w * 2.4; ctx.stroke(path);
    ctx.strokeStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + (0.95 * a).toFixed(3) + ')'; ctx.lineWidth = w; ctx.stroke(path);
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.55 * a).toFixed(3) + ')'; ctx.lineWidth = w * 0.42; ctx.stroke(path);
    ctx.restore();
  }
  /** Rounded-rectangle path (Path2D). */
  function rrectPath(x, y, w, h, r) {
    const p = new Path2D();
    r = Math.min(r, w / 2, h / 2);
    p.moveTo(x + r, y); p.lineTo(x + w - r, y); p.arcTo(x + w, y, x + w, y + r, r); p.lineTo(x + w, y + h - r); p.arcTo(x + w, y + h, x + w - r, y + h, r);
    p.lineTo(x + r, y + h); p.arcTo(x, y + h, x, y + h - r, r); p.lineTo(x, y + r); p.arcTo(x, y, x + r, y, r); p.closePath();
    return p;
  }
  /** Touch row / button plate: a dark translucent pill with a 1 px cyan hairline; lit (amber hairline + glow) when selected. */
  function plate(x, y, w, h, on) {
    note(x, y, x + w, y + h);
    const p = rrectPath(x, y, w, h, Math.min(5, h / 2));
    ctx.fillStyle = on ? 'rgba(60,242,255,0.15)' : 'rgba(4,10,24,0.62)';
    ctx.fill(p);
    ctx.save();
    ctx.lineWidth = 1.3 / K;
    ctx.strokeStyle = on ? 'rgba(212,251,255,0.95)' : 'rgba(60,242,255,0.38)';
    ctx.stroke(p);
    if (on) { ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 4 / K; ctx.strokeStyle = 'rgba(60,242,255,0.18)'; ctx.stroke(p); }
    ctx.restore();
  }
  /** A menu row (keyboard layout): thin wide-tracked label, the selected one lit (white-hot cyan) on a soft light band between two chevrons. */
  function menuRow(label, cx, y, on, t) {
    const w = GFX.textWidth(label);
    if (on) {
      const x0 = cx - w / 2 - 26, bw = w + 52;
      const g = ctx.createLinearGradient(x0, 0, x0 + bw, 0);
      g.addColorStop(0, 'rgba(60,242,255,0)'); g.addColorStop(0.5, 'rgba(60,242,255,0.14)'); g.addColorStop(1, 'rgba(60,242,255,0)');
      ctx.fillStyle = g; ctx.fillRect(x0, y - 2, bw, 12);
      note(x0, y - 2, x0 + bw, y + 10);
      const k = 0.5 + 0.5 * Math.sin(t / 18);
      for (const sx of [-1, 1]) {
        const xx = cx + sx * (w / 2 + 8 + 1.2 * k), p = new Path2D();
        p.moveTo(xx - sx * 2.2, y + 1.2); p.lineTo(xx, y + 4); p.lineTo(xx - sx * 2.2, y + 6.8);
        glowStroke(p, CYAN, 0.8);
      }
      ctext(label, y, COL.hi);
    } else ctext(label, y, COL.text, { alpha: 0.9 });
  }
  /** Section heading: big thin glow text with a hairline rule under it. */
  function heading(s, y, col, sub, subY) {
    ctext(s, y, col || COL.hi, { scale: 2 });
    rule(128, y + 15, 70, CYAN, 0.55);
    if (sub) ctext(sub, subY === undefined ? y + 20 : subY, COL.dim);
  }

  // ---- TITLE ----------------------------------------------------------------------------------------------
  scenes.title = (() => {
    const MENU_X0 = 40, MENU_X1 = 216, TOUCH_ROWS_BOTTOM = 192;
    let sel = 0, idle = 0, items = [], stage = 0, warm = false;     // stage / warm: the progressive first paint (see render)
    let geo = { top: 84, pitch: 14, y0: 86, big: false };
    const LOGO_Y = 17, SHAFT = { x: 128, y: 80 };
    const LEDGE_L = 7, LEDGE_Y = 184;                         // each crystal ledge: 7 tiles wide, its top face at y = 184

    function build() {
      const keep = items[sel] ? items[sel].id : null;
      items = [{ id: 'p1', label: '1 PLAYER' }];
      if (!touchOnly()) items.push({ id: 'p2', label: '2 PLAYERS' });
      if (session.reached >= CONTINUE_MIN_ROUND) items.push({ id: 'cont', label: 'CONTINUE ROUND ' + continueRound() });
      items.push({ id: 'help', label: 'HOW TO PLAY' }, { id: 'table', label: 'HI-SCORES' });
      if (!touchMode) items.push({ id: 'sound', label: 'SOUND ' + (AUDIO.isMuted() ? 'OFF' : 'ON') });   // (touch has its own SOUND button)
      const k = items.findIndex((it) => it.id === keep);
      sel = k >= 0 ? k : U.clamp(sel, 0, items.length - 1);
      const n = items.length;
      if (touchMode) {                                       // big tappable rows drawn as plates, one footer line (U11, U14)
        // Every row is >= 44 css px tall (TOUCH_ROW_CSS). When the plain list does not fit between the wordmark and the footer (CONTINUE ROUND, a keyboard seen on a touch
        // device) the secondary rows share a line: HOW TO PLAY | HI-SCORES, then 1 PLAYER | 2 PLAYERS, instead of shrinking every row below the touch minimum.
        const y0 = 86, room = TOUCH_ROWS_BOTTOM - y0, need = Math.min(40, Math.ceil(TOUCH_ROW_CSS / (layout.scale || 1)));
        const pairs = [];
        if (n * need > room) pairs.push(['help', 'table']);
        if ((n - pairs.length) * need > room && items.some((it) => it.id === 'p2')) pairs.push(['p1', 'p2']);
        let row = 0;
        const rowOf = {}, half = {};
        for (let i = 0; i < n; i++) {
          const id = items[i].id, pr = pairs.find((q) => q[0] === id || q[1] === id);
          if (pr && id === pr[1] && items.some((it) => it.id === pr[0])) { rowOf[id] = rowOf[pr[0]]; half[id] = 1; continue; }
          rowOf[id] = row++;
          if (pr && id === pr[0] && items.some((it) => it.id === pr[1])) half[id] = 0;
        }
        const pitch = Math.max(14, Math.min(need, 40, Math.floor(room / row)));
        for (const it of items) {
          const h = half[it.id], top = y0 + rowOf[it.id] * pitch;
          it.cell = h === undefined ? { top, x0: MENU_X0, x1: MENU_X1, px: 52, pw: 152 } : h === 0 ? { top, x0: 24, x1: 128, px: 28, pw: 98 } : { top, x0: 128, x1: 232, px: 130, pw: 98 };
        }
        geo = { top: y0, pitch, y0, big: true, rows: row };
      } else {
        const pitch = n <= 5 ? 14 : 12;
        geo = { top: 84, pitch, y0: 86, big: false, rows: n };
        items.forEach((it, i) => { it.cell = { top: 84 + i * pitch, x0: MENU_X0, x1: MENU_X1 }; });
      }
    }
    function move(d) {
      sel = (sel + d + items.length) % items.length;
      AUDIO.sfx('menu_move');
    }
    function activate(i) {
      const it = items[i];
      if (!it) return;
      sel = i;
      AUDIO.sfx('menu_select');
      if (it.id === 'p1') startGame(1, 1);
      else if (it.id === 'p2') startGame(2, 1);
      else if (it.id === 'cont') startGame(session.lastPlayers, continueRound());
      else if (it.id === 'help') gotoScene('howto', { page: 0 });
      else if (it.id === 'table') gotoScene('scores', {});
      else if (it.id === 'sound') toggleMute();
    }

    // The Sunken Tower seen from above: octagonal rings spiralling down to the Moon Pearl and god-rays from it (very faint, behind the menu).
    // Painted once per render scale into the title's static back layer.
    function paintShaft() {
      const g = ctx, vx = SHAFT.x, vy = SHAFT.y, N = 20, TAU = Math.PI * 2;
      g.save();
      g.lineJoin = 'round';
      let prev = null;
      for (let i = 1; i <= N; i++) {
        const u = i / N, sc = Math.pow(u, 2.3);
        const rx = 1.8 + (261 - 1.8) * sc, ry = 1.8 + (213 - 1.8) * sc, rot = i * 0.05;
        const pts = [];
        for (let q = 0; q < 8; q++) { const an = rot + q * TAU / 8 + TAU / 16; pts.push([vx + Math.cos(an) * rx, vy + Math.sin(an) * ry]); }
        const a = (0.035 + 0.13 * Math.sin(Math.PI * Math.pow(u, 0.72))) * 0.85;
        const m = 0.4 + 0.3 * Math.sin(i);
        g.strokeStyle = 'rgba(' + Math.round(61 - m) + ',' + Math.round(123 + 119 * m) + ',255,' + a.toFixed(3) + ')';
        g.lineWidth = (1 + sc * 1.6) / 4 * 1.5;
        g.beginPath(); pts.forEach((p, q) => (q ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.stroke();
        if (prev) {
          g.strokeStyle = 'rgba(70,170,255,' + (a * 0.32).toFixed(3) + ')'; g.lineWidth = 0.3;
          g.beginPath(); for (let q = 0; q < 8; q++) { g.moveTo(prev[q][0], prev[q][1]); g.lineTo(pts[q][0], pts[q][1]); } g.stroke();
        }
        if (i > 3) for (let q = 0; q < 8; q++) {
          const c = (i + q) % 3 === 0 ? '255,178,62' : (i + q) % 3 === 1 ? '60,242,255' : '255,62,165';
          g.fillStyle = 'rgba(' + c + ',' + (a * 1.1).toFixed(3) + ')';
          g.beginPath(); g.arc(pts[q][0], pts[q][1], (0.8 + sc * 2) / 4, 0, TAU); g.fill();
        }
        prev = pts;
      }
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 14; i++) {
        const an = i * TAU / 14 + 0.2, L = (260 + (i % 3) * 90) / 4 * 1.3;
        const gr = g.createLinearGradient(vx, vy, vx + Math.cos(an) * L, vy + Math.sin(an) * L);
        gr.addColorStop(0, 'rgba(60,242,255,0.15)'); gr.addColorStop(1, 'rgba(60,242,255,0)');
        g.strokeStyle = gr; g.lineWidth = (2 + (i % 2) * 3) / 4; g.beginPath(); g.moveTo(vx, vy); g.lineTo(vx + Math.cos(an) * L, vy + Math.sin(an) * L); g.stroke();
      }
      g.restore();
    }

    // crystal ledges the twins stand on (the same crystal renderer as the rounds; azure Crystal Caves look)
    let ledgeMap = null;
    function ledges() {
      if (!ledgeMap) {
        const row = '#'.repeat(LEDGE_L) + '.'.repeat(32 - 2 * LEDGE_L) + '#'.repeat(LEDGE_L);
        ledgeMap = [];
        for (let r = 0; r < 26; r++) ledgeMap.push(r >= 21 ? row : '.'.repeat(32));
      }
      let lc = null;
      try { if (typeof GFX.levelCanvas === 'function') lc = GFX.levelCanvas(15, ledgeMap); } catch (e) { reportError('ledges', e); }
      if (lc && lc.width > 8) ctx.drawImage(lc, 0, 0, lc.width, lc.height, 0, C.MAP_Y, C.W, 208);
    }

    /** Fizz (left, facing right) and Pop (right, facing left): idle breathing, blinks, and every 6 s Fizz blows a bubble toward the middle. */
    function twins(t, S, a) {
      const cxF = LEDGE_L * 4 + 4, cxP = C.W - LEDGE_L * 4 - 4, by = LEDGE_Y + 1;
      if (a <= 0.001) { note(cxF - 8 * S, by - 16 * S, cxF + 8 * S, by); note(cxP - 8 * S, by - 16 * S, cxP + 8 * S, by); return; }       // (not baked yet: the boot reveals the title in stages)
      const cyc = t % 360;
      const breath = (off) => Math.floor(((t + off) % 160) / 20);
      const blinkF = (t + 40) % 210 < 7, blinkP = (t + 130) % 250 < 7;
      glowAt(cxF, by - 6, 38, '#ff3ea5', 0.16 * a); glowAt(cxP, by - 6, 38, '#3cf2ff', 0.14 * a);
      let pose = blinkF ? 'blink' : 'idle', f = breath(0);
      if (cyc >= 300 && cyc < 314) { pose = 'puff'; f = 0; } else if (cyc >= 314 && cyc < 326) { pose = 'shoot'; f = 0; }
      bigHeroes.draw('fizz', pose, f, 8, cxF, by, S, false, a);
      bigHeroes.draw('pop', blinkP ? 'blink' : 'idle', breath(60), 8, cxP, by, S, true, a);
      glowAt(cxF, by + 1, 26, '#ff3ea5', 0.5 * a, 0.2); glowAt(cxP, by + 1, 26, '#3cf2ff', 0.5 * a, 0.2);   // contact glow where the feet meet the crystal
      // the shot bubble: leaves Fizz's mouth at cyc 314, decelerates, drifts up and fades
      const u = cyc >= 314 ? cyc - 314 : cyc + 46;
      if (u < 230 && GFX.has('bubble')) {
        const run = 20 * (1 - Math.pow(1 - Math.min(u, 40) / 40, 2)), bx = cxF + 6.6 * S * 0.9 + 4 + run, byy = by - 8.8 * S + 1 - Math.max(0, u - 40) * 0.42;
        const ba = (u > 200 ? (230 - u) / 30 : 1) * a, sc = 1.15;
        note(bx - 9, byy - 9, bx + 9, byy + 9);
        ctx.save(); ctx.translate(bx, byy); ctx.scale(sc, sc);
        GFX.draw(ctx, u < 12 ? 'bubble_shot' : 'bubble', u < 12 ? Math.floor(u / 4) : Math.floor(t / 14), -8, -8, { alpha: ba });
        ctx.restore();
      }
    }
    return {
      music: 'title',
      settled: () => warm && sceneT > TITLE_SETTLE,                // the intro (progressive first paint) is over: the idle title may run at 20 fps
      enter() { idle = 0; sel = 0; items = []; padSlot.clear(); build(); refreshScores(); AUDIO.music('title'); },   // new session: pads claim P1 / P2 afresh
      update(ui) {
        ambient.update();
        build();
        idle = (ui.heldAny || focusUp()) ? 0 : idle + 1;               // (the attract run never starts behind the click-to-play overlay: U9)
        if (idle >= IDLE_FRAMES) { gotoScene('story', { attract: true }); return; }
        if (ui.p.up || ui.p.left) move(-1);
        else if (ui.p.down || ui.p.right) move(1);
        else if (ui.p.help) gotoScene('howto', { page: 0 });
        else if (ui.p.table) gotoScene('scores', {});
        else if (ui.p.ok || ui.p.alt) activate(sel);
      },
      pointer(x, y) {
        const i = items.findIndex((it) => it.cell && x >= it.cell.x0 && x <= it.cell.x1 && y >= it.cell.top && y < it.cell.top + geo.pitch);
        if (i >= 0) activate(i);
      },
      rows: () => items.map((it, i) => ({ id: it.id, label: it.label, top: it.cell.top, h: geo.pitch, x0: it.cell.x0, x1: it.cell.x1, sel: i === sel })),
      render() {
        const t = sceneT, n = items.length, S = touchMode ? 2.0 : 3.0;                   // (multiples of 0.5 only: GFX.drawHero bakes at 0.5 steps and would resample any other size, +2 ms per twin on a software rasteriser)
        const menuBottom = geo.top + (geo.rows || n) * geo.pitch + 4;
        const over = focusUp();                                      // the click-to-play overlay is up: it is the one call to action, the menu waits behind it (U8)
        // Progressive first paint (SPEC_V2 sec. 5: boot to an interactive title <= 1.5 s at 4x CPU): the very first frames after the boot draw the
        // water + menu first, then the wordmark, the twins and the ambient life fade in over the next frames, so no single frame has to bake them all.
        if (!warm) { stage++; if (stage >= 24) warm = true; }
        const ramp = (from) => (warm ? 1 : reducedMotion ? (stage >= from ? 1 : 0) : clamp01((stage - from + 1) / 10));
        const aLogo = ramp(2), aTwins = ramp(3), aLife = ramp(5);
        layered(t, 0.5 * aLife, aLife >= 1, () => {
          staticBack('title', () => {
            drawBg(BG_TITLE);                                       // near-black water (V3): no second additive pass, the distant jellyfish stay faint like the mockup
            dim(0.2);
            paintShaft();
            ledges();
          });
          if (aTwins > 0) pearl(SHAFT.x, SHAFT.y, 3.6, t, 0.95 * aTwins);
          twins(t, S, aTwins);
        }, () => {
          const lg = drawLogoCached(128, LOGO_Y, t / 60, 3, aLogo);
          note(128 - lg.total / 2, LOGO_Y - 4, 128 + lg.total / 2, lg.uy + 2);
          // the tagline between two fading hairlines
          const tag = 'THE SUNKEN TOWER', ty = Math.round(lg.uy + 6), tw = GFX.textWidth(tag);
          ctext(tag, ty, COL.hi);
          for (const sx of [-1, 1]) {
            const x0 = 128 + sx * (tw / 2 + 5), x1 = 128 + sx * (tw / 2 + 45);
            const g = ctx.createLinearGradient(x0, 0, x1, 0);
            g.addColorStop(0, 'rgba(60,242,255,0.6)'); g.addColorStop(1, 'rgba(60,242,255,0)');
            ctx.fillStyle = g; ctx.fillRect(Math.min(x0, x1), ty + 4, 40, 1.2 / K);
          }
          if (over) return;
          items.forEach((it, i) => {
            const on = i === sel, c = it.cell;
            if (geo.big) {
              plate(c.px, c.top + 2, c.pw, geo.pitch - 4, on);
              text(it.label, c.px + c.pw / 2, c.top + Math.floor((geo.pitch - 8) / 2), on ? COL.hi : COL.text, { align: 'center' });
              return;
            }
            menuRow(it.label, 128, geo.y0 + i * geo.pitch, on, t);
          });
          // The one small footer line (V3: the controls live in HOW TO PLAY): HI SCORE, amber label + near-white value. Phones draw it at text scale 1 (U14: caps >= 7 css px).
          const fs = touchMode ? 1 : 0.75, fy = touchMode ? 197 : 201;
          const hw = GFX.textWidth('HI SCORE ', fs) + GFX.textWidth('050000', fs);
          text('HI SCORE', 128 - hw / 2, fy, COL.gold, { scale: fs });
          text(fmtScore(topScore()), 128 - hw / 2 + GFX.textWidth('HI SCORE ', fs), fy, COL.hi, { scale: fs });
        }, [[MENU_X0 - 6, 62, MENU_X1 + 6, menuBottom], [16, 8, 240, 68]]);   // the menu column and the logo are kept free of bubbles too
      },
    };
  })();

  // ---- STORY (intro before play + attract) ----------------------------------------------------------------
  scenes.story = (() => {
    // Every line <= 26 characters (208 px): it never touches the tower walls, even in the fractional-scale layouts.
    // (v3 U16: the copy breaks at phrase boundaries: "TO GET IT BACK." stays on one line)
    const LINES = [
      { s: 'THE KRAKEN KING HAS STOLEN', at: 6, y: 98 },
      { s: 'THE REEF\'S MOON PEARL!', at: 36, y: 108 },
      { s: 'FIZZ & POP DIVE DOWN', at: 110, y: 123 },
      { s: 'THE SUNKEN TOWER', at: 130, y: 133 },
      { s: 'TO GET IT BACK.', at: 150, y: 143 },
      { s: 'TRAP THEM. POP THEM!', at: 176, y: 157, c: COL.gold },
    ];
    const KRAKEN_IN = 40, GRAB = 100, LEAVE = 118, GONE = 200;
    let args = {};

    function drawPearlAndKraken(t) {
      const dark = clamp01((t - GRAB) / 45) * 0.62;
      let kx = 300;
      if (t >= KRAKEN_IN && t < LEAVE) kx = U.lerp(300, 150, ease(clamp01((t - KRAKEN_IN) / (GRAB - KRAKEN_IN))));
      else if (t >= LEAVE) kx = U.lerp(150, 300, ease(clamp01((t - LEAVE) / (GONE - LEAVE))));
      const ky = 22 + Math.sin(t / 14) * 4;
      // pearl rests at (120,44) until grabbed, then travels with the Kraken King's tentacle
      const grabbed = t >= GRAB;
      const px = grabbed ? kx - 30 : 120, py = grabbed ? ky + 22 : 44;
      const away = grabbed && kx > 270;
      if (!away) glowAt(px + 16, py + 16, 46, '#c8d4ff', (0.34 + Math.sin(t / 9) * 0.06) * (1 - dark));
      if (kx < 280) {
        glowAt(kx + 24, ky + 26, 40, '#8a5cff', 0.16);
        spr(t > 150 ? 'kraken_angry' : 'kraken', Math.floor(t / 12), kx, ky);
      }
      if (!away) {
        spr('moonpearl', Math.floor(t / 14), px, py);
        for (let i = 0; i < 3; i++) {
          const a = t / 20 + i * 2.1;
          spr('sparkle', Math.floor(t / 5) + i, px + 12 + Math.cos(a) * 26, py + 12 + Math.sin(a) * 22);
        }
      }
      // the grab: ONE soft flash (<= 12 % alpha: SPEC_V2 photosensitivity cap), none at all with reduced motion
      if (t >= GRAB && t < GRAB + 8 && !reducedMotion) { ctx.fillStyle = 'rgba(210,235,255,' + (0.12 * (1 - (t - GRAB) / 8)).toFixed(3) + ')'; ctx.fillRect(0, 0, C.W, C.H); }
      return dark;
    }

    return {
      music: 'title',
      enter(a) { args = a || {}; AUDIO.music('title'); },
      update(ui) {
        ambient.update();
        if (args.attract) {
          if (ui.hit) gotoScene('title');
          else if (sceneT >= ATTRACT_STORY_FRAMES) gotoScene('howto', { attract: true, page: 0 });
          return;
        }
        const skip = sceneT >= INPUT_GUARD && (ui.p.ok || ui.p.alt || ui.p.pause);
        if (skip || sceneT >= STORY_FRAMES) gotoScene('play', args.next || { players: 1, level: 1, seed: 1 });
      },
      render() {
        const t = sceneT;
        layered(t, 0.4, true, () => staticBack('menu', () => { drawBg(BG_TITLE); dim(0.28); }), () => {
          towerFrame();
          const dark = drawPearlAndKraken(t);
          ctx.fillStyle = rgba(2, 3, 12, dark * 0.5);
          ctx.fillRect(16, C.MAP_Y, C.W - 32, 200);
          if (t >= 4) panel(20, 91, 216, 79, { a: 0.5 * clamp01((t - 4) / 24), edge: 0.34 * clamp01((t - 4) / 24) });
          // typewriter text
          LINES.forEach((l) => {
            const n = Math.floor(U.clamp((t - l.at) * 1.1, 0, l.s.length));
            if (n > 0) ctext(l.s.slice(0, n), l.y, l.c || COL.text);
          });
          // the controls, once the rules are told (round 1 has no hint of its own, P3)
          if (!args.attract && t >= 214) {
            ctext(touchMode ? 'BUBBLE: TRAP FOES' : 'Z / SPACE: BUBBLE', 176, COL.dim);     // (clear of the panel's bottom hairline at y 170)
            ctext(touchMode ? 'JUMP: HOP UP' : 'UP / X: JUMP', 185, COL.dim);
          }
          // Fizz & Pop watch, then jump with excitement once the plan is made
          const excited = t > 170;
          const hop = (ph) => (excited ? Math.abs(Math.sin((t + ph) / 7)) * 10 : 0);
          glowAt(48, 214, 22, '#ff3ea5', 0.3, 0.3); glowAt(208, 214, 22, '#3cf2ff', 0.3, 0.3);
          spr(excited ? 'p1_jump' : 'p1_idle', Math.floor(t / 30), 40, 200 - hop(0));
          spr(excited ? 'p2_jump' : 'p2_idle', Math.floor(t / 30), 200, 200 - hop(11), { flip: true });
          if (!args.attract && blink(t, 24)) ctext(touchLabel() + ' TO SKIP', 195, COL.dimmer);
        }, [[24, 90, 232, 204]]);                                   // the whole text block stays free of bubbles
      },
    };
  })();

  // ---- HOW TO PLAY (6 pages) -------------------------------------------------------------------------------
  scenes.howto = (() => {
    const CAST = [
      ['nibbler', 'NIBBLER', 'WINDUP FISH THAT HOPS'], ['crabbit', 'CRABBIT', 'THROWS PEBBLES AT YOU'],
      ['jellop', 'JELLOP', 'DRIFTS DIAGONALLY'], ['springle', 'SPRINGLE', 'NEVER STOPS BOUNCING'],
      ['glimmer', 'GLIMMER', 'DROPS SPARKS FROM ABOVE'], ['bonefin', 'BONEFIN', 'CHASES WHEN YOU DAWDLE'],
    ];
    const FOODS = [
      ['food_0', 'SEA GRAPES', 500], ['food_1', 'KELP ROLL', 700], ['food_2', 'CLAM', 1000], ['food_3', 'SHRIMP TEMPURA', 1500],
      ['food_4', 'SUSHI', 2000], ['food_5', 'PUDDING', 3000], ['food_6', 'SUNDAE', 5000], ['food_7', 'GOLDEN CROWN', 8000],
    ];
    const POWERS = [
      ['pu_shoes', 'FLIPPERS', 'RUN FASTER'], ['pu_pink', 'PINK PEARL', 'BUBBLES FLY FARTHER'],
      ['pu_blue', 'BLUE PEARL', 'RAPID FIRE'], ['pu_gold', 'GOLD PEARL', 'SPEEDY BUBBLES'],
      ['pu_parasol', 'PARASOL', 'SKIP THREE ROUNDS'], ['pu_clock', 'CLOCK', 'FREEZES ALL FOES'],
      ['pu_bomb', 'STAR BOMB', 'CLEARS ALL FOES'], ['pu_heart', 'HEART', 'EXTRA LIFE'],
    ];
    const SPECIALS = [
      ['bubble_thunder', 'THUNDER BUBBLE', 'BOLTS ZAP FOES BOTH WAYS'], ['bubble_fire', 'FIRE BUBBLE', 'FLAMES BURN THE FLOOR'],
      ['bubble_water', 'WATER BUBBLE', 'FLOOD SWEEPS FOES AWAY'], ['bubble_letter', 'EXTEND LETTERS', 'SPELL IT FOR A LIFE'],
    ];
    const PAGES = 6;
    let page = 0, pageT = 0, args = {};

    const header = (s, sub) => heading(s, 6, COL.hi, sub, 24);
    // Touch layout (v3 U13 / U16): the pages are laid out above a navigation strip (a BACK plate and a NEXT plate, each >= 44 css px tall and clearly labelled) instead of running
    // down to the canvas edge; the panel ends at y 184 and every page's content at y 181. Keyboards / mice keep the roomy desktop layout.
    const PANEL_TOP = 32, TOUCH_PANEL_BOT = 184;
    const navH = () => Math.min(34, Math.ceil(TOUCH_ROW_CSS / (layout.scale || 1)));
    const navTop = () => 224 - 2 - navH();                       // the plates' top; taps from navTop - 2 down belong to them
    const pauseWhere = () => (layout.land ? 'TOP RIGHT' : 'ABOVE THE PADS');

    function drawRules(t) {
      header('HOW TO PLAY');
      const T = touchMode;
      const lines = ['TRAP FOES IN BUBBLES,', 'THEN TOUCH THE BUBBLE TO POP', 'THEM INTO TASTY TREATS!',
        'CLEAR EVERY FOE TO DIVE', 'DEEPER. 30 ROUNDS TO GO.', 'HOLD JUMP TO BOUNCE ON THEM.'];
      lines.forEach((s, i) => ctext(s, T ? 38 + i * 10 : 37 + i * 11, i < 3 ? COL.text : COL.dim));
      // 1 bubble -> 2 trap -> 3 pop and eat
      const ay = T ? 100 : 112;
      const steps = [['1 BUBBLE', 20], ['2 TRAP', 100], ['3 EAT!', 172]];
      const u = (t % 150) / 150;
      spr(u < 0.18 ? 'p1_shoot' : 'p1_idle', u < 0.09 || u >= 0.18 ? 0 : 1, 30, ay);
      if (u > 0.06 && u < 0.3) spr('bubble_shot', Math.floor((u - 0.06) * 14), 46 + (u - 0.06) * 60, ay, { alpha: 0.9 });
      spr('nibbler_trapped', Math.floor(t / 12), 112, ay); spr('trap_overlay', Math.floor(u * 3), 112, ay);
      const eat = Math.floor(t / 8);
      spr('food_4', 0, 180, ay + Math.round(Math.sin(t / 9) * 2));
      spr('sparkle', eat, 172, ay - 4); spr('sparkle', eat + 2, 196, ay + 12);
      text('>', 82, ay + 5, COL.gold); text('>', 150, ay + 5, COL.gold);
      steps.forEach(([s, x]) => text(s, x, ay + 22, COL.text));
      ctext('POP BUBBLES IN A CHAIN FOR', T ? 134 : 160, COL.dim);
      ctext('1000  2000  4000  8000 ...', T ? 144 : 171, COL.gold);
      ctext('LOSE A LIFE WHEN A FOE', T ? 158 : 188, COL.dimmer);
      ctext('TOUCHES YOU. 3 LIVES!', T ? 168 : 198, COL.dimmer);
    }

    function drawControls(t, th) {
      const onlyTouch = touchOnly();
      header('CONTROLS', touchMode ? 'ON-SCREEN BUTTONS' : 'KEYBOARD AND GAMEPAD');
      let y = 38;
      if (touchMode) {
        spr('p1_walk', Math.floor(t / 8), 24, y);
        [['← →', 'RUN'], ['JUMP', 'HOP UP'], ['BUBBLE', 'TRAP / OK'], ['PAUSE', pauseWhere()], ['SOUND', 'ON / OFF']]
          .forEach((r, i) => { text(r[0], 52, y + 1 + i * 12, COL.gold); text(r[1], 112, y + 1 + i * 12, COL.text); });
        y += 68;
        ctext('TAP A MENU ROW TO PICK IT', y, COL.dim); y += 20;
      } else {
        const colX = [20, 144], who = ['p1', 'p2'], names = ['FIZZ  P1', 'POP  P2'];
        const rows = [['← →  MOVE', 'A D  MOVE'], ['UP/X  JUMP', 'W  JUMP'], ['SPC/Z  BUBBLE', 'Q  BUBBLE']];
        for (let i = 0; i < 2; i++) {
          spr(who[i] + '_walk', Math.floor(t / 8), colX[i], y);
          text(names[i], colX[i] + 22, y + 4, PLAYER_COL[i]);
          for (let r = 0; r < 3; r++) text(rows[r][i], colX[i], y + 22 + r * 11, COL.text);
        }
        y += 62;
        ctext('KEYS FOLLOW THE WASD BLOCK,', y, COL.dimmer); ctext('WHATEVER THE KEYCAPS SAY', y + 10, COL.dimmer);
        y += 26;
      }
      const gp = touchMode ? [12, 24, 36] : [11, 21, 31];
      ctext('GAMEPAD', y, th.accent2);
      ctext('STICK / D-PAD: MOVE', y + gp[0], COL.text);
      ctext('A: JUMP   B / X: BUBBLE', y + gp[1], COL.text);
      ctext('START: PAUSE', y + gp[2], COL.text);
      if (!onlyTouch) {
        if (touchMode) { ctext('ENTER START  P PAUSE', y + 50, COL.dim); ctext('M SOUND  H HELP  Q JOINS P2', y + 60, COL.dim); }
        else { ctext('ENTER START  P PAUSE', y + 49, COL.dim); ctext('M SOUND  H HELP', y + 59, COL.dim); ctext('PUSH Q TO JOIN AS P2', y + 71, COL.dimmer); }
      }
    }

    function drawPage(t) {
      const th = GFX.theme(page % 6), T = touchMode;
      if (page === 0) drawRules(t);
      else if (page === 1) drawControls(t, th);
      else if (page === 2) {
        header('THE CAST', 'WHO LIVES IN THE TOWER');
        const pitch = T ? 19 : 20;
        CAST.forEach((c, i) => {
          const y = 36 + i * pitch;
          spr(castSprite(c[0]), Math.floor(t / 10) + i, 28, y);
          text(c[1], 52, y + 1, th.accent2);
          text(c[2], 52, y + 10, COL.dim);
        });
        if (T) {                                             // the king at half size, as the last row (the page ends above the navigation strip)
          const ky = 36 + 6 * pitch;
          ctx.save(); ctx.translate(40, ky + 12); ctx.scale(0.5, 0.5);
          if (GFX.has('kraken')) GFX.draw(ctx, 'kraken', Math.floor(t / 14), -24, -24); ctx.restore();
          note(28, ky, 52, ky + 24);
          text('KRAKEN KING', 56, ky, COL.coral);
          text('ROUND 30 BOSS. HIT', 56, ky + 9, COL.dim);
          text('HIM WITH BOLTS!', 56, ky + 18, COL.dim);
        } else {
          sprC('kraken', Math.floor(t / 14), 52, 158);
          text('KRAKEN KING', 84, 168, COL.coral);
          text('ROUND 30 BOSS. HIT', 84, 178, COL.dim);
          text('HIM WITH BOLTS!', 84, 187, COL.dim);
        }
      } else if (page === 3) {
        header('TREATS', 'BIGGER CHAINS = BIGGER FOOD');
        const pitch = T ? 17 : 20;
        FOODS.forEach((f, i) => {
          const y = 36 + i * pitch;
          spr(f[0], 0, 32, y);
          text(f[1], 56, y + 4, COL.text);
          text(String(f[2]), 224, y + 4, COL.gold, { align: 'right' });
        });
      } else if (page === 4) {
        header('POWER-UPS', 'ONE PER ROUND, 1000 PTS EACH');
        const pitch = T ? 18 : 20;
        POWERS.forEach((f, i) => {
          const y = 36 + i * pitch;
          spr(f[0], 0, 32, y);
          text(f[1], 56, y + (T ? 0 : 1), th.accent2);
          text(f[2], 56, y + (T ? 9 : 10), COL.dim);
        });
      } else {
        header('BUBBLES', 'WATCH FOR SPECIAL BUBBLES');
        const pitch = T ? 21 : 24, y0 = T ? 36 : 38;
        SPECIALS.forEach((f, i) => {
          const y = y0 + i * pitch;
          spr(f[0], Math.floor(t / 14), 28, y);
          text(f[1], 48, y + 1, th.accent2);                 // (x 48: the longest line, BOLTS ZAP FOES BOTH WAYS, then ends at 240, clear of the panel's frame)
          text(f[2], 48, y + 10, COL.dim);
        });
        const cy = T ? 124 : 144, by = T ? 134 : 156;
        ctext('CHAIN POP SCORES', cy, COL.text);
        [1000, 2000, 4000, 8000].forEach((n, i) => {
          const x = 36 + i * 52;
          spr('bubble', Math.floor(t / 14) + i, x + 4, by);
          text(String(n), x + 12, by + 20, COL.gold, { align: 'center' });
        });
        ctext('... UP TO 64000 EACH!', T ? 168 : 190, COL.dim);
      }
    }

    function next(d) {
      page = page + d;
      pageT = 0;
      if (page >= PAGES) gotoScene(args.attract ? 'scores' : 'title', args.attract ? { attract: true } : undefined);
      else if (page < 0) page = 0;
    }

    return {
      music: 'title',
      enter(a) { args = a || {}; page = U.clamp(args.page | 0, 0, PAGES - 1); pageT = 0; AUDIO.music('title'); },
      page: () => page,
      /** Touch: a BACK plate at the bottom left (>= 44 css px tall, 96 wide) and a NEXT plate at the bottom right; a tap anywhere else is "next" too, except in a dead band just above
       *  the strip, where an almost-miss of BACK does nothing instead of turning the page the wrong way (U13). A mouse: the bottom-left "ESC: BACK" label leaves like Esc. */
      pointer(x, y) {
        if (args.attract) { gotoScene('title'); return; }
        if (touchMode) {
          const nt = navTop() - 2;
          if (y >= nt && x < 96) { AUDIO.sfx('menu_move'); if (page === 0) gotoScene('title'); else next(-1); return; }
          if (y >= nt - 8 && y < nt && x < 96) return;
          AUDIO.sfx('menu_move'); next(1);
          return;
        }
        AUDIO.sfx('menu_move');
        if (y > 200 && x < 80) gotoScene('title');
        else next(1);
      },
      navZone: () => ({ top: navTop() - 2, backX1: 96, h: navH() }),
      update(ui) {
        ambient.update();
        pageT++;
        if (args.attract) {
          if (ui.hit) { gotoScene('title'); return; }
          if (pageT >= HOWTO_PAGE_FRAMES) next(1);
          return;
        }
        if (ui.p.pause || ui.p.bksp) { gotoScene('title'); return; }
        if (sceneT < INPUT_GUARD) return;
        if (ui.p.left || ui.p.up) { if (page > 0) { AUDIO.sfx('menu_move'); next(-1); } }
        else if (ui.p.right || ui.p.down || ui.p.ok || ui.p.alt) { AUDIO.sfx('menu_move'); next(1); }
      },
      render() {
        layered(sceneT, 0.28, false, () => staticBack('menu', () => { drawBg(BG_TITLE); dim(0.28); }), () => {
          panel(12, PANEL_TOP, 232, touchMode ? TOUCH_PANEL_BOT - PANEL_TOP : 177, { a: 0.5, edge: 0.3 });
          drawPage(sceneT);
          const dotY = touchMode ? 224 - 2 - navH() / 2 : 215;
          for (let i = 0; i < PAGES; i++) {            // page dots: the current one lit
            const cx = 128 - PAGES * 6 + i * 12 + 6, on = i === page;
            if (on) glowAt(cx, dotY, 7, '#3cf2ff', 0.5);
            ctx.beginPath(); ctx.arc(cx, dotY, on ? 1.7 : 1.4, 0, Math.PI * 2);
            if (on) { ctx.fillStyle = COL.hi; ctx.fill(); } else { ctx.lineWidth = 1.1 / K; ctx.strokeStyle = 'rgba(90,162,192,0.8)'; ctx.stroke(); }
          }
          note(128 - PAGES * 6, dotY - 3, 128 + PAGES * 6, dotY + 3);
          if (!args.attract) {                         // every label says what a tap / key on it does (R7)
            if (touchMode) {
              const h = navH(), y = navTop();
              plate(8, y, 80, h, false); text(page === 0 ? '< TITLE' : '< BACK', 48, y + Math.floor((h - 8) / 2), COL.text, { align: 'center' });
              plate(168, y, 80, h, false); text(page === PAGES - 1 ? 'DONE >' : 'NEXT >', 208, y + Math.floor((h - 8) / 2), COL.text, { align: 'center' });
            } else { text('ESC: BACK', 4, 211, COL.dimmer); text('← → PAGE', 252, 211, COL.dimmer, { align: 'right' }); }
          }
        });
      },
    };
  })();

  // ---- HI-SCORES -------------------------------------------------------------------------------------------
  scenes.scores = (() => {
    let args = {}, table = [], persistent = true;
    const RANK_COL = [COL.gold, COL.hi, '#ff9a6a'];
    return {
      music: 'title',
      enter(a) { args = a || {}; table = refreshScores(); persistent = storagePersistent(); AUDIO.music('title'); },
      update(ui) {
        ambient.update();
        if (args.attract) {
          if (ui.hit || sceneT >= ATTRACT_SCORES_FRAMES) gotoScene('title');
          return;
        }
        const leave = sceneT >= INPUT_GUARD && (ui.p.ok || ui.p.alt || ui.p.pause);
        if (leave || (args.afterGame && sceneT >= AFTER_GAME_SCORES_FRAMES)) gotoScene('title');
      },
      render() {
        const t = sceneT, th = GFX.theme(0);
        const missed = !args.attract && Array.isArray(args.missed) ? args.missed : [];
        layered(t, 0.28, false, () => staticBack('menu', () => { drawBg(BG_TITLE); dim(0.28); }), () => {
          towerFrame();                                       // same walls + floor as the story: Fizz and Pop stand on it
          heading('HI-SCORES', 11, COL.hi, 'BEST DIVERS OF THE TOWER', 33);
          panel(28, 45, 200, 130, { a: 0.52, edge: 0.34 });   // the table block
          text('RANK', 40, 50, COL.dimmer); text('NAME', 88, 50, COL.dimmer);
          text('SCORE', 184, 50, COL.dimmer, { align: 'right' }); text('RD', 192, 50, COL.dimmer);
          rule(128, 60, 92, CYAN, 0.4);
          const hl = Array.isArray(args.highlight) ? args.highlight : [];
          table.forEach((e, i) => {
            const y = 66 + i * 13.5;
            const mine = hl.indexOf(i) >= 0;
            const c = mine ? (blink(t, 16) ? COL.white : COL.gold) : (RANK_COL[i] || COL.text);
            if (mine) { ctx.fillStyle = 'rgba(255,178,62,0.16)'; ctx.fillRect(30, y - 3, 196, 12); }
            else if (i % 2 === 0) { ctx.fillStyle = 'rgba(60,242,255,0.045)'; ctx.fillRect(30, y - 3, 196, 12); }
            text(ordinal(i), 40, y, c);
            text(e.name, 88, y, c);
            text(fmtScore(e.score), 184, y, c, { align: 'right' });             // (the same 6-digit format as the HUD and the title: U15)
            text('R' + String(e.round).padStart(2, '0'), 192, y, mine ? c : th.accent2);
          });
          // a game that missed the table still shows what it scored (arcade "YOUR SCORE")
          missed.forEach((m, i) => {
            const who = session.lastPlayers === 2 ? 'P' + (m.pi + 1) + ' SCORE ' : 'YOUR SCORE ';
            ctext(who + fmtScore(m.score), 178 + i * 9, PLAYER_COL[m.pi] || COL.white);
          });
          // the heroes watch from the floor; ONE back hint between them, the sandbox notice dim underneath it (U15)
          glowAt(34, 214, 22, '#ff3ea5', 0.3, 0.3); glowAt(222, 214, 22, '#3cf2ff', 0.3, 0.3);
          spr('p1_idle', Math.floor(t / 50) % 3 === 2 ? 1 : 0, 26, 200);
          spr('p2_idle', Math.floor((t + 20) / 50) % 3 === 2 ? 1 : 0, 214, 200, { flip: true });
          const fy = missed.length > 1 ? 195 : 189;
          if (blink(t, 30)) ctext(args.attract ? 'PUSH ANY BUTTON' : (touchMode ? 'TAP: BACK' : 'ENTER / ESC: BACK'), fy, COL.dim);
          if (!persistent && !args.attract) ctext(touchMode ? 'KEPT THIS VISIT ONLY' : 'SCORES KEPT THIS VISIT ONLY', fy + 11, COL.dimmer, { scale: touchMode ? 1 : 0.75 });   // the host grants no storage: initials last until the page closes
        });
      },
    };
  })();

  // ---- NAME ENTRY ------------------------------------------------------------------------------------------
  scenes.entry = (() => {
    const OK_FRAMES = 45;
    const TYPE_GUARD = 40;                                 // frames after a slot opens in which typed letters are ignored (a player still mashing the game keys)
    let queue = [], cur = null, letters = [0, 0, 0], pos = 0, timeLeft = 0, doneT = 0, guard = 0, tguard = 0, highlights = [], missed = [];

    function begin() {
      cur = null;
      while (queue.length) {
        const cand = queue.shift();
        if (qualifies(cand.score)) { cur = cand; break; }
        if (cand.score > 0) missed.push({ pi: cand.pi, score: cand.score });       // below the table: shown on the scores screen
      }
      if (!cur) { gotoScene('scores', { afterGame: true, highlight: highlights, missed }); return false; }
      typed.length = 0;
      letters = [0, 0, 0]; pos = 0; doneT = 0; guard = INPUT_GUARD; tguard = TYPE_GUARD;
      timeLeft = ENTRY_SECONDS * C.FPS;
      return true;
    }

    function finish() {
      const name = letters.map((i) => NAME_CHARS[i]).join('');
      const idx = insertScore(name, cur.score, cur.round);
      highlights = highlights.map((h) => (idx >= 0 && h >= idx ? h + 1 : h)).filter((h) => h < TOP_N);
      if (idx >= 0) highlights.push(idx);
      AUDIO.sfx('menu_select');
      begin();
    }

    /** A thin neon chevron above / below the active letter. */
    function drawArrow(cx, y, up) {
      const p = new Path2D();
      p.moveTo(cx - 4, up ? y + 2.5 : y - 2.5); p.lineTo(cx, up ? y - 1.5 : y + 1.5); p.lineTo(cx + 4, up ? y + 2.5 : y - 2.5);
      glowStroke(p, [255, 178, 62], 0.9);
    }

    return {
      music: 'entry',
      enter(a) {
        const args = a || {};
        highlights = []; missed = [];
        typed.length = 0;
        let entries = args.entries;
        if (!Array.isArray(entries)) {                       // debug / direct goto: build from the finished game
          const res = Game.result();
          entries = [];
          for (let i = 0; i < res.players; i++) entries.push({ pi: i, score: res.scores[i] || 0, round: res.level || 1 });
        }
        queue = entries.map((e) => ({ pi: e.pi | 0, score: Math.floor(e.score) || 0, round: e.round || 1 }));
        refreshScores();
        AUDIO.music('entry');
        begin();
      },
      debug: () => ({ cur, pos, name: letters.map((i) => NAME_CHARS[i]).join(''), timeLeft, doneT, queued: queue.length, highlights: highlights.slice() }),
      update(ui) {
        ambient.update();
        if (!cur) return;
        if (isHeld()) { typed.length = 0; return; }          // the 30 s clock stands still while the page is not live (U5)
        if (guard > 0) guard--;
        if (tguard > 0) tguard--;
        if (doneT > 0) {                                     // "OK!" moment after the third letter; jump goes back
          typed.length = 0;
          if (guard === 0 && (ui.p.alt || ui.p.bksp)) { doneT = 0; pos = NAME_LEN - 1; AUDIO.sfx('menu_move'); } else if (--doneT === 0) finish();
          return;
        }
        if (--timeLeft <= 0) { finish(); return; }          // time out: take the letters as shown
        if (tguard > 0) typed.length = 0;                    // still the game keys of the round that just ended
        if (typed.length) {                                  // keyboard: typing S, A, M sets S, A, M, one letter per tick (R6)
          const i = NAME_CHARS.indexOf(typed.shift());
          if (i >= 0) {
            letters[pos] = i;
            AUDIO.sfx('menu_select');
            if (++pos >= NAME_LEN) { pos = NAME_LEN; doneT = OK_FRAMES; }
            return;
          }
        }
        const d = (ui.p.right || ui.p.up ? 1 : 0) - (ui.p.left || ui.p.down ? 1 : 0);
        if (d) { letters[pos] = (letters[pos] + d + NAME_CHARS.length) % NAME_CHARS.length; AUDIO.sfx('menu_move'); }
        if (guard > 0) return;
        if (ui.p.ok) {
          AUDIO.sfx('menu_select');
          if (++pos >= NAME_LEN) { pos = NAME_LEN; doneT = OK_FRAMES; }
        } else if (ui.p.alt || ui.p.bksp) {
          if (pos > 0) { pos--; AUDIO.sfx('menu_move'); }
        }
      },
      render() {
        const t = sceneT, th = GFX.theme(0);
        layered(t, 0.28, false, () => staticBack('menu', () => { drawBg(BG_TITLE); dim(0.28); }), () => {
          if (!cur) return;
          const c = PLAYER_COL[cur.pi] || COL.white;
          ctext('CONGRATULATIONS!', 10, th.accent2);
          ctext('NEW HIGH SCORE', 24, COL.hi, { scale: 2 });
          rule(128, 40, 84, CYAN, 0.5);
          glowAt(72, 66, 26, cur.pi === 1 ? '#3cf2ff' : '#ff3ea5', 0.25); glowAt(200, 66, 26, cur.pi === 1 ? '#3cf2ff' : '#ff3ea5', 0.25);
          spr(cur.pi === 1 ? 'p2_idle' : 'p1_idle', Math.floor(t / 40), 56, 52);
          spr(cur.pi === 1 ? 'p2_walk' : 'p1_walk', Math.floor(t / 8), 184, 52, { flip: true });
          ctext('PLAYER ' + (cur.pi + 1), 52, c);
          ctext(fmtScore(cur.score), 62, COL.white);
          ctext('RANK ' + ordinal(rankOf(cur.score)), 74, COL.gold);
          ctext('ENTER YOUR INITIALS', 96, COL.text);
          panel(50, 106, 156, 64, { a: 0.5, edge: 0.32 });
          for (let i = 0; i < NAME_LEN; i++) {
            const cx = 128 + (i - 1) * 40, y = 118;
            const active = i === pos && doneT === 0;
            const col = active ? COL.hi : (i < pos ? COL.white : COL.dim);
            if (active) glowAt(cx, y + 9, 22, '#3cf2ff', 0.28);
            text(NAME_CHARS[letters[i]], cx - 12, y, col, { scale: 3 });
            ctx.fillStyle = active && blink(t, 16) ? 'rgba(255,178,62,0.95)' : 'rgba(90,162,192,0.7)';
            ctx.fillRect(cx - 13, y + 29, 26, 1.6 / K);
            note(cx - 14, y - 12, cx + 14, y + 44);
            if (active) { drawArrow(cx, y - 7 + Math.round(Math.sin(t / 6)), true); drawArrow(cx, y + 41 - Math.round(Math.sin(t / 6)), false); }
          }
          if (doneT > 0) ctext('OK!', 168, COL.green, { scale: 2 });
          else {
            // every hint names the key that really does it: on a keyboard the letters are typed, Z / Q / X are letters here (R5, R6)
            const kb = !touchMode && !(padSeen && !keyboardSeen);
            ctext(touchMode ? '← → CHANGE   BUBBLE: OK' : kb ? 'TYPE OR ← → CHANGE LETTER' : '← → CHANGE LETTER', 176, COL.text);   // the triangle glyphs are not in the font (U14)
            ctext(touchMode ? 'JUMP: BACK' : kb ? 'ENTER: OK  BACKSPACE: BACK' : 'B: OK  A: BACK', 187, COL.dim);
          }
          ctext('TIME ' + String(Math.ceil(timeLeft / C.FPS)).padStart(2, '0'), 202, timeLeft < 8 * C.FPS && blink(t, 16) ? COL.coral : COL.dim);
        });
      },
    };
  })();

  // ---- ENDING (victory tableau -> credits -> the cast waves) ----------------------------------------------------
  scenes.ending = (() => {
    const TABLEAU = 9 * C.FPS;                            // opening tableau before the credits start rolling
    const SPEED = 0.55, FAST = 4;
    const PEARL_CX = 128, PEARL_CY = 98;
    // Credits (K3): the text rolls inside a clipped band at the top; Fizz, the Moon Pearl (now 1x) and Pop stand below it as a
    // tableau the band never reaches (hero hop apex y = 170, pearl top y >= 174). The key hint sits on its own plate above the band.
    const BAND_TOP = 18, BAND_BOT = 160, SMALL_CY = 194, X_FADE = 14;
    const CAST_ROW = ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer', 'bonefin'];
    const XF_OUT = 18, XF_IN = 18;                        // section changes dissolve through the dark: 18 frames out, 18 in (U5; the bloom of the bright parts fades faster than the veil rises)
    let phase = 0, pt = 0, show = 0, showT = 99, xf = -1, xfTo = 0, leaving = -1;   // 0 tableau, 1 credits, 2 finale; `show` = the section on screen (it lags `phase` by the fade-out)
    /** Where text lives in each section: ambient bubbles and the celebration bubbles keep out of these (V5). */
    const zones = () => (show === 0 ? [[16, 8, 240, 62], [56, 200, 200, 221]] : show === 1 ? [[16, 0, 240, 162]] : [[16, 0, 240, 110]]);
    function setPhase(n) { phase = n; pt = 0; xfTo = n; xf = 0; }
    let blocks = [], endScroll = 0, scroll = 0, boost = 0, idleEnd = 0, args = {}, entries = [];
    const celeb = (() => {                                // extra rising bubbles for the celebration
      const r = U.rng(77), list = [];
      for (let i = 0; i < 18; i++) list.push({ x: r.int(20, 228), sp: r.float(0.35, 0.9), off: r.int(0, 300), ph: r.float(0, 6.28), big: r.chance(0.3) });
      return list;
    })();
    /** 0 = the pearl is big and centred (tableau, finale), 1 = small, between the heroes (credits). It follows the SHOWN section, so nothing moves while a section dissolves out. */
    const pearlMix = () => (show === 1 ? ease(clamp01(showT / 40)) : show === 2 ? 1 - ease(clamp01(showT / 20)) : 0);

    function build(res) {
      blocks = [];
      let y = 0;
      const add = (b, h) => { b.y = y; b.h = h; blocks.push(b); y += h; };
      const gap = (h) => { y += h; };
      const T = (s, c, sc = 1) => add({ k: 'text', s, c, sc }, 10 * sc + 2);
      T('- CREDITS -', COL.coral); gap(4);
      T('DESIGN, CODE, ART & MUSIC:', COL.text); T('CLAUDE (ANTHROPIC)', COL.gold); gap(22);
      T('- THE KRAKEN KING -', COL.coral); gap(4);
      add({ k: 'sprite', n: 'kraken', h: 48 }, 52); T('SENT BACK TO THE DEEP', COL.text); gap(22);
      T('- FINAL SCORE -', COL.coral); gap(4);
      T('1UP  ' + fmtScore(res.scores[0]), COL.fizz);
      if (res.players === 2) T('2UP  ' + fmtScore(res.scores[1]), COL.pop);
      gap(26);
      T('THANK YOU FOR PLAYING!', COL.white);
      endScroll = BAND_BOT + blocks[blocks.length - 1].y - Math.round((BAND_TOP + BAND_BOT) / 2) + 6;   // the last line stops in the middle of the band
    }

    function drawBlock(b, y, t) {
      switch (b.k) {
        case 'text': ctext(b.s, y, b.c, { scale: b.sc }); break;
        case 'sprite': sprC(b.n, Math.floor(t / 12), 128, y); break;
        default: break;
      }
    }

    /** Light rays: thin wedges rotating slowly around the pearl, additive (soft, warm white: the light returns). */
    function rays(t, a, cy) {
      const R = 190, N = quality >= 1 ? 14 : 6, layers = quality >= 2 ? 2 : 1;      // 28 / 14 / 6 wedges by quality (U6)
      const g = ctx.createRadialGradient(PEARL_CX, cy, 8, PEARL_CX, cy, R);
      g.addColorStop(0, rgba(200, 225, 255, 0.11 * a));
      g.addColorStop(1, rgba(220, 240, 255, 0));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      for (let layer = 0; layer < layers; layer++) {
        const rot = (layer ? -1 : 1) * t * 0.0045 + layer * 0.2;
        for (let k = 0; k < N; k++) {
          const ang = rot + (k * Math.PI * 2) / N, w = 0.045 + 0.025 * Math.sin(k * 1.7 + t / 90 + layer);
          ctx.beginPath();
          ctx.moveTo(PEARL_CX, cy);
          ctx.lineTo(PEARL_CX + Math.cos(ang - w) * R, cy + Math.sin(ang - w) * R);
          ctx.lineTo(PEARL_CX + Math.cos(ang + w) * R, cy + Math.sin(ang + w) * R);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.restore();
    }

    function riseBubbles(t, avoid) {
      const n = reducedMotion ? celeb.length >> 1 : celeb.length;
      for (let i = 0; i < n; i++) {
        const b = celeb[i];
        const y = C.H + 10 - ((t * b.sp + b.off) % (C.H + 30)), x = b.x + Math.sin(t / 40 + b.ph) * 6;
        if (y < -12) continue;
        const a = bubbleAlpha(x, y, b.big ? 0.8 : 0.5, avoid);
        if (a < 0.03) continue;
        GFX.has('bubble') && GFX.draw(ctx, 'bubble', Math.floor(t / 14) + b.off, x, y, { alpha: a });
      }
    }

    /** Fizz and Pop at 2x, hopping one after the other. */
    function heroes(t, lift) {
      const hop = (ph) => Math.abs(Math.sin((t + ph) / 11)) * 14;
      const h1 = hop(0), h2 = hop(17), by = 216 - lift;
      glowAt(54, 216, 26, '#ff3ea5', 0.3, 0.3); glowAt(202, 216, 26, '#3cf2ff', 0.3, 0.3);
      bigHeroes.draw('fizz', h1 > 2 ? 'jump' : 'idle', h1 > 2 ? 0 : Math.floor(t / 20) % 8, h1 > 2 ? 1 : 8, 54, by - h1, 2, false);
      bigHeroes.draw('pop', h2 > 2 ? 'jump' : 'idle', h2 > 2 ? 0 : Math.floor((t + 60) / 20) % 8, h2 > 2 ? 1 : 8, 202, by - h2, 2, true);
    }

    function drawScene(t, dimA) {
      const mix = pearlMix(), pcy = U.lerp(PEARL_CY, SMALL_CY, mix);
      staticBack('menu', () => { drawBg(BG_TITLE); dim(0.28); });
      const warm = ctx.createLinearGradient(0, C.H * 0.45, 0, C.H);       // reef light washing in from the bottom (transparent over the upper 45 %: only the lower part is filled, U6)
      warm.addColorStop(0, 'rgba(255,170,120,0)');
      warm.addColorStop(1, rgba(255, 170, 120, 0.16 * (1 - dimA * 0.6)));
      ctx.fillStyle = warm; ctx.fillRect(0, C.H * 0.45, C.W, C.H * 0.55);
      rays(t, 1 - dimA * 0.6, pcy);
      const zs = zones();
      riseBubbles(t, zs);
      ambient.draw(t, 0.35, false, zs);
      towerFrame();
      // the big pearl, bobbing, with sparkles around it (fades out while it moves down between the heroes)
      const bob = Math.round(Math.sin(t / 22) * 3);
      if (mix < 1) pearl(PEARL_CX, PEARL_CY + bob, 19, t, 1 - mix);
      if (dimA > 0) { ctx.fillStyle = rgba(3, 8, 24, dimA); ctx.fillRect(16, C.MAP_Y, C.W - 32, 200); }
      heroes(t, 0);                                        // after the veil: Fizz and Pop stay bright
      if (mix > 0) pearl(PEARL_CX, SMALL_CY + Math.round(bob / 2), 9, t, mix);   // the small pearl joins them, between Fizz and Pop
    }

    /** The scrolling credits, clipped to their band (so they can never reach the tableau below it) with soft top / bottom edges. */
    function drawCredits(t) {
      const h = BAND_BOT - BAND_TOP;
      ctx.fillStyle = rgba(3, 6, 16, 0.42);
      ctx.fillRect(16, BAND_TOP, C.W - 32, h);
      ctx.save();
      ctx.beginPath(); ctx.rect(16, BAND_TOP, C.W - 32, h); ctx.clip();
      blocks.forEach((b) => {
        const y = Math.round(BAND_BOT - scroll + b.y);
        if (y > BAND_TOP - 60 && y < BAND_BOT + 4) drawBlock(b, y, t);
      });
      for (const [y0, y1, a0, a1] of [[BAND_TOP, BAND_TOP + X_FADE, 0.96, 0], [BAND_BOT - X_FADE, BAND_BOT, 0, 0.96]]) {
        const g = ctx.createLinearGradient(0, y0, 0, y1);
        g.addColorStop(0, rgba(3, 6, 16, a0)); g.addColorStop(1, rgba(3, 6, 16, a1));
        ctx.fillStyle = g; ctx.fillRect(16, y0, C.W - 32, y1 - y0);
      }
      ctx.restore();
      ctx.fillStyle = 'rgba(60,242,255,0.3)';             // hairlines mark the band's edges
      ctx.fillRect(16, BAND_TOP - 1, C.W - 32, 1.2 / K); ctx.fillRect(16, BAND_BOT, C.W - 32, 1.2 / K);
    }

    /** Key hint on its own dark glass strip (outside the scroll band). */
    function hintPlate(s, y) {
      const w = GFX.textWidth(s) + 14, x = Math.round(C.W / 2 - w / 2);
      panel(x, y - 3, w, 14, { a: 0.78, edge: 0.3, ticks: false });
      ctext(s, y, COL.dim);
    }

    function drawFinale(t) {
      drawLogoCached(128, 12, t / 60);
      ctext('THE END', 56, COL.hi, { scale: 2 });
      ctext('THANK YOU FOR PLAYING!', 80, COL.white);
      ctext('- EVERYONE WAVES GOODBYE -', 100, COL.coral);
      CAST_ROW.forEach((id, i) => {
        const x = 128 - (CAST_ROW.length * 24 - 8) / 2 + i * 24, bob = Math.round(Math.sin(t / 9 - i * 0.9) * 4);
        spr(castSprite(id), Math.floor(t / 10) + i, x, 114 + bob, { flip: i > 2 });
      });
      sprC('kraken', Math.floor(t / 14), 128, 142);
    }

    return {
      music: 'ending',
      enter(a) {
        args = a || {};
        const res = args.res || Game.result();
        entries = args.entries;
        build(res);
        phase = 0; pt = 0; show = 0; showT = 99; xf = -1; xfTo = 0; leaving = -1; scroll = 0; boost = 0; idleEnd = 0;
        AUDIO.music('ending');
      },
      band: () => ({ top: BAND_TOP, bottom: BAND_BOT, scroll, endScroll, phase, show }),
      update(ui) {
        ambient.update();
        pt++;
        if (leaving >= 0) { if (++leaving >= XF_OUT) gotoScene('entry', { entries }); return; }       // dissolving out: the entry fades in from the same dark
        const next = () => { if (leaving < 0) leaving = 0; };
        if (sceneT >= INPUT_GUARD && ui.p.pause) { next(); return; }
        showT++;
        if (xf >= 0) { xf++; if (xf >= XF_OUT && show !== xfTo) { show = xfTo; showT = 0; } if (xf >= XF_OUT + XF_IN) xf = -1; }
        if (phase === 0) {
          if (pt >= TABLEAU || (pt > INPUT_GUARD && (ui.p.ok || ui.p.alt))) setPhase(1);
        } else if (phase === 1) {
          if (ui.p.ok || ui.p.alt) boost = 90;
          if (boost > 0) boost--;
          scroll = Math.min(endScroll, scroll + SPEED * ((ui.h.ok || ui.h.alt || boost > 0) ? FAST : 1));
          if (scroll >= endScroll) setPhase(2);
        } else {
          idleEnd++;
          if ((idleEnd > 30 && (ui.p.ok || ui.p.alt)) || idleEnd > 600) next();
        }
      },
      render() {
        const t = sceneT;
        drawScene(t, show === 0 ? 0 : show === 1 ? 0.55 : 0.5);
        if (show === 0) {
          const pt0 = phase === 0 ? pt : 1e9;                     // (while the tableau fades out its text stays complete)
          const lines = [['MOON PEARL', 12, 2, COL.gold, 6], ['IS SAFE!', 30, 2, COL.gold, 34], ['THE REEF SHINES AGAIN', 52, 1, COL.text, 70]];
          lines.forEach(([s, y, sc, c, at]) => {
            const n = Math.floor(U.clamp((pt0 - at) * 0.9, 0, s.length));
            if (n > 0) ctext(s.slice(0, n), y, c, { scale: sc });
          });
          if (phase === 0 && pt > 150 && pt < 330 && blink(pt, 30)) hintPlate(touchLabel() + ': SKIP', 204);
        } else if (show === 1) {
          drawCredits(t);
          hintPlate(touchMode ? 'TAP: FASTER' : 'ENTER: FASTER  ESC: SKIP', 3);
        } else drawFinale(t);
        if (xf >= 0 || leaving >= 0) {                            // the dissolve: a veil of the abyss colour ramps to full and back, so no section is swapped in one frame (U5)
          const a = ease(leaving >= 0 ? Math.min(1, leaving / XF_OUT) : xf < XF_OUT ? xf / XF_OUT : 1 - (xf - XF_OUT) / XF_IN);   // (smoothstep: the steepest frame is ~1.5x the average one)
          if (a > 0.004) { ctx.fillStyle = rgba(3, 6, 16, U.clamp(a, 0, 1)); ctx.fillRect(0, 0, C.W, C.H); }
        }
      },
    };
  })();

  // ---- PLAY (Game + pause overlay) ---------------------------------------------------------------------------
  scenes.play = (() => {
    const PAUSE_ITEMS = ['RESUME', 'QUIT'], CONFIRM_ITEMS = ['NO', 'YES'];
    const items = () => (confirmQuit ? CONFIRM_ITEMS : PAUSE_ITEMS);

    /** Panel + row geometry; on touch the rows are >= 44 css px tall plates, QUIT sits a full row away from RESUME. */
    function geom() {
      const n = PAUSE_ITEMS.length;
      if (touchMode) {
        const pitch = touchPitch(n, 120, 38), h = 46 + n * pitch + 10, y = Math.max(20, Math.round((C.H - h) / 2));
        return { big: true, x0: 40, x1: 216, py: y, ph: h, y0: y + 46, pitch, px: 32, pw: 192, ty: y + 12 };
      }
      return { big: false, x0: 64, x1: 192, py: 56, ph: 128, y0: 112 + (confirmQuit ? 8 : 0), pitch: 16, px: 48, pw: 160, ty: 70 };
    }

    function choose(i) {
      if (confirmQuit) {
        if (i === 1) { AUDIO.sfx('menu_select'); gotoScene('title'); }          // YES: really quit
        else { confirmQuit = false; pauseSel = 1; AUDIO.sfx('menu_move'); }       // NO: back to the menu, on QUIT
      } else if (i === 0) setPaused(false);
      else { confirmQuit = true; pauseSel = 0; AUDIO.sfx('menu_select'); }        // QUIT asks first (U11)
    }

    return {
      enter(a) {
        const args = a || {};
        const players = args.players === 2 ? 2 : 1;
        paused = false; pauseSel = 0; confirmQuit = false; autoPaused = false;
        session.lastPlayers = players;
        pushOptions();                                          // reduced motion / quality for this game (Game keeps them between games, this is the belt and braces)
        Game.start({ players, level: args.level || 1, seed: args.seed === undefined ? 1 : args.seed, hiScore: topScore(),
          joinHint: touchOnly() ? '' : 'PUSH Q' });
        if (isHeld()) setPaused(true, true);                    // never start a round unattended while blurred / hidden (U5)
      },
      leave() {
        if (paused) { paused = false; autoPaused = false; confirmQuit = false; try { AUDIO.resume(); } catch (e) { /* ignore */ } }
        try { AUDIO.setTempo(1); } catch (e) { /* ignore */ }
        let over = false;
        try { over = Game.isOver(); } catch (e) { /* ignore */ }
        if (!over) { try { AUDIO.stopMusic(); } catch (e) { /* ignore */ } }   // QUIT: cut the stage loop / the start jingle and its onEnd (U4)
        try {
          const r = Game.result();
          session.reached = Math.max(session.reached, r.level || 1);
          session.lastPlayers = r.players === 2 ? 2 : 1;                       // CONTINUE keeps a joined P2 (U22)
        } catch (e) { /* ignore */ }
      },
      pointer(x, y) {
        if (!paused) return;
        const g = geom();
        const i = rowAt(x, y, g.big ? g.y0 : g.y0 - 4, g.pitch, 2, g.x0, g.x1);
        if (i >= 0) choose(i);
      },
      rows() {
        if (!paused) return null;
        const g = geom(), top = g.big ? g.y0 : g.y0 - 4;
        return items().map((s, i) => ({ id: s, label: s, top: top + i * g.pitch, h: g.pitch, x0: g.x0, x1: g.x1, sel: i === pauseSel }));
      },
      update(ui) {
        if (ui.p.pause) {
          if (paused && confirmQuit) { confirmQuit = false; pauseSel = 1; AUDIO.sfx('menu_move'); return; }   // Esc backs out of the question
          setPaused(!paused);
          if (paused) return;
        }
        if (paused) {
          if (ui.p.up || ui.p.left || ui.p.down || ui.p.right) { pauseSel = (pauseSel + 1) % 2; AUDIO.sfx('menu_move'); }
          else if (ui.p.ok || ui.p.alt) choose(pauseSel);
          return;
        }
        const one = Game.result().players === 1;
        if (one) {                                                     // Q or pad 1 A / B joins; P2's input is never forwarded
          if (ui.joinHit) Game.join(1);
          Game.update([ui.pads[0], { left: false, right: false, jump: false, fire: false, jumpPressed: false, firePressed: false }]);
        } else Game.update(ui.pads);
        if (Game.isOver()) finishGame();
      },
      render() {
        Game.render(ctx);
        if (!paused) return;
        const g = geom(), list = items();
        ctx.fillStyle = 'rgba(2,4,12,0.58)';
        ctx.fillRect(0, 0, C.W, C.H);
        if (focusEl && !focusEl.hidden) return;                 // the click-to-resume overlay speaks for the paused game: no second panel under it (P2)
        panel(g.px, g.py, g.pw, g.ph, { a: 0.9, edge: 0.55 }); // near-opaque glass: nothing from the paused round shows through the text
        if (confirmQuit) {
          ctext('QUIT?', g.ty, COL.coral, { scale: 2 });
          ctext('THIS ENDS YOUR GAME', g.ty + 22, COL.dim);
        } else ctext('PAUSED', g.ty, COL.hi, { scale: 2 });
        rule(128, g.ty + 15, 52, CYAN, 0.5);
        list.forEach((s, i) => {
          const on = i === pauseSel;
          if (g.big) {
            plate(g.x0, g.y0 + i * g.pitch, g.x1 - g.x0, g.pitch - 4, on);
            ctext(s, g.y0 + i * g.pitch + Math.floor((g.pitch - 4 - 8) / 2), on ? COL.hi : COL.text);
            return;
          }
          const y = g.y0 + i * g.pitch;
          menuRow(s, 128, y, on, sceneT);
        });
        if (!g.big) {
          ctext(confirmQuit ? 'ESC: BACK' : 'P OR ESC: RESUME', 160, COL.dim);
          if (!confirmQuit) ctext('M: SOUND', 171, COL.dimmer);
        }
      },
    };
  })();

  // ===================================================================================================
  // Loop
  // ===================================================================================================
  /** "Audio not running although it should" (before the first gesture, iOS interruption, a call): after ~0.75 s a TAP FOR SOUND hint
   *  appears, unless the click-to-play overlay is already asking for the gesture or the page is held / paused (R8). */
  function trackDeadAudio() {
    if (isHeld() || paused || (focusEl && !focusEl.hidden) || !(window.AudioContext || window.webkitAudioContext)) { deadAudioT = 0; return; }   // (no Web Audio at all: no key press can help)
    let ready = true, muted = false;
    try { ready = AUDIO.ready(); muted = AUDIO.isMuted(); } catch (e) { /* ignore */ }
    deadAudioT = ready || muted ? 0 : deadAudioT + 1;
  }

  function tick(useReal) {
    if (useReal && focusUp() && attractRun()) { tapped.clear(); touchTap.clear(); pointerEvt = null; return; }   // an attract run waits behind the click-to-play overlay (U9)
    sceneT++;
    const inp = sampleInput(useReal);
    const sc = scenes[scene];
    if (useReal && pointerEvt) {
      const pt = pointerEvt;
      pointerEvt = null;
      inp.heldAny = true; inp.hit = true;
      if (sc.pointer) { if (!(pt.flipped && scene === 'play')) sc.pointer(pt.x, pt.y); }   // (a first touch that flipped the layout never taps a pause row it did not aim at)
      else inp.p.ok = true;
      if (scenes[scene] !== sc) { tapped.clear(); touchTap.clear(); return; }   // the tap already changed the scene
    }
    if (useReal && (inp.heldAny || inp.hit)) { dirty = true; activeUntil = sceneT + ACTIVE_GRACE; }   // something to show now: render this frame, and stay at full rate for a moment
    if (inp.p.mute) toggleMute();
    if (!audioSynced) {
      let ready = false;
      try { ready = AUDIO.ready(); } catch (e) { ready = false; }
      if (ready) { audioSynced = true; syncSceneMusic(); }
    }
    if (useReal) trackDeadAudio();
    if (toastT > 0) toastT--;
    if (fadeIn > 0) fadeIn--;
    sc.update(inp);
    if (useReal) { tapped.clear(); touchTap.clear(); }
  }

  // ===================================================================================================
  // Quality (post FX level, SPEC_V2 sec. 1) and reduced motion
  // ===================================================================================================
  /** Tell Game (and remember for the scenes) the presentation options. Feature-detected: an older Game without setOptions just ignores them. */
  function pushOptions() {
    try { if (typeof Game.setOptions === 'function') Game.setOptions({ reducedMotion, quality }); } catch (e) { reportError('Game.setOptions', e); }
  }
  const qualityLog = [];
  function setQuality(q, why) {
    q = Math.round(+q);
    if (!(q === q)) return quality;
    q = U.clamp(q, 0, maxQuality);
    if (q === quality) return quality;
    quality = q;
    dirty = true;
    qualityLog.push({ q, why: why || 'set', frame: renderCount });
    if (qualityLog.length > 64) qualityLog.shift();
    pushOptions();
    return quality;
  }

  /** Auto quality: the average of update + render + post FX over a 2 s window above 12 ms drops one level; 10 s of windows below 6 ms raise
   *  one again. Anti-flap: when a raise is undone by a drop soon after, the next raise waits twice as long (up to 80 s); a long calm resets it. */
  /** Next GFX bucket below k for the resolution lever (<= 80 % of k, >= K_CAP_MIN); 0 = nothing lower. */
  const lowerK = (k) => { let b = 0; for (const g of GFX_BUCKETS) if (g <= k * K_CAP_STEP + 1e-6 && g >= K_CAP_MIN) b = g; return b; };
  const higherK = (k) => { for (const g of GFX_BUCKETS) if (g > k + 1e-6) return g; return Infinity; };
  function setKCap(c, why) {
    if (c === kCap) return;
    kCap = c;
    qualityLog.push({ kCap: c === Infinity ? null : c, why: why || 'set', frame: renderCount }); if (qualityLog.length > 64) qualityLog.shift();
    fit();                                                  // re-sizes the backing store, tells GFX.setScale and repaints
  }
  const autoQ = {
    sum: 0, n: 0, span: 0, calm: 0, wait: Q_RAISE_AFTER_MS, clock: 0, lastRaise: -1e9, last: 0, windows: 0, fBuf: [], fSpan: 0, skip: 0,
    dts: [], lateN: 0, nWin: 0, longN: 0, rMax: R_MAX_DEFAULT, lastLate: 0, lastR: 0,
    reset() { this.sum = 0; this.n = 0; this.span = 0; this.calm = 0; this.fBuf.length = 0; this.fSpan = 0; this.lateN = 0; this.nWin = 0; this.longN = 0; },
    /** One step down the ladder: quality 2 -> 1 -> 0, then the resolution lever. `avg` (ms, optional) = the measured cost: the lever then jumps to the k whose predicted
     *  cost (fill ~ k^2) is back under the drop threshold instead of one bucket. A drop soon after a raise (the raise was a mistake) doubles the next wait, on EVERY
     *  path (window average, severe fast path, start-up). Returns whether anything changed. */
    degrade(why, avg) {
      let changed = false;
      const recent = this.clock - this.lastRaise < this.wait * 1.5;
      if (quality > 0) { setQuality(quality - 1, why); changed = true; this.reset(); }
      else {
        const cur = Math.min(K, kCap); let lk = lowerK(cur);
        if (lk && avg > Q_DROP_MS) { const want = cur * Math.sqrt(Q_DROP_MS / avg) * 1.1; let b = 0; for (const g of GFX_BUCKETS) if (g <= want + 1e-6 && g >= K_CAP_MIN) b = g; lk = Math.min(lk, b || K_CAP_MIN); }
        if (lk) { setKCap(lk, why + '-res'); changed = true; this.reset(); this.skip = Q_SKIP_FRAMES; }   // the re-bake after a k change is not what the next window is about
      }
      if (changed && recent) this.wait = Math.min(this.wait * 2, Q_WAIT_MAX_MS);
      return changed;
    },
    /** The calm frame period R: the shortest interval among the last R_WIN frames, clamped to [one fixed step, the display refresh seen at boot]. A frame that arrives
     *  later than LATE_RATIO x R missed its slot: whatever the callback measured, the player waited dt - LATE_SHARE x R for it. */
    period() {
      let r = 1e9;
      for (let i = 0; i < this.dts.length; i++) if (this.dts[i] < r) r = this.dts[i];
      return U.clamp(r, STEP_MS * 0.96, this.rMax);
    },
    /** cost = ms spent in update + render + post FX for one animation frame; dt = ms since the previous animation frame; span (default dt) = ms of wall clock this sample stands for
     *  (a frame that was not rendered, v3 U2 / U3, adds its time but no sample); raise = false in scenes whose cost says nothing about gameplay (menus, pause). */
    feed(cost, dt, span, raise) {
      if (!(cost >= 0) || !(dt > 0) || qualityLocked) return;
      if (!(span > 0)) span = dt;
      if (this.skip > 0) { this.skip--; return; }
      this.dts.push(dt); if (this.dts.length > R_WIN) this.dts.shift();
      const R = this.period();
      const late = this.dts.length >= 20 && dt > LATE_RATIO * R;
      const eff = late ? Math.max(cost, dt - LATE_SHARE * R) : cost;
      this.lastR = R;
      if (late) this.lateN++;
      if (dt > 50) this.longN++;
      this.nWin++;
      this.sum += eff; this.n++; this.span += span; this.clock += span;
      this.fBuf.push(eff); this.fSpan += span;
      if (this.fSpan >= Q_FAST_WINDOW_MS) {                                // severe overload fast path (see Q_SEVERE_MS)
        const a = this.fBuf.slice().sort((x, y) => x - y), med = a[a.length >> 1], enough = a.length >= Q_FAST_MIN_FRAMES, mean = a.reduce((x, y) => x + Math.min(y, 100), 0) / a.length;
        this.fBuf.length = 0; this.fSpan = 0;
        if (enough && med > Q_SEVERE_MS && this.degrade('auto-drop-fast', mean)) return;
      }
      if (this.span < Q_WINDOW_MS) return;
      const avg = this.sum / this.n, lateFrac = this.lateN / Math.max(1, this.nWin), longN = this.longN;
      this.last = avg; this.lastLate = lateFrac; this.windows++;
      const sp = this.span;
      this.sum = 0; this.n = 0; this.span = 0; this.lateN = 0; this.nWin = 0; this.longN = 0;
      if (avg > Q_DROP_MS || lateFrac > Q_LATE_FRAC) {                      // slow on average, or one frame in ten misses its slot
        this.calm = 0;
        this.degrade('auto-drop', Math.max(avg, Q_DROP_MS * 1.01));
      } else if (avg < Q_RAISE_MS && lateFrac <= 0.02 && longN === 0) {     // calm: cheap AND on time (no frame of the window over 50 ms, at most 2 % late)
        if (raise === false) return;                                         // (the calm clock waits for a gameplay window)
        this.calm += sp;
        if (this.calm >= this.wait && quality < maxQuality) { setQuality(quality + 1, 'auto-raise'); this.lastRaise = this.clock; this.calm = 0; }
        else if (this.calm >= this.wait && kCap < Infinity) { const hk = higherK(kCap); setKCap(hk >= kNat ? Infinity : hk, 'auto-raise-res'); this.lastRaise = this.clock; this.calm = 0; this.skip = Q_SKIP_FRAMES; }
        else if (this.calm >= 6 * Q_RAISE_AFTER_MS) this.wait = Q_RAISE_AFTER_MS;
      } else this.calm = 0;
    },
    state() { return { quality, locked: qualityLocked, windowAvgMs: this.last, lateFrac: this.lastLate, periodMs: this.lastR, windows: this.windows, calmMs: this.calm, raiseWaitMs: this.wait, pendingMs: this.span, kCap: kCap === Infinity ? null : kCap, kNat, k: K, log: qualityLog.slice() }; },
  };

  /** prefers-reduced-motion -> Game.setOptions({ reducedMotion }) and the scenes' own motion (ambient count, no flashes). `reducedOverride` (a test hook) wins. */
  function syncMotion() {
    const was = reducedMotion;
    reducedMotion = reducedOverride !== null ? !!reducedOverride : !!(motionMq && motionMq.matches);
    if (reducedMotion !== was) pushOptions();
  }
  function watchMotion() {
    try {
      motionMq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
      if (motionMq) { if (motionMq.addEventListener) motionMq.addEventListener('change', syncMotion); else if (motionMq.addListener) motionMq.addListener(syncMotion); }
    } catch (e) { motionMq = null; }
    syncMotion();
    pushOptions();
  }

  // ===================================================================================================
  // Render + loop
  // ===================================================================================================
  const costs = new Float32Array(240);                  // update + render + post FX of the last 240 frames (ms) -> _main.perf()
  let costI = 0, costN = 0;

  /** Post FX (bloom, vignette, grain) over the finished frame at the current quality level (0 = off). Feature-detected. */
  function postFX() {
    if (quality <= 0 || typeof GFX.postFX !== 'function') return;
    try { GFX.postFX(ctx, quality); } catch (e) { reportError('postFX', e); }
  }

  function render() {
    renderCount++;
    ctx.setTransform(K, 0, 0, K, 0, 0);                  // every frame: scenes and Game draw in LOGICAL units (256 x 224)
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = true;
    try {
      scenes[scene].render();
      drawOverlays();
      if (fadeIn > 0) { ctx.fillStyle = rgba(3, 6, 16, fadeIn / FADE_IN_FRAMES); ctx.fillRect(0, 0, C.W, C.H); }
    } finally { postFX(); }
  }

  /** Run fn; on a throw log once and report failure to the caller. */
  function guarded(label, fn) {
    try { fn(); return true; } catch (e) { reportError(label + ' [' + scene + ']', e); return false; }
  }

  /** How many fixed updates may pass between two renders of the current scene (v3 U2 / U3): 1 = every update (the default), N = static scenes (a how-to page, the scores, the
   *  idle title after its intro: 20 fps), 0 = never until something changes (a paused game behind the click-to-resume overlay, or while the page is not live). A render with
   *  no update before it is a bit-identical frame and never happens (a 120 Hz display costs what a 60 Hz one does). Anything that can change the picture sets `dirty`. */
  function renderEvery() {
    if (sceneT < activeUntil) return 1;                                // a touch / key a moment ago: stay responsive
    if (scene === 'play') return !paused ? 1 : (focusUp() || isHeld()) ? 0 : PAUSE_EVERY;
    if (scene === 'title') return scenes.title.settled() ? STATIC_EVERY : 1;
    if (scene === 'howto' || scene === 'scores') return STATIC_EVERY;
    return 1;
  }
  const focusUp = () => !!(focusEl && !focusEl.hidden);

  /** The display's refresh period, learnt from IDLE frames (v3 U1): animation frames that rendered nothing (a static scene, a duplicate on a fast display) arrive at the display's
   *  refresh period unless the frame before them was still busy; over 90 of them the shortest cadence is that period. A display that really runs at a lower rate (30 Hz power
   *  saving) must not look "late" to the ladder, so R may grow up to that period; an overloaded 60 Hz one still shows 16.7 ms between most idle frames and keeps the normal R.
   *  Re-evaluated every 90 samples (a power-saving mode can be switched on or off at any time). */
  const idleDts = [], idleLast = { n: 0, lo: 0, med: 0 };
  function watchRefresh(idle, dt) {
    if (!idle || frozen || isHeld() || !(dt >= 2 && dt < 100)) return;
    idleDts.push(dt);
    if (idleDts.length < 90) return;
    const a = idleDts.slice().sort((x, y) => x - y), lo = a[a.length >> 3], med = a[a.length >> 1];
    idleDts.length = 0; idleLast.n++; idleLast.lo = lo; idleLast.med = med;
    if (med <= lo * 1.12) { refreshMs = med; autoQ.rMax = med > R_MAX_DEFAULT * 1.15 ? Math.min(45, med * 1.08) : R_MAX_DEFAULT; }     // (a consistent cadence: its period is the refresh period)
  }

  function frame(now) {
    requestAnimationFrame(frame);
    lastRaf = performance.now();
    if (holds.has('stall')) release('stall');
    if ((window.devicePixelRatio || 1) !== layout.dpr) fit();           // zoom / monitor change without a resize event we heard
    const dt = Math.min(now - last, 250);
    last = now;
    const c0 = performance.now();
    let ok = true, steps = 0;
    frameStats.rafs++;
    if (frozen) acc = 0;
    else {
      acc += dt;
      while (acc >= STEP_MS && steps < MAX_CATCHUP) {
        ok = guarded('update', () => tick(true)) && ok;
        acc -= STEP_MS; steps++;
      }
      if (steps === MAX_CATCHUP) acc = 0;                 // drop the backlog after a long stall
    }
    frameStats.updates += steps;
    sinceRender += steps;
    pendingSpan += dt;
    // render at most once per fixed update, and only as often as the scene needs (see renderEvery)
    let rate = 1, due = frozen || dirty;
    if (!due && sinceRender > 0) { rate = renderEvery(); due = rate > 0 && sinceRender >= rate; if (!due) frameStats.skippedStatic++; }
    else if (!due) frameStats.skippedDup++;
    watchRefresh(!due, dt);
    if (due) {
      ok = guarded('render', render) && ok;
      sinceRender = 0; dirty = false; lastRenderAt = c0; frameStats.renders++;
      const cost = performance.now() - c0;
      costs[costI] = cost; costI = (costI + 1) % costs.length; if (costN < costs.length) costN++;
      // the ladder sees the frame the player sees: its real interval counts, not only the JS cost (U1). Scenes that run below full rate say nothing about gameplay: not fed.
      if (!frozen && !isHeld() && rate === 1 && !(scene === 'play' && paused) && sceneT >= SCENE_SETTLE) autoQ.feed(cost, dt, pendingSpan, scene === 'play' && !paused);
      pendingSpan = 0;
    }
    syncSoundButton();
    failStreak = ok ? 0 : failStreak + 1;
    if (failStreak >= FAIL_LIMIT && scene !== 'title') {   // soft-lock guard
      failStreak = 0;
      guarded('recover', () => gotoScene('title'));
    }
  }

  // ===================================================================================================
  // Canvas scaling / layout
  // ===================================================================================================
  const cssNum = (v) => parseFloat(v) || 0;
  // Controls (portrait): 10 px padding + PAUSE/SOUND row + gap + the four big buttons + bottom padding (template.html)
  const CTRL_OVERHEAD = 10 + PILL_H + ROW_GAP + CTRL_PAD;

  const quantK = (x) => U.clamp(Math.round(x / K_STEP) * K_STEP, K_MIN, K_MAX);
  const floorK = (x) => U.clamp(Math.floor(x / K_STEP + 1e-6) * K_STEP, K_MIN, K_MAX);
  // The bake scales of GFX (10_gfx.js BUCKETS; all are multiples of 0.25). At exactly such a k the baked world canvases (level, background)
  // and sprites are blitted 1:1; any other k makes every one of those blits a resampling, which a software rasteriser pays for (~2 ms each).
  const GFX_BUCKETS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 8];
  /** Scale for the free space: sAvail = css px per logical px that would exactly fill it. The backing store is 256k x 224k with k = css size x
   *  devicePixelRatio / 256 quantised to 0.25 steps (clamp 1..8). Whenever a whole step of device pixels costs little of the free space the
   *  picture is fitted to it: exactly 1 backing px per device px, perfectly crisp (first choice: a GFX bake scale, <= 8 % smaller; then any
   *  0.25 step, <= 6.5 % smaller). Otherwise it fills the space and the browser resamples smoothly from the nearest step (never more than ~6 %
   *  off, except at k 8 on very large screens). */
  function pickScale(sAvail, dpr) {
    const s = Math.max(sAvail, 0.05), kRaw = s * dpr;
    if (kRaw >= K_MIN) {
      let kb = 0;
      for (const b of GFX_BUCKETS) if (b <= kRaw + 1e-6) kb = b;
      if (kb >= kRaw * (1 - BUCKET_TOL)) return { s: kb / dpr, k: kb, snapped: true };
      const kf = floorK(kRaw);
      if (kf >= kRaw * (1 - SNAP_TOL)) return { s: kf / dpr, k: kf, snapped: true };
    }
    return { s, k: quantK(kRaw), snapped: false };
  }

  const scaleLog = [];                                  // every k handed to GFX.setScale (tests)
  let scaleSent = false;
  /** Size the backing store to 256k x 224k and tell GFX when k changed. Returns true when the canvas was resized (which clears it). */
  function applyScale(k) {
    const w = Math.round(C.W * k), h = Math.round(C.H * k);
    let resized = false;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; resized = true; dirty = true; }
    if (k !== K || !scaleSent) {
      K = k; scaleSent = true;
      scaleLog.push(k); if (scaleLog.length > 200) scaleLog.shift();
      dropStatics();
      try { if (typeof GFX.setScale === 'function') GFX.setScale(K); } catch (e) { reportError('GFX.setScale', e); }
    }
    return resized;
  }

  function fit() {
    if (!canvas) return;
    const root = rootEl || document.documentElement;
    const cs = getComputedStyle(root);                      // the Artifact skeleton pads :root by the safe-area insets
    const padL = cssNum(cs.paddingLeft), padR = cssNum(cs.paddingRight), padT = cssNum(cs.paddingTop), padB = cssNum(cs.paddingBottom);
    const padX = padL + padR, padY = padT + padB;
    const vw = window.innerWidth || root.clientWidth || C.W;
    const vh = window.innerHeight || root.clientHeight || C.H;
    // The fixed side pads (landscape / overlay) sit inside the same padding the canvas is sized from, whichever mechanism the host
    // uses for safe areas (R3); the portrait page is exactly as tall as the padded viewport so its controls rest at the bottom (K2).
    root.style.setProperty('--pad-l', padL + 'px'); root.style.setProperty('--pad-r', padR + 'px');
    root.style.setProperty('--pad-t', padT + 'px'); root.style.setProperty('--pad-b', padB + 'px');
    root.style.setProperty('--page-h', Math.max(0, vh - padY) + 'px');
    const dpr = window.devicePixelRatio || 1;
    const baseW = Math.max(64, vw - padX - 2 * GUTTER), baseH = Math.max(56, vh - padY - 2 * V_PAD);
    const fill = (kMax) => ({ s: Math.max(kMax, 0.05) });      // the achievable css scale (continuous: no pixel-grid steps any more)
    let mode = 'desk', pick, showLegend = false, btnW = 0, btnH = 0, minBtnH = 0;
    root.classList.toggle('touch', touchMode);                // first: the measurements below need the touch UI to be displayed

    if (!touchMode) {
      let hLeg = 0;
      if (legendEl) { legendEl.hidden = false; hLeg = legendEl.offsetHeight + LEGEND_GAP; }
      const withLeg = fill(Math.min(baseW / C.W, (baseH - hLeg) / C.H)), without = fill(Math.min(baseW / C.W, baseH / C.H));
      showLegend = !!legendEl && withLeg.s >= without.s * LEGEND_KEEP - 1e-6;   // the legend stays while it costs the picture at most 14 % (it repeats the H page)
      pick = showLegend ? withLeg : without;
      if (legendEl) legendEl.hidden = !showLegend;
    } else {
      if (legendEl) legendEl.hidden = true;
      // (a) portrait stack: picture on top, PAUSE/SOUND row and the four big buttons directly below
      btnW = U.clamp(Math.floor((baseW - 2 * BTN_GAP - PAD_SPREAD) / 4), 44, BTN_MAX_W);
      minBtnH = Math.min(btnW, 64);
      const port = fill(Math.min(baseW / C.W, (baseH - CTRL_OVERHEAD - minBtnH) / C.H));
      // (b) landscape: pads at both sides of the picture
      const btnL = U.clamp(Math.floor(vh * 0.16), 44, 64);
      const reserve = 2 * btnL + BTN_GAP + 12 + 12;
      const land = vw >= LAND_MIN_VW ? fill(Math.min((vw - padX - 2 * reserve) / C.W, baseH / C.H)) : null;
      mode = land && land.s >= port.s - 1e-6 ? 'land' : 'port';
      pick = mode === 'land' ? land : port;
      // (c) too small for either: translucent pads over the picture's margins
      if (pick.s < 1) {
        const over = fill(Math.min((vw - padX - 16) / C.W, baseH / C.H));
        if (over.s > pick.s * 1.05) { mode = 'over'; pick = over; }
      }
      const sideMode = mode !== 'port';
      root.classList.toggle('land', sideMode);
      root.classList.toggle('over', mode === 'over');
      if (sideMode) { btnW = btnH = btnL; }
      root.style.setProperty('--btn-w', btnW + 'px');
      if (sideMode) root.style.setProperty('--btn-h', btnH + 'px');
      if (mode === 'land' && touchEl) {                       // measure the real side reserves (safe-area insets) and refit once
        const L = touchEl.querySelector('.left'), R = touchEl.querySelector('.right');
        const lr = L ? L.getBoundingClientRect() : null, rr = R ? R.getBoundingClientRect() : null;
        if (lr && rr && lr.width > 0 && rr.width > 0) {
          const res = Math.max(lr.right - padL, (vw - padR) - rr.left) + 12;
          if (res < vw / 2 && Math.abs(res - reserve) > 0.5) {
            const again = fill(Math.min((vw - padX - 2 * res) / C.W, baseH / C.H));
            if (again.s <= pick.s) pick = again;
          }
        }
      }
    }
    if (!touchMode) { root.classList.remove('land'); root.classList.remove('over'); }

    const snap0 = pickScale(pick.s, dpr);                     // crisp 1:1 fit when cheap, else fill + smooth resample
    kNat = snap0.k;
    const snap = snap0.k > kCap ? { s: snap0.s, k: kCap, snapped: false } : snap0;      // resolution lever: same css size, fewer backing pixels
    let gapTop = 0;
    if (touchMode && mode === 'port') {                       // the leftover height goes to the big buttons, then (V4) half of the rest above the picture, half between the PAUSE / SOUND strip and the pads
      const left = Math.floor(baseH - C.H * snap.s - CTRL_OVERHEAD);
      btnH = U.clamp(left, minBtnH, BTN_MAX_H);
      root.style.setProperty('--btn-h', btnH + 'px');
      gapTop = left > btnH ? Math.round((left - btnH + ROW_GAP) * GAP_TOP_SHARE) : 0;   // (the strip's own 10 px gap to the pads belongs to the lower gap)
    }
    root.style.setProperty('--gap-top', gapTop + 'px');
    const cssW = +(C.W * snap.s).toFixed(3), cssH = +(C.H * snap.s).toFixed(3);
    const resized = applyScale(snap.k);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    layout = {
      scale: cssW / C.W, w: cssW, h: cssH, vw, vh, dpr, touch: touchMode, land: mode === 'land' || mode === 'over', mode,
      sharp: false, m: snap.k, k: snap.k, kNat, snapped: snap.snapped, backW: canvas.width, backH: canvas.height, legend: showLegend, btnW, btnH, availW: baseW, availH: baseH,
    };
    watchDpr();
    root.classList.add('fp');                                // the page's pre-script geometry (template.html, U10) hands over to the measured one
    dirty = true;
    if (resized && sceneReady && scenes[scene]) guarded('render', render);    // a resize clears the canvas: repaint now (also while the loop is frozen)
  }

  /** devicePixelRatio changes (browser zoom, moving the window to another monitor) do not always fire `resize`: watch the resolution media query. */
  let dprWatched = 0;
  function watchDpr() {
    const d = window.devicePixelRatio || 1;
    if (!window.matchMedia || dprWatched === d) return;
    try {
      if (dprMq && dprMq.removeEventListener) dprMq.removeEventListener('change', onDprChange);
      dprMq = window.matchMedia('(resolution: ' + d + 'dppx)');
      if (dprMq.addEventListener) dprMq.addEventListener('change', onDprChange); else if (dprMq.addListener) dprMq.addListener(onDprChange);
      dprWatched = d;
    } catch (e) { dprMq = null; }
  }
  function onDprChange() { dprWatched = 0; fit(); }

  // ===================================================================================================
  // Boot
  // ===================================================================================================
  /** Look the page elements up (cheap; also needed for the very first sizing). */
  function findDom() {
    const byId = (id) => document.getElementById(id);
    rootEl = document.documentElement;
    legendEl = byId('legend');
    touchEl = byId('touch');
    focusEl = byId('focus');
    soundBtn = touchEl ? touchEl.querySelector('[data-k="sound"]') : null;
    try { coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); } catch (e) { coarse = false; }
    touchMode = coarse;
  }

  function bindDom() {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', () => { fit(); setTimeout(fit, 250); });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);
    document.addEventListener('visibilitychange', () => { if (document.hidden) hold('hidden'); else release('hidden'); });
    window.addEventListener('pointerdown', beforeGesture, true);
    window.addEventListener('pointerup', unlockAudio, true);
    window.addEventListener('touchend', unlockAudio, true);
    document.addEventListener('gesturestart', (e) => e.preventDefault());      // iOS Safari pinch zoom (Ut1)
    window.addEventListener('gamepadconnected', (e) => {
      if (usablePad(e.gamepad)) { padSeen = true; toast('PAD READY', COL.green); }
    });
    canvas.addEventListener('pointerdown', onCanvasPointer);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    bindTouchControls();
    watchDpr();
    watchMotion();
    if (focusEl) {
      focusEl.addEventListener('pointerdown', (e) => { e.preventDefault(); });
      focusEl.addEventListener('click', dismissFocus);
      focusEl.addEventListener('keydown', (e) => { if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); dismissFocus(); } });
      setInterval(() => { healBlur(BLUR_HEAL_MS); updateFocusOverlay(); }, 500);   // also catches focus changes that fire no event (iframes), and a blur nobody followed with a focus
      updateFocusOverlay();
    }
    // The host hid / scrolled away the iframe (no blur, no visibilitychange): pause like a blur (U1).
    if (typeof IntersectionObserver === 'function') {
      try {
        new IntersectionObserver((entries) => {
          const e = entries[entries.length - 1];
          if (e.isIntersecting) release('offscreen'); else hold('offscreen');
        }, { threshold: [0, 0.05] }).observe(canvas);
      } catch (e) { /* ignore */ }
    }
    // ... or throttled it to a halt: no animation frame for 700 ms (+ a 250 ms second look, so a long main-thread hitch is not mistaken for it).
    setInterval(() => {
      if (holds.has('stall') || performance.now() - lastRaf <= STALL_MS) return;
      setTimeout(() => { if (performance.now() - lastRaf > STALL_MS + 200) hold('stall'); }, 250);
    }, 500);
  }

  function installHooks() {
    const ready = (fn) => (...a) => { finishBoot(); return fn(...a); };         // the hooks exist at once and finish the boot on first use
    const hooks = {
      Game, GFX, AUDIO, LEVELS, C, U,
      scene: () => scene,
      goto(name, args) {
        if (name === 'pause') setPaused(true);
        else gotoScene(name, args);
        render();
      },
      input: {
        set(pi, o) { Object.assign(virt[pi === 1 ? 1 : 0], o || {}); },
        clear() { virt[0] = Object.assign(virt[0], blankVirt()); virt[1] = Object.assign(virt[1], blankVirt()); },
      },
      freeze(b) { frozen = !!b; acc = 0; },
      step(n) {
        const count = n === undefined ? 1 : n | 0;
        for (let i = 0; i < count; i++) tick(false);
        render();
      },
      start(players, level, seed) {
        gotoScene('play', { players: players === 2 ? 2 : 1, level: level || 1, seed: seed === undefined ? 1 : seed });
        render();
      },
      // ---- extras, not part of the contract --------------------------------------------------------------
      _main: {
        layout: () => ({ ...layout }),
        fit,
        paused: () => paused,
        setPaused: (b) => setPaused(!!b),
        holds: () => Array.from(holds),
        scores: () => loadScores().map((s) => ({ ...s })),
        resetScores: () => { scoresCache = null; U.store.set('scores', null); },
        session: () => ({ ...session }),
        toast,
        touchMode: () => touchMode,
        touchOnly: () => touchOnly(),
        sceneTime: () => sceneT,
        entry: () => scenes.entry.debug(),
        padSlots: () => Array.from(padSlot.entries()),
        rows: () => (scenes[scene].rows ? scenes[scene].rows() : null),
        confirmQuit: () => confirmQuit,
        ambient: () => ({ shown: ambient.shown(), avoid: lastAvoid.map((r) => r.slice()) }),   // K1: the last layered frame's exclusion rectangles
        endingBand: () => scenes.ending.band(),
        howtoPage: () => scenes.howto.page(),
        howtoNav: () => scenes.howto.navZone(),                // v3 U13: the touch BACK zone { top, backX1, h } in logical px
        ambientReset: () => ambient.reset(),
        persistent: () => storagePersistent(),
        // ---- v2: render scale, quality, reduced motion -----------------------------------------------------
        k: () => K,                                          // current render scale (output px per logical px)
        scaleLog: () => scaleLog.slice(),                    // every k handed to GFX.setScale, in order
        quality: () => quality,                              // current post FX / particle level 0..2
        setQuality: (q, lock) => { qualityLocked = !!lock; return setQuality(q, 'hook'); },   // lock = true freezes auto quality (tests that compare pixels)
        autoQuality: () => autoQ.state(),                    // { quality, windowAvgMs, calmMs, raiseWaitMs, log, ... }
        autoQualityFeed: (cost, dt, span, raise) => { autoQ.feed(cost, dt, span, raise); return quality; },   // simulate frames: cost ms of work per frame, dt ms between frames (span / raise: see autoQ.feed)
        frameStats: () => ({ ...frameStats, sinceRender, dirty, rate: renderEvery(), rMax: autoQ.rMax, refreshMs, idle: { ...idleLast, pending: idleDts.length } }),   // v3: how many rAFs ran, updates ran, frames were rendered / skipped (U2, U3)
        calibration: () => (calib ? JSON.parse(JSON.stringify(calib)) : null),   // v3 U4: what the start-up micro-benchmark measured and picked
        invalidate: () => { dirty = true; },
        autoQualityReset: () => { qualityLocked = false; autoQ.reset(); autoQ.dts.length = 0; autoQ.wait = Q_RAISE_AFTER_MS; autoQ.lastRaise = -1e9; autoQ.skip = 0; autoQ.clock = 0; qualityLog.length = 0; setKCap(Infinity, 'reset'); },
        setKCap: (c) => { setKCap(c === null || c === undefined ? Infinity : +c, 'hook'); return K; },   // resolution lever (tests): cap on k, null = off
        reducedMotion: () => reducedMotion,
        setReducedMotion: (b) => { reducedOverride = b === null || b === undefined ? null : !!b; syncMotion(); return reducedMotion; },   // null = follow the OS again
        options: () => ({ reducedMotion, quality, k: K }),
        perf: () => {                                        // update + render + post FX per frame (ms), last <= 240 frames
          const a = Array.from(costs.subarray(0, costN)).sort((x, y) => x - y);
          const n = a.length;
          return { n, avg: n ? a.reduce((s, v) => s + v, 0) / n : 0, p95: n ? a[Math.min(n - 1, Math.floor(n * 0.95))] : 0, max: n ? a[n - 1] : 0 };
        },
        renderNow: () => { render(); },
        bigHeroes: () => ({ px: bigHeroes.px(), count: bigHeroes.count(), viaGFX: typeof GFX.drawHero === 'function' }),   // v3 V11: count = big-twin draws so far (GFX bakes and caches them)
      },
    };
    for (const k of ['scene', 'goto', 'freeze', 'step', 'start']) hooks[k] = ready(hooks[k]);
    for (const k of Object.keys(hooks._main)) if (typeof hooks._main[k] === 'function') hooks._main[k] = ready(hooks._main[k]);
    Object.defineProperty(hooks, 'quality', { enumerable: true, get: () => quality });   // SPEC_V2 sec. 1: the current level is readable on __fizzpop
    Object.defineProperty(hooks, 'bootMs', { enumerable: true, get: () => bootMs });      // ms since navigation start of the first title paint (-1 before it); loadingMs = the LOADING frame
    Object.defineProperty(hooks, 'loadingMs', { enumerable: true, get: () => loadingMs });
    Object.defineProperty(hooks, 'bootProfile', { enumerable: true, get: () => ({ ...bootProf }) });
    window.__fizzpop = hooks;
  }

  /** First paint: a LOADING frame (GFX.init and the first scene's bakes can block the main thread for 100-600 ms on a weak phone). Drawn at the
   *  final resolution with the stroke font; a plain fallback keeps it working without GFX. */
  function drawLoading() {
    ctx.setTransform(K, 0, 0, K, 0, 0);
    ctx.fillStyle = COL.void;
    ctx.fillRect(0, 0, C.W, C.H);
    const g = ctx.createRadialGradient(128, 108, 2, 128, 108, 110);
    g.addColorStop(0, 'rgba(60,242,255,0.18)'); g.addColorStop(1, 'rgba(60,242,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, C.W, C.H);
    ctx.fillStyle = 'rgba(60,242,255,0.5)';
    ctx.fillRect(80, 124, 96, 1.2 / K);
    let ok = false;
    try { GFX.text(ctx, 'LOADING', 128, 104, COL.text, { align: 'center', scale: 2 }); ok = true; } catch (e) { ok = false; }   // (scale 2: legible on a phone, U10)
    if (!ok) {
      ctx.fillStyle = '#8eeaff'; ctx.font = '8px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('LOADING', 128, 112);
    }
  }

  /** Start-up calibration (v3 U4): how fast is THIS device's raster path? A reference-size canvas gets full-frame additive blits (the operation that dominates a busy frame on a
   *  software rasteriser and on a weak GPU) with one read-back to wait for the raster / GPU; the best of a few runs predicts the busy-frame cost of every ladder state
   *  (CAL_RATIO x the blit, fill ~ k^2). The best state that fits CAL_BUDGET_MS becomes the starting point: a phone starts at the k / quality it can sustain instead of spending
   *  its first seconds at 100+ ms frames while the ladder walks down (each step an extra re-bake). The ladder stays the fine tuner. Costs 5..60 ms (hard cap CAL_MAX_MS). */
  function calibrate() {
    const t0 = performance.now(), c = { probeMs: 0, runs: 0, ms: 0, k: K, kNat: K, quality, kCap: null, pred: [] };
    calib = c;
    try {
      const src = document.createElement('canvas'), dst = document.createElement('canvas');
      src.width = dst.width = CAL_REF_W; src.height = dst.height = CAL_REF_H;
      const sg = src.getContext('2d'), g = dst.getContext('2d');
      sg.fillStyle = 'rgba(30,60,90,0.5)'; sg.fillRect(0, 0, CAL_REF_W, CAL_REF_H);
      g.globalCompositeOperation = 'lighter';
      const run = (n) => { const a = performance.now(); for (let i = 0; i < n; i++) g.drawImage(src, 0, 0); g.getImageData(0, 0, 1, 1); return (performance.now() - a) / n; };
      run(1);                                                          // warm-up: canvas creation, first raster
      const xs = [];
      for (let i = 0; i < 4 && (i < 2 || performance.now() - t0 < CAL_MAX_MS); i++) { xs.push(run(4)); c.runs++; }
      xs.sort((a, b) => a - b);
      src.width = src.height = dst.width = dst.height = 1;
      c.probeMs = xs[0];                                              // the best of four: other work on the machine only ever makes a run slower
    } catch (e) { c.probeMs = 0; }
    if (c.probeMs > 0 && !qualityLocked) {
      const pred = (q, k) => CAL_RATIO[q] * c.probeMs * (k / 2) * (k / 2);
      c.pred = [0, 1, 2].map((q) => +pred(q, K).toFixed(2));
      let q = quality;
      while (q > 0 && pred(q, K) > CAL_BUDGET_MS * (coarse ? 1 : 2)) q--;       // (a desktop only gives up quality when the prediction is more than twice the budget: a noisy start-up measurement must not cost it its bloom)
      let cap = Infinity;
      // even quality 0 is too slow at this k: render smaller (the css size stays, the browser upscales). A phone does that on the first sign of it; a desktop (fine pointer) only
      // when the prediction is far over budget (a big canvas on a weak machine): a CPU rasteriser at k 6..8 is slow but not unusable, and the ladder trims it within a second anyway.
      if (pred(0, K) > CAL_BUDGET_MS * (coarse ? 1 : CAL_FINE_SLACK)) {
        const want = K * Math.sqrt(CAL_BUDGET_MS / pred(0, K));
        let b = 0; for (const g of GFX_BUCKETS) if (g <= want + 1e-6 && g >= K_CAP_MIN) b = g;
        cap = Math.min(b || K_CAP_MIN, K);
        if (!(cap < K)) cap = Infinity;
      }
      if (q !== quality) setQuality(q, 'calibrate');
      if (cap < Infinity) setKCap(cap, 'calibrate');
      c.quality = quality; c.kCap = cap === Infinity ? null : cap; c.k = K;
    }
    c.ms = +(performance.now() - t0).toFixed(1);
    return c;
  }

  const bootProf = {};                                          // ms per boot phase (diagnostics: __fizzpop.bootProfile)
  /** (v3 regression wave) Pre-bake the twin frames the title walks through. GFX bakes a big hero per (pose, frame, scale) on its FIRST draw, and the title shows 34 distinct ones in its
   *  first ~8 s (Fizz idle x8 + blink x8 + puff + shoot, Pop idle x8 + blink x8 = 34 bakes): on a 4x-throttled phone each lazy bake lands inside a title frame as a 45-75 ms frame (measured with
   *  the rAF recorder: 8 spikes in 1.5-3.7 s, 4 more up to 7.7 s). They are drawn once into a 1x1 scratch canvas, two per timer task (a bake is ~1.5 ms; requestIdleCallback is starved
   *  by the title's own frames on a throttled phone, so a short timer chain is used: 17 tasks, the first 200 ms after the boot, never while the tab is hidden); whatever is not
   *  baked yet when the title needs it is still baked lazily, exactly as before. Needs GFX.drawHero (the stub modules of some tests do not have it: no-op). */
  function warmTwins() {
    if (typeof GFX.drawHero !== 'function') return;
    const jobs = [];                                                                    // in the order the title needs them: idle breathing of both twins (Pop runs 3 frames ahead), then the blinks, then Fizz's puff + shoot
    for (let i = 1; i <= 8; i++) { jobs.push(['fizz', 'idle', i % 8, 8]); jobs.push(['pop', 'idle', (i + 3) % 8, 8]); }
    for (let f = 0; f < 8; f++) { jobs.push(['pop', 'blink', f, 8]); jobs.push(['fizz', 'blink', f, 8]); }
    jobs.push(['fizz', 'puff', 0, 8]); jobs.push(['fizz', 'shoot', 0, 8]);                  // (the title passes 8 frames for these single-frame poses too: same cache key)
    let sc = null;
    try { const c = document.createElement('canvas'); c.width = 1; c.height = 1; sc = c.getContext('2d'); } catch (e) { return; }
    if (!sc) return;
    const S = touchMode ? 2.0 : 3.0;
    const step = () => {
      if (!jobs.length) return;
      if (!document.hidden) { try { for (let n = 0; n < 2 && jobs.length; n++) { const j = jobs.shift(); GFX.drawHero(sc, j[0], 0, 0, S, 0, { pose: j[1], frame: j[2], frames: j[3] }); } } catch (e) { jobs.length = 0; return; } }
      if (jobs.length) setTimeout(step, document.hidden ? 500 : 16);                    // (a hidden tab only polls twice a second until it is shown again)
    };
    setTimeout(step, 200);
  }

  function finishBoot() {
    if (bootDone) return;
    bootDone = true;
    let t0 = performance.now();
    const lap = (name) => { const n = performance.now(); bootProf[name] = Math.round((n - t0) * 10) / 10; t0 = n; };
    calibrate();
    lap('calibrate');
    try { GFX.init(); } catch (e) { reportError('GFX.init', e); }
    lap('gfxInit');
    bindDom();
    fit();
    pushOptions();
    lap('bindAndFit');
    gotoScene('title');
    sceneReady = true;
    lap('enterTitle');
    render();
    lap('firstRender');
    bootMs = Math.round(performance.now());
    last = lastRaf = performance.now();
    requestAnimationFrame(frame);
    requestAnimationFrame(() => requestAnimationFrame(fit));   // re-measure once fonts / layout settled
    try { warmTwins(); } catch (e) { reportError('warmTwins', e); }
  }

  function boot() {
    if (booted) return;
    booted = true;
    canvas = document.getElementById('screen');
    ctx = vctx = canvas.getContext('2d', { alpha: false });
    findDom();
    quality = coarse ? 1 : 2;                                   // SPEC_V2 sec. 1: start at 1 on coarse-pointer devices, 2 elsewhere
    fit();                                                       // size the backing store (k) and tell GFX before the first paint
    drawLoading();
    loadingMs = Math.round(performance.now());
    installHooks();
    requestAnimationFrame(() => setTimeout(finishBoot, 0));    // let the LOADING frame reach the screen first ...
    setTimeout(finishBoot, 400);                                // ... but a hidden tab never runs rAF
  }

  return { boot };
})();
Main.boot();
