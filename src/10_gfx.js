/* FIZZ & POP v2.0 - 10_gfx.js  ->  const GFX   (GFX core + world; the sprite DEFINITIONS live in 11_gfx_cast.js)
 * "Abyss Glow": resolution independent, everything is drawn in code, nothing is loaded.  Contract: SPEC_V2 sec. 1-2.
 *
 *  RENDER MODEL
 *   - Main sizes the canvas to k x 256 and calls GFX.setScale(k) (k = output px per logical px, 0.25 steps, 1..8). Game and the
 *     scenes keep drawing in LOGICAL units (256 x 224) under ctx.setTransform(k,0,0,k,0,0).
 *   - Every registry sprite is drawn ONCE per (name, frame, variant, k-bucket) into a cached canvas and blitted with one drawImage
 *     per entity. Baking is lazy (first draw) plus an idle-time warm-up queue; memory is bounded (MAX_PX, least recently used
 *     entries are evicted); GFX.setScale drops everything baked for another bucket.  k-buckets: 1 1.5 2 2.5 3 3.5 4 5 6 8
 *     (a sprite is baked at the smallest bucket >= 0.94 k, so blits are never up-scaled by more than ~6 %).
 *   - Sprites are authored by 11_gfx_cast.js with GFX.define(name, {w, h, frames, pad:{l,r,t,b}, draw(ctx, frame, opts)}).
 *     draw() paints ONE frame in LOGICAL units, origin = top-left of the w x h registry box, under a transform that already
 *     scales by the bake scale; opts = { k: bake scale (output px per logical px, for lwFor(k) / LOD), frame, frames, name,
 *     t: frame / frames (0..1 animation phase), bake: true, w, h (the box), ox, oy }.  Facing is always RIGHT (flip is a draw option, done
 *     by the blit).  ox, oy = where the box origin lies in the baked canvas in OUTPUT px: code that works in output px (NEON.placeSprite style)
 *     does  ctx.setTransform(1,0,0,1,0,0)  and draws its {x: opts.ox, y: opts.oy, k: opts.k} sprite there.
 *     pad = how far the luminous overdraw may extend beyond the box (logical px); GFX.draw(x, y) takes the BOX top-left and
 *     applies the pad itself. A missing pad defaults to 25 % of the box on every side.
 *
 *  PUBLIC API (everything else is private; underscore names are test hooks)
 *   GFX.init()                                   idempotent, cheap (no baking), starts the idle warm-up
 *   GFX.setScale(k)                              bake resolution; drops baked data of other buckets
 *   GFX.define(name, spec)                       register / replace a sprite (see above); returns true, false when malformed
 *   GFX.draw(ctx, name, frame, x, y, opts)       opts: flip, alpha (0..1), white (white silhouette), tint '#rrggbb' (tinted
 *                                                silhouette over the sprite, e.g. frozen ice), glow 0..1 (halo intensity, default 1)
 *                                                unknown names draw a small labelled placeholder (warn once), never throw
 *   GFX.frames(name) / size(name) / has(name)    registry box (size) - unknown -> 0 / {w:0,h:0} / false
 *   GFX.warm(namesOrPrefixes?)                   NEW (additive): bake these sprites (all frames) on idle, e.g. warm('kraken') before round 30
 *   GFX.text(ctx, s, x, y, color, opts)          opts: align 'left'|'center'|'right', scale (default 1), shadow (default true: soft dark
 *                                                halo), outline '#rrggbb', glow (default true), alpha; (x,y) = top-left of the 8x8 cell
 *                                                (glyph cap box = 6 x scale high, 1 x scale below the cell top); returns the width drawn
 *   GFX.textWidth(s, scale)                      8 * scale per glyph (code point)
 *   GFX.levelGlints(ctx, i, map, t)              NEW (optional, additive): travelling glints along the lit top faces (the baked canvas is static)
 *   GFX.levelCanvas(i, map) / bgCanvas(i)        256k x 208k canvases (draw at 0,MAP_Y with size 256 x 208); levelCanvas is transparent
 *   GFX.theme(i) -> {bg, accent, accent2, glow, edge, name}   '#rrggbb' strings (cached read-only object)
 *   GFX.drawLogo(ctx, cx, y, t)                  glass-tube wordmark; returns {total, uy} (logical px width / underline y)
 *   GFX.postFX(ctx, quality)                     2 = bloom 1/4 res + vignette + grain, 1 = bloom 1/8 res + vignette, 0 = off
 *   GFX.particle(ctx, kind, x, y, size, color, alpha, rot?)    cached ADDITIVE sprites ('lighter'; ctx composite/alpha restored), x,y = centre
 *                                                dot: size = core radius (halo reaches 4.2x) | ring: size = ring radius (thin neon line) |
 *                                                spark: size = 4-point star half size (glow 2.4x) | streak: size = full length, head at +x,
 *                                                rot (radians) turns it. Baked at power-of-two pixel sizes, so crisp at every scale and bounded
 *   GFX.sheet()                                  debug canvas of every defined sprite x frame
 *
 *  Colours given to GFX are CSS strings ('#rrggbb', 'rgb()', 'rgba()') or NEON [r,g,b] arrays.
 *  Non-contract extras (tests only): GFX._registry(), _lint(), _timings(), _stats(), _warmNow(ms), _reset(), _undefine(prefix), _postMode('fast'|'neon').
 *
 *  WORLD: levelCanvas / bgCanvas are baked by generators (a stage of 3-8 ms per step). The requested canvas is always finished
 *  synchronously; additionally building round i queues its background and round i+1's level + background (LEVELS is read lazily) for the
 *  idle time, so a round transition normally finds everything cached. levelCanvas is cached per (index, map content) - a custom map under
 *  index 0 (the title's ledges) and round 1's own map coexist; bounded to 4 levels + 4 backgrounds. Sizes: 256 x kL by 208 x kL with kL = bucket
 *  (levels: capped at 6, backgrounds at 4; Game draws them with an explicit 256 x 208 destination, so any size works).
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
   * 1. SCALE
   * ============================================================================================================== */
  const BUCKETS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 8];
  const bucketOf = (k) => { for (let i = 0; i < BUCKETS.length; i++) if (BUCKETS[i] >= k * 0.94) return BUCKETS[i]; return 8; };
  let K = 0;                // exact scale last given to setScale (0 = never set: the first draw adopts the ctx transform)
  let KB = 2;               // bake bucket
  let initDone = false;

  function maxPx() {        // sprite bake budget in pixels (4 bytes each), scaled by the device memory when the browser tells
    let gb = 4;
    try { if (typeof navigator !== 'undefined' && navigator.deviceMemory) gb = navigator.deviceMemory; } catch (e) { /* ignore */ }
    return gb >= 8 ? 24e6 : gb >= 4 ? 16e6 : 8e6;
  }
  let MAX_PX = 16e6;

  const state = { px: 0, clock: 0, bakes: 0, bakeMs: 0, evictions: 0, peakPx: 0, resets: 0, missing: 0 };

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

  /* bake one frame of a (possibly pseudo) def at the current bucket */
  function bakeInto(def, f) {
    const t0 = now(), kb = KB, p = def.pad;
    const pl = Math.ceil(p.l * kb), pr = Math.ceil(p.r * kb), pt = Math.ceil(p.t * kb), pb = Math.ceil(p.b * kb);
    const cw = Math.max(1, Math.ceil(def.w * kb)) + pl + pr, ch = Math.max(1, Math.ceil(def.h * kb)) + pt + pb;
    const cv = makeCanvas(cw, ch), g = cv.getContext('2d');
    g.setTransform(kb, 0, 0, kb, pl, pt);
    try { def.draw(g, f, { k: kb, frame: f, frames: def.frames, name: def.name, t: f / def.frames, bake: true, ox: pl, oy: pt, w: def.w, h: def.h }); }
    catch (e) { def.errors++; warnOnce('bake:' + def.name, 'sprite ' + def.name + ' frame ' + f + ' threw: ' + (e && e.message)); }
    const e = { cv, w: cw, h: ch, pl, pr, pt, pb, bw: def.w, px: cw * ch, last: ++state.clock, white: null, tints: null, gl: null };
    state.px += e.px; state.bakes++; state.bakeMs += now() - t0;
    if (state.px > state.peakPx) state.peakPx = state.px;
    return e;
  }
  function bake(def, f) {
    const e = bakeInto(def, f);
    def.slots[f] = e;
    if (state.px > MAX_PX) evict(e);
    return e;
  }
  function evict(keep) {
    const list = [];
    for (const def of REG.values()) for (let f = 0; f < def.slots.length; f++) { const e = def.slots[f]; if (e && e !== keep) list.push([e, def, f]); }
    list.sort((a, b) => a[0].last - b[0].last);
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
    } else {                                                                                 // no blend modes (very old engines): flat tint
      g.globalCompositeOperation = 'source-atop';
      g.globalAlpha = 0.6; g.fillStyle = key; g.fillRect(0, 0, e.w, e.h);                    // the body takes the tint ...
      g.globalAlpha = 0.18; g.globalCompositeOperation = 'lighter'; g.drawImage(e.cv, 0, 0); // ... and the whole silhouette is a little brighter (ice)
    }
    e.tints.set(key, c); state.px += e.w * e.h; e.px = entryPx(e);
    return c;
  }
  /* halo split for opts.glow: pixels with alpha >= 0.55 are the "core" (contour, body), the rest the halo; core + halo = original */
  function glowOf(e) {
    if (e.gl) return e.gl;
    const w = e.w, h = e.h, core = makeCanvas(w, h), halo = makeCanvas(w, h);
    const sg = e.cv.getContext('2d');
    let id = null;
    try { id = sg.getImageData(0, 0, w, h); } catch (err) { id = null; }
    if (id) {
      const d = id.data, a = new Uint8ClampedArray(d), b = new Uint8ClampedArray(d);
      for (let i = 3; i < d.length; i += 4) { if (d[i] >= 140) b[i] = 0; else a[i] = 0; }
      const mk = (cv, buf) => { const im = cv.getContext('2d').createImageData(w, h); im.data.set(buf); cv.getContext('2d').putImageData(im, 0, 0); };
      mk(core, a); mk(halo, b);
    } else { core.getContext('2d').drawImage(e.cv, 0, 0); }
    e.gl = { core, halo }; e.px = entryPx(e); state.px += 2 * w * h;
    return e.gl;
  }

  /* unknown names: a small labelled placeholder (a dashed magenta box with the name), baked like a sprite, never registered */
  const missing = new Map();
  function missingEntry(name) {
    let e = missing.get(name);
    if (e && e.kb === KB) return e;
    if (e) { state.px -= e.px; missing.delete(name); }
    if (missing.size >= 24) { const k0 = missing.keys().next().value; const o = missing.get(k0); state.px -= o.px; missing.delete(k0); }
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
    e.kb = KB;
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

  function blit(ctx, e, cv, x, y, o, w) {
    const kb = KB, iK = 1 / (K || kb);
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
    e.last = ++state.clock;
    if (o.white) { blit(ctx, e, whiteOf(e), x, y, o); return; }
    if (o.tint) { blit(ctx, e, tintOf(e, o.tint), x, y, o); return; }
    const g = o.glow;
    if (g !== undefined && g !== 1 && g === g) {
      const gl = glowOf(e), gg = g < 0 ? 0 : g > 1.5 ? 1.5 : g;
      blit(ctx, e, gl.core, x, y, o);
      if (gg <= 1) {
        const o2 = { flip: o.flip, alpha: (o.alpha === undefined ? 1 : o.alpha) * gg };
        blit(ctx, e, gl.halo, x, y, o2);
      } else {
        blit(ctx, e, gl.halo, x, y, o);
        const gco = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
        blit(ctx, e, gl.halo, x, y, { flip: o.flip, alpha: (o.alpha === undefined ? 1 : o.alpha) * (gg - 1) });
        ctx.globalCompositeOperation = gco;
      }
      return;
    }
    blit(ctx, e, e.cv, x, y, o);
  }

  /* ----------------------------------------------------------------------------------------------------------
   * idle warm-up: bake what the first seconds need, in small slices, within the memory budget
   * ------------------------------------------------------------------------------------------------------- */
  let warmQ = [], warmHandle = 0;
  const WARM_SLICE_MS = 5;
  const WARM_LIMIT = () => MAX_PX * 0.55;

  function queueWarm(defs, front) {
    const add = [];
    for (const def of defs) for (let f = 0; f < def.frames; f++) if (!def.slots[f]) add.push([def, f]);
    warmQ = front ? add.concat(warmQ) : warmQ.concat(add);
    scheduleWarm();
  }
  function rebuildWarm() {
    warmQ = [];
    const defs = Array.from(REG.values()).filter((d) => !d.lazy).sort((a, b) => a.order - b.order);
    queueWarm(defs);
  }
  function warmStep(budgetMs) {
    const t0 = now();
    let n = 0;
    while (warmQ.length && now() - t0 < budgetMs && state.px < WARM_LIMIT()) {
      const [def, f] = warmQ.shift();
      if (REG.get(def.name) === def && !def.slots[f] && K) { bake(def, f); n++; }
    }
    return n;
  }
  function scheduleWarm() {
    if (warmHandle || !warmQ.length || !initDone) return;
    const run = (deadline) => {
      warmHandle = 0;
      if (!K) return;                                                  // no scale yet: setScale() restarts the warm-up
      if (typeof document !== 'undefined' && document.hidden) { scheduleWarm(); return; }
      const rem = deadline && deadline.timeRemaining ? deadline.timeRemaining() : WARM_SLICE_MS;
      if (rem >= 2) warmStep(Math.min(WARM_SLICE_MS, rem - 1));
      scheduleWarm();
    };
    try {
      if (typeof requestIdleCallback === 'function') warmHandle = requestIdleCallback(run, { timeout: 400 });
      else warmHandle = setTimeout(run, 40);
    } catch (e) { warmHandle = 0; }
  }
  function warm(what) {
    if (what === undefined) { rebuildWarm(); return; }
    const list = Array.isArray(what) ? what : [what];
    const defs = [];
    for (const w of list) for (const def of REG.values()) if (def.name === w || def.name.indexOf(w) === 0) defs.push(def);
    queueWarm(defs, true);
  }

  /* ----------------------------------------------------------------------------------------------------------
   * setScale / init / reset
   * ------------------------------------------------------------------------------------------------------- */
  function dropAll() {
    for (const def of REG.values()) releaseDef(def);
    for (const e of missing.values()) { e.cv.width = 1; e.cv.height = 1; }
    missing.clear();
    state.px = 0;
    fonts.clear(); state.tilePx = 0; dropStrings();
    partCache.clear();
    dropWorld();
    ovCache = null; ovLow = null;
    releaseBloom();
  }
  function setScale(k) {
    k = +k;
    if (!(k > 0)) k = 1;
    k = clamp(Math.round(k * 4) / 4, 1, 8);
    K = k;
    const kb = bucketOf(k);
    if (kb !== KB) { KB = kb; dropAll(); state.resets++; if (initDone) rebuildWarm(); }
    else scheduleWarm();
  }
  function init() {
    if (initDone) return;
    initDone = true;
    MAX_PX = maxPx();
    rebuildWarm();
  }
  function _reset() { dropAll(); warmQ = []; }
  function _undefine(prefix) { let n = 0; for (const [name, def] of Array.from(REG.entries())) if (name.indexOf(prefix) === 0) { releaseDef(def); REG.delete(name); n++; } warmQ = warmQ.filter((q) => REG.get(q[0].name) === q[0]); return n; }

  /* ================================================================================================================
   * 3. TEXT: the stroke font, 8 logical px advance per glyph, glyph tiles baked per (colour, scale, flags, bucket)
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
  function bakeTile(font, ch) {
    const s = font.s, kb = KB, cap = 6 * s, cell = 8 * s;
    const lw = Math.max(cap * 0.08, 1.1 / kb);
    const pad = Math.ceil((lw * 3 + 0.4) * kb);
    const cellPx = Math.ceil(cell * kb), cw = cellPx + 2 * pad;
    if (state.tilePx > TILE_MAX_PX) { for (const fo of fonts.values()) { for (const t of fo.tiles.values()) { t.cv.width = 1; t.cv.height = 1; } fo.tiles.clear(); } state.tilePx = 0; dropStrings(); }
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
    const t = { cv, pad, w: cw };
    font.tiles.set(ch, t);
    state.tilePx += cw * cw;
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
    const s = font.s, kb = KB, cellPx = 8 * s * kb;
    const first = font.tiles.get('A') || bakeTile(font, 'A');            // gives the tile pad of this font
    const pad = first.pad, w = Math.ceil(chars.length * cellPx) + 2 * pad, h = Math.ceil(cellPx) + 2 * pad;
    while (strCache.size >= STR_MAX || strPx + w * h > STR_MAX_PX) { const k0 = strCache.keys().next().value; if (k0 === undefined) break; const o = strCache.get(k0); strPx -= o.w * o.h; o.cv.width = 1; o.cv.height = 1; strCache.delete(k0); }
    const cv = makeCanvas(w, h), g = cv.getContext('2d');
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (ch === ' ') continue;
      const t = font.tiles.get(ch) || bakeTile(font, ch);
      g.drawImage(t.cv, Math.round(i * cellPx), 0);                     // the tile carries its own pad, so origin = cell origin - pad
    }
    const e = { cv, w, h, pad };
    strCache.set(key, e); strPx += w * h;
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
    const iK = 1 / (K || KB), kb = KB;
    const sx = Math.round(x0 / iK) * iK, sy = Math.round(y / iK) * iK;
    const ga = ctx.globalAlpha, a = o.alpha === undefined ? 1 : o.alpha;
    if (a !== 1) ctx.globalAlpha = ga * a;
    let done = false;
    if (chars.length >= 3) {
      const key = font.key + '\u0001' + str;
      let e = strCache.get(key);
      if (e) { strCache.delete(key); strCache.set(key, e); }
      else {
        const n = (strSeen.get(key) || 0) + 1;
        if (strSeen.size > 600) strSeen.clear();
        strSeen.set(key, n);
        if (n >= 3) e = buildString(font, key, chars);
      }
      if (e) { ctx.drawImage(e.cv, sx - e.pad / kb, sy - e.pad / kb, e.w / kb, e.h / kb); done = true; }
    }
    if (!done) {
      for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];
        if (ch === ' ') continue;
        const t = font.tiles.get(ch) || bakeTile(font, ch);
        ctx.drawImage(t.cv, sx + i * cell - t.pad / kb, sy - t.pad / kb, t.w / kb, t.w / kb);
      }
    }
    if (a !== 1) ctx.globalAlpha = ga;
    return w;
  }

  /* ================================================================================================================
   * 4. PARTICLES: cached additive sprites, baked at a power-of-two pixel size so they stay crisp at every scale
   * ============================================================================================================== */
  const partCache = new Map();
  const PART_MAX = 192;
  const PART_E = { dot: 4.4, ring: 1.75, spark: 2.6, streak: 0.62 };      // half extent of the sprite in size units
  const KINDS = { dot: 1, ring: 1, spark: 1, streak: 1 };
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
    const e = PART_E[kind];
    const need = size * 2 * e * K * 0.75;                           // device px of the sprite at this size
    let P = 16; while (P < need && P < 256) P <<= 1;
    const key = kind + '|' + ((c[0] >> 3) << 10 | (c[1] >> 3) << 5 | (c[2] >> 3)) + '|' + P;
    let cv = partCache.get(key);
    if (cv) { partCache.delete(key); partCache.set(key, cv); }
    else {
      if (partCache.size >= PART_MAX) { const k0 = partCache.keys().next().value; const o = partCache.get(k0); o.width = 1; o.height = 1; partCache.delete(k0); }
      cv = bakeParticle(kind, [c[0] >> 3 << 3 | 4, c[1] >> 3 << 3 | 4, c[2] >> 3 << 3 | 4], P);
      partCache.set(key, cv);
    }
    const dw = size * 2 * e, dh = dw * cv.height / cv.width;
    const gco = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = ga * alpha * c[3];
    if (rot) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.drawImage(cv, -dw / 2, -dh / 2, dw, dh); ctx.restore(); }
    else ctx.drawImage(cv, x - dw / 2, y - dh / 2, dw, dh);
    ctx.globalCompositeOperation = gco; ctx.globalAlpha = ga;
  }

  /* ================================================================================================================
   * 5. POST FX: bloom (1/4 or 1/8 res) + vignette + grain, one overlay blit
   * ============================================================================================================== */
  let ovCache = null, ovLow = null;
  const VIG = 0.62, GRAIN = 0.011;
  function vignetteInto(g, W, H, a) {
    const gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.34, W / 2, H / 2, Math.hypot(W, H) * 0.54);
    gr.addColorStop(0, 'rgba(2,3,8,0)'); gr.addColorStop(1, 'rgba(2,3,8,' + a + ')');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  function overlayFor(W, H, withGrain) {
    if (withGrain) {
      if (ovCache && ovCache.W === W && ovCache.H === H) return ovCache.cv;
      if (ovCache) { ovCache.cv.width = 1; ovCache.cv.height = 1; }
      if (ovLow) { ovLow.cv.width = 1; ovLow.cv.height = 1; ovLow = null; }              // only one overlay lives at a time
      const cv = makeCanvas(W, H), g = cv.getContext('2d');
      vignetteInto(g, W, H, VIG);
      N.drawGrain(g, W, H, GRAIN);
      ovCache = { W, H, cv };
      return cv;
    }
    if (ovLow && ovLow.W === W && ovLow.H === H) return ovLow.cv;
    if (ovLow) { ovLow.cv.width = 1; ovLow.cv.height = 1; }
    if (ovCache) { ovCache.cv.width = 1; ovCache.cv.height = 1; ovCache = null; }
    const cv = makeCanvas(W, H);
    vignetteInto(cv.getContext('2d'), W, H, VIG);
    ovLow = { W, H, cv };
    return cv;
  }
  /* bloom, tuned for the software rasteriser: ONE soft bright-pass at 1/4 (q2) or 1/8 (q1) res, a blurred mip chain merged at LOW
   * resolution, then the result is smoothly lifted to 1/2 res and added to the frame with ONE nearest 2x blend (a bilinear 4x upscale
   * of the whole frame alone costs ~7 ms on a CPU raster). Same energy / gains as NEON.bloom. */
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
  const bloomSt = { tick: 0, key: '' };
  function bwk(name, w, h) {
    let c = bpool.get(name);
    if (!c) { c = makeCanvas(w, h); bpool.set(name, c); }
    else if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'low';
    return [c, g];
  }
  function bloomFast(ctx, W, H, q) {
    const cv = ctx.canvas, shift = q >= 2 ? 2 : 3, w2 = Math.max(4, W >> 1), h2 = Math.max(4, H >> 1);
    const key = W + 'x' + H + 'q' + q;
    const period = q >= 2 ? 2 : 3;                  // the soft glow layer is refreshed every 2nd (q2) / 3rd (q1) frame; the blend runs every frame
    const fresh = bloomSt.key !== key || bloomSt.tick % period === 0 || !bpool.get('gb_m');
    bloomSt.tick++; bloomSt.key = key;
    if (fresh) {
      let w = w2, h = h2;
      let [from, g0] = bwk('gb_h', w, h); g0.globalCompositeOperation = 'copy'; g0.drawImage(cv, 0, 0, w, h);          // plain 2x2 box of the frame
      if (shift > 2) { w = Math.max(4, w >> 1); h = Math.max(4, h >> 1); const [c8, g8] = bwk('gb_q', w, h); g8.globalCompositeOperation = 'copy'; g8.drawImage(from, 0, 0, w, h); from = c8; }
      w = Math.max(4, w >> 1); h = Math.max(4, h >> 1);
      const [src, g] = bwk('gb_0', w, h);
      g.globalCompositeOperation = 'copy'; g.drawImage(from, 0, 0, w, h);
      const [t2, tg] = bwk('gb_t', w, h);
      tg.globalCompositeOperation = 'copy'; tg.drawImage(src, 0, 0);                                                    // soft threshold v -> v^4 by self-multiply
      g.globalCompositeOperation = 'multiply'; g.drawImage(t2, 0, 0);
      tg.globalCompositeOperation = 'copy'; tg.drawImage(src, 0, 0); g.drawImage(t2, 0, 0);
      g.globalCompositeOperation = 'lighter'; g.drawImage(src, 0, 0); g.drawImage(src, 0, 0);                          // restore the energy lost by the threshold
      g.globalCompositeOperation = 'source-over';
      const levels = [src];
      for (let i = 1; i < BLOOM_CFG.length; i++) {
        w = Math.max(4, w >> 1); h = Math.max(4, h >> 1);
        const [c, cg] = bwk('gb_' + i, w, h); cg.globalCompositeOperation = 'copy'; cg.drawImage(levels[i - 1], 0, 0, w, h); levels.push(c);
      }
      let acc = null;
      for (let i = levels.length - 1; i >= 0; i--) {                                                                    // blur + merge coarse -> fine at low resolution
        const lv = levels[i], [b, bg] = bwk('gb_b' + i, lv.width, lv.height);
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
    const mid = bpool.get('gb_m');
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(mid, 0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'source-over';
  }
  function releaseBloom() { for (const c of bpool.values()) { c.width = 1; c.height = 1; } bpool.clear(); bloomSt.key = ''; }
  function postFX(ctx, quality) {
    const q = quality === undefined ? 2 : quality | 0;
    if (q <= 0) return;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    if (W < 8 || H < 8) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = true;
    try { if (postMode === 'neon') N.bloom(ctx, W, H, { shift: q >= 2 ? 2 : 3 }); else bloomFast(ctx, W, H, q); } catch (e) { warnOnce('bloom', 'bloom failed: ' + (e && e.message)); }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.drawImage(overlayFor(W, H, q >= 2), 0, 0, W, H);
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
   * cores and lit bodies); edges are pulled away from the cast's hues where the theme allows it (coral = coral-rose vs Fizz magenta,
   * kelp = teal vs Springle lime, volcanic = deep orange vs Crabbit ember, temple = indigo vs Jellop violet). */
  const THEME_DEFS = [
    { name: 'Coral Reef', style: 'coral', bodyDh: -20, bgTint: '#0b0a22', haze: '#7a8cff', low: '#8a3cff', rows: [
      ['#ff6f9c', '#ffb23e', '#3cf2ff', { step: 8.2, seed: 11 }],
      ['#e66cd0', '#ffb23e', '#7affd0', { step: 7.4, seed: 12, dark: 0.3 }],
      ['#d870f0', '#3cf2ff', '#ffb23e', { step: 9.0, seed: 13 }],
      ['#ff9db8', '#7affd0', '#ff8a4a', { step: 8.6, seed: 14, dark: 0.22 }],
      ['#ff5a8a', '#ffe27a', '#9a7cff', { step: 7.8, seed: 15 }],
    ] },
    { name: 'Kelp Forest', style: 'kelp', bodyDh: -10, bgTint: '#041418', haze: '#3cf2c0', low: '#1a8a6a', rows: [
      ['#2fe0a4', '#b6ff3b', '#3cf2ff', { step: 8.4, seed: 21 }],
      ['#7fb860', '#2fe0a4', '#ffe27a', { step: 7.6, seed: 22, dark: 0.3 }],
      ['#35a8d0', '#8aff8a', '#ff8ad0', { step: 9.2, seed: 23 }],
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
      ['#f0a0c0', '#ffd23f', '#c04aff', { step: 9.4, seed: 54, dark: 0.34 }],
      ['#ffd890', '#ff4a2a', '#ffe27a', { step: 9.2, seed: 55, dark: 0.3 }],
    ] },
    { name: 'Abyss Temple', style: 'temple', bodyDh: 14, bgTint: '#0b0924', haze: '#7a7cff', low: '#ffb23e', rows: [
      ['#6c7cff', '#ffd25a', '#3cf2ff', { step: 9.6, seed: 61, dark: 0.34 }],
      ['#4ab8d8', '#ffd25a', '#ff6a8a', { step: 10.0, seed: 62, dark: 0.36 }],
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
   * levelCanvas / bgCanvas: bounded LRU caches + background jobs. A bake is a generator (see paintLevel / paintBg); the requested
   * canvas is always drained synchronously, but the NEXT round's level + backgrounds are prefetched one stage per idle slice
   * (LEVELS is read lazily), so a round transition normally finds everything cached and never hitches.
   * --------------------------------------------------------------------------------------------------------- */
  const levelCache = new Map();              // key "i|map signature" -> {cv, kb, ...}: the title's custom ledge map and a round's own map coexist
  const LEVEL_MAX = 4;
  const sigCache = new WeakMap();
  const sigOf = (map) => { let v = sigCache.get(map); if (v === undefined) { v = map.join(''); sigCache.set(map, v); } return v; };   // maps are read-only data
  const levelScale = () => Math.min(KB, 6);
  const rowsOf = (map) => (Array.isArray(map) && map.length ? map : EMPTY_ROOM);
  const EMPTY_ROOM = Object.freeze(new Array(26).fill('#'.repeat(2) + '.'.repeat(28) + '##'));
  const lkey = (i, rows) => i + '|' + sigOf(rows);

  function evictWorld(cache, max) {
    while (cache.size > max) { const k0 = cache.keys().next().value; const o = cache.get(k0); o.cv.width = 1; o.cv.height = 1; cache.delete(k0); }
  }
  let jobCur = null, jobQ = [], jobHandle = 0, prefetchKey = '';
  function dropWorld() {
    for (const o of levelCache.values()) { o.cv.width = 1; o.cv.height = 1; }
    levelCache.clear();
    for (const o of bgCache.values()) { o.cv.width = 1; o.cv.height = 1; }
    bgCache.clear();
    if (jobCur) { jobCur.cv.width = 1; jobCur.cv.height = 1; jobCur = null; }
    jobQ = []; prefetchKey = '';
    logoCache.length = 0;
  }

  function newJob(kind, i, rows) {
    if (kind === 'L') {
      const kL = levelScale(), cv = makeCanvas(Math.round(LW * kL), Math.round(MAP_H * kL)), g = cv.getContext('2d');
      g.setTransform(kL, 0, 0, kL, 0, -MAP_Y * kL);
      return { kind, i, key: lkey(i, rows), kb: kL, cv, gen: paintLevel(g, buildLevelGeo(rows), themeData(i), kL), ms: 0, done: false, stepMax: 0 };
    }
    const kBg = bgScale(), cv = makeCanvas(Math.round(LW * kBg), Math.round(MAP_H * kBg)), g = cv.getContext('2d');
    return { kind, i, key: i, kb: kBg, cv, gen: paintBg(g, themeData(i), kBg), ms: 0, done: false, stepMax: 0 };
  }
  const scaleOf = (kind) => (kind === 'L' ? levelScale() : bgScale());
  function publishJob(job) {
    job.done = true;
    const cache = job.kind === 'L' ? levelCache : bgCache, old = cache.get(job.key);
    if (old) { old.cv.width = 1; old.cv.height = 1; cache.delete(job.key); }
    cache.set(job.key, { cv: job.cv, kb: job.kb, ms: job.ms });
    timings[job.kind === 'L' ? 'level' : 'bg'] = (timings[job.kind === 'L' ? 'level' : 'bg'] || 0) + job.ms;
    evictWorld(cache, job.kind === 'L' ? LEVEL_MAX : BG_MAX);
  }
  function stepJob(job) {
    const t0 = now();
    const r = job.gen.next();
    const dt = now() - t0;
    job.ms += dt; if (dt > job.stepMax) job.stepMax = dt;
    if (r.done) publishJob(job);
  }
  /* the requested canvas is always finished synchronously; a failing painter must never take the frame down (the partial canvas is published) */
  function drain(job) {
    try { while (!job.done) stepJob(job); }
    catch (e) { warnOnce('world:' + job.kind, 'bake of ' + job.kind + job.i + ' failed: ' + (e && e.message)); if (!job.done) publishJob(job); }
    return job.cv;
  }

  function pump(deadline) {
    jobHandle = 0;
    if (typeof document !== 'undefined' && document.hidden) { schedulePump(); return; }
    while (!jobCur && jobQ.length) {
      const q = jobQ.shift(), e = (q.kind === 'L' ? levelCache : bgCache).get(q.key);
      if (e && e.kb === scaleOf(q.kind)) continue;                                           // already there
      jobCur = newJob(q.kind, q.i, q.rows);
    }
    if (!jobCur) return;
    if (jobCur.kb !== scaleOf(jobCur.kind)) { jobCur.cv.width = 1; jobCur.cv.height = 1; jobCur = null; schedulePump(); return; }
    const timedOut = !deadline || !deadline.timeRemaining || deadline.didTimeout;
    const rem = timedOut ? 99 : deadline.timeRemaining();
    if (rem >= Math.max(4, jobCur.stepMax * 1.15)) {
      const t0 = now(), budget = timedOut ? 12 : rem * 0.8;            // a forced (timed-out) slice may spend up to 12 ms: a busy page must still finish its prefetch
      try { do { stepJob(jobCur); if (jobCur.done) { jobCur = null; break; } } while (now() - t0 + jobCur.stepMax < budget); }
      catch (e) { warnOnce('prefetch', 'prefetch failed: ' + (e && e.message)); jobCur = null; }
    }
    schedulePump();
  }
  function schedulePump() {
    if (jobHandle || (!jobCur && !jobQ.length)) return;
    try {
      if (typeof requestIdleCallback === 'function') jobHandle = requestIdleCallback(pump, { timeout: 1500 });
      else jobHandle = setTimeout(() => pump(null), 60);
    } catch (e) { jobHandle = 0; }
  }
  /* after round i was built: queue its background and the next round's level + background (once per index and scale) */
  function schedulePrefetch(i) {
    const key = i + '|' + KB;
    if (prefetchKey === key) return;
    prefetchKey = key;
    let L = null;
    try { L = typeof LEVELS !== 'undefined' && Array.isArray(LEVELS) ? LEVELS : null; } catch (e) { L = null; }
    const want = [['B', i, null]];
    if (L && i + 1 < Math.min(30, L.length) && L[i + 1] && Array.isArray(L[i + 1].map)) { want.push(['L', i + 1, L[i + 1].map]); want.push(['B', i + 1, null]); }
    for (const [kind, j, rows] of want) {
      const k = kind === 'L' ? lkey(j, rows) : j, e = (kind === 'L' ? levelCache : bgCache).get(k);
      if (e && e.kb === scaleOf(kind)) continue;
      if (jobCur && jobCur.kind === kind && jobCur.key === k) continue;
      if (jobQ.some((q) => q.kind === kind && q.key === k)) continue;
      jobQ.push({ kind, i: j, key: k, rows });
    }
    schedulePump();
  }

  function levelCanvas(i, map) {
    i = clamp(i | 0, 0, 29);
    const kL = levelScale(), rows = rowsOf(map), key = lkey(i, rows);
    const e = levelCache.get(key);
    if (e && e.kb === kL) { levelCache.delete(key); levelCache.set(key, e); schedulePrefetch(i); return e.cv; }
    if (e) { e.cv.width = 1; e.cv.height = 1; levelCache.delete(key); }
    let job;
    if (jobCur && jobCur.kind === 'L' && jobCur.key === key && jobCur.kb === kL) { job = jobCur; jobCur = null; } else job = newJob('L', i, rows);
    drain(job);
    schedulePrefetch(i);
    return job.cv;
  }
  /* ================================================================================================================
   * 8. BACKGROUNDS (bgCanvas): opaque 256k x 208k. Near-black gradient tinted per theme, soft god-rays, 1-3 huge distant
   *    silhouettes per theme (jellyfish / kelp / hull ribs / crystals / vents / pillars) drawn as faint luminous contours on ONE
   *    low-resolution light layer that is blurred once and added, fog, bokeh, a little dither against banding. Static: the Game
   *    layers the moving plankton on top (GFX.particle).
   * ============================================================================================================== */
  const bgCache = new Map();
  const BG_MAX = 4;
  const bgScale = () => Math.min(KB, 4);
  const logoCache = [];

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

  function* paintBg(g, th, kBg) {
    const Rn = N.rng(th.seed * 2654435 + 9);
    g.setTransform(kBg, 0, 0, kBg, 0, 0);
    const gr = g.createLinearGradient(0, 0, 0, MAP_H);
    gr.addColorStop(0, rgba(th.bgTop, 1)); gr.addColorStop(0.35, rgba(mixc(th.bgTop, th.bgMid, 0.7), 1)); gr.addColorStop(0.75, rgba(th.bgMid, 1)); gr.addColorStop(1, rgba(th.bgBot, 1));
    g.fillStyle = gr; g.fillRect(0, 0, LW, MAP_H);
    // ONE low-resolution light layer: god-rays + silhouettes, blurred once, added with one blend
    const kLay = kBg / 3, lw = Math.max(8, Math.ceil(LW * kLay)), lh = Math.max(8, Math.ceil(MAP_H * kLay));
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
    const silSeed = th.seed * 7717 + 1;
    if (mirror) g1.setTransform(-lw / LW, 0, 0, lh / MAP_H, lw, 0);
    SIL[th.style](g1, th, N.rng(silSeed));
    yield;
    const c2 = makeCanvas(lw, lh), g2 = c2.getContext('2d');
    g2.setTransform(1, 0, 0, 1, 0, 0); g2.globalCompositeOperation = 'copy';
    try { g2.filter = 'blur(1.1px)'; } catch (e) { /* no filter support */ }
    g2.drawImage(c1, 0, 0);
    try { g2.filter = 'none'; } catch (e) { /* ignore */ }
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'lighter'; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'low';
    g.drawImage(c2, 0, 0, g.canvas.width, g.canvas.height);
    g.restore();
    c1.width = 1; c1.height = 1; c2.width = 1; c2.height = 1;
    yield;
    const sharp = SIL_SHARP[th.style];                       // structural silhouettes also get a crisp faint pass on top of their soft glow
    if (sharp) { g.save(); if (mirror) g.setTransform(-kBg, 0, 0, kBg, g.canvas.width, 0); g.globalAlpha = sharp; SIL[th.style](g, th, N.rng(silSeed), true); g.restore(); }
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
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); N.drawGrain(g, g.canvas.width, g.canvas.height, 0.016); g.restore();
  }

  function bgCanvas(i) {
    i = clamp(i | 0, 0, 29);
    const kBg = bgScale();
    const e = bgCache.get(i);
    if (e && e.kb === kBg) { bgCache.delete(i); bgCache.set(i, e); return e.cv; }
    if (e) { e.cv.width = 1; e.cv.height = 1; bgCache.delete(i); }
    let job;
    if (jobCur && jobCur.kind === 'B' && jobCur.key === i && jobCur.kb === kBg) { job = jobCur; jobCur = null; } else job = newJob('B', i);
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
  function buildLogo(kb) {
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
    }
    return { kb, dark, lit, pad, Wc, Hc, G };
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
    let L = logoCache[0];
    if (!L || L.kb !== KB) {
      if (L) { L.dark.width = 1; L.lit.width = 1; }
      L = logoCache[0] = timed('logo', () => buildLogo(KB));
    }
    const kb = KB, cap = LOGO_CAP, track = LOGO_TRACK, G = L.G;
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
  function sheet() {
    const defs = Array.from(REG.values()).sort((a, b) => a.order - b.order);
    const s = 3, GAP = 10, LABEL = 20, MAXW = 1800;
    const cells = defs.map((d) => ({ d, cw: Math.ceil((d.w + d.pad.l + d.pad.r) * s) + GAP, ch: Math.ceil((d.h + d.pad.t + d.pad.b) * s) + GAP + LABEL }));
    let x = GAP, y = GAP, rowH = 0, W = 0;
    const pos = [];
    for (const c of cells) {
      const cw = Math.max(c.cw * c.d.frames, c.cw);
      if (x + c.cw > MAXW && x > GAP) { x = GAP; y += rowH; rowH = 0; }
      pos.push([x, y]);
      x += cw > MAXW - GAP ? MAXW : cw;
      if (x > W) W = x;
      rowH = Math.max(rowH, c.ch);
    }
    const Wc = Math.max(320, Math.min(W + GAP, 4096)), Hc = Math.max(80, Math.min(y + rowH + GAP, 8192));
    const cv = makeCanvas(Wc, Hc), g = cv.getContext('2d');
    g.fillStyle = '#05070f'; g.fillRect(0, 0, Wc, Hc);
    g.strokeStyle = 'rgba(60,242,255,0.06)'; g.lineWidth = 1;
    for (let gx = 0; gx < Wc; gx += 24) { g.beginPath(); g.moveTo(gx + 0.5, 0); g.lineTo(gx + 0.5, Hc); g.stroke(); }
    for (let gy = 0; gy < Hc; gy += 24) { g.beginPath(); g.moveTo(0, gy + 0.5); g.lineTo(Wc, gy + 0.5); g.stroke(); }
    if (!defs.length) { N.drawText(g, 'NO SPRITES DEFINED', 20, 24, 14, { col: RGB.magenta, track: 0.5, lw: 1.4 }); return cv; }
    cells.forEach((c, i) => {
      const d = c.d, [px, py] = pos[i];
      g.save();
      N.drawText(g, d.name + ' x' + d.frames, px, py + 2, 7, { col: mixc(RGB.cyan, WHITE, 0.4), track: 0.4, lw: 0.9, halo: 0.3, hot: 0.4 });
      g.restore();
      for (let f = 0; f < d.frames; f++) {
        const ox = px + f * c.cw, oy = py + LABEL;
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
    let entries = 0;
    for (const d of REG.values()) for (const e of d.slots) if (e) entries++;
    return { k: K, kb: KB, px: state.px, maxPx: MAX_PX, entries, bakes: state.bakes, bakeMs: state.bakeMs, evictions: state.evictions, peakPx: state.peakPx, resets: state.resets,
      jobs: jobQ.length + (jobCur ? 1 : 0), tilePx: state.tilePx, fonts: fonts.size, strings: strCache.size, stringPx: strPx, particles: partCache.size, levels: levelCache.size, bgs: bgCache.size, missing: missing.size, defs: REG.size, warmQueue: warmQ.length,
      worldPx: Array.from(levelCache.values()).concat(Array.from(bgCache.values())).reduce((a, o) => a + o.cv.width * o.cv.height, 0) };
  }
  function _warmNow(ms) { if (!K) setScale(2); return warmStep(ms === undefined ? 50 : ms); }

  return {
    init, setScale, define, draw, frames, size, has, warm,
    text, textWidth, levelCanvas, bgCanvas, levelGlints, theme, drawLogo, postFX, particle, sheet,
    _registry, _lint, _timings, _stats, _warmNow, _reset, _undefine, _postMode, _themeData: themeData, _softBubble: softBubble,
  };
})();
