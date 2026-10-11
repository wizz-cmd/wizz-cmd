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
 *  lwFor(k, m = 1)                        : stroke width in sprite units for bake scale k:  2.1*(k/4.8)^0.45*m / k
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
  function lwFor(k, m) { return (2.1 * Math.pow(k / 4.8, 0.45) * (m || 1)) / k; }

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
    B: [0.58, [[0, 0], [0, 1]], [[0, 0], [0.34, 0], ...A_(0.34, 0.25, 0.2, 0.25, -90, 90), [0, 0.5]], [[0, 0.5], [0.38, 0.5], ...A_(0.38, 0.75, 0.2, 0.25, -90, 90), [0, 1]]],
    C: [0.62, A_(0.34, 0.5, 0.32, 0.5, -42, -318, 28)],
    D: [0.62, [[0, 0], [0, 1]], [[0, 0], [0.26, 0], ...A_(0.26, 0.5, 0.34, 0.5, -90, 90, 22), [0, 1]]],
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
    O: [0.68, A_(0.34, 0.5, 0.34, 0.5, 0, 360, 36)],
    P: [0.58, [[0, 1], [0, 0], [0.3, 0], ...A_(0.3, 0.27, 0.28, 0.27, -90, 90, 14), [0, 0.54]]],
    Q: [0.68, A_(0.34, 0.5, 0.34, 0.5, 0, 360, 36), [[0.42, 0.72], [0.68, 1.04]]],
    R: [0.6, [[0, 1], [0, 0], [0.3, 0], ...A_(0.3, 0.27, 0.28, 0.27, -90, 90, 14), [0, 0.54]], [[0.28, 0.54], [0.6, 1]]],
    S: [0.58, [...A_(0.29, 0.25, 0.27, 0.25, -28, -270, 18), ...A_(0.29, 0.75, 0.29, 0.25, -90, 152, 18)]],
    T: [0.62, [[0, 0], [0.62, 0]], [[0.31, 0], [0.31, 1]]],
    U: [0.62, [[0, 0], [0, 0.7], ...A_(0.31, 0.7, 0.31, 0.3, 180, 0, 16), [0.62, 0]]],
    V: [0.66, [[0, 0], [0.33, 1], [0.66, 0]]],
    W: [0.92, [[0, 0], [0.2, 1], [0.46, 0.26], [0.72, 1], [0.92, 0]]],
    X: [0.62, [[0, 0], [0.62, 1]], [[0.62, 0], [0, 1]]],
    Y: [0.64, [[0, 0], [0.32, 0.52], [0.64, 0]], [[0.32, 0.52], [0.32, 1]]],
    Z: [0.58, [[0, 0], [0.58, 0], [0, 1], [0.58, 1]]],
    0: [0.56, A_(0.28, 0.5, 0.28, 0.5, 0, 360, 30)],
    1: [0.34, [[0, 0.22], [0.26, 0], [0.26, 1]]],
    2: [0.56, [...A_(0.28, 0.27, 0.28, 0.27, 180, 372, 16), [0, 1], [0.56, 1]]],
    3: [0.56, [...A_(0.28, 0.25, 0.26, 0.25, -150, 90, 16)], [...A_(0.28, 0.75, 0.28, 0.25, -90, 150, 16)]],
    4: [0.58, [[0.44, 1], [0.44, 0], [0, 0.7], [0.58, 0.7]]],
    5: [0.56, [[0.54, 0], [0.04, 0], [0.01, 0.46], ...A_(0.28, 0.7, 0.28, 0.3, -128, 142, 18)]],
    6: [0.56, [...Q_([0.5, 0], [0.02, 0.14], [0.0, 0.7], 12), ...A_(0.28, 0.7, 0.28, 0.3, 180, 540, 26)]],
    7: [0.56, [[0, 0], [0.56, 0], [0.18, 1]]],
    8: [0.56, A_(0.28, 0.26, 0.24, 0.26, 0, 360, 22), A_(0.28, 0.75, 0.28, 0.25, 0, 360, 22)],
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
