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
