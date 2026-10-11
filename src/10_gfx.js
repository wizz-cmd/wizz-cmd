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
