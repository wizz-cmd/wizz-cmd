(() => { "use strict";

/* ===== 00_shared.js ===== */
/* FIZZ & POP — 00_shared.js
 * Shared constants (C) and utilities (U). Contract: SPEC §2.4.
 *
 * Design notes:
 *  - C is frozen; every module may use C and U at load time.
 *  - U.rng is mulberry32: tiny, fast, good enough for gameplay randomness, fully
 *    deterministic for a given 32-bit seed (needed for reproducible test runs).
 *  - U.store wraps localStorage. EVERY access is inside try/catch (private windows,
 *    sandboxed iframes and blocked site data all throw). When storage is unusable we
 *    fall back to an in-memory Map so the game keeps working for the session.
 *    Values are JSON-encoded; a corrupt entry yields the fallback, never an exception.
 */
const C = Object.freeze({
  W: 256, H: 224, TILE: 8, COLS: 32, ROWS: 26, MAP_Y: 16, FPS: 60,
  INNER_L: 16, INNER_R: 240,            // x bounds inside the outer walls
  STORE_PREFIX: 'fizzpop.v1.',
});

const U = (() => {
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

  /** Move v toward target by at most step (step is treated as a magnitude). */
  const approach = (v, target, step) => {
    step = Math.abs(step);
    if (v < target) return Math.min(v + step, target);
    if (v > target) return Math.max(v - step, target);
    return target;
  };

  /** Axis-aligned rectangle overlap (touching edges do NOT overlap). */
  const overlap = (ax, ay, aw, ah, bx, by, bw, bh) =>
    ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah;

  /** mulberry32 seeded PRNG. Same seed -> same sequence, always. */
  const rng = (seed) => {
    let s = (seed === undefined || seed === null || Number.isNaN(+seed) ? 1 : +seed) >>> 0;
    const next = () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      next,
      /** Integer in [a, b], both inclusive. */
      int: (a, b) => {
        if (b === undefined) { b = a; a = 0; }
        if (b < a) { const t = a; a = b; b = t; }
        return a + Math.floor(next() * (b - a + 1));
      },
      /** Float in [a, b). */
      float: (a = 0, b = 1) => a + next() * (b - a),
      /** Random element of a non-empty array (undefined for an empty one). */
      pick: (arr) => (arr.length ? arr[Math.floor(next() * arr.length)] : undefined),
      /** True with probability p. */
      chance: (p) => next() < p,
    };
  };

  /** JSON key/value store with localStorage + in-memory fallback. */
  const store = (() => {
    const mem = new Map();
    const get = (key, fallback) => {
      const k = C.STORE_PREFIX + key;
      try {
        const raw = window.localStorage.getItem(k);
        if (raw !== null && raw !== undefined) return JSON.parse(raw);
      } catch (e) { /* storage unavailable or corrupt JSON: fall through to memory */ }
      return mem.has(k) ? mem.get(k) : fallback;
    };
    const set = (key, value) => {
      const k = C.STORE_PREFIX + key;
      mem.set(k, value);                         // always mirror in memory
      try { window.localStorage.setItem(k, JSON.stringify(value)); } catch (e) { /* ignore */ }
    };
    return { get, set };
  })();

  return { clamp, lerp, sign, approach, overlap, rng, store };
})();


/* ===== 09_neon.js ===== */
/* FIZZ & POP v2.0 - 09_neon.js  ->  const NEON
 * "Abyss Glow" drawing primitives, ported 1:1 from the approved mockup (concepts/c_abyss_glow/parts/*.js) with the SAME
 * names and signatures, plus small bounded caches. Pure Canvas 2D, resolution independent, no game knowledge, no DOM access
 * at load time (canvases are created lazily inside the functions that need them), no assets, no network.
 *
 * Conventions (read once, they apply to every export below)
 *  - Colours are [r,g,b] arrays, 0..255 (floats allowed), NEVER CSS strings. rgba(c, a) turns one into a CSS string.
 *    Use parseColor(css) / toHex(c) to convert at the edges. The palette arrays are frozen: mixc/hot return NEW arrays.
 *  - Every widths/radius/position argument is in the units of the CURRENT canvas transform (ctx.setTransform(k,0,0,k,0,0)
 *    before calling => units are logical px; identity => output px). Nothing here reads or sets a transform of its own
 *    except inside its own ctx.save()/restore() pair, so the caller's state is always preserved.
 *  - Light is additive: neon/body(rim, highlights)/glow/dot/sparkle composite with globalCompositeOperation 'lighter'
 *    inside save()/restore(). Path arguments are Path2D objects (use poly/spline/... to build them).
 *  - Sprites are authored in a 16x16-unit box facing RIGHT (Kraken 48x48); lwFor(k) gives the stroke width in those
 *    units that renders as an elegant ~1..2.6 output-px line at bake scale k (output px per unit).
 *  - Caches are bounded (LRU): at most GLOW_MAX glow sprites (128x128, ~6 MB total) and SCRATCH_MAX scratch canvases.
 *    Canvases handed out by glowSprite()/scratch() are shared: never resize, clear or draw into a glow sprite; scratch
 *    canvases keep their pixels between calls unless the size changes (clear them yourself).
 *
 * EXPORTS (NEON.<name>)  -- signature : meaning
 * -- maths / colour ------------------------------------------------------------------------------------------------
 *  TAU                                    : 2*PI
 *  clamp(v, a, b)                         : v limited to [a,b]
 *  lerp(a, b, t)                          : a + (b-a)*t
 *  sstep(a, b, v)                         : smoothstep 0..1 of v between a and b
 *  hex('#rrggbb')                         : -> [r,g,b] ('#rgb' also works; for rgba()/names/alpha use parseColor)
 *  parseColor(css)                        : -> [r,g,b,a]; '#rgb' '#rgba' '#rrggbb' '#rrggbbaa' 'rgb()' 'rgba()' + a few names;
 *                                           arrays pass through (a=1); unknown -> [255,255,255,1]   (NEW helper)
 *  toHex([r,g,b])                         : -> '#rrggbb' (rounded, clamped)                           (NEW helper)
 *  mixc(a, b, t)                          : colour mix a->b by t, returns a new [r,g,b]
 *  rgba(c, a)                             : -> 'rgba(r,g,b,a)' CSS string, alpha clamped 0..1 (NaN -> 0)
 *  hot(c, t = 0.7)                        : c mixed toward WHITE by t ("white-hot" version of a colour)
 *  rng(seed)                              : seeded mulberry32 -> {next(), float(a=0,b=1), int(a,b), pick(arr), chance(p)};
 *                                           identical sequences to U.rng(seed) of 00_shared.js, but self-contained
 *  PAL                                    : the ten named hex colours {void, abyss, cyan, magenta, lime, amber, violet,
 *                                           white, ember, cobalt}   (palette.json)
 *  RGB                                    : the same as [r,g,b] arrays + crimson (#ff2a2a, angry state), purple (Kraken
 *                                           violet+42% magenta), ink (#04060d, the occluder black)
 *  WHITE                                  : RGB.white (#eaffff, the white-hot colour; never a large fill)
 *  FILM                                   : [cyan, violet, magenta, amber, cyan] thin-film colour sweep for soap bubbles
 * -- canvases / caches ---------------------------------------------------------------------------------------------
 *  makeCanvas(w, h)                       : new canvas (document.createElement, or OffscreenCanvas when there is no document)
 *  scratch(name, w, h)                    : shared named work canvas of exactly w x h (resized, then cleared, only when the
 *                                           size differs); LRU-bounded; the bloom() mip chain lives here
 *  releaseScratch(name?)                  : free one scratch canvas, or all when name is omitted  (NEW)
 *  clearCaches()                          : drop glow sprites, grain tiles and scratch canvases (e.g. on a context loss)  (NEW)
 *  stats()                                : -> {glow, glowMax, scratch, scratchMax, grain}  live cache sizes (tests)  (NEW)
 *  GLOW_MAX, SCRATCH_MAX                  : cache limits
 * -- the neon look -------------------------------------------------------------------------------------------------
 *  neon(ctx, path, col, w, o)             : THE primitive: 2 faint wide halo strokes + coloured core + white-hot centre
 *                                           line, all additive. o: {a=1, halo=1, hot=0.75, cap='round',
 *                                           grad:[x0,y0,x1,y1] (hotter at the start), gradHot=0.55}. w = core width in units.
 *  body(ctx, path, col, w, o)             : dark occluding fill (rgba 4,6,14) + hue-tinted gradient + inner rim glow, so a
 *                                           creature reads as a solid made of light. o: {a, noBack, tint, rim, x0,y0,x1,y1
 *                                           (gradient axis, default 0,0 -> 0,16), hl:[x,y,r,alpha] (soft key-light patch),
 *                                           core:[x,y,r,alpha] (inner light organ, heroes only)}. Clips to path (inside save).
 *  glowSprite(col)                        : cached 128x128 canvas with a white-hot radial falloff in col (quantised to 5 bits)
 *  glow(ctx, x, y, r, col, a, sy)         : additive soft light pool of radius r at x,y (1 drawImage); a may exceed 1
 *                                           (a second pass); sy = optional vertical squash (ellipse)
 *  dot(ctx, x, y, r, col, a, o)           : luminous dot: glow + coloured disc + white-hot core. o: {halo = 4.2 (glow radius/r)}
 *  starPath(cx, cy, r, k = 0.17)          : -> Path2D 4-point twinkle star, k = waist ratio
 *  sparkle(ctx, x, y, r, col, a, rot)     : glow + 4-point star + white pin-point, optional rotation (radians)
 *  filmGradient(ctx, x, y, rot, a, stops) : -> CanvasGradient, conic soap-film sweep through stops (default FILM) centred
 *                                           at x,y rotated by rot; linear fallback where createConicGradient is missing
 * -- path builders (all return Path2D unless noted) -----------------------------------------------------------------
 *  spline(pts, closed, tension = 0.5)     : Catmull-Rom through [[x,y],...] as cubic beziers (closed => closePath)
 *  poly(pts, closed)                      : straight polyline / polygon
 *  arcPts(cx, cy, rx, ry, a0, a1, n = 20) : -> [[x,y],...] points on an ellipse arc, angles in DEGREES (a1<a0 allowed)
 *  quadPts(p0, p1, p2, n = 10)            : -> [[x,y],...] points on a quadratic bezier
 *  circlePath(x, y, r)                    : full circle
 *  ellipsePath(x, y, rx, ry, rot)         : full ellipse, rot in radians
 *  sampleSpline(pts, perSeg = 8)          : -> dense [[x,y],...] open Catmull-Rom polyline (not a Path2D)
 *  taper(spine, wfn)                      : -> Path2D closed ribbon around a dense spine, wfn(u 0..1) = HALF width
 *  spinePath(spine)                       : open polyline Path2D of a dense spine (stroke it, e.g. for a vein)
 * -- sprite placement ----------------------------------------------------------------------------------------------
 *  lwFor(k, m = 1)                        : stroke width in sprite units for bake scale k:  m * max(0.47, 1/k)  (constant look above k ~ 1.8; >= 0.85 device px below)
 *  placeSprite(ctx, o, boxW, fn)          : save + translate(o.x (+boxW*k when o.face<0), o.y) + scale(+-k, k) + alpha o.a,
 *                                           run fn(), restore. o: {x, y (OUTPUT px of the box top-left), k, face (+1/-1), a}
 * -- creature helpers (generic, ported from the mockup's enemies; units = current transform) -----------------------------
 *  eyeBall(ctx, x, y, r, col, look, o)    : lit sclera + pupil + highlight + thin neon rim; look:[lx,ly] -1..1.
 *                                           o: {a, hotEye=0.84, slit (cat pupil), pupil=0.55, w (rim width)}
 *  brow(ctx, x, y, r, dir, w, col)        : angry slanted brow bar over an eye of radius r at x,y; dir = +1/-1 (which side)
 *  steam(ctx, x, y, t, w, col, n = 3)     : n rising steam wisps with glow, animated by t (seconds); x,y = origin
 *  heat(ctx, t, col, cx, cy, r)           : pulsing heat halo (glow) animated by t
 *  gearPath(cx, cy, R, r, teeth, rot)     : -> Path2D cog outline (outer R, root r), rot in radians
 * -- post: bloom + grain -------------------------------------------------------------------------------------------
 *  bloom(ctx, W, H, o)                    : soft bloom of the ctx's own pixels: bright-pass at 1/4 res, mip chain 1/8..1/32,
 *                                           blurred, merged, ONE additive full-resolution blend (identity transform, W,H =
 *                                           backing size). o: {gain=1, levels:[[blurPx,gain],...], shift=2 (first level at
 *                                           1/2^shift: 2 => 1/4, 3 => 1/8 for quality 1), noFilter (force the box-blur
 *                                           fallback used where ctx.filter is unsupported)}
 *  drawGrain(ctx, W, H, a = 0.03)         : fills W x H (current transform units) with a cached 128 px black/white noise tile
 * -- stroke font ---------------------------------------------------------------------------------------------------
 *  GLYPH                                  : { 'A': [advanceEm, stroke, stroke...] } stroke = [[x,y],...] polyline in em
 *                                           (cap height 1, x right, y down). Covers A-Z 0-9 and every SPEC glyph:
 *                                           ! ? . , : ; - + = & ' " / ( ) % * # < > _ (c) heart star left right
 *                                           v3 (X8): O is wide and round, 0 narrow with a slash, D / B squarer, 8 narrower: O / 0 / D and B / 8 stay distinct at k <= 1.5
 *  glyphPaths(ch)                         : -> GLYPH entry for ch (case-insensitive, unknown -> '?')
 *  textWidth(str, track = 0.46, mono, adv): width in em. mono=true => advance max(glyph,0.56) (digits/HUD numerals);
 *                                           adv=<em> => FIXED cell advance for every glyph (true monospace, e.g. 8/cap)
 *  textPath(str, x, y, cap, track, mono, adv) : -> Path2D of the string, top-left (x,y), cap height cap units
 *  drawText(ctx, str, x, y, cap, o)       : neon() the string; o: {col=WHITE, lw (default cap*0.085), track=0.46, align:
 *                                           'left'|'center'|'right', a, halo=0.8, hot=0.6, mono, adv}; returns the width
 */
const NEON = (() => {
  'use strict';

  /* ------------------------------------------------------------------------------------------------------------------
   * maths + colour
   * ---------------------------------------------------------------------------------------------------------------- */
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const hex = (h) => (h.length === 4 ? [parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16), parseInt(h[3] + h[3], 16)] : [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);

  /* Palette (palette.json): ten named colours, everything else is derived by mixing. */
  const PAL = {
    void: '#05070f', abyss: '#0b1a33', cyan: '#3cf2ff', magenta: '#ff3ea5', lime: '#b6ff3b',
    amber: '#ffb23e', violet: '#8a5cff', white: '#eaffff', ember: '#ff6a3d', cobalt: '#3d7bff',
  };
  const RGB = {};
  for (const k in PAL) RGB[k] = hex(PAL[k]);
  RGB.crimson = hex('#ff2a2a');                          // angry state: ember pushed to pure red (>= 30 degrees of hue from Fizz's magenta)
  RGB.purple = mixc(RGB.violet, RGB.magenta, 0.42);      // Kraken King
  RGB.ink = hex('#04060d');                              // the occluder black
  for (const k in RGB) Object.freeze(RGB[k]);
  Object.freeze(PAL); Object.freeze(RGB);

  function mixc(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
  function rgba(c, a) {
    a = a > 1 ? 1 : a >= 0 ? a : 0;                      // also maps NaN to 0 (an invalid CSS colour would silently keep the old style)
    return 'rgba(' + ((c[0] + 0.5) | 0) + ',' + ((c[1] + 0.5) | 0) + ',' + ((c[2] + 0.5) | 0) + ',' + a.toFixed(3) + ')';
  }
  const WHITE = RGB.white;
  const hot = (c, t = 0.7) => mixc(c, WHITE, t);

  const NAMED = { white: [255, 255, 255], black: [0, 0, 0], red: [255, 0, 0], lime: [0, 255, 0], blue: [0, 0, 255], yellow: [255, 255, 0], cyan: [0, 255, 255], aqua: [0, 255, 255], magenta: [255, 0, 255], fuchsia: [255, 0, 255], orange: [255, 165, 0], gray: [128, 128, 128], grey: [128, 128, 128], transparent: [0, 0, 0, 0] };
  function parseColor(s) {
    if (Array.isArray(s)) return [s[0], s[1], s[2], s[3] === undefined ? 1 : s[3]];
    s = String(s === undefined || s === null ? '' : s).trim().toLowerCase();
    let m;
    if ((m = /^#([0-9a-f]+)$/.exec(s)) && (m[1].length === 3 || m[1].length === 4 || m[1].length === 6 || m[1].length === 8)) {
      let h = m[1];
      if (h.length < 6) h = h.replace(/./g, (c) => c + c);
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
    }
    if ((m = /^rgba?\(([^)]*)\)$/.exec(s))) {
      const parts = m[1].trim().split(/\s*[,\/]\s*|\s+/);
      const ch = (v) => (/%$/.test(v) ? parseFloat(v) * 2.55 : parseFloat(v));
      if (parts.length >= 3) {
        const r = ch(parts[0]), g = ch(parts[1]), b = ch(parts[2]);
        const al = parts.length > 3 ? (/%$/.test(parts[3]) ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])) : 1;
        if (r === r && g === g && b === b && al === al) return [clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255), clamp(al, 0, 1)];
      }
    } else if (Object.prototype.hasOwnProperty.call(NAMED, s)) {
      const n = NAMED[s]; return [n[0], n[1], n[2], n.length > 3 ? n[3] : 1];
    }
    return [255, 255, 255, 1];
  }
  function toHex(c) {
    const h = (v) => { const n = clamp(Math.round(v), 0, 255); return (n < 16 ? '0' : '') + n.toString(16); };
    return '#' + h(c[0]) + h(c[1]) + h(c[2]);
  }

  /* tiny seeded RNG (mulberry32): same sequence as U.rng of 00_shared.js, kept self-contained so baked art never depends on game state */
  function rng(seed) {
    let s = (seed === undefined || seed === null || Number.isNaN(+seed) ? 1 : +seed) >>> 0;
    const next = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    return {
      next,
      float: (a = 0, b = 1) => a + next() * (b - a),
      int: (a, b) => { if (b === undefined) { b = a; a = 0; } if (b < a) { const t = a; a = b; b = t; } return a + Math.floor(next() * (b - a + 1)); },
      pick: (arr) => (arr.length ? arr[Math.floor(next() * arr.length)] : undefined),
      chance: (p) => next() < p,
    };
  }

  /* ------------------------------------------------------------------------------------------------------------------
   * canvases + bounded caches (all lazy: nothing touches the DOM at load time)
   * ---------------------------------------------------------------------------------------------------------------- */
  const GLOW_MAX = 96;          // 96 x (128*128*4 B) ~= 6 MB
  const SCRATCH_MAX = 24;
  const GRAIN_MAX = 4;

  function makeCanvas(w, h) {
    w = Math.max(1, Math.round(w) || 1); h = Math.max(1, Math.round(h) || 1);
    if (typeof document !== 'undefined' && document && document.createElement) {
      const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
    }
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    throw new Error('NEON: no canvas implementation available');
  }

  const _scratch = new Map();                                  // name -> canvas, insertion order = LRU order
  function scratch(name, w, h) {
    w = Math.max(1, Math.round(w) || 1); h = Math.max(1, Math.round(h) || 1);
    let c = _scratch.get(name);
    if (c) { _scratch.delete(name); }
    else {
      if (_scratch.size >= SCRATCH_MAX) releaseScratch(_scratch.keys().next().value);
      c = makeCanvas(w, h);
    }
    _scratch.set(name, c);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return c;
  }
  function releaseScratch(name) {
    const drop = (k) => { const c = _scratch.get(k); if (c) { c.width = 1; c.height = 1; } _scratch.delete(k); };
    if (name === undefined) { for (const k of Array.from(_scratch.keys())) drop(k); } else drop(name);
  }

  /* ------------------------------------------------------------------------------------------------------------------
   * NEON STROKE: the one primitive the whole look is built from.
   * soft halo (2 wide faint passes) + coloured core + white-hot centre line. All additive.
   * w is in current-transform units. o: {a, halo, hot, grad:[x0,y0,x1,y1]}
   * ---------------------------------------------------------------------------------------------------------------- */
  function neon(ctx, path, col, w, o) {
    o = o || {};
    const a = o.a === undefined ? 1 : o.a;
    if (a <= 0.002) return;
    const halo = o.halo === undefined ? 1 : o.halo;
    const hh = o.hot === undefined ? 0.75 : o.hot;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = o.cap || 'round'; ctx.lineJoin = 'round';
    if (halo > 0) {
      ctx.lineWidth = w * 3.4; ctx.strokeStyle = rgba(col, 0.085 * a * halo); ctx.stroke(path);
      ctx.lineWidth = w * 1.9; ctx.strokeStyle = rgba(col, 0.18 * a * halo); ctx.stroke(path);
    }
    if (o.grad) {
      const g = ctx.createLinearGradient(o.grad[0], o.grad[1], o.grad[2], o.grad[3]);
      g.addColorStop(0, rgba(hot(col, o.gradHot === undefined ? 0.55 : o.gradHot), 0.98 * a)); g.addColorStop(1, rgba(col, 0.78 * a));
      ctx.strokeStyle = g;
    } else ctx.strokeStyle = rgba(col, 0.92 * a);
    ctx.lineWidth = w; ctx.stroke(path);
    if (hh > 0) { ctx.lineWidth = Math.max(w * 0.38, 0.0001); ctx.strokeStyle = rgba(hot(col, 0.78), hh * a); ctx.stroke(path); }
    ctx.restore();
  }

  /* Dark occluding body fill with a hue-tinted gradient and an inner rim glow (so creatures read as
   * solid silhouettes in front of the luminous world, but stay "made of light"). */
  function body(ctx, path, col, w, o) {
    o = o || {};
    const a = o.a === undefined ? 1 : o.a;
    if (a <= 0.002) return;
    ctx.save();
    if (!o.noBack) { ctx.fillStyle = 'rgba(4,6,14,' + (0.93 * a).toFixed(3) + ')'; ctx.fill(path); }
    const y0 = o.y0 === undefined ? 0 : o.y0, y1 = o.y1 === undefined ? 16 : o.y1;
    const g = ctx.createLinearGradient(o.x0 || 0, y0, o.x1 === undefined ? 0 : o.x1, y1);
    g.addColorStop(0, rgba(mixc(col, RGB.void, 0.18), 0.34 * a * (o.tint === undefined ? 1 : o.tint)));
    g.addColorStop(1, rgba(mixc(mixc(col, RGB.violet, 0.4), RGB.void, 0.62), 0.24 * a * (o.tint === undefined ? 1 : o.tint)));
    ctx.fillStyle = g; ctx.fill(path);
    ctx.clip(path);
    ctx.globalCompositeOperation = 'lighter';
    if (o.hl) { // soft inner highlight (key light, top-left): luminous volume without any opaque shading
      const hg = ctx.createRadialGradient(o.hl[0], o.hl[1], 0, o.hl[0], o.hl[1], o.hl[2]);
      hg.addColorStop(0, rgba(hot(col, 0.45), (o.hl[3] === undefined ? 0.3 : o.hl[3]) * 0.5 * a)); hg.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = hg; ctx.fill(path);
    }
    if (o.core) { // inner light organ: a warm-hot soft core so the body is luminous from within (heroes)
      const cg = ctx.createRadialGradient(o.core[0], o.core[1], 0, o.core[0], o.core[1], o.core[2]);
      cg.addColorStop(0, rgba(hot(col, 0.35), o.core[3] * a)); cg.addColorStop(0.5, rgba(col, o.core[3] * 0.42 * a)); cg.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = cg; ctx.fill(path);
    }
    const rim = o.rim === undefined ? 1 : o.rim;
    ctx.lineJoin = 'round';
    ctx.lineWidth = w * 7; ctx.strokeStyle = rgba(col, 0.13 * a * rim); ctx.stroke(path);
    ctx.lineWidth = w * 3.6; ctx.strokeStyle = rgba(col, 0.20 * a * rim); ctx.stroke(path);
    ctx.restore();
  }

  /* additive soft radial light - drawn from a cached 128 px gradient sprite per (quantised) colour:
   * one drawImage instead of creating a gradient + shading a big rect every call (the single biggest CPU saver).
   * Bounded LRU: 5 bits per channel would allow 32768 sprites, a real scene uses a few dozen. */
  const _glowSprites = new Map();
  function glowSprite(col) {
    const key = ((clamp(col[0], 0, 255) >> 3) << 10) | ((clamp(col[1], 0, 255) >> 3) << 5) | (clamp(col[2], 0, 255) >> 3);
    let c = _glowSprites.get(key);
    if (c) { _glowSprites.delete(key); _glowSprites.set(key, c); return c; }     // refresh recency
    c = makeCanvas(128, 128);
    const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64), q = [(key >> 10) << 3, ((key >> 5) & 31) << 3, (key & 31) << 3];
    gr.addColorStop(0, rgba(q, 1)); gr.addColorStop(0.14, rgba(q, 0.68)); gr.addColorStop(0.3, rgba(q, 0.40)); gr.addColorStop(0.52, rgba(q, 0.17)); gr.addColorStop(0.76, rgba(q, 0.05)); gr.addColorStop(1, rgba(q, 0));
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    if (_glowSprites.size >= GLOW_MAX) _glowSprites.delete(_glowSprites.keys().next().value);   // evict least recently used (callers keep their reference, GC frees it later)
    _glowSprites.set(key, c);
    return c;
  }
  function glow(ctx, x, y, r, col, a, sy) {
    if (a <= 0.003 || r <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha *= a > 1 ? 1 : a;
    ctx.translate(x, y); if (sy) ctx.scale(1, sy);
    ctx.imageSmoothingEnabled = true;
    const sp = glowSprite(col);
    ctx.drawImage(sp, -r, -r, r * 2, r * 2);
    if (a > 1) { ctx.globalAlpha = a - 1; ctx.drawImage(sp, -r, -r, r * 2, r * 2); }
    ctx.restore();
  }

  /* a luminous dot: white-hot core, coloured body, glow */
  function dot(ctx, x, y, r, col, a, o) {
    o = o || {};
    a = a === undefined ? 1 : a;
    glow(ctx, x, y, r * (o.halo || 4.2), col, 0.5 * a);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgba(col, 0.95 * a); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = rgba(hot(col, 0.85), 0.95 * a); ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, TAU); ctx.fill();
    ctx.restore();
  }

  /* 4-point twinkle star */
  function starPath(cx, cy, r, k) {
    k = k === undefined ? 0.17 : k;
    const p = new Path2D();
    p.moveTo(cx, cy - r); p.lineTo(cx + r * k, cy - r * k); p.lineTo(cx + r, cy); p.lineTo(cx + r * k, cy + r * k);
    p.lineTo(cx, cy + r); p.lineTo(cx - r * k, cy + r * k); p.lineTo(cx - r, cy); p.lineTo(cx - r * k, cy - r * k); p.closePath();
    return p;
  }
  function sparkle(ctx, x, y, r, col, a, rot) {
    a = a === undefined ? 1 : a;
    glow(ctx, x, y, r * 2.4, col, 0.42 * a);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(x, y); if (rot) ctx.rotate(rot); ctx.translate(-x, -y);
    ctx.fillStyle = rgba(hot(col, 0.7), 0.95 * a); ctx.fill(starPath(x, y, r));
    ctx.fillStyle = rgba(WHITE, 0.9 * a); ctx.beginPath(); ctx.arc(x, y, r * 0.16, 0, TAU); ctx.fill();
    ctx.restore();
  }

  /* thin-film colour sweep (soap bubbles): thin-film cyan -> violet -> magenta -> gold -> cyan */
  const FILM = Object.freeze([RGB.cyan, RGB.violet, RGB.magenta, RGB.amber, RGB.cyan]);
  function filmGradient(ctx, x, y, rot, a, stops) {
    stops = stops || FILM;
    let g;
    if (ctx.createConicGradient) {
      g = ctx.createConicGradient(rot, x, y);
      stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), rgba(hot(c, 0.25), a)));
    } else {
      g = ctx.createLinearGradient(x - 10, y - 10, x + 10, y + 10);
      g.addColorStop(0, rgba(stops[0], a)); g.addColorStop(1, rgba(stops[2], a));
    }
    return g;
  }

  /* ------------------------------------------------------------------------------------------------------------------
   * path helpers
   * ---------------------------------------------------------------------------------------------------------------- */
  function spline(pts, closed, tension) {
    const t = tension === undefined ? 0.5 : tension;
    const p = new Path2D();
    const n = pts.length;
    if (n < 2) return p;
    const P = (i) => closed ? pts[(i + n) % n] : pts[clamp(i, 0, n - 1)];
    p.moveTo(pts[0][0], pts[0][1]);
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      const c1x = p1[0] + (p2[0] - p0[0]) * t / 3, c1y = p1[1] + (p2[1] - p0[1]) * t / 3;
      const c2x = p2[0] - (p3[0] - p1[0]) * t / 3, c2y = p2[1] - (p3[1] - p1[1]) * t / 3;
      p.bezierCurveTo(c1x, c1y, c2x, c2y, p2[0], p2[1]);
    }
    if (closed) p.closePath();
    return p;
  }
  function poly(pts, closed) {
    const p = new Path2D();
    if (!pts.length) return p;
    p.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
    if (closed) p.closePath();
    return p;
  }
  function arcPts(cx, cy, rx, ry, a0, a1, n) {
    n = n || 20;
    const out = [];
    for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
    return out;
  }
  function quadPts(p0, p1, p2, n) {
    n = n || 10;
    const out = [];
    for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; out.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]); }
    return out;
  }
  function circlePath(x, y, r) { const p = new Path2D(); p.arc(x, y, r, 0, TAU); return p; }
  function ellipsePath(x, y, rx, ry, rot) { const p = new Path2D(); p.ellipse(x, y, rx, ry, rot || 0, 0, TAU); return p; }

  /* dense Catmull-Rom sampling of an open control polyline */
  function sampleSpline(pts, perSeg) {
    perSeg = perSeg || 8;
    const n = pts.length, out = [];
    if (!n) return out;
    const P = (i) => pts[clamp(i, 0, n - 1)];
    for (let i = 0; i < n - 1; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      for (let s = 0; s < perSeg; s++) {
        const u = s / perSeg, u2 = u * u, u3 = u2 * u;
        out.push([
          0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * u + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3),
          0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * u + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3),
        ]);
      }
    }
    out.push(pts[n - 1].slice());
    return out;
  }
  /* variable-width ribbon around a dense spine: wfn(u in 0..1) = half width. Returns a closed Path2D. */
  function taper(spine, wfn) {
    const n = spine.length, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = spine[Math.max(0, i - 1)], b = spine[Math.min(n - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const hw = wfn(n > 1 ? i / (n - 1) : 0);
      L.push([spine[i][0] - dy * hw, spine[i][1] + dx * hw]);
      R.push([spine[i][0] + dy * hw, spine[i][1] - dx * hw]);
    }
    const p = new Path2D();
    if (!n) return p;
    p.moveTo(L[0][0], L[0][1]);
    for (let i = 1; i < n; i++) p.lineTo(L[i][0], L[i][1]);
    for (let i = n - 1; i >= 0; i--) p.lineTo(R[i][0], R[i][1]);
    p.closePath();
    return p;
  }
  function spinePath(spine) { return poly(spine, false); }

  /* ------------------------------------------------------------------------------------------------------------------
   * sprite placement. Sprites are authored in a 16x16-unit box facing right; k = output px per unit.
   * ---------------------------------------------------------------------------------------------------------------- */
  /* v3 (X6): a CONSTANT contour width in logical units (LW_REF) above k ~ 2, so the art looks the same at every scale; below that the line
   * never gets thinner than LW_MINDEV device px (legibility), which is the only place where the look still depends on k. */
  const LW_REF = 0.47, LW_MINDEV = 0.85;
  function lwFor(k, m) { return Math.max(LW_REF, LW_MINDEV / k) * (m || 1); }

  function placeSprite(ctx, o, boxW, fn) {
    const f = o.face < 0 ? -1 : 1, k = o.k;
    ctx.save();
    ctx.translate(o.x + (f < 0 ? boxW * k : 0), o.y);
    ctx.scale(f * k, k);
    if (o.a !== undefined && o.a < 1) ctx.globalAlpha = o.a;
    fn();
    ctx.restore();
  }

  /* ------------------------------------------------------------------------------------------------------------------
   * creature helpers (generic parts of the mockup's enemy module; no game knowledge)
   * ---------------------------------------------------------------------------------------------------------------- */
  function eyeBall(ctx, x, y, r, col, look, o) {
    o = o || {};
    const a = o.a === undefined ? 1 : o.a;
    glow(ctx, x, y, r * 3.0, WHITE, 0.13 * a);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgba(hot(col, o.hotEye === undefined ? 0.84 : o.hotEye), 0.97 * a); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(8,5,18,' + (0.95 * a).toFixed(3) + ')';
    ctx.beginPath();
    const px = x + look[0] * r * 0.42, py = y + look[1] * r * 0.42;
    if (o.slit) ctx.ellipse(px, py, r * 0.22, r * 0.62, 0, 0, TAU); else ctx.arc(px, py, r * (o.pupil || 0.55), 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgba(WHITE, 0.95 * a); ctx.beginPath(); ctx.arc(x + r * 0.05 - look[0] * r * 0.05, y - r * 0.36, r * 0.2, 0, TAU); ctx.fill();
    ctx.restore();
    neon(ctx, circlePath(x, y, r), col, o.w || 0.3, { a: 0.9 * a, halo: 0.35, hot: 0.2 });
  }
  /* angry cue: slanted brow bar over an eye (call with the eye centre), steam puffs, heat halo */
  function brow(ctx, x, y, r, dir, w, col) {
    const p = new Path2D();
    p.moveTo(x - r * 1.15 * dir, y - r * 1.55); p.lineTo(x + r * 1.1 * dir, y - r * 0.55);
    neon(ctx, p, col, w * 1.15, { a: 1, halo: 0.6, hot: 0.5 });
  }
  function steam(ctx, x, y, t, w, col, n) {
    n = n || 3;
    const vc = mixc(col, WHITE, 0.45);
    for (let i = 0; i < n; i++) {
      const ph = (t * 0.8 + i / n) % 1;
      const bx = x + (i - (n - 1) / 2) * 2.0, rise = 1.0 + ph * 5.2;
      const p = new Path2D();
      for (let j = 0; j <= 14; j++) {
        const u = j / 14, yy = y - u * rise, xx = bx + Math.sin(u * 7 + ph * 5 + i * 2) * (0.35 + u * 0.55);
        j ? p.lineTo(xx, yy) : p.moveTo(xx, yy);
      }
      const a = Math.sin(Math.PI * Math.min(1, ph * 1.04)) * 0.95;
      neon(ctx, p, vc, w * 0.6, { a, halo: 0.55, hot: 0.4 });
      glow(ctx, bx, y - rise * 0.55, 2.0 + ph * 2.2, col, 0.34 * a);
      glow(ctx, bx + Math.sin(ph * 6 + i) * 0.6, y - rise * 0.9, 1.4 + ph * 1.6, vc, 0.2 * a);
    }
  }
  function heat(ctx, t, col, cx, cy, r) {
    glow(ctx, cx, cy, r * (1 + Math.sin(t * 6) * 0.08), col, 0.34 + Math.sin(t * 6) * 0.07);
  }
  function gearPath(cx, cy, R, r, teeth, rot) {
    const p = new Path2D(), step = TAU / teeth;
    for (let i = 0; i < teeth; i++) {
      const a = rot + i * step;
      const pts = [[a - step * 0.5, r], [a - step * 0.27, r], [a - step * 0.17, R], [a + step * 0.17, R], [a + step * 0.27, r], [a + step * 0.5, r]];
      pts.forEach((q, j) => { const x = cx + Math.cos(q[0]) * q[1], y = cy + Math.sin(q[0]) * q[1]; (i === 0 && j === 0) ? p.moveTo(x, y) : p.lineTo(x, y); });
    }
    p.closePath();
    return p;
  }

  /* ------------------------------------------------------------------------------------------------------------------
   * BLOOM: bright-pass -> half-res mip chain -> blurred -> additive composite back.
   * "bloom = blurred glow layers rendered at reduced resolution". Works on the ctx's own canvas (identity transform).
   * ---------------------------------------------------------------------------------------------------------------- */
  let _filterOK;
  function filterSupported() {
    if (_filterOK === undefined) {
      // `'filter' in g` first: engines without ctx.filter would happily store an expando property and fool a plain read-back test
      try { const g = makeCanvas(1, 1).getContext('2d'); _filterOK = ('filter' in g) && ((g.filter = 'blur(1px)'), g.filter === 'blur(1px)'); } catch (e) { _filterOK = false; }
    }
    return _filterOK;
  }
  /* blur src into g (copy). Uses ctx.filter where available, else a 9-tap running-average box blur. */
  function blurInto(g, src, px, noFilter) {
    g.globalCompositeOperation = 'copy';
    if (!noFilter && filterSupported()) { g.filter = 'blur(' + px + 'px)'; g.drawImage(src, 0, 0); g.filter = 'none'; g.globalCompositeOperation = 'source-over'; return; }
    const d = Math.max(0.75, px * 0.9);
    g.globalAlpha = 1; g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-over';
    let n = 1;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { if (!ox && !oy) continue; n++; g.globalAlpha = 1 / n; g.drawImage(src, ox * d, oy * d); }
    g.globalAlpha = 1;
  }
  function bloom(ctx, W, H, o) {
    o = o || {};
    const cv = ctx.canvas;
    const cfg = o.levels || [[1.2, 0.6], [2.0, 0.6], [2.6, 0.36], [3.2, 0.2]];   // [blur px, gain] for the /4 /8 /16 /32 levels
    const shift = clamp((o.shift === undefined ? 2 : o.shift) | 0, 2, 4);          // first level at 1/2^shift
    const mk = (name, w, h) => { const c = scratch(name, w, h), g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'low'; return [c, g]; };
    // /2 plain downsample (no ops at the big size) [+ plain halvings], then ONE soft bright-pass at 1/2^shift
    let w = Math.max(4, W >> 1), h = Math.max(4, H >> 1);
    let [from, g0] = mk('bh', w, h); g0.globalCompositeOperation = 'copy'; g0.drawImage(cv, 0, 0, w, h);
    for (let s = 2; s < shift; s++) {
      w = Math.max(4, w >> 1); h = Math.max(4, h >> 1);
      const [cs, gs] = mk('bs' + s, w, h); gs.globalCompositeOperation = 'copy'; gs.drawImage(from, 0, 0, w, h); from = cs;
    }
    w = Math.max(4, w >> 1); h = Math.max(4, h >> 1);
    let [src, g] = mk('bl0', w, h);
    g.globalCompositeOperation = 'copy'; g.drawImage(from, 0, 0, w, h);
    const [t2, tg] = mk('blt', w, h);
    tg.globalCompositeOperation = 'copy'; tg.drawImage(src, 0, 0);          // soft threshold without a filter: v -> v^2 (self-multiply), twice = v^4
    g.globalCompositeOperation = 'multiply'; g.drawImage(t2, 0, 0);
    tg.globalCompositeOperation = 'copy'; tg.drawImage(src, 0, 0); g.drawImage(t2, 0, 0);
    g.globalCompositeOperation = 'lighter'; g.drawImage(src, 0, 0); g.drawImage(src, 0, 0);   // restore energy lost by the threshold
    g.globalCompositeOperation = 'source-over';
    const levels = [src];
    for (let i = 1; i < cfg.length; i++) {
      w = Math.max(4, w >> 1); h = Math.max(4, h >> 1);
      const [c, cg] = mk('bl' + i, w, h); cg.globalCompositeOperation = 'copy'; cg.drawImage(levels[i - 1], 0, 0, w, h); levels.push(c);
    }
    const blurred = levels.map((c, i) => {
      const b = scratch('bb' + i, c.width, c.height), bg = b.getContext('2d');
      bg.setTransform(1, 0, 0, 1, 0, 0); blurInto(bg, c, cfg[i][0], o.noFilter);
      return b;
    });
    // merge coarse -> fine at LOW resolution (cheap), then ONE full-resolution additive blend
    const gain = o.gain === undefined ? 1 : o.gain;
    let acc = null;
    for (let i = blurred.length - 1; i >= 0; i--) {
      const c = scratch('ba' + i, blurred[i].width, blurred[i].height), cg = c.getContext('2d');
      cg.setTransform(1, 0, 0, 1, 0, 0); cg.imageSmoothingEnabled = true; cg.imageSmoothingQuality = 'low';
      cg.globalCompositeOperation = 'copy'; cg.globalAlpha = clamp(cfg[i][1] * gain, 0, 1); cg.drawImage(blurred[i], 0, 0);
      if (acc) { cg.globalCompositeOperation = 'lighter'; cg.globalAlpha = 1; cg.drawImage(acc, 0, 0, c.width, c.height); }
      cg.globalAlpha = 1; cg.globalCompositeOperation = 'source-over';
      acc = c;
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';
    ctx.drawImage(acc, 0, 0, W, H);
    ctx.restore();
  }

  /* film grain / dither: a cached 128 px black/white noise tile (alpha ~ a), composited normally - kills banding in the dark gradients */
  const _grainTiles = new Map();
  function drawGrain(ctx, W, H, a) {
    a = a === undefined ? 0.03 : a;
    const key = Math.round(clamp(a, 0, 1) * 1000);              // quantised: arbitrary alphas can never grow the cache
    let tile = _grainTiles.get(key);
    if (tile) { _grainTiles.delete(key); }
    else {
      const qa = key / 1000;
      tile = makeCanvas(128, 128);
      const g = tile.getContext('2d'), im = g.createImageData(128, 128), R = rng(99);
      for (let i = 0; i < im.data.length; i += 4) { const v = R.next() < 0.5 ? 0 : 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = Math.round(255 * qa * (0.4 + 0.6 * R.next())); }
      g.putImageData(im, 0, 0);
      if (_grainTiles.size >= GRAIN_MAX) _grainTiles.delete(_grainTiles.keys().next().value);
    }
    _grainTiles.set(key, tile);
    ctx.save(); ctx.fillStyle = ctx.createPattern(tile, 'repeat'); ctx.fillRect(0, 0, W, H); ctx.restore();
  }

  /* ------------------------------------------------------------------------------------------------------------------
   * STROKE FONT: thin, wide-tracked geometric sans drawn as polylines (cap height = 1, x right, y down).
   * Entry = [advance (em), stroke, stroke, ...]; advance 0 = a single column glyph (stroke at x = 0).
   * The mockup's A-Z/0-9/punctuation set + every glyph the SPEC requires (; " % < > _ (c) heart star arrows).
   * ---------------------------------------------------------------------------------------------------------------- */
  const A_ = arcPts, Q_ = quadPts;
  const heartPts = (() => {                                      // classic parametric heart fitted into x 0..0.7, y 0.12..0.95
    const out = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40 * TAU, Y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      out.push([0.35 + 0.35 * Math.pow(Math.sin(t), 3), 0.95 - (Y + 17) / 29 * 0.83]);
    }
    return out;
  })();
  const starPts = (() => {                                       // 5-point outline star, centre (0.4, 0.54), R 0.42
    const out = [];
    for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.17 : 0.42; out.push([0.4 + Math.cos(a) * r, 0.54 + Math.sin(a) * r]); }
    return out;
  })();
  const GLYPH = {
    A: [0.64, [[0, 1], [0.32, 0], [0.64, 1]], [[0.11, 0.68], [0.53, 0.68]]],
    B: [0.62, [[0, 0], [0, 1]], [[0, 0], [0.38, 0], ...A_(0.38, 0.25, 0.22, 0.25, -90, 90), [0, 0.5]], [[0, 0.5], [0.42, 0.5], ...A_(0.42, 0.75, 0.2, 0.25, -90, 90), [0, 1]]],
    C: [0.62, A_(0.34, 0.5, 0.32, 0.5, -42, -318, 28)],
    D: [0.66, [[0, 0], [0, 1]], [[0, 0], [0.3, 0], ...A_(0.3, 0.5, 0.36, 0.5, -90, 90, 22), [0, 1]]],
    E: [0.54, [[0.54, 0], [0, 0], [0, 1], [0.54, 1]], [[0, 0.5], [0.42, 0.5]]],
    F: [0.52, [[0.52, 0], [0, 0], [0, 1]], [[0, 0.5], [0.4, 0.5]]],
    G: [0.66, [...A_(0.34, 0.5, 0.32, 0.5, -38, -322, 28), [0.64, 0.66], [0.64, 0.52], [0.36, 0.52]]],
    H: [0.62, [[0, 0], [0, 1]], [[0.62, 0], [0.62, 1]], [[0, 0.5], [0.62, 0.5]]],
    I: [0.0, [[0, 0], [0, 1]]],
    J: [0.5, [[0.5, 0], [0.5, 0.68], ...A_(0.25, 0.68, 0.25, 0.32, 0, 180, 14)]],
    K: [0.6, [[0, 0], [0, 1]], [[0.6, 0], [0.02, 0.62]], [[0.2, 0.46], [0.6, 1]]],
    L: [0.5, [[0, 0], [0, 1], [0.5, 1]]],
    M: [0.78, [[0, 1], [0, 0], [0.39, 0.62], [0.78, 0], [0.78, 1]]],
    N: [0.62, [[0, 1], [0, 0], [0.62, 1], [0.62, 0]]],
    O: [0.74, A_(0.37, 0.5, 0.37, 0.5, 0, 360, 40)],                       // v3 (X8): a wide round O ...
    P: [0.58, [[0, 1], [0, 0], [0.3, 0], ...A_(0.3, 0.27, 0.28, 0.27, -90, 90, 14), [0, 0.54]]],
    Q: [0.74, A_(0.37, 0.5, 0.37, 0.5, 0, 360, 40), [[0.45, 0.68], [0.78, 1.08]]],
    R: [0.6, [[0, 1], [0, 0], [0.3, 0], ...A_(0.3, 0.27, 0.28, 0.27, -90, 90, 14), [0, 0.54]], [[0.28, 0.54], [0.6, 1]]],
    S: [0.58, [...A_(0.29, 0.25, 0.27, 0.25, -28, -270, 18), ...A_(0.29, 0.75, 0.29, 0.25, -90, 152, 18)]],
    T: [0.62, [[0, 0], [0.62, 0]], [[0.31, 0], [0.31, 1]]],
    U: [0.62, [[0, 0], [0, 0.7], ...A_(0.31, 0.7, 0.31, 0.3, 180, 0, 16), [0.62, 0]]],
    V: [0.66, [[0, 0], [0.33, 1], [0.66, 0]]],
    W: [0.92, [[0, 0], [0.2, 1], [0.46, 0.26], [0.72, 1], [0.92, 0]]],
    X: [0.62, [[0, 0], [0.62, 1]], [[0.62, 0], [0, 1]]],
    Y: [0.64, [[0, 0], [0.32, 0.52], [0.64, 0]], [[0.32, 0.52], [0.32, 1]]],
    Z: [0.58, [[0, 0], [0.58, 0], [0, 1], [0.58, 1]]],
    0: [0.5, A_(0.25, 0.5, 0.25, 0.5, 0, 360, 32), [[0.1, 0.8], [0.4, 0.2]]],     // ... against a narrow SLASHED zero (O / 0 / D stay distinct at k <= 1.5)
    1: [0.34, [[0, 0.22], [0.26, 0], [0.26, 1]]],
    2: [0.56, [...A_(0.28, 0.27, 0.28, 0.27, 180, 372, 16), [0, 1], [0.56, 1]]],
    3: [0.56, [...A_(0.28, 0.25, 0.26, 0.25, -150, 90, 16)], [...A_(0.28, 0.75, 0.28, 0.25, -90, 150, 16)]],
    4: [0.58, [[0.44, 1], [0.44, 0], [0, 0.7], [0.58, 0.7]]],
    5: [0.56, [[0.54, 0], [0.04, 0], [0.01, 0.46], ...A_(0.28, 0.7, 0.28, 0.3, -128, 142, 18)]],
    6: [0.56, [...Q_([0.5, 0], [0.02, 0.14], [0.0, 0.7], 12), ...A_(0.28, 0.7, 0.28, 0.3, 180, 540, 26)]],
    7: [0.56, [[0, 0], [0.56, 0], [0.18, 1]]],
    8: [0.5, A_(0.25, 0.26, 0.2, 0.26, 0, 360, 22), A_(0.25, 0.75, 0.25, 0.25, 0, 360, 22)],
    9: [0.56, [...A_(0.28, 0.3, 0.28, 0.3, 0, 360, 26)], [...Q_([0.56, 0.3], [0.56, 0.92], [0.06, 1], 12)]],
    '+': [0.5, [[0.25, 0.28], [0.25, 0.78]], [[0, 0.53], [0.5, 0.53]]],
    '-': [0.4, [[0, 0.52], [0.4, 0.52]]],
    '.': [0.0, [[0, 1], [0, 1.0001]]],
    ',': [0.0, [[0, 1], [-0.06, 1.14]]],
    ':': [0.0, [[0, 0.3], [0, 0.3001]], [[0, 0.82], [0, 0.8201]]],
    '!': [0.0, [[0, 0], [0, 0.66]], [[0, 0.96], [0, 0.9601]]],
    '?': [0.5, [...A_(0.25, 0.27, 0.25, 0.27, 180, 400, 14), [0.25, 0.66]], [[0.25, 0.96], [0.25, 0.9601]]],
    '/': [0.42, [[0, 1], [0.42, 0]]],
    "'": [0.0, [[0, 0], [0, 0.22]]],
    '(': [0.2, A_(0.3, 0.5, 0.3, 0.62, 118, 242, 12)],
    ')': [0.2, A_(-0.1, 0.5, 0.3, 0.62, -62, 62, 12)],
    '&': [0.78, [[0.78, 0.98], [0.5, 0.64], [0.2, 0.3], [0.14, 0.18], [0.22, 0.05], [0.36, 0], [0.5, 0.06], [0.56, 0.18], [0.5, 0.32], [0.3, 0.5], [0.1, 0.66], [0.03, 0.82], [0.12, 0.95], [0.28, 1], [0.44, 0.94], [0.58, 0.78], [0.7, 0.6]]],
    '#': [0.6, [[0.2, 0], [0.14, 1]], [[0.46, 0], [0.4, 1]], [[0, 0.34], [0.62, 0.34]], [[0, 0.68], [0.62, 0.68]]],
    '*': [0.4, [[0.2, 0.25], [0.2, 0.75]], [[0, 0.37], [0.4, 0.63]], [[0, 0.63], [0.4, 0.37]]],
    '=': [0.5, [[0, 0.38], [0.5, 0.38]], [[0, 0.66], [0.5, 0.66]]],
    ' ': [0.34],
    // --- additions (not in the mockup; required by SPEC sec. 3 font list) ---
    ';': [0.0, [[0, 0.3], [0, 0.3001]], [[0, 0.82], [-0.06, 1.0]]],
    '"': [0.22, [[0, 0], [0, 0.22]], [[0.22, 0], [0.22, 0.22]]],
    '%': [0.7, [[0.64, 0.02], [0.06, 0.98]], A_(0.13, 0.19, 0.12, 0.17, 0, 360, 14), A_(0.57, 0.81, 0.12, 0.17, 0, 360, 14)],
    '<': [0.34, [[0.34, 0.1], [0, 0.5], [0.34, 0.9]]],
    '>': [0.34, [[0, 0.1], [0.34, 0.5], [0, 0.9]]],
    '_': [0.5, [[0, 1.1], [0.5, 1.1]]],
    '©': [0.76, A_(0.38, 0.5, 0.38, 0.5, 0, 360, 30), A_(0.4, 0.5, 0.17, 0.2, -50, -310, 14)],
    '♥': [0.7, heartPts],
    '★': [0.8, starPts],
    '←': [0.8, [[0.8, 0.5], [0, 0.5]], [[0.28, 0.22], [0, 0.5], [0.28, 0.78]]],
    '→': [0.8, [[0, 0.5], [0.8, 0.5]], [[0.52, 0.22], [0.8, 0.5], [0.52, 0.78]]],
  };
  const GLYPH_ALIAS = { '‘': "'", '’': "'", '“': '"', '”': '"', '–': '-', '—': '-', ' ': ' ', '•': '*' };
  Object.freeze(GLYPH);
  function glyphPaths(ch) {
    const g = GLYPH[ch] || GLYPH[GLYPH_ALIAS[ch]] || GLYPH[String(ch).toUpperCase()];
    return g || GLYPH['?'];
  }
  const MONO_MIN = 0.56;                                         // narrowest glyph advance (em) in `mono` mode
  /* width of a string in em (cap-height = 1). mono: glyph advance >= 0.56 em; adv: fixed advance per glyph (em) */
  function textWidth(str, track, mono, adv) {
    track = track === undefined ? 0.46 : track;
    const s = String(str);
    if (!s.length) return 0;
    if (adv) return s.length * adv;
    let w = 0;
    for (let i = 0; i < s.length; i++) { const gw = glyphPaths(s[i])[0]; w += (mono ? Math.max(gw, MONO_MIN) : gw) + track; }
    return w - track;
  }
  /* appends the strokes of str (top-left at x,y; cap = cap height in current units) to path.
   * adv > 0: every glyph is centred in a fixed cell of adv em (track is ignored); else advance = glyph (or MONO_MIN) + track */
  function addText(path, s, x, y, cap, track, mono, adv) {
    let cx = x;
    for (let i = 0; i < s.length; i++) {
      const g = glyphPaths(s[i]);
      const gw = adv ? adv : mono ? Math.max(g[0], MONO_MIN) : g[0];
      const off = adv || mono ? (gw - g[0]) / 2 : 0;
      for (let j = 1; j < g.length; j++) {
        const st = g[j];
        path.moveTo(cx + (st[0][0] + off) * cap, y + st[0][1] * cap);
        for (let q = 1; q < st.length; q++) path.lineTo(cx + (st[q][0] + off) * cap, y + st[q][1] * cap);
      }
      cx += (adv ? adv : gw + track) * cap;
    }
  }
  /* draws str with its top-left at (x,y) in the CURRENT transform units; cap = cap height in those units.
   * o: {col, lw (stroke width in units), track, align, a, halo, hot, mono, adv} -> returns the string width in units */
  function drawText(ctx, str, x, y, cap, o) {
    o = o || {};
    const track = o.track === undefined ? 0.46 : o.track;
    const col = o.col || RGB.white;
    const s = String(str);
    const tw = textWidth(s, track, o.mono, o.adv || 0) * cap;
    const cx = o.align === 'center' ? x - tw / 2 : o.align === 'right' ? x - tw : x;
    const lw = o.lw || cap * 0.085;
    const path = new Path2D();
    addText(path, s, cx, y, cap, track, o.mono, o.adv || 0);
    neon(ctx, path, col, lw, { a: o.a, halo: o.halo === undefined ? 0.8 : o.halo, hot: o.hot === undefined ? 0.6 : o.hot });
    return tw;
  }
  /* the path of a single run of text, for logo use (Path2D in current units) */
  function textPath(str, x, y, cap, track, mono, adv) {
    track = track === undefined ? 0.46 : track;
    const path = new Path2D();
    addText(path, String(str), x, y, cap, track, mono, adv || 0);
    return path;
  }

  /* ------------------------------------------------------------------------------------------------------------------
   * housekeeping
   * ---------------------------------------------------------------------------------------------------------------- */
  function clearCaches() { _glowSprites.clear(); _grainTiles.clear(); releaseScratch(); }
  function stats() { return { glow: _glowSprites.size, glowMax: GLOW_MAX, scratch: _scratch.size, scratchMax: SCRATCH_MAX, grain: _grainTiles.size }; }

  return {
    TAU, clamp, lerp, sstep, hex, parseColor, toHex, mixc, rgba, hot, rng, PAL, RGB, WHITE, FILM,
    makeCanvas, scratch, releaseScratch, clearCaches, stats, GLOW_MAX, SCRATCH_MAX,
    neon, body, glowSprite, glow, dot, starPath, sparkle, filmGradient,
    spline, poly, arcPts, quadPts, circlePath, ellipsePath, sampleSpline, taper, spinePath,
    lwFor, placeSprite,
    eyeBall, brow, steam, heat, gearPath,
    bloom, drawGrain,
    GLYPH, glyphPaths, textWidth, textPath, drawText,
  };
})();


/* ===== 10_gfx.js ===== */
/* FIZZ & POP v2.0 (wave 3) - 10_gfx.js  ->  const GFX   (GFX core + world; the sprite DEFINITIONS live in 11_gfx_cast.js)
 * "Abyss Glow": resolution independent, everything is drawn in code, nothing is loaded.  Contract: SPEC_V2 sec. 1-2, amended by FIXPLAN_V3 (GFX core).
 *
 *  RENDER MODEL
 *   - Main sizes the canvas to k x 256 and calls GFX.setScale(k) (k = output px per logical px, 0.25 steps, 1..8). Game and the
 *     scenes keep drawing in LOGICAL units (256 x 224) under ctx.setTransform(k,0,0,k,0,0).
 *   - ONE RESOLUTION, NO RESAMPLING (v3): every registry sprite, glyph tile / string, particle, world canvas, logo and big twin is baked at the
 *     EXACT k (no buckets) and blitted 1:1 on the device pixel grid. A registry sprite is drawn ONCE per (name, frame, k) into a cached canvas
 *     (lazy + a warm-up queue; memory bounded by MAX_PX with least-recently-used eviction, previous-scale bakes go first).
 *   - RE-BAKE WITHOUT HITCHES (v3, V10c): GFX.setScale does not throw the baked data away. The previous scale's bakes keep being drawn (re-sampled,
 *     at the right logical size) while their replacements are produced in <= ~2 ms (draw side) + ~2.5 ms (pump) slices per frame, most recently
 *     drawn first; big layers (logo, world canvases) are produced step by step (generators, full-resolution fills in bands). A canvas that was never
 *     built is of course made when it is first asked for. Background work (warm-up queue, world jobs, logo, overlay) runs in idle callbacks; when
 *     those starve (didTimeout) or while a scale change is being migrated a requestAnimationFrame pump spends <= 3 ms per frame (X2).
 *   - Sprites are authored by 11_gfx_cast.js with GFX.define(name, {w, h, frames, pad:{l,r,t,b}, draw(ctx, frame, opts)}).
 *     draw() paints ONE frame in LOGICAL units, origin = top-left of the w x h registry box, under a transform that already
 *     scales by the bake scale; opts = { k: bake scale (output px per logical px, for lwFor(k) / LOD), frame, frames, name,
 *     t: frame / frames (0..1 animation phase), bake: true, w, h (the box), ox, oy }.  Facing is always RIGHT (flip is a draw option, done
 *     by the blit).  ox, oy = where the box origin lies in the baked canvas in OUTPUT px: code that works in output px (NEON.placeSprite style)
 *     does  ctx.setTransform(1,0,0,1,0,0)  and draws its {x: opts.ox, y: opts.oy, k: opts.k} sprite there.
 *     pad = how far the luminous overdraw may extend beyond the box (logical px); GFX.draw(x, y) takes the BOX top-left and
 *     applies the pad itself (below k = 2 the bake adds a margin of (2 - k) * 1.5 logical px: chunkier strokes and glows reach further, X7).
 *     A missing pad defaults to 25 % of the box on every side.
 *
 *  PUBLIC API (everything else is private; underscore names are test hooks)
 *   GFX.init()                                   idempotent, cheap (no baking), starts the warm-up
 *   GFX.setScale(k)                              bake resolution (exact k); stale-while-revalidate re-bake, see above
 *   GFX.define(name, spec)                       register / replace a sprite (see above); returns true, false when malformed
 *   GFX.draw(ctx, name, frame, x, y, opts)       opts: flip, alpha (0..1), white (white silhouette), tint '#rrggbb' (tinted
 *                                                silhouette over the sprite, e.g. frozen ice), glow 0..1.5 (halo intensity, default 1; the core / halo
 *                                                split is made with canvas operations only: no getImageData, X4)
 *                                                unknown names draw a small labelled placeholder (warn once), never throw
 *   GFX.frames(name) / size(name) / has(name)    registry box (size) - unknown -> 0 / {w:0,h:0} / false
 *   GFX.warm(namesOrPrefixes?)                   bake these sprites (all frames) in the background, e.g. warm('kraken') before round 30; the next
 *                                                real round's Bonefin / Kraken / moon pearl are warmed by GFX itself (V10d)
 *   GFX.warmStep(ms = 3)                         NEW (additive): bake queued sprites for at most ms now (Main may call it with its frame headroom)
 *   GFX.text(ctx, s, x, y, color, opts)          opts: align 'left'|'center'|'right', scale (default 1), shadow (default true: soft dark
 *                                                halo), outline '#rrggbb', glow (default true), alpha; (x,y) = top-left of the 8x8 cell
 *                                                (glyph cap box = 6 x scale high, 1 x scale below the cell top); returns the width drawn.
 *                                                v3 font: wide round O against a narrow SLASHED zero, squarer D / B (O / 0 / D / B / 8 stay apart at k <= 1.5)
 *   GFX.textWidth(s, scale)                      8 * scale per glyph (code point)
 *   GFX.levelGlints(ctx, i, map, t)              optional, additive: travelling glints along the lit top faces (the baked canvas is static)
 *   GFX.levelCanvas(i, map) / bgCanvas(i)        256k x 208k canvases (draw at 0,MAP_Y with size 256 x 208); levelCanvas is transparent. After a scale
 *                                                change the previous canvas (another size) is returned until the new one is built: always draw them
 *                                                with an explicit 256 x 208 destination
 *   GFX.theme(i) -> {bg, accent, accent2, glow, edge, name}   '#rrggbb' strings (cached read-only object); round 1-5 = azure / lagoon crystal
 *   GFX.drawLogo(ctx, cx, y, t)                  glass-tube wordmark; returns {total, uy} (logical px width / underline y)
 *   GFX.postFX(ctx, quality)                     0 = nothing | 1 = vignette only | 2 = bloom at 1/4 res (pipelined over 2 frames: steady cost) + vignette + grain
 *   GFX.particle(ctx, kind, x, y, size, color, alpha, rot?)    cached ADDITIVE sprites ('lighter'; ctx composite/alpha restored), x,y = centre
 *                                                dot: size = core radius (halo reaches 4.2x) | ring: size = ring radius (thin neon line) |
 *                                                spark: size = 4-point star half size (glow 2.4x) | streak: size = full length, head at +x,
 *                                                rot (radians) turns it. Baked at a device-pixel size on a ~9 % ladder (drawn size = requested
 *                                                size rounded to the nearest rung, <= ~4.5 %) and blitted 1:1 at an integer device origin
 *   GFX.drawHero(ctx, who, x, y, scale, t, opts) NEW (V11): the big title / ending twins, see 9c below (who 'fizz'|'pop'); no GFX_CAST access needed
 *   GFX.drawBig(kind, ctx, x, y, scale, t, opts) NEW (V11): same for 'fizz' | 'pop' | 'kraken' | 'kraken_angry'
 *   GFX.sheet()                                  debug canvas of every defined sprite x frame (v3: labels never overlap the next cell)
 *
 *  Colours given to GFX are CSS strings ('#rrggbb', 'rgb()', 'rgba()') or NEON [r,g,b] arrays.
 *  Non-contract extras (tests only): GFX._registry(), _lint(), _timings(), _stats(), _warmNow(ms), _bgOff(on), _bgRun(ms), _sliceTop(), _stepLog(),
 *  _sheetLayout(), _reset(), _undefine(prefix), _postMode('fast'|'neon').
 *
 *  WORLD: levelCanvas / bgCanvas are baked by generators (steps of ~2-8 ms, bands for the full-resolution fills). The requested canvas is
 *  finished synchronously when it never existed; otherwise (a previous scale exists) it is rebuilt in the background. Building a REAL round i
 *  (its own map from LEVELS, not the title's custom ledges) queues its background and, ~1.5 s later, round i+1's level + background; so a round
 *  transition normally finds everything cached. levelCanvas is cached per (index, map content). Sizes: exactly 256 x k by 208 x k at every k (v3: no
 *  caps); bounded by count (4 + 4) and by pixels (0.9 x the sprite budget: the current and the next round stay, X5).
 */
const GFX = (() => {
  'use strict';
  const N = NEON;
  const { neon, glow, dot, sparkle, circlePath, rgba, mixc, hot, RGB, WHITE, TAU, clamp, lerp, parseColor, toHex, makeCanvas } = N;
  const LW = C.W, LH = C.H, TILE = C.TILE, MAP_Y = C.MAP_Y, MAP_H = LH - MAP_Y;       // 256, 224, 8, 16, 208
  const NOOPT = Object.freeze({});
  const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

  const lintLog = [];
  const lint = (msg) => { if (lintLog.length < 200) lintLog.push(msg); };
  const timings = Object.create(null);
  const timed = (name, fn) => { const t0 = now(); const r = fn(); timings[name] = (timings[name] || 0) + (now() - t0); return r; };
  const warnOnce = (() => { const seen = new Set(); return (key, msg) => { if (seen.has(key)) return; seen.add(key); lint(msg); try { console.warn('GFX: ' + msg); } catch (e) { /* no console */ } }; })();

  /* ================================================================================================================
   * 1. SCALE: ONE resolution. Everything that is baked (sprites, text tiles, particles, world canvases, logo, big heroes) is baked at the
   *    exact quantised scale K that Main gives (0.25 steps, 1..8), so every blit is 1:1 in device pixels (v3: no buckets, no resampling).
   *    A scale change re-bakes without a hitch (stale-while-revalidate, see 2b): the previous scale's bake keeps being drawn until its
   *    replacement exists, and the replacements are produced in <= 3 ms slices.
   * ============================================================================================================== */
  let K = 0;                // exact scale last given to setScale (0 = never set: the first draw adopts the ctx transform)
  let KB = 2;               // bake scale of the CURRENT generation (== K once set; kept as its own name for the old "bucket")
  let initDone = false;

  function maxPx() {        // sprite bake budget in pixels (4 bytes each), scaled by the device memory when the browser tells
    let gb = 4;
    try { if (typeof navigator !== 'undefined' && navigator.deviceMemory) gb = navigator.deviceMemory; } catch (e) { /* ignore */ }
    return gb >= 8 ? 24e6 : gb >= 4 ? 16e6 : 8e6;
  }
  let MAX_PX = 16e6;

  const state = { px: 0, clock: 0, bakes: 0, bakeMs: 0, evictions: 0, peakPx: 0, resets: 0, missing: 0, slices: 0, sliceMax: 0 };

  /* the re-bake budget: while a scale change is being migrated, draw-time re-bakes may spend MIG_DRAW_MS per frame (the rest of the
   * frame keeps drawing the previous bake); the background pump spends MIG_PUMP_MS per frame. mig.used is reset by the pump's rAF. */
  const MIG_DRAW_MS = 2, MIG_PUMP_MS = 2.5;
  const mig = { on: false, used: 0, t0: 0 };
  const migOK = () => {                                // the budget also refills by the clock (one window per ~frame), so a missing rAF pump can never freeze a re-bake
    if (!mig.on) return true;
    const t = now();
    if (t - mig.t0 > 14) { mig.t0 = t; mig.used = 0; }
    return mig.used < MIG_DRAW_MS;
  };
  const migCharge = (ms) => { if (mig.on) mig.used += ms; };
  let lastMs = 0;           // duration of the last bake (for migCharge)

  /* ================================================================================================================
   * 2. REGISTRY + BAKE CACHE
   * ============================================================================================================== */
  const REG = new Map();            // name -> def
  let ORDER = 0;

  function normPad(p, w, h) {
    const d = Math.max(2, Math.ceil(Math.max(w, h) * 0.25));
    if (p === undefined || p === null) return { l: d, r: d, t: d, b: d };
    if (typeof p === 'number') { const v = Math.max(0, +p || 0); return { l: v, r: v, t: v, b: v }; }
    const f = (v) => (v === undefined || v === null ? d : Math.max(0, +v || 0));
    return { l: f(p.l), r: f(p.r), t: f(p.t), b: f(p.b) };
  }
  /* X7: at small scales the contours are chunkier in logical units (1 device px minimum) and glows reach further, so the pad grows below k = 2 */
  const padBoost = (kb) => (kb < 2 ? (2 - kb) * 1.5 : 0);

  function define(name, spec) {
    if (typeof name !== 'string' || !name || !spec || typeof spec.draw !== 'function') { lint('define: malformed ' + name); return false; }
    const w = Math.max(1, +spec.w || 16), h = Math.max(1, +spec.h || 16), n = Math.max(1, Math.floor(+spec.frames || 1));
    const old = REG.get(name);
    if (old) releaseDef(old);
    const def = { name, w, h, frames: n, pad: normPad(spec.pad, w, h), draw: spec.draw, slots: new Array(n), order: ORDER++, lazy: spec.lazy === true || /^(kraken|moonpearl)/.test(name), errors: 0 };
    REG.set(name, def);
    if (initDone && !def.lazy) queueWarm([def]);
    return true;
  }
  const has = (name) => REG.has(name);
  const frames = (name) => { const d = REG.get(name); return d ? d.frames : 0; };
  const size = (name) => { const d = REG.get(name); return d ? { w: d.w, h: d.h } : { w: 0, h: 0 }; };

  function entryPx(e) {
    let p = e.w * e.h;
    if (e.white) p += e.w * e.h;
    if (e.tints) p += e.tints.size * e.w * e.h;
    if (e.gl) p += 2 * e.w * e.h;
    return p;
  }
  function releaseEntry(e) {
    state.px -= e.px;
    if (state.px < 0) state.px = 0;
    // shrink the backing stores so the memory goes back to the browser right away
    e.cv.width = 1; e.cv.height = 1;
    if (e.white) { e.white.width = 1; e.white.height = 1; }
    if (e.tints) for (const c of e.tints.values()) { c.width = 1; c.height = 1; }
    if (e.gl) { e.gl.core.width = 1; e.gl.core.height = 1; e.gl.halo.width = 1; e.gl.halo.height = 1; }
    e.cv = null; e.white = null; e.tints = null; e.gl = null;
  }
  function releaseDef(def) {
    for (let f = 0; f < def.slots.length; f++) { const e = def.slots[f]; if (e) { releaseEntry(e); def.slots[f] = undefined; } }
  }

  /* bake one frame of a (possibly pseudo) def at the current scale */
  function bakeInto(def, f) {
    const t0 = now(), kb = KB, p = def.pad, xb = padBoost(kb);
    const pl = Math.ceil((p.l + xb) * kb), pr = Math.ceil((p.r + xb) * kb), pt = Math.ceil((p.t + xb) * kb), pb = Math.ceil((p.b + xb) * kb);
    const cw = Math.max(1, Math.ceil(def.w * kb)) + pl + pr, ch = Math.max(1, Math.ceil(def.h * kb)) + pt + pb;
    const cv = makeCanvas(cw, ch), g = cv.getContext('2d');
    g.setTransform(kb, 0, 0, kb, pl, pt);
    try { def.draw(g, f, { k: kb, frame: f, frames: def.frames, name: def.name, t: f / def.frames, bake: true, ox: pl, oy: pt, w: def.w, h: def.h }); }
    catch (e) { def.errors++; warnOnce('bake:' + def.name, 'sprite ' + def.name + ' frame ' + f + ' threw: ' + (e && e.message)); }
    const e = { cv, w: cw, h: ch, pl, pr, pt, pb, bw: def.w, px: cw * ch, last: ++state.clock, kb, white: null, tints: null, gl: null };
    state.px += e.px; state.bakes++; lastMs = now() - t0; state.bakeMs += lastMs;
    if (state.px > state.peakPx) state.peakPx = state.px;
    return e;
  }
  function bake(def, f) {
    const old = def.slots[f];
    const e = bakeInto(def, f);
    def.slots[f] = e;
    if (old) releaseEntry(old);                       // the previous scale's bake of this frame is no longer needed
    if (state.px > MAX_PX) evict(e);
    return e;
  }
  function evict(keep) {
    const list = [];
    for (const def of REG.values()) for (let f = 0; f < def.slots.length; f++) { const e = def.slots[f]; if (e && e !== keep) list.push([e, def, f, e.last - (e.kb !== KB ? 1e12 : 0)]); }   // stale (previous scale) entries go first
    list.sort((a, b) => a[3] - b[3]);
    const target = MAX_PX * 0.8;
    for (let i = 0; i < list.length && state.px > target; i++) { releaseEntry(list[i][0]); list[i][1].slots[list[i][2]] = undefined; state.evictions++; }
  }

  /* derived variants (white silhouette / tinted silhouette / halo split) are built lazily from the normal bake */
  function copyOf(e) {
    const c = makeCanvas(e.w, e.h), g = c.getContext('2d');
    g.drawImage(e.cv, 0, 0);
    return c;
  }
  function whiteOf(e) {
    if (e.white) return e.white;
    const c = copyOf(e), g = c.getContext('2d');
    g.globalCompositeOperation = 'source-in'; g.fillStyle = '#ffffff'; g.fillRect(0, 0, e.w, e.h);
    e.white = c; e.px = entryPx(e); state.px += e.w * e.h;
    return c;
  }
  /** multiply colour for a tint: the tint lifted towards white (28 % of the way, e.g. '#4fc8ff' -> about '#80d7ff' */
  function mulTone(key) {
    const c = parseColor(key), m = (v) => Math.round(clamp(v + (255 - v) * 0.28, 0, 255));
    return toHex([m(c[0]), m(c[1]), m(c[2])]);
  }
  function tintOf(e, tint) {
    const key = typeof tint === 'string' ? tint : toHex(parseColor(tint));
    if (e.tints) { const c = e.tints.get(key); if (c) return c; }
    else e.tints = new Map();
    if (e.tints.size >= 4) { const k0 = e.tints.keys().next().value; const old = e.tints.get(k0); old.width = 1; old.height = 1; e.tints.delete(k0); state.px -= e.w * e.h; }
    const c = copyOf(e), g = c.getContext('2d');
    g.globalCompositeOperation = 'color';
    if (g.globalCompositeOperation === 'color') {
      // integrator v2.0: the tint replaces hue + saturation only ('color' blend) and keeps the sprite's own luminance, so the white-hot contour, the dark body, eyes and
      // gears stay readable (the old source-atop 60 % fill turned every body into a flat pale blob); then the lit parts are lifted a little (ice glow)
      g.fillStyle = key; g.fillRect(0, 0, e.w, e.h);
      // a luminance-keeping blend leaves light bodies (amber Nibbler, lime Springle) near white, so the lit parts are pulled towards the tint with a multiply first
      g.globalCompositeOperation = 'multiply'; g.fillStyle = mulTone(key); g.fillRect(0, 0, e.w, e.h);
      g.globalCompositeOperation = 'destination-in'; g.drawImage(e.cv, 0, 0);               // back to the sprite's own alpha (halo included)
      const t2 = makeCanvas(e.w, e.h); t2.getContext('2d').drawImage(c, 0, 0);
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.4; g.drawImage(t2, 0, 0);
      t2.width = 1; t2.height = 1;
    } else {                                                                                 // no blend modes (very old engines): flat tint
      g.globalCompositeOperation = 'source-atop';
      g.globalAlpha = 0.6; g.fillStyle = key; g.fillRect(0, 0, e.w, e.h);                    // the body takes the tint ...
      g.globalAlpha = 0.18; g.globalCompositeOperation = 'lighter'; g.drawImage(e.cv, 0, 0); // ... and the whole silhouette is a little brighter (ice)
    }
    e.tints.set(key, c); state.px += e.w * e.h; e.px = entryPx(e);
    return c;
  }
  /* halo split for opts.glow (X4: NO getImageData / GPU read-back): a soft alpha-threshold mask is built with canvas operations only
   * (alpha squared twice by self 'destination-in', doubled by 'lighter' -> ~0 below alpha 0.55, ~1 above 0.85); core = sprite x mask,
   * halo = sprite x (1 - mask), so core + halo ('lighter') = the original sprite exactly. */
  function glowOf(e) {
    if (e.gl) return e.gl;
    const w = e.w, h = e.h;
    const mask = makeCanvas(w, h), mg = mask.getContext('2d'), tmp = makeCanvas(w, h), tg = tmp.getContext('2d');
    mg.drawImage(e.cv, 0, 0);
    for (let i = 0; i < 2; i++) {
      tg.globalCompositeOperation = 'copy'; tg.drawImage(mask, 0, 0);
      mg.globalCompositeOperation = 'destination-in'; mg.drawImage(tmp, 0, 0);
    }
    tg.globalCompositeOperation = 'copy'; tg.drawImage(mask, 0, 0);
    mg.globalCompositeOperation = 'lighter'; mg.drawImage(tmp, 0, 0);
    const core = copyOf(e), cg = core.getContext('2d');
    cg.globalCompositeOperation = 'destination-in'; cg.drawImage(mask, 0, 0);
    tg.globalCompositeOperation = 'copy'; tg.fillStyle = '#000'; tg.fillRect(0, 0, w, h);          // inverse mask: opaque minus mask
    tg.globalCompositeOperation = 'destination-out'; tg.drawImage(mask, 0, 0);
    const halo = copyOf(e), hg = halo.getContext('2d');
    hg.globalCompositeOperation = 'destination-in'; hg.drawImage(tmp, 0, 0);
    mask.width = 1; mask.height = 1; tmp.width = 1; tmp.height = 1;
    e.gl = { core, halo }; e.px = entryPx(e); state.px += 2 * w * h;
    return e.gl;
  }

  /* unknown names: a small labelled placeholder (a dashed magenta box with the name), baked like a sprite, never registered */
  const missing = new Map();
  function missingEntry(name) {
    let e = missing.get(name);
    if (e && e.kb === KB) return e;
    if (e) { state.px -= e.px; e.cv.width = 1; e.cv.height = 1; missing.delete(name); }
    if (missing.size >= 24) { const k0 = missing.keys().next().value; const o = missing.get(k0); state.px -= o.px; o.cv.width = 1; o.cv.height = 1; missing.delete(k0); }
    const label = String(name).slice(0, 5).toUpperCase();
    const def = {
      name, w: 16, h: 16, frames: 1, pad: { l: 2, r: 2, t: 2, b: 2 }, errors: 0,
      draw(g) {
        g.save(); g.fillStyle = 'rgba(40,0,30,0.55)'; g.fillRect(0.5, 0.5, 15, 15); g.restore();
        g.save(); g.setLineDash([1.6, 1.2]);
        neon(g, N.poly([[0.5, 0.5], [15.5, 0.5], [15.5, 15.5], [0.5, 15.5]], true), RGB.magenta, N.lwFor(KB), { halo: 0.6, hot: 0.4 });
        g.restore();
        N.drawText(g, label, 8, 6.6, 3.2, { col: RGB.magenta, align: 'center', track: 0.18, lw: Math.max(0.28, 1 / KB * 0.9), halo: 0.3, hot: 0.4 });
      },
    };
    e = bakeInto(def, 0);
    missing.set(name, e);
    state.missing++;
    return e;
  }

  /* ----------------------------------------------------------------------------------------------------------
   * GFX.draw
   * ------------------------------------------------------------------------------------------------------- */
  function autoScale(ctx) {
    let k = 1;
    try { const m = ctx.getTransform(); k = Math.hypot(m.a, m.b) || 1; } catch (e) { k = 1; }
    setScale(k);
  }

  /** blit one baked entry; its own scale (e.kb) decides the logical size, so a previous-scale bake is drawn at the right size (re-sampled) */
  function blit(ctx, e, cv, x, y, o) {
    const kb = e.kb, iK = 1 / (K || kb);
    const sx = Math.round(x / iK) * iK, sy = Math.round(y / iK) * iK;     // snap the box origin to the device pixel grid (no shimmer)
    const dw = e.w / kb, dh = e.h / kb, dy = sy - e.pt / kb;
    const a = o.alpha === undefined ? 1 : o.alpha;
    const ga = ctx.globalAlpha;
    if (a !== 1) { ctx.globalAlpha = ga * (a < 0 ? 0 : a); }
    if (o.flip) { ctx.save(); ctx.translate(2 * sx + e.bw, 0); ctx.scale(-1, 1); ctx.drawImage(cv, sx - e.pl / kb, dy, dw, dh); ctx.restore(); }   // mirrored about the box centre
    else ctx.drawImage(cv, sx - e.pl / kb, dy, dw, dh);
    if (a !== 1) ctx.globalAlpha = ga;
  }

  function draw(ctx, name, frame, x, y, opts) {
    const def = REG.get(name);
    if (!K) autoScale(ctx);
    const o = opts || NOOPT;
    if (def === undefined) {
      warnOnce('unknown:' + name, 'unknown sprite ' + name);
      const m = missingEntry(name);
      blit(ctx, m, m.cv, x, y, o);
      return;
    }
    let f = +frame;
    if (f !== f) f = 0;
    f = Math.floor(f);
    const n = def.frames;
    if (f >= n || f < 0) { f %= n; if (f < 0) f += n; if (!(f >= 0 && f < n)) f = 0; }
    let e = def.slots[f];
    if (e === undefined) e = bake(def, f);
    else if (e.kb !== KB && migOK()) { e = bake(def, f); migCharge(lastMs); }          // stale (previous scale): re-bake inside the per-frame slice, else keep drawing the old one
    e.last = ++state.clock;
    if (o.white) { blit(ctx, e, whiteOf(e), x, y, o); return; }
    if (o.tint) { blit(ctx, e, tintOf(e, o.tint), x, y, o); return; }
    const g = o.glow;
    if (g !== undefined && g !== 1 && g === g) {
      const gl = glowOf(e), gg = g < 0 ? 0 : g > 1.5 ? 1.5 : g, a = o.alpha === undefined ? 1 : o.alpha;
      blit(ctx, e, gl.core, x, y, o);
      const gco = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';       // core + halo (additive) = the original sprite
      blit(ctx, e, gl.halo, x, y, { flip: o.flip, alpha: a * (gg > 1 ? 1 : gg) });
      if (gg > 1) blit(ctx, e, gl.halo, x, y, { flip: o.flip, alpha: a * (gg - 1) });
      ctx.globalCompositeOperation = gco;
      return;
    }
    blit(ctx, e, e.cv, x, y, o);
  }

  /* ----------------------------------------------------------------------------------------------------------
   * 2b. BACKGROUND WORK: the warm-up queue (sprites), the world jobs (levels / backgrounds) and the logo job all run in small slices.
   *     Idle callbacks give big slices when the page has idle time; when they starve (busy page: didTimeout, timeRemaining() == 0) or while
   *     a scale change is being migrated, a requestAnimationFrame pump spends <= MIG_PUMP_MS (3 ms while starving) per frame.
   * ------------------------------------------------------------------------------------------------------- */
  let warmQ = [];
  const WARM_LIMIT = () => MAX_PX * 0.55;
  const PIPE_DEF = { name: '\u0000pipelines', frames: 1, slots: [] };

  function queueWarm(defs, front) {
    const add = [];
    for (const def of defs) for (let f = 0; f < def.frames; f++) { const s = def.slots[f]; if (!s || s.kb !== KB) add.push([def, f]); }
    warmQ = front ? add.concat(warmQ) : warmQ.concat(add);
    bgSchedule();
  }
  function rebuildWarm() {
    const stale = [];
    for (const def of REG.values()) for (let f = 0; f < def.frames; f++) { const s = def.slots[f]; if (s && s.kb !== KB) stale.push([def, f, s.last]); }
    stale.sort((a, b) => b[2] - a[2]);                                   // what was drawn most recently is re-baked first
    warmQ = stale.map((q) => [q[0], q[1]]);
    const defs = Array.from(REG.values()).filter((d) => !d.lazy).sort((a, b) => a.order - b.order);
    const add = [];
    for (const def of defs) for (let f = 0; f < def.frames; f++) if (!def.slots[f]) add.push([def, f]);
    warmQ = warmQ.concat(add);
    if (!pipesDone) warmQ.unshift([PIPE_DEF, 0]);
    bgSchedule();
  }
  function warmStep(budgetMs) {
    const t0 = now();
    let n = 0;
    while (warmQ.length && (now() - t0 < budgetMs || n === 0) && K) {
      const q = warmQ.shift(), def = q[0], f = q[1];
      if (def === PIPE_DEF) { prewarmPipelines(); n++; continue; }
      if (REG.get(def.name) !== def) continue;
      const s = def.slots[f];
      if (s && s.kb === KB) continue;                                    // already current
      if (!s && state.px >= WARM_LIMIT()) continue;                      // new entries only within the warm budget (replacing a stale bake is memory neutral)
      bake(def, f); n++;
    }
    if (!warmQ.length && mig.on) { mig.on = false; mig.used = 0; partOldDrop(); }       // migration finished: everything recently drawn is re-baked
    return n;
  }
  function warm(what) {
    if (what === undefined) { rebuildWarm(); return; }
    const list = Array.isArray(what) ? what : [what];
    const defs = [];
    for (const w of list) for (const def of REG.values()) if (def.name === w || def.name.indexOf(w) === 0) defs.push(def);
    queueWarm(defs, true);
  }

  /* GPU pipeline pre-exercise (X4): the distinct blend / paint / filter signatures the game uses later (lighter gradients, multiply, 'color',
   * destination-in/out, blur filter ...) are drawn once into a tiny canvas during warm-up, so no shader / pipeline is first compiled mid-game. */
  let pipesDone = false;
  function prewarmPipelines() {
    pipesDone = true;
    try {
      const c = makeCanvas(8, 8), g = c.getContext('2d');
      const lg = g.createLinearGradient(0, 0, 8, 0); lg.addColorStop(0, 'rgba(255,255,255,0.5)'); lg.addColorStop(1, 'rgba(0,128,255,0.5)');
      const rg = g.createRadialGradient(4, 4, 0, 4, 4, 4); rg.addColorStop(0, 'rgba(255,255,255,0.5)'); rg.addColorStop(1, 'rgba(255,0,128,0)');
      for (const op of ['lighter', 'source-over', 'multiply', 'color', 'screen']) {
        g.globalCompositeOperation = op;
        g.fillStyle = lg; g.fillRect(0, 0, 8, 8); g.fillStyle = rg; g.fillRect(0, 0, 8, 8); g.fillStyle = 'rgba(255,200,100,0.5)'; g.fillRect(1, 1, 4, 4);
        g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, 2); g.lineTo(8, 6); g.stroke();
        g.globalAlpha = 0.5; g.drawImage(c, 1, 1, 6, 6); g.globalAlpha = 1;
      }
      if (g.createConicGradient) { const cg = g.createConicGradient(0, 4, 4); cg.addColorStop(0, '#f0f'); cg.addColorStop(1, '#0ff'); g.globalCompositeOperation = 'lighter'; g.strokeStyle = cg; g.lineWidth = 2; g.beginPath(); g.arc(4, 4, 3, 0, TAU); g.stroke(); }
      for (const op of ['destination-in', 'destination-out', 'source-in', 'source-atop', 'copy']) { g.globalCompositeOperation = op; g.drawImage(c, 0, 0); }
      g.globalCompositeOperation = 'source-over';
      if (canFilter()) { g.filter = 'blur(1px)'; g.drawImage(c, 0, 0); g.filter = 'none'; }
      c.width = 1; c.height = 1;
    } catch (e) { /* a pipeline we cannot exercise is simply compiled on first use */ }
  }

  let idleH = 0, rafH = 0, idleReq = 0, bgOff = false;
  function bgBusy() { return warmQ.length > 0 || !!jobCur || jobQ.length > 0 || !!logoJob || !!ovJob; }
  const sliceTop = [];                                                   // test hook: the 8 longest slices {ms, what}
  function bgRun(ms) {                                                   // one slice: world job step(s) first (the biggest stale thing), then the logo, then sprites
    const t0 = now();
    let did = false, what = '';
    try {
      for (let guard = 0; guard < 600; guard++) {
        const left = ms - (now() - t0);
        if (did && left <= 0) break;
        if (logoJob && (!did || left > 1)) { logoStep(); did = true; what += 'L'; continue; }               // big stale layers first: drawing them re-sampled is the expensive part
        if ((jobCur || jobQ.length) && jobPumpOne(left, did)) { did = true; what += 'W'; continue; }
        if (ovJob && (!did || left > 1)) { ovStep(); did = true; what += 'O'; continue; }
        if (warmQ.length) { warmStep(Math.max(0.5, left)); did = true; what += 'S'; continue; }
        break;
      }
    } catch (e) { warnOnce('bg', 'background bake failed: ' + (e && e.message)); jobCur = null; logoJob = null; }
    const dt = now() - t0;
    state.slices++; if (dt > state.sliceMax) state.sliceMax = dt;
    if (did && (sliceTop.length < 8 || dt > sliceTop[sliceTop.length - 1].ms)) { sliceTop.push({ ms: +dt.toFixed(1), what: what.slice(0, 12) }); sliceTop.sort((a, b) => b.ms - a.ms); if (sliceTop.length > 8) sliceTop.pop(); }
    return did;
  }
  function bgIdle(dl) {
    idleH = 0;
    if (typeof document !== 'undefined' && document.hidden) { bgSchedule(); return; }
    const rem = dl && dl.timeRemaining ? dl.timeRemaining() : 5;
    const budget = dl && dl.didTimeout ? 3 : Math.min(10, rem - 1.5);
    if (budget >= 1.5 && K) bgRun(budget);
    bgSchedule();
  }
  function bgFrame() {
    rafH = 0;
    mig.used = 0; mig.t0 = now();
    const starved = idleH !== 0 && now() - idleReq > 120;               // an idle callback has been pending for > 120 ms: the page is too busy for idle time
    if (K && (mig.on || starved)) bgRun(mig.on ? MIG_PUMP_MS : 3);
    bgSchedule();
  }
  function bgSchedule() {
    if (bgOff || !initDone || !K || !bgBusy()) { if (!bgBusy() && mig.on && !warmQ.length) { mig.on = false; mig.used = 0; partOldDrop(); } return; }
    try {
      if (!idleH) { idleReq = now(); idleH = typeof requestIdleCallback === 'function' ? requestIdleCallback(bgIdle, { timeout: 300 }) : setTimeout(() => bgIdle(null), 40); }
      if (!rafH && typeof requestAnimationFrame === 'function') rafH = requestAnimationFrame(bgFrame);
    } catch (e) { idleH = 0; rafH = 0; }
  }
  /** Public: bake queued sprites for at most `ms` (default 3); Main can call it with its frame headroom. Returns the number of frames baked. */
  function warmPublic(ms) { if (!K) return 0; return warmStep(ms === undefined ? 3 : ms); }

  /* ----------------------------------------------------------------------------------------------------------
   * setScale / init / reset
   * ------------------------------------------------------------------------------------------------------- */
  function dropAll() {                       // full release (tests / _reset); a normal scale change never calls this
    for (const def of REG.values()) releaseDef(def);
    for (const e of missing.values()) { e.cv.width = 1; e.cv.height = 1; }
    missing.clear();
    state.px = 0;
    fonts.forEach((fo) => { for (const t of fo.tiles.values()) { t.cv.width = 1; t.cv.height = 1; } });
    fonts.clear(); state.tilePx = 0; dropStrings();
    partDrop();
    dropWorld();
    dropBig();
    ovCache = null; ovLow = null; ovJob = null;
    releaseBloom();
    mig.on = false; mig.used = 0;
  }
  function setScale(k) {
    k = +k;
    if (!(k > 0)) k = 1;
    k = clamp(Math.round(k * 4) / 4, 1, 8);
    K = k;
    if (k !== KB) {
      const oldK = KB;
      KB = k; state.resets++; staleClock = state.clock;
      if (initDone) partMigrate(oldK); else partDrop();                     // particles are keyed by device size: re-baked on use, the old ones are drawn while the slice is spent
      if (initDone) { mig.on = true; mig.used = 0; mig.t0 = now(); }                  // (without init() there is no background pump: stale bakes are simply re-baked on use)
      rebuildWarm();
    } else bgSchedule();
  }
  function init() {
    if (initDone) return;
    initDone = true;
    MAX_PX = maxPx();
    rebuildWarm();
  }
  function _reset() { dropAll(); warmQ = []; }
  function _undefine(prefix) { let n = 0; for (const [name, def] of Array.from(REG.entries())) if (name.indexOf(prefix) === 0) { releaseDef(def); REG.delete(name); n++; } warmQ = warmQ.filter((q) => q[0] === PIPE_DEF || REG.get(q[0].name) === q[0]); return n; }

  /* ================================================================================================================
   * 3. TEXT: the stroke font, 8 logical px advance per glyph, glyph tiles baked per (colour, scale, flags) at the exact scale K.
   *    A tile / string carries the scale it was baked at (kb): after a scale change the old ones keep being drawn (re-sampled) until
   *    they are re-baked inside the per-frame slice.
   * ============================================================================================================== */
  const fonts = new Map();            // "color|scale|flags" -> { s, col, tiles: Map(ch -> tile), ... }
  state.tilePx = 0;
  const TILE_MAX_PX = 4e6;
  const colorCache = new Map();
  function colorOf(c) {           // -> [r,g,b,a]
    if (Array.isArray(c)) return c.length > 3 ? c : [c[0], c[1], c[2], 1];
    let v = colorCache.get(c);
    if (!v) { if (colorCache.size > 200) colorCache.clear(); v = parseColor(c); colorCache.set(c, v); }
    return v;
  }
  function fontFor(color, s, shadow, glowOn, outline) {
    const key = (typeof color === 'string' ? color : toHex(colorOf(color))) + '|' + s + '|' + (shadow ? 1 : 0) + (glowOn ? 1 : 0) + (outline || '');
    let f = fonts.get(key);
    if (f) return f;
    if (fonts.size >= 96) { for (const old of fonts.values()) for (const t of old.tiles.values()) { t.cv.width = 1; t.cv.height = 1; } fonts.clear(); state.tilePx = 0; dropStrings(); }
    f = { key, s, col: colorOf(color), shadow, glowOn, outline: outline ? colorOf(outline) : null, tiles: new Map(), pad: 0 };
    fonts.set(key, f);
    return f;
  }
  function wipeTiles() {
    for (const fo of fonts.values()) { for (const t of fo.tiles.values()) { t.cv.width = 1; t.cv.height = 1; } fo.tiles.clear(); }
    state.tilePx = 0; dropStrings();
  }
  function bakeTile(font, ch) {
    const t0 = now();
    const s = font.s, kb = KB, cap = 6 * s, cell = 8 * s;
    const lw = Math.max(cap * 0.08, 1.1 / kb);
    const pad = Math.ceil((lw * 3 + 0.4) * kb);
    const cellPx = Math.ceil(cell * kb), cw = cellPx + 2 * pad;
    const old = font.tiles.get(ch);
    if (old) { state.tilePx -= old.w * old.w; old.cv.width = 1; old.cv.height = 1; font.tiles.delete(ch); }
    if (state.tilePx > TILE_MAX_PX) wipeTiles();
    const cv = makeCanvas(cw, cw), g = cv.getContext('2d');
    g.setTransform(kb, 0, 0, kb, pad, pad);
    const path = N.textPath(ch, 0, s * 1, cap, 0, false, cell / cap);
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (font.shadow) {
      g.strokeStyle = 'rgba(2,4,10,0.22)'; g.lineWidth = lw * 6; g.stroke(path);
      g.strokeStyle = 'rgba(2,4,10,0.42)'; g.lineWidth = lw * 3.4; g.stroke(path);
    }
    if (font.outline) { g.strokeStyle = rgba(font.outline, 0.92 * font.outline[3]); g.lineWidth = lw * 3.4; g.stroke(path); }
    neon(g, path, font.col, lw, { a: font.col[3], halo: font.glowOn ? 0.8 : 0, hot: font.glowOn ? 0.6 : 0.3 });
    const t = { cv, pad, w: cw, kb };
    font.tiles.set(ch, t);
    state.tilePx += cw * cw;
    migCharge(now() - t0);
    return t;
  }
  /** the tile of a glyph: current scale when it can be had inside the slice, else the previous scale's tile (re-sampled), else baked now */
  function tileFor(font, ch) {
    const t = font.tiles.get(ch);
    if (t === undefined) return bakeTile(font, ch);
    if (t.kb !== KB && migOK()) return bakeTile(font, ch);
    return t;
  }
  const textWidth = (str, scale) => Array.from(String(str === undefined || str === null ? '' : str)).length * 8 * (scale > 0 ? scale : 1);

  /* whole strings that are drawn again and again (labels, HUD captions) are composed ONCE from the glyph tiles into one canvas:
   * one drawImage per string per frame. A string is promoted on its 3rd draw, so a counter that changes every frame never pays for it. */
  const strCache = new Map(), strSeen = new Map();
  const STR_MAX = 96, STR_MAX_PX = 2.5e6;
  let strPx = 0;
  function dropStrings() { for (const e of strCache.values()) { e.cv.width = 1; e.cv.height = 1; } strCache.clear(); strSeen.clear(); strPx = 0; }
  function buildString(font, key, chars) {
    const t0 = now();
    const s = font.s, kb = KB, cellPx = 8 * s * kb;
    let first = font.tiles.get('A');
    if (!first || first.kb !== kb) first = bakeTile(font, 'A');          // gives the tile pad of this font
    const pad = first.pad, w = Math.ceil(chars.length * cellPx) + 2 * pad, h = Math.ceil(cellPx) + 2 * pad;
    const old = strCache.get(key);
    if (old) { strPx -= old.w * old.h; old.cv.width = 1; old.cv.height = 1; strCache.delete(key); }
    while (strCache.size >= STR_MAX || strPx + w * h > STR_MAX_PX) { const k0 = strCache.keys().next().value; if (k0 === undefined) break; const o = strCache.get(k0); strPx -= o.w * o.h; o.cv.width = 1; o.cv.height = 1; strCache.delete(k0); }
    const cv = makeCanvas(w, h), g = cv.getContext('2d');
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (ch === ' ') continue;
      let t = font.tiles.get(ch);
      if (!t || t.kb !== kb) t = bakeTile(font, ch);
      g.drawImage(t.cv, Math.round(i * cellPx), 0);                     // the tile carries its own pad, so origin = cell origin - pad
    }
    const e = { cv, w, h, pad, kb };
    strCache.set(key, e); strPx += w * h;
    migCharge(now() - t0);
    return e;
  }

  function text(ctx, str, x, y, color, opts) {
    str = String(str === undefined || str === null ? '' : str);
    if (!str) return 0;
    if (!K) autoScale(ctx);
    const o = opts || NOOPT;
    const s = o.scale > 0 ? Math.round(o.scale * 4) / 4 : 1;
    const font = fontFor(color === undefined ? '#fff' : color, s, o.shadow !== false, o.glow !== false, o.outline);
    const chars = Array.from(str), cell = 8 * s, w = chars.length * cell;
    const x0 = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
    const kk = K || KB;
    const ga = ctx.globalAlpha, a = o.alpha === undefined ? 1 : o.alpha;
    if (a !== 1) ctx.globalAlpha = ga * a;
    let done = false;
    if (chars.length >= 3) {
      const key = font.key + '\u0001' + str;
      let e = strCache.get(key);
      if (e) {
        strCache.delete(key); strCache.set(key, e);
        if (e.kb !== KB && migOK()) e = buildString(font, key, chars);
      } else {
        const n = (strSeen.get(key) || 0) + 1;
        if (strSeen.size > 600) strSeen.clear();
        strSeen.set(key, n);
        if (n >= 3) e = buildString(font, key, chars);
      }
      if (e) {
        const sx = Math.round(x0 * kk) / kk, sy = Math.round(y * kk) / kk;
        ctx.drawImage(e.cv, sx - e.pad / e.kb, sy - e.pad / e.kb, e.w / e.kb, e.h / e.kb); done = true;
      }
    }
    if (!done) {
      const sy = Math.round(y * kk), sx0 = Math.round(x0 * kk);
      for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];
        if (ch === ' ') continue;
        const t = tileFor(font, ch), pd = Math.round(t.pad * kk / t.kb);
        const dx = sx0 + Math.round(i * cell * kk) - pd;                                       // device px of the tile origin (an integer: the tile is drawn 1:1, same spacing as a composed string)
        ctx.drawImage(t.cv, dx / kk, (sy - pd) / kk, t.w / t.kb, t.w / t.kb);
      }
    }
    if (a !== 1) ctx.globalAlpha = ga;
    return w;
  }

  /* ================================================================================================================
   * 4. PARTICLES: cached additive sprites baked at a DEVICE pixel size (quantised to ~9 % steps) and blitted 1:1 on the device grid
   *    (X3: no scaled 'lighter' blits, 4.6x the cost). The drawn size is therefore the requested size rounded to the nearest step (<= ~4.5 %).
   * ============================================================================================================== */
  let partCache = new Map(), partOld = null;          // partOld = { map, k }: the previous scale's sprites, drawn (re-sampled) while the new ones are re-baked in the per-frame slice
  const PART_MAX = 480;
  let partPx = 0;
  const PART_MAX_PX = () => MAX_PX * 0.3;
  const PART_E = { dot: 4.4, ring: 1.75, spark: 2.6, streak: 0.62 };      // half extent of the sprite in size units
  const KINDS = { dot: 1, ring: 1, spark: 1, streak: 1 };
  const PART_LADDER = (() => { const a = []; let p = 6; while (p <= 512) { a.push(p); p = Math.max(p + 2, Math.round(p * 1.09 / 2) * 2); } return a; })();
  function ladderOf(need) {                                          // nearest rung of the ladder (binary search)
    let lo = 0, hi = PART_LADDER.length - 1;
    if (need <= PART_LADDER[0]) return PART_LADDER[0];
    if (need >= PART_LADDER[hi]) return PART_LADDER[hi];
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (PART_LADDER[m] <= need) lo = m; else hi = m; }
    return need / PART_LADDER[lo] < PART_LADDER[hi] / need ? PART_LADDER[lo] : PART_LADDER[hi];
  }
  function partRelease(m) { for (const cv of m.values()) { cv.width = 1; cv.height = 1; } m.clear(); }
  function partDrop() { partRelease(partCache); partPx = 0; if (partOld) { partRelease(partOld.map); partOld = null; } }
  function partMigrate(oldK) {                        // scale change: keep the old sprites as the stale generation
    if (partOld) partRelease(partOld.map);
    partOld = partCache.size && oldK ? { map: partCache, k: oldK } : null;
    if (!partOld) partRelease(partCache);
    partCache = new Map(); partPx = 0;
  }
  function partOldDrop() { if (partOld) { partRelease(partOld.map); partOld = null; } }
  function bakeParticle(kind, col, P) {
    const e = PART_E[kind];
    const w = P, h = kind === 'streak' ? Math.max(8, P >> 1) : P;
    const cv = makeCanvas(w, h), g = cv.getContext('2d');
    const u = w / (2 * e);                          // px per size unit
    const cx = w / 2, cy = h / 2;
    if (kind === 'dot') dot(g, cx, cy, u * 1, col, 1, { halo: 4.2 });
    else if (kind === 'ring') {
      neon(g, circlePath(cx, cy, u * 1), col, Math.max(1.15, u * 0.075), { halo: 1.1, hot: 0.55 });
    } else if (kind === 'spark') sparkle(g, cx, cy, u * 1, col, 1, 0);
    else {                                         // streak: comet, tail left, head right; size = length
      const L = u * 1.0 * (2 * e) * 0.8, x0 = cx - L / 2, x1 = cx + L / 2;
      const lw = Math.max(1.2, L * 0.05);
      g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
      const gr = g.createLinearGradient(x0, 0, x1, 0);
      gr.addColorStop(0, rgba(col, 0)); gr.addColorStop(0.7, rgba(col, 0.55)); gr.addColorStop(1, rgba(hot(col, 0.5), 1));
      g.strokeStyle = gr; g.lineWidth = lw * 3.2; g.globalAlpha = 0.3; g.beginPath(); g.moveTo(x0, cy); g.lineTo(x1, cy); g.stroke();
      g.globalAlpha = 1; g.lineWidth = lw; g.stroke();
      const g2 = g.createLinearGradient(x0, 0, x1, 0);
      g2.addColorStop(0, rgba(WHITE, 0)); g2.addColorStop(1, rgba(WHITE, 0.95));
      g.strokeStyle = g2; g.lineWidth = Math.max(0.8, lw * 0.4); g.beginPath(); g.moveTo(x0 + L * 0.3, cy); g.lineTo(x1, cy); g.stroke();
      g.restore();
      dot(g, x1, cy, lw * 0.9, col, 0.9, { halo: 3.2 });
    }
    return cv;
  }
  function particle(ctx, kind, x, y, size, color, alpha, rot) {
    alpha = alpha === undefined ? 1 : alpha;
    if (!(alpha > 0.003) || !(size > 0) || !KINDS[kind]) return;
    if (!K) autoScale(ctx);
    const c = colorOf(color === undefined ? '#fff' : color);
    const e = PART_E[kind], kk = K, want = size * 2 * e * kk;         // device px the sprite should cover
    if (kind === 'ring' && want > 320) {                             // a big thin ring is cheaper (and exact) as live strokes than as a 400+ px blit
      const gco = ctx.globalCompositeOperation;
      neon(ctx, circlePath(x, y, size), c, Math.max(1.15 / kk, 0.075 * size), { a: alpha * c[3], halo: 1.1, hot: 0.55 });
      ctx.globalCompositeOperation = gco;
      return;
    }
    const P = ladderOf(want);                                        // device px of the sprite (width)
    const key = kind + '|' + ((c[0] >> 3) << 10 | (c[1] >> 3) << 5 | (c[2] >> 3)) + '|' + P;
    let cv = partCache.get(key);
    if (cv) { partCache.delete(key); partCache.set(key, cv); }
    else {
      if (partOld && !migOK()) {                      // re-bake budget of this frame is spent: draw the previous scale's sprite of the same size
        const ok = kind + '|' + ((c[0] >> 3) << 10 | (c[1] >> 3) << 5 | (c[2] >> 3)) + '|' + ladderOf(size * 2 * e * partOld.k);
        const old = partOld.map.get(ok);
        if (old) { partBlit(ctx, old, x, y, old.width / partOld.k, old.height / partOld.k, c, alpha, rot, false); return; }
      }
      const t0 = now();
      const need = P * (kind === 'streak' ? Math.max(8, P >> 1) : P);
      while (partCache.size && (partCache.size >= PART_MAX || partPx + need > PART_MAX_PX())) { const k0 = partCache.keys().next().value; const o = partCache.get(k0); partPx -= o.width * o.height; o.width = 1; o.height = 1; partCache.delete(k0); }
      cv = bakeParticle(kind, [c[0] >> 3 << 3 | 4, c[1] >> 3 << 3 | 4, c[2] >> 3 << 3 | 4], P);
      partCache.set(key, cv); partPx += cv.width * cv.height;
      migCharge(now() - t0);
    }
    if (want > P * 1.06) partBlit(ctx, cv, x, y, want / kk, want / kk * cv.height / cv.width, c, alpha, rot, false);          // beyond the ladder (512 px): scaled to the requested size
    else partBlit(ctx, cv, x, y, cv.width / kk, cv.height / kk, c, alpha, rot, true);
  }
  function partBlit(ctx, cv, x, y, dw, dh, c, alpha, rot, exact) {
    const gco = ctx.globalCompositeOperation, ga = ctx.globalAlpha, kk = K;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = ga * alpha * c[3];
    if (rot) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.drawImage(cv, -dw / 2, -dh / 2, dw, dh); ctx.restore(); }
    else if (exact) ctx.drawImage(cv, Math.round(x * kk - cv.width / 2) / kk, Math.round(y * kk - cv.height / 2) / kk, dw, dh);   // integer device origin, 1:1
    else ctx.drawImage(cv, x - dw / 2, y - dh / 2, dw, dh);
    ctx.globalCompositeOperation = gco; ctx.globalAlpha = ga;
  }

  /* ================================================================================================================
   * 5. POST FX.  q0 = nothing | q1 = vignette only (sprite halos are baked) | q2 = bloom at 1/4 resolution + vignette + grain.
   *    The bloom is PIPELINED over two frames (A: frame -> thresholded mip chain, B: blur + merge) so its cost is the same every frame;
   *    the finished glow layer is added to the frame every frame (one nearest 2x blend).
   * ============================================================================================================== */
  let ovCache = null, ovLow = null, ovJob = null;
  const VIG = 0.62, GRAIN = 0.011;
  function vignetteInto(g, W, H, a) {
    const gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.34, W / 2, H / 2, Math.hypot(W, H) * 0.54);
    gr.addColorStop(0, 'rgba(2,3,8,0)'); gr.addColorStop(1, 'rgba(2,3,8,' + a + ')');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  /* the full-frame overlay (vignette, + grain at q2) is baked once per canvas size, in ~0.4 Mpx bands over background slices; until it is ready
   * postFX paints the vignette live (a gradient fill, no grain), so a resize / scale step never stalls on it. null = not ready. */
  function* overlayGen(job) {
    const { W, H, withGrain, cv } = job, g = cv.getContext('2d'), n = Math.max(1, Math.ceil(W * H / 4e5));
    for (let i = 0; i < n; i++) {
      const y0 = Math.floor(H * i / n), y1 = Math.floor(H * (i + 1) / n);
      g.save(); g.beginPath(); g.rect(0, y0, W, y1 - y0); g.clip();
      vignetteInto(g, W, H, VIG);
      if (withGrain) N.drawGrain(g, W, H, GRAIN);
      g.restore();
      yield;
    }
  }
  function ovStep() {
    const j = ovJob;
    if (!j) return;
    let r;
    try { r = j.gen.next(); } catch (e) { warnOnce('overlay', 'overlay failed: ' + (e && e.message)); r = { done: true }; }
    if (!r.done) return;
    ovJob = null;
    if (j.withGrain) { if (ovCache) { ovCache.cv.width = 1; ovCache.cv.height = 1; } ovCache = { W: j.W, H: j.H, cv: j.cv }; }
    else { if (ovLow) { ovLow.cv.width = 1; ovLow.cv.height = 1; } ovLow = { W: j.W, H: j.H, cv: j.cv }; }
  }
  function overlayFor(W, H, withGrain) {
    const slot = withGrain ? ovCache : ovLow;
    if (slot && slot.W === W && slot.H === H) return slot.cv;
    if (!ovJob || ovJob.W !== W || ovJob.H !== H || ovJob.withGrain !== withGrain) {
      if (ovJob) { ovJob.cv.width = 1; ovJob.cv.height = 1; }
      for (const o of [ovCache, ovLow]) if (o && (o.W !== W || o.H !== H)) { o.cv.width = 1; o.cv.height = 1; }       // only one size lives at a time
      if (ovCache && (ovCache.W !== W || ovCache.H !== H)) ovCache = null;
      if (ovLow && (ovLow.W !== W || ovLow.H !== H)) ovLow = null;
      ovJob = { W, H, withGrain, cv: makeCanvas(W, H), gen: null };
      ovJob.gen = overlayGen(ovJob);
    }
    if (bgOff || !initDone || typeof requestAnimationFrame !== 'function') { while (ovJob) ovStep(); return (withGrain ? ovCache : ovLow).cv; }      // no background pump: finish now
    bgSchedule();
    return null;
  }
  /* bloom, tuned for the software rasteriser: ONE soft bright-pass at 1/4 res, a blurred mip chain merged at LOW resolution, then the result
   * is smoothly lifted to 1/2 res and added to the frame with ONE nearest 2x blend (a bilinear 4x upscale of the whole frame alone costs
   * ~7 ms on a CPU raster). Same energy / gains as NEON.bloom. */
  let filterOK;
  function canFilter() {
    if (filterOK === undefined) {
      try { const g = makeCanvas(1, 1).getContext('2d'); filterOK = ('filter' in g) && ((g.filter = 'blur(1px)'), g.filter === 'blur(1px)'); } catch (e) { filterOK = false; }
    }
    return filterOK;
  }
  function blurTo(g, src, px) {
    g.globalCompositeOperation = 'copy';
    if (canFilter()) { g.filter = 'blur(' + px + 'px)'; g.drawImage(src, 0, 0); g.filter = 'none'; g.globalCompositeOperation = 'source-over'; return; }
    const d = Math.max(0.75, px * 0.9);
    g.globalAlpha = 1; g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-over';
    let n = 1;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { if (!ox && !oy) continue; n++; g.globalAlpha = 1 / n; g.drawImage(src, ox * d, oy * d); }
    g.globalAlpha = 1;
  }
  const BLOOM_CFG = [[1.2, 0.6], [2.0, 0.6], [2.6, 0.36], [3.2, 0.2]];     // [blur px, gain] for the four mip levels
  const bpool = new Map();                 // own work canvases (not NEON's shared LRU: the cached bloom layer must survive between frames)
  const bloomSt = { tick: 0, key: '', stage: 0, ready: false };
  function bwk(name, w, h) {
    let c = bpool.get(name);
    if (!c) { c = makeCanvas(w, h); bpool.set(name, c); }
    else if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'low';
    return [c, g];
  }
  /* stage A: frame -> 1/4 res, soft threshold (v -> v^4 by self-multiply), mip chain */
  function bloomStageA(ctx, W, H) {
    const cv = ctx.canvas, w2 = Math.max(4, W >> 1), h2 = Math.max(4, H >> 1);
    let w = w2, h = h2;
    const [from, g0] = bwk('gb_h', w, h); g0.globalCompositeOperation = 'copy'; g0.drawImage(cv, 0, 0, w, h);          // plain 2x2 box of the frame
    w = Math.max(4, w >> 1); h = Math.max(4, h >> 1);
    const [src, g] = bwk('gb_0', w, h);
    g.globalCompositeOperation = 'copy'; g.drawImage(from, 0, 0, w, h);
    const [t2, tg] = bwk('gb_t', w, h);
    tg.globalCompositeOperation = 'copy'; tg.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'multiply'; g.drawImage(t2, 0, 0);
    tg.globalCompositeOperation = 'copy'; tg.drawImage(src, 0, 0); g.drawImage(t2, 0, 0);
    g.globalCompositeOperation = 'lighter'; g.drawImage(src, 0, 0); g.drawImage(src, 0, 0);                          // restore the energy lost by the threshold
    g.globalCompositeOperation = 'source-over';
    let prev = src;
    for (let i = 1; i < BLOOM_CFG.length; i++) {
      w = Math.max(4, w >> 1); h = Math.max(4, h >> 1);
      const [c, cg] = bwk('gb_' + i, w, h); cg.globalCompositeOperation = 'copy'; cg.drawImage(prev, 0, 0, w, h); prev = c;
    }
  }
  /* stage B: blur + merge coarse -> fine at low resolution, lifted to 1/2 res */
  function bloomStageB(W, H) {
    const w2 = Math.max(4, W >> 1), h2 = Math.max(4, H >> 1);
    let acc = null;
    for (let i = BLOOM_CFG.length - 1; i >= 0; i--) {
      const lv = bpool.get('gb_' + i), [b, bg] = bwk('gb_b' + i, lv.width, lv.height);
      blurTo(bg, lv, BLOOM_CFG[i][0]);
      const [c, cg] = bwk('gb_a' + i, lv.width, lv.height);
      cg.globalCompositeOperation = 'copy'; cg.globalAlpha = BLOOM_CFG[i][1]; cg.drawImage(b, 0, 0);
      if (acc) { cg.globalCompositeOperation = 'lighter'; cg.globalAlpha = 1; cg.drawImage(acc, 0, 0, c.width, c.height); }
      cg.globalAlpha = 1; cg.globalCompositeOperation = 'source-over';
      acc = c;
    }
    const [, mg] = bwk('gb_m', w2, h2);
    mg.globalCompositeOperation = 'copy'; mg.drawImage(acc, 0, 0, w2, h2);
  }
  function bloomFast(ctx, W, H) {
    const key = W + 'x' + H;
    if (bloomSt.key !== key) { bloomSt.key = key; bloomSt.stage = 0; bloomSt.ready = false; }
    if (!bloomSt.ready) { bloomStageA(ctx, W, H); bloomStageB(W, H); bloomSt.stage = 0; bloomSt.ready = true; }   // first frame at this size: both stages, so a single call already blooms
    else if (bloomSt.stage === 0) { bloomStageA(ctx, W, H); bloomSt.stage = 1; }                    // afterwards the stages alternate: A (even frames), B (odd frames)
    else { bloomStageB(W, H); bloomSt.stage = 0; }
    bloomSt.tick++;
    if (!bloomSt.ready) return;
    const mid = bpool.get('gb_m');
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(mid, 0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'source-over';
  }
  function releaseBloom() { for (const c of bpool.values()) { c.width = 1; c.height = 1; } bpool.clear(); bloomSt.key = ''; bloomSt.ready = false; bloomSt.stage = 0; }
  function postFX(ctx, quality) {
    const q = quality === undefined ? 2 : quality | 0;
    if (q <= 0) return;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    if (W < 8 || H < 8) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = true;
    if (q >= 2) { try { if (postMode === 'neon') N.bloom(ctx, W, H, { shift: 2 }); else bloomFast(ctx, W, H); } catch (e) { warnOnce('bloom', 'bloom failed: ' + (e && e.message)); } }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    const ov = overlayFor(W, H, q >= 2);
    if (ov) ctx.drawImage(ov, 0, 0, W, H); else vignetteInto(ctx, W, H, VIG);
    ctx.restore();
  }
  let postMode = 'fast';
  function _postMode(m) { postMode = m; }

  /* ================================================================================================================
   * 6. THEMES: 6 themes x 5 variants = 30 looks (level i -> theme floor(i/5), variant i % 5)
   * ============================================================================================================== */
  const hexc = N.hex;
  function toHsl(c) {
    const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }
  function fromHsl(h, s, l) {
    h = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
    const q = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [(q[0] + m) * 255, (q[1] + m) * 255, (q[2] + m) * 255];
  }
  /* hue rotation (degrees), saturation and lightness factors */
  function tone(c, dh, fs, fl) { const h = toHsl(c); return fromHsl(h[0] + dh, clamp(h[1] * (fs === undefined ? 1 : fs), 0, 1), clamp(h[2] * (fl === undefined ? 1 : fl), 0, 1)); }

  /* Per theme: base look; per variant: [edge, accent, accent2, params]. Platforms stay DIMMER than life (creatures carry white-hot
   * cores and lit bodies); edges are pulled away from the cast's hues where the theme allows it (kelp = teal vs Springle lime, volcanic = deep
   * orange vs Crabbit ember, temple = indigo vs Jellop violet).  v3 (L1): NO PLAYER HUE ON ANY PLATFORM: no edge / body within 35 deg of Fizz's
   * magenta (328 deg) and none within 12 deg of Pop's cyan (186 deg) (the azure of the approved mockup, 199-215 deg, sits in the gap between Pop and
   * Glimmer's cobalt); Coral Reef (rounds 1-5) is azure / lagoon crystal with ROSE sea-fan accents. */
  const THEME_DEFS = [
    { name: 'Coral Reef', style: 'coral', bodyDh: -10, bgTint: '#07122a', haze: '#5aaaff', low: '#4a5cff', rows: [          // v3 (L1): azure / lagoon-teal crystal with ROSE sea-fan accents (the approved mockup): Fizz (pink) never stands on pink
      ['#3fb0e6', '#ff6f9c', '#7ad8ff', { step: 8.2, seed: 11 }],
      ['#36c4b0', '#ff8fb0', '#8affd8', { step: 7.4, seed: 12, dark: 0.3 }],
      ['#5aa8f0', '#ff6f9c', '#a8d4ff', { step: 9.0, seed: 13 }],
      ['#7ab8ec', '#ffa0b8', '#c0ecff', { step: 8.6, seed: 14, dark: 0.22 }],
      ['#3a8ee0', '#ff7aa8', '#8ac8ff', { step: 7.8, seed: 15 }],
    ] },
    { name: 'Kelp Forest', style: 'kelp', bodyDh: -10, bgTint: '#041418', haze: '#3cf2c0', low: '#1a8a6a', rows: [
      ['#2fe0a4', '#b6ff3b', '#3cf2ff', { step: 8.4, seed: 21 }],
      ['#7fb860', '#2fe0a4', '#ffe27a', { step: 7.6, seed: 22, dark: 0.3 }],
      ['#3a98d8', '#8aff8a', '#ff8ad0', { step: 9.2, seed: 23 }],
      ['#a0c070', '#3cf2ff', '#ffb23e', { step: 8.0, seed: 24, dark: 0.24 }],
      ['#3fe08a', '#d4ff5a', '#9a7cff', { step: 8.8, seed: 25 }],
    ] },
    { name: 'Sunken Ship', style: 'ship', bodyDh: -8, bgTint: '#080c1a', haze: '#ffb86a', low: '#7a4a1a', rows: [
      ['#d6a24c', '#3cf2ff', '#ff6a3d', { step: 9.4, seed: 31, dark: 0.34 }],
      ['#d98b4a', '#ffe27a', '#3cf2ff', { step: 10.0, seed: 32, dark: 0.36 }],
      ['#f4dc9c', '#ff8a5c', '#3d7bff', { step: 9.0, seed: 33, dark: 0.32 }],
      ['#ff9a5a', '#ffd23f', '#9a7cff', { step: 9.8, seed: 34, dark: 0.34 }],
      ['#ffc83a', '#ff6a3d', '#3cf2ff', { step: 9.2, seed: 35, dark: 0.3 }],
    ] },
    { name: 'Crystal Caves', style: 'caves', bodyDh: -12, bgTint: '#060d22', haze: '#3cf2ff', low: '#8a5cff', rows: [
      ['#3fb0e6', '#ff3ea5', '#3cf2ff', { step: 8.2, seed: 41, shard: 1.15 }],
      ['#3fd0c0', '#ffe27a', '#8a5cff', { step: 7.6, seed: 42, shard: 1.2 }],
      ['#c47cf0', '#ffb23e', '#3cf2ff', { step: 8.8, seed: 43, shard: 1.1 }],
      ['#a8d4f4', '#ff3ea5', '#8a5cff', { step: 7.8, seed: 44, shard: 1.25 }],
      ['#d0b4ff', '#ff3ea5', '#3cf2ff', { step: 8.4, seed: 45, shard: 1.0 }],
    ] },
    { name: 'Volcanic Vents', style: 'volcanic', bodyDh: -8, bgTint: '#150808', haze: '#ff7a3a', low: '#ff3a1a', rows: [
      ['#ffa868', '#ffb23e', '#ff3a3a', { step: 9.0, seed: 51, dark: 0.34 }],
      ['#ffcc66', '#ff5a3d', '#ffe27a', { step: 9.6, seed: 52, dark: 0.36 }],
      ['#ff8f7a', '#ffb23e', '#ff9a3a', { step: 8.8, seed: 53, dark: 0.32 }],
      ['#d0a0e8', '#ffd23f', '#c04aff', { step: 9.4, seed: 54, dark: 0.34 }],
      ['#ffd890', '#ff4a2a', '#ffe27a', { step: 9.2, seed: 55, dark: 0.3 }],
    ] },
    { name: 'Abyss Temple', style: 'temple', bodyDh: 14, bgTint: '#0b0924', haze: '#7a7cff', low: '#ffb23e', rows: [
      ['#6c7cff', '#ffd25a', '#3cf2ff', { step: 9.6, seed: 61, dark: 0.34 }],
      ['#5a98e0', '#ffd25a', '#ff6a8a', { step: 10.0, seed: 62, dark: 0.36 }],
      ['#4aa8e8', '#ffd25a', '#ff6a8a', { step: 9.2, seed: 63, dark: 0.32 }],
      ['#8a8cf0', '#ffe9a0', '#ff6a8a', { step: 9.8, seed: 64, dark: 0.34 }],
      ['#c89cf0', '#ffd25a', '#3cf2ff', { step: 9.4, seed: 65, dark: 0.3 }],
    ] },
  ];

  const themeCache = [];
  const themeOf = (i) => clamp(Math.floor(i / 5), 0, 5);
  function themeData(i) {
    i = clamp(i | 0, 0, 29);
    let d = themeCache[i];
    if (d) return d;
    const T = THEME_DEFS[themeOf(i)], v = i % 5, row = T.rows[v], base = hexc(T.rows[0][0]);
    const edge = hexc(row[0]), accent = hexc(row[1]), accent2 = hexc(row[2]), P = row[3];
    const dh = toHsl(edge)[0] - toHsl(base)[0];
    const dhb = clamp(dh * 0.2, -14, 14);
    const tint = tone(hexc(T.bgTint), dhb, 1.0, 1.0);
    d = {
      i, name: T.name, style: T.style, variant: v,
      edge, edgeHot: mixc(edge, WHITE, 0.62), body: tone(edge, T.bodyDh, 1.0, 0.8),
      accent, accent2, glow: mixc(edge, accent, 0.35),
      bgTop: tint, bgMid: mixc(tint, [3, 7, 15], 0.5), bgBot: mixc(tint, [2, 4, 10], 0.8),
      haze: tone(hexc(T.haze), dhb, 1, 1), low: tone(hexc(T.low), dhb, 1, 1),
      step: P.step || 8.2, seed: P.seed || 5, dark: P.dark === undefined ? 0.26 : P.dark, shard: P.shard || 1, tuft: P.tuft || 1,
    };
    themeCache[i] = d;
    return d;
  }
  const themePub = [];
  function theme(i) {
    i = clamp(i | 0, 0, 29);
    if (themePub[i]) return themePub[i];
    const d = themeData(i);
    return (themePub[i] = Object.freeze({ bg: toHex(d.bgTop), accent: toHex(d.accent), accent2: toHex(mixc(d.edge, WHITE, 0.3)), glow: toHex(d.glow), edge: toHex(d.edge), name: d.name }));
  }

  /* ================================================================================================================
   * 7. LEVEL CRYSTAL (levelCanvas): solid tiles -> directed boundary edges -> closed loops -> merged collinear vertices ->
   *    chamfered convex corners. The same polygon drives fill, facets, light columns, shards, edges and tufts, so merged
   *    tiles have NO seams. Baked once per (level, bucket) into a transparent canvas.
   * ============================================================================================================== */
  const geoCache = new Map();
  function buildLevelGeo(map) {
    const key = map.join('');
    const hit = geoCache.get(key);
    if (hit) { geoCache.delete(key); geoCache.set(key, hit); return hit; }
    const R = map.length, Cn = (map[0] || '').length || 32;
    const S = (c, r) => {
      if (c < -1 || c > Cn || r < 0 || r > R) return false;
      if (c < 0 || c >= Cn || r >= R) return true;
      return map[r][c] === '#';
    };
    const edges = new Map();
    const addE = (x0, y0, x1, y1) => { const k = x0 + ',' + y0; let a = edges.get(k); if (!a) edges.set(k, a = []); a.push({ x0, y0, x1, y1, used: false }); };
    for (let r = 0; r <= R; r++) for (let c = -1; c <= Cn; c++) {
      if (!S(c, r)) continue;
      if (!S(c, r - 1)) addE(c, r, c + 1, r);
      if (!S(c + 1, r)) addE(c + 1, r, c + 1, r + 1);
      if (!S(c, r + 1)) addE(c + 1, r + 1, c, r + 1);
      if (!S(c - 1, r)) addE(c, r + 1, c, r);
    }
    const loops = [];
    for (const list of edges.values()) for (const e0 of list) {
      if (e0.used) continue;
      const pts = [];
      let e = e0;
      while (e && !e.used) {
        e.used = true; pts.push([e.x0, e.y0]);
        const nx = edges.get(e.x1 + ',' + e.y1);
        let nxt = null;
        if (nx) {
          const cands = nx.filter((q) => !q.used);
          if (cands.length === 1) nxt = cands[0];
          else if (cands.length > 1) {                       // prefer a right turn (keeps loops tight around solid)
            const dx = e.x1 - e.x0, dy = e.y1 - e.y0;
            cands.sort((a, b) => (dx * (b.y1 - b.y0) - dy * (b.x1 - b.x0)) - (dx * (a.y1 - a.y0) - dy * (a.x1 - a.x0)));
            nxt = cands[0];
          }
        }
        e = nxt;
      }
      if (pts.length > 2) loops.push(pts);
    }
    const merged = loops.map((L) => {
      const n = L.length, out = [];
      for (let i = 0; i < n; i++) {
        const a = L[(i - 1 + n) % n], b = L[i], c = L[(i + 1) % n];
        if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) !== 0) out.push(b);
      }
      return out;
    });
    const CH = 0.3;                                          // chamfer in tiles
    const fillPath = new Path2D();
    const segs = [];                                         // {x0,y0,x1,y1,cls} in logical px
    const toX = (x) => x * TILE, toY = (y) => MAP_Y + y * TILE;
    for (const L of merged) {
      const n = L.length, P = [];
      if (n < 3) continue;
      for (let i = 0; i < n; i++) {
        const a = L[(i - 1 + n) % n], b = L[i], c = L[(i + 1) % n];
        const d1 = [Math.sign(b[0] - a[0]), Math.sign(b[1] - a[1])], d2 = [Math.sign(c[0] - b[0]), Math.sign(c[1] - b[1])];
        const cr = d1[0] * d2[1] - d1[1] * d2[0];
        if (cr > 0) { P.push([b[0] - d1[0] * CH, b[1] - d1[1] * CH]); P.push([b[0] + d2[0] * CH, b[1] + d2[1] * CH]); }
        else P.push([b[0], b[1]]);
      }
      fillPath.moveTo(toX(P[0][0]), toY(P[0][1]));
      for (let i = 1; i < P.length; i++) fillPath.lineTo(toX(P[i][0]), toY(P[i][1]));
      fillPath.closePath();
      for (let i = 0; i < P.length; i++) {
        const a = P[i], b = P[(i + 1) % P.length];
        const dx = b[0] - a[0], dy = b[1] - a[1];
        let cls;
        if (Math.abs(dx) > 1e-6 && Math.abs(dy) < 1e-6) cls = dx > 0 ? 'T' : 'B';
        else if (Math.abs(dy) > 1e-6 && Math.abs(dx) < 1e-6) cls = dy > 0 ? 'R' : 'L';
        else cls = dx > 0 && dy > 0 ? 'cTR' : dx < 0 && dy > 0 ? 'cBR' : dx < 0 && dy < 0 ? 'cBL' : 'cTL';
        segs.push({ x0: toX(a[0]), y0: toY(a[1]), x1: toX(b[0]), y1: toY(b[1]), cls });
      }
    }
    const solid = (x, y) => {                                // logical px -> solid?
      const c = Math.floor(x / TILE), r = Math.floor((y - MAP_Y) / TILE);
      if (c < 0 || c >= Cn || r >= R) return true;
      if (r < 0) return false;
      return map[r][c] === '#';
    };
    const geo = { R, Cn, fillPath, segs, solid };
    if (geoCache.size >= 8) geoCache.delete(geoCache.keys().next().value);
    geoCache.set(key, geo);
    return geo;
  }

  /* distance (logical px) from a point inside solid to the nearest exposed face, scanning 4 directions */
  const FD_DIRS = [[0, -1, 1.0], [-1, 0, 1.25], [1, 0, 1.25], [0, 1, 1.7]];
  function faceDist(geo, x, y, mx) {
    let best = mx;
    for (const d of FD_DIRS) {
      for (let s = 0; s < best / d[2]; s += 1.5) {
        if (!geo.solid(x + d[0] * s, y + d[1] * s)) { best = Math.min(best, s * d[2]); break; }
      }
    }
    return best;
  }

  /* a stroked straight edge whose alpha varies along its length (a linear gradient with a stop every ~5 px) */
  function modStroke(g, x0, y0, x1, y1, col, lw, aBase, haloK, hotK, modFn) {
    const len = Math.hypot(x1 - x0, y1 - y0), m = Math.max(2, Math.ceil(len / 5));
    const path = new Path2D(); path.moveTo(x0, y0); path.lineTo(x1, y1);
    const layers = [[lw * 3.4, 0.085 * haloK, col], [lw * 1.9, 0.18 * haloK, col], [lw, 0.92, col], [lw * 0.38, hotK, hot(col, 0.78)]];
    g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'butt'; g.lineJoin = 'round';
    for (const L of layers) {
      if (L[1] <= 0.002) continue;
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      for (let j = 0; j <= m; j++) { const u = j / m; gr.addColorStop(u, rgba(L[2], L[1] * aBase * (modFn ? modFn(u, x0 + (x1 - x0) * u, y0 + (y1 - y0) * u) : 1))); }
      g.strokeStyle = gr; g.lineWidth = L[0]; g.stroke(path);
    }
    g.restore();
  }

  /* crystal shards (thin triangles): dark occluder, tinted body, 2 luminous outlines, white-hot ridge. Collected, then drawn in a few batches. */
  function newShards() { return { dark: new Path2D(), groups: new Map() }; }
  function shard(B, x, y, dir, hgt, wid, lean, col, a) {
    const tx = x + lean, ty = y + dir * hgt;
    B.dark.moveTo(x - wid / 2, y); B.dark.lineTo(tx, ty); B.dark.lineTo(x + wid / 2, y); B.dark.closePath();
    const key = col[0] + ',' + col[1] + ',' + col[2] + '|' + a;
    let G = B.groups.get(key);
    if (!G) B.groups.set(key, G = { col, a, tri: new Path2D(), ridge: new Path2D() });
    G.tri.moveTo(x - wid / 2, y); G.tri.lineTo(tx, ty); G.tri.lineTo(x + wid / 2, y); G.tri.closePath();
    G.ridge.moveTo(x - wid * 0.1, y + dir * 0.2); G.ridge.lineTo(tx, ty);
  }
  function flushShards(g, B) {
    g.fillStyle = 'rgba(5,10,24,0.88)'; g.fill(B.dark);
    g.save(); g.globalCompositeOperation = 'lighter'; g.lineJoin = 'round'; g.lineCap = 'round';
    for (const G of B.groups.values()) {
      g.fillStyle = rgba(G.col, 0.12 * G.a); g.fill(G.tri);
      g.lineWidth = 1.3; g.strokeStyle = rgba(G.col, 0.08 * G.a); g.stroke(G.tri);
      g.lineWidth = 0.46; g.strokeStyle = rgba(G.col, 0.78 * G.a); g.stroke(G.tri);
      g.lineWidth = 0.18; g.strokeStyle = rgba(WHITE, 0.55 * G.a); g.stroke(G.ridge);
    }
    g.restore();
  }

  /* theme specific body texture inside the slab (called with the slab as the clip and 'lighter' compositing) */
  function bodyTexture(g, geo, th, Rn) {
    const e = th.edge, st = th.style;
    g.lineCap = 'round'; g.lineJoin = 'round';
    const stroke = (path, col, a, w) => { g.lineWidth = w; g.strokeStyle = rgba(col, a); g.stroke(path); };
    if (st === 'ship') {                                     // plank courses, staggered seams, nail heads (3 batched paths)
      const rowsP = new Path2D(), seamP = new Path2D(), nailP = new Path2D();
      for (let r = 0; r <= 26; r++) {
        const y = MAP_Y + r * TILE;
        rowsP.moveTo(0, y); rowsP.lineTo(LW, y);
        const off = (r * 13 + th.seed) % 26;
        for (let x = off; x < LW; x += 26 + (r % 3) * 5) {
          seamP.moveTo(x, y); seamP.lineTo(x, y + TILE);
          nailP.moveTo(x + 2.94, y + 2); nailP.arc(x + 2.6, y + 2, 0.34, 0, TAU);
          nailP.moveTo(x + 2.94, y + TILE - 2); nailP.arc(x + 2.6, y + TILE - 2, 0.34, 0, TAU);
        }
      }
      stroke(rowsP, e, 0.13, 0.22); stroke(seamP, e, 0.09, 0.22);
      g.fillStyle = rgba(hot(e, 0.5), 0.5); g.fill(nailP);
    } else if (st === 'temple') {                            // brick courses with offset joints
      const rowsP = new Path2D(), jointP = new Path2D();
      for (let r = 0; r <= 26; r++) {
        const y = MAP_Y + r * TILE;
        rowsP.moveTo(0, y); rowsP.lineTo(LW, y);
        for (let x = (r % 2) * 8; x < LW; x += 16) { jointP.moveTo(x, y); jointP.lineTo(x, y + TILE); }
      }
      stroke(rowsP, e, 0.2, 0.24); stroke(jointP, e, 0.16, 0.24);
    } else if (st === 'kelp') {                              // vertical fibres
      const pe = new Path2D(), pa = new Path2D();
      for (let n = 0; n < 36; n++) {
        const x0 = Rn.float(0, LW), amp = Rn.float(1.0, 2.6), ph = Rn.float(0, TAU), fr = Rn.float(0.05, 0.1), p = n % 3 ? pe : pa;
        for (let y = 0; y <= LH; y += 5) { const x = x0 + Math.sin(y * fr + ph) * amp; y ? p.lineTo(x, y) : p.moveTo(x, y); }
      }
      stroke(pe, e, 0.1, 0.3); stroke(pa, th.accent, 0.09, 0.3);
    } else if (st === 'coral') {                             // polyp knobs
      const ringP = new Path2D(), dotP = new Path2D();
      for (let n = 0; n < 130; n++) {
        const x = Rn.float(2, LW - 2), y = Rn.float(MAP_Y, LH - 2);
        if (!geo.solid(x, y) || faceDist(geo, x, y, 6) < 2.6) continue;
        const r = Rn.float(0.9, 1.9);
        ringP.moveTo(x + r, y); ringP.arc(x, y, r, 0, TAU);
        dotP.moveTo(x + r * 0.28, y); dotP.arc(x, y, r * 0.28, 0, TAU);
      }
      stroke(ringP, mixc(e, th.accent, 0.25), 0.2, 0.28);
      g.fillStyle = rgba(hot(e, 0.5), 0.34); g.fill(dotP);
    } else if (st === 'volcanic') {                          // glowing lava cracks
      const cr = new Path2D();
      for (let n = 0; n < 26; n++) {
        let x = Rn.float(4, LW - 4), y = Rn.float(MAP_Y + 2, LH - 4);
        if (!geo.solid(x, y)) continue;
        let a = Rn.float(0, TAU);
        cr.moveTo(x, y);
        const steps = Rn.int(4, 8);
        for (let s = 0; s < steps; s++) { a += Rn.float(-0.9, 0.9); x += Math.cos(a) * Rn.float(2.5, 5); y += Math.sin(a) * Rn.float(2, 4); cr.lineTo(x, y); }
      }
      stroke(cr, th.low, 0.09, 1.7); stroke(cr, th.accent, 0.5, 0.55); stroke(cr, WHITE, 0.4, 0.2);
    }
  }

  function tuftFan(g, x, y0, th, Rn, a) {
    const ph = Rn.float(0, TAU), pc = Rn.chance(0.7) ? th.accent : th.accent2, nf = 3 + (Rn.next() < 0.4 ? 1 : 0);
    const fil = new Path2D(), tips = [];
    for (let f = 0; f < nf; f++) {
      const ang = (f - (nf - 1) / 2) * 0.5 + Rn.float(-0.12, 0.12), hh = (2.3 + Rn.float(0, 2.0)) * a;
      const tx = x + Math.sin(ang) * hh, ty = y0 - Math.cos(ang) * hh;
      fil.moveTo(x, y0); fil.quadraticCurveTo(x + Math.sin(ang) * hh * 0.2, y0 - hh * 0.65, tx, ty); tips.push([tx, ty]);
    }
    g.save(); g.globalCompositeOperation = 'lighter'; g.lineWidth = 0.3; g.lineCap = 'round'; g.strokeStyle = rgba(pc, 0.62); g.stroke(fil); g.restore();
    for (const tp of tips) dot(g, tp[0], tp[1], 0.4, pc, 0.75, { halo: 3.4 });
  }
  function tuftBlade(g, x, y0, th, Rn) {                     // kelp: two leaning blades with glowing tips
    const pc = Rn.chance(0.6) ? th.accent : th.accent2;
    for (let b = 0; b < 2; b++) {
      const dir = b ? 1 : -1, hh = Rn.float(4.5, 8), lean = dir * Rn.float(0.8, 2.6), cx = x + dir * 0.7;
      const p = new Path2D(); p.moveTo(cx, y0); p.quadraticCurveTo(cx + lean * 0.2, y0 - hh * 0.6, cx + lean, y0 - hh);
      g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineWidth = 0.34; g.strokeStyle = rgba(pc, 0.6); g.stroke(p); g.restore();
      dot(g, cx + lean, y0 - hh, 0.42, pc, 0.8, { halo: 3.4 });
    }
  }
  function tuftFlame(g, x, y0, th, Rn) {                     // volcanic: little vent flames + rising embers
    const hh = Rn.float(3.2, 5.2);
    const p = new Path2D(); p.moveTo(x - 0.9, y0); p.quadraticCurveTo(x - 1.0, y0 - hh * 0.6, x + Rn.float(-0.4, 0.4), y0 - hh); p.quadraticCurveTo(x + 1.1, y0 - hh * 0.5, x + 0.9, y0); p.closePath();
    g.save(); g.globalCompositeOperation = 'lighter';
    g.fillStyle = rgba(th.accent, 0.28); g.fill(p);
    g.lineWidth = 0.34; g.strokeStyle = rgba(th.accent, 0.8); g.stroke(p);
    g.restore();
    dot(g, x, y0 - hh * 0.35, 0.5, hot(th.accent, 0.5), 0.8, { halo: 3.6 });
    for (let e = 0; e < 2; e++) dot(g, x + Rn.float(-2.2, 2.2), y0 - hh - Rn.float(1.5, 4.5), 0.26, th.accent2, 0.7, { halo: 3 });
  }
  function tuftNail(g, x, y0, th) {                          // ship: a glowing lantern nail
    g.save(); g.globalCompositeOperation = 'lighter'; g.lineWidth = 0.3; g.lineCap = 'round'; g.strokeStyle = rgba(th.edge, 0.6);
    g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 - 1.9); g.stroke(); g.restore();
    dot(g, x, y0 - 2.3, 0.5, th.accent, 0.85, { halo: 4 });
  }
  function tuftFinial(g, x, y0, th) {                        // temple: a gold diamond finial
    g.save(); g.globalCompositeOperation = 'lighter'; g.lineWidth = 0.3; g.lineCap = 'round'; g.strokeStyle = rgba(th.accent, 0.65);
    g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 - 2.2); g.stroke(); g.restore();
    sparkle(g, x, y0 - 3.3, 1.3, th.accent, 0.9, 0);
  }

  /* a GENERATOR: every `yield` is a stage boundary (3-8 ms each), so the bake can be spread over idle slices (prefetch) or drained at once */
  function* paintLevel(g, geo, th, kL) {
    const Rn = N.rng(th.seed * 7919 + 3), Rs = N.rng(th.seed * 104729 + 41), Rt = N.rng(th.seed * 1299709 + 77);
    const edge = th.edge, lwTop = Math.max(0.78, 1 / kL), lwSide = Math.max(0.46, 0.8 / kL);
    g.save();
    // 1) fill: deep tinted translucent crystal on a dark backing
    g.fillStyle = 'rgba(5,10,24,0.80)'; g.fill(geo.fillPath);
    const fg = g.createLinearGradient(0, 0, 0, LH);
    fg.addColorStop(0, rgba(th.body, 0.17)); fg.addColorStop(1, rgba(th.body, 0.07));
    g.fillStyle = fg; g.fill(geo.fillPath);
    g.clip(geo.fillPath);
    // 2) light spilling down from every top face + inner glow along the side faces
    g.globalCompositeOperation = 'lighter';
    for (const s of geo.segs) {
      if (s.cls !== 'T' || s.y0 > LH - 6) continue;
      const grd = g.createLinearGradient(0, s.y0, 0, s.y0 + 11);
      grd.addColorStop(0, rgba(edge, 0.26)); grd.addColorStop(0.5, rgba(edge, 0.07)); grd.addColorStop(1, rgba(edge, 0));
      g.fillStyle = grd; g.fillRect(s.x0, s.y0, s.x1 - s.x0, 11);
    }
    for (const s of geo.segs) {
      if (s.cls !== 'L' && s.cls !== 'R') continue;
      const dir = s.cls === 'R' ? -1 : 1;
      const grd = g.createLinearGradient(s.x0, 0, s.x0 + dir * 7, 0);
      grd.addColorStop(0, rgba(edge, 0.13)); grd.addColorStop(1, rgba(edge, 0));
      g.fillStyle = grd; g.fillRect(Math.min(s.x0, s.x0 + dir * 7), Math.min(s.y0, s.y1), 7, Math.abs(s.y1 - s.y0));
    }
    yield;
    // 3) theme texture (planks, bricks, fibres, polyps, lava cracks)
    bodyTexture(g, geo, th, Rt);
    // 4) crystal facets: a jittered triangular grid, every facet tinted individually, brightest near the faces
    const STEP = th.step, nodes = {};
    const nx = Math.ceil(LW / STEP) + 2, ny = Math.ceil(LH / STEP) + 2;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = i * STEP - 4 + Rn.float(-2.0, 2.0) + (j % 2 ? STEP / 2 : 0), y = j * STEP * 0.86 - 4 + Rn.float(-2.0, 2.0);
      nodes[i + ',' + j] = { x, y, d: geo.solid(x, y) ? faceDist(geo, x, y, 24) : -1 };
    }
    yield;
    const faceK = th.style === 'ship' || th.style === 'temple' ? 0.6 : 1;
    const fillB = new Map(), lineB = new Map();                        // facets are batched by (tint class, alpha class): ~40 draws instead of ~1000
    const bucket = (map, key, A, B, Cc) => { let p = map.get(key); if (!p) map.set(key, p = new Path2D()); p.moveTo(A.x, A.y); p.lineTo(B.x, B.y); p.lineTo(Cc.x, Cc.y); p.closePath(); };
    const tri = (A, B, Cc, up) => {
      if (!A || !B || !Cc || A.d < 0 || B.d < 0 || Cc.d < 0) return;
      const d = (A.d + B.d + Cc.d) / 3, near = Math.pow(clamp(1 - d / 20, 0, 1), 1.15), r = Rn.next();
      if (Rn.next() < th.dark) return;
      const cx = (A.x + B.x + Cc.x) / 3, wallK = cx < 9 || cx > LW - 9 ? 0.5 : 1;
      const al = (0.02 + 0.12 * r * r + (up ? 0.05 : 0)) * (0.3 + 0.7 * near) * wallK * faceK;
      const aq = Math.round(al / 0.02), cq = r > 0.7 ? 4 : Math.round(r / 0.7 * 3);
      if (aq > 0) bucket(fillB, cq * 16 + aq, A, B, Cc);
      const lq = Math.round((0.025 + 0.12 * near) * wallK * faceK / 0.02);
      if (lq > 0) bucket(lineB, lq, A, B, Cc);
    };
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const A = nodes[i + ',' + j], B = nodes[(i + 1) + ',' + j], D = nodes[i + ',' + (j + 1)], E = nodes[(i + 1) + ',' + (j + 1)];
      if (j % 2) { tri(A, B, D, true); tri(B, E, D, false); } else { tri(A, B, E, true); tri(A, E, D, false); }
    }
    for (const [key, p] of fillB) {
      const cq = key >> 4, aq = key & 15;
      g.fillStyle = rgba(mixc(edge, cq === 4 ? th.accent2 : th.edgeHot, cq === 4 ? 0.5 : 0.25 * (cq / 3 * 0.7)), aq * 0.02);
      g.fill(p);
    }
    yield;
    g.lineWidth = 0.2; g.lineJoin = 'round';
    const lineCol = mixc(edge, th.accent2, 0.3);
    for (const [lq, p] of lineB) { if (lq < 3) continue; g.strokeStyle = rgba(lineCol, lq * 0.02); g.stroke(p); }
    yield;
    // 5) light columns hanging from every top face (light trapped in a prism)
    g.lineWidth = 0.22; g.lineCap = 'round';
    for (const sg of geo.segs) {
      if (sg.cls !== 'T' || sg.y0 > LH - 6) continue;
      for (let x = sg.x0 + 3 + Rs.float(0, 6); x < sg.x1 - 2; x += 6 + Rs.float(0, 14)) {
        const L = 2.5 + Rs.float(0, 8) * Rs.next();
        const lg = g.createLinearGradient(0, sg.y0, 0, sg.y0 + L);
        lg.addColorStop(0, rgba(th.edgeHot, 0.2)); lg.addColorStop(1, rgba(edge, 0));
        g.strokeStyle = lg; g.beginPath(); g.moveTo(x, sg.y0 + 0.4); g.lineTo(x, sg.y0 + L); g.stroke();
      }
    }
    // 6) sparse glowing facet nodes
    for (const k in nodes) {
      const nd = nodes[k];
      if (nd.d < 0 || nd.d > 14 || Rn.next() > 0.14) continue;
      g.fillStyle = rgba(hot(edge, 0.5), 0.5 * (1 - nd.d / 16));
      g.beginPath(); g.arc(nd.x, nd.y, 0.42, 0, TAU); g.fill();
    }
    g.restore();
    yield;

    // 7) shards (outside the clip: they overhang the slab) + volcanic drip glow
    const under = mixc(edge, th.low, th.style === 'volcanic' ? 0.55 : 0.35), SB = newShards();
    for (const sg of geo.segs) {
      if (sg.y0 > LH - 6 && sg.y1 > LH - 6) continue;
      const len = Math.abs(sg.x1 - sg.x0);
      if (sg.cls === 'B' && sg.y0 < LH - 7) {
        if (th.style === 'volcanic') for (let gx = Math.min(sg.x0, sg.x1) + 5; gx < Math.max(sg.x0, sg.x1) - 2; gx += Math.min(10, len / 2)) glow(g, gx, sg.y0 + 2, 9, th.low, 0.34, 0.5);   // heat dripping from the underside
        for (let x = Math.min(sg.x0, sg.x1) + 4 + Rs.float(0, 4); x < Math.max(sg.x0, sg.x1) - 3; x += (7 + Rs.float(0, 11)) / th.shard) {
          const big = Rs.chance(0.3);
          shard(SB, x, sg.y0, 1, big ? Rs.float(3.2, 5.6) : Rs.float(1.5, 3.2), big ? Rs.float(1.5, 2.3) : Rs.float(0.9, 1.6), Rs.float(-0.7, 0.7), under, big ? 0.75 : 0.55);
        }
      } else if (sg.cls === 'T' && sg.y0 > MAP_Y + 0.1 && sg.y0 < LH - 7) {
        for (const [ex, dir] of [[Math.min(sg.x0, sg.x1) + 2.2, -1], [Math.max(sg.x0, sg.x1) - 2.2, 1]]) {
          if (len < 14) continue;
          shard(SB, ex, sg.y0, -1, Rs.float(2.2, 3.6), Rs.float(1.1, 1.8), dir * Rs.float(0.2, 0.7), th.edgeHot, 0.8);
          if (Rs.chance(0.6)) shard(SB, ex + dir * -2.2, sg.y0, -1, Rs.float(1.2, 2.0), Rs.float(0.8, 1.2), dir * Rs.float(-0.2, 0.4), edge, 0.65);
        }
      }
    }

    flushShards(g, SB);
    yield;
    // 8) edges (batched: one stroke set per class). Top faces get a calm base line plus a few brighter "breathing" stretches (frozen at one phase)
    const Rg = N.rng(th.seed * 31 + 5), pCh = new Path2D(), pSide = new Path2D(), pLow = new Path2D();
    const pTop = new Path2D(), pCeil = new Path2D(), pBright = new Path2D(), pInset = new Path2D(), pGlint = new Path2D(), glints = [], studs = [];
    for (const s of geo.segs) {
      if (s.y0 >= LH - 0.2 && s.y1 >= LH - 0.2) continue;
      if (s.x0 <= 0.01 && s.x1 <= 0.01) continue;
      if (s.x0 >= LW - 0.01 && s.x1 >= LW - 0.01) continue;
      if (s.cls === 'T') {
        const isCeil = s.y0 <= MAP_Y + 0.1, len = Math.abs(s.x1 - s.x0);
        const P = isCeil ? pCeil : pTop; P.moveTo(s.x0, s.y0); P.lineTo(s.x1, s.y1);
        if (!isCeil) {
          const nb = Math.floor(len / 46 + Rg.next() * 0.9);
          for (let q = 0; q < nb; q++) { const c = lerp(s.x0, s.x1, Rg.float(0.08, 0.92)), h = Rg.float(6, 13); pBright.moveTo(Math.max(s.x0, c - h), s.y0); pBright.lineTo(Math.min(s.x1, c + h), s.y0); }
          if (len > 7) {                                                 // inset second line (crystal double-edge)
            pInset.moveTo(s.x0 + 3, s.y0 + 2.3); pInset.lineTo(s.x1 - 3, s.y0 + 2.3);
            if (th.style === 'temple') studs.push([s.x0 + 3, s.y0 + 2.3], [s.x1 - 3, s.y0 + 2.3]);
          }
          if (s.y0 < LH - 7) { const ng = Math.floor(len / 70 + Rg.next()); for (let q = 0; q < ng; q++) glints.push(lerp(s.x0, s.x1, Rg.float(0.15, 0.85)), s.y0); }
        }
      } else if (s.cls === 'cTL' || s.cls === 'cTR') { pCh.moveTo(s.x0, s.y0); pCh.lineTo(s.x1, s.y1); }
      else if (s.cls === 'L' || s.cls === 'R') { pSide.moveTo(s.x0, s.y0); pSide.lineTo(s.x1, s.y1); }
      else { pLow.moveTo(s.x0, s.y0); pLow.lineTo(s.x1, s.y1); }
    }
    neon(g, pTop, edge, lwTop, { a: 0.64, halo: 1, hot: 0.55, cap: 'butt' });
    neon(g, pCeil, edge, lwTop, { a: 0.4, halo: 1, hot: 0.55, cap: 'butt' });
    neon(g, pBright, mixc(edge, WHITE, 0.12), lwTop, { a: 0.3, halo: 0.6, hot: 0.5 });
    g.save(); g.globalCompositeOperation = 'lighter'; g.lineWidth = Math.max(0.24, 0.6 / kL); g.lineCap = 'round';
    g.strokeStyle = th.style === 'temple' ? rgba(th.accent, 0.5) : rgba(edge, 0.26); g.stroke(pInset); g.restore();
    for (const st of studs) dot(g, st[0], st[1], 0.4, th.accent, 0.8, { halo: 3 });
    for (let q = 0; q < glints.length; q += 2) { const gx = glints[q], gy = glints[q + 1]; glow(g, gx, gy, 3.4, th.edgeHot, 0.5); pGlint.moveTo(gx - 3, gy); pGlint.lineTo(gx + 3, gy); }
    neon(g, pGlint, th.edgeHot, lwTop * 0.7, { a: 0.7, halo: 0.5, hot: 0.8 });
    neon(g, pCh, edge, lwTop * 0.82, { a: 0.85, halo: 1, hot: 0.6 });                          // chamfers, side faces, undersides
    neon(g, pSide, edge, lwSide, { a: 0.46, halo: 0.55, hot: 0.32 });
    neon(g, pLow, mixc(edge, th.low, 0.3), lwSide * 0.85, { a: 0.34, halo: 0.4, hot: 0.15 });

    yield;
    // 9) living accents on the top faces
    const Rf = N.rng(th.seed * 6007 + 13);
    for (const s of geo.segs) {
      if (s.cls !== 'T' || s.y0 >= LH - 0.2 || s.y0 <= MAP_Y + 0.1) continue;
      const len = Math.abs(s.x1 - s.x0);
      if (th.style === 'temple') {
        if (len >= 14) for (const ex of [s.x0 + 5, s.x1 - 5]) tuftFinial(g, ex, s.y0, th);
        continue;
      }
      const per = th.style === 'ship' ? 30 : 34;
      const nPoly = Math.floor(len / per * th.tuft);
      for (let i = 0; i < nPoly; i++) {
        const x = s.x0 + (i + 0.3 + Rf.float(0, 0.5)) * (len / Math.max(1, nPoly));
        if (th.style === 'kelp') tuftBlade(g, x, s.y0, th, Rf);
        else if (th.style === 'ship') tuftNail(g, x, s.y0, th);
        else if (th.style === 'volcanic') tuftFlame(g, x, s.y0, th, Rf);
        else tuftFan(g, x, s.y0, th, Rf, 1);
      }
    }
  }

  /* ------------------------------------------------------------------------------------------------------------
   * levelCanvas / bgCanvas: bounded LRU caches + background jobs. A bake is a generator (see paintLevel / paintBg). A canvas that was never
   * built is finished synchronously; a canvas of the PREVIOUS scale keeps being served (the caller draws it with an explicit 256 x 208
   * destination, so any size works) while its replacement is produced in time-sliced steps (V10c: double buffered). The NEXT round's
   * level + background are prefetched the same way, about 1.5 s after a real round was first requested (the title's custom ledge map and
   * the story / how-to frames never trigger a prefetch), so a round transition finds everything cached and never hitches.
   * World canvases are baked at the exact scale (V10b) and bounded by count AND pixels: current + next round (X5).
   * --------------------------------------------------------------------------------------------------------- */
  const levelCache = new Map();              // key "i|map signature" -> {cv, kb, ...}: the title's custom ledge map and a round's own map coexist
  const bgCache = new Map();                 // i -> {cv, kb, ...}
  const LEVEL_MAX = 4, BG_MAX = 4;
  const PREFETCH_DELAY_MS = 1500;
  const sigCache = new WeakMap();
  const sigOf = (map) => { let v = sigCache.get(map); if (v === undefined) { v = map.join(''); sigCache.set(map, v); } return v; };   // maps are read-only data
  const rowsOf = (map) => (Array.isArray(map) && map.length ? map : EMPTY_ROOM);
  const EMPTY_ROOM = Object.freeze(new Array(26).fill('#'.repeat(2) + '.'.repeat(28) + '##'));
  const lkey = (i, rows) => i + '|' + sigOf(rows);
  const worldPxOf = (o) => (o.cv ? o.cv.width * o.cv.height : 0);
  const worldPx = () => { let p = jobCur ? worldPxOf(jobCur) : 0; for (const o of levelCache.values()) p += worldPxOf(o); for (const o of bgCache.values()) p += worldPxOf(o); return p; };
  const WORLD_BUDGET = () => MAX_PX * 0.9;

  function freeWorld(o) { o.cv.width = 1; o.cv.height = 1; }
  function evictWorld(cache, max) {
    while (cache.size > max) { const k0 = cache.keys().next().value; freeWorld(cache.get(k0)); cache.delete(k0); }
  }
  /** X5: besides the count caps, the world canvases are bounded in pixels (4K / iPad scales): previous-scale canvases go first, then the least
   *  recently used one beyond the two newest of its kind (= current + next round). */
  function trimWorld() {
    evictWorld(levelCache, LEVEL_MAX); evictWorld(bgCache, BG_MAX);
    for (let guard = 0; guard < 8 && worldPx() > WORLD_BUDGET(); guard++) {
      let best = null;
      for (const cache of [levelCache, bgCache]) {
        if (cache.size <= 2) continue;
        let i = 0;
        for (const [k, o] of cache) { if (cache.size - i++ <= 2) break; const rank = o.last - (o.kb !== KB ? 1e12 : 0); if (!best || rank < best.rank) best = { cache, k, o, rank }; }
      }
      if (!best) break;
      freeWorld(best.o); best.cache.delete(best.k);
    }
  }
  let jobCur = null, jobQ = [], prefetchKey = '';
  function dropWorld() {
    for (const o of levelCache.values()) freeWorld(o);
    levelCache.clear();
    for (const o of bgCache.values()) freeWorld(o);
    bgCache.clear();
    if (jobCur) { freeWorld(jobCur); jobCur = null; }
    jobQ = []; prefetchKey = '';
    if (logoCache[0]) { logoCache[0].dark.width = 1; logoCache[0].lit.width = 1; }
    logoCache.length = 0; logoJob = null;
  }

  function newJob(kind, i, rows) {
    const kL = KB, cv = makeCanvas(Math.round(LW * kL), Math.round(MAP_H * kL)), g = cv.getContext('2d');
    if (kind === 'L') {
      g.setTransform(kL, 0, 0, kL, 0, -MAP_Y * kL);
      return { kind, i, rows, key: lkey(i, rows), kb: kL, cv, gen: paintLevel(g, buildLevelGeo(rows), themeData(i), kL), ms: 0, done: false, stepMax: 0 };
    }
    return { kind, i, rows: null, key: i, kb: kL, cv, gen: paintBg(g, themeData(i), kL), ms: 0, done: false, stepMax: 0 };
  }
  function publishJob(job) {
    job.done = true;
    const cache = job.kind === 'L' ? levelCache : bgCache, old = cache.get(job.key);
    if (old) { freeWorld(old); cache.delete(job.key); }
    cache.set(job.key, { cv: job.cv, kb: job.kb, ms: job.ms, last: ++state.clock });
    timings[job.kind === 'L' ? 'level' : 'bg'] = (timings[job.kind === 'L' ? 'level' : 'bg'] || 0) + job.ms;
    trimWorld();
    if (!jobQ.length) purgeStaleWorld();
  }
  /** once every queued rebuild is done, previous-scale canvases that nobody asked for since the scale change (title ledges, an old round) are freed */
  let staleClock = 0;
  function purgeStaleWorld() {
    for (const cache of [levelCache, bgCache]) for (const [k, o] of Array.from(cache)) if (o.kb !== KB && o.last <= staleClock) { freeWorld(o); cache.delete(k); }
  }
  const stepLog = [];                        // test hook: world steps longer than 2.5 ms [kind, index, step no, ms]
  function stepJob(job) {
    const t0 = now();
    const r = job.gen.next();
    const dt = now() - t0;
    job.ms += dt; if (dt > job.stepMax) job.stepMax = dt;
    state.worldSteps = (state.worldSteps || 0) + 1; if (dt > (state.worldStepMax || 0)) state.worldStepMax = dt;
    job.n = (job.n || 0) + 1;
    if (dt > 2.5) { stepLog.push([job.kind, job.i, job.n, +dt.toFixed(1)]); if (stepLog.length > 40) stepLog.shift(); }
    if (r.done) publishJob(job);
  }
  /* the requested canvas is always finished synchronously; a failing painter must never take the frame down (the partial canvas is published) */
  function drain(job) {
    try { while (!job.done) stepJob(job); }
    catch (e) { warnOnce('world:' + job.kind, 'bake of ' + job.kind + job.i + ' failed: ' + (e && e.message)); if (!job.done) publishJob(job); }
    return job.cv;
  }
  const cacheOf = (kind) => (kind === 'L' ? levelCache : bgCache);
  const isCurrent = (kind, key) => { const e = cacheOf(kind).get(key); return !!e && e.kb === KB; };
  /** one step of the background world job (picks the next queued one when none is running). Returns false when there was nothing to do now
   *  (or, with canSkip, when the step would overrun the slice). */
  function jobPumpOne(msLeft, canSkip) {
    const t = now();
    while (!jobCur && jobQ.length) {
      let at = -1;
      for (let j = 0; j < jobQ.length; j++) { const q = jobQ[j]; if (isCurrent(q.kind, q.key)) { jobQ.splice(j, 1); j--; continue; } if (!(q.at > t)) { at = j; break; } }
      if (at < 0) return false;                                           // only delayed prefetch jobs are left
      const q = jobQ.splice(at, 1)[0];
      jobCur = newJob(q.kind, q.i, q.rows);
    }
    if (!jobCur) return false;
    if (jobCur.kb !== KB) {                                                // the scale changed under a running job: start it again at the new scale
      const q = { kind: jobCur.kind, i: jobCur.i, rows: jobCur.rows, key: jobCur.key, at: 0 };
      freeWorld(jobCur); jobCur = null; jobQ.unshift(q);
      return true;
    }
    if (canSkip && jobCur.stepMax > 0 && msLeft < jobCur.stepMax * 0.9) return false;
    try { stepJob(jobCur); if (jobCur.done) jobCur = null; }
    catch (e) { warnOnce('prefetch', 'prefetch failed: ' + (e && e.message)); if (jobCur) { freeWorld(jobCur); } jobCur = null; }
    return true;
  }
  /** queue a bake of (kind, i, rows); front = needed now (a stale canvas is being served), else a delayed prefetch */
  function requestJob(kind, i, rows, key, front, delayMs) {
    if (isCurrent(kind, key)) return;
    if (jobCur && jobCur.kind === kind && jobCur.key === key && jobCur.kb === KB) return;
    const hit = jobQ.findIndex((q) => q.kind === kind && q.key === key);
    const q = { kind, i, rows, key, at: delayMs ? now() + delayMs : 0 };
    if (hit >= 0) { if (front) { jobQ.splice(hit, 1); jobQ.unshift(q); } return; }
    if (front) jobQ.unshift(q); else jobQ.push(q);
    bgSchedule();
  }
  /* after a REAL round i was requested: its background, the next round's level + background (once per index and scale), and the heavy
   * sprite families that come later (Kraken / moon pearl before the boss) */
  function schedulePrefetch(i, rows) {
    let L = null;
    try { L = typeof LEVELS !== 'undefined' && Array.isArray(LEVELS) ? LEVELS : null; } catch (e) { L = null; }
    if (!L || !L[i] || !Array.isArray(L[i].map) || (L[i].map !== rows && sigOf(L[i].map) !== sigOf(rows))) return;      // not a round's own map (title ledges, empty room ...)
    const key = i + '|' + KB;
    if (prefetchKey === key) return;
    prefetchKey = key;
    requestJob('B', i, null, i, false, 0);
    if (i + 1 < Math.min(30, L.length) && L[i + 1] && Array.isArray(L[i + 1].map)) {
      requestJob('L', i + 1, L[i + 1].map, lkey(i + 1, L[i + 1].map), false, PREFETCH_DELAY_MS);
      requestJob('B', i + 1, null, i + 1, false, PREFETCH_DELAY_MS);
    }
    warm('bonefin');
    if (i >= 26) warm('kraken');
    if (i >= 28) warm('moonpearl');
  }

  function levelCanvas(i, map) {
    i = clamp(i | 0, 0, 29);
    const rows = rowsOf(map), key = lkey(i, rows);
    const e = levelCache.get(key);
    if (e) {
      e.last = ++state.clock; levelCache.delete(key); levelCache.set(key, e);
      if (e.kb === KB) { schedulePrefetch(i, rows); return e.cv; }
      requestJob('L', i, rows, key, true, 0);                              // previous scale: serve it, re-bake in the background
      return e.cv;
    }
    let job;
    if (jobCur && jobCur.kind === 'L' && jobCur.key === key && jobCur.kb === KB) { job = jobCur; jobCur = null; } else job = newJob('L', i, rows);
    drain(job);
    schedulePrefetch(i, rows);
    return job.cv;
  }

  /* ================================================================================================================
   * 8. BACKGROUNDS (bgCanvas): opaque 256k x 208k. Near-black gradient tinted per theme, soft god-rays, 1-3 huge distant
   *    silhouettes per theme (jellyfish / kelp / hull ribs / crystals / vents / pillars) drawn as faint luminous contours on ONE
   *    low-resolution light layer that is blurred once and added, fog, bokeh, a little dither against banding. Static: the Game
   *    layers the moving plankton on top (GFX.particle).
   * ============================================================================================================== */
  const logoCache = [];                    // [ { kb, dark, lit, pad, Wc, Hc, G } ]: the current (or previous-scale) logo layers
  let logoJob = null;                      // { kb, gen, box }: the logo of the new scale being built in the background

  /* faint luminous shape on the light layer: translucent fill + soft wide line + core line + thin hot ridge (all additive) */
  function lum(g, path, col, fillA, lineA, lw, closed) {
    g.save(); g.globalCompositeOperation = 'lighter'; g.lineJoin = 'round'; g.lineCap = 'round';
    if (fillA > 0) { g.fillStyle = rgba(col, fillA); g.fill(path); }
    if (lineA > 0) {
      g.lineWidth = lw * 3.2; g.strokeStyle = rgba(col, lineA * 0.22); g.stroke(path);
      g.lineWidth = lw; g.strokeStyle = rgba(col, lineA); g.stroke(path);
      g.lineWidth = lw * 0.4; g.strokeStyle = rgba(hot(col, 0.6), lineA * 0.7); g.stroke(path);
    }
    g.restore();
  }

  /* one giant distant jellyfish in unit space (bell radius 1, centre at origin), a faithful port of the mockup's farJelly at one phase */
  function farJelly(g, j) {
    const t = j.t || 0;
    const pulse = 1 + Math.sin(t * 0.8 + j.ph) * 0.045, sz = j.sz;
    g.save();
    g.translate(j.x, j.y + Math.sin(t * 0.35 + j.ph) * sz * 0.05);
    g.rotate(j.rot || 0);
    g.scale(sz * pulse, sz / pulse);
    const bell = new Path2D('M -1 0.12 C -1.02 -0.78 -0.55 -1.08 0 -1.08 C 0.55 -1.08 1.02 -0.78 1 0.12 C 0.86 0.2 0.72 0.1 0.6 0.18 C 0.45 0.1 0.3 0.22 0.15 0.14 C 0 0.22 -0.15 0.1 -0.3 0.16 C -0.45 0.1 -0.62 0.22 -0.74 0.14 C -0.86 0.2 -0.94 0.12 -1 0.12 Z');
    const fg = g.createRadialGradient(0, -0.2, 0.05, 0, -0.2, 1.1);
    fg.addColorStop(0, rgba(j.col, 0.055 * j.a)); fg.addColorStop(0.62, rgba(j.col, 0.12 * j.a)); fg.addColorStop(1, rgba(j.col, 0.24 * j.a));
    g.fillStyle = fg; g.fill(bell);
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.lineWidth = 0.03; g.strokeStyle = rgba(hot(j.col, 0.35), 0.62 * j.a); g.stroke(bell);
    g.lineWidth = 0.013;
    for (let i = -3; i <= 3; i++) { const p = new Path2D(); p.moveTo(0, -0.98); p.quadraticCurveTo(i * 0.26, -0.5, i * 0.34, 0.05); g.strokeStyle = rgba(j.col, 0.2 * j.a); g.stroke(p); }
    g.strokeStyle = rgba(hot(j.col, 0.45), 0.3 * j.a); g.stroke(new Path2D('M -0.5 -0.26 C -0.5 -0.62 0.5 -0.62 0.5 -0.26'));
    for (let i = 0; i < 13; i++) {
      const tw = 0.5 + 0.5 * Math.sin(t * 1.3 + i * 1.9 + j.ph);
      g.fillStyle = rgba(hot(j.col, 0.6), (0.2 + 0.4 * tw) * j.a); g.beginPath(); g.arc(-0.93 + i * 0.155, 0.09 + Math.sin(i * 1.7) * 0.025, 0.021, 0, TAU); g.fill();
    }
    for (let i = -1; i <= 1; i++) {
      const p = new Path2D(); p.moveTo(i * 0.18, 0.1);
      for (let s = 1; s <= 10; s++) { const u = s / 10; p.lineTo(i * 0.18 + Math.sin(t * 0.8 + u * 5 + i * 2 + j.ph) * 0.1 * u, 0.1 + u * 1.35); }
      g.lineWidth = 0.034; g.strokeStyle = rgba(hot(j.col, 0.2), 0.3 * j.a); g.stroke(p);
    }
    for (let i = 0; i < 11; i++) {
      const x0 = -0.9 + i * 0.18, len = 1.9 + (i % 3) * 0.5;
      const p = new Path2D(); p.moveTo(x0, 0.15);
      for (let s = 1; s <= 8; s++) { const u = s / 8; p.lineTo(x0 + Math.sin(t * 0.7 + u * 5 + i) * 0.1 * u, 0.15 + u * len); }
      const tg = g.createLinearGradient(0, 0.15, 0, 0.15 + len); tg.addColorStop(0, rgba(j.col, 0.36 * j.a)); tg.addColorStop(1, rgba(j.col, 0));
      g.lineWidth = 0.014; g.strokeStyle = tg; g.stroke(p);
    }
    g.restore();
  }

  /* god-rays from the surface: a few wide slanted shafts, each = 4 nested soft layers (no hard edges) */
  function shafts(g, w, h, A, th, Rn) {
    const n = 4, ph = Rn.float(0, 6);
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const cx = w * (0.14 + i * (0.72 / (n - 1))) + Math.sin(ph + i * 1.7) * w * 0.018;
      const slant = w * (0.2 + 0.05 * Math.sin(i * 2.3 + ph)), len = h * (0.78 + 0.08 * Math.sin(i * 1.3)), sway = 0.82 + 0.18 * Math.sin(ph * 2 + i * 2.1);
      for (let L = 0; L < 4; L++) {
        const wt = w * (0.012 + 0.016 * L), wb = w * (0.04 + 0.04 * L);
        const gr = g.createLinearGradient(0, 0, 0, len);
        gr.addColorStop(0, rgba(th.haze, 0.05 * A * sway)); gr.addColorStop(0.55, rgba(th.haze, 0.018 * A * sway)); gr.addColorStop(1, rgba(th.haze, 0));
        g.fillStyle = gr;
        g.beginPath(); g.moveTo(cx - wt, 0); g.lineTo(cx + wt, 0); g.lineTo(cx + slant + wb, len); g.lineTo(cx + slant - wb, len); g.closePath(); g.fill();
      }
    }
    g.restore();
  }

  /* ---- the six silhouette painters: (g in logical units 256 x 208, theme, rng) ------------------------------------ */
  function silJellies(g, th, Rn) {
    const mk = (xa, xb, ya, yb, sa, sb, col, a, rot) => ({ x: Rn.float(xa, xb) * LW, y: Rn.float(ya, yb) * MAP_H, sz: Rn.float(sa, sb) * LW, col, a, ph: Rn.float(0, 6), rot: Rn.float(-rot, rot), t: Rn.float(0, 3) });
    const c0 = mixc(RGB.cobalt, mixc(th.haze, RGB.cyan, 0.5), 0.3), c1 = mixc(RGB.cobalt, th.low, 0.5), c2 = mixc(th.low, RGB.magenta, 0.5);
    farJelly(g, mk(0.1, 0.24, 0.16, 0.3, 0.115, 0.135, c0, 0.7, 0.22));
    farJelly(g, mk(0.76, 0.9, 0.24, 0.4, 0.09, 0.11, c1, 0.7, 0.2));
    farJelly(g, mk(0.4, 0.6, 0.78, 0.9, 0.06, 0.075, c2, 0.66, 0.1));
  }
  function silKelp(g, th, Rn) {
    const n = 7;
    for (let i = 0; i < n; i++) {
      const x0 = (i + 0.5) * LW / n + Rn.float(-9, 9), len = Rn.float(120, 200), amp = Rn.float(5, 12), ph = Rn.float(0, 6), far = i % 2;
      const sp = [];
      for (let s = 0; s <= 24; s++) { const u = s / 24; sp.push([x0 + Math.sin(u * 3.4 + ph) * amp * (0.3 + u), MAP_H + 6 - u * len]); }
      const rb = N.taper(sp, (u) => (3.4 * Math.pow(1 - u, 0.7) + 0.5) * (far ? 0.75 : 1));
      const col = mixc(th.edge, th.accent, far ? 0.15 : 0.35);
      g.save(); g.globalCompositeOperation = 'lighter';
      const gr = g.createLinearGradient(0, MAP_H, 0, MAP_H - len); gr.addColorStop(0, rgba(col, far ? 0.07 : 0.11)); gr.addColorStop(1, rgba(col, 0));
      g.fillStyle = gr; g.fill(rb);
      const eg = g.createLinearGradient(0, MAP_H, 0, MAP_H - len); eg.addColorStop(0, rgba(col, far ? 0.26 : 0.42)); eg.addColorStop(1, rgba(col, 0));
      g.strokeStyle = eg; g.lineWidth = 0.7; g.lineJoin = 'round'; g.stroke(rb);
      g.restore();
      for (let b = 1; b <= 4; b++) {                           // leaf blades
        const u = b / 5, p = sp[Math.round(u * 24)], dir = (b + i) % 2 ? 1 : -1, ang = dir * 0.75 + Math.sin(ph + b) * 0.25;
        const lf = new Path2D(); lf.moveTo(p[0], p[1]); lf.quadraticCurveTo(p[0] + dir * 9, p[1] - 4, p[0] + Math.sin(ang) * 15, p[1] - Math.cos(ang) * 11); lf.quadraticCurveTo(p[0] + dir * 8, p[1] + 1, p[0], p[1]);
        lum(g, lf, col, far ? 0.04 : 0.07, far ? 0.18 : 0.3, 0.55);
      }
    }
  }
  function silRibs(g, th, Rn) {
    const col = mixc(mixc(th.edge, th.low, 0.35), th.accent, 0.1), x0 = Rn.float(70, 120), tilt = Rn.float(-0.06, 0.06);
    g.save(); g.translate(LW * 0.5, MAP_H); g.rotate(tilt); g.translate(-LW * 0.5, -MAP_H);
    const topY = 78;
    for (let i = 0; i < 7; i++) {
      const bx = x0 + i * 17, pts = [], ytop = topY + i * 4;
      for (let y = MAP_H + 6; y >= ytop; y -= 3) { const t = (MAP_H - y) / (MAP_H - topY + 4); pts.push([bx + t * t * 22, y]); }
      const rib = N.spinePath(pts);
      lum(g, rib, col, 0, 0.22, 1.5);
    }
    lum(g, N.poly([[x0 - 6, topY - 4], [x0 + 7 * 17 + 18, topY]]), col, 0, 0.26, 2.0);        // gunwale beam
    const mx = Rn.float(14, 64);
    lum(g, N.poly([[mx, 30], [mx, MAP_H]]), col, 0, 0.2, 1.3);
    lum(g, N.poly([[mx - 22, 56], [mx + 24, 54]]), col, 0, 0.2, 1.0);
    lum(g, N.poly([[mx + 2, 58], [mx + 24, 56], [mx + 2, 110]], true), col, 0.03, 0.14, 0.6);  // torn sail
    lum(g, N.poly([[mx - 2, 58], [mx - 20, 60], [mx - 2, 98]], true), col, 0.025, 0.12, 0.6);
    g.restore();
  }
  function silCrystals(g, th, Rn) {
    const spire = (bx, w, h, base, dir) => {
      const tx = bx + w / 2 + Rn.float(-4, 4), ty = base - dir * h;
      const lit = N.poly([[bx, base], [tx, base], [tx, ty]], true), dark = N.poly([[tx, base], [bx + w, base], [tx, ty]], true);
      lum(g, lit, th.edgeHot, 0.07, 0.22, 0.7); lum(g, dark, th.edge, 0.04, 0.15, 0.6);
    };
    for (let k = 0; k < 6; k++) spire(-4 + k * 46 + Rn.float(-8, 8), Rn.float(34, 54), Rn.float(70, 130), MAP_H + 2, 1);
    for (let k = 0; k < 5; k++) spire(14 + k * 50 + Rn.float(-10, 10), Rn.float(18, 30), Rn.float(32, 70), -1, -1);
  }
  function silVents(g, th, Rn, sharp) {
    const n = 3;
    for (let k = 0; k < n; k++) {
      const cx = 40 + k * 88 + Rn.float(-14, 18), w = Rn.float(48, 74), h = Rn.float(74, 118), cw = Rn.float(7, 11);
      const cone = N.poly([[cx - w, MAP_H + 2], [cx - cw, MAP_H - h], [cx + cw, MAP_H - h], [cx + w, MAP_H + 2]], true);
      lum(g, cone, th.edge, 0.035, 0.26, 0.8);
      lum(g, N.poly([[cx - cw * 0.5, MAP_H - h], [cx + cw * 0.5, MAP_H - h]]), th.accent, 0, 0.4, 1.1);
      if (!sharp) { glow(g, cx, MAP_H - h, 30, th.accent, 0.22, 0.6); glow(g, cx, MAP_H - h - 16, 14, th.low, 0.25); }
      for (let s = 0; s < 7 && !sharp; s++) {                             // rising sparks above the crater
        const sy = MAP_H - h - 6 - s * Rn.float(8, 14), sx = cx + Rn.float(-9, 9) * (1 + s * 0.25);
        dot(g, sx, sy, Rn.float(0.5, 1.0), th.accent2, 0.38 - s * 0.04, { halo: 3 });
      }
    }
    if (!sharp) {
    g.save(); g.globalCompositeOperation = 'lighter';                  // the lava sea below
    const lg = g.createLinearGradient(0, MAP_H, 0, MAP_H - 46); lg.addColorStop(0, rgba(th.low, 0.3)); lg.addColorStop(1, rgba(th.low, 0));
    g.fillStyle = lg; g.fillRect(0, MAP_H - 46, LW, 46);
    g.restore();
    }
  }
  function silPillars(g, th, Rn) {
    const col = mixc(th.edge, th.accent, 0.15), xs = [];
    const n = 5; let x = Rn.float(10, 30);
    for (let i = 0; i < n; i++) { xs.push(x); x += Rn.float(40, 62); }
    xs.forEach((px, i) => {
      const w = Rn.float(15, 21), top = Rn.float(14, 40), a = i % 2 ? 0.8 : 1;
      const shaft = N.poly([[px - w / 2, top + 10], [px + w / 2, top + 10], [px + w / 2, MAP_H - 12], [px - w / 2, MAP_H - 12]], true);
      lum(g, shaft, col, 0.035 * a, 0.26 * a, 0.8);
      for (let f = 1; f < 4; f++) lum(g, N.poly([[px - w / 2 + f * w / 4, top + 12], [px - w / 2 + f * w / 4, MAP_H - 14]]), col, 0, 0.1 * a, 0.5);
      lum(g, N.poly([[px - w * 0.7, top + 10], [px + w * 0.7, top + 10], [px + w * 0.55, top + 3], [px - w * 0.55, top + 3]], true), col, 0.05 * a, 0.3 * a, 0.7);        // capital
      lum(g, N.poly([[px - w * 0.7, MAP_H - 12], [px + w * 0.7, MAP_H - 12], [px + w * 0.8, MAP_H], [px - w * 0.8, MAP_H]], true), col, 0.05 * a, 0.3 * a, 0.7);            // base
      lum(g, N.poly([[px - w * 0.62, top + 5.5], [px + w * 0.62, top + 5.5]]), th.accent, 0, 0.42 * a, 0.8);                                                                // gold trim
      lum(g, N.poly([[px - w * 0.5, MAP_H - 16], [px + w * 0.5, MAP_H - 16]]), th.accent, 0, 0.3 * a, 0.7);
    });
    for (let i = 0; i + 1 < xs.length; i += 2) {                           // a broken arch between two pillars
      const a = xs[i], b = xs[i + 1], midx = (a + b) / 2, r = (b - a) / 2;
      lum(g, new Path2D(`M ${a} 22 A ${r} ${r * 0.8} 0 0 1 ${midx - r * 0.2} ${22 - r * 0.78}`), col, 0, 0.18, 0.7);
    }
  }
  const SIL_SHARP = { kelp: 0.5, ship: 0.5, caves: 0.38, volcanic: 0.4, temple: 0.5 };
  const SIL = { coral: silJellies, kelp: silKelp, ship: silRibs, caves: silCrystals, volcanic: silVents, temple: silPillars };

  /* run fn once per horizontal band of the canvas (device-pixel aligned clip, so there are no seams), yielding after each band: the full-resolution
   * operations of a background (gradient fill, additive light blit, grain, sharp silhouettes) cost ~1-3 ms per band even at k = 8 (V10c time slicing) */
  function* bands(g, n, fn) {
    const W = g.canvas.width, H = g.canvas.height;
    for (let i = 0; i < n; i++) {
      const y0 = Math.floor(H * i / n), y1 = Math.floor(H * (i + 1) / n);
      g.save();
      const m = g.getTransform();
      g.setTransform(1, 0, 0, 1, 0, 0); g.beginPath(); g.rect(0, y0, W, y1 - y0); g.clip(); g.setTransform(m);
      fn(i);
      g.restore();
      if (i + 1 < n) yield;
    }
  }
  function* paintBg(g, th, kBg) {
    const Rn = N.rng(th.seed * 2654435 + 9);
    const nb = Math.max(1, Math.ceil(kBg / 1.6));
    g.setTransform(kBg, 0, 0, kBg, 0, 0);
    const gr = g.createLinearGradient(0, 0, 0, MAP_H);
    gr.addColorStop(0, rgba(th.bgTop, 1)); gr.addColorStop(0.35, rgba(mixc(th.bgTop, th.bgMid, 0.7), 1)); gr.addColorStop(0.75, rgba(th.bgMid, 1)); gr.addColorStop(1, rgba(th.bgBot, 1));
    g.fillStyle = gr;
    yield* bands(g, nb, () => g.fillRect(0, 0, LW, MAP_H));
    // ONE low-resolution light layer: god-rays + silhouettes, blurred once, added with one blend
    const kLay = Math.min(kBg / 3, 1.6), lw = Math.max(8, Math.ceil(LW * kLay)), lh = Math.max(8, Math.ceil(MAP_H * kLay));       // a soft field: never more than 1.6 px per logical px (cheap at k = 8, same look at every k >= 4.8)
    yield;
    const c1 = makeCanvas(lw, lh), g1 = c1.getContext('2d');
    g1.setTransform(1, 0, 0, 1, 0, 0); g1.globalCompositeOperation = 'source-over'; g1.globalAlpha = 1; g1.clearRect(0, 0, lw, lh);
    // the large soft light sources go onto the LOW-res layer too (big radial blits are the expensive part of a full-res bake): surface haze
    // from above, a tint from the depths below, fog
    g1.setTransform(lw / LW, 0, 0, lh / MAP_H, 0, 0);
    glow(g1, LW * (0.4 + 0.2 * Rn.next()), -MAP_H * 0.06, MAP_H * 0.85, th.haze, 0.075, 0.8);
    glow(g1, LW * 0.5, MAP_H * 1.06, MAP_H * 0.62, th.low, th.style === 'volcanic' ? 0.09 : 0.06, 0.55);
    for (let i = 0; i < 6; i++) glow(g1, Rn.float(0.05, 0.95) * LW, Rn.float(0.15, 0.95) * MAP_H, Rn.float(0.3, 0.55) * LW, i % 2 ? RGB.cobalt : th.low, 0.013, 0.45);
    const mirror = th.variant % 2 === 1;                     // odd variants mirror the whole composition: 5 looks per theme without 5 layouts
    g1.setTransform(lw / LW, 0, 0, lh / MAP_H, 0, 0);
    shafts(g1, LW, MAP_H, 1.4, th, N.rng(th.seed * 31337 + 5));
    yield;
    const silSeed = th.seed * 7717 + 1;
    if (mirror) g1.setTransform(-lw / LW, 0, 0, lh / MAP_H, lw, 0);
    SIL[th.style](g1, th, N.rng(silSeed));
    yield;
    const c2 = makeCanvas(lw, lh), g2 = c2.getContext('2d');
    g2.setTransform(1, 0, 0, 1, 0, 0); g2.globalCompositeOperation = 'copy';
    try { g2.filter = 'blur(' + (1.1 * Math.max(1, kLay / 1.333)).toFixed(2) + 'px)'; } catch (e) { /* no filter support */ }          // 1.1 layer px (the old look) up to k = 4; above, the layer stays 1.6 px/logical px and the blur grows so the look is the one of k = 4
    g2.drawImage(c1, 0, 0);
    try { g2.filter = 'none'; } catch (e) { /* ignore */ }
    yield;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'lighter'; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'low';
    yield* bands(g, nb, () => g.drawImage(c2, 0, 0, g.canvas.width, g.canvas.height));
    g.restore();
    c1.width = 1; c1.height = 1; c2.width = 1; c2.height = 1;
    yield;
    const sharp = SIL_SHARP[th.style];                       // structural silhouettes also get a crisp faint pass on top of their soft glow
    if (sharp) {
      g.save(); if (mirror) g.setTransform(-kBg, 0, 0, kBg, g.canvas.width, 0); g.globalAlpha = sharp;
      yield* bands(g, Math.max(1, nb - 1), () => SIL[th.style](g, th, N.rng(silSeed), true));
      g.restore();
    }
    yield;
    // bokeh motes (very low alpha: depth, never clutter)
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 7; i++) {
      const x = Rn.float(0, LW), y = Rn.float(0, MAP_H), r = Rn.float(2, 5.5), col = Rn.pick([th.haze, th.haze, th.low, RGB.cyan]), a = Rn.float(0.035, 0.075);
      g.fillStyle = rgba(col, a * 0.5); g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      g.strokeStyle = rgba(hot(col, 0.3), a * 1.2); g.lineWidth = 0.3; g.stroke();
    }
    g.restore();
    // dither: kills banding in the dark gradients (also when postFX is off)
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    yield* bands(g, nb, () => N.drawGrain(g, g.canvas.width, g.canvas.height, 0.016));
    g.restore();
  }

  function bgCanvas(i) {
    i = clamp(i | 0, 0, 29);
    const e = bgCache.get(i);
    if (e) {
      e.last = ++state.clock; bgCache.delete(i); bgCache.set(i, e);
      if (e.kb !== KB) requestJob('B', i, null, i, true, 0);                // previous scale: serve it, re-bake in the background
      return e.cv;
    }
    let job;
    if (jobCur && jobCur.kind === 'B' && jobCur.key === i && jobCur.kb === KB) { job = jobCur; jobCur = null; } else job = newJob('B', i);
    return drain(job);
  }

  /* ================================================================================================================
   * 9. LOGO: hollow glass-tube wordmark. Every stroke is a tube: a bright 2-contour wall, a tinted translucent core of "liquid light",
   *    a specular streak and a coloured halo, over an opaque near-black occluder. The two layers are baked once per bucket;
   *    only the bubble-O, the rising bubbles and the underline are live.
   * ============================================================================================================== */
  const LOGO_CAP = 24.5, LOGO_TRACK = 0.5;
  const P1C = RGB.magenta, P2C = RGB.cyan;

  function ampersandPath(x, y, cap) {
    const P = [[0.80, 1.00], [0.52, 0.66], [0.26, 0.34], [0.18, 0.14], [0.27, 0.02], [0.42, 0.0], [0.56, 0.08], [0.58, 0.22], [0.48, 0.36], [0.28, 0.52], [0.08, 0.66], [0.0, 0.80], [0.06, 0.94], [0.22, 1.0], [0.42, 0.98], [0.58, 0.86], [0.70, 0.68], [0.76, 0.52]];
    return N.spline(P.map((p) => [x + p[0] * cap, y + p[1] * cap]), false, 0.5);
  }
  function logoGeometry(kb) {
    const cap = LOGO_CAP * kb, track = LOGO_TRACK, T = cap * 0.17;
    const wF = N.textWidth('FIZZ', track) * cap, wA = 0.8 * cap, gap = cap * 0.56;
    const gP = N.GLYPH.P[0], gO = 1.04;
    const wP = (gP + track + gO + track + gP) * cap, total = wF + gap + wA + gap + wP;
    return { cap, track, T, wF, wA, gap, gP, gO, wP, total };
  }
  function* buildLogoGen(kb, box) {                        // one yield per tube group: the build is spread over background slices
    const G = logoGeometry(kb), { cap, track, T, wF, wA, gap, gP, gO, wP, total } = G;
    const pad = Math.ceil(T * 4.5), Wc = Math.ceil(total + 2 * pad), Hc = Math.ceil(cap + 2 * pad);
    const x = pad, y = pad, xa = x + wF + gap, xp = xa + wA + gap;
    const mk = () => { const c = makeCanvas(Wc, Hc), g = c.getContext('2d'); g.lineCap = 'round'; g.lineJoin = 'round'; return [c, g]; };
    const [dark, dg] = mk(), [lit, lg] = mk();
    const pF = N.textPath('FIZZ', x, y, cap, track), pA = ampersandPath(xa, y, cap);
    const pP = new Path2D(); pP.addPath(N.textPath('P', xp, y, cap, 0)); pP.addPath(N.textPath('P', xp + (gP + track + gO + track) * cap, y, cap, 0));
    const groups = [
      { path: pF, box: [x, y, x + wF, y + cap], c0: mixc(P1C, WHITE, 0.12), c1: mixc(P1C, RGB.violet, 0.22) },
      { path: pA, box: [xa, y, xa + wA, y + cap], c0: mixc(P1C, WHITE, 0.3), c1: mixc(P2C, WHITE, 0.2) },
      { path: pP, box: [xp, y, xp + wP, y + cap], c0: mixc(P2C, WHITE, 0.2), c1: mixc(RGB.cobalt, P2C, 0.4) },
    ];
    const e = Math.max(1.8, T * 0.14);                         // wall thickness
    const canBlur = (() => { try { return 'filter' in lg; } catch (err) { return false; } })();
    for (const Gp of groups) {
      const [wall, wg] = mk(), [core, cg] = mk(), [hotc, hg] = mk();
      const grad = (g, a0, a1) => { const gr = g.createLinearGradient(Gp.box[0], Gp.box[1], Gp.box[2], Gp.box[3]); gr.addColorStop(0, rgba(Gp.c0, a0)); gr.addColorStop(1, rgba(Gp.c1, a1)); return gr; };
      wg.strokeStyle = grad(wg, 1, 1); wg.lineWidth = T; wg.stroke(Gp.path);                           // wall: the tube minus its interior = two contour lines
      wg.globalCompositeOperation = 'destination-out'; wg.lineWidth = T - 2 * e; wg.stroke(Gp.path);
      hg.strokeStyle = rgba(hot(Gp.c0, 0.9), 1); hg.lineWidth = T - e * 0.1; hg.stroke(Gp.path);        // hot line on the OUTER edge of the wall
      hg.globalCompositeOperation = 'destination-out'; hg.lineWidth = T - e * 1.1; hg.stroke(Gp.path);
      cg.strokeStyle = grad(cg, 0.38, 0.22); cg.lineWidth = T - 2 * e; cg.stroke(Gp.path);             // interior: translucent liquid
      cg.globalCompositeOperation = 'source-atop';
      if (canBlur) cg.filter = 'blur(' + (T * 0.1).toFixed(2) + 'px)';
      cg.strokeStyle = rgba(hot(Gp.c1, 0.45), 0.75); cg.lineWidth = (T - 2 * e) * 0.4; cg.stroke(Gp.path);
      if (canBlur) cg.filter = 'none';
      cg.save(); cg.translate(-T * 0.17, -T * 0.2); cg.strokeStyle = rgba(WHITE, 0.55); cg.lineWidth = T * 0.09; cg.stroke(Gp.path); cg.restore();   // specular streak
      dg.strokeStyle = 'rgba(3,5,12,0.9)'; dg.lineWidth = T + 1.5; dg.stroke(Gp.path);                 // occluder
      const halo = (blurPx, a) => {                                                                     // glow of the walls: blurred copies
        lg.save(); lg.globalAlpha = a;
        if (canBlur) { lg.filter = 'blur(' + blurPx.toFixed(1) + 'px)'; lg.drawImage(wall, 0, 0); }
        else { lg.globalAlpha = a * 0.14; lg.lineWidth = T * 2.2; lg.strokeStyle = rgba(Gp.c0, 1); lg.stroke(Gp.path); }
        lg.restore();
      };
      halo(T * 0.65, 0.95); halo(T * 1.4, 0.55); halo(T * 0.22, 1);
      lg.drawImage(core, 0, 0); lg.drawImage(wall, 0, 0); lg.drawImage(hotc, 0, 0);
      for (const c of [wall, core, hotc]) { c.width = 1; c.height = 1; }
      yield;
    }
    box.L = { kb, dark, lit, pad, Wc, Hc, G };
  }
  function logoStep() {
    const j = logoJob;
    if (!j) return;
    if (j.kb !== KB) { logoJob = null; return; }                            // the scale moved on: drawLogo asks again
    const t0 = now();
    let r;
    try { r = j.gen.next(); } catch (e) { warnOnce('logo', 'logo bake failed: ' + (e && e.message)); logoJob = null; return; }
    timings.logo = (timings.logo || 0) + (now() - t0);
    if (r.done) {
      const old = logoCache[0];
      logoCache[0] = j.box.L; logoJob = null;
      if (old) { old.dark.width = 1; old.lit.width = 1; }
    }
  }
  /** the logo layers: current scale; or (V10c) the previous scale's while the new one is built in the background; the very first one synchronously */
  function logoFor() {
    const L = logoCache[0];
    if (L && L.kb === KB) return L;
    if (!logoJob || logoJob.kb !== KB) { const box = {}; logoJob = { kb: KB, gen: buildLogoGen(KB, box), box }; }
    if (L) { bgSchedule(); return L; }
    while (logoJob && logoJob.kb === KB && !logoCache[0]) logoStep();
    return logoCache[0] || L;
  }

  /* a soap bubble in logical units (rim, near-invisible body, thin-film cap, caustic, window highlight), a port of the mockup's drawBubble('empty') */
  function softBubble(ctx, x, y, r, t, o) {
    o = o || {};
    const A = o.a === undefined ? 1 : o.a;
    if (A <= 0.004 || r <= 0) return;
    const px = 1 / (K || KB), ph = o.ph || 0, wob = o.wobble === undefined ? 1 : o.wobble;
    const tint = o.tint || RGB.cyan, stops = N.FILM, w = clamp(r * 0.055, 1.3 * px, 4.2 * px), wr = clamp(r * 0.042, 1.2 * px, 3.3 * px);
    const sx = 1 + Math.sin(t * 3.1 + ph) * 0.028 * wob, sy = 1 - Math.sin(t * 3.1 + ph) * 0.028 * wob;
    const conic = !!ctx.createConicGradient;
    ctx.save();
    ctx.translate(x, y); ctx.scale(sx, sy);
    ctx.globalCompositeOperation = 'lighter';
    const ha = 0.17 * A * (o.halo === undefined ? 1 : o.halo);
    const hg = ctx.createRadialGradient(0, 0, r * 0.62, 0, 0, r * 1.95);
    hg.addColorStop(0, rgba(tint, 0)); hg.addColorStop(0.2, rgba(tint, ha * 0.3)); hg.addColorStop(0.31, rgba(tint, ha)); hg.addColorStop(0.5, rgba(tint, ha * 0.32)); hg.addColorStop(0.75, rgba(tint, ha * 0.07)); hg.addColorStop(1, rgba(tint, 0));
    ctx.fillStyle = hg; ctx.fillRect(-r * 2, -r * 2, r * 4, r * 4);
    const bg = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r);
    bg.addColorStop(0, rgba(tint, 0)); bg.addColorStop(0.75, rgba(tint, 0.015 * A)); bg.addColorStop(1, rgba(tint, 0.09 * A));
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    const cg = ctx.createRadialGradient(r * 0.34, r * 0.4, 0, r * 0.34, r * 0.4, r * 0.82);
    cg.addColorStop(0, rgba(hot(tint, 0.35), 0.17 * A)); cg.addColorStop(0.5, rgba(tint, 0.05 * A)); cg.addColorStop(1, rgba(tint, 0));
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(0, 0, r * 0.97, 0, TAU); ctx.fill();
    const rpx = r / px;
    if (conic && rpx > 7) {                                      // film bands only where they can be seen
      const drift = Math.sin(t * 0.5 + ph) * 0.14;
      const band = (a0, f, al, wid) => {
        const g = ctx.createConicGradient(a0 + drift, 0, 0), n = f.length;
        f.forEach((fr, i) => g.addColorStop(fr, rgba(hot(stops[Math.min(stops.length - 1, Math.round(i / (n - 1) * (stops.length - 1)))], 0.2), Math.min(1, al[i] * A))));
        ctx.lineWidth = wid; ctx.strokeStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 0.86, 0, TAU); ctx.stroke();
      };
      ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r * 0.985, 0, TAU); ctx.clip(); ctx.lineCap = 'butt';
      band(2.55, [0, 0.1, 0.24, 0.38, 0.5, 0.6, 1], [0, 0.14, 0.36, 0.26, 0.1, 0, 0], r * 0.3);
      band(2.55, [0, 0.1, 0.24, 0.38, 0.5, 0.6, 1], [0, 0.1, 0.3, 0.2, 0.08, 0, 0], r * 0.14);
      band(0.35, [0, 0.12, 0.3, 0.45, 1], [0, 0.1, 0.17, 0, 0], r * 0.22);
      ctx.restore();
    }
    // rim + highlights (call inside the same transform)
    const rot = t * 0.55 + ph;
    const film = (a) => (conic ? N.filmGradient(ctx, 0, 0, rot, a, stops) : rgba(tint, a));
    ctx.lineWidth = wr * 3.2; ctx.strokeStyle = film(0.10 * A); ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
    ctx.lineWidth = wr * 1.5; ctx.strokeStyle = film(0.34 * A); ctx.stroke();
    ctx.lineWidth = wr * 0.8; ctx.strokeStyle = film(0.62 * A); ctx.stroke();
    ctx.lineCap = 'round';
    const seg = (a0, a1, lw, al) => { ctx.lineWidth = lw; ctx.strokeStyle = film(al * A); ctx.beginPath(); ctx.arc(0, 0, r, a0 * Math.PI / 180, a1 * Math.PI / 180); ctx.stroke(); };
    seg(175, 292, wr * 1.25, 0.95); seg(5, 95, wr * 1.05, 0.7);
    const hl = (rr, a0, a1, lw, al) => { ctx.lineWidth = lw; ctx.strokeStyle = rgba(WHITE, al * A); ctx.beginPath(); ctx.arc(0, 0, rr, a0 * Math.PI / 180, a1 * Math.PI / 180); ctx.stroke(); };
    hl(r * 0.7, 200, 252, wr * 2.1, 0.30); hl(r * 0.7, 206, 246, wr * 1.2, 0.92);
    ctx.fillStyle = rgba(WHITE, 0.95 * A); ctx.beginPath(); ctx.arc(Math.cos(262 * Math.PI / 180) * r * 0.7, Math.sin(262 * Math.PI / 180) * r * 0.7, wr * 0.9, 0, TAU); ctx.fill();
    ctx.lineWidth = wr * 2.6; ctx.strokeStyle = film(0.16 * A); ctx.beginPath(); ctx.arc(0, 0, r * 0.76, 14 * Math.PI / 180, 66 * Math.PI / 180); ctx.stroke();
    ctx.lineWidth = wr * 1.05; ctx.strokeStyle = film(0.7 * A); ctx.beginPath(); ctx.arc(0, 0, r * 0.76, 20 * Math.PI / 180, 58 * Math.PI / 180); ctx.stroke();
    ctx.restore();
  }

  function drawLogo(ctx, cx, y, t) {
    if (!K) autoScale(ctx);
    t = t || 0;
    const L = logoFor();
    if (!L) return { total: 0, uy: y };                              // (the build threw: already logged)
    const kb = L.kb, cap = LOGO_CAP, track = LOGO_TRACK, G = L.G;
    const total = G.total / kb, wF = G.wF / kb, wA = G.wA / kb, gap = G.gap / kb, wP = G.wP / kb, gP = G.gP, gO = G.gO;
    const x = cx - total / 2, xa = x + wF + gap, xp = xa + wA + gap;
    const bx = xp + (gP + track) * cap + gO * cap / 2, by = y + cap * 0.5;
    glow(ctx, x + wF / 2, y + cap * 0.5, cap * 2.1, P1C, 0.17, 0.55);
    glow(ctx, xp + wP / 2, y + cap * 0.5, cap * 2.0, P2C, 0.16, 0.55);
    glow(ctx, xa + wA / 2, y + cap * 0.5, cap * 0.9, RGB.violet, 0.12, 0.8);
    const iK = 1 / (K || kb), ox = Math.round((x - L.pad / kb) / iK) * iK, oy = Math.round((y - L.pad / kb) / iK) * iK;
    ctx.drawImage(L.dark, ox, oy, L.Wc / kb, L.Hc / kb);
    const gco = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(L.lit, ox, oy, L.Wc / kb, L.Hc / kb);
    ctx.globalCompositeOperation = gco;
    softBubble(ctx, bx, by, gO * cap / 2 + cap * 0.04, t, { ph: 1.3, halo: 1.2 });
    const R = N.rng(9);                                          // bubbles fizzing up out of FIZZ
    for (let i = 0; i < 9; i++) {
      const bx0 = x + R.float(0.05, 0.95) * wF, ph = (t * R.float(0.12, 0.24) + R.float(0, 1)) % 1;
      const rr = cap * R.float(0.035, 0.1), pxx = bx0 + Math.sin(ph * 9 + i) * cap * 0.05, pyy = y - cap * 0.1 - ph * cap * 0.85;
      softBubble(ctx, pxx, pyy, rr, t, { ph: i, a: 0.95 * Math.sin(Math.PI * ph), wobble: 0.6, tint: mixc(P1C, RGB.cyan, i % 3 * 0.3) });
    }
    const uy = y + cap * 1.3, ux0 = cx - total / 2, ux1 = cx + total / 2;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const ug = ctx.createLinearGradient(ux0, 0, ux1, 0);
    ug.addColorStop(0, rgba(P1C, 0)); ug.addColorStop(0.2, rgba(P1C, 0.8)); ug.addColorStop(0.5, rgba(WHITE, 0.95)); ug.addColorStop(0.8, rgba(P2C, 0.8)); ug.addColorStop(1, rgba(P2C, 0));
    ctx.strokeStyle = ug; ctx.lineWidth = Math.max(1.4 / (K || kb), cap * 0.014); ctx.beginPath(); ctx.moveTo(ux0, uy); ctx.lineTo(ux1, uy); ctx.stroke();
    ctx.restore();
    dot(ctx, cx, uy, cap * 0.028, WHITE, 1, { halo: 5 });
    return { total, uy };
  }

  /* ================================================================================================================
   * 9c. BIG CAST (V11): GFX.drawHero(ctx, who, x, y, scale, t, opts) / GFX.drawBig(kind, ctx, x, y, scale, t, opts)
   *     The registry sprites are baked for 1x; the title / ending twins (and a big Kraken) are drawn from the cast's own art at 2-3x. The art is
   *     baked here per (kind, pose, frame, scale) at min(K, 5) device px per logical px (re-baked inside the per-frame slice after a scale change,
   *     the previous bake keeps being drawn meanwhile) and blitted with one drawImage. Main / Game never touch GFX_CAST for this.
   *       kind/who : 'fizz' | 'pop' (also 'p1' | 'p2') | 'kraken' | 'kraken_angry'
   *       (x, y)   : bottom centre of the creature's registry box (16 x 16, Kraken 48 x 48) in logical px;  scale : size factor (1 = registry size)
   *       t        : seconds; the frame is floor(t * fps) % frames (fps 3, frames 8 for the looping poses, 1 for jump / fall / die)
   *       opts     : { pose: 'idle' | 'blink' | 'walk' | 'jump' | 'fall' | 'puff' | 'shoot' | 'die' | 'stun' (default 'idle'), frame, frames (override),
   *                    fps, flip, alpha }
   * ============================================================================================================== */
  const BIG_PAD = { l: 7, r: 6, t: 7, b: 4 };
  const BIG = {
    fizz: { box: [16, 16], hs: 1.1, pad: BIG_PAD, art: 'hero', who: 'fizz', sprite: 'p1' },
    pop: { box: [16, 16], hs: 1.1 * 0.97, pad: BIG_PAD, art: 'hero', who: 'pop', sprite: 'p2' },
    kraken: { box: [48, 48], hs: 1, pad: { l: 8, r: 8, t: 8, b: 5 }, art: 'kraken', angry: false, sprite: 'kraken' },
    kraken_angry: { box: [48, 48], hs: 1, pad: { l: 8, r: 8, t: 8, b: 5 }, art: 'kraken', angry: true, sprite: 'kraken_angry' },
  };
  const BIG_ALIAS = { p1: 'fizz', p2: 'pop' };
  const BIG_FRAMES = { jump: 1, fall: 1, die: 1 };
  const BIG_BAKE_MAX_K = 5;
  const bigCache = new Map();
  let bigPx = 0;
  function dropBig() { for (const e of bigCache.values()) { e.cv.width = 1; e.cv.height = 1; } bigCache.clear(); bigPx = 0; }
  function castArt() { try { return typeof GFX_CAST !== 'undefined' && GFX_CAST && GFX_CAST.art ? GFX_CAST.art : null; } catch (e) { return null; } }

  function bigBake(kind, spec, art, pose, f, nf, Sb, key, kh) {
    const t0 = now();
    const bw = spec.box[0], bh = spec.box[1], pd = spec.pad;
    const w = Math.ceil((bw + pd.l + pd.r) * Sb * kh), h = Math.ceil((bh + pd.t + pd.b) * Sb * kh);
    const old = bigCache.get(key);
    if (old) { bigPx -= old.cv.width * old.cv.height; old.cv.width = 1; old.cv.height = 1; bigCache.delete(key); }
    const cv = makeCanvas(w, h), g = cv.getContext('2d');
    const k = kh * Sb, hs = spec.hs;
    g.setTransform(k, 0, 0, k, pd.l * Sb * kh, pd.t * Sb * kh);
    g.translate(bw / 2, bh); g.scale(hs, hs); g.translate(-bw / 2, -bh);
    const o = { pose, ph: TAU * f / nf, f, n: nf, u: f / nf, w: N.lwFor(k * hs), big: k * hs > 7.5, name: kind + '_' + pose, k, S: hs, box: { w: bw, h: bh } };
    try { if (spec.art === 'hero') art.hero(g, spec.who, o); else art.kraken(g, o, !!spec.angry); }
    catch (err) { warnOnce('big:' + kind, 'big ' + kind + ' ' + pose + ' threw: ' + (err && err.message)); }
    const e = { cv, kh, Sb, last: ++state.clock };
    bigCache.set(key, e); bigPx += w * h;
    while (bigPx > MAX_PX * 0.5 && bigCache.size > 1) { const k0 = bigCache.keys().next().value; const o0 = bigCache.get(k0); if (o0 === e) break; bigPx -= o0.cv.width * o0.cv.height; o0.cv.width = 1; o0.cv.height = 1; bigCache.delete(k0); }
    migCharge(now() - t0);
    state.bakes++; state.bakeMs += now() - t0;
    return e;
  }
  function drawBig(kind, ctx, x, y, scale, t, opts) {
    kind = BIG_ALIAS[kind] || kind;
    const spec = BIG[kind];
    if (!spec) { warnOnce('big?:' + kind, 'drawBig: unknown kind ' + kind); return; }
    if (!K) autoScale(ctx);
    const o = opts || NOOPT;
    const S = scale > 0 ? +scale : 1;
    const pose = spec.art === 'hero' ? (o.pose || 'idle') : 'idle';
    const nf = Math.max(1, Math.floor(o.frames > 0 ? o.frames : BIG_FRAMES[pose] || 8));
    let f = o.frame !== undefined ? Math.floor(+o.frame) : Math.floor((+t || 0) * (o.fps > 0 ? o.fps : 3));
    if (f !== f) f = 0;
    f %= nf; if (f < 0) f += nf;
    const art = castArt();
    if (!art || (spec.art === 'hero' ? typeof art.hero !== 'function' : typeof art.kraken !== 'function')) {      // stub builds: the registry sprite at normal size
      const name = spec.art === 'hero' ? spec.sprite + '_' + (pose === 'puff' ? 'shoot' : pose === 'blink' ? 'idle' : pose) : spec.sprite;
      if (REG.has(name)) draw(ctx, name, pose === 'blink' ? 1 : f, x - spec.box[0] / 2, y - spec.box[1], { flip: o.flip, alpha: o.alpha });
      return;
    }
    const Sb = Math.max(1, Math.ceil(S * 2 - 1e-6) / 2), kh = Math.min(K, BIG_BAKE_MAX_K);
    const key = kind + '|' + pose + '|' + f + '/' + nf + '|' + Sb;
    let e = bigCache.get(key);
    if (!e) e = bigBake(kind, spec, art, pose, f, nf, Sb, key, kh);
    else if (e.kh !== kh && migOK()) e = bigBake(kind, spec, art, pose, f, nf, Sb, key, kh);
    e.last = ++state.clock; bigCache.delete(key); bigCache.set(key, e);
    const pd = spec.pad, r = S / Sb;
    const dw = e.cv.width / e.kh * r, dh = e.cv.height / e.kh * r;
    const ox = x - spec.box[0] / 2 * S - pd.l * S, oy = y - spec.box[1] * S - pd.t * S;
    const sx = Math.round(ox * K) / K, sy = Math.round(oy * K) / K;
    const ga = ctx.globalAlpha;
    if (o.alpha !== undefined && o.alpha !== 1) ctx.globalAlpha = ga * (o.alpha < 0 ? 0 : o.alpha);
    if (o.flip) { ctx.save(); ctx.translate(x, 0); ctx.scale(-1, 1); ctx.translate(-x, 0); ctx.drawImage(e.cv, sx, sy, dw, dh); ctx.restore(); }
    else ctx.drawImage(e.cv, sx, sy, dw, dh);
    if (o.alpha !== undefined && o.alpha !== 1) ctx.globalAlpha = ga;
  }
  function drawHero(ctx, who, x, y, scale, t, opts) { drawBig(who, ctx, x, y, scale, t, opts); }

  /* ================================================================================================================
   * 9b. levelGlints (optional, additive): the baked levelCanvas is static, so this adds the mockup's travelling glints along the lit top faces
   *     (one soft light per platform, a few ms of rasteriser work per frame at most). ctx in logical units; call it right after drawing
   *     the levelCanvas. t = seconds. Not part of the SPEC_V2 contract: Game may ignore it.
   * ============================================================================================================== */
  const glintCache = new WeakMap();
  function levelGlints(ctx, i, map, t) {
    i = clamp(i | 0, 0, 29); t = +t || 0;
    const rows = rowsOf(map);
    let list = glintCache.get(rows);
    if (!list) {
      list = [];
      for (const s of buildLevelGeo(rows).segs) {
        const len = Math.abs(s.x1 - s.x0);
        if (s.cls === 'T' && s.y0 > MAP_Y + 0.1 && s.y0 < LH - 7 && len >= 8) list.push({ x0: Math.min(s.x0, s.x1), x1: Math.max(s.x0, s.x1), y: s.y0, len });
      }
      glintCache.set(rows, list);
    }
    const th = themeData(i);
    for (const s of list) {
      const gpos = s.x0 + ((t * 20 + s.x0 * 1.3 + s.y * 0.7) % (s.len + 50)) - 20;
      if (gpos < s.x0 - 3 || gpos > s.x1 + 3) continue;
      const edgeFade = Math.min(1, (gpos - s.x0 + 3) / 8, (s.x1 + 3 - gpos) / 8);
      glow(ctx, clamp(gpos, s.x0, s.x1), s.y, 4.2, th.edgeHot, 0.5 * Math.max(0, edgeFade));
    }
  }

  /* ================================================================================================================
   * 10. SHEET: every defined sprite x frame, labelled, on a dark grid (debug)
   * ============================================================================================================== */
  let sheetLayout = [];
  function sheet() {
    const defs = Array.from(REG.values()).sort((a, b) => a.order - b.order);
    const s = 3, GAP = 10, LABEL = 20, MAXW = 1800, LCAP = 7, LTRACK = 0.4;
    // v3 (V9): a cell is as wide as its frames AND its label (the label of a narrow single-frame sprite used to run into the next cell)
    const cells = defs.map((d) => {
      const label = d.name + ' x' + d.frames, lw = Math.ceil(N.textWidth(label, LTRACK) * LCAP) + GAP;
      const fw = Math.ceil((d.w + d.pad.l + d.pad.r) * s) + GAP;
      return { d, label, fw, total: Math.max(fw * d.frames, lw), ch: Math.ceil((d.h + d.pad.t + d.pad.b) * s) + GAP + LABEL };
    });
    let x = GAP, y = GAP, rowH = 0, W = 0;
    const pos = [];
    for (const c of cells) {
      if (x + c.total > MAXW && x > GAP) { x = GAP; y += rowH; rowH = 0; }
      pos.push([x, y]);
      x += c.total;
      if (x > W) W = x;
      rowH = Math.max(rowH, c.ch);
    }
    const Wc = Math.max(320, Math.min(W + GAP, 4096)), Hc = Math.max(80, Math.min(y + rowH + GAP, 8192));
    sheetLayout = cells.map((c, i) => ({ name: c.d.name, label: c.label, x: pos[i][0], y: pos[i][1], w: c.total, h: c.ch, labelW: Math.ceil(N.textWidth(c.label, LTRACK) * LCAP) }));
    const cv = makeCanvas(Wc, Hc), g = cv.getContext('2d');
    g.fillStyle = '#05070f'; g.fillRect(0, 0, Wc, Hc);
    g.strokeStyle = 'rgba(60,242,255,0.06)'; g.lineWidth = 1;
    for (let gx = 0; gx < Wc; gx += 24) { g.beginPath(); g.moveTo(gx + 0.5, 0); g.lineTo(gx + 0.5, Hc); g.stroke(); }
    for (let gy = 0; gy < Hc; gy += 24) { g.beginPath(); g.moveTo(0, gy + 0.5); g.lineTo(Wc, gy + 0.5); g.stroke(); }
    if (!defs.length) { N.drawText(g, 'NO SPRITES DEFINED', 20, 24, 14, { col: RGB.magenta, track: 0.5, lw: 1.4 }); return cv; }
    cells.forEach((c, i) => {
      const d = c.d, [px, py] = pos[i];
      g.save();
      N.drawText(g, c.label, px, py + 2, LCAP, { col: mixc(RGB.cyan, WHITE, 0.4), track: LTRACK, lw: 0.9, halo: 0.3, hot: 0.4 });
      g.restore();
      for (let f = 0; f < d.frames; f++) {
        const ox = px + f * c.fw, oy = py + LABEL;
        g.save();
        g.strokeStyle = 'rgba(60,242,255,0.28)'; g.setLineDash([3, 3]);
        g.strokeRect(ox + d.pad.l * s + 0.5, oy + d.pad.t * s + 0.5, d.w * s, d.h * s);
        g.setLineDash([]);
        g.translate(ox + d.pad.l * s, oy + d.pad.t * s); g.scale(s, s);
        try { d.draw(g, f, { k: s, frame: f, frames: d.frames, name: d.name, t: f / d.frames, bake: false }); } catch (e) { lint('sheet ' + d.name + ': ' + (e && e.message)); }
        g.restore();
      }
    });
    return cv;
  }

  /* ================================================================================================================
   * 11. test hooks + public API
   * ============================================================================================================== */
  const _registry = () => Array.from(REG.values()).sort((a, b) => a.order - b.order).map((d) => ({ name: d.name, w: d.w, h: d.h, frames: d.frames, pad: Object.assign({}, d.pad), lazy: d.lazy, baked: d.slots.filter(Boolean).length }));
  const _lint = () => lintLog.slice();
  const _timings = () => Object.assign({}, timings);
  function _stats() {
    let entries = 0, stale = 0;
    for (const d of REG.values()) for (const e of d.slots) if (e) { entries++; if (e.kb !== KB) stale++; }
    return { k: K, kb: KB, px: state.px, maxPx: MAX_PX, entries, stale, bakes: state.bakes, bakeMs: state.bakeMs, evictions: state.evictions, peakPx: state.peakPx, resets: state.resets,
      jobs: jobQ.length + (jobCur ? 1 : 0), tilePx: state.tilePx, fonts: fonts.size, strings: strCache.size, stringPx: strPx, particles: partCache.size, particlePx: partPx, levels: levelCache.size, bgs: bgCache.size, missing: missing.size, defs: REG.size, warmQueue: warmQ.length,
      pipes: pipesDone, migrating: mig.on, slices: state.slices, sliceMax: state.sliceMax, worldSteps: state.worldSteps || 0, worldStepMax: state.worldStepMax || 0, bigs: bigCache.size, bigPx,
      worldPx: Array.from(levelCache.values()).concat(Array.from(bgCache.values())).reduce((a, o) => a + o.cv.width * o.cv.height, 0),
      worldStale: Array.from(levelCache.values()).concat(Array.from(bgCache.values())).filter((o) => o.kb !== KB).length };
  }
  function _warmNow(ms) { if (!K) setScale(2); return warmStep(ms === undefined ? 50 : ms); }
  /** test hook: bgOff(true) stops the background pumps (idle + rAF) so a test can step them by hand with _bgRun(ms) */
  function _bgOff(on) { bgOff = !!on; }
  function _bgRun(ms) { return bgRun(ms === undefined ? 3 : ms); }
  const _sliceTop = () => sliceTop.slice();
  const _stepLog = () => stepLog.slice();
  const _sheetLayout = () => sheetLayout.slice();

  return {
    init, setScale, define, draw, frames, size, has, warm, warmStep: warmPublic,
    text, textWidth, levelCanvas, bgCanvas, levelGlints, theme, drawLogo, postFX, particle, sheet, drawHero, drawBig,
    _registry, _lint, _timings, _stats, _warmNow, _bgOff, _bgRun, _sliceTop, _stepLog, _sheetLayout, _reset, _undefine, _postMode, _themeData: themeData, _softBubble: softBubble,
  };
})();


/* ===== 11_gfx_cast.js ===== */
/* FIZZ & POP v2.0 - 11_gfx_cast.js  ->  const GFX_CAST   (the sprite DEFINITIONS of "Abyss Glow")
 * Calls GFX.define(name, {w, h, frames, pad, draw(ctx, frame, opts)}) at load for EVERY registry sprite (SPEC sec. 3.1 + the wave-2/3
 * additions crabbit_throw_angry / springle_squash_angry / glimmer_fire_angry = 82 names, + the v3 <e>_frozen sprites = 87 names). Ported from the approved mockup
 * (concepts/c_abyss_glow/parts: 20_players, 30_enemies, 31_kraken, 40_objects) with NEON primitives (src/09_neon.js).
 *
 * CONTRACT (10_gfx.js)  draw(ctx, frame, opts) paints ONE frame in LOGICAL units, origin = top-left of the w x h registry box, facing
 *   RIGHT, under a transform that already scales by the bake scale opts.k (output px per logical px). Everything is drawn onto a
 *   TRANSPARENT canvas with additive ('lighter') light, so GFX.draw can blit it with plain source-over.
 *   Stroke widths come from NEON.lwFor(k * S) where S is the art scale of that sprite (so the line is ~1 px at k = 1, 1.9 px at k = 4).
 *   pad = how far soft light (halo, heat, steam) may reach beyond the box; the contour itself stays within the SPEC_V2 overdraw limits
 *   (heroes <= 1.35 x box, enemies <= 1.25 x, items <= 1.2 x; test/v2_cast_test.mjs measures the alpha >= 0.45 extents) and every glow
 *   fades to zero inside the pad (test: no alpha on the outer pixel ring).
 *
 * ANIMATION  frame f of n frames is the phase u = f / n (0..1) of ONE seamless loop; ph = TAU * u. All periodic motion uses integer
 *   multiples of ph, so frame n-1 -> frame 0 is continuous: walk cycles (feet alternate, body bobs), gill / tentacle sway, tail wag,
 *   cog rotation, bell pulse, lantern pulse, steam puffs rising once per loop, bubble wobble / film drift, flame flicker, burst.
 *
 * LOOK  creatures are luminous contours (white-hot core + coloured halo) around a dark translucent body; ONLY Fizz and Pop have lit
 *   bodies (inner light organ), so they are always the brightest shapes. One neon hue + one silhouette per enemy. ANGRY = crimson
 *   #ff2a2a contour + slanted brows + steam puffs + a pulsing heat halo, baked into the *_angry frames (Game draws no aura of its own).
 *
 * V3 FIX WAVE (FIXPLAN_V3 'Cast')
 *   V1  <e>_frozen (nibbler crabbit jellop springle glimmer; 16x16x4 like <e>_move): an ICE CAST of the creature (pale white-lilac FROST contour, milky frosted body with
 *       straight ice facets, rime stroke, ice shards, crystalline twinkles). The body is the move frame 0 pose in EVERY frame; only the twinkles change, so Game may draw
 *       frame 0 or step the frames for a living glitter. Draw it plain (no tint / white / glow options needed); flip works like <e>_move. Dimmer than the twins on purpose.
 *   C1  ink: dark underlay disc + saturated red-orange #ff5a1f rim + white-hot core (never purple / pink, readable over the Kraken).
 *   C2  trap_overlay stages differ by SHAPE: 1 = thicker rim broken into 8 dashes, 2 = the thickest / hottest rim + inner ring + 4 crack lines (static frames: Game may add a
 *       smooth alpha pulse for the shimmer / pulse cues).
 *   C3  Fizz and Pop are lit bodies with a strong light gain (HERO_LK): the brightest shapes of the cast, P2 ~1.35 x P1 in luminance (hue-independent tell).
 *   C4  *_angry frames: thick white-hot core line on every contour, rage-lit body, doubled brows, rage core glow (ANG wrappers): at least as luminous as the calm twin.
 *   C5  bubble_fire = a 3-tongue flame, bubble_water = a round drop on two wave lines.   V7  Kraken royal purple (violet + 30 % magenta), angry = crimson.
 *   V8  pu_pink = four outward arrows (range), pu_blue = double chevron (rate), pu_gold = comet with motion lines (speed).   X7  pads raised where light was cut at k = 1.
 *
 * SPRITES  p1_/p2_ idle(2: blink) walk(4) jump fall shoot(2: cheeks puffed -> mouth open) die(4: spinning 0/90/180/270, X eyes) stun(2: swirl eyes + stars) icon(8x8);
 *   bubble(2) bubble_shot(3: growing) bubble_warn(2: red flicker) bubble_pop(3) trap_overlay(3 stages: cyan / amber / crimson shell, drawn OVER <e>_trapped)
 *   bubble_thunder|fire|water(2, glowing icon) bubble_letter(2, dark centre for the printed glyph); <e>_move(4) <e>_angry(4) <e>_trapped(2, captive on a dark disc)
 *   <e>_die(4) + <e>_frozen(4, V3) for nibbler crabbit jellop springle glimmer; crabbit_throw springle_squash glimmer_fire (+ _angry twins); bonefin(2); kraken kraken_angry (48x48, 2)
 *   kraken_trapped (64x64); pebble spark ink (8x8, 2) bolt (16x8) fire_drop flame (8x16, 3) water_flow water_fall (seamless 8x8 stream tiles) sparkle(4) poof(3)
 *   food_0..7 (sea grapes, kelp roll, clam, shrimp tempura, sushi, pudding, sundae, golden crown) pu_shoes pu_pink pu_blue pu_gold pu_parasol pu_clock pu_bomb pu_heart
 *   (every power-up wears a cyan orbit ring with ticks) moonpearl (32x32, 2).
 *
 * EXPORT  GFX_CAST = { count (number of defined sprites: 87), names (array, definition order), art (the raw draw helpers, tests only) }
 *   Loading is safe without a GFX that has define() (count = 0) and never touches the DOM. Deterministic: no Math.random / Date.
 */
const GFX_CAST = (() => {
  'use strict';
  const N = NEON;
  const { neon: neonN, body: bodyN, brow: browN, glow, dot, sparkle, starPath, spline, poly, arcPts, quadPts, circlePath, ellipsePath, sampleSpline, taper, spinePath,
    lwFor, rgba, mixc, hot, hex, RGB, WHITE, TAU, clamp, lerp, eyeBall, gearPath, rng } = N;
  const HAVE_GFX = typeof GFX !== 'undefined' && !!GFX && typeof GFX.define === 'function';
  const PI = Math.PI, sin = Math.sin, cos = Math.cos, abs = Math.abs, max = Math.max, min = Math.min;
  const names = [];

  /* GFX.define wrapper. draw(ctx, f, o) receives o = {k, f, n, u, ph, name, w (stroke for scale S), S}. S = art scale about (ax, ay). */
  function def(name, w, h, frames, pad, S, anchor, fn) {
    if (typeof fn !== 'function') { fn = anchor; anchor = null; }
    const ax = anchor ? anchor[0] : w / 2, ay = anchor ? anchor[1] : h / 2;
    if (!HAVE_GFX) return false;                       // an old / missing GFX without define(): nothing to register (never throws at load)
    const ok = GFX.define(name, {
      w, h, frames, pad,
      draw(ctx, f, op) {
        const k = op && op.k > 0 ? op.k : 2;
        const n = frames;
        const o = { k, f, n, u: f / n, ph: TAU * f / n, name, S, w: lwFor(k * S), box: { w, h }, big: k * S > 7.5, ax, ay };
        if (S !== 1) { ctx.save(); ctx.translate(ax, ay); ctx.scale(S, S); ctx.translate(-ax, -ay); }
        fn(ctx, o);
        if (S !== 1) ctx.restore();
      },
    });
    if (ok !== false) names.push(name);
    return ok;
  }

  /* C4: while an *_angry frame is drawn (ANG = 1, set by creatureFrame) every neon contour gets a THICK white-hot inner core line, every lit body is filled with a
   * hot red-orange rage light and the brows are doubled: angry creatures end up at least as luminous as their calm twin (the crimson hue alone is the darkest hue of
   * the palette) while the hue stays crimson. Everything else (heroes, items, bubbles ...) is untouched: ANG is 0 there. */
  let ANG = 0;
  const RAGE0 = mixc(RGB.crimson, RGB.amber, 0.26);                                                       // the rage light: crimson with a little amber
  let RAGE = RAGE0, ANG_BW = 0.18, ANG_CW = 0.5;                                                         // RAGE + how much white the body fill / the contour core get
  /* V1: while a <e>_frozen frame is drawn (FRZ = 1) the contour gets a rime stroke (wide, pale) and a thick white-hot core, and every body is filled with a milky
   * frosted-glass light with a few straight ice facets, so a frozen creature reads as an ICE CAST of itself: pale white-lilac (FROST), desaturated, never cyan. */
  let FRZ = 0;
  const FROST = [200, 190, 255], FROST_BODY = [158, 150, 232];     // icy pale white-lilac (hue ~252 deg, saturation 0.28) for the contour; a mid lilac for everything that STACKS (halo, rim glow, milky fill):
                                                                    // stacked pale layers clip to pure white under the additive blend + post bloom, mid lilac layers stay lilac (Pop is cyan 190 / 0.6; no enemy is this pale)
  function neon(ctx, path, col, w, o) {
    if (FRZ) o = Object.assign({}, o, { hot: Math.min(o && o.hot !== undefined ? o.hot : 0.75, 0.3), a: (o && o.a !== undefined ? o.a : 1) * FROZEN_A, halo: (o && o.halo !== undefined ? o.halo : 1) * 0.7 });        // the white-hot centre line would white the ice out under the post bloom; the ice is dimmer than the twins
    neonN(ctx, path, col, w, o);
    if (FRZ && !(o && (o.halo === 0 || o.a < 0.5))) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const a = o && o.a !== undefined ? o.a : 1;
      ctx.lineWidth = Math.min(w * 2.0, 0.9); ctx.strokeStyle = rgba(FROST_BODY, 0.14 * a); ctx.stroke(path);          // (clamped: at small k the 1 px stroke floor would otherwise white out the detail)
      ctx.lineWidth = Math.min(w * 0.5, 0.3); ctx.strokeStyle = rgba(WHITE, 0.36 * a); ctx.stroke(path);
      ctx.restore();
    }
    if (ANG && !(o && (o.halo === 0 || o.a < 0.5))) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.lineWidth = w * ANG_CORE_W; ctx.strokeStyle = rgba(mixc(RAGE, WHITE, ANG_CW), ANG_CORE_A * (o && o.a !== undefined ? o.a : 1)); ctx.stroke(path);
      ctx.restore();
    }
  }
  const FROZEN_A = 0.8;
  const ICE_FACETS = [[[1.5, 5.5], [8.5, 10.5], [15, 8.5]], [[4.5, 1.5], [7, 9.5], [5.5, 15.5]], [[11, 2.5], [9, 8], [12.5, 14]]];
  function body(ctx, path, col, w, o) {
    bodyN(ctx, path, FRZ ? FROST_BODY : col, w, o);
    if (FRZ && !(o && o.noBack)) {
      const y0 = o && o.y0 !== undefined ? o.y0 : 0, y1 = o && o.y1 !== undefined ? o.y1 : 16;
      ctx.save(); ctx.clip(path); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, rgba(FROST_BODY, 0.24)); g.addColorStop(1, rgba(FROST_BODY, 0.1));
      ctx.fillStyle = g; ctx.fill(path);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = w * 0.3; ctx.strokeStyle = rgba(WHITE, 0.24);
      for (const f of ICE_FACETS) { ctx.beginPath(); ctx.moveTo(f[0][0], f[0][1]); for (let i = 1; i < f.length; i++) ctx.lineTo(f[i][0], f[i][1]); ctx.stroke(); }
      ctx.restore();
    }
    if (ANG && !(o && o.noBack)) {
      const y0 = o && o.y0 !== undefined ? o.y0 : 0, y1 = o && o.y1 !== undefined ? o.y1 : 16;
      ctx.save(); ctx.clip(path); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, rgba(mixc(RAGE, WHITE, ANG_BW), ANG_BODY_A * ANG)); g.addColorStop(1, rgba(RAGE, ANG_BODY_A * 0.55 * ANG));
      ctx.fillStyle = g; ctx.fill(path); ctx.restore();
    }
  }
  function brow(ctx, x, y, r, dir, w, col) {
    browN(ctx, x, y, r, dir, w, col);
    if (ANG) {
      const p = new Path2D(); p.moveTo(x - r * 1.15 * dir, y - r * 1.55); p.lineTo(x + r * 1.1 * dir, y - r * 0.55);
      neonN(ctx, p, mixc(RAGE, WHITE, 0.3), w * 1.6, { a: 1, halo: 0.9, hot: 0.9 });
    }
  }
  const ANG_CORE_W = 0.8, ANG_CORE_A = 0.9, ANG_BODY_A = 0.62;

  const dark = (a) => 'rgba(4,6,14,' + (a === undefined ? 0.9 : a).toFixed(3) + ')';
  const fillAdd = (ctx, path, col, a) => { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(col, a); ctx.fill(path); ctx.restore(); };
  const fillDark = (ctx, path, a) => { ctx.save(); ctx.fillStyle = dark(a); ctx.fill(path); ctx.restore(); };

  /* rises-once-per-loop steam puffs: u = loop phase 0..1, rise = max height in units (kept short: the pad is small) */
  function steamLoop(ctx, x, y, u, w, col, n, rise) {
    n = n || 3; rise = rise || 3.4;
    const vc = mixc(col, WHITE, 0.45);
    for (let i = 0; i < n; i++) {
      const ph = (u + i / n) % 1;
      const bx = x + (i - (n - 1) / 2) * 1.9, rs = 0.8 + ph * rise;
      const p = new Path2D();
      for (let j = 0; j <= 12; j++) {
        const q = j / 12, yy = y - q * rs, xx = bx + sin(q * 7 + ph * 5 + i * 2) * (0.3 + q * 0.5);
        j ? p.lineTo(xx, yy) : p.moveTo(xx, yy);
      }
      const a = sin(PI * min(1, ph * 1.04)) * 0.95;
      neon(ctx, p, vc, w * 0.6, { a, halo: 0.55, hot: 0.4 });
      glow(ctx, bx, y - rs * 0.55, 1.7 + ph * 1.7, col, 0.3 * a);
    }
  }
  /* pulsing heat halo of an angry creature (one pulse per loop) */
  function heatLoop(ctx, u, col, cx, cy, r, gain) {
    const s = sin(TAU * u), g = gain || 1;
    glow(ctx, cx, cy, r * (1 + s * 0.07), col, (0.4 + s * 0.08) * g);
  }
  /* an X eye (dead / knocked out) */
  function xEye(ctx, x, y, r, col, w) {
    glow(ctx, x, y, r * 2.6, col, 0.2);
    const p = new Path2D();
    p.moveTo(x - r * 0.75, y - r * 0.75); p.lineTo(x + r * 0.75, y + r * 0.75); p.moveTo(x + r * 0.75, y - r * 0.75); p.lineTo(x - r * 0.75, y + r * 0.75);
    neon(ctx, p, hot(col, 0.5), w * 0.95, { a: 1, halo: 0.8, hot: 0.6 });
  }
  /* a swirl eye (dizzy) */
  function swirlEye(ctx, x, y, r, col, w, rot) {
    glow(ctx, x, y, r * 2.8, col, 0.16);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(hot(col, 0.82), 0.95); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.restore();
    const pts = [];
    for (let i = 0; i <= 18; i++) { const a = rot + i * 0.52, rr = r * (0.12 + 0.78 * i / 18); pts.push([x + cos(a) * rr, y + sin(a) * rr]); }
    ctx.save(); ctx.strokeStyle = 'rgba(8,4,16,0.95)'; ctx.lineWidth = w * 0.75; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(poly(pts, false)); ctx.restore();
    neon(ctx, circlePath(x, y, r), col, w * 0.5, { a: 0.9, halo: 0.35, hot: 0.2 });
  }
  /* a happy closed eye (blink) */
  function lidEye(ctx, x, y, r, col, w, curve) {
    const p = new Path2D(); p.moveTo(x - r * 0.95, y + r * 0.05); p.quadraticCurveTo(x, y + r * (curve === undefined ? 0.9 : curve), x + r * 0.95, y + r * 0.05);
    neon(ctx, p, hot(col, 0.3), w * 0.9, { a: 1, halo: 0.5, hot: 0.5 });
  }
  /* small orbiting dizzy stars above a head centre */
  function dizzyStars(ctx, cx, cy, rx, ry, ph, col, sz) {
    const cols = [RGB.amber, WHITE, col];
    for (let i = 0; i < 3; i++) {
      const a = ph + i * TAU / 3, x = cx + cos(a) * rx, y = cy + sin(a) * ry;
      if (sin(a) < -0.35) continue;                       // behind the head: hidden half of the orbit
      sparkle(ctx, x, y, sz * (0.8 + 0.25 * sin(a)), cols[i], 0.95, a * 0.5);
    }
  }

  /* ================================================================================================================
   * HEROES  Fizz (magenta, 3 broad plumes, short curled tail) and Pop (cyan, 4 slender upright plumes, finned tail + dorsal sail).
   * pose: idle | blink | walk | jump | fall | puff (cheeks full) | shoot (mouth open) | die | stun | icon
   * ============================================================================================================== */
  const HERO_LK = { fizz: 3.1, pop: 2.7 };
  const HERO_S = 1.1;              // art scale about the bottom centre (8, 16): contour <= 1.35 x the 16 px box

  /* a gill plume: rounded leaf with a bright vein, light-filled petal hotter toward the tip, soft glowing tip */
  function gillFrond(ctx, g, col, w, big, a, wd) {
    const sp = quadPts(g.b, g.c, g.e, 18);
    const W0 = wd || 0.62, fr = big ? 0.07 : 0.0;
    const pet = taper(sp, (u) => {
      const round = u > 0.84 ? Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.84) / 0.16, 2))) : 1;
      return W0 * (0.22 + 0.78 * Math.pow(sin(PI * min(1, Math.pow(u, 0.66))), 0.8)) * (1 + fr * sin(u * 17)) * (0.35 + 0.65 * round) * (1 - u * 0.06);
    });
    const b = g.b, e = g.e;
    ctx.save();
    ctx.fillStyle = 'rgba(4,6,14,' + (0.72 * a).toFixed(3) + ')'; ctx.fill(pet);
    ctx.globalCompositeOperation = 'lighter';
    const fg = ctx.createLinearGradient(b[0], b[1], e[0], e[1]);
    fg.addColorStop(0, rgba(col, 0.1 * a)); fg.addColorStop(0.55, rgba(col, 0.26 * a)); fg.addColorStop(1, rgba(hot(col, 0.4), 0.46 * a));
    ctx.fillStyle = fg; ctx.fill(pet);
    ctx.restore();
    neon(ctx, pet, col, w * 0.74, { a, halo: 0.85, hot: 0.5 });
    neon(ctx, spinePath(sp.slice(2, 15)), hot(col, 0.2), w * 0.34, { a: a * 0.6, halo: 0, hot: 0.3 });
    if (big) {
      const P = new Path2D();
      for (let i = 4; i < 15; i += 2) {
        const q = sp[i], nx = sp[i + 1], dx = nx[0] - q[0], dy = nx[1] - q[1], L = Math.hypot(dx, dy) || 1, hw = W0 * 0.62 * sin(PI * Math.pow(i / 18, 0.7));
        for (const s of [-1, 1]) { P.moveTo(q[0], q[1]); P.lineTo(q[0] + (dx / L) * hw * 0.8 - (dy / L) * hw * s, q[1] + (dy / L) * hw * 0.8 + (dx / L) * hw * s); }
      }
      neon(ctx, P, col, w * 0.24, { a: a * 0.4, halo: 0, hot: 0.1 });
    }
    const q = sp[sp.length - 2];
    glow(ctx, e[0], e[1], 1.15, hot(col, 0.5), 0.55 * a);
    dot(ctx, q[0] + (e[0] - q[0]) * 0.6, q[1] + (e[1] - q[1]) * 0.6, 0.26, hot(col, 0.6), a * 0.9, { halo: 2.6 });
  }

  /* the head outline; puff = 0..1 fills the cheeks (shot wind-up) */
  function headPath(puff) {
    const p = puff || 0;
    return new Path2D('M 3.8 6.6 C 3.5 3.5 6.2 1.7 9.3 1.7 C 12.5 1.7 14.9 3.8 14.9 6.5 C ' + (14.9 + 0.8 * p) + ' ' + (8.9 + 0.5 * p) + ' 12.7 ' + (10.3 + 0.7 * p) + ' 9.8 ' + (10.4 + 0.7 * p) + ' C 6.5 ' + (10.5 + 0.7 * p) + ' ' + (4.1 - 0.5 * p) + ' ' + (9.5 + 0.4 * p) + ' 3.8 6.6 Z');
  }

  function heroFace(ctx, who, col, gcol, w, o) {
    const pose = o.pose, pop = who === 'pop', ph = o.ph;
    // forehead sheen (top-left key light)
    neon(ctx, new Path2D('M 5.4 3.9 C 6.2 2.7 7.6 2.2 9 2.2'), WHITE, w * 0.55, { a: 0.8, halo: 0.2, hot: 0.4 });
    // luminous freckles (Fizz) / a constellation of cool spots (Pop)
    const frk = pop ? [[8.4, 3.3, 0.22], [9.8, 2.9, 0.26], [11.3, 3.2, 0.2], [6.9, 4.0, 0.18], [12.4, 4.0, 0.16]] : [[8.9, 3.5, 0.26], [10.3, 3.3, 0.22], [7.4, 3.9, 0.2], [11.6, 3.7, 0.2]];
    for (const [fx, fy, fr] of frk) dot(ctx, fx, fy, fr, hot(col, 0.5), 0.6, { halo: 3 });
    glow(ctx, 10.0, 7.7, 2.0, gcol, pose === 'puff' ? 0.55 : 0.38, 0.65);          // cheek blush (stronger when puffed)
    // eyes: far (smaller, left) and near (bigger, right): pale lit sclera, coloured iris, deep pupil, two highlights
    const eyes = [[7.8, 5.15, 1.34], [11.9, 5.3, 1.66]];
    const look = pose === 'fall' ? [0.2, -0.5] : pose === 'jump' ? [0.3, -0.4] : pose === 'shoot' || pose === 'puff' ? [0.9, 0.05] : [0, 0];
    eyes.forEach(([ex, ey, er], idx) => {
      if (pose === 'blink') { lidEye(ctx, ex, ey + 0.1, er, col, w); return; }
      if (pose === 'die') { xEye(ctx, ex, ey, er, col, w); return; }
      if (pose === 'stun') { swirlEye(ctx, ex, ey, er, col, w, ph * 2 + idx); return; }
      if (pose === 'puff') { ey += 0.15; }
      glow(ctx, ex, ey, er * 3.2, WHITE, 0.14);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba(hot(col, 0.82), 0.96); ctx.beginPath(); ctx.arc(ex, ey, er, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      const ix = ex + er * (0.3 + look[0] * 0.25), iy = ey + er * (0.05 + look[1] * 0.25), ir = er * 0.74;
      const ig = ctx.createRadialGradient(ix, iy + ir * 0.3, ir * 0.1, ix, iy, ir);
      ig.addColorStop(0, rgba(mixc(col, RGB.void, 0.55), 0.97)); ig.addColorStop(0.7, rgba(mixc(col, RGB.void, 0.8), 0.97)); ig.addColorStop(1, rgba(mixc(col, RGB.void, 0.9), 0.97));
      ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(ix, iy, ir, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(6,4,14,0.97)'; ctx.beginPath(); ctx.arc(ix + er * 0.04, iy, er * (pose === 'fall' ? 0.36 : 0.46), 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba(WHITE, 0.96); ctx.beginPath(); ctx.arc(ex + er * 0.02, ey - er * 0.36, er * 0.24, 0, TAU); ctx.fill();
      ctx.fillStyle = rgba(WHITE, 0.8); ctx.beginPath(); ctx.arc(ex + er * 0.58, ey + er * 0.32, er * 0.1, 0, TAU); ctx.fill();
      ctx.restore();
      neon(ctx, circlePath(ex, ey, er), col, w * 0.5, { a: 0.9, halo: 0.4, hot: 0.2 });
    });
    // mouth
    if (pose === 'shoot' || pose === 'puff') {
      const m = pose === 'shoot' ? 1 : 0.0;
      const mp = ellipsePath(13.9, 8.4, 0.55 + 0.32 * m, 0.7 + 0.36 * m);
      ctx.save(); ctx.fillStyle = 'rgba(10,3,14,0.96)'; ctx.fill(mp); glow(ctx, 13.9, 8.5, 1.5, hot(col, 0.4), 0.3); ctx.restore();
      neon(ctx, mp, hot(col, 0.25), w * 0.7, { a: 1, halo: 0.7, hot: 0.5 });
      neon(ctx, new Path2D('M 12.6 7.2 Q 13.3 6.7 14.2 7.0'), hot(col, 0.2), w * 0.45, { a: 0.6, halo: 0, hot: 0.2 });
      if (pose === 'puff') {            // cheek ridges: the cheeks are full of air
        neon(ctx, new Path2D('M 11.2 8.1 Q 11.9 9.8 13.0 10.2'), hot(col, 0.3), w * 0.45, { a: 0.6, halo: 0, hot: 0.2 });
        neon(ctx, new Path2D('M 8.7 8.6 Q 9.0 10.0 10.0 10.6'), hot(col, 0.3), w * 0.4, { a: 0.45, halo: 0, hot: 0.1 });
      }
    } else if (pose === 'fall') {
      const mp = ellipsePath(13.4, 8.7, 0.62, 0.95);
      ctx.save(); ctx.fillStyle = 'rgba(10,3,14,0.96)'; ctx.fill(mp); ctx.restore();
      neon(ctx, mp, hot(col, 0.25), w * 0.65, { a: 1, halo: 0.6, hot: 0.5 });
    } else if (pose === 'jump') {
      neon(ctx, new Path2D('M 10.6 8.4 Q 12.6 10.2 14.4 8.2'), hot(col, 0.2), w * 0.75, { a: 0.95, halo: 0.4, hot: 0.4 });     // wide excited smile
    } else if (pose === 'die' || pose === 'stun') {
      const wv = new Path2D(); for (let i = 0; i <= 8; i++) { const x = 10.6 + i * 0.46, y = 9.0 + sin(i * 1.9 + ph) * 0.38; i ? wv.lineTo(x, y) : wv.moveTo(x, y); }
      neon(ctx, wv, hot(col, 0.2), w * 0.65, { a: 0.95, halo: 0.4, hot: 0.4 });
    } else {
      neon(ctx, new Path2D('M 10.6 8.6 Q 12.4 9.7 14.1 8.5'), hot(col, 0.2), w * 0.7, { a: 0.95, halo: 0.4, hot: 0.4 });
    }
    if (pose !== 'shoot' && pose !== 'puff' && pose !== 'fall') dot(ctx, 14.2, 6.3, 0.16, WHITE, 0.55, { halo: 2.4 });   // nostril
  }

  function hero(ctx, who, o) {
    const pose = o.pose, ph = o.ph, w = o.w, big = o.big, pop = who === 'pop';
    const col = pop ? RGB.cyan : RGB.magenta;
    const gcol = pop ? mixc(RGB.violet, RGB.cyan, 0.2) : mixc(RGB.magenta, RGB.amber, 0.14);
    const jump = pose === 'jump', fall = pose === 'fall', walk = pose === 'walk', shoot = pose === 'shoot' || pose === 'puff', die = pose === 'die', stun = pose === 'stun';
    const bob = (pose === 'idle' || pose === 'blink' || shoot) ? sin(ph) * 0.16 : 0;
    const wind = jump ? 1.5 : fall ? -0.5 : die ? 1.0 : 0;
    const sw = (i, a) => sin(ph + i * 1.3) * a * (walk ? 1.5 : 1);
    const sy = jump ? 1.06 : fall ? 1.01 : shoot ? 0.97 : walk ? 1 + 0.025 * cos(ph * 2 + 0.4) : 1 + sin(ph + 0.6) * 0.012;
    const sx = jump ? 0.95 : fall ? 0.97 : shoot ? 1.03 : 1;
    const headDy = bob + (shoot ? 0.1 : 0) + (walk ? -abs(sin(ph)) * 0.28 : 0);
    const headDx = shoot ? -0.25 : 0;
    const breathe = 0.9 + 0.1 * sin(ph + (pop ? 1 : 0)) + (die ? 0.25 : 0);
    ctx.save();
    if (die) { ctx.translate(8, 9.5); ctx.rotate(-o.f * PI / 2); ctx.scale(0.9, 0.9); ctx.translate(-8, -9.5); }
    if (stun) { ctx.translate(8, 16); ctx.rotate(sin(ph) * 0.045); ctx.translate(-8, -16); }
    ctx.translate(8, 16 + (walk ? -abs(sin(ph)) * 0.3 : 0)); ctx.scale(sx, sy); ctx.translate(-8, -16);
    const A = 1;
    // C3: light gain of the lit body. The twins must be the brightest shapes: Fizz's magenta carries only 0.27 relative luminance (Pop's cyan 0.72), so she gets the
    // larger gain; P2 stays about 1.3 x brighter than P1 in luminance so the pair also differs hue-independently (protan / deutan / grayscale).
    const LK = pop ? HERO_LK.pop : HERO_LK.fizz;
    // soft aura: the twins glow as a whole
    glow(ctx, 3.8, 3.4 + headDy, 6.6, gcol, 0.25, 0.95);
    glow(ctx, 9, 9.5, 10, col, 0.1 * breathe, 0.95);

    // ---- far gills (dim, behind everything) ----
    const farG = pop ? [
      { b: [7.2, 2.2], c: [6.4, -1.2 + wind * 0.4 + sw(1, 0.4)], e: [4.8 + sw(3, 0.3), -1.9 + wind * 0.9 + sw(0, 0.5)] },
      { b: [9.0, 1.9], c: [8.8, -1.2 + wind * 0.3 + sw(5, 0.4)], e: [7.8 + sw(2, 0.3), -1.8 + wind * 0.8 + sw(3, 0.5)] },
    ] : [
      { b: [6.6, 2.4], c: [5.2, -0.6 + wind * 0.4 + sw(1, 0.5)], e: [3.2 + sw(3, 0.3), -0.3 + wind * 0.9 + sw(0, 0.5)] },
      { b: [8.6, 1.9], c: [7.8, -1.2 + wind * 0.4 + sw(2, 0.4)], e: [6.0 + sw(4, 0.3), -1.3 + wind * 0.9 + sw(1, 0.5)] },
    ];
    for (const g of farG) { g.b[1] += headDy; gillFrond(ctx, g, mixc(gcol, RGB.void, 0.35), w * 0.85, false, 0.7 * A, pop ? 0.75 : 0.95); }

    // ---- tail: tapered paddle with a fin ridge, curling up behind (Pop's is longer, with a dorsal fin sail) ----
    const tw = sin(ph + 0.6) * 0.7 * (walk ? 1.3 : 1) + (jump ? 1.3 : fall ? -0.9 : 0) + (die ? 1.4 : 0);
    const tsp = pop
      ? sampleSpline([[5.9, 13.0], [3.6, 14.8], [1.4, 14.2 + tw * 0.1], [-0.4, 12.2 + tw * 0.4], [-0.9, 9.4 + tw * 0.8]], 6)
      : sampleSpline([[5.9, 13.3], [4.0, 14.6], [2.0, 14.3 + tw * 0.1], [0.6, 12.8 + tw * 0.4], [-0.1, 11.2 + tw * 0.7]], 6);
    const tail = taper(tsp, (u) => (0.55 + (pop ? 1.55 : 1.35) * sin(PI * min(1, 0.12 + u * 0.86))) * (1 - Math.pow(u, 3) * 0.85));
    if (pop) {
      const fsp = tsp.slice(2, tsp.length - 2);
      const fin = new Path2D(); fin.moveTo(fsp[0][0], fsp[0][1] - 0.4);
      fsp.forEach((q, i) => { const u = i / (fsp.length - 1); fin.lineTo(q[0] - 0.6 * sin(PI * u) - 0.1, q[1] - (1.6 + 1.9 * sin(PI * Math.pow(u, 0.8))) * (1 - u * 0.2)); });
      for (let i = fsp.length - 1; i >= 0; i--) fin.lineTo(fsp[i][0], fsp[i][1]);
      fin.closePath();
      ctx.save(); ctx.fillStyle = 'rgba(4,6,14,0.55)'; ctx.fill(fin); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(gcol, 0.2 * A); ctx.fill(fin); ctx.restore();
      neon(ctx, fin, gcol, w * 0.7, { a: 0.85 * A, halo: 0.6, hot: 0.35 });
    }
    body(ctx, tail, col, w, { a: A, y0: 9, y1: 15, tint: 0.85 * LK, rim: 0.95 });
    neon(ctx, tail, col, w * 0.95, { a: A, halo: 0.8, grad: [0, 9, 6, 15] });
    neon(ctx, spinePath(tsp.slice(3, tsp.length - 5)), hot(col, 0.2), w * 0.4, { a: 0.55 * A, halo: 0, hot: 0.2 });

    // ---- feet (walk cycle: the two feet alternate through swing / stance; jump: tucked; fall: dangling) ----
    const foot = (i) => {
      if (walk) {
        const th = ph + i * PI, x0 = i ? 11.0 : 6.5;
        return [x0 - 1.15 * cos(th), 15.5 - max(0, sin(th)) * 1.35, 1.55 - max(0, sin(th)) * 0.15];
      }
      if (jump) return i ? [10.9, 14.2, 1.2] : [6.4, 14.6, 1.2];
      if (fall) return i ? [11.5, 15.1, 1.3] : [5.9, 15.2, 1.3];
      if (die || stun) return i ? [11.2, 15.3, 1.4] : [6.3, 15.3, 1.4];
      return i ? [11.0, 15.5, 1.55] : [6.5, 15.5, 1.55];
    };
    // far foot + far arm behind the body
    const farFoot = foot(0), nearFoot = foot(1);
    const drawFoot = (f2) => {
      const fp = ellipsePath(f2[0], f2[1], f2[2], 0.75);
      body(ctx, fp, col, w * 0.6, { a: A, y0: f2[1] - 1, y1: f2[1] + 1, tint: 1.2 });
      neon(ctx, fp, col, w * 0.8, { a: A, halo: 0.5 });
    };
    drawFoot(farFoot);
    const farArm = new Path2D(jump ? 'M 6.4 10.4 Q 5.2 9 5.4 7.6' : fall ? 'M 6.4 10.4 Q 4.8 9.6 4.4 8.2' : die || stun ? 'M 6.4 10.4 Q 5.0 9.4 5.0 7.8' : walk ? 'M 6.6 10.6 Q ' + (5.6 + 0.9 * cos(ph)) + ' 11.8 ' + (6.2 + 1.2 * cos(ph)) + ' 12.8' : 'M 6.6 10.6 Q 5.6 11.8 6.2 12.8');
    neon(ctx, farArm, mixc(col, RGB.void, 0.4), w * 1.0, { a: 0.7 * A, halo: 0.3, hot: 0.2 });

    // ---- body (lit from within: inner light organ in the chest) ----
    const bodyP = new Path2D('M 5.5 9.4 C 4.3 11.8 4.4 14.7 7.1 15.4 L 11.7 15.4 C 13.5 14.7 13.5 11.8 12.2 9.4 Z');
    body(ctx, bodyP, col, w, { a: A, y0: 9, y1: 16, hl: [7.6, 11.2, 5.2, 0.3 * LK], tint: 0.8 * LK, core: [9, 12.9, 4.4, 0.34 * LK * breathe], rim: 0.95 });
    neon(ctx, bodyP, col, w, { a: A, grad: [4, 9, 13, 16] });
    const belly = ellipsePath(9.0, 12.6, 2.4, 2.8);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const bgd = ctx.createRadialGradient(9, 12.6, 0, 9, 12.6, 3.0); bgd.addColorStop(0, rgba(mixc(WHITE, col, 0.2), 0.34 * LK * breathe)); bgd.addColorStop(1, rgba(mixc(WHITE, col, 0.4), 0.06 * LK));
    ctx.fillStyle = bgd; ctx.fill(belly);
    ctx.restore();
    neon(ctx, new Path2D('M 7 11.2 Q 9 10.6 11 11.2'), WHITE, w * 0.4, { a: 0.4, halo: 0, hot: 0 });
    neon(ctx, belly, mixc(WHITE, col, 0.25), w * 0.5, { a: 0.4, halo: 0.2, hot: 0.2 });
    for (const [sx2, sy2] of [[11.6, 11.8], [11.9, 13.4], [11.0, 14.5]]) dot(ctx, sx2, sy2, 0.28, hot(col, 0.4), 0.6, { halo: 3 });

    drawFoot(nearFoot);

    // ---- near gills: broad plumes (Fizz: 3) / slender upright plumes (Pop: 4), sweeping up/back from the back of the head ----
    const nearG = pop ? [
      { b: [5.8, 2.9 + headDy], c: [3.8, -1.2 + wind * 0.4 + sw(0, 0.4)], e: [2.2 + sw(1, 0.35), -1.6 + wind * 1.0 + sw(2, 0.5)] },
      { b: [4.9, 4.1 + headDy], c: [2.2, 0.0 + wind * 0.5 + sw(2, 0.4)], e: [0.2 + sw(3, 0.3), -0.7 + wind * 1.1 + sw(4, 0.5)] },
      { b: [4.3, 5.5 + headDy], c: [1.6, 3.0 + wind * 0.5 + sw(4, 0.4)], e: [-0.8 + sw(5, 0.3), 2.2 + wind * 1.0 + sw(1, 0.5)] },
      { b: [4.2, 7.0 + headDy], c: [1.6, 5.8 + wind * 0.5 + sw(1, 0.4)], e: [-0.7 + sw(2, 0.3), 5.3 + wind * 0.9 + sw(3, 0.5)] },
    ] : [
      { b: [5.2, 3.2 + headDy], c: [2.8, 0.2 + wind * 0.4 + sw(0, 0.4)], e: [0.8 + sw(1, 0.35), 0.0 + wind * 1.0 + sw(2, 0.5)] },
      { b: [4.2, 5.0 + headDy], c: [1.6, 2.7 + wind * 0.5 + sw(2, 0.4)], e: [-0.8 + sw(3, 0.3), 2.9 + wind * 1.1 + sw(4, 0.5)] },
      { b: [4.1, 6.8 + headDy], c: [1.7, 5.9 + wind * 0.5 + sw(4, 0.4)], e: [-0.9 + sw(5, 0.3), 6.1 + wind * 1.0 + sw(1, 0.5)] },
    ];
    for (const g of nearG) gillFrond(ctx, g, gcol, w * 1.0, big, A, pop ? (big ? 0.78 : 0.95) : (big ? 1.0 : 1.3));

    // ---- head ----
    ctx.save();
    ctx.translate(headDx, headDy);
    const head = headPath(pose === 'puff' ? 1 : 0);
    body(ctx, head, col, w, { a: A, y0: 1.5, y1: 10.5, x0: 4, x1: 12, hl: [7.6, 4.2, 6.6, 0.34 * LK], tint: 0.8 * LK, core: [10.4, 6.6, 5.6, 0.16 * LK * breathe], rim: 0.95 });
    neon(ctx, head, col, w * 1.1, { a: A, grad: [4, 1.5, 14, 10.5], halo: 1.1 });
    heroFace(ctx, who, col, gcol, w, o);
    ctx.restore();

    // ---- near arm (short, 3 little fingers) ----
    {
      const sx0 = walk ? -1.0 * cos(ph) : 0;
      const arm = shoot ? 'M 11.0 10.6 Q 13.2 10.0 14.6 10.9' : jump || die || stun ? 'M 11.4 10.6 Q 13.4 9.2 13.6 7.6' : fall ? 'M 11.4 10.6 Q 13.6 9.8 14.6 8.4' : walk ? 'M 11.2 10.7 Q ' + (13.4 + sx0 * 0.5) + ' 10.9 ' + (13.9 + sx0) + ' ' + (12.7 - abs(sx0) * 0.2) : 'M 11.2 10.7 Q 13.4 10.9 13.9 12.7';
      neon(ctx, new Path2D(arm), col, w * 1.5, { a: 1, halo: 0.7, grad: [11, 10, 14, 13] });
      const tip = shoot ? [14.7, 10.9] : jump || die || stun ? [13.7, 7.5] : fall ? [14.7, 8.3] : walk ? [13.9 + sx0, 12.9 - abs(sx0) * 0.2] : [14.0, 12.9];
      for (let i = -1; i <= 1; i++) dot(ctx, tip[0] + i * 0.42, tip[1] + (shoot ? i * 0.4 : 0.2), 0.25, hot(col, 0.4), 0.8, { halo: 2.4 });
    }
    if (pose === 'shoot') {               // breath: micro-bubbles streaming into the shot bubble
      dot(ctx, 15.5, 8.2, 0.34, hot(RGB.cyan, 0.5), 0.9, { halo: 2.8 }); dot(ctx, 16.3, 7.6, 0.22, WHITE, 0.8, { halo: 2.6 }); dot(ctx, 16.5, 9.1, 0.2, WHITE, 0.7, { halo: 2.6 });
    }
    ctx.restore();
    if (stun || die) dizzyStars(ctx, 8.4, die ? 2.4 : 0.6, 5.2, 1.5, ph, col, 1.35);
  }

  /* 8 x 8 life icon: the head only (gills + face), at ~0.55 scale; a lit pearl-like face */
  function heroIcon(ctx, who, o) {
    const pop = who === 'pop', col = pop ? RGB.cyan : RGB.magenta, gcol = pop ? mixc(RGB.violet, RGB.cyan, 0.2) : mixc(RGB.magenta, RGB.amber, 0.14);
    const w = o.w;
    glow(ctx, 4.2, 4.2, 4.2, col, 0.3);
    ctx.save();
    ctx.translate(4.3, 4.4); ctx.scale(0.55, 0.55); ctx.translate(-9.4, -6.1);
    const iw = w / 0.55;
    const G = pop ? [
      { b: [5.4, 3.6], c: [3.0, 0.2], e: [1.8, -1.4] }, { b: [4.6, 5.2], c: [1.9, 2.4], e: [0.2, 1.0] }, { b: [4.3, 6.8], c: [1.8, 5.2], e: [-0.4, 4.8] },
    ] : [
      { b: [5.2, 3.4], c: [2.8, 0.6], e: [0.9, 0.6] }, { b: [4.3, 5.2], c: [1.6, 3.2], e: [-0.7, 3.6] },
    ];
    for (const g of G) gillFrond(ctx, g, gcol, iw * 0.95, false, 1, pop ? 1.0 : 1.35);
    const head = headPath(0);
    body(ctx, head, col, iw, { y0: 1.5, y1: 10.5, x0: 4, x1: 12, hl: [7.6, 4.2, 6.6, 0.4], tint: 1.0, core: [9.6, 6.2, 6.2, 0.34], rim: 1 });
    neon(ctx, head, col, iw * 1.1, { grad: [4, 1.5, 14, 10.5], halo: 1.1 });
    for (const [ex, ey, er] of [[7.8, 5.15, 1.5], [11.9, 5.3, 1.85]]) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(hot(col, 0.85), 0.97); ctx.beginPath(); ctx.arc(ex, ey, er, 0, TAU); ctx.fill(); ctx.restore();
      ctx.save(); ctx.fillStyle = 'rgba(6,4,14,0.97)'; ctx.beginPath(); ctx.arc(ex + er * 0.3, ey + er * 0.05, er * 0.55, 0, TAU); ctx.fill(); ctx.restore();
    }
    neon(ctx, new Path2D('M 10.6 8.2 Q 12.4 9.5 14.1 8.2'), hot(col, 0.2), iw * 0.8, { a: 0.9, halo: 0.3, hot: 0.4 });
    ctx.restore();
  }

  const HERO_PAD = { l: 7, r: 6, t: 7, b: 4 };
  const HERO_PAD_DIE = { l: 7, r: 7, t: 7, b: 6 };
  for (const who of ['p1', 'p2']) {
    const kind = who === 'p1' ? 'fizz' : 'pop';
    const mk = (pose) => (ctx, o) => { o.pose = typeof pose === 'function' ? pose(o) : pose; if (o.name.endsWith('_idle')) o.ph = o.f * 0.4; hero(ctx, kind, o); };
    const HS = who === 'p2' ? HERO_S * 0.97 : HERO_S;
    def(who + '_idle', 16, 16, 2, HERO_PAD, HS, [8, 16], mk((o) => (o.f === 1 ? 'blink' : 'idle')));
    def(who + '_walk', 16, 16, 4, HERO_PAD, HS, [8, 16], mk('walk'));
    def(who + '_jump', 16, 16, 1, HERO_PAD, HS, [8, 16], mk('jump'));
    def(who + '_fall', 16, 16, 1, HERO_PAD, HS, [8, 16], mk('fall'));
    def(who + '_shoot', 16, 16, 2, HERO_PAD, HS, [8, 16], mk((o) => (o.f === 0 ? 'puff' : 'shoot')));
    def(who + '_die', 16, 16, 4, HERO_PAD_DIE, HS * 0.92, [8, 12], mk('die'));
    def(who + '_stun', 16, 16, 2, HERO_PAD, HS, [8, 16], mk('stun'));
    def(who + '_icon', 8, 8, 1, { l: 4, r: 3, t: 3, b: 3 }, 1, [4, 4], (ctx, o) => heroIcon(ctx, kind, o));
  }

  /* ================================================================================================================
   * ENEMIES  one neon hue + one silhouette each (colour-blind safe):
   *   nibbler amber clockwork fish on legs | crabbit ember wide crab, raised pincers | jellop violet bell + tentacles |
   *   springle lime seahorse on a coil | glimmer cobalt anglerfish + amber lantern | bonefin cold white skeleton fish
   * o.state: move | trapped (struggling, drawn inside a bubble) | die (flung, X eyes) | throw | squash | fire; o.angry = crimson + brows + steam
   * ============================================================================================================== */
  const HUE = { nibbler: RGB.amber, crabbit: RGB.ember, jellop: RGB.violet, springle: RGB.lime, glimmer: RGB.cobalt, bonefin: mixc(RGB.white, RGB.cyan, 0.25) };
  const eyeOf = (ctx, o, x, y, r, col, look, eo) => { if (o.state === 'die') xEye(ctx, x, y, r, col, o.w); else eyeBall(ctx, x, y, r, col, look, eo); };

  /* ---------------------------------------------------------------- Nibbler: clockwork fish on legs */
  function nibbler(ctx, o, col, w) {
    const ph = o.ph, trapped = o.state === 'trapped', die = o.state === 'die';
    const walk = die ? 0.7 : sin(ph);
    ctx.translate(0, -abs(walk) * 0.18);
    const wag = sin(ph + 1) * 0.5;
    // legs (behind)
    for (const [lx, ly, p] of [[6.4, 12.2, -walk], [10.6, 12.0, walk]]) {
      const kx = lx - 0.7 + p * 0.8, kyy = 13.9, fx = lx + (p > 0 ? 0.5 : -0.9) + p * 0.9, fy = 15.3 - max(0, -p) * 0.9;
      const lp = new Path2D(); lp.moveTo(lx, ly); lp.lineTo(kx, kyy); lp.lineTo(fx, fy);
      neon(ctx, lp, col, w * 0.95, { halo: 0.6 });
      neon(ctx, new Path2D('M ' + (fx - 0.9) + ' ' + (fy + 0.1) + ' L ' + (fx + 0.9) + ' ' + (fy + 0.1)), col, w * 0.9, { halo: 0.4, hot: 0.3 });
    }
    // wind-up key (turns a half turn per loop)
    const kr = cos(ph * 0.5 + 0.3);
    ctx.save(); ctx.translate(7.4, 2.4); ctx.scale(max(0.25, abs(kr)), 1); ctx.translate(-7.4, -2.4);
    neon(ctx, new Path2D('M 7.4 4.6 L 7.4 2.4 M 7.4 2.6 C 5.5 3 4.5 0.8 6.1 0.4 C 7.1 0.2 7.4 1.4 7.4 2.6 M 7.4 2.6 C 9.3 3 10.3 0.8 8.7 0.4 C 7.7 0.2 7.4 1.4 7.4 2.6'), col, w * 0.9, { halo: 0.8 });
    ctx.restore();
    // tail fin (forked)
    const tf = new Path2D('M 3.1 8.3 L 0.2 ' + (4.6 + wag) + ' Q 1.7 8.3 0.2 ' + (12 - wag) + ' Z');
    body(ctx, tf, col, w, { y0: 4, y1: 12 }); neon(ctx, tf, col, w * 0.95);
    // body
    const bp = new Path2D('M 2.9 8.6 C 2.7 5.3 5.4 4.1 8.4 4.1 C 11.5 4.1 13.9 5.9 14.5 8.5 C 14 10.9 11.4 12.4 8.4 12.4 C 5.4 12.4 3.1 11.8 2.9 8.6 Z');
    body(ctx, bp, col, w, { y0: 4, y1: 12.4, tint: 1.15, hl: [6.4, 6, 6, 0.3] });
    neon(ctx, bp, col, w * 1.05, { grad: [3, 4, 14, 12.4] });
    neon(ctx, new Path2D('M 4.8 5.3 Q 4.1 8.4 4.9 11.4'), col, w * 0.4, { a: 0.5, halo: 0, hot: 0.2 });
    for (const [rx, ry] of [[5.6, 11.4], [7.8, 11.7], [10, 11.5], [12, 10.7]]) dot(ctx, rx, ry, 0.22, hot(col, 0.4), 0.7, { halo: 2.4 });
    neon(ctx, new Path2D('M 9.8 9.7 L 11.8 11.7 L 9.1 11.5 Z'), col, w * 0.6, { a: 0.8, halo: 0.3 });
    // the COG (signature) turns 2 teeth per loop
    const gx = 7.2, gy = 8.4;
    const gear = gearPath(gx, gy, 2.75, 2.0, 8, ph * 0.25);
    fillDark(ctx, gear, 0.85); fillAdd(ctx, gear, col, 0.22);
    neon(ctx, gear, hot(col, 0.2), w * 0.8, { halo: 0.9, hot: 0.6 });
    neon(ctx, circlePath(gx, gy, 1.0), col, w * 0.55, { halo: 0.3, hot: 0.4 });
    dot(ctx, gx, gy, 0.35, hot(col, 0.7), 1, { halo: 3 });
    // eye + mouth
    eyeOf(ctx, o, 11.5, 7.0, 1.5, col, trapped ? [sin(ph) * 0.9, 0.25] : [0.7, 0.1], { w: w * 0.55 });
    if (o.angry) brow(ctx, 11.5, 7.0, 1.5, 1, w, col);
    neon(ctx, new Path2D(die ? 'M 12.4 9.9 L 14.5 9.5' : 'M 12.4 9.7 L 14.5 9.0 M 13.1 9.45 L 13.3 10.2 M 14.0 9.15 L 14.1 9.9'), hot(col, 0.3), w * 0.5, { halo: 0.3, hot: 0.3 });
    if (o.angry) steamLoop(ctx, 10.6, 4.0, o.u, w, col, 2, 2.4);
  }

  /* ---------------------------------------------------------------- Crabbit: domed crab, raised pincers, eye stalks */
  function crabbit(ctx, o, col, w) {
    const ph = o.ph, throwing = o.state === 'throw', trapped = o.state === 'trapped', die = o.state === 'die';
    const walk = die ? 0.6 : throwing ? 0 : sin(ph);
    ctx.translate(0, -abs(walk) * 0.15 + (throwing ? 0.2 : 0));
    const snap = trapped ? sin(ph) * 0.5 : o.angry ? sin(ph + 0.5) * 0.35 : sin(ph) * 0.14;
    // legs: three per side, alternating
    const legP = new Path2D();
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const bx = 8 + s * (3.0 + i * 1.5), by = 12.4 + i * 0.1;
      const lp = (die ? 0.5 : throwing ? 0.05 : sin(ph + i * 2.1 + (s > 0 ? PI : 0))) * (throwing ? 0.2 : 0.7);
      legP.moveTo(bx, by); legP.lineTo(bx + s * (1.2 + i * 0.2), 13.9 - max(0, lp) * 0.5); legP.lineTo(bx + s * (1.5 + i * 0.1 + lp * 0.4), 15.5);
    }
    neon(ctx, legP, col, w * 0.85, { halo: 0.5 });
    // pincers: arm + two-prong claw, raised (the throwing claw is lifted and wide open, holding a glowing pebble)
    for (const s of [-1, 1]) {
      const mx = (x) => (s < 0 ? x : 16 - x);
      const lift = throwing && s > 0 ? -1.6 : 0;
      const open = throwing ? (s > 0 ? 1.7 : 0.9) : 0.5 + snap * (s < 0 ? 1 : -1) * 0.4;
      ctx.save(); ctx.translate(0, lift);
      neon(ctx, new Path2D('M ' + mx(2.9) + ' ' + (10.6 - lift) + ' C ' + mx(1.1) + ' ' + (10 - lift * 0.6) + ' ' + mx(0.8) + ' 8.4 ' + mx(1.5) + ' 6.9'), col, w * 1.15, { halo: 0.8 });
      const claw = new Path2D('M ' + mx(0.1) + ' 7 C ' + mx(-1.3) + ' 5.9 ' + mx(-1.3) + ' 3.3 ' + mx(0.3) + ' 2.0 L ' + mx(1.7 - open * 0.3) + ' 3.7 L ' + mx(3.3 + open * 0.6) + ' 1.7 C ' + mx(4.7) + ' 3.4 ' + mx(4.5) + ' 6 ' + mx(3.1) + ' 7 Z');
      body(ctx, claw, col, w, { y0: 2, y1: 7.2, tint: 1.2 }); neon(ctx, claw, col, w * 1.0, { grad: [0, 2, 4, 7] });
      ctx.restore();
    }
    if (throwing) {            // the pebble, glowing between the raised prongs, with a short streak behind it
      const px = 14.3, py = 1.3;
      glow(ctx, px, py, 4.2, RGB.ember, 0.55);
      neon(ctx, new Path2D('M ' + (px - 2.6) + ' ' + (py + 0.9) + ' L ' + (px - 0.8) + ' ' + (py + 0.2)), hot(RGB.ember, 0.4), w * 0.6, { a: 0.6, halo: 0.4, hot: 0.3 });
      dot(ctx, px, py, 1.0, RGB.amber, 1, { halo: 3.2 });
    }
    // eye stalks ("bunny ears")
    const sway = sin(ph) * 0.25;
    for (const s of [-1, 1]) {
      const bx = 8 + s * 2.1, ex = 8 + s * 3.0 + sway * s;
      neon(ctx, new Path2D('M ' + bx + ' 6.8 C ' + (bx + s * 0.1) + ' 4.6 ' + (ex - s * 0.5) + ' 3.2 ' + ex + ' 1.9'), col, w * 0.95, { halo: 0.7 });
    }
    // shell
    const shell = new Path2D('M 1.9 11.8 C 1.7 7.8 4.6 6.3 8 6.3 C 11.4 6.3 14.3 7.8 14.1 11.8 C 14 13.1 11.6 13.6 8 13.6 C 4.4 13.6 2 13.1 1.9 11.8 Z');
    body(ctx, shell, col, w, { y0: 6, y1: 13.6, tint: 1.4, hl: [6.2, 8.2, 7.2, 0.5] });
    neon(ctx, shell, col, w * 1.1, { grad: [2, 6, 14, 13.6] });
    neon(ctx, new Path2D('M 4.2 9.1 Q 8 7.4 11.8 9.1 M 5.2 11.2 Q 8 9.9 10.8 11.2'), col, w * 0.45, { a: 0.55, halo: 0, hot: 0.2 });
    for (const [dx, dy] of [[6, 8.2], [10, 8.2], [8, 7.5]]) dot(ctx, dx, dy, 0.24, hot(col, 0.4), 0.6, { halo: 2.4 });
    // eyes on the stalks look toward the travel direction
    const look = [trapped ? sin(ph) * 0.9 : 0.6, 0.15];
    for (const s of [-1, 1]) {
      const ex = 8 + s * 3.0 + sway * s;
      eyeOf(ctx, o, ex, 1.5, 1.35, col, look, { w: w * 0.55 });
      if (o.angry) brow(ctx, ex, 1.5, 1.35, -s, w, col);
    }
    neon(ctx, new Path2D(o.angry || throwing ? 'M 6.4 12.4 Q 8 11.2 9.6 12.4' : die ? 'M 6.6 12.2 L 9.4 12.2' : 'M 6.6 11.9 Q 8 12.8 9.4 11.9'), hot(col, 0.3), w * 0.55, { a: 0.9, halo: 0.3, hot: 0.3 });
    if (o.angry) steamLoop(ctx, 8, 0.6, o.u, w, col, 3, 2.2);
  }

  /* ---------------------------------------------------------------- Jellop: bell + tentacles */
  function jellop(ctx, o, col, w) {
    const ph = o.ph, trapped = o.state === 'trapped', die = o.state === 'die';
    const ps = 1 + sin(ph) * 0.06;      // bell pulse
    ctx.translate(8, 6.5); ctx.scale(1 / ps, ps); ctx.translate(-8, -6.5);
    const tp = new Path2D();
    for (let i = 0; i < 5; i++) {
      const x0 = 3.7 + i * 2.15, pts = [];
      for (let j = 0; j <= 5; j++) pts.push([x0 + sin(ph + i * 1.3 + j * 0.9) * 0.55 * (j / 5) * 1.4, 8.2 + j * 1.5]);
      const sp = sampleSpline(pts, 4);
      tp.moveTo(sp[0][0], sp[0][1]); for (let q = 1; q < sp.length; q++) tp.lineTo(sp[q][0], sp[q][1]);
    }
    neon(ctx, tp, col, w * 0.7, { a: 0.85, halo: 0.8, hot: 0.35 });
    for (const s of [-1, 1]) {            // oral arms (wider ribbons)
      const pts = []; for (let j = 0; j <= 4; j++) pts.push([8 + s * (0.9 + sin(ph + j + s) * 0.45), 8 + j * 1.55]);
      const rb = taper(sampleSpline(pts, 5), (u) => 0.5 * sin(PI * Math.pow(u, 0.7)) + 0.05);
      fillAdd(ctx, rb, col, 0.18);
      neon(ctx, rb, o.frost ? col : mixc(col, RGB.magenta, 0.35), w * 0.5, { a: 0.7, halo: 0.4, hot: 0.2 });
    }
    // bell with scalloped rim
    const n = 5, x1 = 14.1, x0 = 1.9, dx = (x1 - x0) / n;
    let d = 'M ' + x0 + ' 7.7 C ' + (x0 - 0.4) + ' 2.9 4.7 0.9 8 0.9 C 11.3 0.9 ' + (x1 + 0.4) + ' 2.9 ' + x1 + ' 7.7';
    for (let i = 0; i < n; i++) { const xa = x1 - i * dx, xb = x1 - (i + 1) * dx; d += ' Q ' + ((xa + xb) / 2) + ' ' + (9.3 + sin(ph + i) * 0.3) + ' ' + xb + ' 7.7'; }
    const bell = new Path2D(d + ' Z');
    body(ctx, bell, col, w, { y0: 0.9, y1: 9, tint: 1.3, hl: [6.2, 3.2, 6.4, 0.34] });
    neon(ctx, bell, col, w * 1.08, { grad: [2, 1, 14, 9], halo: 1.1 });
    const cn = new Path2D();
    for (let i = -2; i <= 2; i++) { cn.moveTo(8, 1.6); cn.quadraticCurveTo(8 + i * 2.6, 3.6, 8 + i * 3.0, 7.4); }
    neon(ctx, cn, col, w * 0.38, { a: 0.45, halo: 0, hot: 0.2 });
    const cl = new Path2D();       // clover (the four gonads), a magenta-violet signature, rotates a quarter turn per loop
    for (let i = 0; i < 4; i++) { const a = i * TAU / 4 + PI / 4 + ph * 0.25; cl.moveTo(8 + cos(a) * 1.7 + 0.8, 4.0 + sin(a) * 1.15); cl.ellipse(8 + cos(a) * 1.7, 4.0 + sin(a) * 1.15, 0.8, 0.55, a, 0, TAU); }
    neon(ctx, cl, o.frost ? mixc(col, RGB.violet, 0.2) : mixc(col, RGB.magenta, 0.5), w * 0.55, { a: 0.9, halo: 0.6, hot: 0.4 });
    const look = trapped ? [sin(ph) * 0.9, 0.2] : [0.5, 0.2];
    for (const ex of [5.4, 10.6]) eyeOf(ctx, o, ex, 6.2, 0.95, col, look, { w: w * 0.45, pupil: 0.58 });
    if (o.angry) { brow(ctx, 5.4, 6.2, 0.95, 1, w, col); brow(ctx, 10.6, 6.2, 0.95, -1, w, col); steamLoop(ctx, 8, 0.5, o.u, w, col, 3, 2.0); }
  }

  /* ---------------------------------------------------------------- Springle: seahorse on a coil spring */
  function springle(ctx, o, col, w) {
    const ph = o.ph, squash = o.state === 'squash', die = o.state === 'die', trapped = o.state === 'trapped';
    const comp = squash ? 0.55 : trapped ? 0.86 + 0.1 * sin(ph) : 0.97 + 0.07 * cos(ph);
    const top = 11.8, bot = 15.7, h = (bot - top) * comp, y0 = bot - h;
    const coil = new Path2D(); coil.moveTo(7.6, y0);
    const turns = 5;
    for (let i = 0; i <= turns * 2; i++) { const y = y0 + (i / (turns * 2)) * h; coil.lineTo(7.6 + (i % 2 ? 2.0 : -2.0), y); }
    coil.lineTo(7.6, bot);
    neon(ctx, coil, col, w * 0.95, { halo: 1.2, hot: 0.7 });
    neon(ctx, new Path2D('M 4.9 ' + (bot + 0.1) + ' L 10.3 ' + (bot + 0.1)), col, w * 0.9, { halo: 0.6 });
    ctx.translate(0, (1 - comp) * (bot - top));
    const sw = squash ? 0 : sin(ph) * 0.12;
    const fin = new Path2D('M 5.6 6.4 Q 3.4 6.4 3.0 8.2 Q 3.2 9.6 4.6 10.0 Q 5.0 8.4 5.5 7.8');
    fillAdd(ctx, fin, col, 0.14);
    neon(ctx, fin, col, w * 0.55, { a: 0.85, halo: 0.5, hot: 0.25 });
    const flut = sin(ph + 1) * 0.35;                // the dorsal fin flutters
    neon(ctx, new Path2D('M 5.4 6.9 L ' + (3.5 + flut) + ' 7.9 M 5.3 7.6 L ' + (3.8 + flut) + ' 9.1'), col, w * 0.3, { a: 0.55, halo: 0, hot: 0.1 });
    const spine = sampleSpline([[9.8, 3.3], [7.0, 4.7 + sw], [8.7, 7.3], [9.1, 9.7], [7.6, 11.9]], 7);
    const hwS = (u) => 1.05 + 2.25 * sin(PI * Math.pow(min(1, u * 1.12), 0.85)) * (1 - u * 0.5);
    const torso = taper(spine, hwS);
    body(ctx, torso, col, w, { y0: 3, y1: 12, tint: 1.3, hl: [6.6, 6.4, 5.2, 0.32] });
    neon(ctx, torso, col, w * 1.05, { grad: [3, 3, 12, 12] });
    const ring = new Path2D();
    for (let i = 0; i < 5; i++) { const u = 0.2 + i * 0.16, p0 = spine[Math.floor(u * (spine.length - 1))]; const hw = hwS(u); ring.moveTo(p0[0] - hw * 0.9, p0[1] - 0.2); ring.quadraticCurveTo(p0[0], p0[1] + 0.9, p0[0] + hw * 0.95, p0[1] - 0.25); }
    neon(ctx, ring, col, w * 0.4, { a: 0.62, halo: 0, hot: 0.3 });
    const head = new Path2D('M 7.8 3.3 C 7.0 1.4 8.8 0.2 10.4 0.6 C 11.7 0.9 12.5 1.9 12.5 2.9 L 15.0 5.9 C 15.5 6.6 14.9 7.2 14.3 6.8 L 11.4 4.9 C 10.2 5.4 8.6 4.8 7.8 3.3 Z');
    body(ctx, head, col, w, { y0: 0, y1: 7, tint: 1.35, hl: [9.6, 2.0, 3.6, 0.35] });
    neon(ctx, head, col, w * 1.08, { grad: [7, 0, 15, 7] });
    neon(ctx, new Path2D('M 8.4 1.2 L 7.0 -0.2 L 8.8 0.0 L 8.2 -1.5 L 10.0 -0.4 L 10.6 -1.7 L 11.4 -0.1'), hot(col, 0.2), w * 0.7, { halo: 1.0, hot: 0.6 });   // coronet
    neon(ctx, new Path2D('M 7.6 3.4 Q 6.4 4.2 6.5 5.6'), col, w * 0.5, { a: 0.7, halo: 0.2, hot: 0.2 });
    eyeOf(ctx, o, 10.5, 2.2, 0.95, col, trapped ? [sin(ph) * 0.9, 0.25] : [0.6, 0.25], { w: w * 0.5 });
    if (o.angry) brow(ctx, 10.5, 2.2, 0.95, 1, w, col);
    dot(ctx, 14.6, 6.3, 0.2, WHITE, 0.6, { halo: 2.2 });
    neon(ctx, new Path2D('M 9.4 5.6 L 11.6 5.8 L 10.4 7.4 Z'), col, w * 0.55, { a: 0.85, halo: 0.3 });
    if (squash) {      // impact ticks on both sides of the compressed coil
      neon(ctx, new Path2D('M 3.2 15.2 L 1.6 14.4 M 12.0 15.2 L 13.6 14.4 M 3.6 14.2 L 2.4 12.8 M 11.6 14.2 L 12.8 12.8'), hot(col, 0.4), w * 0.5, { a: 0.8, halo: 0.4, hot: 0.4 });
    }
    if (o.angry) steamLoop(ctx, 5.6, 3.4, o.u, w, col, 3, 2.9);
  }

  /* ---------------------------------------------------------------- Glimmer: anglerfish with a lantern */
  function glimmer(ctx, o, col, w) {
    const ph = o.ph, fire = o.state === 'fire', trapped = o.state === 'trapped', die = o.state === 'die';
    const wag = sin(ph) * 0.5;
    const lant = o.frost ? mixc(FROST, WHITE, 0.25) : RGB.amber, bio = o.frost ? mixc(FROST, WHITE, 0.2) : RGB.cyan;      // frozen: the lantern is a cold pale light, no amber / cyan
    const pulse = 0.85 + sin(ph + 1) * 0.15 + (fire ? 0.5 : 0);
    ctx.translate(0, sin(ph + 0.5) * 0.25);        // hover bob
    const tf = new Path2D('M 2.5 9.6 L 0 ' + (6.1 + wag) + ' Q 1.1 9.6 0 ' + (13 - wag) + ' Z');
    body(ctx, tf, col, w, { y0: 6, y1: 13 }); neon(ctx, tf, col, w * 0.95);
    neon(ctx, new Path2D('M 2.3 9.6 L 0.5 ' + (7.3 + wag * 0.8) + ' M 2.3 9.6 L 0.4 ' + (11.8 - wag * 0.8)), col, w * 0.35, { a: 0.5, halo: 0, hot: 0.2 });
    neon(ctx, new Path2D('M 4.3 5.3 L 5.2 2.9 L 6.6 4.5 L 7.8 2.5 L 8.8 4.2'), col, w * 0.7, { halo: 0.6, hot: 0.4 });
    const bp = new Path2D('M 2.2 9.6 C 1.9 6 4.6 4.1 7.8 4.1 C 11.2 4.1 13.5 5.6 13.9 8 L 13.9 10.4 C 13.2 13.1 10.6 14.5 7.7 14.5 C 4.3 14.5 2.5 12.6 2.2 9.6 Z');
    body(ctx, bp, col, w, { y0: 4, y1: 14.5, tint: 1.25, hl: [6, 7, 6.4, 0.3] });
    neon(ctx, bp, col, w * 1.1, { grad: [2, 4, 14, 14.5] });
    // lateral bio-dots (they flare when the spark is charged)
    for (const [bx, by, r] of [[4.4, 8.6, 0.28], [5.9, 7.7, 0.24], [7.5, 7.2, 0.24], [3.9, 10.8, 0.22], [5.6, 11.4, 0.22]]) dot(ctx, bx, by, r * (fire ? 1.5 : 1), bio, fire ? 1 : 0.8, { halo: 2.6 });
    neon(ctx, new Path2D('M 7.6 10.5 L 4.7 12.9 L 8.9 12.3 Z'), col, w * 0.6, { a: 0.85, halo: 0.4 });
    const open = fire ? 1.4 : 0.8 + sin(ph) * 0.1;
    neon(ctx, new Path2D('M 13.9 8.2 Q 11.4 ' + (10.4 + open) + ' 8.6 ' + (9.9 + open * 0.4)), hot(col, 0.4), w * 0.7, { halo: 0.5, hot: 0.5 });
    const teeth = new Path2D();
    for (let i = 0; i < 4; i++) { const u = 0.1 + i * 0.22; const x = lerp(13.7, 9.2, u), y = lerp(8.4, 9.9 + open * 0.4, u) + sin(u * 3) * 0.3; teeth.moveTo(x, y); teeth.lineTo(x - 0.35, y + 1.1); teeth.lineTo(x - 0.7, y + 0.1); }
    fillAdd(ctx, teeth, WHITE, 0.9);
    eyeOf(ctx, o, 10.5, 6.7, 1.55, lant, trapped ? [sin(ph) * 0.8, 0.3] : [0.7, 0.2], { w: w * 0.6 });
    if (o.angry) brow(ctx, 10.5, 6.7, 1.55, 1, w, col);
    // antenna + lantern (its own light source)
    neon(ctx, new Path2D('M 9.6 4.3 C 10.2 0.4 14.2 -0.4 15.0 2.9'), hot(col, 0.2), w * 0.7, { halo: 0.7 });
    const lx = 15.0, ly = 4.0;
    const gp = min(pulse, 1.15);
    glow(ctx, lx, ly, 5.6 * gp, lant, 0.5);
    glow(ctx, lx, ly, 3.0 * gp, hot(lant, 0.5), 0.6);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgba(hot(lant, 0.3), 0.98); ctx.beginPath(); ctx.arc(lx, ly, 1.25, 0, TAU); ctx.fill();
    ctx.fillStyle = rgba(WHITE, 0.98); ctx.beginPath(); ctx.arc(lx - 0.1, ly - 0.15, 0.62, 0, TAU); ctx.fill();
    ctx.restore();
    sparkle(ctx, lx, ly, 1.9 * pulse, hot(lant, 0.4), 0.7, 0);
    if (fire) {          // the spark charges under the belly (it is released downwards)
      glow(ctx, 6.4, 14.6, 3.2, lant, 0.5);
      sparkle(ctx, 6.4, 14.8, 2.0, hot(lant, 0.5), 0.95, 0.4);
      neon(ctx, new Path2D('M 6.4 14.5 L 6.4 16'), hot(lant, 0.3), w * 0.6, { a: 0.9, halo: 0.6, hot: 0.4 });
    }
    if (o.angry) steamLoop(ctx, 6, 2.0, o.u, w, col, 2, 2.4);
  }

  /* ---------------------------------------------------------------- Bonefin: skeletal ghost fish (no body fill) */
  function bonefin(ctx, o) {
    const ph = o.ph, w = o.w, A = 1;
    const bone = hot(mixc(RGB.white, RGB.cyan, 0.3), 0.3);
    const wob = (x, p) => sin(ph + x * 0.55 + p) * 0.35;
    for (let i = 0; i < 4; i++) {          // ghost wisps trailing behind (fading)
      const y = 6.2 + i * 1.35;
      const sp = sampleSpline([[2.4, y], [0.4, y + wob(0.4, i)], [-2.2, y + 0.4 + wob(1, i + 1)], [-4, y + 0.2 + wob(2, i + 2)]], 5);
      const g = ctx.createLinearGradient(2.4, 0, -4, 0); g.addColorStop(0, rgba(bone, 0.35)); g.addColorStop(1, rgba(bone, 0));
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = w * 0.7; ctx.lineCap = 'round'; ctx.strokeStyle = g; ctx.stroke(spinePath(sp)); ctx.restore();
    }
    glow(ctx, 8, 8, 10, bone, 0.14 * A);
    const sp = [];
    for (let i = 0; i <= 10; i++) { const x = 7.6 - i * 0.55; sp.push([x, 8.2 + wob(x, 0)]); }
    neon(ctx, spinePath(sp), bone, w * 0.7, { halo: 0.8, hot: 0.5 });
    const vt = new Path2D(), rb = new Path2D();
    for (let i = 0; i <= 10; i++) { const x = sp[i][0], y = sp[i][1]; vt.moveTo(x, y - 0.6); vt.lineTo(x, y + 0.6); }
    for (let i = 1; i <= 6; i++) { const x = sp[i][0], y = sp[i][1], r = 3.0 - i * 0.28; rb.moveTo(x, y); rb.quadraticCurveTo(x - 0.5, y + r * 0.75, x + 0.3, y + r + 0.2); rb.moveTo(x, y); rb.quadraticCurveTo(x - 0.5, y - r * 0.55, x + 0.1, y - r * 0.8); }
    neon(ctx, vt, bone, w * 0.4, { a: 0.7, halo: 0.2, hot: 0.2 });
    neon(ctx, rb, bone, w * 0.5, { a: 0.9, halo: 0.6, hot: 0.3 });
    const tl = new Path2D(), tail0 = sp[10];
    for (const [ex, ey] of [[0.2, 4.2], [-0.3, 6.4], [-0.5, 8.4], [-0.3, 10.4], [0.2, 12.4]]) { tl.moveTo(tail0[0], tail0[1]); tl.lineTo(ex + wob(ex, ey), ey); }
    tl.moveTo(0.2, 4.2); tl.quadraticCurveTo(-1.0, 8.3, 0.2, 12.4);
    neon(ctx, tl, bone, w * 0.55, { a: 0.85, halo: 0.6, hot: 0.3 });
    const fr = new Path2D();
    for (const [bx, ex, ey] of [[6.2, 5.4, 4.3], [5.0, 4.6, 4.6], [3.8, 3.2, 5.2]]) { fr.moveTo(bx, 8.1); fr.lineTo(ex, ey); }
    for (const [bx, ex, ey] of [[5.6, 5.0, 12.0], [4.2, 3.4, 11.4]]) { fr.moveTo(bx, 8.3); fr.lineTo(ex, ey); }
    neon(ctx, fr, bone, w * 0.45, { a: 0.7, halo: 0.4, hot: 0.2 });
    // skull (pike-like): sloped cranium into a pointed snout, brow ridge, gill-cover arc, open jaw with fangs
    const jawOpen = 0.35 * (0.5 + 0.5 * sin(ph));
    const skull = new Path2D('M 7.4 7.4 C 7.6 5.5 9.4 4.8 11 5.1 C 12.8 5.4 14.5 6.9 15.5 8.5 L 15.0 9.1 L 10.4 9.2 C 8.8 9.2 7.5 8.6 7.4 7.4 Z');
    const jaw = new Path2D('M 10.2 ' + (9.9 + jawOpen) + ' L 15.1 ' + (10.3 + jawOpen) + ' L 14.4 ' + (11.3 + jawOpen) + ' L 11.2 ' + (11.5 + jawOpen) + ' C 10.3 ' + (11.3 + jawOpen) + ' 9.9 ' + (10.7 + jawOpen) + ' 10.2 ' + (9.9 + jawOpen) + ' Z');
    for (const sh of [skull, jaw]) { fillDark(ctx, sh, 0.84); fillAdd(ctx, sh, bone, 0.08); }
    neon(ctx, skull, bone, w * 1.0, { halo: 1.1, hot: 0.65 });
    neon(ctx, jaw, bone, w * 0.8, { halo: 0.7, hot: 0.5 });
    neon(ctx, new Path2D('M 9.3 5.9 C 8.5 7 8.7 8.1 9.5 8.9 M 12.6 5.9 L 13.9 7.1 M 13.6 6.6 L 14.6 7.9'), bone, w * 0.4, { a: 0.7, halo: 0, hot: 0.2 });
    const tt = new Path2D();
    for (let i = 0; i < 5; i++) { const x = 10.6 + i * 0.95; tt.moveTo(x, 9.2); tt.lineTo(x + 0.32, 10.2 + jawOpen); tt.lineTo(x + 0.64, 9.2); }
    for (let i = 0; i < 4; i++) { const x = 11.1 + i * 1.0; tt.moveTo(x, 10.1 + jawOpen); tt.lineTo(x + 0.3, 9.3 + jawOpen); tt.lineTo(x + 0.6, 10.1 + jawOpen); }
    fillAdd(ctx, tt, WHITE, 0.92);
    const ex = 11.2, ey = 6.9;
    ctx.save(); ctx.fillStyle = 'rgba(2,3,8,0.97)'; ctx.beginPath(); ctx.arc(ex, ey, 1.2, 0, TAU); ctx.fill(); ctx.restore();
    neon(ctx, circlePath(ex, ey, 1.2), bone, w * 0.6, { halo: 0.5 });
    neon(ctx, new Path2D('M 9.4 5.6 L 12.8 6.2'), bone, w * 0.75, { halo: 0.4, hot: 0.4 });
    glow(ctx, ex, ey, 2.4, RGB.cyan, 0.34 * (0.8 + sin(ph + 1) * 0.2));
    dot(ctx, ex + 0.15, ey, 0.38, hot(RGB.cyan, 0.5), 1, { halo: 2.6 });
  }

  const CREATURE = { nibbler, crabbit, jellop, springle, glimmer };
  const ENEMY_S = { nibbler: 1.08, crabbit: 1.02, jellop: 1.06, springle: 1.04, glimmer: 1.06, bonefin: 1.1 };
  /* pads (X7: the claws / arcs / sparks used to be cut by the pad at k = 1; GFX core adds its own small-k boost on top of these) */
  const EPAD = { l: 4, r: 4, t: 4, b: 4 }, SPAD = { l: 4, r: 4, t: 5, b: 4 }, CPAD = { l: 5, r: 5, t: 4, b: 4 };      // calm: default | springle | crabbit (claws)
  const EPAD_ANGRY = { l: 5, r: 5, t: 7, b: 4 };                                                                       // angry: steam + heat reach higher
  const GPAD = { l: 4, r: 7, t: 5, b: 4 }, GPAD_ANGRY = { l: 5, r: 7, t: 7, b: 4 };
  const EPAD_TRAP = { l: 3, r: 3, t: 3, b: 3 }, CPAD_TRAP = { l: 4, r: 4, t: 3, b: 3 };
  const PAD_BY = { crabbit: CPAD, springle: SPAD, glimmer: GPAD };

  const ANG_GAIN = { nibbler: 1.15, springle: 1.35 }, HEAT_GAIN = { springle: 1.5, nibbler: 1.1 };   // springle = the brightest calm body (lime): more heat / steam instead of a brighter fill (the post bloom turns a hot fill yellow-white in game)
  const RAGE_CORE = { nibbler: [8, 8.6, 5.6, 0.34], crabbit: [8, 10.2, 5.6, 0.32], jellop: [8, 4.6, 5.6, 0.36], springle: [8.6, 7.4, 5.4, 0.4], glimmer: [8, 9.2, 5.6, 0.32] };   // [x, y, r, alpha] per body plan

  /* one creature frame: state + angry -> colour, heat halo, then the creature */
  function creatureFrame(ctx, type, o, state, angry) {
    o.state = state; o.angry = !!angry; o.frost = state === 'frozen';
    let col = o.frost ? FROST : angry ? RGB.crimson : HUE[type];
    if (state === 'die') col = hot(col, 0.3);
    if (angry) heatLoop(ctx, o.u, RGB.crimson, 8, 9, 10.5, HEAT_GAIN[type] || 1);
    ANG = angry ? (ANG_GAIN[type] || 1) : 0;                                     // 1 = the standard rage light; springle (lime = the brightest calm body) needs more
    RAGE = RAGE0; ANG_BW = 0.18; ANG_CW = 0.5;
    FRZ = o.frost ? 1 : 0;
    try { CREATURE[type](ctx, o, col, o.w); } finally { ANG = 0; FRZ = 0; }
    if (angry) { const rc = RAGE_CORE[type]; glow(ctx, rc[0], rc[1], rc[2], mixc(RAGE, WHITE, 0.35), rc[3] * 0.85 + 0.05 * sin(TAU * o.u)); }          // the rage core: a hot light in the chest, over the body
  }

  for (const type of ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer']) {
    const S = ENEMY_S[type];
    def(type + '_move', 16, 16, 4, PAD_BY[type] || EPAD, S, [8, 16], (ctx, o) => creatureFrame(ctx, type, o, 'move', false));
    def(type + '_angry', 16, 16, 4, type === 'glimmer' ? GPAD_ANGRY : EPAD_ANGRY, S, [8, 16], (ctx, o) => creatureFrame(ctx, type, o, 'move', true));
    // trapped: a small struggling captive on a dark backing disc, drawn INSIDE the bubble (trap_overlay is drawn over it)
    def(type + '_trapped', 16, 16, 2, type === 'crabbit' ? CPAD_TRAP : EPAD_TRAP, 0.76, [8, 8.2], (ctx, o) => {
      ctx.save(); ctx.fillStyle = 'rgba(4,6,14,0.5)'; ctx.beginPath(); ctx.arc(8, 8.2, 7.2 / 0.76, 0, TAU); ctx.fill(); ctx.restore();
      o.ph = PI / 2 + o.f * PI;
      ctx.translate(8 + (o.f ? 0.5 : -0.5) / 0.76, 8.4); ctx.rotate(o.f ? 0.1 : -0.1); ctx.translate(-8, -8.4);
      creatureFrame(ctx, type, o, 'trapped', false);
    });
    // die: flung: a hot, spinning 0/90/180/270 deg pose with X eyes and a few sparks
    def(type + '_die', 16, 16, 4, type === 'springle' ? { l: 4, r: 4, t: 4, b: 6 } : { l: 4, r: 4, t: 4, b: 4 }, S * 0.82, [8, 9], (ctx, o) => {
      ctx.save();
      ctx.translate(8, 9); ctx.rotate(-o.f * PI / 2); ctx.translate(-8, -9);
      creatureFrame(ctx, type, o, 'die', false);
      ctx.restore();
      for (let i = 0; i < 3; i++) { const a = o.ph + i * TAU / 3 + 0.5; sparkle(ctx, 8 + cos(a) * 8.2, 8.5 + sin(a) * 7.4, 0.9, i === 1 ? WHITE : hot(HUE[type], 0.4), 0.9, a); }
    });
  }
  // action poses (+ angry twins, so the angry cue never drops out in an action pose)
  def('crabbit_throw', 16, 16, 1, CPAD, ENEMY_S.crabbit, [8, 16], (ctx, o) => creatureFrame(ctx, 'crabbit', o, 'throw', false));
  def('crabbit_throw_angry', 16, 16, 1, EPAD_ANGRY, ENEMY_S.crabbit, [8, 16], (ctx, o) => creatureFrame(ctx, 'crabbit', o, 'throw', true));
  def('springle_squash', 16, 16, 1, SPAD, ENEMY_S.springle, [8, 16], (ctx, o) => creatureFrame(ctx, 'springle', o, 'squash', false));
  def('springle_squash_angry', 16, 16, 1, EPAD_ANGRY, ENEMY_S.springle, [8, 16], (ctx, o) => creatureFrame(ctx, 'springle', o, 'squash', true));
  def('glimmer_fire', 16, 16, 1, GPAD, ENEMY_S.glimmer, [8, 16], (ctx, o) => creatureFrame(ctx, 'glimmer', o, 'fire', false));
  def('glimmer_fire_angry', 16, 16, 1, GPAD_ANGRY, ENEMY_S.glimmer, [8, 16], (ctx, o) => creatureFrame(ctx, 'glimmer', o, 'fire', true));
  def('bonefin', 16, 16, 2, { l: 6, r: 4, t: 4, b: 4 }, ENEMY_S.bonefin, [8, 8], (ctx, o) => bonefin(ctx, o));

  /* ================================================================================================================
   * BUBBLES  real soap bubbles: thin lit rim, near-invisible body, thin-film cap (conic bands), caustic crescent, ring of halo.
   * The trapped enemy sprites (<e>_trapped) carry the captive on a dark disc; trap_overlay is the shell drawn OVER them.
   * ============================================================================================================== */
  const FILM = [RGB.cyan, RGB.violet, RGB.magenta, RGB.amber, RGB.cyan];
  const clampN = clamp;

  /* soap-bubble body (origin = bubble centre, caller translated); returns after the halo / film / caustic. o: tint, a, ph, fill, halo, wobble, stops, film, k */
  function shellBody(ctx, r, ph, o) {
    const tint = o.tint || RGB.cyan, A = o.a === undefined ? 1 : o.a, k = o.k;
    const FA0 = o.film === undefined ? 1 : o.film;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    // halo: a RING of light (zero in the middle so the contents stay visible), peaking at the film, fading outwards (kept inside the pad)
    const ha = 0.17 * A * (o.halo === undefined ? 1 : o.halo);
    const HR = o.haloR || 1.5;
    const hg = ctx.createRadialGradient(0, 0, r * 0.62, 0, 0, r * HR);
    hg.addColorStop(0, rgba(tint, 0)); hg.addColorStop(0.25, rgba(tint, ha * 0.28)); hg.addColorStop(0.47, rgba(tint, ha)); hg.addColorStop(0.64, rgba(tint, ha * 0.32)); hg.addColorStop(0.85, rgba(tint, ha * 0.06)); hg.addColorStop(1, rgba(tint, 0));
    ctx.fillStyle = hg; ctx.fillRect(-r * (HR + 0.05), -r * (HR + 0.05), r * (2 * HR + 0.1), r * (2 * HR + 0.1));
    // body: nearly transparent, only the edge carries colour (fresnel)
    const bg = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r);
    bg.addColorStop(0, rgba(tint, 0)); bg.addColorStop(0.75, rgba(tint, 0.015 * A)); bg.addColorStop(1, rgba(tint, 0.09 * A));
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    if (o.fill) { const fg = ctx.createRadialGradient(0, r * 0.1, r * 0.2, 0, 0, r); fg.addColorStop(0, rgba(o.fill, 0)); fg.addColorStop(1, rgba(o.fill, 0.13 * A)); ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); }
    // refracted light pooling in the lower right (the bubble is a lens): soft tinted caustic opposite the window highlight
    const cg = ctx.createRadialGradient(r * 0.34, r * 0.4, 0, r * 0.34, r * 0.4, r * 0.82);
    cg.addColorStop(0, rgba(hot(tint, 0.35), 0.17 * A)); cg.addColorStop(0.5, rgba(tint, 0.05 * A)); cg.addColorStop(1, rgba(tint, 0));
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(0, 0, r * 0.97, 0, TAU); ctx.fill();
    // thin-film cap: iridescent bands pooled at the top-left, drifting slowly (skipped where they cannot be seen)
    if (ctx.createConicGradient && r * k > 7) {
      const stops = o.stops || FILM, drift = sin(ph) * 0.14, FA = A * FA0;
      const band = (a0, f, al, wid) => {
        const g = ctx.createConicGradient(a0 + drift, 0, 0), n = f.length;
        f.forEach((fr, i) => g.addColorStop(fr, rgba(hot(stops[min(stops.length - 1, Math.round(i / (n - 1) * (stops.length - 1)))], 0.2), min(1, al[i] * FA))));
        ctx.lineWidth = wid; ctx.strokeStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 0.86, 0, TAU); ctx.stroke();
      };
      ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r * 0.985, 0, TAU); ctx.clip(); ctx.lineCap = 'butt';
      band(2.55, [0, 0.1, 0.24, 0.38, 0.5, 0.6, 1], [0, 0.14, 0.36, 0.26, 0.1, 0, 0], r * 0.3);
      band(2.55, [0, 0.1, 0.24, 0.38, 0.5, 0.6, 1], [0, 0.1, 0.3, 0.2, 0.08, 0, 0], r * 0.14);
      band(0.35, [0, 0.12, 0.3, 0.45, 1], [0, 0.1, 0.17, 0, 0], r * 0.22);
      ctx.restore();
    }
    ctx.restore();
  }
  /* rim + window highlight + secondary reflection (origin = bubble centre) */
  function shellRim(ctx, r, ph, o) {
    const A = o.a === undefined ? 1 : o.a, k = o.k, w = clampN(r * 0.042, 1.2 / k, 3.3 / k), stops = o.stops || FILM;
    const rk = o.rimK || 1, wr = rk === 1 ? w : clampN(r * 0.042 * rk, 1.2 / k * (1 + (rk - 1) * 0.5), 3.3 / k * rk);     // wr: the ring strokes themselves (trap stages 1 / 2 draw a thicker rim: a non-hue cue); highlights keep w
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const rot = ph * 1 + (o.rot || 0);
    ctx.lineWidth = w * 3.2; ctx.strokeStyle = filmG(ctx, rot, 0.10 * A, stops); ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
    ctx.lineWidth = wr * 1.5; ctx.strokeStyle = filmG(ctx, rot, 0.34 * A, stops); ctx.stroke();
    ctx.lineWidth = wr * 0.8; ctx.strokeStyle = filmG(ctx, rot, 0.62 * A, stops); ctx.stroke();
    ctx.lineCap = 'round';
    const seg = (a0, a1, lw, al) => { ctx.lineWidth = lw; ctx.strokeStyle = filmG(ctx, rot, al * A, stops); ctx.beginPath(); ctx.arc(0, 0, r, a0 * PI / 180, a1 * PI / 180); ctx.stroke(); };
    seg(175, 292, wr * 1.25, 0.95);       // lit side (key light, top-left): thicker and hotter
    seg(5, 95, wr * 1.05, 0.7);           // second lit side (bounce, bottom-right)
    ctx.lineWidth = w * 0.5; ctx.strokeStyle = rgba(WHITE, 0.10 * A); ctx.beginPath(); ctx.arc(0, 0, r * 0.89, 0, TAU); ctx.stroke();      // inner wall
    const hl = (rr, a0, a1, lw, al) => { ctx.lineWidth = lw; ctx.strokeStyle = rgba(WHITE, al * A); ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(0, 0, rr, a0 * PI / 180, a1 * PI / 180); ctx.stroke(); };
    hl(r * 0.7, 200, 252, w * 2.1, 0.30);
    hl(r * 0.7, 206, 246, w * 1.2, 0.92);
    ctx.fillStyle = rgba(WHITE, 0.95 * A); ctx.beginPath(); ctx.arc(cos(262 * PI / 180) * r * 0.7, sin(262 * PI / 180) * r * 0.7, w * 0.9, 0, TAU); ctx.fill();
    ctx.lineWidth = w * 2.6; ctx.strokeStyle = filmG(ctx, rot + 2, 0.16 * A, stops);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.76, 14 * PI / 180, 66 * PI / 180); ctx.stroke();
    ctx.lineWidth = w * 1.05; ctx.strokeStyle = filmG(ctx, rot + 2, 0.7 * A, stops);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.76, 20 * PI / 180, 58 * PI / 180); ctx.stroke();
    ctx.lineWidth = w * 0.7; ctx.strokeStyle = rgba(WHITE, 0.45 * A);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.76, 30 * PI / 180, 46 * PI / 180); ctx.stroke();
    ctx.restore();
  }
  const filmG = (ctx, rot, a, stops) => N.filmGradient(ctx, 0, 0, rot, a, stops);

  const boltPath = (r) => poly([[0.2, -0.66], [-0.3, 0.06], [0.02, 0.06], [-0.2, 0.68], [0.36, -0.14], [0.05, -0.14], [0.3, -0.66]].map((p) => [p[0] * r, p[1] * r]), true);
  /* fire icon (C5): a FLAME, not a drop: a tall main tongue leaning right (asymmetric sharp tip) between two shorter pointed side tongues, valleys
   * between them and a round bulb at the base. d = tongue flicker (ph), s = size (units). core = the small inner flame (one tongue). */
  function flamePath(r, ph, core) {
    const s = (v) => v * r, f = sin(ph + 0.9) * 0.06, g = sin(ph * 1 + 2.4) * 0.07, h = sin(ph + 4.0) * 0.05;
    if (core) {
      return new Path2D('M ' + s(0) + ' ' + s(0.62) + ' C ' + s(-0.3) + ' ' + s(0.6) + ' ' + s(-0.38) + ' ' + s(0.3) + ' ' + s(-0.22) + ' ' + s(0.02) + ' C ' + s(-0.14) + ' ' + s(-0.2) + ' ' + s(0.0) + ' ' + s(-0.3) + ' ' + s(0.1 + f * 0.5) + ' ' + s(-0.5 - f) + ' C ' + s(0.16) + ' ' + s(-0.28) + ' ' + s(0.3) + ' ' + s(-0.04) + ' ' + s(0.26) + ' ' + s(0.26) + ' C ' + s(0.22) + ' ' + s(0.52) + ' ' + s(0.12) + ' ' + s(0.62) + ' ' + s(0) + ' ' + s(0.62) + ' Z');
    }
    return new Path2D('M ' + s(0) + ' ' + s(0.7)
      + ' C ' + s(-0.34) + ' ' + s(0.7) + ' ' + s(-0.52) + ' ' + s(0.44) + ' ' + s(-0.5) + ' ' + s(0.14)        // bulb, left side
      + ' C ' + s(-0.49) + ' ' + s(-0.06) + ' ' + s(-0.4) + ' ' + s(-0.2 + g) + ' ' + s(-0.44) + ' ' + s(-0.42 - g)   // up to the left tongue tip (sharp)
      + ' C ' + s(-0.3) + ' ' + s(-0.34) + ' ' + s(-0.2) + ' ' + s(-0.26) + ' ' + s(-0.17) + ' ' + s(-0.14)    // left valley
      + ' C ' + s(-0.14) + ' ' + s(-0.42) + ' ' + s(-0.04) + ' ' + s(-0.58) + ' ' + s(0.14 + f) + ' ' + s(-0.8 - f)      // main tongue tip (leans right)
      + ' C ' + s(0.1) + ' ' + s(-0.5) + ' ' + s(0.2) + ' ' + s(-0.34) + ' ' + s(0.2) + ' ' + s(-0.16)          // right valley
      + ' C ' + s(0.3) + ' ' + s(-0.26) + ' ' + s(0.38) + ' ' + s(-0.3) + ' ' + s(0.46 + h) + ' ' + s(-0.42 - h)        // right tongue tip
      + ' C ' + s(0.44) + ' ' + s(-0.2) + ' ' + s(0.52) + ' ' + s(-0.04) + ' ' + s(0.5) + ' ' + s(0.16)
      + ' C ' + s(0.48) + ' ' + s(0.44) + ' ' + s(0.34) + ' ' + s(0.7) + ' ' + s(0) + ' ' + s(0.7) + ' Z');
  }
  const dropPath = (r) => { const s = (v) => v * r; return new Path2D('M ' + s(0) + ' ' + s(-0.68) + ' C ' + s(0.1) + ' ' + s(-0.4) + ' ' + s(0.44) + ' ' + s(-0.1) + ' ' + s(0.44) + ' ' + s(0.24) + ' C ' + s(0.44) + ' ' + s(0.52) + ' ' + s(0.24) + ' ' + s(0.68) + ' ' + s(0) + ' ' + s(0.68) + ' C ' + s(-0.24) + ' ' + s(0.68) + ' ' + s(-0.44) + ' ' + s(0.52) + ' ' + s(-0.44) + ' ' + s(0.24) + ' C ' + s(-0.44) + ' ' + s(-0.1) + ' ' + s(-0.1) + ' ' + s(-0.4) + ' ' + s(0) + ' ' + s(-0.68) + ' Z'); };

  /* kinds: empty | shot | warn | thunder | fire | water | letter | stage0..2 (trap overlay). o: {k, ph, f, n, r, cx, cy, ...} */
  const BUBBLE_STYLE = {
    empty: { tint: RGB.cyan, stops: FILM, halo: 1, film: 1 },
    shot: { tint: RGB.cyan, stops: FILM, halo: 1.5, film: 1.9 },
    stage0: { tint: RGB.cyan, stops: FILM, halo: 1, film: 1 },
    /* C2: the trap stages differ by SHAPE as well as hue (colour-blind safe): stage 1 = thicker rim broken into 8 dashes (gaps cut through the rim),
     * stage 2 = the thickest, hottest rim + a second inner ring + four glowing crack lines running in from the rim (the shell is about to burst). */
    stage1: { tint: RGB.amber, fill: RGB.amber, stops: [hot(RGB.amber, 0.12), hot(RGB.amber, 0.5), hot(RGB.ember, 0.2), hot(RGB.amber, 0.12), hot(RGB.amber, 0.12)], halo: 1.45, film: 1, rimK: 1.5, dash: 8 },
    stage2: { tint: RGB.crimson, fill: RGB.crimson, stops: [hot(RGB.crimson, 0.4), hot(RGB.ember, 0.55), hot(RGB.crimson, 0.55), hot(RGB.ember, 0.4), hot(RGB.crimson, 0.4)], halo: 1.9, film: 1, rimK: 2.0, crack: true },
    warn: { tint: RGB.crimson, stops: [RGB.crimson, RGB.magenta, RGB.amber, RGB.crimson, RGB.crimson], halo: 1.2, film: 1 },
    thunder: { tint: RGB.amber, fill: RGB.amber, stops: [RGB.amber, hot(RGB.amber, 0.6), RGB.cyan, RGB.amber, RGB.amber], halo: 1, film: 1 },
    fire: { tint: RGB.ember, fill: RGB.ember, stops: [RGB.ember, RGB.amber, RGB.crimson, RGB.ember, RGB.ember], halo: 1, film: 1 },
    water: { tint: RGB.cobalt, fill: RGB.cobalt, stops: [RGB.cobalt, RGB.cyan, RGB.violet, RGB.cobalt, RGB.cobalt], halo: 1, film: 1 },
    letter: { tint: mixc(RGB.violet, RGB.magenta, 0.35), fill: mixc(RGB.violet, RGB.magenta, 0.35), stops: [RGB.violet, RGB.magenta, hot(RGB.amber, 0.2), RGB.violet, RGB.violet], halo: 1.25, film: 1.2 },
  };

  function bubble(ctx, kind, o, extra) {
    const st = BUBBLE_STYLE[kind] || BUBBLE_STYLE.empty, k = o.k, ph = o.ph + (extra && extra.ph0 !== undefined ? extra.ph0 : 0.9);
    const r = (extra && extra.r) || 7.6, cx = (extra && extra.cx) || 8, cy = (extra && extra.cy) || 8;
    const wob = kind === 'shot' ? 2 : 1;
    const so = { tint: st.tint, fill: st.fill, stops: st.stops, halo: st.halo * ((extra && extra.halo) || 1), film: st.film, a: (extra && extra.a) || 1, k, rot: extra && extra.rot || 0, rimK: st.rimK };
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(1 + sin(ph) * 0.028 * wob, 1 - sin(ph) * 0.028 * wob);
    shellBody(ctx, r, ph, so);
    const w = clampN(r * 0.055, 1.3 / k, 4.2 / k);
    if (extra && extra.contents) extra.contents(ctx, r, w);
    shellRim(ctx, r, ph, so);
    const rk = st.rimK || 1, rw = rk === 1 ? clampN(r * 0.042, 1.2 / k, 3.3 / k) : clampN(r * 0.042 * rk, 1.2 / k * (1 + (rk - 1) * 0.5), 3.3 / k * rk);       // the rim's own stroke unit (= shellRim's wr)
    if (st.dash) trapDashes(ctx, r, rw, st, so);
    if (st.crack) trapCracks(ctx, r, rw, st, so);
    ctx.restore();
  }
  /* trap stage 1: n dashes. The gaps are cut OUT of the finished rim (destination-out: the overlay is baked on its own transparent canvas), then bright
   * thick dash caps are laid over the remaining segments, so the ring reads as "dashed" at every k even in grayscale. */
  function trapDashes(ctx, r, w, st, so) {
    const n = st.dash, seg = TAU / n, gap = seg * 0.36, a0 = -PI / 2 + 0.3;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out'; ctx.lineCap = 'butt'; ctx.lineWidth = Math.max(w * 1.5, 1.7 / so.k);
    for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(0, 0, r * 1.0, a0 + i * seg - gap / 2, a0 + i * seg + gap / 2); ctx.stroke(); }
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      ctx.lineWidth = w * 1.0; ctx.strokeStyle = rgba(hot(st.tint, 0.4), 0.9); ctx.beginPath(); ctx.arc(0, 0, r, a0 + i * seg + gap * 0.62, a0 + (i + 1) * seg - gap * 0.62); ctx.stroke();
      ctx.lineWidth = w * 0.4; ctx.strokeStyle = rgba(WHITE, 0.8); ctx.stroke();
    }
    ctx.restore();
  }
  /* trap stage 2: a second inner ring + four crack lines from the rim inwards (a zigzag with a short branch each), white-hot over a crimson halo */
  function trapCracks(ctx, r, w, st, so) {
    w = Math.min(w / (st.rimK || 1), 0.9);                                              // crack / inner-ring strokes use the plain rim unit (their halos must not whiten the disc)
    neon(ctx, circlePath(0, 0, r * 0.88), hot(st.tint, 0.35), w * 0.6, { a: 0.7, halo: 0.4, hot: 0.5 });
    const P = new Path2D(), B = new Path2D();
    const base = [-0.55, 0.62, 2.25, 3.95];
    for (let i = 0; i < 4; i++) {
      const a = base[i], L = r * (0.5 + 0.1 * (i % 2)), dirx = -cos(a), diry = -sin(a), px = -diry, py = dirx;
      const pts = [[cos(a) * r, sin(a) * r]];
      const jit = [0.5, -0.45, 0.4, -0.3];
      for (let j = 1; j <= 4; j++) { const t = j / 4; pts.push([cos(a) * r + dirx * L * t + px * r * 0.13 * jit[j - 1] * (i % 2 ? -1 : 1), sin(a) * r + diry * L * t + py * r * 0.13 * jit[j - 1] * (i % 2 ? -1 : 1)]); }
      P.moveTo(pts[0][0], pts[0][1]); for (let j = 1; j < pts.length; j++) P.lineTo(pts[j][0], pts[j][1]);
      const m = pts[2];
      B.moveTo(m[0], m[1]); B.lineTo(m[0] + (dirx * 0.5 + px * (i % 2 ? -0.7 : 0.7)) * r * 0.22, m[1] + (diry * 0.5 + py * (i % 2 ? -0.7 : 0.7)) * r * 0.22);
    }
    neon(ctx, P, hot(RGB.crimson, 0.5), w * 1.1, { a: 1, halo: 0.9, hot: 0.9 });
    neon(ctx, B, hot(RGB.crimson, 0.4), w * 0.8, { a: 0.85, halo: 0.5, hot: 0.8 });
  }

  const BPAD = { l: 4, r: 4, t: 4, b: 4 };
  def('bubble', 16, 16, 2, BPAD, 1, (ctx, o) => bubble(ctx, 'empty', o));
  def('bubble_shot', 16, 16, 3, BPAD, 1, (ctx, o) => bubble(ctx, 'shot', o, { r: [4.1, 6.0, 7.4][o.f], ph0: 0.8 }));
  def('bubble_warn', 16, 16, 2, BPAD, 1, (ctx, o) => bubble(ctx, 'warn', o, { halo: o.f ? 0.7 : 1.35, a: o.f ? 0.85 : 1 }));
  def('trap_overlay', 16, 16, 3, BPAD, 1, (ctx, o) => bubble(ctx, 'stage' + o.f, o, { ph0: 0.4 + o.f }));
  def('bubble_letter', 16, 16, 2, BPAD, 1, (ctx, o) => bubble(ctx, 'letter', o, {
    contents(g, r) {          // a darker, calmer centre so the white-hot glyph printed by the game reads, and a ring of light motes
      g.save(); const dg = g.createRadialGradient(0, 0, 0, 0, 0, r * 0.9); dg.addColorStop(0, 'rgba(4,6,14,0.55)'); dg.addColorStop(0.7, 'rgba(4,6,14,0.35)'); dg.addColorStop(1, 'rgba(4,6,14,0)');
      g.fillStyle = dg; g.beginPath(); g.arc(0, 0, r * 0.95, 0, TAU); g.fill(); g.restore();
      neon(g, circlePath(0, 0, r * 0.7), mixc(RGB.violet, RGB.magenta, 0.4), max(0.3, o.w * 0.5), { a: 0.35, halo: 0.2, hot: 0.2 });
      for (let i = 0; i < 3; i++) { const a = o.ph * 1 + i * TAU / 3 + 0.4; dot(g, cos(a) * r * 0.8, sin(a) * r * 0.8, 0.28, hot(RGB.magenta, 0.4), 0.9, { halo: 3 }); }
    },
  }));
  def('bubble_thunder', 16, 16, 2, { l: 6, r: 6, t: 6, b: 6 }, 1, (ctx, o) => bubble(ctx, 'thunder', o, {
    contents(g, r, w) {
      const flick = o.f ? 0.82 : 1;
      const bp = boltPath(r * 0.82);
      glow(g, 0, 0, r * 0.9, RGB.amber, 0.4 * flick);
      g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = rgba(hot(RGB.amber, 0.78), 0.96 * flick); g.fill(bp); g.restore();
      neon(g, bp, RGB.amber, w * 0.8, { halo: 1.2, hot: 0.7 });
      const R2 = rng(o.f * 7 + 3), arcs = new Path2D();       // crackling arcs leaving the bubble (new ones every frame)
      for (let i = 0; i < 3; i++) {
        const a0 = R2.float(0, TAU); arcs.moveTo(cos(a0) * r * 1.02, sin(a0) * r * 1.02);
        for (let s = 0; s < 3; s++) { const aa = a0 + R2.float(-0.3, 0.3), rr = r * (1.06 + (s + 1) * 0.1); arcs.lineTo(cos(aa) * rr, sin(aa) * rr); }
      }
      neon(g, arcs, hot(RGB.amber, 0.3), w * 0.6, { a: 0.85 * flick, halo: 0.8, hot: 0.6 });
    },
  }));
  def('bubble_fire', 16, 16, 2, BPAD, 1, (ctx, o) => bubble(ctx, 'fire', o, {
    contents(g, r, w) {
      const fp = flamePath(r * 0.9, o.ph), fi = flamePath(r * 0.56, o.ph + 1.7, true);
      glow(g, 0, r * 0.05, r * 1.0, RGB.ember, 0.42);
      g.save(); g.translate(0, r * 0.02); g.globalCompositeOperation = 'lighter'; g.fillStyle = rgba(hot(RGB.ember, 0.18), 0.6); g.fill(fp); g.restore();
      g.save(); g.translate(0, r * 0.02); neon(g, fp, RGB.ember, w * 0.85, { halo: 1.1, hot: 0.55 }); g.restore();
      g.save(); g.translate(0, r * 0.2); g.globalCompositeOperation = 'lighter'; g.fillStyle = rgba(hot(RGB.amber, 0.62), 0.96); g.fill(fi); g.restore();
    },
  }));
  /* water icon (C5): a smooth ROUND drop sitting on two travelling wave lines (a drop + ripples, nothing pointed besides the drop's own tip) */
  def('bubble_water', 16, 16, 2, BPAD, 1, (ctx, o) => bubble(ctx, 'water', o, {
    contents(g, r, w) {
      const dp = dropPath(r * 0.7), dy = (o.f ? 0.03 : -0.02) * r - r * 0.2;
      glow(g, 0, 0, r * 0.9, RGB.cobalt, 0.4);
      g.save(); g.translate(0, dy); g.globalCompositeOperation = 'lighter';
      const dg = g.createLinearGradient(0, -r * 0.45, 0, r * 0.45); dg.addColorStop(0, rgba(RGB.cyan, 0.55)); dg.addColorStop(1, rgba(RGB.cobalt, 0.55));
      g.fillStyle = dg; g.fill(dp); g.restore();
      g.save(); g.translate(0, dy);
      neon(g, dp, hot(RGB.cyan, 0.15), w * 0.85, { halo: 1.1, hot: 0.6 });
      neon(g, new Path2D('M ' + (-r * 0.16) + ' ' + (r * 0.02) + ' Q ' + (-r * 0.2) + ' ' + (r * 0.24) + ' ' + (-r * 0.05) + ' ' + (r * 0.32)), WHITE, w * 0.6, { a: 0.9, halo: 0, hot: 0.3 });
      g.restore();
      // two wave lines under the drop (the crests travel between the frames)
      for (let i = 0; i < 2; i++) {
        const y0 = r * (0.5 + i * 0.2), amp = r * 0.065, sh = (o.f ? 0.5 : 0) + i * 0.25, wave = new Path2D(), x0 = -r * (0.62 - i * 0.12), x1 = -x0;
        for (let q = 0; q <= 16; q++) { const x = x0 + (x1 - x0) * q / 16, y = y0 + amp * sin((q / 16) * TAU * 1.5 + sh * TAU); q ? wave.lineTo(x, y) : wave.moveTo(x, y); }
        neon(g, wave, hot(RGB.cyan, 0.3 - i * 0.1), w * (0.6 - i * 0.1), { a: 0.95 - i * 0.2, halo: 0.7, hot: 0.4 });
      }
    },
  }));

  /* pop burst: 3 frames - the rim shatters into curved fragments that fly apart, a shockwave ring rolls out, droplets spray (all inside the pad) */
  def('bubble_pop', 16, 16, 3, { l: 5, r: 5, t: 5, b: 5 }, 1, (ctx, o) => {
    const k = o.k, f = o.f, u = [0.12, 0.5, 0.88][f], r0 = 7.6, kk = 1 - u * 0.9, R = rng(11 + f * 5);
    const col = RGB.cyan, w = max(1.3 / k, r0 * 0.06);
    ctx.save(); ctx.translate(8, 8);
    glow(ctx, 0, 0, r0 * (0.9 + u * 0.55), hot(col, 0.4), 0.42 * kk);
    if (f === 0) glow(ctx, 0, 0, r0 * 0.7, WHITE, 0.3);
    // rim fragments: six curved pieces that drift outwards (fade with u)
    const nf = 6;
    for (let i = 0; i < nf; i++) {
      const a0 = (i * 360 / nf + 8 + f * 14), a1 = a0 + 360 / nf * (0.62 - 0.22 * u), rr = r0 * (0.98 + 0.34 * u);
      neon(ctx, poly(arcPts(0, 0, rr, rr, a0, a1, 8), false), i % 2 ? hot(col, 0.35) : mixc(col, RGB.violet, i % 3 === 0 ? 0.35 : 0), w * (1.1 - 0.5 * u), { a: 0.95 * (1 - 0.7 * u), halo: 1.0, hot: 0.6 });
    }
    neon(ctx, circlePath(0, 0, r0 * (0.55 + 0.75 * u)), col, w * 0.9, { a: 0.8 * kk, halo: 1.2, hot: 0.5 });          // shockwave
    // short radial splash strokes
    if (f < 2) {
      const sp = new Path2D();
      for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + 0.3 + f * 0.2, a0 = r0 * (0.85 + u * 0.6), a1 = a0 + r0 * 0.22 * (1 - u); sp.moveTo(cos(a) * a0, sin(a) * a0); sp.lineTo(cos(a) * a1, sin(a) * a1); }
      neon(ctx, sp, hot(col, 0.5), w * 0.7, { a: 0.8 * (1 - u), halo: 0.5, hot: 0.5 });
    }
    for (let i = 0; i < 10; i++) {
      const a = R.float(0, TAU) + i * 0.1, d = r0 * (0.6 + u * R.float(0.3, 0.7)), s = max(0.45 / k * 2, r0 * 0.07 * (1 - u * 0.75) * R.float(0.8, 1.4));
      dot(ctx, cos(a) * d, sin(a) * d, s, i % 3 === 0 ? hot(RGB.magenta, 0.2) : col, kk, { halo: 3 });
    }
    ctx.restore();
  });

  /* ================================================================================================================
   * KRAKEN KING (48 x 48): crowned royal-purple octopus, heavy-browed amber eyes, curling tentacles on animated splines.
   * Angry = crimson-shifted purple, crimson eyes, steeper brows, steam from both sides of the mantle and a pulsing red heat halo.
   * ============================================================================================================== */
  /* V7: royal purple (violet + 30 % magenta = #ad53e4, hue ~277 deg), kept 40+ degrees of hue away from Fizz's magenta (~320) and 15+ from Jellop's violet (261):
   * no magenta in the tentacle gradient / tips / studs any more (those pulled the sprite's mean hue to ~307 and read as pink). */
  const KRAKEN_C = mixc(RGB.violet, RGB.magenta, 0.3);
  function kraken(ctx, o, ang) {
    const ph = o.ph, w = o.w, A = 1;
    const hue = ang ? mixc(KRAKEN_C, RGB.crimson, 0.72) : KRAKEN_C;
    const gold = RGB.amber, eyeC = ang ? RGB.crimson : RGB.amber;
    const sw = (i, a, p2) => sin(ph + i * 1.3 + (p2 || 0)) * a;
    glow(ctx, 24, 22, 30, hue, 0.2);
    glow(ctx, 24, 38, 24, mixc(hue, RGB.cobalt, 0.35), 0.07, 0.7);
    if (ang) heatLoop(ctx, o.u, RGB.crimson, 24, 24, 29);

    // tentacles: outer pair curl outward into spirals, inner six sway and fan (no crossings)
    const spines = [
      [[10.5, 27.5], [5, 30 + sw(0, 1)], [1.6, 36], [2.8, 42 + sw(0, 1.2)], [7.6, 44.4], [10.8, 42], [9.2, 39.4]],
      [[13.5, 29], [9, 34 + sw(1, 1)], [7.2, 40.5], [9.6, 45.6 + sw(1, 0.6)], [14, 46.8]],
      [[17.2, 30], [14, 36 + sw(2, 1)], [13.6, 42.5], [16.4, 47.2]],
      [[21, 30.4], [19.4, 37 + sw(3, 1)], [19.6, 43], [21.6, 47.4]],
      [[27, 30.4], [28.6, 37 + sw(4, 1)], [28.4, 43], [26.4, 47.4]],
      [[30.8, 30], [34, 36 + sw(5, 1)], [34.4, 42.5], [31.6, 47.2]],
      [[34.5, 29], [39, 34 + sw(6, 1)], [40.8, 40.5], [38.4, 45.6 + sw(6, 0.6)], [34, 46.8]],
      [[37.5, 27.5], [43, 30 + sw(7, 1)], [46.4, 36], [45.2, 42 + sw(7, 1.2)], [40.4, 44.4], [37.2, 42], [38.8, 39.4]],
    ];
    for (const idx of [0, 7, 1, 6, 2, 5, 3, 4]) {
      const sp = sampleSpline(spines[idx], 8);
      const rb = taper(sp, (u) => 1.8 * Math.pow(1 - u, 0.85) + 0.26);
      fillDark(ctx, rb, 0.92);
      const g = ctx.createLinearGradient(0, 27, 0, 47);
      g.addColorStop(0, rgba(mixc(hue, RGB.void, 0.1), 0.5)); g.addColorStop(1, rgba(mixc(hue, RGB.cobalt, 0.3), 0.38));
      ctx.save(); ctx.fillStyle = g; ctx.fill(rb); ctx.restore();
      neon(ctx, rb, hue, w * 0.95, { a: A, grad: [0, 28, 0, 47], gradHot: 0.28, halo: 1.0, hot: 0.45 });
      const dots = new Path2D();
      for (let i = 7; i < sp.length - 5; i += 5) {
        const hw = 1.8 * Math.pow(1 - i / (sp.length - 1), 0.85) + 0.26;
        dots.moveTo(sp[i][0] + hw * 0.32, sp[i][1]); dots.arc(sp[i][0], sp[i][1], max(0.3, hw * 0.32), 0, TAU);
      }
      neon(ctx, dots, mixc(hue, WHITE, 0.3), w * 0.4, { a: 0.85 * A, halo: 0.2, hot: 0.3 });
      const tip = sp[sp.length - 1];
      dot(ctx, tip[0], tip[1], 0.55, mixc(hue, WHITE, 0.45), A * 0.9, { halo: 3.5 });
    }

    // mantle (hooded dome)
    const mantle = new Path2D('M 8.6 27 C 5.4 11 15 5.4 24 5.4 C 33 5.4 42.6 11 39.4 27 C 36 31.4 12 31.4 8.6 27 Z');
    body(ctx, mantle, hue, w, { a: A, y0: 5, y1: 31, tint: 1.55, hl: [17, 13, 20, 0.34] });
    neon(ctx, mantle, hue, w * 1.15, { a: A, grad: [8, 6, 40, 31], gradHot: 0.3, halo: 1.3, hot: 0.5 });
    neon(ctx, new Path2D('M 12.4 14 C 14.4 10.2 18.6 8.2 22 7.8'), WHITE, w * 0.55, { a: 0.55, halo: 0.2, hot: 0.4 });
    neon(ctx, new Path2D('M 10.6 21 C 12 12.4 19 9.8 24 9.8 C 29 9.8 36 12.4 37.4 21 M 14.2 25.4 C 15.4 18.6 20 15.2 24 15.2 C 28 15.2 32.6 18.6 33.8 25.4'), hue, w * 0.45, { a: 0.5 * A, halo: 0, hot: 0.3 });
    for (const [sx2, sy2, r] of [[13.2, 17.6, 0.5], [34.8, 17.6, 0.5], [16.4, 12.8, 0.4], [31.6, 12.8, 0.4], [11.6, 23.2, 0.45], [36.4, 23.2, 0.45], [24, 11.6, 0.5], [19.2, 11.2, 0.35], [28.8, 11.2, 0.35], [24, 16.6, 0.45], [18.4, 27.6, 0.4], [29.6, 27.6, 0.4]])
      dot(ctx, sx2, sy2, r * (1 + 0.25 * sin(ph + sx2)), mixc(RGB.cyan, hue, 0.15), 0.9 * A, { halo: 3 });

    // eyes: dark almond sockets, glowing iris, slit pupil, heavy brows (steeper when angry)
    const look = [sin(ph) * 0.25, 0.1];
    for (const s of [-1, 1]) {
      const mx = (x) => (s < 0 ? x : 48 - x);
      const al = new Path2D('M ' + mx(11.8) + ' 22.4 Q ' + mx(16.8) + ' ' + (ang ? 15.6 : 16.4) + ' ' + mx(22.4) + ' ' + (ang ? 23.2 : 22.2) + ' Q ' + mx(16.8) + ' 26.6 ' + mx(11.8) + ' 22.4 Z');
      fillDark(ctx, al, 0.97);
      glow(ctx, mx(17.2), 21.4, 6.5, eyeC, 0.28 * A);
      ctx.save(); ctx.clip(al); ctx.globalCompositeOperation = 'lighter';
      const ig = ctx.createRadialGradient(mx(17.4 + look[0]), 21.6, 0.3, mx(17.4 + look[0]), 21.6, 3.3);
      ig.addColorStop(0, rgba(hot(eyeC, 0.7), 1)); ig.addColorStop(0.55, rgba(eyeC, 0.95)); ig.addColorStop(1, rgba(eyeC, 0.25));
      ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(mx(17.4 + look[0]), 21.6, 3.3, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = 'rgba(3,2,8,0.96)';
      ctx.beginPath(); ctx.ellipse(mx(17.4 + look[0] * 1.3), 21.6, 0.7, 2.7, 0, 0, TAU); ctx.fill();
      ctx.restore();
      neon(ctx, al, hot(eyeC, 0.2), w * 0.8, { a: A, halo: 1.0, hot: 0.5 });
      const bs = ang ? 4.4 : 2.8;
      neon(ctx, new Path2D('M ' + mx(10.6) + ' ' + (17.4 - bs * 0.2) + ' L ' + mx(23.2) + ' ' + (16.6 + bs)), hot(hue, 0.25), w * 1.25, { a: A, halo: 1.0, hot: 0.55 });
      dot(ctx, mx(16.4), 20.4, 0.4, WHITE, 0.95 * A, { halo: 2.4 });
    }
    // stern mouth (a heavy frown with two small fangs), not a beak: the old triangle made the boss read as an owl
    neon(ctx, new Path2D('M 19.2 28.6 Q 24 25.6 28.8 28.6'), hot(hue, 0.5), w * 0.8, { a: A, halo: 0.7, hot: 0.5 });
    for (const fx of [21.6, 26.4]) neon(ctx, new Path2D('M ' + (fx - 0.5) + ' 27.5 L ' + fx + ' 29.3 L ' + (fx + 0.5) + ' 27.5'), WHITE, w * 0.45, { a: 0.85 * A, halo: 0.2, hot: 0.3 });
    // crown (gold, glowing, gem-tipped)
    const crown = new Path2D('M 15.6 8.4 L 16.6 1.4 L 20.5 5.2 L 24 -0.8 L 27.5 5.2 L 31.4 1.4 L 32.4 8.4 C 28 9.8 20 9.8 15.6 8.4 Z');
    fillDark(ctx, crown, 0.92);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const cg = ctx.createLinearGradient(0, -1, 0, 9); cg.addColorStop(0, rgba(hot(gold, 0.4), 0.45)); cg.addColorStop(1, rgba(gold, 0.15)); ctx.fillStyle = cg; ctx.fill(crown); ctx.restore();
    neon(ctx, crown, gold, w * 1.0, { a: A, halo: 1.4, hot: 0.6, gradHot: 0.4 });
    for (const [gx, gy, c2] of [[16.6, 1.2, RGB.cyan], [24, -1.0, RGB.crimson], [31.4, 1.2, RGB.cyan]]) dot(ctx, gx, gy, 0.8, c2, A, { halo: 4 });
    neon(ctx, new Path2D('M 17.4 6.8 C 21 8 27 8 30.6 6.8'), hot(gold, 0.5), w * 0.4, { a: 0.8 * A, halo: 0, hot: 0.2 });
    dot(ctx, 24, 6.6, 0.55, RGB.crimson, A, { halo: 4 });
    sparkle(ctx, 24, -1.0, 2.2 + sin(ph) * 0.5, hot(gold, 0.5), 0.8 * A, 0);
    if (ang) { steamLoop(ctx, 9.6, 12.5, o.u, w, hue, 2, 4.6); steamLoop(ctx, 38.4, 12.5, (o.u + 0.5) % 1, w, hue, 2, 4.6); }
  }

  const KPAD = { l: 6, r: 6, t: 6, b: 4 };
  def('kraken', 48, 48, 2, KPAD, 1, [24, 48], (ctx, o) => kraken(ctx, o, false));
  def('kraken_angry', 48, 48, 2, KPAD, 1, [24, 48], (ctx, o) => kraken(ctx, o, true));
  /* the boss inside a giant bubble (64 x 64): shell + dark disc + the Kraken at 0.8, a slow struggle */
  def('kraken_trapped', 64, 64, 1, { l: 6, r: 6, t: 6, b: 6 }, 1, (ctx, o) => {
    const k = o.k, r = 30.4, cx = 32, cy = 32;
    ctx.save(); ctx.translate(cx, cy);
    const so = { tint: RGB.cyan, stops: FILM, halo: 1.2, film: 1.1, a: 1, k, haloR: 1.2 };
    shellBody(ctx, r, 0.9, so);
    ctx.save(); ctx.fillStyle = 'rgba(4,6,14,0.45)'; ctx.beginPath(); ctx.arc(0, 0, r * 0.94, 0, TAU); ctx.fill(); ctx.restore();
    ctx.save(); ctx.rotate(-0.05); ctx.translate(-24 * 0.8, -25.5 * 0.8); ctx.scale(0.8, 0.8);
    const o2 = { ph: 0.6, u: 0.1, w: lwFor(k * 0.8), k };
    kraken(ctx, o2, false);
    ctx.restore();
    shellRim(ctx, r, 0.9, so);
    ctx.restore();
  });

  /* ================================================================================================================
   * PROJECTILES + EFFECTS  pebble (Crabbit, ember rock) | spark (Glimmer, amber electric star, released downwards) | ink (Kraken, violet
   * ink blob) | bolt (thunder segment, white-hot core) | fire_drop | flame (floor) | water_flow / water_fall (seamless stream tiles) |
   * sparkle (twinkle) | poof (appear / vanish puff)
   * ============================================================================================================== */
  const FXPAD = { l: 3, r: 3, t: 3, b: 3 };

  def('pebble', 8, 8, 2, FXPAD, 1, (ctx, o) => {
    const w = o.w, f = o.f, col = RGB.ember;
    const rad = [2.9, 2.35, 3.0, 2.6, 2.9, 2.3, 2.75], rot = f * 0.78 + 0.3, pts = [];
    rad.forEach((r, i) => { const a = rot + i * TAU / rad.length; pts.push([4 + cos(a) * r, 4 + sin(a) * r]); });
    const rock = poly(pts, true);
    glow(ctx, 4, 4, 6, col, 0.4);
    body(ctx, rock, col, w, { y0: 1, y1: 7, tint: 1.6, hl: [3, 3, 3.5, 0.5] });
    neon(ctx, rock, col, w * 1.05, { grad: [1, 1, 7, 7], halo: 1.0, hot: 0.6 });
    neon(ctx, poly([pts[0], [4 + cos(rot + 0.4) * 0.3, 4 + sin(rot + 0.4) * 0.3], pts[3]], false), hot(col, 0.5), w * 0.4, { a: 0.65, halo: 0, hot: 0.2 });
    dot(ctx, 4 + cos(rot + 2.2) * 1.2, 4 + sin(rot + 2.2) * 1.2, 0.32, hot(RGB.amber, 0.5), 0.95, { halo: 3 });
  });

  def('spark', 8, 8, 2, FXPAD, 1, (ctx, o) => {
    const w = o.w, f = o.f, col = RGB.amber, rot = f * PI / 4, pul = f ? 1 : 0.86;
    glow(ctx, 4, 4, 6.4, col, 0.55);
    // a short zigzag trail above (it falls)
    neon(ctx, poly([[4, 0.2], [3.0 + f * 1.0, 1.3], [4.8 - f * 1.0, 2.2], [4, 3.2]], false), hot(col, 0.3), w * 0.55, { a: 0.7, halo: 0.6, hot: 0.4 });
    ctx.save(); ctx.translate(4, 4); ctx.rotate(rot); ctx.translate(-4, -4);
    const star = starPath(4, 4, 3.5 * pul, 0.3);
    fillAdd(ctx, star, col, 0.5);
    neon(ctx, star, col, w * 0.8, { halo: 1.2, hot: 0.7 });
    ctx.restore();
    dot(ctx, 4, 4, 0.9, hot(col, 0.7), 1, { halo: 3.4 });
  });

  /* ink (Kraken): the only lethal projectile of the final fight. It must never look like the Kraken (purple) or Fizz (pink): a dark disc
   * underlay (so it detaches from the lit tentacle contours it spawns inside), a saturated red-orange #ff5a1f rim and a large white-hot core.
   * Two frames: the blob wobbles and its core breathes (the game alternates them every 4 frames). */
  const INK_RIM = hex('#ff5a1f');
  def('ink', 8, 8, 2, { l: 3, r: 3, t: 3, b: 3 }, 1, (ctx, o) => {
    const w = o.w, f = o.f, col = INK_RIM;
    const mkBlob = (r0, wob) => {
      const pts = [];
      for (let i = 0; i < 9; i++) { const a = i * TAU / 9, r = r0 + wob * (0.45 * sin(a * 3 + f * PI) + 0.2 * sin(a * 2 + 1 + f * 2)); pts.push([4 + cos(a) * r, 4 + sin(a) * r]); }
      return spline(pts, true, 0.5);
    };
    const blob = mkBlob(2.55, 1);
    glow(ctx, 4, 4, 5.6, col, 0.5);
    // dark underlay: a disc just larger than the rim, so the bullet keeps a black outline wherever it overlaps lit art
    ctx.save(); ctx.fillStyle = 'rgba(3,2,6,0.93)'; ctx.beginPath(); ctx.arc(4, 4, 3.55, 0, TAU); ctx.fill(); ctx.restore();
    fillAdd(ctx, blob, col, 0.62);
    neon(ctx, blob, col, w * 1.25, { halo: 1.0, hot: 0.22 });
    // white-hot core (breathes between the frames)
    const cr = f ? 1.35 : 1.15;
    glow(ctx, 4, 4, 3.2, hot(col, 0.7), 0.6);
    fillAdd(ctx, circlePath(4, 4, cr), hot(col, 0.9), 0.98);
    dot(ctx, 4 + (f ? 0.15 : -0.1), 4, cr * 0.62, WHITE, 1, { halo: 2.2 });
    // two tiny ember flecks orbiting the blob (they swap sides between the frames)
    for (let i = 0; i < 2; i++) { const a = f * 1.2 + i * PI + 0.6; dot(ctx, 4 + cos(a) * 3.0, 4 + sin(a) * 3.0, 0.26, hot(col, 0.45), 0.95, { halo: 2.4 }); }
  });

  def('bolt', 16, 8, 2, { l: 4, r: 4, t: 3, b: 3 }, 1, (ctx, o) => {
    const w = o.w, f = o.f, col = RGB.amber;
    const ys = f ? [4, 2.4, 5.8, 2.9, 5.3, 2.6, 4.6, 4] : [4, 5.7, 2.3, 5.2, 2.7, 5.5, 3.2, 4];
    const xs = [0, 2.4, 4.6, 7, 9.4, 11.8, 14, 16];
    const pts = xs.map((x, i) => [x, ys[i]]);
    const bolt = poly(pts, false);
    glow(ctx, 8, 4, 9, col, 0.4, 0.5);
    neon(ctx, bolt, col, w * 1.3, { halo: 1.6, hot: 0.95, cap: 'butt' });
    neon(ctx, bolt, WHITE, w * 0.5, { halo: 0, hot: 1, cap: 'butt', a: 0.9 });
    // a short side branch (alternates)
    const bx = f ? 7 : 4.6, by = f ? 2.9 : 2.3;
    neon(ctx, poly([[bx, by], [bx + 1.3, by - 1.3], [bx + 2.1, by - 0.5]], false), hot(col, 0.3), w * 0.6, { a: 0.75, halo: 0.6, hot: 0.5 });
    dot(ctx, f ? 11.8 : 9.4, f ? 2.6 : 2.7, 0.28, WHITE, 0.8, { halo: 3 });
  });

  def('fire_drop', 8, 8, 2, FXPAD, 1, (ctx, o) => {
    const w = o.w, f = o.f, col = RGB.ember;
    const fl = f ? 0.4 : -0.3;
    const drop = new Path2D('M 4 ' + (0.3 + fl * 0.4) + ' C 4.5 2 6.9 3.0 6.8 5.0 C 6.7 6.5 5.5 7.4 4 7.4 C 2.5 7.4 1.3 6.5 1.2 5.0 C 1.1 3.0 3.5 2 4 ' + (0.3 + fl * 0.4) + ' Z');
    glow(ctx, 4, 4.8, 6, col, 0.55);
    fillDark(ctx, drop, 0.6);
    fillAdd(ctx, drop, col, 0.4);
    neon(ctx, drop, col, w * 0.95, { halo: 1.3, hot: 0.6 });
    const inner = new Path2D('M 4 ' + (2.4 + fl * 0.3) + ' C 4.4 3.6 5.4 4.2 5.3 5.4 C 5.2 6.2 4.7 6.6 4 6.6 C 3.3 6.6 2.8 6.2 2.7 5.4 C 2.6 4.2 3.6 3.6 4 ' + (2.4 + fl * 0.3) + ' Z');
    fillAdd(ctx, inner, hot(RGB.amber, 0.6), 0.95);
  });

  def('flame', 8, 16, 3, { l: 4, r: 4, t: 4, b: 4 }, 1, (ctx, o) => {
    const w = o.w, f = o.f, ph = o.ph, col = RGB.ember;
    glow(ctx, 4, 13, 6.4, col, 0.5, 0.9);
    glow(ctx, 4, 9, 6.6, col, 0.2, 1.3);
    const sway = (i) => sin(ph + i * 2.1) * 0.7;
    const H = [11.4 + (f === 1 ? 1.4 : f === 2 ? -1.0 : 0), 7.6 + (f === 0 ? 1.2 : f === 1 ? -1.0 : 0.5), 5.6 + (f === 2 ? 1.4 : -0.4)];
    // three rounded tongues: a tall middle flame and two short side ones (soft tips, a bulb at the base)
    const tongue = (cx, hw, h, sw2) => {
      const tx = cx + sw2, ty = 15.6 - h;
      return new Path2D('M ' + (cx - hw) + ' 15.6 C ' + (cx - hw * 1.25) + ' ' + (15.6 - h * 0.35) + ' ' + (cx - hw * 0.55 + sw2 * 0.4) + ' ' + (15.6 - h * 0.62) + ' ' + (tx - hw * 0.12) + ' ' + (ty + h * 0.07) + ' Q ' + tx + ' ' + (ty - h * 0.03) + ' ' + (tx + hw * 0.14) + ' ' + (ty + h * 0.08) + ' C ' + (cx + hw * 0.6 + sw2 * 0.4) + ' ' + (15.6 - h * 0.6) + ' ' + (cx + hw * 1.25) + ' ' + (15.6 - h * 0.35) + ' ' + (cx + hw) + ' 15.6 Z');
    };
    const T = [tongue(2.0, 1.5, H[1], sway(1)), tongue(6.0, 1.5, H[2], sway(2)), tongue(4, 2.3, H[0], sway(0))];
    for (const t of T) { fillDark(ctx, t, 0.6); fillAdd(ctx, t, col, 0.36); neon(ctx, t, col, w * 0.9, { halo: 1.2, hot: 0.55 }); }
    const core = tongue(4, 1.2, H[0] * 0.6, sway(0) * 0.6);
    fillAdd(ctx, core, hot(RGB.amber, 0.65), 0.95);
    dot(ctx, 4 + sway(0) * 0.3, 15.0 - H[0] * 0.22, 0.42, WHITE, 0.9, { halo: 3 });
    if (f === 1) dot(ctx, 5.4, 15.6 - H[0] - 0.6, 0.28, hot(RGB.amber, 0.5), 0.8, { halo: 3 });      // a rising ember
  });

  /* water stream tiles: translucent water, a lit surface line; periods are exactly the tile size so tiles join seamlessly (butt caps) */
  def('water_flow', 8, 8, 2, { l: 0, r: 0, t: 2, b: 1 }, 1, (ctx, o) => {
    const w = o.w, f = o.f, col = RGB.cobalt;
    const yS = (x) => 3.3 + 0.85 * sin(x * TAU / 8 + f * PI + 0.6);
    const top = [];
    for (let i = 0; i <= 16; i++) top.push([i * 0.5, yS(i * 0.5)]);
    const surf = poly(top, false);
    const fill = poly(top.concat([[8, 8], [0, 8]]), true);
    ctx.save();
    const g = ctx.createLinearGradient(0, 3, 0, 8);
    g.addColorStop(0, rgba(RGB.cyan, 0.34)); g.addColorStop(1, rgba(col, 0.18));
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fill(fill);
    ctx.restore();
    neon(ctx, surf, hot(RGB.cyan, 0.2), w * 0.95, { halo: 1.2, hot: 0.7, cap: 'butt' });
    // streaks + bubbles drifting inside the water (periodic in x)
    const st = new Path2D();
    for (const [x0, y0, l] of [[0.6, 5.2, 2.2], [4.4, 6.4, 2.6]]) { const xs = (x0 + f * 4) % 8; st.moveTo(xs, y0); st.lineTo(min(8, xs + l), y0); }
    neon(ctx, st, hot(col, 0.5), w * 0.4, { a: 0.5, halo: 0, hot: 0.2, cap: 'butt' });
    dot(ctx, (2.2 + f * 4) % 8, 5.0 + f * 0.5, 0.28, hot(RGB.cyan, 0.5), 0.8, { halo: 2.6 });
  });
  def('water_fall', 8, 8, 2, { l: 2, r: 2, t: 0, b: 0 }, 1, (ctx, o) => {
    const w = o.w, f = o.f, col = RGB.cobalt;
    const xl = (y) => 1.7 + 0.35 * sin(y * TAU / 8 + f * PI), xr = (y) => 6.3 + 0.35 * sin(y * TAU / 8 + 1.5 + f * PI);
    const L = [], R = [];
    for (let i = 0; i <= 16; i++) { L.push([xl(i * 0.5), i * 0.5]); R.push([xr(i * 0.5), i * 0.5]); }
    const fill = poly(L.concat(R.slice().reverse()), true);
    ctx.save();
    const g = ctx.createLinearGradient(1, 0, 7, 0);
    g.addColorStop(0, rgba(RGB.cyan, 0.3)); g.addColorStop(0.5, rgba(col, 0.2)); g.addColorStop(1, rgba(RGB.cyan, 0.3));
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fill(fill);
    ctx.restore();
    neon(ctx, poly(L, false), hot(RGB.cyan, 0.2), w * 0.9, { halo: 1.1, hot: 0.7, cap: 'butt' });
    neon(ctx, poly(R, false), hot(RGB.cyan, 0.2), w * 0.9, { halo: 1.1, hot: 0.7, cap: 'butt' });
    const st = new Path2D();
    for (const [x0, y0, l] of [[3.0, 0.6, 2.4], [4.9, 4.4, 2.6]]) { const ys = (y0 + f * 4) % 8; st.moveTo(x0, ys); st.lineTo(x0, min(8, ys + l)); }
    neon(ctx, st, hot(col, 0.55), w * 0.45, { a: 0.6, halo: 0, hot: 0.2, cap: 'butt' });
    dot(ctx, 4, (5.5 + f * 4) % 8, 0.28, hot(RGB.cyan, 0.5), 0.8, { halo: 2.6 });
  });

  def('sparkle', 8, 8, 4, { l: 4, r: 4, t: 4, b: 4 }, 1, (ctx, o) => {
    const f = o.f, s = [0.5, 1.0, 0.78, 0.42][f], rot = f * PI / 8;
    sparkle(ctx, 4, 4, 3.3 * s, hot(RGB.cyan, 0.45), 1, rot);
    if (f === 1 || f === 2) {                       // tiny satellites at the full twinkle
      dot(ctx, 1.6, 6.6, 0.22, WHITE, 0.8, { halo: 3 }); dot(ctx, 6.8, 1.4, 0.2, hot(RGB.amber, 0.4), 0.8, { halo: 3 });
    }
  });

  def('poof', 16, 16, 3, { l: 4, r: 4, t: 4, b: 4 }, 1, (ctx, o) => {
    const f = o.f, w = o.w, u = (f + 0.5) / 3, k = 1 - u * 0.75, col = hot(RGB.cyan, 0.45), R = rng(5);
    glow(ctx, 8, 8, 7.5 + u * 2.5, col, 0.4 * (1 - u * 0.6));
    if (f === 0) glow(ctx, 8, 8, 5, WHITE, 0.6);
    const n = 6;
    for (let i = 0; i < n; i++) {                   // soft puffs: a light blob with a faint rim, drifting outwards
      const a = i * TAU / n + 0.4 + R.float(-0.25, 0.25), d = 1.8 + u * 4.8 * R.float(0.85, 1.15), r = 2.0 + u * 1.5 + R.float(0, 0.6);
      const px = 8 + cos(a) * d, py = 8 + sin(a) * d * 0.9;
      glow(ctx, px, py, r * 1.7, col, 0.5 * k);
      const c = circlePath(px, py, r);
      fillDark(ctx, c, 0.16 * k);
      neon(ctx, c, col, w * 0.55, { a: 0.6 * k, halo: 0.5, hot: 0.3 });
    }
    for (let i = 0; i < 6; i++) { const a = R.float(0, TAU), d = 3 + u * R.float(3, 5); dot(ctx, 8 + cos(a) * d, 8 + sin(a) * d, 0.32, WHITE, 0.85 * k, { halo: 3 }); }
  });

  /* ================================================================================================================
   * FOOD (8) and POWER-UPS (8) and the MOON PEARL. Items are luminous contours with dark translucent bodies and a pickup glint.
   * Power-ups share ONE family cue (a thin cyan orbit ring with four ticks) and differ by silhouette first, hue second.
   * ============================================================================================================== */
  const IPAD = { l: 4, r: 4, t: 4, b: 4 };
  const IS = 1.06;                       // item art scale about the bottom centre: contour <= 1.2 x the box

  const berry = (ctx, x, y, r, col, w, hl) => {
    const c = circlePath(x, y, r);
    body(ctx, c, col, w, { y0: y - r, y1: y + r, tint: 1.7, hl: [x - r * 0.35, y - r * 0.4, r * 1.4, 0.55] });
    neon(ctx, c, col, w * 0.85, { halo: 0.9, hot: 0.6 });
    dot(ctx, x - r * 0.38, y - r * 0.42, 0.2, WHITE, hl === undefined ? 0.85 : hl, { halo: 2 });
  };
  const glint = (ctx, x, y, r, col, a) => sparkle(ctx, x, y, r, col, a === undefined ? 0.95 : a, 0);

  /* food_0 SEA GRAPES: a bunch of ten glowing berries (violet -> magenta) on a lime stem with a leaf */
  def('food_0', 16, 16, 1, IPAD, IS, [8, 16], (ctx, o) => {
    const w = o.w, base = mixc(RGB.violet, RGB.magenta, 0.3);
    glow(ctx, 8, 9.5, 9, base, 0.25);
    const rows = [[5.6, [-4.05, -1.35, 1.35, 4.05]], [8.3, [-2.7, 0, 2.7]], [11.0, [-1.35, 1.35]], [13.7, [0]]];
    let i = 0;
    for (const [y, xs] of rows) for (const dx of xs) { berry(ctx, 8 + dx, y, 1.5, mixc(base, RGB.cyan, ((i * 37) % 10) / 40), w); i++; }
    const lime = RGB.lime;
    neon(ctx, new Path2D('M 8.6 4.4 C 8.8 3 9.4 2.2 10.2 1.5'), mixc(lime, RGB.cyan, 0.2), w * 0.9, { halo: 0.7, hot: 0.4 });
    const leaf = new Path2D('M 9.9 2.3 C 10.6 0.2 13.2 0.2 14.2 1.6 C 13.4 3.4 11.2 3.8 9.9 2.3 Z');
    body(ctx, leaf, lime, w, { y0: 0, y1: 4, tint: 1.3 });
    neon(ctx, leaf, lime, w * 0.85, { halo: 0.8, hot: 0.5 });
    neon(ctx, new Path2D('M 10.3 2.6 Q 12 1.9 13.6 1.7'), hot(lime, 0.5), w * 0.35, { a: 0.7, halo: 0, hot: 0.2 });
    glint(ctx, 3.0, 4.6, 1.6, WHITE, 0.8);
  });

  /* food_1 KELP ROLL: a maki slice: a kelp wrap, white-hot rice, a spiral of kelp inside, an ember filling */
  def('food_1', 16, 16, 1, IPAD, IS, [8, 16], (ctx, o) => {
    const w = o.w, kelp = mixc(RGB.lime, RGB.cobalt, 0.3), rice = mixc(WHITE, RGB.cyan, 0.15);
    glow(ctx, 8, 9.5, 9.5, kelp, 0.26);
    const cx = 8, cy = 9.4;
    const wrap = circlePath(cx, cy, 6.1);
    body(ctx, wrap, kelp, w, { y0: 3, y1: 15.5, tint: 1.6, hl: [6, 6.6, 6, 0.4] });
    neon(ctx, wrap, kelp, w * 1.15, { grad: [3, 3, 13, 15], halo: 1.1, hot: 0.55 });
    const inner = circlePath(cx, cy, 4.5);
    fillAdd(ctx, inner, rice, 0.22);
    neon(ctx, inner, hot(rice, 0.3), w * 0.55, { a: 0.8, halo: 0.4, hot: 0.4 });
    const sp = [];
    for (let i = 0; i <= 30; i++) { const a = 3.6 + i * 0.3, r = 3.7 * (1 - i / 36); sp.push([cx + cos(a) * r, cy + sin(a) * r]); }
    neon(ctx, poly(sp, false), kelp, w * 0.7, { a: 0.9, halo: 0.5, hot: 0.4 });
    dot(ctx, cx + 0.05, cy + 0.05, 0.85, RGB.ember, 1, { halo: 3 });
    for (const [gx, gy] of [[5.2, 6.6], [10.9, 7.2], [11.3, 11.6], [5.0, 12.0]]) dot(ctx, gx, gy, 0.2, WHITE, 0.6, { halo: 2 });
    // a kelp ribbon curls off the top right
    neon(ctx, new Path2D('M 11.8 4.6 C 13.4 3.2 12.2 1.6 13.8 0.6 C 14.8 0.2 15.2 1.1 14.7 1.8'), kelp, w * 0.8, { halo: 0.8, hot: 0.4 });
    glint(ctx, 2.4, 3.8, 1.5, WHITE, 0.8);
  });

  /* food_2 CLAM: an open pearly clam with a glowing pearl */
  def('food_2', 16, 16, 1, IPAD, IS, [8, 16], (ctx, o) => {
    const w = o.w, sh = mixc(RGB.cyan, RGB.violet, 0.5);
    glow(ctx, 8, 10, 9.5, sh, 0.25);
    // lower shell: a wide bowl with radial ribs
    const lower = new Path2D('M 1.4 11.4 C 1.6 15.2 4.6 16.2 8 16.2 C 11.4 16.2 14.6 15.2 14.6 11.4 Q 8 13.2 1.4 11.4 Z');
    body(ctx, lower, sh, w, { y0: 11, y1: 16.4, tint: 1.6, hl: [5, 13.6, 5, 0.4] });
    neon(ctx, lower, sh, w * 1.05, { grad: [2, 11, 14, 16], halo: 1.0, hot: 0.5 });
    const ribsL = new Path2D(); for (let i = 0; i < 5; i++) { const x = 3.4 + i * 2.3; ribsL.moveTo(8 + (x - 8) * 0.25, 12.8); ribsL.lineTo(x, 15.4 - Math.abs(x - 8) * 0.12); }
    neon(ctx, ribsL, sh, w * 0.4, { a: 0.6, halo: 0, hot: 0.2 });
    // upper shell: lifted open, a fan with ribs
    const upper = new Path2D('M 2.0 8.4 C 0.8 3.2 5 0.4 8 0.4 C 11 0.4 15.2 3.2 14.0 8.4 Q 8 6.6 2.0 8.4 Z');
    body(ctx, upper, sh, w, { y0: 0.4, y1: 8.6, tint: 1.5, hl: [6, 3, 5, 0.45] });
    neon(ctx, upper, sh, w * 1.1, { grad: [2, 1, 14, 9], halo: 1.1, hot: 0.55 });
    const ribsU = new Path2D(); for (let i = 0; i < 5; i++) { const a = PI * (1.12 + i * 0.19); ribsU.moveTo(8 + cos(a) * 1.2, 7.4 + sin(a) * 0.8); ribsU.lineTo(8 + cos(a) * 6.0, 7.2 + sin(a) * 6.4); }
    neon(ctx, ribsU, sh, w * 0.4, { a: 0.6, halo: 0, hot: 0.2 });
    // soft light spilling from the gap
    glow(ctx, 8, 9.8, 5, WHITE, 0.16, 0.5);
    // the pearl
    const pc = circlePath(8, 10.0, 2.05);
    glow(ctx, 8, 10, 4.4, WHITE, 0.55);
    fillDark(ctx, pc, 0.5); fillAdd(ctx, pc, mixc(WHITE, RGB.magenta, 0.12), 0.85);
    neon(ctx, pc, WHITE, w * 0.7, { halo: 1.1, hot: 0.9 });
    dot(ctx, 7.2, 9.1, 0.38, WHITE, 1, { halo: 3 });
    glint(ctx, 13.4, 2.4, 1.9, WHITE, 0.95);
  });

  /* food_3 SHRIMP TEMPURA: an arched shrimp in lumpy golden batter, feelers and a fanned tail */
  def('food_3', 16, 16, 1, IPAD, IS, [8, 16], (ctx, o) => {
    const w = o.w, gold = RGB.amber, tailC = mixc(RGB.ember, RGB.magenta, 0.25);
    glow(ctx, 8, 9, 9.5, gold, 0.27);
    const spine = sampleSpline([[2.6, 11.0], [3.8, 6.8], [7.4, 4.0], [11.4, 5.0], [13.0, 8.6]], 8);
    // tail fan (behind the batter): four fins
    const tail = new Path2D();
    for (const [dx, dy] of [[1.7, 3.4], [0.6, 3.9], [-0.6, 3.8], [-1.6, 3.2]]) { tail.moveTo(13.0, 9.0); tail.quadraticCurveTo(13.0 + dx * 0.3, 9.0 + dy * 0.7, 13.0 + dx, 9.6 + dy); }
    neon(ctx, tail, tailC, w * 0.8, { halo: 0.9, hot: 0.5 });
    fillAdd(ctx, poly([[13.0, 9.0], [14.7, 13.0], [13.6, 13.5], [12.4, 13.4], [11.4, 12.8]], true), tailC, 0.14);
    const batter = taper(spine, (u) => (1.1 + 1.75 * sin(PI * min(1, 0.06 + u * 0.9))) * (1 + 0.09 * sin(u * 23) + 0.06 * sin(u * 39 + 1)));
    body(ctx, batter, gold, w, { y0: 3, y1: 13, tint: 2.0, hl: [6.6, 5.0, 5, 0.55] });
    neon(ctx, batter, gold, w * 1.1, { grad: [3, 2, 13, 12], halo: 1.1, hot: 0.6 });
    // shrimp segments (transverse ridges) across the body
    const seg = new Path2D();
    for (let i = 8; i < spine.length - 6; i += 4) { const q = spine[i], n = spine[i + 1], dx = n[0] - q[0], dy = n[1] - q[1], L = Math.hypot(dx, dy) || 1, hw = 1.45; seg.moveTo(q[0] - dy / L * hw, q[1] + dx / L * hw); seg.lineTo(q[0] + dy / L * hw, q[1] - dx / L * hw); }
    neon(ctx, seg, hot(gold, 0.45), w * 0.4, { a: 0.7, halo: 0, hot: 0.2 });
    // head: eye and feelers at the lower left
    dot(ctx, 3.3, 10.0, 0.4, WHITE, 1, { halo: 3 });
    neon(ctx, new Path2D('M 1.9 11.8 Q 0.8 13.4 0.5 15.0 M 3.4 12.6 Q 3.0 14.0 2.2 15.2'), hot(gold, 0.3), w * 0.45, { a: 0.8, halo: 0.4, hot: 0.3 });
    for (const [cx2, cy2] of [[1.4, 5.6], [12.6, 13.8], [6.0, 14.2], [8.6, 7.2]]) dot(ctx, cx2, cy2, 0.22, hot(gold, 0.5), 0.8, { halo: 2.6 });
    glint(ctx, 12.6, 2.2, 1.7, WHITE, 0.9);
  });

  /* food_4 SUSHI (nigiri): the approved mockup piece; fish over a rice block, a nori belt, three glints */
  def('food_4', 16, 16, 1, IPAD, IS, [8, 16], (ctx, o) => {
    const w = o.w, fish = mixc(RGB.ember, RGB.magenta, 0.3), rice = mixc(WHITE, RGB.cyan, 0.12), nori = mixc(RGB.lime, RGB.cobalt, 0.25);
    ctx.translate(0, -0.4);
    glow(ctx, 8, 10, 10, fish, 0.22);
    const rp = new Path2D('M 2.5 11.3 C 2.1 9.9 3.3 9.2 5 9.2 L 11 9.2 C 12.7 9.2 13.9 9.9 13.5 11.3 C 13.5 13.4 12.9 15.4 11.3 15.5 L 4.7 15.5 C 3.1 15.4 2.5 13.4 2.5 11.3 Z');
    body(ctx, rp, rice, w, { y0: 8, y1: 15.6, tint: 0.55 });
    neon(ctx, rp, rice, w * 0.95, { grad: [3, 8, 13, 15.5], halo: 0.7, hot: 0.5 });
    for (const [gx, gy] of [[3.9, 11.4], [4.6, 13.6], [12.1, 11.6], [11.4, 13.8], [4.1, 9.6]]) dot(ctx, gx, gy, 0.18, WHITE, 0.5, { halo: 2 });
    const fp = new Path2D('M 0.6 10.0 C 0.2 7.6 3.8 6.1 8 6.2 C 12.2 6.1 15.8 7.6 15.4 10.0 C 15.2 11.6 13.6 11.9 12.4 11.4 L 3.6 11.4 C 2.4 11.9 0.8 11.6 0.6 10.0 Z');
    body(ctx, fp, fish, w, { y0: 6, y1: 11.6, tint: 1.8 });
    neon(ctx, fp, fish, w * 1.05, { grad: [2, 6, 14, 11.5], halo: 1.1, hot: 0.6 });
    neon(ctx, new Path2D('M 2.2 9.4 Q 4.6 7.4 6.4 8.2 M 9.8 7.4 Q 12 7.0 13.8 8.8 M 3.4 10.6 Q 7 9.4 10.6 10.4'), hot(fish, 0.7), w * 0.5, { a: 0.9, halo: 0.2, hot: 0.4 });
    const nb = new Path2D('M 6.9 6.0 L 9.1 6.0 L 9.3 14.9 L 6.7 14.9 Z');
    fillDark(ctx, nb, 0.62);
    neon(ctx, nb, nori, w * 0.55, { a: 0.75, halo: 0.3, hot: 0.2 });
    glint(ctx, 1.6, 3.0, 1.7, hot(RGB.amber, 0.3), 0.9); glint(ctx, 14.4, 2.2, 1.5, WHITE, 0.9); glint(ctx, 13.8, 13.6, 1.1, RGB.cyan, 0.8);
  });

  /* food_5 PUDDING: a flan on a plate, caramel cap with drips, a cherry on top */
  def('food_5', 16, 16, 1, IPAD, IS, [8, 16], (ctx, o) => {
    const w = o.w, cream = mixc(RGB.amber, WHITE, 0.4), car = mixc(RGB.ember, RGB.amber, 0.45), cherry = mixc(RGB.magenta, RGB.ember, 0.2);
    glow(ctx, 8, 10.5, 9.5, RGB.amber, 0.24);
    neon(ctx, ellipsePath(8, 14.7, 6.9, 1.25), mixc(RGB.cyan, RGB.cobalt, 0.3), w * 0.6, { a: 0.7, halo: 0.6, hot: 0.4 });          // plate
    const flan = new Path2D('M 3.7 14.0 C 3.3 11.6 4.4 8.9 5.0 7.4 L 11.0 7.4 C 11.6 8.9 12.7 11.6 12.3 14.0 C 10.6 14.9 5.4 14.9 3.7 14.0 Z');
    body(ctx, flan, cream, w, { y0: 7, y1: 15, tint: 1.5, hl: [6.4, 10.4, 5, 0.45] });
    neon(ctx, flan, cream, w * 1.05, { grad: [4, 7, 12, 14.5], halo: 1.0, hot: 0.55 });
    // caramel cap with drips
    const cap = new Path2D('M 4.8 7.9 C 4.6 6.2 6 5.6 8 5.6 C 10 5.6 11.4 6.2 11.2 7.9 C 11.6 9.0 11.0 10.4 10.4 10.0 C 10.0 9.0 9.7 8.8 9.4 9.6 C 9.2 10.8 8.4 11.0 8.2 9.9 C 8.0 9.0 7.4 8.8 7.1 9.7 C 6.8 10.6 6.0 10.6 5.8 9.6 C 5.5 8.8 4.9 9.2 4.8 7.9 Z');
    body(ctx, cap, car, w, { y0: 5.6, y1: 11, tint: 2.2, hl: [7, 6.6, 3.2, 0.6] });
    neon(ctx, cap, car, w * 0.95, { grad: [4, 5.6, 12, 10.5], halo: 1.0, hot: 0.6 });
    // cherry
    neon(ctx, new Path2D('M 8 4.6 C 8.3 3.4 9.2 2.4 10.4 1.8'), RGB.lime, w * 0.6, { halo: 0.5, hot: 0.4 });
    berry(ctx, 8, 4.4, 1.35, cherry, w, 0.95);
    glint(ctx, 13.4, 5.0, 1.5, WHITE, 0.9); glint(ctx, 2.6, 8.6, 1.1, hot(RGB.amber, 0.4), 0.8);
  });

  /* food_6 SUNDAE: a glass cup, three scoops, a cherry and a wafer */
  def('food_6', 16, 16, 1, IPAD, IS, [8, 16], (ctx, o) => {
    const w = o.w, glass = mixc(RGB.cyan, RGB.cobalt, 0.4);
    glow(ctx, 8, 9.5, 9.5, RGB.magenta, 0.24);
    // wafer first (behind the scoops)
    const wf = poly([[9.6, 6.0], [12.6, 1.0], [14.0, 2.0], [11.0, 7.0]], true);
    body(ctx, wf, RGB.amber, w, { y0: 1, y1: 7, tint: 1.8 }); neon(ctx, wf, RGB.amber, w * 0.8, { halo: 0.8, hot: 0.5 });
    neon(ctx, new Path2D('M 10.4 4.8 L 12.4 6.0 M 11.2 3.4 L 13.0 4.5'), hot(RGB.amber, 0.5), w * 0.3, { a: 0.7, halo: 0, hot: 0.2 });
    // scoops
    const scoops = [[5.4, 7.3, 2.1, RGB.magenta], [10.5, 7.8, 2.0, mixc(WHITE, RGB.amber, 0.25)], [8, 5.6, 2.2, mixc(RGB.cyan, RGB.violet, 0.4)]];
    for (const [x, y, r, c] of scoops) berry(ctx, x, y, r, c, w, 0.9);
    berry(ctx, 8, 3.2, 1.0, mixc(RGB.magenta, WHITE, 0.2), w, 0.9);                           // cherry
    // the glass: bowl + stem + foot
    const bowl = new Path2D('M 3.2 8.6 L 12.8 8.6 C 12.6 12.0 10.6 13.4 8.7 13.5 L 7.3 13.5 C 5.4 13.4 3.4 12.0 3.2 8.6 Z');
    body(ctx, bowl, glass, w, { y0: 8.5, y1: 13.6, tint: 1.0, hl: [5.4, 10.2, 3.6, 0.5] });
    neon(ctx, bowl, glass, w * 1.0, { grad: [3, 8, 13, 14], halo: 1.0, hot: 0.6 });
    neon(ctx, new Path2D('M 5.0 9.6 Q 5.3 11.6 6.4 12.4'), WHITE, w * 0.45, { a: 0.7, halo: 0, hot: 0.3 });
    neon(ctx, new Path2D('M 8 13.5 L 8 14.9 M 5.2 15.3 Q 8 14.5 10.8 15.3'), glass, w * 0.85, { halo: 0.7, hot: 0.5 });
    glint(ctx, 14.4, 11.0, 1.4, WHITE, 0.9);
  });

  /* food_7 GOLDEN CROWN: the best treasure: a bright gold crown with gems and pearls, extra glow and glints */
  def('food_7', 16, 16, 1, { l: 5, r: 5, t: 5, b: 4 }, IS, [8, 16], (ctx, o) => {
    const w = o.w, gold = mixc(RGB.amber, RGB.ember, 0.1);
    glow(ctx, 8, 9, 10, gold, 0.4);
    const crown = new Path2D('M 2.0 13.2 L 1.5 5.0 L 5.0 8.6 L 8 3.0 L 11.0 8.6 L 14.5 5.0 L 14.0 13.2 Q 8 14.6 2.0 13.2 Z');
    body(ctx, crown, gold, w, { y0: 3, y1: 14, tint: 2.0, hl: [6, 7, 6, 0.55] });
    neon(ctx, crown, gold, w * 1.15, { grad: [2, 3, 14, 14], gradHot: 0.6, halo: 1.4, hot: 0.75 });
    neon(ctx, new Path2D('M 2.2 11.1 Q 8 12.5 13.8 11.1'), hot(gold, 0.5), w * 0.6, { a: 0.9, halo: 0.3, hot: 0.4 });
    for (const [x, y, c] of [[8, 12.2, RGB.cyan], [4.8, 11.9, RGB.magenta], [11.2, 11.9, mixc(RGB.lime, RGB.cyan, 0.3)]]) dot(ctx, x, y, 0.75, c, 1, { halo: 4 });
    for (const [x, y] of [[1.5, 4.8], [8, 2.6], [14.5, 4.8]]) dot(ctx, x, y, 0.62, WHITE, 1, { halo: 4 });
    glint(ctx, 5.4, 5.4, 2.0, WHITE, 0.95); glint(ctx, 12.2, 6.0, 1.5, hot(gold, 0.5), 0.9); glint(ctx, 8, 0.4, 1.7, WHITE, 0.85);
  });

  /* ---------------------------------------------------------------- power-ups: orbit ring + icon */
  function puRing(ctx, w, col) {
    neon(ctx, circlePath(8, 8, 7.2), RGB.cyan, w * 0.55, { a: 0.8, halo: 0.6, hot: 0.4 });
    const ticks = new Path2D();
    for (let i = 0; i < 4; i++) { const a = 0.45 + i * TAU / 4; ticks.moveTo(8 + cos(a) * 6.3, 8 + sin(a) * 6.3); ticks.lineTo(8 + cos(a) * 8.1, 8 + sin(a) * 8.1); }
    neon(ctx, ticks, WHITE, w * 0.7, { a: 0.9, halo: 0.8, hot: 0.4 });
    glow(ctx, 8, 8, 11, col, 0.3);
  }
  const PEARL_C = { pink: RGB.magenta, blue: mixc(RGB.cobalt, RGB.cyan, 0.15), gold: RGB.amber };
  function pearl(ctx, w, col, x, y, r) {
    const c = circlePath(x, y, r);
    glow(ctx, x, y, r * 2.4, col, 0.35);
    body(ctx, c, col, w, { y0: y - r, y1: y + r, tint: 2.2, hl: [x - r * 0.35, y - r * 0.4, r * 1.5, 0.7], core: [x, y + r * 0.1, r * 1.1, 0.4] });
    neon(ctx, c, col, w * 1.1, { grad: [x - r, y - r, x + r, y + r], halo: 1.2, hot: 0.65 });
    neon(ctx, new Path2D('M ' + (x - r * 0.62) + ' ' + (y - r * 0.18) + ' A ' + (r * 0.7) + ' ' + (r * 0.7) + ' 0 0 1 ' + (x - r * 0.12) + ' ' + (y - r * 0.68)), WHITE, w * 0.55, { a: 0.95, halo: 0.2, hot: 0.4 });
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r * 0.96, 0, TAU); ctx.clip(); ctx.globalCompositeOperation = 'lighter';
    if (ctx.createConicGradient) {
      const cg = ctx.createConicGradient(2.4, x, y);
      [RGB.cyan, RGB.violet, RGB.magenta, RGB.amber, RGB.cyan].forEach((c2, i) => cg.addColorStop(i / 4, rgba(hot(c2, 0.2), 0.22)));
      ctx.lineWidth = r * 0.5; ctx.strokeStyle = cg; ctx.beginPath(); ctx.arc(x, y, r * 0.78, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  def('pu_shoes', 16, 16, 1, IPAD, 1.0, [8, 8], (ctx, o) => {
    const w = o.w, col = mixc(RGB.lime, RGB.cyan, 0.4);
    puRing(ctx, w, col);
    // a pair of webbed flippers fanning out: narrow cuff at the top, a wide ribbed blade at the bottom
    const flipper = (cx, cy, rot) => {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
      const p = new Path2D('M -0.8 -4.6 L 0.8 -4.6 C 1.0 -2.0 2.3 0.2 2.5 2.6 C 2.5 4.0 1.4 4.8 0 4.8 C -1.4 4.8 -2.5 4.0 -2.5 2.6 C -2.3 0.2 -1.0 -2.0 -0.8 -4.6 Z');
      body(ctx, p, col, w, { y0: -4.6, y1: 5, tint: 2.0, hl: [-0.6, -0.4, 4, 0.45] });
      neon(ctx, p, col, w * 1.0, { grad: [-3, -4, 3, 5], halo: 1.0, hot: 0.55 });
      neon(ctx, new Path2D('M 0 -1.6 L -1.6 3.8 M 0 -1.6 L 0 4.4 M 0 -1.6 L 1.6 3.8'), hot(col, 0.45), w * 0.4, { a: 0.75, halo: 0, hot: 0.2 });
      neon(ctx, new Path2D('M -0.8 -3.4 L 0.8 -3.4'), WHITE, w * 0.5, { a: 0.8, halo: 0, hot: 0.3 });
      ctx.restore();
    };
    flipper(4.4, 8.3, 0.12); flipper(11.6, 8.3, -0.12);
    glint(ctx, 13.0, 2.8, 1.3, WHITE, 0.85);
  });
  /* V8: the three pearls (pink / blue / gold) carry a white-hot GLYPH on a lit glass pearl, so they differ by SHAPE as well as hue (colour-blind safe):
   *   pu_pink = RANGE: four arrows pointing outward from the centre | pu_blue = RATE: a double chevron >> | pu_gold = SPEED: a comet with motion lines.
   * The pearl keeps a dark translucent core (so the glyph pops), a coloured lit rim, the pearl highlight and a thin-film band. */
  function glyphPearl(ctx, w, col, x, y, r, dim) {
    const c = circlePath(x, y, r), dm = dim || 1;                // dim < 1: a darker interior for the bright gold pearl (the comet must not melt into it)
    glow(ctx, x, y, r * 2.5, col, 0.4);
    body(ctx, c, col, w, { y0: y - r, y1: y + r, tint: 2.0 * dm, hl: [x - r * 0.4, y - r * 0.5, r * 1.5, 0.55 * dm] });
    neon(ctx, c, col, w * 1.15, { grad: [x - r, y - r, x + r, y + r], halo: 1.3, hot: 0.55 });
    neon(ctx, new Path2D('M ' + (x - r * 0.74) + ' ' + (y - r * 0.2) + ' A ' + (r * 0.78) + ' ' + (r * 0.78) + ' 0 0 1 ' + (x - r * 0.14) + ' ' + (y - r * 0.76)), WHITE, w * 0.5, { a: 0.8, halo: 0.2, hot: 0.4 });
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r * 0.97, 0, TAU); ctx.clip(); ctx.globalCompositeOperation = 'lighter';
    if (ctx.createConicGradient) {
      const cg = ctx.createConicGradient(2.4, x, y);
      [RGB.cyan, RGB.violet, RGB.magenta, RGB.amber, RGB.cyan].forEach((c2, i) => cg.addColorStop(i / 4, rgba(hot(c2, 0.2), 0.2)));
      ctx.lineWidth = r * 0.34; ctx.strokeStyle = cg; ctx.beginPath(); ctx.arc(x, y, r * 0.86, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }
  const glyphNeon = (ctx, path, w, col, wk, a) => neon(ctx, path, hot(col, 0.5), w * wk, { a: a === undefined ? 1 : a, halo: 1.0, hot: 1 });
  const arrowHead = (p, x, y, dx, dy, len, hw) => { p.moveTo(x - dx * len - dy * hw, y - dy * len + dx * hw); p.lineTo(x, y); p.lineTo(x - dx * len + dy * hw, y - dy * len - dx * hw); };

  def('pu_pink', 16, 16, 1, IPAD, 1.0, [8, 8], (ctx, o) => {
    const w = o.w, col = PEARL_C.pink, cx = 8, cy = 8.2;
    puRing(ctx, w, col);
    glyphPearl(ctx, w, col, cx, cy, 4.7);
    // RANGE: four arrows pointing outward (shaft from the hub, a bold open head at the pearl's inner edge)
    const sh = new Path2D(), hd = new Path2D();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const tip = 3.55, hub = 0.85;
      sh.moveTo(cx + dx * hub, cy + dy * hub); sh.lineTo(cx + dx * (tip - 0.5), cy + dy * (tip - 0.5));
      arrowHead(hd, cx + dx * tip, cy + dy * tip, dx, dy, 1.25, 1.05);
    }
    glyphNeon(ctx, sh, w, col, 0.85); glyphNeon(ctx, hd, w, col, 1.0);
    dot(ctx, cx, cy, 0.5, WHITE, 1, { halo: 2.6 });
    glint(ctx, 12.8, 3.0, 1.2, WHITE, 0.85);
  });
  def('pu_blue', 16, 16, 1, IPAD, 1.0, [8, 8], (ctx, o) => {
    const w = o.w, col = PEARL_C.blue, cx = 8, cy = 8.2;
    puRing(ctx, w, col);
    glyphPearl(ctx, w, col, cx, cy, 4.7);
    // RATE: a double chevron >> (rapid fire): two bold chevrons, the front one brighter
    const ch = (x0, a) => { const p = new Path2D(); p.moveTo(x0 - 1.5, cy - 2.2); p.lineTo(x0 + 0.5, cy); p.lineTo(x0 - 1.5, cy + 2.2); glyphNeon(ctx, p, w, col, 1.25, a); };
    ch(cx - 0.55, 0.62); ch(cx + 1.65, 1);
    glint(ctx, 12.6, 3.2, 1.2, WHITE, 0.85);
  });
  def('pu_gold', 16, 16, 1, IPAD, 1.0, [8, 8], (ctx, o) => {
    const w = o.w, col = PEARL_C.gold, cx = 8, cy = 8.2;
    puRing(ctx, w, col);
    glyphPearl(ctx, w, col, cx, cy, 4.7, 0.4);
    // SPEED: a comet flying to the upper right: a big bright head, a tapered tail and two clean motion lines streaming behind it
    ctx.save(); ctx.translate(cx + 0.3, cy + 0.1); ctx.rotate(-0.62);
    const tail = new Path2D('M 1.0 -1.5 L -3.4 0 L 1.0 1.5 Z');
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const tg = ctx.createLinearGradient(1.0, 0, -3.4, 0); tg.addColorStop(0, rgba(hot(col, 0.4), 0.95)); tg.addColorStop(1, rgba(col, 0.05));
    ctx.fillStyle = tg; ctx.fill(tail); ctx.restore();
    const ml = new Path2D();
    ml.moveTo(-0.6, -3.1); ml.lineTo(-3.8, -3.1); ml.moveTo(-0.9, 3.1); ml.lineTo(-4.4, 3.1);
    glyphNeon(ctx, ml, w, col, 0.9, 0.95);
    ctx.save(); ctx.fillStyle = 'rgba(4,3,8,0.9)'; ctx.beginPath(); ctx.arc(2.25, 0, 2.15, 0, TAU); ctx.fill(); ctx.restore();      // dark ring: the head never melts into the tail
    const head = circlePath(2.25, 0, 1.6);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(hot(col, 0.5), 0.98); ctx.fill(head); ctx.restore();
    neon(ctx, head, hot(col, 0.3), w * 0.85, { halo: 0.7, hot: 0.8 });
    fillAdd(ctx, circlePath(2.1, -0.2, 0.7), WHITE, 0.92);
    ctx.restore();
    glint(ctx, 12.8, 2.8, 1.2, WHITE, 0.85);
  });
  def('pu_parasol', 16, 16, 1, IPAD, 1.0, [8, 8], (ctx, o) => {
    const w = o.w, col = mixc(RGB.violet, RGB.magenta, 0.4);
    puRing(ctx, w, col);
    ctx.save(); ctx.translate(8, 8.2); ctx.rotate(-0.22); ctx.translate(-8, -8.2);
    neon(ctx, new Path2D('M 8 6.6 L 8 11.8 C 8 13.1 6.7 13.3 6.2 12.6'), hot(col, 0.3), w * 0.8, { halo: 0.7, hot: 0.5 });          // shaft + hook
    const can = new Path2D('M 2.0 7.2 C 2.4 3.6 5.0 2.2 8 2.2 C 11 2.2 13.6 3.6 14 7.2 C 13.0 6.3 12.0 6.3 11.0 7.2 C 10.0 6.3 9.0 6.3 8 7.2 C 7.0 6.3 6.0 6.3 5.0 7.2 C 4.0 6.3 3.0 6.3 2.0 7.2 Z');
    body(ctx, can, col, w, { y0: 2, y1: 7.5, tint: 2.0, hl: [6, 4, 5, 0.5] });
    neon(ctx, can, col, w * 1.05, { grad: [2, 2, 14, 7], halo: 1.1, hot: 0.6 });
    neon(ctx, new Path2D('M 8 2.2 L 5.0 7.0 M 8 2.2 L 8 6.6 M 8 2.2 L 11.0 7.0 M 8 2.2 L 3.4 6.4 M 8 2.2 L 12.6 6.4'), hot(col, 0.35), w * 0.38, { a: 0.65, halo: 0, hot: 0.2 });
    dot(ctx, 8, 1.9, 0.4, WHITE, 1, { halo: 3 });
    ctx.restore();
    glint(ctx, 13.0, 12.4, 1.2, WHITE, 0.85);
  });
  def('pu_clock', 16, 16, 1, IPAD, 1.0, [8, 8], (ctx, o) => {
    const w = o.w, col = mixc(RGB.cyan, WHITE, 0.35);
    puRing(ctx, w, col);
    // alarm clock: two bells on top, a face, ticks and hands
    for (const bx of [4.6, 11.4]) { const b = circlePath(bx, 3.9, 1.35); body(ctx, b, col, w, { y0: 2, y1: 6, tint: 1.8 }); neon(ctx, b, col, w * 0.8, { halo: 0.8, hot: 0.5 }); }
    const face = circlePath(8, 8.7, 4.7);
    body(ctx, face, col, w, { y0: 4, y1: 13.4, tint: 1.9, hl: [6.4, 6.4, 5, 0.45], core: [8, 8.7, 3.6, 0.2] });
    neon(ctx, face, col, w * 1.1, { grad: [4, 4, 12, 13], halo: 1.1, hot: 0.7 });
    const tk = new Path2D();
    for (let i = 0; i < 12; i++) { const a = i * TAU / 12, r0 = i % 3 === 0 ? 3.3 : 3.8; tk.moveTo(8 + cos(a) * r0, 8.7 + sin(a) * r0); tk.lineTo(8 + cos(a) * 4.2, 8.7 + sin(a) * 4.2); }
    neon(ctx, tk, hot(col, 0.4), w * 0.4, { a: 0.8, halo: 0, hot: 0.2 });
    neon(ctx, new Path2D('M 8 8.7 L 8 5.9'), WHITE, w * 0.8, { halo: 0.7, hot: 0.8 });
    neon(ctx, new Path2D('M 8 8.7 L 10.3 9.9'), WHITE, w * 0.7, { halo: 0.6, hot: 0.8 });
    dot(ctx, 8, 8.7, 0.45, WHITE, 1, { halo: 3 });
    glint(ctx, 13.2, 12.6, 1.2, WHITE, 0.85);
  });
  def('pu_bomb', 16, 16, 1, IPAD, 1.0, [8, 8], (ctx, o) => {
    const w = o.w, col = mixc(RGB.ember, RGB.amber, 0.25);
    puRing(ctx, w, col);
    const b = circlePath(8, 9.3, 4.3);
    body(ctx, b, col, w, { y0: 5, y1: 13.6, tint: 1.9, hl: [6.4, 7.4, 5, 0.5], core: [8, 9.3, 3.3, 0.22] });
    neon(ctx, b, col, w * 1.1, { grad: [4, 5, 12, 14], halo: 1.2, hot: 0.65 });
    neon(ctx, new Path2D('M 6.6 5.6 L 9.4 5.6 L 9.0 4.7 L 7.0 4.7 Z'), hot(col, 0.3), w * 0.7, { halo: 0.6, hot: 0.4 });          // neck
    neon(ctx, new Path2D('M 8.4 4.7 C 9.6 3.4 11.2 3.8 11.8 2.4'), hot(col, 0.4), w * 0.65, { halo: 0.6, hot: 0.4 });           // fuse
    sparkle(ctx, 12.0, 2.2, 1.7, hot(RGB.amber, 0.5), 1, 0.4);
    const st = [];                                                                                                            // the star emblem
    for (let i = 0; i < 10; i++) { const a = -PI / 2 + i * PI / 5, r = i % 2 ? 0.95 : 2.4; st.push([8 + cos(a) * r, 9.5 + sin(a) * r]); }
    const star = poly(st, true);
    fillAdd(ctx, star, hot(RGB.amber, 0.5), 0.8);
    neon(ctx, star, WHITE, w * 0.45, { a: 0.9, halo: 0.6, hot: 0.8 });
  });
  def('pu_heart', 16, 16, 1, IPAD, 1.0, [8, 8], (ctx, o) => {
    const w = o.w, col = RGB.magenta;
    puRing(ctx, w, col);
    glow(ctx, 8, 8, 12, col, 0.12);
    const hp = new Path2D('M 8 13.2 C 2.2 9.4 1.9 5 4.7 3.8 C 6.4 3.1 7.6 4 8 5.3 C 8.4 4 9.6 3.1 11.3 3.8 C 14.1 5 13.8 9.4 8 13.2 Z');
    body(ctx, hp, col, w, { y0: 3, y1: 13.5, tint: 1.6 });
    neon(ctx, hp, col, w * 1.1, { grad: [3, 3, 13, 13], halo: 1.2, hot: 0.65 });
    neon(ctx, new Path2D('M 4.4 5.6 Q 4.9 4.6 6.1 4.5'), WHITE, w * 0.6, { a: 0.9, halo: 0, hot: 0.3 });
    glint(ctx, 13.4, 2.6, 1.4, WHITE, 0.85);
  });

  /* ---------------------------------------------------------------- moon pearl (32 x 32): the final treasure, shimmering */
  def('moonpearl', 32, 32, 2, { l: 4, r: 4, t: 4, b: 4 }, 1, (ctx, o) => {
    const w = o.w, f = o.f, ph = o.ph, cx = 16, cy = 16, r = 9.0, col = mixc(WHITE, RGB.cyan, 0.35);
    glow(ctx, cx, cy, 15, mixc(RGB.violet, RGB.cyan, 0.45), 0.4);
    glow(ctx, cx, cy, 10.5, mixc(RGB.magenta, RGB.cyan, 0.5), 0.3);
    // rays: eight long + eight short, the set turns half a step on frame 1 (shimmer)
    const rays = new Path2D(), off = f * TAU / 32;
    for (let i = 0; i < 16; i++) { const a = off + i * TAU / 16 + 0.1, long = i % 2 === 0, r0 = r + 1.9, r1 = r + (long ? 5.0 : 3.5); rays.moveTo(cx + cos(a) * r0, cy + sin(a) * r0); rays.lineTo(cx + cos(a) * r1, cy + sin(a) * r1); }
    neon(ctx, rays, hot(mixc(RGB.cyan, RGB.violet, 0.3), 0.4), w * 0.7, { a: 0.8, halo: 0.9, hot: 0.5 });
    const c = circlePath(cx, cy, r);
    fillDark(ctx, c, 0.9);
    // the pearl: a pastel sphere (pearl-white highlight -> pink -> aqua -> violet at the limb), then moving film bands
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip(); ctx.globalCompositeOperation = 'lighter';
    const sg = ctx.createRadialGradient(cx - r * 0.32, cy - r * 0.38, 0, cx - r * 0.1, cy - r * 0.1, r * 1.25);
    sg.addColorStop(0, rgba(WHITE, 0.95)); sg.addColorStop(0.28, rgba(mixc(WHITE, RGB.magenta, 0.3), 0.62)); sg.addColorStop(0.62, rgba(mixc(RGB.cyan, RGB.violet, 0.25), 0.5)); sg.addColorStop(1, rgba(mixc(RGB.violet, RGB.magenta, 0.4), 0.7));
    ctx.fillStyle = sg; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    if (ctx.createConicGradient) {
      for (const [rr, lw, al, a0] of [[r * 0.7, r * 0.55, 0.3, 2.5 + f * 0.6], [r * 0.9, r * 0.3, 0.4, 0.4 + f * 0.6]]) {
        const cg = ctx.createConicGradient(a0, cx, cy);
        [RGB.cyan, RGB.violet, RGB.magenta, RGB.amber, RGB.cyan].forEach((c2, i) => cg.addColorStop(i / 4, rgba(hot(c2, 0.15), al)));
        ctx.lineWidth = lw; ctx.strokeStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.stroke();
      }
    }
    const cg2 = ctx.createRadialGradient(cx + r * 0.4, cy + r * 0.45, 0, cx + r * 0.4, cy + r * 0.45, r * 0.7);
    cg2.addColorStop(0, rgba(hot(RGB.cyan, 0.5), 0.3)); cg2.addColorStop(1, rgba(RGB.cyan, 0));
    ctx.fillStyle = cg2; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
    neon(ctx, c, col, w * 1.3, { grad: [cx - r, cy - r, cx + r, cy + r], gradHot: 0.75, halo: 1.6, hot: 0.9 });
    // specular highlight (top-left) + secondary reflection (bottom-right)
    neon(ctx, poly(arcPts(cx, cy, r * 0.72, r * 0.72, 200, 252, 12), false), WHITE, w * 1.2, { a: 0.95, halo: 0.3, hot: 0.9 });
    neon(ctx, poly(arcPts(cx, cy, r * 0.74, r * 0.74, 22, 60, 10), false), hot(RGB.cyan, 0.5), w * 0.8, { a: 0.7, halo: 0.2, hot: 0.4 });
    dot(ctx, cx - r * 0.4, cy - r * 0.55, 0.5, WHITE, 1, { halo: 3.2 });
    // orbiting sparkles
    for (let i = 0; i < 3; i++) { const a = ph + i * TAU / 3 + 0.5, rr = r + 4.2; sparkle(ctx, cx + cos(a) * rr, cy + sin(a) * rr * 0.9, 1.5 + 0.6 * sin(a * 2 + f), i === 1 ? hot(RGB.amber, 0.4) : WHITE, 0.95, a); }
  });

  /* ---- V1 frozen: <e>_frozen, defined LAST so that GFX's warm-up (definition order) bakes the sprites a round needs first (same w / h / frames as <e>_move; Game draws it instead of the move frame while an enemy is frozen) --------------------------------
   * The creature is cast in ice: its own silhouette in FROST (pale white-lilac), a milky frosted-glass body with straight ice facets, a rime contour with a thick
   * white-hot core, a handful of ice shards growing out of it and crystalline twinkles. The BODY is the move frame 0 pose in every frame (frozen solid, it does not
   * walk); only the twinkles change from frame to frame, so Game may step through the frames for a living glitter or just draw frame 0. */
  const SHARDS = {            // per body plan: x, y (a point ON the silhouette), outward angle, length
    nibbler: [[5.2, 4.7, -2.0, 2.3], [10.4, 4.5, -1.1, 2.1], [14.3, 10.2, -0.5, 2.0], [3.0, 12.0, 2.5, 1.9]],
    crabbit: [[1.9, 10.4, 3.5, 2.3], [14.1, 10.4, -0.35, 2.3], [5.8, 6.7, -1.95, 1.9], [10.2, 6.7, -1.2, 1.9]],
    jellop: [[2.1, 3.6, -2.7, 2.4], [13.9, 3.6, -0.45, 2.4], [8.0, 0.9, -1.57, 2.4], [4.6, 1.8, -2.1, 1.8]],
    springle: [[5.2, 6.4, 2.9, 2.1], [10.9, 9.8, -0.3, 2.1], [8.4, 0.3, -1.4, 2.0], [12.6, 13.8, -0.2, 1.8]],
    glimmer: [[4.2, 4.9, -2.0, 2.3], [8.6, 4.3, -1.35, 2.1], [12.2, 14.2, 0.9, 1.9], [2.4, 12.6, 2.6, 1.9]],
  };
  const TWINKLE = [[2.2, 2.4], [13.8, 1.8], [15.0, 8.2], [0.8, 8.6], [8.0, -0.2], [11.6, 14.8]];
  function iceShard(ctx, x, y, ang, len, w) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    const sh = poly([[0, 0], [len * 0.38, -len * 0.2], [len, 0], [len * 0.38, len * 0.2]], true);
    fillDark(ctx, sh, 0.5); fillAdd(ctx, sh, FROST, 0.4);
    neonN(ctx, sh, FROST, w * 0.55, { a: 0.95, halo: 0.6, hot: 0.9 });
    neonN(ctx, poly([[len * 0.1, 0], [len * 0.9, 0]], false), WHITE, w * 0.3, { a: 0.8, halo: 0, hot: 0.5 });
    ctx.restore();
  }
  function frozenFrame(ctx, type, o) {
    const f = o.f, w = o.w;
    glow(ctx, 8, 9, 10.5, FROST_BODY, 0.16);
    o.ph = 0; o.u = 0;
    creatureFrame(ctx, type, o, 'frozen', false);
    for (const [x, y, a, l] of SHARDS[type]) iceShard(ctx, x, y, a, l, w);
    TWINKLE.forEach(([x, y], i) => {
      const t = ((f / 4) + i * 0.37) % 1, s = Math.pow(Math.max(0, sin(PI * t)), 1.6);
      if (s < 0.04) return;
      sparkle(ctx, x, y, 0.5 + 1.2 * s, i % 2 ? mixc(FROST, WHITE, 0.4) : WHITE, 0.45 + 0.55 * s, 0.35 * i + f * 0.3);
    });
  }
  const FPAD = { l: 6, r: 6, t: 6, b: 5 }, FPAD_G = { l: 6, r: 8, t: 6, b: 5 };
  for (const type of ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer']) def(type + '_frozen', 16, 16, 4, type === 'glimmer' ? FPAD_G : FPAD, ENEMY_S[type], [8, 16], (ctx, o) => frozenFrame(ctx, type, o));

  /* ---------------------------------------------------------------- done */
  return { count: names.length, names: names.slice(), art: { hero, heroIcon, kraken, bubble, creatureFrame, steamLoop, heatLoop } };
})();


/* ===== 20_audio.js ===== */
/* FIZZ & POP — 20_audio.js        v2.0 "Abyss Glow" soundtrack: 80s dark wave x modern EDM x industrial  (SPEC_V2 §6)
 * AUDIO: pure WebAudio procedural synth + look-ahead sequencer + SFX bank.  No samples, no network; every sound is computed in code.
 *
 * ================================================================================================================================
 * 1. ARCHITECTURE
 * ================================================================================================================================
 *  - Everything audible is built by voice functions that take (ctx, bus, time, ...), so the very same code runs on the live AudioContext and on an
 *    OfflineAudioContext (AUDIO._renderOffline).  The context runs at ENGINE_RATE = 24 kHz (12 kHz bandwidth; every DSP cost scales with the
 *    rate, the browser resamples to the device; engines that ignore the option fall back to their default rate and just cost more).
 *  - Signal path:
 *      lane buses (one mixer strip per instrument lane) -> track out -> musicIn --> glue compressor -> music gain -> duck --+
 *      reverb / delay returns --------------------------> musicIn                                                          +-> master -> limiter ->
 *      sfx groups -> sfx gain ------------------------------------------------------------------------------------------- +   soft ceiling -> mute -> out
 *    `duck` is the priority duck of the music bed under the critical cues (SFX_DUCK, FIXPLAN_V3 A4); the limiter is soft and slow (-1 dB, knee 6, 10:1, 3 ms / 160 ms) so an
 *    everyday sound never pumps the bed (A3: the music dips <= 1.5 dB under any single pop / jump / kill).
 *    Lane strip: in -> [drive] -> [crush] -> [lpf] -> [hpf] -> [chorus] -> [tremolo] -> vol -> (sends: rev / hall / spr / dly) -> [sidechain duck]
 *    -> [pan] -> track out.  Only the stages a lane asks for are created (every silent node still costs CPU).
 *  - Reverbs: `hall` (2.5 s) and `room` (0.4 s) are ConvolverNodes with procedurally generated MONO impulse responses fed by a mono down-mix (one
 *    convolution; a stereo IR doubles the live cost), widened after the convolver by a delayed copy on the other channel (ChannelMerger).  `spr` = spring tank (allpass-
 *    dispersion feedback loop, the "boing" of a twang guitar amp).  `dly` = tempo-synced ping-pong delay (song `echo` steps, `fb` feedback).
 *    SFX send into the `room` reverb too.  The sidechain is gain automation per kick on the lane's `duck` gain (see §3.6).
 *  - Instruments (INST table): supersaw / stab / pad (pre-baked unison-saw buffers: ONE looping buffer source per chord note), choir (baked saws + formant
 *    band-passes), chorus pick bass / upright (one combined-wave oscillator), 808 sub, distorted riff bass, cold arp, lead, alarm lead, Karplus-Strong twang
 *    (computed in JS, played from a buffer), FM bell / vibes, a full drum kit (machine kick, EDM kick, 808 boom, gated-reverb snare, hard / crushed snare, clap,
 *    finger snap, rim, toms, closed / open / metallic hats, ride, crash), industrial hits (ring-modulated clangs, noise hits) and FX (riser, down-sweep,
 *    reverse swell, impact, zap).
 *  - Sequencer: songs are compiled lazily to a per-16th-step event table.  A setInterval (25 ms) pump schedules events HORIZON (0.28 s) ahead on
 *    AudioContext time.  The step clock is advanced one step at a time using the *current* tempo, so AUDIO.setTempo() takes effect on the next
 *    unscheduled step with no glitch.  Swing is a per-beat duration pattern (steps 0,1 long / 2,3 short; swing 0.5 = straight).
 *  - Every playing track owns its lane buses and a registry of its source nodes; stopping a track fades it, stops its sources and disconnects it,
 *    so rapid switching never stacks tracks.  Counters in `live` (voices / tracks / groups) are exposed through AUDIO._stats() for leak tests.
 *
 * ================================================================================================================================
 * 2. PUBLIC API SEMANTICS  (unchanged from v1; SPEC §3.2 + FIXPLAN §0/§3 + FIXPLAN2 K7)
 * ================================================================================================================================
 *  - Calls before init(): sfx are dropped silently; music()/jingle() are remembered (a requested loop starts as soon as init() has created the
 *    context; a jingle called before init() just fires onEnd after its nominal length so game flow never stalls).  A jingle whose context never
 *    starts running (autoplay blocked) is force-finished by a wall-clock watchdog (paused time is not counted against it).
 *  - jingle(): onEnd fires when the jingle's timeline ends (once; JINGLE_END_LEAD = 40 ms early, so a loop requested from onEnd is still chained
 *    sample-accurately on the jingle's end line).  If the jingle is interrupted by another music()/jingle()/stopMusic() call its onEnd is dropped.
 *    With {resume:true} the previous loop continues sample-accurately at the beginning of the bar it was in.  Jingles ignore setTempo().  A jingle
 *    starts at once; a loop it replaces is faded out over 150 ms under its attack.
 *  - music(name) while a jingle is playing does not cut the jingle: the requested loop is queued and starts sample-accurately when the jingle
 *    ends.  The `start` jingle is 2.25 s (FIXPLAN2 K7: over before the 2.5 s round-1 intro; it MUST stay <= 2.4 s).  music(name) while another LOOP is
 *    sounding is bar-aligned: the old loop plays to the end of its bar (a half bar / beat when a bar would take more than 1.6 s), then fades out over
 *    0.2 s while the new loop starts sample-accurately on that line.  Asking for the sounding loop again cancels a pending switch.
 *    music(name, {restart:true}) and stopMusic() act immediately.
 *  - setTempo is global state and persists across tracks (Game resets it to 1.0 at round start; HURRY UP = 1.3, boss 1.15).  A song's `maxTempo` caps it.
 *  - Mute is a master gain at the end of the chain plus "don't create nodes" in the scheduler; the timeline keeps running.
 *  - pause({suspend}): the scheduler stops at once and the music ducks out in ~60 ms.  suspend:true (default): ready() turns false and the context is
 *    suspended 320 ms later (so a 'pause' blip played around the call is still heard: keep the pause sfx < 250 ms).  suspend:false (manual pause
 *    screen): the context keeps running so menu sfx still play.  resume() undoes either and shifts every timeline by the time that passed.
 *  - Failures: every scheduled event, the scheduler tick and every sfx are wrapped in try/catch.  After FAULT_LIMIT (20) failing scheduler steps the music
 *    is switched off with a single console.warn; an sfx that fails 6 times is disabled.  Nothing ever throws into game code.
 *  - SFX voice limits steal the oldest instance of the same sound (pop x3, shoot x2 ...); a global source-node budget (MAX_VOICES / MAX_SFX_VOICES)
 *    drops new SFX when exceeded.  Music is never dropped.  sfx options: {pitch: semitones, vol}.  `kill` is designed for pitch 0..+12.
 *  - Non-contract debug extras (tests / board / composer scratch pad): _info(name), _dump(name), _events(name), _validate(), _stats(), _state(), _tap(),  _seek(step, pass),
 *    _skip([lane|'drum']) (live ablation), _capture(sec); demos: _demoNames(), _demo(name), _define('demo_x', songDef) (register a scratch song and get its compile issues,
 *    then _demo('demo_x')), _note(inst, [midi], dur, {vel, lane, cfg}), _hit(char), _fxNow(name, seconds); tables: _instruments(), _kit(), _pats();
 *    _renderOffline(name, seconds, opts) accepts {tempo, skip:[lane|'drum'], sfx:[[name, at, polarity?, pitch?]], noComp, noTrim, chunk, pitch, pass, alternate, vol, mg} (tests only).
 *
 * ================================================================================================================================
 * 3. COMPOSITION NOTATION  (what the composer writes: songDefs() below)
 * ================================================================================================================================
 *  A song is a JS object under D.<trackName>.  Time is counted in 16th STEPS, 16 steps = 1 bar (4/4 only); swing is a song option.
 *
 *    D.stage1 = {
 *      bpm: 122, swing: 0.5,            // swing 0.5 = straight; 0.58 = shuffled 8ths.  (jingles: nominal length = steps/4 * 60/bpm)
 *      key: 4, mode: [0,2,3,5,7,8,10],  // tonic pitch class + scale (lint: chord / scale tone statistics)
 *      kind: 'loop' | 'jingle',         // default 'loop'; a jingle plays once (steps may be any length) and may resume a loop afterwards
 *      echo: 3, fb: 0.38,               // ping-pong delay time in 16ths (3 = dotted 8th) and feedback; used by lanes with `dly`
 *      gain: 1,                         // track trim (linear): the loudness fit, `node test/audio_analyze.mjs --fit-music` suggests it
 *      lift: 0, maxTempo: 0,            // optional: semitones added on every 2nd pass of the loop / cap for setTempo (boss: 1.2)
 *      duckRel: 0.55,                   // sidechain release in beats (default); lane `duckRel` overrides;  duckOn: 'kKbq' = which drum chars trigger it
 *      placeholder: true,               // lint: placeholder songs are exempt from the form-length gates; the composer deletes this line
 *      lanes: { ... },                  // the mixer strips (instrument + bus settings): §3.1
 *      pats: { name: 'grid' },          // optional named patterns (also global ones: _pats())
 *      sections: { A: {...}, B: {...} },// the material: §3.2
 *      intro: ['I'],                    // sections played once before the loop
 *      order: ['A','B','A'],            // the loop: section names in order (a name may repeat)
 *    };
 *
 *  3.1 LANES   lanes: { pad: { inst:'pad', vol:0.7, hall:0.3 }, bass: { inst:'pick', chorus:{...} }, ... }     (lane name = anything; the four drum
 *      lanes `kick snare hats perc` and `fx` need no declaration unless you want to change their bus settings)
 *      Bus settings (all optional):
 *        vol 1          fader (linear; also automatable)           pan -1..1           rev 0..1  send to the `room` reverb (short, tight)
 *        hall 0..1      send to the `hall` reverb (long, lush)     spr 0..1 spring     dly 0..1  send to the ping-pong delay
 *        duck 0..1      sidechain depth (0.6 = the lane drops 60 % at every kick); duckRel (beats)
 *        lpf / hpf Hz   static filters (also automatable)          lq  Q of the lpf
 *        drive k        tanh saturation k (1.5 warm .. 8 heavy), dgain = level after it (default 0.3/(1+0.42k)), bias, os ('none'|'2x')
 *        crush bits     bit-crusher (4 = very lo-fi)               chorus {rate Hz, depth s, base s, mix, hp Hz}   (mono sources: bass / arp / lead; only the part above `hp` 160 Hz is chorused)
 *        trem {rate Hz, depth 0..1}                                 vib [Hz, cents]  detune LFO that chord voices (pad / super / choir) follow
 *      Everything else in the lane object is an INSTRUMENT parameter (table in §4), e.g. { inst:'super', n:7, spread:22, cut:6000, a:0.02 }.
 *      Section `cfg: { lane: {...} }` overrides instrument parameters for that section only.
 *
 *  3.2 SECTIONS   A: { chords: '| Em | C | G | D |',  p: { lane: 'pattern', ... },  mix: {...}, auto: {...}, duck: ..., cfg: {...}, fx: '...' }
 *      chords   one bar per `|`; `.` splits a bar equally (`Em.Am7`), `/n` = explicit length in steps (jingles: `Em/18`), `@X` = slash bass (`Am7@E`).
 *               Qualities: (none) m 7 m7 maj7 m7b5 dim dim7 sus sus2 sus4 7sus 6 m6 5 add9 madd9 maj9 m9 9 m11 aug 7b9 7#9 mmaj7 69 maj7#11 m7b9.
 *               The chords define the section length (every bar must have 16 steps, except in jingles) and the harmony of the chord-relative patterns.
 *      p        pattern per lane (below).  The lane's instrument decides the default FORMAT; prefix `n:` `r:` `c:` forces notes / relative / chord.
 *      mix      per-section velocity multipliers per lane name ({ pad: 0.5, drums: 0 }), 0 = lane tacet (builds, breakdowns); `drums` = all four kit lanes, `all`.
 *      auto     automation over the section (§3.5).      duck     sidechain override (§3.6).      pats    section-local named patterns.
 *      alt      SECOND-PASS version of a LOOP section (FIXPLAN_V3 A8, composer addition):  alt: { p: { lane: 'pattern', drums3: '...' }, mix: { bell: 2 }, dbl: { lead: 12 }, dblVel: 0.55 }
 *               On every odd pass of the loop (the 2nd, 4th ... time it plays; the first pass is always the original) the section plays with `alt.p` patterns replacing the same-named ones
 *               (or adding a lane that is silent in the original: counter-melody, fills) and `alt.mix` merged over `mix`.  `dbl` adds a transposed copy of a lane's notes:
 *               `lead: 12` (same lane, +1 octave) or `lead: { semi: -12, to: 'twang', vel: 0.6, bars: [1, 4] }` (other lane, velocity, bars 1-based inclusive).  The engine compiles both versions and keeps
 *               only the differences as events flagged for odd / even passes, so drums, sidechain triggers and fx follow along.  Not for intro sections, jingles or `auto`.
 *
 *  3.3 PATTERN FORMATS
 *   (a) NOTES  (lead, alarm, twang, bell, vibes; also usable on any lane with `n:`):   `| e5/2 g5/2 b5/4 r/8 |`
 *       token = pitch + optional `/length` (steps, default 2) + optional modifiers.  Pitch = letter [# or b] octave (c4 = middle C = MIDI 60).  `r/n` = rest.
 *       `[c4,e4,g4]/8` = a chord token.  Modifiers after the token: `'` accent (x1.28), `,` soft (x0.6).  Bar lines `|` are checked: every bar must add up to the
 *       chord bar.  Mono instruments cut a note at the start of the next one.
 *   (b) GRIDS  one character per 16th step; a space separates BAR CELLS that are cycled bar by bar.  A cell of 16 chars = one bar; of 8 / 4 / 2 chars it tiles inside the
 *       bar; of 32 / 48 chars it spans 2 / 3 bars.  `name*3` repeats a cell or named pattern; names resolve through song `pats`, section `pats`, then the global library (_pats(): four,
 *       backbeat, half, hat8, hat16, offhat, roll, hold, stab, sync, root, root2, root8, oct8, gal, pump, arp16, arp8 ...).
 *       Modifiers after a char: `'` accent, `,` soft, `^` octave up, `_` octave down.
 *       - CHORD lanes (super, stab, pad, choir):  `x` = play the chord (voice-led, 3-4 notes), `-` = hold, `.` = rest.   `x---------------` = a whole-bar pad;
 *         `..x...x...x...x.` = off-beat stabs.  A held note re-triggers on a chord change.  Voicing: lane param voicing {lo, hi, n, open}.
 *       - RELATIVE lanes (pick, wood, sub, riff, arp):  digits / letters are chord tones above the chord ROOT (bass register `lo`: pick 40, wood 36, sub 28, riff 33, arp 57):
 *         1 root, 2, 3 third, 4, 5 fifth, 6, 7 seventh, 8 octave, 9 ninth, a third+oct, c fifth+oct, e seventh+oct, b = fifth, 0 = root an octave down, f = minor 2nd (b2), g = minor 6th (b6), h = tritone (b5; composer additions);  `-` hold, `.` rest.
 *         `1-1-1-1-1-1-1-1-` eighth-note root pump;  `1181118111811181` gallop;  `1358a853c8531358` 16th arpeggio.  With a slash-bass chord (`Am7@E`) `1` plays the slash bass on bass lanes.
 *       - DRUM grid (key `drums`; routes to the lanes kick snare hats perc).  ONE hit per 16th step per grid: the extra keys `drums2` / `drums3` (composer addition, v2.0) are further
 *         grids that LAYER on the same steps (kick + hat on one step, snare + clap, ghost snares under a backbeat); all follow `mix.drums`, `R` rolls and the sidechain triggers alike:
 *           k machine kick   K EDM kick   b 808 boom (long)        s gated-reverb snare   S hard snare   y bit-crushed snare   n ghost snare   B brushed snare   p clap
 *           f finger snap   r rimshot   t / u / v hi / mid / low tom                    h closed hat   o open hat   m metallic 808 hat   M open metallic   d ride   c crash
 *           x low clang   X high clang   z noise hit   w noise blast  (industrial; lane `perc`)           R = SNARE ROLL: the run of consecutive R steps ramps in velocity
 *           q = silent sidechain trigger (a "ghost kick" so the pumping continues in a breakdown)                         . = rest
 *       - FX lane (`fx`):  tokens `name@start/length:velocity`, start / length in steps or bars (`4b` = 4 bars).  riser (noise + saw sweep up), down, swell (reverse-reverb bloom, cut at its
 *         end), impact (sub drop + noise + crash), zap.   `riser@0/4b impact@4b down@4b/1b`
 *
 *  3.4 DYNAMICS WITHOUT AUTOMATION:  `mix: { drums: 0 }` drum drop-out, `mix: { super: 0.6 }`, snare rolls with `R`, `fx` risers / swells / impacts, fills in the last bar of a cell
 *      (`K...s...K...s... K...s...K.s.ssSs`).  Loudness arc of a loop = sections with different `mix`; the analyzer prints it.
 *
 *  3.5 AUTOMATION   auto: { 'super.lpf': [400, 9000, 'exp'], 'master.hpf': [20, 800, 'exp', 1, 4], 'arp.dly': [0, 0.6] }
 *      key = lane.param; params: vol lpf hpf rev hall spr dly pan (a lane needs no static setting; automating creates the stage).  Lane `drums` = all four kit lanes; `master` has
 *      vol / lpf / hpf (the whole track).  value = [from, to, curve?, startBar?, endBar?]  curve 'lin' | 'exp' (default for lpf / hpf) | 'in' | 'out'; before startBar the
 *      value is `from`, after endBar it stays at `to`.  Or breakpoints [[bar, value], [bar, value], ...].  One linear segment per step (tempo-accurate).  A param automated in ANY section
 *      is reset to its lane default at the start of every section that does not automate it, so a build (filter sweep up) is followed by a clean drop.
 *
 *  3.6 SIDECHAIN   lanes with `duck: depth` pump at every kick: the drum chars k K b (and the silent q) trigger it; recovery is exponential (`duckRel` beats).  Per section
 *      `duck: false` switches it off (breakdowns), `duck: 0.5` scales the depth, `duck: { pad: 0.2, super: false }` overrides single lanes.
 *
 *  3.7 BUILDS AND DROPS  = sections: BUILD (riser fx, master.hpf / super.lpf sweeps, rising `R` snare roll in the last bar, kick thinning out) then DROP (impact, sidechained supersaw
 *      stabs + 808 sub + kick + hats, duck on).  demo_build (AUDIO._demo('demo_build')) is the reference.  Halftime / industrial sections: snare on beat 3 only (`........S.......`),
 *      riff lane with drive, clangs `x X`.  Dreamy breakdown: duck false, pads + twang + choir, `mix: { drums: 0 }`, `q` pulse optional.
 *
 *  3.8 LEVELS  every instrument is calibrated so that its demo at lane vol 1 sits at about -24 LUFS (drums -21, fx -22; the cold arp -11.5: FIXPLAN_V3 A5 raised its level 21 dB so that the arp
 *      lanes at their authored 0.3 are audible); a full arrangement at lane vols 0.5-0.9 lands at about
 *      -18 LUFS after the song `gain` fit.  Music target: K-weighted integrated -18 +-2 LUFS, true peak <= -1 dBFS (test/audio_analyze.mjs checks, --fit-music suggests `gain`).
 *
 *  3.9 CPU BUDGET (this reference VM, % of one core, live): empty running context ~3, glue + limiter 1, hall reverb 3, room reverb 1.3, delay / spring / ping-pong < 1,
 *      every simultaneous source node ~0.04, every silent lane stage ~0.03.  A chord note = ONE looping buffer source (not 5-9 oscillators): use 4-note chords freely, but keep a loop's
 *      peak simultaneous sources <= 60 (lint reports `peakSources`), prefer `n: 5` to `n: 7`, and one chorus lane per song.  The dense demo (AUDIO._demo('demo_dense')) is the budget reference.
 *
 *  3.10 JINGLES  kind:'jingle', one section `J`; chords with explicit lengths (`Em/18`); `start` = 18 steps @ 120 bpm = 2.25 s, `extend` 30 @ 150 = 3.0 s, `gameover` 24 @ 90 = 4.0 s,
 *      `clear_boss` 28 @ 140 = 3.0 s.  Grids in a jingle are written in 16-char cells (a 18-step jingle = 2 cells; the second one is cut).
 *
 * ================================================================================================================================
 * 4. INSTRUMENT PARAMETERS  (defaults in the INST table; lane / section cfg override)   lv = level (calibrated, leave it), a d s r = envelope (s), gate = held fraction of the written length
 * ================================================================================================================================
 *  super  chord  n 5 (saws 1..9)  spread 16 (cents)  cut 5600  q 0.7  fst 1.7 (filter starts at cut*fst and relaxes in ft 0.35 s)  a 0.012 d 0.4 s 0.85 r 0.3  sub 0  voicing {lo 55,hi 79,n 4}
 *  stab   chord  short plucked supersaw: fst 3.2 ft 0.16 a 0.004 d 0.22 s 0.25 r 0.14
 *  pad    chord  n 3 spread 11 cut 1500 fst 0.35 (the dark filter OPENS over ft 1.4 s) a 0.9 r 1.1
 *  choir  chord  vowel ah | oh | oo | eh | ee, spread 9, fm 6 (formant level), a 0.7 r 1.0; use lane vib [5.2, 14]
 *  pick   rel    chorus pick bass: wave {saw, pulse, duty, tri, sub, sin} (relative levels of one combined wave), cut 900 fst 3.6 ft 0.14 q 2.2; give the lane `chorus`
 *  wood   rel    upright / walking bass (triangle + sub)
 *  sub    rel    808 sub: drop 2.2 (pitch drop factor) dt 0.035 d 1.0 s 0.55; give the lane `drive 2.5` + `lpf 700` so phones hear the harmonics
 *  riff   rel    distorted riff bass: wave {saw, sub}, det 11, cut 1400 q 4; give the lane `drive 6..9` + `lpf 3600`
 *  arp    rel    cold arp: wave 0.25 (pulse duty) | 'sawtooth', n 1..5, spread, cut 2600 fst 2.4 ft 0.13, gate 0.7, pw2 (2nd layer one octave down)
 *  lead   notes  2 detuned saws, scoop 25 cents, cut 3600;     alarm  notes  square + saw, q 6, scoop 60 (boss siren)
 *  twang  notes  Karplus-Strong string: bend 0.35 (semitone scoop), ring 0.45 s after note-off, cut 6500; give the lane `trem`, `spr` and `hpf 140`
 *  bell / vibes  notes  2-op FM: mr (modulator ratio) idx / ie / id (index, end factor, time) d (decay) p2 / p2g (shimmer partial) mallet damp
 *  kit    drums  fixed voices; kick lane `drive 1.5` adds weight; hats / perc lanes take pan / rev;     fx  riser down swell impact zap
 *
 * ================================================================================================================================
 * 5. DESIGN CHOICES where the SPEC is silent / tests
 * ================================================================================================================================
 *  - SFX are calibrated PERCEPTUALLY: every non-quiet SFX sits on the same K-weighted (ITU-R BS.1770) active level, quiet ones (menu_move -9 dB, land -12 dB)
 *    below it, clearly above the music.  The per-SFX `trim` constants come from `node test/audio_analyze.mjs --apply-trims` (repeat until flat); every SFX is measured WARM (started 1 s into
 *    a running chain -- a sound at t=0 meets a cold limiter and reads up to 14 dB low, which is what mis-fitted the v2.0 table).  The critical cues (hurry, death, ghost, 1UP, EXTEND letter,
 *    round clear, power-up) carry an `lvl` bonus and pull the music bed down by SFX_DUCK while they sound, so they stay >= 8 dB over the loudest drop (test/audio_v3_mix.mjs).
 *  - COMPOSER ADDITIONS (v2.0, additive): (1) `drums2` / `drums3` section keys = extra drum grids that layer on the same steps (§3.3); (2) rel symbols `f` (b2), `g` (b6), `h` (b5) and
 *    power chords ('B5' = [0, 7]) no longer yield NaN for the fifth ('5', 'c', 'b' fall back to the last chord tone) -- a NaN pitch used to throw inside the scheduler and count toward the
 *    20-fault shutdown; the compiler now reports a non-finite symbol; (3) voiceChord() avoids muddy voicings: a semitone below MIDI 72 costs 40, minor 9th 14, low second / 9th 3-6, an
 *    extension (9th / 11th) is never the lowest voice (so Em9 / Gm9 pads are rootless 3-5-7-9 stacks, Bbmaj7 sits in root position and never puts the 7th a semitone under the root).
 *    (3) `alt` second-pass versions (§3.2); (4) kicks on beats 2 and 4 of the drops through a third drum grid (four-on-the-floor, FIXPLAN_V3 A7).
 *    Song arrangement conventions: quiet sections use `mix: { all: 0.5-0.7 }`, builds ramp `auto: { 'master.vol': [0.7, 1, 'in'] }` plus `master.hpf` / `super.lpf` sweeps, drops reset to full.
 *  - Tests: test/audio_lint.mjs (composition rules), test/audio_analyze.mjs (loudness / peaks / seams / SFX table), test/audio_runtime.mjs --strict (API),
 *    test/audio_cpu.mjs (CPU), test/audio_v2_board.html (listening board).  Spectrogram tools: test/audio_spectro.mjs, test/audio_sfxsheet.mjs.
 */
const AUDIO = (() => {
  // ================================================================================================
  // names / constants
  // ================================================================================================
  const LOOPS = ['title', 'stage1', 'stage2', 'boss', 'entry', 'ending'];
  const JINGLES = ['start', 'extend', 'gameover', 'clear_boss'];
  const SFX_NAMES = ['jump', 'shoot', 'pop', 'trap', 'kill', 'bounce', 'food', 'powerup', 'item_appear',
    'letter', 'oneup', 'death', 'hurry', 'ghost', 'thunder', 'fire', 'water', 'freeze', 'bomb',
    'menu_move', 'menu_select', 'pause', 'boss_hit', 'boss_die', 'enemy_shot', 'spawn', 'land', 'clear'];

  const TICK_MS = 25;            // scheduler pump interval
  const HORIZON = 0.28;          // schedule this far ahead of AudioContext.currentTime (s); survives ~250 ms main-thread stalls
  const START_DELAY = 0.06;      // first step of a fresh track starts this far in the future
  const FADE_SWITCH = 0.04;      // fade used when a track is replaced at once (s)
  const FADE_XFADE = 0.2;        // fade-out of the old loop when a bar-aligned loop->loop switch lands (s)
  const SWITCH_MAX_WAIT = 1.6;   // a bar-aligned switch waits at most this long (s); longer bars fall back to half bars / beats
  const JINGLE_END_LEAD = 0.04;  // a jingle reports its end (onEnd) up to this early, so a loop requested from onEnd can still be chained on the line
  const FADE_JINGLE = 0.15;      // a jingle that replaces a sounding loop: the loop is faded out under the jingle's attack (no 40 ms chop)
  const PAUSE_SUSPEND_MS = 320;  // pause(): context is suspended this long after the music has ducked out
  const FAULT_LIMIT = 20;        // failing scheduler steps tolerated before the music is switched off for good
  const SFX_FAULT_LIMIT = 6;     // exceptions tolerated per sfx name before that sfx is disabled
  const STEPS_PER_BAR = 16;
  const ENGINE_RATE = 24000;     // AudioContext sample rate: every DSP cost scales with it (12 kHz bandwidth is plenty for this soundtrack; the browser resamples to the device)
  const OFFLINE_RATE = ENGINE_RATE;
  const OFFLINE_CHUNK = 2;       // seconds of music scheduled per slice in _renderOffline
  const MAX_VOICES = 190;        // global source-node budget (music + sfx); new SFX are dropped above this
  const MAX_SFX_VOICES = 64;     // source nodes alive in SFX groups; new SFX are dropped above this
  const MUSIC_LEVEL = 0.6, SFX_LEVEL = 1.0, MASTER_LEVEL = 0.95;     // MUSIC_LEVEL 0.5 -> 0.6 with the softer limiter (FIXPLAN_V3 A3: it adds ~1.6 dB less automatic make-up; the loop gains stay as fitted)
  const DELAY_SEND_FB = 0.38;    // ping-pong feedback
  const KS_RATE = ENGINE_RATE;   // sample rate of the generated Karplus-Strong plucks
  const BAKE_T = 1.5;            // loop length (s) of the pre-baked unison-saw buffers (supersaw / pad / choir)
  const BAKE_CACHE_MAX = 96, KS_CACHE_MAX = 64;   // cached stacks / plucks per sample rate (memory bound)

  // ================================================================================================
  // small helpers
  // ================================================================================================
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const noop = () => {};
  const warned = {};
  function warnOnce(kind, name) {
    const k = kind + ':' + name;
    if (warned[k]) return;
    warned[k] = true;
    try { console.warn('AUDIO: unknown ' + kind + ' "' + name + '"'); } catch (e) { /* no console */ }
  }
  function safeCall(fn) { try { if (typeof fn === 'function') fn(); } catch (e) { /* user callback must not break audio */ } }
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const dbToLin = (db) => Math.pow(10, db / 20);

  // deterministic "random" start offsets into the noise buffer (reproducible offline renders)
  let nzState = 0x1234567;
  function nzReset() { nzState = 0x1234567; }
  function nzOffset() {
    nzState ^= nzState << 13; nzState >>>= 0;
    nzState ^= nzState >>> 17;
    nzState ^= nzState << 5; nzState >>>= 0;
    return (nzState % 100000) / 100000;     // 0..1
  }

  // ================================================================================================
  // live counters + source registries (leak accounting)
  // ================================================================================================
  const live = { voices: 0, tracks: 0, groups: 0, resyncs: 0, sfxv: 0 };
  let REG = null;                 // registry that receives every source node created right now

  /**
   * Registry of the source nodes (oscillators / buffer sources) of one track or one sfx instance.  `persist` sources (LFOs of a track's
   * lane buses) do not keep the track alive: onIdle fires when the last NON-persistent source has ended.
   */
  function makeRegistry(onIdle, isSfx) {
    const set = new Set();
    let np = 0;
    const r = {
      set, onIdle,
      n() { return np; },
      add(src, persist) {
        set.add(src); live.voices++; if (isSfx) live.sfxv++;
        if (persist) src.__p = 1; else np++;
        src.onended = () => r.drop(src);
      },
      drop(src) {
        if (!set.delete(src)) return;
        live.voices--; if (isSfx) live.sfxv--;
        if (!src.__p) np--;
        if (np <= 0 && r.onIdle) { np = 0; r.onIdle(); }
      },
      stopAll(when) { for (const s of set) { try { s.stop(when); } catch (e) { /* not started / already stopped */ } } },
      clear() {
        r.onIdle = null;
        for (const s of Array.from(set)) { try { s.stop(); } catch (e) { /* ignore */ } r.drop(s); }
      },
    };
    return r;
  }
  function reg(src, persist) { if (REG) REG.add(src, persist); return src; }

  // ================================================================================================
  // shared curves (WaveShaper tables)
  // ================================================================================================
  const curves = {};
  /** safety ceiling: transparent to KNEE, then a tanh shoulder that never exceeds LIM (the true-peak guard) */
  function softClipCurve() {
    if (curves.soft) return curves.soft;
    const N = 4097, LIM = 0.78, KNEE = 0.56;
    const c = curves.soft = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * 2 - 1, ax = Math.abs(x);
      const y = ax <= KNEE ? ax : KNEE + (LIM - KNEE) * Math.tanh((ax - KNEE) / (LIM - KNEE));
      c[i] = x < 0 ? -y : y;
    }
    return c;
  }
  /** tanh drive: y = tanh(k x) / tanh(k) (unity at full scale), asymmetric bias for even harmonics when `bias` > 0 */
  function driveCurve(k, bias) {
    const key = 'd' + k + '_' + (bias || 0);
    if (curves[key]) return curves[key];
    const N = 2049, c = curves[key] = new Float32Array(N), b = bias || 0, t = Math.tanh(k);
    const off = Math.tanh(k * b);
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * 2 - 1;
      c[i] = (Math.tanh(k * (x + b)) - off) / t;
    }
    return c;
  }
  /** bit-crusher: amplitude quantiser with 2^bits levels */
  function crushCurve(bits) {
    const key = 'c' + bits;
    if (curves[key]) return curves[key];
    const N = 4097, c = curves[key] = new Float32Array(N), L = Math.pow(2, Math.max(2, bits) - 1);
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * 2 - 1;
      c[i] = Math.round(x * L) / L;
    }
    return c;
  }

  // ================================================================================================
  // assets.  AudioBuffers (noise, impulse responses, plucks, baked saw stacks, metallic hat) are cached GLOBALLY per sample rate -- an
  // AudioBuffer may be used by any context -- so a live context and the offline renders of the tests share them.  PeriodicWaves are per context.
  // ================================================================================================
  const shared = {};                                   // sampleRate -> {noise, ks, bake, metal, ir}
  function sh(ctx) {
    const sr = ctx.sampleRate;
    let e = shared[sr];
    if (!e) {
      const len = Math.floor(sr * 2);
      const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0), rnd = U.rng(20240607);
      for (let i = 0; i < len; i++) d[i] = rnd.next() * 2 - 1;
      e = shared[sr] = { noise: buf, ks: {}, bake: {}, metal: null, ir: {} };
    }
    return e;
  }
  const envs = new WeakMap();
  function env(ctx) {
    let e = envs.get(ctx);
    if (!e) { e = { pulse: {}, combo: {}, noise: sh(ctx).noise }; envs.set(ctx, e); }
    return e;
  }
  /** Pulse wave with the given duty (fraction of the period spent high). Fourier series of a rectangular pulse. */
  function pulseWave(ctx, duty) {
    const e = env(ctx);
    const key = String(duty);
    if (!e.pulse[key]) {
      const N = 64;
      const re = new Float32Array(N + 1), im = new Float32Array(N + 1);
      for (let n = 1; n <= N; n++) {
        re[n] = Math.sin(2 * Math.PI * n * duty) / (n * Math.PI);
        im[n] = (1 - Math.cos(2 * Math.PI * n * duty)) / (n * Math.PI);
      }
      e.pulse[key] = ctx.createPeriodicWave(re, im);
    }
    return e.pulse[key];
  }
  /**
   * One oscillator for a whole bass voice: a PeriodicWave that sums a sawtooth, a pulse, a triangle and a sub sine (an octave below, so the
   * wave's fundamental is f/2 when `sub` > 0 and the oscillator must run at f/2).  o: {saw, pulse, duty, tri, sin, sub} (levels)
   */
  function comboWave(ctx, o) {
    const e = env(ctx), key = [o.saw || 0, o.pulse || 0, o.duty || 0.5, o.tri || 0, o.sub || 0, o.sin || 0].join('_');
    if (e.combo[key]) return e.combo[key];
    const N = 64, re = new Float32Array(N + 1), im = new Float32Array(N + 1), half = o.sub ? 2 : 1;
    for (let h = 1; h * half <= N; h++) {                // h = harmonic of the note frequency
      const i = h * half;
      if (o.saw) im[i] += o.saw * (2 / Math.PI) * (h % 2 ? 1 : -1) / h;
      if (o.pulse) { re[i] += o.pulse * Math.sin(2 * Math.PI * h * o.duty) / (h * Math.PI); im[i] += o.pulse * (1 - Math.cos(2 * Math.PI * h * o.duty)) / (h * Math.PI); }
      if (o.tri && h % 2) im[i] += o.tri * (8 / (Math.PI * Math.PI)) * ((h - 1) / 2 % 2 ? -1 : 1) / (h * h);
    }
    if (o.sub) im[1] += o.sub;
    if (o.sin) im[half] += o.sin;
    return (e.combo[key] = ctx.createPeriodicWave(re, im));
  }
  function setWave(ctx, osc, w) {
    if (typeof w === 'number') osc.setPeriodicWave(pulseWave(ctx, w));
    else if (w && typeof w === 'object') osc.setPeriodicWave(comboWave(ctx, w));
    else osc.type = w === 'saw' ? 'sawtooth' : w === 'tri' ? 'triangle' : (w || 'sine');
  }

  // ---- impulse responses: MONO (a stereo IR doubles the live CPU cost of a ConvolverNode); the width is added after the convolver ----
  /** o: {len, rt (-60 dB time), pre, f0, f1 (lowpass start / end Hz), build (fade-in s), er: [[t, amp], ...], seed} */
  function genIR(ctx, o) {
    const sr = ctx.sampleRate, n = Math.floor(o.len * sr), pre = Math.floor((o.pre || 0) * sr);
    const buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0), rnd = U.rng((o.seed || 1) * 7);
    const dec = Math.pow(10, -3 / (o.rt * sr));              // amplitude factor per sample (-60 dB after rt)
    let amp = 1, lp = 0, lp2 = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sr;
      amp *= dec;
      const ramp = Math.min(1, t / (o.build || 0.02));
      const fc = o.f1 + (o.f0 - o.f1) * Math.exp(-t / (o.rt * 0.33));
      const k = 1 - Math.exp(-2 * Math.PI * fc / sr);
      lp += k * ((rnd.next() * 2 - 1) - lp); lp2 += k * (lp - lp2);
      d[i] = lp2 * amp * ramp * 3;
    }
    for (const [t, a] of o.er || []) {                        // sparse early reflections
      const idx = pre + Math.floor(t * sr);
      if (idx < n) d[idx] += a * (rnd.next() < 0.5 ? -1 : 1);
    }
    const fade = Math.floor(n * 0.12);
    for (let i = 0; i < fade; i++) d[n - 1 - i] *= i / fade;  // no click at the end of the tail
    return buf;
  }
  function irFor(ctx, kind) {
    const e = sh(ctx);
    if (e.ir[kind]) return e.ir[kind];
    let b;
    if (kind === 'room') b = genIR(ctx, { len: 0.42, rt: 0.34, pre: 0.002, f0: 7200, f1: 2800, build: 0.006, seed: 3, er: [[0.006, 0.55], [0.011, -0.45], [0.017, 0.38], [0.025, -0.3], [0.036, 0.22]] });
    else if (kind === 'hall') b = genIR(ctx, { len: 2.5, rt: 2.1, pre: 0.016, f0: 5200, f1: 1100, build: 0.04, seed: 5, er: [[0.009, 0.3], [0.021, -0.28], [0.037, 0.22], [0.055, -0.18]] });
    else throw new Error('unknown IR ' + kind);
    return (e.ir[kind] = b);
  }

  // ---- Karplus-Strong plucked string, computed in JS (a WebAudio feedback loop cannot go below 128 samples = 344 Hz) ----
  const ksCache = new Map();
  /**
   * Extended Karplus-Strong: noise burst (pick-position comb + soft lowpass) circulating in a delay line with a 2-point averaging
   * loss filter and a first-order allpass for exact tuning.  Deterministic per MIDI note.  -> Float32Array at KS_RATE
   */
  function ksData(midi) {
    let out = ksCache.get(midi);
    if (out) return out;
    const f = mtof(midi), N = KS_RATE / f;
    const L = Math.max(3, Math.floor(N - 1.0)), D = N - 0.5 - L, C = (1 - D) / (1 + D);
    const t60 = clamp(2.5 - (midi - 38) * 0.03, 0.8, 2.4);               // low strings ring longer
    const rho = Math.min(0.9995, Math.pow(10, -3 / (f * t60)));
    const len = Math.floor(KS_RATE * Math.min(2.2, t60 * 0.85 + 0.25));
    const rnd = U.rng(9100 + midi * 17);
    const ex = new Float32Array(L);
    for (let i = 0; i < L; i++) ex[i] = rnd.next() * 2 - 1;
    const pp = Math.max(1, Math.round(L * 0.16));                         // pick position: comb notch -> nasal, twangy
    const buf = new Float32Array(L);
    let lp = 0, mean = 0;
    for (let i = 0; i < L; i++) {
      const v = ex[i] - (i >= pp ? ex[i - pp] : 0);
      lp += 0.62 * (v - lp);                                              // pluck brightness
      buf[i] = lp; mean += lp;
    }
    mean /= L; let pk = 1e-6;
    for (let i = 0; i < L; i++) { buf[i] -= mean; pk = Math.max(pk, Math.abs(buf[i])); }
    for (let i = 0; i < L; i++) buf[i] /= pk;
    out = new Float32Array(len);
    let idx = 0, prev = 0, apx = 0, apy = 0, peak = 1e-6;
    for (let n = 0; n < len; n++) {
      const x = buf[idx];
      out[n] = x;
      const l = rho * 0.5 * (x + prev); prev = x;
      const y = C * (l - apy) + apx; apx = l; apy = y;
      buf[idx] = y; if (++idx >= L) idx = 0;
      const a = x < 0 ? -x : x; if (a > peak) peak = a;
    }
    const fin = Math.floor(KS_RATE * 0.04);
    for (let i = 0; i < len; i++) {
      let g = 0.9 / peak;
      if (i < 24) g *= i / 24;                                            // 1 ms de-click
      if (len - i < fin) g *= (len - i) / fin;
      out[i] *= g;
    }
    ksCache.set(midi, out);
    return out;
  }
  function ksBuffer(ctx, midi) {
    const e = sh(ctx);
    let b = e.ks[midi];
    if (!b) {
      const data = ksData(midi);
      b = ctx.createBuffer(1, data.length, KS_RATE);
      if (b.copyToChannel) b.copyToChannel(data, 0); else b.getChannelData(0).set(data);
      e.ks[midi] = b;
      e.ksKeys = e.ksKeys || [];
      e.ksKeys.push(midi);
      if (e.ksKeys.length > KS_CACHE_MAX) { const old = e.ksKeys.shift(); delete e.ks[old]; ksCache.delete(old); }
    }
    return b;
  }

  /**
   * Baked unison-saw stack: N detuned band-limited (polyBLEP) saws summed into a seamlessly looping buffer of BAKE_T seconds (every saw has an
   * integer number of cycles in the loop).  Stereo: the detuned saws below the centre go left, above go right, the centre goes to both.
   * One looping BufferSource per chord note replaces 5-9 oscillators; the playbackRate trims the (<0.5 %) quantisation of the pitch.
   * -> {buf, rate}
   */
  function sawBake(ctx, midi, N, spread, mono) {
    const e = sh(ctx), key = midi + '_' + N + '_' + spread + (mono ? 'm' : '');
    let r = e.bake[key];
    if (r) return r;
    const sr = ctx.sampleRate, f0 = mtof(midi);
    const c0 = Math.max(2, Math.round(f0 * BAKE_T)), L = Math.round(c0 * sr / f0), fAct = c0 * sr / L;   // loop = c0 cycles of the note, a whole number of samples (pitch error < 0.03 cent)
    const offs = sawOffsets(N), cyc = [];
    for (let i = 0; i < N; i++) {                            // integer cycle counts, distinct from each other (>= 1 cycle apart)
      let c = Math.max(1, Math.round(c0 * Math.pow(2, offs[i] * spread / 1200)));
      if (i > 0 && c <= cyc[i - 1]) c = cyc[i - 1] + 1;
      cyc.push(c);
    }
    const mid = cyc.reduce((a, b) => a + b, 0) / N, shift = Math.round(c0 - mid);   // keep the stack centred on the note
    const buf = ctx.createBuffer(mono ? 1 : 2, L, sr), dl = buf.getChannelData(0), dr = mono ? dl : buf.getChannelData(1);
    const rnd = U.rng(31 * midi + 7 * N + 1);
    let cl = 0, cr = 0;
    for (let i = 0; i < N; i++) {
      const dp = (cyc[i] + shift) / L, toL = offs[i] <= 0.05, toR = offs[i] >= -0.05;
      let ph = rnd.next();
      if (toL) cl++; if (toR) cr++;
      for (let n = 0; n < L; n++) {
        let v = 2 * ph - 1;
        if (ph < dp) { const t = ph / dp; v -= t + t - t * t - 1; } else if (ph > 1 - dp) { const t = (ph - 1) / dp; v -= t * t + t + t + 1; }
        ph += dp; if (ph >= 1) ph -= 1;
        if (mono) dl[n] += v; else { if (toL) dl[n] += v; if (toR) dr[n] += v; }
      }
    }
    const sl = 0.5 / Math.sqrt(mono ? N : Math.max(1, cl)), sr2 = 0.5 / Math.sqrt(Math.max(1, cr));
    for (let n = 0; n < L; n++) { dl[n] *= sl; if (!mono) dr[n] *= sr2; }
    r = e.bake[key] = { buf, rate: f0 / fAct };
    e.bakeKeys = e.bakeKeys || [];
    e.bakeKeys.push(key);
    if (e.bakeKeys.length > BAKE_CACHE_MAX) delete e.bake[e.bakeKeys.shift()];     // bounded memory: ~290 KB per stack at 24 kHz
    return r;
  }
  /** 808-style metallic hat source: six detuned square waves (205..800 Hz), 0.45 s, normalised; filtered by the voice */
  function metalBuffer(ctx) {
    const e = sh(ctx);
    if (e.metal) return e.metal;
    const sr = ctx.sampleRate, n = Math.floor(0.45 * sr), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    const fr = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0];
    let pk = 1e-6;
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = 0; k < fr.length; k++) s += ((i * fr[k] / sr) % 1) < 0.5 ? 1 : -1;
      d[i] = s; pk = Math.max(pk, Math.abs(s));
    }
    for (let i = 0; i < n; i++) d[i] /= pk;
    return (e.metal = b);
  }

  // ================================================================================================
  // node helpers
  // ================================================================================================
  function gn(ctx, v) { const g = ctx.createGain(); g.gain.value = v; return g; }
  /** biquad with k-rate parameters (coefficients are recomputed once per 128 frames, not per sample: ~10x cheaper while a cutoff is swept) */
  function bq(ctx, type, f, q) {
    const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = Math.min(f, ctx.sampleRate * 0.49);       // composer fix v2.0: never above Nyquist (Chrome logged a warning per note otherwise)
    if (q !== undefined) b.Q.value = q;
    try { b.frequency.automationRate = 'k-rate'; b.Q.automationRate = 'k-rate'; } catch (e) { /* engines without settable rates */ }
    return b;
  }
  /**
   * Buffer sources MUST start on a whole sample frame and read from a whole-sample offset: a fractional position makes the engine linearly
   * interpolate the buffer, which low-passes it (up to -7 dB of everything near Nyquist: hats, noise bursts, saw stacks) by an amount that depends on
   * where the hit happens to fall.  Every start time / offset is snapped to the frame grid (error <= 21 us at 24 kHz).
   */
  const frame = (ctx, t) => Math.round(t * ctx.sampleRate) / ctx.sampleRate;
  /** oscillator that is started AND stopped at creation (a throwing call can never leave a running orphan behind) */
  function mkOsc(ctx, w, f, t0, t1) {
    const o = reg(ctx.createOscillator());
    try { setWave(ctx, o, w); o.frequency.value = Math.min(f, ctx.sampleRate / 2); /* integrator v2.0: Nyquist (12 kHz at the 24 kHz engine rate) is the nominal range; Chrome clamped silently but logged a console warning per note */ o.start(frame(ctx, t0)); o.stop(t1); } catch (e) { if (REG) REG.drop(o); throw e; }
    return o;
  }
  function mkNoise(ctx, t0, t1) {
    const s = reg(ctx.createBufferSource());
    try { s.buffer = env(ctx).noise; s.loop = true; s.start(frame(ctx, t0), frame(ctx, nzOffset() * 1.5)); s.stop(t1); } catch (e) { if (REG) REG.drop(s); throw e; }
    return s;
  }
  function mkBuf(ctx, buf, t0, t1, loop) {
    const s = reg(ctx.createBufferSource());
    try { s.buffer = buf; if (loop) s.loop = true; s.start(frame(ctx, t0)); if (t1) s.stop(t1); } catch (e) { if (REG) REG.drop(s); throw e; }
    return s;
  }
  /** amplitude envelope node connected to dest: linear attack, decay-to-sustain and release as exponential approaches (tau = time/3) */
  function adsr(ctx, dest, t, hold, a, d, s, r, vol) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.setTargetAtTime(vol * s, t + a, Math.max(0.004, d / 3));
    g.gain.setTargetAtTime(0, t + hold, Math.max(0.004, r / 3));
    g.connect(dest);
    return g;
  }
  /** one-shot exponential decay envelope (percussive): attack a, then decays by `tau` */
  function decayEnv(ctx, dest, t, a, tau, vol) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.setTargetAtTime(0, t + a, tau);
    g.connect(dest);
    return g;
  }
  /** lowpass whose cutoff starts at cut*start and relaxes to cut with time constant ft/3 */
  function envLP(ctx, t, cut, start, ft, q) {
    const f = bq(ctx, 'lowpass', cut, q);
    const ny = ctx.sampleRate * 0.49, top = clamp(cut * start, 30, ny);
    f.frequency.setValueAtTime(top, t);
    if (top !== cut) f.frequency.setTargetAtTime(clamp(cut, 30, ny), t, Math.max(0.004, ft / 3));
    return f;
  }
  function sawOffsets(n) {
    n = clamp(n | 0, 1, 9);
    if (n === 1) return [0];
    const o = [];
    for (let i = 0; i < n; i++) { const x = -1 + 2 * i / (n - 1); o.push(Math.sign(x) * Math.pow(Math.abs(x), 1.15)); }
    return o;
  }
  function viber(bus, src) { if (bus.vib && src.detune) { try { bus.vib.connect(src.detune); } catch (e) { /* ignore */ } } }

  // ================================================================================================
  // INSTRUMENT LIBRARY.  play(ctx, bus, t, dur, notes[], vel, cfg): one note / chord at ctx time t, written length dur (s).
  //   bus = the lane bus: bus.in (input; mono or stereo), bus.vib (detune LFO or null)
  //   Each voice creates its own sources with explicit start/stop times (REG accounting) and never holds state: it is safe to run on any context.
  //   CPU rule of thumb (this machine, per source node alive): oscillator ~0.04 %, looping buffer ~0.02 %, biquad ~0.05 %, gain ~0.01 %.
  // ================================================================================================
  const INST = {};

  /** chord of baked unison saws (one looping stereo buffer per note) -> one stereo lowpass -> one envelope.  super / stab / pad. */
  function chordVoice(ctx, bus, t, dur, notes, vel, c) {
    const a = c.a, hold = Math.max(a + 0.012, dur * c.gate), r = c.r, tEnd = t + hold + r * 2.6 + 0.04;
    const N = clamp(c.n | 0 || 5, 1, 9), K = notes.length;
    const f = envLP(ctx, t, c.cut, c.fst, c.ft, c.q);
    const g = adsr(ctx, bus.in, t, hold, a, c.d, c.s, r, vel * c.lv / Math.sqrt(K));
    f.connect(g);
    for (let k = 0; k < K; k++) {
      const b = sawBake(ctx, notes[k], N, c.spread, false), s = mkBuf(ctx, b.buf, t, tEnd, true);
      if (Math.abs(b.rate - 1) > 4e-5) s.playbackRate.value = b.rate; viber(bus, s); s.connect(f);
    }
    if (c.sub) {
      const so = mkOsc(ctx, 'sine', mtof(Math.min.apply(null, notes) - 12), t, tEnd), sg = gn(ctx, c.sub * 0.5);
      so.connect(sg); sg.connect(g);
    }
  }

  /** "ah" choir: baked mono saw stacks -> parallel formant band-passes (+ a little dry) -> slow envelope */
  const VOWELS = {
    ah: [[730, 9, 1], [1090, 10, 0.8], [2440, 12, 0.5], [3400, 14, 0.25]],
    oh: [[570, 9, 1], [840, 10, 0.7], [2410, 12, 0.35], [3300, 14, 0.2]],
    oo: [[300, 8, 1], [870, 10, 0.4], [2240, 12, 0.25], [3300, 14, 0.15]],
    eh: [[530, 9, 1], [1840, 10, 0.7], [2480, 12, 0.45], [3500, 14, 0.25]],
    ee: [[270, 8, 1], [2290, 10, 0.55], [3010, 12, 0.4], [3700, 14, 0.2]],
  };
  function choirVoice(ctx, bus, t, dur, notes, vel, c) {
    const a = c.a, hold = Math.max(a + 0.02, dur * c.gate), r = c.r, tEnd = t + hold + r * 2.6 + 0.04;
    const K = notes.length, lvl = vel * c.lv / Math.sqrt(K);
    const mix = ctx.createGain();
    for (let k = 0; k < K; k++) {
      const b = sawBake(ctx, notes[k], 3, c.spread, true), s = mkBuf(ctx, b.buf, t, tEnd, true);
      if (Math.abs(b.rate - 1) > 4e-5) s.playbackRate.value = b.rate; viber(bus, s); s.connect(mix);
    }
    const g = adsr(ctx, bus.in, t, hold, a, c.d, c.s, r, lvl);
    for (const [f, q, gain] of (VOWELS[c.vowel] || VOWELS.ah).slice(0, 3)) {
      const b = bq(ctx, 'bandpass', f, q), bg = gn(ctx, gain * c.fm);
      mix.connect(b); b.connect(bg); bg.connect(g);
    }
  }

  /** chorus pick bass / upright: ONE oscillator carrying a saw + pulse (+ triangle) + sub-sine wave -> enveloped lowpass -> amp */
  function pickVoice(ctx, bus, t, dur, notes, vel, c) {
    const fq = mtof(notes[0]), hold = Math.max(c.a + 0.006, dur * c.gate), r = c.r, tEnd = t + hold + r * 2.6 + 0.03;
    const f = envLP(ctx, t, c.cut, c.fst, c.ft, c.q);
    const g = adsr(ctx, bus.in, t, hold, c.a, c.d, c.s, r, vel * c.lv);
    f.connect(g);
    const o = mkOsc(ctx, c.wave, c.wave.sub ? fq / 2 : fq, t, tEnd);
    o.connect(f);
    if (c.click) {
      const n = mkNoise(ctx, t, t + 0.02), hp = bq(ctx, 'highpass', 2400, 0.7), cg = decayEnv(ctx, bus.in, t, 0.0004, 0.005, vel * c.click * c.lv);
      n.connect(hp); hp.connect(cg);
    }
  }

  /** 808 sub: sine (+ a little triangle so the note still speaks on small speakers) with a quick pitch drop and a long decay */
  function subVoice(ctx, bus, t, dur, notes, vel, c) {
    const fq = mtof(notes[0]), hold = Math.max(0.05, dur * c.gate), r = c.r, tEnd = t + hold + r * 2.6 + 0.05;
    const o = mkOsc(ctx, c.wave, fq, t, tEnd);
    o.frequency.setValueAtTime(fq * c.drop, t);
    o.frequency.exponentialRampToValueAtTime(fq, t + c.dt);
    const g = adsr(ctx, bus.in, t, hold, 0.004, c.d, c.s, r, vel * c.lv);
    o.connect(g);
  }

  /** distorted riff bass: a sub-weighted saw + a detuned saw -> resonant lowpass (the lane's drive / cab stages do the rest) */
  function riffVoice(ctx, bus, t, dur, notes, vel, c) {
    const fq = mtof(notes[0]), hold = Math.max(c.a + 0.006, dur * c.gate), r = c.r, tEnd = t + hold + r * 2.6 + 0.03;
    const f = envLP(ctx, t, c.cut, c.fst, c.ft, c.q);
    const g = adsr(ctx, bus.in, t, hold, c.a, c.d, c.s, r, vel * c.lv);
    f.connect(g);
    const o1 = mkOsc(ctx, c.wave, c.wave.sub ? fq / 2 : fq, t, tEnd), o2 = mkOsc(ctx, 'sawtooth', fq, t, tEnd);
    o2.detune.value = c.det;
    o1.connect(f); o2.connect(f);
  }

  /** cold arp / lead / alarm: pulse or saw (n detuned copies) through an enveloped lowpass, optional vibrato + pitch scoop + 2nd layer */
  function arpVoice(ctx, bus, t, dur, notes, vel, c) {
    const fq = mtof(notes[0]), hold = Math.max(c.a + 0.005, dur * c.gate), r = c.r, tEnd = t + hold + r * 2.6 + 0.03;
    const f = envLP(ctx, t, c.cut, c.fst, c.ft, c.q);
    const g = adsr(ctx, bus.in, t, hold, c.a, c.d, c.s, r, vel * c.lv);
    f.connect(g);
    const N = clamp(c.n | 0 || 1, 1, 5), offs = sawOffsets(N), lv = 1 / Math.sqrt(N);
    for (let i = 0; i < N; i++) {
      const o = mkOsc(ctx, c.wave, fq, t, tEnd);
      o.detune.value = offs[i] * c.spread;
      if (c.scoop && hold > 0.12) { o.detune.setValueAtTime(offs[i] * c.spread - c.scoop, t); o.detune.linearRampToValueAtTime(offs[i] * c.spread, t + 0.035); }
      viber(bus, o);
      if (N > 1) { const og = gn(ctx, lv); o.connect(og); og.connect(f); } else o.connect(f);
    }
    if (c.pw2) { const o = mkOsc(ctx, c.pw2, fq / 2, t, tEnd), og = gn(ctx, c.pwl); o.connect(og); og.connect(f); }
  }

  /** Karplus-Strong twang (generated buffer) with a quick pitch scoop.  Tremolo / spring reverb live on the lane. */
  function twangVoice(ctx, bus, t, dur, notes, vel, c) {
    const m = notes[0], buf = ksBuffer(ctx, m), hold = Math.max(0.03, dur * c.gate);
    const rate0 = c.bend ? Math.pow(2, -c.bend / 12) : 1;
    const tEnd = Math.min(t + buf.duration / Math.min(rate0, 1) + 0.05, t + hold + c.ring + 0.75);   // the string is stopped once its release fade (tau 0.1 s) is inaudible
    const s = mkBuf(ctx, buf, t, tEnd);
    if (c.bend) { s.playbackRate.setValueAtTime(rate0, t); s.playbackRate.exponentialRampToValueAtTime(1, t + 0.07); }
    if (c.detune) s.detune.value = c.detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel * c.lv, t);
    g.gain.setTargetAtTime(0, t + hold + c.ring, 0.1);
    const f = bq(ctx, 'lowpass', clamp(c.cut * (0.55 + 0.6 * vel), 800, 16000), 0.6);
    s.connect(f); f.connect(g); g.connect(bus.in);
  }

  /** 2-operator FM bell / vibes.  mr = modulator ratio, idx = modulation index at the attack (decays with id), p2 = second carrier ratio */
  function bellVoice(ctx, bus, t, dur, notes, vel, c) {
    const fq = mtof(notes[0]), tEnd = t + c.d * 1.6 + 0.1, hold = Math.max(0.05, dur * c.gate);
    const car = mkOsc(ctx, 'sine', fq, t, tEnd), mod = mkOsc(ctx, 'sine', fq * c.mr, t, tEnd);
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(fq * c.idx, t);
    mg.gain.setTargetAtTime(fq * c.idx * c.ie, t, c.id / 3);
    mod.connect(mg); mg.connect(car.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * c.lv, t + 0.0015);
    g.gain.setTargetAtTime(0, t + 0.0015, c.d / 5);
    if (c.damp) g.gain.setTargetAtTime(0, t + hold, 0.05);
    car.connect(g); g.connect(bus.in);
    if (c.p2g) {
      const c2 = mkOsc(ctx, 'sine', fq * c.p2, t, tEnd), g2 = ctx.createGain();
      g2.gain.setValueAtTime(vel * c.lv * c.p2g, t); g2.gain.setTargetAtTime(0, t, c.d / 9);
      c2.connect(g2); g2.connect(bus.in);
    }
    if (c.mallet) {
      const n = mkNoise(ctx, t, t + 0.03), bp = bq(ctx, 'bandpass', fq * 3, 2), ng = decayEnv(ctx, bus.in, t, 0.0004, 0.006, vel * c.mallet * c.lv);
      n.connect(bp); bp.connect(ng);
    }
  }

  // ---- instrument table: fmt = default pattern format of a lane, mono = notes are cut at the next one, lo = default register of the chord root
  //      (rel patterns), src = number of source nodes a note needs (compile-time budget estimate), d = parameter defaults (lane / section `cfg` override) ----
  INST.super = { fmt: 'chord', play: chordVoice, src: (c, k) => k + (c.sub ? 1 : 0), cost: 0.12,
    d: { n: 5, spread: 16, cut: 5600, q: 0.7, fst: 1.7, ft: 0.35, a: 0.012, d: 0.4, s: 0.85, r: 0.3, gate: 0.97, lv: 0.215, sub: 0, voicing: { lo: 55, hi: 79, n: 4 } } };
  INST.stab = { fmt: 'chord', play: chordVoice, src: (c, k) => k, cost: 0.1,
    d: { n: 5, spread: 20, cut: 4200, q: 0.9, fst: 3.2, ft: 0.16, a: 0.004, d: 0.22, s: 0.25, r: 0.14, gate: 0.9, lv: 0.276, sub: 0, voicing: { lo: 55, hi: 79, n: 4 } } };
  INST.pad = { fmt: 'chord', play: chordVoice, src: (c, k) => k, cost: 0.1,
    d: { n: 3, spread: 11, cut: 1500, q: 0.6, fst: 0.35, ft: 1.4, a: 0.9, d: 1.2, s: 0.9, r: 1.1, gate: 1.0, lv: 0.218, sub: 0, voicing: { lo: 50, hi: 74, n: 4 } } };
  INST.choir = { fmt: 'chord', play: choirVoice, src: (c, k) => k, cost: 0.2,
    d: { spread: 9, vowel: 'ah', a: 0.7, d: 1.0, s: 0.9, r: 1.0, gate: 1.0, lv: 0.137, fm: 6.0, voicing: { lo: 55, hi: 76, n: 3 } } };
  INST.pick = { fmt: 'rel', mono: true, play: pickVoice, src: () => 1, lo: 40, cost: 0.08,
    d: { wave: { saw: 0.7, pulse: 0.45, duty: 0.3, sub: 0.45 }, cut: 900, fst: 3.6, ft: 0.14, q: 2.2, a: 0.003, d: 0.35, s: 0.3, r: 0.07, gate: 0.9, lv: 0.20, click: 0 } };
  INST.wood = { fmt: 'rel', mono: true, play: pickVoice, src: () => 1, lo: 36, cost: 0.08,
    d: { wave: { tri: 0.5, saw: 0.7, sub: 0.45 }, cut: 900, fst: 3.5, ft: 0.1, q: 1.0, a: 0.004, d: 0.5, s: 0.12, r: 0.1, gate: 0.85, lv: 0.8, click: 0 } };
  INST.sub = { fmt: 'rel', mono: true, play: subVoice, src: () => 1, lo: 28, cost: 0.05,
    d: { wave: { sin: 1, tri: 0.22 }, drop: 2.2, dt: 0.035, d: 1.0, s: 0.55, r: 0.09, gate: 0.96, lv: 1.0 } };
  INST.riff = { fmt: 'rel', mono: true, play: riffVoice, src: () => 2, lo: 33, cost: 0.1,
    d: { wave: { saw: 1, sub: 0.7 }, cut: 1400, fst: 2.2, ft: 0.1, q: 4, a: 0.003, d: 0.25, s: 0.7, r: 0.05, gate: 0.82, lv: 0.9, det: 11 } };
  INST.arp = { fmt: 'rel', mono: true, play: arpVoice, src: (c) => (c.n | 0 || 1) + (c.pw2 ? 1 : 0), lo: 57, cost: 0.08,
    d: { wave: 0.25, n: 1, spread: 8, cut: 2600, fst: 2.4, ft: 0.13, q: 3, a: 0.003, d: 0.14, s: 0.18, r: 0.06, gate: 0.7, lv: 1.9, pw2: 0, pwl: 0.4 } };      // lv 1.9 (was 0.17): FIXPLAN_V3 A5, the cold arp sat 20-37 dB under its band and could not be heard (lane vols stay as authored)
  INST.lead = { fmt: 'notes', mono: true, play: arpVoice, src: (c) => (c.n | 0 || 2), cost: 0.1,
    d: { wave: 'sawtooth', n: 2, spread: 9, cut: 3600, fst: 1.8, ft: 0.25, q: 1.2, a: 0.008, d: 0.2, s: 0.8, r: 0.1, gate: 0.94, lv: 0.112, scoop: 25 } };
  INST.alarm = { fmt: 'notes', mono: true, play: arpVoice, src: (c) => (c.n | 0 || 2) + 1, cost: 0.12,
    d: { wave: 0.5, n: 2, spread: 14, cut: 3000, fst: 2.4, ft: 0.2, q: 6, a: 0.004, d: 0.15, s: 0.85, r: 0.05, gate: 0.95, lv: 0.16, pw2: 'sawtooth', pwl: 0.5, scoop: 60 } };
  INST.twang = { fmt: 'notes', play: twangVoice, src: () => 1, cost: 0.05,
    d: { cut: 6500, lv: 0.767, gate: 0.9, ring: 0.45, bend: 0.35, detune: 0 } };
  INST.bell = { fmt: 'notes', play: bellVoice, src: () => 3, cost: 0.12,
    d: { mr: 3.5, idx: 1.4, ie: 0.05, id: 0.18, d: 1.6, gate: 1.0, lv: 0.122, p2: 2.76, p2g: 0.22, mallet: 0.1, damp: false } };
  INST.vibes = { fmt: 'notes', play: bellVoice, src: () => 3, cost: 0.12,
    d: { mr: 4.0, idx: 0.7, ie: 0.04, id: 0.1, d: 1.1, gate: 1.0, lv: 0.227, p2: 3.99, p2g: 0.12, mallet: 0.22, damp: true } };

  // ================================================================================================
  // DRUM KIT.  fn(ctx, bus, t, v): one hit into bus.in at time t, velocity v (0..1.3)
  // ================================================================================================
  function nzHit(ctx, dest, t, type, f, q, tau, v, a, len) {          // enveloped filtered noise burst (the building block of snares / hats / claps)
    const n = mkNoise(ctx, t, t + (len || tau * 7) + 0.02), fl = bq(ctx, type, f, q), g = decayEnv(ctx, dest, t, a === undefined ? 0.0008 : a, tau, v);
    n.connect(fl); fl.connect(g);
    return g;
  }
  function sineHit(ctx, dest, t, f0, f1, sweep, tau, v, type) {        // pitched drop: kicks, toms, thuds
    const life = tau * 8, dur = Math.min(life, 3.2);                    // composer fix v2.0: a long boom (impact tau 0.75 s) no longer keeps its oscillator alive for 6 s (a finished jingle track
    const o = mkOsc(ctx, type || 'sine', f1, t, t + dur + 0.05);        // used to linger ~4.5 s after its end): the tail is faded out from 2.9 s on, at -37 dB and 31 Hz, inaudible
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + sweep);
    const g = decayEnv(ctx, dest, t, 0.0008, tau, v);
    if (life > dur) g.gain.setTargetAtTime(0, t + dur - 0.3, 0.07);
    o.connect(g);
    return g;
  }
  function kMachine(ctx, bus, t, v) {                     // 80s drum-machine kick: short, round, mid-heavy with a soft beater
    sineHit(ctx, bus.in, t, 150, 58, 0.055, 0.075, v * 1.0);
    sineHit(ctx, bus.in, t, 320, 100, 0.02, 0.02, v * 0.35, 'triangle');
    nzHit(ctx, bus.in, t, 'highpass', 1800, 0.7, 0.005, v * 0.3, 0.0005, 0.03);
  }
  function kEdm(ctx, bus, t, v) {                      // modern EDM kick: fast sweep, click, long sub tail (the lane's drive adds harmonics)
    sineHit(ctx, bus.in, t, 235, 47, 0.05, 0.14, v * 1.0);
    sineHit(ctx, bus.in, t, 130, 56, 0.018, 0.035, v * 0.55, 'triangle');
    nzHit(ctx, bus.in, t, 'bandpass', 3600, 0.9, 0.004, v * 0.45, 0.0004, 0.025);
  }
  function kBoom(ctx, bus, t, v) {                     // long 808 kick
    sineHit(ctx, bus.in, t, 120, 38, 0.16, 0.38, v * 1.0);
    sineHit(ctx, bus.in, t, 240, 80, 0.02, 0.03, v * 0.4, 'triangle');
    nzHit(ctx, bus.in, t, 'bandpass', 2400, 0.8, 0.004, v * 0.3, 0.0004, 0.02);
  }
  function snGate(ctx, bus, t, v) {                    // 80s gated-reverb snare: crack + body + a flat noise wash that is cut dead after ~120 ms
    nzHit(ctx, bus.in, t, 'bandpass', 2300, 0.55, 0.04, v * 0.95, 0.0006, 0.2);
    sineHit(ctx, bus.in, t, 215, 165, 0.03, 0.03, v * 0.55, 'triangle');
    const n = mkNoise(ctx, t, t + 0.2), hp = bq(ctx, 'highpass', 650, 0.6), lp = bq(ctx, 'lowpass', 6800, 0.5), g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v * 0.5, t + 0.005);
    g.gain.linearRampToValueAtTime(v * 0.38, t + 0.105);
    g.gain.linearRampToValueAtTime(0, t + 0.124);              // the gate
    n.connect(hp); hp.connect(lp); lp.connect(g); g.connect(bus.in);
  }
  function snHard(ctx, bus, t, v, crush) {             // tight modern snare
    let dest = bus.in;
    if (crush) { const sh = ctx.createWaveShaper(); sh.curve = crushCurve(crush); sh.connect(dest); dest = sh; }
    nzHit(ctx, dest, t, 'highpass', 1100, 0.6, 0.075, v * 1.0, 0.0005, 0.27);
    nzHit(ctx, dest, t, 'bandpass', 4200, 0.8, 0.02, v * 0.5, 0.0005, 0.1);
    sineHit(ctx, dest, t, 235, 175, 0.025, 0.035, v * 0.7, 'triangle');
  }
  const snCrush = (ctx, bus, t, v) => snHard(ctx, bus, t, v * 1.05, 4);
  function snGhost(ctx, bus, t, v) {
    nzHit(ctx, bus.in, t, 'bandpass', 2800, 0.7, 0.03, v * 0.55, 0.0008, 0.2);
    sineHit(ctx, bus.in, t, 200, 170, 0.02, 0.02, v * 0.25, 'triangle');
  }
  function snBrush(ctx, bus, t, v) {                   // brushed snare: a soft swish with a slow attack
    nzHit(ctx, bus.in, t, 'bandpass', 4300, 0.45, 0.07, v * 0.45, 0.018, 0.55);
    nzHit(ctx, bus.in, t, 'highpass', 6000, 0.5, 0.05, v * 0.2, 0.012, 0.4);
  }
  function clap(ctx, bus, t, v) {                      // hand clap: four staggered bursts + a tail
    [0, 0.0105, 0.0215, 0.032].forEach((at, i) => nzHit(ctx, bus.in, t + at, 'bandpass', 1500 + i * 100, 1.1, 0.009, v * 0.7, 0.0005, 0.04));
    nzHit(ctx, bus.in, t + 0.032, 'bandpass', 1350, 0.9, 0.06, v * 0.6, 0.001, 0.4);
  }
  function snap(ctx, bus, t, v) {                      // finger snap: a dry "tick" with a hollow body (FIXPLAN_V3 A6: x3.5, the snaps are the only percussion of the title / ending intro and were 13 dB under the twang band)
    nzHit(ctx, bus.in, t, 'bandpass', 2700, 3.2, 0.014, v * 3.5, 0.0004, 0.12);
    nzHit(ctx, bus.in, t, 'highpass', 5200, 0.7, 0.004, v * 1.2, 0.0003, 0.03);
    sineHit(ctx, bus.in, t, 1300, 520, 0.02, 0.012, v * 1.4);
  }
  function rim(ctx, bus, t, v) {
    sineHit(ctx, bus.in, t, 1750, 1600, 0.01, 0.008, v * 0.6, 'square');
    sineHit(ctx, bus.in, t, 480, 440, 0.01, 0.02, v * 0.5, 'triangle');
    nzHit(ctx, bus.in, t, 'bandpass', 3200, 1.5, 0.006, v * 0.4, 0.0003, 0.04);
  }
  const tomAt = (f) => (ctx, bus, t, v) => {
    sineHit(ctx, bus.in, t, f * 1.7, f, 0.05, 0.11, v * 1.0);
    nzHit(ctx, bus.in, t, 'bandpass', f * 6, 1, 0.006, v * 0.3, 0.0004, 0.04);
  };
  const hatC = (ctx, bus, t, v) => { const g = nzHit(ctx, bus.in, t, 'highpass', 7600, 0.7, 0.0125, v * 0.9, 0.0004, 0.12); return g; };
  const hatO = (ctx, bus, t, v) => { nzHit(ctx, bus.in, t, 'highpass', 6800, 0.6, 0.075, v * 0.8, 0.0006, 0.6); };
  function metal(ctx, bus, t, v, tau, lenS, bpF, hpF, loop) {  // 808 metallic hat / ride from the generated six-square buffer
    const len = lenS || tau * 8, s = mkBuf(ctx, metalBuffer(ctx), t, t + len + 0.02);
    if (loop) s.loop = true;
    const bp = bq(ctx, 'bandpass', bpF, 0.6), hp = bq(ctx, 'highpass', hpF, 0.7), g = decayEnv(ctx, bus.in, t, 0.0005, tau, v);
    s.connect(bp); bp.connect(hp); hp.connect(g);
  }
  // FIXPLAN_V3 A2: the six-square source is ~15 dB under noise hats after the 6.5 kHz high-pass, so the metal hats carry a make-up of x7.3 / x6.75 (K-active m / M = h / o, was -17 dB)
  const metC = (ctx, bus, t, v) => metal(ctx, bus, t, v * 6.2, 0.02, 0.2, 9500, 6500);
  const metO = (ctx, bus, t, v) => metal(ctx, bus, t, v * 5.4, 0.13, 0.9, 9000, 6000, true);
  const ride = (ctx, bus, t, v) => { metal(ctx, bus, t, v * 0.55, 0.32, 1.6, 6200, 3500, true); nzHit(ctx, bus.in, t, 'highpass', 8000, 0.7, 0.02, v * 0.18, 0.0004, 0.15); };
  function crash(ctx, bus, t, v) {
    nzHit(ctx, bus.in, t, 'highpass', 3600, 0.5, 0.5, v * 0.7, 0.002, 3.4);
    metal(ctx, bus, t, v * 0.5, 0.4, 2.4, 7200, 4500, true);
  }
  // industrial: ring-modulated inharmonic clangs, noise bursts
  function clang(ctx, bus, t, v, f, tau, dest) {
    const tEnd = t + tau * 9 + 0.05, out = decayEnv(ctx, dest || bus.in, t, 0.0006, tau, v), hp = bq(ctx, 'highpass', f * 0.6, 0.7);
    hp.connect(out);
    [[f, f * 1.4142, 1], [f * 2.76, f * 3.51, 0.6]].forEach(([fc, fm, amp]) => {
      const c = mkOsc(ctx, 'sine', fc, t, tEnd), m = mkOsc(ctx, 'square', fm, t, tEnd), rm = ctx.createGain(), lv = gn(ctx, amp);
      rm.gain.value = 0; m.connect(rm.gain); c.connect(rm); rm.connect(lv); lv.connect(hp);
    });
    nzHit(ctx, dest || bus.in, t, 'bandpass', f * 4, 1.2, 0.006, v * 0.5, 0.0003, 0.04);
  }
  const clangLo = (ctx, bus, t, v) => clang(ctx, bus, t, v * 0.9, 190, 0.28);
  const clangHi = (ctx, bus, t, v) => clang(ctx, bus, t, v * 0.8, 560, 0.2);
  function noiseHit(ctx, bus, t, v) {
    const sh = ctx.createWaveShaper(); sh.curve = crushCurve(5); sh.connect(bus.in);
    nzHit(ctx, sh, t, 'bandpass', 900, 0.8, 0.07, v * 1.0, 0.0004, 0.5);
    sineHit(ctx, sh, t, 170, 48, 0.07, 0.07, v * 0.8);
  }
  function blast(ctx, bus, t, v) { nzHit(ctx, bus.in, t, 'highpass', 450, 0.5, 0.04, v * 0.9, 0.0005, 0.3); }

  /** drum grid char -> [kit lane, voice, triggers the sidechain] */
  const KIT = {
    k: ['kick', kMachine, true], K: ['kick', kEdm, true], b: ['kick', kBoom, true],
    s: ['snare', snGate], S: ['snare', snHard], y: ['snare', snCrush], n: ['snare', snGhost], B: ['snare', snBrush], p: ['snare', clap],
    f: ['perc', snap], r: ['perc', rim], t: ['perc', tomAt(200)], u: ['perc', tomAt(145)], v: ['perc', tomAt(100)],
    h: ['hats', hatC], o: ['hats', hatO], m: ['hats', metC], M: ['hats', metO], d: ['hats', ride], c: ['hats', crash],
    x: ['perc', clangLo], X: ['perc', clangHi], z: ['perc', noiseHit], w: ['perc', blast],
  };
  const KIT_LANES = ['kick', 'snare', 'hats', 'perc'];
  const KIT_LV = 0.47, FX_LV = 0.23;               // calibration: a full kit pattern / the fx family at lane vol 1 sit at about -21 / -22 LUFS
  const KIT_DUCK_DEFAULT = 'kKbq';                  // chars that trigger the sidechain (q = silent trigger)

  // ================================================================================================
  // FX voices: fn(ctx, bus, t, D seconds, v)
  // ================================================================================================
  function fxRiser(ctx, bus, t, D, v) {
    const e = t + D;
    const n = mkNoise(ctx, t, e + 0.06), bp = bq(ctx, 'bandpass', 250, 1.3), g = ctx.createGain();
    bp.frequency.setValueAtTime(250, t); bp.frequency.exponentialRampToValueAtTime(9500, e);
    g.gain.setValueAtTime(0.02 * v, t); g.gain.exponentialRampToValueAtTime(v * 0.9, e); g.gain.linearRampToValueAtTime(0, e + 0.035);
    n.connect(bp); bp.connect(g); g.connect(bus.in);
    const o = mkOsc(ctx, 'sawtooth', 90, t, e + 0.06), lp = bq(ctx, 'lowpass', 600, 2), g2 = ctx.createGain();
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(1300, e);
    lp.frequency.setValueAtTime(500, t); lp.frequency.exponentialRampToValueAtTime(7000, e);
    g2.gain.setValueAtTime(0.01 * v, t); g2.gain.exponentialRampToValueAtTime(v * 0.28, e); g2.gain.linearRampToValueAtTime(0, e + 0.035);
    o.connect(lp); lp.connect(g2); g2.connect(bus.in);
  }
  function fxDown(ctx, bus, t, D, v) {
    const e = t + D;
    const n = mkNoise(ctx, t, e + 0.05), bp = bq(ctx, 'bandpass', 9000, 1.1), g = ctx.createGain();
    bp.frequency.setValueAtTime(9000, t); bp.frequency.exponentialRampToValueAtTime(220, e);
    g.gain.setValueAtTime(v * 0.9, t); g.gain.exponentialRampToValueAtTime(0.001, e);
    n.connect(bp); bp.connect(g); g.connect(bus.in);
    const o = mkOsc(ctx, 'sawtooth', 1100, t, e + 0.05), lp = bq(ctx, 'lowpass', 5000, 2), g2 = ctx.createGain();
    o.frequency.setValueAtTime(1100, t); o.frequency.exponentialRampToValueAtTime(70, e);
    lp.frequency.setValueAtTime(5000, t); lp.frequency.exponentialRampToValueAtTime(300, e);
    g2.gain.setValueAtTime(v * 0.25, t); g2.gain.exponentialRampToValueAtTime(0.001, e);
    o.connect(lp); lp.connect(g2); g2.connect(bus.in);
  }
  function fxSwell(ctx, bus, t, D, v) {                // reverse-reverb swell: dark noise that blooms and is cut at the downbeat
    const e = t + D;
    const n = mkNoise(ctx, t, e + 0.03), lp = bq(ctx, 'lowpass', 500, 0.8), hp = bq(ctx, 'highpass', 250, 0.6), g = ctx.createGain();
    lp.frequency.setValueAtTime(500, t); lp.frequency.exponentialRampToValueAtTime(7500, e);
    g.gain.setValueAtTime(0.0006, t); g.gain.exponentialRampToValueAtTime(v, e - 0.004); g.gain.setValueAtTime(0, e);
    n.connect(lp); lp.connect(hp); hp.connect(g); g.connect(bus.in);
  }
  function fxImpact(ctx, bus, t, D, v) {               // cinematic hit: sub drop, noise burst that closes down, shimmering crash
    sineHit(ctx, bus.in, t, 92, 31, 0.5, 0.75, v * 1.0);
    sineHit(ctx, bus.in, t, 190, 62, 0.08, 0.1, v * 0.5, 'triangle');
    const n = mkNoise(ctx, t, t + 2.2), lp = bq(ctx, 'lowpass', 7000, 0.7), g = decayEnv(ctx, bus.in, t, 0.001, 0.32, v * 0.8);
    lp.frequency.setValueAtTime(7000, t); lp.frequency.exponentialRampToValueAtTime(180, t + 1.4);
    n.connect(lp); lp.connect(g);
    nzHit(ctx, bus.in, t, 'highpass', 4200, 0.6, 0.35, v * 0.3, 0.001, 2.6);
  }
  function fxZap(ctx, bus, t, D, v) {
    const e = t + Math.min(D, 0.3);
    const o = mkOsc(ctx, 'sawtooth', 3400, t, e + 0.05), lp = bq(ctx, 'lowpass', 5000, 3), g = ctx.createGain();
    o.frequency.setValueAtTime(3400, t); o.frequency.exponentialRampToValueAtTime(160, e);
    lp.frequency.setValueAtTime(7000, t); lp.frequency.exponentialRampToValueAtTime(400, e);
    g.gain.setValueAtTime(v * 0.6, t); g.gain.exponentialRampToValueAtTime(0.001, e);
    o.connect(lp); lp.connect(g); g.connect(bus.in);
  }
  const FXV = { riser: fxRiser, down: fxDown, swell: fxSwell, impact: fxImpact, zap: fxZap };
  INST.fx = { fmt: 'fx', play: null, src: () => 4, cap: 4, d: { lv: 1 } };

  // ================================================================================================
  // SFX synth primitives.  All take (ctx, dest, t, o, P): P = {f: pitch factor, v: volume factor} from the sfx() options.
  // ================================================================================================
  function outStage(ctx, node, dest, o) {               // optional pan / bit-crush stage shared by every primitive
    let out = node;
    if (o.crush) { const sh = ctx.createWaveShaper(); sh.curve = crushCurve(o.crush); out.connect(sh); out = sh; }
    if (o.pan) { const p = ctx.createStereoPanner(); p.pan.value = o.pan; out.connect(p); out = p; }
    out.connect(dest);
  }
  /**
   * tone: oscillator with an optional exponential pitch path, lowpass sweep and amplitude envelope.
   *  o.w   'sine'|'tri'|'saw'|'square'|number (pulse duty)    o.f / o.f2   start / end Hz    o.pts [[seconds, Hz], ...] explicit pitch path
   *  o.d   duration (s)    o.v peak gain    o.a attack (s)    o.sh 'exp' (default) | 'hold' (flat, then release o.r)    o.at start offset
   *  o.vib [Hz, cents, delay s]    o.lp [f0, f1, q] lowpass sweep over the duration    o.fix true = ignore the sfx pitch option
   *  o.pan -1..1    o.crush bits
   */
  function sTone(ctx, dest, t, o, P) {
    const pf = P && !o.fix ? P.f : 1, pv = P ? P.v : 1;
    t += o.at || 0;
    const d = o.d, osc = mkOsc(ctx, o.w || 'sine', 100, t, t + d + 0.03);
    const pts = o.pts || [[0, o.f], [d, o.f2 || o.f]];
    osc.frequency.setValueAtTime(pts[0][1] * pf, t);
    for (let i = 1; i < pts.length; i++) osc.frequency.exponentialRampToValueAtTime(pts[i][1] * pf, t + pts[i][0]);
    if (o.vib && d > o.vib[2] + 0.04) vibrato(osc, t + o.vib[2], d - o.vib[2], o.vib[0], o.vib[1]);
    let node = osc;
    if (o.lp) {
      const f = bq(ctx, 'lowpass', o.lp[0], o.lp[2] === undefined ? 1 : o.lp[2]);
      f.frequency.setValueAtTime(o.lp[0], t); f.frequency.exponentialRampToValueAtTime(o.lp[1], t + d);
      osc.connect(f); node = f;
    }
    const g = ctx.createGain(), v = o.v * pv, a = Math.min(o.a === undefined ? 0.004 : o.a, d * 0.5);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    if (o.sh === 'hold') {
      const r = Math.min(o.r === undefined ? 0.03 : o.r, d - a);
      g.gain.setValueAtTime(v, t + d - r); g.gain.linearRampToValueAtTime(0, t + d);
    } else g.gain.exponentialRampToValueAtTime(0.0008, t + d);
    node.connect(g);
    outStage(ctx, g, dest, o);
  }
  /** Sine vibrato on osc.detune via one value curve (cheap, no LFO nodes). Depth ramps in over ~0.15 s. */
  function vibrato(osc, t0, dur, hz, cents) {
    if (!osc.detune) return;
    const n = Math.max(16, Math.ceil(dur * 60)), curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * dur; curve[i] = Math.sin(2 * Math.PI * hz * x) * cents * Math.min(1, x / 0.15); }
    osc.detune.setValueCurveAtTime(curve, t0, dur);
  }
  /** noise: filtered white noise burst.  o.ft filter type, o.f / o.f2 centre/cutoff sweep, o.q, o.d, o.v, o.a, o.at, o.pan, o.crush */
  function sNoise(ctx, dest, t, o, P) {
    const pf = P && !o.fix ? P.f : 1, pv = P ? P.v : 1;
    t += o.at || 0;
    const d = o.d, src = mkNoise(ctx, t, t + d + 0.03), f = bq(ctx, o.ft || 'bandpass', o.f * pf, o.q === undefined ? 0.8 : o.q);
    if (o.f2) { f.frequency.setValueAtTime(o.f * pf, t); f.frequency.exponentialRampToValueAtTime(o.f2 * pf, t + d); }      // anchored at the start (FIXPLAN_V3 A1): an exponential ramp without a start event runs from context time 0, so in the live game (t >> d) every noise sweep sat on its end frequency
    const g = ctx.createGain(), v = o.v * pv, a = Math.min(o.a === undefined ? 0.003 : o.a, d * 0.5);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0008, t + d);
    src.connect(f); f.connect(g);
    outStage(ctx, g, dest, o);
  }
  /** FM bell: carrier f, modulator f*mr with an index that decays from `idx` to idx*ie (time constant id/3 s); amplitude exp decay over d */
  function sBell(ctx, dest, t, o, P) {
    const pf = P && !o.fix ? P.f : 1, pv = P ? P.v : 1;
    t += o.at || 0;
    const f = o.f * pf, d = o.d, mr = o.mr || 3.5, idx = o.idx === undefined ? 0.9 : o.idx;
    const car = mkOsc(ctx, 'sine', f, t, t + d + 0.04), mod = mkOsc(ctx, 'sine', f * mr, t, t + d + 0.04), mg = ctx.createGain();
    mg.gain.setValueAtTime(f * idx, t); mg.gain.setTargetAtTime(f * idx * (o.ie === undefined ? 0.05 : o.ie), t, (o.id || 0.06) / 3);
    mod.connect(mg); mg.connect(car.frequency);
    const g = ctx.createGain(), v = o.v * pv;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.0015); g.gain.exponentialRampToValueAtTime(0.0008, t + d);
    car.connect(g);
    outStage(ctx, g, dest, o);
    if (o.p2) {                                             // inharmonic shimmer partial
      const c2 = mkOsc(ctx, 'sine', f * o.p2, t, t + d * 0.6 + 0.04), g2 = ctx.createGain();
      g2.gain.setValueAtTime(v * 0.28, t); g2.gain.exponentialRampToValueAtTime(0.0008, t + d * 0.6);
      c2.connect(g2); outStage(ctx, g2, dest, o);
    }
  }
  /** ring-modulated clang: two carrier/modulator pairs with irrational ratios, exp decay, optional highpass */
  function sRing(ctx, dest, t, o, P) {
    const pf = P && !o.fix ? P.f : 1, pv = P ? P.v : 1;
    t += o.at || 0;
    const f = o.f * pf, d = o.d, e = t + d + 0.04, hp = bq(ctx, 'highpass', f * 0.55, 0.7), g = ctx.createGain(), v = o.v * pv;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.0007); g.gain.exponentialRampToValueAtTime(0.0008, t + d);
    hp.connect(g);
    [[f, f * (o.r || 1.4142), 1], [f * 2.76, f * 3.51, 0.55]].forEach(([fc, fm, amp]) => {
      const c = mkOsc(ctx, 'sine', fc, t, e), m = mkOsc(ctx, 'square', fm, t, e), rm = ctx.createGain(), lv = gn(ctx, amp);
      rm.gain.value = 0; m.connect(rm.gain); c.connect(rm); rm.connect(lv); lv.connect(hp);
    });
    outStage(ctx, g, dest, o);
  }
  /** mini supersaw stab / swell: o.f = Hz or [Hz...], n saws each, cutoff sweep o.cut [c0, c1] */
  function sSaws(ctx, dest, t, o, P) {
    const pf = P && !o.fix ? P.f : 1, pv = P ? P.v : 1;
    t += o.at || 0;
    const fs = Array.isArray(o.f) ? o.f : [o.f], N = o.n || 5, offs = sawOffsets(N), d = o.d, e = t + d + 0.04;
    const f = bq(ctx, 'lowpass', o.cut[0], o.q || 1);
    f.frequency.setValueAtTime(o.cut[0], t); f.frequency.exponentialRampToValueAtTime(o.cut[1], t + d * 0.8);
    const g = ctx.createGain(), v = o.v * pv / Math.sqrt(N * fs.length), a = Math.min(o.a === undefined ? 0.01 : o.a, d * 0.5);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0008, t + d);
    for (const fr of fs) for (let i = 0; i < N; i++) { const s = mkOsc(ctx, 'sawtooth', fr * pf, t, e); s.detune.value = offs[i] * (o.spread || 16); s.connect(f); }
    f.connect(g);
    outStage(ctx, g, dest, o);
  }
  /** Kit handed to sfx definitions: all calls are relative to the sfx start time.  k.semi = the pitch option (semitones). */
  function sfxKit(ctx, dest, t, P) {
    return {
      semi: P ? Math.round(12 * Math.log2(P.f)) : 0,
      tone: (o) => sTone(ctx, dest, t, o, P),
      noise: (o) => sNoise(ctx, dest, t, o, P),
      bell: (o) => sBell(ctx, dest, t, o, P),
      ring: (o) => sRing(ctx, dest, t, o, P),
      saws: (o) => sSaws(ctx, dest, t, o, P),
      /** run of equal-length tones: freqs[], spacing `step`, template o */
      seq: (freqs, step, o) => freqs.forEach((f, i) => sTone(ctx, dest, t, Object.assign({}, o, { f, f2: f, at: (o.at || 0) + i * step, d: o.d || step * 1.4 }), P)),
      /** run of FM bells */
      bells: (freqs, step, o) => freqs.forEach((f, i) => sBell(ctx, dest, t, Object.assign({}, o, { f, at: (o.at || 0) + i * step }), P)),
    };
  }

  // ================================================================================================
  // SFX bank  (glassy / digital / neon; every sound feeds a short shared reverb: `rev` = send level)
  // ================================================================================================
  // trim: per-sfx loudness calibration -- fitted on the K-WEIGHTED active level (ITU-R BS.1770 K filter, 10 ms windows within 25 dB of the
  //   loudest) by `node test/audio_analyze.mjs --apply-trims`, so a thud and a bell of the same fitted level are equally loud (SPEC_V2 §6).
  // max: concurrent instances.  quiet: true = 9 dB below the target, a number = that many dB below (land: 12).  lvl: dB ABOVE the target for
  // very short, fast-decaying sounds (the ear integrates over ~100-200 ms: boss_hit +3, enemy_shot +1.5, jump / pop +1).
  // Energy plan: the heavy sounds (thunder / bomb / boss_hit / boss_die / land) keep their weight in a 200-2500 Hz band plus a short sub
  // tail, so they survive laptop and phone speakers.
  const SFX = {
    jump: { max: 2, rev: 0.14, trim: 1.336, lvl: 1, fn(k) {            // rubbery digital blip up
      k.tone({ w: 'tri', pts: [[0, 330], [0.05, 520], [0.13, 800]], d: 0.14, v: 0.5, lp: [1900, 4600, 1.5] });
      k.tone({ w: 0.25, pts: [[0, 660], [0.12, 1500]], d: 0.12, v: 0.2, lp: [2600, 5200, 1] });
      k.bell({ f: 1320, mr: 2, idx: 0.7, id: 0.05, d: 0.1, v: 0.2, at: 0.03 });
      k.noise({ ft: 'bandpass', f: 3000, q: 1.5, d: 0.025, v: 0.1 });
    } },
    shoot: { max: 2, rev: 0.2, trim: 1.101, fn(k) {                     // soap-bubble blow: glassy rising plinks + airy puff
      k.tone({ w: 'sine', pts: [[0, 480], [0.09, 1180]], d: 0.1, v: 0.5 });
      k.bell({ f: 1500, mr: 1.5, idx: 0.5, id: 0.05, d: 0.1, v: 0.32, at: 0.045 });
      k.tone({ w: 'sine', pts: [[0, 760], [0.08, 1700]], d: 0.09, v: 0.22, at: 0.05 });
      k.noise({ ft: 'bandpass', f: 2400, f2: 4400, q: 1.3, d: 0.08, v: 0.13 });
    } },
    pop: { max: 3, rev: 0.16, trim: 0.59, lvl: 1, fn(k) {              // crisp pop with a tiny sub thump
      k.noise({ ft: 'highpass', f: 3600, d: 0.05, v: 0.5 });
      k.tone({ w: 'sine', pts: [[0, 1900], [0.07, 430]], d: 0.08, v: 0.5 });
      k.tone({ w: 'sine', pts: [[0, 125], [0.05, 52]], d: 0.1, v: 0.7, fix: true });
      k.bell({ f: 2600, mr: 2.4, idx: 0.5, id: 0.03, d: 0.07, v: 0.16 });
    } },
    trap: { max: 2, rev: 0.28, trim: 0.952, fn(k) {                     // enemy sealed in: shimmering upward chime
      k.bells([784, 1047, 1319, 1760], 0.05, { d: 0.32, v: 0.34, mr: 3.5, idx: 0.8, id: 0.07 });
      k.tone({ w: 'sine', pts: [[0, 700], [0.25, 2900]], d: 0.28, v: 0.14 });
      k.noise({ ft: 'bandpass', f: 1500, f2: 7200, q: 2, d: 0.26, v: 0.1, a: 0.05 });
    } },
    kill: { max: 3, rev: 0.16, trim: 0.75, fn(k) {                     // punchy digital zap with a metallic transient; the pitch option climbs with the chain
      const sm = Math.max(0, k.semi), vs = (1 - 0.018 * sm) * (sm >= 6 ? 1.45 : 1);     // the +6.. variants carry a bell tail (more quiet frames in the K-active mean): +3.2 dB keeps the ladder flat (FIXPLAN_V3 A1, warm fit)
      k.ring({ f: 2200, r: 1.41, d: 0.06, v: 0.5 * vs });
      k.tone({ w: 'saw', pts: [[0, 2600], [0.13, 320]], d: 0.16, v: 0.55 * vs, lp: [7000, 1000, 2] });
      k.tone({ w: 0.25, pts: [[0, 1040], [0.1, 520]], d: 0.1, v: 0.3 * vs, at: 0.02 });
      k.tone({ w: 'sine', pts: [[0, 190], [0.18, 62]], d: 0.24, v: 0.32 * (1 - 0.035 * sm), fix: true });   // the thump keeps its pitch (a little less of it as the chain climbs, so the climb is heard)
      if (sm >= 6) k.bell({ f: 2093, at: 0.11, d: 0.26, v: 0.2 * vs });
    } },
    bounce: { max: 2, rev: 0.12, trim: 1.022, fn(k) {                   // rubbery synth blip
      k.tone({ w: 'tri', pts: [[0, 200], [0.04, 640], [0.12, 330], [0.2, 430], [0.26, 370]], d: 0.27, v: 0.62, vib: [26, 90, 0.03], lp: [2800, 1300, 3] });
      k.bell({ f: 440, mr: 1, idx: 2, ie: 0.1, id: 0.05, d: 0.13, v: 0.18 });
    } },
    food: { max: 3, rev: 0.26, trim: 0.8, fn(k) {                     // sparkle chime
      k.bell({ f: 1568, d: 0.2, v: 0.42, p2: 2.76 });
      k.bell({ f: 2349, at: 0.06, d: 0.3, v: 0.42, p2: 2.76 });
      k.bell({ f: 3136, at: 0.11, d: 0.3, v: 0.24 });
      k.noise({ ft: 'highpass', f: 9000, d: 0.2, v: 0.05, at: 0.06 });
    } },
    powerup: { max: 1, rev: 0.26, trim: 2.137, lvl: 2.5, fn(k) {                  // rising supersaw arp into a swelling chord
      k.seq([659, 784, 988, 1175, 1319, 1568, 1976], 0.04, { w: 'saw', v: 0.28, d: 0.07, lp: [3000, 5200, 1] });
      k.saws({ f: [659, 988, 1319], n: 5, at: 0.3, d: 0.44, v: 0.55, cut: [1400, 7500], a: 0.04 });
      k.bell({ f: 2637, at: 0.3, d: 0.4, v: 0.2 });
    } },
    item_appear: { max: 1, rev: 0.3, trim: 1.041, fn(k) {               // bloop + three twinkles
      k.tone({ w: 'sine', pts: [[0, 520], [0.07, 1300]], d: 0.09, v: 0.34 });
      k.bell({ f: 2093, at: 0.07, d: 0.24, v: 0.3 });
      k.bell({ f: 2637, at: 0.12, d: 0.24, v: 0.3 });
      k.bell({ f: 3136, at: 0.17, d: 0.28, v: 0.27 });
      k.noise({ ft: 'highpass', f: 8000, d: 0.2, v: 0.05, at: 0.07 });
    } },
    letter: { max: 2, rev: 0.3, trim: 1.129, lvl: 3.0, fn(k) {                    // bright bell triad
      k.bells([784, 988, 1175], 0.08, { d: 0.42, v: 0.46, mr: 3.5, idx: 0.7, id: 0.08, p2: 2.76 });
      k.noise({ ft: 'highpass', f: 7500, d: 0.15, v: 0.04, at: 0.16 });
    } },
    oneup: { max: 1, rev: 0.3, trim: 1.318, lvl: 0.5, fn(k) {                     // triumphant arp + supersaw chord + bell
      k.seq([392, 494, 587, 784, 988, 1175, 1568], 0.055, { w: 'saw', v: 0.28, d: 0.09, lp: [2600, 5000, 1] });
      k.saws({ f: [784, 988, 1175], n: 5, at: 0.39, d: 0.5, v: 0.55, cut: [2000, 8000], a: 0.02 });
      k.bell({ f: 1568, at: 0.39, d: 0.5, v: 0.28 });
      k.bell({ f: 2349, at: 0.45, d: 0.4, v: 0.2 });
    } },
    death: { max: 1, rev: 0.22, trim: 1.121, lvl: 1.5, fn(k) {                    // descending glitch + boom
      k.tone({ w: 'saw', pts: [[0, 880], [0.15, 600], [0.3, 360], [0.62, 90]], d: 0.66, v: 0.4, lp: [5200, 320, 2], vib: [16, 180, 0.05] });
      [0, 1, 2, 3, 4, 5].forEach((i) => k.tone({ w: 0.25, f: 760 - i * 90, f2: 700 - i * 95, d: 0.04, v: 0.22, at: i * 0.05, crush: 4 }));
      k.tone({ w: 'sine', pts: [[0, 150], [0.55, 32]], d: 0.65, v: 0.6, at: 0.14, fix: true });
      k.noise({ ft: 'lowpass', f: 3200, f2: 260, q: 0.7, d: 0.5, v: 0.26, at: 0.12 });
    } },
    hurry: { max: 1, rev: 0.16, trim: 2.002, lvl: 3.0, fn(k) {                    // dark synth alarm
      [0, 0.12, 0.24, 0.36, 0.48, 0.6].forEach((at, i) => k.tone({ w: 'saw', f: i % 2 ? 494 : 659, f2: i % 2 ? 480 : 640, d: 0.1, v: 0.34, at, lp: [2600, 1500, 4] }));
      k.tone({ w: 'square', f: 165, d: 0.7, v: 0.12, sh: 'hold', lp: [900, 700, 1] });
    } },
    ghost: { max: 1, rev: 0.4, trim: 1.068, lvl: 1.5, fn(k) {                     // eerie detuned whisper
      k.tone({ w: 'sine', pts: [[0, 392], [0.4, 470], [0.9, 372]], d: 0.95, v: 0.3, a: 0.22, vib: [5, 70, 0.1] });
      k.tone({ w: 'sine', pts: [[0, 397], [0.4, 476], [0.9, 377]], d: 0.95, v: 0.3, a: 0.25, vib: [6.2, 90, 0.12] });
      k.tone({ w: 'tri', pts: [[0, 196], [0.9, 186]], d: 0.95, v: 0.16, a: 0.3 });
      k.noise({ ft: 'bandpass', f: 1700, f2: 900, q: 6, d: 0.9, v: 0.26, a: 0.28 });
    } },
    thunder: { max: 1, rev: 0.2, trim: 0.61, fn(k) {                   // electric crack + rumble (energy above 200 Hz)
      k.noise({ ft: 'highpass', f: 2600, d: 0.08, v: 0.9, a: 0.0006 });
      k.tone({ w: 'saw', pts: [[0, 3400], [0.11, 190]], d: 0.15, v: 0.45, lp: [7000, 500, 2] });
      k.noise({ ft: 'bandpass', f: 1600, f2: 260, q: 0.6, d: 0.55, v: 0.85 });
      k.tone({ w: 'square', pts: [[0, 96], [0.4, 58]], d: 0.42, v: 0.22, lp: [900, 300, 1] });
      [0.05, 0.12, 0.2, 0.29].forEach((at, i) => k.noise({ ft: 'highpass', f: 3000 + i * 900, d: 0.025, v: 0.35, at }));
    } },
    fire: { max: 1, rev: 0.16, trim: 1.767, fn(k) {                     // whoosh + crackle
      k.noise({ ft: 'bandpass', f: 420, f2: 2200, q: 0.9, d: 0.44, v: 0.85, a: 0.08 });
      k.tone({ w: 'saw', pts: [[0, 130], [0.36, 300]], d: 0.4, v: 0.14, a: 0.06, lp: [800, 2000, 1] });
      [0.06, 0.13, 0.2, 0.26, 0.33].forEach((at, i) => k.noise({ ft: 'highpass', f: 2600 + i * 650, d: 0.02, v: 0.22, at }));
    } },
    water: { max: 1, rev: 0.3, trim: 1.678, fn(k) {                     // bubbly swoosh
      k.noise({ ft: 'bandpass', f: 650, f2: 1700, q: 2.5, d: 0.46, v: 0.28, a: 0.06 });
      [[620, 0], [880, 0.06], [740, 0.11], [1040, 0.17], [820, 0.23], [1200, 0.3]].forEach(([f, at]) =>
        k.tone({ w: 'sine', f, f2: f * 1.9, d: 0.075, v: 0.34, at }));
      k.bell({ f: 1760, at: 0.2, d: 0.25, v: 0.12, mr: 2 });
    } },
    freeze: { max: 1, rev: 0.34, trim: 0.865, fn(k) {                   // crystalline down-shimmer
      k.bells([3136, 2637, 2349, 1976, 1568, 1319], 0.055, { d: 0.26, v: 0.3, mr: 3.5, idx: 0.6, id: 0.05 });
      k.tone({ w: 'sine', pts: [[0, 2300], [0.4, 520]], d: 0.45, v: 0.15, vib: [22, 120, 0] });
      k.noise({ ft: 'highpass', f: 7000, d: 0.36, v: 0.07 });
    } },
    bomb: { max: 1, rev: 0.24, trim: 0.505, fn(k) {                     // industrial impact + sub drop
      k.ring({ f: 170, r: 1.41, d: 0.55, v: 0.55 });
      k.noise({ ft: 'bandpass', f: 2600, f2: 280, q: 0.5, d: 0.75, v: 0.95, crush: 6 });
      k.tone({ w: 'saw', pts: [[0, 320], [0.5, 60]], d: 0.55, v: 0.28, lp: [3000, 300, 1] });
      k.tone({ w: 'sine', pts: [[0, 150], [0.6, 30]], d: 0.7, v: 0.5, fix: true });
      k.noise({ ft: 'highpass', f: 2200, d: 0.07, v: 0.5 });
    } },
    menu_move: { max: 2, rev: 0.1, trim: 0.426, quiet: true, fn(k) {    // soft clean tick
      k.tone({ w: 'sine', f: 1760, d: 0.05, v: 0.4, a: 0.002 });
      k.noise({ ft: 'highpass', f: 6000, d: 0.012, v: 0.07 });
    } },
    menu_select: { max: 1, rev: 0.22, trim: 0.954, fn(k) {              // soft chime up
      k.bell({ f: 880, d: 0.18, v: 0.45, mr: 2, idx: 0.5 });
      k.bell({ f: 1320, at: 0.055, d: 0.34, v: 0.45, mr: 2, idx: 0.5, p2: 2.76 });
    } },
    pause: { max: 1, rev: 0.06, trim: 1.194, fn(k) {                    // soft chime down (must be over, with its stop padding, within the 320 ms before a hard pause suspends the context)
      k.bell({ f: 988, d: 0.1, v: 0.45, mr: 2, idx: 0.5 });
      k.bell({ f: 659, at: 0.07, d: 0.14, v: 0.45, mr: 2, idx: 0.5 });
    } },
    boss_hit: { max: 2, rev: 0.2, trim: 1.091, lvl: 3, fn(k) {          // metallic clang + thud (mid-heavy: survives small speakers)
      k.ring({ f: 420, r: 1.47, d: 0.3, v: 0.62 });
      k.ring({ f: 1130, r: 1.22, d: 0.18, v: 0.34 });
      k.noise({ ft: 'bandpass', f: 2200, f2: 700, q: 0.9, d: 0.2, v: 0.75 });
      k.tone({ w: 'sine', pts: [[0, 280], [0.1, 70]], d: 0.28, v: 0.35, fix: true });
    } },
    boss_die: { max: 1, rev: 0.3, trim: 0.685, fn(k) {                  // cascading explosions, reverse swell, one big industrial boom (~1.2 s, no chime tail)
      k.noise({ ft: 'lowpass', f: 250, f2: 7000, q: 0.7, d: 0.62, v: 0.5, a: 0.5, at: 0.05 });                // reverse swell into the boom
      for (let i = 0; i < 4; i++) {
        const at = i * 0.12;
        k.noise({ ft: 'bandpass', f: 3000 - i * 330, f2: 280, q: 0.6, d: 0.3, v: 0.85 - i * 0.05, at, crush: 6 });
        k.tone({ w: 'saw', pts: [[0, 300 - i * 25], [0.26, 60]], d: 0.28, v: 0.28, at, lp: [3000, 300, 1] });
        k.tone({ w: 'sine', pts: [[0, 120 - i * 8], [0.28, 30]], d: 0.3, v: 0.35, at, fix: true });
      }
      k.ring({ f: 150, r: 1.41, d: 0.7, v: 0.45, at: 0.68 });
      k.noise({ ft: 'bandpass', f: 2200, f2: 190, q: 0.5, d: 0.55, v: 1.0, at: 0.68, crush: 7 });
      k.tone({ w: 'saw', pts: [[0, 260], [0.45, 45]], d: 0.5, v: 0.32, at: 0.68, lp: [2500, 250, 1] });
      k.tone({ w: 'sine', pts: [[0, 110], [0.5, 26]], d: 0.58, v: 0.5, at: 0.68, fix: true });
    } },
    enemy_shot: { max: 3, rev: 0.12, trim: 1.388, lvl: 1.5, fn(k) {      // digital pew
      k.tone({ w: 'saw', pts: [[0, 1100], [0.1, 330]], d: 0.12, v: 0.5, lp: [4200, 900, 2] });
      k.tone({ w: 0.25, pts: [[0, 2200], [0.06, 800]], d: 0.07, v: 0.2 });
      k.noise({ ft: 'bandpass', f: 2200, q: 1, d: 0.04, v: 0.15 });
    } },
    spawn: { max: 3, rev: 0.34, trim: 1.731, fn(k) {                    // materialise: swelling shimmer into a glass ping
      k.noise({ ft: 'bandpass', f: 600, f2: 4200, q: 2, d: 0.22, v: 0.25, a: 0.05 });
      k.tone({ w: 'sine', pts: [[0, 390], [0.1, 780], [0.2, 1170]], d: 0.22, v: 0.3, vib: [18, 80, 0] });
      k.bell({ f: 2349, at: 0.16, d: 0.2, v: 0.22 });
    } },
    land: { max: 2, rev: 0.06, trim: 0.313, quiet: 12, fn(k) {          // soft tick + thump
      k.noise({ ft: 'bandpass', f: 1100, q: 1.2, d: 0.045, v: 0.35 });
      k.tone({ w: 'tri', pts: [[0, 360], [0.05, 160]], d: 0.07, v: 0.4 });
      k.tone({ w: 'sine', pts: [[0, 130], [0.06, 70]], d: 0.08, v: 0.3 });
    } },
    clear: { max: 1, rev: 0.34, trim: 0.902, fn(k) {                    // round-clear stinger (~0.7 s): bright ping run into a sparkling bell chord
      k.seq([784, 988, 1175, 1568], 0.075, { w: 'saw', v: 0.28, d: 0.1, lp: [3000, 5500, 1] });
      k.bells([1568, 1175, 988], 0, { at: 0.3, d: 0.4, v: 0.34, mr: 3.5, idx: 0.6, id: 0.07, p2: 2.76 });
      k.saws({ f: [784, 1175], n: 5, at: 0.3, d: 0.36, v: 0.3, cut: [3000, 8000], a: 0.02 });
      k.noise({ ft: 'highpass', f: 8000, d: 0.3, v: 0.05, at: 0.3 });
    } },
  };

  /** sfx() options -> {f: frequency factor, v: gain factor}; junk values fall back to 0 st / 1.0 */
  function sfxParams(def, opts) {
    const semis = Number.isFinite(+(opts && opts.pitch)) ? clamp(+opts.pitch, -48, 48) : 0;
    const vol = opts && opts.vol !== undefined && Number.isFinite(+opts.vol) ? clamp(+opts.vol, 0, 2) : 1;
    return { f: Math.pow(2, semis / 12), v: vol * (def.trim === undefined ? 1 : def.trim) };
  }
  const sfxDef = (name) => (typeof name === 'string' && Object.prototype.hasOwnProperty.call(SFX, name) ? SFX[name] : null);

  // ================================================================================================
  // NOTATION: parsing + compilation  (song def -> program {events[step]})
  // ================================================================================================
  const PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  const NOTE_RE = /^([a-g])([#b]?)(-?\d)(?:\/(\d+))?([',]*)$/;
  const REST_RE = /^r(?:\/(\d+))?$/;
  const CHORDN_RE = /^\[([^\]]+)\](?:\/(\d+))?([',]*)$/;
  const CHORD_RE = /^([A-G])([#b]?)([^/@]*)(?:@([A-G][#b]?))?(?:\/(\d+))?$/;
  const QUAL = {
    '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], m7b5: [0, 3, 6, 10], dim: [0, 3, 6],
    sus: [0, 5, 7], sus4: [0, 5, 7], sus2: [0, 2, 7], '7sus': [0, 5, 7, 10], '6': [0, 4, 7, 9], m6: [0, 3, 7, 9], '5': [0, 7],
    add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14], maj9: [0, 4, 7, 11, 14], m9: [0, 3, 7, 10, 14], '9': [0, 4, 7, 10, 14], m11: [0, 3, 7, 10, 14, 17],
    dim7: [0, 3, 6, 9], aug: [0, 4, 8], '7b9': [0, 4, 7, 10, 13], mmaj7: [0, 3, 7, 11], '69': [0, 4, 7, 9, 14], '7#9': [0, 4, 7, 10, 15],
    'maj7#11': [0, 4, 7, 11, 18], m7b9: [0, 3, 7, 10, 13],
  };
  const NOTE_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const ACC_MARK = { "'": 1.28, ',': 0.6 };

  /** `c5/2 d5'/1 r/4 [e4,g4,b4]/8 ...` -> {ev:[{s,n,m:[midi],vel}], steps, bars:[stepsPerBar]}.  `|` = bar line (validated). */
  function parseNotes(str, issues, tag) {
    const ev = [], bars = [];
    let step = 0, barStart = 0;
    const toks = String(str || '').replace(/\|/g, ' | ').split(/\s+/);
    for (const tok of toks) {
      if (!tok) continue;
      if (tok === '|') { if (step !== barStart) { bars.push(step - barStart); barStart = step; } continue; }
      let m = REST_RE.exec(tok);
      if (m) { step += m[1] ? +m[1] : 2; continue; }
      m = NOTE_RE.exec(tok);
      if (m) {
        const n = m[4] ? +m[4] : 2, midi = 12 * (+m[3] + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
        let vel = 1; for (const ch of m[5]) vel *= ACC_MARK[ch];
        ev.push({ s: step, n, m: [midi], vel });
        step += n;
        continue;
      }
      m = CHORDN_RE.exec(tok);
      if (m) {
        const ms = m[1].split(',').map((x) => NOTE_RE.exec(x.trim()));
        if (ms.some((x) => !x)) { issues.push(tag + ': bad chord token "' + tok + '"'); continue; }
        const n = m[2] ? +m[2] : 2;
        let vel = 1; for (const ch of m[3]) vel *= ACC_MARK[ch];
        ev.push({ s: step, n, m: ms.map((x) => 12 * (+x[3] + 1) + PC[x[1]] + (x[2] === '#' ? 1 : x[2] === 'b' ? -1 : 0)), vel });
        step += n;
        continue;
      }
      issues.push(tag + ': bad token "' + tok + '"');
    }
    if (step !== barStart) bars.push(step - barStart);
    return { ev, steps: step, bars };
  }

  /** `| G | Em.Am7 | C/8 | Am7@E |` -> {list:[{s,n,root,ints,name,bass}], steps, bars}.  `.` splits a bar, `/n` explicit length, `@X` slash bass. */
  function parseChords(str, issues, tag) {
    const list = [], bars = [];
    let step = 0;
    for (const barStr of String(str || '').split('|')) {
      const b = barStr.trim();
      if (!b) continue;
      const parsed = b.split(/\s*\.\s*/).map((tk) => {
        const m = CHORD_RE.exec(tk.trim());
        if (!m || !QUAL[m[3]]) { issues.push(tag + ': bad chord "' + tk + '"'); return null; }
        const root = (NOTE_PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
        const bass = m[4] ? (NOTE_PC[m[4][0]] + (m[4][1] === '#' ? 1 : m[4][1] === 'b' ? -1 : 0) + 12) % 12 : null;
        return { root, ints: QUAL[m[3]], name: tk.trim(), n: m[5] ? +m[5] : 0, bass };
      }).filter(Boolean);
      if (!parsed.length) continue;
      // a bar with some explicit lengths (`Em/12.D`): the chords without one share the rest of the 16 steps
      const explicitSum = parsed.reduce((a, c) => a + c.n, 0), free = parsed.filter((c) => !c.n).length;
      const share = free ? Math.max(1, Math.floor((explicitSum ? Math.max(0, STEPS_PER_BAR - explicitSum) : STEPS_PER_BAR) / free)) : 0;
      const barStart = step;
      for (const c of parsed) {
        const n = c.n || share;
        list.push({ s: step, n, root: c.root, ints: c.ints, name: c.name, bass: c.bass });
        step += n;
      }
      bars.push(step - barStart);
    }
    return { list, steps: step, bars };
  }

  // chord-relative symbol -> semitones above the chord root
  function symbolOffset(sym, ints) {
    switch (sym) {
      case '0': return -12;
      case '1': return 0;
      case '2': return 2;
      case '3': return ints[1];
      case '4': return 5;
      case '5': return ints.length > 2 ? ints[2] : ints[ints.length - 1];      // composer fix v2.0: power chords ('B5' = [0, 7]) have no third: the fifth is the last tone (was NaN)
      case '6': return 9;
      case '7': return ints[3] !== undefined && ints[3] < 12 ? ints[3] : 11;
      case '8': return 12;
      case '9': return 14;
      case 'a': return ints[1] + 12;
      case 'c': return (ints.length > 2 ? ints[2] : ints[ints.length - 1]) + 12;
      case 'e': return (ints[3] !== undefined && ints[3] < 12 ? ints[3] : 11) + 12;
      case 'b': return ints.length > 2 ? ints[2] : ints[ints.length - 1];                 // fifth (alias of 5)
      case 'f': return 1;                       // composer addition v2.0: minor second above the root (b2, the Phrygian colour)
      case 'g': return 8;                       // minor sixth (b6)
      case 'h': return 6;                       // tritone (b5)
      default: return null;
    }
  }
  const rootMidi = (pc, lo) => lo + ((pc - lo) % 12 + 12) % 12;

  // ---- pattern grids: one char per 16th step, modifiers ' (accent) , (soft) ^ (+oct) _ (-oct) attach to the preceding char -----------
  const PATS = {
    // drums
    four: 'K...K...K...K...', fourk: 'k...k...k...k...', pulse: 'q...q...q...q...',
    backbeat: '....s.......s...', half: '........s.......', hat8: 'h.h.h.h.h.h.h.h.', hat16: 'hhhhhhhhhhhhhhhh', offhat: '..o...o...o...o.',
    roll: 'RRRRRRRRRRRRRRRR', roll8: '........RRRRRRRR', none: '................', snaps: '....f.......f...',
    // chord lanes
    hold: 'x---------------', hold2: 'x-------x-------', stab: '..x...x...x...x.', stabs8: 'x.x.x.x.x.x.x.x.', sync: 'x..x..x.x..x..x.',
    // bass / arp (chord-relative)
    root: '1---------------', root2: '1-------1-------', root8: '1-1-1-1-1-1-1-1-', oct8: '1-8-1-8-1-8-1-8-', gal: '1181118111811181', pump: '1-1-8-1-1-1-8-1-',
    arp16: '1358a853c8531358', arp8: '1.3.5.8.a.8.5.3.', arpup: '135813581358135a',
  };
  /** one cell -> tokens [{c, acc, oct}] (one token per step) */
  function tokenizeCell(cell) {
    const toks = [];
    for (const ch of cell) {
      if (ch === "'" || ch === ',') { if (toks.length) toks[toks.length - 1].acc *= ACC_MARK[ch]; continue; }
      if (ch === '^' || ch === '_') { if (toks.length) toks[toks.length - 1].oct += ch === '^' ? 12 : -12; continue; }
      toks.push({ c: ch, acc: 1, oct: 0 });
    }
    return toks;
  }
  /** pattern string -> {bars: [16 tokens each]} ; names resolve through song pats, then PATS; `name*3` repeats; cells tile (len | 16) or span bars (len % 16 = 0) */
  function buildGrid(str, pats, issues, tag) {
    const bars = [];
    const words = String(str || '').replace(/\|/g, ' ').split(/\s+/).filter(Boolean);
    for (const w of words) {
      const m = /^(.*?)(?:\*(\d+))?$/.exec(w);
      let body = m[1];
      const rep = m[2] ? +m[2] : 1;
      if (pats && Object.prototype.hasOwnProperty.call(pats, body)) body = pats[body];
      else if (Object.prototype.hasOwnProperty.call(PATS, body)) body = PATS[body];
      for (const cell of String(body).split(/\s+/).filter(Boolean)) {
        const toks = tokenizeCell(cell);
        if (!toks.length) continue;
        if (toks.length < STEPS_PER_BAR && STEPS_PER_BAR % toks.length === 0) {
          const t16 = []; for (let i = 0; i < STEPS_PER_BAR; i++) t16.push(toks[i % toks.length]);
          for (let r = 0; r < rep; r++) bars.push(t16);
        } else if (toks.length % STEPS_PER_BAR === 0) {
          for (let r = 0; r < rep; r++) for (let b = 0; b < toks.length / STEPS_PER_BAR; b++) bars.push(toks.slice(b * STEPS_PER_BAR, (b + 1) * STEPS_PER_BAR));
        } else issues.push(tag + ': pattern cell "' + cell + '" has ' + toks.length + ' steps (must divide 16 or be a multiple of 16)');
      }
    }
    return bars;
  }

  // ---- voicing: chord -> MIDI notes with smooth voice leading ---------------------------------------------------------------------------
  function voiceChord(chord, v, prev) {
    const lo = v.lo, hi = v.hi, n = v.n || 4;
    const pcs = [];
    for (const i of chord.ints) { const pc = (chord.root + i) % 12; if (pcs.indexOf(pc) < 0) pcs.push(pc); }
    let best = null, bestScore = 1e9;
    for (let r = 0; r < pcs.length; r++) {
      const order = [];
      for (let i = 0; i < n; i++) order.push(pcs[(r + i) % pcs.length]);
      let cur = lo + ((order[0] - lo) % 12 + 12) % 12;
      const notes = [cur];
      for (let i = 1; i < n; i++) { let nx = cur + (((order[i] - cur) % 12) + 12) % 12; if (nx === cur) nx += 12; notes.push(nx); cur = nx; }
      while (notes[notes.length - 1] > hi && notes[0] - 12 >= lo - 2) for (let i = 0; i < notes.length; i++) notes[i] -= 12;
      const top = notes[notes.length - 1];
      let score = (top > hi ? (top - hi) * 3 : 0) + (notes[0] < lo - 2 ? 20 : 0);
      for (const i of chord.ints) if (i >= 12 && notes[0] % 12 === (chord.root + i) % 12) score += 12;      // composer fix v2.0: an extension (9th / 11th) is never the lowest voice
      for (let i = 1; i < notes.length; i++) {            // composer fix v2.0: no muddy clusters (adjacent semitones, minor 9ths, low seconds / 9ths) in the voicing
        const dv = notes[i] - notes[i - 1];
        if (dv === 1) score += notes[i - 1] < 72 ? 40 : 10; else if (dv === 13) score += 14; else if (dv === 14 && notes[i - 1] < 58) score += 6; else if (dv === 2 && notes[i - 1] < 55) score += 3;
      }
      if (prev) { for (let i = 0; i < Math.min(prev.length, notes.length); i++) score += Math.abs(notes[i] - prev[i]); }
      else score += Math.abs((notes[0] + top) / 2 - (lo + hi) / 2);
      if (score < bestScore) { bestScore = score; best = notes; }
    }
    if (v.open && best.length >= 4) { best = best.slice(); best[best.length - 2] -= 12; best.sort((a, b) => a - b); }
    return best;
  }

  // lane-bus keys (everything else in a lane config belongs to the instrument)
  const BUS_KEYS = ['vol', 'pan', 'rev', 'hall', 'spr', 'dly', 'duck', 'duckRel', 'lpf', 'lq', 'hpf', 'drive', 'crush', 'chorus', 'trem', 'vib', 'width', 'inst', 'fmt', 'slash'];
  const KIT_DEFAULT = {
    kick: { vol: 1.0 }, snare: { vol: 1.0, hall: 0.1 }, hats: { vol: 0.7 }, perc: { vol: 0.9 },
  };
  const DEFAULT_AUTO = { vol: 1, lpf: 20000, hpf: 10, rev: 0, hall: 0, spr: 0, dly: 0, pan: 0 };
  const AUTO_HZ = { lpf: 1, hpf: 1 };

  function parsePos(tok) { const m = /^(\d+(?:\.\d+)?)(b?)$/.exec(tok); return m ? Math.round(+m[1] * (m[2] ? STEPS_PER_BAR : 1)) : NaN; }

  function compileSong(name) {
    const def = songDefs()[name];
    const issues = [];
    const prog = {
      name, kind: def.kind || 'loop', bpm: def.bpm, swing: def.swing === undefined ? 0.5 : def.swing, echo: def.echo || 0, fb: def.fb === undefined ? DELAY_SEND_FB : def.fb,
      key: def.key, mode: def.mode, steps: 0, loopStart: 0, events: [], placeholder: !!def.placeholder, gain: def.gain === undefined ? 1 : def.gain,
      meta: { lead: [], notes: [], chords: [], issues, sections: [] },
      lift: def.lift || 0,                  // semitones added to every pitched voice on every second pass of a loop
      maxTempo: def.maxTempo || 0,          // cap for AUDIO.setTempo() on this track (0 = none)
      lanes: [], laneMap: {}, master: { lpf: false, hpf: false, vol: false }, autoKeys: new Set(),
      duckOn: def.duckOn || KIT_DUCK_DEFAULT, duckRel: def.duckRel === undefined ? 0.55 : def.duckRel,
    };
    // ---- declare lanes ----
    const declare = (ln, cfg) => {
      if (prog.laneMap[ln]) return prog.laneMap[ln];
      const base = Object.assign({}, KIT_DEFAULT[ln] || {}, cfg || {});
      if (!base.inst) base.inst = KIT_LANES.indexOf(ln) >= 0 ? 'kit' : (ln === 'fx' ? 'fx' : null);
      if (!base.inst || (base.inst !== 'kit' && !INST[base.inst])) { issues.push(name + ': lane "' + ln + '" has no valid instrument ("' + base.inst + '")'); base.inst = 'lead'; }
      const L = { name: ln, cfg: base, inst: base.inst, needs: {}, duckAny: !!base.duck, used: false };
      prog.lanes.push(L); prog.laneMap[ln] = L;
      return L;
    };
    for (const ln of Object.keys(def.lanes || {})) declare(ln, def.lanes[ln]);
    const laneOf = (ln, tag) => {
      if (prog.laneMap[ln]) return prog.laneMap[ln];
      if (KIT_LANES.indexOf(ln) >= 0 || ln === 'fx') return declare(ln, null);
      issues.push(tag + ': undeclared lane "' + ln + '"');
      return null;
    };
    const seq = (def.intro || []).concat(def.order);
    const loopIdx = (def.intro || []).length;
    let off = 0;
    seq.forEach((sn, i) => {
      if (i === loopIdx) prog.loopStart = off;
      const sec = def.sections[sn];
      if (!sec) { issues.push(name + ': unknown section "' + sn + '"'); return; }
      off += compileSection(prog, def, sec, sn, off, issues, laneOf);
    });
    prog.steps = off;
    finishSong(prog);
    return prog;
  }

  function addEv(prog, step, ev) {
    if (step < 0 || step >= 1e5) return;
    (prog.events[step] || (prog.events[step] = [])).push(ev);
  }

  /**
   * Compile one section.  FIXPLAN_V3 A8: a loop section may carry `alt: { p, mix, dbl, dblVel }` -- the SECOND-PASS version of the section (every odd pass of the loop: counter-melody,
   * octave doubling, fills, a different lane balance).  The section is compiled twice (the second time with the `alt` patterns / mix merged over the original ones) and the two event lists
   * are diffed per step: events that are identical stay unflagged (they sound in every pass), events only in the first version get `o: 0` (even passes only), events only in the second
   * `o: 1` (odd passes only) -- so drums, sidechain triggers, fx and the chord lanes need no special handling.  `dbl: { lane: semitones }` adds a transposed copy of that lane's
   * notes (velocity x dblVel, default 0.55) to the second version.  The first pass of a stage is always the original composition.  Only the lanes the alt version touches (its `p`
   * keys, `mix` keys and `dbl` sources; the drum grids + sidechain count as one unit) are recompiled and diffed, so a song with a few alt sections compiles ~1.5x as fast as a full double compile.
   */
  function compileSection(prog, def, sec, sn, off, issues, laneOf) {
    const mem0 = sec.alt && prog.voiceMem ? JSON.parse(JSON.stringify(prog.voiceMem)) : null;
    const steps = compileSectionOnce(prog, def, sec, sn, off, issues, laneOf);
    if (!sec.alt) return steps;
    if (prog.kind !== 'loop' || (def.intro || []).indexOf(sn) >= 0) { issues.push(prog.name + '.' + sn + ': alt only makes sense in a loop section (not in the intro / a jingle)'); return steps; }
    const A = sec.alt, tag = prog.name + '.' + sn + '.alt';
    for (const k of Object.keys(A)) if (['p', 'mix', 'dbl', 'dblVel'].indexOf(k) < 0) issues.push(tag + ': unknown key "' + k + '" (p mix dbl dblVel)');
    // shadow program: shares lanes / lane map / master flags, owns events, notes and the voice-leading memory
    const sh2 = Object.create(prog);
    sh2.events = []; sh2.meta = { lead: [], notes: [], chords: [], issues, sections: [] }; sh2.voiceMem = mem0 || {}; sh2.sectionsForReset = []; sh2.autoKeys = new Set();
    const sec2 = Object.assign({}, sec, { p: Object.assign({}, sec.p || {}, A.p || {}), mix: Object.assign({}, sec.mix || {}, A.mix || {}), alt: null });
    // scope: only the lanes (and the drum grids + sidechain as one 'drums' unit) the alt version touches are recompiled and diffed; a section-wide `mix: { all }` recompiles everything
    let only = new Set();
    for (const k of Object.keys(A.p || {})) only.add(k === 'drums' || k === 'drums2' || k === 'drums3' ? 'drums' : k);
    for (const k of Object.keys(A.mix || {})) { if (k === 'all') only = null; else if (only) only.add(k === 'drums' || KIT_LANES.indexOf(k) >= 0 ? 'drums' : k); }
    if (only) for (const k of Object.keys(A.dbl || {})) only.add(k);
    compileSectionOnce(sh2, def, sec2, sn, off, issues, laneOf, only);
    // doublings: dbl: { lead: 12 } (a transposed copy of the lane's notes) or { lead: { semi: -12, to: 'twang', vel: 0.6, bars: [1, 4] } } (other lane / bar range, 1-based, inclusive)
    for (const ln of Object.keys(A.dbl || {})) {
      const spec = typeof A.dbl[ln] === 'number' ? { semi: A.dbl[ln] } : (A.dbl[ln] || {});
      const semi = +spec.semi, to = spec.to || ln, vel = spec.vel === undefined ? (A.dblVel === undefined ? 0.55 : A.dblVel) : spec.vel;
      const Lt = laneOf(to, tag);
      if (!Lt || !Number.isFinite(semi) || !INST[Lt.inst] || !INST[Lt.inst].play) { issues.push(tag + '.dbl: bad lane / interval for "' + ln + '"'); continue; }
      Lt.used = true;
      const instT = INST[Lt.inst], cfgT = Object.assign({}, instT.d, Lt.cfg, (sec.cfg && sec.cfg[to]) || {});
      const b0 = spec.bars ? (spec.bars[0] - 1) * STEPS_PER_BAR : 0, b1 = spec.bars ? spec.bars[1] * STEPS_PER_BAR : steps;
      for (let s = off + b0; s < Math.min(off + steps, off + b1); s++) for (const e of (sh2.events[s] || []).slice()) {
        if (e.k !== 'n' || e.lane !== ln) continue;
        addEv(sh2, s, { k: 'n', lane: to, play: instT.play, n: e.n, m: e.m.map((x) => x + semi), vel: e.vel * vel, c: to === ln ? e.c : cfgT, dbl: 1 });
        for (const m of e.m) sh2.meta.notes.push({ s, n: e.n, m: m + semi, v: to });
      }
    }
    // diff the two versions per step
    const cfgKey = new Map(), keyOf = (e) => {
      switch (e.k) {
        case 'n': { let ck = cfgKey.get(e.c); if (ck === undefined) { ck = JSON.stringify(e.c); cfgKey.set(e.c, ck); } return 'n|' + e.lane + '|' + e.n + '|' + e.m.join(',') + '|' + e.vel.toFixed(4) + '|' + ck; }
        case 'd': return 'd|' + e.lane + '|' + (e.fn && e.fn.name) + '|' + e.vel.toFixed(4);
        case 'f': return 'f|' + e.lane + '|' + e.name + '|' + e.n + '|' + e.vel.toFixed(4);
        case 'u': return 'u|' + e.lane + '|' + e.depth.toFixed(4) + '|' + e.rel;
        default: return 'a|' + e.lane + '|' + e.p + '|' + e.v0 + '|' + e.v1;
      }
    };
    const inScope = !only ? () => true : (e) => (e.k === 'n' || e.k === 'f' ? only.has(e.lane) : (e.k === 'd' || e.k === 'u') && only.has('drums'));
    let nOdd = 0, nEven = 0;
    for (let s = off; s < off + steps; s++) {
      const base = (prog.events[s] || []).filter(inScope), alt = (sh2.events[s] || []).slice(), pool = new Map();
      for (const e of alt) { const k = keyOf(e); (pool.get(k) || pool.set(k, []).get(k)).push(e); }
      for (const e of base) {
        const list = pool.get(keyOf(e));
        if (list && list.length) list.pop(); else { e.o = 0; nEven++; }          // only in the original version: even passes
      }
      const left = new Set(); for (const list of pool.values()) for (const e of list) left.add(e);
      for (const e of alt) if (left.has(e)) { e.o = 1; nOdd++; (prog.events[s] || (prog.events[s] = [])).push(e); }   // only in the second version: odd passes
    }
    const seen = new Set(prog.meta.notes.map((x) => x.s + '|' + x.m + '|' + x.v));
    prog.meta.altNotes = (prog.meta.altNotes || []).concat(sh2.meta.notes.filter((x) => !seen.has(x.s + '|' + x.m + '|' + x.v)));
    (prog.meta.altSections || (prog.meta.altSections = [])).push({ name: sn, start: off, steps, odd: nOdd, even: nEven });
    if (!nOdd && !nEven) issues.push(tag + ': the alt version is identical to the original');
    return steps;
  }

  function compileSectionOnce(prog, def, sec, sn, off, issues, laneOf, only) {          // only: Set of lane names (+ 'drums') to compile -- the second-pass version of a section recompiles just what its `alt` touches
    const tag = prog.name + '.' + sn;
    const ch = parseChords(sec.chords, issues, tag + '.chords');
    const steps = ch.steps;
    ch.bars.forEach((b, i) => { if (b !== STEPS_PER_BAR && prog.kind !== 'jingle') issues.push(tag + '.chords: bar ' + (i + 1) + ' has ' + b + ' steps'); });
    prog.meta.sections.push({ name: sn, start: off, steps });
    for (const c of ch.list) prog.meta.chords.push({ s: off + c.s, n: c.n, root: c.root, ints: c.ints, name: c.name, bass: c.bass });
    const chordAt = (s) => { for (let i = ch.list.length - 1; i >= 0; i--) if (s >= ch.list[i].s) return ch.list[i]; return ch.list[0]; };
    const pats = Object.assign({}, def.pats || {}, sec.pats || {});
    const mixOf = (ln) => {
      let m = 1;
      const x = sec.mix || {};
      if (x[ln] !== undefined) m *= x[ln];
      if (x.all !== undefined) m *= x.all;
      if (KIT_LANES.indexOf(ln) >= 0 && x.drums !== undefined) m *= x.drums;
      return m;
    };
    const P = Object.assign({}, sec.p || {});
    if (sec.fx) P.fx = sec.fx;

    // ---------- pitched lanes ----------
    const DRUM_KEYS = ['drums', 'drums2', 'drums3'];            // drum grids: one hit per 16th per grid; extra grids LAYER (kick + hat on one step, snare + clap)
    const drumGrids = only && !only.has('drums') ? [] : DRUM_KEYS.filter((k) => P[k]).map((k) => [k, P[k]]);
    for (const k of DRUM_KEYS) delete P[k];
    for (const ln of Object.keys(P)) {
      if (only && !only.has(ln)) continue;
      const L = laneOf(ln, tag); if (!L) continue;
      L.used = true;
      if (L.inst === 'kit') { issues.push(tag + ': lane "' + ln + '" is a drum-kit lane -- write the grid into p.drums (or drums2 / drums3)'); continue; }
      const inst = INST[L.inst];
      const fmt = (L.cfg.fmt || (L.inst === 'kit' ? 'drums' : inst.fmt));
      const mx = mixOf(ln);
      const cfg = Object.assign({}, inst.d, L.cfg, (sec.cfg && sec.cfg[ln]) || {});
      const pre = /^\s*([nrc]):/.exec(P[ln]);
      const str = pre ? P[ln].slice(pre[0].length) : P[ln];
      const fm = pre ? { n: 'notes', r: 'rel', c: 'chord' }[pre[1]] : fmt;
      const play = inst.play;
      let evs = [];
      if (fm === 'fx') {
        for (const tok of String(str).split(/\s+/).filter(Boolean)) {
          const m = /^([a-z]+)@([0-9.]+b?)(?:\/([0-9.]+b?))?(?::([0-9.]+))?$/.exec(tok);
          if (!m || !FXV[m[1]]) { issues.push(tag + '.fx: bad token "' + tok + '"'); continue; }
          const s = parsePos(m[2]), n = m[3] ? parsePos(m[3]) : 4;
          if (!(s >= 0 && n > 0)) { issues.push(tag + '.fx: bad position in "' + tok + '"'); continue; }
          if (s >= steps) { issues.push(tag + '.fx: "' + tok + '" starts after the section'); continue; }
          if (mx > 0) addEv(prog, off + s, { k: 'f', lane: ln, name: m[1], n, vel: (m[4] ? +m[4] : 1) * mx });
        }
        continue;
      }
      if (fm === 'notes') {
        const nt = parseNotes(str, issues, tag + '.' + ln);
        nt.bars.forEach((b, i) => { if (ch.bars[i] !== undefined && b !== ch.bars[i]) issues.push(tag + '.' + ln + ': bar ' + (i + 1) + ' has ' + b + ' steps, chords have ' + ch.bars[i]); });
        if (nt.steps !== steps) issues.push(tag + '.' + ln + ': ' + nt.steps + ' steps vs chords ' + steps);
        evs = nt.ev.map((e) => ({ s: e.s, n: e.n, m: e.m, vel: e.vel }));
      } else if (fm === 'rel' || fm === 'chord') {
        const grid = buildGrid(str, pats, issues, tag + '.' + ln);
        if (!grid.length) { issues.push(tag + '.' + ln + ': empty pattern'); continue; }
        const v = cfg.voicing || { lo: 55, hi: 76, n: 4 };
        const lo = cfg.lo !== undefined ? cfg.lo : (inst.lo || 48);
        const slash = cfg.slash !== undefined ? cfg.slash : (fm === 'rel' && !!inst.mono && L.inst !== 'arp');
        let cur = null;
        const mem = prog.voiceMem || (prog.voiceMem = {});
        const flush = (endStep) => { if (cur) { cur.n = Math.max(1, endStep - cur.s); evs.push(cur); cur = null; } };
        const start = (s, tk, hold) => {
          const c = chordAt(s);
          let ms;
          if (fm === 'chord') { mem[ln] = voiceChord(c, v, mem[ln]); ms = mem[ln].slice(); }
          else {
            const off12 = symbolOffset(tk.c, c.ints);
            if (off12 === null || !Number.isFinite(off12)) { issues.push(tag + '.' + ln + ': bad symbol "' + tk.c + '"'); return; }
            const rootPc = slash && c.bass !== null && tk.c === '1' ? c.bass : c.root;
            ms = [rootMidi(rootPc, lo) + off12 + tk.oct];
          }
          cur = { s, n: 1, m: ms, vel: tk.acc, tk, chord: c };
        };
        for (let s = 0; s < steps; s++) {
          const tk = grid[Math.floor(s / STEPS_PER_BAR) % grid.length][s % STEPS_PER_BAR];
          const c = tk.c;
          if (c === '.') { flush(s); continue; }
          if (c === '-') {
            if (cur && chordAt(s) !== cur.chord) { const t0 = cur.tk; flush(s); start(s, t0); }   // a held note re-triggers on a chord change
            continue;
          }
          flush(s);
          if (fm === 'chord' && c !== 'x') { issues.push(tag + '.' + ln + ': bad chord-trigger "' + c + '" (use x - .)'); continue; }
          start(s, tk);
        }
        flush(steps);
      } else { issues.push(tag + '.' + ln + ': unknown pattern format "' + fm + '"'); continue; }
      evs.sort((a, b) => a.s - b.s);
      if (inst.mono) for (let i = 0; i + 1 < evs.length; i++) if (evs[i].s + evs[i].n > evs[i + 1].s) evs[i].n = Math.max(1, evs[i + 1].s - evs[i].s);
      for (const e of evs) {
        if (mx > 0) addEv(prog, off + e.s, { k: 'n', lane: ln, play, n: e.n, m: e.m, vel: e.vel * mx, c: cfg });
        for (const m of e.m) prog.meta.notes.push({ s: off + e.s, n: e.n, m, v: ln });
        if (fm === 'notes') prog.meta.lead.push({ s: off + e.s, n: e.n, m: e.m[0], lane: ln });
      }
    }

    // ---------- drums ----------
    const duckOn = sec.duckOn || prog.duckOn;
    const triggers = [];                            // steps that fire the sidechain
    for (const [dkey, drumsStr] of drumGrids) {
      const grid = buildGrid(drumsStr, pats, issues, tag + '.' + dkey);
      if (!grid.length) issues.push(tag + '.' + dkey + ': empty pattern');
      for (let s = 0; s < steps && grid.length; s++) {
        const tk = grid[Math.floor(s / STEPS_PER_BAR) % grid.length][s % STEPS_PER_BAR];
        let c = tk.c, vel = tk.acc;
        if (c === '.' || c === '-') continue;
        if (c === 'R') {                            // snare roll: velocity ramps up over the run of consecutive R steps
          let a = s, b = s;
          while (a > 0 && grid[Math.floor((a - 1) / STEPS_PER_BAR) % grid.length][(a - 1) % STEPS_PER_BAR].c === 'R') a--;
          while (b + 1 < steps && grid[Math.floor((b + 1) / STEPS_PER_BAR) % grid.length][(b + 1) % STEPS_PER_BAR].c === 'R') b++;
          vel *= 0.3 + 0.85 * ((s - a) / Math.max(1, b - a));
          c = 'S';
        }
        if (duckOn.indexOf(c) >= 0) triggers.push(s);
        if (c === 'q') continue;                    // silent sidechain trigger
        const k = KIT[c];
        if (!k) { issues.push(tag + '.' + dkey + ': unknown drum char "' + c + '"'); continue; }
        const L = laneOf(k[0], tag); if (!L) continue;
        L.used = true;
        const mx = mixOf(k[0]);
        if (mx > 0) addEv(prog, off + s, { k: 'd', lane: k[0], fn: k[1], vel: vel * mx });
      }
    }
    // ---------- sidechain ----------
    const dk = sec.duck;
    for (const L of only && !only.has('drums') ? [] : prog.lanes) {
      if (L.inst === 'kit') continue;
      let depth = L.cfg.duck || 0;
      if (dk === false) depth = 0;
      else if (typeof dk === 'number') depth *= dk;
      else if (dk && typeof dk === 'object') { if (dk[L.name] !== undefined) depth = dk[L.name] === false ? 0 : +dk[L.name]; else if (dk.all !== undefined) depth *= dk.all; }
      if (depth > 0) {
        L.duckAny = true;
        for (const s of triggers) addEv(prog, off + s, { k: 'u', lane: L.name, depth: Math.min(0.97, depth), rel: L.cfg.duckRel === undefined ? prog.duckRel : L.cfg.duckRel });
      }
    }
    // ---------- automation ----------
    for (const key of only ? [] : Object.keys(sec.auto || {})) {
      const [ln, param] = key.split('.');
      const targets = ln === 'master' ? ['master'] : ln === 'drums' ? KIT_LANES : [ln];
      for (const tn of targets) {
        let L = null;
        if (tn === 'master') {
          if (['lpf', 'hpf', 'vol'].indexOf(param) < 0) { issues.push(tag + '.auto: master has no param "' + param + '"'); continue; }
          prog.master[param] = true;
        } else {
          L = laneOf(tn, tag + '.auto'); if (!L) continue;
          if (!(param in DEFAULT_AUTO)) { issues.push(tag + '.auto: unknown param "' + param + '" (vol lpf hpf rev hall spr dly pan)'); continue; }
          L.needs[param] = true;
        }
        prog.autoKeys.add(tn + '.' + param);
        const spec = sec.auto[key], hz = !!AUTO_HZ[param];
        const bp = autoCurve(spec, hz, steps, issues, tag + '.auto.' + key);
        if (!bp) continue;
        for (let s = 0; s < steps; s++) addEv(prog, off + s, { k: 'a', lane: tn, p: param, v0: bp(s), v1: bp(s + 1) });
      }
    }
    // params automated in ANOTHER section but not here fall back to their lane default at the section start (finishSong)
    if (!only) (prog.sectionsForReset || (prog.sectionsForReset = [])).push({ off, steps, have: new Set(Object.keys(sec.auto || {})) });
    return steps;
  }

  /** automation spec -> function(step) -> value.  [v0, v1, curve?, startBar?, endBar?] or [[bar, v], ...] */
  function autoCurve(spec, hz, steps, issues, tag) {
    if (!Array.isArray(spec) || spec.length < 2) { issues.push(tag + ': bad automation spec'); return null; }
    let pts;
    let curve = hz ? 'exp' : 'lin';
    if (Array.isArray(spec[0])) pts = spec.map(([b, v]) => [b * STEPS_PER_BAR, v]);
    else {
      if (typeof spec[2] === 'string') curve = spec[2];
      const sb = isNum(spec[3]) ? spec[3] * STEPS_PER_BAR : 0, eb = isNum(spec[4]) ? spec[4] * STEPS_PER_BAR : steps;
      pts = [[sb, spec[0]], [Math.max(sb + 1, eb), spec[1]]];
    }
    const ease = (x) => (curve === 'in' ? x * x : curve === 'out' ? 1 - (1 - x) * (1 - x) : x);
    return (s) => {
      if (s <= pts[0][0]) return pts[0][1];
      for (let i = 1; i < pts.length; i++) {
        if (s <= pts[i][0]) {
          const [a, va] = pts[i - 1], [b, vb] = pts[i], x = ease((s - a) / (b - a));
          return hz && va > 0 && vb > 0 ? va * Math.pow(vb / va, x) : va + (vb - va) * x;
        }
      }
      return pts[pts.length - 1][1];
    };
  }

  /** after all sections are compiled: baseline resets for params that are automated somewhere in the song */
  function finishSong(prog) {
    for (const key of prog.autoKeys) {
      const [tn, param] = key.split('.');
      const L = tn === 'master' ? null : prog.laneMap[tn];
      const dflt = tn === 'master' ? (param === 'vol' ? 1 : DEFAULT_AUTO[param]) : (L.cfg[param] !== undefined ? L.cfg[param] : DEFAULT_AUTO[param]);
      for (const sr of prog.sectionsForReset) {
        const done = sr.have.has(key) || (KIT_LANES.indexOf(tn) >= 0 && sr.have.has('drums.' + param));
        if (!done) addEv(prog, sr.off, { k: 'a', lane: tn, p: param, v0: dflt, v1: dflt });
      }
    }
    delete prog.sectionsForReset;
    prog.autoKeys = null;
    // estimate: highest number of simultaneously sounding source nodes (lint / budget)
    let peak = 0;
    for (const par of [0, 1]) {                       // even / odd loop pass (a section's `alt` version only sounds on odd passes)
      const ends = [];
      for (let s = 0; s < prog.steps; s++) {
        for (let i = ends.length - 1; i >= 0; i--) if (ends[i][0] <= s) ends.splice(i, 1);
        for (const e of prog.events[s] || []) {
          if (e.o !== undefined && e.o !== par) continue;
          if (e.k === 'n') { const L = prog.laneMap[e.lane], inst = INST[L.inst]; ends.push([s + e.n + 2, inst.src ? inst.src(e.c, e.m.length) : 2]); }
          else if (e.k === 'd') ends.push([s + 2, 3]);
          else if (e.k === 'f') ends.push([s + e.n + 1, 4]);
        }
        const tot = ends.reduce((a, b) => a + b[1], 0);
        if (tot > peak) peak = tot;
      }
    }
    prog.peakSources = peak;
  }

  // ================================================================================================
  // SONGS (v2.0, composed): title "Neon Abyss", stage1 "Sunken Pulse", stage2 "Iron Tide", boss "Crown of the Deep", entry "Midnight Diner", ending "Return of the Light",
  //   jingles start / extend / gameover / clear_boss.  Each song carries its own chord chart, form map and hook (note names) in the comment above its definition; the same
  //   information is in out/v2/audio/tracklist.md.  Authored in out/v2/audio/songs/*.js and spliced between the COMPOSER markers below by out/v2/audio/compose_assemble.mjs.
  //   Keep the names, bpm, key and the K7 length of `start` (<= 2.4 s).  See the NOTATION block in the file header.
  // ================================================================================================
  const MINOR = [0, 2, 3, 5, 7, 8, 10], MAJOR = [0, 2, 4, 5, 7, 9, 11];
  const PICK_CHORUS = { rate: 0.38, depth: 0.003, base: 0.015, mix: 0.75 };
  let defsCache = null;
  function songDefs() {
    if (defsCache) return defsCache;
    const D = {};

    // <<COMPOSER:BEGIN>> (authored in out/v2/audio/songs/*.js, spliced by out/v2/audio/compose_assemble.mjs)
    // ---- composer helpers: plain string builders for the notation documented in the file header -------------------------------------------
    const hold = (bars) => 'x' + '-'.repeat(16 * bars - 1);      // ONE chord trigger that sustains `bars` bars (it re-triggers by itself on every chord change)
    const rest = (bars) => '.'.repeat(16 * (bars === undefined ? 1 : bars));      // `bars` bars of rest (grid lanes)
    const rep = (s, n) => Array(n).fill(s).join(' ');             // n copies of a bar cell / bar of notes
    const cells = (...a) => a.join(' ');                          // bar cells in order
    const NN12 = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
    const tr = (str, semi) => str.replace(/\b([a-g])([#b]?)(\d)\b/g, (m, l, a, o) => {      // transpose every note name of a note string by `semi` semitones
      const midi = 12 * (+o + 1) + { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[l] + (a === '#' ? 1 : a === 'b' ? -1 : 0) + semi;
      return NN12[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
    });

    // ============================================================================================================================================
    // STAGE 1 "Sunken Pulse"  (rounds 1-15)   122 bpm   E minor   80 bars = intro 8 (once) + loop 72   ~ 2:37 per pass, loop 2:22
    //
    //   Concept: a sonar ping in a dark, cold sea.  Dark wave machinery (chorus pick bass, cold pulse arp, gated snares) in the verses, EDM builds and
    //   side-chained supersaw drops, a dreamy twang/choir breakdown in the light of a distant vent, and a light industrial edge (metal hats, clangs,
    //   crushed snares, a distorted riff bass) that grows toward drop 2.  Everything is built on "pings" (the repeated high E of the hook).
    //
    //   FORM MAP (bars)          chords (one bar each unless dotted)                                   what enters / leaves
    //   I   intro      8  once   Em9 Em9 Cmaj7 Cmaj7 Am9 Am9 B7sus B7sus                               pad swell, 8th arp fades in, ghost-kick pump (q), bell pings 1..3,
    //                                                                                                   choir + sub + soft kick + hats from bar 5, reverse swell + riser into V
    //   V   verse     16  A: Em9 Em9 Cmaj7 Cmaj7 Am9 Am9 B7sus B7b9                                  machine kick + gated snare + 8th hats, chorus pick bass (8ths), cold arp,
    //                      B: Em9 Gmaj7 Cmaj7 Am9.B7sus Em9 Gmaj7 Am9 B7b9                              twang verse tune (A low and sparse, B higher), choir joins in B, 16th hats in B
    //   B1  build      8  Am9 Am9 Cmaj7 Cmaj7 Gmaj7 Gmaj7 B7sus B7sus                                 EDM kick 4/4, supersaw stabs under a rising lpf, master hp-sweep, riser,
    //                                                                                                   snare roll bars 5-8, everything cuts for the last beat
    //   D1  drop      16  Em Cmaj7 Am9 B7sus.B7b9 (x2) | Em Cmaj7 G D Am9 Bm7 Cmaj7 B7b9             impact; sidechained supersaw + 808 sub + pick bass + clap; HOOK (lead pings) x2,
    //                                                                                                   answer phrase (falling) bars 9-12, rising ladder bars 13-15, down-sweep bar 16
    //   K   breakdown  8  Em9 Cmaj7 Gmaj9 D6 Em9 Cmaj7 Am9 B7sus.B7b9                                 no kick (heartbeat pulse only), choir + pad + glassy arp, twang tune,
    //                                                                                                   reverse swell on the last bar
    //   B2  build      8  Cmaj7 Am9 Cmaj7 Am9 Gmaj7 Bm7 B7sus B7sus                                   like B1 but darker and harder: 16th hats earlier, clangs, distorted riff from bar 5,
    //                                                                                                   two-bar snare roll
    //   D2  drop      16  Em Cmaj7 Am9 B7sus.B7b9 (x2) | Am9 Cmaj7 Gmaj7 D6 Am9 Cmaj7 B7sus B7b9      hook doubled by the twang an octave lower, metal hats, crushed snares, riff + sub;
    //                                                                                                   bars 9-12 HALF-TIME (snare on 3, chugging riff) under the singing second hook,
    //                                                                                                   bars 13-16 full drive again, fill into the verse
    //
    //   HOOK (lead saw, over Em | Cmaj7 | Am9 | B7sus.B7b9):  bar1  E5 . E5 . E5 G5 B5---   (three "pings", then up a minor third twice, long B)
    //                                                          bar2  D5 . D5 . D5 E5 G5---
    //                                                          bar3  E5 . E5 . E5 A5 C6---   bar4  B5 A5 G5 F#5 D#5 (falls into the dominant)
    //   SECOND HOOK (drop 2, bars 9-16): A5 C6 E6--- | D6 C6 B5--- | G5 B5 D6 F#6 | E6 D6 A5--- ... a slow singing line against the half-time riff.
    //   VERSE TUNE (twang):  E4 G4 B4 A4 G4 E4 | G4 C5 E5 D5 C5 B4(maj7) | A4 C5 E5 B4 A4 E4 | E5 F#5 A5 G5 F#5 D#5.
    //   Bass: the chorus pick bass SINGS in the verse (8th-note lines through the chord: E E E E' D B G B, E E B E G B D B ...), rolls 8ths in the drops, 808 sub on the off-beats,
    //   distorted riff gallop in B2 / D2; the choir joins the singing second hook (D2 bars 9-16).
    //   Mix intent (section loudness): I -23, V -20, B1 -19, D1 -16, K -24, B2 -19, D2 -15 LUFS (quiet verse / loud drop contrast, spread >= 6 dB).
    // ============================================================================================================================================
    // the twang line of drop 2, bars 1-8 (the hook an octave under the lead) -- shared by the original and the second-pass version of D2
    const s1d2tw = `| e4/1 r/1 e4/1 r/1 e4/2 g4/2 b4/8 | d4/1 r/1 d4/1 r/1 d4/2 e4/2 g4/8 | e4/1 r/1 e4/1 r/1 e4/2 a4/2 c5/8 | b4/4 a4/4 g4/2 f#4/2 d#4/4 |
                    | e4/1 r/1 e4/1 r/1 e4/2 g4/2 b4/4 d5/4 | d4/1 r/1 d4/1 r/1 d4/2 e4/2 g4/4 c5/4 | e4/1 r/1 e4/1 r/1 e4/2 a4/2 c5/4 e5/4 | f#5/4 e5/4 d#5/4 b4/4 |`;
    D.stage1 = {
      bpm: 122, swing: 0.5, echo: 3, fb: 0.38, key: 4, mode: MINOR, gain: 1.222, duckRel: 0.55,
      lanes: {
        pad: { inst: 'pad', vol: 0.5, hall: 0.35, duck: 0.5 },
        choir: { inst: 'choir', vol: 0.6, hall: 0.55, vib: [5.2, 14], duck: 0.35 },
        super: { inst: 'super', vol: 0.85, hall: 0.22, duck: 0.75, lpf: 8500 },
        stab: { inst: 'stab', vol: 0.5, hall: 0.2, duck: 0.7, spread: 22 },
        arp: { inst: 'arp', vol: 0.3, dly: 0.4, hall: 0.15, pan: -0.25, hpf: 300, duck: 0.5 },
        bass: { inst: 'pick', vol: 0.78, chorus: PICK_CHORUS, duck: 0.45 },
        sub: { inst: 'sub', vol: 0.55, drive: 2.5, duck: 0.92, lpf: 700 },
        riff: { inst: 'riff', vol: 0.7, drive: 7, lpf: 3600, lq: 0.8, duck: 0.4 },
        twang: { inst: 'twang', vol: 0.95, trem: { rate: 4.6, depth: 0.5 }, spr: 0.4, hall: 0.3, dly: 0.3, hpf: 150 },
        lead: { inst: 'lead', vol: 1.5, dly: 0.34, hall: 0.25, hpf: 220 },
        bell: { inst: 'bell', vol: 0.55, hall: 0.5, dly: 0.25 },
        fx: { inst: 'fx', vol: 0.45, hall: 0.3 },
        kick: { vol: 1.2, drive: 1.6 }, snare: { vol: 0.5, hall: 0.12 }, hats: { vol: 0.4 }, perc: { vol: 0.3 },
      },
      pats: {
        // drums: kick+snare grid (drums), hats (drums2), extras (drums3).  One hit per step per grid, grids layer.
        vg: 'k...s...k.k.s...', vgf: 'k...s...k.k.s.ss',                         // verse groove / with the ghost-snare fill
        hh8: "h,.h'.h,.h'.h,.h'.h,.h'.", hh16: "h'h,h,h,h'h,h,h,h'h,h,h,h'h,h,h,",  // 8th hats (accented off-beats) / 16ths
        pf: '..........t.u.v.',                                                  // tom fill on the last beat
        f4: 'K...K...K...K...', bk: 'K...p...K...p...', bkf: 'K...p...K...p.pp', bky: 'K...p...K...p.yy',  // EDM four-on-floor / drop groove (kick + clap) / with a fill
        off: '..o...o...o...o.', mh: 'm,m,m,m,m,m,m,m,m,m,m,m,m,m,m,m,',          // off-beat open hat / metallic 16ths
        mhc: 'cm,m,m,m,m,m,m,m,m,m,m,m,m,m,m,',                                // metallic 16ths with a crash on the downbeat
        mhc8: 'c.m.m.m.m.m.m.m.', st2: '......x.......x.',
        mhk8: 'm.m.K.m.m.m.K.m.', mhck8: 'c.m.K.m.m.m.K.m.', mhf: 'm.m.K.m.m.m.t.uv',                           // FIXPLAN_V3 A7: the same metallic 8ths with a kick on beats 2 and 4 (drops are four-on-the-floor; the kick lane / sidechain trigger from any grid)                          // metallic 8ths with a crash / two off-beat stabs per bar (CPU budget: the 16ths are kept for builds and fills)
        // bass
        b8: '1-1-1-1-1-1-1-1-', b8o: '1-1-1-1-1-1-8-1-', b8f: '1-1-1-1-1-8-7-5-',
        off808: '..1-..1-..1-..1-',
        // melodic chorus-bass lines (80s dark wave: the bass sings): 1 root, 3 / 5 / 7 chord tones, 8 octave
        m1: '1-1-1-8-7-5-3-5-', m2: '1-1-5-1-3-5-7-5-', m3: '1-1-8-1-5-1-3-5-', m4: '1-1-1-1-3-5-7-8-',
        // riff (distorted saw bass): 16th chugs
        ht: 'K.....K.S.......', ht2: 'K.....K.S.....SS', mh8: 'm.m.m.m.m.m.m.m.',
        rf1: "1'.11.1..1'.11.1..", rf2: "1'.11.1.1'.11.1.1.", rf3: "1'..1...1'.1.1....",
      },
      sections: {
        // ------------------------------------------------------------------------------------------------ INTRO (8 bars, once)
        I: {
          chords: '| Em9 | Em9 | Cmaj7 | Cmaj7 | Am9 | Am9 | B7sus | B7sus |',
          p: {
            pad: hold(8),
            choir: rest(4) + hold(4),
            arp: 'arp8*8',
            bell: `| r/16 | r/16 | e6/2 r/14 | r/16 | e6/2 r/2 e6/2 r/10 | r/16 | e6/2 r/2 e6/2 r/2 e6/2 r/6 | r/16 |`,
            sub: 'root*8',
            drums: cells(rep('q...q...q...q...', 4), rep('k.......k.......', 3), 'k.......k.k.s.s.'),
            drums2: cells(rest(4), rep('..h...h...h...h.', 3), '..h...h...h.hhhh'),
            fx: 'swell@4b/4b riser@6b/2b',
          },
          mix: { choir: 0.75, sub: 0.6, pad: 2.0, all: 0.8 },
          auto: { 'arp.vol': [0.14, 0.3] },
        },
        // ------------------------------------------------------------------------------------------------ VERSE (16 bars)
        V: {
          chords: '| Em9 | Em9 | Cmaj7 | Cmaj7 | Am9 | Am9 | B7sus | B7b9 | Em9 | Gmaj7 | Cmaj7 | Am9.B7sus | Em9 | Gmaj7 | Am9 | B7b9 |',
          p: {
            pad: hold(16),
            choir: rest(8) + hold(8),
            bass: cells('m1 m2 m1 m2 m1 m2 m1 m4', 'm3 m2 m3 m2 m3 m2 m3 m4'),
            arp: 'arp8*16',
            twang: `| r/2 e4/4 g4/4 b4/6 | a4/4 g4/4 e4/8 | r/2 g4/4 c5/4 e5/6 | d5/4 c5/4 b4/8 | r/2 a4/4 c5/4 e5/6 | b4/4 a4/4 e4/8 | e5/8 f#5/4 a5/4 | g5/4 f#5/4 d#5/8 |
                    | b4/6 e5/2 g5/4 b5/4 | a5/4 g5/4 f#5/8 | e5/6 d5/2 c5/4 e5/4 | c5/4 e5/4 f#5/4 b4/4 | g5/6 e5/2 b4/4 e5/4 | d5/4 g5/4 b5/8 | c6/4 b5/4 a5/4 e5/4 | d#5/6 f#5/2 a5/4 c6/4 |`,
            drums: 'vg*3 vgf vg*3 vgf vg*3 vgf vg*3 vgf',
            drums2: cells('hh8*8', 'hh16*8'),
            drums3: 'none*3 pf none*3 pf none*3 pf none*3 pf',
            fx: 'impact@0:0.5 down@15b/1b',
          },
          mix: { arp: 0.9, snare: 0.5, perc: 0.5, twang: 0.8, all: 0.7 },
          // SECOND PASS (A8): a soft bell counter-line answers the verse tune (bars 1-8), the choir and the 16th hats come in four bars earlier, the arp runs 16ths in the last four bars
          alt: {
            p: {
              bell: `| r/8 g5/2, b5/2, e6/4, | b5/6, g5/2, e5/8, | r/8 e5/2, g5/2, b5/4, | g5/6, e5/2, r/8 | r/8 a5/2, c6/2, e6/4, | e6/6, c6/2, a5/8, | r/8 f#5/2, a5/2, b5/4, | a5/6, f#5/2, d#5/8, |
                      | r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | r/16 |`,
              choir: rest(4) + hold(12),
              drums2: cells('hh8*4', 'hh16*12'),
              arp: cells('arp8*12', 'arp16*4'),
            },
          },
        },
        // ------------------------------------------------------------------------------------------------ BUILD 1 (8 bars)
        B1: {
          chords: '| Am9 | Am9 | Cmaj7 | Cmaj7 | Gmaj7 | Gmaj7 | B7sus | B7sus |',
          p: {
            pad: hold(8),
            super: 'stab*7 ..x...x...x.....',
            bass: cells('b8 b8o b8 b8o oct8 oct8 oct8', '1-1-1-1-........'),
            arp: cells('arp8*4', 'arp16*3', '1358a853........'),
            drums: cells('f4*6', 'K.K.K.K.K.K.K.K.', rest(1)),
            drums2: cells('..h...h...h...h.*2', 'hh8*2', "S,...S,...S...S...", "S.S.S.S.S'.S'.S'.S'.", 'RRRRRRRRRRRRRRRR', 'RRRRRRRRRRRR....'),
            fx: 'riser@0/124 swell@4b/3b',
          },
          mix: { super: 0.85, snare: 0.6 },
          auto: { 'super.lpf': [500, 9000, 'exp'], 'master.hpf': [[0, 20], [2, 20], [7.75, 600], [7.8125, 10]], 'arp.vol': [0.08, 0.18], 'master.vol': [0.8, 1.0, 'in'] },
          // SECOND PASS (A8): the build already carries the distorted riff and the clangs of build 2 (bars 5-8)
          alt: {
            p: {
              riff: cells(rest(4), 'rf1 rf2 rf1', 'rf3'),
              drums3: cells('................', '................', '..........x.....', '................', '..X...x...X...x.', 'x...x...x...x...', 'zzzzzzzz........', '................'),
            },
          },
        },
        // ------------------------------------------------------------------------------------------------ DROP 1 (16 bars)
        D1: {
          chords: '| Em | Cmaj7 | Am9 | B7sus.B7b9 | Em | Cmaj7 | Am9 | B7sus.B7b9 | Em | Cmaj7 | G | D | Am9 | Bm7 | Cmaj7 | B7b9 |',
          p: {
            super: hold(16),
            bass: cells('pump*3 b8f', 'pump*3 b8f', 'pump*3 b8f', 'pump*3 1-1-1-1-........'),
            sub: cells('root*4', 'off808*12'),
            arp: cells('arp8*8', 'arp16*7', '1358a853........'),
            lead: `| e5/1 r/1 e5/1 r/1 e5/2 g5/2 b5/8 | d5/1 r/1 d5/1 r/1 d5/2 e5/2 g5/8 | e5/1 r/1 e5/1 r/1 e5/2 a5/2 c6/8 | b5/4 a5/4 g5/2 f#5/2 d#5/4 |
                    | e5/1 r/1 e5/1 r/1 e5/2 g5/2 b5/4 d6/4 | d5/1 r/1 d5/1 r/1 d5/2 e5/2 g5/4 c6/4 | e5/1 r/1 e5/1 r/1 e5/2 a5/2 c6/4 e6/4 | f#6/4 e6/4 d#6/4 b5/4 |
                    | e6/1 r/1 e6/1 r/1 e6/2 d6/2 b5/8 | c6/1 r/1 c6/1 r/1 c6/2 b5/2 g5/8 | d6/1 r/1 d6/1 r/1 d6/2 b5/2 g5/8 | a5/1 r/1 a5/1 r/1 a5/2 f#5/2 d5/8 |
                    | e5/1 r/1 e5/1 r/1 e5/2 a5/2 c6/8 | f#5/1 r/1 f#5/1 r/1 f#5/2 b5/2 d6/8 | g5/1 r/1 g5/1 r/1 g5/2 c6/2 e6/8 | f#6/4 d#6/4 b5/4 r/4 |`,
            drums: cells('bk*3 bkf', 'bk*3 bkf', 'bk*3 bkf', 'bk*3 K...p...K.......'),
            drums2: cells(rep('off', 15), 'RRRRRRRR........'),
            drums3: cells('mhck8', 'mhk8*7', 'mhck8', 'mhk8*6', 'mh8'),        // A7: kicks on 2 and 4 (every bar but the roll bar 16)
            fx: 'impact@0 swell@7b/1b down@15b/1b',
          },
          mix: { arp: 1.6 },                                                 // A5: the cold arp stays audible in the drops (+4 dB)
          // SECOND PASS (A8): the first hook statement is doubled an octave up, a soft twang tenor line moves under the second statement and the last phrase, tom fills close bars 4 / 8 / 12
          alt: {
            dbl: { lead: { semi: 12, bars: [1, 4], vel: 0.5 } },
            p: {
              twang: `| r/16 | r/16 | r/16 | r/16 | e4/8, g4/8, | g4/8, e4/8, | e4/8, c5/8, | f#4/8, d#4/8, | r/16 | r/16 | r/16 | r/16 | a4/8, c5/8, | b4/8, d5/8, | e4/8, g4/8, | f#4/8, d#4/8, |`,
              drums3: cells('mhck8', 'mhk8*2', 'mhf', 'mhk8*3', 'mhf', 'mhck8', 'mhk8*2', 'mhf', 'mhk8*3', 'mh8'),
            },
          },
        },
        // ------------------------------------------------------------------------------------------------ BREAKDOWN (8 bars)
        K: {
          chords: '| Em9 | Cmaj7 | Gmaj9 | D6 | Em9 | Cmaj7 | Am9 | B7sus.B7b9 |',
          p: {
            pad: hold(8),
            choir: hold(8),
            arp: 'arp8*8',
            twang: `| b4/6 e5/2 g5/8 | e5/6 d5/2 c5/8 | d5/6 g5/2 b5/8 | a5/6 f#5/2 d5/8 | b4/4 e5/4 g5/4 a5/4 | b5/6 g5/2 e5/8 | c6/6 b5/2 a5/8 | e5/4 f#5/4 g5/4 f#5/4 |`,
            bell: `| r/16 | r/16 | e6/4 r/12 | r/16 | r/16 | r/16 | r/8 e6/4 r/4 | b5/2 r/14 |`,
            drums: 'q...q...q...q...*8',
            fx: 'down@0/1b swell@7b/1b',
          },
          mix: { drums: 0, arp: 0.55, pad: 1.1, choir: 1.0, all: 0.55 },
          duck: 0.45,
          cfg: { arp: { cut: 4200, d: 0.3, s: 0.1 } },
        },
        // ------------------------------------------------------------------------------------------------ BUILD 2 (8 bars)
        B2: {
          chords: '| Cmaj7 | Am9 | Cmaj7 | Am9 | Gmaj7 | Bm7 | B7sus | B7sus |',
          p: {
            pad: hold(8),
            super: 'stab*7 ..x...x...x.....',
            bass: cells('b8o*4', rest(4)),
            riff: cells(rest(4), 'rf1 rf2 rf1', 'rf3'),
            arp: cells('arp16*7', '1358a853........'),
            drums: cells('f4*6', 'K.K.K.K.K.K.K.K.', rest(1)),
            drums2: cells('hh16*2', "hh16*2", "S,...S,...S...S...", "S.S.S.S.S'.S'.S'.S'.", 'RRRRRRRRRRRRRRRR', 'RRRRRRRRRRRR....'),
            drums3: cells('..........x.....', '................', '..........x...X.', '................', '..X...x...X...x.', 'x...x...x...x...', 'zzzzzzzz........', '................'),
            fx: 'riser@0/124 swell@3b/4b',
          },
          mix: { super: 0.85, riff: 0.8, snare: 0.6 },
          auto: { 'super.lpf': [400, 9000, 'exp'], 'master.hpf': [[0, 20], [2, 20], [7.75, 1200], [7.8125, 10]], 'arp.vol': [0.09, 0.2], 'pad.hall': [0.35, 0.85], 'master.vol': [0.75, 1.0, 'in'] },
        },
        // ------------------------------------------------------------------------------------------------ DROP 2 (16 bars)
        D2: {
          chords: '| Em | Cmaj7 | Am9 | B7sus.B7b9 | Em | Cmaj7 | Am9 | B7sus.B7b9 | Am9 | Cmaj7 | Gmaj7 | D6 | Am9 | Cmaj7 | B7sus | B7b9 |',
          p: {
            super: hold(16),
            choir: rest(8) + hold(8),
            stab: cells(rest(12), 'st2*4'),
            bass: cells('pump*3 b8f', 'pump*3 b8f', rest(4), 'pump*3 1-1-1-1-........'),
            riff: cells(rest(4), 'rf1 rf2 rf1 rf3', 'rf1 rf2 rf1 rf3', 'rf1 rf2 rf1 rf3'),
            sub: cells('root*4', 'off808*4', 'root*4', 'off808*4'),
            arp: cells('arp8*8', rest(4), 'arp8*3', '1358a853........'),
            lead: `| e5/1 r/1 e5/1 r/1 e5/2 g5/2 b5/8 | d5/1 r/1 d5/1 r/1 d5/2 e5/2 g5/8 | e5/1 r/1 e5/1 r/1 e5/2 a5/2 c6/8 | b5/4 a5/4 g5/2 f#5/2 d#5/4 |
                    | e6/1 r/1 e6/1 r/1 e6/2 g6/2 b6/4 g6/4 | d6/1 r/1 d6/1 r/1 d6/2 e6/2 g6/4 e6/4 | e6/1 r/1 e6/1 r/1 e6/2 a6/2 c7/4 a6/4 | f#6/4 e6/4 d#6/4 b5/4 |
                    | a5/4 c6/4 e6/8 | d6/6 c6/2 b5/8 | g5/4 b5/4 d6/4 f#6/4 | e6/6 d6/2 a5/8 |
                    | a5/4 c6/4 e6/4 g6/4 | e6/6 d6/2 c6/8 | b5/4 e6/4 f#6/8 | g6/4 f#6/4 d#6/4 b5/4 |`,
            twang: `${s1d2tw} | r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | r/16 |`,
            drums: cells('bk*3 bky', 'bk*3 bky', 'ht*3 ht2', 'bk*3 K...p...RRRRRRRR'),
            drums2: cells('off*8', 'mh8*4', 'off*4'),
            drums3: cells('mhck8', 'mhk8*7', 'mhc8', 'mh8*3', 'mhk8*3', 'mh8'),   // A7: four-on-the-floor in bars 1-8 and 13-15; the half-time bars 9-12 and the roll bar 16 keep their feel
            fx: 'impact@0 impact@8b:0.7 swell@15b/1b',
          },
          mix: { twang: 0.55, choir: 0.8, arp: 1.6 },
          cfg: { super: { n: 7, spread: 24 }, lead: { cut: 4600 } },
          // SECOND PASS (A8): hook statement 1 doubled an octave up, a twang tenor counter-line under the singing second hook (bars 9-16), tom fills at bars 4 / 8
          alt: {
            dbl: { lead: { semi: 12, bars: [1, 4], vel: 0.5 } },
            p: {
              twang: `${s1d2tw} | a4/8, c5/8, | g4/8, e5/8, | d5/8, b4/8, | f#4/8, a4/8, | c5/8, e5/8, | g4/8, c5/8, | f#4/8, a4/8, | d#5/8, f#5/8, |`,
              drums3: cells('mhck8', 'mhk8*2', 'mhf', 'mhk8*3', 'mhf', 'mhc8', 'mh8*3', 'mhk8*3', 'mh8'),
            },
          },
        },
      },
      intro: ['I'],
      order: ['V', 'B1', 'D1', 'K', 'B2', 'D2'],
    };

    // ============================================================================================================================================
    // TITLE "Neon Abyss"   92 bpm   D minor   36 bars = intro 4 (once) + loop 32   ~ 1:34 per pass, loop 1:23
    //
    //   Concept: a lonely synth-noir theme under neon lights.  The first 10 s are pure cold noir atmosphere (a cold pad that opens up, a tremolo twang line
    //   with spring reverb, finger snaps); then the beat and the chorus bass walk in under the same tune (A), the tune is promoted to a big saw lead over
    //   a side-chained supersaw pad (B, the "hook"), a distorted half-time industrial bridge (C, nu-metal weight, metal clangs) and a final chorus (B').
    //
    //   FORM MAP (bars)          chords                                                                 what enters / leaves
    //   I   intro      4  once   Dm9 Bbmaj7 Gm9 A7sus.A7                                                pad (opening filter), choir bars 3-4, twang states the tune, snaps from bar 3
    //   A   verse + tune 8       Dm9 Bbmaj7 Gm9 A7sus.A7 | Dm9 Bbmaj7 Gm9 Em7b5.A7                     machine kick + gated snare + snaps + 8th hats, chorus pick bass, cold arp, twang tune
    //   B   hook       8         Bbmaj7 Fmaj7 Gm9 Dm9 | Bbmaj7 Fmaj7 Gm9.Em7b5 A7                      EDM kick + clap, sidechained supersaw, 808 sub, pick bass, LEAD hook, choir
    //   C   bridge     8         Dm Dm Bbmaj7 Bbmaj7 Gm7 Gm7 A7sus A7                                   half-time: distorted riff with b2 (Eb) bite, clangs, boom kick, crushed snare, choir + twang
    //   B'  final hook 8         as B                                                                   everything + twang doubles the lead one octave down, bell sparkle, snare roll out
    //
    //   HOOK A (twang, bars 1-4 of the verse):  A4  F5. E5 D5  |  Bb4 G5. F5 D5  |  D5 Bb5. A5 G5  |  E5. D5 C#5 E5      (up a minor 6th, sigh down; sequence a 4th higher in bar 3)
    //   HOOK B (lead, the chorus):  D5 F5 A5 G5 F5 | E5 A5 C6 A5 G5 | D5 G5 Bb5 A5 G5 | F5 A5 D6 C6 A5     every bar in a 3-3-2-4-4 rhythm: tresillo "run-up" then two falling steps
    //   Bass: a singing chorus pick bass in the verse (D D D D' C A F A ...: dark-wave melodic bass), rolling 8ths + 808 sub in the hook, riff chugs (with the Eb b2) in the bridge.
    //   Mix intent (section loudness): I -25, A -20, B -16, C -17, B' -15 LUFS.
    // ============================================================================================================================================
    D.title = {
      bpm: 92, swing: 0.5, echo: 3, fb: 0.4, key: 2, mode: MINOR, gain: 1.102, duckRel: 0.6,
      lanes: {
        pad: { inst: 'pad', vol: 0.55, hall: 0.4, duck: 0.4 },
        choir: { inst: 'choir', vol: 0.6, hall: 0.55, vib: [5.2, 14], duck: 0.3 },
        super: { inst: 'super', vol: 0.9, hall: 0.3, duck: 0.7, lpf: 7500 },
        twang: { inst: 'twang', vol: 0.95, trem: { rate: 4.4, depth: 0.55 }, spr: 0.45, hall: 0.3, dly: 0.28, hpf: 140 },
        lead: { inst: 'lead', vol: 1.1, dly: 0.35, hall: 0.3, hpf: 200 },
        bass: { inst: 'pick', vol: 0.78, chorus: PICK_CHORUS, duck: 0.4 },
        riff: { inst: 'riff', vol: 0.7, drive: 7, lpf: 3600, lq: 0.8, duck: 0.3 },
        sub: { inst: 'sub', vol: 0.55, drive: 2.5, duck: 0.92, lpf: 700 },
        arp: { inst: 'arp', vol: 0.3, dly: 0.45, hall: 0.2, pan: 0.2, hpf: 250, duck: 0.4 },
        bell: { inst: 'bell', vol: 0.55, hall: 0.55, dly: 0.25 },
        fx: { inst: 'fx', vol: 0.45, hall: 0.35 },
        kick: { vol: 1.2, drive: 1.5 }, snare: { vol: 0.5, hall: 0.12 }, hats: { vol: 0.4 }, perc: { vol: 0.35 },
      },
      pats: {
        vg: 'k...s...k.k.s...', vgf: 'k...s...k.k.s.nn', vgs: 'k...s...k.k.....',      // verse groove / ghost-snare fill / open last beat (before the hook)
        sn: '....f.......f...', pf: '..........t.u.v.',                                  // snaps on 2 and 4 / tom fill
        hh8: "h,.h'.h,.h'.h,.h'.h,.h'.",
        bg: 'K...s...K...s...', bgf: 'K...s...K...s.ss', cl: '....p.......p...', oh: '..o...o...o...o.', ohk: '..o.K.o...o.K.o.', ohf: '..o.K.o...o.t.uv',   // ohk: A7, open hats with the beat-2 / beat-4 kick
        ht: 'K.....b.y.......', ht2: 'K.....b.y.....yy', hx: '..x.......x.....',     // half-time bridge: kick, boom, crushed snare, clangs
        b8: '1-1-1-1-1-1-1-1-', b8o: '1-1-1-1-1-1-8-1-', b8f: '1-1-1-1-1-8-7-5-',
        pump: '1-1-8-1-1-1-8-1-', off808: '..1-..1-..1-..1-',
        // melodic chorus-bass lines (80s dark wave: the bass sings): 1 root, 3 / 5 / 7 chord tones, 8 octave
        m1: '1-1-1-8-7-5-3-5-', m2: '1-1-5-1-3-5-7-5-', m3: '1-1-8-1-5-1-3-5-', m4: '1-1-1-1-3-5-7-8-',

        // riff: 1 root, f = b2 (Eb), 3 = F, 5 = A, g = b6 (Bb)
        r1: "1'..1.1.1...1.f..", r2: "1'..1.1.1...1.1..", r3: "1'..1.1.1.1.1.5.f", r4: "1'..1.g.1'..1.1...",
        arp1: '1.3.5.8.a.8.5.3.',
      },
      sections: {
        // ------------------------------------------------------------------------------------------------ INTRO (4 bars, once): the noir opening
        I: {
          chords: '| Dm9 | Bbmaj7 | Gm9 | A7sus.A7 |',
          p: {
            pad: hold(4),
            choir: rest(2) + hold(2),
            twang: `| a4/4 f5/6 e5/2 d5/4 | bb4/4 g5/6 f5/2 d5/4 | d5/4 bb5/6 a5/2 g5/4 | e5/6 d5/2 c#5/4 e5/4 |`,
            bell: `| r/16 | r/16 | r/16 | r/8 a6/2 r/6 |`,
            drums: cells(rest(2), 'sn*2'),
            fx: 'swell@2b/2b',
          },
          mix: { choir: 0.8, drums: 1.2, pad: 1.4, all: 0.8 },
        },
        // ------------------------------------------------------------------------------------------------ A: beat + chorus bass join, the tune on the twang
        A: {
          chords: '| Dm9 | Bbmaj7 | Gm9 | A7sus.A7 | Dm9 | Bbmaj7 | Gm9 | Em7b5.A7 |',
          p: {
            pad: hold(8),
            choir: rest(4) + hold(4),
            bass: cells('m1 m2 m1 m4', 'm1 m2 m3 m4'),
            arp: cells(rest(2), 'arp1*6'),
            twang: `| a4/4 f5/6 e5/2 d5/4 | bb4/4 g5/6 f5/2 d5/4 | d5/4 bb5/6 a5/2 g5/4 | e5/6 d5/2 c#5/4 e5/4 | a4/4 f5/6 e5/2 f5/4 | bb4/4 g5/6 f5/2 a5/4 | bb5/4 a5/6 g5/2 d5/4 | g5/4 e5/4 c#5/4 a4/4 |`,
            drums: 'vg*3 vgf vg*3 vgs',
            drums2: 'hh8*8',
            drums3: cells('sn*3', 'pf', 'sn*3', '..........t.u.vv'),
            fx: 'swell@7b/1b',
          },
          mix: { choir: 0.8, arp: 0.8, all: 0.75 },
          auto: { 'arp.vol': [0.15, 0.32, 'lin', 0, 8] },
          // SECOND PASS (A8): the choir holds the whole section and a soft bell counter-line answers the second tune statement (bars 5-8)
          alt: {
            p: {
              choir: hold(8),
              bell: `| r/16 | r/16 | r/16 | r/16 | r/8 a5/2, d6/2, f6/4, | r/8 f5/2, a5/2, d6/4, | r/12 d6/2, g6/2, | g5/4, d6/4, c#6/4, e6/4, |`,
            },
          },
        },
        // ------------------------------------------------------------------------------------------------ B: the hook (lead), supersaw pump
        B: {
          chords: '| Bbmaj7 | Fmaj7 | Gm9 | Dm9 | Bbmaj7 | Fmaj7 | Gm9.Em7b5 | A7 |',
          p: {
            super: hold(8),
            choir: hold(8),
            bass: cells('pump*3 b8f', 'pump*3 b8o'),
            sub: cells('root*4', 'off808*4'),
            arp: 'arp1*8',
            lead: `| d5/3 f5/3 a5/2 g5/4 f5/4 | e5/3 a5/3 c6/2 a5/4 g5/4 | d5/3 g5/3 bb5/2 a5/4 g5/4 | f5/3 a5/3 d6/2 c6/4 a5/4 |
                    | d5/3 f5/3 a5/2 g5/4 f5/4 | e5/3 a5/3 c6/2 e6/4 d6/4 | d6/4 bb5/4 g5/4 e5/4 | c#6/4 a5/8 r/4 |`,
            bell: `| r/16 | r/16 | r/16 | r/12 a6/2 r/2 | r/16 | r/16 | r/16 | r/12 e6/2 r/2 |`,
            drums: cells('bg*3 bgf', 'bg*3 K...s...RRRRRRRR'),
            drums2: 'cl*8',
            drums3: cells('ohk*7', 'oh'),
            fx: 'impact@0 down@7b/1b',
          },
          mix: { arp: 2.0 },                                                 // A5: the cold arp stays audible in the hook (+6 dB)
          // SECOND PASS (A8): the hook is doubled by a plucked twang an octave below (as in the final hook), a tom fill closes bar 4
          alt: { dbl: { lead: { semi: -12, to: 'twang', vel: 1.4 } }, p: { drums3: cells('ohk*3', 'ohf', 'ohk*3', 'oh') } },
        },
        // ------------------------------------------------------------------------------------------------ C: half-time industrial bridge
        C: {
          chords: '| Dm | Dm | Bbmaj7 | Bbmaj7 | Gm7 | Gm7 | A7sus | A7 |',
          p: {
            pad: hold(8),
            choir: hold(8),
            sub: 'root*8',
            riff: cells('r1 r2 r2 r2', 'r3 r4 r1 r3'),
            twang: `| a3/6 f4/2 e4/4 d4/4 | a3/6 f4/2 e4/4 f4/4 | bb3/6 g4/2 f4/4 d4/4 | bb3/6 g4/2 f4/4 a4/4 | d4/6 bb4/2 a4/4 g4/4 | d4/6 bb4/2 a4/4 bb4/4 | e4/8 d4/8 | c#4/8 e4/4 a4/4 |`,
            drums: cells('ht*3 ht2', 'ht*3 K...b...RRRRRRRR'),
            drums2: 'hx*8',
            drums3: cells(rest(3), '..........z.z.z.', rest(3), '..z...z...z...zz'),
            fx: 'impact@0 swell@7b/1b',
          },
          mix: { choir: 1.1, all: 0.9 },
          duck: 0.5,
        },
        // ------------------------------------------------------------------------------------------------ B': final hook
        Bf: {
          chords: '| Bbmaj7 | Fmaj7 | Gm9 | Dm9 | Bbmaj7 | Fmaj7 | Gm9.Em7b5 | A7 |',
          p: {
            super: hold(8),
            choir: hold(8),
            bass: cells('pump*3 b8f', 'pump*3 b8o'),
            sub: cells('off808*8'),
            arp: 'arp1*8',
            lead: `| d5/3 f5/3 a5/2 g5/4 f5/4 | e5/3 a5/3 c6/2 a5/4 g5/4 | d5/3 g5/3 bb5/2 a5/4 g5/4 | f5/3 a5/3 d6/2 c6/4 a5/4 |
                    | d6/3 f6/3 a6/2 g6/4 f6/4 | e6/3 a6/3 c7/2 a6/4 g6/4 | d6/4 bb5/4 g5/4 e5/4 | c#6/4 a5/4 e5/4 a4/4 |`,
            twang: `| d4/3 f4/3 a4/2 g4/4 f4/4 | e4/3 a4/3 c5/2 a4/4 g4/4 | d4/3 g4/3 bb4/2 a4/4 g4/4 | f4/3 a4/3 d5/2 c5/4 a4/4 |
                    | d4/3 f4/3 a4/2 g4/4 f4/4 | e4/3 a4/3 c5/2 e5/4 d5/4 | d5/4 bb4/4 g4/4 e4/4 | c#5/4 a4/8 r/4 |`,
            bell: `| r/16 | r/16 | r/16 | r/12 a6/2 r/2 | r/16 | r/16 | r/16 | r/12 e6/2 r/2 |`,
            drums: cells('bg*3 bgf', 'bg*3 K...s...RRRRRRRR'),
            drums2: cells('cl*7', '................'),
            drums3: cells('ohk*7', 'oh'),
            fx: 'impact@0 riser@6b/2b',
          },
          mix: { twang: 0.9, arp: 2.0 },
        },
      },
      intro: ['I'],
      order: ['A', 'B', 'C', 'Bf'],
    };

    // ============================================================================================================================================
    // STAGE 2 "Iron Tide"  (rounds 16-29)   126 bpm   C# minor / Phrygian b2   80 bars = intro 8 (once) + loop 72   ~ 2:32 per pass, loop 2:17
    //
    //   Concept: the tide turns to iron.  Heavier than stage 1: a distorted saw riff bass plays the tune's rhythm section, metal percussion (clangs, noise hits,
    //   metallic hats, crushed snares), hard supersaw drops and a HALF-TIME breakdown.  The colour is C# PHRYGIAN: the b2 (D) leans on the tonic everywhere
    //   (riff, lead, bII chord).  The hook is built on OFF-BEATS (stomping 8th stabs), the opposite of stage 1's on-beat ping run.
    //
    //   FORM MAP (bars)          chords                                                                     what enters / leaves
    //   I   intro      8  once   C#m C#m D D C#m C#m B5 B5                                                   drone pad, ghost-kick pump, clangs + noise hits, bell pings, riff from bar 5, riser
    //   A   verse     16         C#m C#m D C#m | C#m C#m D E | F#m F#m D D | A B5 G#7sus G#7              riff + sub, K / S groove with metal hats, cold saw arp, twang tune (bars 1-12);
    //                                                                                                       bars 13-16 = pre-drop BUILD (riser, hp-sweep, snare roll, everything cuts the last beat)
    //   C   drop 1    16         C#m D C#m B5 | C#m D A B5 | F#m D C#m B5 | A B5 G#7sus G#7              impact; sidechained supersaw + stabs, 808 sub, riff, K four-on-floor + S/clap, LEAD hook
    //   H   half-time  8         C#m C#m D D C#m C#m B5 G#7                                              HALF-TIME: boom kick, snare on 3, clangs, slow riff, choir, tremolo twang line; reverse swell
    //   V2  bridge     8         F#m F#m E E D D G#7sus G#7                                              the singing lead (long notes), riff in 8ths, K 4/4, rising arp; filter-sweep into build
    //   B2  build      8         A A B5 B5 F#m F#m G#7sus G#7sus                                         hats 16ths, clangs, noise hits, two-bar snare roll, riser + swell, everything cuts
    //   D2  drop 2    16         C#m D C#m B5 | C#m D A B5 | F#m D C#m B5 | A B5 G#7sus G#7              as C but harder: crushed snares, X clangs, twang doubles the lead, stab layer, extra riff
    //
    //   HOOK (lead, over C#m | D | C#m | B5):  offbeat 8ths "  . C# . C# E D C#- " = C#5 C#5 E5 D5 C#5   |  D5 D5 F#5 E5 D5   |  C#5 E5 G#5 B5 G#5 E5  |  F#5 D5 B4
    //   second half (C#m | D | A | B5):  C#5 C#5 E5 G#5 B5-  |  A5 A5 F#5 E5 D5-  |  C#6 B5 A5 E5  |  F#5 E5 D5-   (the final D5 = b2 resolves down into the C# of the next pass)
    //   RIFF (distorted saw, 3-3-2): C# . . C# . . C# . C# . . C# . . D .   (b2 on the last 16th of the bar), on D the last note is E.
    //   Mix intent (section loudness): I -23, A -18, C -15, H -19, V2 -19, B2 -17, D2 -14.5 LUFS.
    // ============================================================================================================================================
    // the twang line of drop 2, bars 1-8 (the hook an octave under the lead) -- shared by the original and the second-pass version of D2
    const s2d2tw = `| r/2 c#4/2 r/2 c#4/2 e4/2 d4/2 c#4/4 | r/2 d4/2 r/2 d4/2 f#4/2 e4/2 d4/4 | r/2 c#4/2 e4/2 g#4/2 b4/2 g#4/4 e4/2 | f#4/4 d4/4 b3/8 |
                    | r/2 c#4/2 r/2 c#4/2 e4/2 g#4/2 b4/4 | r/2 a4/2 r/2 a4/2 f#4/2 e4/2 d4/4 | c#5/4 b4/4 a4/4 e4/4 | f#4/4 e4/4 d4/8 |`;
    D.stage2 = {
      bpm: 126, swing: 0.5, echo: 3, fb: 0.36, key: 1, mode: [0, 1, 3, 5, 7, 8, 10], gain: 1.184, duckRel: 0.5,
      lanes: {
        riff: { inst: 'riff', vol: 1.5, drive: 7, lpf: 3800, lq: 0.8, duck: 0.3 },
        sub: { inst: 'sub', vol: 0.55, drive: 2.5, duck: 0.92, lpf: 700 },
        pad: { inst: 'pad', vol: 0.5, hall: 0.35, duck: 0.4, cut: 1100 },
        choir: { inst: 'choir', vol: 0.6, hall: 0.55, vib: [4.8, 16], vowel: 'oh', duck: 0.3 },
        super: { inst: 'super', vol: 1.0, hall: 0.2, duck: 0.75, lpf: 7000, spread: 24 },
        stab: { inst: 'stab', vol: 0.55, hall: 0.2, duck: 0.6, spread: 26, voicing: { lo: 55, hi: 79, n: 3 } },
        arp: { inst: 'arp', vol: 0.3, wave: 'sawtooth', dly: 0.35, hall: 0.15, pan: 0.25, hpf: 300, duck: 0.4 },
        lead: { inst: 'lead', vol: 1.1, drive: 2.5, dgain: 0.4, lpf: 5200, dly: 0.3, hall: 0.2, hpf: 200 },
        twang: { inst: 'twang', vol: 0.95, trem: { rate: 5.2, depth: 0.5 }, spr: 0.4, hall: 0.3, dly: 0.28, hpf: 140 },
        bell: { inst: 'bell', vol: 0.5, hall: 0.5, dly: 0.2 },
        fx: { inst: 'fx', vol: 0.45, hall: 0.3 },
        kick: { vol: 1.2, drive: 2 }, snare: { vol: 0.45, hall: 0.12 }, hats: { vol: 0.4 }, perc: { vol: 0.3 },
      },
      pats: {
        // drums.  grid 1 = kick + snare, grid 2 = metal hats, grid 3 = clangs / noise / extra
        vg: 'K...S.K.K...S...', vgf: 'K...S.K.K..KS.SS', vgo: 'K...S.K.K.......',      // verse groove / fill / open end
        mh: 'm.m.m.m.m.m.m.M.', mh8: 'm.m.m.m.m.m.m.m.', mq: '..m...m...m...m.',
        f4: 'K...K...K...K...', bk: 'K...S...K...S...', bkf: 'K...S...K...S.SS',        // four-on-floor / drop groove / fill
        cl: '....p.......p...', m16: "m,m,m,m,m,m,m,m,m,m,m,m,m,m,m,m,", m16c: 'cm,m,m,m,m,m,m,m,m,m,m,m,m,m,m,',
        ht: 'K.....b.S.......', ht2: 'K.....b.S.....SS', hx: '..x...........x.',        // half-time: kick, boom, snare on 3, clangs
        xb: 'x...............', xo: '........x.......', xX: 'x.......X.......', zz: '..............z.',
        k24: '....K.......K...', xbk: 'x...K.......K...', xXk: 'x...K...X...K...', xXf: 'x...K...X...t.uv', k24f: '....K.......t.uv',      // FIXPLAN_V3 A7: kicks on beats 2 and 4 (alone / under the clangs) = four-on-the-floor with the 'bk' kicks on 1 and 3
        // bass: 1 root, f = b2, 2 = 2nd, 3 = minor third, 5 = fifth, g = b6, 7 = b7
        rA: "1'..1..1'.1..1..f.", rB: "1'..1..1'.1..1..2.", rC: "1'..1..1'.1..1.5.f", rD: "1'.11.1.11'.11.1.1", rDc: "1'.11.1.11'.11....", rootc: '1-----------....',
        rH: '1.......1.1.f...', rH2: '1.......1.1.1.f.',
        r8: "1'-1-1-1'-1-1-1-1-",
        off808: '..1-..1-..1-..1-', pump: '1-1-8-1-1-1-8-1-',
        arp1: '1.3.5.8.a.8.5.3.', st2: '......x.......x.',
      },
      sections: {
        // ------------------------------------------------------------------------------------------------ INTRO (8 bars, once)
        I: {
          chords: '| C#m | C#m | D | D | C#m | C#m | B5 | B5 |',
          p: {
            pad: hold(8),
            choir: rest(4) + hold(4),
            riff: cells(rest(4), 'rA rA rB rB'),
            sub: 'root*8',
            arp: cells(rest(4), 'arp1*4'),
            bell: `| r/16 | r/8 c#6/2 r/6 | r/16 | r/8 d6/2 r/6 | r/16 | r/8 c#6/2 r/2 c#6/2 r/2 | r/16 | r/16 |`,
            drums: cells(rep('q...q...q...q...', 4), rep('K.......K.......', 3), 'K.......K.K.S.S.'),
            drums2: cells('mq*4', 'mh8*4'),
            drums3: cells('xb', rest(1), 'xo', 'xb', 'xb', 'xo', 'xX', 'zz'),
            fx: 'riser@4b/4b swell@6b/2b',
          },
          mix: { choir: 0.8, sub: 0.6, pad: 2.0, bell: 1.4, all: 0.8 },
          auto: { 'arp.vol': [0.12, 0.3, 'lin', 4, 8] },
        },
        // ------------------------------------------------------------------------------------------------ A: verse (12 bars) + pre-drop build (4 bars)
        A: {
          chords: '| C#m | C#m | D | C#m | C#m | C#m | D | E | F#m | F#m | D | D | A | B5 | G#7sus | G#7 |',
          p: {
            pad: hold(16),
            riff: cells('rA rA rB rA', 'rA rA rB rB', 'rA rA rB rB', 'rD rD rD rDc'),
            sub: cells('root*12', 'root*3', 'rootc'),
            arp: cells('arp1*12', 'arp1*4'),
            twang: `| r/2 g#4/2 c#5/6 d5/2 c#5/4 | e5/6 d5/2 c#5/8 | d5/4 f#5/4 a5/4 f#5/4 | g#4/4 b4/4 c#5/8 |
                    | r/2 g#4/2 c#5/6 d5/2 e5/4 | g#5/6 e5/2 c#5/8 | d5/4 a5/4 f#5/4 d5/4 | g#5/4 e5/4 b4/8 |
                    | f#5/6 c#5/2 a4/4 c#5/4 | a5/4 c#6/4 b5/4 a5/4 | a5/6 f#5/2 d5/8 | e5/4 f#5/4 a5/8 |
                    | r/16 | r/16 | r/16 | r/16 |`,
            drums: cells('vg*3 vgf', 'vg*3 vgf', 'vg*3 vgo', 'f4*2', "S,...S,...S...S...", 'RRRRRRRRRRRR....'),
            drums2: cells('mh*12', 'mh8*2', 'mh8*2'),
            drums3: cells(rep(rest(1), 3), 'zz', rest(3), 'zz', rest(3), 'zz', 'xb', rest(1), 'xX', rest(1)),
            fx: 'riser@12b/60 impact@0:0.5 swell@14b/2b',
          },
          mix: { arp: 0.8, snare: 0.7 },
          auto: { 'master.hpf': [[0, 20], [12, 20], [15.75, 600], [15.8125, 10]], 'master.vol': [[0, 0.6], [12, 0.6], [16, 1.0]] },
          // SECOND PASS (A8): a bell counter-line over the verse tune (bars 1-12)
          alt: {
            mix: { bell: 2.4 },
            p: {
              bell: `| r/12 g#5/2, c#6/2, | g#5/6, e5/2, c#5/8, | r/8 f#5/2, a5/2, d6/4, | g#5/6, e5/2, c#5/8, | r/12 g#5/2, c#6/2, | c#6/6, g#5/2, e5/8, | r/8 a5/2, d6/2, f#6/4, | g#5/6, e5/2, b4/8, |
                      | r/8 a5/2, c#6/2, f#6/4, | c#6/6, a5/2, f#5/8, | d6/8, a5/8, | f#5/8, a5/8, | r/16 | r/16 | r/16 | r/16 |`,
            },
          },
        },
        // ------------------------------------------------------------------------------------------------ C: drop 1 (16 bars)
        C: {
          chords: '| C#m | D | C#m | B5 | C#m | D | A | B5 | F#m | D | C#m | B5 | A | B5 | G#7sus | G#7 |',
          p: {
            super: hold(16),
            stab: cells(rest(4), 'st2*12'),
            pad: hold(16),
            riff: cells('rA rB rA rA', 'rA rB rC rB', 'rA rB rA rC', 'rA rB rD rD'),
            sub: cells('root*4', 'off808*12'),
            arp: cells('arp1*16'),
            lead: `| r/2 c#5/2 r/2 c#5/2 e5/2 d5/2 c#5/4 | r/2 d5/2 r/2 d5/2 f#5/2 e5/2 d5/4 | r/2 c#5/2 e5/2 g#5/2 b5/2 g#5/4 e5/2 | f#5/4 d5/4 b4/8 |
                    | r/2 c#5/2 r/2 c#5/2 e5/2 g#5/2 b5/4 | r/2 a5/2 r/2 a5/2 f#5/2 e5/2 d5/4 | c#6/4 b5/4 a5/4 e5/4 | f#5/4 e5/4 d5/8 |
                    | r/2 f#5/2 r/2 f#5/2 a5/2 g#5/2 f#5/4 | r/2 a5/2 r/2 a5/2 f#5/2 e5/2 d5/4 | r/2 c#6/2 r/2 c#6/2 e6/2 d6/2 c#6/4 | f#6/4 d6/4 b5/8 |
                    | c#6/4 e6/4 a6/8 | b6/4 f#6/4 d6/8 | g#6/6 f#6/2 d6/4 b5/4 | c#6/4 g#5/4 d#5/4 r/4 |`,
            drums: cells('bk*3 bkf', 'bk*3 bkf', 'bk*3 bkf', 'bk*3 K...S...RRRRRRRR'),
            drums2: cells('m16c', 'mh*5', 'm16*2', 'm16c', 'mh*5', 'm16*2'),
            drums3: cells(rep('k24', 3), 'xXk', rep('k24', 3), 'xXk', rep('k24', 3), 'xXk', rep('k24', 3), 'x.......X.z.z.z.'),
            fx: 'impact@0 swell@7b/1b impact@8b:0.6 down@15b/1b',
          },
          mix: { arp: 1.6 },                                                 // A5: the cold arp stays audible in the drops (+4 dB)
          // SECOND PASS (A8): the hook's first statement doubled an octave up, tom fills close bars 4 / 8 / 12
          alt: {
            dbl: { lead: { semi: 12, bars: [1, 4], vel: 0.5 } },
            p: { drums3: cells(rep('k24', 3), 'xXf', rep('k24', 3), 'xXf', rep('k24', 3), 'xXf', rep('k24', 3), 'x.......X.z.z.z.') },
          },
        },
        // ------------------------------------------------------------------------------------------------ H: half-time breakdown (8 bars)
        H: {
          chords: '| C#m | C#m | D | D | C#m | C#m | B5 | G#7 |',
          p: {
            pad: hold(8),
            choir: hold(8),
            riff: cells('rH rH2 rH rH2', 'rH rH2 rH rH2'),
            sub: 'root*8',
            twang: `| c#5/8 d5/4 c#5/4 | e5/8 d5/4 c#5/4 | d5/8 f#5/4 a5/4 | a5/6 f#5/2 d5/8 | c#5/8 e5/4 g#5/4 | b5/6 g#5/2 e5/8 | f#5/8 d5/4 b4/4 | d#5/6 f#5/2 g#5/4 d#5/4 |`,
            bell: `| c#6/2 r/14 | r/16 | d6/2 r/14 | r/16 | c#6/2 r/14 | r/16 | b5/2 r/14 | r/16 |`,
            drums: cells('ht*3 ht2', 'ht*3 K...b...RRRRRRRR'),
            drums2: 'hx*8',
            drums3: cells(rest(3), 'zz', rest(3), '..z...z...z...zz'),
            fx: 'impact@0 down@0/1b swell@7b/1b',
          },
          mix: { choir: 1.1, all: 0.45 },
          duck: 0.5,
        },
        // ------------------------------------------------------------------------------------------------ V2: singing bridge (8 bars)
        V2: {
          chords: '| F#m | F#m | E | E | D | D | G#7sus | G#7 |',
          p: {
            pad: hold(8),
            choir: hold(8),
            riff: cells('r8*8'),
            sub: 'root*8',
            arp: 'arp1*8',
            lead: `| f#5/6 a5/2 c#6/8 | b5/6 a5/2 f#5/8 | e5/6 g#5/2 b5/8 | c#6/6 b5/2 g#5/8 | d5/4 f#5/4 a5/8 | b5/6 a5/2 f#5/8 | g#5/4 c#6/4 d6/8 | b5/4 g#5/4 d#5/4 g#5/4 |`,
            drums: cells('f4*7', 'K...K...K...K.RR'),
            drums2: cells('mh8*7', 'mh8'),
            drums3: cells(rest(3), 'zz', rest(3), 'xX'),
            fx: 'swell@0/1b riser@4b/4b',
          },
          mix: { riff: 0.8, snare: 0.6, all: 0.6, arp: 1.6 },
          auto: { 'arp.vol': [0.2, 0.4], 'master.hpf': [20, 300, 'exp', 4, 8] },
          // SECOND PASS (A8): the singing line is doubled by the twang an octave below
          alt: { dbl: { lead: { semi: -12, to: 'twang', vel: 1.1 } } },
        },
        // ------------------------------------------------------------------------------------------------ B2: build (8 bars)
        B2: {
          chords: '| A | A | B5 | B5 | F#m | F#m | G#7sus | G#7sus |',
          p: {
            pad: hold(8),
            super: 'stab*7 ..x...x...x.....',
            riff: cells('rD*7', rest(1)),
            arp: cells('arp1*3', 'arp16*4', '1358a853........'),
            drums: cells('f4*6', 'K.K.K.K.K.K.K.K.', rest(1)),
            drums2: cells('mh*2', 'm16*2', "S,...S,...S...S...", "S.S.S.S.S'.S'.S'.S'.", 'RRRRRRRRRRRRRRRR', 'RRRRRRRRRRRR....'),
            drums3: cells('xb', rest(1), 'xo', rest(1), 'xX', 'x...x...x...x...', 'zzzzzzzz........', rest(1)),
            fx: 'riser@0/124 swell@4b/3b',
          },
          mix: { super: 0.85, snare: 0.6 },
          cfg: { super: { voicing: { lo: 55, hi: 79, n: 3 } } },
          auto: { 'super.lpf': [400, 9000, 'exp'], 'master.hpf': [[0, 20], [2, 20], [7.75, 1200], [7.8125, 10]], 'arp.vol': [0.09, 0.2], 'master.vol': [0.65, 1.0, 'in'] },
        },
        // ------------------------------------------------------------------------------------------------ D2: drop 2 (16 bars)
        D2: {
          chords: '| C#m | D | C#m | B5 | C#m | D | A | B5 | F#m | D | C#m | B5 | A | B5 | G#7sus | G#7 |',
          p: {
            super: hold(16),
            stab: cells('st2*16'),
            riff: cells('rA rB rC rB', 'rA rB rC rB', 'rA rB rA rC', 'rD rD rD rD'),
            sub: cells('off808*16'),
            arp: cells('arp1*16'),
            lead: `| r/2 c#5/2 r/2 c#5/2 e5/2 d5/2 c#5/4 | r/2 d5/2 r/2 d5/2 f#5/2 e5/2 d5/4 | r/2 c#5/2 e5/2 g#5/2 b5/2 g#5/4 e5/2 | f#5/4 d5/4 b4/8 |
                    | r/2 c#6/2 r/2 c#6/2 e6/2 d6/2 c#6/4 | r/2 d6/2 r/2 d6/2 f#6/2 e6/2 d6/4 | r/2 c#6/2 e6/2 g#6/2 b6/2 g#6/4 e6/2 | f#6/4 d6/4 b5/8 |
                    | r/2 f#5/2 r/2 f#5/2 a5/2 g#5/2 f#5/4 | r/2 a5/2 r/2 a5/2 f#5/2 e5/2 d5/4 | r/2 c#6/2 r/2 c#6/2 e6/2 d6/2 c#6/4 | f#6/4 d6/4 b5/8 |
                    | c#6/4 e6/4 a6/8 | b6/4 f#6/4 d6/8 | g#6/6 f#6/2 d6/4 b5/4 | c#6/4 g#5/4 d#5/4 r/4 |`,
            twang: `${s2d2tw} | r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | r/16 |`,
            drums: cells('bk*3 bkf', 'bk*3 bkf', 'bk*3 bkf', 'bk*3 K...S...RRRRRRRR'),
            drums2: cells('m16c', 'mh*5', 'm16*2', 'm16c', 'mh*5', 'm16*2'),
            drums3: cells(rep('xbk xXk', 7), 'xbk', 'x.......X.z.z.z.'),
            fx: 'impact@0 swell@7b/1b impact@8b:0.6 swell@15b/1b',
          },
          cfg: { super: { n: 7, spread: 28 } },
          mix: { arp: 1.6 },
          // SECOND PASS (A8): hook statement 1 doubled an octave up, a twang tenor counter-line under the second half (bars 9-16), tom fills at bars 4 / 8 / 12
          alt: {
            dbl: { lead: { semi: 12, bars: [1, 4], vel: 0.5 } },
            p: {
              twang: `${s2d2tw} | a4/8, c#5/8, | f#4/8, a4/8, | g#4/8, e4/8, | f#4/16, | e5/8, c#5/8, | f#5/8, b4/8, | r/16 | r/16 |`,
              drums3: cells('xbk xXk', 'xbk xXf', 'xbk xXk', 'xbk xXf', 'xbk xXk', 'xbk xXf', 'xbk xXk', 'xbk', 'x.......X.z.z.z.'),
            },
          },
        },
      },
      intro: ['I'],
      order: ['A', 'C', 'H', 'V2', 'B2', 'D2'],
    };

    // ============================================================================================================================================
    // BOSS "Crown of the Deep"   140 bpm   F minor (+ b2 Gb)   52 bars = intro 4 (once) + loop 48   ~ 1:34 per pass, loop 1:22 (1:11 at the 1.15 boss-hurry tempo)
    //
    //   Concept: the Kraken rises.  Aggressive industrial EDM: a KLAXON (the alarm lead trilling F / Gb in 16ths = the b2 neighbour) over a galloping distorted
    //   riff, double-time metal hats, a regal "crown" fanfare on a saw lead, a HALF-TIME drop (snare on 3, boom kick, slow chugs) and a final fury.
    //   Plays up to tempo x1.2 (maxTempo): every pattern is 16th-grid based and the delay is tempo-synced, so the hurry tempo only makes it faster.
    //
    //   FORM MAP (bars)           chords                                                                       what enters / leaves
    //   I   intro      4  once    Fm Fm Gb C7                                                                  pad, klaxon pings, riser, impact (the boss appears), snare roll
    //   A   alarm      8          Fm Fm Db C7 | Fm Fm Bbm C7                                                   gallop riff + sub, klaxon trills + wails, K / S metal groove, 16th metal hats, clangs
    //   B   crown      8          Fm Db Bbm C7 | Fm Db Eb C7                                                   CROWN HOOK (saw lead), sidechained supersaw, K 4/4 + S / clap, riff 8ths, arp
    //   C   half-time  8          Fm Fm Gb Gb | Fm Fm Eb Eb                                                    HALF-TIME DROP: boom kick, snare on 3, slow riff with b2, slow klaxon wails, noise hits
    //   D   break      4          Db Eb Fm C7sus                                                               kick out: choir + pad + bell pings + klaxon pings, reverse swell
    //   E   build      4          Bbm Bbm C7sus C7sus                                                          riser, hp-sweep, snare roll 16ths, everything cuts the last beat
    //   F   drop 2     8          Fm Db Bbm C7 | Fm Db Eb C7                                                   hook an octave up + riff gallop + stabs + crash, crushed snares
    //   G   fury       8          Fm Gb Fm Gb | Db Eb C7 C7                                                    klaxon trills + hook fragments + gallop, every bar a fill; C7 turns around into A
    //
    //   KLAXON (alarm lead):  F5 Gb5 F5 Gb5 F5 Gb5 F5 Gb5 C6--  (16th trill on the b2 neighbour, then a wailing fifth)
    //   CROWN HOOK (lead, over Fm | Db | Bbm | C7):  C5 F5 Ab5 C6-- | Bb5 Db6 F6 Eb6-- | Db6 Bb5 F5 Ab5-- | G5 Bb5 E6 C6     (a rising fanfare, a falling answer)
    //   Mix intent (section loudness): I -22, A -16, B -16, C -15, D -22, E -18, F -14.5, G -14.5 LUFS.
    // ============================================================================================================================================
    // klaxon ostinato cell: a b a c in 16ths (b = neighbour, c = the leap), one bar = 4 cells; kx2 = 2 cells (8 steps) + a tail of 8 steps
    const kx4 = (a, b, c) => rep(`${a}/1 ${b}/1 ${a}/1 ${c}/1`, 4);
    const kx2 = (a, b, c, tail) => rep(`${a}/1 ${b}/1 ${a}/1 ${c}/1`, 2) + ' ' + tail;
    D.boss = {
      bpm: 140, swing: 0.5, echo: 3, fb: 0.34, key: 5, mode: [0, 2, 3, 5, 7, 8, 10], gain: 0.985, maxTempo: 1.2, duckRel: 0.45,
      lanes: {
        riff: { inst: 'riff', vol: 1.4, drive: 9, lpf: 3600, lq: 0.8, duck: 0.3 },
        sub: { inst: 'sub', vol: 0.55, drive: 2.5, duck: 0.92, lpf: 700 },
        alarm: { inst: 'alarm', vol: 0.6, drive: 2, dgain: 0.4, lpf: 6000, dly: 0.25, hall: 0.2, hpf: 300 },
        lead: { inst: 'lead', vol: 1.2, dly: 0.3, hall: 0.25, hpf: 220 },
        super: { inst: 'super', vol: 1.0, hall: 0.2, duck: 0.75, lpf: 7500, spread: 26 },
        stab: { inst: 'stab', vol: 0.55, hall: 0.2, duck: 0.6, spread: 26, voicing: { lo: 55, hi: 79, n: 3 } },
        pad: { inst: 'pad', vol: 0.5, hall: 0.35, duck: 0.4, cut: 1100 },
        choir: { inst: 'choir', vol: 0.6, hall: 0.55, vib: [5, 16], vowel: 'oh', duck: 0.3 },
        arp: { inst: 'arp', vol: 0.28, wave: 'sawtooth', dly: 0.3, pan: -0.25, hpf: 350, duck: 0.4 },
        bell: { inst: 'bell', vol: 0.5, hall: 0.5, dly: 0.2 },
        twang: { inst: 'twang', vol: 0.95, trem: { rate: 5.2, depth: 0.5 }, spr: 0.4, hall: 0.3, dly: 0.28, hpf: 140 },
        fx: { inst: 'fx', vol: 0.45, hall: 0.3 },
        kick: { vol: 1.2, drive: 2.2 }, snare: { vol: 0.45, hall: 0.12 }, hats: { vol: 0.4 }, perc: { vol: 0.3 },
      },
      pats: {
        // drums
        ag: 'K...S..KK.K.S...', agf: 'K...S..KK.K.S.SS', ago: 'K...S..KK.K.....',      // alarm groove / fill / open
        f4: 'K...K...K...K...', bk: 'K...S...K...S...', bkf: 'K...S...K...S.SS',
        m16: "m,m,m,m,m,m,m,m,m,m,m,m,m,m,m,m,", m16a: "m'm,m,m,m'm,m,m,m'm,m,m,m'm,m,M,", m16c: 'cm,m,m,m,m,m,m,m,m,m,m,m,m,m,m,', mh8: 'm.m.m.m.m.m.m.m.',
        cl: '....p.......p...',
        ht: 'K.K...b.S.......', ht2: 'K.K...b.S.....SS', hx: '..x...X...x...x.',
        xb: 'x...............', xo: '........x.......', xX: 'x.......X.......', zz: '..............z.',
        k24: '....K.......K...', xXk: 'x...K...X...K...', xXf: 'x...K...X...t.uv',                         // FIXPLAN_V3 A7: kicks on beats 2 and 4 (four-on-the-floor in the drops)
        mhk: 'mhmhKhmhmhmhKhmh', mhf: 'mhmhKhmhmhmhtuvv', m16k: "m,m,m,m,K" + "m,m,m,m,m,m,m," + "K" + "m,m,m,",       // the double-time metal hats with the beat-2 / beat-4 kick in place of the hat
        // bass: 1 root, f = b2, 3 = minor third, 5, g = b6, 7 = b7
        gal: '1181118111811181', galf: '1181118111811f81', gal5: '1181118111811581',
        galx: '1.111.111.111.11', galxf: '1.111.111.111.1f', galx5: '1.111.111.111.15',            // the gallop with 12 notes per bar (1 . x x per beat): the 16th gallop above costs a third more CPU
        st2: '......x.......x.', arp8: '1.3.5.8.a.8.5.3.',
        rH: '1.......1.1.f...', rH2: '1.......1.1.1.f.', r8: "1'-1-1-1'-1-1-1-1-",
        rD: "1'.11.1.11'.11.1.1",
        off808: '..1-..1-..1-..1-', root2: '1-------1-------',
        arp1: '1358a853c8531358',
      },
      sections: {
        // ------------------------------------------------------------------------------------------------ INTRO (4 bars, once): the boss appears
        I: {
          chords: '| Fm | Fm | Gb | C7 |',
          p: {
            pad: hold(4),
            alarm: `| r/16 | r/8 c6/2 r/2 c6/2 r/2 | ${kx2('f5', 'gb5', 'c6', 'c6/8')} | ${kx4('f5', 'gb5', 'c6')} |`,
            sub: cells(rest(2), 'root', rest(1)),
            drums: cells(rep('q...q...q...q...', 2), 'K...K...K...K...', 'RRRRRRRRRRRRRRRR'),
            drums3: cells('xb', rest(1), 'xX', rest(1)),
            fx: 'riser@0/4b swell@3b/1b',
          },
          mix: { alarm: 0.9, all: 0.65 },
        },
        // ------------------------------------------------------------------------------------------------ A: alarm (8 bars)
        A: {
          chords: '| Fm | Fm | Db | C7 | Fm | Fm | Bbm | C7 |',
          p: {
            riff: cells('galx galxf galx galxf', 'galx galxf galx galx5'),
            sub: cells('root*8'),
            arp: cells(rest(4), 'arp1*4'),
            alarm: `| ${kx2('f5', 'gb5', 'c6', 'c6/8')} | ${kx2('f5', 'gb5', 'c6', 'ab5/4 c6/4')} | ${kx2('db6', 'c6', 'ab5', 'ab5/8')} | ${kx2('c6', 'db6', 'g5', 'g5/4 e5/4')} |
                    | ${kx2('f5', 'gb5', 'c6', 'c6/8')} | f5/2 ab5/2 c6/2 db6/2 c6/4 ab5/4 | ${kx2('bb5', 'c6', 'f5', 'f6/8')} | g5/4 bb5/4 e6/4 db6/4 |`,
            drums: cells('ag*3 agf', 'ag*3 agf'),
            drums2: cells('m16a*8'),
            drums3: cells('xb', rest(2), 'zz', 'xb', rest(2), 'zz'),
            fx: 'impact@0:0.6 swell@7b/1b',
          },
          mix: { arp: 0.8, all: 0.82 },
          // SECOND PASS (A8): the supersaw stabs and the choir join for the second half of the alarm
          alt: { mix: { stab: 3, choir: 1.2 }, p: { stab: cells(rest(4), 'stab*4'), choir: rest(4) + hold(4) } },
        },
        // ------------------------------------------------------------------------------------------------ B: crown (8 bars)
        B: {
          chords: '| Fm | Db | Bbm | C7 | Fm | Db | Eb | C7 |',
          p: {
            super: hold(8),
            pad: hold(8),
            riff: cells('r8*8'),
            sub: cells('root*4', 'off808*4'),
            arp: 'arp8*8',
            lead: `| c5/2 f5/2 ab5/4 c6/8 | bb5/2 db6/2 f6/4 eb6/8 | db6/2 bb5/2 f5/4 ab5/8 | g5/4 bb5/4 e6/4 c6/4 |
                    | c5/2 f5/2 ab5/4 c6/4 db6/4 | bb5/2 db6/2 f6/4 ab6/4 g6/4 | g5/2 bb5/2 eb6/4 g6/8 | e6/4 c6/4 bb5/4 g5/4 |`,
            drums: cells('bk*3 bkf', 'bk*3 K...S...RRRRRRRR'),
            drums2: cells('mhk*6', 'm16k', 'm16'),
            drums3: cells('cl*8'),
            fx: 'impact@0 swell@7b/1b',
          },
          mix: { arp: 1.6 },                                                 // A5: the cold arp stays audible in the drops (+4 dB)
          // SECOND PASS (A8): the crown hook is doubled by a plucked twang an octave below, a tom fill closes bar 4
          alt: { dbl: { lead: { semi: -12, to: 'twang', vel: 1.4 } }, p: { drums2: cells('mhk*3', 'mhf', 'mhk*2', 'm16k', 'm16') } },
        },
        // ------------------------------------------------------------------------------------------------ C: half-time drop (8 bars)
        C: {
          chords: '| Fm | Fm | Gb | Gb | Fm | Fm | Eb | Eb |',
          p: {
            pad: hold(8),
            riff: cells('rH rH2 rH rH2', 'rH rH2 rH rH2'),
            sub: 'root*8',
            alarm: `| f5/8 gb5/4 f5/4 | c6/12 r/4 | gb5/8 ab5/4 gb5/4 | db6/12 r/4 | f5/8 gb5/4 f5/4 | ab5/12 r/4 | g5/8 bb5/4 g5/4 | eb6/8 bb5/4 g5/4 |`,
            drums: cells('ht*3 ht2', 'ht*3 K...b...RRRRRRRR'),
            drums2: 'hx*8',
            drums3: cells(rest(3), 'zz', rest(3), '..z...z...z...zz'),
            fx: 'impact@0 swell@7b/1b',
          },
          mix: { alarm: 0.9 },
          duck: 0.5,
        },
        // ------------------------------------------------------------------------------------------------ D: break (4 bars)
        D: {
          chords: '| Db | Eb | Fm | C7sus |',
          p: {
            pad: hold(4),
            choir: hold(4),
            bell: `| f6/2 r/14 | g6/2 r/14 | ab6/2 r/2 f6/2 r/10 | c6/2 r/2 c6/2 r/2 c6/2 r/6 |`,
            alarm: `| r/16 | r/16 | r/16 | r/8 ${kx2('f5', 'gb5', 'c6', '').trim()} |`,
            drums: 'q...q...q...q...*4',
            fx: 'down@0/1b swell@3b/1b',
          },
          mix: { drums: 0, pad: 1.1, choir: 1.0, all: 0.6 },
          duck: 0.4,
        },
        // ------------------------------------------------------------------------------------------------ E: build (4 bars)
        E: {
          chords: '| Bbm | Bbm | C7sus | C7sus |',
          p: {
            pad: hold(4),
            super: 'stab*3 ..x...x...x.....',
            riff: cells('rD*3', rest(1)),
            arp: cells('arp1*3', '1358a853........'),
            drums: cells('f4*2', 'K.K.K.K.K.K.K.K.', rest(1)),
            drums2: cells('m16*2', 'RRRRRRRRRRRRRRRR', 'RRRRRRRRRRRR....'),
            drums3: cells('xb', 'xo', 'x...x...x...x...', 'zzzzzzzz........'),
            fx: 'riser@0/60 swell@2b/2b',
          },
          mix: { super: 0.85, snare: 0.6 },
          auto: { 'super.lpf': [400, 9000, 'exp'], 'master.hpf': [[0, 20], [1, 20], [3.75, 1200], [3.8125, 10]], 'arp.vol': [0.09, 0.2], 'master.vol': [0.72, 1.0, 'in'] },
        },
        // ------------------------------------------------------------------------------------------------ F: drop 2 (8 bars)
        F: {
          chords: '| Fm | Db | Bbm | C7 | Fm | Db | Eb | C7 |',
          p: {
            super: hold(8),
            stab: 'st2*8',
            riff: cells('galx galxf galx galxf', 'galx galxf galx galx5'),
            sub: cells('off808*8'),
            arp: 'arp8*8',
            lead: `| c5/2 f5/2 ab5/4 c6/8 | bb5/2 db6/2 f6/4 eb6/8 | db6/2 bb5/2 f5/4 ab5/8 | g5/4 bb5/4 e6/4 c6/4 |
                    | c5/2 f5/2 ab5/4 c6/4 db6/4 | bb5/2 db6/2 f6/4 ab6/4 g6/4 | g5/2 bb5/2 eb6/4 g6/8 | e6/2 g6/2 bb6/4 c7/8 |`,
            drums: cells('bk*3 bkf', 'bk*3 K...S...RRRRRRRR'),
            drums2: cells('m16c', 'mh*5', 'm16*2'),
            drums3: cells('k24', 'xXk', 'k24', 'xXk', 'k24', 'xXk', 'k24', 'x.......X.z.z.z.'),
            fx: 'impact@0 swell@7b/1b',
          },
          cfg: { super: { n: 7, spread: 28 } },
          mix: { arp: 1.6 },
          // SECOND PASS (A8): the choir crowns the second half, the hook doubles on the twang (octave below) there, tom fills at bars 4 / 6
          alt: {
            dbl: { lead: { semi: -12, to: 'twang', vel: 1.1, bars: [5, 8] } },
            p: {
              choir: rest(4) + hold(4),
              drums3: cells('k24', 'xXk', 'k24', 'xXf', 'k24', 'xXf', 'k24', 'x.......X.z.z.z.'),
            },
          },
        },
        // ------------------------------------------------------------------------------------------------ G: fury (8 bars)
        G: {
          chords: '| Fm | Gb | Fm | Gb | Db | Eb | C7 | C7 |',
          p: {
            super: hold(8),
            stab: 'st2*8',
            riff: cells('galx galxf galx galxf', 'galx galxf galx galx5'),
            sub: cells('off808*8'),
            arp: 'arp8*8',
            alarm: `| ${kx2('f5', 'gb5', 'c6', 'c6/8')} | ${kx2('gb5', 'ab5', 'db6', 'db6/8')} | ${kx2('f5', 'gb5', 'c6', 'c6/4 f6/4')} | ${kx2('gb5', 'ab5', 'db6', 'db6/4 gb6/4')} |
                    | r/16 | r/16 | r/16 | g5/2 bb5/2 e6/2 g6/2 c7/8 |`,
            lead: `| r/16 | r/16 | r/16 | r/16 | db6/2 bb5/2 f5/4 ab5/8 | eb6/2 g5/2 bb5/4 eb6/8 | e6/4 c6/4 bb5/4 g5/4 | r/16 |`,
            drums: cells('ag*3 agf', 'ag*3 K...S...RRRRRRRR'),
            drums2: cells('m16c', 'mh*5', 'm16*2'),
            drums3: cells('xb', rest(1), 'xX', rest(1), 'xb', rest(1), 'xX', 'x.......X.z.z.z.'),
            fx: 'impact@0 swell@7b/1b',
          },
          cfg: { super: { n: 7, spread: 30 }, alarm: { n: 1 } },
          mix: { arp: 1.6 },
        },
      },
      intro: ['I'],
      order: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
    };

    // ============================================================================================================================================
    // ENTRY "Midnight Diner"   76 bpm (swung 8ths)   A minor, maj7 colours   16 bars (one jazz chorus, AABA of 4 bars), loop ~ 50 s
    //
    //   Concept: the high-score screen as an all-night diner: a slow noir ballad.  Walking upright bass, a brushed snare on 2 and 4, a lazy swung ride, a vibraphone
    //   (with tremolo) singing a low-key tune, a dark pad, and a lonely tremolo-twang answering at the ends of the phrases (an all-original late-night mood).
    //   Deliberately quiet: no kick drum, no side-chain, no build.  Contrast to the arcade tracks is the point.
    //
    //   CHORD CHART (one bar each)
    //     A1  Am9    Ammaj7   Am7     D9                 (the minor-major seventh = the noir chord)
    //     A2  Gmaj7  Cmaj7#11 F#m7b5  B7b9               (down to the dominant of E)
    //     B   Em9    Em7      Am9     D9                 (the bridge: a step of light)
    //     A3  Fmaj7  Dm9      Bm7b5.E7b9   Am9           (iv - ii/o - V7 - i cadence home)
    //
    //   MAIN TUNE (vibes):  E5. C5 A4 E5 | G#5. E5 C5 (the maj7 on top) | A4 C5 E5 G5 | F#5. D5 C5 A4 ...     long-short-short-medium phrases, nothing hurried
    //   Walking bass: quarter notes, chord tones with chromatic approach to the next root (F#3 -> G3, B2 -> C3, C#3 -> D3 ...).
    //   Mix intent: one flat, quiet arc, section loudness within 2 dB (-18 LUFS integrated after the gain fit).
    // ============================================================================================================================================
    D.entry = {
      bpm: 76, swing: 0.6, echo: 3, fb: 0.32, key: 9, mode: MINOR, gain: 1.85,
      lanes: {
        pad: { inst: 'pad', vol: 0.5, hall: 0.4, cut: 1300 },
        vibes: { inst: 'vibes', vol: 1.0, trem: { rate: 5.2, depth: 0.35 }, hall: 0.35, dly: 0.2 },
        bass: { inst: 'wood', vol: 0.9, drive: 1.8, dgain: 0.2 },
        twang: { inst: 'twang', vol: 0.55, trem: { rate: 4.2, depth: 0.5 }, spr: 0.5, hall: 0.35, dly: 0.22, hpf: 140 },
        bell: { inst: 'bell', vol: 0.4, hall: 0.55 },
        snare: { vol: 0.7 }, hats: { vol: 0.5 }, perc: { vol: 0.5 },
      },
      pats: {
        br: '....B.......B...', brg: '....B.......B.n.',                     // brushed snare on 2 and 4 (+ a ghost brush)
        rd: 'd...d.d.d...d.d.', rdf: 'd...d.d.d...d.dd',                      // swung ride (1, 2, and-of-2, 3, 4, and-of-4)
        rm: '..........r.....', hp: '....h.......h...', sn: '....f,.......f,...', brr: '....B.......BnBn',    // rim click, foot hat on 2 and 4, finger snaps on 2 and 4 (second half; soft: the snap voice is x3.5 louder since FIXPLAN_V3 A6, in this quiet ballad they now sit ~6 dB above the rest)
      },
      sections: {
        E: {
          chords: '| Am9 | Ammaj7 | Am7 | D9 | Gmaj7 | Cmaj7#11 | F#m7b5 | B7b9 | Em9 | Em7 | Am9 | D9 | Fmaj7 | Dm9 | Bm7b5.E7b9 | Am9 |',
          p: {
            pad: hold(16),
            bass: `n: | a2/4 c3/4 e3/4 c3/4 | a2/4 e3/4 g#3/4 e3/4 | a2/4 c3/4 e3/4 g3/4 | d3/4 a2/4 c3/4 f#3/4 |
                      | g2/4 b2/4 d3/4 b2/4 | c3/4 g2/4 e3/4 f3/4 | f#2/4 a2/4 c3/4 a#2/4 | b2/4 d#3/4 f#3/4 d#3/4 |
                      | e2/4 g2/4 b2/4 g2/4 | e2/4 g2/4 b2/4 g#2/4 | a2/4 e3/4 c3/4 c#3/4 | d3/4 f#3/4 a3/4 f#3/4 |
                      | f2/4 a2/4 c3/4 e3/4 | d3/4 f3/4 a2/4 c3/4 | b2/4 f3/4 e2/4 g#2/4 | a2/4 c3/4 e3/4 a3/4 |`,
            vibes: `| e5/6 c5/2 a4/4 e5/4 | g#5/6 e5/2 c5/8 | a4/4 c5/4 e5/4 g5/4 | f#5/6 d5/2 c5/4 a4/4 |
                    | b4/6 d5/2 g5/8 | f#5/6 e5/2 c5/8 | a5/4 c6/4 e6/4 c6/4 | d#5/6 c5/2 b4/8 |
                    | g5/6 e5/2 b4/8 | d5/4 e5/4 g5/4 b5/4 | c6/6 a5/2 e5/8 | f#5/4 a5/4 c6/4 a5/4 |
                    | a5/6 g5/2 f5/8 | f5/4 a5/4 e5/4 d5/4 | d5/4 f5/4 g#5/4 b5/4 | a5/16 |`,
            twang: `| r/16 | r/16 | r/8 e4/4 a4/4 | r/16 | r/16 | r/16 | r/8 e4/4 f#4/4 | r/16 |
                    | r/16 | r/16 | r/8 c5/4 a4/4 | r/16 | r/16 | r/16 | r/16 | r/8 c5/6 a4/2 |`,
            bell: `| r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | r/12 e6/4 | r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | r/12 a6/4 |`,
            drums: cells('br*3 brg', 'br*3 brg', 'br*3 brg', 'br*3 brg'),
            drums2: cells('rd*3 rdf', 'rd*3 rdf', 'rd*3 rdf', 'rd*3 rdf'),
            drums3: cells('hp*3 rm', 'hp*3 rm', 'sn*3 rm', 'sn*3 rm'),
          },
          mix: { pad: 1.0, twang: 1.0 },
          // SECOND PASS (A8): the vibraphone tune is doubled an octave up in the bridge (bars 9-12) and the brushes fill the end of every phrase
          alt: {
            dbl: { vibes: { semi: 12, vel: 0.35, bars: [9, 12] } },
            p: { drums: cells('br*3 brr', 'br*3 brr', 'br*3 brr', 'br*3 brr') },
          },
        },
      },
      order: ['E'],
    };

    // ============================================================================================================================================
    // ENDING "Return of the Light"   100 bpm   D minor -> D MAJOR (Picardy)   40 bars, loop ~ 1:36 (no intro: the credits can roll as long as they like)
    //
    //   Concept: the answer to the title.  Same opening motif as "Neon Abyss" (A F E D, the leap up a minor sixth and the sigh back down) but now slow and tender
    //   over a dreamy pad, then in the finale the same tune with ONE note raised (F -> F#): minor turns major and a huge side-chained supersaw wall carries it.
    //   The loop runs finale -> quiet outro -> minor dream again (the Picardy cycles back into the night).
    //
    //   FORM MAP (bars)           chords                                                                 what enters / leaves
    //   M   dream      8          Dm9 Dm9 Bbmaj7 Bbmaj7 Fmaj7 Fmaj7 Gm9 A7sus                              pad, choir, twang tune in half speed (A4 F5 | E5 D5 ...), snaps from bar 5
    //   M2  memory     8          Dm9 Bbmaj7 Fmaj7 Gm9 | Dm9 Bbmaj7 Gm9 A7                                  machine kick + gated snare, chorus bass, cold arp, the tune at original speed, bell
    //   BU  build      8          Bb Bb F F Gm Gm A7sus A7sus                                               riser, snare roll, hp-sweep, supersaw rises, chords brighten toward the dominant
    //   FI  finale    12          D A Bm G | D A G A | Bm G A A                                            D MAJOR: supersaw wall + 808 sub + EDM kick + clap, LEAD theme (F#), choir, twang an octave down
    //   OU  outro      4          D Dmaj9 D6 D                                                              everything dissolves into pad + choir + bell sparkles; the D major rings into the Dm9 of the next pass
    //
    //   THEME in the finale (lead, over D | A | Bm | G):  A4 F#5. E5 D5 | E5 C#6. B5 A5 | D5 B5. A5 F#5 | G5 E5 D5---     (title: A4 F5 E5 D5 -- one note raised)
    //   Mix intent (section loudness): M -25, M2 -21, BU -19, FI -14.5, OU -25 LUFS  (the biggest dynamic arc of the soundtrack, spread >= 8 dB).
    // ============================================================================================================================================
    D.ending = {
      bpm: 100, swing: 0.5, echo: 3, fb: 0.4, key: 2, mode: MINOR, gain: 1.548, duckRel: 0.55,
      lanes: {
        pad: { inst: 'pad', vol: 0.6, hall: 0.4, duck: 0.4 },
        choir: { inst: 'choir', vol: 0.6, hall: 0.55, vib: [5, 14], duck: 0.3 },
        super: { inst: 'super', vol: 1.0, hall: 0.3, duck: 0.75, n: 7, spread: 20, lpf: 8500 },
        twang: { inst: 'twang', vol: 0.9, trem: { rate: 4.4, depth: 0.5 }, spr: 0.4, hall: 0.35, dly: 0.3, hpf: 140 },
        lead: { inst: 'lead', vol: 1.2, hall: 0.35, dly: 0.3, hpf: 200 },
        bass: { inst: 'pick', vol: 0.78, chorus: PICK_CHORUS, duck: 0.4 },
        sub: { inst: 'sub', vol: 0.55, drive: 2.5, duck: 0.92, lpf: 700 },
        arp: { inst: 'arp', vol: 0.3, dly: 0.4, hall: 0.2, pan: -0.2, hpf: 250, duck: 0.4 },
        bell: { inst: 'bell', vol: 0.55, hall: 0.55, dly: 0.25 },
        fx: { inst: 'fx', vol: 0.45, hall: 0.35 },
        kick: { vol: 1.2, drive: 1.5 }, snare: { vol: 0.45, hall: 0.12 }, hats: { vol: 0.4 }, perc: { vol: 0.35 },
      },
      pats: {
        sn: '....f.......f...', vg: 'k...s...k.k.s...', vgf: 'k...s...k.k.s.nn', vgo: 'k...s...k.k.....',
        hh8: "h,.h'.h,.h'.h,.h'.h,.h'.", pf: '..........t.u.v.',
        f4: 'K...K...K...K...', bk: 'K...s...K...s...', bkf: 'K...s...K...s.ss', cl: '....p.......p...', oh: '..o...o...o...o.', ohk: '..o.K.o...o.K.o.', ck: 'c...K.......K...',   // ohk / ck: A7, the beat-2 / beat-4 kick of the finale
        m16: "h,h,h,h,h,h,h,h,h,h,h,h,h,h,h,h,",
        b8: '1-1-1-1-1-1-1-1-', b8o: '1-1-1-1-1-1-8-1-', pump: '1-1-8-1-1-1-8-1-', off808: '..1-..1-..1-..1-',
        // melodic chorus-bass lines (80s dark wave: the bass sings): 1 root, 3 / 5 / 7 chord tones, 8 octave
        m1: '1-1-1-8-7-5-3-5-', m2: '1-1-5-1-3-5-7-5-', m3: '1-1-8-1-5-1-3-5-', m4: '1-1-1-1-3-5-7-8-',

        arp1: '1.3.5.8.a.8.5.3.',
      },
      sections: {
        // ------------------------------------------------------------------------------------------------ M: dream (8 bars)
        M: {
          chords: '| Dm9 | Dm9 | Bbmaj7 | Bbmaj7 | Fmaj7 | Fmaj7 | Gm9 | A7sus |',
          p: {
            pad: hold(8),
            choir: rest(2) + hold(6),
            twang: `| a4/6 f5/10 | e5/6 d5/10 | bb4/6 g5/10 | f5/6 d5/10 | c5/6 a5/10 | g5/6 f5/10 | d5/6 bb5/10 | a5/8 g5/4 e5/4 |`,
            bell: `| r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | r/12 e6/4 |`,
            drums: cells(rest(4), 'sn*4'),
            fx: 'swell@6b/2b',
          },
          mix: { choir: 0.8, pad: 1.3, all: 0.75 },
        },
        // ------------------------------------------------------------------------------------------------ M2: memory (8 bars)
        M2: {
          chords: '| Dm9 | Bbmaj7 | Fmaj7 | Gm9 | Dm9 | Bbmaj7 | Gm9 | A7 |',
          p: {
            pad: hold(8),
            choir: hold(8),
            bass: cells('m1 m2 m1 m4', 'm1 m2 m3 pump'),
            arp: 'arp1*8',
            twang: `| a4/4 f5/6 e5/2 d5/4 | bb4/4 g5/6 f5/2 d5/4 | c5/4 a5/6 g5/2 f5/4 | d5/4 bb5/6 a5/2 g5/4 | a4/4 f5/6 e5/2 f5/4 | bb4/4 g5/6 f5/2 a5/4 | bb5/4 a5/6 g5/2 d5/4 | e5/4 c#5/4 a4/8 |`,
            bell: `| r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | r/12 a6/4 |`,
            drums: 'vg*3 vgf vg*3 vgo',
            drums2: 'hh8*8',
            drums3: cells('sn*3', 'pf', 'sn*3', '..........t.u.vv'),
            fx: 'swell@7b/1b',
          },
          mix: { arp: 0.8, choir: 0.8, all: 0.72 },
          auto: { 'arp.vol': [0.15, 0.3, 'lin', 0, 8] },
        },
        // ------------------------------------------------------------------------------------------------ BU: build (8 bars)
        BU: {
          chords: '| Bb | Bb | F | F | Gm | Gm | A7sus | A7sus |',
          p: {
            pad: hold(8),
            super: 'stab*7 ..x...x...x.....',
            bass: cells('b8o*4', 'oct8*3', '1-1-1-1-........'),
            arp: cells('arp1*4', 'arp16*3', '1358a853........'),
            drums: cells('f4*6', 'K.K.K.K.K.K.K.K.', rest(1)),
            drums2: cells('..h...h...h...h.*2', 'hh8*2', "S,...S,...S...S...", "S.S.S.S.S'.S'.S'.S'.", 'RRRRRRRRRRRRRRRR', 'RRRRRRRRRRRR....'),
            fx: 'riser@0/124 swell@4b/3b',
          },
          mix: { super: 0.85, snare: 0.6 },
          auto: { 'super.lpf': [500, 9000, 'exp'], 'master.hpf': [[0, 20], [2, 20], [7.75, 600], [7.8125, 10]], 'arp.vol': [0.08, 0.18], 'master.vol': [0.72, 1.0, 'in'] },
        },
        // ------------------------------------------------------------------------------------------------ FI: finale (12 bars, D major)
        FI: {
          chords: '| D | A | Bm | G | D | A | G | A | Bm | G | A | A |',
          p: {
            super: hold(12),
            pad: hold(12),
            choir: hold(12),
            bass: cells('pump*3 b8o', 'pump*3 b8o', 'pump*3 1-1-1-1-1-1-8-1-'),
            sub: cells('root*4', 'off808*8'),
            arp: cells('arp1*8', 'arp16*4'),
            lead: `| a4/4 f#5/6 e5/2 d5/4 | e5/4 c#6/6 b5/2 a5/4 | d5/4 b5/6 a5/2 f#5/4 | g5/4 e5/4 d5/8 |
                    | a4/4 f#5/6 e5/2 f#5/4 | e5/4 c#6/6 b5/2 e6/4 | d6/4 b5/6 a5/2 g5/4 | e5/6 f#5/2 e5/4 c#5/4 |
                    | d6/4 f#6/4 b6/8 | b5/4 d6/4 g6/8 | a5/4 c#6/4 e6/8 | e6/6 c#6/2 a5/8 |`,
            twang: `| a3/4 f#4/6 e4/2 d4/4 | e4/4 c#5/6 b4/2 a4/4 | d4/4 b4/6 a4/2 f#4/4 | g4/4 e4/4 d4/8 |
                    | a3/4 f#4/6 e4/2 f#4/4 | e4/4 c#5/6 b4/2 e5/4 | d5/4 b4/6 a4/2 g4/4 | e4/6 f#4/2 e4/4 c#4/4 |
                    | r/16 | r/16 | r/16 | r/16 |`,
            bell: `| r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | a6/2 e6/2 c#6/2 a5/2 r/8 |`,
            drums: cells('bk*3 bkf', 'bk*3 bkf', 'bk*3 K...s...RRRRRRRR'),
            drums2: cells('cl*11', '................'),
            drums3: cells('ck', 'ohk*7', 'ck', 'ohk*2', 'oh'),
            fx: 'impact@0 impact@8b:0.7 swell@11b/1b',
          },
        },
        // ------------------------------------------------------------------------------------------------ OU: outro (4 bars)
        OU: {
          chords: '| D | Dmaj9 | D6 | D |',
          p: {
            pad: hold(4),
            choir: hold(4),
            lead: `| a5/8 f#5/8 | e5/8 d5/8 | a5/8 f#5/8 | d5/12 r/4 |`,
            bell: `| r/16 | d6/2 f#6/2 a6/2 f#6/2 r/8 | r/16 | a6/2 e6/2 c#6/2 a5/2 r/8 |`,
            fx: 'down@0/1b',
          },
          mix: { choir: 0.9, lead: 0.7, all: 0.62 },
        },
      },
      order: ['M', 'M2', 'BU', 'FI', 'OU'],
    };

    // ============================================================================================================================================
    // JINGLES (one-shots; Grids in a jingle are written in 16-char cells, a 30-step jingle = 2 cells, the second one is cut)
    //
    //   start      120 bpm, 18 steps = 2.25 s (FIXPLAN2 K7: over before the 2.5 s round-1 intro; MUST stay <= 2.4 s).  E minor (stage 1 follows on its downbeat).
    //              riser + reverse swell (steps 0-8), IMPACT + boom + supersaw stab at step 8, then the 3-note motif E5 G5 B5 (the first notes of the stage-1 hook's
    //              long tail) on lead + bell.
    //   extend     150 bpm, 30 steps = 3.0 s.  E MAJOR (parallel major of stage 1, relative major of stage 2 -> fits both loops it interrupts).  A bright rising
    //              spiral of arpeggios (bell + cold arp) landing on a huge supersaw Eadd9 with a bell chord on top.
    //   gameover    90 bpm, 24 steps = 4.0 s.  A minor.  reverse swell, a low boom, a dark pad that slides down (Am9 -> Fmaj7), a lonely bell lament E5 C5 A4.
    //   clear_boss 140 bpm, 28 steps = 3.0 s.  F MAJOR = the Picardy of the boss's F minor and the relative major of the ending's D minor.  Rising IV - V - I
    //              (Bb - C - F) lift: riser under the line, supersaw on every chord, the crown fanfare (C5 F5 A5 C6: the boss hook with the third raised), big hall.
    // ============================================================================================================================================
    D.start = {
      kind: 'jingle', bpm: 120, swing: 0.5, echo: 3, fb: 0.3, key: 4, mode: MINOR, gain: 1.225,
      lanes: {
        fx: { inst: 'fx', vol: 0.8, hall: 0.35 },
        super: { inst: 'super', vol: 0.8, hall: 0.35, n: 7, spread: 22, a: 0.02, r: 0.7 },
        stab: { inst: 'stab', vol: 0.6, hall: 0.3, spread: 24, cut: 3800 },
        bell: { inst: 'bell', vol: 0.8, hall: 0.4 },
        lead: { inst: 'lead', vol: 1.1, hall: 0.3, dly: 0.2, hpf: 200 },
        kick: { vol: 1.0, drive: 1.5 },
      },
      sections: {
        J: {
          chords: '| Em/18 |',
          p: {
            fx: 'swell@0/8 riser@2/6 impact@8',
            super: '........x------- --..............',
            stab: '........x....... ................',
            bell: 'r/8 e5/3 g5/3 b5/4',
            lead: 'r/8 e5/3 g5/3 b5/4',
            drums: 'RRRRRRRRb.......',
          },
        },
      },
      order: ['J'],
    };

    D.extend = {
      kind: 'jingle', bpm: 150, swing: 0.5, echo: 3, fb: 0.3, key: 4, mode: MAJOR, gain: 1.914,
      lanes: {
        bell: { inst: 'bell', vol: 0.9, hall: 0.4, dly: 0.2 },
        arp: { inst: 'arp', vol: 0.045, dly: 0.3, hall: 0.2, hpf: 250 },       // vol x0.09 = the arp make-up of INST.arp (lv 0.17 -> 1.9): the jingle keeps its level
        super: { inst: 'super', vol: 0.9, hall: 0.4, n: 7, spread: 20, a: 0.02, r: 0.6 },
        fx: { inst: 'fx', vol: 0.7, hall: 0.35 },
        kick: { vol: 0.9 },
      },
      sections: {
        J: {
          chords: '| Eadd9/30 |',
          p: {
            bell: 'n: e5/1 g#5/1 b5/1 e6/1 g#5/1 b5/1 e6/1 g#6/1 b5/1 e6/1 g#6/1 b6/1 r/2 [e6,g#6,b6]/16',
            arp: 'n: e4/1 g#4/1 b4/1 e5/1 g#4/1 b4/1 e5/1 g#5/1 b4/1 e5/1 g#5/1 b5/1 r/18',
            super: '..............x- ----------------',
            fx: 'riser@0/12 impact@14:0.6',
            drums: '..............b.',
          },
        },
      },
      order: ['J'],
    };

    D.gameover = {
      kind: 'jingle', bpm: 90, swing: 0.5, echo: 3, fb: 0.3, key: 9, mode: MINOR, gain: 2.136,
      lanes: {
        fx: { inst: 'fx', vol: 0.9, hall: 0.5 },
        pad: { inst: 'pad', vol: 0.8, hall: 0.5, a: 0.3, r: 1.6, cut: 900 },
        sub: { inst: 'sub', vol: 0.6, drive: 2.5, lpf: 700 },
        bell: { inst: 'bell', vol: 0.6, hall: 0.55 },
      },
      sections: {
        J: {
          chords: '| Am9/14.Fmaj7/10 |',
          p: {
            fx: 'swell@0/6 impact@6',
            pad: '......x.......x- ----------------',
            sub: 'r:......1-------1- ----------------',
            bell: 'r/6 e5/4 c5/4 a4/10',
          },
        },
      },
      order: ['J'],
    };

    D.clear_boss = {
      kind: 'jingle', bpm: 140, swing: 0.5, echo: 3, fb: 0.3, key: 5, mode: MAJOR, gain: 2.002,
      lanes: {
        super: { inst: 'super', vol: 0.9, hall: 0.5, n: 7, spread: 20, a: 0.02, r: 0.9 },
        bell: { inst: 'bell', vol: 0.9, hall: 0.5 },
        lead: { inst: 'lead', vol: 1.0, hall: 0.45, dly: 0.2, hpf: 200 },
        fx: { inst: 'fx', vol: 0.8, hall: 0.4 },
        kick: { vol: 0.9 },
      },
      sections: {
        J: {
          chords: '| Bb/8.C/8.F/12 |',
          p: {
            super: 'x-------x------- x-----------....',
            lead: 'n: bb4/2 d5/2 f5/2 bb5/2 c5/2 e5/2 g5/2 c6/2 f5/2 a5/2 c6/2 f6/6',
            bell: 'n: bb5/2 d6/2 f6/2 bb6/2 c6/2 e6/2 g6/2 c7/2 [f5,a5,c6,f6]/12',
            fx: 'riser@0/16 impact@16',
            drums: 'b.......b....... b...............',
          },
        },
      },
      order: ['J'],
    };
    // <<COMPOSER:END>>

    Object.assign(D, demoDefs());
    defsCache = D;
    return D;
  }

  // ================================================================================================
  // INSTRUMENT DEMOS (test/audio_v2_board.html, test/audio_analyze.mjs): one short 'demo_*' one-shot per instrument / sound family
  // ================================================================================================
  let demoCache = null;
  function demoDefs() {
    if (demoCache) return demoCache;
    const out = {};
    const ch4 = '| Em | C | G | D |', ch8 = '| Em | C | G | D | Em | C | Am | B7 |';
    const mk = (lanes, p, o) => {
      o = o || {};
      return Object.assign({
        kind: 'jingle', bpm: o.bpm || 120, swing: 0.5, echo: 3, fb: 0.38, key: 4, mode: MINOR, gain: 1,
        lanes, sections: { D: Object.assign({ chords: o.chords || ch4, p }, o.sec) }, order: ['D'],
      }, o.song);
    };
    const KICK = { kick: { vol: 0.9, drive: 1.5 } };
    out.demo_super = mk({ super: { inst: 'super', hall: 0.3 } }, { super: 'hold' });
    out.demo_super7 = mk({ super: { inst: 'super', n: 7, spread: 22, hall: 0.3 } }, { super: 'hold' });
    out.demo_stab = mk(Object.assign({ stab: { inst: 'stab', hall: 0.2, duck: 0.8 } }, KICK), { stab: 'sync', drums: 'four' });
    out.demo_pad = mk({ pad: { inst: 'pad', hall: 0.4 } }, { pad: 'hold' });
    out.demo_choir = mk({ choir: { inst: 'choir', hall: 0.5, vib: [5.2, 14] } }, { choir: 'hold' });
    out.demo_pick = mk({ pick: { inst: 'pick', chorus: PICK_CHORUS } }, { pick: 'root8 root8 root8 oct8' });
    out.demo_wood = mk({ wood: { inst: 'wood', drive: 1.8, dgain: 0.2 } }, { wood: '1---3---5---6---' }, { bpm: 90 });
    out.demo_sub = mk(Object.assign({ sub: { inst: 'sub', drive: 2.5, lpf: 700, duck: 0.9 } }, KICK), { sub: 'root2', drums: 'four' });
    out.demo_riff = mk({ riff: { inst: 'riff', drive: 8, lpf: 3600 } }, { riff: 'gal' }, { bpm: 130 });
    out.demo_arp = mk({ arp: { inst: 'arp', dly: 0.4, hall: 0.2 } }, { arp: 'arp16' });
    out.demo_lead = mk({ lead: { inst: 'lead', hall: 0.3, dly: 0.3 } }, { lead: `| e5/4 g5/4 b5/4 e6/4 | e6/8 c6/4 g5/4 | d5/4 g5/4 b5/4 d6/4 | f#6/6 d6/2 a5/8 |` });
    out.demo_alarm = mk({ alarm: { inst: 'alarm', drive: 2, lpf: 6000, dly: 0.2 } }, { alarm: `| e5/2 b5/2 e5/2 b5/2 e5/2 b5/2 e5/2 b5/2 | c5/2 g5/2 c5/2 g5/2 c5/2 g5/2 c5/2 g5/2 | g5/2 d6/2 g5/2 d6/2 g5/2 d6/2 g5/2 d6/2 | f#5/2 c6/2 f#5/2 c6/2 f#5/2 c6/2 f#5/2 c6/2 |` });
    out.demo_twang = mk({ twang: { inst: 'twang', trem: { rate: 4.4, depth: 0.55 }, spr: 0.5, hall: 0.3, dly: 0.28, hpf: 140 } }, { twang: `| e4/6 g4/2 b4/4 a4/4 | g4/8 e4/4 c5/4 | b4/6 d5/2 g5/4 f#5/4 | a4/8 f#4/4 d5/4 |` }, { bpm: 88 });
    out.demo_bell = mk({ bell: { inst: 'bell', hall: 0.4 } }, { bell: `| e5/4 g5/4 b5/4 e6/4 | c6/4 g5/4 e5/4 c5/4 | g5/4 b5/4 d6/4 g6/4 | f#6/8 d6/8 |` });
    out.demo_vibes = mk({ vibes: { inst: 'vibes', trem: { rate: 5.2, depth: 0.35 }, hall: 0.35 } }, { vibes: `| e5/6 b4/2 g4/4 b4/4 | e5/6 c5/2 g4/8 | d5/6 b4/2 g4/4 b4/4 | f#5/8 a5/4 d6/4 |` }, { bpm: 84 });
    out.demo_kit = mk({ kick: {}, snare: {}, hats: {}, perc: {} },
      { drums: 'k...K...b...s... S...y...n...p... f...r...t.u.v... h.o.m.M.d...c...' }, { bpm: 100, chords: '| Em | Em | Em | Em |' });
    out.demo_industrial = mk({ perc: { hall: 0.2 }, kick: { drive: 2 }, snare: {} },
      { drums: 'K...x...K...X... K...z...K...w... S.y.S.y.RRRRRRRR' }, { bpm: 110, chords: '| Em | Em | Em |' });
    out.demo_fx = mk({ fx: { inst: 'fx', hall: 0.35 } }, { fx: 'riser@0/2b impact@2b down@2b/1b swell@3b/1b zap@4b impact@5b' }, { bpm: 120, chords: '| Em | Em | Em | Em | Em | Em | Em | Em |' });
    out.demo_build = Object.assign(mk({
      pad: { inst: 'pad', vol: 0.55, hall: 0.3, duck: 0.5 }, super: { inst: 'super', n: 7, vol: 0.7, hall: 0.2, duck: 0.75, lpf: 9000 },
      arp: { inst: 'arp', vol: 0.35, dly: 0.4, hall: 0.15, hpf: 300, duck: 0.5 }, bass: { inst: 'pick', vol: 0.8, chorus: PICK_CHORUS, duck: 0.4 },
      sub: { inst: 'sub', vol: 0.85, drive: 2.5, duck: 0.9, lpf: 700 }, fx: { inst: 'fx', vol: 0.7, hall: 0.3 }, kick: { vol: 0.95, drive: 1.6 }, snare: { vol: 0.8 }, hats: { vol: 0.55 },
    }, {}, { bpm: 124 }), {
      sections: {
        B: { chords: '| Em | C | G | D |', p: { super: 'stab', pad: 'hold', arp: 'arp16', fx: 'riser@0/4b', drums: 'K...h.h.K...h.h. K...h.h.K...h.h. K...h.hhK...h.hh RRRRRRRRRRRRRRRR' },
          auto: { 'super.lpf': [400, 9000, 'exp'], 'master.hpf': [20, 800, 'exp'] } },
        D: { chords: '| Em | C | G | D |', p: { super: 'stab', pad: 'hold', arp: 'arp16', bass: 'root8', sub: 'root2', fx: 'impact@0', drums: 'K...h.h.K...h.h.' } },
      },
      order: ['B', 'D'],
    });
    // CPU: demo_dense = the densest realistic drop (what the composer may build at most); demo_stress = every voice family at once (informational)
    out.demo_dense = mk({
      super: { inst: 'super', n: 5, spread: 20, vol: 0.7, hall: 0.3, duck: 0.7 }, bass: { inst: 'pick', vol: 0.7, chorus: PICK_CHORUS, duck: 0.4 },
      sub: { inst: 'sub', vol: 0.8, drive: 2.5, lpf: 700, duck: 0.9 }, arp: { inst: 'arp', vol: 0.4, dly: 0.45, hall: 0.2, duck: 0.5 },
      twang: { inst: 'twang', vol: 0.8, trem: { rate: 4.4, depth: 0.5 }, hall: 0.3, dly: 0.3 },
      kick: { vol: 0.9, drive: 1.5 }, snare: { vol: 0.8 }, hats: { vol: 0.5 },
    }, {
      super: 'sync', bass: 'oct8', sub: 'root2', arp: 'arp16',
      twang: `| e4/2 g4/2 b4/2 e5/2 e4/2 g4/2 b4/2 e5/2 | c4/2 e4/2 g4/2 c5/2 c4/2 e4/2 g4/2 c5/2 | g4/2 b4/2 d5/2 g5/2 g4/2 b4/2 d5/2 g5/2 | d4/2 f#4/2 a4/2 d5/2 d4/2 f#4/2 a4/2 d5/2 |`,
      drums: 'KhhhShhhKhhoShhh KhhhShhhKhhoShhh KmhhSmhhKhhoSmhh KhhhShhhKhhhShSS',
    }, { bpm: 124 });
    out.demo_stress = mk({
      super: { inst: 'super', n: 7, spread: 22, vol: 0.6, hall: 0.3, duck: 0.7 }, pad: { inst: 'pad', n: 3, vol: 0.4, hall: 0.3, duck: 0.4 },
      choir: { inst: 'choir', vol: 0.4, hall: 0.4, vib: [5.2, 14] }, bass: { inst: 'pick', vol: 0.7, chorus: PICK_CHORUS },
      riff: { inst: 'riff', vol: 0.5, drive: 7, lpf: 3600 }, sub: { inst: 'sub', vol: 0.7, drive: 2.5, lpf: 700 },
      arp: { inst: 'arp', n: 3, vol: 0.4, dly: 0.45, hall: 0.2 }, lead: { inst: 'lead', vol: 0.4, hall: 0.3, dly: 0.3 },
      twang: { inst: 'twang', vol: 0.8, trem: { rate: 4.4, depth: 0.5 }, spr: 0.4, hall: 0.3, dly: 0.3 }, bell: { inst: 'bell', vol: 0.5, hall: 0.4 },
      fx: { inst: 'fx', vol: 0.6, hall: 0.3 }, kick: { vol: 0.9, drive: 1.5 }, snare: { vol: 0.8 }, hats: { vol: 0.5 }, perc: { vol: 0.7 },
    }, {
      super: 'sync', pad: 'hold', choir: 'hold', bass: 'oct8', riff: 'gal', sub: 'root2', arp: 'arp16',
      lead: `| e5/1 g5/1 b5/1 e6/1 e5/1 g5/1 b5/1 e6/1 e5/1 g5/1 b5/1 e6/1 e5/1 g5/1 b5/1 e6/1 | e5/1 g5/1 b5/1 e6/1 e5/1 g5/1 b5/1 e6/1 e5/1 g5/1 b5/1 e6/1 e5/1 g5/1 b5/1 e6/1 | e5/1 g5/1 b5/1 e6/1 e5/1 g5/1 b5/1 e6/1 e5/1 g5/1 b5/1 e6/1 e5/1 g5/1 b5/1 e6/1 | e5/1 g5/1 b5/1 e6/1 e5/1 g5/1 b5/1 e6/1 e5/1 g5/1 b5/1 e6/1 e5/1 g5/1 b5/1 e6/1 |`,
      twang: `| e4/2 g4/2 b4/2 e5/2 e4/2 g4/2 b4/2 e5/2 | c4/2 e4/2 g4/2 c5/2 c4/2 e4/2 g4/2 c5/2 | g4/2 b4/2 d5/2 g5/2 g4/2 b4/2 d5/2 g5/2 | d4/2 f#4/2 a4/2 d5/2 d4/2 f#4/2 a4/2 d5/2 |`,
      bell: `| e6/2 g6/2 b6/2 e6/2 e6/2 g6/2 b6/2 e6/2 | c6/2 e6/2 g6/2 c6/2 c6/2 e6/2 g6/2 c6/2 | g6/2 b6/2 d7/2 g6/2 g6/2 b6/2 d7/2 g6/2 | d6/2 f#6/2 a6/2 d6/2 d6/2 f#6/2 a6/2 d6/2 |`,
      fx: 'riser@0/4b', drums: 'KhhhShhhKhhoShhh KhhhShhhKhhoShxh KmhhSmhhKhhoSmhz KhhhShhhKhhhSXXX',
    }, { bpm: 124 });
    demoCache = out;
    return out;
  }
  const isDemo = (n) => typeof n === 'string' && /^demo_/.test(n) && Object.prototype.hasOwnProperty.call(demoDefs(), n);
  const demoNames = () => Object.keys(demoDefs());

  // ================================================================================================
  // compiled programs
  // ================================================================================================
  const progs = {};
  function getProg(name) { return progs[name] || (progs[name] = compileSong(name)); }

  // ================================================================================================
  // audio chain (shared by live + offline contexts)
  //   lane buses ─> track out ─┬─> musicIn ─> glue compressor ─> music gain ─┐
  //   reverb / delay returns ──┘                                             ├─> master ─> limiter ─> soft ceiling ─> mute ─> destination
  //   sfx groups ─> sfx gain ─────────────────────────────────────────────────┘ (SFX send into the short `room` reverb, so they share it with the music)
  // Reverbs: ConvolverNodes with generated MONO impulse responses fed by a mono down-mix (one convolution per bus: a stereo IR would double
  // the live CPU cost); the width is made after the convolver with a delayed, panned copy.  Spring = allpass-dispersion feedback loop.
  // ================================================================================================
  function monoIn(ctx) { const g = ctx.createGain(); g.channelCount = 1; g.channelCountMode = 'explicit'; return g; }
  /** mono signal -> stereo: the direct copy on the left channel + a delayed copy on the right (Haas widening); a ChannelMerger is far cheaper than two panners */
  function widen(ctx, src, ret, dest, delay) {
    const g = gn(ctx, ret), d = ctx.createDelay(0.05), m = ctx.createChannelMerger(2);
    d.delayTime.value = delay;
    src.connect(g); g.connect(m, 0, 0);
    g.connect(d); d.connect(m, 0, 1);
    m.connect(dest);
  }
  function mkVerb(ctx, kind, ret, dest, hpf, wid) {
    const inp = monoIn(ctx), conv = ctx.createConvolver(), hp = bq(ctx, 'highpass', hpf, 0.7);
    conv.buffer = irFor(ctx, kind);
    inp.connect(hp); hp.connect(conv);
    widen(ctx, conv, ret, dest, wid);
    return { in: inp, conv };
  }
  function mkSpring(ctx, ret, dest) {
    const inp = monoIn(ctx), sum = ctx.createGain(), d = ctx.createDelay(0.2), lp = bq(ctx, 'lowpass', 3600, 0.7), fb = gn(ctx, 0.74), out = gn(ctx, ret);
    d.delayTime.value = 0.034;
    inp.connect(sum);
    let node = sum;
    for (const f of [2300, 1500, 950]) { const ap = bq(ctx, 'allpass', f, 0.55); node.connect(ap); node = ap; }   // dispersion: the "boing"
    node.connect(d); d.connect(lp); lp.connect(fb); fb.connect(sum);
    d.connect(out); out.connect(dest);
    return { in: inp };
  }

  function buildChain(ctx, startMuted) {
    const musicIn = gn(ctx, 1);
    const glue = ctx.createDynamicsCompressor();
    // gentle glue: high threshold + low ratio so section dynamics survive; the limiter / ceiling after it are the actual guard
    glue.threshold.value = -19; glue.knee.value = 14; glue.ratio.value = 2.2; glue.attack.value = 0.012; glue.release.value = 0.2;
    const music = gn(ctx, MUSIC_LEVEL), duck = gn(ctx, 1), sfx = gn(ctx, SFX_LEVEL), master = gn(ctx, MASTER_LEVEL);
    const limiter = ctx.createDynamicsCompressor();
    // FIXPLAN_V3 A3: a SOFT, slow master limiter (the old -3 dB / 20:1 / 2 ms / 80 ms brick pushed the music down 4-6 dB under every pop).  The SFX trims keep the SFX peaks
    // below it, so it only catches coincident peaks; the one deliberate music duck is the per-cue duck on the `duck` gain (SFX_DUCK, A4).
    limiter.threshold.value = -1; limiter.knee.value = 6; limiter.ratio.value = 10; limiter.attack.value = 0.003; limiter.release.value = 0.16;
    const shaper = ctx.createWaveShaper();
    shaper.curve = softClipCurve(); shaper.oversample = '2x';       // 2x oversampled: a flat-topped, aliased ceiling would overshoot the 4x true peak by 2 dB
    const mute = gn(ctx, startMuted ? 0 : 1);
    musicIn.connect(glue); glue.connect(music); music.connect(duck); duck.connect(master); sfx.connect(master);
    master.connect(limiter); limiter.connect(shaper); shaper.connect(mute); mute.connect(ctx.destination);

    // effect buses are created on first use (every silent node costs CPU): `room` (SFX use it from the first sound on), `hall`, `spring`, ping-pong `echo`
    const parts = {}, st = { echoTime: 0.3, echoFb: DELAY_SEND_FB };
    const make = {
      room: () => mkVerb(ctx, 'room', 0.5, musicIn, 160, 0.011),
      hall: () => mkVerb(ctx, 'hall', 0.5, musicIn, 200, 0.019),
      spring: () => mkSpring(ctx, 0.5, musicIn),
      echo: () => {                                          // tempo-synced ping-pong delay, returns into the music bus
        const inp = gn(ctx, 1), dL = ctx.createDelay(1.5), dR = ctx.createDelay(1.5);
        dL.delayTime.value = st.echoTime; dR.delayTime.value = st.echoTime;
        const fb1 = gn(ctx, st.echoFb), fb2 = gn(ctx, st.echoFb), lp = bq(ctx, 'lowpass', 3400, 0.7), hp = bq(ctx, 'highpass', 220, 0.7);
        const m = ctx.createChannelMerger(2), out = gn(ctx, 0.85);
        inp.connect(hp); hp.connect(dL); dL.connect(m, 0, 0);
        dL.connect(fb1); fb1.connect(dR); dR.connect(m, 0, 1);
        dR.connect(fb2); fb2.connect(lp); lp.connect(dL);
        m.connect(out); out.connect(musicIn);
        return { in: inp, dL, dR, fb1, fb2 };
      },
    };
    return {
      musicIn, music, duck, sfx, master, glue, limiter, shaper, mute, ctx, parts,
      /** input node of an effect bus (created on first use) */
      send(kind) { return (parts[kind] || (parts[kind] = make[kind]())).in; },
      setEchoTime(sec) {
        st.echoTime = sec;
        const e = parts.echo;
        if (e) { const t = ctx.currentTime; e.dL.delayTime.setTargetAtTime(sec, t, 0.08); e.dR.delayTime.setTargetAtTime(sec, t, 0.08); }
      },
      setEchoFb(v) {
        st.echoFb = v;
        const e = parts.echo;
        if (e) { e.fb1.gain.setTargetAtTime(v, ctx.currentTime, 0.05); e.fb2.gain.setTargetAtTime(v, ctx.currentTime, 0.05); }
      },
    };
  }

  // ================================================================================================
  // lane buses + tracks (sequencer instances)
  // ================================================================================================
  let trackSeq = 0;

  /** persistent sine LFO of a lane bus (never throws: a lane without its modulation is better than a failed track) */
  function lfoOsc(ctx, hz, lockSec) {
    const o = ctx.createOscillator();
    if (lockSec > 0.5) hz = Math.max(1, Math.round(hz * lockSec)) / lockSec;          // a whole number of LFO cycles per loop: the loop is exactly periodic
    try { o.type = 'sine'; o.frequency.value = hz; o.start(); reg(o, true); } catch (e) { warnFault('lfo', 'lane LFO failed (' + (e && e.message ? e.message : e) + ')'); noteFault(e); return { connect() {}, disconnect() {} }; }
    return o;
  }

  /** one mixer strip: in -> [drive] -> [crush] -> [lpf] -> [hpf] -> [chorus] -> [tremolo] -> vol -> sends -> [duck] -> [pan] -> dest */
  function buildLane(ctx, chain, L, dest, lockSec) {
    const c = L.cfg, nodes = [], lane = { name: L.name, inst: L.inst, p: {}, vib: null, duck: null, nodes };
    const add = (n) => { nodes.push(n); return n; };
    const pre = !!(c.drive || c.crush || L.needs.lpf || c.lpf || L.needs.hpf || c.hpf || c.chorus || c.trem);   // is there anything between the input and the fader?
    lane.in = add(gn(ctx, pre ? 1 : (c.vol === undefined ? 1 : c.vol)));
    let node = lane.in;
    if (c.drive) {
      const sh = add(ctx.createWaveShaper()); sh.curve = driveCurve(c.drive, c.bias || 0); sh.oversample = c.os || 'none';
      const mk = add(gn(ctx, c.dgain !== undefined ? c.dgain : 0.3 / (1 + c.drive * 0.42)));
      node.connect(sh); sh.connect(mk); node = mk;
    }
    if (c.crush) { const sh = add(ctx.createWaveShaper()); sh.curve = crushCurve(c.crush); node.connect(sh); node = sh; }
    if (L.needs.lpf || c.lpf) { const f = add(bq(ctx, 'lowpass', c.lpf || 20000, c.lq || 0.707)); lane.p.lpf = f.frequency; node.connect(f); node = f; }
    if (L.needs.hpf || c.hpf) { const f = add(bq(ctx, 'highpass', c.hpf || 10, 0.707)); lane.p.hpf = f.frequency; node.connect(f); node = f; }
    if (c.chorus) {                                  // mono in -> dry + two modulated delays, one per channel (stereo ensemble)
      const ch = c.chorus, dry = add(gn(ctx, 1)), out = add(gn(ctx, 1)), lfo = lfoOsc(ctx, ch.rate || 0.5, lockSec), m = add(ctx.createChannelMerger(2));
      const hp = add(bq(ctx, 'highpass', ch.hp || 160, 0.7));          // only the part above ~160 Hz is chorused: the bass fundamental stays dry (mono-safe, phone-safe)
      node.connect(dry); dry.connect(out); m.connect(out); node.connect(hp);
      [-1, 1].forEach((sg, i) => {
        const d = add(ctx.createDelay(0.1)), dg = add(gn(ctx, sg * (ch.depth || 0.003))), wet = add(gn(ctx, ch.mix === undefined ? 0.6 : ch.mix));
        d.delayTime.value = (ch.base || 0.016) * (sg < 0 ? 1 : 1.12);
        lfo.connect(dg); dg.connect(d.delayTime); hp.connect(d); d.connect(wet); wet.connect(m, 0, i);
      });
      nodes.push(lfo); node = out;
    }
    if (c.trem) {
      const tg = add(gn(ctx, 1 - c.trem.depth / 2)), lfo = lfoOsc(ctx, c.trem.rate || 4, lockSec), dg = add(gn(ctx, c.trem.depth / 2));
      lfo.connect(dg); dg.connect(tg.gain); node.connect(tg); node = tg; nodes.push(lfo);
    }
    let vol = lane.in;
    if (pre) { vol = add(gn(ctx, c.vol === undefined ? 1 : c.vol)); node.connect(vol); }
    lane.p.vol = vol.gain;
    const send = (key, bus) => {
      const v = c[key] || 0;
      if (v > 0 || L.needs[key]) { const g = add(gn(ctx, v)); vol.connect(g); g.connect(chain.send(bus)); lane.p[key] = g.gain; }
    };
    send('rev', 'room'); send('hall', 'hall'); send('spr', 'spring'); send('dly', 'echo');
    let out = vol;
    if (L.duckAny) { const d = add(gn(ctx, 1)); out.connect(d); lane.duck = d.gain; out = d; }
    if (c.pan || L.needs.pan) { const p = add(ctx.createStereoPanner()); p.pan.value = c.pan || 0; lane.p.pan = p.pan; out.connect(p); out = p; }
    out.connect(dest);
    if (c.vib) {                                     // shared pitch-LFO (detune in cents) that pad / choir / lead voices connect to
      const lfo = lfoOsc(ctx, c.vib[0], lockSec), vg = add(gn(ctx, c.vib[1]));
      lfo.connect(vg); lane.vib = vg; nodes.push(lfo);
    }
    return lane;
  }

  function makeTrack(ctx, chain, prog, kind, realtime, tempoScale) {
    const out = gn(ctx, prog.gain);
    const tr = {
      id: ++trackSeq, ctx, chain, prog, name: prog.name, kind, out, lanes: {}, master: {}, nodes: [],
      pos: 0, count: 0, nextTime: null, done: false, endTime: 0, stopped: false, finished: false, chained: false,
      onEnd: null, resume: null, tempoFixed: null, wallDeadline: 0,
      pass: 0, passLocked: !realtime,        // loop pass counter (key lift on every second pass); offline renders stay periodic
      sw: null,                              // pending bar-aligned loop switch {name, left, make}
      startAt: 0,                            // ctx time of the first step (echo timing)
      reg: realtime ? makeRegistry() : null,
    };
    const saved = REG; REG = tr.reg;
    try {
      let dest = chain.musicIn;
      const m = prog.master;
      if (m.vol || m.hpf || m.lpf) {
        const mv = gn(ctx, 1), hp = bq(ctx, 'highpass', 10, 0.707), lp = bq(ctx, 'lowpass', 20000, 0.707);
        out.connect(hp); hp.connect(lp); lp.connect(mv); mv.connect(dest);
        tr.master = { vol: mv.gain, hpf: hp.frequency, lpf: lp.frequency };
        tr.nodes.push(hp, lp, mv);
      } else out.connect(dest);
      for (const L of prog.lanes) {
        const lane = buildLane(ctx, chain, L, out, kind === 'loop' ? (prog.steps - prog.loopStart) / 4 * 60 / (prog.bpm * (tempoScale || 1)) : 0);
        tr.lanes[L.name] = lane;
      }
    } finally { REG = saved; }
    if (realtime) live.tracks++;
    return tr;
  }

  function disposeTrack(tr) {
    if (tr.disposed) return;
    tr.disposed = true;
    if (tr.reg) { tr.reg.clear(); live.tracks--; }
    const kill = (n) => { try { n.disconnect(); } catch (e) { /* already gone */ } };
    kill(tr.out);
    for (const n of tr.nodes) kill(n);
    for (const k of Object.keys(tr.lanes)) for (const n of tr.lanes[k].nodes) kill(n);
  }

  const FR_CACHE = {};
  function stepFractions(swing) {
    const key = swing;
    return FR_CACHE[key] || (FR_CACHE[key] = [swing / 2, swing / 2, (1 - swing) / 2, (1 - swing) / 2]);
  }
  function trackTempo(tr) {
    if (tr.tempoFixed !== null) return tr.tempoFixed;
    if (tr.kind === 'jingle') return 1;
    return tr.prog.maxTempo ? Math.min(tempo, tr.prog.maxTempo) : tempo;
  }
  function beatSeconds(tr) { return 60 / (tr.prog.bpm * trackTempo(tr)); }

  // ---- fault accounting: audio must never throw into the game or freeze on a repeating exception ----
  let faults = 0, disabled = false;
  const sfxFaults = {}, faultWarned = {};
  function warnFault(key, msg) {                     // one console.warn per failure class (music, or one sfx name), never a flood
    if (faultWarned[key]) return;
    faultWarned[key] = true;
    try { console.warn('AUDIO: ' + msg); } catch (e) { /* no console */ }
  }
  function noteFault(err) {
    faults++;
    if (faults >= FAULT_LIMIT && !disabled) {
      disabled = true;
      warnFault('music', 'too many WebAudio failures (' + (err && err.message ? err.message : err) + ') -- music disabled');
      pendingLoop = null;
      try { if (timer !== null) { clearInterval(timer); timer = null; } } catch (e) { /* ignore */ }
      try { if (ctx) stopAll(0); } catch (e) { /* ignore */ }
    }
  }

  const skipHit = (tr, lane) => !!tr.skip && (tr.skip.indexOf(lane) >= 0 || (tr.skip.indexOf('drum') >= 0 && KIT_LANES.indexOf(lane) >= 0));

  /** Schedule all events of one step at time t. Step duration is added by the caller. */
  function scheduleStep(tr, step, t, beat, silent) {
    const evs = tr.prog.events[step];
    if (!evs || silent) return;
    const fr = stepFractions(tr.prog.swing);
    const ctx = tr.ctx;
    const odd = tr.pass & 1, lift = tr.prog.lift && odd ? tr.prog.lift : 0;
    const dtStep = beat * fr[step & 3];
    let failure = null;
    REG = tr.reg;
    try {
      for (const e of evs) {
        if (e.o !== undefined && e.o !== odd) continue;                // second-pass version of a section (`alt`, FIXPLAN_V3 A8): o 0 = even passes only, o 1 = odd passes only
        if (e.lane !== 'master' && skipHit(tr, e.lane)) continue;
        try {                                                 // one bad event must not take the others (or the clock) down
          const lane = tr.lanes[e.lane];
          switch (e.k) {
            case 'n': {
              let dur = 0;
              for (let k = 0; k < e.n; k++) dur += fr[(step + k) & 3];
              const ms = lift ? e.m.map((x) => x + lift) : e.m;
              e.play(ctx, lane, t, dur * beat, ms, e.vel, e.c);
              break;
            }
            case 'd': e.fn(ctx, lane, t, e.vel * KIT_LV); break;
            case 'f': {
              let dur = 0;
              for (let k = 0; k < e.n; k++) dur += fr[(step + k) & 3];
              FXV[e.name](ctx, lane, t, dur * beat, e.vel * FX_LV);
              break;
            }
            case 'u': {                                       // sidechain: duck the lane at the kick, recover exponentially
              if (!lane || !lane.duck) break;
              const g = lane.duck, rel = Math.max(0.06, e.rel * beat);
              g.setTargetAtTime(1 - e.depth, Math.max(0, t - 0.004), 0.0018);
              g.setTargetAtTime(1, t + 0.016, rel / 3);
              break;
            }
            case 'a': {                                       // automation: one linear segment per step
              const prm = e.lane === 'master' ? tr.master[e.p] : (lane && lane.p[e.p]);
              if (!prm) break;
              prm.setValueAtTime(e.v0, t);
              if (e.v1 !== e.v0) prm.linearRampToValueAtTime(e.v1, t + dtStep);
              break;
            }
            default: break;
          }
        } catch (err) { failure = err; }
      }
    } finally { REG = null; }
    if (failure) noteFault(failure);                          // one fault per failing step, however many of its events failed
  }

  /** Advance a track: schedule every step whose start time is before `until`. */
  function advanceTrack(tr, until, silent) {
    const p = tr.prog;
    const fr = stepFractions(p.swing);
    while (!tr.done && tr.nextTime < until && !(tr.sw && tr.sw.left <= 0)) {
      const step = tr.pos;
      if (step === p.loopStart && tr.kind === 'loop') nzReset();     // identical noise every cycle -> exactly periodic loop
      const beat = beatSeconds(tr);
      scheduleStep(tr, step, tr.nextTime, beat, silent);
      tr.count++;
      if (tr.sw) tr.sw.left--;
      tr.nextTime += beat * fr[step & 3];
      tr.pos++;
      if (tr.pos >= p.steps) {
        if (tr.kind === 'loop') { tr.pos = p.loopStart; if (!tr.passLocked) tr.pass++; }
        else { tr.done = true; tr.endTime = tr.nextTime; }
      }
    }
  }

  // ================================================================================================
  // runtime state
  // ================================================================================================
  let ctx = null, chain = null, timer = null;
  let paused = false, pauseKind = null, tempo = 1;       // pauseKind: 'hard' (context suspended) | 'soft' (context keeps running)
  let pausedWall = 0, pausedCtx = 0;                     // when the current pause began (wall clock / audio clock)
  let muted = !!U.store.get('muted', false);
  let pendingLoop = null;                 // loop requested before init()
  let active = [];                        // tracks currently alive (cur + finishing jingle + a loop that is fading out)
  let cur = null;                         // the track that represents "the music"
  let lastEcho = -1, lastFb = -1;
  const groups = {};                      // sfx name -> [group]
  let tapNode = null;

  const isRunning = () => !!ctx && ctx.state === 'running' && !paused;

  /** Fade a track out and release it.  `at` (ctx time, optional) delays the start of the fade (bar-aligned switch). */
  function cut(tr, fade, at) {
    if (tr.stopped) return;
    tr.stopped = true;
    tr.onEnd = null; tr.sw = null;
    const now = ctx.currentTime, t0 = at === undefined ? now : Math.max(now, at), f = Math.max(0.012, fade);
    try {
      tr.out.gain.cancelScheduledValues(now);
      tr.out.gain.setValueAtTime(tr.out.gain.value, t0);
      tr.out.gain.linearRampToValueAtTime(0, t0 + f);
    } catch (e) { /* ignore */ }
    if (tr.reg) tr.reg.stopAll(t0 + f + 0.03);
    setTimeout(() => disposeTrack(tr), (t0 - now + f + 0.12) * 1000);
  }
  function stopAll(fade) {
    const list = active; active = []; cur = null;
    for (const tr of list) cut(tr, fade);
  }
  function startLoop(name, pos, startAt, pass) {
    const tr = makeTrack(ctx, chain, getProg(name), 'loop', true, trackTempoFor(getProg(name)));
    tr.pos = pos || 0;
    tr.pass = pass | 0;
    tr.nextTime = startAt === undefined ? null : startAt;
    tr.startAt = tr.nextTime === null ? 0 : tr.nextTime;
    active.push(tr);
    cur = tr;
    return tr;
  }
  const trackTempoFor = (prog) => (prog.maxTempo ? Math.min(tempo, prog.maxTempo) : tempo);
  function barStart(tr) {
    const p = tr.prog;
    if (tr.pos < p.loopStart) return tr.pos - (tr.pos % STEPS_PER_BAR);
    return p.loopStart + Math.floor((tr.pos - p.loopStart) / STEPS_PER_BAR) * STEPS_PER_BAR;
  }

  /**
   * Steps still to be scheduled before the next bar line of `tr` -- or, when that bar line is more than `capSec` away
   * (counted from now), before the next half bar / beat line.  0 = the track is exactly on a line.
   */
  function stepsToLine(tr, capSec) {
    const fr = stepFractions(tr.prog.swing), beat = beatSeconds(tr);
    const lead = Math.max(0, tr.nextTime - ctx.currentTime);       // already-scheduled time that still has to be heard
    let best = 0;
    for (const g of [STEPS_PER_BAR, STEPS_PER_BAR / 2, STEPS_PER_BAR / 4]) {
      const n = (g - (tr.pos % g)) % g;
      let sec = lead;
      for (let k = 0; k < n; k++) sec += beat * fr[(tr.pos + k) & 3];
      best = n;
      if (sec <= capSec) break;
    }
    return best;
  }
  let lastSwitch = null;                  // debug: the most recent bar-aligned switch {from, to, pos, at, requested}
  /** Start the pending switch of `tr` now: the old loop fades out from its last scheduled step on, the new track starts there. */
  function fireSwitch(tr) {
    const sw = tr.sw;
    if (!sw) return;
    tr.sw = null;
    const at = Math.max(tr.nextTime, ctx.currentTime + 0.02);
    lastSwitch = { from: tr.name, to: sw.name, pos: tr.pos, at, requested: sw.t0, now: ctx.currentTime };
    const i = active.indexOf(tr); if (i >= 0) active.splice(i, 1);
    cut(tr, FADE_XFADE, at);
    sw.make(at);
  }
  /** Plan (or retarget) a bar-aligned switch away from the sounding loop `tr`. */
  function planSwitch(tr, name, capSec, make) {
    const left = stepsToLine(tr, capSec);
    tr.sw = { name, left, make, t0: ctx.currentTime };
    if (left <= 0) fireSwitch(tr);
  }

  let lastJingleEnd = null;               // debug: timeline end (ctx time) of the most recent jingle that ended on its own
  function finishJingle(tr) {
    if (tr.finished) return;
    tr.finished = true;
    if (tr.done) lastJingleEnd = tr.endTime;
    const cb = tr.onEnd; tr.onEnd = null;
    const i = active.indexOf(tr); if (i >= 0) active.splice(i, 1);
    // let the tail ring out (dispose as soon as its last source has ended; 6 s safety net), then free the nodes
    if (!tr.stopped) tr.stopped = true;
    if (tr.reg && tr.reg.n()) tr.reg.onIdle = () => disposeTrack(tr); else disposeTrack(tr);
    setTimeout(() => disposeTrack(tr), 6000);
    safeCall(cb);
  }

  function pump(tr, now) {
    if (tr.stopped || tr.finished) return;
    if (tr.nextTime === null) { tr.nextTime = now + START_DELAY; tr.startAt = tr.nextTime; }
    if (!tr.done && tr.nextTime < now - 0.08) { tr.nextTime = now + 0.03; live.resyncs++; }     // we were starved: resync
    advanceTrack(tr, now + HORIZON, muted);
    if (tr.sw && tr.sw.left <= 0) fireSwitch(tr);
    if (tr.kind === 'jingle' && tr.done) {
      if (!tr.chained) {
        tr.chained = true;
        if (tr.resume && cur === tr) startLoop(tr.resume.name, tr.resume.pos, tr.endTime, tr.resume.pass);
      }
      if (now >= tr.endTime - JINGLE_END_LEAD) finishJingle(tr);
    }
  }

  let okTicks = 0;
  function tick() {
    if (!ctx || disabled) return;
    const f0 = faults;
    try {
      if (ctx.state === 'running' && !paused) {
        const now = ctx.currentTime;
        for (const tr of active.slice()) pump(tr, now);
        if (cur && !cur.stopped && cur.startAt <= now + 0.05) {
          if (cur.prog.echo) {
            const sec = cur.prog.echo * beatSeconds(cur) / 4;
            if (Math.abs(sec - lastEcho) > 0.002) { lastEcho = sec; chain.setEchoTime(sec); }
          }
          if (cur.prog.fb !== lastFb) { lastFb = cur.prog.fb; chain.setEchoFb(lastFb); }
        }
      } else if (!paused) {
        // context not running (autoplay blocked / not yet resumed): never let a jingle stall the game
        const wall = performance.now();
        for (const tr of active.slice()) {
          if (tr.kind === 'jingle' && !tr.finished && wall > tr.wallDeadline) {
            if (tr.resume && cur === tr) startLoop(tr.resume.name, tr.resume.pos, null, tr.resume.pass);
            finishJingle(tr);
          }
        }
      }
    } catch (e) { noteFault(e); }
    if (faults === f0 && faults > 0 && ++okTicks >= 40) { okTicks = 0; faults--; }      // sporadic failures heal (~1 s of clean ticks each)
  }

  // ================================================================================================
  // public API
  // ================================================================================================
  /**
   * Idle-time warm-up (a few ms per slice): the impulse responses and the baked / plucked buffers of the first tracks (title, start jingle, stage1) are built
   * ahead of the first music change, so starting a track in the middle of the game does not hitch the main thread.
   */
  function warmUp() {
    const jobs = [], seen = new Set();
    const job = (key, fn) => { if (!seen.has(key)) { seen.add(key); jobs.push(fn); } };
    job('ir:room', () => irFor(ctx, 'room')); job('ir:hall', () => irFor(ctx, 'hall'));
    for (const name of ['title', 'start', 'stage1']) {
      let p = null;
      try { p = getProg(name); } catch (e) { continue; }
      p.events.forEach((list) => { if (list) for (const e of list) {
        if (e.k !== 'n') continue;
        if (e.play === chordVoice) { const N = clamp(e.c.n | 0 || 5, 1, 9); for (const m of e.m) job('s' + m + '_' + N + '_' + e.c.spread, () => sawBake(ctx, m, N, e.c.spread, false)); }
        else if (e.play === choirVoice) { for (const m of e.m) job('c' + m + '_' + e.c.spread, () => sawBake(ctx, m, 3, e.c.spread, true)); }
        else if (e.play === twangVoice) job('k' + e.m[0], () => ksBuffer(ctx, e.m[0]));
      } });
    }
    // the other tracks are compiled in idle slices too (stage 2 / boss / ending / entry / jingles; one compile per slice, 10-45 ms with the second-pass versions), so no round change compiles on the spot
    for (const name of ['stage2', 'boss', 'entry', 'ending', 'extend', 'gameover', 'clear_boss']) job('prog:' + name, () => getProg(name));
    const slice = () => {
      if (!ctx || disabled) return;
      const t0 = performance.now();
      try { while (jobs.length && performance.now() - t0 < 4) jobs.shift()(); } catch (e) { jobs.length = 0; }
      if (jobs.length) setTimeout(slice, 10);
    };
    setTimeout(slice, 400);
  }

  function init() {
    if (!ctx) {
      let AC = null;
      try { AC = window.AudioContext || window.webkitAudioContext; } catch (e) { AC = null; }
      if (!AC) return;
      try { ctx = new AC({ latencyHint: "interactive", sampleRate: ENGINE_RATE }); } catch (e) {
        try { ctx = new AC(); } catch (e2) { ctx = null; return; }
      }
      try { chain = buildChain(ctx, muted); } catch (e) { ctx = null; chain = null; return; }
      timer = setInterval(tick, TICK_MS);
      warmUp();
      if (pendingLoop) { const n = pendingLoop; pendingLoop = null; playMusic(n); }
    }
    if ((!paused || pauseKind === 'soft') && ctx.state !== 'running') {
      try { const p = ctx.resume(); if (p && p.catch) p.catch(noop); } catch (e) { /* ignore */ }
    }
  }
  const ready = () => isRunning();

  function playMusic(name, opts) { try { playMusicImpl(name, opts); } catch (e) { noteFault(e); } }
  function playMusicImpl(name, opts) {
    opts = opts || {};
    if (LOOPS.indexOf(name) < 0 && !isDemo(name)) { warnOnce('music', name); return; }
    if (disabled) return;
    if (!ctx) { pendingLoop = name; return; }
    if (cur && !cur.stopped && !opts.restart) {
      if (cur.kind === 'loop') {
        if (cur.name === name) { cur.sw = null; return; }                 // asking for the loop that is sounding cancels a pending switch
        if (cur.sw && cur.sw.name === name) return;
        if (isRunning() && cur.nextTime !== null) {
          // loop -> loop (round 16, round 30, back to the title ...): keep the old loop until the end of its bar, then switch
          planSwitch(cur, name, SWITCH_MAX_WAIT, (at) => startLoop(name, 0, at, 0));
          return;
        }
      } else {
        // A jingle is playing: don't chop it off -- the requested loop starts right after it (replacing any pending resume).
        // Once its last notes are scheduled (pump() sets `chained`, ~HORIZON before the end) cur.resume is never read again, so
        // chain the loop behind the jingle now; never earlier than a moment from now (the jingle may have ended <1 tick ago).
        if (cur.chained && cur.endTime !== undefined) { startLoop(name, 0, Math.max(cur.endTime, ctx.currentTime + 0.02), 0); return; }
        if (!cur.resume || cur.resume.name !== name) cur.resume = { name, pos: 0, pass: 0 };
        return;
      }
    }
    // A loop requested from a jingle's onEnd (or a moment after it) continues on the jingle's end line: no gap, on the downbeat.
    const line = !opts.restart && cur && cur.kind === 'jingle' && cur.finished && cur.endTime > 0 && ctx.currentTime - cur.endTime < 0.1
      ? Math.max(cur.endTime, ctx.currentTime + 0.01) : null;
    stopAll(FADE_SWITCH);
    startLoop(name, 0, line);
  }

  function softJingle(name, opts) {
    // No usable context: behave as a silent timer with the jingle's nominal length.
    const prog = getProg(name);
    const secs = prog.steps / 4 * 60 / prog.bpm;
    const keep = opts.resume ? pendingLoop : null;
    pendingLoop = null;
    setTimeout(() => {
      if (keep && pendingLoop === null) { if (ctx && !disabled) playMusic(keep); else if (!disabled) pendingLoop = keep; }
      safeCall(opts.onEnd);
    }, secs * 1000);
  }

  function jingle(name, opts) { try { jingleImpl(name, opts); } catch (e) { noteFault(e); const cb = opts && opts.onEnd; if (cb) setTimeout(() => safeCall(cb), 0); } }
  function jingleImpl(name, opts) {
    opts = opts || {};
    if (JINGLES.indexOf(name) < 0 && !isDemo(name)) { warnOnce('jingle', name); if (opts.onEnd) setTimeout(() => safeCall(opts.onEnd), 0); return; }
    if (!ctx || disabled) { softJingle(name, opts); return; }
    let rs = null;
    if (opts.resume && cur && !cur.stopped) {
      if (cur.kind === 'loop') {
        rs = cur.sw ? { name: cur.sw.name, pos: 0, pass: 0 } : { name: cur.name, pos: barStart(cur), pass: cur.pass };
      } else if (cur.resume) rs = cur.resume;             // jingle replacing a jingle inherits the pending resume
    }
    const prog = getProg(name);
    // the fanfare starts at once (it is a game event: no waiting for a bar line); a sounding loop is faded out under its attack
    stopAll(cur && !cur.stopped && cur.kind === 'loop' ? FADE_JINGLE : FADE_SWITCH);
    const tr = makeTrack(ctx, chain, prog, 'jingle', true);
    tr.onEnd = opts.onEnd || null;
    tr.resume = rs;
    tr.wallDeadline = performance.now() + (prog.steps / 4 * 60 / prog.bpm + 1.2) * 1000;
    active.push(tr);
    cur = tr;
    releaseDuck();                                          // a fanfare is the main event itself: it never plays under a cue's duck
  }

  function stopMusic(fadeSec) {
    pendingLoop = null;
    if (ctx) stopAll(Math.max(0, +fadeSec || 0));
  }

  function setTempo(scale) {
    tempo = clamp(+scale || 1, 0.5, 2);
  }

  // FIXPLAN_V3 A4: PRIORITY DUCK.  The cues the player must not miss (HURRY alarm, death, ghost, 1UP, EXTEND letter, round clear, power-up, boss kill) pull the music bed down by
  // [dB, hold s] on the `duck` gain (smooth: tau 15 ms down, tau 0.2 s back), the controlled replacement for the accidental limiter pumping.  Everyday sounds (jump, shoot, pop, kill,
  // bounce, enemy_shot, land, menus) do not duck at all; mid-priority ones stay <= 3 dB and short.
  const SFX_DUCK = { death: [4, 0.7], hurry: [4.5, 0.7], ghost: [3.5, 0.9], oneup: [4, 0.9], letter: [3.5, 0.5], clear: [4.5, 0.7], powerup: [3.8, 0.8], boss_die: [4, 1.3],
    trap: [1.5, 0.25], item_appear: [2.5, 0.25], freeze: [2.5, 0.4], bomb: [3, 0.5], thunder: [2, 0.3], food: [1, 0.2], fire: [1.5, 0.3], water: [1.5, 0.3], boss_hit: [1.5, 0.15], spawn: [1, 0.2] };
  function releaseDuck() {
    try { if (chain && chain.duck) { const g = chain.duck.gain, now = ctx.currentTime; g.cancelScheduledValues(now); g.setTargetAtTime(1, now, 0.04); } } catch (e) { /* ignore */ }
  }
  function duckMusicFor(ch, at, name) {
    const d = SFX_DUCK[name];
    if (!d || !ch.duck) return;
    try {
      const g = ch.duck.gain;
      g.cancelScheduledValues(at);
      g.setTargetAtTime(dbToLin(-d[0]), at, 0.015);
      g.setTargetAtTime(1, at + d[1], 0.2);
    } catch (e) { /* ignore */ }
  }

  function sfxGroup(c, ch, def) {                          // dry gain + short shared reverb send
    const g = c.createGain(), sg = c.createGain();
    g.connect(ch.sfx); sg.gain.value = def.rev === undefined ? 0.2 : def.rev;
    g.connect(sg); sg.connect(ch.send('room'));
    return { g, sg };
  }

  function sfx(name, opts) {
    const def = sfxDef(name);
    if (!def) { warnOnce('sfx', name); return; }
    if (!ctx || ctx.state !== 'running' || muted) return;
    if (live.voices > MAX_VOICES || live.sfxv > MAX_SFX_VOICES) return;
    if ((sfxFaults[name] | 0) >= SFX_FAULT_LIMIT) return;      // this sound keeps failing on this engine: leave it out
    opts = opts || {};
    const now = ctx.currentTime;
    const list = groups[name] || (groups[name] = []);
    while (list.length >= def.max) {                       // voice limit: steal the oldest instance
      const old = list.shift();
      if (old.counted) { old.counted = false; live.groups--; }
      try { old.gain.gain.cancelScheduledValues(now); old.gain.gain.setTargetAtTime(0, now, 0.004); } catch (e) { /* ignore */ }
      old.reg.stopAll(now + 0.03);
    }
    let nodes = null, grp = null;
    try {
      nodes = sfxGroup(ctx, chain, def);
      grp = { gain: nodes.g, reg: null, counted: true };
      grp.reg = makeRegistry(() => {
        const i = list.indexOf(grp); if (i >= 0) list.splice(i, 1);
        try { nodes.g.disconnect(); nodes.sg.disconnect(); } catch (e) { /* ignore */ }
        if (grp.counted) { grp.counted = false; live.groups--; }
      }, true);
      live.groups++;
      list.push(grp);
      const P = sfxParams(def, opts);
      REG = grp.reg;
      def.fn(sfxKit(ctx, nodes.g, now + 0.003, P));
      if (!paused && !(cur && cur.kind === 'jingle' && !cur.stopped)) duckMusicFor(chain, now + 0.003, name);      // not under a fanfare (extend / clear_boss / game over)
    } catch (e) {
      sfxFaults[name] = (sfxFaults[name] | 0) + 1;
      if (sfxFaults[name] >= SFX_FAULT_LIMIT) warnFault('sfx:' + name, 'sfx "' + name + '" keeps failing (' + (e && e.message ? e.message : e) + ') -- disabled');
    } finally { REG = null; }
    if (grp && !grp.reg.n()) grp.reg.onIdle();
  }

  function setMuted(b) {
    muted = !!b;
    U.store.set('muted', muted);
    if (chain) {
      try { chain.mute.gain.cancelScheduledValues(ctx.currentTime); chain.mute.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.012); } catch (e) { /* ignore */ }
    }
  }
  function toggleMuted() { setMuted(!muted); return muted; }
  const isMuted = () => muted;

  // pause({suspend}):  the music ducks out at once and the sequencer stops.
  //   suspend:true (default; blur / hidden tab): the context is suspended PAUSE_SUSPEND_MS later, so a "pause" blip played
  //     right before/after the call is still heard.
  //   suspend:false (manual pause screen): the context keeps running so menu sfx still play.
  // resume() undoes either, keeps jingles / loops on their own timeline (pause time is not counted against them) and
  // recovers a context that was suspended from outside.
  let pauseTimer = null;
  function pause(opts) {
    const hard = !(opts && opts.suspend === false);
    if (!paused) {
      paused = true;
      pausedWall = performance.now();
      pausedCtx = ctx ? ctx.currentTime : 0;
      if (chain) duckMusic(0);
    }
    pauseKind = hard ? 'hard' : 'soft';
    if (!ctx) return;
    if (hard) {
      if (ctx.state === 'running' && pauseTimer === null) {
        pauseTimer = setTimeout(() => {
          pauseTimer = null;
          if (paused && pauseKind === 'hard' && ctx && ctx.state === 'running') { try { const p = ctx.suspend(); if (p && p.catch) p.catch(noop); } catch (e) { /* ignore */ } }
        }, PAUSE_SUSPEND_MS);
      }
    } else {
      if (pauseTimer !== null) { clearTimeout(pauseTimer); pauseTimer = null; }
      if (ctx.state !== 'running') { try { const p = ctx.resume(); if (p && p.catch) p.catch(noop); } catch (e) { /* ignore */ } }
    }
  }
  function resume() {
    const was = paused;
    paused = false; pauseKind = null;
    if (pauseTimer !== null) { clearTimeout(pauseTimer); pauseTimer = null; }
    if (chain) duckMusic(1);
    if (was && ctx) {
      // the audio clock kept running for (part of) the pause while nothing was scheduled: shift every timeline by that much
      const d = Math.max(0, ctx.currentTime - pausedCtx), wall = performance.now() - pausedWall;
      for (const tr of active) {
        if (tr.nextTime !== null) tr.nextTime += d;
        if (tr.done) tr.endTime += d;
        if (tr.startAt) tr.startAt += d;
        if (tr.kind === 'jingle') tr.wallDeadline += wall + 400;         // pause time does not count against a jingle
      }
    }
    if (ctx && ctx.state !== 'running') { try { const p = ctx.resume(); if (p && p.catch) p.catch(noop); } catch (e) { /* ignore */ } }
  }
  function duckMusic(on) {
    try {
      const g = chain.music.gain, now = ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setTargetAtTime(on ? MUSIC_LEVEL : 0, now, 0.02);
    } catch (e) { /* ignore */ }
  }

  const trackNames = () => LOOPS.concat(JINGLES);
  const sfxNames = () => SFX_NAMES.slice();
  const isTrackName = (n) => LOOPS.indexOf(n) >= 0 || JINGLES.indexOf(n) >= 0 || isDemo(n);

  // ---- offline rendering (debug / tests): the very same synth code into an OfflineAudioContext ----
  async function renderOffline(name, seconds, opts) {
    opts = opts || {};
    const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const frames = Math.max(1, Math.ceil(seconds * OFFLINE_RATE));
    const oc = new OC(2, frames, OFFLINE_RATE);
    const ch = buildChain(oc, false);
    if (opts.noComp) { ch.glue.ratio.value = 1; ch.limiter.ratio.value = 1; }          // debug: bypass compression
    if (opts.mg) ch.music.gain.value = opts.mg;                                       // debug: music bus gain override (calibration at a level below the ceiling)
    nzReset();
    if (sfxDef(name)) {
      const def = sfxDef(name);
      const nodes = sfxGroup(oc, ch, def);
      const P = sfxParams(def, opts);
      if (opts.noTrim) P.v /= (def.trim === undefined ? 1 : def.trim);           // debug: raw, un-calibrated level
      def.fn(sfxKit(oc, nodes.g, 0.0, P));
    } else if (isTrackName(name)) {
      const prog = getProg(name);
      const tr = makeTrack(oc, ch, prog, prog.kind === 'jingle' ? 'jingle' : 'loop', false, opts.tempo || 1);
      tr.tempoFixed = opts.tempo || 1;
      tr.skip = opts.skip || null;                    // debug: lanes to leave out ('drum' = the kit)
      tr.pass = opts.pass | 0;                        // debug: which loop pass to render (odd = key-lifted when the song has a lift, and plays the `alt` version of the sections that have one)
      if (opts.alternate) tr.passLocked = false;      // debug: let the pass counter run (0, 1, 0 ... at every loop wrap) to test the seams between a pass and its variation
      tr.nextTime = 0;
      ch.setEchoTime(prog.echo * (60 / (prog.bpm * tr.tempoFixed)) / 4);
      ch.setEchoFb(prog.fb);
      // Schedule in OFFLINE_CHUNK-second slices from suspend() callbacks (like the live look-ahead) -- creating every
      // node up front makes the render time quadratic in the length.
      const chunk = opts.chunk || OFFLINE_CHUNK;
      advanceTrack(tr, Math.min(seconds, chunk) + 0.001, false);
      for (let at = chunk; at < seconds; at += chunk) {
        oc.suspend(at).then(() => { advanceTrack(tr, Math.min(seconds, at + chunk) + 0.001, false); oc.resume(); });
      }
    } else {
      throw new Error('AUDIO._renderOffline: unknown name ' + name);
    }
    // debug: extra SFX layered over the render, [[sfxName, atSeconds, polarity?, pitch?], ...] (mix / clipping / warm-level tests)
    for (const [sn, at, pol, pitch] of opts.sfx || []) {       // [name, at s, polarity (+1 / -1), pitch in semitones]
      const def = sfxDef(sn);
      if (!def) continue;
      const nodes = sfxGroup(oc, ch, def);
      if (pol) nodes.g.gain.value = pol;                    // measurement hook: polarity of the whole SFX (+1 / -1), so (mix + inverted mix) / 2 isolates the music as the chain left it
      def.fn(sfxKit(oc, nodes.g, at, { f: Math.pow(2, (+pitch || 0) / 12), v: def.trim === undefined ? 1 : def.trim }));
      duckMusicFor(ch, at, sn);                                // the inverted-polarity twin of a measurement pair ducks identically (the duck is part of "the music as the chain left it")
    }
    const t0 = performance.now();
    const buf = await oc.startRendering();
    renderOffline.lastMs = performance.now() - t0;
    return { sampleRate: OFFLINE_RATE, channels: [buf.getChannelData(0).slice(), buf.getChannelData(1).slice()] };
  }

  // ---- debug / test extras (not part of the contract) ---------------------------------------------
  function info(name) {
    if (sfxDef(name)) return { kind: 'sfx', max: SFX[name].max, quiet: !!SFX[name].quiet, quietDb: SFX[name].quiet ? (SFX[name].quiet === true ? 9 : SFX[name].quiet) : 0, lvl: SFX[name].lvl || 0, rev: SFX[name].rev };
    const prog = getProg(name);
    const beat = 60 / prog.bpm;
    return {
      kind: prog.kind, bpm: prog.bpm, swing: prog.swing, steps: prog.steps, loopStart: prog.loopStart,
      bars: prog.steps / STEPS_PER_BAR, seconds: prog.steps / 4 * beat, lift: prog.lift, maxTempo: prog.maxTempo,
      loopSeconds: (prog.steps - prog.loopStart) / 4 * beat, introSeconds: prog.loopStart / 4 * beat,
      placeholder: prog.placeholder, gain: prog.gain, peakSources: prog.peakSources, lanes: prog.lanes.map((L) => L.name),
      altSections: (prog.meta.altSections || []).map((a) => Object.assign({}, a)),       // sections that have a second-pass version (FIXPLAN_V3 A8)
    };
  }
  function dump(name) {
    const p = getProg(name);
    const notes = p.meta.notes.slice().sort((a, b) => a.s - b.s);
    return { name, bpm: p.bpm, swing: p.swing, key: p.key, mode: p.mode, steps: p.steps, loopStart: p.loopStart,
      lead: p.meta.lead, chords: p.meta.chords, sections: p.meta.sections, notes, altNotes: (p.meta.altNotes || []).slice().sort((a, b) => a.s - b.s), issues: p.meta.issues.slice(), kind: p.kind,
      lanes: p.lanes.map((L) => ({ name: L.name, inst: L.inst, cfg: L.cfg })), placeholder: p.placeholder, peakSources: p.peakSources };
  }
  function validate() {
    const issues = [];
    for (const n of trackNames()) for (const s of getProg(n).meta.issues) issues.push(s);
    for (const n of demoNames()) for (const s of getProg(n).meta.issues) issues.push(s);
    return issues;
  }
  function stats() {
    return { voices: live.voices, tracks: live.tracks, groups: live.groups, resyncs: live.resyncs, active: active.length, sfxVoices: live.sfxv,
      ctxState: ctx ? ctx.state : 'none', time: ctx ? ctx.currentTime : 0, current: cur ? cur.name : null,
      currentKind: cur ? cur.kind : null, curPos: cur ? cur.pos : null, curCount: cur ? cur.count : 0, curNext: cur ? cur.nextTime : null, curPass: cur ? cur.pass : 0, curStartAt: cur ? cur.startAt : null, lastJingleEnd,
      switching: !!(cur && cur.sw), lastSwitch, faults, pendingLoop };
  }
  /** debug: record the final output for `sec` seconds (ScriptProcessor tapped after the mute gain) -> {sampleRate, t0, channels}; t0 = audio-clock time of sample 0 */
  function capture(sec) {
    return new Promise((resolve) => {
      if (!ctx || !chain || !ctx.createScriptProcessor) { resolve(null); return; }
      const sp = ctx.createScriptProcessor(2048, 2, 2), parts = [[], []], need = Math.ceil(sec * ctx.sampleRate);
      let t0 = null, n = 0;
      sp.onaudioprocess = (e) => {
        if (t0 === null) t0 = e.playbackTime;
        for (let c = 0; c < 2; c++) parts[c].push(Float32Array.from(e.inputBuffer.getChannelData(c)));
        n += e.inputBuffer.length;
        if (n < need) return;
        sp.onaudioprocess = null;
        try { chain.mute.disconnect(sp); sp.disconnect(); } catch (err) { /* ignore */ }
        resolve({ sampleRate: ctx.sampleRate, t0, channels: parts.map((list) => { const out = new Float32Array(n); let o = 0; for (const b of list) { out.set(b, o); o += b.length; } return out; }) });
      };
      chain.mute.connect(sp); sp.connect(ctx.destination);
    });
  }
  /** debug: leave these lanes out of the current track (['drum'] = the kit) -- live CPU ablation */
  function skipLanes(list) { if (cur) cur.skip = list && list.length ? list.slice() : null; }
  /** debug: move the current loop's read position (e.g. just before its end to test the loop wrap / pass counter) */
  function seek(step, pass) {
    if (cur && cur.kind === 'loop' && !cur.stopped) { cur.pos = clamp(step | 0, 0, cur.prog.steps - 1); if (pass !== undefined) cur.pass = pass | 0; }       // pass 1 = the second-pass (`alt`) version of the sections
  }
  function state() {
    const c = cur && !cur.stopped ? cur : null;
    const sw = c && c.sw ? c.sw : null;                                // a bar-aligned switch counts as already requested
    return { music: c && c.kind === 'loop' ? (sw ? sw.name : c.name) : (pendingLoop || null),
      jingle: c && c.kind === 'jingle' ? c.name : null,
      switching: !!sw, tempo, inited: !!ctx, paused, pauseKind, muted, disabled, faults, ctxState: ctx ? ctx.state : 'none' };
  }
  /** AnalyserNode on the final output (post mute), created on demand. */
  function tap() {
    if (!ctx || !chain) return null;
    if (!tapNode) {
      tapNode = ctx.createAnalyser(); tapNode.fftSize = 2048;
      chain.mute.connect(tapNode);
    }
    return tapNode;
  }
  /** debug: compiled events of a track, [{step, k, lane, ...}] (k: n note, d drum, f fx, u duck, a automation) -- for the notation tests */
  function eventsOf(name, pass) {
    const p = getProg(name), out = [], par = (pass | 0) & 1;
    p.events.forEach((list, step) => { if (list) for (const e of list) { if (e.o !== undefined && e.o !== par) continue; out.push({ step, k: e.k, lane: e.lane, n: e.n, m: e.m, vel: e.vel, name: e.name, depth: e.depth, p: e.p, v0: e.v0, v1: e.v1, fn: e.fn && e.fn.name, o: e.o }); } });
    return out;
  }
  /** debug: register / replace a 'demo_*' song def (composer scratch pad and notation tests); returns the compile issues */
  function defineDemo(name, def) {
    if (!/^demo_[a-z0-9_]+$/.test(name)) throw new Error('AUDIO._define: name must match demo_[a-z0-9_]+');
    demoDefs()[name] = def; delete progs[name]; defsCache = null;
    return getProg(name).meta.issues.slice();
  }
  /** debug (instrument board): play a demo track ('demo_*') at once, loops repeat, one-shots end by themselves */
  function playDemo(name) {
    if (!isDemo(name) || !ctx) return false;
    const prog = getProg(name);
    if (prog.kind === 'loop') { playMusic(name, { restart: true }); return true; }
    jingle(name, {});
    return true;
  }

  // ---- debug (instrument board): single notes / hits / fx on a throw-away lane bus --------------------------------------------------------
  /** _note('pad', [57, 60, 64], 2, { vel, lane: {hall: .3}, cfg: {cut: 2000} })   instrument note / chord      _hit('K', vel)  one drum char      _fxNow('riser', 3)  one fx */
  function scratchLane(inst, laneCfg, play) {
    if (!ctx || !chain || disabled) return false;
    const cfg = Object.assign({}, INST[inst] ? INST[inst].d : {}, KIT_DEFAULT[inst] || {}, laneCfg || {});
    cfg.inst = inst;
    const L = { name: '_scratch', inst, cfg, needs: {}, duckAny: false };
    const rg = makeRegistry();
    const saved = REG; REG = rg;
    let lane = null;
    try {
      lane = buildLane(ctx, chain, L, chain.musicIn, 0);
      play(lane, ctx.currentTime + 0.03, cfg);
    } catch (e) { noteFault(e); } finally { REG = saved; }
    const done = () => { rg.clear(); if (lane) for (const n of lane.nodes) { try { n.disconnect(); } catch (e) { /* gone */ } } };
    if (!lane) { done(); return false; }
    rg.onIdle = () => setTimeout(done, 200);
    setTimeout(done, 12000);
    return true;
  }
  function noteOn(inst, midis, dur, o) {
    o = o || {};
    if (!INST[inst] || !INST[inst].play) return false;
    const ms = Array.isArray(midis) ? midis : [midis];
    return scratchLane(inst, o.lane, (lane, t, cfg) => INST[inst].play(ctx, lane, t, dur || 1, ms, o.vel === undefined ? 1 : o.vel, Object.assign(cfg, o.cfg || {})));
  }
  function hitNow(ch, vel) {
    const k = KIT[ch];
    if (!k) return false;
    return scratchLane(k[0], null, (lane, t) => k[1](ctx, lane, t, (vel === undefined ? 1 : vel) * KIT_LV));
  }
  function fxNow(name, seconds, vel) {
    if (!FXV[name]) return false;
    return scratchLane('fx', { hall: 0.3 }, (lane, t) => FXV[name](ctx, lane, t, seconds || 2, (vel === undefined ? 1 : vel) * FX_LV));
  }

  return { init, ready, music: playMusic, jingle, stopMusic, setTempo, sfx, setMuted, toggleMuted, isMuted,
    pause, resume, trackNames, sfxNames, _renderOffline: renderOffline,
    _info: info, _dump: dump, _validate: validate, _stats: stats, _state: state, _tap: tap, _seek: seek, _skip: skipLanes, _capture: capture,
    _demoNames: () => demoNames(), _demo: playDemo, _events: eventsOf, _define: defineDemo, _note: noteOn, _hit: hitNow, _fxNow: fxNow, _instruments: () => Object.keys(INST), _kit: () => Object.keys(KIT), _pats: () => Object.keys(PATS) };
})();


/* ===== 30_levels.js ===== */
/* FIZZ & POP — 30_levels.js
 * The 30 round definitions (SPEC §3.3). GENERATED from test/levels_defs_*.mjs by test/levels_gen.mjs
 * (re-run `node test/levels_gen.mjs` after editing a design); the maps below are plain literal data.
 *
 * Shape of one round (all tile coordinates; map is 32 cols x 26 rows, '#' block, '.' empty):
 *   name      short title of the round's silhouette (extra, optional for consumers; may be shown on the banner)
 *   map       26 strings x 32 chars. Cols 0-1 / 30-31 outer walls, rows 0 / 25 ceiling / floor; every floor
 *             gap column is also a ceiling gap column (falling out of the bottom re-enters at the top)
 *   enemies   { t, c, r, d }  (c, r) = top-left tile of the spawn box (2x2 tiles; the Kraken 6x6), d = facing (1 / -1)
 *   air       1-3 attractor points [col, row] (may be .5) = bubble CENTRES in tile units (px = col*8, 16 + row*8).
 *             Each sits in open water 2-4 rows above a platform (a player can walk or jump into the cluster)
 *   specials  'thunder' | 'fire' | 'water' bubbles that spawn in this round (11 of the 25 rounds 5-29 have some)
 *   hurry     seconds of play until HURRY UP: 30-45 by map size / enemy count / difficulty; rounds 1 and 2 get 45 / 42 s (a newcomer
 *             must be able to learn move / jump / shoot / pop first); rounds 22-29 ramp down gently, 42 42 40 40 38 38 36 36 (never
 *             below 36); the boss round gets 150 (a Kraken fight takes minutes - HURRY UP / Bonefin must not be guaranteed)
 *   boss      true only for round 30
 *
 * Design rules followed (in addition to SPEC §3.3; test/levels_check.mjs verifies them with a model of the real
 * movement physics, tools/validate_levels.mjs checks the contract):
 *  - Platforms are one-way, so vertical routes are built from surfaces <= 4 rows apart (5 only where a bubble
 *    bounce makes it fair). Walls on platforms are <= 4 rows high. Platforms 2 thick use a 4-row pitch.
 *  - Nobody can get trapped: every region has a drop-off of >= 3 free columns (the 12 px hitbox needs 2+; 3 is
 *    comfortable) so a player who jumped up can always walk down again; pictograms keep >= 3 columns of free air
 *    between their parts and the side walls. Near the ceiling (surface rows 3-6) players cannot jump high
 *    (nothing may stand there as an obstacle). Wrap-around rounds (1, 2, 6, 18, 22, 29, 30) use floor gaps.
 *  - Spawn pads (cols 2-6 / 25-29, rows 21-24) stay free; no enemy starts within 6 columns / 10 rows of a pad.
 *  - Enemy schedule: 3 in round 1 ramping to 6 by round 17-20, then 6-8; breathers at 6, 11, 16, 21, 26; a new
 *    enemy type debuts in a round built to show it off (4 Crabbit lanes, 7 Jellop open sea, 11 Springle bowls,
 *    16 Glimmer cavern whose stalactites shield from sparks).
 *  - Specials: thunder 5, 15, 19, 24, 29, 30; water 8, 13, 25, 27; fire 10, 22, 29.
 *  - Wave 2 (QA fixes): air points keep a straight-jump platform within reach of the ceiling cluster (R12, R18, R19, R27)
 *    and sit in open water (R5, R24); rounds 11 and 22 gather every bubble in ONE cluster so chains are possible.
 *    Walkers must always be able to leave: no pit under the ceiling (surface rows <= 6) and no 1-row bump on top of a
 *    platform there (R12 notches, R26 pediment, R13 mast stub); the floor shelves are 1-row planks 3 rows above the
 *    floor (a Springle's hop is 4 rows, so a 2-row shelf with its top exactly 4 rows up held it in the corner).
 *  - Wave 3 (K6): the Crystal Cavern stalactites are only 2 rows deep (the old 5-6 row ones walled both row-5 slab rooms in: a
 *    Nibbler / Crabbit that walked onto a slab could not reach either end and was held until the watchdog fired, ~8 s). Round 19's planks
 *    start one column further in (cols 9-12 / 19-22): with the old 8-12 / 19-23 a Springle in a bottom corner hopped back and forth between
 *    wall and plank end (both hops landed outside the window in which a hop clears the plank), 300-700 frames per visit. Round 27's
 *    bubble gathering points sit above the row-9 tier shoulders (12.5 / 19.5, row 8), so the ceiling clusters are straight-jump spots.
 *
 * Round index (concept per round):
 *    1  Reef Terraces          symmetric zig-zag terraces, centre floor gap teaches the wrap; 3 Nibblers on separate tiers
 *    2  Coral Staircase        diagonal staircase climbing to the right, return shelf on top, left cascade; floor gap lands on the shelf
 *    3  Big Fish               pictogram: an outlined fish you can climb into; ring top and belly are the platforms, eye is a floating block
 *    4  Pebble Alley           Crabbit debut: five long lanes, one staggered hole each, crates in the corners - clear firing lines for pebbles
 *    5  Sea Fan                pictogram: four concentric coral-fan arcs on a rock; enemies drift down the arcs, first thunder bubbles
 *    6  Kelp Fronds            breather: three kelp strands of chunky leaf ledges zig-zagging up, two floor gaps between them
 *    7  Open Water             Jellop debut: wide-open sea with staggered floating islands, lots of room for diagonal bouncing
 *    8  Sea Turtle             pictogram: a turtle seen from above - grooved shell, head on top, four flippers; water bubbles flow down its back
 *    9  Kelp Tangle            dense thicket: irregular 1-thick ledges only 3 rows apart, short runs, very little open floor
 *   10  Seahorse               pictogram: a seahorse - the snout, S-curved body and curled tail; left rock ledges climb to the snout, free drop channels everywhere
 *   11  Anchor                 Springle debut: a ship anchor - ring, stock, shank and curved arms; two bowls for the bouncers
 *   12  Ship's Wheel           pictogram: a helm with rim, hub, eight spokes and handles; rim top and hub are the stages
 *   13  Galleon                pictogram: a sailing ship - hull, bow, two masts whose yards form a ladder of 4-row steps; docks and fenders on both sides
 *   14  Cargo Stack            asymmetric cargo pile built from 2x-scaled four-block pieces; every piece is 2 or 4 rows tall, gaps of 2-4 columns
 *   15  Bone Reef              pictogram: a pirate skull over crossed bones - sockets, nose and teeth are cut out; end-of-ship challenge
 *   16  Crystal Cavern         Glimmer debut: stalagmites, hanging stalactites that shield from sparks, flat-topped crystals floating between
 *   17  Great Diamond          pictogram: a cut diamond outline - table, girdle bar, V-shaped pavilion with facet shelves inside
 *   18  Sky Loop               wrap-around round: the top tiers sit 7 rows above the lower world - ride the floor gaps (or bubble-bounce) to get up, walk off the ledges to come down
 *   19  Frost Star             pictogram: an eight-armed snowflake built from ice beads - open on all sides, hop from bead to bead
 *   20  Nautilus               pictogram: a nautilus spiral - one long coiled ledge winding to the centre; end-of-caves challenge, 8 enemies
 *   21  Volcano                breather: a hollow volcano - thick basalt slopes around a magma chamber, crater on top
 *   22  Lava Falls             two aligned lava shafts run through every lane and out the floor gaps: whoever steps off the lane loops back to the top
 *   23  Trident                pictogram: Poseidon trident - three barbed prongs climbed like ladders, curved neck, short shaft
 *   24  Pearl Oyster           pictogram: an open oyster - arched upper shell, bowl below, a big pearl in the mouth; thunder bubbles
 *   25  Axolotl Face           pictogram: the heroes' own smile - round face, three gill frills per side, big eyes and a grin to walk on
 *   26  Temple Facade          breather: a temple front - pediment roof, four storeys of slabs; storeys alternate between pillared cells and open galleries
 *   27  Ziggurat               pictogram: a stepped pyramid with a raised base you can walk under and a shrine on top; water bubbles flow down the steps
 *   28  Abyssal Eye            pictogram: an almond eye - upper and lower lid arcs, ringed iris and pupil, lashes on the slopes
 *   29  The Crown              pictogram: the Kraken King's crown - three points and a jewelled band; its body is 6+ rows above the floor, so ride the centre floor gap (or bounce on bubbles) to the top
 *   30  Kraken King            boss arena: wide open water (the 6x6 Kraken starts top centre), two floor gaps that spit thunder bubbles, platforms at three heights to dodge ink
 */
const LEVELS = [
  // ---- Round 1: Reef Terraces (Coral Reef) -------------------------------------------------
  // symmetric zig-zag terraces, centre floor gap teaches the wrap; 3 Nibblers on separate tiers
  {
    name: 'Reef Terraces',
    map: [
      '##############....##############',  // row 0
      '##............................##',
      '##............................##',
      '##............................##',
      '##............................##',
      '##.........##########.........##',  // row 5
      '##.........##########.........##',
      '##............................##',
      '##............................##',
      '##.#########........#########.##',
      '##.#########........#########.##',  // row 10
      '##............................##',
      '##............................##',
      '##......################......##',
      '##......################......##',
      '##............................##',  // row 15
      '##............................##',
      '##.#########........#########.##',
      '##.#########........#########.##',
      '##............................##',
      '##............................##',  // row 20
      '##.......##############.......##',
      '##.......##############.......##',
      '##............................##',
      '##............................##',
      '##############....##############',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 12, r: 19, d: 1 },
      { t: 'nibbler', c: 10, r: 15, d: -1 },
      { t: 'nibbler', c: 21, r: 11, d: -1 },
    ],
    air: [[15.5, 3]],
    specials: [],
    hurry: 45,
    boss: false,
  },

  // ---- Round 2: Coral Staircase (Coral Reef) -----------------------------------------------
  // diagonal staircase climbing to the right, return shelf on top, left cascade; floor gap lands on the shelf
  {
    name: 'Coral Staircase',
    map: [
      '####################....########',  // row 0
      '##............................##',
      '##............................##',
      '##............................##',
      '##............................##',
      '##.####################.......##',  // row 5
      '##.####################.......##',
      '##............................##',
      '##............................##',
      '##.########........#######....##',
      '##.########........#######....##',  // row 10
      '##............................##',
      '##............................##',
      '##.#######.....#######........##',
      '##.#######.....#######........##',
      '##............................##',  // row 15
      '##............................##',
      '##.........#######............##',
      '##.........#######............##',
      '##............................##',
      '##............................##',  // row 20
      '##.....#######................##',
      '##.....#######................##',
      '##............................##',
      '##............................##',
      '####################....########',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 13, r: 15, d: 1 },
      { t: 'nibbler', c: 17, r: 11, d: -1 },
      { t: 'nibbler', c: 22, r: 7, d: -1 },
      { t: 'nibbler', c: 5, r: 7, d: 1 },
    ],
    air: [[13, 3.5]],
    specials: [],
    hurry: 42,
    boss: false,
  },

  // ---- Round 3: Big Fish (Coral Reef) ------------------------------------------------------
  // pictogram: an outlined fish you can climb into; ring top and belly are the platforms, eye is a floating block
  {
    name: 'Big Fish',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............................##',
      '##...........########.........##',
      '##...........########.........##',
      '##..........##########........##',  // row 5
      '##.........############.......##',
      '###......################.....##',
      '####....####..........####....##',
      '#####..###..............###...##',
      '######.##.............##.##...##',  // row 10
      '##.######.............##.##...##',
      '##...####................#....##',
      '##.######..#######.......#....##',
      '###.##.##..#######.......##...##',
      '#####..###..............###...##',  // row 15
      '####....####..........####....##',
      '###......################.....##',
      '##.........############.......##',
      '##.............####...........##',
      '##............................##',  // row 20
      '##......######......#####.....##',
      '##......######......#####.....##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 12, r: 19, d: 1 },
      { t: 'nibbler', c: 21, r: 19, d: -1 },
      { t: 'nibbler', c: 15, r: 1, d: 1 },
      { t: 'nibbler', c: 13, r: 11, d: 1 },
    ],
    air: [[17, 9]],
    specials: [],
    hurry: 36,
    boss: false,
  },

  // ---- Round 4: Pebble Alley (Coral Reef) --------------------------------------------------
  // Crabbit debut: five long lanes, one staggered hole each, crates in the corners - clear firing lines for pebbles
  {
    name: 'Pebble Alley',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............................##',
      '##.........................##.##',
      '##.........................##.##',
      '#################....###########',  // row 5
      '#################....###########',
      '##.##.........................##',
      '##.##.........................##',
      '######....######################',
      '######....######################',  // row 10
      '##.........................##.##',
      '##.........................##.##',
      '######################....######',
      '######################....######',
      '##.##.........................##',  // row 15
      '##.##.........................##',
      '############....################',
      '############....################',
      '##....................##......##',
      '##....................##......##',  // row 20
      '##.....##################.....##',
      '##.....##################.....##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'crabbit', c: 6, r: 11, d: 1 },
      { t: 'crabbit', c: 18, r: 15, d: -1 },
      { t: 'nibbler', c: 12, r: 19, d: 1 },
      { t: 'nibbler', c: 22, r: 7, d: -1 },
    ],
    air: [[15, 12]],
    specials: [],
    hurry: 36,
    boss: false,
  },

  // ---- Round 5: Sea Fan (Coral Reef) -------------------------------------------------------
  // pictogram: four concentric coral-fan arcs on a rock; enemies drift down the arcs, first thunder bubbles
  {
    name: 'Sea Fan',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............................##',
      '##...........######...........##',
      '##........############........##',
      '##......##............##......##',  // row 5
      '##....##................##....##',
      '##....#.......####.......#....##',
      '##........############........##',
      '##.......##..........##.......##',
      '##.....##..............##.....##',  // row 10
      '##....##......####......##....##',
      '##....#....##########....#....##',
      '##........##........##........##',
      '##.......##..........##.......##',
      '##......##.....##.....##......##',  // row 15
      '##......#....######....#......##',
      '##.....##...#......#...##.....##',
      '##.....#...##......##...#.....##',
      '##.....#...#........#...#.....##',
      '##.....#...#........#...#.....##',  // row 20
      '##............................##',
      '##...........######...........##',
      '##...........######...........##',
      '##...........######...........##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'crabbit', c: 16, r: 5, d: -1 },
      { t: 'crabbit', c: 14, r: 13, d: 1 },
      { t: 'nibbler', c: 11, r: 10, d: 1 },
      { t: 'nibbler', c: 19, r: 6, d: -1 },
      { t: 'nibbler', c: 14, r: 20, d: 1 },
    ],
    air: [[15.5, 6.5]],
    specials: ['thunder'],
    hurry: 38,
    boss: false,
  },

  // ---- Round 6: Kelp Fronds (Kelp Forest) ---------------------------------------------------
  // breather: three kelp strands of chunky leaf ledges zig-zagging up, two floor gaps between them
  {
    name: 'Kelp Fronds',
    map: [
      '###########...####...###########',  // row 0
      '##............................##',
      '##............................##',
      '##............................##',
      '##...........#####............##',
      '##.....#####.#####....#####...##',  // row 5
      '##.....#####..........#####...##',
      '##............................##',
      '##..............#####.........##',
      '##.#####........#####....#######',
      '##.#####.................#######',  // row 10
      '##............................##',
      '##..........#####.............##',
      '##....#####.#####....#####....##',
      '##....#####..........#####....##',
      '##............................##',  // row 15
      '##...............#####........##',
      '##.#####.........#####..#####.##',
      '##.#####................#####.##',
      '##............................##',
      '##...........#####............##',  // row 20
      '##......##########..#####.....##',
      '##......#####.......#####.....##',
      '##............................##',
      '##............................##',
      '###########...####...###########',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 8, r: 11, d: 1 },
      { t: 'nibbler', c: 18, r: 14, d: -1 },
      { t: 'nibbler', c: 22, r: 11, d: 1 },
      { t: 'nibbler', c: 8, r: 3, d: -1 },
    ],
    air: [[15.5, 10]],
    specials: [],
    hurry: 30,
    boss: false,
  },

  // ---- Round 7: Open Water (Kelp Forest) ----------------------------------------------------
  // Jellop debut: wide-open sea with staggered floating islands, lots of room for diagonal bouncing
  {
    name: 'Open Water',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............................##',
      '##............................##',
      '##............................##',
      '##.....#####.........#####....##',  // row 5
      '##.....#####.........#####....##',
      '##............................##',
      '##............................##',
      '##.#####......#####......####.##',
      '##.#####......#####......####.##',  // row 10
      '##............................##',
      '##............................##',
      '##.......#####.....#####......##',
      '##.......#####.....#####......##',
      '##............................##',  // row 15
      '##............................##',
      '##.#####......#####......####.##',
      '##.#####......#####......####.##',
      '##............................##',
      '##............................##',  // row 20
      '##.......#####.....#####......##',
      '##.......#####.....#####......##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'jellop', c: 6, r: 11, d: 1 },
      { t: 'jellop', c: 22, r: 7, d: -1 },
      { t: 'jellop', c: 15, r: 13, d: 1 },
      { t: 'nibbler', c: 10, r: 11, d: 1 },
      { t: 'nibbler', c: 15, r: 15, d: -1 },
    ],
    air: [[10, 3.5], [22, 3.5]],
    specials: [],
    hurry: 34,
    boss: false,
  },

  // ---- Round 8: Sea Turtle (Kelp Forest) ----------------------------------------------------
  // pictogram: a turtle seen from above - grooved shell, head on top, four flippers; water bubbles flow down its back
  {
    name: 'Sea Turtle',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............####............##',
      '##...........#.##.#...........##',
      '##...........######...........##',
      '##...####...########...####...##',  // row 5
      '##...######################...##',
      '##....####################....##',
      '##.....######..##..######.....##',
      '##......#####..##..#####......##',
      '##.......##############.......##',  // row 10
      '##.......######..######.......##',
      '##.......######..######.......##',
      '##.......##############.......##',
      '##......####..####..####......##',
      '##....######..####..######....##',  // row 15
      '##...######..######..######...##',
      '##...####......##......####...##',
      '##.............##.............##',
      '##............................##',
      '##............................##',  // row 20
      '##......######....######......##',
      '##......######....######......##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 10, r: 19, d: 1 },
      { t: 'nibbler', c: 19, r: 19, d: -1 },
      { t: 'crabbit', c: 9, r: 4, d: 1 },
      { t: 'jellop', c: 5, r: 10, d: 1 },
      { t: 'jellop', c: 24, r: 12, d: -1 },
    ],
    air: [[7.5, 3], [24.5, 3]],
    specials: ['water'],
    hurry: 38,
    boss: false,
  },

  // ---- Round 9: Kelp Tangle (Kelp Forest) ---------------------------------------------------
  // dense thicket: irregular 1-thick ledges only 3 rows apart, short runs, very little open floor
  {
    name: 'Kelp Tangle',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............................##',
      '##............................##',
      '##.......#####.......####.....##',
      '##............................##',  // row 5
      '##............................##',
      '##.#####......######.....#######',
      '##............................##',
      '##............................##',
      '##......######........######..##',  // row 10
      '##............................##',
      '##............................##',
      '##.######......######....#######',
      '##............................##',
      '##............................##',  // row 15
      '##.......#####.......######...##',
      '##............................##',
      '##............................##',
      '##.#####......######....#####.##',
      '##............................##',  // row 20
      '##............................##',
      '##......#####....######.......##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 17, r: 17, d: 1 },
      { t: 'crabbit', c: 9, r: 14, d: -1 },
      { t: 'nibbler', c: 16, r: 11, d: -1 },
      { t: 'crabbit', c: 8, r: 8, d: 1 },
      { t: 'nibbler', c: 15, r: 5, d: 1 },
      { t: 'jellop', c: 26, r: 2, d: -1 },
    ],
    air: [[11, 14], [23, 8]],
    specials: [],
    hurry: 40,
    boss: false,
  },

  // ---- Round 10: Seahorse (Kelp Forest) ------------------------------------------------------
  // pictogram: a seahorse - the snout, S-curved body and curled tail; left rock ledges climb to the snout, free drop channels everywhere
  {
    name: 'Seahorse',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............................##',
      '##............................##',
      '##.............####...........##',
      '##............#.###...........##',  // row 5
      '##......###########...........##',
      '##.....######.#####...........##',
      '##............#####...........##',
      '#####..........###............##',
      '#####.........####............##',  // row 10
      '##..........######............##',
      '##..........######............##',
      '#####.......#####.............##',
      '#####.......#####....#........##',
      '##......###.#####..#####......##',  // row 15
      '##...........####..##..##.....##',
      '#####.........####.#...##.....##',
      '#####..........###.....##.....##',
      '##..............##.....##.....##',
      '##...............#######......##',  // row 20
      '##......######....#####.......##',
      '##......######................##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 15, r: 2, d: -1 },
      { t: 'crabbit', c: 9, r: 4, d: 1 },
      { t: 'nibbler', c: 3, r: 11, d: 1 },
      { t: 'crabbit', c: 8, r: 13, d: 1 },
      { t: 'jellop', c: 22, r: 2, d: -1 },
      { t: 'nibbler', c: 11, r: 19, d: 1 },
    ],
    air: [[10, 4]],
    specials: ['fire'],
    hurry: 42,
    boss: false,
  },

  // ---- Round 11: Anchor (Sunken Ship) --------------------------------------------------------
  // Springle debut: a ship anchor - ring, stock, shank and curved arms; two bowls for the bouncers
  {
    name: 'Anchor',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............####............##',
      '##............####............##',
      '##...........##..##...........##',
      '##...........##..##...........##',  // row 5
      '##............####............##',
      '##.............##.............##',
      '##........############........##',
      '##........############........##',
      '##..##.........##.........##..##',  // row 10
      '##..###........##........###..##',
      '##..###........##........###..##',
      '##...###.......##.......###...##',
      '##...####......##......####...##',
      '##....####.....##.....####....##',  // row 15
      '##.....######..##..######.....##',
      '##......################......##',
      '##.......##############.......##',
      '##..........########..........##',
      '##............................##',  // row 20
      '##............................##',
      '##......#####......#####......##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'springle', c: 10, r: 14, d: 1 },
      { t: 'springle', c: 20, r: 14, d: -1 },
      { t: 'springle', c: 19, r: 6, d: -1 },
      { t: 'nibbler', c: 10, r: 6, d: 1 },
      { t: 'nibbler', c: 26, r: 8, d: -1 },
    ],
    air: [[16, 5]],
    specials: [],
    hurry: 36,
    boss: false,
  },

  // ---- Round 12: Ship's Wheel (Sunken Ship) --------------------------------------------------
  // pictogram: a helm with rim, hub, eight spokes and handles; rim top and hub are the stages
  {
    name: 'Ship\'s Wheel',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............................##',
      '##..........########..........##',
      '##.........##########.........##',
      '##.......####..##..####.......##',  // row 5
      '##.......###...##...###.......##',
      '##......#####..##..#####......##',
      '##......##..##.##.##..##......##',
      '##.....###...######...###.....##',
      '##..##.##.....####.....##.##..##',  // row 10
      '##..##.##################.##..##',
      '##..##.##.....####.....##.##..##',
      '##.....###...######...###.....##',
      '##......##..##.##.##..##......##',
      '##......#####..##..#####......##',  // row 15
      '##.......###...##...###.......##',
      '##.......####..##..####.......##',
      '##.....##..##########..##.....##',
      '##.....###..########..###.....##',
      '##............................##',  // row 20
      '##............................##',
      '##......####.........####.....##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 12, r: 1, d: 1 },
      { t: 'nibbler', c: 18, r: 1, d: -1 },
      { t: 'crabbit', c: 11, r: 9, d: 1 },
      { t: 'crabbit', c: 19, r: 9, d: -1 },
      { t: 'springle', c: 13, r: 16, d: 1 },
      { t: 'springle', c: 17, r: 16, d: -1 },
    ],
    air: [[16, 2], [6.5, 7], [25.5, 7]],
    specials: [],
    hurry: 40,
    boss: false,
  },

  // ---- Round 13: Galleon (Sunken Ship) -------------------------------------------------------
  // pictogram: a sailing ship - hull, bow, two masts whose yards form a ladder of 4-row steps; docks and fenders on both sides
  {
    name: 'Galleon',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............................##',
      '##.........#####..............##',
      '##..........##................##',
      '##..........##................##',  // row 5
      '##..........##................##',
      '##........#############.......##',
      '##..........##.....##.........##',
      '##..........##.....##.........##',
      '##..........##.....##.........##',  // row 10
      '##.......###############......##',
      '##..........##.....##.........##',
      '##..........##.....##..#......##',
      '##..........##.....##.##......##',
      '##......################......##',  // row 15
      '##.......##############.......##',
      '#####....##############....#####',
      '#####.....############.....#####',
      '##............................##',
      '##............................##',  // row 20
      '##............................##',
      '##.....####..........####.....##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 14, r: 13, d: 1 },
      { t: 'crabbit', c: 14, r: 9, d: -1 },
      { t: 'springle', c: 9, r: 13, d: 1 },
      { t: 'nibbler', c: 12, r: 1, d: 1 },
      { t: 'crabbit', c: 21, r: 9, d: -1 },
      { t: 'jellop', c: 4, r: 5, d: 1 },
    ],
    air: [[15.5, 5], [24.5, 8]],
    specials: ['water'],
    hurry: 40,
    boss: false,
  },

  // ---- Round 14: Cargo Stack (Sunken Ship) ---------------------------------------------------
  // asymmetric cargo pile built from 2x-scaled four-block pieces; every piece is 2 or 4 rows tall, gaps of 2-4 columns
  {
    name: 'Cargo Stack',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............................##',
      '##............##..............##',
      '##............##..............##',
      '##..........########....####..##',  // row 5
      '##..........########....####..##',
      '##..##........................##',
      '##..##........................##',
      '##..######........####........##',
      '##..######........####........##',  // row 10
      '##........##......####........##',
      '##........##......####........##',
      '##........######......######..##',
      '##........######......######..##',
      '##................##..........##',  // row 15
      '##................##..........##',
      '##..########..######...####...##',
      '##..########..######...####...##',
      '##.....................####...##',
      '##.....................####...##',  // row 20
      '##......####........##........##',
      '##......####........##........##',
      '##........####....######......##',
      '##........####....######......##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 24, r: 3, d: -1 },
      { t: 'crabbit', c: 16, r: 3, d: 1 },
      { t: 'springle', c: 22, r: 11, d: -1 },
      { t: 'nibbler', c: 6, r: 7, d: 1 },
      { t: 'crabbit', c: 20, r: 7, d: -1 },
      { t: 'springle', c: 13, r: 11, d: 1 },
    ],
    air: [[15, 9.5]],
    specials: [],
    hurry: 40,
    boss: false,
  },

  // ---- Round 15: Bone Reef (Sunken Ship) -----------------------------------------------------
  // pictogram: a pirate skull over crossed bones - sockets, nose and teeth are cut out; end-of-ship challenge
  {
    name: 'Bone Reef',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............................##',
      '##..........########..........##',
      '##........############........##',
      '##.......##############.......##',  // row 5
      '##......################......##',
      '##......################......##',
      '##.....####...####...####.....##',
      '##.....###.....##.....###.....##',
      '##......##.....##.....##......##',  // row 10
      '##...##.##.....##.....##.##...##',
      '##...#######.######.#######...##',
      '##....#########..#########....##',
      '##.......##############.......##',
      '##........############........##',  // row 15
      '##........############........##',
      '##.......##############.......##',
      '##.....#####........#####.....##',
      '##..######............######..##',
      '##...##..................##...##',  // row 20
      '##............................##',
      '##......#####......#####......##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 14, r: 1, d: 1 },
      { t: 'crabbit', c: 10, r: 10, d: 1 },
      { t: 'crabbit', c: 20, r: 10, d: -1 },
      { t: 'springle', c: 5, r: 9, d: 1 },
      { t: 'springle', c: 25, r: 9, d: -1 },
      { t: 'jellop', c: 3, r: 6, d: 1 },
    ],
    air: [[12.5, 10], [19.5, 10]],
    specials: ['thunder'],
    hurry: 42,
    boss: false,
  },

  // ---- Round 16: Crystal Cavern (Crystal Caves) ------------------------------------------------
  // Glimmer debut: stalagmites, hanging stalactites that shield from sparks, flat-topped crystals floating between
  {
    name: 'Crystal Cavern',
    map: [
      '################################',  // row 0
      '##.#####......#####.....####..##',
      '##..###........###.......###..##',
      '##............................##',
      '##............................##',
      '##......#####......#####......##',  // row 5
      '##.....#######....#######.....##',
      '##............................##',
      '##............................##',
      '##...####.....####.....####...##',
      '##..######...######...######..##',  // row 10
      '##............................##',
      '##............................##',
      '##.......####......####.......##',
      '##......######....######......##',
      '##............................##',  // row 15
      '##............................##',
      '##..####.....#####.....#####..##',
      '##.######...#######...#######.##',
      '##............................##',
      '##............................##',  // row 20
      '##.......###........###.......##',
      '##......####.......####.......##',
      '##......#####......#####......##',
      '##.....#######....#######.....##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'glimmer', c: 7, r: 12, d: 1 },
      { t: 'glimmer', c: 21, r: 15, d: -1 },
      { t: 'nibbler', c: 10, r: 11, d: 1 },
      { t: 'nibbler', c: 24, r: 7, d: -1 },
      { t: 'crabbit', c: 14, r: 15, d: 1 },
    ],
    air: [[11.5, 3.5], [21, 3.5]],
    specials: [],
    hurry: 34,
    boss: false,
  },

  // ---- Round 17: Great Diamond (Crystal Caves) -------------------------------------------------
  // pictogram: a cut diamond outline - table, girdle bar, V-shaped pavilion with facet shelves inside
  {
    name: 'Great Diamond',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............................##',
      '##.......#############........##',
      '##......###############.......##',
      '##......##.##.....##..##......##',  // row 5
      '##.....##..#.......##..##.....##',
      '##.....#..##........#..##.....##',
      '##....##..#.........##..##....##',
      '##....####################....##',
      '##....####################....##',  // row 10
      '##.....##..............##.....##',
      '##.....###............###.....##',
      '##......##............##......##',
      '##.......##..........##.......##',
      '##........##........##........##',  // row 15
      '##.........##########.........##',
      '##.........##########.........##',
      '##..........##....##..........##',
      '##...........##..##...........##',
      '##............####............##',  // row 20
      '##.............##.............##',
      '##............................##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 10, r: 1, d: 1 },
      { t: 'crabbit', c: 12, r: 7, d: 1 },
      { t: 'nibbler', c: 18, r: 7, d: -1 },
      { t: 'springle', c: 13, r: 14, d: 1 },
      { t: 'glimmer', c: 13, r: 5, d: 1 },
      { t: 'jellop', c: 3, r: 3, d: 1 },
    ],
    air: [[14, 6], [19, 13.5]],
    specials: [],
    hurry: 38,
    boss: false,
  },

  // ---- Round 18: Sky Loop (Crystal Caves) ------------------------------------------------------
  // wrap-around round: the top tiers sit 7 rows above the lower world - ride the floor gaps (or bubble-bounce) to get up, walk off the ledges to come down
  {
    name: 'Sky Loop',
    map: [
      '#########...########...#########',  // row 0
      '##............................##',
      '##............................##',
      '##............................##',
      '##............................##',
      '##............................##',  // row 5
      '##.##########......##########.##',
      '##.##########......##########.##',
      '##............................##',
      '##............................##',
      '##...........######...........##',  // row 10
      '##...........######...........##',
      '##............................##',
      '##............................##',
      '##............................##',
      '##............................##',  // row 15
      '##............................##',
      '##.#######..########..#######.##',
      '##.#######..########..#######.##',
      '##............................##',
      '##............................##',  // row 20
      '##...........######...........##',
      '##...........######...........##',
      '##............................##',
      '##............................##',
      '#########...########...#########',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 5, r: 4, d: 1 },
      { t: 'crabbit', c: 25, r: 4, d: -1 },
      { t: 'springle', c: 14, r: 8, d: 1 },
      { t: 'glimmer', c: 15, r: 3, d: 1 },
      { t: 'jellop', c: 6, r: 12, d: 1 },
      { t: 'nibbler', c: 13, r: 15, d: -1 },
      { t: 'crabbit', c: 17, r: 15, d: 1 },
    ],
    air: [[13, 9], [24.5, 14]],
    specials: [],
    hurry: 42,
    boss: false,
  },

  // ---- Round 19: Frost Star (Crystal Caves) ----------------------------------------------------
  // pictogram: an eight-armed snowflake built from ice beads - open on all sides, hop from bead to bead
  {
    name: 'Frost Star',
    map: [
      '################################',  // row 0
      '##............................##',
      '##.....##......##......##.....##',
      '##.....##......##......##.....##',
      '##............................##',
      '##............................##',  // row 5
      '##.........##..##..##.........##',
      '##.........##..##..##.........##',
      '##............................##',
      '##............................##',
      '##....##.##.##....##.##.##....##',  // row 10
      '##....##.##.##....##.##.##....##',
      '##............................##',
      '##............................##',
      '##.........##..##..##.........##',
      '##.........##..##..##.........##',  // row 15
      '##............................##',
      '##............................##',
      '##.....##......##......##.....##',
      '##.....##......##......##.....##',
      '##............................##',  // row 20
      '##............................##',
      '##.......####......####.......##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 11, r: 4, d: 1 },
      { t: 'crabbit', c: 19, r: 4, d: -1 },
      { t: 'springle', c: 12, r: 8, d: 1 },
      { t: 'nibbler', c: 21, r: 8, d: -1 },
      { t: 'springle', c: 15, r: 12, d: 1 },
      { t: 'glimmer', c: 5, r: 13, d: 1 },
      { t: 'jellop', c: 25, r: 13, d: -1 },
    ],
    air: [[15.5, 5], [22, 13]],
    specials: ['thunder'],
    hurry: 38,
    boss: false,
  },

  // ---- Round 20: Nautilus (Crystal Caves) ------------------------------------------------------
  // pictogram: a nautilus spiral - one long coiled ledge winding to the centre; end-of-caves challenge, 8 enemies
  {
    name: 'Nautilus',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............................##',
      '##............................##',
      '##...........########.........##',
      '##.........####....###........##',  // row 5
      '##........###........##.......##',
      '##........##..........##......##',
      '##.......##...#####...##......##',
      '##.......##..###..##...##.....##',
      '##.......##..##....##..##.....##',  // row 10
      '##.......##..##....##..##.....##',
      '##.......##........##..##.....##',
      '##.......##........##..##.....##',
      '##........##......###..##.....##',
      '##.........##....###...##.....##',  // row 15
      '##..........#######...##......##',
      '##............###....##.......##',
      '##..................###.......##',
      '##................####........##',
      '##...........#######..........##',  // row 20
      '##............###.............##',
      '##......#####......#####......##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 14, r: 2, d: 1 },
      { t: 'crabbit', c: 18, r: 2, d: -1 },
      { t: 'springle', c: 15, r: 6, d: 1 },
      { t: 'nibbler', c: 14, r: 18, d: 1 },
      { t: 'springle', c: 13, r: 14, d: 1 },
      { t: 'glimmer', c: 5, r: 10, d: 1 },
      { t: 'glimmer', c: 26, r: 8, d: -1 },
      { t: 'jellop', c: 12, r: 12, d: 1 },
    ],
    air: [[16.5, 3]],
    specials: [],
    hurry: 45,
    boss: false,
  },

  // ---- Round 21: Volcano (Volcanic Vents) -------------------------------------------------------
  // breather: a hollow volcano - thick basalt slopes around a magma chamber, crater on top
  {
    name: 'Volcano',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............................##',
      '##............................##',
      '##...........##..##...........##',
      '##..........###..###..........##',  // row 5
      '##..........########..........##',
      '##.........##########.........##',
      '##........####....####........##',
      '##........###......###........##',
      '##.......####......####.......##',  // row 10
      '##.......###........###.......##',
      '##......####........####......##',
      '##......###..........###......##',
      '##.....###............###.....##',
      '##....####............####....##',  // row 15
      '##....###..............###....##',
      '##...######################...##',
      '##...######################...##',
      '##............................##',
      '##............................##',  // row 20
      '##............................##',
      '##......#####......#####......##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'springle', c: 13, r: 15, d: 1 },
      { t: 'springle', c: 18, r: 15, d: -1 },
      { t: 'nibbler', c: 12, r: 2, d: 1 },
      { t: 'crabbit', c: 18, r: 2, d: -1 },
      { t: 'glimmer', c: 6, r: 5, d: 1 },
      { t: 'jellop', c: 24, r: 5, d: -1 },
    ],
    air: [[16, 5.5], [13.5, 13]],
    specials: [],
    hurry: 36,
    boss: false,
  },

  // ---- Round 22: Lava Falls (Volcanic Vents) ----------------------------------------------------
  // two aligned lava shafts run through every lane and out the floor gaps: whoever steps off the lane loops back to the top
  {
    name: 'Lava Falls',
    map: [
      '########...##########...########',  // row 0
      '##............................##',
      '##............................##',
      '##......................########',
      '##......................########',
      '########...##########.........##',  // row 5
      '########...##########.........##',
      '##......................########',
      '##......................########',
      '########...##########.........##',
      '########...##########.........##',  // row 10
      '##......................########',
      '##......................########',
      '########...##########.........##',
      '########...##########.........##',
      '##......................########',  // row 15
      '##......................########',
      '########...##########.........##',
      '########...##########.........##',
      '##......................########',
      '##......................########',  // row 20
      '##.........##########.........##',
      '##.........##########.........##',
      '##............................##',
      '##............................##',
      '########...##########...########',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 3, r: 7, d: 1 },
      { t: 'crabbit', c: 14, r: 11, d: -1 },
      { t: 'nibbler', c: 16, r: 3, d: 1 },
      { t: 'springle', c: 25, r: 9, d: -1 },
      { t: 'crabbit', c: 26, r: 5, d: -1 },
      { t: 'glimmer', c: 8, r: 12, d: 1 },
      { t: 'jellop', c: 21, r: 15, d: -1 },
    ],
    air: [[15.5, 8]],
    specials: ['fire'],
    hurry: 42,
    boss: false,
  },

  // ---- Round 23: Trident (Volcanic Vents) -------------------------------------------------------
  // pictogram: Poseidon trident - three barbed prongs climbed like ladders, curved neck, short shaft
  {
    name: 'Trident',
    map: [
      '################################',  // row 0
      '##............................##',
      '##.............##.............##',
      '##.....#......####.....#......##',
      '##....###....######...###.....##',
      '##...#####.....##....#####....##',  // row 5
      '##.....##......##......##.....##',
      '##.....##......##......##.....##',
      '##.....##......##......##.....##',
      '##...######..######..######...##',
      '##.....##......##......##.....##',  // row 10
      '##.....##......##......##.....##',
      '##.....##......##......##.....##',
      '##.....##......##......##.....##',
      '##......##............##......##',
      '##......####........####......##',  // row 15
      '##.......##############.......##',
      '##..........########..........##',
      '##.............##.............##',
      '##.......###...##...###.......##',
      '##.............##.............##',  // row 20
      '##............................##',
      '##......#####......#####......##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 13, r: 14, d: 1 },
      { t: 'crabbit', c: 17, r: 14, d: -1 },
      { t: 'nibbler', c: 5, r: 7, d: 1 },
      { t: 'crabbit', c: 25, r: 7, d: -1 },
      { t: 'springle', c: 17, r: 7, d: -1 },
      { t: 'glimmer', c: 11, r: 5, d: 1 },
      { t: 'jellop', c: 3, r: 12, d: 1 },
    ],
    air: [[11.5, 8], [20.5, 8]],
    specials: [],
    hurry: 42,
    boss: false,
  },

  // ---- Round 24: Pearl Oyster (Volcanic Vents) --------------------------------------------------
  // pictogram: an open oyster - arched upper shell, bowl below, a big pearl in the mouth; thunder bubbles
  {
    name: 'Pearl Oyster',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............................##',
      '##.............###............##',
      '##.........###########........##',
      '##.......###############......##',  // row 5
      '##......##################....##',
      '##.....#######......######....##',
      '##....#####............###....##',
      '##....####...............#....##',
      '##....###.....................##',  // row 10
      '##....###.###.######..........##',
      '##....###.###.######..........##',
      '##....###..........###........##',
      '##....####........#####.......##',
      '##......###.......#####.#.....##',  // row 15
      '##.......######...#######.....##',
      '##........###############.....##',
      '##.........###########........##',
      '##...............##...........##',
      '##............................##',  // row 20
      '##............................##',
      '##.....#####........#####.....##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 15, r: 1, d: 1 },
      { t: 'crabbit', c: 19, r: 2, d: -1 },
      { t: 'nibbler', c: 11, r: 2, d: 1 },
      { t: 'springle', c: 11, r: 14, d: 1 },
      { t: 'crabbit', c: 15, r: 9, d: 1 },
      { t: 'glimmer', c: 16, r: 7, d: 1 },
      { t: 'jellop', c: 24, r: 10, d: -1 },
    ],
    air: [[12, 9], [21.5, 10]],
    specials: ['thunder'],
    hurry: 40,
    boss: false,
  },

  // ---- Round 25: Axolotl Face (Volcanic Vents) --------------------------------------------------
  // pictogram: the heroes' own smile - round face, three gill frills per side, big eyes and a grin to walk on
  {
    name: 'Axolotl Face',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............................##',
      '##............................##',
      '##............####............##',
      '##.........##########.........##',  // row 5
      '##........####....####........##',
      '##...##..###........###..##...##',
      '##....#####..........#####....##',
      '##.....###.###....###.###.....##',
      '##......##.###....###.##......##',  // row 10
      '##......##.###....###.##......##',
      '##...#####............#####...##',
      '##......##............##......##',
      '##......##.##......##.##......##',
      '##......###.##....##.###......##',  // row 15
      '##.....#####.######.#####.....##',
      '##...###..####....####..###...##',
      '##.........##########.........##',
      '##............####............##',
      '##............................##',  // row 20
      '##............................##',
      '##.....#####........#####.....##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 14, r: 2, d: 1 },
      { t: 'crabbit', c: 16, r: 2, d: -1 },
      { t: 'springle', c: 12, r: 7, d: 1 },
      { t: 'springle', c: 18, r: 7, d: -1 },
      { t: 'nibbler', c: 5, r: 5, d: 1 },
      { t: 'nibbler', c: 25, r: 5, d: -1 },
      { t: 'glimmer', c: 14, r: 12, d: 1 },
      { t: 'jellop', c: 3, r: 3, d: 1 },
    ],
    air: [[16, 12.5]],
    specials: ['water'],
    hurry: 40,
    boss: false,
  },

  // ---- Round 26: Temple Facade (Abyss Temple) -------------------------------------------------
  // breather: a temple front - pediment roof, four storeys of slabs; storeys alternate between pillared cells and open galleries
  {
    name: 'Temple Facade',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............................##',
      '##...........######...........##',
      '##........############........##',
      '##............................##',  // row 5
      '##....####################....##',
      '##........##...##...##........##',
      '##........##...##...##........##',
      '##........##...##...##........##',
      '##....####################....##',  // row 10
      '##............................##',
      '##............................##',
      '##............................##',
      '##....####################....##',
      '##.......##..........##.......##',  // row 15
      '##.......##..........##.......##',
      '##.......##..........##.......##',
      '##....####################....##',
      '##..........##....##..........##',
      '##..........##....##..........##',  // row 20
      '##..........##....##..........##',
      '##......################......##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 12, r: 8, d: 1 },
      { t: 'crabbit', c: 6, r: 12, d: 1 },
      { t: 'nibbler', c: 22, r: 12, d: -1 },
      { t: 'springle', c: 14, r: 16, d: 1 },
      { t: 'glimmer', c: 3, r: 2, d: 1 },
      { t: 'jellop', c: 26, r: 2, d: -1 },
    ],
    air: [[14, 9], [9, 12.5]],
    specials: [],
    hurry: 38,
    boss: false,
  },

  // ---- Round 27: Ziggurat (Abyss Temple) ------------------------------------------------------
  // pictogram: a stepped pyramid with a raised base you can walk under and a shrine on top; water bubbles flow down the steps
  {
    name: 'Ziggurat',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............................##',
      '##............................##',
      '##............................##',
      '##............####............##',  // row 5
      '##............#..#............##',
      '##............#..#............##',
      '##............####............##',
      '##...........######...........##',
      '##...........######...........##',  // row 10
      '##...........######...........##',
      '##...........######...........##',
      '##.........##########.........##',
      '##.........##########.........##',
      '##.........##########.........##',  // row 15
      '##.........##########.........##',
      '##.......##############.......##',
      '##.......##############.......##',
      '##.......##############.......##',
      '##.......##############.......##',  // row 20
      '##.....##################.....##',
      '##............................##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 14, r: 3, d: 1 },
      { t: 'crabbit', c: 16, r: 3, d: -1 },
      { t: 'springle', c: 11, r: 11, d: 1 },
      { t: 'springle', c: 19, r: 11, d: -1 },
      { t: 'glimmer', c: 4, r: 6, d: 1 },
      { t: 'glimmer', c: 26, r: 8, d: -1 },
      { t: 'jellop', c: 6, r: 12, d: 1 },
    ],
    air: [[15.5, 3], [12.5, 8], [19.5, 8]],
    specials: ['water'],
    hurry: 38,
    boss: false,
  },

  // ---- Round 28: Abyssal Eye (Abyss Temple) ---------------------------------------------------
  // pictogram: an almond eye - upper and lower lid arcs, ringed iris and pupil, lashes on the slopes
  {
    name: 'Abyssal Eye',
    map: [
      '################################',  // row 0
      '##............................##',
      '##............................##',
      '##............................##',
      '##....#......######......#....##',
      '##....##...##########...##....##',  // row 5
      '##.....#..###......###..#.....##',
      '##.....####..######..####.....##',
      '##.....###..########..###.....##',
      '##.....##..###....###..##.....##',
      '##....##...##..##..##...##....##',  // row 10
      '##...###..###.####.###..###...##',
      '##...##...###.####.###...##...##',
      '##...###...##.####.##...###...##',
      '##....##...##..##..##...##....##',
      '##.....##..####..####..##.....##',  // row 15
      '##.....###..########..###.....##',
      '##.......###..####..###.......##',
      '#####.....####....####.....#####',
      '#####......##########......#####',
      '##............####............##',  // row 20
      '##............................##',
      '##.....#####........#####.....##',
      '##............................##',
      '##............................##',
      '################################',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 12, r: 2, d: 1 },
      { t: 'crabbit', c: 18, r: 2, d: -1 },
      { t: 'springle', c: 21, r: 14, d: -1 },
      { t: 'nibbler', c: 9, r: 14, d: 1 },
      { t: 'glimmer', c: 5, r: 2, d: 1 },
      { t: 'glimmer', c: 21, r: 2, d: -1 },
      { t: 'jellop', c: 22, r: 10, d: -1 },
    ],
    air: [[16, 2.5], [9, 13]],
    specials: [],
    hurry: 36,
    boss: false,
  },

  // ---- Round 29: The Crown (Abyss Temple) -----------------------------------------------------
  // pictogram: the Kraken King's crown - three points and a jewelled band; its body is 6+ rows above the floor, so ride the centre floor gap (or bounce on bubbles) to the top
  {
    name: 'The Crown',
    map: [
      '##############....##############',  // row 0
      '##............................##',
      '##............................##',
      '##............................##',
      '##.............##.............##',
      '##............####............##',  // row 5
      '##....##......####......##....##',
      '##...####....######....####...##',
      '##..#####....######....#####..##',
      '##..######..########..######..##',
      '##..#######.########.#######..##',  // row 10
      '##..########################..##',
      '##..########################..##',
      '##..########################..##',
      '##..########################..##',
      '##..##....####....####....##..##',  // row 15
      '##..########################..##',
      '##..########################..##',
      '##..########################..##',
      '##............................##',
      '##............................##',  // row 20
      '##............................##',
      '##............................##',
      '##............................##',
      '##............................##',
      '##############....##############',  // row 25
    ],
    enemies: [
      { t: 'nibbler', c: 15, r: 2, d: 1 },
      { t: 'crabbit', c: 6, r: 4, d: 1 },
      { t: 'crabbit', c: 24, r: 4, d: -1 },
      { t: 'springle', c: 12, r: 5, d: 1 },
      { t: 'springle', c: 18, r: 5, d: -1 },
      { t: 'glimmer', c: 4, r: 2, d: 1 },
      { t: 'glimmer', c: 26, r: 2, d: -1 },
      { t: 'jellop', c: 10, r: 3, d: 1 },
    ],
    air: [[5.5, 4], [15.5, 2.5], [26, 4]],
    specials: ['fire', 'thunder'],
    hurry: 36,
    boss: false,
  },

  // ---- Round 30: Kraken King (Abyss Temple) ---------------------------------------------------
  // boss arena: wide open water (the 6x6 Kraken starts top centre), two floor gaps that spit thunder bubbles, platforms at three heights to dodge ink
  {
    name: 'Kraken King',
    map: [
      '###########...####...###########',  // row 0
      '##............................##',
      '##............................##',
      '##............................##',
      '##............................##',
      '##............................##',  // row 5
      '##............................##',
      '##............................##',
      '##............................##',
      '#######.......................##',
      '#######.......................##',  // row 10
      '##............................##',
      '##............................##',
      '##......#####......#####......##',
      '##......#####......#####......##',
      '##............................##',  // row 15
      '##............................##',
      '##.######....######....######.##',
      '##.######....######....######.##',
      '##............................##',
      '##............................##',  // row 20
      '##.....#####........#####.....##',
      '##.....#####........#####.....##',
      '##............................##',
      '##............................##',
      '###########...####...###########',  // row 25
    ],
    enemies: [
      { t: 'kraken', c: 14, r: 4, d: -1 },
    ],
    air: [[6, 14], [21.5, 10]],
    specials: ['thunder'],
    hurry: 150,
    boss: true,
  },
];


/* ===== 40_game.js ===== */
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
 *  - V3 wave (FIXPLAN_V3 "Game"; everything below is cosmetic, mechanics are bit-identical: test/game_equiv.mjs):
 *      G1  boss ink telegraph = a smooth glow RAMP over the 22 wind-up frames (kraken_angry crossfading in, an amber glow heating towards white-hot), a 16-frame fade after
 *          the volley: one slow swell per 2 s instead of the 10 Hz white flip-flop (reducedMotion: the steady 0.3 white as before).
 *      G2  shockwave rings are ONE blit of GFX.particle('ring'); a ring whose sprite would exceed RING_SPRITE_PX (the boss / bomb / thunder giants) is two source-over strokes;
 *          kill rings share one white hue (small particle cache); at most RING_CAP rings are drawn per frame.
 *      G3  nothing blinks: invulnerability = alpha pulse 0.4..1.0 at 4 Hz (reducedMotion: steady 0.6), HURRY UP! fades in / pulses at 2 Hz / fades out, READY! pulses,
 *          EXTEND! colour crossfades every 24 frames, special / letter expiry pulses at 2.5 Hz, bubble_warn flickers at 3 Hz, flames die down smoothly, the last second of a
 *          freeze THAWS in a gentle pulse, trap stages get smooth shimmer / pulse waves on top of the cast's shape cues (C2).
 *      G4  trails restart on teleports (respawn, bubble release, floor-gap wrap, watchdog relocation, round start) and whenever an entity was not sampled in the previous frame.
 *      G5  the round change scrolls with a FRACTIONAL offset (no whole-pixel stepping); leftover items / bubbles / popups / effects fade over FADE_FRAMES (S.fade, cosmetic)
 *          instead of vanishing, the plankton keeps drifting and crossfades from the old round's colours to the new one's, glints and the last effects play out.
 *      G6  the join hint shows only while Game.join can succeed.   G7  no per-frame allocation in the update paths (hyp(), hitP / hitF, indexed loops), scratch GFX draw
 *          options, sprite-name tables, cached gradients / strings / colour tables (the remaining render garbage is boxed numbers crossing into GFX).
 *      G8  the missing EXTEND letters are >= 3:1 against every wall; the round counter reads "R01" (labelled, inset, in the ceiling row, clear of the playfield).
 *      V1  frozen enemies draw the cast's <e>_frozen ice cast (plain, frames 0..3 = twinkles) when GFX.has it, else the old tint recipe; V2 the HUD band is the round's own
 *          water (the backdrop's top rows mirrored up from the seam) under a soft veil, not a flat strip; V6 chain / bomb light: a few small pools + the wash in the CHAIN
 *          OWNER's colour, additive fill area capped per frame (LIGHT_CAP, newest particles win), POOL_MAX live pools.
 *  - Debug extras (non-contract): debug._S(), skipIntro(), clearEnemies(), noClear(on), setPlayer(),
 *    setHurryTimer(), give(), addScore(). `spawn` also accepts 'bonefin', 'kraken', 'letter', 'food_N',
 *    'pu_xxx' (or just 'shoes'...), 'moonpearl'.
 *  - Game.start({joinHint}) = text blinked in the 2UP slot of 1P games (default 'PUSH Q'; '' hides it).
 *
 * Sprites used: p1_/p2_ idle walk jump fall shoot die stun icon; bubble_shot bubble bubble_warn
 * bubble_pop trap_overlay bubble_thunder bubble_fire bubble_water bubble_letter; <e>_move <e>_angry
 * <e>_trapped <e>_die for nibbler crabbit jellop springle glimmer (+ <e>_frozen when GFX.has it); crabbit_throw springle_squash
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
  // v3 presentation (FIXPLAN_V3 Game; cosmetic only)
  const LIGHT_CAP = 36000, POOL_MAX = 2;             // V6: light budget = additive FILL AREA of the cosmetic particles per frame (logical px^2, ~ 2/3 of the playfield) and number of live chain pools
  const RING_CAP = 12;                               // G2: shockwave rings drawn per frame (the newest = brightest ones win)
  const RING_SPRITE_PX = 300;                        // G2: a ring whose baked sprite would be wider than this many device px (software-raster 'lighter' blit cliff, big cache entries) is stroked instead
  const INK_FADE = 16;                               // G1: frames the ink glow takes to fade out after the volley
  const THAW_FRAMES = 60;                            // G3: the last second of a freeze thaws in a gentle pulse
  const FADE_FRAMES = 14;                            // G5: leftovers (items, bubbles, popups, specks) fade over this many frames when a round change starts
  const TRAIL_JUMP = 20;                             // G4: a position jump of more than this many px in one frame is a teleport: the trail restarts

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
  /** Math.hypot(a, b) without the rest-args allocation (G7): V8's own algorithm for two arguments (scale by the larger one, compensated sum), so the
   *  result is bit-identical to Math.hypot and every distance test of the mechanics stays exactly as before (test/game_equiv.mjs proves it). */
  function hyp(a, b) {
    if (a < 0) a = -a;
    if (b < 0) b = -b;
    const m = a > b ? a : b;
    if (m === 0) return 0;
    if (m === Infinity || m !== m) return Math.hypot(a, b);
    const n0 = a / m, n1 = b / m, s0 = n0 * n0, c = (s0 - 0) - s0;
    return Math.sqrt(s0 + (n1 * n1 - c)) * m;
  }

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
    if (e.y > SCREEN_H) { e.y -= SCREEN_H; trailClear(e); }   // fell out of a floor gap: re-enter from the top (G4: the trail does not follow the wrap)
  }

  // Hit tests (G7: allocation-free, called per entity per frame): the 12x14 body box of a player / the 12x12 body (36x36 for the Kraken) of a foe against an x, y, w, h rectangle
  const hitP = (p, x, y, w, h) => U.overlap(p.x + BODY_X, p.y + BODY_Y, BODY_W, BODY_H, x, y, w, h);
  const hitF = (e, x, y, w, h) => (e.t === 'kraken' ? U.overlap(e.x + 6, e.y + 6, 36, 36, x, y, w, h) : U.overlap(e.x + 2, e.y + 2, 12, 12, x, y, w, h));

  function nearestPlayer(cx, cy) {
    let best = null, bd = Infinity;
    const L = S.players;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      if (p.state !== 'normal') continue;
      const d = hyp(p.x + 8 - cx, p.y + 8 - cy);
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
  /** A soft additive light pool (chain light) that swells and fades. lt = 1 marks it as a pool (counted by poolCount, capped in drawParts). */
  function pool(x, y, col, size, dur, a) {
    addPart({ k: 'dot', x, y, vx: 0, vy: 0, g: 0, dur, s0: size, s1: size * 1.25, col, a, rot: 0, lt: 1 });
  }
  function poolCount() { let n = 0; const L = S.parts; for (let i = 0; i < L.length; i++) if (L[i].lt === 1) n++; return n; }
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
  /** Chain light (V6): ONE hue for the whole chain, the OWNER's colour (the old pools took the colour of every enemy that died: a multicoloured mess in a bomb chain).
   *  A small soft pool at every third kill from the third on (never more than POOL_MAX alive, none at quality 0) + the faint full-screen wash in the same colour
   *  (<= 12 %, rate-limited by flash()). The total additive light of everything on screen is capped in drawParts (LIGHT_CAP). */
  function chainLight(x, y, col, n) {
    if (n >= 3 && n % 3 === 0 && OPT.quality >= 1 && poolCount() < POOL_MAX) pool(x, y, col, 1.4 + Math.min(n, 9) * 0.1, 12, 0.13);
    flash(10, 0.04 + 0.01 * n, col);
  }
  function killFx(e, k, owner) {
    if (!S) return;
    const x = e.x + 8, y = e.y + 8, hue = e.angry ? HUE.crimson : (ENEMY_HUE[e.t] || HUE.white);
    ring(x, y, HUE.white, 5, 21, 16, 0.8);                 // one white-hot ring colour for every kill (the sprite cache holds one size ladder instead of six); the enemy's hue is in the burst
    burst(x, y, hue, 8 + Math.min(k, 4) * 2, 2.1, { size: 1.6, life: 34 });
    if (k >= 2) chainLight(x, y, PLAYER_COLOR[owner] || hue, k + 1);
  }
  const itemHue = (kind) => (kind.startsWith('pu_') ? PU_HUE[kind.slice(3)] || HUE.cyan : kind === 'moonpearl' ? HUE.white : FOOD_HUE[+kind.slice(5)] || HUE.amber);

  // trail ring buffers: positions of a moving entity, one sample per update frame (WeakMap: cosmetic, entities stay plain objects)
  const TRAILS = new WeakMap();
  /** G4: a trail only follows the REAL path of the last few frames. It restarts (n = 0) whenever the entity was not sampled in the previous frame (dying, trapped in a
   *  bubble, carried, a round transition ...: respawn and bubble release come back this way) or jumped more than TRAIL_JUMP px in one frame (floor-gap wrap, watchdog
   *  relocation, spawn pad). trailClear(e) is the explicit form (respawn / release / round start call it too). */
  function trailPush(e) {
    let t = TRAILS.get(e);
    if (!t) { t = { b: new Float32Array(2 * TRAIL_N), h: 0, n: 0, f: -9 }; TRAILS.set(e, t); }
    if (t.n > 0) {
      const dx = e.x - t.b[2 * t.h], dy = e.y - t.b[2 * t.h + 1];
      if (t.f !== S.frame - 1 || dx > TRAIL_JUMP || dx < -TRAIL_JUMP || dy > TRAIL_JUMP || dy < -TRAIL_JUMP) t.n = 0;
    }
    t.f = S.frame;
    t.h = (t.h + 1) % TRAIL_N; t.b[2 * t.h] = e.x; t.b[2 * t.h + 1] = e.y;
    if (t.n < TRAIL_N) t.n++;
  }
  function trailClear(e) { const t = TRAILS.get(e); if (t) t.n = 0; }
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
    const P = S.players, E = S.enemies;
    for (let i = 0; i < P.length; i++) if (P[i].state === 'normal') trailPush(P[i]);
    for (let i = 0; i < E.length; i++) { const e = E[i]; if (!e.dead && e.t !== 'kraken' && (e.state === 'active' || e.state === 'dying')) trailPush(e); }
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
      bubble: null, hp: big ? S.bossMax : 0, flashT: 0, inkT: BOSS_INK_PERIOD, relT: 99, dead: false, stream: null,
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
    S.skipTo = 0; S.tr = null; S.fade = null; S.clearT = 0; S.idleT = 0;
    if (S.pendingJoin) { S.pendingJoin = false; addPlayer2(); }
    for (const p of S.players) {
      // a player who lost the last life and is still in the death animation is out, not revived (M8/M14)
      if (p.state === 'out' || (p.state === 'dying' && p.lives <= 0)) { p.state = 'out'; continue; }
      p.state = 'normal'; p.x = SPAWN_X[p.i]; p.y = SPAWN_Y; p.vx = 0; p.vy = 0; p.onGround = true;
      p.face = p.i === 0 ? 1 : -1; p.stunT = 0; p.cooldown = 0; p.shootT = 0; p.jumpBuf = 0; p.fireBuf = 0; p.coyote = -1;
      trailClear(p);
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
    trailClear(p);                                                       // G4: no afterimage at the spot where the player died
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
    const L = S.enemies;
    for (let i = 0; i < L.length; i++) {
      const e = L[i];
      if (e.dead || e.t === 'kraken') continue;
      if (e.state !== 'active' && e.state !== 'frozen') continue;
      if (hitF(e, b.x + 1, b.y + 1, 14, 14)) return e;
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
      trailClear(e);                                                     // G4: its old trail is where it was trapped, 150+ frames ago
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
        const d = hyp(dx, dy);
        if (d >= PUSH_DIST) continue;
        if (d < 0.01) { dx = (i + j) % 2 ? 1 : -1; dy = 0; } else { dx /= d; dy /= d; }
        const push = Math.min(PUSH_MAX, (PUSH_DIST - d) * 0.25 + 0.02);   // soft near PUSH_DIST, strong when really overlapping
        const both = settled(a) && settled(b), wx = both ? 2 : 1, wy = both ? 0.75 : 1;
        a.x -= dx * push * wx; a.y -= dy * push * wy; b.x += dx * push * wx; b.y += dy * push * wy;
      }
    }
    for (let i = 0; i < L.length; i++) {
      const b = L[i];
      if (b.dead || b.state !== 'float') continue;
      b.x = U.clamp(b.x, C.INNER_L, C.INNER_R - 16);
      b.y = Math.max(PLAY_TOP, b.y);
    }
  }

  function playerBubbleContacts() {
    const PL = S.players, BL = S.bubbles;
    for (let pi = 0; pi < PL.length; pi++) {
      const p = PL[pi];
      if (p.state !== 'normal') continue;
      for (let bi = 0; bi < BL.length; bi++) {
        const b = BL[bi];
        if (b.dead || b.state !== 'float') continue;
        const touching = hitP(p, b.x + 2, b.y + 2, 12, 12);
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
    for (let i = 0; i < S.bubbles.length; i++) { const b = S.bubbles[i]; if (!b.dead && b.enemy && b.enemy.state === 'trapped') { b.enemy.x = b.x; b.enemy.y = b.y; } }
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
    for (let i = 0; i < S.bubbles.length; i++) {
      const o = S.bubbles[i];
      if (o.dead || o === b || o.state !== 'float' || o.popAt || o.age < o.chainImmune) continue;
      if (hyp(o.x - b.x, o.y - b.y) <= CHAIN_DIST) { o.popAt = S.frame + CHAIN_DELAY; o.chain = chain; }
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
    killFx(e, k, chain.owner);
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
      for (let k = 0; k < S.enemies.length; k++) {
        const e = S.enemies[k];
        if (e.dead) continue;
        if (e.t === 'kraken') {
          if (e.state === 'active' && !bo.hitBoss && hitF(e, bo.x, bo.y, 16, 8)) { bo.hitBoss = true; damageBoss(e, bo.owner); }
        } else if ((e.state === 'active' || e.state === 'frozen') && hitF(e, bo.x, bo.y, 16, 8)) killEnemy(e, bo.chain);
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
      for (let k = 0; k < S.enemies.length; k++) {
        const e = S.enemies[k];
        if (!e.dead && e.t !== 'kraken' && (e.state === 'active' || e.state === 'frozen') && hitF(e, f.x + 1, f.y + 2, 6, 14)) killEnemy(e, f.chain);
      }
      for (let k = 0; k < S.players.length; k++) {
        const p = S.players[k];
        if (p.state === 'normal' && p.stunT === 0 && p.flameImmune === 0 && hitP(p, f.x + 1, f.y + 2, 6, 14)) {
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
      for (let k = 0; k < S.enemies.length; k++) {
        const e = S.enemies[k];
        if (!e.dead && e.t !== 'kraken' && (e.state === 'active' || e.state === 'frozen') && hitF(e, s.x - 1, s.y - 1, 10, 10)) {
          e.state = 'carried'; e.stream = s; s.carried.push(e);
        }
      }
      for (let k = 0; k < s.carried.length; k++) { const e = s.carried[k]; e.x = U.clamp(s.x - 4 + (k % 2) * 2, C.INNER_L, C.INNER_R - 16); e.y = s.y - 8 - (k % 3); }
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
    for (let i = 0; i < S.enemies.length; i++) {
      const e = S.enemies[i];
      if (e.dead || e.state !== 'active') continue;
      for (let k = 0; k < S.players.length; k++) { const p = S.players[k]; if (p.state === 'normal' && hitF(e, p.x + BODY_X, p.y + BODY_Y, BODY_W, BODY_H)) killPlayer(p); }
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
        if (p.state === 'normal') return hyp(p.x - sp.x, p.y - sp.y) < 64;
        return p.state === 'dying' && p.lives > 0 && hyp(SPAWN_X[p.i] - sp.x, SPAWN_Y - sp.y) < 64;
      })) continue;
      if (S.enemies.some((o) => o !== e && !o.dead && (o.state === 'active' || o.state === 'frozen') && Math.abs(o.x - sp.x) < 16 && Math.abs(o.y - sp.y) < 16)) continue;
      poof(e.x, e.y);
      e.x = sp.x; e.y = sp.y; e.vx = 0; e.vy = 0; e.onGround = false; resetWatch(e); e.passT = 0;
      trailClear(e);
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
      const dx = t.x - g.x, dy = t.y - g.y, d = hyp(dx, dy) || 1;
      g.vx = (dx / d) * GHOST_SPEED; g.vy = (dy / d) * GHOST_SPEED;
    } else { g.vx = 0; g.vy = 0; }
    g.x += g.vx; g.y += g.vy;
    for (let k = 0; k < S.players.length; k++) { const p = S.players[k]; if (p.state === 'normal' && hitP(p, g.x + 3, g.y + 3, 10, 10) && killPlayer(p)) break; }
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
      for (let k = 0; k < S.players.length; k++) { const p = S.players[k]; if (p.state === 'normal' && hitP(p, q.x + 1, q.y + 1, 6, 6) && killPlayer(p)) { q.dead = true; break; } }
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
    if (e.relT < 99) e.relT++;                                       // cosmetic: frames since the volley (the ink glow fades out over INK_FADE frames, G1)
    if (--e.inkT <= 0) { e.inkT = BOSS_INK_PERIOD; e.relT = 0; fireInk(e); }     // the last INK_WIND frames before this are the telegraph
  }

  const inkWinding = (e) => e.inkT > 0 && e.inkT <= INK_WIND;

  /** 4-bullet fan with no bullet aimed at the centre (so standing still is survivable beyond arm's reach);
   *  with a player within INK_NEAR px only the two outer bullets fly, the body is the threat there. */
  function fireInk(e) {
    const cx = e.x + 24, cy = e.y + 24;
    const t = nearestPlayer(cx, cy);
    const base = t ? Math.atan2(t.y + 8 - cy, t.x + 8 - cx) : Math.PI / 2;
    const near = !!t && hyp(t.x + 8 - cx, t.y + 8 - cy) <= INK_NEAR;
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
    for (let k = 0; k < S.players.length; k++) {
      const p = S.players[k];
      if (p.state === 'normal' && hitP(p, bb.x + 6, bb.y + 6, 52, 52)) { popBossBubble(bb); break; }
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
      if (S.players.every((p) => p.state !== 'normal' || hyp(p.x - s.x, p.y - s.y) >= PU_AVOID)) spot = s;
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
      const o = pearl ? 4 : 2, w = pearl ? 24 : 12;
      for (let k = 0; k < S.players.length; k++) {
        const p = S.players[k];
        if (p.state === 'normal' && hitP(p, it.x + o, it.y + o, w, w)) { collectItem(it, p); break; }
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
    flash(14, FLASH_MAX, PLAYER_COLOR[p.i]);                     // V6: the bomb's wash is in the owner's colour too
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
    // G5 (cosmetic): the leftovers are kept as a fade list instead of vanishing in one frame (the arrays themselves are emptied as before)
    S.fade = { t: 0, items: S.items, bubbles: S.bubbles, popups: S.popups, fx: S.fx, ghost: S.ghost };
    S.bubbles = []; S.items = []; S.proj = []; S.bolts = []; S.drops = []; S.flames = []; S.streams = [];
    S.popups = []; S.enemies = []; S.fx = []; S.bossBubble = null;
    resetHurry();
  }
  /** Ages the fade list (items, bubbles, popups, effects of the round that just ended) for the round change; gone after FADE_FRAMES. */
  function updateFade() {
    const F = S.fade;
    if (!F) return;
    if (++F.t >= FADE_FRAMES) { S.fade = null; return; }
    for (let i = 0; i < F.fx.length; i++) { const f = F.fx[i]; f.t++; f.x += f.vx; f.y += f.vy; f.vy += f.g; }
    for (let i = 0; i < F.popups.length; i++) { const q = F.popups[i]; q.t++; q.y -= 0.5; }
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
    updateFade();
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
    const FXL = S.fx;
    for (let i = 0; i < FXL.length; i++) {
      const f = FXL[i];
      f.t++; f.x += f.vx; f.y += f.vy; f.vy += f.g;
      if (f.t >= f.dur) f.dead = true;
    }
    const PQ = S.popups;
    for (let i = 0; i < PQ.length; i++) { const q = PQ[i]; q.t++; q.y -= 0.5; }
    let j = 0;
    for (let i = 0; i < PQ.length; i++) if (PQ[i].t < 40) PQ[j++] = PQ[i];
    PQ.length = j;
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
    for (let i = 0; i < S.players.length; i++) { const p = S.players[i]; updatePlayer(p, ins[p.i] || NO_INPUT); }
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

  const INS = [NO_INPUT, NO_INPUT];
  function update(inputs) {
    if (!S || S.over) return;
    const ins = INS;
    ins[0] = (inputs && inputs[0]) || NO_INPUT; ins[1] = (inputs && inputs[1]) || NO_INPUT;      // G7: one scratch array, no allocation per frame
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
  const RSTAT = { ghosts: 0, ambient: 0, motes: 0, parts: 0, calls: 0, rings: 0, light: 0 };          // what the last render() drew (debug.fxStats)
  let RK = 1;                                                                     // device px per logical px of the current frame (ctx transform, read once per render)
  /** Smooth 0..1 wave with `period` frames per cycle (a cosine: no hard edge anywhere). */
  const wave = (f, period) => 0.5 + 0.5 * Math.cos(f * TAU / period);
  const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
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

  /** Soft dark pool (radial, feathered): keeps HUD glyphs legible on bright wall looks without an opaque plate. The gradient is built ONCE per alpha at unit radius
   *  (G7: a new CanvasGradient per pool per frame was a steady garbage source) and scaled to rx x ry by the transform. */
  const SOFT_G = new Map();
  function softDark(ctx, cx, cy, rx, ry, a) {
    const key = Math.round(a * 1000);
    let g = SOFT_G.get(key);
    if (!g) {
      g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, 'rgba(2,4,10,' + a + ')'); g.addColorStop(0.62, 'rgba(2,4,10,' + (a * 0.72).toFixed(3) + ')'); g.addColorStop(1, 'rgba(2,4,10,0)');
      SOFT_G.set(key, g);
    }
    ctx.save(); ctx.translate(cx, cy); ctx.scale(rx, ry);
    ctx.fillStyle = g; ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }

  /** Dark translucent band across the whole canvas width with feathered top / bottom edges (no opaque rectangle) behind a centred
   *  banner; optional accent hairlines fading out toward the sides. Gradients are cached (G7). */
  const BAND_G = new Map(), BAND_HL = new Map();
  function band(ctx, y0, y1, accent, a, feather) {
    a = a === undefined ? 0.74 : a;
    const f = feather === undefined ? 8 : feather, h = y1 - y0 + 2 * f;
    const key = ((y0 * 512 + y1) * 64 + f) * 128 + Math.round(a * 100);
    let g = BAND_G.get(key);
    if (!g) {
      const s = f / h;
      g = ctx.createLinearGradient(0, y0 - f, 0, y1 + f);
      g.addColorStop(0, 'rgba(2,5,12,0)'); g.addColorStop(s, 'rgba(2,5,12,' + a + ')'); g.addColorStop(1 - s, 'rgba(2,5,12,' + a + ')'); g.addColorStop(1, 'rgba(2,5,12,0)');
      BAND_G.set(key, g);
    }
    ctx.fillStyle = g; ctx.fillRect(0, y0 - f, C.W, h);
    if (accent) {
      let hl = BAND_HL.get(accent);
      if (!hl) {
        hl = ctx.createLinearGradient(0, 0, C.W, 0);
        hl.addColorStop(0, rgba(accent, 0)); hl.addColorStop(0.18, rgba(accent, 0.55)); hl.addColorStop(0.5, rgba(accent, 0.8)); hl.addColorStop(0.82, rgba(accent, 0.55)); hl.addColorStop(1, rgba(accent, 0));
        BAND_HL.set(accent, hl);
      }
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
  const AMB_COLS = [];                                                      // per round index: the six speck colours (G7: built once, not per frame)
  function ambientColors(level) {
    let c = AMB_COLS[level];
    if (!c) {
      const th = typeof GFX.theme === 'function' ? GFX.theme(level) : null;
      c = th ? [th.glow || HUE.cyan, '#bfe8ff', th.accent || HUE.cyan, th.glow || HUE.cyan, '#d9f4ff', th.accent2 || HUE.violet] : [HUE.cyan, '#bfe8ff', HUE.cyan, HUE.cyan, '#d9f4ff', HUE.violet];
      AMB_COLS[level] = c;
    }
    return c;
  }
  /** `wgt` = overall weight 0..1 (a round change crossfades the old and the new round's specks, G5). */
  function drawAmbient(ctx, level, wgt) {
    const n = AMBIENT_N[OPT.quality] >> (OPT.reducedMotion ? 1 : 0), f = S.frame;
    RSTAT.ambient = n;
    const cols = ambientColors(level);
    const plain = OPT.quality < 1;                                          // quality 0: plain additive specks instead of cached glow dots
    const go = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
    if (plain) ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const a = AMB[i];
      const x = C.INNER_L + (((a.x + f * a.dx + Math.sin(f * a.w + a.ph) * 4) % 224) + 224) % 224;
      const y = MAP_Y + (((a.y - f * a.vy) % MAP_H) + MAP_H) % MAP_H;
      const al = 0.14 + 0.32 * (0.5 + 0.5 * Math.sin(f * 0.035 + a.ph * 3));
      if (plain) { ctx.fillStyle = cols[a.c]; ctx.globalAlpha = ga * wgt * al * 0.8; ctx.fillRect(x - 0.45, y - 0.45, 0.9, 0.9); }
      else if (wgt === 1) P(ctx, 'dot', x, y, a.sz, cols[a.c], al);
      else { ctx.globalAlpha = ga * wgt; P(ctx, 'dot', x, y, a.sz, cols[a.c], al); }
    }
    if (plain) ctx.globalCompositeOperation = go;
    ctx.globalAlpha = ga;
  }
  /** Slow light motes orbiting floating bubbles. */
  function drawMotes(ctx) {
    RSTAT.motes = 0;
    if (OPT.quality < 1) return;
    const cap = MOTE_MAX >> (OPT.reducedMotion ? 1 : 0);
    let n = 0;
    for (let i = 0; i < S.bubbles.length; i++) {
      const b = S.bubbles[i];
      if (b.dead || b.state === 'shot') continue;
      if (n++ >= cap) break;
      RSTAT.motes = n;
      const a = b.age * 0.035 + n * 2.1, r = 9.5 + 1.5 * Math.sin(b.age * 0.05 + n);
      P(ctx, 'dot', b.x + 8 + Math.cos(a) * r, b.y + 8 + Math.sin(a) * r * 0.85, 0.6, bubbleHue(b), 0.5);
    }
  }
  /** Shockwave ring (G2): ONE blit of the baked GFX ring particle (it was 3 stroked passes in 'lighter'). The decision is made per RING from its largest radius (so a ring never
   *  changes style while it expands): a ring whose sprite would exceed RING_SPRITE_PX device px (the boss / bomb / thunder giants at the common scales) is two cheap
   *  source-over strokes instead - on a software raster that is the cheaper path there (a 340 px ring blit costs 5x a 290 px one) and it keeps the particle cache small. */
  const ringIsSprite = (p) => (p.s1 > p.s0 ? p.s1 : p.s0) * 3.5 * RK <= RING_SPRITE_PX;
  function shockRing(ctx, x, y, r, col, a, sprite) {
    if (sprite) { P(ctx, 'ring', x, y, r, col, a); return; }
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    ctx.lineWidth = 3; ctx.strokeStyle = rgba(col, (0.2 * a).toFixed(3)); ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(240,250,255,' + (0.55 * a).toFixed(3) + ')'; ctx.stroke();
  }
  /** Additive fill area (logical px^2) of one particle: the bounding box its baked sprite is blitted with. This is what a 'lighter' blit costs (and what lights the water),
   *  so it is the unit of the LIGHT budget. Rings too big for the sprite ladder are thin strokes: no area. */
  function partArea(p, u) {
    const s = p.s0 + (p.s1 - p.s0) * u;
    switch (p.k) {
      case 'ring': { if (!ringIsSprite(p)) return 0; const d = 3.5 * s; return d * d; }
      case 'dot': { const d = 8.8 * s; return d * d; }
      case 'spark': { const d = 5.2 * s; return d * d; }
      default: return 1.24 * s * 0.62 * s;
    }
  }
  const VIS = new Uint8Array(512);
  function drawParts(ctx) {
    const L = S.parts, n = L.length;
    RSTAT.parts = n;
    // V6 light budget: the additive fill area of everything drawn this frame is capped (a bomb / long chain must not white the water out or stall a CPU raster): walking from
    // the NEWEST (brightest) particle back, a particle is kept while the budget lasts. G2: at most RING_CAP rings, the oldest give way.
    let area = 0, rings = 0;
    for (let i = n - 1; i >= 0; i--) {
      const p = L[i], a = partArea(p, p.t / p.dur);
      if (p.k === 'ring' && rings >= RING_CAP || area + a > LIGHT_CAP) { VIS[i] = 0; continue; }
      VIS[i] = 1; area += a;
      if (p.k === 'ring') rings++;
    }
    RSTAT.light = area; RSTAT.rings = rings;
    for (let i = 0; i < n; i++) {
      if (VIS[i] === 0) continue;
      const p = L[i], u = p.t / p.dur, k = 1 - u;
      switch (p.k) {
        case 'ring': shockRing(ctx, p.x, p.y, p.s0 + (p.s1 - p.s0) * (1 - k * k), p.col, p.a * k * Math.sqrt(k), ringIsSprite(p)); break;
        case 'dot': P(ctx, 'dot', p.x, p.y, p.s0 + (p.s1 - p.s0) * u, p.col, p.a * k); break;
        case 'spark': P(ctx, 'spark', p.x, p.y, p.s0 + (p.s1 - p.s0) * u, p.col, p.a * Math.min(1, k * 2.2) * (0.75 + 0.25 * Math.sin(p.t * 1.9 + p.rot * 5)), p.rot + p.t * 0.12); break;
        default: P(ctx, 'streak', p.x, p.y, p.s0 + (p.s1 - p.s0) * u, p.col, p.a * k, Math.atan2(p.vy, p.vx)); break;
      }
    }
  }

  // ---- sprites -------------------------------------------------------------------------------------------------------------------
  // G7: draw options are ONE scratch object (GFX.draw reads it during the call and keeps nothing), sprite names come from tables (no string concat per draw)
  const OD = { flip: false, alpha: undefined, white: false, tint: undefined, glow: undefined };
  function gdo(ctx, name, frame, x, y, flip, alpha, tint, white, glow) {
    OD.flip = flip; OD.alpha = alpha; OD.tint = tint; OD.white = white; OD.glow = glow;
    GFX.draw(ctx, name, frame, x, y, OD);
  }
  const gd = (ctx, name, frame, x, y, flip, alpha) => gdo(ctx, name, frame, x, y, flip, alpha, undefined, false, undefined);
  const PN = [1, 2].map((n) => { const p = 'p' + n; return { die: p + '_die', stun: p + '_stun', shoot: p + '_shoot', jump: p + '_jump', fall: p + '_fall', walk: p + '_walk', idle: p + '_idle' }; });
  const EN = {};
  for (const t of ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer']) EN[t] = { move: t + '_move', angry: t + '_angry', die: t + '_die', trapped: t + '_trapped', frozen: t + '_frozen' };
  const POSE = { crabbit_throw: 'crabbit_throw_angry', springle_squash: 'springle_squash_angry', glimmer_fire: 'glimmer_fire_angry' };
  const BUBBLE_SPRITE = { thunder: 'bubble_thunder', fire: 'bubble_fire', water: 'bubble_water' };

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
      gd(ctx, name, frame, TP[0], TP[1], flip, TRAIL_A[g]);
    }
    if (on) ctx.globalCompositeOperation = go;
  }

  function drawPlayer(ctx, p) {
    if (p.state === 'out') return;
    const N = PN[p.i];
    let name, frame = 0, alpha;
    if (p.state === 'dying') { name = N.die; frame = Math.floor(p.dieT / 6) % 4; }
    else {
      if (p.inv > 0) alpha = OPT.reducedMotion ? 0.6 : 0.4 + 0.6 * wave(p.inv, 15);     // invulnerable: a smooth alpha pulse 0.4..1.0 at 4 Hz (G3; steady 0.6 under reduced motion)
      if (p.stunT > 0) { name = N.stun; frame = Math.floor(p.animT / 8) % 2; }
      else if (p.shootT > 0) { name = N.shoot; frame = p.shootT > 4 ? 1 : 0; }
      else if (!p.onGround) name = p.vy < 0 ? N.jump : N.fall;
      else if (p.vx !== 0) { name = N.walk; frame = Math.floor(p.animT / 5) % 4; }
      else { name = N.idle; frame = p.animT % 180 >= 172 ? 1 : 0; }
      drawGhosts(ctx, p, name, frame, p.face < 0);
      if (OPT.quality >= 2) P(ctx, 'dot', p.x + 8, p.y + 9, 2.6, PLAYER_COLOR[p.i], 0.14 * (alpha === undefined ? 1 : alpha));        // the twin lights the water around it
    }
    gd(ctx, name, frame, p.x, p.y, p.face < 0, alpha);
  }

  function actionPose(base, e) { return e.angry && GFX.has(POSE[base]) ? POSE[base] : base; }

  function drawEnemy(ctx, e) {
    if (e.dead || e.state === 'trapped') return;
    if (e.state === 'enter' && e.enterT < 0) return;
    if (e.t === 'kraken') { drawBoss(ctx, e); return; }
    const N = EN[e.t];
    let flip = e.d < 0, name, frame = 0, alpha;
    if (e.state === 'dying') { name = N.die; frame = Math.floor(e.dieT / 5) % 4; flip = false; }
    else if (e.state === 'carried') { name = N.trapped; frame = Math.floor(S.frame / 6) % 2; }
    // action poses have *_angry twins so the angry cue never drops out; the twin is looked up only for these three
    else if (e.t === 'crabbit' && e.pauseT > 0) name = actionPose('crabbit_throw', e);
    else if (e.t === 'springle' && e.onGround && e.sqT > 0) name = actionPose('springle_squash', e);
    else if (e.t === 'glimmer' && e.poseT > 0) name = actionPose('glimmer_fire', e);
    else { name = e.angry ? N.angry : N.move; frame = Math.floor(e.animT / 6) % 4; }
    if (e.state === 'enter') alpha = Math.min(1, Math.max(0, e.enterT) / 30);
    if (e.state === 'frozen') { drawFrozen(ctx, e, name, 0, flip); return; }
    if (e.state === 'active' || e.state === 'dying') drawGhosts(ctx, e, name, frame, flip);
    // the angry look (crimson contour, steam, brows, pulsing heat halo) is baked into the *_angry frames (the K4 aura is gone); Game adds only a faint steady red light pool
    if (e.angry && e.state === 'active' && OPT.quality >= 2) P(ctx, 'dot', e.x + 8, e.y + 9, 3.2, HUE.crimson, 0.1);                   // steady (not pulsing: no K4 aura)
    gd(ctx, name, frame, e.x, e.y, flip, alpha);
  }

  /** Frozen enemy (V1): the cast's `<e>_frozen` ice cast (pale white-lilac frost, its own crystalline twinkles; frame 0..3 only vary the twinkles) drawn plain, with a
   *  cold light pool and two glints. Without the sprite (GFX.has) the old tint recipe is used: the sprite tinted icy cyan + a frosty white sheen; without GFX.particle a white
   *  silhouette wash. The last second THAWS in a gentle pulse (G3: the ice thins out 2x per second while the creature comes back, never an on / off blink; steady 0.7 under
   *  reduced motion). Twinkle positions come from an integer hash of the frame: render never touches any RNG. */
  function drawFrozen(ctx, e, name, frame, flip) {
    const rm = OPT.reducedMotion, ice = EN[e.t] && GFX.has(EN[e.t].frozen) ? EN[e.t].frozen : '';
    let fa = 1;
    if (e.freezeT <= THAW_FRAMES) fa = rm ? 0.7 : (e.freezeT / THAW_FRAMES) * (0.55 + 0.45 * wave(e.freezeT, 30));
    if (fa < 0.985) gd(ctx, name, frame, e.x, e.y, flip, undefined);          // the creature underneath returns as the ice thins
    if (fa < 0.02) return;
    const fal = fa < 0.985 ? fa : undefined;
    if (ice) {
      if (OPT.quality >= 2) P(ctx, 'dot', e.x + 8, e.y + 9, 3.0, HUE.ice, 0.18 * fa);
      gd(ctx, ice, rm ? 0 : Math.floor(S.frame / 10) % 4, e.x, e.y, flip, fal);
    } else if (!hasV2()) {
      gd(ctx, name, frame, e.x, e.y, flip, fal);
      gdo(ctx, name, frame, e.x, e.y, flip, 0.5 * fa, undefined, true, undefined);      // white silhouette wash
      return;
    } else {
      if (OPT.quality >= 2) P(ctx, 'dot', e.x + 8, e.y + 9, 3.0, HUE.ice, 0.18 * fa);
      gdo(ctx, name, frame, e.x, e.y, flip, fal, '#4fc8ff', false, undefined);   // icy cyan body ...
      const go = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter';
      gdo(ctx, name, frame, e.x, e.y, flip, (e.t === 'glimmer' ? 0.24 : 0.1) * fa, undefined, true, undefined);   // ... with a frosty white sheen on top (a stronger sheen blew the light bodies out to white with the bloom)
      ctx.globalCompositeOperation = go;
    }
    if (!hasV2()) return;
    const step = rm ? 15 : 5, k = Math.floor(S.frame / step), ns = OPT.quality >= 1 ? (ice ? 2 : 3) : 1;
    const u = (S.frame % step) / step;
    for (let i = 0; i < ns; i++) {
      const h = Math.imul(k + i * 31 + (e.sx | 0), 2654435761) >>> 0;
      P(ctx, 'spark', e.x + 1 + (h % 14), e.y + 1 + ((h >>> 8) % 14), 1.0 + 0.7 * Math.sin(u * Math.PI), (k + i) % 2 ? '#ffffff' : '#8fe6ff', (0.4 + 0.55 * Math.sin(u * Math.PI)) * fa);
    }
  }

  /** The Kraken. G1: the ink telegraph is a smooth glow RAMP (the angry face crossfading in + an amber glow that swells towards a white-hot core, linear over the 22 wind-up
   *  frames, then fading out over INK_FADE frames after the volley): one slow swell per 2 s, no strobe (it was a 10 Hz white on / off). reducedMotion: the steady 0.3 white. */
  function drawBoss(ctx, e) {
    const act = e.state === 'active', wind = act && inkWinding(e), rm = OPT.reducedMotion;
    const g = !act || rm ? 0 : wind ? (INK_WIND - e.inkT + 1) / INK_WIND : e.relT < INK_FADE ? smooth(1 - e.relT / INK_FADE) : 0;
    const name = e.angry || (rm && wind) ? 'kraken_angry' : 'kraken';
    const fr = Math.floor(e.animT / 14) % 2;
    const al = e.state === 'enter' ? Math.min(1, Math.max(0, e.enterT) / 30) : undefined;
    if (OPT.quality >= 2) {
      P(ctx, 'dot', e.x + 24, e.y + 26, 6, e.angry ? HUE.crimson : HUE.purple, 0.12);
      if (g > 0.01) P(ctx, 'dot', e.x + 24, e.y + 26, 6 + 3 * g, HUE.ember, 0.24 * g);
    }
    gd(ctx, name, fr, e.x, e.y, false, al);
    if (e.flashT > 0) { gdo(ctx, name, fr, e.x, e.y, false, undefined, undefined, true, undefined); return; }       // the single 4-frame hit flash
    if (rm) { if (wind) gdo(ctx, name, fr, e.x, e.y, false, 0.3, undefined, true, undefined); return; }
    if (g > 0.01) {
      if (!e.angry) gd(ctx, 'kraken_angry', fr, e.x, e.y, false, g);                                                    // the angry face fades in (it used to swap at once)
      const go = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter';
      const ta = 0.34 * g, wa = 0.11 * g * g;
      if (ta > 0.008) gdo(ctx, name, fr, e.x, e.y, false, ta, '#ffb23e', false, undefined);                              // the heat of the ink it is about to spit ...
      if (wa > 0.008) gdo(ctx, name, fr, e.x, e.y, false, wa, undefined, true, undefined);                               // ... turning white-hot
      ctx.globalCompositeOperation = go;
    }
  }

  function drawBubble(ctx, b) {
    if (b.dead) return;
    const t = b.age, rm = OPT.reducedMotion;
    if (b.state === 'shot') {
      gd(ctx, 'bubble_shot', Math.min(2, Math.floor((b.dist / b.range) * 3)), b.x, b.y, false, undefined);
      return;
    }
    // end-of-life warning of special / letter bubbles: a smooth pulse 0.5..1 at ~2.5 Hz (G3; it was a 7.5 Hz hard blink), steady half-bright under reduced motion
    const dying = b.life - b.age < 90, fade = !dying ? 1 : rm ? 0.7 : 0.5 + 0.5 * wave(t, 24);
    switch (b.kind) {
      case 'trapped': {
        const e = b.enemy;
        const frac = b.trapT / b.trapTime, stage = frac < 0.5 ? 0 : frac < 0.8 ? 1 : 2;
        const jx = stage === 2 && !rm && t % 4 < 2 ? 1 : 0;
        if (e) gd(ctx, EN[e.t].trapped, Math.floor(t / 8) % 2, b.x + jx, b.y, e.d < 0, undefined);
        // C2: the cast gives the stages different SHAPES (dashed rim, cracks); the shimmer / pulse cues are smooth alpha waves on top (stage 1 ~3 Hz shimmer, stage 2 2 Hz pulse)
        gd(ctx, 'trap_overlay', stage, b.x + jx, b.y, false, rm || stage === 0 ? undefined : stage === 1 ? 0.78 + 0.22 * wave(t, 20) : 0.62 + 0.38 * wave(t, 30));
        break;
      }
      case 'empty':
        if (b.life - b.age <= WARN_FRAMES) gd(ctx, 'bubble_warn', Math.floor(t / 10) % 2, b.x, b.y, false, undefined);      // the red flicker is 3 Hz now (G3)
        else gd(ctx, 'bubble', Math.floor(t / 16) % 2, b.x, b.y, false, undefined);
        break;
      case 'letter':
        gd(ctx, 'bubble_letter', Math.floor(t / 12) % 2, b.x, b.y, false, fade);
        // SPEC_V2 documents only {align, scale, shadow, outline, glow} for GFX.text -> fade through ctx.globalAlpha (GFX.text multiplies it)
        { const ga = ctx.globalAlpha; ctx.globalAlpha = ga * fade; GFX.text(ctx, b.letter, b.x + 8, b.y + 4, '#ffffff', TX_C); ctx.globalAlpha = ga; }
        break;
      default:
        gd(ctx, BUBBLE_SPRITE[b.kind], Math.floor(t / 12) % 2, b.x, b.y, false, fade);
    }
  }

  function drawItem(ctx, it) {
    if (it.dead) return;
    const pearl = it.kind === 'moonpearl';
    const left = it.life - it.age;
    let a = 1;
    if (!pearl && left < FOOD_BLINK) a = OPT.reducedMotion ? 0.7 : 0.3 + 0.7 * (0.5 + 0.5 * Math.cos(left * Math.PI / 12));    // expiry cue: smooth pulse, never a hard strobe
    const bob = it.kind.startsWith('pu_') ? Math.round(Math.sin(it.age / 10) * 1.5) : 0;
    const pulse = 0.5 + 0.5 * Math.sin(it.age * 0.11 + it.x * 0.05);
    let hue = it.hue;
    if (hue === undefined) hue = it.hue = itemHue(it.kind);                                           // G7: the colour of an item never changes (no substring work per frame)
    if (pearl) P(ctx, 'dot', it.x + 16, it.y + 17, 4.6 + pulse * 0.8, hue, (0.16 + 0.16 * pulse) * a);
    else P(ctx, 'dot', it.x + 8, it.y + 9 + bob, 2.6 + pulse * 0.6, hue, (0.2 + 0.22 * pulse) * a);        // glow pulse
    const gl = 0.5 + 0.5 * pulse;                                                                       // the sprite's own halo breathes with the pulse (GFX {glow}; plain draw without v2 GFX)
    if (pearl) gdo(ctx, 'moonpearl', Math.floor(it.age / 10) % 2, it.x, it.y, false, undefined, undefined, false, gl);
    else gdo(ctx, it.kind, 0, it.x, it.y + bob, false, a === 1 ? undefined : a, undefined, false, gl);
  }

  function drawFx(ctx, f) {
    if (f.dead) return;
    const nf = GFX.frames(f.sprite) || 1;
    const frame = Math.min(nf - 1, Math.floor(f.t / f.tick));
    const fade = f.dur - f.t < 10 ? (f.dur - f.t) / 10 : 1;
    gd(ctx, f.sprite, frame, f.x, f.y, false, fade < 1 ? fade : undefined);
  }

  /** The chain / thunder / bomb light: a faint tinted wash over the playfield, <= FLASH_MAX (12 %), onsets >= 20 frames apart. */
  function drawFlash(ctx) {
    if (S.flashT <= 0) return;
    const ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * flashAlpha();
    ctx.fillStyle = S.flashCol;
    ctx.fillRect(0, MAP_Y, C.W, MAP_H);
    ctx.globalAlpha = ga;
  }

  function drawWorldEntities(ctx) {
    const FL = S.flames, IT = S.items, EN_ = S.enemies, ST = S.streams, BU = S.bubbles, PL = S.players, PR = S.proj, BO = S.bolts, DR = S.drops, FX = S.fx;
    for (let i = 0; i < FL.length; i++) {
      const f = FL[i], left = FLAME_FRAMES - f.t;
      if (left < 30) { if (left > 1) gd(ctx, 'flame', Math.floor(f.t / 4) % 3, f.x, f.y, false, left / 30); continue; }      // the flame dies down smoothly over its last half second (G3: no 10 Hz blink)
      gd(ctx, 'flame', Math.floor(f.t / 4) % 3, f.x, f.y, false, undefined);
    }
    for (let i = 0; i < IT.length; i++) drawItem(ctx, IT[i]);
    for (let i = 0; i < EN_.length; i++) drawEnemy(ctx, EN_[i]);
    for (let i = 0; i < ST.length; i++) {
      const s = ST[i], fr = Math.floor(S.frame / 5) % 2;
      for (let j = 0; j < s.trail.length; j++) { const seg = s.trail[j]; gd(ctx, seg.k === 'fall' ? 'water_fall' : 'water_flow', fr, seg.x, seg.y, false, undefined); }
      gd(ctx, s.mode === 'fall' ? 'water_fall' : 'water_flow', fr, s.x, s.y, false, undefined);
    }
    for (let i = 0; i < BU.length; i++) drawBubble(ctx, BU[i]);
    if (S.bossBubble) gd(ctx, 'kraken_trapped', 0, S.bossBubble.x, S.bossBubble.y, false, undefined);
    for (let i = 0; i < PL.length; i++) drawPlayer(ctx, PL[i]);
    if (S.ghost) {
      const g = S.ghost;
      gd(ctx, 'bonefin', Math.floor(g.age / 10) % 2, g.x, g.y, g.vx < 0, 0.85);
    }
    for (let i = 0; i < PR.length; i++) { const q = PR[i]; gd(ctx, q.type, Math.floor(q.age / 4) % 2, q.x, q.y, false, undefined); }
    for (let i = 0; i < BO.length; i++) {                                 // bolt with two fading afterimages
      const bo = BO[i], fr = Math.floor(bo.age / 2) % 2, flip = bo.dir < 0;
      if (OPT.quality >= 1) P(ctx, 'dot', bo.x + 8, bo.y + 4, 2.4, HUE.amber, 0.2);
      gd(ctx, 'bolt', fr, bo.x - bo.dir * 12, bo.y, flip, 0.25);
      gd(ctx, 'bolt', fr, bo.x - bo.dir * 6, bo.y, flip, 0.5);
      gd(ctx, 'bolt', fr, bo.x, bo.y, flip, undefined);
    }
    for (let i = 0; i < DR.length; i++) { const d = DR[i]; P(ctx, 'dot', d.x + 4, d.y + 4, 1.8, HUE.ember, 0.2); gd(ctx, 'fire_drop', Math.floor(d.age / 3) % 2, d.x, d.y, false, undefined); }
    for (let i = 0; i < FX.length; i++) drawFx(ctx, FX[i]);
    drawMotes(ctx);
    drawParts(ctx);
    drawFlash(ctx);
  }

  /** Score / life popups, drawn after the banner bands (renderOverlays) so a popup rising through a band stays fully bright.
   *  Clipped to the playfield (unless `noClip`: the round change already clips); fades out over its last 12 frames. */
  function drawPopups(ctx, list, noClip) {
    if (!list.length) return;
    if (!noClip) { ctx.save(); ctx.beginPath(); ctx.rect(0, MAP_Y, C.W, MAP_H); ctx.clip(); }
    for (let i = 0; i < list.length; i++) {
      const q = list[i];
      const x = U.clamp(q.x, 16 + (q.text.length * 4), 240 - q.text.length * 4);
      const a = q.t > 28 ? Math.max(0, (40 - q.t) / 12) : 1;
      if (OPT.quality >= 2) P(ctx, 'dot', x, q.y + 4.5, 1.9, q.color, 0.14 * a);
      { const ga = ctx.globalAlpha; if (a !== 1) ctx.globalAlpha = ga * a;      // fade via globalAlpha (contract: no `alpha` text option)
        GFX.text(ctx, q.text, x, q.y, q.color, TX_POP); ctx.globalAlpha = ga; }
    }
    if (!noClip) ctx.restore();
  }

  // ---- round number, backdrop, HUD band --------------------------------------------------------------------------------------------
  const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
  const ROUND_STR = []; for (let i = 0; i < 31; i++) ROUND_STR.push(pad2(i));
  const ACC_RGBA = [];                                                                // per round index: the underline / label tint (G7: one string per round, not one per frame)
  /** Round counter on the left wall (G8): 'R' + the two digits ("R01"), inset 1 px from the edge, in the CEILING row so no game object ever sits behind it; thin glowing
   *  digits on a soft dark pool (legible on every wall look). y = top of the 8 px cell. */
  function drawRoundNumber(ctx, n, y) {
    softDark(ctx, 12, y + 4, 17, 8, 0.66);
    const accent = (ACC_RGBA[n - 1] || (ACC_RGBA[n - 1] = rgba(GFX.theme(n - 1).accent2, 0.9)));
    GFX.text(ctx, 'R', 1, y, accent, TX_OUT);
    GFX.text(ctx, ROUND_STR[n] || pad2(n), 9, y, '#cffaff', TX_OUT);
  }

  /** Round backdrop: GFX.bgCanvas (drawn at 256 x 208 logical px, whatever its backing size) when the GFX module has it, else the flat theme colour. */
  function drawBackdrop(ctx, levelIndex, y) {
    if (typeof GFX.bgCanvas === 'function') { ctx.drawImage(GFX.bgCanvas(levelIndex), 0, y, C.W, MAP_H); return; }
    ctx.fillStyle = GFX.theme(levelIndex).bg;
    ctx.fillRect(0, y, C.W, MAP_H);
  }

  /** The top 16 px (V2): NO flat black strip. The HUD sits on the same water as the playfield: the top rows of the round's backdrop mirrored upward from the seam (so the
   *  gradient and the god rays run on continuously), under a soft dark veil that keeps the thin glowing numbers legible, and a faint hairline at the seam. The band is
   *  composed ONCE per backdrop canvas into a small cache canvas (one 1:1 blit per frame afterwards; it is rebuilt when GFX hands out a new backdrop canvas, e.g. after a
   *  scale change). Without GFX.bgCanvas (stub) the flat theme colour + the same veil are drawn live. */
  const HUD_BANDS = new Map();                                              // round index -> { src, w, cv }
  let hudVeil = null;
  function veilInto(g, w, h) {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(2,4,10,0.62)'); gr.addColorStop(1, 'rgba(2,4,10,0.18)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = 'rgba(110,190,235,0.16)'; g.fillRect(0, h - Math.max(1, h / MAP_Y * 0.5), w, Math.max(1, h / MAP_Y * 0.5));
    g.globalCompositeOperation = 'source-over';
  }
  function hudBandCanvas(levelIndex) {
    const src = GFX.bgCanvas(levelIndex);
    let e = HUD_BANDS.get(levelIndex);
    if (e && e.src === src && e.w === src.width) return e.cv;
    const w = src.width, h = Math.max(1, Math.round(src.height * MAP_Y / MAP_H));
    if (HUD_BANDS.size >= 3 && !e) { const k0 = HUD_BANDS.keys().next().value; const o = HUD_BANDS.get(k0); o.cv.width = 1; o.cv.height = 1; HUD_BANDS.delete(k0); }
    const cv = e && e.cv.width === w && e.cv.height === h ? e.cv : document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    g.save(); g.translate(0, h); g.scale(1, -1);
    g.drawImage(src, 0, 0, w, h, 0, 0, w, h);                                // the first h rows of the backdrop, mirrored about the seam
    g.restore();
    veilInto(g, w, h);
    HUD_BANDS.set(levelIndex, { src, w, cv });
    return cv;
  }
  function drawHudBand(ctx, levelIndex, a) {
    const ga = ctx.globalAlpha;
    if (a !== 1) ctx.globalAlpha = ga * a;
    if (typeof GFX.bgCanvas === 'function') ctx.drawImage(hudBandCanvas(levelIndex), 0, 0, C.W, MAP_Y);
    else {
      ctx.fillStyle = GFX.theme(levelIndex).bg; ctx.fillRect(0, 0, C.W, MAP_Y);
      if (!hudVeil) { hudVeil = ctx.createLinearGradient(0, 0, 0, MAP_Y); hudVeil.addColorStop(0, 'rgba(2,4,10,0.62)'); hudVeil.addColorStop(1, 'rgba(2,4,10,0.18)'); }
      ctx.fillStyle = hudVeil; ctx.fillRect(0, 0, C.W, MAP_Y);
    }
    ctx.globalAlpha = ga;
  }

  function renderPlayfield(ctx) {
    drawBackdrop(ctx, S.level - 1, MAP_Y);
    drawAmbient(ctx, S.level - 1, 1);
    ctx.drawImage(GFX.levelCanvas(S.level - 1, S.map), 0, MAP_Y, C.W, MAP_H);
    if (OPT.quality >= 2 && typeof GFX.levelGlints === 'function') GFX.levelGlints(ctx, S.level - 1, S.map, S.frame / 60);   // travelling glints on the lit top faces
    drawWorldEntities(ctx);
  }

  /** Round change. G5: the scroll offset is NOT rounded to logical pixels any more (that stepped 3-5 device px at a time and ticked 0/1 px for ~35 frames): it is fractional,
   *  the canvases are baked at the exact device scale so the image is resampled only while it moves (and lands on a whole device pixel at rest). Leftover items, bubbles,
   *  popups, effects and the chain light FADE over FADE_FRAMES frames instead of vanishing in one frame, and the ambient plankton keeps drifting, crossfading from the old
   *  round's colours to the new one's. */
  function renderTransition(ctx) {
    const tr = S.tr, F = S.fade;
    const u = Math.min(1, tr.t / TRANSITION_FRAMES), k = ease(u);
    const off = k >= 1 ? MAP_H : k * MAP_H;
    const from = LEVELS[tr.from - 1], to = LEVELS[tr.to - 1];
    drawBackdrop(ctx, tr.from - 1, MAP_Y - off);
    drawBackdrop(ctx, tr.to - 1, MAP_Y + MAP_H - off);
    const wTo = smooth((u - 0.3) / 0.4);
    if (wTo < 0.99) drawAmbient(ctx, tr.from - 1, 1 - wTo);
    if (wTo > 0.01) drawAmbient(ctx, tr.to - 1, wTo);
    ctx.drawImage(GFX.levelCanvas(tr.from - 1, from.map), 0, MAP_Y - off, C.W, MAP_H);
    ctx.drawImage(GFX.levelCanvas(tr.to - 1, to.map), 0, MAP_Y + MAP_H - off, C.W, MAP_H);
    if (OPT.quality >= 2 && typeof GFX.levelGlints === 'function') {         // the lit-face glints fade out with the old round / in with the new one
      const ga = ctx.globalAlpha, fo = 1 - smooth(u * 4), fi = smooth((u - 0.8) / 0.2);
      ctx.save(); ctx.translate(0, -off);
      if (fo > 0.01) { ctx.globalAlpha = ga * fo; GFX.levelGlints(ctx, tr.from - 1, from.map, S.frame / 60); }
      ctx.restore(); ctx.save(); ctx.translate(0, MAP_H - off);
      if (fi > 0.01) { ctx.globalAlpha = ga * fi; GFX.levelGlints(ctx, tr.to - 1, to.map, S.frame / 60); }
      ctx.restore(); ctx.globalAlpha = ga;
    }
    drawRoundNumber(ctx, tr.from, MAP_Y - off);
    drawRoundNumber(ctx, tr.to, MAP_Y + MAP_H - off);
    if (F) {                                                                  // leftovers of the cleared round fade out where they were, scrolling away with it
      const fa = 1 - smooth(F.t / FADE_FRAMES), ga = ctx.globalAlpha;
      if (fa > 0.01) {
        ctx.save(); ctx.translate(0, -off); ctx.globalAlpha = ga * fa;
        for (let i = 0; i < F.items.length; i++) drawItem(ctx, F.items[i]);
        for (let i = 0; i < F.bubbles.length; i++) drawBubble(ctx, F.bubbles[i]);
        if (F.ghost) gd(ctx, 'bonefin', Math.floor(F.ghost.age / 10) % 2, F.ghost.x, F.ghost.y, F.ghost.vx < 0, 0.85);
        for (let i = 0; i < F.fx.length; i++) drawFx(ctx, F.fx[i]);
        drawPopups(ctx, F.popups, true);
        ctx.restore(); ctx.globalAlpha = ga;
      }
    }
    if (S.parts.length) { ctx.save(); ctx.translate(0, -off); drawParts(ctx); ctx.restore(); }      // the last effects of the round (rings, sparks) keep playing out
    drawFlash(ctx);
    for (let i = 0; i < S.players.length; i++) {                                 // players ride bubbles to their spawn
      const p = S.players[i];
      if (p.state !== 'normal') continue;
      P(ctx, 'dot', p.x + 8, p.y + 9, 3.0, PLAYER_COLOR[p.i], 0.13);
      gd(ctx, PN[p.i].idle, 0, p.x, p.y, p.face < 0, undefined);
      gd(ctx, 'bubble', Math.floor(tr.t / 12) % 2, p.x, p.y, false, undefined);
    }
  }

  const SC = [{ v: -1, s: '' }, { v: -1, s: '' }, { v: -1, s: '' }];            // G7: the score strings are rebuilt only when a score changes
  function pad6(slot, n) {
    n = n > 0 ? Math.floor(n) : 0;
    const c = SC[slot];
    if (c.v !== n) { c.v = n; c.s = String(n).padStart(6, '0'); }
    return c.s;
  }
  const TX_R = { align: 'right' }, TX_C = { align: 'center' }, TX_DIM = { align: 'center', shadow: false, glow: false }, TX_OUT = { outline: OUTLINE }, TX_POP = { align: 'center', outline: OUTLINE };
  const LETTER_DIM = 'rgba(190,234,250,0.72)';                                   // G8: the letters still missing (they were rgba(120,205,230,0.36) = 1.9:1; now 3.3:1 at k=2, 4.2 at k=3, 5.1 at k=4 on every theme)

  /** A life pearl: glowing core + faint ring in the player's colour. */
  function drawPearl(ctx, x, y, i) {
    const br = 0.9 + 0.1 * Math.sin(S.frame / 28 + y * 0.3);
    P(ctx, 'ring', x, y, 2.9, PLAYER_COLOR[i], 0.65 * br);
    P(ctx, 'dot', x, y, 1.35, PLAYER_HOT[i], 0.95 * br);
  }

  function renderHud(ctx) {
    const p1 = S.players[0], p2 = S.players[1];
    // V2: the HUD band is the continuous water (the backdrop's top rows mirrored up from the seam), not a flat black strip; the round change crossfades the two backdrops
    if (S.phase === 'transition' && S.tr) {
      const w = smooth((Math.min(1, S.tr.t / TRANSITION_FRAMES) - 0.3) / 0.4);
      drawHudBand(ctx, S.tr.from - 1, 1);
      if (w > 0.01) drawHudBand(ctx, S.tr.to - 1, w);
    } else drawHudBand(ctx, S.level - 1, 1);
    GFX.text(ctx, '1UP', 16, 0, PLAYER_COLOR[0]);
    GFX.text(ctx, 'HI SCORE', 128, 0, HUE.amber, TX_C);
    P(ctx, 'dot', 12.2, 4.2, 0.7, PLAYER_COLOR[0], 0.9);
    if (p2) { GFX.text(ctx, '2UP', 240, 0, PLAYER_COLOR[1], TX_R); P(ctx, 'dot', 243.8, 4.2, 0.7, PLAYER_COLOR[1], 0.9); }
    // G6: the join hint shows only while pressing Q can really join a second player (Game.join refuses after game over / victory, once P1 is out, with a join already queued)
    else if (S.joinHint && !S.over && !S.pendingJoin && S.phase !== 'gameover' && S.phase !== 'victory' && p1.state !== 'out' && Math.floor(S.frame / 30) % 2 === 0) GFX.text(ctx, S.joinHint, 240, 0, PLAYER_COLOR[1], TX_R);
    GFX.text(ctx, pad6(0, p1.score), 64, 8, PLAYER_HOT[0], TX_R);
    GFX.text(ctx, pad6(1, Math.max(S.hiScore, p1.score, p2 ? p2.score : 0)), 152, 8, '#fff1d6', TX_R);
    if (p2) GFX.text(ctx, pad6(2, p2.score), 240, 8, PLAYER_HOT[1], TX_R);
    if (S.phase !== 'transition') drawRoundNumber(ctx, S.level, MAP_Y);
    for (let i = 0; i < S.players.length; i++) {
      const p = S.players[i];
      const x = i === 0 ? 8 : 248;
      const reserve = Math.min(8, Math.max(0, p.lives - 1));
      if (reserve > 0) {                                                    // lives: small glowing pearls up the foot of the wall
        softDark(ctx, x, 207 - (reserve - 1) * 3.5, 8, (reserve * 7 + 6) / 2, 0.5);
        for (let k = 0; k < reserve; k++) drawPearl(ctx, x, 207 - k * 7, i);
      }
      softDark(ctx, x, MAP_Y + 4 * T + 3 * T - 1, 9, 31, 0.5);              // EXTEND letters down the side walls: lit = ringed + glowing, dim = clearly readable
      const extending = S.phase === 'extend' && S.extend && S.extend.pi === i;   // all six lit and pulsing (a smooth swell at 2.5 Hz, G3; steady under reduced motion)
      const hotW = extending && !OPT.reducedMotion ? wave(S.phaseT, 24) : 0;
      for (let k = 0; k < 6; k++) {
        const y = MAP_Y + (4 + k) * T, ch = LETTERS[k];
        if (p.letters[k]) {
          P(ctx, 'dot', x, y + 4, 3.4, PLAYER_COLOR[i], 0.2);
          P(ctx, 'ring', x, y + 4, 3.7, PLAYER_COLOR[i], 0.55);
          GFX.text(ctx, ch, x, y, PLAYER_HOT[i], TX_C);
          if (hotW > 0.02) { const ga = ctx.globalAlpha; ctx.globalAlpha = ga * hotW; GFX.text(ctx, ch, x, y, '#ffffff', TX_C); ctx.globalAlpha = ga; }
        } else GFX.text(ctx, ch, x, y, LETTER_DIM, TX_DIM);
      }
    }
  }

  /** Boss gauge: a thin neon bar in the ceiling row with a glowing crown glyph; white flash on a hit. Hidden during the intro. */
  const CROWN_PTS = [[0, 5.5], [0, 1.2], [2.6, 3.4], [5, 0], [7.4, 3.4], [10, 1.2], [10, 5.5]], CROWN_JEWELS = [[0, 1.2], [5, 0], [10, 1.2]];
  function crownGlyph(ctx, x, y, col) {
    const pts = CROWN_PTS;
    ctx.save();
    ctx.translate(x, y); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(col, 0.2); ctx.lineWidth = 3.4; ctx.stroke();
    ctx.strokeStyle = rgba(col, 0.55); ctx.lineWidth = 1.7; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,248,225,0.95)'; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.restore();
    for (let i = 0; i < CROWN_JEWELS.length; i++) { const j = CROWN_JEWELS[i]; P(ctx, 'dot', x + j[0], y + j[1], 0.7, HUE.white, 0.9); }
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
  const CEN1 = { align: 'center', scale: 1, outline: OUTLINE }, CEN2 = { align: 'center', scale: 2, outline: OUTLINE };
  const ROUND_TXT = []; for (let i = 0; i < 31; i++) ROUND_TXT.push('ROUND ' + i);
  const center = (ctx, str, y, color, scale) => GFX.text(ctx, str, 128, y, color, scale === 2 ? CEN2 : CEN1);

  function renderOverlays(ctx) {
    const th = GFX.theme(S.level - 1), rm = OPT.reducedMotion, ga = ctx.globalAlpha;
    if (S.phase === 'intro') {
      const boss = S.level === 30;
      band(ctx, 78, boss ? 140 : 124, th.accent2);
      center(ctx, ROUND_TXT[S.level] || 'ROUND ' + S.level, 84, '#eaffff', 2);
      if (boss) center(ctx, 'THE KRAKEN KING!', 108, '#ffa090');
      if (S.phaseT > 60) {                                                  // READY!: a gentle pulse (~1.9 Hz) after a short fade-in, steady under reduced motion
        const a = Math.min(1, (S.phaseT - 60) / 8) * (rm ? 1 : 0.6 + 0.4 * wave(S.phaseT, 32));
        ctx.globalAlpha = ga * a; center(ctx, 'READY!', boss ? 124 : 108, '#fff2b0'); ctx.globalAlpha = ga;
      }
    }
    if (S.hurryBanner > 0) {
      // hostile moment (every enemy turns angry): outlined text on a faint soft band, so enemies, pebbles and ink in the rows behind stay readable.
      // G3: it fades in, then swells and dims smoothly at 2 Hz (it was a 6 Hz hard blink) and fades out; steady under reduced motion
      const hb = S.hurryBanner;
      const a = Math.min(1, (HURRY_BANNER - hb + 1) / 8, hb / 14) * (rm ? 1 : 0.62 + 0.38 * wave(hb, 30));
      if (a > 0.02) {
        ctx.globalAlpha = ga * a;
        band(ctx, 96, 112, null, 0.34, 6);
        center(ctx, 'HURRY UP!', 96, '#ff6a5e', 2);
        ctx.globalAlpha = ga;
      }
    }
    if (S.phase === 'extend') {
      band(ctx, 84, 134);
      const ci = Math.floor(S.frame / 24), cf = (S.frame % 24) / 24;       // G3: the colour changes every 24 frames (2.5 Hz) as a smooth crossfade (it was a hard change every 14 frames)
      center(ctx, 'EXTEND!', 92, EXTEND_COLS[ci % 6], 2);
      if (!rm && cf > 0.02) { ctx.globalAlpha = ga * smooth(cf); center(ctx, 'EXTEND!', 92, EXTEND_COLS[(ci + 1) % 6], 2); ctx.globalAlpha = ga; }
      center(ctx, '1UP', 116, '#9dffa8');
    }
    if (S.phase === 'gameover') { band(ctx, 88, 120); center(ctx, 'GAME OVER', 96, '#eaffff', 2); }
    if (S.phase === 'victory') {
      band(ctx, 68, 138, '#ffe27a');
      center(ctx, 'THE MOON', 76, '#ffe27a', 2);
      center(ctx, 'PEARL IS', 96, '#ffe27a', 2);
      center(ctx, 'SAFE!', 116, '#ffffff', 2);
    }
    drawPopups(ctx, S.popups, false);
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
    try { RK = ctx.getTransform().a || 1; } catch (e) { RK = 1; }                  // device px per logical px (ring sprite limit); once per frame
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
      flashT: 0, flashDur: 14, flashA: 0, flashCool: 0, flashCol: '#ffffff', parts: [], burstBudget: 28, warm: 0, fade: null,
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
      drawn: { ghosts: RSTAT.ghosts, ambient: RSTAT.ambient, motes: RSTAT.motes, parts: RSTAT.parts, rings: RSTAT.rings },
      light: { total: RSTAT.light, cap: LIGHT_CAP, pools: S.parts.filter((p) => p.lt === 1).length, poolMax: POOL_MAX, ringCap: RING_CAP }, fade: S.fade ? S.fade.t : -1 } : null; },
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


/* ===== 50_main.js ===== */
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

})();
