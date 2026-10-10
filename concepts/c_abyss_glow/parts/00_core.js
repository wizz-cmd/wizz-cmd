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
