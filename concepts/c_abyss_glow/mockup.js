(() => { "use strict";
/* ABYSS GLOW — core: palette, maths, neon-stroke primitives, glow primitives, bloom, procedural stroke font.
 * Everything in this file is resolution independent: callers pass a transform (units) and widths are in
 * the current transform's units. Nothing here touches images, fonts or the network.
 */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/* Palette (see palette.json). Ten named colours; everything else is derived by mixing. */
const PAL = {
  void: '#05070f', abyss: '#0b1a33', cyan: '#3cf2ff', magenta: '#ff3ea5', lime: '#b6ff3b',
  amber: '#ffb23e', violet: '#8a5cff', white: '#eaffff', ember: '#ff6a3d', cobalt: '#3d7bff',
};
const RGB = {};
for (const k in PAL) RGB[k] = hex(PAL[k]);
RGB.crimson = hex('#ff2a2a');      // angry state: ember pushed to pure red, >= 30 degrees of hue away from Fizz's magenta (derived, not a separate palette entry)
RGB.purple = mixc(RGB.violet, RGB.magenta, 0.42);   // Kraken King
RGB.ink = hex('#04060d');

function mixc(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
function rgba(c, a) {
  a = a < 0 ? 0 : a > 1 ? 1 : a;
  return 'rgba(' + ((c[0] + 0.5) | 0) + ',' + ((c[1] + 0.5) | 0) + ',' + ((c[2] + 0.5) | 0) + ',' + a.toFixed(3) + ')';
}
const WHITE = RGB.white;
const hot = (c, t = 0.7) => mixc(c, WHITE, t);

/* tiny seeded RNG (mulberry32) — U.rng from the game's 00_shared.js is used when present */
function rng(seed) {
  if (typeof U !== 'undefined' && U.rng) return U.rng(seed);
  let s = seed >>> 0;
  const next = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, float: (a = 0, b = 1) => a + next() * (b - a), int: (a, b) => a + Math.floor(next() * (b - a + 1)), pick: (arr) => arr[Math.floor(next() * arr.length)], chance: (p) => next() < p };
}

const _scratch = {};
function scratch(name, w, h) {
  let c = _scratch[name];
  if (!c) { c = _scratch[name] = document.createElement('canvas'); }
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  return c;
}

/* ---------------------------------------------------------------------------------------------
 * NEON STROKE: the one primitive the whole look is built from.
 * soft halo (2 wide faint passes) + coloured core + white-hot centre line. All additive.
 * w is in current-transform units. o: {a, halo, hot, grad:[x0,y0,x1,y1]}
 * ------------------------------------------------------------------------------------------- */
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

/* additive soft radial light — drawn from a cached 128 px gradient sprite per (quantised) colour:
 * one drawImage instead of creating a gradient + shading a big rect every call (this is the single biggest CPU saver). */
const _glowSprites = {};
function glowSprite(col) {
  const key = ((col[0] >> 3) << 10) | ((col[1] >> 3) << 5) | (col[2] >> 3);
  let c = _glowSprites[key];
  if (!c) {
    c = _glowSprites[key] = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64), q = [(col[0] >> 3) << 3, (col[1] >> 3) << 3, (col[2] >> 3) << 3];
    gr.addColorStop(0, rgba(q, 1)); gr.addColorStop(0.14, rgba(q, 0.68)); gr.addColorStop(0.3, rgba(q, 0.40)); gr.addColorStop(0.52, rgba(q, 0.17)); gr.addColorStop(0.76, rgba(q, 0.05)); gr.addColorStop(1, rgba(q, 0));
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }
  return c;
}
function glow(ctx, x, y, r, col, a, sy) {
  if (a <= 0.003 || r <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha *= a > 1 ? 1 : a;
  ctx.translate(x, y); if (sy) ctx.scale(1, sy);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(glowSprite(col), -r, -r, r * 2, r * 2);
  if (a > 1) { ctx.globalAlpha = a - 1; ctx.drawImage(glowSprite(col), -r, -r, r * 2, r * 2); }
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

/* path helpers */
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
/* variable-width ribbon around a dense spine: wfn(u in 0..1) = half width. Returns {path, spine}. */
function taper(spine, wfn) {
  const n = spine.length, L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = spine[Math.max(0, i - 1)], b = spine[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const hw = wfn(i / (n - 1));
    L.push([spine[i][0] - dy * hw, spine[i][1] + dx * hw]);
    R.push([spine[i][0] + dy * hw, spine[i][1] - dx * hw]);
  }
  const p = new Path2D();
  p.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < n; i++) p.lineTo(L[i][0], L[i][1]);
  for (let i = n - 1; i >= 0; i--) p.lineTo(R[i][0], R[i][1]);
  p.closePath();
  return p;
}
function spinePath(spine) { return poly(spine, false); }

/* ---------------------------------------------------------------------------------------------
 * BLOOM: bright-pass -> half-res mip chain -> blurred -> additive composite back.
 * This is the "bloom = blurred glow layers rendered at reduced resolution" of the brief.
 * ------------------------------------------------------------------------------------------- */
function bloom(ctx, W, H, o) {
  o = o || {};
  const cv = ctx.canvas;
  const cfg = o.levels || [[1.2, 0.6], [2.0, 0.6], [2.6, 0.36], [3.2, 0.2]];   // [blur px, gain] for the /4 /8 /16 /32 levels
  const mk = (name, w, h) => { const c = scratch(name, w, h), g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'low'; return [c, g]; };
  // /2 plain downsample (no ops at the big size), then ONE soft bright-pass at /4
  let w = W >> 1, h = H >> 1;
  const [c2, g2] = mk('bh', w, h); g2.globalCompositeOperation = 'copy'; g2.drawImage(cv, 0, 0, w, h);
  w >>= 1; h >>= 1;
  let [src, g] = mk('bl0', w, h);
  g.globalCompositeOperation = 'copy'; g.drawImage(c2, 0, 0, w, h);
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
    bg.setTransform(1, 0, 0, 1, 0, 0); bg.globalCompositeOperation = 'copy'; bg.filter = 'blur(' + cfg[i][0] + 'px)'; bg.drawImage(c, 0, 0); bg.filter = 'none';
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

/* ---------------------------------------------------------------------------------------------
 * STROKE FONT: thin, wide-tracked geometric sans drawn as polylines (cap height = 1, x right, y down).
 * ------------------------------------------------------------------------------------------- */
const A_ = arcPts, Q_ = quadPts;
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
};
const _glyphCache = {};
function glyphPaths(ch) {
  const key = ch.toUpperCase();
  const g = GLYPH[key] || GLYPH['?'];
  return g;
}
/* width of a string in em (cap-height = 1) */
function textWidth(str, track) {
  track = track === undefined ? 0.46 : track;
  let w = 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) w += glyphPaths(s[i])[0] + track;
  return w - track;
}
/* draws str with its top-left at (x,y) in the CURRENT transform units; cap = cap height in those units.
 * o: {col, lw (stroke width in units), track, align, a, halo, hot, mono} */
function drawText(ctx, str, x, y, cap, o) {
  o = o || {};
  const track = o.track === undefined ? 0.46 : o.track;
  const col = o.col || RGB.white;
  const s = String(str);
  const tw = textWidth(s, track) * cap;
  let cx = o.align === 'center' ? x - tw / 2 : o.align === 'right' ? x - tw : x;
  const lw = o.lw || cap * 0.085;
  const path = new Path2D();
  for (let i = 0; i < s.length; i++) {
    const g = glyphPaths(s[i]);
    const gw = o.mono ? Math.max(g[0], 0.56) : g[0];
    const off = o.mono ? (gw - g[0]) / 2 : 0;
    for (let j = 1; j < g.length; j++) {
      const st = g[j];
      path.moveTo(cx + (st[0][0] + off) * cap, y + st[0][1] * cap);
      for (let q = 1; q < st.length; q++) path.lineTo(cx + (st[q][0] + off) * cap, y + st[q][1] * cap);
    }
    cx += (gw + track) * cap;
  }
  neon(ctx, path, col, lw, { a: o.a, halo: o.halo === undefined ? 0.8 : o.halo, hot: o.hot === undefined ? 0.6 : o.hot });
  return tw;
}
/* the path of a single glyph run, for logo use (returns Path2D in current units) */
function textPath(str, x, y, cap, track, mono) {
  track = track === undefined ? 0.46 : track;
  const s = String(str);
  const path = new Path2D();
  let cx = x;
  for (let i = 0; i < s.length; i++) {
    const g = glyphPaths(s[i]);
    const gw = mono ? Math.max(g[0], 0.56) : g[0];
    const off = mono ? (gw - g[0]) / 2 : 0;
    for (let j = 1; j < g.length; j++) {
      const st = g[j];
      path.moveTo(cx + (st[0][0] + off) * cap, y + st[0][1] * cap);
      for (let q = 1; q < st.length; q++) path.lineTo(cx + (st[q][0] + off) * cap, y + st[q][1] * cap);
    }
    cx += (gw + track) * cap;
  }
  return path;
}

/* film grain / dither: a cached 128 px black/white noise tile (alpha ~ a), composited normally — kills banding in the dark gradients */
const _grainTiles = {};
function drawGrain(ctx, W, H, a) {
  a = a === undefined ? 0.03 : a;
  let tile = _grainTiles[a];
  if (!tile) {
    tile = _grainTiles[a] = document.createElement('canvas'); tile.width = tile.height = 128;
    const g = tile.getContext('2d'), im = g.createImageData(128, 128), R = rng(99);
    for (let i = 0; i < im.data.length; i += 4) { const v = R.next() < 0.5 ? 0 : 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = Math.round(255 * a * (0.4 + 0.6 * R.next())); }
    g.putImageData(im, 0, 0);
  }
  ctx.save(); ctx.fillStyle = ctx.createPattern(tile, 'repeat'); ctx.fillRect(0, 0, W, H); ctx.restore();
}
/* ABYSS GLOW — world: background (gradient, giant distant jellyfish, fog, plankton), crystal platforms, vignette.
 * All "drawX(ctx, ...)" functions work in OUTPUT pixels unless a function says it works in logical units.
 */
const LW = 256, LH = 224, TILE = 8, MAPY = 16;

/* ------------------------------------------------------------------ background */
function bgGradient(ctx, W, H, o) {
  o = o || {};
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#060d22');
  g.addColorStop(0.35, '#050b1c');
  g.addColorStop(0.75, '#03070f');
  g.addColorStop(1, '#02040a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // "surface light" haze pouring in from above + a deep abyss tint below (the only two large-scale light sources: top = cool cyan, bottom = violet)
  glow(ctx, W * (o.hx === undefined ? 0.5 : o.hx), -H * 0.06, H * 0.85, RGB.cyan, 0.075, 0.8);
  glow(ctx, W * 0.5, H * 1.06, H * 0.62, RGB.violet, 0.06, 0.55);
}

/* one giant distant jellyfish, drawn in unit space (bell radius 1, centre at origin) */
function farJelly(g, j, t) {
  const pulse = 1 + Math.sin(t * 0.8 + j.ph) * 0.045;
  const sz = j.sz;
  g.save();
  g.translate(j.x, j.y + Math.sin(t * 0.35 + j.ph) * sz * 0.05);
  g.rotate(j.rot || 0);
  g.scale(sz * pulse, sz / pulse);
  const bell = new Path2D('M -1 0.12 C -1.02 -0.78 -0.55 -1.08 0 -1.08 C 0.55 -1.08 1.02 -0.78 1 0.12 C 0.86 0.2 0.72 0.1 0.6 0.18 C 0.45 0.1 0.3 0.22 0.15 0.14 C 0 0.22 -0.15 0.1 -0.3 0.16 C -0.45 0.1 -0.62 0.22 -0.74 0.14 C -0.86 0.2 -0.94 0.12 -1 0.12 Z');
  const fg = g.createRadialGradient(0, -0.2, 0.05, 0, -0.2, 1.1);
  fg.addColorStop(0, rgba(j.col, 0.055 * j.a));      // transparent core ...
  fg.addColorStop(0.62, rgba(j.col, 0.12 * j.a));
  fg.addColorStop(1, rgba(j.col, 0.24 * j.a));       // ... luminous membrane toward the rim (fresnel)
  g.fillStyle = fg; g.fill(bell);
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.lineWidth = 0.03; g.strokeStyle = rgba(hot(j.col, 0.35), 0.62 * j.a); g.stroke(bell);
  g.lineWidth = 0.013;
  // radial canals + inner ring
  for (let i = -3; i <= 3; i++) {
    const p = new Path2D(); p.moveTo(0, -0.98); p.quadraticCurveTo(i * 0.26, -0.5, i * 0.34, 0.05);
    g.strokeStyle = rgba(j.col, 0.2 * j.a); g.stroke(p);
  }
  g.strokeStyle = rgba(hot(j.col, 0.45), 0.3 * j.a);
  g.stroke(new Path2D('M -0.5 -0.26 C -0.5 -0.62 0.5 -0.62 0.5 -0.26'));
  // bio-luminescent dots along the rim
  for (let i = 0; i < 13; i++) {
    const a = Math.PI * (1.04 + i * 0.075), px = Math.cos(a) * 0.93, py = 0.1 + Math.sin(a) * 1.0 * 0.0 - 0.0;
    const tw = 0.5 + 0.5 * Math.sin(t * 1.3 + i * 1.9 + j.ph);
    g.fillStyle = rgba(hot(j.col, 0.6), (0.2 + 0.4 * tw) * j.a); g.beginPath(); g.arc(-0.93 + i * 0.155, 0.09 + Math.sin(i * 1.7) * 0.025, 0.021, 0, TAU); g.fill();
  }
  // oral arms: three curling ribbons under the bell
  for (let i = -1; i <= 1; i++) {
    const p = new Path2D(); p.moveTo(i * 0.18, 0.1);
    for (let s = 1; s <= 10; s++) { const u = s / 10; p.lineTo(i * 0.18 + Math.sin(t * 0.8 + u * 5 + i * 2 + j.ph) * 0.1 * u, 0.1 + u * 1.35); }
    g.lineWidth = 0.034; g.strokeStyle = rgba(hot(j.col, 0.2), 0.3 * j.a); g.stroke(p);
  }
  // tentacles: one polyline each, alpha fading down its length by a gradient (not one stroke per segment)
  for (let i = 0; i < 11; i++) {
    const x0 = -0.9 + i * 0.18, len = 1.9 + (i % 3) * 0.5;
    const p = new Path2D(); p.moveTo(x0, 0.15);
    for (let s = 1; s <= 8; s++) { const u = s / 8; p.lineTo(x0 + Math.sin(t * 0.7 + u * 5 + i) * 0.1 * u, 0.15 + u * len); }
    const tg = g.createLinearGradient(0, 0.15, 0, 0.15 + len); tg.addColorStop(0, rgba(j.col, 0.36 * j.a)); tg.addColorStop(1, rgba(j.col, 0));
    g.lineWidth = 0.014; g.strokeStyle = tg; g.stroke(p);
  }
  g.restore();
}

const FAR_JELLIES = [
  { x: 0.185, y: 0.21, sz: 0.125, col: mixc(RGB.cobalt, RGB.cyan, 0.25), a: 0.62, ph: 0.3, rot: -0.22 },   // cool teal-blue: never the violet of Jellop in front of it
  { x: 0.81, y: 0.31, sz: 0.1, col: mixc(RGB.cobalt, RGB.violet, 0.55), a: 0.62, ph: 2.1, rot: 0.2 },
  { x: 0.53, y: 0.84, sz: 0.066, col: mixc(RGB.violet, RGB.magenta, 0.5), a: 0.6, ph: 4.0, rot: 0.08 },
];
/* one low-resolution light layer: surface god-rays + the giant distant jellyfish, blurred ONCE and added with ONE full-screen blend */
function drawFarJellies(ctx, W, H, t, list, shaftA) {
  const k = 3, w = Math.ceil(W / k), h = Math.ceil(H / k);
  const c = scratch('farj', w, h), g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, w, h);
  if (shaftA) shaftsInto(g, w, h, t, shaftA * 1.4);
  for (const j of (list || FAR_JELLIES)) farJelly(g, { x: j.x * w, y: j.y * h, sz: j.sz * w, col: j.col, a: j.a, ph: j.ph, rot: j.rot }, t);
  // ONE filtered copy (a filter set while drawing would be re-applied to every stroke)
  const c2 = scratch('farj2', w, h), g2 = c2.getContext('2d');
  g2.setTransform(1, 0, 0, 1, 0, 0); g2.globalCompositeOperation = 'copy'; g2.filter = 'blur(1.1px)'; g2.drawImage(c, 0, 0); g2.filter = 'none';
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';
  ctx.drawImage(c2, 0, 0, W, H);
  ctx.restore();
}

/* drifting plankton: fine specks (far) — deterministic from seed, animated by t */
function drawPlankton(ctx, W, H, t, o) {
  o = o || {};
  const n = o.n || 150, R = rng(o.seed || 7), sc = W / 1024;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const x0 = R.float(0, W), y0 = R.float(0, H);
    const depth = R.float(0.25, 1);              // 1 = near
    const vx = R.float(-4, 4) * depth, vy = R.float(-9, -2) * depth;   // slowly rising
    const x = ((x0 + t * vx * sc + Math.sin(t * 0.4 + i) * 6 * depth * sc) % W + W) % W;
    const y = ((y0 + t * vy * sc) % H + H) % H;
    const r = (0.5 + depth * 1.1) * sc * 1.1 * (R.chance(0.1) ? 1.7 : 1);
    const tw = 0.55 + 0.45 * Math.sin(t * R.float(0.8, 2.6) + i * 1.7);
    const pick = R.next();
    const col = pick < 0.62 ? RGB.cyan : pick < 0.78 ? RGB.white : pick < 0.88 ? RGB.violet : pick < 0.95 ? RGB.magenta : RGB.lime;
    const a = (0.16 + depth * 0.5) * tw * (o.a === undefined ? 1 : o.a);
    ctx.fillStyle = rgba(hot(col, 0.4), a);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    if (r > 1.6 * sc) { glow(ctx, x, y, r * 5, col, a * 0.35); }
  }
  ctx.restore();
}

/* out-of-focus bokeh motes in the foreground (very low alpha — depth, never clutter) */
function drawBokeh(ctx, W, H, t, o) {
  o = o || {};
  const R = rng(o.seed || 31), n = o.n || 14, sc = W / 1024;
  for (let i = 0; i < n; i++) {
    const depth = R.float(0.6, 1.4);
    const x = ((R.float(0, W) + t * R.float(-8, 8) * sc * depth) % W + W) % W;
    const y = ((R.float(0, H) - t * R.float(6, 14) * sc * depth) % H + H) % H;
    const r = R.float(8, 22) * sc * depth;
    const col = R.pick([RGB.cyan, RGB.cyan, RGB.violet, RGB.magenta]);
    const a = R.float(0.035, 0.075) * (o.a === undefined ? 1 : o.a);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgba(col, a * 0.5); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = rgba(hot(col, 0.3), a * 1.2); ctx.lineWidth = 1.2 * sc; ctx.stroke();
    ctx.restore();
  }
}

function drawFog(ctx, W, H, t, o) {
  o = o || {};
  const R = rng(o.seed || 11);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    const x = R.float(0.05, 0.95) * W + Math.sin(t * 0.07 + i * 2) * W * 0.03;
    const y = R.float(0.15, 0.95) * H;
    glow(ctx, x, y, R.float(0.3, 0.55) * W, i % 2 ? RGB.cobalt : RGB.violet, 0.013 * (o.a === undefined ? 1 : o.a), 0.45);
  }
  ctx.restore();
}

/* god-rays from the surface: a few wide slanted shafts, each = 4 nested soft layers (no hard edges), slowly swaying (live layer) */
function shaftsInto(g, w, h, t, A, n) {
  n = n || 4;
  g.save(); g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const cx = w * (0.14 + i * (0.72 / Math.max(1, n - 1))) + Math.sin(t * 0.11 + i * 1.7) * w * 0.018;
    const slant = w * (0.2 + 0.05 * Math.sin(i * 2.3)), len = h * (0.78 + 0.08 * Math.sin(i * 1.3));
    const sway = 0.82 + 0.18 * Math.sin(t * 0.35 + i * 2.1);
    for (let L = 0; L < 4; L++) {
      const wt = w * (0.012 + 0.016 * L), wb = w * (0.04 + 0.04 * L);
      const gr = g.createLinearGradient(0, 0, 0, len);
      gr.addColorStop(0, rgba(RGB.cyan, 0.05 * A * sway)); gr.addColorStop(0.55, rgba(RGB.cyan, 0.018 * A * sway)); gr.addColorStop(1, rgba(RGB.cyan, 0));
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(cx - wt, 0); g.lineTo(cx + wt, 0); g.lineTo(cx + slant + wb, len); g.lineTo(cx + slant - wb, len); g.closePath(); g.fill();
    }
  }
  g.restore();
}

const _bgCache = {};
function drawBackground(ctx, W, H, t, o) {
  o = o || {};
  const key = [W, H, o.seed || 7, o.shafts === false ? 0 : 1, o.hx === undefined ? 0.5 : o.hx].join('|');
  let c = _bgCache[key];
  if (!c) {   // static layer: gradient + haze + depth fog + shafts. Slow drift is faked by the live layers on top.
    c = _bgCache[key] = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    bgGradient(g, W, H, o); drawFog(g, W, H, t, o);
  }
  prof(ctx);
  ctx.drawImage(c, 0, 0); prof(ctx, 'bg.blit');
  drawFarJellies(ctx, W, H, t, o.jellies, o.shafts === false ? 0 : (o.shaftA === undefined ? 1 : o.shaftA)); prof(ctx, 'bg.jellies+rays');
  drawPlankton(ctx, W, H, t, { seed: o.seed || 7, n: o.plankton || 150 });
}

/* vignette + grain baked into ONE overlay bitmap per size (static) */
const _ovCache = {};
function drawFinish(ctx, W, H, vig, grain) {
  const key = W + 'x' + H + '|' + vig + '|' + grain;
  let c = _ovCache[key];
  if (!c) {
    c = _ovCache[key] = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    drawVignette(g, W, H, vig); drawGrain(g, W, H, grain);
  }
  ctx.drawImage(c, 0, 0);
}

function drawVignette(ctx, W, H, a) {
  a = a === undefined ? 0.55 : a;
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.34, W / 2, H / 2, Math.hypot(W, H) * 0.54);
  g.addColorStop(0, 'rgba(2,3,8,0)'); g.addColorStop(1, 'rgba(2,3,8,' + a + ')');
  ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
}

/* ------------------------------------------------------------------ crystal platforms */
/* Level geometry is derived from the REAL map: solid tiles -> directed boundary edges -> closed loops
 * (clockwise around solid) -> collinear merge -> chamfered convex corners. Same geometry feeds fill,
 * facet lattice, bright top edges, side edges. Built once per level and cached. */
const _levelGeo = new Map();
function buildLevelGeo(map) {
  const key = map.join('');
  if (_levelGeo.has(key)) return _levelGeo.get(key);
  const R = map.length, Cn = map[0].length;
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
        else if (cands.length > 1) { // prefer a right turn (keeps loops tight around solid)
          const dx = e.x1 - e.x0, dy = e.y1 - e.y0;
          cands.sort((a, b) => (dx * (b.y1 - b.y0) - dy * (b.x1 - b.x0)) - (dx * (a.y1 - a.y0) - dy * (a.x1 - a.x0)));
          nxt = cands[0];
        }
      }
      e = nxt;
    }
    if (pts.length > 2) loops.push(pts);
  }
  // merge collinear vertices
  const merged = loops.map((L) => {
    const n = L.length, out = [];
    for (let i = 0; i < n; i++) {
      const a = L[(i - 1 + n) % n], b = L[i], c = L[(i + 1) % n];
      const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (cr !== 0) out.push(b);
    }
    return out;
  });
  const CH = 0.3;  // chamfer in tiles
  const fillPath = new Path2D();
  const segs = [];     // {x0,y0,x1,y1,cls} in logical px
  const toX = (x) => x * TILE, toY = (y) => MAPY + y * TILE;
  for (const L of merged) {
    const n = L.length, P = [];
    for (let i = 0; i < n; i++) {
      const a = L[(i - 1 + n) % n], b = L[i], c = L[(i + 1) % n];
      const d1 = [Math.sign(b[0] - a[0]), Math.sign(b[1] - a[1])], d2 = [Math.sign(c[0] - b[0]), Math.sign(c[1] - b[1])];
      const cr = d1[0] * d2[1] - d1[1] * d2[0];
      if (cr > 0) { P.push([b[0] - d1[0] * CH, b[1] - d1[1] * CH, 'in', i]); P.push([b[0] + d2[0] * CH, b[1] + d2[1] * CH, 'out', i]); }
      else P.push([b[0], b[1], 'v', i]);
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
  const solid = (x, y) => { // logical px -> solid?
    const c = Math.floor(x / TILE), r = Math.floor((y - MAPY) / TILE);
    if (c < 0 || c >= Cn || r >= R) return true;
    if (r < 0) return false;
    return map[r][c] === '#';
  };
  const geo = { map, R, Cn, fillPath, segs, solid };
  _levelGeo.set(key, geo);
  return geo;
}

/* distance (logical px) from a point inside solid to the nearest exposed face, scanning 4 directions */
function faceDist(geo, x, y, mx) {
  let best = mx;
  const dirs = [[0, -1, 1.0], [-1, 0, 1.25], [1, 0, 1.25], [0, 1, 1.7]];
  for (const d of dirs) {
    for (let s = 0; s < best / d[2]; s += 1.5) {
      if (!geo.solid(x + d[0] * s, y + d[1] * s)) { best = Math.min(best, s * d[2]); break; }
    }
  }
  return best;
}

/* theme colours for the platform crystal (round 1 = Coral Reef: cool teal-ice crystal with rose polyps) */
const THEME_CORAL = { edge: hex('#3fb0e6'), edgeHot: hex('#bfeaff'), body: hex('#2a72b8'), accent: RGB.magenta, accent2: RGB.cyan };

const THEME_TITLE = Object.assign({}, THEME_CORAL, { body: hex('#3a86d8'), spill: 2.4 });

/* static layer: faint fill + facet lattice + inner rim — drawn once into a cache canvas at scale S */
function renderLevelStatic(geo, S, th) {
  if (geo._st && geo._st.S === S && geo._st.th === th) return geo._st.canvas;
  const W = LW * S, H = LH * S;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  geo._st = { S, th, canvas: c };
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
  g.scale(S, S);
  g.save();
  // 1) fill: deep tinted translucent crystal (with dark backing so the background fog does not show through as mud)
  g.fillStyle = 'rgba(5,10,24,0.80)'; g.fill(geo.fillPath);
  const fg = g.createLinearGradient(0, 0, 0, LH);
  fg.addColorStop(0, rgba(th.body, 0.13)); fg.addColorStop(1, rgba(th.body, 0.05));
  g.fillStyle = fg; g.fill(geo.fillPath);
  g.clip(geo.fillPath);
  // 2) light spilling down from every top face (clipped to the crystal)
  g.globalCompositeOperation = 'lighter';
  for (const s of geo.segs) {
    if (s.cls !== 'T' || s.y0 > LH - 6) continue;
    const grd = g.createLinearGradient(0, s.y0, 0, s.y0 + 11);
    const sp = th.spill || 1;
    grd.addColorStop(0, rgba(th.edge, 0.26 * sp)); grd.addColorStop(0.5, rgba(th.edge, 0.07 * sp)); grd.addColorStop(1, rgba(th.edge, 0));
    g.fillStyle = grd; g.fillRect(s.x0, s.y0, s.x1 - s.x0, 11);
  }
  // inner glow along side faces
  for (const s of geo.segs) {
    if (s.cls !== 'L' && s.cls !== 'R') continue;
    const dir = s.cls === 'R' ? -1 : 1;     // R face: solid is to the left; L face: solid to the right
    const grd = g.createLinearGradient(s.x0, 0, s.x0 + dir * 7, 0);
    grd.addColorStop(0, rgba(th.edge, 0.13)); grd.addColorStop(1, rgba(th.edge, 0));
    g.fillStyle = grd; g.fillRect(Math.min(s.x0, s.x0 + dir * 7), Math.min(s.y0, s.y1), 7, Math.abs(s.y1 - s.y0));
  }
  // 3) crystal facets: a jittered triangular grid, every facet tinted individually (up-facing facets catch the key light), brightest near
  //    the faces and fading into the body; hairline facet edges only where the crystal is lit
  const Rn = rng(5), STEP = 8.2;
  const nodes = {};
  const nx = Math.ceil(LW / STEP) + 2, ny = Math.ceil(LH / STEP) + 2;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = i * STEP - 4 + Rn.float(-2.0, 2.0) + (j % 2 ? STEP / 2 : 0), y = j * STEP * 0.86 - 4 + Rn.float(-2.0, 2.0);
    nodes[i + ',' + j] = { x, y, d: geo.solid(x, y) ? faceDist(geo, x, y, 24) : -1 };
  }
  const tri = (A, B, C, up) => {
    if (!A || !B || !C || A.d < 0 || B.d < 0 || C.d < 0) return;
    const d = (A.d + B.d + C.d) / 3, near = Math.pow(clamp(1 - d / 20, 0, 1), 1.15);
    const r = Rn.next();
    if (Rn.next() < 0.26) return;                 // leave some facets dark: crystalline patches, not a mechanical pattern
    const wallK = (A.x + B.x + C.x) / 3 < 9 || (A.x + B.x + C.x) / 3 > LW - 9 ? 0.5 : 1;     // the outer walls stay quieter than the playfield
    const al = (0.02 + 0.12 * r * r + (up ? 0.05 : 0)) * (0.3 + 0.7 * near) * wallK;
    g.fillStyle = rgba(mixc(th.edge, r > 0.7 ? th.accent2 : th.edgeHot, r > 0.7 ? 0.5 : 0.25 * r), al);
    g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.lineTo(C.x, C.y); g.closePath(); g.fill();
    g.lineWidth = 0.2; g.lineJoin = 'round';
    g.strokeStyle = rgba(mixc(th.edge, th.accent2, 0.3), (0.025 + 0.12 * near) * wallK);
    g.stroke();
  };
  g.lineCap = 'round';
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const A = nodes[i + ',' + j], B = nodes[(i + 1) + ',' + j], D = nodes[i + ',' + (j + 1)], E = nodes[(i + 1) + ',' + (j + 1)];
    if (j % 2) { tri(A, B, D, true); tri(B, E, D, false); } else { tri(A, B, E, true); tri(A, E, D, false); }
  }
  // crystal columns: thin vertical light lines hanging from every top face (like light trapped in a prism)
  g.lineWidth = 0.22;
  for (const sg of geo.segs) {
    if (sg.cls !== 'T' || sg.y0 > LH - 6) continue;
    const len = Math.abs(sg.x1 - sg.x0);
    for (let x = sg.x0 + 3 + Rn.float(0, 6); x < sg.x1 - 2; x += 6 + Rn.float(0, 14)) {
      const L = 2.5 + Rn.float(0, 8) * Rn.next();
      const lg = g.createLinearGradient(0, sg.y0, 0, sg.y0 + L);
      lg.addColorStop(0, rgba(th.edgeHot, 0.2)); lg.addColorStop(1, rgba(th.edge, 0));
      g.strokeStyle = lg; g.beginPath(); g.moveTo(x, sg.y0 + 0.4); g.lineTo(x, sg.y0 + L); g.stroke();
    }
  }
  // sparse glowing facet nodes
  for (const k in nodes) {
    const nd = nodes[k];
    if (nd.d < 0 || nd.d > 14 || Rn.next() > 0.14) continue;
    g.fillStyle = rgba(hot(th.edge, 0.5), 0.5 * (1 - nd.d / 16));
    g.beginPath(); g.arc(nd.x, nd.y, 0.42, 0, TAU); g.fill();
  }
  g.restore();
  // crystal shards: hanging from undersides and standing at the corners/ends of top faces (outside the clip: they overhang the slab)
  const Rs = rng(41);
  const shard = (x, y, dir, hgt, wid, lean, col, a) => {
    const tip = [x + lean, y + dir * hgt];
    const P = new Path2D(); P.moveTo(x - wid / 2, y); P.lineTo(tip[0], tip[1]); P.lineTo(x + wid / 2, y);
    g.fillStyle = 'rgba(5,10,24,0.88)'; g.fill(P);
    g.fillStyle = rgba(col, 0.12 * a); g.fill(P);
    g.save(); g.globalCompositeOperation = 'lighter'; g.lineJoin = 'round'; g.lineCap = 'round';
    g.lineWidth = 1.3; g.strokeStyle = rgba(col, 0.08 * a); g.stroke(P);
    g.lineWidth = 0.46; g.strokeStyle = rgba(col, 0.78 * a); g.stroke(P);
    g.lineWidth = 0.18; g.strokeStyle = rgba(WHITE, 0.55 * a); g.beginPath(); g.moveTo(x - wid * 0.1, y + dir * 0.2); g.lineTo(tip[0], tip[1]); g.stroke();
    g.restore();
  };
  for (const sg of geo.segs) {
    if (sg.y0 > LH - 6 && sg.y1 > LH - 6) continue;
    const len = Math.abs(sg.x1 - sg.x0);
    if (sg.cls === 'B' && sg.y0 < LH - 7) {            // undersides: hanging crystals, dimmer, violet-leaning
      for (let x = Math.min(sg.x0, sg.x1) + 4 + Rs.float(0, 4); x < Math.max(sg.x0, sg.x1) - 3; x += 7 + Rs.float(0, 11)) {
        const big = Rs.chance(0.3);
        shard(x, sg.y0, 1, big ? Rs.float(3.2, 5.6) : Rs.float(1.5, 3.2), big ? Rs.float(1.5, 2.3) : Rs.float(0.9, 1.6), Rs.float(-0.7, 0.7), mixc(th.edge, RGB.violet, 0.35), big ? 0.75 : 0.55);
      }
    } else if (sg.cls === 'T' && sg.y0 > MAPY + 0.1 && sg.y0 < LH - 7) {   // tops: tiny facets at the ends only (the middle must stay clean for the characters)
      for (const [ex, dir] of [[Math.min(sg.x0, sg.x1) + 2.2, -1], [Math.max(sg.x0, sg.x1) - 2.2, 1]]) {
        if (len < 14) continue;
        shard(ex, sg.y0, -1, Rs.float(2.2, 3.6), Rs.float(1.1, 1.8), dir * Rs.float(0.2, 0.7), th.edgeHot, 0.8);
        if (Rs.chance(0.6)) shard(ex + dir * -2.2, sg.y0, -1, Rs.float(1.2, 2.0), Rs.float(0.8, 1.2), dir * Rs.float(-0.2, 0.4), th.edge, 0.65);
      }
    }
  }
  return c;
}

/* dynamic layer: bright faces, breathing along the length, lit by nearby lights.
 * lights: [{x,y,r,col,i}] in logical px. Everything additive. */
function drawPlatforms(ctx, geo, S, t, th, lights) {
  th = th || THEME_CORAL; lights = lights || [];
  const cache = renderLevelStatic(geo, S, th);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(cache, 0, 0);
  ctx.setTransform(S, 0, 0, S, 0, 0);
  // light pools inside the crystal: every living light tints the slab around it
  ctx.save(); ctx.clip(geo.fillPath);
  for (const l of lights) glow(ctx, l.x, l.y, l.r * 1.05, l.col, 0.17 * l.i);
  ctx.restore();
  let lastCol = null;
  const boost = (x, y) => {
    let b = 0, cr = 0, cg = 0, cb = 0;
    for (const l of lights) { const d = Math.hypot(x - l.x, (y - l.y) * 0.8) / l.r; if (d < 1) { const q = l.i * (1 - d) * (1 - d); b += q; cr += l.col[0] * q; cg += l.col[1] * q; cb += l.col[2] * q; } }
    lastCol = b > 0 ? [cr / b, cg / b, cb / b] : null;
    return b;
  };
  const lwTop = 0.78, lwSide = 0.46;
  const Rn = rng(77);
  for (const s of geo.segs) {
    if (s.y0 >= LH - 0.2 && s.y1 >= LH - 0.2) continue;     // screen-bottom closure
    if (s.x0 <= 0.01 && s.x1 <= 0.01) continue;
    if (s.x0 >= LW - 0.01 && s.x1 >= LW - 0.01) continue;
    if (s.cls === 'T') {
      const len = Math.abs(s.x1 - s.x0), n = Math.max(1, Math.round(len / 3.6));
      const isCeil = s.y0 <= MAPY + 0.1;
      const gpos = s.x0 + ((t * 20 + s.x0 * 1.3 + s.y0 * 0.7) % (len + 50)) - 20;      // a glint travelling along the face
      for (let i = 0; i < n; i++) {
        const xa = lerp(s.x0, s.x1, i / n), xb = lerp(s.x0, s.x1, (i + 1) / n), xm = (xa + xb) / 2;
        const breathe = 0.72 + 0.28 * Math.sin(xm * 0.11 - t * 1.5 + s.y0 * 0.07);
        const b = boost(xm, s.y0);
        const gl = isCeil ? 0 : Math.exp(-((xm - gpos) * (xm - gpos)) / 55);
        const a = clamp((isCeil ? 0.5 : 0.8) * breathe + b + gl * 0.3, 0, 1.4);
        const p = new Path2D(); p.moveTo(xa, s.y0); p.lineTo(xb + (i < n - 1 ? 0.05 : 0), s.y0);
        let col = b > 0.03 && lastCol ? mixc(th.edge, lastCol, clamp(b * 1.5, 0, 0.8)) : th.edge;
        if (gl > 0.02) col = mixc(col, WHITE, gl * 0.45);
        neon(ctx, p, col, lwTop, { a: Math.min(a, 1), halo: 1 + b * 1.6 + gl * 0.6, hot: 0.55 + b * 0.35 + gl * 0.25, cap: 'butt' });
      }
      // inset second line (crystal double-edge), shorter
      if (len > 7 && !isCeil) {
        const p = new Path2D(); p.moveTo(s.x0 + 3, s.y0 + 2.3); p.lineTo(s.x1 - 3, s.y0 + 2.3);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 0.24; ctx.lineCap = 'round';
        ctx.strokeStyle = rgba(th.edge, 0.26); ctx.stroke(p); ctx.restore();
      }
    } else if (s.cls === 'cTL' || s.cls === 'cTR') {
      const p = new Path2D(); p.moveTo(s.x0, s.y0); p.lineTo(s.x1, s.y1);
      neon(ctx, p, th.edge, lwTop * 0.82, { a: 0.85 + boost(s.x0, s.y0), halo: 1, hot: 0.6 });
    } else if (s.cls === 'L' || s.cls === 'R') {
      const p = new Path2D(); p.moveTo(s.x0, s.y0); p.lineTo(s.x1, s.y1);
      const my = (s.y0 + s.y1) / 2;
      neon(ctx, p, th.edge, lwSide, { a: clamp(0.46 + boost(s.x0, my) * 0.9, 0, 1), halo: 0.55, hot: 0.32 });
    } else {
      const p = new Path2D(); p.moveTo(s.x0, s.y0); p.lineTo(s.x1, s.y1);
      neon(ctx, p, mixc(th.edge, RGB.violet, 0.3), lwSide * 0.85, { a: 0.34, halo: 0.4, hot: 0.15 });
    }
  }
  // living accents on the top faces: sparse bioluminescent sea-fan tufts (3-4 filaments with glowing tips)
  for (const s of geo.segs) {
    if (s.cls !== 'T' || s.y0 >= LH - 0.2 || s.y0 <= MAPY + 0.1) continue;
    const len = Math.abs(s.x1 - s.x0);
    const nPoly = Math.floor(len / 34);
    for (let i = 0; i < nPoly; i++) {
      const x = s.x0 + (i + 0.3 + Rn.float(0, 0.5)) * (len / Math.max(1, nPoly)), ph = Rn.float(0, TAU);
      const pulse = 0.55 + 0.45 * Math.sin(t * 1.9 + ph);
      const pc = Rn.chance(0.7) ? th.accent : th.accent2;
      const nf = 3 + (Rn.next() < 0.4 ? 1 : 0);
      const fil = new Path2D(), tips = [];
      for (let f = 0; f < nf; f++) {
        const ang = (f - (nf - 1) / 2) * 0.5 + Rn.float(-0.12, 0.12) + Math.sin(t * 1.1 + ph + f) * 0.08, hh = 2.3 + Rn.float(0, 2.0);
        const tx = x + Math.sin(ang) * hh, ty = s.y0 - Math.cos(ang) * hh;
        fil.moveTo(x, s.y0); fil.quadraticCurveTo(x + Math.sin(ang) * hh * 0.2, s.y0 - hh * 0.65, tx, ty); tips.push([tx, ty]);
      }
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 0.3; ctx.lineCap = 'round'; ctx.strokeStyle = rgba(pc, 0.62 * pulse); ctx.stroke(fil); ctx.restore();
      for (const tp of tips) dot(ctx, tp[0], tp[1], 0.4, pc, 0.75 * pulse, { halo: 3.4 });
    }
  }
  ctx.restore();
}
/* ABYSS GLOW — players. drawPlayer(ctx, who, o): o = {x, y, k, face, t, pose, mouth, ghost, a, wind}
 * x,y = OUTPUT px of the 16x16 logical box's top-left; k = output px per logical px (UI scales it up, hitbox unchanged).
 * Design space: 16x16 units, facing right; gills & tail overhang the box (luminous overdraw).
 * Pipeline: silhouette (paths) -> luminous translucent body (dark occluder + hue tint + inner light organ + rim glow)
 *           -> luminous strokes (neon) -> eyes/face.
 * The twins are the only creatures with LIT bodies (inner light organ + tinted fill): every enemy is a hollow contour, so the
 * heroes are always the brightest, most volumetric shapes on screen. Fizz = broad round gill plumes + freckles, short curled tail;
 * Pop = four slender upright plumes, a long finned tail and a dorsal crest (silhouette difference, not only hue).
 */
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

/* a gill plume: a rounded leaf with a bright vein, a light-filled petal that gets hotter toward the tip and a soft glowing tip.
 * big = close-up LOD (feathery barbs + scalloped edge); at 1x the petal stays a clean fat leaf so it never turns spiky. */
function gillFrond(ctx, g, col, w, big, a, wd) {
  const sp = quadPts(g.b, g.c, g.e, 18);
  const W0 = wd || 0.62, fr = big ? 0.07 : 0.0;
  const pet = taper(sp, (u) => {
    const round = u > 0.84 ? Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.84) / 0.16, 2))) : 1;     // rounded, spoon-like tip instead of a needle
    return W0 * (0.22 + 0.78 * Math.pow(Math.sin(Math.PI * Math.min(1, Math.pow(u, 0.66))), 0.8)) * (1 + fr * Math.sin(u * 17)) * (0.35 + 0.65 * round) * (1 - u * 0.06);
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
  if (big) {                                    // feathery barbs
    const P = new Path2D();
    for (let i = 4; i < 15; i += 2) {
      const q = sp[i], n = sp[i + 1], dx = n[0] - q[0], dy = n[1] - q[1], L = Math.hypot(dx, dy) || 1, hw = W0 * 0.62 * Math.sin(Math.PI * Math.pow(i / 18, 0.7));
      for (const s of [-1, 1]) { P.moveTo(q[0], q[1]); P.lineTo(q[0] + (dx / L) * hw * 0.8 - (dy / L) * hw * s, q[1] + (dy / L) * hw * 0.8 + (dx / L) * hw * s); }
    }
    neon(ctx, P, col, w * 0.24, { a: a * 0.4, halo: 0, hot: 0.1 });
  }
  const q = sp[sp.length - 2];
  glow(ctx, e[0], e[1], 1.15, hot(col, 0.5), 0.55 * a);
  dot(ctx, q[0] + (e[0] - q[0]) * 0.6, q[1] + (e[1] - q[1]) * 0.6, 0.26, hot(col, 0.6), a * 0.9, { halo: 2.6 });
}

function drawPlayer(ctx, who, o) {
  o = Object.assign({ face: 1, t: 0, pose: 'idle', mouth: 0, k: 4.8 }, o);
  const t = o.t, pose = o.pose, k = o.k, ghost = !!o.ghost, pop = who === 'pop';
  const col = pop ? RGB.cyan : RGB.magenta;
  const gcol = pop ? mixc(RGB.violet, RGB.cyan, 0.2) : mixc(RGB.magenta, RGB.amber, 0.14);
  const w = lwFor(k), big = k > 7.5;
  const jump = pose === 'jump', shoot = pose === 'shoot' || o.mouth > 0;
  const bob = pose === 'idle' || shoot ? Math.sin(t * 2.4) * 0.16 : 0;
  const wind = jump ? 1.5 : (o.wind || 0);
  const sw = (i, a) => Math.sin(t * 3.0 + i * 1.3) * a;
  const alpha = ghost ? (o.ghostA || 0.3) : 1;
  const sy = jump ? 1.07 : shoot ? 0.97 : 1 + Math.sin(t * 2.4 + 0.6) * 0.012;
  const sx = jump ? 0.95 : shoot ? 1.03 : 1;
  const headDy = bob + (shoot ? 0.1 : 0);
  const headDx = shoot ? -0.25 : 0;
  const breathe = 0.9 + 0.1 * Math.sin(t * 2.0 + (pop ? 1 : 0));

  placeSprite(ctx, o, 16, () => {
    ctx.translate(8, 16); ctx.scale(sx, sy); ctx.translate(-8, -16);
    const A = alpha;
    // soft aura: the twins glow as a whole (keeps the frilly crown readable at 1x and lifts them off the dark water)
    glow(ctx, 3.4, 3.2 + headDy, 8.5, gcol, ghost ? 0.05 : 0.24, 0.95);
    if (!ghost) glow(ctx, 9, 9.5, 11, col, 0.1 * breathe, 0.95);

    // ---- far gills (dim, behind everything) ----
    const farG = pop ? [
      { b: [7.2, 2.2], c: [6.4, -1.6 + wind * 0.4 + sw(1, 0.4)], e: [4.6 + sw(3, 0.3), -2.6 + wind * 0.9 + sw(0, 0.5)] },
      { b: [9.0, 1.9], c: [8.8, -1.6 + wind * 0.3 + sw(5, 0.4)], e: [7.8 + sw(2, 0.3), -2.4 + wind * 0.8 + sw(3, 0.5)] },
    ] : [
      { b: [6.6, 2.4], c: [5.2, -0.6 + wind * 0.4 + sw(1, 0.5)], e: [3.2 + sw(3, 0.3), -0.3 + wind * 0.9 + sw(0, 0.5)] },
      { b: [8.6, 1.9], c: [7.8, -1.2 + wind * 0.4 + sw(2, 0.4)], e: [6.0 + sw(4, 0.3), -1.3 + wind * 0.9 + sw(1, 0.5)] },
    ];
    for (const g of farG) { g.b[1] += headDy; gillFrond(ctx, g, mixc(gcol, RGB.void, 0.35), w * 0.85, false, 0.7 * A, pop ? 0.75 : 0.95); }

    // ---- tail: tapered paddle with a fin ridge, curling up behind (Pop's is longer, with a dorsal fin sail) ----
    const tw = Math.sin(t * 2.6) * 0.7 + (jump ? 1.3 : 0);
    const tsp = pop
      ? sampleSpline([[5.9, 13.0], [3.6, 14.8], [1.4, 14.2 + tw * 0.1], [-0.4, 12.2 + tw * 0.4], [-0.9, 9.4 + tw * 0.8]], 6)
      : sampleSpline([[5.9, 13.3], [4.0, 14.6], [2.0, 14.3 + tw * 0.1], [0.6, 12.8 + tw * 0.4], [-0.1, 11.2 + tw * 0.7]], 6);
    const tail = taper(tsp, (u) => (0.55 + (pop ? 1.55 : 1.35) * Math.sin(Math.PI * Math.min(1, 0.12 + u * 0.86))) * (1 - Math.pow(u, 3) * 0.85));
    if (pop && !ghost) {   // dorsal fin sail: a translucent membrane with rays along the upper edge of the tail
      const fsp = tsp.slice(2, tsp.length - 2);
      const fin = new Path2D(); fin.moveTo(fsp[0][0], fsp[0][1] - 0.4);
      fsp.forEach((q, i) => { const u = i / (fsp.length - 1); fin.lineTo(q[0] - 0.6 * Math.sin(Math.PI * u) - 0.1, q[1] - (1.6 + 1.9 * Math.sin(Math.PI * Math.pow(u, 0.8))) * (1 - u * 0.2)); });
      for (let i = fsp.length - 1; i >= 0; i--) fin.lineTo(fsp[i][0], fsp[i][1]);
      fin.closePath();
      ctx.save(); ctx.fillStyle = 'rgba(4,6,14,0.55)'; ctx.fill(fin); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(gcol, 0.2 * A); ctx.fill(fin); ctx.restore();
      neon(ctx, fin, gcol, w * 0.7, { a: 0.85 * A, halo: 0.6, hot: 0.35 });
    }
    if (!ghost) body(ctx, tail, col, w, { a: A, y0: 9, y1: 15, tint: 0.85, rim: 0.95 });
    neon(ctx, tail, col, w * 0.95, { a: A, halo: 0.8, grad: [0, 9, 6, 15] });
    if (!ghost) neon(ctx, spinePath(tsp.slice(3, tsp.length - 5)), hot(col, 0.2), w * 0.4, { a: 0.55 * A, halo: 0, hot: 0.2 });

    // ---- far arm (dim) ----
    const farArm = new Path2D(jump ? 'M 6.4 10.4 Q 5.2 9 5.4 7.6' : 'M 6.6 10.6 Q 5.6 11.8 6.2 12.8');
    neon(ctx, farArm, mixc(col, RGB.void, 0.4), w * 1.0, { a: 0.7 * A, halo: 0.3, hot: 0.2 });

    // ---- body (lit from within: inner light organ in the chest) ----
    const bodyP = new Path2D('M 5.5 9.4 C 4.3 11.8 4.4 14.7 7.1 15.4 L 11.7 15.4 C 13.5 14.7 13.5 11.8 12.2 9.4 Z');
    if (!ghost) body(ctx, bodyP, col, w, { a: A, y0: 9, y1: 16, hl: [7.6, 11.2, 5.2, 0.3], tint: 0.8, core: [9, 12.9, 4.4, 0.34 * breathe], rim: 0.95 });
    neon(ctx, bodyP, col, w, { a: A, grad: [4, 9, 13, 16] });
    if (!ghost) {
      // belly plate: a pale luminous oval (the "light organ")
      const belly = ellipsePath(9.0, 12.6, 2.4, 2.8);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const bgd = ctx.createRadialGradient(9, 12.6, 0, 9, 12.6, 3.0); bgd.addColorStop(0, rgba(mixc(WHITE, col, 0.2), 0.34 * breathe)); bgd.addColorStop(1, rgba(mixc(WHITE, col, 0.4), 0.06));
      ctx.fillStyle = bgd; ctx.fill(belly);
      ctx.restore();
      neon(ctx, new Path2D('M 7 11.2 Q 9 10.6 11 11.2'), WHITE, w * 0.4, { a: 0.4, halo: 0, hot: 0 });
      neon(ctx, belly, mixc(WHITE, col, 0.25), w * 0.5, { a: 0.4, halo: 0.2, hot: 0.2 });
      // little glowing spots down the flank
      for (const [sx2, sy2] of [[11.6, 11.8], [11.9, 13.4], [11.0, 14.5]]) dot(ctx, sx2, sy2, 0.28, hot(col, 0.4), 0.6, { halo: 3 });
    }

    // ---- feet ----
    const ft = jump ? [[6.4, 14.6, 1.2], [10.9, 14.2, 1.2]] : [[6.5, 15.5, 1.55], [11.0, 15.5, 1.55]];
    for (const [fx, fy, fr] of ft) {
      const fp = ellipsePath(fx, fy, fr, 0.75);
      if (!ghost) body(ctx, fp, col, w * 0.6, { a: A, y0: fy - 1, y1: fy + 1, tint: 1.2 });
      neon(ctx, fp, col, w * 0.8, { a: A, halo: 0.5 });
    }

    // ---- near gills: broad plumes (Fizz: 3) / slender upright plumes (Pop: 4), sweeping up/back from the back of the head ----
    const nearG = pop ? [
      { b: [5.8, 2.9 + headDy], c: [3.8, -1.6 + wind * 0.4 + sw(0, 0.4)], e: [2.0 + sw(1, 0.35), -2.2 + wind * 1.0 + sw(2, 0.5)] },
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
    const head = new Path2D('M 3.8 6.6 C 3.5 3.5 6.2 1.7 9.3 1.7 C 12.5 1.7 14.9 3.8 14.9 6.5 C 14.9 8.9 12.7 10.3 9.8 10.4 C 6.5 10.5 4.1 9.5 3.8 6.6 Z');
    if (!ghost) body(ctx, head, col, w, { a: A, y0: 1.5, y1: 10.5, x0: 4, x1: 12, hl: [7.6, 4.2, 6.6, 0.34], tint: 0.8, core: [10.4, 6.6, 5.6, 0.16 * breathe], rim: 0.95 });
    neon(ctx, head, col, w * 1.1, { a: A, grad: [4, 1.5, 14, 10.5], halo: 1.1 });
    if (!ghost) {
      // forehead sheen (top-left key light)
      neon(ctx, new Path2D('M 5.4 3.9 C 6.2 2.7 7.6 2.2 9 2.2'), WHITE, w * 0.55, { a: 0.8, halo: 0.2, hot: 0.4 });
      // luminous freckles (Fizz) / a constellation of cool spots (Pop)
      const frk = pop ? [[8.4, 3.3, 0.22], [9.8, 2.9, 0.26], [11.3, 3.2, 0.2], [6.9, 4.0, 0.18], [12.4, 4.0, 0.16]] : [[8.9, 3.5, 0.26], [10.3, 3.3, 0.22], [7.4, 3.9, 0.2], [11.6, 3.7, 0.2]];
      for (const [fx, fy, fr] of frk) dot(ctx, fx, fy, fr, hot(col, 0.5), 0.6, { halo: 3 });
      // cheek blush
      glow(ctx, 10.0, 7.7, 2.0, gcol, 0.38, 0.65);
      // eyes: far (smaller, left) and near (bigger, right) — a pale lit sclera, a coloured iris, a deep pupil and two highlights
      const eyes = [[7.8, 5.15, 1.34], [11.9, 5.3, 1.66]];
      for (const [ex, ey, er] of eyes) {
        glow(ctx, ex, ey, er * 3.2, WHITE, 0.14);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = rgba(hot(col, 0.82), 0.96); ctx.beginPath(); ctx.arc(ex, ey, er, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        const ix = ex + er * 0.3, iy = ey + er * 0.05, ir = er * 0.74;
        const ig = ctx.createRadialGradient(ix, iy + ir * 0.3, ir * 0.1, ix, iy, ir);
        ig.addColorStop(0, rgba(mixc(col, RGB.void, 0.55), 0.97)); ig.addColorStop(0.7, rgba(mixc(col, RGB.void, 0.8), 0.97)); ig.addColorStop(1, rgba(mixc(col, RGB.void, 0.9), 0.97));
        ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(ix, iy, ir, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(6,4,14,0.97)'; ctx.beginPath(); ctx.arc(ix + er * 0.04, iy, er * 0.46, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = rgba(WHITE, 0.96); ctx.beginPath(); ctx.arc(ex + er * 0.02, ey - er * 0.36, er * 0.24, 0, TAU); ctx.fill();
        ctx.fillStyle = rgba(WHITE, 0.8); ctx.beginPath(); ctx.arc(ex + er * 0.58, ey + er * 0.32, er * 0.1, 0, TAU); ctx.fill();
        ctx.restore();
        neon(ctx, circlePath(ex, ey, er), col, w * 0.5, { a: 0.9, halo: 0.4, hot: 0.2 });
      }
      // mouth
      if (shoot) {
        const m = o.mouth > 0 ? o.mouth : 1;
        const mp = ellipsePath(13.9, 8.4, 0.55 + 0.32 * m, 0.7 + 0.36 * m);
        ctx.save(); ctx.fillStyle = 'rgba(10,3,14,0.96)'; ctx.fill(mp); ctx.globalCompositeOperation = 'lighter'; glow(ctx, 13.9, 8.5, 1.5, hot(col, 0.4), 0.3); ctx.restore();
        neon(ctx, mp, hot(col, 0.25), w * 0.7, { a: 1, halo: 0.7, hot: 0.5 });
        neon(ctx, new Path2D('M 12.6 7.2 Q 13.3 6.7 14.2 7.0'), hot(col, 0.2), w * 0.45, { a: 0.6, halo: 0, hot: 0.2 });   // upper lip
      } else {
        neon(ctx, new Path2D('M 10.6 8.6 Q 12.4 9.7 14.1 8.5'), hot(col, 0.2), w * 0.7, { a: 0.95, halo: 0.4, hot: 0.4 });
      }
      // nostril
      if (!shoot) dot(ctx, 14.2, 6.3, 0.16, WHITE, 0.55, { halo: 2.4 });
    }
    ctx.restore();

    // ---- near arm (short, 3 little fingers) ----
    if (!ghost) {
      const arm = shoot ? 'M 11.0 10.6 Q 13.2 10.0 14.6 10.9' : jump ? 'M 11.4 10.6 Q 13.4 9.2 13.6 7.6' : 'M 11.2 10.7 Q 13.4 10.9 13.9 12.7';
      const ap = new Path2D(arm);
      neon(ctx, ap, col, w * 1.5, { a: 1, halo: 0.7, grad: [11, 10, 14, 13] });
      const tipX = shoot ? 14.7 : jump ? 13.7 : 14.0, tipY = shoot ? 10.9 : jump ? 7.5 : 12.9;
      for (let i = -1; i <= 1; i++) dot(ctx, tipX + i * 0.42, tipY + (shoot ? i * 0.4 : 0.2) , 0.25, hot(col, 0.4), 0.8, { halo: 2.4 });
    }
  });
}
/* ABYSS GLOW — enemies. drawEnemy(ctx, type, o): o = {x,y,k,face,t,state,angry,ghost,a}
 * type: nibbler | crabbit | jellop | springle | glimmer | bonefin | kraken
 * state: 'move' (default) | 'trapped' (struggling pose, used inside bubbles) | 'throw' | 'squash' | 'fire'
 * Each type owns ONE neon hue AND a distinct silhouette (colour-blind safe):
 *   nibbler  amber  horizontal clockwork fish on legs, wind-up key + cog
 *   crabbit  ember  wide domed crab, raised pincers, tall eye stalks ("ears")
 *   jellop   violet bell + trailing tentacles
 *   springle lime   upright seahorse on a coil spring
 *   glimmer  cobalt anglerfish with an amber lantern (+ its own light)
 *   bonefin  white  skeletal ghost fish, no body fill
 *   kraken   purple crowned octopus (48 x 48)
 * Angry = crimson, slanted brows, pulsing red heat halo and steam puffs (a shape cue as well as a colour cue).
 */
const ENEMY_HUE = { nibbler: RGB.amber, crabbit: RGB.ember, jellop: RGB.violet, springle: RGB.lime, glimmer: RGB.cobalt, bonefin: mixc(RGB.white, RGB.cyan, 0.25), kraken: RGB.purple };

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

/* angry cue: slanted brow bars over eyes (call with eye centres), steam puffs, heat halo */
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

function drawEnemy(ctx, type, o) {
  o = Object.assign({ face: 1, t: 0, state: 'move', angry: false, k: 4.8 }, o);
  const fn = ENEMY_FN[type];
  if (!fn) return;
  const w = lwFor(o.k);
  const boxW = type === 'kraken' ? 48 : 16;
  const col = o.angry && type !== 'bonefin' && type !== 'kraken' ? RGB.crimson : (o.col || ENEMY_HUE[type]);
  const ctxA = 1;
  placeSprite(ctx, o, boxW, () => {
    if (o.angry && !o.ghost) heat(ctx, o.t, RGB.crimson, boxW / 2, boxW / 2 + 1, boxW * 0.95);
    fn(ctx, o, col, w, ctxA);
  });
}

/* ---------------------------------------------------------------- Nibbler: clockwork fish on legs */
function nibbler(ctx, o, col, w, A) {
  const t = o.t, trapped = o.state === 'trapped', k = o.k;
  const walk = o.state === 'move' ? Math.sin(t * 9) : 0;
  const bob = Math.abs(walk) * 0.18;
  ctx.translate(0, -bob);
  const wag = Math.sin(t * 5) * 0.5;
  // legs (behind)
  const legs = [[6.4, 12.2, -walk], [10.6, 12.0, walk]];
  for (const [lx, ly, ph] of legs) {
    const kx = lx - 0.7 + ph * 0.8, kyy = 13.9, fx = lx + (ph > 0 ? 0.5 : -0.9) + ph * 0.9, fy = 15.3 - Math.max(0, -ph) * 0.9;
    const lp = new Path2D(); lp.moveTo(lx, ly); lp.lineTo(kx, kyy); lp.lineTo(fx, fy);
    neon(ctx, lp, col, w * 0.95, { a: A, halo: 0.6 });
    neon(ctx, new Path2D(`M ${fx - 0.9} ${fy + 0.1} L ${fx + 0.9} ${fy + 0.1}`), col, w * 0.9, { a: A, halo: 0.4, hot: 0.3 });
  }
  // wind-up key
  const kr = Math.cos(t * 3.2);
  ctx.save(); ctx.translate(7.4, 2.4); ctx.scale(Math.max(0.25, Math.abs(kr)), 1); ctx.translate(-7.4, -2.4);
  const key = new Path2D('M 7.4 4.6 L 7.4 2.4 M 7.4 2.6 C 5.5 3 4.5 0.8 6.1 0.4 C 7.1 0.2 7.4 1.4 7.4 2.6 M 7.4 2.6 C 9.3 3 10.3 0.8 8.7 0.4 C 7.7 0.2 7.4 1.4 7.4 2.6');
  neon(ctx, key, col, w * 0.9, { a: A, halo: 0.8 });
  ctx.restore();
  // tail fin (forked)
  const tf = new Path2D(`M 3.1 8.3 L 0.2 ${4.6 + wag} Q 1.7 8.3 0.2 ${12 - wag} Z`);
  body(ctx, tf, col, w, { a: A, y0: 4, y1: 12 }); neon(ctx, tf, col, w * 0.95, { a: A });
  // body
  const bp = new Path2D('M 2.9 8.6 C 2.7 5.3 5.4 4.1 8.4 4.1 C 11.5 4.1 13.9 5.9 14.5 8.5 C 14 10.9 11.4 12.4 8.4 12.4 C 5.4 12.4 3.1 11.8 2.9 8.6 Z');
  body(ctx, bp, col, w, { a: A, y0: 4, y1: 12.4, tint: 1.15, hl: [6.4, 6, 6, 0.3] });
  neon(ctx, bp, col, w * 1.05, { a: A, grad: [3, 4, 14, 12.4] });
  // riveted plating
  neon(ctx, new Path2D('M 4.8 5.3 Q 4.1 8.4 4.9 11.4'), col, w * 0.4, { a: 0.5 * A, halo: 0, hot: 0.2 });
  for (const [rx, ry] of [[5.6, 11.4], [7.8, 11.7], [10, 11.5], [12, 10.7]]) dot(ctx, rx, ry, 0.22, hot(col, 0.4), 0.7 * A, { halo: 2.4 });
  // fin
  neon(ctx, new Path2D('M 9.8 9.7 L 11.8 11.7 L 9.1 11.5 Z'), col, w * 0.6, { a: 0.8 * A, halo: 0.3 });
  // COG (the signature) — spins with time
  const gx = 7.2, gy = 8.4;
  const rot = t * 1.6;
  const gear = gearPath(gx, gy, 2.75, 2.0, 8, rot);
  ctx.save(); ctx.fillStyle = 'rgba(4,6,14,0.85)'; ctx.fill(gear); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(col, 0.22 * A); ctx.fill(gear); ctx.restore();
  neon(ctx, gear, hot(col, 0.2), w * 0.8, { a: A, halo: 0.9, hot: 0.6 });
  neon(ctx, circlePath(gx, gy, 1.0), col, w * 0.55, { a: A, halo: 0.3, hot: 0.4 });
  dot(ctx, gx, gy, 0.35, hot(col, 0.7), A, { halo: 3 });
  // eye + mouth
  const eyeLook = trapped ? [Math.sin(t * 9) * 0.5, 0.25] : [0.7, 0.1];
  eyeBall(ctx, 11.5, 7.0, 1.5, col, eyeLook, { a: A, w: w * 0.55 });
  if (o.angry) brow(ctx, 11.5, 7.0, 1.5, 1, w, col);
  const mouth = new Path2D('M 12.4 9.7 L 14.5 9.0 M 13.1 9.45 L 13.3 10.2 M 14.0 9.15 L 14.1 9.9');
  neon(ctx, mouth, hot(col, 0.3), w * 0.5, { a: A, halo: 0.3, hot: 0.3 });
  if (o.angry) steam(ctx, 8.5, 3.6, t, w, col, 2);
}

/* ---------------------------------------------------------------- Crabbit: domed crab, raised pincers, eye stalks */
function crabbit(ctx, o, col, w, A) {
  const t = o.t, throwing = o.state === 'throw', trapped = o.state === 'trapped';
  const walk = o.state === 'move' ? Math.sin(t * 10) : 0;
  ctx.translate(0, -Math.abs(walk) * 0.15);
  const snap = trapped ? Math.sin(t * 14) * 0.5 : (o.angry ? Math.sin(t * 9) * 0.35 : Math.sin(t * 2.3) * 0.12);
  // legs
  const legP = new Path2D();
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const bx = 8 + s * (3.0 + i * 1.5), by = 12.4 + i * 0.1;
    const ph = Math.sin(t * 10 + i * 2.1 + (s > 0 ? Math.PI : 0)) * (o.state === 'move' ? 0.7 : 0.1);
    legP.moveTo(bx, by); legP.lineTo(bx + s * (1.2 + i * 0.2), 13.9 - Math.max(0, ph) * 0.5); legP.lineTo(bx + s * (1.5 + i * 0.1 + ph * 0.4), 15.5);
  }
  neon(ctx, legP, col, w * 0.85, { a: A, halo: 0.5 });
  // pincers: arm + two-prong claw, raised
  for (const s of [-1, 1]) {
    const cx = s < 0 ? 0 : 16, sg = s;
    const mx = (x) => (s < 0 ? x : 16 - x);
    const open = 0.5 + snap * (s < 0 ? 1 : -1) * 0.4;
    const arm = new Path2D(`M ${mx(2.9)} 10.6 C ${mx(1.1)} 10 ${mx(0.8)} 8.4 ${mx(1.5)} 6.9`);
    neon(ctx, arm, col, w * 1.15, { a: A, halo: 0.8 });
    const claw = new Path2D(`M ${mx(0.1)} 7 C ${mx(-1.3)} 5.9 ${mx(-1.3)} 3.3 ${mx(0.3)} 2.0 L ${mx(1.7 - open * 0.3)} 3.7 L ${mx(3.3 + open * 0.6)} 1.7 C ${mx(4.7)} 3.4 ${mx(4.5)} 6 ${mx(3.1)} 7 Z`);
    body(ctx, claw, col, w, { a: A, y0: 2, y1: 7.2, tint: 1.2 }); neon(ctx, claw, col, w * 1.0, { a: A, grad: [0, 2, 4, 7] });
  }
  // eye stalks ("bunny ears")
  const sway = Math.sin(t * 3) * 0.25;
  for (const s of [-1, 1]) {
    const bx = 8 + s * 2.1, ex = 8 + s * 3.0 + sway * s;
    const stalk = new Path2D(`M ${bx} 6.8 C ${bx + s * 0.1} 4.6 ${ex - s * 0.5} 3.2 ${ex} 1.9`);
    neon(ctx, stalk, col, w * 0.95, { a: A, halo: 0.7 });
  }
  // shell
  const shell = new Path2D('M 1.9 11.8 C 1.7 7.8 4.6 6.3 8 6.3 C 11.4 6.3 14.3 7.8 14.1 11.8 C 14 13.1 11.6 13.6 8 13.6 C 4.4 13.6 2 13.1 1.9 11.8 Z');
  body(ctx, shell, col, w, { a: A, y0: 6, y1: 13.6, tint: 1.4, hl: [6.2, 8.2, 7.2, 0.5] });
  neon(ctx, shell, col, w * 1.1, { a: A, grad: [2, 6, 14, 13.6] });
  // carapace plates
  neon(ctx, new Path2D('M 4.2 9.1 Q 8 7.4 11.8 9.1 M 5.2 11.2 Q 8 9.9 10.8 11.2'), col, w * 0.45, { a: 0.55 * A, halo: 0, hot: 0.2 });
  for (const [dx, dy] of [[6, 8.2], [10, 8.2], [8, 7.5]]) dot(ctx, dx, dy, 0.24, hot(col, 0.4), 0.6 * A, { halo: 2.4 });
  // face: two eyes on the stalks looking toward travel direction
  const look = [trapped ? Math.sin(t * 11) * 0.6 : 0.6, 0.15];
  for (const s of [-1, 1]) {
    const ex = 8 + s * 3.0 + sway * s;
    eyeBall(ctx, ex, 1.5, 1.35, col, look, { a: A, w: w * 0.55 });
    if (o.angry) brow(ctx, ex, 1.5, 1.35, -s, w, col);
  }
  // mouth
  neon(ctx, new Path2D(o.angry ? 'M 6.4 12.4 Q 8 11.2 9.6 12.4' : 'M 6.6 11.9 Q 8 12.8 9.4 11.9'), hot(col, 0.3), w * 0.55, { a: 0.9 * A, halo: 0.3, hot: 0.3 });
  if (o.angry) steam(ctx, 8, -0.2, t, w, col, 3);
}

/* ---------------------------------------------------------------- Jellop: bell + tentacles */
function jellop(ctx, o, col, w, A) {
  const t = o.t, trapped = o.state === 'trapped';
  const ps = 1 + Math.sin(t * 4.2) * 0.06;      // bell pulse
  const tilt = o.tilt || 0;
  ctx.translate(8, 6.5); ctx.rotate(tilt); ctx.scale(1 / ps, ps); ctx.translate(-8, -6.5);
  // tentacles
  const tp = new Path2D();
  for (let i = 0; i < 5; i++) {
    const x0 = 3.7 + i * 2.15, pts = [];
    for (let j = 0; j <= 5; j++) pts.push([x0 + Math.sin(t * 3.4 + i * 1.3 + j * 0.9) * 0.55 * (j / 5) * 1.4, 8.2 + j * 1.5]);
    const sp = sampleSpline(pts, 4);
    tp.moveTo(sp[0][0], sp[0][1]); for (let q = 1; q < sp.length; q++) tp.lineTo(sp[q][0], sp[q][1]);
  }
  neon(ctx, tp, col, w * 0.7, { a: 0.85 * A, halo: 0.8, hot: 0.35 });
  // oral arms (wider ribbons)
  for (const s of [-1, 1]) {
    const pts = []; for (let j = 0; j <= 4; j++) pts.push([8 + s * (0.9 + Math.sin(t * 3 + j + s) * 0.45), 8 + j * 1.55]);
    const rb = taper(sampleSpline(pts, 5), (u) => 0.5 * Math.sin(Math.PI * Math.pow(u, 0.7)) + 0.05);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(col, 0.18 * A); ctx.fill(rb); ctx.restore();
    neon(ctx, rb, mixc(col, RGB.magenta, 0.35), w * 0.5, { a: 0.7 * A, halo: 0.4, hot: 0.2 });
  }
  // bell with scalloped rim
  const sc = []; const n = 5, x1 = 14.1, x0 = 1.9, dx = (x1 - x0) / n;
  let d = `M ${x0} 7.7 C ${x0 - 0.4} 2.9 4.7 0.9 8 0.9 C 11.3 0.9 ${x1 + 0.4} 2.9 ${x1} 7.7`;
  for (let i = 0; i < n; i++) { const xa = x1 - i * dx, xb = x1 - (i + 1) * dx; d += ` Q ${(xa + xb) / 2} ${9.3 + Math.sin(t * 4 + i) * 0.3} ${xb} 7.7`; }
  const bell = new Path2D(d + ' Z');
  body(ctx, bell, col, w, { a: A, y0: 0.9, y1: 9, tint: 1.3, hl: [6.2, 3.2, 6.4, 0.34] });
  neon(ctx, bell, col, w * 1.08, { a: A, grad: [2, 1, 14, 9], halo: 1.1 });
  // radial canals + inner ring
  const cn = new Path2D();
  for (let i = -2; i <= 2; i++) { cn.moveTo(8, 1.6); cn.quadraticCurveTo(8 + i * 2.6, 3.6, 8 + i * 3.0, 7.4); }
  neon(ctx, cn, col, w * 0.38, { a: 0.45 * A, halo: 0, hot: 0.2 });
  // clover (the four gonads) — a magenta-violet signature
  const cl = new Path2D();
  for (let i = 0; i < 4; i++) { const a = i * TAU / 4 + Math.PI / 4 + t * 0.3; cl.moveTo(8 + Math.cos(a) * 1.7 + 0.8, 4.0 + Math.sin(a) * 1.15); cl.ellipse(8 + Math.cos(a) * 1.7, 4.0 + Math.sin(a) * 1.15, 0.8, 0.55, a, 0, TAU); }
  neon(ctx, cl, mixc(col, RGB.magenta, 0.5), w * 0.55, { a: 0.9 * A, halo: 0.6, hot: 0.4 });
  // eyes
  const look = trapped ? [Math.sin(t * 10) * 0.5, 0.2] : [0.5, 0.2];
  for (const ex of [5.4, 10.6]) eyeBall(ctx, ex, 6.2, 0.95, col, look, { a: A, w: w * 0.45, pupil: 0.58 });
  if (o.angry) { brow(ctx, 5.4, 6.2, 0.95, 1, w, col); brow(ctx, 10.6, 6.2, 0.95, -1, w, col); steam(ctx, 8, -0.4, t, w, col, 3); }
}

/* ---------------------------------------------------------------- Springle: seahorse on a coil spring */
function springle(ctx, o, col, w, A) {
  const t = o.t, squash = o.state === 'squash';
  const comp = squash ? 0.55 : 1 - Math.abs(Math.sin(t * 5)) * 0.06;
  // spring (coil) from y=11.8 to 15.7, compressed on landing — a glowing tesla coil
  const top = 11.8, bot = 15.7, h = (bot - top) * comp, y0 = bot - h;
  const coil = new Path2D(); coil.moveTo(7.6, y0);
  const turns = 5;
  for (let i = 0; i <= turns * 2; i++) { const y = y0 + (i / (turns * 2)) * h; coil.lineTo(7.6 + (i % 2 ? 2.0 : -2.0), y); }
  coil.lineTo(7.6, bot);
  neon(ctx, coil, col, w * 0.95, { a: A, halo: 1.2, hot: 0.7 });
  neon(ctx, new Path2D(`M 4.9 ${bot + 0.1} L 10.3 ${bot + 0.1}`), col, w * 0.9, { a: A, halo: 0.6 });
  ctx.translate(0, (1 - comp) * (bot - top));
  const sw = squash ? 0 : Math.sin(t * 5) * 0.12;
  // dorsal fin: ribbed fan on the back
  const fin = new Path2D('M 5.6 6.4 Q 3.4 6.4 3.0 8.2 Q 3.2 9.6 4.6 10.0 Q 5.0 8.4 5.5 7.8');
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(col, 0.14 * A); ctx.fill(fin); ctx.restore();
  neon(ctx, fin, col, w * 0.55, { a: 0.85 * A, halo: 0.5, hot: 0.25 });
  neon(ctx, new Path2D('M 5.4 6.9 L 3.5 7.9 M 5.3 7.6 L 3.8 9.1'), col, w * 0.3, { a: 0.55 * A, halo: 0, hot: 0.1 });
  // body: S-curved ribbon from neck to the spring (arched back, bulging chest)
  const spine = sampleSpline([[9.8, 3.3], [7.0, 4.7 + sw], [8.7, 7.3], [9.1, 9.7], [7.6, 11.9]], 7);
  const hwS = (u) => 1.05 + 2.25 * Math.sin(Math.PI * Math.pow(Math.min(1, u * 1.12), 0.85)) * (1 - u * 0.5);
  const torso = taper(spine, hwS);
  body(ctx, torso, col, w, { a: A, y0: 3, y1: 12, tint: 1.3, hl: [6.6, 6.4, 5.2, 0.32] });
  neon(ctx, torso, col, w * 1.05, { a: A, grad: [3, 3, 12, 12] });
  // bony belly rings across the chest
  const ring = new Path2D();
  for (let i = 0; i < 5; i++) { const u = 0.2 + i * 0.16, p0 = spine[Math.floor(u * (spine.length - 1))]; const hw = hwS(u); ring.moveTo(p0[0] - hw * 0.9, p0[1] - 0.2); ring.quadraticCurveTo(p0[0], p0[1] + 0.9, p0[0] + hw * 0.95, p0[1] - 0.25); }
  neon(ctx, ring, col, w * 0.4, { a: 0.62 * A, halo: 0, hot: 0.3 });
  // head: cranium + long tube snout angled down
  const head = new Path2D('M 7.8 3.3 C 7.0 1.4 8.8 0.2 10.4 0.6 C 11.7 0.9 12.5 1.9 12.5 2.9 L 15.0 5.9 C 15.5 6.6 14.9 7.2 14.3 6.8 L 11.4 4.9 C 10.2 5.4 8.6 4.8 7.8 3.3 Z');
  body(ctx, head, col, w, { a: A, y0: 0, y1: 7, tint: 1.35, hl: [9.6, 2.0, 3.6, 0.35] });
  neon(ctx, head, col, w * 1.08, { a: A, grad: [7, 0, 15, 7] });
  // coronet (white-hot spikes) and a mane ridge down the neck
  neon(ctx, new Path2D('M 8.4 1.2 L 7.0 -0.2 L 8.8 0.0 L 8.2 -1.5 L 10.0 -0.4 L 10.6 -1.7 L 11.4 -0.1'), hot(col, 0.2), w * 0.7, { a: A, halo: 1.0, hot: 0.6 });
  neon(ctx, new Path2D('M 7.6 3.4 Q 6.4 4.2 6.5 5.6'), col, w * 0.5, { a: 0.7 * A, halo: 0.2, hot: 0.2 });
  eyeBall(ctx, 10.5, 2.2, 0.95, col, [0.6, 0.25], { a: A, w: w * 0.5 });
  if (o.angry) brow(ctx, 10.5, 2.2, 0.95, 1, w, col);
  dot(ctx, 14.6, 6.3, 0.2, WHITE, 0.6 * A, { halo: 2.2 });
  // pectoral fin
  neon(ctx, new Path2D('M 9.4 5.6 L 11.6 5.8 L 10.4 7.4 Z'), col, w * 0.55, { a: 0.85 * A, halo: 0.3 });
  if (o.angry) steam(ctx, 10, -1.6, t, w, col, 2);
}

/* ---------------------------------------------------------------- Glimmer: anglerfish with a lantern */
function glimmer(ctx, o, col, w, A) {
  const t = o.t, fire = o.state === 'fire', trapped = o.state === 'trapped';
  const wag = Math.sin(t * 4) * 0.5;
  const lant = RGB.amber;
  const pulse = 0.85 + Math.sin(t * 3.4) * 0.15 + (fire ? 0.5 : 0);
  // tail fan
  const tf = new Path2D(`M 2.5 9.6 L 0 ${6.1 + wag} Q 1.1 9.6 0 ${13 - wag} Z`);
  body(ctx, tf, col, w, { a: A, y0: 6, y1: 13 }); neon(ctx, tf, col, w * 0.95, { a: A });
  neon(ctx, new Path2D(`M 2.3 9.6 L 0.5 ${7.3 + wag * 0.8} M 2.3 9.6 L 0.4 ${11.8 - wag * 0.8}`), col, w * 0.35, { a: 0.5 * A, halo: 0, hot: 0.2 });
  // dorsal spikes
  neon(ctx, new Path2D('M 4.3 5.3 L 5.2 2.9 L 6.6 4.5 L 7.8 2.5 L 8.8 4.2'), col, w * 0.7, { a: A, halo: 0.6, hot: 0.4 });
  // body
  const bp = new Path2D('M 2.2 9.6 C 1.9 6 4.6 4.1 7.8 4.1 C 11.2 4.1 13.5 5.6 13.9 8 L 13.9 10.4 C 13.2 13.1 10.6 14.5 7.7 14.5 C 4.3 14.5 2.5 12.6 2.2 9.6 Z');
  body(ctx, bp, col, w, { a: A, y0: 4, y1: 14.5, tint: 1.25, hl: [6, 7, 6.4, 0.3] });
  neon(ctx, bp, col, w * 1.1, { a: A, grad: [2, 4, 14, 14.5] });
  // lateral bio-dots
  for (const [bx, by, r] of [[4.4, 8.6, 0.28], [5.9, 7.7, 0.24], [7.5, 7.2, 0.24], [3.9, 10.8, 0.22], [5.6, 11.4, 0.22]]) dot(ctx, bx, by, r, RGB.cyan, 0.8 * A, { halo: 2.6 });
  // pectoral fin
  neon(ctx, new Path2D('M 7.6 10.5 L 4.7 12.9 L 8.9 12.3 Z'), col, w * 0.6, { a: 0.85 * A, halo: 0.4 });
  // mouth + teeth
  const open = fire ? 1.4 : 0.8 + Math.sin(t * 3) * 0.1;
  const mouth = new Path2D(`M 13.9 8.2 Q 11.4 ${10.4 + open} 8.6 ${9.9 + open * 0.4}`);
  neon(ctx, mouth, hot(col, 0.4), w * 0.7, { a: A, halo: 0.5, hot: 0.5 });
  const teeth = new Path2D();
  for (let i = 0; i < 4; i++) { const u = 0.1 + i * 0.22; const x = lerp(13.7, 9.2, u), y = lerp(8.4, 9.9 + open * 0.4, u) + Math.sin(u * 3) * 0.3; teeth.moveTo(x, y); teeth.lineTo(x - 0.35, y + 1.1); teeth.lineTo(x - 0.7, y + 0.1); }
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(WHITE, 0.9 * A); ctx.fill(teeth); ctx.restore();
  // eye (amber-ringed)
  eyeBall(ctx, 10.5, 6.7, 1.55, lant, trapped ? [Math.sin(t * 10) * 0.4, 0.3] : [0.7, 0.2], { a: A, w: w * 0.6 });
  if (o.angry) brow(ctx, 10.5, 6.7, 1.55, 1, w, col);
  // antenna + lantern (own light source)
  const ant = new Path2D('M 9.6 4.3 C 10.2 0.4 14.2 -0.4 15.0 2.9');
  neon(ctx, ant, hot(col, 0.2), w * 0.7, { a: A, halo: 0.7 });
  const lx = 15.0, ly = 4.0;
  glow(ctx, lx, ly, 9 * pulse, lant, 0.5 * A);
  glow(ctx, lx, ly, 4 * pulse, hot(lant, 0.5), 0.6 * A);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgba(hot(lant, 0.3), 0.98 * A); ctx.beginPath(); ctx.arc(lx, ly, 1.25, 0, TAU); ctx.fill();
  ctx.fillStyle = rgba(WHITE, 0.98 * A); ctx.beginPath(); ctx.arc(lx - 0.1, ly - 0.15, 0.62, 0, TAU); ctx.fill();
  ctx.restore();
  sparkle(ctx, lx, ly, 2.1 * pulse, hot(lant, 0.4), 0.7 * A, 0);
  if (o.angry) steam(ctx, 6, 1.6, t, w, col, 2);
}

/* ---------------------------------------------------------------- Bonefin: skeletal ghost fish (no body fill) */
function bonefin(ctx, o, col, w, A) {
  const t = o.t;
  const bone = hot(mixc(RGB.white, RGB.cyan, 0.3), 0.3);
  const wob = (x, ph) => Math.sin(t * 3.2 + x * 0.55 + ph) * 0.35;
  // ghost wisps trailing behind (fading)
  for (let i = 0; i < 4; i++) {
    const y = 6.2 + i * 1.35;
    const sp = sampleSpline([[2.4, y], [0.4, y + wob(0.4, i)], [-2.2, y + 0.4 + wob(1, i + 1)], [-5, y + 0.2 + wob(2, i + 2)]], 5);
    const g = ctx.createLinearGradient(2.4, 0, -5, 0); g.addColorStop(0, rgba(bone, 0.35 * A)); g.addColorStop(1, rgba(bone, 0));
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = w * 0.7; ctx.lineCap = 'round'; ctx.strokeStyle = g; ctx.stroke(spinePath(sp)); ctx.restore();
  }
  glow(ctx, 8, 8, 11, bone, 0.14 * A);
  // spine + vertebrae + ribs
  const sp = [];
  for (let i = 0; i <= 10; i++) { const x = 7.6 - i * 0.55; sp.push([x, 8.2 + wob(x, 0)]); }
  neon(ctx, spinePath(sp), bone, w * 0.7, { a: A, halo: 0.8, hot: 0.5 });
  const vt = new Path2D(), rb = new Path2D();
  for (let i = 0; i <= 10; i++) { const x = sp[i][0], y = sp[i][1]; vt.moveTo(x, y - 0.6); vt.lineTo(x, y + 0.6); }
  for (let i = 1; i <= 6; i++) { const x = sp[i][0], y = sp[i][1], r = 3.0 - i * 0.28; rb.moveTo(x, y); rb.quadraticCurveTo(x - 0.5, y + r * 0.75, x + 0.3, y + r + 0.2); rb.moveTo(x, y); rb.quadraticCurveTo(x - 0.5, y - r * 0.55, x + 0.1, y - r * 0.8); }
  neon(ctx, vt, bone, w * 0.4, { a: 0.7 * A, halo: 0.2, hot: 0.2 });
  neon(ctx, rb, bone, w * 0.5, { a: 0.9 * A, halo: 0.6, hot: 0.3 });
  // tail bones (fan)
  const tl = new Path2D();
  const tail0 = sp[10];
  for (const [ex, ey] of [[0.2, 4.2], [-0.3, 6.4], [-0.5, 8.4], [-0.3, 10.4], [0.2, 12.4]]) { tl.moveTo(tail0[0], tail0[1]); tl.lineTo(ex + wob(ex, ey), ey); }
  tl.moveTo(0.2, 4.2); tl.quadraticCurveTo(-1.0, 8.3, 0.2, 12.4);
  neon(ctx, tl, bone, w * 0.55, { a: 0.85 * A, halo: 0.6, hot: 0.3 });
  // dorsal & ventral rays
  const fr = new Path2D();
  for (const [bx, ex, ey] of [[6.2, 5.4, 4.3], [5.0, 4.6, 4.6], [3.8, 3.2, 5.2]]) { fr.moveTo(bx, 8.1); fr.lineTo(ex, ey); }
  for (const [bx, ex, ey] of [[5.6, 5.0, 12.0], [4.2, 3.4, 11.4]]) { fr.moveTo(bx, 8.3); fr.lineTo(ex, ey); }
  neon(ctx, fr, bone, w * 0.45, { a: 0.7 * A, halo: 0.4, hot: 0.2 });
  // skull (pike-like): sloped cranium into a pointed snout, brow ridge, gill-cover arc, open jaw with fangs
  const skull = new Path2D('M 7.4 7.4 C 7.6 5.5 9.4 4.8 11 5.1 C 12.8 5.4 14.5 6.9 15.5 8.5 L 15.0 9.1 L 10.4 9.2 C 8.8 9.2 7.5 8.6 7.4 7.4 Z');
  const jaw = new Path2D('M 10.2 9.9 L 15.1 10.3 L 14.4 11.3 L 11.2 11.5 C 10.3 11.3 9.9 10.7 10.2 9.9 Z');
  for (const sh of [skull, jaw]) { ctx.save(); ctx.fillStyle = 'rgba(4,6,14,0.84)'; ctx.fill(sh); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(bone, 0.08 * A); ctx.fill(sh); ctx.restore(); }
  neon(ctx, skull, bone, w * 1.0, { a: A, halo: 1.1, hot: 0.65 });
  neon(ctx, jaw, bone, w * 0.8, { a: A, halo: 0.7, hot: 0.5 });
  neon(ctx, new Path2D('M 9.3 5.9 C 8.5 7 8.7 8.1 9.5 8.9 M 12.6 5.9 L 13.9 7.1 M 13.6 6.6 L 14.6 7.9'), bone, w * 0.4, { a: 0.7 * A, halo: 0, hot: 0.2 });
  const tt = new Path2D();
  for (let i = 0; i < 5; i++) { const x = 10.6 + i * 0.95; tt.moveTo(x, 9.2); tt.lineTo(x + 0.32, 10.2); tt.lineTo(x + 0.64, 9.2); }
  for (let i = 0; i < 4; i++) { const x = 11.1 + i * 1.0; tt.moveTo(x, 10.1); tt.lineTo(x + 0.3, 9.3); tt.lineTo(x + 0.6, 10.1); }
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(WHITE, 0.92 * A); ctx.fill(tt); ctx.restore();
  // hollow socket with a cold flame, heavy brow
  const ex = 11.2, ey = 6.9;
  ctx.save(); ctx.fillStyle = 'rgba(2,3,8,0.97)'; ctx.beginPath(); ctx.arc(ex, ey, 1.2, 0, TAU); ctx.fill(); ctx.restore();
  neon(ctx, circlePath(ex, ey, 1.2), bone, w * 0.6, { a: A, halo: 0.5 });
  neon(ctx, new Path2D('M 9.4 5.6 L 12.8 6.2'), bone, w * 0.75, { a: A, halo: 0.4, hot: 0.4 });
  glow(ctx, ex, ey, 2.4, RGB.cyan, 0.34 * A * (0.8 + Math.sin(t * 5) * 0.2));
  dot(ctx, ex + 0.15, ey, 0.38, hot(RGB.cyan, 0.5), A, { halo: 2.6 });
}

const ENEMY_FN = { nibbler, crabbit, jellop, springle, glimmer, bonefin };
/* ABYSS GLOW — Kraken King (48 x 48 design box): crowned royal-purple octopus, heavy-browed amber eyes, curling tentacles.
 * Tentacles are tapered ribbons on animated Catmull-Rom splines (the same primitive as gills/tails). */
function kraken(ctx, o, col, w, A) {
  const t = o.t, ang = !!o.angry;
  const hue = ang ? mixc(RGB.purple, RGB.crimson, 0.55) : RGB.purple;
  const gold = RGB.amber, eyeC = ang ? RGB.crimson : RGB.amber;
  const W2 = w * 1.0;
  const sw = (i, a, ph) => Math.sin(t * 1.7 + i * 1.3 + (ph || 0)) * a;
  glow(ctx, 24, 20, 36, hue, 0.2);
  glow(ctx, 24, 38, 26, RGB.magenta, 0.07, 0.7);

  // tentacles: outer pair curl outward into spirals, inner six sway and fan (no crossings)
  const sp0 = (i, pts) => pts.map((p) => [p[0], p[1]]);
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
  const order = [0, 7, 1, 6, 2, 5, 3, 4];
  order.forEach((idx) => {
    const sp = sampleSpline(sp0(idx, spines[idx]), 8);
    const rb = taper(sp, (u) => 1.8 * Math.pow(1 - u, 0.85) + 0.26);
    ctx.save(); ctx.fillStyle = 'rgba(4,6,14,0.92)'; ctx.fill(rb); ctx.restore();
    const g = ctx.createLinearGradient(0, 27, 0, 47);
    g.addColorStop(0, rgba(mixc(hue, RGB.void, 0.1), 0.5)); g.addColorStop(1, rgba(mixc(hue, RGB.magenta, 0.55), 0.38));
    ctx.save(); ctx.fillStyle = g; ctx.fill(rb); ctx.restore();
    neon(ctx, rb, hue, W2 * 0.95, { a: A, grad: [0, 28, 0, 47], gradHot: 0.28, halo: 1.0, hot: 0.45 });
    // suckers along the inner edge
    const dots = new Path2D();
    for (let i = 7; i < sp.length - 5; i += 5) {
      const hw = 1.8 * Math.pow(1 - i / (sp.length - 1), 0.85) + 0.26;
      dots.moveTo(sp[i][0] + hw * 0.32, sp[i][1]); dots.arc(sp[i][0], sp[i][1], Math.max(0.3, hw * 0.32), 0, TAU);
    }
    neon(ctx, dots, mixc(hue, RGB.magenta, 0.5), W2 * 0.4, { a: 0.85 * A, halo: 0.2, hot: 0.3 });
    const tip = sp[sp.length - 1];
    dot(ctx, tip[0], tip[1], 0.55, mixc(RGB.magenta, WHITE, 0.3), A * 0.9, { halo: 3.5 });
  });

  // mantle (hooded dome)
  const mantle = new Path2D('M 8.6 27 C 5.4 11 15 5.4 24 5.4 C 33 5.4 42.6 11 39.4 27 C 36 31.4 12 31.4 8.6 27 Z');
  body(ctx, mantle, hue, W2, { a: A, y0: 5, y1: 31, tint: 1.55, hl: [17, 13, 20, 0.34] });
  neon(ctx, mantle, hue, W2 * 1.15, { a: A, grad: [8, 6, 40, 31], gradHot: 0.3, halo: 1.3, hot: 0.5 });
  neon(ctx, new Path2D('M 12.4 14 C 14.4 10.2 18.6 8.2 22 7.8'), WHITE, W2 * 0.55, { a: 0.55, halo: 0.2, hot: 0.4 });
  // arched ridges + bioluminescent spots
  const ridges = new Path2D('M 10.6 21 C 12 12.4 19 9.8 24 9.8 C 29 9.8 36 12.4 37.4 21 M 14.2 25.4 C 15.4 18.6 20 15.2 24 15.2 C 28 15.2 32.6 18.6 33.8 25.4');
  neon(ctx, ridges, hue, W2 * 0.45, { a: 0.5 * A, halo: 0, hot: 0.3 });
  for (const [sx2, sy2, r] of [[13.2, 17.6, 0.5], [34.8, 17.6, 0.5], [16.4, 12.8, 0.4], [31.6, 12.8, 0.4], [11.6, 23.2, 0.45], [36.4, 23.2, 0.45], [24, 11.6, 0.5], [19.2, 11.2, 0.35], [28.8, 11.2, 0.35], [24, 16.6, 0.45], [18.4, 27.6, 0.4], [29.6, 27.6, 0.4]])
    dot(ctx, sx2, sy2, r, mixc(RGB.cyan, hue, 0.15), 0.9 * A, { halo: 3 });

  // eyes: dark almond sockets, glowing iris, slit pupil, heavy brows (steeper when angry)
  const look = [Math.sin(t * 0.8) * 0.25, 0.1];
  for (const s of [-1, 1]) {
    const mx = (x) => (s < 0 ? x : 48 - x);
    const al = new Path2D(`M ${mx(11.8)} 22.4 Q ${mx(16.8)} ${ang ? 15.6 : 16.4} ${mx(22.4)} ${ang ? 23.2 : 22.2} Q ${mx(16.8)} 26.6 ${mx(11.8)} 22.4 Z`);
    ctx.save(); ctx.fillStyle = 'rgba(3,3,10,0.97)'; ctx.fill(al); ctx.restore();
    glow(ctx, mx(17.2), 21.4, 7, eyeC, 0.28 * A);
    ctx.save(); ctx.clip(al); ctx.globalCompositeOperation = 'lighter';
    const ig = ctx.createRadialGradient(mx(17.4 + look[0]), 21.6, 0.3, mx(17.4 + look[0]), 21.6, 3.3);
    ig.addColorStop(0, rgba(hot(eyeC, 0.7), 1)); ig.addColorStop(0.55, rgba(eyeC, 0.95)); ig.addColorStop(1, rgba(eyeC, 0.25));
    ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(mx(17.4 + look[0]), 21.6, 3.3, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = 'rgba(3,2,8,0.96)';
    ctx.beginPath(); ctx.ellipse(mx(17.4 + look[0] * 1.3), 21.6, 0.7, 2.7, 0, 0, TAU); ctx.fill();
    ctx.restore();
    neon(ctx, al, hot(eyeC, 0.2), W2 * 0.8, { a: A, halo: 1.0, hot: 0.5 });
    const bs = ang ? 4.4 : 2.8;
    neon(ctx, new Path2D(`M ${mx(10.6)} ${17.4 - bs * 0.2} L ${mx(23.2)} ${16.6 + bs}`), hot(hue, 0.25), W2 * 1.25, { a: A, halo: 1.0, hot: 0.55 });
    dot(ctx, mx(16.4), 20.4, 0.4, WHITE, 0.95 * A, { halo: 2.4 });
  }
  // stern mouth (a heavy frown with two small fangs) instead of a beak - the old triangle made the boss read as an owl
  neon(ctx, new Path2D('M 19.2 28.6 Q 24 25.6 28.8 28.6'), hot(hue, 0.5), W2 * 0.8, { a: A, halo: 0.7, hot: 0.5 });
  for (const fx of [21.6, 26.4]) neon(ctx, new Path2D(`M ${fx - 0.5} 27.5 L ${fx} 29.3 L ${fx + 0.5} 27.5`), WHITE, W2 * 0.45, { a: 0.85 * A, halo: 0.2, hot: 0.3 });
  // crown (gold, glowing, gem-tipped)
  const crown = new Path2D('M 15.6 8.4 L 16.6 1.4 L 20.5 5.2 L 24 -0.8 L 27.5 5.2 L 31.4 1.4 L 32.4 8.4 C 28 9.8 20 9.8 15.6 8.4 Z');
  ctx.save(); ctx.fillStyle = 'rgba(4,6,14,0.92)'; ctx.fill(crown); ctx.globalCompositeOperation = 'lighter';
  const cg = ctx.createLinearGradient(0, -1, 0, 9); cg.addColorStop(0, rgba(hot(gold, 0.4), 0.45)); cg.addColorStop(1, rgba(gold, 0.15)); ctx.fillStyle = cg; ctx.fill(crown); ctx.restore();
  neon(ctx, crown, gold, W2 * 1.0, { a: A, halo: 1.4, hot: 0.6, gradHot: 0.4 });
  for (const [gx, gy, c2] of [[16.6, 1.2, RGB.cyan], [24, -1.0, RGB.magenta], [31.4, 1.2, RGB.cyan]]) dot(ctx, gx, gy, 0.8, c2, A, { halo: 4 });
  neon(ctx, new Path2D('M 17.4 6.8 C 21 8 27 8 30.6 6.8'), hot(gold, 0.5), W2 * 0.4, { a: 0.8 * A, halo: 0, hot: 0.2 });
  dot(ctx, 24, 6.6, 0.55, RGB.magenta, A, { halo: 4 });
  sparkle(ctx, 24, -1.0, 2.2 + Math.sin(t * 3) * 0.5, hot(gold, 0.5), 0.8 * A, 0);
}
ENEMY_FN.kraken = kraken;
/* ABYSS GLOW — bubbles, food, power-ups, rings, trails. Bubble functions work in OUTPUT px (centre x,y; radius r). */

const FILM = [RGB.cyan, RGB.violet, RGB.magenta, RGB.amber, RGB.cyan];   // thin-film sweep: cyan -> violet -> magenta -> gold -> cyan

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

/* a soap bubble: halo, near-invisible body, iridescent thin-film rim, window highlight, secondary reflection */
function bubbleShell(ctx, x, y, r, t, o) {
  o = o || {};
  const tint = o.tint || RGB.cyan, A = o.a === undefined ? 1 : o.a;
  const w = clamp(r * 0.055, 1.3, 4.2);
  const ph = o.ph || 0;
  const wob = o.wobble === undefined ? 1 : o.wobble;
  const sx = 1 + Math.sin(t * 3.1 + ph) * 0.028 * wob, sy = 1 - Math.sin(t * 3.1 + ph) * 0.028 * wob;
  ctx.save();
  ctx.translate(x, y); ctx.scale(sx, sy);
  // halo: a RING of light (zero in the middle so the contents stay visible, peaking at the film, fading outwards)
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const ha = 0.17 * A * (o.halo === undefined ? 1 : o.halo);
  const hg = ctx.createRadialGradient(0, 0, r * 0.62, 0, 0, r * 1.95);
  hg.addColorStop(0, rgba(tint, 0)); hg.addColorStop(0.2, rgba(tint, ha * 0.3)); hg.addColorStop(0.31, rgba(tint, ha)); hg.addColorStop(0.5, rgba(tint, ha * 0.32)); hg.addColorStop(0.75, rgba(tint, ha * 0.07)); hg.addColorStop(1, rgba(tint, 0));
  ctx.fillStyle = hg; ctx.fillRect(-r * 2, -r * 2, r * 4, r * 4);
  // body: nearly transparent; only the edge carries colour (fresnel)
  const bg = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r);
  bg.addColorStop(0, rgba(tint, 0)); bg.addColorStop(0.75, rgba(tint, 0.015 * A)); bg.addColorStop(1, rgba(tint, 0.09 * A));
  ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  if (o.fill) { const fg = ctx.createRadialGradient(0, r * 0.1, r * 0.2, 0, 0, r); fg.addColorStop(0, rgba(o.fill, 0.0)); fg.addColorStop(1, rgba(o.fill, 0.13 * A)); ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); }
  // refracted light pooling in the lower-right of the sphere (the bubble acts as a lens: soft tinted caustic, opposite the window highlight)
  const cg = ctx.createRadialGradient(r * 0.34, r * 0.4, 0, r * 0.34, r * 0.4, r * 0.82);
  cg.addColorStop(0, rgba(hot(tint, 0.35), 0.17 * A)); cg.addColorStop(0.5, rgba(tint, 0.05 * A)); cg.addColorStop(1, rgba(tint, 0));
  ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(0, 0, r * 0.97, 0, TAU); ctx.fill();
  // thin-film cap: iridescent colour bands pooled at the top-left (thin film) and a faint echo at the bottom, drifting slowly
  if (ctx.createConicGradient && r > 7) {      // film bands only where they can be seen (tiny bubbles skip them)
    const stops = o.stops || FILM, drift = Math.sin(t * 0.5 + ph) * 0.14, FA = A * (o.film === undefined ? 1 : o.film);
    const band = (a0, f, al, wid) => {
      const g = ctx.createConicGradient(a0 + drift, 0, 0);
      const n = f.length;
      f.forEach((fr, i) => g.addColorStop(fr, rgba(hot(stops[Math.min(stops.length - 1, Math.round(i / (n - 1) * (stops.length - 1)))], 0.2), Math.min(1, al[i] * FA))));
      ctx.lineWidth = wid; ctx.strokeStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 0.86, 0, TAU); ctx.stroke();
    };
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r * 0.985, 0, TAU); ctx.clip(); ctx.lineCap = 'butt';
    band(2.55, [0, 0.1, 0.24, 0.38, 0.5, 0.6, 1], [0, 0.14, 0.36, 0.26, 0.1, 0, 0], r * 0.3);                  // top-left cap: broad, soft
    band(2.55, [0, 0.1, 0.24, 0.38, 0.5, 0.6, 1], [0, 0.1, 0.3, 0.2, 0.08, 0, 0], r * 0.14);                // ... and a narrower brighter core
    band(0.35, [0, 0.12, 0.3, 0.45, 1], [0, 0.1, 0.17, 0, 0], r * 0.22);                                     // bottom-right echo
    ctx.restore();
  }
  ctx.restore();
  return { w, end() { ctx.restore(); } };
}
function bubbleRim(ctx, x, y, r, t, o) { // call inside bubbleShell's transform (origin = bubble centre)
  o = o || {};
  const A = o.a === undefined ? 1 : o.a, w = clamp(r * 0.042, 1.2, 3.3);
  const stops = o.stops || FILM;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const rot = t * 0.55 + (o.ph || 0);
  ctx.lineWidth = w * 3.2; ctx.strokeStyle = filmGradient(ctx, 0, 0, rot, 0.10 * A, stops); ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
  ctx.lineWidth = w * 1.5; ctx.strokeStyle = filmGradient(ctx, 0, 0, rot, 0.34 * A, stops); ctx.stroke();
  ctx.lineWidth = w * 0.8; ctx.strokeStyle = filmGradient(ctx, 0, 0, rot, 0.62 * A, stops); ctx.stroke();      // whole rim: thin
  ctx.lineCap = 'round';
  const seg = (a0, a1, lw, al) => { ctx.lineWidth = lw; ctx.strokeStyle = filmGradient(ctx, 0, 0, rot, al * A, stops); ctx.beginPath(); ctx.arc(0, 0, r, a0 * Math.PI / 180, a1 * Math.PI / 180); ctx.stroke(); };
  seg(175, 292, w * 1.25, 0.95);        // lit side (key light, top-left): thicker and hotter
  seg(5, 95, w * 1.05, 0.7);            // second lit side (bounce, bottom-right)
  // inner wall
  ctx.lineWidth = w * 0.5; ctx.strokeStyle = rgba(WHITE, 0.10 * A); ctx.beginPath(); ctx.arc(0, 0, r * 0.89, 0, TAU); ctx.stroke();
  // window highlight (top-left), tapered by two strokes
  const hl = (rr, a0, a1, lw, al) => { ctx.lineWidth = lw; ctx.strokeStyle = rgba(WHITE, al * A); ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(0, 0, rr, a0 * Math.PI / 180, a1 * Math.PI / 180); ctx.stroke(); };
  hl(r * 0.7, 200, 252, w * 2.1, 0.30);
  hl(r * 0.7, 206, 246, w * 1.2, 0.92);
  ctx.fillStyle = rgba(WHITE, 0.95 * A); ctx.beginPath(); ctx.arc(Math.cos(262 * Math.PI / 180) * r * 0.7, Math.sin(262 * Math.PI / 180) * r * 0.7, w * 0.9, 0, TAU); ctx.fill();
  // secondary reflection (bottom-right), tinted
  ctx.lineWidth = w * 2.6; ctx.strokeStyle = filmGradient(ctx, 0, 0, rot + 2, 0.16 * A, stops);
  ctx.beginPath(); ctx.arc(0, 0, r * 0.76, 14 * Math.PI / 180, 66 * Math.PI / 180); ctx.stroke();
  ctx.lineWidth = w * 1.05; ctx.strokeStyle = filmGradient(ctx, 0, 0, rot + 2, 0.7 * A, stops);
  ctx.beginPath(); ctx.arc(0, 0, r * 0.76, 20 * Math.PI / 180, 58 * Math.PI / 180); ctx.stroke();
  ctx.lineWidth = w * 0.7; ctx.strokeStyle = rgba(WHITE, 0.45 * A);
  ctx.beginPath(); ctx.arc(0, 0, r * 0.76, 30 * Math.PI / 180, 46 * Math.PI / 180); ctx.stroke();
  ctx.restore();
}

function boltPath(r) {
  const P = [[0.2, -0.66], [-0.3, 0.06], [0.02, 0.06], [-0.2, 0.68], [0.36, -0.14], [0.05, -0.14], [0.3, -0.66]];
  return poly(P.map((p) => [p[0] * r, p[1] * r]), true);
}
function flamePath(r, t) {
  const f = Math.sin(t * 9) * 0.04, g = Math.sin(t * 7 + 1) * 0.05;
  const s = (v) => v * r;
  return new Path2D(`M ${s(0)} ${s(-0.66)} C ${s(0.1 + f)} ${s(-0.4)} ${s(0.46)} ${s(-0.2)} ${s(0.42)} ${s(0.2)} C ${s(0.4)} ${s(0.5)} ${s(0.2)} ${s(0.66)} ${s(0)} ${s(0.66)} C ${s(-0.24)} ${s(0.66)} ${s(-0.42)} ${s(0.48)} ${s(-0.4)} ${s(0.2)} C ${s(-0.38)} ${s(-0.02 + g)} ${s(-0.16)} ${s(-0.1)} ${s(-0.12)} ${s(-0.3)} C ${s(-0.1)} ${s(-0.42)} ${s(-0.02)} ${s(-0.52)} ${s(0)} ${s(-0.66)} Z`);
}
function dropPath(r) {
  const s = (v) => v * r;
  return new Path2D(`M ${s(0)} ${s(-0.68)} C ${s(0.1)} ${s(-0.4)} ${s(0.44)} ${s(-0.1)} ${s(0.44)} ${s(0.24)} C ${s(0.44)} ${s(0.52)} ${s(0.24)} ${s(0.68)} ${s(0)} ${s(0.68)} C ${s(-0.24)} ${s(0.68)} ${s(-0.44)} ${s(0.52)} ${s(-0.44)} ${s(0.24)} C ${s(-0.44)} ${s(-0.1)} ${s(-0.1)} ${s(-0.4)} ${s(0)} ${s(-0.68)} Z`);
}

/* kind: 'empty' | 'shot' | 'trapped' | 'thunder' | 'fire' | 'water' | 'warn'
 * o: {t, ph, stage (0..2, trapped), enemy:{type, angry}, k (px per logical px, for the enemy inside), a} */
function drawBubble(ctx, kind, x, y, r, o) {
  o = o || {};
  const t = o.t || 0, ph = o.ph || 0, A = o.a === undefined ? 1 : o.a;
  const w = clamp(r * 0.055, 1.3, 4.2);
  let tint = RGB.cyan, stops = FILM, fill = null, haloA = 1;
  if (kind === 'trapped') {
    const st = o.stage || 0;
    if (st === 0) { tint = RGB.cyan; }
    else if (st === 1) { tint = RGB.amber; fill = RGB.amber; stops = [RGB.amber, hot(RGB.amber, 0.5), RGB.ember, RGB.amber, RGB.amber]; haloA = 1.2 + Math.sin(t * 8) * 0.2; }
    else { tint = RGB.crimson; fill = RGB.crimson; stops = [RGB.crimson, RGB.magenta, RGB.ember, RGB.crimson, RGB.crimson]; haloA = 1.3 + Math.sin(t * 14) * 0.3; }
  } else if (kind === 'thunder') { tint = RGB.amber; fill = RGB.amber; stops = [RGB.amber, hot(RGB.amber, 0.6), RGB.cyan, RGB.amber, RGB.amber]; }
  else if (kind === 'fire') { tint = RGB.ember; fill = RGB.ember; stops = [RGB.ember, RGB.amber, RGB.crimson, RGB.ember, RGB.ember]; }
  else if (kind === 'water') { tint = RGB.cobalt; fill = RGB.cobalt; stops = [RGB.cobalt, RGB.cyan, RGB.violet, RGB.cobalt, RGB.cobalt]; }
  else if (kind === 'warn') { tint = RGB.crimson; stops = [RGB.crimson, RGB.magenta, RGB.amber, RGB.crimson, RGB.crimson]; }
  else if (kind === 'shot') { tint = RGB.cyan; haloA = 1.5; }
  if (o.tint) tint = o.tint;

  const dim = o.dim === undefined ? 1 : o.dim;
  const sh = bubbleShell(ctx, x, y, r, t, { tint, a: A * dim, ph, fill, halo: haloA * (o.halo === undefined ? 1 : o.halo), wobble: kind === 'shot' ? 2 : 1, stops, film: kind === 'shot' ? 1.9 : (o.film || 1) });
  // contents (drawn in bubble-local space, behind the rim highlight)
  if (kind === 'trapped' && o.enemy) {
    const bump = Math.sin(t * 13 + ph) * r * 0.03;
    const ek = (r * 2 * 0.74) / 16;
    // dark backing so the captive reads clearly through any warning tint
    ctx.save(); ctx.fillStyle = 'rgba(4,6,14,0.42)'; ctx.beginPath(); ctx.arc(0, 0, r * 0.93, 0, TAU); ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(bump, -bump * 0.7); ctx.rotate(Math.sin(t * 9 + ph) * 0.08);
    drawEnemy(ctx, o.enemy.type, { x: -8 * ek, y: -8 * ek, k: ek, t, face: o.enemy.face || 1, state: 'trapped', angry: !!o.enemy.angry });
    ctx.restore();
  } else if (kind === 'thunder') {
    const flick = 0.82 + 0.18 * Math.sin(t * 17);
    const bp = boltPath(r * 0.82);
    glow(ctx, 0, 0, r * 0.9, RGB.amber, 0.4 * flick);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(hot(RGB.amber, 0.78), 0.96 * flick); ctx.fill(bp); ctx.restore();
    neon(ctx, bp, RGB.amber, w * 0.8, { a: 1, halo: 1.2, hot: 0.7 });
    // crackling arcs leaving the bubble
    const R2 = rng(Math.floor(t * 12) + 3);
    const arcs = new Path2D();
    for (let i = 0; i < 3; i++) {
      const a0 = R2.float(0, TAU); let px = Math.cos(a0) * r * 1.02, py = Math.sin(a0) * r * 1.02;
      arcs.moveTo(px, py);
      for (let s = 0; s < 3; s++) { const aa = a0 + R2.float(-0.3, 0.3); const rr = r * (1.08 + (s + 1) * 0.13); arcs.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr); }
    }
    neon(ctx, arcs, hot(RGB.amber, 0.3), w * 0.6, { a: 0.85 * flick, halo: 0.8, hot: 0.6 });
  } else if (kind === 'fire') {
    const fp = flamePath(r * 0.9, t), fi = flamePath(r * 0.5, t + 1);
    glow(ctx, 0, r * 0.1, r * 1.0, RGB.ember, 0.4);
    ctx.save(); ctx.translate(0, r * 0.06); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(RGB.ember, 0.4); ctx.fill(fp); ctx.restore();
    ctx.save(); ctx.translate(0, r * 0.06); neon(ctx, fp, RGB.ember, w * 0.85, { a: 1, halo: 1.1, hot: 0.55 }); ctx.restore();
    ctx.save(); ctx.translate(0, r * 0.2); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(hot(RGB.amber, 0.6), 0.95); ctx.fill(fi); ctx.restore();
  } else if (kind === 'water') {
    const dp = dropPath(r * 0.82);
    glow(ctx, 0, 0, r * 0.9, RGB.cobalt, 0.4);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const dg = ctx.createLinearGradient(0, -r * 0.6, 0, r * 0.6); dg.addColorStop(0, rgba(RGB.cyan, 0.5)); dg.addColorStop(1, rgba(RGB.cobalt, 0.5));
    ctx.fillStyle = dg; ctx.fill(dp); ctx.restore();
    neon(ctx, dp, hot(RGB.cyan, 0.15), w * 0.85, { a: 1, halo: 1.1, hot: 0.6 });
    neon(ctx, new Path2D(`M ${-r * 0.2} ${r * 0.05} Q ${-r * 0.26} ${r * 0.34} ${-r * 0.06} ${r * 0.44}`), WHITE, w * 0.6, { a: 0.9, halo: 0, hot: 0.3 });
  }
  bubbleRim(ctx, 0, 0, r, t, { a: A * dim, stops, ph });
  sh.end();
}

/* shockwave ring (pop) */
function drawRing(ctx, x, y, r, col, a, w) {
  const p = circlePath(x, y, r);
  neon(ctx, p, col, w || 1.6, { a, halo: 1.2, hot: 0.5 });
}
/* pop burst: ring + droplets */
function drawPop(ctx, x, y, r0, u, col, seed) {
  const R = rng(seed || 1), k = 1 - u;
  drawRing(ctx, x, y, r0 * (1 + u * 1.2), col, 0.9 * k, Math.max(1.2, r0 * 0.05));
  drawRing(ctx, x, y, r0 * (0.8 + u * 0.7), hot(col, 0.4), 0.45 * k, 1.1);
  for (let i = 0; i < 9; i++) { const a = R.float(0, TAU), d = r0 * (0.8 + u * R.float(0.6, 1.5)); dot(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, Math.max(0.9, r0 * 0.06 * k), col, k, { halo: 3 }); }
}

/* luminous motion trail: points are OUTPUT px, newest first; tapering ribbon with a gradient to transparent */
function drawTrail(ctx, pts, col, w0, a) {
  if (pts.length < 2) return;
  const sp = sampleSpline(pts, 6);
  const rb = taper(sp, (u) => w0 * 0.5 * Math.pow(1 - u, 0.9));
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[pts.length - 1][0], pts[pts.length - 1][1]);
  g.addColorStop(0, rgba(col, 0.5 * a)); g.addColorStop(0.5, rgba(col, 0.16 * a)); g.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = g; ctx.fill(rb);
  const g2 = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[pts.length - 1][0], pts[pts.length - 1][1]);
  g2.addColorStop(0, rgba(hot(col, 0.6), 0.55 * a)); g2.addColorStop(1, rgba(col, 0));
  ctx.strokeStyle = g2; ctx.lineWidth = Math.max(1, w0 * 0.14); ctx.lineCap = 'round'; ctx.stroke(spinePath(sp));
  ctx.restore();
}

/* ---------------------------------------------------------------- food: sushi (food_4) */
function drawFood(ctx, kind, o) {
  o = Object.assign({ face: 1, t: 0, k: 4.8 }, o);
  const t = o.t, w = lwFor(o.k);
  const fish = mixc(RGB.ember, RGB.magenta, 0.3), rice = mixc(WHITE, RGB.cyan, 0.12), nori = mixc(RGB.lime, RGB.cobalt, 0.25);
  placeSprite(ctx, o, 16, () => {
    const bob = Math.sin(t * 2.6) * 0.3;
    ctx.translate(0, -0.4 + bob);
    glow(ctx, 8, 10, 10, fish, 0.22);
    // rice mound
    const rp = new Path2D('M 2.5 11.3 C 2.1 9.9 3.3 9.2 5 9.2 L 11 9.2 C 12.7 9.2 13.9 9.9 13.5 11.3 C 13.5 13.4 12.9 15.4 11.3 15.5 L 4.7 15.5 C 3.1 15.4 2.5 13.4 2.5 11.3 Z');
    body(ctx, rp, rice, w, { y0: 8, y1: 15.6, tint: 0.55 });
    neon(ctx, rp, rice, w * 0.95, { grad: [3, 8, 13, 15.5], halo: 0.7, hot: 0.5 });
    for (const [gx, gy] of [[3.9, 11.4], [4.6, 13.6], [12.1, 11.6], [11.4, 13.8], [4.1, 9.6]]) dot(ctx, gx, gy, 0.18, WHITE, 0.5, { halo: 2 });
    // fish topping, hanging over both sides of the rice
    const fp = new Path2D('M 0.6 10.0 C 0.2 7.6 3.8 6.1 8 6.2 C 12.2 6.1 15.8 7.6 15.4 10.0 C 15.2 11.6 13.6 11.9 12.4 11.4 L 3.6 11.4 C 2.4 11.9 0.8 11.6 0.6 10.0 Z');
    body(ctx, fp, fish, w, { y0: 6, y1: 11.6, tint: 1.8 });
    neon(ctx, fp, fish, w * 1.05, { grad: [2, 6, 14, 11.5], halo: 1.1, hot: 0.6 });
    neon(ctx, new Path2D('M 2.2 9.4 Q 4.6 7.4 6.4 8.2 M 9.8 7.4 Q 12 7.0 13.8 8.8 M 3.4 10.6 Q 7 9.4 10.6 10.4'), hot(fish, 0.7), w * 0.5, { a: 0.9, halo: 0.2, hot: 0.4 });
    // nori belt: dark band with a hairline outline
    const nb = new Path2D('M 6.9 6.0 L 9.1 6.0 L 9.3 14.9 L 6.7 14.9 Z');
    ctx.save(); ctx.fillStyle = 'rgba(3,5,12,0.62)'; ctx.fill(nb); ctx.restore();
    neon(ctx, nb, nori, w * 0.55, { a: 0.75, halo: 0.3, hot: 0.2 });
    const tw = (ph) => 0.5 + 0.5 * Math.sin(t * 3 + ph);
    sparkle(ctx, 1.4, 2.6, 2.1 * (0.5 + tw(0) * 0.8), hot(RGB.amber, 0.3), 0.95 * (0.3 + tw(0)), 0);
    sparkle(ctx, 14.6, 1.8, 1.8 * (0.5 + tw(2) * 0.8), WHITE, 0.95 * (0.3 + tw(2)), 0);
    sparkle(ctx, 13.6, 13.8, 1.3 * (0.5 + tw(4) * 0.8), RGB.cyan, 0.8 * (0.3 + tw(4)), 0);
  });
}

/* ---------------------------------------------------------------- power-up: heart pearl (pu_heart) */
function drawPowerup(ctx, kind, o) {
  o = Object.assign({ t: 0, k: 4.8, face: 1 }, o);
  const t = o.t, w = lwFor(o.k), col = RGB.magenta;
  placeSprite(ctx, o, 16, () => {
    const pulse = 1 + Math.sin(t * 4) * 0.05;
    glow(ctx, 8, 8, 12, col, 0.30);
    // orbit ring with ticks
    const ring = circlePath(8, 8, 7.2);
    neon(ctx, ring, RGB.cyan, w * 0.55, { a: 0.8, halo: 0.6, hot: 0.4 });
    const ticks = new Path2D();
    for (let i = 0; i < 4; i++) { const a = t * 0.9 + i * TAU / 4; ticks.moveTo(8 + Math.cos(a) * 6.3, 8 + Math.sin(a) * 6.3); ticks.lineTo(8 + Math.cos(a) * 8.1, 8 + Math.sin(a) * 8.1); }
    neon(ctx, ticks, WHITE, w * 0.7, { a: 0.9, halo: 0.8, hot: 0.4 });
    ctx.save(); ctx.translate(8, 8.4); ctx.scale(pulse, pulse); ctx.translate(-8, -8.4);
    const hp = new Path2D('M 8 13.2 C 2.2 9.4 1.9 5 4.7 3.8 C 6.4 3.1 7.6 4 8 5.3 C 8.4 4 9.6 3.1 11.3 3.8 C 14.1 5 13.8 9.4 8 13.2 Z');
    body(ctx, hp, col, w, { y0: 3, y1: 13.5, tint: 1.6 });
    neon(ctx, hp, col, w * 1.1, { grad: [3, 3, 13, 13], halo: 1.2, hot: 0.65 });
    neon(ctx, new Path2D('M 4.4 5.6 Q 4.9 4.6 6.1 4.5'), WHITE, w * 0.6, { a: 0.9, halo: 0, hot: 0.3 });
    ctx.restore();
    sparkle(ctx, 13.4, 2.6, 1.4 * (0.6 + 0.4 * Math.sin(t * 3)), WHITE, 0.85, 0);
  });
}

/* chain reaction: the whole screen breathes — expanding shock ring + additive wash (u = 0..1 progress, call before bloom) */
function drawChainFlash(ctx, W, H, u, cx, cy, col) {
  col = col || RGB.cyan;
  const k = 1 - u, R = u * Math.hypot(W, H) * 0.75;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgba(hot(col, 0.4), 0.12 * k * k); ctx.fillRect(0, 0, W, H);
  ctx.restore();
  glow(ctx, cx, cy, Math.max(30, R * 0.5), WHITE, 0.4 * k);
  drawRing(ctx, cx, cy, Math.max(4, R), col, 0.9 * k, 3 + 5 * k);
  drawRing(ctx, cx, cy, Math.max(4, R * 0.72), hot(col, 0.5), 0.5 * k, 1.6);
}
/* ABYSS GLOW — HUD, score popups, logo, menu. Everything in OUTPUT px (S = px per logical px). */

const P1_COL = RGB.magenta, P2_COL = RGB.cyan, HI_COL = RGB.amber;

/* minimal HUD: thin tracked labels + thin numerals top-left / centre / top-right; round number + EXTEND letters in the walls;
 * lives as tiny glowing pearls at the foot of each wall. st = {s1, s2, hi, round, lives1, lives2, ext1:'EX', ext2:''} */
function drawHud(ctx, S, st, t) {
  const cap = 5.2 * S, lab = 2.5 * S;
  // labels
  const L = (txt, x, col, align, y) => drawText(ctx, txt, x, y === undefined ? 2.6 * S : y, lab, { col, align, track: 0.62, lw: Math.max(1.2, lab * 0.1), halo: 0.6, hot: 0.5 });
  const N = (txt, x, col, align) => drawText(ctx, txt, x, 6.9 * S, cap, { col, align, track: 0.3, lw: Math.max(1.5, cap * 0.075), halo: 0.7, hot: 0.55, mono: true });
  const xl = 19 * S, xr = (LW - 19) * S, xc = LW / 2 * S;
  L('1UP', xl, P1_COL, 'left');
  L('HI SCORE', xc, HI_COL, 'center');
  L('2UP', xr, P2_COL, 'right');
  N(st.s1, xl, mixc(P1_COL, WHITE, 0.8), 'left');
  N(st.hi, xc, mixc(HI_COL, WHITE, 0.8), 'center');
  N(st.s2, xr, mixc(P2_COL, WHITE, 0.8), 'right');
  // tiny pip beside each label: a glowing dot (P1/P2 identity) — reads even when labels are skimmed
  dot(ctx, xl - 2.6 * S, 3.7 * S, 0.65 * S, P1_COL, 1, { halo: 3.5 });
  dot(ctx, xr + 2.6 * S, 3.7 * S, 0.65 * S, P2_COL, 1, { halo: 3.5 });

  // round number: left wall, map rows 0-1
  drawText(ctx, st.round, 8 * S, 21 * S, 5 * S, { col: RGB.cyan, align: 'center', track: 0.3, lw: 1.7, halo: 0.9, hot: 0.55, mono: true });
  drawText(ctx, 'ROUND', 8 * S, 17.4 * S, 1.9 * S, { col: mixc(RGB.cyan, RGB.void, 0.35), align: 'center', track: 0.5, lw: 1.1, halo: 0.2, hot: 0.3 });

  // EXTEND letters down the walls (rows 4..9)
  const word = 'EXTEND';
  [[8, st.ext1 || '', P1_COL], [LW - 8, st.ext2 || '', P2_COL]].forEach(([cx, got, col]) => {
    for (let i = 0; i < 6; i++) {
      const cy = (16 + 4 * 8 + 4 + i * 8) * S;
      const on = !!(got[i] && got[i] !== '.');
      const flick = 0.9 + Math.sin(t * 3 + i) * 0.1;
      if (on) {
        glow(ctx, cx * S, cy, 5.5 * S, col, 0.26 * flick);
        drawText(ctx, word[i], cx * S, cy - 2.2 * S, 4.4 * S, { col: mixc(col, WHITE, 0.2), align: 'center', lw: 1.9, halo: 1.1, hot: 0.65, track: 0 });
        neon(ctx, circlePath(cx * S, cy, 3.6 * S), col, 1.0, { a: 0.55 * flick, halo: 0.4, hot: 0.2 });
      } else {
        drawText(ctx, word[i], cx * S, cy - 2.2 * S, 4.4 * S, { col: mixc(RGB.cyan, RGB.void, 0.42), align: 'center', lw: 1.3, halo: 0.0, hot: 0.2, track: 0, a: 0.9 });
      }
    }
  });

  // lives: tiny glowing pearls at the foot of each wall
  const pearl = (x, y, col) => {
    const br = 0.92 + Math.sin(t * 2.2 + x) * 0.08;
    glow(ctx, x, y, 5 * S, col, 0.34 * br);
    neon(ctx, circlePath(x, y, 2.35 * S), col, 1.2, { a: 0.8, halo: 0.5, hot: 0.4 });
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgba(hot(col, 0.55), 0.95 * br); ctx.beginPath(); ctx.arc(x, y, 1.15 * S, 0, TAU); ctx.fill(); ctx.restore();
  };
  for (let i = 0; i < st.lives1; i++) pearl(8 * S, (LH - 17.5 - i * 7) * S, P1_COL);
  for (let i = 0; i < st.lives2; i++) pearl((LW - 8) * S, (LH - 17.5 - i * 7) * S, P2_COL);
}

function drawPopup(ctx, txt, cx, cy, cap, t, col) {
  col = col || RGB.amber;
  const tw = textWidth(txt, 0.28) * cap, pw = tw + cap * 1.1, ph = cap * 1.9;
  ctx.save(); ctx.fillStyle = 'rgba(3,5,12,0.8)';           // scrim keeps the number legible over the crystal
  const rr = ph / 2, x0 = cx - pw / 2, y0 = cy - cap * 0.45;
  ctx.beginPath(); ctx.moveTo(x0 + rr, y0); ctx.lineTo(x0 + pw - rr, y0); ctx.arc(x0 + pw - rr, y0 + rr, rr, -Math.PI / 2, Math.PI / 2); ctx.lineTo(x0 + rr, y0 + ph); ctx.arc(x0 + rr, y0 + rr, rr, Math.PI / 2, -Math.PI / 2); ctx.closePath(); ctx.fill(); ctx.strokeStyle = rgba(col, 0.28); ctx.lineWidth = 1.2; ctx.stroke(); ctx.restore();
  glow(ctx, cx, cy + cap * 0.5, cap * 3.4, col, 0.22);
  drawText(ctx, txt, cx, cy, cap, { col, align: 'center', lw: Math.max(1.6, cap * 0.09), halo: 1.2, hot: 0.8, track: 0.28 });
}

/* ------------------------------------------------------------------ logo */
/* Hollow glass-tube lettering: every stroke of the wordmark is a tube with a bright 2-contour wall, a tinted translucent core of "liquid light",
 * a specular streak and a coloured halo - the same dark-core / luminous-contour language as the creatures (not a flat neon sign).
 * Built once per size into two cached layers (dark occluder, lit layer drawn additively); only the bubble-O and the rising bubbles are live. */
function ampersandPath(x, y, cap) {
  const P = [[0.80, 1.00], [0.52, 0.66], [0.26, 0.34], [0.18, 0.14], [0.27, 0.02], [0.42, 0.0], [0.56, 0.08], [0.58, 0.22], [0.48, 0.36], [0.28, 0.52], [0.08, 0.66], [0.0, 0.80], [0.06, 0.94], [0.22, 1.0], [0.42, 0.98], [0.58, 0.86], [0.70, 0.68], [0.76, 0.52]];
  return spline(P.map((p) => [x + p[0] * cap, y + p[1] * cap]), false, 0.5);
}
const _logoCache = {};
function logoLayers(W, H, groups, T) {
  const key = W + 'x' + H + '|' + T + '|' + groups.map((g) => g.id).join();
  if (_logoCache[key]) return _logoCache[key];
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.lineCap = 'round'; g.lineJoin = 'round'; return [c, g]; };
  const [dark, dg] = mk(), [lit, lg] = mk();
  const e = Math.max(1.8, T * 0.14);                  // wall thickness
  for (const G of groups) {
    const [wall, wg] = mk(), [core, cg] = mk(), [hotc, hg] = mk();
    const grad = (g, a0, a1) => { const gr = g.createLinearGradient(G.box[0], G.box[1], G.box[2], G.box[3]); gr.addColorStop(0, rgba(G.c0, a0)); gr.addColorStop(1, rgba(G.c1, a1)); return gr; };
    // wall: the tube minus its interior = two parallel contour lines
    wg.strokeStyle = grad(wg, 1, 1); wg.lineWidth = T; wg.stroke(G.path);
    wg.globalCompositeOperation = 'destination-out'; wg.lineWidth = T - 2 * e; wg.stroke(G.path);
    // hot line on the OUTER edge of the wall (the lit side of the glass)
    hg.strokeStyle = rgba(hot(G.c0, 0.9), 1); hg.lineWidth = T - e * 0.1; hg.stroke(G.path);
    hg.globalCompositeOperation = 'destination-out'; hg.lineWidth = T - e * 1.1; hg.stroke(G.path);
    // interior: translucent coloured liquid, brighter along the centre line, with a specular streak (clipped to the interior)
    cg.strokeStyle = grad(cg, 0.38, 0.22); cg.lineWidth = T - 2 * e; cg.stroke(G.path);
    cg.globalCompositeOperation = 'source-atop';
    cg.filter = 'blur(' + (T * 0.1).toFixed(2) + 'px)'; cg.strokeStyle = rgba(hot(G.c1, 0.45), 0.75); cg.lineWidth = (T - 2 * e) * 0.4; cg.stroke(G.path); cg.filter = 'none';
    cg.save(); cg.translate(-T * 0.17, -T * 0.2); cg.strokeStyle = rgba(WHITE, 0.55); cg.lineWidth = T * 0.09; cg.stroke(G.path); cg.restore();
    // occluder: opaque near-black body so the tube reads as a solid in front of the tower rings
    dg.strokeStyle = 'rgba(3,5,12,0.9)'; dg.lineWidth = T + 1.5; dg.stroke(G.path);
    // glow of the walls: two blurred copies
    lg.save(); lg.filter = 'blur(' + (T * 0.65).toFixed(1) + 'px)'; lg.globalAlpha = 0.95; lg.drawImage(wall, 0, 0); lg.restore();
    lg.save(); lg.filter = 'blur(' + (T * 1.4).toFixed(1) + 'px)'; lg.globalAlpha = 0.55; lg.drawImage(wall, 0, 0); lg.restore();
    lg.save(); lg.filter = 'blur(' + (T * 0.22).toFixed(1) + 'px)'; lg.globalAlpha = 1; lg.drawImage(wall, 0, 0); lg.restore();
    lg.drawImage(core, 0, 0); lg.drawImage(wall, 0, 0); lg.drawImage(hotc, 0, 0);
  }
  return (_logoCache[key] = { dark, lit });
}

function drawLogo(ctx, cx, y, cap, t) {
  const track = 0.5, T = cap * 0.17;
  const wF = textWidth('FIZZ', track) * cap, wA = 0.8 * cap, gap = cap * 0.56;
  const gP = GLYPH.P[0], gO = 1.04;                              // the O of POP becomes a bubble (diameter ~ 1.04 cap)
  const wP = (gP + track + gO + track + gP) * cap;
  const total = wF + gap + wA + gap + wP;
  const x = cx - total / 2;
  const xa = x + wF + gap, xp = xa + wA + gap;
  const bx = xp + (gP + track) * cap + gO * cap / 2, by = y + cap * 0.5;
  // soft colour clouds behind the wordmark
  glow(ctx, x + wF / 2, y + cap * 0.5, cap * 2.1, P1_COL, 0.17, 0.55);
  glow(ctx, xp + wP / 2, y + cap * 0.5, cap * 2.0, P2_COL, 0.16, 0.55);
  glow(ctx, xa + wA / 2, y + cap * 0.5, cap * 0.9, RGB.violet, 0.12, 0.8);
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const pF = textPath('FIZZ', x, y, cap, track);
  const pA = ampersandPath(xa, y, cap);
  const pP = new Path2D(); pP.addPath(textPath('P', xp, y, cap, 0)); pP.addPath(textPath('P', xp + (gP + track + gO + track) * cap, y, cap, 0));
  const L = logoLayers(W, H, [
    { id: 'F', path: pF, box: [x, y, x + wF, y + cap], c0: mixc(P1_COL, WHITE, 0.12), c1: mixc(P1_COL, RGB.violet, 0.22) },
    { id: 'A', path: pA, box: [xa, y, xa + wA, y + cap], c0: mixc(P1_COL, WHITE, 0.3), c1: mixc(P2_COL, WHITE, 0.2) },
    { id: 'P', path: pP, box: [xp, y, xp + wP, y + cap], c0: mixc(P2_COL, WHITE, 0.2), c1: mixc(RGB.cobalt, P2_COL, 0.4) },
  ], T);
  ctx.drawImage(L.dark, 0, 0);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(L.lit, 0, 0); ctx.restore();
  drawBubble(ctx, 'empty', bx, by, gO * cap / 2 + cap * 0.04, { t, ph: 1.3, halo: 1.2 });
  // bubbles fizzing up out of FIZZ
  const R = rng(9);
  for (let i = 0; i < 9; i++) {
    const bx0 = x + R.float(0.05, 0.95) * wF, ph = (t * R.float(0.12, 0.24) + R.float(0, 1)) % 1;
    const rr = cap * R.float(0.035, 0.1), px = bx0 + Math.sin(ph * 9 + i) * cap * 0.05, py = y - cap * 0.1 - ph * cap * 0.85;
    const a = Math.sin(Math.PI * ph);
    drawBubble(ctx, 'empty', px, py, rr, { t, ph: i, a: 0.95 * a, wobble: 0.6, tint: mixc(P1_COL, RGB.cyan, i % 3 * 0.3) });
  }
  // underline: hairline gradient with a pearl in the middle
  const uy = y + cap * 1.3, ux0 = cx - total / 2, ux1 = cx + total / 2;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const ug = ctx.createLinearGradient(ux0, 0, ux1, 0);
  ug.addColorStop(0, rgba(P1_COL, 0)); ug.addColorStop(0.2, rgba(P1_COL, 0.8)); ug.addColorStop(0.5, rgba(WHITE, 0.95)); ug.addColorStop(0.8, rgba(P2_COL, 0.8)); ug.addColorStop(1, rgba(P2_COL, 0));
  ctx.strokeStyle = ug; ctx.lineWidth = Math.max(1.4, cap * 0.014); ctx.beginPath(); ctx.moveTo(ux0, uy); ctx.lineTo(ux1, uy); ctx.stroke();
  ctx.restore();
  dot(ctx, cx, uy, cap * 0.028, WHITE, 1, { halo: 5 });
  return { total, uy };
}

function drawMenu(ctx, items, sel, cx, y0, cap, gap, t) {
  items.forEach((it, i) => {
    const y = y0 + i * gap, on = i === sel;
    if (on) {
      const tw = textWidth(it, 0.7) * cap;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(cx - tw / 2 - cap * 2.6, 0, cx + tw / 2 + cap * 2.6, 0);
      g.addColorStop(0, rgba(RGB.cyan, 0)); g.addColorStop(0.5, rgba(RGB.cyan, 0.11)); g.addColorStop(1, rgba(RGB.cyan, 0));
      ctx.fillStyle = g; ctx.fillRect(cx - tw / 2 - cap * 2.6, y - cap * 0.7, tw + cap * 5.2, cap * 2.4);
      ctx.restore();
      // chevrons either side
      const k = 0.5 + 0.5 * Math.sin(t * 3);
      const cv = (sx) => { const p = new Path2D(); const xx = cx + sx * (tw / 2 + cap * (1.0 + 0.12 * k)); p.moveTo(xx - sx * cap * 0.34, y + cap * 0.1); p.lineTo(xx, y + cap * 0.5); p.lineTo(xx - sx * cap * 0.34, y + cap * 0.9); return p; };
      neon(ctx, cv(-1), RGB.cyan, cap * 0.075, { halo: 1.2, hot: 0.7 }); neon(ctx, cv(1), RGB.cyan, cap * 0.075, { halo: 1.2, hot: 0.7 });
      drawText(ctx, it, cx, y, cap, { col: mixc(RGB.cyan, WHITE, 0.55), align: 'center', track: 0.7, lw: cap * 0.09, halo: 1.3, hot: 0.8 });
    } else {
      drawText(ctx, it, cx, y, cap, { col: mixc(RGB.cyan, RGB.void, 0.3), align: 'center', track: 0.7, lw: cap * 0.075, halo: 0.25, hot: 0.25, a: 0.9 });
    }
  });
}
/* ABYSS GLOW — scenes. The gameplay moment is placed on the REAL round-1 map (LEVELS[0].map, tile (c,r) -> x = 8c, y = 16 + 8r).
 * Characters are drawn ~1.2x their 16 px hitbox (k = 4.8 px per logical px at 4x output): luminous overdraw, hitbox untouched.
 */
const KP = 4.8;     // enemy scale (output px per logical px) in gameplay at S = 4
const KPP = 5.9;    // players: a touch larger than the hitbox so the twins always out-shine the threats

/* position a 16x16 design box so that its bottom-centre sits on the bottom-centre of the logical box (lx, ly, 16x16) */
function feet(lx, ly, k, S) { return { x: (lx + 8) * S - 8 * k, y: (ly + 16) * S - 16 * k }; }
function mid(lx, ly, k, S) { return { x: (lx + 8) * S - 8 * k, y: (ly + 8) * S - 8 * k }; }

/* dev: window.__prof = {} makes the gameplay scene record the cost of each stage (forces a pixel read-back after each, so it is slow but honest) */
let _pt = 0;
function prof(ctx, label) {
  const P = window.__prof; if (!P) return;
  ctx.getImageData(0, 0, 1, 1);
  const n = performance.now(); if (label) P[label] = (P[label] || 0) + (n - _pt); _pt = n;
}

function sceneGameplay(ctx, t) {
  prof(ctx);
  const S = 4, W = LW * S, H = LH * S, k = KP;
  const map = LEVELS[0].map, geo = buildLevelGeo(map);

  // ---- the moment (logical px) ----
  const fizzBox = { x: 40, y: 200 };                  // tile (5,23), floor surface y = 216
  const popBox = { x: 192, y: 129 };                  // tile (24,15) mid-jump, ~6 px above the row-17 platform (top y = 152)... rising
  const crabBox = { x: 160, y: 104 };                 // tile (20,11), standing on the row-13 platform (top y = 120)
  const jelBox = { x: 72, y: 64 };                    // tile (9,6)
  const nibC = { x: 120, y: 96 };                     // trapped in a bubble around tile (14,9)
  const sushiBox = { x: 64, y: 136 };                 // on the row-17 platform (top y = 152) around tile (8,17)
  const thunderC = { x: 216, y: 176 };                // thunder bubble rising around tile (27,20)
  const cluster = [[116, 31, 0.3, 7.9, 0.8, RGB.cyan], [131, 30, 1.7, 7.1, 0.72, mixc(RGB.cyan, RGB.violet, 0.45)], [123.6, 44.2, 2.6, 8.0, 0.88, RGB.cyan], [109, 44, 4.1, 6.9, 0.7, mixc(RGB.cyan, RGB.magenta, 0.3)], [138, 41, 5.3, 7.5, 0.78, mixc(RGB.cyan, WHITE, 0.25)]];   // under the ceiling, attractor (15.5, 2)
  const shot = { x: 70, y: 205.5, r: 6.6 };           // freshly blown bubble ~14 px in front of Fizz's mouth

  const lights = [
    { x: 48, y: 214, r: 38, col: P1_COL, i: 0.35 }, { x: 70, y: 205, r: 24, col: RGB.cyan, i: 0.3 },
    { x: 200, y: 140, r: 34, col: P2_COL, i: 0.25 }, { x: 168, y: 112, r: 44, col: RGB.crimson, i: 0.55 },
    { x: thunderC.x, y: thunderC.y, r: 46, col: RGB.amber, i: 0.9 }, { x: 72, y: 150, r: 30, col: RGB.ember, i: 0.4 },
    { x: nibC.x, y: nibC.y, r: 34, col: RGB.amber, i: 0.4 }, { x: 124, y: 36, r: 32, col: RGB.cyan, i: 0.35 },
  ];

  // ---- world ----
  drawBackground(ctx, W, H, t, { seed: 7 }); prof(ctx, 'background');
  drawPlatforms(ctx, geo, S, t, THEME_CORAL, lights); prof(ctx, 'platforms');

  // soft coloured light pools cast by the living things onto the water around them
  glow(ctx, 48 * S, 208 * S, 30 * S, P1_COL, 0.17);
  glow(ctx, 200 * S, 138 * S, 28 * S, P2_COL, 0.13);
  glow(ctx, 168 * S, 112 * S, 30 * S, RGB.crimson, 0.25);
  glow(ctx, 80 * S, 72 * S, 26 * S, RGB.violet, 0.16);
  glow(ctx, 72 * S, 146 * S, 22 * S, RGB.ember, 0.18);
  glow(ctx, thunderC.x * S, thunderC.y * S, 36 * S, RGB.amber, 0.22);
  glow(ctx, nibC.x * S, nibC.y * S, 30 * S, RGB.amber, 0.16);
  glow(ctx, 124 * S, 38 * S, 34 * S, RGB.cyan, 0.12);
  // contact glows where feet meet crystal (replaces drop shadows)
  glow(ctx, 48 * S, 216 * S, 14 * S, P1_COL, 0.55, 0.22);
  glow(ctx, 168 * S, 120 * S, 15 * S, RGB.crimson, 0.6, 0.22);
  glow(ctx, 72 * S, 152 * S, 12 * S, RGB.ember, 0.28, 0.22);

  prof(ctx, 'light pools');
  // ---- food + popup ----
  let p = feet(sushiBox.x, sushiBox.y, KP, S);
  drawFood(ctx, 'sushi', { x: p.x, y: p.y, k: KP, t });
  drawPopup(ctx, '+2000', 72 * S, 125.5 * S, 4.8 * S, t, RGB.amber);

  // ---- thunder bubble (rising: tiny bubble trail beneath) ----
  for (let i = 1; i <= 4; i++) drawBubble(ctx, 'empty', (thunderC.x + Math.sin(i * 2.1 + t) * 1.6) * S, (thunderC.y + 11 + i * 6.2) * S, (1.9 - i * 0.33) * S, { t, ph: i, a: 0.5 - i * 0.08, wobble: 0.5 });
  drawRing(ctx, thunderC.x * S, thunderC.y * S, 13.2 * S, RGB.amber, 0.16, 1.0);
  drawBubble(ctx, 'thunder', thunderC.x * S, thunderC.y * S, 9.2 * S, { t, ph: 0.5 });

  // ---- bubbles ----
  cluster.forEach(([bx, by, ph, br, dm, tn], i) => drawBubble(ctx, 'empty', (bx + Math.sin(t * 0.9 + ph) * 0.7) * S, (by + Math.cos(t * 0.8 + ph) * 0.6) * S, br * S, { t, ph, dim: dm, tint: tn, halo: 0.6 }));
  drawBubble(ctx, 'trapped', nibC.x * S, nibC.y * S, 11.6 * S, { t, ph: 2, stage: 1, enemy: { type: 'nibbler', face: 1 } });

  prof(ctx, 'bubbles+food');
  // ---- enemies ----
  // Jellop: diagonal flyer, trail behind it (up-left)
  p = mid(jelBox.x, jelBox.y, KP, S);
  drawTrail(ctx, [[(jelBox.x + 8) * S, (jelBox.y + 9) * S], [(jelBox.x + 1) * S, (jelBox.y + 2) * S], [(jelBox.x - 7) * S, (jelBox.y - 5) * S]], RGB.violet, 5 * S, 0.9);
  drawEnemy(ctx, 'jellop', { x: p.x, y: p.y, k: KP, t, face: 1, tilt: 0.2 });
  // Crabbit: ANGRY, walking right on the row-13 platform
  for (let i = 1; i <= 4; i++) { const gx = (crabBox.x + 8 - i * 6) * S, ga = 0.7 - i * 0.15; dot(ctx, gx, 119.2 * S, (1.2 - i * 0.18) * S * 0.5, RGB.crimson, ga, { halo: 3 }); }
  p = feet(crabBox.x, crabBox.y, KP, S);
  drawEnemy(ctx, 'crabbit', { x: p.x, y: p.y, k: KP, t, face: 1, angry: true });

  prof(ctx, 'enemies');
  // ---- players ----
  // Pop mid-jump facing left: ghost afterimages + light trail
  p = feet(popBox.x, popBox.y, KPP, S);
  drawTrail(ctx, [[(popBox.x + 8) * S, (popBox.y + 9) * S], [(popBox.x + 12) * S, (popBox.y + 20) * S], [(popBox.x + 17) * S, (popBox.y + 31) * S]], P2_COL, 8 * S, 1);
  drawPlayer(ctx, 'pop', { x: p.x, y: p.y, k: KPP, t, face: -1, pose: 'jump' });
  // Fizz mid-shot
  p = feet(fizzBox.x, fizzBox.y, KPP, S);
  glow(ctx, 50 * S, 208 * S, 17 * S, P1_COL, 0.2);
  drawPlayer(ctx, 'fizz', { x: p.x, y: p.y, k: KPP, t, face: 1, pose: 'shoot', mouth: 1 });
  // the freshly blown bubble + breath sparks
  glow(ctx, shot.x * S, shot.y * S, 15 * S, RGB.cyan, 0.2);
  drawBubble(ctx, 'shot', shot.x * S, shot.y * S, shot.r * S, { t, ph: 0.8 });
  // breath: micro-bubbles streaming from her mouth into the shot bubble
  glow(ctx, 59.5 * S, 205 * S, 5.5 * S, WHITE, 0.1);
  [[58.4, 204.6, 0.5], [60.3, 205.6, 0.75], [61.8, 203.9, 0.42]].forEach(([bx, by, br], i) => drawBubble(ctx, 'empty', bx * S, by * S, br * S, { t, ph: i * 1.7, a: 0.95, wobble: 0.4 }));
  sparkle(ctx, 66.6 * S, 201.3 * S, 1.0 * S, WHITE, 0.0, 0);

  prof(ctx, 'players');
  // ---- foreground + HUD ----
  drawBokeh(ctx, W, H, t, { seed: 31, n: 10, a: 0.9 });
  prof(ctx, 'bokeh');
  drawHud(ctx, S, { s1: '012300', s2: '008700', hi: '050000', round: '01', lives1: 2, lives2: 1, ext1: 'EX....', ext2: '......' }, t);

  const m = /[?&]chain=([0-9.]+)/.exec(location.search);   // ?chain=0.3 previews a chain-reaction frame
  if (m) drawChainFlash(ctx, W, H, +m[1], 124 * S, 40 * S, RGB.cyan);
  prof(ctx, 'hud');
  bloom(ctx, W, H, m ? { gain: 1.25 } : undefined); prof(ctx, 'bloom');
  drawFinish(ctx, W, H, 0.66, 0.01); prof(ctx, 'finish');
}

/* ================================================================== TITLE */
/* the Sunken Tower seen from above: an octagonal stair-well of luminous rings spiralling down toward the Moon Pearl */
function drawShaft(ctx, W, H, t, vx, vy) {
  const N = 20;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round';
  let prev = null;
  for (let i = 1; i <= N; i++) {
    const u = i / N, sc = Math.pow(u, 2.3);
    const rx = lerp(7, W * 1.02, sc), ry = lerp(7, H * 0.95, sc);
    const rot = i * 0.05 + t * 0.018;
    const pts = [];
    for (let k = 0; k < 8; k++) { const a = rot + k * TAU / 8 + TAU / 16; pts.push([vx + Math.cos(a) * rx, vy + Math.sin(a) * ry]); }
    const a = 0.035 + 0.13 * Math.sin(Math.PI * Math.pow(u, 0.72));
    ctx.strokeStyle = rgba(mixc(RGB.cobalt, RGB.cyan, 0.4 + 0.3 * Math.sin(i)), a);
    ctx.lineWidth = 1 + sc * 1.6;
    ctx.beginPath(); pts.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.stroke();
    if (prev) {   // struts between consecutive rings: the tower's pillars
      ctx.strokeStyle = rgba(RGB.violet, a * 0.35); ctx.lineWidth = 0.9;
      ctx.beginPath(); for (let k = 0; k < 8; k++) { ctx.moveTo(prev[k][0], prev[k][1]); ctx.lineTo(pts[k][0], pts[k][1]); } ctx.stroke();
    }
    // lit windows on the vertices
    if (i > 3) for (let k = 0; k < 8; k++) {
      const wcol = (i + k) % 3 === 0 ? RGB.amber : (i + k) % 3 === 1 ? RGB.cyan : RGB.magenta;
      const wa = a * 1.6 * (0.5 + 0.5 * Math.sin(t * 1.2 + i * 1.7 + k));
      ctx.fillStyle = rgba(wcol, wa); ctx.beginPath(); ctx.arc(pts[k][0], pts[k][1], 0.8 + sc * 2.0, 0, TAU); ctx.fill();
    }
    prev = pts;
  }
  ctx.restore();
  // the Moon Pearl at the bottom of the tower
  const pul = 0.9 + Math.sin(t * 1.6) * 0.1;
  glow(ctx, vx, vy, 230 * pul, RGB.cyan, 0.2);
  glow(ctx, vx, vy, 110 * pul, WHITE, 0.32);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const pg = ctx.createRadialGradient(vx - 4, vy - 5, 1, vx, vy, 17);
  pg.addColorStop(0, rgba(WHITE, 1)); pg.addColorStop(0.5, rgba(hot(RGB.cyan, 0.6), 0.95)); pg.addColorStop(1, rgba(RGB.cyan, 0.5));
  ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(vx, vy, 17, 0, TAU); ctx.fill(); ctx.restore();
  neon(ctx, circlePath(vx, vy, 22), WHITE, 1.2, { a: 0.5, halo: 0.8 });
  // god-rays radiating from the pearl
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 14; i++) { const a = i * TAU / 14 + t * 0.03, L = 260 + (i % 3) * 90; const g = ctx.createLinearGradient(vx, vy, vx + Math.cos(a) * L, vy + Math.sin(a) * L); g.addColorStop(0, rgba(RGB.cyan, 0.16)); g.addColorStop(1, rgba(RGB.cyan, 0)); ctx.strokeStyle = g; ctx.lineWidth = 2 + (i % 2) * 3; ctx.beginPath(); ctx.moveTo(vx, vy); ctx.lineTo(vx + Math.cos(a) * L, vy + Math.sin(a) * L); ctx.stroke(); }
  ctx.restore();
}

function sceneTitle(ctx, t) {
  const S = 4, W = 1024, H = 896;
  drawBackground(ctx, W, H, t, { seed: 21, plankton: 170, jellies: [
    { x: 0.13, y: 0.5, sz: 0.15, col: mixc(RGB.violet, RGB.cobalt, 0.5), a: 0.55, ph: 0.3, rot: -0.1 },
    { x: 0.88, y: 0.47, sz: 0.125, col: mixc(RGB.cyan, RGB.cobalt, 0.4), a: 0.5, ph: 2.4, rot: 0.12 },
    { x: 0.5, y: 0.94, sz: 0.1, col: mixc(RGB.violet, RGB.magenta, 0.5), a: 0.4, ph: 4.0, rot: 0.05 },
  ] });
  drawShaft(ctx, W, H, t, 512, 372);
  // ledges: left & right crystal shelves the twins stand on (same crystal renderer as the game)
  const row = (a, b) => '#'.repeat(a) + '.'.repeat(32 - a - b) + '#'.repeat(b);
  const lmap = [];
  for (let r = 0; r < 26; r++) lmap.push(r >= 21 ? row(12 - (r - 21) * 0, 12 - (r - 21) * 0) : '.'.repeat(32));
  const geo = buildLevelGeo(lmap);
  const lights = [{ x: 50, y: 188, r: 56, col: P1_COL, i: 0.85 }, { x: 206, y: 188, r: 56, col: P2_COL, i: 0.8 }];
  drawPlatforms(ctx, geo, S, t, THEME_TITLE, lights);

  // darken behind text for legibility
  ctx.save(); const sg = ctx.createRadialGradient(512, 420, 40, 512, 420, 470); sg.addColorStop(0, 'rgba(3,5,12,0.62)'); sg.addColorStop(1, 'rgba(3,5,12,0)'); ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H); ctx.restore();

  // twins
  const k = 14.4;
  glow(ctx, 200, 690, 190, P1_COL, 0.15); glow(ctx, 824, 690, 190, P2_COL, 0.13);
  drawPlayer(ctx, 'fizz', { x: 200 - 8 * k, y: 736 - 16 * k, k, t, face: 1, pose: 'shoot', mouth: 1 });
  drawPlayer(ctx, 'pop', { x: 824 - 8 * k, y: 736 - 16 * k, k, t: t + 0.8, face: -1, pose: 'idle' });
  glow(ctx, 200, 738, 120, P1_COL, 0.55, 0.18); glow(ctx, 824, 738, 120, P2_COL, 0.55, 0.18);
  // bubbles drifting off toward the centre
  drawBubble(ctx, 'empty', 126 + Math.sin(t) * 3, 452 - Math.sin(t * 0.8) * 4, 26, { t, ph: 0.4 });
  drawBubble(ctx, 'empty', 246, 404, 13, { t, ph: 1.4 });
  drawBubble(ctx, 'empty', 178, 372, 8, { t, ph: 3.4 });
  drawBubble(ctx, 'empty', 892, 440, 22, { t, ph: 2.2 });
  drawBubble(ctx, 'empty', 790, 402, 11, { t, ph: 3.2 });
  drawBubble(ctx, 'empty', 850, 356, 7, { t, ph: 5 });

  // logo + tagline
  const lg = drawLogo(ctx, 512, 122, 98, t);
  const tag = 'THE SUNKEN TOWER', tc = 17, tw = textWidth(tag, 1.1) * tc;
  drawText(ctx, tag, 512, lg.uy + 34, tc, { col: mixc(RGB.cyan, WHITE, 0.45), align: 'center', track: 1.1, lw: 1.6, halo: 0.9, hot: 0.6 });
  [[-1], [1]].forEach(([s]) => { const x0 = 512 + s * (tw / 2 + 24), x1 = 512 + s * (tw / 2 + 120); ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, rgba(RGB.cyan, 0.6)); g.addColorStop(1, rgba(RGB.cyan, 0)); ctx.strokeStyle = g; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x0, lg.uy + 34 + tc / 2); ctx.lineTo(x1, lg.uy + 34 + tc / 2); ctx.stroke(); ctx.restore(); });

  // menu
  drawMenu(ctx, ['1 PLAYER', '2 PLAYERS', 'HOW TO PLAY', 'HI-SCORES', 'SOUND ON'], 0, 512, 476, 25, 56, t);
  // hi score
  drawText(ctx, 'HI SCORE', 512 - 6, 808, 12, { col: RGB.amber, align: 'right', track: 0.7, lw: 1.3, halo: 0.6, hot: 0.5 });
  drawText(ctx, '050000', 512 + 14, 806, 16, { col: mixc(RGB.amber, WHITE, 0.8), align: 'left', track: 0.3, lw: 1.6, halo: 0.7, hot: 0.55, mono: true });

  drawBokeh(ctx, W, H, t, { seed: 41, n: 12, a: 0.8 });
  bloom(ctx, W, H);
  drawFinish(ctx, W, H, 0.66, 0.01);
}

/* ================================================================== CAST */
function drawPedestal(ctx, x, y, rx, col, t) {
  const ry = rx * 0.2;
  glow(ctx, x, y, rx * 1.5, col, 0.16, 0.25);
  neon(ctx, ellipsePath(x, y, rx, ry), col, 1.4, { a: 0.75, halo: 0.8, hot: 0.4 });
  neon(ctx, ellipsePath(x, y, rx * 0.64, ry * 0.64), col, 1.0, { a: 0.42, halo: 0.3, hot: 0.2 });
}
function sceneCast(ctx, t) {
  const W = 1600, H = 600;
  drawBackground(ctx, W, H, t, { seed: 5, plankton: 130, jellies: [
    { x: 0.06, y: 0.5, sz: 0.1, col: RGB.violet, a: 0.9, ph: 0.3, rot: -0.1 },
    { x: 0.95, y: 0.28, sz: 0.09, col: RGB.cyan, a: 0.8, ph: 2.1, rot: 0.1 },
  ], shafts: false });
  // header: wordmark | variant | sheet name, equal gaps
  const hc = 15, hopt = { track: 0.9, lw: 1.3, halo: 0.5, hot: 0.5 };
  let hx = 40;
  hx += drawText(ctx, 'FIZZ & POP', hx, 26, hc, Object.assign({ col: mixc(RGB.cyan, WHITE, 0.55) }, hopt)) + 24;
  neon(ctx, poly([[hx, 22], [hx, 44]]), RGB.cyan, 1.1, { a: 0.45, halo: 0.3, hot: 0.2 }); hx += 24;
  hx += drawText(ctx, 'ABYSS GLOW', hx, 26, hc, Object.assign({ col: mixc(RGB.cyan, RGB.void, 0.3) }, hopt)) + 24;
  neon(ctx, poly([[hx, 22], [hx, 44]]), RGB.cyan, 1.1, { a: 0.45, halo: 0.3, hot: 0.2 }); hx += 24;
  drawText(ctx, 'CAST SHEET', hx, 26, hc, Object.assign({ col: mixc(RGB.cyan, RGB.void, 0.55) }, hopt, { halo: 0.1 }));

  const base = 292, k = 8.8;
  const slots = [
    ['fizz', 'FIZZ', 'P1 AXOLOTL', P1_COL, 112], ['pop', 'POP', 'P2 AXOLOTL', P2_COL, 288],
    ['nibbler', 'NIBBLER', 'CLOCKWORK WALKER', RGB.amber, 452], ['crabbit', 'CRABBIT', 'PEBBLE THROWER', RGB.ember, 611],
    ['jellop', 'JELLOP', 'DIAGONAL DRIFTER', RGB.violet, 765], ['springle', 'SPRINGLE', 'CONSTANT BOUNCER', RGB.lime, 917],
    ['glimmer', 'GLIMMER', 'LANTERN HOVERER', RGB.cobalt, 1070], ['bonefin', 'BONEFIN', 'HURRY-UP GHOST', ENEMY_HUE.bonefin, 1236],
  ];
  slots.forEach(([id, name, sub, col, cx], i) => {
    drawPedestal(ctx, cx, base + 6, 58, col, t);
    const o = { k, t: t + i * 0.37, face: 1 };
    if (id === 'fizz') drawPlayer(ctx, 'fizz', Object.assign({}, o, { x: cx - 8 * k, y: base - 16 * k, pose: 'idle' }));
    else if (id === 'pop') drawPlayer(ctx, 'pop', Object.assign({}, o, { x: cx - 8 * k, y: base - 16 * k, pose: 'idle' }));
    else {
      const flying = id === 'jellop' || id === 'glimmer' || id === 'bonefin';
      drawEnemy(ctx, id, Object.assign({}, o, { x: cx - 8 * k, y: base - 16 * k - (flying ? 12 : 0), state: 'move' }));
    }
    drawText(ctx, name, cx, base + 34, 15, { col: mixc(col, WHITE, 0.35), align: 'center', track: 0.6, lw: 1.5, halo: 0.7, hot: 0.55 });
    drawText(ctx, sub, cx, base + 58, 8.4, { col: mixc(col, RGB.void, 0.3), align: 'center', track: 0.34, lw: 1.0, halo: 0, hot: 0.25 });
  });
  // Kraken King
  const kk = 5.3, kx = 1466;
  drawPedestal(ctx, kx, base + 6, 118, RGB.purple, t);
  drawEnemy(ctx, 'kraken', { x: kx - 24 * kk, y: base - 48 * kk + 4, k: kk, t, face: 1 });
  drawText(ctx, 'KRAKEN KING', kx, base + 34, 15, { col: mixc(RGB.purple, WHITE, 0.4), align: 'center', track: 0.6, lw: 1.5, halo: 0.7, hot: 0.55 });
  drawText(ctx, 'FINAL BOSS', kx, base + 58, 8.4, { col: mixc(RGB.purple, RGB.void, 0.25), align: 'center', track: 0.34, lw: 1.0, halo: 0, hot: 0.25 });

  // divider
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const dg = ctx.createLinearGradient(40, 0, W - 40, 0); dg.addColorStop(0, rgba(RGB.cyan, 0)); dg.addColorStop(0.08, rgba(RGB.cyan, 0.3)); dg.addColorStop(0.92, rgba(RGB.cyan, 0.3)); dg.addColorStop(1, rgba(RGB.cyan, 0));
  ctx.strokeStyle = dg; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(40, 382); ctx.lineTo(W - 40, 382); ctx.stroke(); ctx.restore();

  // bubble states
  const by = 462, br = 44;
  const bs = [
    ['empty', 'EMPTY', null, 110], ['trapped', 'TRAPPED', { stage: 0, enemy: { type: 'nibbler' } }, 262], ['trapped', 'WARNING', { stage: 1, enemy: { type: 'crabbit' } }, 414],
    ['trapped', 'BREAKING', { stage: 2, enemy: { type: 'jellop' } }, 566], ['thunder', 'THUNDER', null, 718], ['fire', 'FIRE', null, 870], ['water', 'WATER', null, 1022],
  ];
  bs.forEach(([kind, label, extra, cx], i) => {
    drawBubble(ctx, kind, cx, by, br, Object.assign({ t: t + i * 0.5, ph: i }, extra || {}));
    drawText(ctx, label, cx, by + br + 24, 11, { col: mixc(RGB.cyan, WHITE, 0.3), align: 'center', track: 0.6, lw: 1.2, halo: 0.4, hot: 0.4 });
  });
  // pickups
  drawText(ctx, 'FOOD', 1128, by + br + 24, 11, { col: mixc(RGB.cyan, WHITE, 0.3), align: 'center', track: 0.6, lw: 1.2, halo: 0.4, hot: 0.4 });
  drawText(ctx, 'POWER-UP', 1254, by + br + 24, 11, { col: mixc(RGB.cyan, WHITE, 0.3), align: 'center', track: 0.6, lw: 1.2, halo: 0.4, hot: 0.4 });
  drawFood(ctx, 'sushi', { x: 1128 - 8 * 6.9, y: by + 42 - 16 * 6.9, k: 6.9, t });
  drawPowerup(ctx, 'heart', { x: 1254 - 8 * 6.9, y: by + 42 - 16 * 6.9, k: 6.9, t });
  // angry state
  drawEnemy(ctx, 'crabbit', { x: 1398 - 8 * 6.6, y: by + 42 - 16 * 6.6, k: 6.6, t, face: 1, angry: true });
  drawEnemy(ctx, 'nibbler', { x: 1522 - 8 * 6.6, y: by + 42 - 16 * 6.6, k: 6.6, t, face: -1, angry: true });
  drawText(ctx, 'ANGRY STATE', 1460, by + br + 24, 11, { col: mixc(RGB.crimson, WHITE, 0.3), align: 'center', track: 0.6, lw: 1.2, halo: 0.4, hot: 0.4 });

  // palette strip
  const pals = ['void', 'abyss', 'cyan', 'magenta', 'lime', 'amber', 'violet', 'white', 'ember', 'cobalt'];
  pals.forEach((n, i) => { const x = 54 + i * 26, y = 570; ctx.save(); ctx.fillStyle = PAL[n]; ctx.globalCompositeOperation = 'lighter'; if (n === 'void' || n === 'abyss') { ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = rgba(RGB.cyan, 0.4); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.fill(); ctx.stroke(); } else { glow(ctx, x, y, 14, RGB[n], 0.3); ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.fill(); } ctx.restore(); });

  bloom(ctx, W, H);
  drawFinish(ctx, W, H, 0.45, 0.01);
}
/* DEV scene: close-up of whatever is being designed right now (hash #dev). */
function sceneDev(ctx, t) {
  const W = 1600, H = 900;
  drawBackground(ctx, W, H, t, { seed: 3 });
  drawPlayer(ctx, 'fizz', { x: 20, y: 30, k: 14, t, pose: 'idle' });
  drawPlayer(ctx, 'fizz', { x: 270, y: 30, k: 14, t, pose: 'shoot', mouth: 1 });
  drawPlayer(ctx, 'pop', { x: 520, y: 30, k: 14, t, pose: 'jump', face: -1 });
  drawPlayer(ctx, 'pop', { x: 770, y: 30, k: 14, t, pose: 'idle' });
  // 1x-ish sizes (gameplay uses k 5.9)
  drawPlayer(ctx, 'fizz', { x: 1050, y: 60, k: 5.9, t, pose: 'shoot', mouth: 1 });
  drawPlayer(ctx, 'pop', { x: 1150, y: 60, k: 5.9, t, pose: 'jump', face: -1 });
  drawPlayer(ctx, 'fizz', { x: 1250, y: 60, k: 5.9, t, pose: 'idle' });
  drawPlayer(ctx, 'pop', { x: 1350, y: 60, k: 5.9, t, pose: 'idle' });
  drawPlayer(ctx, 'fizz', { x: 1050, y: 160, k: 11, t, pose: 'idle' });
  drawPlayer(ctx, 'pop', { x: 1250, y: 160, k: 11, t, pose: 'idle' });
  drawEnemy(ctx, 'kraken', { x: 20, y: 330, k: 8, t, face: 1 });
  drawEnemy(ctx, 'nibbler', { x: 640, y: 380, k: 10, t, face: 1 });
  drawEnemy(ctx, 'crabbit', { x: 820, y: 380, k: 10, t, face: 1 });
  drawEnemy(ctx, 'jellop', { x: 1000, y: 380, k: 10, t, face: 1 });
  drawBubble(ctx, 'empty', 1250, 450, 80, { t });
  drawBubble(ctx, 'shot', 1430, 450, 60, { t });
  drawBubble(ctx, 'trapped', 1300, 700, 90, { t, stage: 1, enemy: { type: 'springle' } });
  drawBubble(ctx, 'thunder', 1100, 700, 70, { t });
  drawFood(ctx, 'sushi', { x: 700, y: 640, k: 10, t });
  drawPowerup(ctx, 'heart', { x: 900, y: 640, k: 10, t });
  bloom(ctx, W, H);
}
/* ABYSS GLOW — page glue: hash-selected scene, animated loop, ?still freeze, window.__ready for the renderer. */
(function boot() {
  const cv = document.getElementById('c');
  const ctx = cv.getContext('2d');
  const SCENES = {
    gameplay: { w: 1024, h: 896, still: 3.35, draw: (c, t) => sceneGameplay(c, t) },
    title: { w: 1024, h: 896, still: 2.4, draw: (c, t) => sceneTitle(c, t) },
    cast: { w: 1600, h: 600, still: 1.6, draw: (c, t) => sceneCast(c, t) },
    dev: { w: 1600, h: 900, still: 1.6, draw: (c, t) => (typeof sceneDev === 'function' ? sceneDev(c, t) : 0) },
  };
  const still = /[?&]still\b/.test(location.search);
  const tOverride = /[?&]t=([0-9.]+)/.exec(location.search);       // dev: ?still&t=7.5 renders that moment
  let name = 'gameplay', raf = 0, t0 = performance.now();

  function select() {
    const h = (location.hash || '#gameplay').slice(1);
    name = SCENES[h] ? h : 'gameplay';
    const s = SCENES[name];
    if (cv.width !== s.w || cv.height !== s.h) { cv.width = s.w; cv.height = s.h; }
    document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + name));
    cancelAnimationFrame(raf);
    window.__ready = false;
    if (still) { paint(tOverride ? +tOverride[1] : s.still); window.__ready = true; }
    else { t0 = performance.now(); loop(); }
  }
  function paint(t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.filter = 'none';
    SCENES[name].draw(ctx, t);
  }
  function loop() {
    paint(SCENES[name].still + (performance.now() - t0) / 1000);
    window.__ready = true;
    raf = requestAnimationFrame(loop);
  }
  // dev: average CPU+raster cost of one frame (forces a pixel read-back so deferred canvas work is included)
  window.__measure = (n) => {
    n = n || 15; const s = SCENES[name];
    const a = performance.now();
    for (let i = 0; i < n; i++) paint(s.still + i * 0.016);
    ctx.getImageData(0, 0, 1, 1);                       // one read-back at the end flushes the deferred canvas work
    return { scene: name, avgMs: +((performance.now() - a) / n).toFixed(1) };
  };
  // the reusable per-entity API (what would become the game's GFX module) — also handy from the devtools console
  window.AbyssGlow = { bgGradient, drawFarJellies, drawFog, drawPlankton, drawBokeh, drawBackground, drawPlatforms, buildLevelGeo, drawPlayer, drawEnemy, drawBubble, drawFood, drawPowerup, drawHud, drawPopup, drawLogo, drawMenu, drawText, drawTrail, drawPop, drawChainFlash, bloom, drawVignette, drawGrain, glow, neon, PAL, RGB, THEME_CORAL, LEVELS_MAP: () => LEVELS[0].map };
  window.addEventListener('hashchange', select);
  select();
})();
})();
