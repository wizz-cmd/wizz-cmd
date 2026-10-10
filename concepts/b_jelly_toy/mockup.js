/* FIZZ & POP — concept B "JELLY TOY" — mockup.js
 * Soft-3D glossy vinyl-toy look, 100 % procedural Canvas 2D (no images, no fonts, no network).
 *
 * Sections (concatenated from parts/*.js by build.sh):
 *   01 core        palette, colour helpers, rng, canvas helpers
 *   02 font        stroke-skeleton rounded display font + puffy "balloon" lettering
 *   03 materials   shadeBlob / tube / gloss / soft shadow / glow primitives
 *   04 players     drawPlayer(who, state)            Fizz & Pop
 *   05 enemies     drawEnemy(type, state), drawKraken
 *   06 bubbles     drawBubble(kind), drawFood, drawPowerup, popups, sparkles
 *   07 world       platform outline tracer + cached level layer, drawBackground
 *   08 hud         drawHud, extend beads, life chips
 *   09 scenes      gameplay / title / cast + hash router + animation loop
 *
 * Every entity is drawn in LOGICAL pixels (the real game is 256x224, entity box 16x16): callers set a
 * base transform (scale S) and every drawX() works in that space, so the same code renders at 1x, 4x
 * or 10x (cast sheet) with identical proportions. Nothing here depends on the DOM except the canvas.
 */
'use strict';

const JT = { S: 4, time: 0, F: 1 };   // F = current mirror sign of the entity transform (keeps the key light top-left)

JT.PAL = {
  aqua: '#3ed3d8', deep: '#1d3b6e', coral: '#ff7a8a', lemon: '#ffd45c',
  lilac: '#a98bff', mint: '#7fe3b0', cream: '#fff4e6', ink: '#24324f',
};

/* ---------- colour helpers ---------- */
const _hexCache = {};
function hexToRgb(h) {
  if (_hexCache[h]) return _hexCache[h];
  let s = h.replace('#', '');
  if (s.length === 3) s = s.split('').map((x) => x + x).join('');
  const n = parseInt(s, 16);
  return (_hexCache[h] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]);
}
function rgbHex(a) {
  return '#' + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}
function alpha(c, a) {
  const [r, g, b] = hexToRgb(c);
  return `rgba(${r},${g},${b},${a})`;
}
const _rampCache = {};
/** One material colour -> 6-step ramp, hue-shifted: warm light, cool (violet) shadow, aqua rim. */
function ramp(base) {
  if (_rampCache[base]) return _rampCache[base];
  return (_rampCache[base] = {
    base,
    hi: mix(base, '#fffdf2', 0.78),
    light: mix(base, '#fff1d4', 0.42),
    dark: mix(base, '#5a2f9a', 0.32),
    deep: mix(base, '#231a5e', 0.58),
    rim: mix(base, '#4fe9ff', 0.6),
  });
}

/* ---------- small utils ---------- */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const rad = (d) => (d * Math.PI) / 180;

/** Rounded-rect path (adds to ctx current path or to a Path2D). */
function rrectPath(p, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  p.moveTo(x + r, y);
  p.arcTo(x + w, y, x + w, y + h, r);
  p.arcTo(x + w, y + h, x, y + h, r);
  p.arcTo(x, y + h, x, y, r);
  p.arcTo(x, y, x + w, y, r);
  p.closePath();
  return p;
}
function ellipsePath(cx, cy, rx, ry, rot = 0) {
  const p = new Path2D();
  p.ellipse(cx, cy, Math.abs(rx), Math.abs(ry), rot, 0, TAU);
  return p;
}
/** A shape = {p: Path2D, x, y, w, h} (bbox in the current drawing space, used by shaders). */
function shape(d, x, y, w, h) {
  return { p: typeof d === 'string' ? new Path2D(d) : d, x, y, w, h };
}
function ellShape(cx, cy, rx, ry, rot = 0) {
  return shape(ellipsePath(cx, cy, rx, ry, rot), cx - rx, cy - ry, rx * 2, ry * 2);
}
function rrShape(x, y, w, h, r) {
  return shape(rrectPath(new Path2D(), x, y, w, h, r), x, y, w, h);
}

/** Make a canvas (offscreen). */
function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}
/* ===================================================================================================
 * 02 FONT — a rounded monoline skeleton font. Every glyph is an SVG-path skeleton in a box 100 high
 * (y 0 = cap top, 100 = baseline) and `w` wide. It is rendered as a thick round-capped stroke, so the
 * same table gives (a) heavy "puffy balloon" logo letters (layered tube strokes), (b) chunky UI text,
 * (c) thin geometric text. No font files, no fillText: fully procedural, resolution independent.
 * ================================================================================================= */
const GLYPHS = {
  A: [64, 'M2 100 L2 42 C2 10 16 0 32 0 C48 0 62 10 62 42 L62 100 M2 64 L62 64'],
  B: [58, 'M0 0 L0 100 M0 0 L30 0 C50 0 54 14 54 25 C54 40 46 50 28 50 L0 50 M28 50 C50 50 58 62 58 76 C58 92 48 100 30 100 L0 100'],
  C: [62, 'M60 24 C54 8 44 0 31 0 C10 0 0 20 0 50 C0 80 10 100 31 100 C44 100 54 92 60 76'],
  D: [60, 'M0 0 L0 100 L24 100 C50 100 58 78 58 50 C58 22 50 0 24 0 Z'],
  E: [50, 'M50 0 L0 0 L0 100 L50 100 M0 50 L38 50'],
  F: [48, 'M48 0 L0 0 L0 100 M0 50 L36 50'],
  G: [64, 'M60 24 C54 8 44 0 31 0 C10 0 0 20 0 50 C0 80 10 100 31 100 C52 100 60 84 60 62 L34 62'],
  H: [60, 'M0 0 L0 100 M60 0 L60 100 M0 50 L60 50'],
  I: [0, 'M0 0 L0 100'],
  J: [40, 'M40 0 L40 66 C40 90 30 100 20 100 C8 100 0 92 0 76'],
  K: [58, 'M0 0 L0 100 M54 0 L2 56 M20 38 L56 100'],
  L: [46, 'M0 0 L0 100 L46 100'],
  M: [86, 'M0 100 L0 0 L43 64 L86 0 L86 100'],
  N: [62, 'M0 100 L0 0 L62 100 L62 0'],
  O: [66, 'M33 0 C58 0 66 22 66 50 C66 78 58 100 33 100 C8 100 0 78 0 50 C0 22 8 0 33 0 Z'],
  P: [56, 'M0 100 L0 0 L28 0 C48 0 56 12 56 27 C56 42 48 54 28 54 L0 54'],
  Q: [66, 'M33 0 C58 0 66 22 66 50 C66 78 58 100 33 100 C8 100 0 78 0 50 C0 22 8 0 33 0 Z M42 72 L64 104'],
  R: [58, 'M0 100 L0 0 L28 0 C48 0 56 12 56 27 C56 42 48 54 28 54 L0 54 M28 54 L58 100'],
  S: [54, 'M52 20 C46 6 38 0 26 0 C10 0 2 10 2 24 C2 40 14 46 27 50 C42 54 52 60 52 76 C52 92 42 100 27 100 C13 100 4 92 0 78'],
  T: [62, 'M0 0 L62 0 M31 0 L31 100'],
  U: [60, 'M0 0 L0 64 C0 88 12 100 30 100 C48 100 60 88 60 64 L60 0'],
  V: [64, 'M0 0 L32 100 L64 0'],
  W: [94, 'M0 0 L23 100 L47 28 L71 100 L94 0'],
  X: [60, 'M0 0 L60 100 M60 0 L0 100'],
  Y: [60, 'M0 0 L30 54 L60 0 M30 54 L30 100'],
  Z: [56, 'M2 0 L54 0 L2 100 L54 100'],
  0: [56, 'M28 0 C48 0 56 22 56 50 C56 78 48 100 28 100 C8 100 0 78 0 50 C0 22 8 0 28 0 Z'],
  1: [28, 'M0 26 L26 0 L26 100'],
  2: [56, 'M2 26 C6 8 14 0 28 0 C46 0 54 12 54 28 C54 46 40 62 24 78 L0 100 L56 100'],
  3: [54, 'M2 16 C8 4 16 0 27 0 C42 0 50 10 50 24 C50 40 40 48 22 48 C42 48 52 58 52 74 C52 90 42 100 27 100 C14 100 4 94 0 82'],
  4: [58, 'M42 100 L42 0 L0 68 L58 68'],
  5: [54, 'M50 0 L8 0 L4 46 C12 40 20 38 28 38 C44 38 52 52 52 68 C52 88 42 100 27 100 C14 100 4 94 0 82'],
  6: [56, 'M48 12 C40 2 34 0 26 0 C8 0 2 24 2 54 C2 86 10 100 28 100 C46 100 54 86 54 68 C54 50 46 38 28 38 C14 38 6 46 2 58'],
  7: [54, 'M0 0 L54 0 L18 100'],
  8: [56, 'M28 50 C8 46 4 36 4 25 C4 10 14 0 28 0 C42 0 52 10 52 25 C52 36 48 46 28 50 C8 54 0 64 0 76 C0 92 12 100 28 100 C44 100 56 92 56 76 C56 64 48 54 28 50 Z'],
  9: [56, 'M8 88 C16 98 22 100 30 100 C48 100 54 76 54 46 C54 14 46 0 28 0 C10 0 2 14 2 32 C2 50 10 62 28 62 C42 62 50 54 54 42'],
  '+': [52, 'M26 28 L26 72 M4 50 L48 50'],
  '-': [36, 'M0 56 L36 56'],
  '=': [40, 'M0 38 L40 38 M0 68 L40 68'],
  '*': [40, 'M20 20 L20 80 M0 32 L40 68 M40 32 L0 68'],
  '.': [0, 'M0 100 L0 100'],
  ':': [0, 'M0 30 L0 30 M0 100 L0 100'],
  '!': [0, 'M0 0 L0 62 M0 100 L0 100'],
  '?': [50, 'M2 22 C4 8 14 0 26 0 C40 0 48 10 48 24 C48 44 24 46 24 66 M24 100 L24 100'],
  "'": [0, 'M0 0 L0 24'],
  '/': [40, 'M0 100 L40 0'],
  '&': [90, 'M86 100 L30 40 C10 20 17 4 42 2 C64 0 72 16 63 29 C55 42 9 54 7 78 C5 94 22 100 40 100 C62 100 76 84 84 62'],
  '%': [72, 'M60 0 L12 100 M16 6 C4 6 4 28 16 28 C28 28 28 6 16 6 Z M56 72 C44 72 44 94 56 94 C68 94 68 72 56 72 Z'],
  ' ': [34, ''],
};
const _glyphPaths = {};
function glyphPath(ch) {
  const g = GLYPHS[ch] || GLYPHS['?'];
  if (!_glyphPaths[ch]) _glyphPaths[ch] = g[1] ? new Path2D(g[1]) : null;
  return _glyphPaths[ch];
}

/** Measure text: returns advance width in px for cap height h and stroke ratio `weight` (stroke / h). */
function textWidth(str, h, o = {}) {
  const sw = h * (o.weight ?? 0.22);
  const k = (h - sw) / 100;
  const track = (o.track ?? 0.06) * h;
  let w = 0;
  const s = String(str).toUpperCase();
  for (let i = 0; i < s.length; i++) {
    const g = GLYPHS[s[i]] || GLYPHS['?'];
    w += (s[i] === ' ' ? g[0] * k : g[0] * k + sw) + track;
  }
  return Math.max(0, w - track);
}

/**
 * drawText(ctx, str, x, y, h, o)  — y = baseline, h = cap height (ink, incl. stroke).
 * o: align 'left'|'center'|'right', weight (stroke/h, default .22), track, color (flat fill),
 *    style 'flat' | 'tube'  (tube = layered balloon shading), colors [hex..] (per glyph for tube),
 *    outline {c, w} outer outline (px), shadow {c, dx, dy, a}, alpha, shine (bool for flat)
 */
function drawText(ctx, str, x, y, h, o = {}) {
  if (o.style === 'tube' && !o.legacy) return drawInflated(ctx, str, x, y, h, o);
  const s = String(str).toUpperCase();
  const weight = o.weight ?? 0.22;
  const sw = h * weight;
  const k = (h - sw) / 100;
  const track = (o.track ?? 0.06) * h;
  const total = textWidth(s, h, o);
  let px = x;
  if (o.align === 'center') px = x - total / 2;
  else if (o.align === 'right') px = x - total;
  // layout
  const items = [];
  let cx = px;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const g = GLYPHS[ch] || GLYPHS['?'];
    const p = glyphPath(ch);
    items.push({ p, x: cx + sw / 2, i, w: g[0] * k });
    cx += (ch === ' ' ? g[0] * k : g[0] * k + sw) + track;
  }
  const top = y - h + sw / 2;
  ctx.save();
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const layer = (width, color, dx, dy, dyScale = 1) => {
    ctx.lineWidth = width / k;
    for (const it of items) {
      if (!it.p) continue;
      ctx.strokeStyle = typeof color === 'function' ? color(it) : color;
      ctx.save();
      const jg = o.jiggle ? o.jiggle(it.i) : null;
      if (jg) { ctx.translate(it.x + it.w / 2, top + (h - sw) / 2); ctx.rotate(jg[2] || 0); ctx.translate(jg[0] - it.w / 2 + dx, jg[1] - (h - sw) / 2 + dy); }
      else ctx.translate(it.x + dx, top + dy);
      ctx.scale(k, k * dyScale);
      ctx.stroke(it.p);
      ctx.restore();
    }
  };
  if (o.shadow) {
    const sh = o.shadow;
    layer(sw + (o.outline ? o.outline.w * 2 : 0), sh.c ?? 'rgba(20,40,100,.35)', sh.dx ?? 0, sh.dy ?? sw * 0.25);
  }
  if (o.outline) layer(sw + o.outline.w * 2, o.outline.c, 0, 0);
  if (o.style === 'tube') {
    const pick = (it) => ramp((o.colors || [o.color || JT.PAL.coral])[it.i % (o.colors || [0]).length]);
    layer(sw, (it) => pick(it).rim, 0, 0);
    layer(sw * 0.94, (it) => pick(it).dark, -sw * 0.02, -sw * 0.045);
    layer(sw * 0.8, (it) => pick(it).base, -sw * 0.05, -sw * 0.09);
    layer(sw * 0.46, (it) => pick(it).light, -sw * 0.1, -sw * 0.15);
    layer(sw * 0.15, 'rgba(255,255,255,.92)', -sw * 0.15, -sw * 0.21);
  } else {
    layer(sw, o.color || JT.PAL.cream, 0, 0);
    if (o.shine) layer(sw * 0.2, 'rgba(255,255,255,.55)', -sw * 0.12, -sw * 0.18);
  }
  ctx.restore();
  return total;
}

/* ===================================================================================================
 * INFLATED LETTERING — true "balloon" volume from the glyph skeleton.
 * Each glyph is rendered ONCE into a sprite (cached per glyph/size/colour): the stroke is the MASK; the
 * shading is made from offset copies of that mask (the classic inner-bevel trick):
 *   body gradient  ->  inner shadow (mask minus mask shifted up-left = bottom/right band)
 *   aqua bounce (bottom band)  ->  soft warm highlight (top/left band)  ->  crisp specular streak
 *   (a thin band inset from the top/left edge)  ->  everything clipped to the mask again.
 * The sticker rings (cream border, ink outline) are separate sprites so neighbouring letters merge into
 * one sticker silhouette. Per frame a letter is one drawImage (jiggle = transform), so the logo is cheap.
 * ================================================================================================= */
const _inflCache = {};
/** glyphs with enclosed loops get a lighter stroke so their counters stay open under the sticker rings */
const GLYPH_WEIGHT = { '&': 0.74, '8': 0.82, '0': 0.9, 'O': 0.9, 'P': 0.92, 'R': 0.92, 'B': 0.88, 'Q': 0.9 };

function _bandCanvas(mask, d1, d2, color) {
  // pixels inside `mask` whose neighbour at offset d2-d1 falls outside it: a one-sided edge band
  const w = mask.width, h = mask.height;
  const c = mkCanvas(w, h), g = c.getContext('2d');
  g.drawImage(mask, d1[0], d1[1]);
  g.globalCompositeOperation = 'destination-out';
  g.drawImage(mask, d2[0], d2[1]);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(mask, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color; g.fillRect(0, 0, w, h);
  return c;
}

/** Sprite for one glyph. kind: 'body' | 'ring' | 'shadow'. k = logical px per glyph unit, sw = logical stroke width. */
function inflatedSprite(ch, k, sw0, R, kind, color, rings, pad) {
  const sw = sw0 * (GLYPH_WEIGHT[ch] ?? 1);
  const key = [ch, kind, color || '', Math.round(k * R * 100), Math.round(sw0 * R * 10), Math.round(pad * R), (rings || []).map((r) => r.c + r.w.toFixed(2)).join('/')].join('|');
  if (_inflCache[key]) return _inflCache[key];
  const g = GLYPHS[ch] || GLYPHS['?'];
  const path = glyphPath(ch);
  const W = Math.max(2, Math.ceil((g[0] * k + 2 * pad) * R)), H = Math.max(2, Math.ceil((100 * k + 2 * pad) * R));
  const cv = mkCanvas(W, H), c = cv.getContext('2d');
  const stroke = (cx, width, style) => {
    cx.save(); cx.scale(R, R); cx.translate(pad, pad); cx.scale(k, k);
    cx.lineCap = 'round'; cx.lineJoin = 'round'; cx.lineWidth = width / k; cx.strokeStyle = style;
    if (path) cx.stroke(path);
    cx.restore();
  };
  if (kind === 'ring') {
    (rings || []).forEach((r) => stroke(c, sw + 2 * r.w, r.c));
  } else if (kind === 'shadow') {
    const w0 = (rings || []).reduce((m, r) => Math.max(m, r.w), 0);
    const tmp = mkCanvas(W, H);
    stroke(tmp.getContext('2d'), sw + 2 * w0, color);
    if ('filter' in c) c.filter = `blur(${(sw * R * 0.1).toFixed(1)}px)`;
    c.drawImage(tmp, 0, 0);
  } else {
    const mask = mkCanvas(W, H);
    stroke(mask.getContext('2d'), sw, '#fff');
    const rp = ramp(color), d = sw * R;
    // 1. body: light top -> saturated middle -> cool violet bottom
    const gr = c.createLinearGradient(0, pad * R, 0, H - pad * R);
    gr.addColorStop(0, rp.light); gr.addColorStop(0.5, rp.base); gr.addColorStop(1, mix(color, '#7a38b8', 0.3));
    c.fillStyle = gr; c.fillRect(0, 0, W, H);
    const lay = (band, a, blur) => {
      c.save(); c.globalAlpha = a;
      if ('filter' in c && blur > 0) c.filter = `blur(${blur.toFixed(1)}px)`;
      c.drawImage(band, 0, 0); c.restore();
    };
    // 2. inner shadow (bottom / right)
    lay(_bandCanvas(mask, [0, 0], [-0.2 * d, -0.26 * d], mix(color, '#5a1f9a', 0.5)), 0.55, 0.1 * d);
    // 3. aqua bounce light along the bottom edges
    lay(_bandCanvas(mask, [0, 0], [0, -0.17 * d], '#5cf0ff'), 0.5, 0.06 * d);
    // 4. soft warm highlight (top / left)
    lay(_bandCanvas(mask, [0, 0], [0.24 * d, 0.3 * d], '#fffbe8'), 0.62, 0.1 * d);
    // 5. crisp specular streak, inset from the top/left edge
    lay(_bandCanvas(mask, [0.11 * d, 0.13 * d], [0.2 * d, 0.24 * d], '#ffffff'), 0.95, 0.012 * d);
    // clip everything to the glyph
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(mask, 0, 0);
  }
  return (_inflCache[key] = cv);
}

/** Layout helper shared with drawInflated: returns items [{ch, x, w, i}], metrics. */
function _layoutText(s, x, h, o) {
  const weight = o.weight ?? 0.22, sw = h * weight, k = (h - sw) / 100, track = (o.track ?? 0.06) * h;
  const total = textWidth(s, h, o);
  let px = x;
  if (o.align === 'center') px = x - total / 2; else if (o.align === 'right') px = x - total;
  const items = []; let cx = px;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i], g = GLYPHS[ch] || GLYPHS['?'];
    items.push({ ch, x: cx + sw / 2, i, w: g[0] * k });
    cx += (ch === ' ' ? g[0] * k : g[0] * k + sw) + track;
  }
  return { items, sw, k, total, weight };
}

/**
 * drawInflated(ctx, str, x, y, h, o): puffy glossy balloon letters (cached sprites).
 * o: align, weight, track, colors[], rings [{w,c}] (outermost first), shadow {c, dx, dy}, jiggle(i)->[dx,dy,rot], alpha
 */
function drawInflated(ctx, str, x, y, h, o = {}) {
  const s = String(str).toUpperCase();
  const L = _layoutText(s, x, h, o);
  const { items, sw, k, total } = L;
  const m = ctx.getTransform(), R = Math.max(1, Math.hypot(m.a, m.b));
  const rings = o.rings || (o.outline ? [{ w: o.outline.w, c: o.outline.c }] : []);
  const ringW = rings.reduce((a, r) => Math.max(a, r.w), 0);
  const pad = sw / 2 + ringW + Math.max(1.5, h * 0.05);
  const top = y - h + sw / 2;
  const colors = o.colors || [o.color || JT.PAL.coral];
  ctx.save();
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
  const place = (it, sprite) => {
    const jg = o.jiggle ? o.jiggle(it.i) : null;
    ctx.save();
    if (jg) {
      ctx.translate(it.x + it.w / 2 + jg[0], top + (h - sw) / 2 + jg[1]); ctx.rotate(jg[2] || 0); ctx.translate(-it.w / 2, -(h - sw) / 2);
    } else ctx.translate(it.x, top);
    return jg;
  };
  const blit = (it, sprite, dx = 0, dy = 0) => {
    place(it, sprite);
    ctx.drawImage(sprite, -pad + dx, -pad + dy, sprite.width / R, sprite.height / R);
    ctx.restore();
  };
  if (o.shadow) {
    const sh = o.shadow;
    items.forEach((it) => { if (GLYPHS[it.ch] && GLYPHS[it.ch][1]) blit(it, inflatedSprite(it.ch, k, sw, R, 'shadow', sh.c ?? 'rgba(20,40,110,.35)', rings, pad), sh.dx ?? 0, sh.dy ?? sw * 0.25); });
  }
  if (rings.length) items.forEach((it) => { if (GLYPHS[it.ch] && GLYPHS[it.ch][1]) blit(it, inflatedSprite(it.ch, k, sw, R, 'ring', null, rings, pad)); });
  items.forEach((it) => { if (GLYPHS[it.ch] && GLYPHS[it.ch][1]) blit(it, inflatedSprite(it.ch, k, sw, R, 'body', colors[it.i % colors.length], null, pad)); });
  ctx.restore();
  return total;
}
/* ===================================================================================================
 * 03 MATERIALS — the light model. One key light from top-left; every glossy body gets
 *   radial base gradient (warm light -> cool shadow)  +  bottom rim light in water colour
 *   +  specular "window"  +  optional soft contact shadow. Gradients only (no shadowBlur) so these are
 *   cheap enough to run per entity per frame; the blur-heavy effects live in cached layers.
 * ================================================================================================= */

/** Soft elliptical contact shadow (radial gradient, no blur filter). */
function softShadow(ctx, x, y, rx, ry, a = 0.3, color = '#1a2f6b') {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, alpha(color, a));
  g.addColorStop(0.55, alpha(color, a * 0.55));
  g.addColorStop(1, alpha(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Additive glow disc. */
function glow(ctx, x, y, r, color, a = 0.6, add = true) {
  ctx.save();
  if (add) ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, alpha(color, a));
  g.addColorStop(0.4, alpha(color, a * 0.4));
  g.addColorStop(1, alpha(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Soft white highlight blob. */
function spec(ctx, cx, cy, rx, ry, rot = 0, a = 0.7, color = '#ffffff') {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, alpha(color, a));
  g.addColorStop(0.6, alpha(color, a * 0.5));
  g.addColorStop(1, alpha(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Crisp glossy "window" highlight (rounded capsule, fades downward). */
function gloss(ctx, cx, cy, rx, ry, rot = -0.5, a = 0.85) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  const g = ctx.createLinearGradient(0, -ry, 0, ry);
  g.addColorStop(0, `rgba(255,255,255,${a})`);
  g.addColorStop(1, `rgba(255,255,255,${a * 0.35})`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/**
 * paint(ctx, shape, ramp, o) — glossy vinyl body.
 *   o.lx/ly   light spot position in bbox fractions     o.rim (0 disables) / o.rimA
 *   o.edge    subtle tinted contour (readability)       o.spec false disables the soft highlight
 *   o.matte   true = clay (wide low highlight, no window)   o.alpha  global alpha multiplier
 */
function paint(ctx, sh, rp, o = {}) {
  const { x, y, w, h, p } = sh;
  const R = Math.max(w, h);
  ctx.save();
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
  const mf = JT.F < 0 ? -1 : 1;                       // drawing under a mirrored transform: keep the key light top-left
  const fxr = (v) => (mf < 0 ? 1 - v : v);
  const lx = x + w * fxr(o.lx ?? 0.34), ly = y + h * (o.ly ?? 0.26);
  const g = ctx.createRadialGradient(lx, ly, R * 0.02, x + w * 0.5, y + h * 0.56, R * (o.spread ?? 0.78));
  g.addColorStop(0, o.matte ? rp.light : rp.hi);
  g.addColorStop(o.matte ? 0.4 : 0.1, o.matte ? rp.base : rp.light);
  g.addColorStop(o.matte ? 0.7 : 0.4, rp.base);
  g.addColorStop(1, rp.dark);
  ctx.fillStyle = g;
  ctx.fill(p);
  if (o.rim !== 0) {
    ctx.save();
    ctx.clip(p);
    const rg = ctx.createLinearGradient(0, y + h * 0.42, 0, y + h);
    rg.addColorStop(0, alpha(rp.rim, 0));
    rg.addColorStop(1, alpha(rp.rim, o.rimA ?? 0.75));
    ctx.strokeStyle = rg;
    ctx.lineWidth = h * 0.15;
    ctx.lineJoin = 'round';
    ctx.translate(0, -h * 0.065);
    ctx.stroke(p);
    ctx.restore();
  }
  if (o.key !== false && R > 9) {
    // key-light edge: a thin warm-white band hugging the top-left edges (the outline shifted toward the light and clipped),
    // fading out toward the lower half. This is what makes the toy read as a lit, rounded object instead of a flat gradient.
    ctx.save();
    ctx.clip(p);
    const kd = Math.max(0.3, R * 0.034);
    ctx.translate(kd * mf, kd * 1.05);
    const kg = ctx.createLinearGradient(0, y, 0, y + h * 0.75);
    kg.addColorStop(0, `rgba(255,250,236,${o.keyA ?? (o.matte ? 0.3 : 0.62)})`); kg.addColorStop(1, 'rgba(255,250,236,0)');
    ctx.strokeStyle = kg; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(0.3, R * 0.04);
    ctx.stroke(p);
    ctx.restore();
  }
  if (o.edge !== false) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = o.edgeW ?? Math.max(0.35, R * 0.012);
    ctx.strokeStyle = alpha(rp.deep, o.edgeA ?? 0.5);
    ctx.stroke(p);
  }
  if (o.spec !== false) {
    if (o.matte) spec(ctx, x + w * fxr(0.34), y + h * 0.28, w * 0.34, h * 0.22, -0.4 * mf, 0.28, '#fff4e0');
    else spec(ctx, x + w * fxr(0.3), y + h * 0.2, w * 0.17, h * 0.085, -0.5 * mf, 0.8);
  }
  ctx.restore();
}

/** Cheap soft blob for small secondary parts (gill fronds): vertical light->base gradient + faint contour, no clip / rim / spec.
 *  ~3x cheaper than paint(); used where there are many tiny shapes per character. */
function fastBlob(ctx, sh, rp) {
  const g = ctx.createLinearGradient(0, sh.y, 0, sh.y + sh.h);
  g.addColorStop(0, rp.light); g.addColorStop(0.45, rp.base); g.addColorStop(1, mix(rp.base, rp.dark, 0.7));
  ctx.fillStyle = g; ctx.fill(sh.p);
  ctx.lineJoin = 'round'; ctx.lineWidth = 0.34; ctx.strokeStyle = alpha(rp.deep, 0.5); ctx.stroke(sh.p);
}

/** Tapered tube polygon around a polyline. pts [[x,y]..], w0/w1 widths. Returns shape. */
function tubeShape(pts, w0, w1) {
  const n = pts.length;
  const L = [], Rr = [];
  let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
  const dirs = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    dirs.push([dx, dy]);
    const w = (typeof w0 === 'function' ? w0(i / (n - 1)) : (w0 + (w1 - w0) * (i / (n - 1)))) / 2;
    L.push([pts[i][0] - dy * w, pts[i][1] + dx * w]);
    Rr.push([pts[i][0] + dy * w, pts[i][1] - dx * w]);
    minx = Math.min(minx, pts[i][0] - w); maxx = Math.max(maxx, pts[i][0] + w);
    miny = Math.min(miny, pts[i][1] - w); maxy = Math.max(maxy, pts[i][1] + w);
  }
  const p = new Path2D();
  p.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < n; i++) p.lineTo(L[i][0], L[i][1]);
  const ea = Math.atan2(dirs[n - 1][1], dirs[n - 1][0]);
  const wEnd = typeof w0 === 'function' ? w0(1) : w1;
  p.arc(pts[n - 1][0], pts[n - 1][1], wEnd / 2, ea + Math.PI / 2, ea - Math.PI / 2, true);
  for (let i = n - 1; i >= 0; i--) p.lineTo(Rr[i][0], Rr[i][1]);
  const sa = Math.atan2(dirs[0][1], dirs[0][0]);
  const wSt = typeof w0 === 'function' ? w0(0) : w0;
  p.arc(pts[0][0], pts[0][1], wSt / 2, sa - Math.PI / 2, sa - Math.PI * 1.5, true);
  p.closePath();
  return { p, x: minx, y: miny, w: maxx - minx, h: maxy - miny };
}

/** Sample a quadratic bezier into n points. */
function quad(a, c, b, n = 10) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return out;
}
function cubic(a, c1, c2, b, n = 12) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), u = 1 - t;
    out.push([
      u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b[0],
      u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b[1],
    ]);
  }
  return out;
}

/** Glossy tube drawn with paint() plus a centre-line highlight (cheap cylinder cue). */
function drawTube(ctx, pts, w0, w1, rp, o = {}) {
  const sh = tubeShape(pts, w0, w1);
  paint(ctx, sh, rp, { spec: false, rimA: 0.55, ...o });
  if (o.hl !== false) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const n = pts.length;
    const i1 = Math.floor(n * 0.1), i2 = Math.max(i1 + 2, Math.floor(n * 0.8));
    ctx.strokeStyle = `rgba(255,255,255,${o.hlA ?? 0.4})`;
    ctx.lineWidth = Math.max(0.3, (typeof w0 === 'function' ? w0(0.5) : w0) * 0.2);
    const side = (o.hlSide ?? 1) * (JT.F < 0 ? -1 : 1);
    ctx.beginPath();
    for (let i = i1; i < i2; i++) {
      const w = (typeof w0 === 'function' ? w0(i / (n - 1)) : (w0 + (w1 - w0) * (i / (n - 1)))) * 0.2;
      const nx = pts[Math.min(n - 1, i + 1)][0] - pts[Math.max(0, i - 1)][0];
      const ny = pts[Math.min(n - 1, i + 1)][1] - pts[Math.max(0, i - 1)][1];
      const d = Math.hypot(nx, ny) || 1;
      const X = pts[i][0] + side * (ny / d) * w * 0.9, Y = pts[i][1] - side * (nx / d) * w * 0.9;
      if (i === i1) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    }
    ctx.stroke();
    ctx.restore();
  }
  return sh;
}

/** Glossy sphere eye. r radius; look = [dx,dy] -1..1 pupil shift; lid 0..1 closing. */
function drawEye(ctx, cx, cy, r, o = {}) {
  const look = o.look || [0.25, 0.05];
  const lid = o.lid || 0;
  ctx.save();
  ctx.translate(cx, cy);
  if (lid > 0.02) ctx.scale(1, Math.max(0.12, 1 - lid));
  const base = o.color || JT.PAL.ink;
  const rp = ramp(base);
  // sclera-less glossy bead
  const g = ctx.createRadialGradient(-r * 0.25 * (JT.F < 0 ? -1 : 1), -r * 0.35, r * 0.05, 0, 0, r * 1.05);
  g.addColorStop(0, mix(base, '#6f86c9', 0.4));
  g.addColorStop(0.5, base);
  g.addColorStop(1, mix(base, '#0b0d22', 0.5));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  // aqua bounce light at the bottom (rim light from below)
  const rg = ctx.createLinearGradient(0, r * 0.1, 0, r);
  rg.addColorStop(0, 'rgba(79,233,255,0)');
  rg.addColorStop(1, `rgba(79,233,255,${o.bounce ?? 0.5})`);
  ctx.fillStyle = rg;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.98, 0, TAU); ctx.fill();
  // window highlight (big) + sparkle (small)
  const mf = JT.F < 0 ? -1 : 1;
  const hx = (-r * 0.3 + look[0] * r * 0.25) * mf, hy = -r * 0.34 + look[1] * r * 0.25;
  ctx.fillStyle = 'rgba(255,255,255,.96)';
  ctx.beginPath(); ctx.ellipse(hx, hy, r * 0.34, r * 0.28, -0.5 * mf, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.beginPath(); ctx.arc((r * 0.3 + look[0] * r * 0.2) * mf, r * 0.32 + look[1] * r * 0.2, r * 0.13, 0, TAU); ctx.fill();
  ctx.restore();
}

/** Seeded deterministic rng helper (uses the game's U.rng when present). */
function seeded(seed) {
  if (typeof U !== 'undefined' && U.rng) return U.rng(seed);
  let s = seed >>> 0;
  const next = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, float: (a = 0, b = 1) => a + next() * (b - a), int: (a, b) => a + Math.floor(next() * (b - a + 1)) };
}
/* ===================================================================================================
 * 04 PLAYERS — Fizz (pink) and Pop (lavender + aqua). Smooth vector axolotls, designed in a 100-unit
 * tall design space (feet at origin, +x = facing) and scaled by k = 0.2 -> a ~20 px tall toy for the
 * 16x16 logical box. Squash & stretch pivots at the feet; gills / tail carry secondary motion.
 * Silhouette: huge head, bean body, 3+3 bobbing gill fronds on the BACK of the head, paddle tail
 * behind -> facing direction reads from gills-vs-snout even in a silhouette.
 * ================================================================================================= */
const PLAYER_STYLE = {
  p1: { body: '#ff8fb8', gill: '#ff3f8e', tip: '#ff8cbc', gillFar: '#c91f6e', tipFar: '#f2589a', belly: '#fff0e0', cheek: '#ff4f8a', mouth: '#a21f5a', spot: null, name: 'Fizz' },
  p2: { body: '#aa9bff', gill: '#27cfe3', tip: '#8cf1f4', gillFar: '#119bbd', tipFar: '#48c9dd', belly: '#effcff', cheek: '#ff86b2', mouth: '#33328f', spot: '#7b66ee', name: 'Pop' },
};

const _PL = {};
function _plPaths() {
  if (_PL.body) return _PL;
  _PL.body = shape('M-26 -34 C-30 -62 -4 -72 14 -64 C34 -56 36 -22 24 -10 C12 2 -24 2 -26 -34 Z', -30, -72, 66, 74);
  _PL.head = shape('M-33 -64 C-35 -91 -12 -103 8 -101 C34 -99 50 -87 50 -66 C50 -44 32 -37 10 -37 C-14 -37 -31 -45 -33 -64 Z', -35, -103, 85, 66);
  return _PL;
}

function playerPose(pose, t, st) {
  const P = { sx: 1, sy: 1, lean: 0, bob: 0, mouth: 0, arm: 'down', armSwing: 0, footN: [0, 0], footF: [0, 0], sway: 0, tailAmp: 1, puff: 1, look: [0.35, 0.05], smile: 1 };
  const br = Math.sin(t * 2.6);
  switch (pose) {
    case 'walk': {
      const ph = t * 11;
      P.bob = -Math.abs(Math.sin(ph)) * 3.2;
      P.sy = 1 + Math.abs(Math.sin(ph)) * 0.025; P.sx = 2 - P.sy;
      P.lean = 0.045; P.arm = 'swing'; P.armSwing = Math.sin(ph);
      P.footN = [Math.sin(ph) * 8, Math.max(0, Math.cos(ph)) * 7];
      P.footF = [-Math.sin(ph) * 8, Math.max(0, -Math.cos(ph)) * 7];
      P.sway = -0.12; P.tailAmp = 1.4;
      break;
    }
    case 'jump':
      P.sy = 1.1; P.sx = 0.92; P.arm = 'cheer'; P.footN = [4, 11]; P.footF = [-6, 9]; P.sway = 0.5; P.mouth = 0; P.lean = 0.03; P.tailAmp = 0.5;
      P.look = [0.4, -0.2];
      break;
    case 'fall':
      P.sy = 0.96; P.sx = 1.05; P.arm = 'up'; P.footN = [6, 6]; P.footF = [-6, 4]; P.sway = -0.55; P.look = [0.3, 0.3]; P.tailAmp = 0.7;
      break;
    case 'shoot':
      P.sy = 1.02 + br * 0.01; P.sx = 1.05; P.arm = 'fwd'; P.mouth = st.mouth ?? 1; P.lean = -0.05; P.puff = 1.05; P.sway = -0.1; P.look = [0.5, 0.05];
      break;
    default:   // idle
      P.sy = 1 + br * 0.022; P.sx = 2 - P.sy; P.sway = Math.sin(t * 1.7) * 0.05;
  }
  if (st.mouth !== undefined && pose !== 'shoot') P.mouth = st.mouth;
  return P;
}

/**
 * One gill = tapered stalk + a feathery plume of tapered fronds (longer at the base, shorter toward the tip, alternating
 * sides, each one lighter than the stalk) + a 3-leaf fan at the tip. Reads as "frilly" even at 1x and sways per frond.
 */
function _gill(ctx, b, aDeg, L, sway, t, i, rpStalk, rpTip, w0 = 11, w1 = 6.5) {
  const a = rad(aDeg) + sway + Math.sin(t * 3.1 + i * 1.7) * 0.1;
  const dx = Math.cos(a), dy = Math.sin(a);
  const curve = Math.sin(t * 2.4 + i * 2.1) * 6 + 3;
  const mid = [b[0] + dx * L * 0.5 - dy * curve, b[1] + dy * L * 0.5 + dx * curve];
  const tip = [b[0] + dx * L, b[1] + dy * L];
  const pts = quad(b, mid, tip, 12);
  const at = (u) => {
    const q = u * (pts.length - 1), i0 = Math.min(pts.length - 2, Math.floor(q)), f = q - i0;
    const p0 = pts[i0], p1 = pts[i0 + 1];
    const tx = p1[0] - p0[0], ty = p1[1] - p0[1], d = Math.hypot(tx, ty) || 1;
    return [p0[0] + tx * f, p0[1] + ty * f, tx / d, ty / d];
  };
  const leaf = (px, py, ang, len, w, ph) => {
    const wob = Math.sin(t * 3.3 + ph) * 0.12;
    const A = ang + wob, ca = Math.cos(A), sa = Math.sin(A);
    const bend = Math.sin(t * 2.6 + ph * 1.3) * len * 0.12 + len * 0.1;
    const pp = [[px, py], [px + ca * len * 0.5 - sa * bend, py + sa * len * 0.5 + ca * bend], [px + ca * len, py + sa * len]];
    fastBlob(ctx, tubeShape(quad(pp[0], pp[1], pp[2], 5), w, w * 0.62), rpTip);
  };
  const nF = 5;
  for (let j = 0; j < nF; j++) {
    const u = 0.14 + j * 0.15, [px, py, tx, ty] = at(u);
    const side = j % 2 ? 1 : -1, base = Math.atan2(ty, tx);
    leaf(px, py, base + side * (0.9 - u * 0.4), L * (0.52 - u * 0.26), 8.6 - u * 3.2, j * 1.9 + i);
  }
  drawTube(ctx, pts, w0, w1, rpStalk, { hlA: 0.3 });
  // tip fan (centre leaf in front)
  const [ex, ey, tx, ty] = at(1), tb = Math.atan2(ty, tx);
  leaf(ex, ey, tb - 0.7, L * 0.28, 7.2, i + 7);
  leaf(ex, ey, tb + 0.7, L * 0.28, 7.2, i + 9);
  leaf(ex, ey, tb, L * 0.34, 8, i + 5);
}

/**
 * drawPlayer(ctx, who, st)  who: 'p1' | 'p2'
 * st: { x, y (feet centre, logical px), facing: 1|-1, pose: idle|walk|jump|fall|shoot, t (s), mouth 0..1,
 *       blink 0..1, scale (1 = 20 px tall toy), shadow:{y, a} optional contact shadow on a surface }
 */
function drawPlayer(ctx, who, st = {}) {
  const S = PLAYER_STYLE[who] || PLAYER_STYLE.p1;
  const t = st.t || 0, pose = st.pose || 'idle', f = st.facing || 1;
  const P = playerPose(pose, t, st);
  const k = 0.2 * (st.scale || 1);
  const { body, head } = _plPaths();
  const rBody = ramp(S.body), rGill = ramp(S.gill), rTip = ramp(S.tip), rBelly = ramp(S.belly);
  const rGillFar = ramp(S.gillFar), rTipFar = ramp(S.tipFar);
  const rFoot = ramp(mix(S.body, '#7a3fb0', 0.14));

  if (st.shadow) softShadow(ctx, st.x, st.shadow.y, 8.5 * (st.scale || 1) * (st.shadow.s ?? 1), 2.1 * (st.scale || 1) * (st.shadow.s ?? 1), st.shadow.a ?? 0.32);

  const prevF = JT.F; JT.F = f;
  ctx.save();
  ctx.translate(st.x || 0, st.y || 0);
  ctx.rotate(P.lean * f);
  ctx.scale(f * k * P.sx, k * P.sy);
  ctx.translate(0, P.bob);

  /* far gills (darker, behind everything) */
  [[-8, -99, -102, 24], [-24, -88, -136, 27], [-31, -72, -170, 25]].forEach((g, i) =>
    _gill(ctx, [g[0], g[1]], g[2], g[3], P.sway, t + 0.8, i + 3, rGillFar, rTipFar, 12, 7.6));

  /* tail */
  {
    const w = Math.sin(t * 3.2) * 9 * P.tailAmp, w2 = Math.cos(t * 3.2 - 0.6) * 9 * P.tailAmp;
    const pts = quad([-20, -22], [-48, -10 + w * 0.5], [-70, -38 + w2], 12);
    drawTube(ctx, pts, 27, 9, rBody, { hlA: 0.3 });
    // soft fin tint along the tail tip (light, follows the tube)
    const tip = pts.slice(6);
    drawTube(ctx, tip.map(([x, y]) => [x, y - 0.5]), 12, 5.6, ramp(mix(S.body, S.tip, 0.5)), { hl: false, rim: 0, edge: false, alpha: 0.55, spec: false });
  }

  /* far foot */
  paint(ctx, ellShape(-12 + P.footF[0], -5.5 - P.footF[1], 12, 7.2), rFoot, { spec: false, edgeA: 0.45 });

  /* body + belly */
  paint(ctx, body, rBody, { edgeA: 0.5 });
  ctx.save();
  ctx.clip(body.p);
  paint(ctx, ellShape(13, -30, 15.5, 22), rBelly, { rim: 0, spec: false, edge: false, lx: 0.4, ly: 0.2, spread: 0.9 });
  // soft AO under the chin onto the body
  const ao = ctx.createRadialGradient(8, -42, 2, 8, -42, 28);
  ao.addColorStop(0, alpha(mix(S.body, '#4a2a8c', 0.6), 0.5)); ao.addColorStop(1, alpha(S.body, 0));
  ctx.fillStyle = ao; ctx.fillRect(-40, -80, 90, 60);
  if (S.spot) {
    ctx.fillStyle = alpha(S.spot, 0.5);
    [[-14, -44, 3.2], [-6, -26, 2.6], [-17, -24, 2.2], [2, -52, 2.4], [-10, -57, 2]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); });
  }
  ctx.restore();

  /* near foot (toes as 3 tiny bumps) */
  {
    const fx = 16 + P.footN[0], fy = -5.5 - P.footN[1];
    paint(ctx, ellShape(fx, fy, 13.5, 7.6), rFoot, { spec: false, edgeA: 0.5 });
    ctx.fillStyle = alpha(S.mouth, 0.28);
    [-5, 1, 7].forEach((dx) => { ctx.beginPath(); ctx.ellipse(fx + 6 + dx * 0.6, fy + 1.6, 1.5, 1.1, 0, 0, TAU); ctx.fill(); });
  }

  /* near arm (drawn behind the head) */
  {
    let tgt;
    if (P.arm === 'swing') tgt = [18 + P.armSwing * 6, -26 + Math.abs(P.armSwing) * -3];
    else if (P.arm === 'cheer') tgt = [34, -56];
    else if (P.arm === 'up') tgt = [24, -62 + Math.sin(t * 9) * 2];
    else if (P.arm === 'fwd') tgt = [37, -44];
    else tgt = [24, -25];
    const pts = quad([8, -42], [(8 + tgt[0]) / 2 + 3, (-42 + tgt[1]) / 2 + 4], tgt, 8);
    drawTube(ctx, pts, 11, 9, rBody, { hlA: 0.35 });
    paint(ctx, ellShape(tgt[0] + 1, tgt[1] + 1, 6, 5.6), rBody, { rim: 0.5, edgeA: 0.4 });
    ctx.fillStyle = alpha(S.mouth, 0.3);
    [-2, 2.2].forEach((d) => { ctx.beginPath(); ctx.arc(tgt[0] + 3 + d * 0.4, tgt[1] + 2.6 + d * 0.5, 0.9, 0, TAU); ctx.fill(); });
  }

  /* near gills */
  [[-20, -90, -122, 31], [-28, -78, -158, 33], [-31, -63, -190, 29]].forEach((g, i) =>
    _gill(ctx, [g[0], g[1]], g[2], g[3], P.sway, t, i, rGill, rTip));

  /* head */
  ctx.save();
  ctx.translate(8, -68); ctx.scale(P.puff, P.puff * (2 - P.puff)); ctx.translate(-8, 68);
  paint(ctx, head, rBody, { edgeA: 0.5, lx: 0.4, ly: 0.2 });
  ctx.save();
  ctx.clip(head.p);
  if (S.spot) {
    ctx.fillStyle = alpha(S.spot, 0.45);
    [[-18, -84, 3], [-8, -92, 2.4], [-22, -72, 2.2], [4, -96, 2.2], [-12, -62, 1.9]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); });
  }
  // cheek blush
  spec(ctx, 41, -57, 10, 6, 0, 0.55, S.cheek);
  spec(ctx, 16, -55, 8, 4.5, 0, 0.3, S.cheek);
  ctx.restore();
  // crisp window highlight on the crown
  ctx.save(); ctx.clip(head.p);
  const wx = JT.F < 0 ? 1 : 1;
  gloss(ctx, -4, -92, 14, 4.6, -0.28, 0.5);
  ctx.restore();

  /* eyes */
  const lid = st.blink || 0;
  drawEye(ctx, 6, -75, 10.2, { look: P.look, lid });
  drawEye(ctx, 31, -72, 12, { look: P.look, lid });

  /* mouth */
  ctx.lineCap = 'round';
  if (P.mouth > 0.08) {
    const m = P.mouth;
    const my = -51, mx = 38 + (pose === 'shoot' ? 3 : 0);
    ctx.fillStyle = S.mouth;
    ctx.beginPath(); ctx.ellipse(mx, my, 6.5 + m * 2.5, 3 + m * 6, -0.1, 0, TAU); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.ellipse(mx, my, 6.5 + m * 2.5, 3 + m * 6, -0.1, 0, TAU); ctx.clip();
    ctx.fillStyle = '#ff7fa6'; ctx.beginPath(); ctx.ellipse(mx + 0.5, my + 3 + m * 3.5, 5.2, 3.4 + m * 2, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(mx - 12, my - 12, 24, 10);
    ctx.restore();
  } else {
    ctx.strokeStyle = S.mouth; ctx.lineWidth = 3.1;
    ctx.beginPath(); ctx.moveTo(25, -52); ctx.quadraticCurveTo(35, -43, 45, -54); ctx.stroke();
  }
  ctx.restore();   // head scale

  ctx.restore();
  JT.F = prevF;
}
/* ===================================================================================================
 * 05 ENEMIES — one drawing function per species, all in a 100-unit design space whose origin is the
 * CENTRE of the 16x16 logical box (feet at y = +42, so scale 0.19 sits on the platform). +x = facing.
 * Silhouette first (each species owns one unmistakable outline), then material, then details.
 *   Nibbler  gold clockwork fish on legs, cog on its back   (glossy gold plastic + copper cog)
 *   Crabbit  orange clay crab, bunny-ear eye stalks, raised claws   (MATTE clay)
 *   Jellop   violet translucent jellyfish                  (jelly, alpha-blended over its own tentacles)
 * Angry = crimson re-skin + brows + anger-vein + steam puffs (same silhouette, so it never confuses).
 * ================================================================================================= */
const ANGRY = '#e8344f';

/** Sets up the entity transform. st: x,y centre; facing; scale; lean; sx/sy squash. Calls body(k). */
function withEntity(ctx, st, k0, body) {
  const f = st.facing || 1;
  const k = k0 * (st.scale || 1);
  const prevF = JT.F; JT.F = f;
  ctx.save();
  ctx.translate(st.x || 0, st.y || 0);
  if (st.lean) ctx.rotate(st.lean * f);
  ctx.scale(f * k * (st.sx || 1), k * (st.sy || 1));
  body(k);
  ctx.restore();
  JT.F = prevF;
}

/** rising steam: two cartoon cloud puffs (3 lobes each, shaded white -> pale pink -> lilac underside) that grow and fade;
 *  drawn in design space around (cx,cy). Reads as steam, never as a stray glint. */
function drawSteam(ctx, cx, cy, t, spread = 40) {
  for (let i = 0; i < 4; i++) {
    const side = i % 2 ? 1 : -1;
    const ph = ((t * 0.8 + i * 0.27) % 1);
    const x = cx + side * (spread * 0.62 + (i >> 1) * 7 + ph * 5), y = cy - 6 - ph * 34 - (i >> 1) * 6;
    const s = 0.55 + ph * 0.75, a = Math.min(1, Math.sin(ph * Math.PI) * 1.35);
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.globalAlpha *= a;
    [[-6.5, 2, 6.4], [6.5, 2.4, 6], [0, -3.6, 8]].forEach(([ox, oy, r]) => {
      const g = ctx.createRadialGradient(ox - r * 0.3, oy - r * 0.4, 0, ox, oy, r);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.65, '#ffeaf0'); g.addColorStop(1, '#d9c6ee');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ox, oy, r, 0, TAU); ctx.fill();
    });
    ctx.restore();
  }
}
/** comic anger vein (4 arcs) */
function drawAngerVein(ctx, x, y, s = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.lineCap = 'round'; ctx.lineWidth = 3.4; ctx.strokeStyle = '#ffeaf0';
  const arcs = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  for (const [sx, sy] of arcs) { ctx.beginPath(); ctx.moveTo(sx * 2.5, sy * 8); ctx.quadraticCurveTo(sx * 2.5, sy * 2.5, sx * 8, sy * 2.5); ctx.stroke(); }
  ctx.lineWidth = 1.7; ctx.strokeStyle = '#ff2b4d';
  for (const [sx, sy] of arcs) { ctx.beginPath(); ctx.moveTo(sx * 2.5, sy * 8); ctx.quadraticCurveTo(sx * 2.5, sy * 2.5, sx * 8, sy * 2.5); ctx.stroke(); }
  ctx.restore();
}
/** angry/worried brow slab over an eye at (cx,cy) radius r. dir: +1 angry (inner end down) / -1 worried */
function drawBrow(ctx, cx, cy, r, dir, inner = 1, color = '#3a1030') {
  ctx.save(); ctx.translate(cx, cy);
  ctx.lineCap = 'round'; ctx.strokeStyle = color; ctx.lineWidth = r * 0.5;
  ctx.beginPath(); ctx.moveTo(-r * 0.95 * inner, -r * 1.12 + dir * r * 0.46); ctx.lineTo(r * 0.95 * inner, -r * 1.12 - dir * r * 0.46); ctx.stroke();
  ctx.restore();
}
function gearPath(cx, cy, ro, ri, n, rot) {
  const p = new Path2D();
  for (let i = 0; i < n; i++) {
    const a0 = rot + (i / n) * TAU, da = TAU / n;
    const pts = [[a0, ri], [a0 + da * 0.12, ro], [a0 + da * 0.38, ro], [a0 + da * 0.5, ri]];
    pts.forEach(([a, r], j) => { const X = cx + Math.cos(a) * r, Y = cy + Math.sin(a) * r; (i === 0 && j === 0) ? p.moveTo(X, Y) : p.lineTo(X, Y); });
  }
  p.closePath();
  return p;
}

/* ------------------------------------------------ NIBBLER ------------------------------------- */
function drawNibbler(ctx, st) {
  const t = st.t || 0, angry = !!st.angry;
  const base = angry ? ANGRY : '#ffc72f';
  const rB = ramp(base), rBelly = ramp(angry ? '#ff9db0' : '#ffe8a3'), rCog = ramp(angry ? '#7d2a56' : '#e8873a'), rLeg = ramp(angry ? '#c0213f' : '#e8a82b');
  const walk = st.walk ?? 1, ph = t * 9 * walk;
  withEntity(ctx, st, 0.19, () => {
    const bob = st.noBob ? 0 : -Math.abs(Math.sin(ph)) * 2.5 * walk;
    // legs (behind body)
    const leg = (x0, p0, rp) => {
      const lift = Math.max(0, Math.sin(p0)) * 8 * walk, fx = x0 + Math.cos(p0) * 5 * walk;
      drawTube(ctx, [[x0, 20 + bob], [x0 + 1, 30 + bob], [fx, 36 - lift]], 13, 11, rp, { hlA: 0.3, edgeA: 0.5 });
      paint(ctx, rrShape(fx - 12, 34 - lift, 25, 11, 5.5), rp, { rim: 0.4, edgeA: 0.5, spec: false });
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(fx - 8, 35 - lift, 10, 1.6);
    };
    leg(-16, ph + Math.PI, rLeg); leg(16, ph, rB);
    ctx.save(); ctx.translate(0, bob);
    // cog (behind the body, upper half peeks over the back)
    const cogRot = t * 1.6 * (st.trapped ? 0.3 : 1);
    {
      const cx = -8, cy = -42;
      paint(ctx, shape(gearPath(cx, cy, 27, 21, 9, cogRot), cx - 27, cy - 27, 54, 54), rCog, { rim: 0.4, edgeA: 0.55 });
      paint(ctx, ellShape(cx, cy, 15, 15), rCog, { rim: 0.2, edgeA: 0.5, lx: 0.4, spec: false });
      ctx.fillStyle = alpha(rCog.deep, 0.7); ctx.beginPath(); ctx.arc(cx, cy, 6.2, 0, TAU); ctx.fill();
      ctx.fillStyle = alpha('#ffffff', 0.5); ctx.beginPath(); ctx.arc(cx - 1.4, cy - 1.8, 1.8, 0, TAU); ctx.fill();
    }
    // tail fin (wags)
    {
      const w = Math.sin(t * 5.5) * 0.18;
      ctx.save(); ctx.translate(-40, -2); ctx.rotate(w);
      const fin = shape('M4 0 L-28 -28 Q-40 0 -28 28 Z', -40, -30, 46, 60);
      paint(ctx, fin, rLeg, { edgeA: 0.5, spec: false });
      ctx.strokeStyle = alpha(rLeg.deep, 0.5); ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      [[-24, -18], [-30, -2], [-24, 16]].forEach(([x, y]) => { ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(x, y); ctx.stroke(); });
      ctx.restore();
    }
    // body
    const body = shape('M-44 -2 C-44 -32 -14 -40 12 -36 C40 -32 52 -12 50 2 C48 24 20 30 -6 30 C-32 30 -44 16 -44 -2 Z', -45, -40, 96, 72);
    paint(ctx, body, rB, { edgeA: 0.55, lx: 0.4, ly: 0.2 });
    ctx.save(); ctx.clip(body.p);
    // belly plate + panel seam + rivets  => clockwork toy
    paint(ctx, rrShape(-50, 8, 108, 40, 14), rBelly, { rim: 0, spec: false, edge: false, lx: 0.4 });
    ctx.strokeStyle = alpha(rB.deep, 0.55); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-50, 9); ctx.quadraticCurveTo(0, 13, 56, 8); ctx.stroke();
    ctx.fillStyle = alpha(rB.deep, 0.55);
    [-30, -14, 2, 18, 34].forEach((x) => { ctx.beginPath(); ctx.arc(x, 15.5, 1.7, 0, TAU); ctx.fill(); });
    // metallic reflection band
    const rg = ctx.createLinearGradient(0, -32, 0, 4);
    rg.addColorStop(0, 'rgba(255,255,255,0)'); rg.addColorStop(0.45, 'rgba(255,255,255,.28)'); rg.addColorStop(0.62, 'rgba(255,255,255,0)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rg; ctx.fillRect(-50, -40, 110, 50);
    ctx.restore();
    gloss(ctx, -14 * (JT.F < 0 ? -1 : 1) * 0 + (JT.F < 0 ? 4 : -22), -28, 15, 4.4, JT.F < 0 ? 0.3 : -0.3, 0.7);
    // gill slits
    ctx.strokeStyle = alpha(rB.deep, 0.6); ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    [-3, 3, 9].forEach((x, i) => { ctx.beginPath(); ctx.moveTo(x - 4, -14 + i * 0.5); ctx.quadraticCurveTo(x - 1, -4, x - 4, 6); ctx.stroke(); });
    // pectoral fin
    paint(ctx, shape('M-6 4 C0 -4 14 -2 18 8 C12 20 -2 20 -6 4 Z', -6, -4, 24, 26), rLeg, { edgeA: 0.5, spec: false, rim: 0.3 });
    // porthole eye
    const ex = 25, ey = -14;
    paint(ctx, ellShape(ex, ey, 17, 17), rCog, { rim: 0.5, edgeA: 0.55 });
    ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.arc(ex, ey, 12.6, 0, TAU); ctx.fill();
    const g = ctx.createRadialGradient(ex - 3, ey - 4, 1, ex, ey, 13); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(90,60,120,.28)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ex, ey, 12.6, 0, TAU); ctx.fill();
    const lk = st.look || [0.45, 0.05];
    const pr = st.trapped ? 8.2 : 7.4;
    drawEye(ctx, ex + lk[0] * 4, ey + lk[1] * 4, pr, { look: lk, lid: st.blink || 0, bounce: 0.25 });
    if (angry) drawBrow(ctx, ex, ey - 2, 12, 1, 1.05, '#3a1030');
    else if (st.trapped) drawBrow(ctx, ex, ey - 2, 12, -1, 0.9, '#6b4a14');
    // mouth with tiny teeth
    ctx.save(); ctx.translate(47, 3);
    ctx.strokeStyle = alpha(rB.deep, 0.9); ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-14, 7); ctx.quadraticCurveTo(-4, 14 + (st.trapped ? -4 : 0), 5, 4); ctx.stroke();
    ctx.fillStyle = '#fffaf0'; [-8, -3].forEach((x) => { ctx.beginPath(); ctx.moveTo(x - 2, 8); ctx.lineTo(x + 2, 8.6); ctx.lineTo(x + 0.6, 13); ctx.closePath(); ctx.fill(); });
    ctx.restore();
    if (angry) { drawAngerVein(ctx, -22, -30, 1.05); drawSteam(ctx, 0, -42, t, 36); }
    ctx.restore();
  });
}

/* ------------------------------------------------ CRABBIT -------------------------------------- */
function _claw(ctx, x, y, rot, s, rp, open = 1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
  // fingers form a C opening upward; palm at origin
  const fA = tubeShape(quad([-4, -2], [-16, -14], [-8, -30], 8), 20, 9);
  const fB = tubeShape(quad([4, -2], [20 * open, -10], [14 * open + 2, -26], 8), 17, 8);
  paint(ctx, fB, rp, { edgeA: 0.55, matte: true, rimA: 0.5 });
  paint(ctx, fA, rp, { edgeA: 0.55, matte: true, rimA: 0.5 });
  paint(ctx, ellShape(0, 2, 15, 13), rp, { edgeA: 0.55, matte: true, rimA: 0.5 });
  ctx.restore();
}
function drawCrabbit(ctx, st) {
  const t = st.t || 0, angry = !!st.angry;
  const base = angry ? '#e63a4e' : '#ff9248';
  const rB = ramp(base), rD = ramp(mix(base, '#5a2090', 0.16)), rBelly = ramp(angry ? '#ffa1a8' : '#ffd29b');
  const ph = t * 10 * (st.walk ?? 1);
  withEntity(ctx, st, 0.19, () => {
    ctx.rotate(0.05);
    const bob = -Math.abs(Math.sin(ph)) * 2.2;
    // legs
    [-30, -14, 10, 28].forEach((x, i) => {
      const p0 = ph + i * 1.6, lift = Math.max(0, Math.sin(p0)) * 5;
      drawTube(ctx, [[x, 26], [x + (x < 0 ? -3 : 3), 34 - lift], [x + (x < 0 ? -6 : 6), 41 - lift]], 11, 9, rD, { matte: true, hl: false, edgeA: 0.5 });
    });
    ctx.save(); ctx.translate(0, bob);
    // arms + claws (behind shell)
    const raise = angry ? 6 : 0;
    drawTube(ctx, quad([-34, 12], [-52, 8], [-50, -14 - raise], 8), 14, 11, rD, { matte: true, hl: false, edgeA: 0.5 });
    drawTube(ctx, quad([36, 12], [56, 8], [54, -12 - raise], 8), 15, 12, rD, { matte: true, hl: false, edgeA: 0.5 });
    const snap = (Math.sin(t * 5) * 0.5 + 0.5) * 0.35;
    _claw(ctx, -50, -22 - raise, -0.2, 0.85, rD, 0.8 + snap);
    _claw(ctx, 55, -20 - raise, 0.12, 1, rD, 0.9 + snap * 0.6);
    // eye stalks: bunny ears with eyeballs on top
    const ear = (x, lean, phase) => {
      const sw = Math.sin(t * 2.4 + phase) * 3;
      const tip = [x + lean + sw, -46];
      drawTube(ctx, quad([x, -10], [x + lean * 0.2 - 2, -28], tip, 8), 14, 11, rB, { matte: true, hlA: 0.28, edgeA: 0.5 });
      const ex = tip[0], ey = tip[1] - 3;
      paint(ctx, ellShape(ex, ey, 13.5, 13.5), ramp('#fffaf0'), { rim: 0.4, edgeA: 0.5, spec: false });
      const lk = st.look || [0.5, 0.05];
      drawEye(ctx, ex + lk[0] * 3, ey + lk[1] * 3, 8, { look: lk, lid: st.blink || 0, bounce: 0.2 });
      if (angry) drawBrow(ctx, ex, ey, 11, 1, 1, '#3a1030');
    };
    ear(-4, -4, 0); ear(15, 5, 1.7);
    // shell
    const shell = shape('M-42 16 C-42 -10 -20 -22 0 -22 C22 -22 44 -8 44 16 C44 34 24 40 0 40 C-26 40 -42 34 -42 16 Z', -43, -23, 88, 64);
    paint(ctx, shell, rB, { matte: true, edgeA: 0.55, rimA: 0.8 });
    ctx.save(); ctx.clip(shell.p);
    // clay texture: speckles + soft belly
    const r = seeded(7);
    for (let i = 0; i < 34; i++) { const x = r.float(-40, 42), y = r.float(-20, 38), rr = r.float(0.8, 1.9); ctx.fillStyle = alpha(i % 3 ? rB.dark : rB.hi, 0.2); ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill(); }
    spec(ctx, 6, 30, 40, 14, 0, 0.55, rBelly.light);
    ctx.restore();
    // face: mouth + blush on the facing side
    spec(ctx, 30, 14, 9, 5.5, 0, 0.55, angry ? '#ff2b4d' : '#ff5f7a');
    spec(ctx, -6, 14, 8, 5, 0, 0.35, angry ? '#ff2b4d' : '#ff5f7a');
    ctx.strokeStyle = alpha(rB.deep, 0.95); ctx.lineWidth = 2.8; ctx.lineCap = 'round';
    ctx.beginPath();
    if (angry) { ctx.moveTo(10, 24); ctx.quadraticCurveTo(18, 16, 28, 24); } else { ctx.moveTo(10, 14); ctx.quadraticCurveTo(19, 24, 28, 14); }
    ctx.stroke();
    if (st.throw) paint(ctx, ellShape(40, 6, 7, 7), ramp('#b9b3c9'), { edgeA: 0.5 });
    ctx.restore();
    if (angry) { drawAngerVein(ctx, -22, 4, 0.95); drawSteam(ctx, 4, -50, t, 44); }
  });
}

/* ------------------------------------------------ JELLOP --------------------------------------- */
function drawJellop(ctx, st) {
  const t = st.t || 0, angry = !!st.angry;
  const base = angry ? '#f03a78' : '#9a68ff';
  const rB = ramp(base), rT = ramp(angry ? '#ff6f9a' : '#a984ff');
  const pulse = Math.sin(t * 4.2);
  withEntity(ctx, st, 0.19, () => {
    ctx.translate(0, -2 + pulse * -2);
    // tentacles + oral arms (drawn first, bell is translucent)
    const tent = [[-28, 0, 40, 12, 3.6], [-10, 3, 44, 11, 2.6], [10, 3, 44, 11, 1.4], [28, 0, 40, 12, 0.3]];
    tent.forEach(([x0, y0, L, w0, ph], i) => {
      const pts = [];
      for (let j = 0; j < 12; j++) { const u = j / 11; pts.push([x0 + Math.sin(t * 3.4 + ph + u * 4.2) * (3 + u * 7) * (i % 2 ? -1 : 1), y0 + 6 + u * L]); }
      drawTube(ctx, pts, w0 * 0.8, 4.4, rT, { hl: false, edgeA: 0.35, alpha: 0.92, rimA: 0.5 });
      const e = pts[pts.length - 1];
      paint(ctx, ellShape(e[0], e[1] + 1, 3.6, 3.6), ramp(angry ? '#ffd1dc' : '#ecdcff'), { rim: 0.3, edgeA: 0.3, spec: false });
    });
    [[-7, 0], [8, 1.3]].forEach(([x0, ph]) => {
      const pts = [];
      for (let j = 0; j < 10; j++) { const u = j / 9; pts.push([x0 + Math.sin(t * 2.6 + ph + u * 5) * (4 + u * 5), 6 + u * 34]); }
      drawTube(ctx, pts, 15, 5, ramp(angry ? '#ff5f93' : '#b690ff'), { hl: false, edgeA: 0.35, alpha: 0.85 });
    });
    // bell
    ctx.save();
    ctx.scale(1 - pulse * 0.035, 1 + pulse * 0.05);
    const bell = shape('M-43 8 C-46 -28 -24 -52 0 -52 C24 -52 46 -28 43 8 C41 15 33 14 29 11 C24 18 15 14 10 11 C4 18 -4 16 -10 11 C-16 17 -25 14 -30 11 C-37 14 -42 13 -43 8 Z', -46, -52, 92, 70);
    ctx.globalAlpha *= 0.86;
    // jelly body: lighter core, saturated rim (fresnel-ish)
    const g = ctx.createRadialGradient(-6, -28, 3, 0, -16, 54);
    g.addColorStop(0, rB.hi); g.addColorStop(0.3, rB.light); g.addColorStop(0.7, rB.base); g.addColorStop(1, rB.dark);
    ctx.fillStyle = g; ctx.fill(bell.p);
    ctx.globalAlpha = 1;
    ctx.save(); ctx.clip(bell.p);
    // inner "organs": clover
    ctx.fillStyle = alpha(rB.hi, 0.42);
    [[-9, -22], [9, -22], [-9, -8], [9, -8]].forEach(([x, y]) => { ctx.beginPath(); ctx.ellipse(x * (JT.F < 0 ? 1 : 1), y, 8, 7, 0, 0, TAU); ctx.fill(); });
    // underside glow
    const rg = ctx.createLinearGradient(0, -6, 0, 14);
    rg.addColorStop(0, alpha(rB.rim, 0)); rg.addColorStop(1, alpha(rB.rim, 0.75));
    ctx.fillStyle = rg; ctx.fillRect(-50, -6, 100, 24);
    // scallop rim light
    ctx.strokeStyle = alpha(rB.rim, 0.8); ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.translate(0, -2.4); ctx.stroke(bell.p);
    ctx.restore();
    ctx.lineWidth = 0.9; ctx.strokeStyle = alpha(rB.deep, 0.45); ctx.stroke(bell.p);
    // window highlights
    const mf = JT.F < 0 ? -1 : 1;
    ctx.save(); ctx.translate(mf * -22, -33); ctx.rotate(-0.7 * mf);
    const hg = ctx.createLinearGradient(0, -9, 0, 9); hg.addColorStop(0, 'rgba(255,255,255,.95)'); hg.addColorStop(1, 'rgba(255,255,255,.3)');
    ctx.fillStyle = hg; ctx.beginPath(); ctx.ellipse(0, 0, 14, 5.6, 0, 0, TAU); ctx.fill(); ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.arc(mf * 31, -2, 3, 0, TAU); ctx.fill();
    // face
    const lk = st.look || [0.4, 0.1];
    drawEye(ctx, -9 + 5, -14, 8.2, { look: lk, lid: st.blink || 0 });
    drawEye(ctx, 15 + 5, -14, 8.2, { look: lk, lid: st.blink || 0 });
    if (angry) { drawBrow(ctx, -4, -14, 8.5, 1, 1, '#3a1030'); drawBrow(ctx, 20, -14, 8.5, 1, 1, '#3a1030'); }
    spec(ctx, -14, -2, 7, 4, 0, 0.5, '#ff7fb0'); spec(ctx, 28, -2, 7, 4, 0, 0.5, '#ff7fb0');
    ctx.strokeStyle = alpha(rB.deep, 0.95); ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.beginPath();
    if (angry) { ctx.moveTo(6, 6); ctx.quadraticCurveTo(11, 0, 16, 6); } else { ctx.moveTo(5, -1); ctx.quadraticCurveTo(10.5, 6, 16, -1); }
    ctx.stroke();
    ctx.restore();
    if (angry) { drawAngerVein(ctx, -28, -38, 0.95); drawSteam(ctx, 4, -50, t, 44); }
  });
}
/* ------------------------------------------------ SPRINGLE (seahorse on a spring) -------------- */
/** A real helix spring seen from the side: back half darker + behind, front half bright + diagonal. */
function drawHelix(ctx, x, yBot, yTop, turns, rx, ry, wire, rp) {
  const N = Math.round(turns * 28), pts = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, s = u * turns * TAU - Math.PI * 0.5;
    pts.push({ x: x + Math.cos(s) * rx, y: yBot + (yTop - yBot) * u + Math.sin(s) * ry, front: Math.sin(s) > 0 });
  }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const front of [false, true]) {
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i < pts.length; i++) {
        const q = pts[i];
        if (q.front !== front) { pen = false; continue; }
        if (!pen) { ctx.moveTo(q.x, q.y); pen = true; } else ctx.lineTo(q.x, q.y);
      }
      if (pass === 0) { ctx.lineWidth = wire + 1.4; ctx.strokeStyle = alpha(rp.deep, front ? 0.95 : 0.7); }
      else { ctx.lineWidth = front ? wire : wire * 0.8; ctx.strokeStyle = front ? rp.light : rp.dark; }
      ctx.stroke();
    }
    if (front) {   // glint along the front strokes
      ctx.beginPath(); let pen = false;
      for (const q of pts) { if (!q.front) { pen = false; continue; } if (!pen) { ctx.moveTo(q.x, q.y - wire * 0.2); pen = true; } else ctx.lineTo(q.x, q.y - wire * 0.2); }
      ctx.lineWidth = wire * 0.28; ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.stroke();
    }
  }
}
function drawSpringle(ctx, st) {
  const t = st.t || 0, angry = !!st.angry;
  const base = angry ? '#ff4f66' : '#4fd682';
  const rB = ramp(base), rBelly = ramp(angry ? '#ffc0c8' : '#d6fbe0'), rCrest = ramp(angry ? '#7d2a56' : '#ffd45c'), rSpring = ramp(angry ? '#c9b3e8' : '#ffd23f');
  const hop = st.hop ?? (Math.sin(t * 6) * 0.5 + 0.5);          // 0 compressed .. 1 extended
  const squash = st.squash ?? (1 - hop);
  withEntity(ctx, st, 0.19, () => {
    const sTop = 14 + squash * 12;
    paint(ctx, rrShape(-15, 40, 30, 8, 4), rSpring, { rim: 0.4, edgeA: 0.5, spec: false });
    drawHelix(ctx, 0, 41, sTop, 2.6 + squash * 0.4, 14 + squash * 3, 6 + squash * 1.5, 5, rSpring);
    ctx.save(); ctx.translate(0, squash * 12 - hop * 2);
    // dorsal fin: translucent fan on the back
    ctx.save(); ctx.globalAlpha = 0.92;
    paint(ctx, shape('M-6 4 C-34 6 -40 -24 -30 -44 C-22 -30 -14 -24 -8 -22 Z', -38, -44, 34, 50), rCrest, { edgeA: 0.5, spec: false, rim: 0.4 });
    ctx.strokeStyle = alpha(rCrest.deep, 0.35); ctx.lineWidth = 1.2; ctx.lineCap = 'round';
    [[-8, -2, -30, -30], [-8, -8, -26, -18], [-8, 0, -30, -4]].forEach(([a0, b0, a1, b1]) => { ctx.beginPath(); ctx.moveTo(a0, b0); ctx.lineTo(a1, b1); ctx.stroke(); });
    ctx.restore();
    // one continuous S-curve body: tail root -> pot belly (bulges forward) -> neck bending back
    const spine = cubic([0, 16], [26, 2], [20, -30], [-6, -42], 18);
    const wf = (u) => 17 + 25 * Math.sin(Math.PI * Math.min(1, u * 1.25)) ** 1.2 - u * 3;
    drawTube(ctx, spine, wf, 0, rB, { hl: false, edgeA: 0.55 });
    // belly rings (segmented seahorse plates) clipped to the body
    const bodyShape = tubeShape(spine, wf, 0);
    ctx.save(); ctx.clip(bodyShape.p);
    ctx.strokeStyle = alpha(rBelly.base, 0.95); ctx.lineWidth = 3.1; ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const u = 0.1 + i * 0.13, q = spine[Math.round(u * 17)], w = wf(u) * 0.5;
      ctx.beginPath(); ctx.moveTo(q[0] - w * 0.1, q[1] - 1); ctx.quadraticCurveTo(q[0] + w * 0.55, q[1] + 5, q[0] + w * 0.95, q[1] - 1); ctx.stroke();
    }
    gloss(ctx, JT.F < 0 ? 22 : 4, -4, 12, 3.6, JT.F < 0 ? 1.2 : -1.2, 0.5);
    ctx.restore();
    // pectoral fin
    paint(ctx, shape('M8 -14 C-2 -18 -8 -4 2 4 C10 4 14 -6 8 -14 Z', -8, -18, 24, 24), rCrest, { edgeA: 0.5, spec: false, rim: 0.3 });
    // head tilted down-forward + long snout
    const bob = Math.sin(t * 6 + 1) * 1.2;
    ctx.save(); ctx.translate(0, bob);
    drawTube(ctx, [[2, -52], [16, -49], [38, -40]], 14, 9, rB, { hl: false, edgeA: 0.55 });
    paint(ctx, ellShape(39.5, -39.5, 6.4, 6), rB, { rim: 0.3, edgeA: 0.5, spec: false });
    ctx.fillStyle = alpha(rB.deep, 0.85); ctx.beginPath(); ctx.arc(41.5, -41.5, 1.3, 0, TAU); ctx.fill();
    paint(ctx, ellShape(-4, -52, 17.5, 15.5, 0.12), rB, { edgeA: 0.55, lx: 0.4 });
    [[-16, -62, 6], [-8, -68, 6.6], [2, -66, 5.4]].forEach(([x, y, r], i) => paint(ctx, ellShape(x, y, r, r), rCrest, { rim: 0.5, edgeA: 0.45, spec: i === 1 }));
    const lk = st.look || [0.5, 0.05];
    drawEye(ctx, 2, -55, 9, { look: lk, lid: st.blink || 0 });
    if (angry) drawBrow(ctx, 2, -55, 9.5, 1, 1, '#3a1030');
    spec(ctx, 12, -45, 6, 3.6, 0, 0.5, angry ? '#ff2b4d' : '#ff7fb0');
    ctx.strokeStyle = alpha(rB.deep, 0.9); ctx.lineWidth = 1.9; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(20, -44); ctx.quadraticCurveTo(26, -40, 33, -39); ctx.stroke();
    ctx.restore();
    if (angry) { drawAngerVein(ctx, -22, -62, 0.9); drawSteam(ctx, 0, -74, t, 40); }
    ctx.restore();
  });
}

/* ------------------------------------------------ GLIMMER (anglerfish) ------------------------- */
function drawGlimmer(ctx, st) {
  const t = st.t || 0, angry = !!st.angry;
  const base = angry ? '#e5365a' : '#3a67ff';
  const rB = ramp(base), rBelly = ramp(angry ? '#ff9db0' : '#6fd0ff'), rFin = ramp(angry ? '#b3203f' : '#2a4ed6');
  const lantern = angry ? '#ff8a3c' : '#ffe14d';
  const bob = Math.sin(t * 3) * 2;
  withEntity(ctx, st, 0.19, () => {
    ctx.translate(0, bob);
    // lantern stalk + glow (glow added later, on top, additive)
    const lx = 38 + Math.sin(t * 2.2) * 3, ly = -57 + Math.cos(t * 2.6) * 2;
    drawTube(ctx, quad([6, -36], [6, -66], [lx, ly + 4], 10), 6.5, 4, rFin, { hl: false, edgeA: 0.5 });
    // tail fin (fan, flaps)
    const fl = Math.sin(t * 6) * 0.2;
    ctx.save(); ctx.translate(-38, -2); ctx.rotate(fl);
    paint(ctx, shape('M6 0 L-24 -26 Q-34 0 -24 26 Z', -34, -26, 40, 52), rFin, { edgeA: 0.5, spec: false });
    ctx.strokeStyle = alpha(rFin.hi, 0.45); ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    [[-22, -16], [-28, 0], [-22, 16]].forEach(([x, y]) => { ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(x, y); ctx.stroke(); });
    ctx.restore();
    // dorsal fins
    paint(ctx, shape('M-26 -30 L-34 -50 L-14 -40 Z', -34, -50, 22, 20), rFin, { edgeA: 0.5, spec: false });
    paint(ctx, shape('M-10 -38 L-12 -56 L6 -40 Z', -12, -56, 18, 18), rFin, { edgeA: 0.5, spec: false });
    // body
    const body = shape('M-44 0 C-44 -32 -12 -44 16 -40 C44 -36 52 -12 48 6 C44 30 12 36 -14 32 C-34 28 -44 16 -44 0 Z', -45, -44, 96, 78);
    paint(ctx, body, rB, { edgeA: 0.55, lx: 0.4, ly: 0.2 });
    ctx.save(); ctx.clip(body.p);
    paint(ctx, ellShape(8, 34, 52, 17), rBelly, { rim: 0, spec: false, edge: false });
    // bioluminescent speckles
    const r = seeded(11);
    for (let i = 0; i < 16; i++) { ctx.fillStyle = alpha(angry ? '#ffd0d8' : '#a9c4ff', 0.6); ctx.beginPath(); ctx.arc(r.float(-38, 30), r.float(-34, 12), r.float(0.9, 2.2), 0, TAU); ctx.fill(); }
    ctx.restore();
    gloss(ctx, JT.F < 0 ? 12 : -16, -30, 14, 4.2, JT.F < 0 ? 0.35 : -0.35, 0.65);
    // pectoral fin
    paint(ctx, shape('M-8 2 C-6 -8 8 -6 14 4 C10 18 -6 16 -8 2 Z', -8, -8, 24, 26), rFin, { edgeA: 0.5, spec: false, rim: 0.4 });
    // mouth: dark cavity, teeth, lower jaw
    const jaw = Math.sin(t * 4) * 0.5 + 0.5;
    const mouth = shape('M20 2 C32 -6 52 -4 58 8 C52 24 34 28 20 22 Z', 20, -8, 40, 36);
    ctx.fillStyle = angry ? '#3a0a28' : '#27103f'; ctx.fill(mouth.p);
    ctx.save(); ctx.clip(mouth.p);
    ctx.fillStyle = '#ff6f93'; ctx.beginPath(); ctx.ellipse(38, 24, 14, 8, 0, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#fffaf0';
    [[26, 1], [33, -1], [40, -1], [47, 1], [53, 4]].forEach(([x, y]) => { ctx.beginPath(); ctx.moveTo(x - 3.3, y - 1); ctx.lineTo(x + 3.3, y - 1); ctx.lineTo(x, y + 8 + (x % 2) * 1.5); ctx.closePath(); ctx.fill(); });
    [[30, 21], [38, 22.5], [46, 20]].forEach(([x, y]) => { ctx.beginPath(); ctx.moveTo(x - 3, y + 2); ctx.lineTo(x + 3, y + 2); ctx.lineTo(x, y - 6); ctx.closePath(); ctx.fill(); });
    // upper lip over teeth
    ctx.strokeStyle = alpha(rB.deep, 0.9); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(20, 1); ctx.quadraticCurveTo(38, -8, 58, 7); ctx.stroke();
    // eye (big, with white of the eye)
    const ex = 16, ey = -16;
    paint(ctx, ellShape(ex, ey, 14.5, 14.5), ramp('#fffdf6'), { rim: 0.3, edgeA: 0.5, spec: false });
    const lk = st.look || [0.5, 0.1];
    drawEye(ctx, ex + lk[0] * 3.5, ey + lk[1] * 3.5, 8.6, { look: lk, lid: st.blink || 0, bounce: 0.2 });
    drawBrow(ctx, ex, ey + 1, 12.5, angry ? 1 : 0.55, 1, '#10153a');
    if (angry) drawAngerVein(ctx, -18, -30, 0.95);
    // lantern orb on top of everything
    const ro = ramp(lantern);
    glow(ctx, lx, ly, 40, lantern, 0.55);
    paint(ctx, ellShape(lx, ly, 10.5, 10.5), ro, { rim: 0.2, edge: false, spec: false, spread: 0.7 });
    ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.beginPath(); ctx.arc(lx - 1.5, ly - 1.5, 4.6, 0, TAU); ctx.fill();
    glow(ctx, lx, ly, 17, '#ffffff', 0.7);
  });
}

/* ------------------------------------------------ BONEFIN (skeletal ghost fish) ---------------- */
function drawBonefin(ctx, st) {
  const t = st.t || 0;
  const bone = ramp('#f2eeff');
  withEntity(ctx, st, 0.19, () => {
    const bob = Math.sin(t * 2.4) * 3;
    ctx.translate(0, bob - 2);
    // ghost aura
    glow(ctx, 0, -2, 62, '#9ad8ff', 0.35);
    // translucent ghost body: lilac-cyan gel with a wavy trail
    const wob = (u) => Math.sin(t * 4 + u * 5) * 5;
    const gb = new Path2D();
    gb.moveTo(30, -26);
    gb.bezierCurveTo(10, -44, -30, -36, -58, -20 + wob(1));
    gb.bezierCurveTo(-68, -8, -70, 6 + wob(2), -60, 18 + wob(3));
    gb.bezierCurveTo(-34, 32, 6, 36, 30, 20);
    gb.bezierCurveTo(46, 12, 46, -18, 30, -26);
    gb.closePath();
    const gg = ctx.createLinearGradient(0, -40, 0, 36);
    gg.addColorStop(0, 'rgba(150,170,255,.78)'); gg.addColorStop(1, 'rgba(150,110,255,.45)');
    ctx.fillStyle = gg; ctx.fill(gb);
    ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(96,92,214,.85)'; ctx.stroke(gb);
    ctx.save(); ctx.clip(gb);
    const rg = ctx.createLinearGradient(0, -4, 0, 36); rg.addColorStop(0, 'rgba(120,230,255,0)'); rg.addColorStop(1, 'rgba(120,230,255,.55)'); ctx.fillStyle = rg; ctx.fillRect(-80, -4, 140, 50);
    ctx.restore();
    // tail rays + fin rim
    const tailX = -52;
    ctx.lineCap = 'round'; ctx.strokeStyle = bone.base; ctx.lineWidth = 3.6;
    for (let i = -3; i <= 3; i++) {
      const sw = Math.sin(t * 4 + i * 0.35) * 3;
      ctx.beginPath(); ctx.moveTo(tailX + 2, -2); ctx.lineTo(tailX - 22 + Math.abs(i) * -1.5, i * 9 - 2 + sw); ctx.stroke();
    }
    ctx.strokeStyle = alpha(bone.dark, 0.7); ctx.lineWidth = 2;
    ctx.beginPath(); for (let i = -3; i <= 3; i++) { const sw = Math.sin(t * 4 + i * 0.35) * 3; const X = tailX - 22 + Math.abs(i) * -1.5, Y = i * 9 - 2 + sw; i === -3 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y); } ctx.stroke();
    // dorsal rays
    ctx.strokeStyle = bone.base; ctx.lineWidth = 3.2;
    [-16, -6, 4, 14].forEach((x, i) => { ctx.beginPath(); ctx.moveTo(x, -22 - Math.abs(x) * 0.05); ctx.lineTo(x - 6, -42 + i * 2); ctx.stroke(); });
    // spine beads along a wave + ribs
    for (let i = 0; i < 8; i++) {
      const u = i / 7, x = 12 - u * 62, y = -2 + Math.sin(t * 4 + u * 4) * 3 * u, r = 6 - u * 2.6;
      if (i > 0 && i < 6) {
        ctx.strokeStyle = alpha(bone.dark, 0.9); ctx.lineWidth = 4.4;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - 3, y - 12 * (1 - u * 0.4), x + 4, y - 20 * (1 - u * 0.4)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - 3, y + 12 * (1 - u * 0.4), x + 4, y + 18 * (1 - u * 0.4)); ctx.stroke();
        ctx.strokeStyle = bone.base; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - 3, y - 12 * (1 - u * 0.4), x + 4, y - 20 * (1 - u * 0.4)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - 3, y + 12 * (1 - u * 0.4), x + 4, y + 18 * (1 - u * 0.4)); ctx.stroke();
      }
      paint(ctx, ellShape(x, y, r, r * 1.1), bone, { rim: 0.4, edgeA: 0.45, spec: false });
    }
    // skull
    const sk = shape('M0 -22 C22 -36 52 -26 54 -2 C54 14 40 24 22 22 C6 22 -6 14 -6 0 C-6 -10 -4 -16 0 -22 Z', -8, -36, 64, 60);
    paint(ctx, sk, bone, { edgeA: 0.5, lx: 0.4, ly: 0.2 });
    // eye socket + glowing pupil
    const ex = 26, ey = -8;
    ctx.fillStyle = '#271b4a'; ctx.beginPath(); ctx.ellipse(ex, ey, 11.5, 12.5, -0.1, 0, TAU); ctx.fill();
    glow(ctx, ex + 3, ey + 1, 15, '#8dffb8', 0.8);
    ctx.fillStyle = '#d6ffe8'; ctx.beginPath(); ctx.arc(ex + 3, ey + 1, 4.4, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(ex, ey - 4, 2, 0, TAU); ctx.fill();
    // nose hole
    ctx.fillStyle = alpha(bone.deep, 0.85); ctx.beginPath(); ctx.ellipse(50, -8, 1.8, 3, 0.2, 0, TAU); ctx.fill();
    // jaw with teeth (slightly open, chatters)
    const jo = 3 + Math.sin(t * 5) * 1.6;
    ctx.save(); ctx.translate(0, jo);
    paint(ctx, shape('M10 12 C26 18 46 18 56 8 C54 24 36 32 18 28 C12 26 10 20 10 12 Z', 10, 8, 48, 26), bone, { edgeA: 0.5, spec: false });
    ctx.restore();
    ctx.fillStyle = '#fffdf8'; ctx.strokeStyle = alpha(bone.deep, 0.5); ctx.lineWidth = 0.8;
    for (let i = 0; i < 6; i++) { const x = 18 + i * 6.4; ctx.beginPath(); ctx.moveTo(x - 2.4, 14 + jo * 0.4); ctx.lineTo(x + 2.4, 14 + jo * 0.4); ctx.lineTo(x, 20 + jo * 0.7); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  });
}

/* ------------------------------------------------ KRAKEN KING ---------------------------------- */
function drawKraken(ctx, st) {
  const t = st.t || 0, angry = !!st.angry;
  const base = angry ? '#e0344f' : '#8d4ee0';
  const rB = ramp(base), rS = ramp(angry ? '#ff9aa8' : '#d3b6ff'), rGold = ramp('#ffc93a');
  withEntity(ctx, st, 0.5, () => {
    const bob = Math.sin(t * 2.2) * 2.5;
    ctx.translate(0, bob);
    // tentacles (8 -> 6 fat + 2 small), behind the mantle
    const T = [[-46, 6, 56, 0, -1], [-30, 14, 66, 1.2, -1], [-12, 18, 70, 2.1, -1], [12, 18, 70, 3.1, 1], [30, 14, 66, 4.0, 1], [46, 6, 56, 5.1, 1]];
    T.forEach(([x0, y0, L, ph, dir], i) => {
      const pts = [];
      for (let j = 0; j < 16; j++) {
        const u = j / 15;
        const curl = u * u * dir * 26;
        pts.push([x0 + dir * u * 14 + Math.sin(t * 2.4 + ph + u * 4) * (3 + u * 6) + curl * 0.6, y0 + 8 + u * L - Math.max(0, u - 0.8) * 60 * u]);
      }
      drawTube(ctx, pts, 26 - Math.abs(i - 2.5) * 0, 6, rB, { hl: false, edgeA: 0.5 });
      // suckers along the inside
      ctx.fillStyle = alpha(rS.base, 0.9);
      for (let j = 2; j < 13; j += 2) { const q = pts[j], r = 3.6 - j * 0.14; ctx.beginPath(); ctx.arc(q[0] + dir * -1, q[1], Math.max(1.2, r), 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.arc(q[0] - 1, q[1] - 1, Math.max(0.5, r * 0.35), 0, TAU); ctx.fill(); ctx.fillStyle = alpha(rS.base, 0.9); }
    });
    // mantle
    const mantle = shape('M-52 4 C-56 -40 -26 -72 0 -72 C26 -72 56 -40 52 4 C50 24 30 30 0 30 C-30 30 -50 24 -52 4 Z', -57, -73, 114, 104);
    paint(ctx, mantle, rB, { edgeA: 0.55, lx: 0.38, ly: 0.18 });
    ctx.save(); ctx.clip(mantle.p);
    const r = seeded(5);
    for (let i = 0; i < 22; i++) { const x = r.float(-48, 48), y = r.float(-62, 14), rr = r.float(1.6, 4.4); ctx.fillStyle = alpha(rB.hi, 0.28); ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill(); }
    ctx.restore();
    gloss(ctx, JT.F < 0 ? 26 : -26, -52, 20, 6, JT.F < 0 ? 0.5 : -0.5, 0.6);
    // face
    spec(ctx, -30, 8, 11, 6, 0, 0.5, '#ff7fb0'); spec(ctx, 36, 8, 11, 6, 0, 0.5, '#ff7fb0');
    [-20, 24].forEach((x) => {
      paint(ctx, ellShape(x, -16, 16, 16), ramp('#ffe9a8'), { rim: 0.3, edgeA: 0.5, spec: false });
      drawEye(ctx, x + 4, -16, 10, { look: [0.5, 0.1], bounce: 0.2 });
    });
    ctx.strokeStyle = '#2a0f3a'; ctx.lineCap = 'round'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(-36, -38); ctx.lineTo(-8, -29); ctx.stroke(); ctx.beginPath(); ctx.moveTo(40, -38); ctx.lineTo(12, -29); ctx.stroke();
    ctx.strokeStyle = alpha(rB.deep, 0.95); ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-14, 14); ctx.quadraticCurveTo(2, 6, 18, 14); ctx.stroke();
    ctx.fillStyle = '#fffaf0'; [[-8, 11], [10, 11]].forEach(([x, y]) => { ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.lineTo(x + 3, y); ctx.lineTo(x, y + 8); ctx.closePath(); ctx.fill(); });
    // crown
    ctx.save(); ctx.translate(0, -66);
    const crown = shape('M-30 4 L-36 -26 L-17 -12 L0 -34 L17 -12 L36 -26 L30 4 Q0 12 -30 4 Z', -37, -35, 74, 46);
    paint(ctx, crown, rGold, { edgeA: 0.55, lx: 0.4 });
    ctx.strokeStyle = alpha(rGold.deep, 0.5); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-30, -4); ctx.quadraticCurveTo(0, 4, 30, -4); ctx.stroke();
    [['#ff4d7d', -36, -28], ['#4fe3ff', 0, -36], ['#ff4d7d', 36, -28]].forEach(([c, x, y]) => { paint(ctx, ellShape(x, y, 5, 5), ramp(c), { rim: 0.4, edgeA: 0.5 }); });
    [['#7fe3b0', -14, -2], ['#a98bff', 0, 0], ['#7fe3b0', 14, -2]].forEach(([c, x, y]) => { paint(ctx, ellShape(x, y, 4.2, 4.2), ramp(c), { rim: 0.4, edgeA: 0.5 }); });
    ctx.restore();
    if (angry) { drawAngerVein(ctx, 38, -46, 1.2); drawSteam(ctx, 0, -78, t, 66); }
  });
}
/* ===================================================================================================
 * 06 BUBBLES & ITEMS
 *  drawBubble(ctx, x, y, r, {kind, stage, t, seed, inside, warn})
 *    real soap bubble: mostly transparent body, milky fresnel edge, thin-film iridescent rim (conic
 *    cyan -> lilac -> magenta -> gold sweep), thin dark contour (readable on bright water), a window
 *    crescent top-left and a small counter-glint bottom-right. Contents (enemy / icon) are drawn
 *    BEHIND the film so they look enclosed. kind: empty | trap | thunder | fire | water | letter
 *    stage 0/1/2 (aqua / yellow warning / red) tints the trapped bubble.
 * ================================================================================================= */
const FILM = [[0, '#7af6ff'], [0.16, '#b9a4ff'], [0.32, '#ff8fe4'], [0.48, '#ffe48a'], [0.64, '#a7ffd0'], [0.82, '#6fd6ff'], [1, '#7af6ff']];

function sparkle(ctx, x, y, r, rot = 0, color = '#ffffff', a = 1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha *= a;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const A = (i * Math.PI) / 2;
    const c = Math.cos(A), s = Math.sin(A);
    if (i === 0) ctx.moveTo(c * r, s * r);
    ctx.quadraticCurveTo(Math.cos(A + Math.PI / 4) * r * 0.22, Math.sin(A + Math.PI / 4) * r * 0.22, Math.cos(A + Math.PI / 2) * r, Math.sin(A + Math.PI / 2) * r);
  }
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function _boltPath() { return new Path2D('M3.5 -11 L-5.5 1.2 L-0.6 1.2 L-3.8 11 L6.4 -2.2 L1.2 -2.2 L4.8 -11 Z'); }
function _flamePath() { return new Path2D('M0.5 -11 C3.5 -6.5 8.5 -3 8.5 3 C8.5 8 4.8 11 0 11 C-4.8 11 -8.5 8 -8.5 3 C-8.5 -0.5 -6 -3 -3.2 -6 C-2.5 -3.5 -1 -3 -0.5 -4.5 C-0.2 -6.5 -0.4 -8.5 0.5 -11 Z'); }
function _dropPath() { return new Path2D('M0 -11.5 C4.8 -4.5 8.2 -1 8.2 3.6 C8.2 8.4 4.6 11.2 0 11.2 C-4.6 11.2 -8.2 8.4 -8.2 3.6 C-8.2 -1 -4.8 -4.5 0 -11.5 Z'); }

/** Glossy jelly icons for special bubbles (icon design box ~ 22x22, centred). */
function drawSpecialIcon(ctx, kind, t = 0, s = 1) {
  ctx.save(); ctx.scale(s, s);
  if (kind === 'thunder') {
    glow(ctx, 0, 0, 15, '#fff08a', 0.8);
    const sh = shape(_boltPath(), -6, -11, 13, 22);
    paint(ctx, sh, ramp('#ffd23a'), { rim: 0.3, edgeA: 0.65, edgeW: 0.8, spec: false });
    ctx.save(); ctx.clip(sh.p); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(-7, -12, 7, 8); ctx.restore();
    ctx.strokeStyle = '#bff6ff'; ctx.lineWidth = 0.9; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) { const a = t * 4 + i * 2.1; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 9, Math.sin(a) * 9); ctx.lineTo(Math.cos(a + 0.15) * 11.5, Math.sin(a + 0.15) * 11.5); ctx.lineTo(Math.cos(a - 0.1) * 13.5, Math.sin(a - 0.1) * 13.5); ctx.stroke(); }
  } else if (kind === 'fire') {
    glow(ctx, 0, 2, 15, '#ff8a3a', 0.7);
    const sh = shape(_flamePath(), -8.5, -11, 17, 22);
    const fl = 1 + Math.sin(t * 9) * 0.04;
    ctx.save(); ctx.scale(1, fl);
    paint(ctx, sh, ramp('#ff6a2a'), { rim: 0.35, edgeA: 0.7, edgeW: 0.8, spec: false });
    ctx.save(); ctx.translate(0, 4.2); ctx.scale(0.55, 0.58);
    paint(ctx, shape(_flamePath(), -8.5, -11, 17, 22), ramp('#ffd84a'), { rim: 0.2, edge: false, spec: false });
    ctx.restore(); ctx.restore();
    gloss(ctx, -3.6, -2.5, 1.6, 3.2, 0.3, 0.7);
  } else {   // water
    glow(ctx, 0, 2, 15, '#4fb8ff', 0.6);
    const sh = shape(_dropPath(), -8.2, -11.5, 16.4, 22.7);
    paint(ctx, sh, ramp('#2f8cff'), { rim: 0.6, edgeA: 0.7, edgeW: 0.8, spec: false });
    gloss(ctx, -3.2, 0, 1.7, 4.2, 0.18, 0.85);
    ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.arc(3, 6, 1, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawBubble(ctx, x, y, r, o = {}) {
  const t = o.t || 0, kind = o.kind || 'empty', seed = o.seed || 0;
  const wb = Math.sin(t * 3.2 + seed * 1.7) * 0.04 * (o.wobble ?? 1);
  const stage = o.stage || 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1 + wb, 1 - wb);
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;

  // tint palette
  let tint = null, rimTint = null, tintA = 0.0;
  if (kind === 'trap') {
    if (stage === 1) { tint = '#ffd84a'; rimTint = '#ffcb2e'; tintA = 0.5; }
    else if (stage === 2) { tint = '#ff5668'; rimTint = '#ff3f58'; tintA = 0.5; }
    else { tint = '#6ff0ff'; rimTint = null; tintA = 0.22; }
  } else if (kind === 'thunder') { tint = '#ffe66a'; tintA = 0.38; }
  else if (kind === 'fire') { tint = '#ff9a4a'; tintA = 0.42; }
  else if (kind === 'water') { tint = '#58b4ff'; tintA = 0.42; }
  else if (kind === 'letter') { tint = o.tint || '#a98bff'; tintA = 0.5; }
  if (o.warn) { tint = '#ff6f7e'; tintA = 0.35 + 0.2 * Math.sin(t * 18); }

  // warning halo is a RING that hugs the film (never over the water seen through the bubble, so the
  // gold enemy inside keeps its contrast); it pulses faster at stage 2
  if (kind === 'trap' && stage > 0) {
    const a = 0.5 + 0.22 * Math.sin(t * (stage === 2 ? 12 : 6));
    const hc = stage === 2 ? '#ff3b57' : '#ffa81f';
    ctx.save();
    const hg = ctx.createRadialGradient(0, 0, r * 0.82, 0, 0, r * 1.7);
    hg.addColorStop(0, alpha(hc, 0)); hg.addColorStop(0.24, alpha(hc, a * 0.75)); hg.addColorStop(0.5, alpha(hc, a * 0.24)); hg.addColorStop(1, alpha(hc, 0));
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(0, 0, r * 1.7, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // contents behind the film: slightly magnified (refraction) and squirming
  if (kind === 'trap' && o.inside) {
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r * 0.97, 0, TAU); ctx.clip();
    const bk = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r * 0.95);
    bk.addColorStop(0, 'rgba(18,70,150,.34)'); bk.addColorStop(0.7, 'rgba(18,70,150,.18)'); bk.addColorStop(1, 'rgba(18,70,150,0)');
    ctx.fillStyle = bk; ctx.fillRect(-r, -r, r * 2, r * 2);
    softShadow(ctx, 0, r * 0.62, r * 0.55, r * 0.14, 0.2);
    const sq = Math.sin(t * 7.3 + seed) * 0.035 * (1 + stage * 0.6);
    ctx.rotate(Math.sin(t * 4.6 + seed * 1.9) * 0.07 * (1 + stage * 0.5));
    ctx.scale(1.05 + sq, 1.05 - sq);
    o.inside(ctx);
    ctx.restore();
  }

  // body fill: transparent centre, milky fresnel edge
  const g = ctx.createRadialGradient(-r * 0.2, -r * 0.28, r * 0.1, 0, 0, r * 1.02);
  g.addColorStop(0, 'rgba(235,255,255,0.12)');
  g.addColorStop(0.6, 'rgba(190,246,255,0.16)');
  g.addColorStop(0.88, 'rgba(165,238,255,0.38)');
  g.addColorStop(1, 'rgba(240,255,255,0.72)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  if (tint) {
    const solid = kind === 'thunder' || kind === 'fire' || kind === 'water' || kind === 'letter';
    const tg = ctx.createRadialGradient(0, 0, r * 0.15, 0, 0, r);
    // enemies stay readable: the warning colour lives on the film (fresnel edge), not over the body
    tg.addColorStop(0, alpha(tint, solid ? tintA * 0.3 : tintA * 0.04));
    tg.addColorStop(0.7, alpha(tint, solid ? tintA * 0.75 : tintA * 0.32));
    tg.addColorStop(1, alpha(tint, Math.min(1, tintA * (solid ? 1.3 : 1.5))));
    ctx.fillStyle = tg; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  }
  // vivid icon sits inside the film, in front of the body tint
  if (kind === 'thunder' || kind === 'fire' || kind === 'water') drawSpecialIcon(ctx, kind, t, r / 11.5 * 0.9);
  else if (kind === 'letter' && o.draw) o.draw(ctx);
  // soft blue ring just inside the rim (gives the bubble body against bright water)
  ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.clip();
  ctx.lineWidth = r * 0.28; ctx.strokeStyle = 'rgba(22,86,176,.36)'; ctx.beginPath(); ctx.arc(0, 0, r * 1.02, 0, TAU); ctx.stroke();
  // light caught on the lower inner rim (rim light from below)
  const bl = ctx.createLinearGradient(0, r * 0.2, 0, r);
  bl.addColorStop(0, 'rgba(120,240,255,0)'); bl.addColorStop(1, 'rgba(140,245,255,.55)');
  ctx.strokeStyle = bl; ctx.lineWidth = r * 0.2; ctx.beginPath(); ctx.arc(0, -r * 0.04, r * 0.98, 0, TAU); ctx.stroke();
  ctx.restore();

  // thin-film, part 1: a wide soft iridescent band (fresnel sheen) sweeping cyan->lilac->magenta->gold
  const rot = t * 0.5 + seed * 2.3;
  const useF = rimTint ? [[0, rimTint], [0.25, '#fff6c8'], [0.5, rimTint], [0.75, '#ffffff'], [1, rimTint]] : FILM;
  const cgW = ctx.createConicGradient(rot + 0.6, 0, 0);
  useF.forEach(([p, c]) => cgW.addColorStop(p, c));
  const gA = ctx.globalAlpha;
  ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.clip();
  ctx.globalAlpha = gA * 0.46; ctx.strokeStyle = cgW; ctx.lineWidth = r * 0.34;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.99, 0, TAU); ctx.stroke();
  // thin-film, part 2: the DRAINED film. Gravity pulls the soap down, so coloured interference bands pool in
  // the lower half and creep sideways (magenta -> gold -> cyan -> green), with a fainter echo upper right.
  const slide = Math.sin(t * 0.7 + seed * 1.3) * 0.04;
  const band = (rr, w, a0, stops, al) => {
    const cg2 = ctx.createConicGradient(0, 0, 0);
    stops.forEach(([p, c]) => cg2.addColorStop(clamp(p + slide, 0, 1), c));
    ctx.globalAlpha = gA * al; ctx.strokeStyle = cg2; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke();
  };
  const inK = (kind === 'trap' && o.inside) ? 0.4 : 1;   // keep the enemy's feet clean: weaker interior bands when something is trapped
  band(r * 0.79, r * 0.13, 0, [[0, 'rgba(255,120,220,0)'], [0.05, 'rgba(255,120,220,0)'], [0.12, '#ff7fe0'], [0.2, '#ffe27a'], [0.3, '#7af0ff'], [0.38, '#8dffc0'], [0.45, 'rgba(140,255,200,0)'], [1, 'rgba(140,255,200,0)']], 0.8 * inK);
  band(r * 0.66, r * 0.07, 0, [[0, 'rgba(120,200,255,0)'], [0.1, 'rgba(120,200,255,0)'], [0.18, '#b49bff'], [0.27, '#ff9ae6'], [0.36, '#ffe9a0'], [0.42, 'rgba(255,233,160,0)'], [1, 'rgba(255,233,160,0)']], 0.5 * inK);
  band(r * 0.84, r * 0.07, 0, [[0, 'rgba(120,255,220,0)'], [0.84, 'rgba(120,255,220,0)'], [0.89, '#8dffd8'], [0.94, '#c9a8ff'], [0.98, 'rgba(255,150,220,0)'], [1, 'rgba(255,150,220,0)']], 0.6);
  ctx.restore();
  // thin crisp rim (the interference ring on the very edge)
  const cg = ctx.createConicGradient(rot, 0, 0);
  useF.forEach(([p, c]) => cg.addColorStop(p, c));
  ctx.globalAlpha = gA * 0.95;
  ctx.strokeStyle = cg; ctx.lineWidth = Math.max(0.6, r * 0.085);
  ctx.beginPath(); ctx.arc(0, 0, r - r * 0.05, 0, TAU); ctx.stroke();
  // bright inner edge (film thickness) + soft outer contour (kept faint: only there for bright water)
  ctx.globalAlpha = gA * 0.55; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(0.3, r * 0.03);
  ctx.beginPath(); ctx.arc(0, 0, r * 0.9, 0, TAU); ctx.stroke();
  ctx.globalAlpha = gA;
  ctx.strokeStyle = 'rgba(20,58,128,.5)'; ctx.lineWidth = Math.max(0.3, r * 0.04);
  ctx.beginPath(); ctx.arc(0, 0, r + r * 0.005, 0, TAU); ctx.stroke();

  // window crescent (top-left, tapered) + a second, smaller reflection bottom-right (the classic two-window soap bubble)
  {
    const crescent = (R, a0, a1, th, alphaMax) => {
      const am = (a0 + a1) / 2;
      const P0 = [Math.cos(a0) * R, Math.sin(a0) * R], P1 = [Math.cos(a1) * R, Math.sin(a1) * R];
      const M = [(P0[0] + P1[0]) / 2, (P0[1] + P1[1]) / 2], um = [Math.cos(am), Math.sin(am)];
      const C = [2 * (R - th) * um[0] - M[0], 2 * (R - th) * um[1] - M[1]];
      const cg3 = ctx.createLinearGradient(P0[0], P0[1], P1[0], P1[1]);
      cg3.addColorStop(0, `rgba(255,255,255,${alphaMax * 0.55})`); cg3.addColorStop(0.5, `rgba(255,255,255,${alphaMax})`); cg3.addColorStop(1, `rgba(255,255,255,${alphaMax * 0.7})`);
      ctx.fillStyle = cg3;
      ctx.beginPath(); ctx.moveTo(P0[0], P0[1]); ctx.arc(0, 0, R, a0, a1, false); ctx.quadraticCurveTo(C[0], C[1], P0[0], P0[1]); ctx.closePath(); ctx.fill();
    };
    crescent(r * 0.78, Math.PI * 1.07, Math.PI * 1.66, r * 0.14, 0.98);
    crescent(r * 0.8, Math.PI * 0.12, Math.PI * 0.4, r * 0.075, 0.6);
  }
  ctx.fillStyle = 'rgba(255,255,255,.8)';
  ctx.beginPath(); ctx.arc(r * 0.34, r * 0.66, r * 0.035, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(-r * 0.62, -r * 0.05, r * 0.03, 0, TAU); ctx.fill();
  ctx.restore();
}

/* ------------------------------------------------ FOOD & POWER-UPS ----------------------------- */
function drawSushi(ctx, x, y, t = 0, s = 1) {
  ctx.save(); ctx.translate(x, y + Math.sin(t * 3) * 0.6); ctx.scale(s, s);
  softShadow(ctx, 0, 8.4, 10.5, 2, 0.32);
  // sushi rice: a plump rounded block with grains
  const rice = rrShape(-10, -3.4, 20, 12.2, 5);
  paint(ctx, rice, ramp('#fff1d6'), { rim: 0.22, edgeA: 0.4, spec: false });
  ctx.save(); ctx.clip(rice.p);
  ctx.fillStyle = 'rgba(205,170,130,.4)';
  const r = seeded(3);
  for (let i = 0; i < 22; i++) { ctx.beginPath(); ctx.ellipse(r.float(-9, 9), r.float(2.4, 8), 0.95, 0.5, r.float(0, 3), 0, TAU); ctx.fill(); }
  ctx.restore();
  // salmon slab draped over the rice, overhanging both ends
  const top = shape('M-12.6 -0.4 C-12.6 -5.6 -6.4 -8 0 -7.6 C6.4 -8 12.6 -5.6 12.6 -0.4 C12.6 2.6 8 3.6 0 3.6 C-8 3.6 -12.6 2.6 -12.6 -0.4 Z', -12.6, -8, 25.2, 11.6);
  paint(ctx, top, ramp('#ff8556'), { rim: 0.5, edgeA: 0.55, lx: 0.3 });
  ctx.save(); ctx.clip(top.p);
  // marbling: pale fat lines following the dome
  ctx.strokeStyle = 'rgba(255,226,206,.85)'; ctx.lineWidth = 0.95; ctx.lineCap = 'round';
  [[-10.5, -2.2, -5, 2.8], [-8.5, -5.2, 2.2, 2.2], [-3, -7, 8, -0.8], [3.5, -7.4, 11.5, -3], [-11.5, 1.2, -7, 3]].forEach(([a0, b0, c0, d0]) => { ctx.beginPath(); ctx.moveTo(a0, b0); ctx.quadraticCurveTo((a0 + c0) / 2 + 1, (b0 + d0) / 2 - 2, c0, d0); ctx.stroke(); });
  ctx.restore();
  gloss(ctx, -6.2, -5, 3.6, 1.0, -0.3, 0.8);
  // nori belt: thin, hugging the dome (clipped to fish + rice so it never sticks out)
  const un = new Path2D(); un.addPath(rice.p); un.addPath(top.p);
  ctx.save(); ctx.clip(un);
  const ng = ctx.createLinearGradient(-1.4, 0, 1.4, 0);
  ng.addColorStop(0, '#4d7058'); ng.addColorStop(0.4, '#2c4a39'); ng.addColorStop(1, '#1e3428');
  ctx.fillStyle = ng; ctx.beginPath(); ctx.roundRect(-1.4, -12, 2.8, 24, 0.4); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(-0.9, -12, 0.45, 24);
  ctx.restore();
  sparkle(ctx, 11, -9, 2.8 + Math.sin(t * 5) * 0.8, t, '#fffbe0');
  sparkle(ctx, -12, -4, 1.8 + Math.sin(t * 5 + 2) * 0.6, -t, '#ffffff');
  sparkle(ctx, 5, -13, 1.4, t * 0.7, '#fff2a8');
  ctx.restore();
}

function drawHeart(ctx, x, y, t = 0, s = 1) {
  ctx.save(); ctx.translate(x, y + Math.sin(t * 3) * 0.7); ctx.scale(s, s);
  softShadow(ctx, 0, 9.5, 7, 1.7, 0.3);
  glow(ctx, 0, 0, 17, '#ff6f9c', 0.45);
  const sh = shape('M0 9.5 C-3 7 -11 2.5 -11 -3.2 C-11 -8 -7.4 -10 -4.8 -10 C-2.4 -10 -0.6 -8.6 0 -6.8 C0.6 -8.6 2.4 -10 4.8 -10 C7.4 -10 11 -8 11 -3.2 C11 2.5 3 7 0 9.5 Z', -11, -10, 22, 19.5);
  paint(ctx, sh, ramp('#ff3d6e'), { rim: 0.6, edgeA: 0.6, lx: 0.3, ly: 0.2 });
  gloss(ctx, -5.6, -5.4, 3.6, 1.7, -0.55, 0.9);
  sparkle(ctx, 10, -9, 2.6 + Math.sin(t * 5) * 0.7, t, '#fffbe0');
  sparkle(ctx, -11, 2, 1.7, -t, '#ffffff');
  ctx.restore();
}
function drawPearl(ctx, x, y, color = '#ff9ad0', t = 0, s = 1) {
  ctx.save(); ctx.translate(x, y + Math.sin(t * 3) * 0.7); ctx.scale(s, s);
  softShadow(ctx, 0, 9, 6.5, 1.6, 0.3);
  glow(ctx, 0, 0, 14, color, 0.5);
  paint(ctx, rrShape(-6, 5, 12, 5, 2.5), ramp('#ffd45c'), { rim: 0.3, edgeA: 0.5, spec: false });
  paint(ctx, ellShape(0, -1, 8, 8), ramp(color), { rim: 0.6, edgeA: 0.5 });
  gloss(ctx, -2.8, -4.2, 2.6, 1.3, -0.6, 0.9);
  sparkle(ctx, 8, -8, 2.2 + Math.sin(t * 5) * 0.6, t, '#ffffff');
  ctx.restore();
}

/** Score popup: puffy tube lettering with a deep-blue sticker outline, floats + wobbles. */
function drawPopup(ctx, str, x, y, h = 6.4, t = 0) {
  ctx.save();
  ctx.translate(x, y - Math.sin(t * 4) * 0.8);
  ctx.rotate(Math.sin(t * 3) * 0.04);
  drawText(ctx, str, 0, h / 2, h, { align: 'center', style: 'tube', weight: 0.3, colors: ['#ffd23f'], outline: { c: '#2a2f6e', w: h * 0.12 }, shadow: { dy: h * 0.18, c: 'rgba(20,40,110,.35)' } });
  ctx.restore();
}
/* ===================================================================================================
 * 07 WORLD — level layer + background.
 *
 * buildLevelLayer(map, S): the real tile map (# = block) is traced into rounded outline loops
 * (marching along tile edges, convex corners rounded, concave corners filleted) and every solid is
 * shaded as a soft candy slab: cast shadow below, depth-tinted body, inner bevel (top-left light,
 * bottom-right shade, aqua rim from below), "frosting" cap on every walkable top edge, polyps.
 * It works for ANY of the 30 maps, is rendered once per level into a cached canvas (same strategy as the
 * current GFX.levelCanvas) and costs one drawImage per frame.
 *
 * drawBackground(ctx, t): sunny aquarium gradient, soft god-rays, blurred far/mid reef layers (cached,
 * tilt-shift feel), animated caustics (tileable texture scrolled twice), bokeh bubbles, marine snow.
 * ================================================================================================= */
const TILE = 8, MAP_Y = 16, COLS = 32, ROWS = 26, LW = 256, LH = 224;

const isFrameTile = (c, r) => c <= 1 || c >= COLS - 2 || r === 0 || r === ROWS - 1;

function traceLoops(solid, c0, c1, r0, r1) {
  const edges = new Map();
  const add = (x1, y1, x2, y2) => { const k = x1 + ',' + y1; if (!edges.has(k)) edges.set(k, []); edges.get(k).push([x2, y2]); };
  for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) {
    if (!solid(c, r)) continue;
    if (!solid(c, r - 1)) add(c, r, c + 1, r);
    if (!solid(c + 1, r)) add(c + 1, r, c + 1, r + 1);
    if (!solid(c, r + 1)) add(c + 1, r + 1, c, r + 1);
    if (!solid(c - 1, r)) add(c, r + 1, c, r);
  }
  const loops = [];
  while (edges.size) {
    const sk = edges.keys().next().value;
    const [sx, sy] = sk.split(',').map(Number);
    const loop = [[sx, sy]];
    let cx = sx, cy = sy, guard = 0, pdx = 0, pdy = 0;
    for (;;) {
      const k = cx + ',' + cy, list = edges.get(k);
      if (!list || !list.length) break;
      // at a pinch vertex prefer the right turn so diagonal tiles stay separate shapes
      let idx = 0;
      if (list.length > 1) {
        let best = -9;
        list.forEach((e, i) => { const dx = e[0] - cx, dy = e[1] - cy; const cr = pdx * dy - pdy * dx; if (cr > best) { best = cr; idx = i; } });
      }
      const [nx, ny] = list.splice(idx, 1)[0];
      if (!list.length) edges.delete(k);
      pdx = nx - cx; pdy = ny - cy;
      cx = nx; cy = ny;
      if (cx === sx && cy === sy) break;
      loop.push([cx, cy]);
      if (++guard > 5000) break;
    }
    // drop collinear points
    const out = [];
    for (let i = 0; i < loop.length; i++) {
      const a = loop[(i + loop.length - 1) % loop.length], b = loop[i], c = loop[(i + 1) % loop.length];
      if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) !== 0) out.push(b);
    }
    if (out.length >= 4) loops.push(out.map(([x, y]) => [x * TILE, MAP_Y + y * TILE]));
  }
  return loops;
}

/** Rounded polygon (solid on the right of travel => cross>0 = convex). */
function roundedLoopPath(p, pts, rC, rV) {
  const n = pts.length;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m0 = mid(pts[0], pts[1]);
  p.moveTo(m0[0], m0[1]);
  for (let i = 1; i <= n; i++) {
    const a = pts[(i - 1) % n], b = pts[i % n], c = pts[(i + 1) % n];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const r = Math.min(cross > 0 ? rC : rV, l1 / 2, l2 / 2);
    p.arcTo(b[0], b[1], c[0], c[1], r);
  }
  p.closePath();
  return p;
}

const MATS = {
  candy: {   // coral platforms: glossy candy (calm coral: the frosting carries the "walkable" cue, the body stays recessive)
    stops: ['#ffa391', '#f27f86', '#c4546f'], cap: ['#fff0dc', '#ffd2b4'], dark: [140, 40, 110], rim: [90, 235, 255],
    hi: 'rgba(255,246,230,.95)', gloss: 1, dots: ['#c4506c', '#ffc2bc'],
  },
  clay: {    // frame: warm sand-clay
    stops: ['#f7cf9f', '#e8a47d', '#c8766e'], cap: ['#fff2d6', '#fde0b0'], dark: [120, 50, 100], rim: [90, 225, 255],
    hi: 'rgba(255,244,222,.8)', gloss: 0.5, dots: ['#b4645f', '#ffe3bd'],
  },
};

function _innerShade(ctx, path, S, off, blur, color) {
  const big = new Path2D();
  big.rect(-3000, -3000, 6000, 6000);
  big.addPath(path);
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur * S;
  ctx.shadowOffsetX = off[0] * S;
  ctx.shadowOffsetY = off[1] * S;
  ctx.fillStyle = '#000';
  ctx.fill(big, 'evenodd');
  ctx.restore();
}

function _shadeSolids(ctx, S, loops, runs, mat, seed, o = {}) {
  if (!loops.length) return;
  const path = new Path2D();
  loops.forEach((lp) => roundedLoopPath(path, lp, o.rC ?? 5.5, o.rV ?? 3));
  // 1) cast shadows onto the water behind (soft, two layers: tight contact + wide ambient)
  ctx.save();
  ctx.fillStyle = '#10306a';
  ctx.shadowColor = 'rgba(16,44,110,.42)'; ctx.shadowBlur = 5 * S; ctx.shadowOffsetY = 2.8 * S; ctx.fill(path);
  ctx.shadowColor = 'rgba(16,44,110,.22)'; ctx.shadowBlur = 16 * S; ctx.shadowOffsetY = 9 * S; ctx.fill(path);
  ctx.restore();
  // 2) body, one vertical gradient per loop (so each slab has its own light->dark)
  const vr = seeded(seed * 7 + 3);
  loops.forEach((lp) => {
    const ys = lp.map((q) => q[1]);
    const y0 = Math.min(...ys), y1 = Math.max(...ys);
    const g = ctx.createLinearGradient(0, y0, 0, Math.max(y1, y0 + 16));
    // every slab drifts a little toward peach or toward bubblegum so the row of slabs has rhythm, not a stamped look
    const vt = o.vary ? vr.float(-1, 1) : 0, vc = vt > 0 ? '#ffb98a' : '#ff7fb0', va = Math.abs(vt) * (o.vary || 0);
    g.addColorStop(0, mix(mat.stops[0], vc, va)); g.addColorStop(0.5, mix(mat.stops[1], vc, va)); g.addColorStop(1, mix(mat.stops[2], vc, va));
    ctx.fillStyle = g;
    const p = roundedLoopPath(new Path2D(), lp, o.rC ?? 5.5, o.rV ?? 3);
    ctx.fill(p);
  });
  ctx.save();
  ctx.clip(path);
  // 3) bevel: dark underside / right side, aqua rim from below, warm highlight top-left
  const d = mat.dark;
  _innerShade(ctx, path, S, [-0.8, -3.0], 3.2, `rgba(${d[0]},${d[1]},${d[2]},.55)`);
  _innerShade(ctx, path, S, [0, -1.0], 0.9, `rgba(${mat.rim[0]},${mat.rim[1]},${mat.rim[2]},.7)`);
  _innerShade(ctx, path, S, [0.7, 1.5], 1.6, mat.hi);
  ctx.restore();
  // 4) frosting caps on walkable top edges + polyps
  ctx.save();
  ctx.clip(path);
  const rnd = seeded(seed);
  for (const [x0, x1, y] of runs) {
    const cap = new Path2D();
    cap.moveTo(x0, y - 2);
    cap.lineTo(x1, y - 2);
    cap.lineTo(x1, y + 2.6);
    // drippy underside, right to left
    let x = x1;
    while (x > x0) {
      const w = rnd.float(3.4, 6.2), dr = rnd.float(2.4, 4.6) * (o.drip ?? 1);
      const xn = Math.max(x0, x - w);
      cap.bezierCurveTo(x - w * 0.2, y + 2.6 + dr, xn + w * 0.2, y + 2.6 + dr, xn, y + 2.6);
      x = xn;
    }
    cap.closePath();
    const cg = ctx.createLinearGradient(0, y, 0, y + 6);
    cg.addColorStop(0, mat.cap[0]); cg.addColorStop(1, mat.cap[1]);
    ctx.save();
    ctx.shadowColor = 'rgba(150,40,90,.35)'; ctx.shadowBlur = 1.2 * S; ctx.shadowOffsetY = 0.9 * S;
    ctx.fillStyle = cg; ctx.fill(cap);
    ctx.restore();
    ctx.fillStyle = cg; ctx.fill(cap);
    // glossy streak on the cap
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.beginPath(); ctx.roundRect(x0 + 3, y + 0.35, Math.max(0, x1 - x0 - 6), 0.9, 0.45); ctx.fill();
  }
  // polyps: soft dimples with a lower-right catch light
  loops.forEach((lp) => {
    const xs = lp.map((q) => q[0]), ys = lp.map((q) => q[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    if (y1 - y0 > 40 && x1 - x0 > 40) return;       // big frame shapes get their own decoration
    const rows = Math.round((y1 - y0) / 16);
    for (let k = 0; k < rows; k++) {
      for (let x = x0 + 9; x < x1 - 7; x += rnd.float(6.5, 10)) {
        const y = y0 + 11.2 + k * 16 + rnd.float(-1.4, 1.8), r = rnd.float(0.9, 1.5);
        ctx.fillStyle = mat.dots[0]; ctx.globalAlpha = 0.34;
        ctx.beginPath(); ctx.ellipse(x, y, r * 1.15, r, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = mat.dots[1]; ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.ellipse(x + r * 0.3, y + r * 0.42, r * 0.7, r * 0.35, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  });
  ctx.restore();
}

/** Decorates the outer frame (clay): pebbles + shell spirals on the walls, sand speckle on the floor. */
function _frameDecor(ctx, S, loops) {
  const path = new Path2D();
  loops.forEach((lp) => roundedLoopPath(path, lp, 5.5, 3));
  ctx.save(); ctx.clip(path);
  const rnd = seeded(41);
  const pebble = (x, y, r, c) => {
    ctx.fillStyle = 'rgba(120,50,60,.30)'; ctx.beginPath(); ctx.ellipse(x, y + 0.2, r * 1.1, r, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x - 0.1, y - 0.15, r, r * 0.88, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.38, r * 0.4, r * 0.2, -0.5, 0, TAU); ctx.fill();
  };
  const cols = ['#ffe4c2', '#e9c1ff', '#b6f0dc', '#ffc9d2', '#fff2b8'];
  for (let i = 0; i < 34; i++) {
    const wall = i % 2 ? 1 : 0;
    const x = wall ? rnd.float(LW - 14.5, LW - 1.5) : rnd.float(1.5, 14.5);
    const y = rnd.float(18, 214);
    pebble(x, y, rnd.float(0.7, 1.4), cols[i % cols.length]);
  }
  for (let i = 0; i < 40; i++) pebble(rnd.float(2, LW - 2), rnd.float(219, 222.5), rnd.float(0.5, 1.0), cols[i % cols.length]);
  ctx.restore();
}

const _levelCache = {};
/** Renders the solid tiles of `map` into a transparent canvas (LW*S x LH*S). */
function buildLevelLayer(map, S, key = 0) {
  const ck = key + '@' + S;
  if (_levelCache[ck]) return _levelCache[ck];
  const cv = mkCanvas(LW * S, LH * S);
  const ctx = cv.getContext('2d');
  ctx.scale(S, S);
  const at = (c, r) => (c >= 0 && c < COLS && r >= 0 && r < ROWS && map[r][c] === '#');
  // virtual solid pad (left / right / below) so loops close off-screen; above stays open (HUD side)
  // pad: extend the real edge tiles one tile outward (off-screen) so loops close; open sides stay open
  const frameSolid = (c, r) => {
    if (r < 0 || c < -1 || c > COLS || r > ROWS) return false;
    return (at(clamp(c, 0, COLS - 1), clamp(r, 0, ROWS - 1)) && isFrameTile(clamp(c, 0, COLS - 1), clamp(r, 0, ROWS - 1)));
  };
  const platSolid = (c, r) => at(c, r) && !isFrameTile(c, r);
  const frameLoops = traceLoops(frameSolid, -1, COLS + 1, 0, ROWS + 1);
  const platLoops = traceLoops(platSolid, 0, COLS, 0, ROWS);
  const runs = (solid) => {
    const out = [];
    for (let r = 0; r < ROWS; r++) {
      let c = 0;
      while (c < COLS) {
        if (solid(c, r) && !solid(c, r - 1) && !(r - 1 < 0 ? false : false)) {
          let c1 = c; while (c1 + 1 < COLS && solid(c1 + 1, r) && !solid(c1 + 1, r - 1)) c1++;
          out.push([c * TILE, (c1 + 1) * TILE, MAP_Y + r * TILE]); c = c1 + 1;
        } else c++;
      }
    }
    return out;
  };
  const frameRuns = runs(frameSolid);
  _shadeSolids(ctx, S, frameLoops, frameRuns, MATS.clay, 101, { rC: 5.5, rV: 3.2, drip: 0.3 });
  _frameDecor(ctx, S, frameLoops);
  _shadeSolids(ctx, S, platLoops, runs(platSolid), MATS.candy, 202, { rC: 8, rV: 3, vary: 0.3 });
  // outline of every solid (logical px) so contact shadows can be clipped to the surfaces they fall on
  const sp = new Path2D();
  frameLoops.concat(platLoops).forEach((lp) => roundedLoopPath(sp, lp, 6, 3));
  cv.solidPath = sp;
  // twinkle spots: the left end of every platform cap (candy catches the light)
  cv.glints = runs(platSolid).filter(([x0, x1]) => x1 - x0 >= 24).map(([x0, x1, y], i) => [x0 + 7 + (i % 3) * 3, y + 0.2, i]);
  return (_levelCache[ck] = cv);
}

/** First solid surface below (x, y): returns y of the surface top or null. */
function surfaceBelow(map, x, y) {
  const c = clamp(Math.floor(x / TILE), 0, COLS - 1);
  for (let r = Math.max(0, Math.floor((y - MAP_Y) / TILE)); r < ROWS; r++) {
    if (map[r][c] === '#' && MAP_Y + r * TILE >= y - 0.5) return MAP_Y + r * TILE;
  }
  return null;
}

/* ------------------------------------------------ BACKGROUND ----------------------------------- */
function blurInto(dst, src, px, S) {
  // px = blur radius in LOGICAL px; ctx.filter where available, else a down/up-scale blur
  const d = dst.getContext('2d');
  if ('filter' in d) { d.save(); d.filter = `blur(${(px * S).toFixed(1)}px)`; d.drawImage(src, 0, 0); d.restore(); return; }
  const k = Math.max(2, Math.round(px * S / 2));
  const t = mkCanvas(src.width / k, src.height / k), tc = t.getContext('2d');
  tc.imageSmoothingQuality = 'high'; tc.drawImage(src, 0, 0, t.width, t.height);
  d.imageSmoothingQuality = 'high'; d.drawImage(t, 0, 0, src.width, src.height);
}

function _kelp(ctx, x, y0, h, w, ph, color, t = 0) {
  const pts = [];
  for (let i = 0; i < 14; i++) { const u = i / 13; pts.push([x + Math.sin(ph + u * 3.2 + t) * (3 + u * 6), y0 - u * h]); }
  const sh = tubeShape(pts, w, w * 0.25);
  ctx.fillStyle = color; ctx.fill(sh.p);
}
function _branchCoral(ctx, x, y, ang, len, w, depth, rnd, color) {
  ctx.lineCap = 'round'; ctx.strokeStyle = color; ctx.lineWidth = w;
  const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
  if (depth > 0) {
    _branchCoral(ctx, x2, y2, ang - rnd.float(0.35, 0.7), len * 0.74, w * 0.78, depth - 1, rnd, color);
    _branchCoral(ctx, x2, y2, ang + rnd.float(0.35, 0.7), len * 0.74, w * 0.78, depth - 1, rnd, color);
  } else { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x2, y2, w * 0.75, 0, TAU); ctx.fill(); }
}
function _towerSilhouette(ctx, cx, yBase, color) {
  // the Sunken Tower: stacked pill tiers, arched windows, tilted, crowned with a spire
  ctx.save();
  ctx.translate(cx, yBase); ctx.rotate(-0.045);
  ctx.fillStyle = color;
  const tiers = [[64, 34], [54, 30], [44, 28], [34, 26], [24, 22]];
  let y = 0;
  tiers.forEach(([w, h]) => {
    ctx.beginPath(); ctx.roundRect(-w / 2, y - h, w, h, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.roundRect(i * w * 0.24 - 3.6, y - h * 0.72, 7.2, h * 0.5, 3.6); ctx.fill(); }
    ctx.fillStyle = color;
    y -= h - 3;
  });
  ctx.beginPath(); ctx.moveTo(-9, y); ctx.quadraticCurveTo(-3, y - 26, 3, y - 44); ctx.quadraticCurveTo(7, y - 24, 9, y); ctx.closePath(); ctx.fill();
  ctx.restore();
}

let _bgCache = null;
function buildBackgroundStatic(S, variant = 'play') {
  const key = variant + '@' + S;
  if (_bgCache && _bgCache.key === key) return _bgCache.cv;
  const W = LW * S, H = LH * S;
  const cv = mkCanvas(W, H), ctx = cv.getContext('2d');
  ctx.save(); ctx.scale(S, S);
  // aquarium gradient: sunny mint-turquoise top -> luminous cerulean bottom (never murky: the deepest tone is still saturated)
  const g = ctx.createLinearGradient(0, 0, 0, LH);
  g.addColorStop(0, '#98f4e6'); g.addColorStop(0.08, '#56dfe2'); g.addColorStop(0.2, '#35c8e6'); g.addColorStop(0.5, '#25b0e6'); g.addColorStop(0.82, '#2283d8'); g.addColorStop(1, '#1f58b8');
  ctx.fillStyle = g; ctx.fillRect(0, 0, LW, LH);
  // the sun: a warm bloom top-left (the one light story: warm key from upper left, cool bounce from below)
  const sun = ctx.createRadialGradient(24, -18, 0, 24, -18, 190);
  sun.addColorStop(0, 'rgba(255,248,205,.95)'); sun.addColorStop(0.26, 'rgba(255,240,190,.24)'); sun.addColorStop(1, 'rgba(255,240,190,0)');
  ctx.fillStyle = sun; ctx.fillRect(0, 0, LW, LH);
  // cool bounce light pooling on the floor (aquamarine), opposite the warm key
  const bounce = ctx.createRadialGradient(150, 236, 0, 150, 236, 150);
  bounce.addColorStop(0, 'rgba(120,255,235,.38)'); bounce.addColorStop(1, 'rgba(120,255,235,0)');
  ctx.fillStyle = bounce; ctx.fillRect(0, 0, LW, LH);
  ctx.restore();

  // FAR layer: the Sunken Tower + domes + coral arches, pastel (lighter and cooler than the water: atmospheric
  // perspective), strongly blurred so the sharp plane (platforms, toys) is the only thing in focus
  const far = mkCanvas(W, H), fc = far.getContext('2d');
  fc.scale(S, S);
  fc.globalAlpha = 0.62;
  _towerSilhouette(fc, 134, 224, '#bfe8ff');
  fc.globalAlpha = 0.5;
  const rnd = seeded(77);
  [[16, 214, 32], [70, 222, 26], [198, 216, 36], [246, 220, 28], [104, 226, 22], [166, 226, 24]].forEach(([x, y, r], i) => {
    fc.fillStyle = i % 2 ? '#bcd8ff' : '#aef2e6';
    fc.beginPath(); fc.ellipse(x, y, r, r * 0.85, 0, Math.PI, TAU); fc.fill();
  });
  for (let i = 0; i < 7; i++) _branchCoral(fc, 30 + i * 33, 226, -Math.PI / 2 + rnd.float(-0.25, 0.25), 28, 7, 3, rnd, i % 2 ? '#c9b7ff' : '#9fe9de');
  fc.globalAlpha = 1;
  const farB = mkCanvas(W, H); blurInto(farB, far, 2.6, S);
  const c0 = cv.getContext('2d'); c0.globalAlpha = 0.95; c0.drawImage(farB, 0, 0); c0.globalAlpha = 1;

  // MID layer: kelp + finger coral in sea-glass teal / lilac (translucent, lightly blurred)
  const mid = mkCanvas(W, H), mc = mid.getContext('2d');
  mc.scale(S, S);
  mc.globalAlpha = 0.46;
  [[22, 226, 74, 10], [34, 226, 100, 8], [232, 226, 88, 10], [244, 226, 66, 8], [60, 226, 42, 7], [196, 226, 46, 7]].forEach(([x, y, h, w], i) => _kelp(mc, x, y, h, w, i * 1.3, i % 2 ? '#18b3b0' : '#2aa6dc'));
  const r2 = seeded(9);
  [[84, 226], [148, 226], [214, 226]].forEach(([x, y], i) => _branchCoral(mc, x, y, -Math.PI / 2 + r2.float(-0.3, 0.3), 22, 8, 3, r2, i === 1 ? '#8e7bf0' : '#2f9bdc'));
  mc.globalAlpha = 1;
  const midB = mkCanvas(W, H); blurInto(midB, mid, 1.2, S);
  c0.drawImage(midB, 0, 0);

  // soft vignette (gentle: it frames the diorama, it must not muddy it)
  c0.save(); c0.scale(S, S);
  const vg = c0.createRadialGradient(LW / 2, LH * 0.46, LH * 0.4, LW / 2, LH * 0.5, LW * 0.8);
  vg.addColorStop(0, 'rgba(10,50,130,0)'); vg.addColorStop(1, 'rgba(12,44,120,.24)');
  c0.fillStyle = vg; c0.fillRect(0, 0, LW, LH);
  c0.restore();
  _bgCache = { key, cv };
  return cv;
}

/** Live god rays: wide soft shafts slanting from the sun (top-left) down to the right, each gently swaying / breathing.
 *  Drawn behind the platforms (k = 1) and once more, much fainter, over everything (k ~ 0.3) so the light crosses the toys too. */
function drawGodRays(ctx, t, k = 1) {
  ctx.save();
  const rays = [[-30, 30, 0], [14, 22, 1.7], [58, 36, 3.1], [112, 26, 4.4], [160, 34, 5.2], [212, 24, 6.4]];
  rays.forEach(([x0, w, ph]) => {
    const sway = Math.sin(t * 0.32 + ph) * 5, br = 0.72 + 0.28 * Math.sin(t * 0.55 + ph * 1.7);
    const x = x0 + sway, dxs = 96;                         // slant (logical px over the full height)
    const gr = ctx.createLinearGradient(x, 0, x + dxs * 0.8, LH * 0.8);
    gr.addColorStop(0, `rgba(255,252,225,${0.32 * k * br})`); gr.addColorStop(0.55, `rgba(255,252,225,${0.1 * k * br})`); gr.addColorStop(1, 'rgba(255,252,225,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + w, 0); ctx.lineTo(x + w + dxs + w * 0.9, LH); ctx.lineTo(x + dxs, LH); ctx.closePath(); ctx.fill();
  });
  ctx.restore();
}

let _caustic = null;
function causticTexture() {
  if (_caustic) return _caustic;
  const N = 128, cv = mkCanvas(N, N), c = cv.getContext('2d'), id = c.createImageData(N, N);
  const T = 0.5 * 20 + 23, inten = 0.005;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N;
    const px = ((u * TAU) % TAU) - 250, py = ((v * TAU) % TAU) - 250;
    let ix = px, iy = py, cc = 1;
    for (let n = 0; n < 5; n++) {
      const t = T * (1 - 3.5 / (n + 1));
      ix = px + Math.cos(t - ix) + Math.sin(t + iy);
      iy = py + Math.sin(t - iy) + Math.cos(t + ix);
      cc += 1 / Math.hypot(px / (Math.sin(ix + t) / inten), py / (Math.cos(iy + t) / inten));
    }
    cc /= 5; cc = 1.17 - Math.pow(cc, 1.4);
    const col = Math.min(1, Math.pow(Math.abs(cc), 8));
    const i = (y * N + x) * 4;
    id.data[i] = 255; id.data[i + 1] = 255; id.data[i + 2] = 245; id.data[i + 3] = Math.round(col * 255);
  }
  c.putImageData(id, 0, 0);
  return (_caustic = cv);
}

let _cTmp = null;
/** Animated caustics: the tileable texture drawn twice at different scale/scroll, additive, fading with depth
 *  (sunlight dies off going down: strong under the surface, faint near the floor).
 *  Composited at HALF resolution (they are soft anyway) and upscaled once: ~4x cheaper than full-res. */
function drawCaustics(ctx, t, S, a = 0.22, fade = [1, 0.22]) {
  const tex = causticTexture();
  const q = 0.5, cw = Math.round(LW * S * q), ch = Math.round(LH * S * q);
  if (!_cTmp || _cTmp.width !== cw || _cTmp.height !== ch) _cTmp = mkCanvas(cw, ch);
  const tc = _cTmp.getContext('2d');
  tc.setTransform(1, 0, 0, 1, 0, 0); tc.globalCompositeOperation = 'source-over'; tc.clearRect(0, 0, cw, ch);
  tc.setTransform(S * q, 0, 0, S * q, 0, 0);
  [[1.0, 6, 3.5, 1], [0.62, -4, 2.2, 0.7]].forEach(([sc, vx, vy, al]) => {
    const w = 128 * 1.35 * sc, h = 128 * 1.35 * sc;
    const ox = ((t * vx) % w + w) % w, oy = ((t * vy) % h + h) % h;
    tc.globalAlpha = al;
    for (let x = -ox - w; x < LW + w; x += w) for (let y = -oy - h; y < LH + h; y += h) tc.drawImage(tex, x, y, w + 0.5, h + 0.5);
  });
  tc.globalAlpha = 1;
  tc.globalCompositeOperation = 'destination-in';
  tc.setTransform(1, 0, 0, 1, 0, 0);
  const fg = tc.createLinearGradient(0, 0, 0, ch);
  fg.addColorStop(0, `rgba(0,0,0,${fade[0]})`); fg.addColorStop(1, `rgba(0,0,0,${fade[1]})`);
  tc.fillStyle = fg; tc.fillRect(0, 0, cw, ch);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = a;
  ctx.imageSmoothingQuality = 'medium';
  ctx.drawImage(_cTmp, 0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

function drawBokeh(ctx, t, count = 22) {
  const rnd = seeded(1234);
  const tints = ['255,255,255', '255,255,255', '255,236,190', '255,200,214', '255,255,255'];
  for (let i = 0; i < count; i++) {
    const r = rnd.float(2.5, 10), x0 = rnd.float(0, LW), sp = rnd.float(2, 6), y0 = rnd.float(0, LH + 40), a = rnd.float(0.05, 0.15), sw = rnd.float(0, 6);
    const tc = tints[i % tints.length];
    const y = ((y0 - t * sp) % (LH + 40) + (LH + 40)) % (LH + 40) - 20;
    const x = x0 + Math.sin(t * 0.6 + sw) * 4;
    const g = ctx.createRadialGradient(x, y, r * 0.5, x, y, r);
    g.addColorStop(0, `rgba(${tc},${a * 0.4})`); g.addColorStop(0.8, `rgba(${tc},${a})`); g.addColorStop(1, `rgba(${tc},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
}
function drawSnow(ctx, t, count = 46) {
  const rnd = seeded(555);
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < count; i++) {
    const x0 = rnd.float(0, LW), y0 = rnd.float(0, LH), r = rnd.float(0.25, 0.65), sp = rnd.float(1, 4);
    const x = x0 + Math.sin(t * 0.8 + i) * 3, y = ((y0 - t * sp) % LH + LH) % LH;
    ctx.globalAlpha = 0.28 + 0.3 * Math.sin(t * 1.4 + i * 2) ** 2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Out-of-focus FOREGROUND bubbles (drawn after the level, before sprites) hugging the screen edges: depth cue only. */
function drawForegroundBokeh(ctx, t) {
  const L = [[34, 150, 17, 0.9], [238, 128, 21, 1.7], [226, 58, 12, 2.6], [22, 70, 10, 3.3]];
  L.forEach(([x0, y0, r, ph]) => {
    const x = x0 + Math.sin(t * 0.5 + ph) * 3, y = ((y0 - t * 6 * (r / 14) - 20) % 216 + 216) % 216 + 12;
    const g = ctx.createRadialGradient(x, y, r * 0.3, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.03)'); g.addColorStop(0.78, 'rgba(235,252,255,0.10)'); g.addColorStop(0.93, 'rgba(255,255,255,0.20)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  });
}

/** Full background pass (everything behind the platforms). ctx must already carry the S scale. */
function drawBackground(ctx, t, S) {
  const st = buildBackgroundStatic(S);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(st, 0, 0);
  ctx.restore();
  drawGodRays(ctx, t, 1);
  drawCaustics(ctx, t, S, 0.16);
  drawBokeh(ctx, t);
  drawSnow(ctx, t);
}

/** One free-standing candy/clay slab (logical px) — used by the title and cast sheet. */
function drawSlab(ctx, x, y, w, h, matName = 'candy', seed = 5, o = {}) {
  const loop = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  _shadeSolids(ctx, JT.S, [loop], [[x, x + w, y]], MATS[matName], seed, { rC: o.r ?? Math.min(8, h / 2), rV: 3, drip: o.drip ?? 1 });
}

/* ------------------------------------------------ POST: bloom ---------------------------------- */
const _bl = {};
/** Cheap bloom: downscale (no filter) -> brights-only threshold on the SMALL canvas -> bilinear upscale, added back.
 *  Two levels (1/4 and 1/14 res) give a tight + a wide halo. */
function postBloom(ctx, strength = 0.3) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const lv = [[4, 0.55], [14, 0.5]];
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  lv.forEach(([d, k], i) => {
    const w = Math.ceil(W / d), h = Math.ceil(H / d);
    if (!_bl[i] || _bl[i].width !== w || _bl[i].height !== h) { _bl[i] = mkCanvas(w, h); _bl['t' + i] = mkCanvas(w, h); }
    const tmp = _bl['t' + i].getContext('2d'), c = _bl[i].getContext('2d');
    tmp.setTransform(1, 0, 0, 1, 0, 0); tmp.filter = 'none'; tmp.clearRect(0, 0, w, h);
    tmp.imageSmoothingQuality = 'medium';
    tmp.drawImage(i === 0 ? ctx.canvas : _bl[0], 0, 0, w, h);          // plain downscale
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h);
    if ('filter' in c) c.filter = 'saturate(.2) brightness(.6) contrast(3.6)';
    c.drawImage(_bl['t' + i], 0, 0);                                     // threshold at small size
    c.filter = 'none';
    ctx.imageSmoothingQuality = 'high';
    ctx.globalAlpha = strength * k;
    ctx.drawImage(_bl[i], 0, 0, W, H);
  });
  ctx.restore();
}

/** Twinkling four-point glints on the frosting caps (cheap: <= 8 sparkles). */
function drawGlints(ctx, layer, t, avoid = []) {
  (layer.glints || []).forEach(([x, y, i]) => {
    if (avoid.some(([ax, ay, r]) => Math.abs(x - ax) < r && Math.abs(y - ay) < 9)) return;   // never twinkle under a character's feet
    const ph = (Math.sin(t * 1.7 + i * 2.3) * 0.5 + 0.5) ** 2;
    if (ph < 0.12) return;
    sparkle(ctx, x, y, 1.2 + ph * 2.6, i, '#ffffff', 0.5 + ph * 0.5);
  });
}
/* ===================================================================================================
 * 08 HUD / UI — soft rounded chips, glossy pill buttons, bead letters, axolotl-head life icons.
 * Text is the procedural stroke font (no fillText). All sizes in logical px.
 * ================================================================================================= */
function pill(ctx, x, y, w, h, o = {}) {
  const S = JT.S;
  ctx.save();
  const p = new Path2D(); rrectPath(p, x, y, w, h, o.r ?? h / 2);
  if (o.shadow !== false) {
    ctx.shadowColor = o.shadowC || 'rgba(14,40,100,.42)'; ctx.shadowBlur = (o.sb ?? 2.4) * S; ctx.shadowOffsetY = (o.sy ?? 1.1) * S;
  }
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  const c = o.fill || ['#2a4f94', '#1b3a78'];
  g.addColorStop(0, c[0]); g.addColorStop(1, c[1]);
  ctx.fillStyle = g; ctx.fill(p);
  ctx.shadowColor = 'transparent';
  ctx.save(); ctx.clip(p);
  // inner bevel: bright top edge, aqua bounce from below
  ctx.lineWidth = 0.9; ctx.strokeStyle = o.hi || 'rgba(255,255,255,.42)'; ctx.translate(0, 0.55); ctx.stroke(p); ctx.translate(0, -0.55);
  const bg = ctx.createLinearGradient(0, y + h * 0.55, 0, y + h);
  bg.addColorStop(0, 'rgba(90,230,255,0)'); bg.addColorStop(1, `rgba(90,230,255,${o.bounce ?? 0.35})`);
  ctx.fillStyle = bg; ctx.fillRect(x, y + h * 0.5, w, h * 0.5);
  if (o.gloss !== false) {   // top gloss window
    const gg = ctx.createLinearGradient(0, y, 0, y + h * 0.5);
    gg.addColorStop(0, `rgba(255,255,255,${o.glossA ?? 0.3})`); gg.addColorStop(1, 'rgba(255,255,255,0.04)');
    ctx.fillStyle = gg; ctx.beginPath(); ctx.roundRect(x + h * 0.3, y + h * 0.1, w - h * 0.6, h * 0.36, h * 0.18); ctx.fill();
  }
  ctx.restore();
  if (o.stroke) { ctx.lineWidth = o.strokeW ?? 0.5; ctx.strokeStyle = o.stroke; ctx.stroke(p); }
  ctx.restore();
}

function hudChip(ctx, x, y, label, lc, ink, value, o = {}) {
  const h = o.h ?? 10.6;
  const lh = 4.3, vh = 5.5;
  const lw = textWidth(label, lh, { weight: 0.26, track: 0.1 }) + 5.4;
  const vw = textWidth(value, vh, { weight: 0.24, track: 0.1 }) + 5.2;
  const w = lw + vw + 1;
  let X = x;
  if (o.align === 'right') X = x - w; else if (o.align === 'center') X = x - w / 2;
  pill(ctx, X, y, w, h, { fill: ['#2c5399', '#1a3772'], stroke: 'rgba(255,255,255,.18)' });
  // label capsule
  pill(ctx, X + 0.9, y + 0.9, lw, h - 1.8, { fill: [mix(lc, '#ffffff', 0.28), lc], shadow: false, gloss: true, glossA: 0.45, bounce: 0.0, hi: 'rgba(255,255,255,.7)' });
  drawText(ctx, label, X + 0.9 + lw / 2, y + h / 2 + lh / 2, lh, { align: 'center', weight: 0.26, track: 0.1, color: ink });
  drawText(ctx, value, X + lw + 3.4, y + h / 2 + vh / 2, vh, { weight: 0.24, track: 0.1, color: '#fff7e6' });
  return w;
}

const EXT_COLORS = ['#ff7a8a', '#ffd45c', '#7fe3b0', '#52d4ff', '#a98bff', '#ff9a5c'];
function drawExtendBead(ctx, x, y, letter, lit, color, t = 0) {
  // recessed well: dark inner shadow on the top-left, light lip on the bottom-right (carved into the clay)
  ctx.save();
  const lip = ctx.createLinearGradient(0, y - 5.4, 0, y + 5.4);
  lip.addColorStop(0, 'rgba(120,50,80,.6)'); lip.addColorStop(1, 'rgba(255,236,206,.85)');
  ctx.fillStyle = lip; ctx.beginPath(); ctx.arc(x, y, 5.4, 0, TAU); ctx.fill();
  const wg = ctx.createRadialGradient(x - 1.2, y - 1.6, 0.4, x, y, 4.7);
  wg.addColorStop(0, lit ? 'rgba(80,28,70,.7)' : 'rgba(150,72,98,.9)'); wg.addColorStop(1, lit ? 'rgba(70,24,64,.8)' : 'rgba(112,48,84,.95)');
  ctx.fillStyle = wg; ctx.beginPath(); ctx.arc(x, y + 0.2, 4.6, 0, TAU); ctx.fill();
  if (!lit) {
    // unlit: a pale, clearly legible engraved letter (cream on berry) so the EXTEND word is always readable
    drawText(ctx, letter, x, y + 2.1 + 0.35, 4.3, { align: 'center', weight: 0.3, color: 'rgba(70,20,60,.55)' });
    drawText(ctx, letter, x, y + 2.1, 4.3, { align: 'center', weight: 0.3, color: 'rgba(255,238,226,.95)' });
  } else {
    const lift = Math.sin(t * 3 + x) * 0.2;
    glow(ctx, x, y, 9.5, color, 0.55);
    paint(ctx, ellShape(x, y - 0.3 + lift, 4.5, 4.5), ramp(color), { rim: 0.6, edgeA: 0.55, spec: false });
    gloss(ctx, x - 1.5, y - 2.5 + lift, 1.6, 0.8, -0.5, 0.85);
    drawText(ctx, letter, x + 0.1, y + 1.9 + lift, 4.0, { align: 'center', weight: 0.3, color: '#fffdf3', outline: { c: alpha(ramp(color).deep, 0.9), w: 0.5 } });
  }
  ctx.restore();
}

/** Tiny axolotl head for life counters. */
function drawLifeIcon(ctx, x, y, who) {
  const S = PLAYER_STYLE[who];
  const rB = ramp(S.body), rG = ramp(S.gill);
  const prev = JT.F; JT.F = 1;
  ctx.save(); ctx.translate(x, y);
  // wells like the beads
  ctx.fillStyle = 'rgba(90,35,80,.4)'; ctx.beginPath(); ctx.arc(0, 0.2, 5.6, 0, TAU); ctx.fill();
  const wg = ctx.createLinearGradient(0, -5.5, 0, 5.5); wg.addColorStop(0, 'rgba(255,255,255,0)'); wg.addColorStop(1, 'rgba(255,230,200,.45)');
  ctx.strokeStyle = wg; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.arc(0, 0.2, 5.5, 0, TAU); ctx.stroke();
  // gills (3 bulbs per side)
  [[-5.4, -3.4], [-6.2, -0.4], [-5.2, 2.4], [5.4, -3.4], [6.2, -0.4], [5.2, 2.4]].forEach(([gx, gy]) => paint(ctx, ellShape(gx, gy, 1.9, 1.9), rG, { rim: 0.5, edgeA: 0.4, spec: false }));
  paint(ctx, ellShape(0, 0.4, 4.7, 4.1), rB, { rim: 0.6, edgeA: 0.5 });
  [-1.9, 1.9].forEach((ex) => drawEye(ctx, ex, -0.4, 1.35, { look: [0, 0.1], bounce: 0.2 }));
  spec(ctx, -3, 1.6, 1.6, 0.9, 0, 0.6, S.cheek); spec(ctx, 3, 1.6, 1.6, 0.9, 0, 0.6, S.cheek);
  ctx.strokeStyle = S.mouth; ctx.lineWidth = 0.45; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-1, 2); ctx.quadraticCurveTo(0, 2.8, 1, 2); ctx.stroke();
  ctx.restore();
  JT.F = prev;
}
function drawLifeWell(ctx, x, y) {
  // empty life slot: just a faint engraved ring (reads as "slot", not as a hole)
  ctx.strokeStyle = 'rgba(120,50,90,.28)'; ctx.lineWidth = 0.6; ctx.setLineDash([1.2, 1.4]);
  ctx.beginPath(); ctx.arc(x, y + 0.2, 5.0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
}

function drawRoundBadge(ctx, x, y, str) {
  ctx.save();
  glow(ctx, x, y, 12, '#ffe58a', 0.35);
  paint(ctx, rrShape(x - 6.6, y - 4.6, 13.2, 9.2, 4.6), ramp('#ffd45c'), { rim: 0.5, edgeA: 0.6, spec: true });
  drawText(ctx, str, x, y + 2.7, 5.4, { align: 'center', weight: 0.26, track: 0.08, color: '#4a2a1a' });
  ctx.restore();
}

function drawHud(ctx, st, t = 0) {
  const sc = st.scores;
  hudChip(ctx, 3.5, 2.8, '1UP', '#ff7a8a', '#5a1030', sc.p1, {});
  hudChip(ctx, 128, 2.8, 'HI SCORE', '#ffd45c', '#4a2a1a', sc.hi, { align: 'center' });
  hudChip(ctx, LW - 3.5, 2.8, '2UP', '#a98bff', '#2a1a6a', sc.p2, { align: 'right' });
  drawRoundBadge(ctx, 8, 26, st.round);
  const letters = 'EXTEND';
  for (let i = 0; i < 6; i++) {
    drawExtendBead(ctx, 8, 51 + i * 11.4, letters[i], st.extP1.includes(i), EXT_COLORS[i], t);
    drawExtendBead(ctx, LW - 8, 51 + i * 11.4, letters[i], (st.extP2 || []).includes(i), EXT_COLORS[i], t);
  }
  for (let i = 0; i < 3; i++) {
    const y = 203 - i * 12;
    if (i < st.lives1) drawLifeIcon(ctx, 8, y, 'p1'); else if (i < 2) drawLifeWell(ctx, 8, y);
    if (i < st.lives2) drawLifeIcon(ctx, LW - 8, y, 'p2'); else if (i < 2) drawLifeWell(ctx, LW - 8, y);
  }
}
/* ===================================================================================================
 * 09 SCENES — the three mockup pages (#gameplay, #title, #cast), hash router, animation loop.
 * ================================================================================================= */

/** soft contact shadow of an entity on the first surface below it (fainter + wider with height),
 *  clipped to the solids so it only ever darkens the slab it falls on. */
function contactShadow(ctx, map, layer, x, yFeet, rx = 8, a = 0.34) {
  const sy = surfaceBelow(map, x, yFeet - 1);
  if (sy === null) return;
  const h = Math.max(0, sy - yFeet);
  const k = clamp(1 - h / 70, 0.18, 1);
  ctx.save();
  if (layer && layer.solidPath) ctx.clip(layer.solidPath);
  softShadow(ctx, x, sy + 1.3, rx * (1 + h * 0.012), rx * 0.2 * (1 + h * 0.01), a * k * 1.5, '#7a1740');
  ctx.restore();
}

/* ------------------------------------------------ GAMEPLAY -------------------------------------- */
function sceneGameplay(ctx, t) {
  const S = JT.S;
  const map = LEVELS[0].map;
  ctx.setTransform(S, 0, 0, S, 0, 0);
  drawBackground(ctx, t, S);
  const layer = buildLevelLayer(map, S, 0);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
  // caustic light projected onto the slabs too (very faint)
  drawCaustics(ctx, t, S, 0.07);
  drawGodRays(ctx, t, 0.28);
  drawGlints(ctx, layer, t, [[183, 96, 16], [72, 152, 16], [48, 224, 16]]);
  drawForegroundBokeh(ctx, t);

  /* ---- placements (tile coords from the brief, snapped to real surfaces) ---- */
  const fizz = { x: 48, y: 216 };                 // floor, tile (5,23)
  const pop = { x: 200, y: 134 };                 // mid-jump above the row-17 slab, tile (24,15)
  const nib = { x: 116, y: 91 };                  // trapped Nibbler, tile (14,9)
  const crab = { x: 183, y: 88 };                 // feet on the row-9 slab, tile (20,11) region
  const jel = { x: 80, y: 71 };                   // tile (9,6)
  const sushi = { x: 72, y: 151 };                // on the row-17 slab, tile (8,17)

  // contact shadows first
  contactShadow(ctx, map, layer, fizz.x, fizz.y, 10);
  contactShadow(ctx, map, layer, pop.x, pop.y, 9.5, 0.36);
  contactShadow(ctx, map, layer, crab.x, crab.y, 11);
  ctx.save(); ctx.clip(layer.solidPath); softShadow(ctx, sushi.x, sushi.y + 1.3, 10.5, 2.1, 0.5, '#7a1740'); ctx.restore();

  /* food + popup */
  drawSushi(ctx, sushi.x, sushi.y - 6.8, t);
  drawPopup(ctx, '+2000', sushi.x, sushi.y - 25, 6.6, t);

  /* bubbles: cluster under the ceiling around the attractor (15.5, 2) */
  const cl = [[118.5, 34.5, 8.6], [133.5, 33.5, 8.4], [111, 47, 8.2], [126, 46, 8.8], [141, 47.5, 8.3]];
  cl.forEach(([x, y, r], i) => drawBubble(ctx, x + Math.sin(t * 1.1 + i) * 0.5, y + Math.cos(t * 0.9 + i * 2) * 0.5, r, { t, seed: i + 1 }));
  /* thunder special bubble rising near (27,20) */
  drawBubble(ctx, 220, 183, 9.8, { kind: 'thunder', t, seed: 3 });

  /* enemies */
  drawJellop(ctx, { x: jel.x, y: jel.y - 1, facing: 1, t, look: [0.4, 0.2], scale: 1.2 });
  drawCrabbit(ctx, { x: crab.x, y: crab.y - 9.4, facing: -1, t, angry: true, look: [0.5, 0], scale: 1.2 });
  drawBubble(ctx, nib.x, nib.y, 12.2, {
    kind: 'trap', stage: 1, t, seed: 5,
    inside: (c) => drawNibbler(c, { x: 0, y: 1, facing: 1, t: t * 1.3, trapped: true, noBob: true, walk: 0, scale: 0.92, look: [0.2, 0.1] }),
  });

  /* players: a faint warm halo lifts the heroes off the water */
  glow(ctx, fizz.x, fizz.y - 11, 24, '#ffd9ea', 0.22); glow(ctx, pop.x, pop.y - 12, 24, '#e6e0ff', 0.2);
  drawPlayer(ctx, 'p1', { x: fizz.x, y: fizz.y, facing: 1, pose: 'shoot', t, mouth: 1, scale: 1.3 });
  drawBubble(ctx, 71, 203, 7.4, { t, seed: 9, wobble: 2 });
  sparkle(ctx, 63, 197, 1.6, t * 2, '#ffffff', 0.9); sparkle(ctx, 76, 208, 1.1, -t, '#ffffff', 0.8);
  // tiny trail bubbles shed by the jump
  [[209, 141, 1.9, 21], [200, 148, 1.4, 22], [207, 153.5, 1.1, 23]].forEach(([x, y, r, sd]) => drawBubble(ctx, x, y, r, { t, seed: sd, wobble: 1.5 }));
  drawPlayer(ctx, 'p2', { x: pop.x, y: pop.y, facing: -1, pose: 'jump', t, scale: 1.3 });

  if (!JT.lowFx) postBloom(ctx, 0.27);

  /* HUD + walls furniture */
  drawHud(ctx, { scores: { p1: '012300', hi: '050000', p2: '008700' }, round: '01', lives1: 2, lives2: 1, extP1: [0, 1], extP2: [] }, t);
}

/* ------------------------------------------------ router ---------------------------------------- */
const SCENES = {
  gameplay: { w: 1024, h: 896, draw: (ctx, t) => sceneGameplay(ctx, t), t: 2.35 },
  title: { w: 1024, h: 896, draw: (ctx, t) => sceneTitle(ctx, t), t: 1.7 },
  cast: { w: 1600, h: 600, draw: (ctx, t) => sceneCast(ctx, t), t: 1.25 },
};

function startMockup() {
  const cv = document.getElementById('c');
  const ctx = cv.getContext('2d');
  const params = new URLSearchParams(location.search);
  let name = (location.hash || '#gameplay').slice(1).split('&')[0];
  if (!SCENES[name]) name = 'gameplay';
  const sc = SCENES[name];
  cv.width = sc.w; cv.height = sc.h;
  JT.S = sc.w / 256;
  const still = params.has('still');
  const tStill = params.has('t') ? parseFloat(params.get('t')) : sc.t;
  const frame = (t) => { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); sc.draw(ctx, t); };
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + name));
  window.addEventListener('hashchange', () => location.reload());
  frame(tStill);
  window.__ready = true;
  window.__scene = name;
  if (!still) {
    const t0 = performance.now();
    // adaptive quality: on slow (software-raster) machines drop the full-screen bloom so the page stays fluid
    let last = performance.now(), ema = 16;
    const loop = () => {
      const n = performance.now();
      frame(tStill + (n - t0) / 1000);
      ema = ema * 0.9 + (performance.now() - n) * 0.1;
      if (ema > 40) JT.lowFx = true; else if (ema < 22) JT.lowFx = false;
      last = n; requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
window.addEventListener('DOMContentLoaded', startMockup);
/* ===================================================================================================
 * 10 TITLE + CAST SHEET
 * ================================================================================================= */

/* ------------------------------------------------ logo ------------------------------------------ */
const LOGO_COLORS = ['#ff5a7a', '#ffc42a', '#2fd5a0', '#8d78ff', '#ffffff', '#ff8a3c', '#ffffff', '#ff5a7a', '#ffc42a', '#38b8ff'];
/** Puffy glossy balloon logo "FIZZ & POP" (procedural tubes), centred on cx, caps h tall, baseline y. */
function drawLogo(ctx, cx, y, h, t = 0) {
  const str = 'FIZZ & POP';
  const o = { weight: 0.265, track: 0.075 };
  const w = textWidth(str, h, o);
  softShadow(ctx, cx, y + h * 0.2, w * 0.52, h * 0.2, 0.3);
  const jig = (i) => [0, Math.sin(t * 2.4 + i * 0.85) * h * 0.028, Math.sin(t * 1.9 + i * 1.3) * 0.022];
  // inflated balloon letters on a cream + ink sticker, with a soft drop shadow baked into the sprites
  drawInflated(ctx, str, cx, y, h, {
    ...o, align: 'center', colors: LOGO_COLORS, jiggle: jig,
    rings: [{ w: h * 0.15, c: '#fff4e6' }, { w: h * 0.07, c: '#26336e' }],
    shadow: { c: 'rgba(16,40,110,.38)', dx: 0, dy: h * 0.07 },
  });
  return w;
}

function menuPill(ctx, cx, y, w, h, label, sel, t, icon) {
  const x = cx - w / 2;
  if (sel) {
    glow(ctx, cx, y + h / 2, w * 0.7, '#ffd45c', 0.35);
    const s = 1 + Math.sin(t * 4) * 0.012;
    ctx.save(); ctx.translate(cx, y + h / 2); ctx.scale(s, s); ctx.translate(-cx, -(y + h / 2));
    pill(ctx, x - 1.5, y - 0.8, w + 3, h + 1.6, { fill: ['#ffe885', '#ffb52e'], hi: 'rgba(255,255,255,.9)', bounce: 0.0, glossA: 0.5, stroke: '#fff4d0', strokeW: 0.6, shadowC: 'rgba(120,60,20,.45)' });
    drawText(ctx, label, cx + 2, y + h / 2 + 2.7, 5.4, { align: 'center', weight: 0.25, track: 0.1, color: '#4a2410' });
    // bubble marker
    drawBubble(ctx, x + 6.2, y + h / 2, 3.2, { t, seed: 2, wobble: 0.3 });
    ctx.restore();
  } else {
    // frosted-glass pill: airy, lets the water through, deep-ink label (the heavy navy slabs fought the sunny world)
    pill(ctx, x, y, w, h, { fill: ['rgba(255,255,255,.66)', 'rgba(200,240,255,.5)'], hi: 'rgba(255,255,255,.95)', stroke: 'rgba(255,255,255,.95)', strokeW: 0.7, bounce: 0.12, glossA: 0.5, shadowC: 'rgba(16,60,130,.3)', sb: 3, sy: 1.2 });
    drawText(ctx, label, cx + (icon ? 3 : 0), y + h / 2 + 2.6, 5.2, { align: 'center', weight: 0.26, track: 0.1, color: '#1d3b6e' });
    if (icon === 'sound') {   // speaker + waves
      const ix = x + 8.4, iy = y + h / 2;
      ctx.save(); ctx.fillStyle = '#1d3b6e'; ctx.beginPath(); ctx.moveTo(ix - 3, iy - 1.5); ctx.lineTo(ix - 1.2, iy - 1.5); ctx.lineTo(ix + 1.6, iy - 3.4); ctx.lineTo(ix + 1.6, iy + 3.4); ctx.lineTo(ix - 1.2, iy + 1.5); ctx.lineTo(ix - 3, iy + 1.5); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#1d3b6e'; ctx.lineWidth = 0.8; ctx.lineCap = 'round';
      [2.4, 4].forEach((r) => { ctx.beginPath(); ctx.arc(ix + 1.4, iy, r, -0.9, 0.9); ctx.stroke(); });
      ctx.restore();
    }
  }
}

/** The Sunken Tower as a soft diorama backdrop: stacked pill tiers, arched windows lit lemon, slight tilt. */
let _towerCv = null;
function titleTower(S) {
  if (_towerCv && _towerCv.S === S) return _towerCv;
  const cv = mkCanvas(LW * S, LH * S), c = cv.getContext('2d');
  c.scale(S, S);
  c.save(); c.translate(128, 224); c.rotate(-0.03);
  const tiers = [[128, 30], [112, 28], [96, 27], [82, 26], [68, 25], [54, 24], [40, 22]];
  let y = 0;
  tiers.forEach(([w, h], i) => {
    const g = c.createLinearGradient(0, y - h, 0, y);
    g.addColorStop(0, '#9fe6f6'); g.addColorStop(1, '#4fb2dc');
    c.fillStyle = g; c.beginPath(); c.roundRect(-w / 2, y - h, w, h, 8); c.fill();
    c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.roundRect(-w / 2 + 4, y - h + 1.2, w - 8, 2.2, 1.1); c.fill();
    const n = Math.max(2, Math.round(w / 26));
    for (let k = 0; k < n; k++) {
      const wx = -w / 2 + (k + 0.5) * (w / n);
      const lit = (k + i) % 3 !== 0;
      if (lit) glow(c, wx, y - h * 0.4, 11, '#ffd978', 0.55);
      c.fillStyle = lit ? 'rgba(255,226,140,1)' : 'rgba(40,110,170,.55)';
      c.beginPath(); c.moveTo(wx - 3.4, y - 5); c.lineTo(wx - 3.4, y - h * 0.58); c.arc(wx, y - h * 0.58, 3.4, Math.PI, 0); c.lineTo(wx + 3.4, y - 5); c.closePath(); c.fill();
    }
    y -= h - 4;
  });
  // spire
  c.fillStyle = '#7fd2ee'; c.beginPath(); c.moveTo(-9, y); c.quadraticCurveTo(-3, y - 24, 2, y - 46); c.quadraticCurveTo(7, y - 22, 9, y); c.closePath(); c.fill();
  c.restore();
  const out = mkCanvas(LW * S, LH * S);
  const oc = out.getContext('2d');
  blurInto(out, cv, 0.7, S);
  out.S = S;
  return (_towerCv = out);
}

function titleMap() {
  const rows = [];
  for (let r = 0; r < 26; r++) rows.push('.'.repeat(32));
  const set = (r, c0, c1) => { rows[r] = rows[r].slice(0, c0) + '#'.repeat(c1 - c0 + 1) + rows[r].slice(c1 + 1); };
  set(25, 0, 31);
  [17, 18].forEach((r) => { set(r, 2, 9); set(r, 22, 29); });
  return rows;
}

function sceneTitle(ctx, t) {
  const S = JT.S;
  const map = titleMap();
  ctx.setTransform(S, 0, 0, S, 0, 0);
  drawBackground(ctx, t, S);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 0.78; ctx.drawImage(titleTower(S), 0, 0); ctx.restore();
  // deep-water grounding: the lower third sinks into cerulean so the podiums, the floor crowd and the tower windows carry the contrast
  {
    const dg = ctx.createLinearGradient(0, 110, 0, LH);
    dg.addColorStop(0, 'rgba(16,70,170,0)'); dg.addColorStop(1, 'rgba(16,64,160,.42)');
    ctx.fillStyle = dg; ctx.fillRect(0, 110, LW, LH - 110);
  }
  glow(ctx, 128, 34, 120, '#fffbe0', 0.18);                       // sun glare behind the logo
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(buildLevelLayer(map, S, 'title'), 0, 0);
  ctx.restore();
  drawCaustics(ctx, t, S, 0.05);
  drawForegroundBokeh(ctx, t);

  /* floor crowd: Crabbit strolling left, Springle bouncing right */
  softShadow(ctx, 34, 216.4, 13, 2.4, 0.34); softShadow(ctx, 226, 216.4, 10, 2, 0.3);
  drawCrabbit(ctx, { x: 34, y: 216 - 8 * 1.25, facing: 1, t, scale: 1.25, look: [0.5, 0.1] });
  drawSpringle(ctx, { x: 226, y: 216 - 8 * 1.25 - Math.max(0, Math.sin(t * 3)) * 9, facing: -1, t, scale: 1.25, hop: Math.max(0, Math.sin(t * 3)), squash: 1 - Math.max(0, Math.sin(t * 3)) });

  /* hero podiums: Fizz left, Pop right */
  softShadow(ctx, 48, 153, 19, 3.2, 0.35); softShadow(ctx, 208, 153, 19, 3.2, 0.35);
  drawPlayer(ctx, 'p1', { x: 48, y: 152, facing: 1, pose: 'idle', t, scale: 2.15, blink: (Math.sin(t * 1.1) > 0.985) ? 1 : 0 });
  drawPlayer(ctx, 'p2', { x: 208, y: 152, facing: -1, pose: 'idle', t: t + 0.7, scale: 2.15 });
  // villains in the air: trapped Nibbler (left), Jellop (right)
  drawBubble(ctx, 30, 84, 13.5, { kind: 'trap', stage: 0, t, seed: 3, inside: (c) => drawNibbler(c, { x: 0, y: 1, t: t * 1.2, trapped: true, noBob: true, walk: 0, scale: 0.98, look: [0.3, 0.1] }) });
  drawJellop(ctx, { x: 228, y: 86 + Math.sin(t * 1.6) * 3, facing: -1, t, scale: 1.25 });
  drawBubble(ctx, 82, 132, 5.4, { t, seed: 6 }); drawBubble(ctx, 176, 128, 4.6, { t, seed: 8 }); drawBubble(ctx, 62, 100, 3.6, { t, seed: 11 }); drawBubble(ctx, 196, 104, 3.2, { t, seed: 12 });

  /* logo + tagline */
  const w = drawLogo(ctx, 128, 62, 33, t);
  sparkle(ctx, 128 - w / 2 + 7, 27, 4.4 + Math.sin(t * 4) * 0.8, t, '#ffffff'); sparkle(ctx, 128 + w / 2 - 3, 32, 3.6 + Math.sin(t * 4 + 1) * 0.8, -t, '#fff2a8');
  sparkle(ctx, 128 - 6, 22, 2.4, t * 1.3, '#ffffff', 0.9);
  {
    const str = 'THE SUNKEN TOWER', th = 5.4;
    const tw = textWidth(str, th, { weight: 0.22, track: 0.2 }) + 20;
    pill(ctx, 128 - tw / 2, 73.5, tw, 12, { fill: ['#2f5eac', '#1b3b80'], stroke: 'rgba(255,255,255,.3)' });
    drawText(ctx, str, 128, 73.5 + 6 + th / 2, th, { align: 'center', weight: 0.22, track: 0.2, color: '#ffd45c' });
    drawBubble(ctx, 128 - tw / 2 - 4.5, 79.5, 3.2, { t, seed: 1, wobble: 0.4 }); drawBubble(ctx, 128 + tw / 2 + 4.5, 79.5, 3.2, { t, seed: 4, wobble: 0.4 });
  }

  if (!JT.lowFx) postBloom(ctx, 0.22);

  /* menu (UI stays crisp: drawn after the bloom pass) */
  const items = ['1 PLAYER', '2 PLAYERS', 'HOW TO PLAY', 'HI-SCORES', 'SOUND ON'];
  items.forEach((str, i) => menuPill(ctx, 128, 99 + i * 15.8, 80, 12.8, str, i === 0, t, i === 4 ? 'sound' : null));
  hudChip(ctx, 128, 189, 'HI SCORE', '#ffd45c', '#4a2a1a', '050000', { align: 'center' });
  drawBokeh(ctx, t * 1.3, 8);
}

/* ------------------------------------------------ CAST SHEET ---------------------------------- */
function castBackdrop(ctx, W, H, t) {
  // same light story as the game: warm sun top-left, luminous turquoise -> cerulean, pastel blurred reef far away
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#94f3e4'); g.addColorStop(0.2, '#4adce0'); g.addColorStop(0.55, '#25b0e6'); g.addColorStop(0.85, '#2283d8'); g.addColorStop(1, '#2058b8');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const sun = ctx.createRadialGradient(W * 0.06, -50, 0, W * 0.06, -50, W * 0.5);
  sun.addColorStop(0, 'rgba(255,248,205,.95)'); sun.addColorStop(0.3, 'rgba(255,240,190,.3)'); sun.addColorStop(1, 'rgba(255,240,190,0)');
  ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);
  // far reef: tower + domes + coral, pastel and blurred
  const far = mkCanvas(W, H), fc = far.getContext('2d');
  fc.globalAlpha = 0.55;
  const rnd0 = seeded(21);
  for (let i = 0; i < 12; i++) { fc.fillStyle = i % 2 ? '#bcd8ff' : '#aef2e6'; fc.beginPath(); fc.ellipse(40 + i * 140, H + 10, 80 + (i % 3) * 24, 100 + (i % 4) * 26, 0, Math.PI, TAU); fc.fill(); }
  fc.globalAlpha = 0.5;
  for (let i = 0; i < 9; i++) _branchCoral(fc, 90 + i * 190 + rnd0.float(-30, 30), H + 8, -Math.PI / 2 + rnd0.float(-0.2, 0.2), 120, 22, 3, rnd0, i % 2 ? '#c9b7ff' : '#9fe9de');
  fc.save(); fc.translate(1020, H + 6); fc.scale(2.2, 2.2); fc.globalAlpha = 0.5; fc.translate(-0, 0); fc.restore();
  const fb = mkCanvas(W, H); blurInto(fb, far, 9, 1);
  ctx.drawImage(fb, 0, 0);
  // slanted god rays
  for (let i = 0; i < 9; i++) {
    const x = -80 + i * 200 + (i % 2) * 40, w = 60 + (i % 3) * 36;
    const gr = ctx.createLinearGradient(x, 0, x + 260, H);
    gr.addColorStop(0, 'rgba(255,252,225,.3)'); gr.addColorStop(0.6, 'rgba(255,252,225,.08)'); gr.addColorStop(1, 'rgba(255,252,225,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + w, 0); ctx.lineTo(x + w + 340, H); ctx.lineTo(x + 230, H); ctx.closePath(); ctx.fill();
  }
  // caustics (scaled) + bokeh
  const tex = causticTexture();
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.15;
  for (let x = -40; x < W; x += 400) for (let y = -40; y < H; y += 400) ctx.drawImage(tex, x, y, 400, 400);
  ctx.restore();
  const rnd = seeded(31);
  for (let i = 0; i < 26; i++) {
    const r = rnd.float(8, 40), x = rnd.float(0, W), y = rnd.float(0, H), a = rnd.float(0.05, 0.13);
    const bg = ctx.createRadialGradient(x, y, r * 0.5, x, y, r);
    bg.addColorStop(0, `rgba(255,255,255,${a * 0.4})`); bg.addColorStop(0.8, `rgba(235,255,255,${a})`); bg.addColorStop(1, 'rgba(235,255,255,0)');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
}

function castLabel(ctx, x, y, text, color = '#fff4e6', w0 = 0) {
  const h = 22 * 0.62;
  const tw = textWidth(text, 15, { weight: 0.22, track: 0.14 }) + 30;
  const w = Math.max(w0, tw);
  const prevS = JT.S; JT.S = 1;
  pill(ctx, x - w / 2, y - 14, w, 28, { fill: ['#2d5aa8', '#1a3a7e'], stroke: 'rgba(255,255,255,.22)', sb: 5, sy: 3 });
  drawText(ctx, text, x, y + 7.5, 15, { align: 'center', weight: 0.22, track: 0.14, color });
  JT.S = prevS;
}

/** draws fn(ctx) in a local logical-px space at (x,y), scaled sc device px per logical px. */
function at(ctx, x, y, sc, fn) {
  const prev = JT.S; JT.S = sc;
  ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
  fn(ctx);
  ctx.restore(); JT.S = prev;
}

function sceneCast(ctx, t) {
  const W = 1600, H = 600;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  castBackdrop(ctx, W, H, t);
  const SC = 6.7;

  /* header */
  at(ctx, 0, 0, 1, () => {
    drawText(ctx, 'FIZZ & POP', 40, 52, 32, { style: 'tube', weight: 0.3, colors: LOGO_COLORS, outline: { c: '#26336e', w: 3.4 }, shadow: { dy: 5, c: 'rgba(20,40,110,.3)' } });
    drawText(ctx, 'CONCEPT B   JELLY TOY   CAST SHEET', 268, 50, 15, { weight: 0.22, track: 0.2, color: '#26336e', alpha: 0.85 });
  });

  /* shelves: Row A (heroes + walkers) and Row B (flyers + hoppers); the boss gets a podium of its own */
  const rowA = 262, rowB = 506;
  at(ctx, 0, 0, SC, () => {
    drawSlab(ctx, 24 / SC, rowA / SC, 790 / SC, 40 / SC, 'candy', 12, { r: 20 / SC, drip: 0.55 });
    drawSlab(ctx, 24 / SC, rowB / SC, 790 / SC, 40 / SC, 'candy', 14, { r: 20 / SC, drip: 0.55 });
    drawSlab(ctx, 836 / SC, rowB / SC, 258 / SC, 40 / SC, 'candy', 16, { r: 20 / SC, drip: 0.55 });
  });

  const cells = [
    ['p1', 150, rowA, 'FIZZ'], ['p2', 352, rowA, 'POP'], ['nibbler', 548, rowA, 'NIBBLER'], ['crabbit', 722, rowA, 'CRABBIT'],
    ['jellop', 110, rowB, 'JELLOP'], ['springle', 254, rowB, 'SPRINGLE'], ['glimmer', 426, rowB, 'GLIMMER'], ['bonefin', 672, rowB, 'BONEFIN'],
  ];
  cells.forEach(([id, x, feet, label], i) => {
    const tt = t + i * 0.37;
    at(ctx, 0, 0, SC, () => {
      if (id === 'p1' || id === 'p2') {
        softShadow(ctx, x / SC, feet / SC + 0.4, 10, 2.2, 0.34);
        drawPlayer(ctx, id, { x: x / SC, y: feet / SC, facing: 1, pose: 'idle', t: tt, scale: 1.12 });
      } else {
        const fly = id === 'jellop' || id === 'glimmer' || id === 'bonefin';
        const lift = fly ? 2.5 : 0;
        softShadow(ctx, x / SC, feet / SC + 0.4, fly ? 7 : 10, fly ? 1.6 : 2.2, fly ? 0.2 : 0.34);
        const d = { nibbler: drawNibbler, crabbit: drawCrabbit, jellop: drawJellop, springle: drawSpringle, glimmer: drawGlimmer, bonefin: drawBonefin }[id];
        const sc = id === 'springle' ? 1.38 : id === 'bonefin' ? 1.22 : 1.12;
        d(ctx, { x: x / SC, y: feet / SC - 8 * sc - lift, facing: 1, t: tt, scale: sc, look: [0.4, 0.1] });
      }
    });
    castLabel(ctx, x, feet + 62, label);
  });
  // the boss
  at(ctx, 0, 0, SC, () => {
    softShadow(ctx, 968 / SC, rowB / SC + 0.4, 22, 3.4, 0.34);
    drawKraken(ctx, { x: 968 / SC, y: (rowB - 152) / SC, facing: -1, t: t + 0.4, scale: 0.54 });
  });
  castLabel(ctx, 968, rowB + 62, 'KRAKEN KING', '#ffd45c');

  /* right panel: bubble states, food, power-up, angry */
  at(ctx, 0, 0, 1, () => {
    pill(ctx, 1144, 90, 446, 494, { r: 30, fill: ['rgba(255,255,255,.22)', 'rgba(255,255,255,.1)'], hi: 'rgba(255,255,255,.55)', glossA: 0.12, bounce: 0.05, stroke: 'rgba(255,255,255,.35)', strokeW: 1.2, sb: 14, sy: 6, shadowC: 'rgba(14,50,120,.25)' });
  });
  const px = 1226, pxs = [1226, 1366, 1506];
  const r1 = 158, r2 = 302, r3 = 468;
  const B = 4.5;
  at(ctx, 0, 0, B, () => {
    drawBubble(ctx, px / B, r1 / B, 9, { t, seed: 1 });
    drawBubble(ctx, pxs[1] / B, r1 / B, 12.6, { kind: 'trap', stage: 0, t, seed: 2, inside: (c) => drawNibbler(c, { x: 0, y: 1, t, trapped: true, noBob: true, walk: 0, scale: 0.86, look: [0.2, 0.1] }) });
    drawBubble(ctx, pxs[2] / B, r1 / B, 12.6, { kind: 'trap', stage: 1, t, seed: 3, inside: (c) => drawCrabbit(c, { x: 0, y: 1, t, trapped: true, walk: 0, scale: 0.8, look: [0.3, 0.1] }) });
    drawBubble(ctx, pxs[0] / B, r2 / B, 10, { kind: 'thunder', t, seed: 4 });
    drawBubble(ctx, pxs[1] / B, r2 / B, 10, { kind: 'fire', t, seed: 5 });
    drawBubble(ctx, pxs[2] / B, r2 / B, 10, { kind: 'water', t, seed: 6 });
  });
  castLabel(ctx, pxs[0], r1 + 80, 'EMPTY'); castLabel(ctx, pxs[1], r1 + 80, 'TRAPPED'); castLabel(ctx, pxs[2], r1 + 80, 'WARNING');
  castLabel(ctx, pxs[0], r2 + 78, 'THUNDER'); castLabel(ctx, pxs[1], r2 + 78, 'FIRE'); castLabel(ctx, pxs[2], r2 + 78, 'WATER');
  at(ctx, 0, 0, 4.8, () => {
    drawSushi(ctx, pxs[0] / 4.8, (r3 - 2) / 4.8, t);
    drawHeart(ctx, pxs[1] / 4.8, (r3 - 2) / 4.8, t + 1);
  });
  at(ctx, 0, 0, 4.4, () => drawCrabbit(ctx, { x: pxs[2] / 4.4, y: (r3 + 8) / 4.4, facing: -1, t, angry: true, scale: 0.92, look: [0.5, 0] }));
  castLabel(ctx, pxs[0], r3 + 78, 'FOOD'); castLabel(ctx, pxs[1], r3 + 78, 'POWER-UP'); castLabel(ctx, pxs[2], r3 + 78, 'ANGRY', '#ff9aa8');
}
