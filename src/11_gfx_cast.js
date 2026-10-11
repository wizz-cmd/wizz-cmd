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
