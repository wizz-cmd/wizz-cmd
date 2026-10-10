'use strict';
/* =====================================================================================================
 * FIZZ & POP — Concept A "PIXEL DELUXE"  (mockup + feasibility proof for the future GFX module)
 *
 * Everything on screen is drawn by code (Canvas 2D). No images, no fonts, no network.
 * Internal pixel-art resolution 512x448 (= 2x the logical 256x224), tiles 16x16, characters 32x32
 * (Kraken King 96x96). The pixel layer is integer-upscaled x2 (nearest) to the 1024x896 output; a smooth
 * light layer (ambient, point lights, god-rays, bloom, vignette, grading) is composited on top at
 * output resolution.
 *
 * Section map
 *   KIT        colour maths, hue-shifted ramps, seeded noise, tiny helpers
 *   SCULPT     the "pixel sculptor": parts (ellipsoid / swept capsule / bevelled polygon) are shaded with a
 *              directional light into 5-shade hue-shifted ramps, dithered at band edges, coloured inner lines,
 *              cast shadows, top rim light, shadow-side bounce light, selective dark OUTER outline
 *   CAST       drawPlayer / drawEnemy / drawBoss / food / power-ups  (pose parameters -> parts)
 *   BUBBLES    drawBubble(kind) incl. trapped enemy, thunder, fire, water
 *   FONT       5x7 source font -> EPX/Scale2x smoothing -> gradient + outline + 1px shadow text
 *   WORLD      drawBackground (3 parallax layers), drawPlatforms (autotiled coral masonry), walls, caustics
 *   LIGHT      light layer: ambient multiply, point lights, god-rays, bloom (down-chain), vignette, grading
 *   HUD/LOGO   drawHud, drawLogo
 *   SCENES     gameplay / title / cast, hash routed (#gameplay #title #cast, #debug for the sprite sheet)
 * ===================================================================================================== */

const IW = 512, IH = 448;           // internal pixel resolution
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  const x = c.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingEnabled = false;
  return [c, x];
}

/* ---------- colour ---------- */
function hex2rgb(h) {
  h = h.replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&');
  const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgb2hex(c) { return '#' + c.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join(''); }
function rgb2hsl(c) {
  const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0); else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360; s = clamp(s, 0, 1); l = clamp(l, 0, 1);
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rgba = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
function hueToward(h, t, f) { const d = ((t - h + 540) % 360) - 180; return (h + d * f + 360) % 360; }

const INK = hex2rgb('#1a0f2e');
const BOUNCE = hex2rgb('#6fd6f0');   // reflected water light on the shadow side

/** Hue-shifted 6-step ramp: 0 deep, 1 shadow, 2 base, 3 light, 4 highlight, 5 spec. Cool shadows, warm lights. */
function makeRamp(base, o = {}) {
  const [h, s, l] = rgb2hsl(hex2rgb(base));
  const cool = o.cool ?? 262, warm = o.warm ?? 46;
  const Ls = [l * 0.30, l * 0.58, l, l + (1 - l) * 0.24, l + (1 - l) * 0.50, Math.min(0.96, l + (1 - l) * 0.84)];
  const Hs = [hueToward(h, cool, 0.46), hueToward(h, cool, 0.26), h, hueToward(h, warm, 0.14), hueToward(h, warm, 0.28), hueToward(h, warm, 0.5)];
  const Ss = [Math.min(1, s * 0.9 + 0.08), Math.min(1, s * 1.06 + 0.03), s, s * 1.0, s * 0.88, s * 0.5];
  const c = Ls.map((L, i) => hsl2rgb(Hs[i], Ss[i], L));
  if (o.tweak) o.tweak(c);
  return finishRamp(c, o);
}
function rampFrom(hexes, o = {}) { return finishRamp(hexes.map(hex2rgb), o); }
function finishRamp(c, o = {}) {
  const rim = o.rim ? hex2rgb(o.rim) : mixc(mixc(c[1], c[2], 0.4), BOUNCE, 0.26);   // reflected-water bounce: a cool tint of the shadow, never brighter than the base
  return { c, rim, hex: c.map(rgb2hex) };
}

/* ---------- seeded noise ---------- */
function mulberry(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hash2(x, y, s = 0) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]].map(r => r.map(v => (v + 0.5) / 16));
const bayer = (x, y) => BAYER[y & 3][x & 3];

/* =====================================================================================================
 * SCULPT — the pixel sculptor
 * ===================================================================================================== */
const LIGHT = (() => { const v = [-0.52, -0.64, 0.56]; const l = Math.hypot(...v); return v.map(c => c / l); })();
const LXY = Math.hypot(LIGHT[0], LIGHT[1]);

const Q = { nx: 0, ny: 0, nz: 1 };   // scratch normal written by the shape tests (no per-pixel allocation)

function prepPart(p) {
  if (p.t === 'ell') { p.cos = Math.cos(p.rot || 0); p.sin = Math.sin(p.rot || 0); p.rz = p.rz || Math.min(p.r[0], p.r[1]); }
  return p;
}
function testEll(p, x, y) {
  const dx = x - p.c[0], dy = y - p.c[1];
  const u = (dx * p.cos + dy * p.sin) / p.r[0], v = (-dx * p.sin + dy * p.cos) / p.r[1];
  const d2 = u * u + v * v; if (d2 > 1) return false;
  const nzu = Math.sqrt(1 - d2);
  let a = u / p.r[0], b = v / p.r[1], c = nzu / p.rz;
  const len = Math.hypot(a, b, c) || 1; a /= len; b /= len; c /= len;
  Q.nx = a * p.cos - b * p.sin; Q.ny = a * p.sin + b * p.cos; Q.nz = c; return true;
}
function testCap(p, x, y) {
  const ax = p.a[0], ay = p.a[1], abx = p.b[0] - ax, aby = p.b[1] - ay;
  const L2 = abx * abx + aby * aby || 1e-6;
  let t = ((x - ax) * abx + (y - ay) * aby) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const r = p.a[2] + (p.b[2] - p.a[2]) * t;
  const dx = x - (ax + abx * t), dy = y - (ay + aby * t), d2 = dx * dx + dy * dy;
  if (d2 > r * r) return false;
  const u = dx / r, v = dy / r;
  Q.nx = u; Q.ny = v; Q.nz = Math.sqrt(Math.max(0, 1 - u * u - v * v)); return true;
}
function testPoly(p, x, y) {
  const pts = p.pts, n = pts.length; let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  if (!inside) return false;
  let best = 1e9, ex = 0, ey = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = pts[j][0], ay = pts[j][1], bx = pts[i][0], by = pts[i][1];
    const abx = bx - ax, aby = by - ay, L2 = abx * abx + aby * aby || 1e-6;
    let t = ((x - ax) * abx + (y - ay) * aby) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + abx * t - x, qy = ay + aby * t - y, d2 = qx * qx + qy * qy;
    if (d2 < best) { best = d2; ex = qx; ey = qy; }
  }
  const d = Math.sqrt(best) || 1e-6, h = Math.min(1, d / (p.bev || 2.4)), s = 1 - h;
  Q.nx = (ex / d) * s; Q.ny = (ey / d) * s; Q.nz = Math.sqrt(Math.max(0, 1 - s * s)); return true;
}
function bboxOf(p) {
  if (p.t === 'ell') { const m = Math.max(p.r[0], p.r[1]); return [p.c[0] - m, p.c[1] - m, p.c[0] + m, p.c[1] + m]; }
  if (p.t === 'cap') { const m = Math.max(p.a[2], p.b[2]); return [Math.min(p.a[0], p.b[0]) - m, Math.min(p.a[1], p.b[1]) - m, Math.max(p.a[0], p.b[0]) + m, Math.max(p.a[1], p.b[1]) + m]; }
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const q of p.pts) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
  return [x0, y0, x1, y1];
}

function newSculpt(w, h) {
  const n = w * h;
  return { w, h, n, ramp: new Array(n).fill(null), idx: new Int8Array(n), a: new Float32Array(n), fc: new Array(n).fill(null),
    pid: new Int16Array(n).fill(-1), bn: new Uint8Array(n), nx: new Float32Array(n), ny: new Float32Array(n), nz: new Float32Array(n) };
}

function pixCol(S, i) { return S.fc[i] || (S.ramp[i] ? (S.bn[i] ? S.ramp[i].rim : S.ramp[i].c[S.idx[i]]) : [0, 0, 0]); }
const DEF_TH = [-0.58, -0.06, 0.46, 0.86];
function bandIdx(I, th, x, y, dw) {
  // hard, clustered shade bands (no ordered dither: modern pixel art keeps clean shape-following edges)
  let s = 0;
  const n = th.length;
  for (let k = 0; k < n; k++) if (I >= th[k]) s++;
  return s;
}

function paintPart(S, p, id) {
  const bb = bboxOf(p);
  const x0 = Math.max(0, Math.floor(bb[0]) - 1), y0 = Math.max(0, Math.floor(bb[1]) - 1);
  const x1 = Math.min(S.w - 1, Math.ceil(bb[2]) + 1), y1 = Math.min(S.h - 1, Math.ceil(bb[3]) + 1);
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1; if (bw <= 0 || bh <= 0) return;
  const test = p.t === 'ell' ? testEll : p.t === 'cap' ? testCap : testPoly;
  const mask = new Uint8Array(bw * bh), NX = new Float32Array(bw * bh), NY = new Float32Array(bw * bh), NZ = new Float32Array(bw * bh);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!test(p, x + 0.5, y + 0.5)) continue;
    const k = (y - y0) * bw + (x - x0); mask[k] = 1; NX[k] = Q.nx; NY[k] = Q.ny; NZ[k] = Q.nz;
  }
  const th = p.th || DEF_TH, gain = p.gain ?? 1, bias = p.bias ?? 0, ramp = p.m;
  const flat = p.flat ? (typeof p.flat === 'string' ? hex2rgb(p.flat) : p.flat) : null;
  const alpha = p.al ?? 1;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const k = (y - y0) * bw + (x - x0); if (!mask[k]) continue;
    const i = y * S.w + x;
    if (p.clip && !(S.a[i] > 0.5)) continue;           // clip: only paint on top of existing pixels
    if (flat) {
      if (alpha < 1 && S.a[i] > 0) { S.fc[i] = mixc(pixCol(S, i), flat, alpha); S.ramp[i] = null; S.a[i] = Math.max(S.a[i], alpha); }
      else { S.fc[i] = flat; S.ramp[i] = null; S.a[i] = alpha; }
      S.pid[i] = id; continue;
    }
    const nx = NX[k], ny = NY[k], nz = NZ[k];
    let I = (nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) * gain + bias;
    if (p.dI) I += p.dI(x, y);
    let idx = bandIdx(I, th, x, y, p.dw ?? 0.05), bn = 0;
    if (p.bounce !== false && idx <= 1 && nz < 0.5 && ny > 0.42 && nx > -0.5) { idx = 1; bn = 1; }
    // coloured inner line: boundary pixel of this part lying over an existing part
    if (p.ln) {
      const edge = !mask[k - 1] || !mask[k + 1] || !mask[k - bw] || !mask[k + bw] || x === x0 || x === x1 || y === y0 || y === y1;
      if (edge && S.a[i] > 0.5) {
        const lit = (nx * LIGHT[0] + ny * LIGHT[1]) / (LXY || 1) > 0.15;
        if (!lit) { idx = p.ln > 1 ? 0 : Math.min(idx, 0); bn = 0; }
        else if (p.ln > 1) idx = Math.min(idx, 1);
      }
    }
    S.ramp[i] = ramp; S.idx[i] = idx; S.bn[i] = bn; S.fc[i] = null; S.pid[i] = id;
    S.a[i] = alpha >= 1 ? 1 : Math.max(S.a[i], alpha); S.nx[i] = nx; S.ny[i] = ny; S.nz[i] = nz;
    if (alpha < 1) S.fc[i] = null;
  }
  if (p.cast) {   // soft cast shadow of this part on the parts painted before it
    const [dx, dy, amt] = p.cast;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const k = (y - y0) * bw + (x - x0); if (!mask[k]) continue;
      const tx = x + dx, ty = y + dy; if (tx < 0 || ty < 0 || tx >= S.w || ty >= S.h) continue;
      const ti = ty * S.w + tx;
      if (S.pid[ti] !== id && S.pid[ti] >= 0 && S.ramp[ti]) { S.idx[ti] = Math.max(0, S.idx[ti] - (amt || 1)); S.bn[ti] = 0; }
    }
  }
}

function paintDot(S, p, id) {
  const sz = Math.max(1, Math.round(p.s || 1));
  const col = typeof p.c === 'string' ? hex2rgb(p.c) : p.c;
  for (let yy = 0; yy < sz; yy++) for (let xx = 0; xx < sz; xx++) {
    const x = Math.round(p.x) + xx, y = Math.round(p.y) + yy; if (x < 0 || y < 0 || x >= S.w || y >= S.h) continue;
    const i = y * S.w + x;
    const a = p.al ?? 1;
    if (a < 1 && S.fc[i]) S.fc[i] = mixc(S.fc[i], col, a);
    else if (a < 1 && S.ramp[i]) { const rc = S.ramp[i].c[S.idx[i]]; S.fc[i] = mixc(rc, col, a); S.ramp[i] = null; }
    else if (a < 1) { S.fc[i] = col; }
    else S.fc[i] = col;
    if (S.a[i] < 1 && a >= 0.5) S.a[i] = 1;
    S.pid[i] = id;
  }
}

/** Mirror a parts list horizontally inside a sprite of width w (light direction stays top-left). */
function mirrorParts(parts, w) {
  return parts.map(p => {
    const q = { ...p };
    if (p.t === 'ell') { q.c = [w - p.c[0], p.c[1]]; q.rot = -(p.rot || 0); }
    else if (p.t === 'cap') { q.a = [w - p.a[0], p.a[1], p.a[2]]; q.b = [w - p.b[0], p.b[1], p.b[2]]; }
    else if (p.t === 'poly') { q.pts = p.pts.map(v => [w - v[0], v[1]]); }
    else if (p.t === 'dot') { q.x = w - (p.x + Math.max(1, Math.round(p.s || 1))); }
    if (p.cast) q.cast = [-p.cast[0], p.cast[1], p.cast[2]];
    return q;
  });
}
function scaleParts(parts, s) {
  if (s === 1) return parts;
  return parts.map(p => {
    const q = { ...p };
    if (p.t === 'ell') { q.c = [p.c[0] * s, p.c[1] * s]; q.r = [p.r[0] * s, p.r[1] * s]; if (p.rz) q.rz = p.rz * s; }
    else if (p.t === 'cap') { q.a = [p.a[0] * s, p.a[1] * s, p.a[2] * s]; q.b = [p.b[0] * s, p.b[1] * s, p.b[2] * s]; }
    else if (p.t === 'poly') { q.pts = p.pts.map(v => [v[0] * s, v[1] * s]); q.bev = (p.bev || 2.4) * s; }
    else if (p.t === 'dot') { q.x = p.x * s; q.y = p.y * s; q.s = (p.s || 1) * s; }
    if (p.cast) q.cast = [Math.round(p.cast[0] * s), Math.round(p.cast[1] * s), p.cast[2]];
    return q;
  });
}

/** Remove single-pixel shading noise: a pixel whose shade differs from >=3 same-material 4-neighbours takes theirs. */
function cleanOrphans(S) {
  const { w, h } = S;
  for (let pass = 0; pass < 2; pass++) {
    const nidx = S.idx.slice();
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x, r = S.ramp[i]; if (!r || S.bn[i]) continue;
      const nb = [i - 1, i + 1, i - w, i + w]; let cnt = {}, best = -1, bc = 0;
      for (const j of nb) { if (S.ramp[j] !== r || S.bn[j]) continue; const v = S.idx[j]; cnt[v] = (cnt[v] || 0) + 1; if (cnt[v] > bc) { bc = cnt[v]; best = v; } }
      if (bc >= 3 && best !== S.idx[i]) nidx[i] = best;
    }
    S.idx = nidx;
  }
}

/** Resolve colours, add rim light + selective outline. Returns { canvas, S }. */
function finishSculpt(S, o = {}) {
  const { w, h } = S;
  const img = new ImageData(w, h), d = img.data;
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && S.a[y * w + x] > 0.45;
  // top rim light (surface light from above): pixels whose upper neighbour is empty get one step lighter
  if (o.rim !== false) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (!S.ramp[i] || S.a[i] < 0.5) continue;
      if (!solid(x, y - 1) && S.idx[i] < 4 && S.bn[i] === 0 && !S.noRim) S.idx[i] = Math.min(4, S.idx[i] + (S.nz[i] < 0.5 ? 1 : 0));
    }
  }
  if (o.clean !== false) cleanOrphans(S);
  for (let i = 0; i < S.n; i++) {
    if (S.a[i] <= 0) continue;
    let c;
    if (S.fc[i]) c = S.fc[i];
    else if (S.ramp[i]) c = S.bn[i] ? S.ramp[i].rim : S.ramp[i].c[S.idx[i]];
    else continue;
    d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = Math.round(255 * clamp(S.a[i], 0, 1));
  }
  // selective outline: dark, tinted by the neighbouring material; lighter on the lit (top/left) side
  if (o.outline !== false) {
    const ol = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (S.a[i] > 0.05) continue;
      let ni = -1, side = 0;
      if (solid(x, y + 1)) { ni = i + w; side = 1; }           // neighbour below  -> outline on its top edge (lit)
      else if (solid(x + 1, y)) { ni = i + 1; side = 1; }      // neighbour right  -> outline on its left edge (lit)
      else if (solid(x - 1, y)) { ni = i - 1; side = 0; }
      else if (solid(x, y - 1)) { ni = i - w; side = 0; }
      if (ni < 0) continue;
      let c0;
      const r = S.ramp[ni];
      if (o.outlineColor) c0 = hex2rgb(o.outlineColor);
      else if (r) c0 = side ? mixc(mixc(r.c[0], INK, 0.35), r.c[1], 0.25) : mixc(r.c[0], INK, 0.62);
      else { const f = S.fc[ni] || [60, 40, 80]; c0 = mixc(mixc(f, INK, 0.75), [20, 10, 40], 0.3); }
      ol.push([i, c0, S.a[ni]]);
    }
    for (const [i, c, a] of ol) { d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = Math.round(255 * clamp(a * 0.96, 0, 1)); }
  }
  const [cv, cx] = mkCanvas(w, h); cx.putImageData(img, 0, 0);
  return { canvas: cv, S };
}

/** Build a sprite from a parts list. opts: {flip, outline, rim, scale} */
function translateParts(parts, dx, dy) {
  return parts.map(p => {
    if (!p) return p;
    const q = { ...p };
    if (p.t === 'ell') q.c = [p.c[0] + dx, p.c[1] + dy];
    else if (p.t === 'cap') { q.a = [p.a[0] + dx, p.a[1] + dy, p.a[2]]; q.b = [p.b[0] + dx, p.b[1] + dy, p.b[2]]; }
    else if (p.t === 'poly') q.pts = p.pts.map(v => [v[0] + dx, v[1] + dy]);
    else if (p.t === 'dot') { q.x = p.x + dx; q.y = p.y + dy; }
    return q;
  });
}
function sculpt(w, h, parts, opts = {}) {
  let ps = parts.filter(Boolean);
  if (opts.ox || opts.oy) ps = translateParts(ps, opts.ox || 0, opts.oy || 0);
  if (opts.scale && opts.scale !== 1) ps = scaleParts(ps, opts.scale);
  if (opts.flip) ps = mirrorParts(ps, w);
  const S = newSculpt(w, h);
  ps.forEach((p, id) => {
    if (p.t === 'dot') paintDot(S, p, id); else paintPart(S, prepPart(p), id);
  });
  return finishSculpt(S, opts);
}

/* ---- part constructors (readable character code) ---- */
const E = (cx, cy, rx, ry, m, o = {}) => ({ t: 'ell', c: [cx, cy], r: [rx, ry], m, ln: 1, ...o });
const CP = (ax, ay, ar, bx, by, br, m, o = {}) => ({ t: 'cap', a: [ax, ay, ar], b: [bx, by, br], m, ln: 1, ...o });
const PG = (pts, m, o = {}) => ({ t: 'poly', pts, m, ln: 0, ...o });
const DT = (x, y, c, o = {}) => ({ t: 'dot', x, y, c, ...o });
const FE = (cx, cy, rx, ry, col, o = {}) => ({ t: 'ell', c: [cx, cy], r: [rx, ry], flat: col, ln: 0, ...o });
const FP = (pts, col, o = {}) => ({ t: 'poly', pts, flat: col, ln: 0, ...o });
const FC = (ax, ay, ar, bx, by, br, col, o = {}) => ({ t: 'cap', a: [ax, ay, ar], b: [bx, by, br], flat: col, ln: 0, ...o });

/** A tapered chain of capsules through points [x,y,r]... */
function chain(pts, m, o = {}) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) out.push(CP(pts[i][0], pts[i][1], pts[i][2], pts[i + 1][0], pts[i + 1][1], pts[i + 1][2], m, o));
  return out;
}
/** Feathery gill / frond: a stalk chain with alternating barbs. */
function feather(pts, m, mTip, o = {}) {
  const out = [];
  const nb = o.barbs ?? 3, bl = o.barbLen ?? 2.8, br = o.barbR ?? 0.85, flip = o.side ?? 1;
  out.push(...chain(pts, m, { ln: 0, ...(o.cp || {}) }));
  for (let k = 0; k < nb; k++) {
    const t = (k + 1) / (nb + 1) * (pts.length - 1);
    const i = Math.min(pts.length - 2, Math.floor(t)), f = t - i;
    const px = lerp(pts[i][0], pts[i + 1][0], f), py = lerp(pts[i][1], pts[i + 1][1], f);
    const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1], dl = Math.hypot(dx, dy) || 1;
    const sgn = (k % 2 ? -1 : 1) * flip;
    // barb direction: stalk direction rotated ±55° and leaning toward the tip
    const ang = Math.atan2(dy, dx) + sgn * 0.95;
    const L = bl * (1 - k / (nb + 1) * 0.35);
    out.push(CP(px, py, br + 0.35, px + Math.cos(ang) * L, py + Math.sin(ang) * L, br * 0.55, k % 2 ? m : (mTip || m), { ln: 0 }));
  }
  return out;
}

/** Feather-like gill frond: pointed leaf polygon with a scalloped edge + a light vein. ang in radians (screen coords). */
function frond(bx, by, ang, len, wid, bend, m, mv, o = {}) {
  const N = o.n ?? 8, Lp = [], Rp = [];
  const ca = Math.cos(ang), sa = Math.sin(ang);
  for (let i = 0; i <= N; i++) {
    const t = i / N, along = len * t, off = o.curl ? bend * t * t : bend * Math.sin(t * Math.PI * 0.95);
    const cx = bx + ca * along - sa * off, cy = by + sa * along + ca * off;
    const w = wid * Math.pow(1 - t * 0.97, 0.7) * (i % 2 ? 1.22 : 0.86) * (o.scal ?? 1);
    Lp.push([cx - sa * w, cy + ca * w]); Rp.push([cx + sa * w, cy - ca * w]);
  }
  const out = [PG([...Lp, ...Rp.reverse()], m, { bev: o.bev ?? 1.9, ln: o.ln ?? 0, ...(o.po || {}) })];
  if (mv) {
    const t0 = 0.12, t1 = 0.78;
    const at = (t) => { const along = len * t, off = o.curl ? bend * t * t : bend * Math.sin(t * Math.PI * 0.95); return [bx + ca * along - sa * off, by + sa * along + ca * off]; };
    const a = at(t0), b = at(t1);
    out.push(FC(a[0], a[1], 0.45, b[0], b[1], 0.3, mv.c[3], { al: 0.85 }));
  }
  return out;
}

/** Fluffy axolotl gill: curved stalk with alternating barbs that end in lighter bulbs. */
function fluffGill(bx, by, ang, len, curve, m, mTip, o = {}) {
  const out = [], ca = Math.cos(ang), sa = Math.sin(ang);
  const at = (t) => { const along = len * t, off = curve * t * t; return [bx + ca * along - sa * off, by + sa * along + ca * off]; };
  const w0 = o.w0 ?? 1.5, w1 = o.w1 ?? 0.7;
  for (let k = 0; k < 4; k++) { const a = at(k / 4), b = at((k + 1) / 4); out.push(CP(a[0], a[1], lerp(w0, w1, k / 4), b[0], b[1], lerp(w0, w1, (k + 1) / 4), m, { ln: 0 })); }
  const nb = o.barbs ?? 4;
  for (let k = 0; k < nb; k++) {
    const t = 0.28 + k * (0.7 / nb), p = at(t), q = at(Math.min(1, t + 0.05));
    const dir = Math.atan2(q[1] - p[1], q[0] - p[0]);
    const sgn = (k % 2 ? -1 : 1) * (o.side ?? 1);
    const L = (o.barbLen ?? 3.4) * (1 - k * 0.14), ang2 = dir + sgn * 0.85;
    const ex = p[0] + Math.cos(ang2) * L, ey = p[1] + Math.sin(ang2) * L;
    out.push(CP(p[0], p[1], 0.8, ex, ey, 0.55, m, { ln: 0 }));
    out.push(E(ex, ey, 1.0, 1.0, mTip, { ln: 0, th: [-0.8, -0.3, 0.2, 0.7] }));
  }
  const e = at(1); out.push(E(e[0], e[1], 1.15, 1.15, mTip, { ln: 0, th: [-0.8, -0.3, 0.2, 0.7] }));
  return out;
}

/** Non-uniform squash & stretch about a pivot (parts are re-shaded afterwards, so lighting stays correct). */
function deformParts(parts, sx, sy, px, py) {
  const fx = x => px + (x - px) * sx, fy = y => py + (y - py) * sy, ar = Math.sqrt(sx * sy);
  return parts.map(p => {
    if (!p) return p; const q = { ...p };
    if (p.t === 'ell') { q.c = [fx(p.c[0]), fy(p.c[1])]; q.r = [p.r[0] * sx, p.r[1] * sy]; if (p.rz) q.rz = p.rz * ar; }
    else if (p.t === 'cap') { q.a = [fx(p.a[0]), fy(p.a[1]), p.a[2] * ar]; q.b = [fx(p.b[0]), fy(p.b[1]), p.b[2] * ar]; }
    else if (p.t === 'poly') q.pts = p.pts.map(v => [fx(v[0]), fy(v[1])]);
    else if (p.t === 'dot') { q.x = fx(p.x); q.y = fy(p.y); }
    return q;
  });
}

/** Rotate a parts list about a pivot (radians, clockwise on screen). The light stays fixed, so shading re-computes correctly. */
function rotateParts(parts, ang, px, py) {
  const c = Math.cos(ang), sn = Math.sin(ang);
  const rp = (x, y) => [px + (x - px) * c - (y - py) * sn, py + (x - px) * sn + (y - py) * c];
  return parts.map(p => {
    if (!p) return p; const q = { ...p };
    if (p.t === 'ell') { q.c = rp(p.c[0], p.c[1]); q.rot = (p.rot || 0) + ang; }
    else if (p.t === 'cap') { const a = rp(p.a[0], p.a[1]), b = rp(p.b[0], p.b[1]); q.a = [a[0], a[1], p.a[2]]; q.b = [b[0], b[1], p.b[2]]; }
    else if (p.t === 'poly') q.pts = p.pts.map(v => rp(v[0], v[1]));
    else if (p.t === 'dot') { const r = rp(p.x, p.y); q.x = r[0]; q.y = r[1]; }
    return q;
  });
}
/* =====================================================================================================
 * CAST — materials, players
 * ===================================================================================================== */
const MAT = {};
function initMaterials() {
  // players
  MAT.fizz = makeRamp('#f4659a');
  MAT.fizzBelly = makeRamp('#ffa296');
  MAT.fizzGill = makeRamp('#ff3d78', { warm: 30 });
  MAT.fizzGillTip = makeRamp('#ff8fb0');
  MAT.fizzFin = makeRamp('#ff8cb8');
  MAT.pop = makeRamp('#3fcfe6', { cool: 255 });
  MAT.popBelly = makeRamp('#a2ead8');
  MAT.popGill = makeRamp('#9a72ff', { cool: 275 });
  MAT.popGillTip = makeRamp('#cdb8ff');
  MAT.popFin = makeRamp('#74dff0');
  MAT.eye = makeRamp('#2d1442', { cool: 275 });
  MAT.mouth = makeRamp('#6e1a4e');
  MAT.tongue = makeRamp('#ff7aa0');
  MAT.white = makeRamp('#fff4ee');
}

/** Axolotl gill: a thick curved stalk with barb pairs ending in glowing bulbs, plus a big tip (3 per side, clearly separated).
 *  o.fine (hi-detail portraits, scale 2.5): more, thinner barbs and smaller bulbs so the plume stays feathery instead of blobby. */
function gillStalk(bx, by, ang, len, curve, m, mTip, o = {}) {
  const out = [], ca = Math.cos(ang), sa = Math.sin(ang), fine = !!o.fine;
  const at = (t) => { const along = len * t, off = curve * t * t; return [bx + ca * along - sa * off, by + sa * along + ca * off]; };
  const r0 = o.r0 ?? 1.6, r1 = o.r1 ?? 0.9, bias = o.bias || 0;
  for (let k = 0; k < 3; k++) { const a = at(k / 3), b = at((k + 1) / 3); out.push(CP(a[0], a[1], lerp(r0, r1, k / 3), b[0], b[1], lerp(r0, r1, (k + 1) / 3), m, { ln: 0, bias })); }
  const nb = o.barbs ?? 1, rb = fine ? 0.62 : 1;
  for (let k = 0; k < nb; k++) {
    const t = fine ? 0.34 + k * (0.5 / Math.max(1, nb)) : 0.5 + k * 0.22, p = at(t), q = at(Math.min(1, t + 0.06));
    const dir = Math.atan2(q[1] - p[1], q[0] - p[0]), L = (o.barbLen ?? 3.1) * (1 - k * (fine ? 0.14 : 0.2));
    for (const sg of [-1, 1]) {
      const a2 = dir + sg * (fine ? 0.95 : 0.85), ex = p[0] + Math.cos(a2) * L, ey = p[1] + Math.sin(a2) * L;
      out.push(CP(p[0], p[1], 0.85 * rb, ex, ey, 0.6 * rb, m, { ln: 0, bias }));
      out.push(E(ex, ey, 1.05 * (fine ? 0.75 : 1), 1.05 * (fine ? 0.75 : 1), mTip, { ln: 0, th: [-0.8, -0.3, 0.2, 0.7], bias }));
    }
  }
  const e = at(1); out.push(E(e[0], e[1], fine ? 1.3 : 1.7, fine ? 1.3 : 1.7, mTip, { ln: 0, th: [-0.8, -0.3, 0.2, 0.7], bias }));
  return out;
}

/** Axolotl (Fizz = p1, Pop = p2). 32x32, facing RIGHT. Pose: {mouth, bob, jump, walk, sway, blink, arm, tail, gillOff} */
function playerParts(who, P = {}) {
  const f = who === 'p1';
  const body = f ? MAT.fizz : MAT.pop, belly = f ? MAT.fizzBelly : MAT.popBelly;
  const gill = f ? MAT.fizzGill : MAT.popGill, gillTip = f ? MAT.fizzGillTip : MAT.popGillTip;
  const fin = f ? MAT.fizzFin : MAT.popFin;
  const by = P.bob || 0, sw = P.sway || 0, mo = P.mouth || 0, walk = P.walk || 0, jp = P.jump || 0, go = P.gillOff || 0;
  const D = Math.PI / 180, out = [];
  // ---- far-side gill (darker, peeks out behind the near ones)
  out.push(...gillStalk(15.4, 4.6 + by, (-98 + go * 0.5 + sw * 2) * D, 8.2, 1.0, gill, gillTip, { bias: -0.55, r0: 1.4, barbs: 1 }));
  // ---- tail: thick tapering tail curling up behind the body, with a light crest fin along its outer edge
  const tl = P.tail || 0;
  out.push(PG([[11.2, 23.8], [8, 22.8], [5, 21.6 + tl], [3.4, 18.4 + tl], [0.8, 18.2 + tl], [0.1, 22.6 + tl * 0.5], [0.8, 27.6], [3.8, 30.2], [8.4, 30.4], [11.4, 29.2]], fin, { bev: 2.0, ln: 0, bounce: false, th: [-0.7, -0.2, 0.35, 0.8] }));
  out.push(...chain([[11.8, 26.4, 3.4], [7.2, 27.8, 3.0], [3.6, 26, 2.3], [2.2, 22.2 + tl * 0.5, 1.5]], body, { ln: 0, bounce: false }));
  // ---- far arm + far leg (darker)
  if (jp) out.push(CP(13, 21.6 + by, 1.7, 9.2, 19.2 + by, 1.4, body, { ln: 1, bias: -0.45 }), E(8.2, 18.6 + by, 1.7, 1.4, fin, { ln: 0, bias: -0.35 }));
  else out.push(CP(12.6, 22.4 + by, 1.7, 11, 25.4 + by, 1.4, body, { ln: 1, bias: -0.45 }));
  const lw = Math.sin(walk * 6.283) * 1.4;
  if (jp) {   // trailing back leg / bent forward leg
    out.push(CP(11.6, 26.4, 2.3, 6.6, 29.0, 1.9, body, { bias: -0.3, bounce: false }), E(4.8, 29.8, 3.0, 1.35, fin, { ln: 1, bias: -0.2, rot: 0.35 }));
    out.push(CP(18.6, 26.4, 2.5, 22.6, 28.4, 2.0, body, { bounce: false }), E(24.6, 29.2, 3.2, 1.4, fin, { ln: 1, rot: -0.3 }));
  } else {
    out.push(CP(12.6, 27 + by * 0.4, 2.4, 12.4 + lw * 0.6, 29.6, 2.1, body, { bias: -0.3 }), E(13.4 + lw, 30.4, 3.1, 1.5, fin, { ln: 1, bias: -0.2 }));
    out.push(CP(19.6, 27 + by * 0.4, 2.6, 19.8 - lw * 0.6, 29.6, 2.2, body), E(21.4 - lw, 30.4, 3.4, 1.5, fin, { ln: 1 }));
  }
  // ---- body + belly (smaller than the head: chibi proportions, but a real torso)
  out.push(E(16, 23.4 + by * 0.5, 7.4, 6.8, body, { cast: [1, 2, 1] }));
  out.push(E(17.8, 25 + by * 0.5, 4.4, 4.7, belly, { ln: 0, th: [-0.7, -0.25, 0.3, 0.8] }));
  // ---- near-side gills: three bold stalks fanned up and back with clear gaps between them
  const s1 = sw, s2 = sw * 0.7, s3 = sw * 0.5;
  out.push(...gillStalk(12.8, 6.4 + by, (-118 + go * 0.8 + s1 * 3) * D, 10.6, -1.8, gill, gillTip, { barbs: P.barbs ?? 1, fine: !!P.fine }));
  out.push(...gillStalk(9.6, 9.8 + by, (-158 + go * 1.0 + s2 * 3) * D, 10.6, 1.6, gill, gillTip, { barbs: P.barbs ?? 1, fine: !!P.fine }));
  out.push(...gillStalk(9.8, 14.2 + by, (178 + go * 1.1 + s3 * 3) * D, 8.8, 2.8, gill, gillTip, { barbs: P.barbs ?? 1, fine: !!P.fine }));
  // ---- front arm
  if (jp) out.push(CP(20.2, 22 + by, 1.9, 25.4, 24.4 + by, 1.6, body, { ln: 1 }), E(26.4, 25 + by, 1.9, 1.6, fin, { ln: 0 }));
  else { out.push(CP(20.2, 22 + by, 1.9, 23.8, 23.8 + by - (P.arm || 0), 1.6, body, { ln: 1 })); out.push(E(24.8, 24.2 + by - (P.arm || 0), 1.8, 1.5, fin, { ln: 0 })); }
  // ---- head: big and round (the face is what the player looks at)
  const hx = 18.2, hy = 11.4 + by;
  out.push(E(hx, hy, 10.6, 8.6, body, { cast: [0, 1, 1] }));
  out.push(E(hx + 8.2, hy + 3.2, 4.6, 3.4, body, { ln: 0 }));         // muzzle bump (reads the facing direction)
  out.push(FE(hx + 6.6, hy + 5.0, 2.9, 1.7, f ? '#ff3d8a' : '#8a6bff', { al: 0.5 }));   // cheek
  // mouth
  if (mo) {
    out.push(FE(hx + 10.0, hy + 4.5, 2.7, 2.8, MAT.mouth.c[0], { rot: 0.1 }));
    out.push(FE(hx + 10.2, hy + 5.9, 1.7, 1.0, MAT.tongue.c[2]));
  } else {
    out.push(FC(hx + 5.0, hy + 5.2, 0.5, hx + 10.8, hy + 4.2, 0.5, MAT.mouth.c[1]));
    out.push(DT(hx + 4.6, hy + 4.4, MAT.mouth.c[1]), DT(hx + 11.6, hy + 3.6, MAT.mouth.c[1]));
  }
  // eye: big, glossy, two highlights
  const ex = hx + 4.2, ey = hy - 1.4;
  if (P.blink) out.push(FC(ex - 3, ey + 0.8, 0.8, ex + 3, ey + 0.4, 0.8, MAT.eye.c[1]), DT(ex - 3.6, ey - 0.4, MAT.eye.c[1]), DT(ex + 3.4, ey - 0.4, MAT.eye.c[1]));
  else {
    out.push(FE(ex, ey, 3.8, 4.4, '#2a1240'));
    out.push(FE(ex + 0.4, ey + 2.1, 2.8, 1.5, f ? '#a050d8' : '#4a7cf0', { al: 0.85 }));
    out.push(DT(ex - 2.4, ey - 3, '#ffffff', { s: 2 }), DT(ex - 2.4, ey - 1, '#ffffff', { s: 1 }), DT(ex + 1.6, ey + 2.4, '#e8f8ff', { s: 1 }));
  }
  out.push(DT(hx + 11.2, hy - 0.6, MAT.eye.c[1], { s: 1 }));      // nostril
  return out;
}
/* =====================================================================================================
 * CAST — enemies (32x32 boxes; facing RIGHT; angry = crimson palette + steam)
 * ===================================================================================================== */
function initEnemyMaterials() {
  // Nibbler: brass clockwork fish
  MAT.brass = makeRamp('#e29a2c', { cool: 285, warm: 52 });
  MAT.brassL = makeRamp('#ffc857', { cool: 285 });
  MAT.steel = makeRamp('#8fa3c4', { cool: 250, warm: 60 });
  MAT.gear = makeRamp('#b9c6dc', { cool: 250, warm: 60 });
  MAT.glass = makeRamp('#d9f6ff');
  MAT.steelD = makeRamp('#4a5878', { cool: 255 });
  MAT.rust = makeRamp('#7a4a2e', { cool: 280 });
  // angry (crimson)
  MAT.angry = makeRamp('#e0324f', { cool: 290, warm: 28 });
  MAT.angryL = makeRamp('#ff6a64', { cool: 290, warm: 30 });
  MAT.angryD = makeRamp('#9c1f45', { cool: 295 });
  // Crabbit
  MAT.crab = makeRamp('#ff7a2e', { cool: 300, warm: 52 });
  MAT.crabL = makeRamp('#ffb05a', { cool: 300 });
  MAT.crabD = makeRamp('#d9481f', { cool: 300 });
  // Jellop
  MAT.jelly = makeRamp('#7442e8', { cool: 262, warm: 330 });
  MAT.jellyL = makeRamp('#a878ff', { cool: 262 });
  MAT.jellyCore = makeRamp('#ff9bd4', { cool: 285 });
  // Springle
  MAT.sea = makeRamp('#4fd36a', { cool: 215, warm: 70 });
  MAT.seaL = makeRamp('#a6f27b', { cool: 215 });
  MAT.seaFin = makeRamp('#35c9a8', { cool: 215 });
  // Glimmer
  MAT.cobalt = makeRamp('#3b62e8', { cool: 270, warm: 300 });
  MAT.cobaltL = makeRamp('#6fa4ff', { cool: 270 });
  MAT.lantern = makeRamp('#ffe066', { cool: 30, warm: 55 });
  MAT.tooth = makeRamp('#f2f6ff');
  // Bonefin
  MAT.bone = makeRamp('#d6e2ff', { cool: 255, warm: 60 });
  MAT.boneD = makeRamp('#8aa0d8', { cool: 255 });
  // Kraken
  MAT.kraken = makeRamp('#8a4fd8', { cool: 268, warm: 330 });
  MAT.krakenL = makeRamp('#c07cf0', { cool: 268, warm: 330 });
  MAT.krakenSucker = makeRamp('#f2b4ff', { cool: 285 });
  MAT.gold = makeRamp('#ffc83a', { cool: 20, warm: 55 });
  MAT.ruby = makeRamp('#ff3b5c', { cool: 300 });
  MAT.cyanGem = makeRamp('#44e8ff', { cool: 215 });
}

const RAD = Math.PI / 180;

function eyeBall(cx, cy, r, look, iris, o = {}) {
  // glossy round eye: white ball, coloured iris, pupil, two highlights
  const out = [];
  out.push(E(cx, cy, r, r * (o.ry || 1), MAT.white, { ln: 0, th: [-0.7, -0.15, 0.45, 0.9] }));
  out.push(FE(cx + look[0], cy + look[1], r * 0.62, r * 0.7, iris));
  out.push(FE(cx + look[0] * 1.2, cy + look[1] * 1.1, r * 0.34, r * 0.4, '#190b2b'));
  out.push(DT(cx + look[0] - r * 0.45, cy + look[1] - r * 0.5, '#ffffff', { s: Math.max(1, Math.round(r * 0.3)) }));
  return out;
}

/** Nibbler — brass clockwork fish on legs, wind-up cog on its back */
function nibblerParts(P = {}) {
  const a = !!P.angry, w = P.walk || 0, t = P.t || 0;
  const body = a ? MAT.angry : MAT.brass, plate = a ? MAT.angryL : MAT.brassL, dark = a ? MAT.angryD : MAT.rust;
  const o = [];
  const lw = Math.sin(w * 6.283) * 2.2;
  // far legs
  o.push(CP(12, 24, 1.4, 11.4 - lw, 29, 1.2, MAT.steel, { bias: -0.4 }), E(12.2 - lw, 30.2, 2.8, 1.1, MAT.steel, { bias: -0.4, ln: 1 }));
  // tail fin: scalloped fan with radial ribs
  { const cx0 = 10.5, cy0 = 17.4, pts = [[cx0, cy0]];
    for (let k = 0; k <= 7; k++) { const an = (132 + k * 13.7) * RAD, r = k % 2 ? 8.4 : 9.6; pts.push([cx0 + Math.cos(an) * r, cy0 + Math.sin(an) * r * 1.12]); }
    o.push(PG(pts, MAT.brassL, { bev: 2.0, ln: 1, th: [-0.6, -0.1, 0.4, 0.8] }));
    for (let k = 0; k <= 7; k += 1) { const an = (132 + k * 13.7) * RAD, r = 8; o.push(FC(cx0, cy0, 0.35, cx0 + Math.cos(an) * r, cy0 + Math.sin(an) * r * 1.12, 0.35, dark.c[1], { al: 0.75 })); } }
  // body
  o.push(E(15.6, 17.4, 11.4, 8.6, body, { cast: [1, 2, 1] }));
  o.push(E(16.8, 21, 8.6, 4.2, plate, { ln: 0, th: [-0.7, -0.2, 0.35, 0.85] }));
  // riveted seams + rivets
  const seam = dark.c[1];
  o.push(FC(11, 11.5, 0.5, 10.4, 22.5, 0.5, seam), FC(17.2, 9.4, 0.5, 17.4, 24.2, 0.5, seam), FC(23, 11, 0.5, 23.4, 23, 0.5, seam, { al: 0 }));
  for (const [x, y] of [[10, 13], [10, 18], [10, 21], [17, 11], [17, 16], [17, 22]]) o.push(DT(x - 0.5, y, '#fff2b8', { s: 1 }), DT(x + 0.5, y + 1, dark.c[0], { s: 1 }));
  // cog (wind-up gear) on a stem, turns with t
  const gx = 15.5, gy = 6.2, gr = 3.5;
  o.push(CP(gx, gy + 2, 1.4, gx, 10.4, 1.6, MAT.steel, { ln: 0 }));
  for (let k = 0; k < 8; k++) { const an = k / 8 * 6.283 + t * 6.283; o.push(CP(gx + Math.cos(an) * gr * 0.8, gy + Math.sin(an) * gr * 0.8, 1.05, gx + Math.cos(an) * (gr + 1.2), gy + Math.sin(an) * (gr + 1.2), 0.9, MAT.gear, { ln: 0 })); }
  o.push(E(gx, gy, gr, gr, MAT.gear, { ln: 1 }), FE(gx, gy, 1.3, 1.3, '#3b2a55'), DT(gx - 0.5, gy - 0.5, '#ffffff', { s: 1 }));
  // eye (glass lens in brass ring)
  o.push(E(22.6, 14.2, 4.5, 4.5, MAT.brassL, { ln: 1 }), FE(22.6, 14.2, 3.4, 3.4, '#e6fbff'), FE(23.4, 14.6, 1.9, 2.1, a ? '#a3122e' : '#274a9c'), FE(23.7, 14.9, 1.0, 1.1, '#120824'));
  o.push(DT(21.4, 12.6, '#ffffff', { s: 1 }), DT(22.4, 12.6, '#ffffff', { s: 1 }));
  if (a) o.push(FC(18.4, 9.6, 0.7, 25.6, 12.6, 0.8, '#2a0a24'));   // angry brow
  // snout / mouth
  o.push(E(28.6, 18.6, 2.7, 2.1, plate, { ln: 1 }), FC(26.4, 19.9, 0.4, 30.6, 18.7, 0.4, '#2a1030'));
  // pectoral fin
  o.push(PG([[16, 17], [20, 20.6], [15.5, 22.6]], plate, { bev: 1.3, ln: 1 }));
  // near legs (in front)
  o.push(CP(19.5, 24, 1.5, 20.2 + lw, 29, 1.3, MAT.steel), E(21.2 + lw, 30.2, 3.1, 1.15, MAT.steel, { ln: 1 }));
  return o;
}

/** Crabbit — crab with raised pincers and long eye stalks */
function crabbitParts(P = {}) {
  const a = !!P.angry, w = P.walk || 0, t = P.t || 0;
  const body = a ? MAT.angry : MAT.crab, light = a ? MAT.angryL : MAT.crabL, dark = a ? MAT.angryD : MAT.crabD;
  const o = [];
  const lw = Math.sin(w * 6.283) * 1.6;
  // legs (3 per side)
  for (const [x, dy, k] of [[9, 0, 0], [12, 1, 1], [20, 1, 0], [23, 0, 1]]) {
    const s = x < 16 ? -1 : 1, sh = (k ? lw : -lw) * 0.6;
    o.push(CP(x, 25 + dy, 1.5, x + s * 4.5 + sh, 27.5, 1.2, dark, { ln: 0 }), CP(x + s * 4.5 + sh, 27.5, 1.2, x + s * 6.2 + sh, 30.4, 1.0, dark, { ln: 0 }));
  }
  // eye stalks (bunny-like), they lean forward (right)
  const st = Math.sin(t * 6.283) * 0.5;
  o.push(...chain([[14, 19, 1.5], [12.6, 13.4, 1.3], [13.4 + st, 8.2, 1.2]], light, { ln: 0 }));
  o.push(...chain([[18, 19, 1.5], [19.4, 12.6, 1.3], [19.8 - st, 7.4, 1.2]], light, { ln: 0 }));
  // body shell
  o.push(E(16, 23, 12.6, 6.6, body, { cast: [1, 2, 1] }));
  o.push(E(16.4, 25.5, 9.2, 3.2, light, { ln: 0, th: [-0.7, -0.2, 0.3, 0.8] }));
  // shell speckles
  for (const [x, y] of [[9, 21], [12.5, 19.6], [20, 19.8], [23.4, 21.4], [16, 20.4]]) o.push(DT(x, y, light.c[4], { s: 1 }));
  // claws: arm + pincer (two prongs)
  const claw = (cx, cy, arm0, front) => {
    const k = [];
    const m = front ? body : dark, ml = front ? light : body;
    k.push(...chain([[arm0[0], arm0[1], 2.0], [(arm0[0] + cx) / 2 + (cx < 16 ? -1 : 1), (arm0[1] + cy) / 2 + 2, 2.2], [cx, cy + 3.5, 2.6]], m, { ln: 1 }));
    const L = cx < 16 ? -1 : 1;
    k.push(E(cx, cy + 1.2, 4.2, 3.7, m, { ln: 1 }));
    k.push(PG([[cx - 3.4 * L, cy], [cx - 4.1 * L, cy - 5.6], [cx - 1.6 * L, cy - 2.2], [cx + 0.2 * L, cy - 0.6]], ml, { bev: 1.3, ln: 1 }));
    k.push(PG([[cx + 0.2 * L, cy - 0.4], [cx + 2.6 * L, cy - 6.4], [cx + 4.2 * L, cy - 4.8], [cx + 4.4 * L, cy - 0.4]], ml, { bev: 1.3, ln: 1 }));
    return k;
  };
  o.push(...claw(4.6, 11 + st, [8.4, 21], false));
  o.push(...claw(27.4, 10.4 - st, [24.0, 21], true));
  // eyes on stalks (look right)
  o.push(...eyeBall(13.4 + st, 6.6, 2.7, [0.9, 0.2], a ? '#ff3b3b' : '#2b2060'));
  o.push(...eyeBall(19.8 - st, 5.6, 2.9, [1.0, 0.2], a ? '#ff3b3b' : '#2b2060'));
  if (a) {   // angry brows + mouth
    o.push(FC(10.8, 3.4 + st, 0.6, 15.8, 5.4 + st, 0.7, '#3a0820'), FC(17, 5 - st, 0.7, 22.6, 2.6 - st, 0.6, '#3a0820'));
    o.push(FC(13.6, 25.6, 0.6, 19.6, 26.2, 0.6, '#3a0820'));
  } else {
    o.push(FC(14, 25.2, 0.5, 18.4, 25.6, 0.5, dark.c[0]), DT(18.4, 24.4, dark.c[0]));
  }
  return o;
}

/** Jellop — violet jellyfish, translucent bell, glowing core, trailing tentacles */
function jellopParts(P = {}) {
  const a = !!P.angry, t = P.t || 0, ph = t * 6.283;
  const body = a ? MAT.angry : MAT.jelly, light = a ? MAT.angryL : MAT.jellyL, core = a ? MAT.angryL : MAT.jellyCore;
  const o = [];
  // tentacles (behind): wavy chains
  for (let k = 0; k < 5; k++) {
    const x0 = 8.5 + k * 3.6, pts = [];
    for (let j = 0; j <= 5; j++) pts.push([x0 + Math.sin(ph + j * 0.9 + k * 1.3) * (0.6 + j * 0.45), 18 + j * 2.5, 1.2 - j * 0.14]);
    o.push(...chain(pts, light, { ln: 0, al: 0.9, bounce: false }));
  }
  // frilly oral arms
  for (const k of [-1, 1]) {
    const pts = []; for (let j = 0; j <= 4; j++) pts.push([16 + k * (2.2 + Math.sin(ph + j) * 1.0), 17.5 + j * 2.5, 2.0 - j * 0.3]);
    o.push(...chain(pts, core, { ln: 0, bounce: false }));
  }
  // bell
  o.push(E(16, 11.6, 12.6, 9.8, body, { cast: [0, 2, 1], gain: 0.85, bias: -0.08, th: [-0.7, -0.15, 0.42, 0.88] }));
  // lower skirt scallops
  for (let k = 0; k < 6; k++) o.push(E(6.6 + k * 3.8, 19.6 + Math.sin(ph + k) * 0.5, 2.4, 1.7, light, { ln: 1, th: [-0.7, -0.2, 0.3, 0.8] }));
  // inner glow: clover
  for (const [dx, dy] of [[-2.8, -0.6], [2.8, -0.6], [-1.4, 2.2], [1.4, 2.2]]) o.push(E(16 + dx, 11.6 + dy, 2.7, 2.4, core, { ln: 0, al: 0.8, th: [-0.8, -0.4, 0.2, 0.7] }));
  // face
  o.push(...eyeBall(10.6, 10.2, 2.4, [0.6, 0.2], a ? '#ff3b3b' : '#4b2a9c'));
  o.push(...eyeBall(21.8, 10.2, 2.6, [0.8, 0.2], a ? '#ff3b3b' : '#4b2a9c'));
  if (a) o.push(FC(7.6, 6.6, 0.6, 12.4, 8.6, 0.7, '#3a0820'), FC(24.6, 6.6, 0.6, 19.6, 8.4, 0.7, '#3a0820'));
  o.push(FC(14.4, 14.6, 0.4, 17.6, 14.6, 0.4, MAT.jelly.c[0]), DT(17.6, 13.6, MAT.jelly.c[0]));
  // bell rim light dots
  o.push(DT(7, 6, light.c[5], { s: 2 }), DT(10, 3, light.c[5], { s: 1 }));
  return o;
}

/** Springle — green seahorse drawn as ONE S-curved tube (snout -> head -> neck -> belly -> tail root) on a coiled spring */
function springleParts(P = {}) {
  const a = !!P.angry, sq = P.squash || 0;
  const body = a ? MAT.angry : MAT.sea, light = a ? MAT.angryL : MAT.seaL, fin = a ? MAT.angryD : MAT.seaFin;
  const o = [];
  // coiled spring tail: dark core + bright coils with clear gaps (helix: alternate offset)
  const top = 22.6 + sq * 1.6, bot = 30.4, n = 4, cw = 4.4 + sq * 1.0;
  o.push(CP(14.6, top - 1.6, 1.8, 14.6, bot, 1.9, MAT.steelD, { ln: 0 }));
  for (let k = 0; k < n; k++) {
    const y = lerp(top, bot, k / (n - 1)), off = k % 2 ? 0.8 : -0.8;
    o.push(E(14.6 + off, y, cw, 1.3, MAT.steel, { ln: 1, th: [-0.4, 0.1, 0.5, 0.9, 0.985] }));
  }
  // dorsal fin: three translucent-looking rays fanned on the back (seahorse tell)
  o.push(...frond(12.6, 13.6, 196 * RAD, 7.0, 3.0, 0.4, fin, fin, { n: 6, scal: 0.8, bev: 1.3 }));
  o.push(...frond(12.4, 16.8, 176 * RAD, 7.4, 3.2, 0, fin, fin, { n: 6, scal: 0.8, bev: 1.3 }));
  o.push(...frond(12.8, 20.0, 158 * RAD, 6.4, 2.8, -0.4, fin, fin, { n: 6, scal: 0.8, bev: 1.3 }));
  // pot belly + arched neck + horse head bent forward (the silhouette that says SEAHORSE)
  o.push(E(17.6, 17.8, 6.8, 6.6, body, { ln: 0, cast: [1, 2, 1] }));
  o.push(...chain([[16.8, 20.8, 5.2], [16.0, 14.6, 3.8], [17.6, 10.6, 3.3], [20.4, 8.0, 3.6]], body, { ln: 0 }));
  o.push(E(21.2, 8.0, 4.7, 4.3, body, { ln: 0, cast: [1, 1, 1] }));                  // head
  o.push(...chain([[24.4, 9.4, 2.3], [27.6, 11.0, 2.0], [30.0, 12.4, 1.55]], body, { ln: 0 }));   // tube snout bent downward
  o.push(E(30.2, 12.5, 1.7, 1.55, light, { ln: 0 }));
  // belly plates: horizontal ridge lines on a lighter belly
  o.push(E(20.6, 18.4, 3.9, 5.6, light, { ln: 0, clip: true, th: [-0.7, -0.2, 0.35, 0.82] }));
  for (let k = 0; k < 6; k++) o.push(FC(14.6, 14.4 + k * 2.1, 0.4, 24.6, 14.4 + k * 2.1 + 0.6, 0.4, body.c[1], { al: 0.9, clip: true }));
  // back spines
  for (const [x, y] of [[13.2, 12.8], [12.4, 15.8], [12.2, 19], [13, 22]]) o.push(PG([[x + 1.4, y - 1.4], [x - 2.2, y + 0.2], [x + 1.4, y + 1.6]], light, { bev: 1.0, ln: 0 }));
  // coronet on the crown: three short spikes
  for (const [an, L] of [[-92, 3.8], [-116, 4.6], [-140, 3.9]]) o.push(...frond(20.4, 4.8, an * RAD, L, 1.3, 0.2, fin, light, { n: 4, scal: 0.9, bev: 1.0 }));
  // eye + nostril
  o.push(FE(22.2, 6.8, 2.1, 2.2, a ? '#7a0a22' : '#1c1238'), DT(21.2, 5.6, '#ffffff', { s: 1 }), DT(23.2, 7.9, a ? '#ff6a6a' : '#7fb0ff', { s: 1 }));
  if (a) o.push(FC(19.4, 4.4, 0.5, 25.0, 6.2, 0.6, '#3a0820'));
  o.push(DT(30.6, 12.0, body.c[0]));
  return o;
}

/** Glimmer — cobalt anglerfish with a glowing yellow lantern */
function glimmerParts(P = {}) {
  const a = !!P.angry, t = P.t || 0, ph = t * 6.283;
  const body = a ? MAT.angry : MAT.cobalt, light = a ? MAT.angryL : MAT.cobaltL;
  const o = [];
  // tail fin
  o.push(...frond(6.6, 18.4, 188 * RAD, 7, 5.4, 0, light, null, { n: 6, scal: 0.8, bev: 1.8 }));
  o.push(...frond(6.6, 17.6, 166 * RAD, 6, 4.0, 0, light, null, { n: 6, scal: 0.8, bev: 1.8, po: { bias: -0.15 } }));
  o.push(...frond(6.6, 19.6, 212 * RAD, 6, 4.0, 0, light, null, { n: 6, scal: 0.8, bev: 1.8, po: { bias: -0.15 } }));
  // lure stalk
  o.push(...chain([[16, 10, 1.1], [20, 4.4, 1.0], [25.4, 2.8, 0.9], [28.2, 5.2, 0.8]], light, { ln: 0 }));
  // body
  o.push(E(15, 18.8, 10.6, 9.0, body, { cast: [1, 2, 1] }));
  // lower jaw + teeth
  o.push(E(22.8, 23, 7.2, 3.6, body, { ln: 1, rot: -0.1 }));
  o.push(FE(24.6, 20.8, 6.2, 2.6, '#1a0a30', { rot: -0.06 }));
  const teeth = [[19.6, 20, 0], [22.4, 19.4, 1], [25.4, 19.2, 0], [28.2, 19.6, 1]];
  for (const [x, y, k] of teeth) { o.push(FP([[x - 1.1, y], [x + 1.1, y], [x, y + 2.6 + k * 0.6]], '#f4f8ff')); }
  for (const [x, y] of [[21, 22.8], [24, 22.9], [27, 22.4]]) o.push(FP([[x - 1, y], [x + 1, y], [x, y - 2.2]], '#e2ecff'));
  // belly + fins
  o.push(E(13.4, 22.6, 7.4, 3.8, light, { ln: 0, th: [-0.7, -0.2, 0.35, 0.82] }));
  o.push(PG([[13, 17], [17.4, 21.4], [12, 23.8], [9.4, 20]], light, { bev: 1.6, ln: 1 }));
  o.push(PG([[8.6, 10.6], [11.6, 7.4], [16.4, 9]], light, { bev: 1.5, ln: 1 }));
  // glow spots along the flank (photophores)
  for (const [x, y] of [[8, 19], [10.4, 21.2], [13, 17.4], [7.6, 16]]) o.push(DT(x, y, '#fff3a6', { s: 1 }));
  // eye
  o.push(E(21, 13.6, 4.6, 4.6, MAT.white, { ln: 0, th: [-0.7, -0.15, 0.45, 0.9] }));
  o.push(FE(21.8, 14.1, 3.2, 3.4, a ? '#ff3b3b' : '#ffc83a'), FE(22.2, 14.4, 1.7, 2.0, '#120824'), DT(20.2, 12.4, '#ffffff', { s: 2 }));
  if (a) o.push(FC(16.6, 8.8, 0.8, 25, 11.2, 0.8, '#2a0a24'));
  // lantern
  const lx = 28.2, ly = 6.8 + Math.sin(ph) * 0.4;
  o.push(FE(lx, ly, 3.6, 3.6, '#ffb52e'), FE(lx, ly, 2.8, 2.8, '#ffe066'), FE(lx - 0.2, ly - 0.2, 1.6, 1.6, '#fffbd0'), DT(lx - 1.4, ly - 1.6, '#ffffff', { s: 1 }));
  return o;
}

/** Bonefin — skeletal ghost fish (translucent bone, glowing sockets) */
function bonefinParts(P = {}) {
  const t = P.t || 0, ph = t * 6.283;
  const o = [];
  const bone = MAT.bone, d = MAT.boneD;
  // ghost wisps trailing from the tail
  o.push(FC(3, 15, 1.6, -3, 17, 0.8, '#bcd8ff', { al: 0.28 }), FC(4, 18, 1.2, -2, 21, 0.6, '#bcd8ff', { al: 0.2 }), FC(4, 12, 1.2, -2, 10, 0.6, '#bcd8ff', { al: 0.2 }));
  // tail bones
  for (let k = -2; k <= 2; k++) o.push(CP(7.2, 16 + k * 0.4, 0.8, 1.6, 16 + k * 3.1 + Math.sin(ph + k) * 0.6, 0.6, bone, { ln: 0 }));
  o.push(CP(2.2, 11, 0.5, 2.2, 21.4, 0.5, d, { ln: 0 }));
  // spine
  o.push(...chain([[7.4, 16, 1.0], [12, 15.6, 1.1], [16.6, 15.4, 1.1], [20.6, 15.6, 1.2]], bone, { ln: 0 }));
  // ribs
  for (let k = 0; k < 4; k++) {
    const x = 10 + k * 3.4;
    o.push(CP(x, 15.6, 0.7, x + 1.8, 21 + (k % 2) * 0.4, 0.55, bone, { ln: 0 }), CP(x, 15.6, 0.7, x + 1.8, 10.4 - (k % 2) * 0.4, 0.55, bone, { ln: 0 }));
  }
  // dorsal spines
  for (let k = 0; k < 3; k++) o.push(CP(11 + k * 3, 11, 0.6, 9.4 + k * 3.4, 6.6 + k * 0.3, 0.4, d, { ln: 0 }));
  // skull
  o.push(E(24, 14.6, 6.6, 6.0, bone, { ln: 1, cast: [1, 2, 1] }));
  o.push(E(27.4, 18.2, 4.2, 2.4, bone, { ln: 1 }));
  o.push(FC(25.6, 19.1, 0.4, 30.4, 18.5, 0.4, '#241a4a'));
  for (const x of [26.4, 28, 29.6]) o.push(DT(x, 19.4, '#ffffff', { s: 1 }), DT(x, 20.4, bone.c[3], { s: 1 }));
  // eye socket: hollow with ghost glow
  o.push(FE(25.2, 13.6, 3.1, 3.2, '#191536'), FE(25.6, 13.9, 1.7, 1.8, '#9bffe8'), DT(25.2, 13.2, '#ffffff', { s: 1 }));
  // cranial crack
  o.push(FC(22, 9.6, 0.4, 23.6, 12, 0.4, d.c[1]));
  return o;
}
/* =====================================================================================================
 * CAST — Kraken King (96x96), food, power-ups
 * ===================================================================================================== */
function krakenParts(P = {}) {
  const a = !!P.angry, t = P.t || 0, ph = t * 6.283;
  const body = a ? MAT.angry : MAT.kraken, light = a ? MAT.angryL : MAT.krakenL;
  const o = [];
  // ---- tentacles: hand-placed curls, inner (back) arms first, outer arms last (in front). [x, y, radius]
  const ARMS = [
    [[46, 56, 7], [45, 68, 6.2], [47, 79, 5], [53, 87, 3.6], [61, 88, 2.4], [64, 83, 1.5]],
    [[40, 57, 7], [35, 69, 6.2], [36, 81, 4.8], [42, 90, 3.4], [51, 91, 2.2]],
    [[54, 57, 7], [60, 69, 6], [60, 82, 4.6], [66, 90, 3.2], [75, 88, 2.1]],
    [[31, 53, 7.4], [25, 65, 6.4], [24, 78, 5], [30, 89, 3.6], [39, 92, 2.2], [43, 87, 1.4]],
    [[65, 53, 7.4], [72, 64, 6.4], [74, 77, 5], [69, 88, 3.6], [60, 92, 2.4]],
    [[22, 46, 7.6], [13, 56, 6.6], [8, 69, 5.4], [11, 81, 4.2], [19, 87, 3], [25, 83, 1.8]],
    [[74, 46, 7.6], [83, 55, 6.6], [88, 67, 5.4], [86, 79, 4.2], [78, 86, 3], [72, 82, 1.8]],
    [[17, 38, 7], [7, 44, 6], [3, 55, 4.8], [6, 64, 3.6], [12, 66, 2.2]],
    [[79, 38, 7], [89, 44, 6], [93, 55, 4.8], [90, 64, 3.6], [84, 66, 2]],
  ];
  const wav = (pts, k) => pts.map((q, j) => [q[0] + Math.sin(ph + k * 1.3 + j * 0.9) * (j * 0.45), q[1] + Math.cos(ph * 1 + k + j) * (j * 0.25), q[2]]);
  ARMS.forEach((arm, k) => {
    const pts = wav(arm, k);
    o.push(...chain(pts, body, { ln: 1 }));
    // suckers: little pale discs along the belly side of each arm
    for (let j = 1; j < pts.length - 1; j++) {
      const q = pts[j], nx = pts[j + 1][0] - pts[j - 1][0], ny = pts[j + 1][1] - pts[j - 1][1], L = Math.hypot(nx, ny) || 1;
      const sx = q[0] + (ny / L) * q[2] * 0.42 * (k % 2 ? -1 : 1), sy = q[1] - (nx / L) * q[2] * 0.42 * (k % 2 ? -1 : 1);
      o.push(E(sx, sy, Math.max(1.3, q[2] * 0.32), Math.max(1.2, q[2] * 0.28), MAT.krakenSucker, { ln: 0, th: [-0.8, -0.3, 0.3, 0.8] }));
    }
  });
  // ---- mantle / head dome
  o.push(E(48, 36, 31, 29, body, { cast: [2, 4, 1], dw: 0.08 }));
  // spots
  for (const [x, y, r] of [[30, 22, 3.2], [40, 14, 2.4], [58, 18, 3.0], [66, 30, 2.6], [26, 38, 2.2], [70, 42, 2.4], [48, 24, 1.8], [36, 30, 1.6]]) {
    o.push(FE(x, y, r, r * 0.85, body.c[1], { al: 0.7 }));
    o.push(FE(x - r * 0.3, y - r * 0.3, r * 0.45, r * 0.4, light.c[3], { al: 0.6 }));
  }
  // brow ridges (angry)
  o.push(CP(22, 31, 3.4, 40, 38.5, 3.0, body, { ln: 1, bias: -0.2 }), CP(74, 31, 3.4, 56, 38.5, 3.0, body, { ln: 1, bias: -0.2 }));
  // eyes
  const eye = (cx, cy, dir) => {
    const k = [];
    k.push(E(cx, cy, 9.2, 8.4, MAT.gold, { ln: 1, th: [-0.6, -0.1, 0.45, 0.88] }));
    k.push(FE(cx + dir * 1.6, cy + 1, 3.0, 6.2, '#2a0a2a'), FE(cx + dir * 1.6, cy + 1, 1.2, 4.6, a ? '#ff3b3b' : '#5a1a5a'));
    k.push(DT(cx - 5, cy - 5, '#ffffff', { s: 3 }), DT(cx + 3, cy + 3.5, '#fff6c0', { s: 1 }));
    // upper lid (heavy, angry)
    k.push(PG([[cx - 10, cy - 1.2], [cx - 7, cy - 8.4], [cx + 7, cy - 8.4], [cx + 10, cy - 1.2], [cx + 6, cy - 4.6 + dir * 1.4], [cx - 6, cy - 4.6 - dir * 1.4]], body, { bev: 1.6, ln: 1, bias: -0.1 }));
    return k;
  };
  o.push(...eye(35.5, 42, 1), ...eye(60.5, 42, -1));
  // nose bumps + mouth with fangs
  o.push(E(48, 49.5, 3, 2, body, { ln: 1 }));
  o.push(FE(48, 57.6, 11, 3.6, '#1c0a30'), FE(48, 58.8, 6.8, 1.6, '#e0527a'));
  for (const x of [40.6, 45, 51, 55.4]) o.push(FP([[x - 1.6, 55], [x + 1.6, 55], [x, 60.4]], '#f6f2ff'));
  // ---- crown
  const cy0 = 12;
  o.push(PG([[28, cy0 + 8], [29.6, cy0 - 5], [37, cy0 + 1], [41, cy0 - 9], [48, cy0 - 1], [55, cy0 - 9], [59, cy0 + 1], [66.4, cy0 - 5], [68, cy0 + 8]], MAT.gold, { bev: 2.4, ln: 1 }));
  o.push(PG([[28, cy0 + 4.2], [68, cy0 + 4.2], [68.4, cy0 + 9.4], [27.6, cy0 + 9.4]], MAT.gold, { bev: 1.8, ln: 1, bias: -0.1 }));
  for (const [x, y, m] of [[29.6, cy0 - 3.4, MAT.ruby], [41, cy0 - 6.4, MAT.cyanGem], [48, cy0 + 1.2, MAT.ruby], [55, cy0 - 6.4, MAT.cyanGem], [66.4, cy0 - 3.4, MAT.ruby]]) o.push(E(x, y, 2.4, 2.4, m, { ln: 1, th: [-0.8, -0.3, 0.3, 0.8] }));
  o.push(E(48, cy0 + 6.8, 3.4, 2.5, MAT.cyanGem, { ln: 1, th: [-0.8, -0.3, 0.3, 0.8] }), DT(46.6, cy0 + 5.4, '#ffffff', { s: 1 }));
  for (const x of [34, 40, 56, 62]) o.push(DT(x, cy0 + 6.4, MAT.gold.c[0], { s: 1 }), DT(x, cy0 + 5.4, MAT.gold.c[5], { s: 1 }));
  return o;
}

/** Sushi (nigiri): glossy salmon draped over rice, nori belt, wasabi dab, wooden board. */
function sushiParts() {
  const o = [];
  const wood = MAT.wood, rice = MAT.rice, fish = MAT.salmon, nori = MAT.nori;
  o.push(E(16, 28.2, 14.4, 2.9, wood, { ln: 1, th: [-0.7, -0.2, 0.4, 0.85] }));
  o.push(FC(5, 27.6, 0.4, 27, 27.6, 0.4, wood.c[4], { al: 0.75 }));
  // rice block (front face visible below the fish)
  o.push(E(16, 22.4, 11.2, 5.6, rice, { ln: 0, cast: [1, 2, 1], th: [-0.6, -0.1, 0.45, 0.85], dw: 0.1 }));
  for (const [x, y] of [[8, 24], [11.5, 25.6], [15.5, 26], [20, 25.4], [23.5, 24], [9.5, 22.2], [22.8, 22]]) o.push(DT(x, y, rice.c[1], { s: 1 }), DT(x - 0.5, y - 1, '#ffffff', { s: 1 }));
  // salmon slice
  o.push(E(16, 17.6, 13.2, 6.2, fish, { ln: 1, rot: -0.03, th: [-0.55, 0.0, 0.5, 0.88, 0.985], dw: 0.07, cast: [1, 2, 1] }));
  for (const [x0, y0, x1, y1] of [[6.4, 19.6, 11.6, 13.8], [11, 21.2, 17.6, 14.2], [16.6, 21.6, 22.4, 15.2], [21.2, 20.4, 25.6, 16.4]]) o.push(FC(x0, y0, 0.55, x1, y1, 0.45, '#ffd9c8', { al: 0.5 }));
  // nori belt
  o.push(PG([[13.6, 10.8], [18.6, 10.6], [19.2, 26.2], [12.8, 26.2]], nori, { bev: 1.4, ln: 1, th: [-0.5, 0.0, 0.5, 0.9] }));
  // wasabi + gloss
  o.push(E(22.4, 13, 2.2, 1.4, MAT.wasabi, { ln: 0 }));
  o.push(DT(8.6, 13.2, '#ffffff', { s: 2 }), DT(10.6, 12.4, '#ffe9dc', { s: 1 }), DT(24, 17.4, '#ffd0b8', { s: 1 }));
  return o;
}
/** Pearl power-up (pu_pink): glossy pearl in a scallop shell. */
function pearlParts(tint = 'pink') {
  const o = [];
  const sh = MAT.shell, pr = tint === 'pink' ? MAT.pearlPink : tint === 'blue' ? MAT.pearlBlue : MAT.pearlGold;
  // scallop fan
  for (let k = -3; k <= 3; k++) { const an = (-90 + k * 22) * RAD; o.push(CP(16, 26, 2.2, 16 + Math.cos(an) * 12.6, 26 + Math.sin(an) * 9.6, 2.5, sh, { ln: 1 })); }
  o.push(E(16, 27, 6, 3, sh, { ln: 1 }));
  o.push(E(16, 15.6, 8.2, 8.2, pr, { ln: 1, th: [-0.7, -0.15, 0.45, 0.88, 0.985], dw: 0.06, cast: [1, 2, 1] }));
  o.push(DT(11.6, 10.6, '#ffffff', { s: 2 }), DT(13.6, 9.8, '#ffffff', { s: 1 }), DT(19.6, 20.6, '#ffe9f6', { s: 1 }));
  return o;
}
function initItemMaterials() {
  MAT.wood = makeRamp('#b9763c', { cool: 285, warm: 48 });
  MAT.rice = rampFrom(['#4a3a6a', '#a898c0', '#eadfe0', '#fff4ea', '#ffffff', '#ffffff']);
  MAT.salmon = rampFrom(['#4a1238', '#a02a52', '#ff6a50', '#ff9468', '#ffc08a', '#fff0d0']);
  MAT.nori = rampFrom(['#07151c', '#0f3a38', '#1f6a52', '#3a9068', '#5cb888', '#9fe8bc']);
  MAT.wasabi = makeRamp('#9ae04a', { cool: 170 });
  MAT.shell = makeRamp('#ff9a8a', { cool: 300, warm: 40 });
  MAT.pearlPink = makeRamp('#ffc4e6', { cool: 290 });
  MAT.pearlBlue = makeRamp('#bfe6ff', { cool: 250 });
  MAT.pearlGold = makeRamp('#ffe9a8', { cool: 30 });
}

/* ---- sprite cache + canvas padding (characters: 40x40 canvas, box origin (4,8): room for gills/steam/lures) ---- */
const SPR_CACHE = new Map();
function charSprite(kind, pose = {}, opts = {}) {
  const key = kind + '|' + JSON.stringify(pose) + '|' + JSON.stringify(opts);
  if (SPR_CACHE.has(key)) return SPR_CACHE.get(key);
  const sc = opts.scale || 1;
  const builders = { fizz: () => playerParts('p1', pose), pop: () => playerParts('p2', pose), nibbler: () => nibblerParts(pose), crabbit: () => crabbitParts(pose),
    jellop: () => jellopParts(pose), springle: () => springleParts(pose), glimmer: () => glimmerParts(pose), bonefin: () => bonefinParts(pose),
    sushi: () => sushiParts(), pearl: () => pearlParts(pose.tint) };
  let parts, w = 40, h = 40, ox = 4, oy = 8;
  if (kind === 'kraken') { parts = krakenParts(pose); w = 104; h = 100; ox = 4; oy = 2; }
  else parts = builders[kind]();
  if (opts.sx || opts.sy) parts = deformParts(parts, opts.sx || 1, opts.sy || 1, opts.px ?? 16, opts.py ?? 31);
  if (opts.rot) parts = rotateParts(parts, opts.rot, opts.px ?? 16, opts.py ?? 31);
  const W = Math.ceil(w * sc), H = Math.ceil(h * sc);
  const res = sculpt(W, H, parts, { ox, oy, scale: sc, flip: opts.flip, outline: opts.outline });
  const sp = { canvas: res.canvas, ox: ox * sc, oy: oy * sc, w: W, h: H, S: res.S };
  SPR_CACHE.set(key, sp); return sp;
}
/** Draw a sprite so that its 32x32 box top-left lands at (bx, by) (internal px). */
function blit(ctx, sp, bx, by, alpha = 1) {
  if (alpha < 1) { ctx.globalAlpha = alpha; }
  ctx.drawImage(sp.canvas, Math.round(bx - sp.ox), Math.round(by - sp.oy));
  if (alpha < 1) ctx.globalAlpha = 1;
}
/* =====================================================================================================
 * BUBBLES — drawBubble(kind): ring + tinted body + refraction crescent + specular arc, per-pixel, cached
 * ===================================================================================================== */
const BUB = {
  aqua:    { rim: [150, 238, 255], rim2: [255, 170, 224], fill: [90, 205, 255], fa: 0.11, deep: [30, 110, 170] },
  yellow:  { rim: [255, 226, 120], rim2: [255, 150, 90], fill: [255, 214, 90], fa: 0.09, deep: [160, 100, 20] },
  red:     { rim: [255, 130, 120], rim2: [255, 90, 140], fill: [255, 70, 70], fa: 0.24, deep: [150, 30, 50] },
  thunder: { rim: [255, 244, 150], rim2: [140, 220, 255], fill: [255, 240, 170], fa: 0.10, deep: [170, 120, 20] },
  fire:    { rim: [255, 190, 110], rim2: [255, 100, 90], fill: [255, 130, 50], fa: 0.24, deep: [150, 50, 20] },
  water:   { rim: [140, 200, 255], rim2: [190, 150, 255], fill: [60, 130, 255], fa: 0.26, deep: [20, 60, 170] },
  letter:  { rim: [200, 170, 255], rim2: [255, 150, 220], fill: [150, 100, 255], fa: 0.30, deep: [70, 40, 150] },
};
const BUB_CACHE = new Map();
function bubbleSprite(rx, ry, tint = 'aqua') {
  const key = rx.toFixed(1) + '|' + ry.toFixed(1) + '|' + tint;
  if (BUB_CACHE.has(key)) return BUB_CACHE.get(key);
  const T = BUB[tint] || BUB.aqua;
  const w = Math.ceil(rx * 2 + 4), h = Math.ceil(ry * 2 + 4), cx = w / 2, cy = h / 2;
  const [cv, cx2] = mkCanvas(w, h); const img = cx2.createImageData(w, h), d = img.data;
  const put = (x, y, c, a) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= w || y >= h) return; const i = (y * w + x) * 4; const ea = d[i + 3] / 255; const na = a + ea * (1 - a); if (na <= 0) return; for (let k = 0; k < 3; k++) d[i + k] = (c[k] * a + d[i + k] * ea * (1 - a)) / na; d[i + 3] = na * 255; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = x + 0.5 - cx, py = y + 0.5 - cy;
    const u = px / rx, v = py / ry, r = Math.hypot(u, v);
    if (r > 1) continue;
    const edge = (1 - r) * Math.min(rx, ry);        // distance (px) from the boundary
    const br = clamp((u + v) * 0.7071, -1, 1);       // bottom-right-ness
    // body
    let a = T.fa; let col = T.fill;
    a += 0.20 * smoothstep(0.35, 0.95, br) * smoothstep(0.55, 0.92, r);      // refraction crescent bottom-right
    a += 0.06 * smoothstep(-0.2, -0.9, br);                                  // soft glare top-left
    a = Math.round(a * 8) / 8;
    put(x, y, col, a);
    if (edge < 1.2) {                // outline (deep, thin)
      put(x, y, T.deep, 0.55);
    } else if (edge < 2.5) {         // bright rim, hue-shifted toward warm on the shadow side
      const m = smoothstep(0.0, 0.9, br);
      const rc = mixc(T.rim, T.rim2, m * 0.85);
      const al = edge < 2.0 ? 0.95 : 0.5;
      put(x, y, rc, al * (0.75 + 0.25 * (1 - m)));
    }
  }
  // specular arc (top-left) + glints
  const R = Math.min(rx, ry);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = x + 0.5 - cx, py = y + 0.5 - cy, dist = Math.hypot(px / rx, py / ry) * R;
    const ang = Math.atan2(py / ry, px / rx) / RAD;
    if (Math.abs(dist - R * 0.70) < 0.95 && ang > -168 && ang < -102) put(x, y, [255, 255, 255], ang < -150 || ang > -112 ? 0.55 : 0.95);
  }
  if (R >= 8) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {      // faint second reflection, bottom-right, tinted by the rim's warm shift
    const px = x + 0.5 - cx, py = y + 0.5 - cy, dist = Math.hypot(px / rx, py / ry) * R, ang = Math.atan2(py / ry, px / rx) / RAD;
    if (Math.abs(dist - R * 0.76) < 0.62 && ang > 18 && ang < 74) put(x, y, mixc(T.rim2, [255, 255, 255], 0.45), 0.5 * smoothstep(18, 40, ang) * (1 - smoothstep(58, 74, ang)));
  }
  const gx = Math.round(cx - R * 0.46), gy = Math.round(cy - R * 0.50);
  if (R >= 7) { put(gx, gy, [255, 255, 255], 1); put(gx + 1, gy, [255, 255, 255], 1); put(gx, gy + 1, [255, 255, 255], 0.9); put(gx + 1, gy + 1, [220, 245, 255], 0.7); }
  put(Math.round(cx + R * 0.46), Math.round(cy + R * 0.50), [255, 255, 255], 0.75);
  if (R >= 12) put(Math.round(cx + R * 0.38), Math.round(cy + R * 0.58), [200, 245, 255], 0.55);
  cx2.putImageData(img, 0, 0);
  BUB_CACHE.set(key, cv); return cv;
}
/** drawBubble(ctx, cx, cy, diameter, kind, t, opts) — wobble via t (seconds). opts: {inner(enemy sprite builder), tint}. */
function drawBubble(ctx, cx, cy, d, kind = 'empty', t = 0, o = {}) {
  const tint = { empty: 'aqua', trap0: 'aqua', trap1: 'yellow', trap2: 'red', warn: 'red', thunder: 'thunder', fire: 'fire', water: 'water', letter: 'letter' }[kind] || 'aqua';
  const wob = Math.sin(t * 5.1 + (o.phase || 0)) * 0.045, wob2 = Math.cos(t * 4.3 + (o.phase || 0)) * 0.03;
  const rx = d / 2 * (1 + wob), ry = d / 2 * (1 - wob + wob2);
  const sp = bubbleSprite(Math.round(rx * 2) / 2, Math.round(ry * 2) / 2, tint);
  const x = Math.round(cx - sp.width / 2), y = Math.round(cy - sp.height / 2);
  if (o.under) o.under(ctx, cx, cy);                        // content drawn inside the bubble (enemy / icon)
  ctx.drawImage(sp, x, y);
}

/* ---- icons that live inside special bubbles (sculpted, 24x24) ---- */
function iconSprite(kind, sc = 1) {
  const key = 'icon:' + kind + sc; if (SPR_CACHE.has(key)) return SPR_CACHE.get(key);
  let parts = [];
  if (kind === 'thunder') {
    parts = [PG([[13.6, 2], [6, 13], [11, 13.2], [8.6, 22], [18.6, 9.8], [13, 9.6], [16.4, 2]], MAT.bolt, { bev: 1.6, ln: 0, th: [-0.5, 0, 0.42, 0.8, 0.97] }),
      FP([[12.6, 5], [9.4, 11.4], [12, 11.6]], '#fffdf0', { al: 0.85 })];
  } else if (kind === 'fire') {
    parts = [PG([[12, 1.5], [17.6, 9], [18.6, 15.2], [12, 22.5], [5.4, 15.2], [6.6, 9.4], [9.6, 12], [10, 6]], MAT.flame, { bev: 2.4, ln: 0, th: [-0.5, 0, 0.45, 0.85] }),
      PG([[12, 10], [15.2, 15.6], [12, 21], [8.8, 15.6]], MAT.flameIn, { bev: 1.8, ln: 0 }), FE(12, 17.6, 2.0, 2.8, '#fff6c8')];
  } else if (kind === 'water') {
    parts = [PG([[12, 1.6], [18.6, 13], [17.4, 19], [12, 22.6], [6.6, 19], [5.4, 13]], MAT.drop, { bev: 3.2, ln: 0, th: [-0.55, 0, 0.45, 0.85] }),
      DT(8.4, 13, '#ffffff', { s: 2 }), DT(9.4, 16.4, '#d6f0ff', { s: 1 })];
  }
  const W = Math.ceil(24 * sc), res = sculpt(W, W, parts, { scale: sc });
  const sp = { canvas: res.canvas, ox: W / 2, oy: W / 2, w: W, h: W }; SPR_CACHE.set(key, sp); return sp;
}
function drawArc(ctx, x0, y0, x1, y1, seed, col = '255,248,190') {   // jagged electric arc, 1px
  const rnd = mulberry(seed), n = 7; let px = x0, py = y0;
  for (let i = 1; i <= n; i++) {
    const f = i / n, tx = lerp(x0, x1, f) + (rnd() - 0.5) * 5 * (1 - Math.abs(f - 0.5) * 1.2), ty = lerp(y0, y1, f) + (rnd() - 0.5) * 5 * (1 - Math.abs(f - 0.5) * 1.2);
    const steps = Math.ceil(Math.max(Math.abs(tx - px), Math.abs(ty - py)));
    for (let k = 0; k <= steps; k++) { const f2 = steps ? k / steps : 0; ctx.fillStyle = `rgba(${col},${0.95 - f * 0.4})`; ctx.fillRect(Math.round(lerp(px, tx, f2)), Math.round(lerp(py, ty, f2)), 1, 1); }
    px = tx; py = ty;
  }
}
function drawVibe(ctx, cx, cy, r, dir, col = '255,226,120') {          // "about to burst" shake marks beside a bubble
  for (let k = 0; k < 3; k++) {
    const rr = r + 3 + k * 3, a0 = -0.5 + k * 0.05, a1 = 0.5 - k * 0.05;
    for (let a = a0; a <= a1; a += 0.09) { ctx.fillStyle = `rgba(${col},${0.9 - k * 0.25})`; ctx.fillRect(Math.round(cx + dir * Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr), 1, 1); }
  }
}
function initBubbleMaterials() {
  MAT.bolt = makeRamp('#ffd23a', { cool: 25, warm: 55 });
  MAT.flame = makeRamp('#ff7a22', { cool: 330, warm: 52 });
  MAT.flameIn = makeRamp('#ffd23a', { cool: 20, warm: 60 });
  MAT.drop = makeRamp('#3d8cff', { cool: 250, warm: 190 });
}

/* ---- little FX: spray, droplets, dust puffs, steam, sparkles ---- */
function drawDust(ctx, x, y, age, dir = 1) {   // dust puff behind a foot, age 0..1
  const n = 3;
  for (let i = 0; i < n; i++) {
    const a = age + i * 0.12, r = 2 + a * 4.5 - i * 0.5; if (r <= 0.6) continue;
    const px = x - dir * (i * 4 + a * 7), py = y - a * 5 - i * 0.8;
    const al = clamp(0.7 - a * 0.7, 0, 0.7);
    ctx.fillStyle = `rgba(210,235,255,${al})`;
    pixelDisc(ctx, px, py, r);
    ctx.fillStyle = `rgba(255,255,255,${al * 0.9})`; pixelDisc(ctx, px - r * 0.3, py - r * 0.3, r * 0.45);
  }
}
function pixelDisc(ctx, cx, cy, r) {
  const x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r), y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
  for (let y = y0; y <= y1; y++) { let run = -1; for (let x = x0; x <= x1 + 1; x++) { const inside = x <= x1 && (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r; if (inside && run < 0) run = x; if (!inside && run >= 0) { ctx.fillRect(run, y, x - run, 1); run = -1; } } }
}
function drawDroplets(ctx, cx, cy, n, spread, seed, col = '200,240,255') {
  const rnd = mulberry(seed);
  for (let i = 0; i < n; i++) {
    const a = rnd() * 6.283, d = spread * (0.5 + rnd() * 0.8), x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d + d * 0.15;
    ctx.fillStyle = `rgba(${col},${0.65 + rnd() * 0.3})`;
    const s = rnd() < 0.3 ? 2 : 1; ctx.fillRect(Math.round(x), Math.round(y), s, s);
    if (s === 2) { ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); }
  }
}
function drawSparkle(ctx, x, y, r, col = '#ffffff', a = 1) {   // 4-point star glint: 2x2 core + 1px arms, pixel crisp
  const X = Math.round(x), Y = Math.round(y);
  ctx.globalAlpha = a; ctx.fillStyle = col;
  ctx.fillRect(X - 1, Y - 1, 2, 2);
  for (let i = 1; i <= r; i++) { ctx.fillRect(X - 1 - i, Y - 1, 1, 1); ctx.fillRect(X + 1 + i - 1, Y, 1, 1); ctx.fillRect(X, Y - 1 - i, 1, 1); ctx.fillRect(X - 1, Y + i, 1, 1); }
  ctx.globalAlpha = 1;
}
function drawSteam(ctx, x, y, t) {   // angry steam: puffs blown out sideways from both cheeks, rising a little (translucent, pale pink-white)
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    const a = ((t * 0.9 + i * 0.34 + (side > 0 ? 0.17 : 0)) % 1), r = 2.0 + a * 3.2;
    const px = x + side * (11 + a * 12), py = y + 4 - a * 11 + Math.sin(a * 6 + i) * 1.2, al = (1 - a) * 0.9;
    ctx.fillStyle = `rgba(255,208,220,${al})`; pixelDisc(ctx, px, py, r); pixelDisc(ctx, px + side * r * 0.6, py + 1, r * 0.7);
    ctx.fillStyle = `rgba(255,255,255,${al * 0.9})`; pixelDisc(ctx, px - r * 0.3, py - r * 0.35, r * 0.45);
  }
}
/* =====================================================================================================
 * WORLD — theme palette, background (3 parallax layers), autotiled coral masonry, caustics
 * ===================================================================================================== */
const THEME = {
  name: 'Coral Reef',
  bg: ['#1b4f80', '#17426f', '#13315c', '#102a52', '#0d1f45', '#0b1736'],        // dithered water gradient (top -> bottom)
  stone: null, moss: null,
};
function initWorldMaterials() {
  THEME.stone = makeRamp('#84506c', { cool: 285, warm: 28 });
  THEME.stoneAlt = makeRamp('#774e7c', { cool: 280, warm: 24 });
  THEME.stonePeach = makeRamp('#8e5668', { cool: 290, warm: 36 });
  THEME.moss = rampFrom(['#0e3b44', '#1a6e72', '#2da58f', '#5fdcbc', '#a4f4de', '#d8fff4']);
  THEME.towerA = makeRamp('#2a4f8a', { cool: 262, warm: 220 });
  THEME.kelp = makeRamp('#176a66', { cool: 230, warm: 100 });
  THEME.coralFar = makeRamp('#8e3a6e', { cool: 290, warm: 20 });
  THEME.coralFar2 = makeRamp('#c25a62', { cool: 300, warm: 30 });
  THEME.kelpLeaf = makeRamp('#2a8f78', { cool: 225, warm: 110 });
  THEME.polypPink = makeRamp('#e0507c', { cool: 295, warm: 36 });
  THEME.polypOrange = makeRamp('#ff8a4a', { cool: 300, warm: 50 });
  THEME.polypTip = makeRamp('#f2b4b4', { cool: 300 });
  THEME.glowTip = makeRamp('#ffb0c8', { cool: 300 });
}
const rampCol = (ramp, f, x, y) => ramp.c[clamp(Math.floor(f + 0.5), 0, ramp.c.length - 1)];   // clean hard steps (no ordered dither)

/* ---------- background ---------- */
function drawBgGradient(ctx, w, h, top = 0, bot = h) {
  // 12 hue-stepped water bands whose edges are warped by low-frequency noise (painted, not dithered)
  const stops = THEME.bg.map(hex2rgb), NB = 12, bands = [];
  for (let k = 0; k < NB; k++) { const t = k / (NB - 1) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(t)); bands.push(mixc(stops[i], stops[i + 1], t - i)); }
  const img = ctx.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) {
    const base = clamp((y - top) / (bot - top), 0, 1) * (NB - 1);
    for (let x = 0; x < w; x++) {
      const warp = (vnoise(x * 0.012, y * 0.045, 13) - 0.5) * 1.5 + (vnoise(x * 0.04, y * 0.11, 17) - 0.5) * 0.5;
      const c = bands[clamp(Math.floor(base + warp + 0.5), 0, NB - 1)], k = (y * w + x) * 4;
      d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Far layer: huge sunken tower silhouettes (atmospheric perspective: low contrast, cool haze). Clean banded shading, no dither. */
function drawFarTowers(ctx, t, o = {}) {
  const R = THEME.towerA;
  const [tc, tx] = mkCanvas(IW, IH);
  const px = (x, y, w, h, c) => { tx.fillStyle = rgb2hex(c); tx.fillRect(x, y, w, h); };
  const tower = (cx, base, tiers, lean = 0) => {
    let y = base;
    tiers.forEach((tr, k) => {
      const w = tr.w, h = tr.h, x0 = Math.round(cx - w / 2 + lean * k), y0 = y - h;
      px(x0, y0, w, h, R.c[1]);                              // body
      px(x0, y0, Math.max(3, w >> 3), h, R.c[2]);            // lit left flank
      px(x0 + w - Math.max(4, w >> 3), y0, Math.max(4, w >> 3), h, R.c[0]);   // shaded right flank
      px(x0, y0, w, 2, R.c[3]);                              // lit cornice
      px(x0, y0 + 2, w, 1, R.c[2]);
      for (let ry = y0 + 14; ry < y - 3; ry += 14) px(x0, ry, w, 1, R.c[0]);   // masonry courses
      // crenellations
      for (let m = 2; m < w - 4; m += 8) { px(x0 + m, y0 - 4, 4, 4, R.c[1]); px(x0 + m, y0 - 4, 4, 1, R.c[3]); px(x0 + m, y0 - 3, 1, 3, R.c[2]); }
      // dark arched openings with a faint cold glow inside
      const nwin = Math.max(1, Math.floor((w - 14) / 24));
      for (let wi = 0; wi < nwin; wi++) {
        const wx = Math.round(x0 + (w - nwin * 24 + 24 - 8) / 2 + wi * 24), wy = y0 + 18;
        for (let yy = 0; yy < 14; yy++) for (let xx = 0; xx < 8; xx++) {
          if (yy < 4 && Math.hypot(xx - 3.5, yy - 4) > 4.1) continue;
          px(wx + xx, wy + yy, 1, 1, yy > 9 ? [20, 56, 92] : R.c[0]);
        }
        px(wx, wy + 14, 8, 1, R.c[3]);
      }
      y = y0;
    });
    // spire
    const topw = tiers[tiers.length - 1].w;
    for (let i = 0; i < 26; i++) { const ww = Math.max(1, Math.round((topw * 0.6) * (1 - i / 26))); const xs = Math.round(cx + lean * 3 - ww / 2); px(xs, y - 4 - i, ww, 1, R.c[1]); px(xs, y - 4 - i, Math.min(ww, 2), 1, R.c[2]); }
  };
  tower(92, 392, [{ w: 74, h: 120 }, { w: 58, h: 96 }, { w: 40, h: 80 }], 1);
  tower(256, 430, [{ w: 110, h: 150 }, { w: 90, h: 120 }, { w: 70, h: 110 }, { w: 50, h: 100 }], 0);
  tower(430, 400, [{ w: 80, h: 110 }, { w: 60, h: 100 }, { w: 44, h: 80 }], -1);
  // ruined bridge arches between towers
  for (const [x0, x1, y0] of [[126, 218, 282], [294, 392, 270]]) for (let x = x0; x <= x1; x++) { const u = (x - x0) / (x1 - x0), yy = y0 - Math.sin(u * Math.PI) * 18; px(x, Math.round(yy), 1, 6, R.c[1]); px(x, Math.round(yy), 1, 1, R.c[2]); }
  // haze: banded fade into the water colour at the top, a dark foot at the bottom
  tx.globalCompositeOperation = 'source-atop';
  const g = tx.createLinearGradient(0, 0, 0, IH);
  g.addColorStop(0, 'rgba(27,79,128,0.80)'); g.addColorStop(0.32, 'rgba(23,66,111,0.28)'); g.addColorStop(0.7, 'rgba(19,49,92,0.38)'); g.addColorStop(1, 'rgba(11,23,54,0.88)');
  tx.fillStyle = g; tx.fillRect(0, 0, IW, IH);
  tx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = o.alpha ?? 0.9; ctx.drawImage(tc, 0, 0); ctx.globalAlpha = 1;
}

/** Mid layer: leafy kelp, sea fans, tube sponges and fish schools (sculpted, dark + desaturated so they sit behind the action). */
function kelpSprite(seed, h, sway) {
  const key = 'kelp' + seed + '|' + h + '|' + sway.toFixed(2); if (SPR_CACHE.has(key)) return SPR_CACHE.get(key);
  const rnd = mulberry(seed), W = 40, parts = [], pts = [];
  const n = 8;
  for (let j = 0; j <= n; j++) { const f = j / n; pts.push([W / 2 + Math.sin(f * 3.1 + seed) * 3.6 * f + sway * f * f * 5, h - 3 - f * (h - 8), 2.1 - f * 1.0]); }
  parts.push(...chain(pts, THEME.kelp, { ln: 0, th: [-0.6, -0.1, 0.5, 0.9] }));
  for (let j = 1; j < n; j++) {
    const q = pts[j], dir = Math.atan2(pts[j + 1][1] - pts[j - 1][1], pts[j + 1][0] - pts[j - 1][0]), side = j % 2 ? 1 : -1;
    const L = 9 + rnd() * 5 - j * 0.4;
    parts.push(...frond(q[0], q[1], dir + side * (1.1 + rnd() * 0.25), L, 2.5, side * 1.6, THEME.kelpLeaf, THEME.kelpLeaf, { n: 6, scal: 0.5, bev: 1.4 }));
  }
  const res = sculpt(W, h, parts, { rim: false });
  const sp = { canvas: res.canvas, w: W, h }; SPR_CACHE.set(key, sp); return sp;
}
function fanSprite(seed, sc, ramp) {
  const key = 'fan' + seed + '|' + sc; if (SPR_CACHE.has(key)) return SPR_CACHE.get(key);
  const rnd = mulberry(seed), parts = [];
  for (let k = -5; k <= 5; k++) {
    const an = (-90 + k * 14 + (rnd() - 0.5) * 5) * RAD, L = (24 - Math.abs(k) * 1.8) * sc;
    const mid = [28 + Math.cos(an) * L * 0.55 + (rnd() - 0.5) * 2, 52 + Math.sin(an) * L * 0.55];
    parts.push(...chain([[28, 52, 2.2 * sc], mid.concat(1.6 * sc), [28 + Math.cos(an) * L, 52 + Math.sin(an) * L, 0.9 * sc]], ramp, { ln: 0 }));
  }
  parts.push(E(28, 53, 5.5 * sc, 3 * sc, ramp, { ln: 1 }));
  const res = sculpt(56, 58, parts, { rim: false });
  const sp = { canvas: res.canvas }; SPR_CACHE.set(key, sp); return sp;
}
function spongeSprite(seed, ramp) {
  const key = 'sponge' + seed; if (SPR_CACHE.has(key)) return SPR_CACHE.get(key);
  const rnd = mulberry(seed), parts = [];
  for (let k = 0; k < 4; k++) { const x = 8 + k * 6 + rnd() * 2, h = 12 + rnd() * 12; parts.push(CP(x, 34, 2.8, x + (rnd() - 0.5) * 3, 34 - h, 2.6, ramp, { ln: 1 }), E(x + 0.2, 34 - h, 2.6, 1.3, THEME.glowTip, { ln: 0 })); }
  const res = sculpt(38, 38, parts, { rim: false });
  const sp = { canvas: res.canvas }; SPR_CACHE.set(key, sp); return sp;
}
function drawFish(ctx, x, y, dir, col) {   // 9x5 silhouette with a forked tail
  const rows = ['..XXXX...', '.XXXXXX.X', 'XXXXXXXXX', '.XXXXXX.X', '..XXXX...'];
  ctx.fillStyle = col;
  rows.forEach((r, j) => { for (let i = 0; i < 9; i++) if (r[i] === 'X') ctx.fillRect(x + (dir > 0 ? i : 8 - i), y + j, 1, 1); });
}
function drawFishSchool(ctx, cx, cy, n, seed, t, col) {
  const rnd = mulberry(seed);
  for (let i = 0; i < n; i++) { const ox = (rnd() - 0.5) * 80, oy = (rnd() - 0.5) * 30, ph = rnd() * 6.28; drawFish(ctx, Math.round(cx + ox + Math.sin(t * 0.7 + ph) * 4), Math.round(cy + oy + Math.cos(t * 0.9 + ph) * 2), 1, col); }
}
function drawMidReef(ctx, t, o = {}) {
  const layout = o.layout || 'play';
  const put = (sp, x, y) => ctx.drawImage(sp.canvas, Math.round(x), Math.round(y));
  drawFishSchool(ctx, 110, 168, 4, 4, t, 'rgba(78,140,200,0.55)');
  drawFishSchool(ctx, 410, 250, 3, 9, t + 2, 'rgba(78,140,200,0.5)');
  if (layout === 'play') {
    put(kelpSprite(1, 90, Math.sin(t * 1.0)), 150, 432 - 90 + 3); put(kelpSprite(2, 64, Math.sin(t * 1.2 + 1)), 168, 432 - 64 + 3);
    put(kelpSprite(3, 80, Math.sin(t * 0.9 + 2)), 296, 432 - 80 + 3); put(kelpSprite(4, 54, Math.sin(t * 1.1 + 3)), 312, 432 - 54 + 3);
    put(fanSprite(7, 1.0, THEME.coralFar2), 196, 432 - 54); put(fanSprite(5, 0.85, THEME.coralFar), 340, 432 - 46);
    put(spongeSprite(3, THEME.coralFar), 372, 432 - 34 + 1);
    put(fanSprite(9, 0.7, THEME.coralFar), 34, 330 - 40);
  } else {
    put(kelpSprite(1, 90, Math.sin(t * 1.0)), 40, 416 - 90 + 4); put(kelpSprite(2, 66, Math.sin(t * 1.2)), 60, 416 - 66 + 4);
    put(kelpSprite(3, 84, Math.sin(t * 0.9 + 2)), 430, 416 - 84 + 4); put(kelpSprite(4, 58, Math.sin(t * 1.1 + 3)), 452, 416 - 58 + 4);
    put(fanSprite(7, 1.1, THEME.coralFar2), 112, 416 - 58); put(fanSprite(5, 1.0, THEME.coralFar), 352, 416 - 54);
    put(spongeSprite(3, THEME.coralFar), 150, 416 - 34 + 1);
  }
}

/** Near layer: marine snow + tiny rising bubbles (drawn in front, very sparse). */
function drawNearParticles(ctx, t, seed = 5, avoid = []) {
  const rnd = mulberry(seed);
  const clear = (x, y) => avoid.some(([ax, ay, ar]) => (x - ax) ** 2 + (y - ay) ** 2 < ar * ar);
  for (let i = 0; i < 70; i++) {
    const x0 = rnd() * IW, y0 = rnd() * IH, sp = 4 + rnd() * 10, dr = rnd() * 6.28;
    const x = (x0 + Math.sin(t * 0.4 + dr) * 6 + IW) % IW, y = ((y0 - t * sp) % IH + IH) % IH;
    const big = rnd() < 0.14, a = 0.22 + rnd() * 0.4;
    if (clear(x, y)) continue;
    ctx.fillStyle = `rgba(200,235,255,${a})`; ctx.fillRect(Math.round(x), Math.round(y), big ? 2 : 1, big ? 2 : 1);
    if (big) { ctx.fillStyle = `rgba(255,255,255,${a + 0.2})`; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); }
  }
  // tiny bubbles with a glint
  for (let i = 0; i < 9; i++) {
    const x0 = rnd() * IW, y0 = rnd() * IH, r = 2 + Math.floor(rnd() * 3), sp = 8 + rnd() * 10;
    const x = Math.round(x0 + Math.sin(t * 1.3 + i) * 3), y = Math.round(((y0 - t * sp) % IH + IH) % IH);
    if (clear(x, y)) continue;
    ctx.strokeStyle = 'rgba(170,235,255,0.55)'; ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(170,235,255,0.55)'; pixelRing(ctx, x, y, r);
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(x - Math.floor(r * 0.5), y - Math.floor(r * 0.5), 1, 1);
  }
}
function pixelRing(ctx, cx, cy, r) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const d = Math.hypot(x, y); if (d <= r + 0.35 && d >= r - 0.85) ctx.fillRect(cx + x, cy + y, 1, 1); }
}

/* ---------- terrain (coral masonry, autotiled from the REAL map) ---------- */
function buildTerrain(map) {
  const W = IW, H = IH, Y0 = 32;
  const solid = new Uint8Array(W * H);
  for (let r = 0; r < 26; r++) for (let c = 0; c < 32; c++) if (map[r][c] === '#') for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) solid[(Y0 + r * 16 + y) * W + c * 16 + x] = 1;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 1 : solid[y * W + x];
  // rounded corners + ragged underside + tufts: edit the silhouette
  const shape = solid.slice();
  const exposedTop = (x, y) => at(x, y) && !at(x, y - 1) && y > 48;
  for (let y = Y0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!solid[y * W + x]) continue;
    // distance to nearest empty in 4 axis directions (cap 6)
    let du = 0, dd = 0, dl = 0, dr = 0;
    while (du < 6 && at(x, y - du - 1)) du++; while (dd < 6 && at(x, y + dd + 1)) dd++;
    while (dl < 6 && at(x - dl - 1, y)) dl++; while (dr < 6 && at(x + dr + 1, y)) dr++;
    const freeU = du < 6 && !at(x, y - du - 1), freeD = dd < 6 && !at(x, y + dd + 1), freeL = dl < 6 && !at(x - dl - 1, y), freeR = dr < 6 && !at(x + dr + 1, y);
    const cr = 4;
    const corner = (a, fa, b, fb) => fa && fb && a < cr && b < cr && ((cr - a - 0.5) ** 2 + (cr - b - 0.5) ** 2 > cr * cr * 0.85);
    if (y < H - 1 && x > 0 && x < W - 1) if (corner(du, freeU, dl, freeL) || corner(du, freeU, dr, freeR) || corner(dd, freeD, dl, freeL) || corner(dd, freeD, dr, freeR)) shape[y * W + x] = 0;
  }
  // stalactite drips under platform bottoms
  for (let x = 4; x < W - 4; x++) for (let y = Y0 + 1; y < H - 2; y++) {
    if (solid[y * W + x] && !solid[(y + 1) * W + x] && shape[y * W + x]) {
      const hh = hash2(x >> 1, y, 21);
      if (hh > 0.88) { const len = 2 + Math.floor((hh - 0.88) * 18); for (let k = 1; k <= len; k++) { if (!solid[(y + k) * W + x]) shape[(y + k) * W + x] = 1; if (k < len - 1 && !solid[(y + k) * W + x + 1] && (x & 1) === 0) shape[(y + k) * W + x + 1] = 1; } }
    }
  }
  const at2 = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 1 : shape[y * W + x];
  // distances on final shape
  const dU = new Uint8Array(W * H), dD = new Uint8Array(W * H), dL = new Uint8Array(W * H), dR = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!shape[i]) continue; dU[i] = Math.min(255, (y > 0 && shape[i - W] ? dU[i - W] : 0) + 1); dL[i] = Math.min(255, (x > 0 && shape[i - 1] ? dL[i - 1] : 0) + 1); }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (!shape[i]) continue; dD[i] = Math.min(255, (y < H - 1 && shape[i + W] ? dD[i + W] : 0) + 1); dR[i] = Math.min(255, (x < W - 1 && shape[i + 1] ? dR[i + 1] : 0) + 1); }
  const [cv, cx] = mkCanvas(W, H); const img = cx.createImageData(W, H), d = img.data;
  const topBand = new Float32Array(W * H), glows = [];
  const ST = THEME.stone, ST2 = THEME.stoneAlt, MS = THEME.moss;
  for (let y = Y0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (!shape[i]) continue;
    const du = dU[i] - 1, dd = dD[i] - 1, dl = dL[i] - 1, dr = dR[i] - 1;
    const ry = y - Y0, course = ry >> 3, ly = ry & 7, off = (course & 1) * 8, bx = x + off, bcol = bx >> 4, lx = bx & 15;
    const seed = hash2(bcol, course, 7), seed2 = hash2(bcol, course, 19);
    const ramp = seed2 < 0.10 ? ST2 : seed2 < 0.20 ? THEME.stonePeach : ST;
    let f = 2.0 + (seed - 0.5) * 0.7 + (vnoise(x * 0.33, y * 0.33, 3) - 0.5) * 0.55;
    // chiselled brick bevel (coloured mortar lines, lit from top-left)
    if (ly === 0) f += 0.95; else if (ly === 1) f += 0.3;
    if (lx === 0) f += 0.6;
    if (ly === 7) f = 0.2;
    if (lx === 15) f = Math.min(f, 0.35);
    if (lx === 14 && ly > 0 && ly < 7) f -= 0.5;
    // soft slab-scale form light: lighter top-left, AO toward the underside
    f += 0.35 * (1 - smoothstep(0, 9, du)) - 0.9 * (1 - smoothstep(0, 7, dd)) + (dl < 2 ? 0.5 : 0) - (dr < 2 ? 0.5 : 0);
    let col = rampCol(ramp, f, x, y);
    // moss cap on exposed tops (not the ceiling underside or the HUD side)
    const capN = vnoise(x * 0.16, 3.3, 9) * 3.2 + vnoise(x * 0.5, 1.1, 4) * 1.6;
    const capH = 3 + capN;
    const isCeil = y < 48;
    if (!isCeil && du < capH) {
      const k = du / capH;
      const mf = k < 0.2 ? 3.6 : k < 0.5 ? 2.8 : k < 0.8 ? 2.0 : 1.0;
      col = rampCol(MS, mf + (vnoise(x * 0.4, y * 0.4, 9) - 0.5) * 0.7, x, y);
      topBand[i] = 0;
    } else if (!isCeil && du < 18) topBand[i] = smoothstep(capH - 1, capH + 2, du) * (1 - du / 18);
    // fossils (spiral shells) + cracks
    const fs = hash2(bcol, course, 31);
    if (fs < 0.06 && lx > 3 && lx < 12 && ly > 1 && ly < 7) { const q = Math.hypot(lx - 7.5, ly - 3.8); if (q < 3.0 && Math.abs(((q * 1.7 + Math.atan2(ly - 3.8, lx - 7.5)) % 3.3)) < 0.9) col = rampCol(ramp, 3.8, x, y); }
    // glowing barnacles / coral polyps
    const bs = hash2(bcol, course, 77);
    if (bs > 0.965 && lx > 5 && lx < 10 && ly > 2 && ly < 6) { const q = Math.hypot(lx - 7.5, ly - 4); if (q < 1.7) col = q < 0.9 ? [255, 244, 210] : [255, 168, 150]; if (lx === 7 && ly === 4) glows.push({ x, y, c: [255, 170, 130] }); }
    // bottom row darker plus a thin glint on the lit top lip of slabs
    if (dd === 0) col = mixc(col, INK, 0.5);
    d[i * 4] = col[0]; d[i * 4 + 1] = col[1]; d[i * 4 + 2] = col[2]; d[i * 4 + 3] = 255;
  }
  // platform ends (computed on the clean silhouette, before tufts) for coral clumps
  const ends = [];
  for (let y = 50; y < H; y++) {
    let x = 0;
    while (x < W) {
      if (shape[y * W + x] === 1 && !at2(x, y - 1)) {
        let x1 = x; while (x1 + 1 < W && shape[y * W + x1 + 1] === 1 && !at2(x1 + 1, y - 1)) x1++;
        if (x1 - x >= 40) for (const [ex, dir] of [[x, -1], [x1, 1]]) if (!at2(ex + dir, y) && !at2(ex + dir, y - 1)) ends.push([ex, y, dir]);
        x = x1 + 1;
      } else x++;
    }
  }
  // coral polyps / grass tufts on the exposed tops (drawn into the silhouette: 1-3 px above)
  for (let x = 4; x < W - 4; x++) for (let y = 49; y < H; y++) {
    if (shape[y * W + x] && !at2(x, y - 1)) {
      const hh = hash2(x, y, 55);
      if (hh > 0.9) { const hgt = 2 + Math.floor((hh - 0.9) * 30); for (let k = 1; k <= hgt; k++) { const j = (y - k) * W + x; if (shape[j]) continue; const c = rampCol(MS, 2.2 + k * 0.5, x, y - k); d[j * 4] = c[0]; d[j * 4 + 1] = c[1]; d[j * 4 + 2] = c[2]; d[j * 4 + 3] = 255; shape[j] = 2; } }
      else if (hh < 0.018) { const col = hash2(x, 3) < 0.5 ? [255, 120, 160] : [255, 176, 120]; for (let k = 1; k <= 3; k++) for (let ox = -1; ox <= 1; ox++) { if (k === 3 && ox !== 0) continue; const j = (y - k) * W + x + ox; if (shape[j]) continue; const cc = k === 3 ? [255, 235, 230] : col; d[j * 4] = cc[0]; d[j * 4 + 1] = cc[1]; d[j * 4 + 2] = cc[2]; d[j * 4 + 3] = 255; shape[j] = 2; } }
    }
  }
  // selective outer outline: dark plum (teal under moss tops), 1 px
  const ol = [];
  for (let y = Y0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (shape[i]) continue;
    let ni = -1;
    if (y > Y0 && shape[i - W]) ni = i - W; else if (y < H - 1 && shape[i + W]) ni = i + W; else if (x > 0 && shape[i - 1]) ni = i - 1; else if (x < W - 1 && shape[i + 1]) ni = i + 1;
    if (ni < 0) continue;
    const below = ni === i + W; // neighbour below: outline on top of a top edge
    const nr = d[ni * 4], ng = d[ni * 4 + 1], nb = d[ni * 4 + 2];
    const c = below ? mixc([nr, ng, nb], [10, 40, 52], 0.72) : mixc([nr, ng, nb], INK, 0.78);
    ol.push([i, c]);
  }
  for (const [i, c] of ol) { d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255; }
  cx.putImageData(img, 0, 0);
  // coral clumps overgrowing the platform ends (sculpted props, gently glowing tips)
  for (const [ex, y, dir] of ends) {
    const hh = hash2(ex, y, 41); if (hh > 0.62) continue;
    const sp = coralClump(Math.floor(hh * 1000), dir);
    cx.drawImage(sp.canvas, Math.round(ex - (dir < 0 ? 4 : sp.w - 6)), y - sp.h + 3);
    glows.push({ x: ex - dir * 3, y: y - 10, c: [255, 120, 160] });
  }
  return { canvas: cv, solid: shape, topBand, glows };
}

function coralClump(seed, dir) {
  const key = 'clump' + seed + '|' + dir; if (SPR_CACHE.has(key)) return SPR_CACHE.get(key);
  const rnd = mulberry(seed), parts = [], W = 24, H = 20;
  const ramp = rnd() < 0.5 ? THEME.polypPink : THEME.polypOrange;
  const br = (bx, by, ang, len, r) => {
    const mx = bx + Math.cos(ang) * len * 0.55, my = by + Math.sin(ang) * len * 0.55, ex = bx + Math.cos(ang) * len, ey = by + Math.sin(ang) * len;
    parts.push(CP(bx, by, r, mx, my, r * 0.8, ramp, { ln: 0 }), CP(mx, my, r * 0.8, ex, ey, r * 0.5, ramp, { ln: 0 }), E(ex, ey, r * 0.85 + 0.3, r * 0.85 + 0.3, THEME.polypTip, { ln: 0, th: [-0.8, -0.3, 0.3, 0.7] }));
    return [mx, my, ang];
  };
  for (let k = 0; k < 3; k++) {
    const bx = 10 + (k - 1) * 4 + (rnd() - 0.5) * 2, ang = -Math.PI / 2 + (k - 1) * 0.55 + (rnd() - 0.5) * 0.3 + (dir > 0 ? 0.2 : -0.2) * 0, len = 8 + rnd() * 5;
    const [mx, my, a2] = br(bx, 18, ang, len, 1.9);
    br(mx, my, a2 + 0.7, 4 + rnd() * 2, 1.3); br(mx, my, a2 - 0.7, 4 + rnd() * 2, 1.3);
  }
  parts.push(E(11, 18.4, 6.4, 2.4, THEME.polypPink, { ln: 0 }));
  const res = sculpt(W, H, parts, {}); const sp = { canvas: res.canvas, w: W, h: H }; SPR_CACHE.set(key, sp); return sp;
}

/** Caustic web, quantised to pixel levels, masked onto the sunlit tops of the terrain. Returns a canvas. */
function buildCaustics(terrain, t, o = {}) {
  const W = IW, H = IH; const [cv, cx] = mkCanvas(W, H); const img = cx.createImageData(W, H), d = img.data;
  const tb = terrain.topBand;
  const f = (x, y, tt) => {
    const u = x * 0.052, v = y * 0.085;
    let s = Math.sin(u * 2.1 + tt * 0.9 + Math.sin(v * 2.3 + tt * 0.7) * 1.7) + Math.sin(v * 3.1 - tt * 0.8 + Math.sin(u * 1.9 - tt * 0.6) * 1.5) + Math.sin((u + v) * 1.6 + tt * 0.5) * 0.7;
    s /= 2.7; return Math.pow(1 - Math.abs(s), 11);
  };
  for (let y = 40; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, b = tb[i]; if (b <= 0.02) continue;
    const c = f(x, y, t) * 0.8 + f(x * 1.3 + 40, y * 1.2, -t * 1.2 + 3) * 0.55;
    const lvl = c > 0.62 ? 3 : c > 0.38 ? 2 : c > 0.2 ? 1 : 0;
    if (!lvl) continue;
    const a = (lvl === 3 ? 0.78 : lvl === 2 ? 0.46 : 0.22) * b;
    d[i * 4] = 190; d[i * 4 + 1] = 255; d[i * 4 + 2] = 238; d[i * 4 + 3] = Math.round(a * 255 * (o.gain || 1));
  }
  cx.putImageData(img, 0, 0);
  return cv;
}
/* =====================================================================================================
 * FONT — 5x7 source glyphs -> EPX/Scale2x smoothing (10x14) -> row gradient + 1px outline + 1px shadow
 * ===================================================================================================== */
const GLYPHS_SRC = {
  A: '.###./#...#/#...#/#####/#...#/#...#/#...#', B: '####./#...#/#...#/####./#...#/#...#/####.', C: '.###./#...#/#..../#..../#..../#...#/.###.',
  D: '####./#...#/#...#/#...#/#...#/#...#/####.', E: '#####/#..../#..../####./#..../#..../#####', F: '#####/#..../#..../####./#..../#..../#....',
  G: '.###./#...#/#..../#.###/#...#/#...#/.###.', H: '#...#/#...#/#...#/#####/#...#/#...#/#...#', I: '.###./..#../..#../..#../..#../..#../.###.',
  J: '..###/...#./...#./...#./...#./#..#./.##..', K: '#...#/#..#./#.#../##.../#.#../#..#./#...#', L: '#..../#..../#..../#..../#..../#..../#####',
  M: '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#', N: '#...#/##..#/#.#.#/#..##/#...#/#...#/#...#', O: '.###./#...#/#...#/#...#/#...#/#...#/.###.',
  P: '####./#...#/#...#/####./#..../#..../#....', Q: '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#', R: '####./#...#/#...#/####./#.#../#..#./#...#',
  S: '.####/#..../#..../.###./....#/....#/####.', T: '#####/..#../..#../..#../..#../..#../..#..', U: '#...#/#...#/#...#/#...#/#...#/#...#/.###.',
  V: '#...#/#...#/#...#/#...#/#...#/.#.#./..#..', W: '#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#', X: '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
  Y: '#...#/#...#/.#.#./..#../..#../..#../..#..', Z: '#####/....#/...#./..#../.#.../#..../#####',
  0: '.###./#...#/#..##/#.#.#/##..#/#...#/.###.', 1: '..#../.##../..#../..#../..#../..#../.###.', 2: '.###./#...#/....#/...#./..#../.#.../#####',
  3: '.###./#...#/....#/..##./....#/#...#/.###.', 4: '...#./..##./.#.#./#..#./#####/...#./...#.', 5: '#####/#..../####./....#/....#/#...#/.###.',
  6: '.###./#..../#..../####./#...#/#...#/.###.', 7: '#####/....#/...#./..#../.#.../.#.../.#...', 8: '.###./#...#/#...#/.###./#...#/#...#/.###.',
  9: '.###./#...#/#...#/.####/....#/....#/.###.',
  '.': '...../...../...../...../...../.##../.##..', ',': '...../...../...../...../.##../.##../.#...', ':': '...../.##../.##../...../.##../.##../.....',
  '!': '..#../..#../..#../..#../..#../...../..#..', '?': '.###./#...#/....#/...#./..#../...../..#..', '-': '...../...../...../#####/...../...../.....',
  '+': '...../..#../..#../#####/..#../..#../.....', '&': '.##../#..#./#.#../.#.../#.#.#/#..#./.##.#', "'": '..#../..#../.#.../...../...../...../.....',
  '/': '....#/....#/...#./..#../.#.../#..../#....', '(': '...#./..#../.#.../.#.../.#.../..#../...#.', ')': '.#.../..#../...#./...#./...#./..#../.#...',
  '%': '##..#/##..#/...#./..#../.#.../#..##/#..##', '#': '.#.#./#####/.#.#./.#.#./#####/.#.#./.....', '=': '...../...../#####/...../#####/...../.....',
  '_': '...../...../...../...../...../...../#####', '*': '...../#.#.#/.###./#####/.###./#.#.#/.....', ' ': '...../...../...../...../...../...../.....',
};
const GLYPH_CACHE = new Map();
function glyphBits(ch, epx) {
  const key = ch + epx; if (GLYPH_CACHE.has(key)) return GLYPH_CACHE.get(key);
  const src = GLYPHS_SRC[ch.toUpperCase()] || GLYPHS_SRC['?'];
  let g = src.split('/').map(r => r.split('').map(c => c === '#' ? 1 : 0));
  for (let k = 0; k < epx; k++) g = scale2x(g);
  GLYPH_CACHE.set(key, g); return g;
}
function scale2x(g) {
  const h = g.length, w = g[0].length, out = Array.from({ length: h * 2 }, () => new Array(w * 2).fill(0));
  const px = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : g[y][x];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const P = px(x, y), A = px(x, y - 1), B = px(x + 1, y), C = px(x - 1, y), D = px(x, y + 1);
    out[y * 2][x * 2] = (C === A && C !== D && A !== B) ? A : P;
    out[y * 2][x * 2 + 1] = (A === B && A !== C && B !== D) ? B : P;
    out[y * 2 + 1][x * 2] = (D === C && D !== B && C !== A) ? C : P;
    out[y * 2 + 1][x * 2 + 1] = (B === D && B !== A && D !== C) ? D : P;
  }
  return out;
}
const TEXT_CACHE = new Map();
/** Render a string to a canvas. o: {epx:0|1|2, grad:[hex..] top->bottom bands, ol:hex|null, shadow:hex|null, track:px, hi:hex(top highlight row)} */
function textCanvas(str, o = {}) {
  const key = str + JSON.stringify(o); if (TEXT_CACHE.has(key)) return TEXT_CACHE.get(key);
  const epx = o.epx ?? 1, track = o.track ?? 0, grad = (o.grad || ['#ffffff']).map(hex2rgb);
  const gw = 5 * (1 << epx), gh = 7 * (1 << epx), adv = gw + (1 << epx) + track;
  const pad = 3, W = str.length * adv - (1 << epx) - track + pad * 2 + (o.bold ? 1 : 0), H = gh + pad * 2;
  const mask = new Uint8Array(W * H);
  for (let i = 0; i < str.length; i++) { const g = glyphBits(str[i], epx); for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) if (g[y][x]) { mask[(y + pad) * W + i * adv + x + pad] = 1; if (o.bold && x + 1 < gw + 1) mask[(y + pad) * W + i * adv + x + pad + 1] = 1; } }
  const [cv, cx] = mkCanvas(W, H); const img = cx.createImageData(W, H), d = img.data;
  const set = (x, y, c, a = 255) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = a; };
  const ol = o.ol === null ? null : hex2rgb(o.ol || '#1a0f2e'), sh = o.shadow === null ? null : hex2rgb(o.shadow || '#0a0618');
  const shOff = o.shOff ?? Math.max(1, 1 << (epx - 1));
  // shadow + outline underlays
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (mask[y * W + x]) continue;
    let near = false;
    if (ol) for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && mask[yy * W + xx]) { near = true; break; } }
    if (near) { set(x, y, ol); continue; }
    if (sh) { const xx = x - shOff, yy = y - shOff; let hit = false; for (let dy = -1; dy <= 1 && !hit; dy++) for (let dx = -1; dx <= 1; dx++) { const ax = xx + dx, ay = yy + dy; if (ax >= 0 && ay >= 0 && ax < W && ay < H && mask[ay * W + ax]) { hit = true; break; } } if (hit) set(x, y, sh, 150); }
  }
  // fill with row gradient (hard bands) + top highlight row + bottom shade row
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!mask[y * W + x]) continue;
    const ry = y - pad, f = ry / (gh - 1), bi = Math.min(grad.length - 1, Math.floor(f * grad.length));
    let c = grad[bi];
    if (o.hi && ry === 0) c = hex2rgb(o.hi);
    set(x, y, c);
  }
  cx.putImageData(img, 0, 0);
  const res = { canvas: cv, w: W, h: H, pad };
  TEXT_CACHE.set(key, res); return res;
}
function drawText(ctx, str, x, y, o = {}) {
  const t = textCanvas(str, o);
  const align = o.align || 'left';
  const ox = align === 'center' ? Math.round(x - (t.w) / 2) : align === 'right' ? Math.round(x - t.w) : Math.round(x);
  ctx.drawImage(t.canvas, ox - t.pad * 0, Math.round(y) - t.pad);
  return t;
}
const TXT = {
  score: { epx: 1, grad: ['#ffffff', '#eaf6ff', '#bfe3ff', '#8cc8f5'], ol: '#0b1a3e', hi: '#ffffff' },
  gold: { epx: 1, grad: ['#fff2b0', '#ffd166', '#ffb23e', '#e0742a'], ol: '#2a1030', hi: '#fffbe0' },
  pink: { epx: 0, grad: ['#ff9fbd', '#ff6f91'], ol: '#2a0c30' },
  aqua: { epx: 0, grad: ['#b8f6ff', '#6fdcff'], ol: '#0a2a4e' },
  goldS: { epx: 0, grad: ['#ffe9a0', '#ffc34a'], ol: '#2a1030' },
  menu: { epx: 1, grad: ['#ffffff', '#d9f2ff', '#a8d8f5', '#86bce6'], ol: '#0c1d44', hi: '#ffffff' },
  menuSel: { epx: 1, grad: ['#fff9d6', '#ffe28a', '#ffc24a', '#f08a30'], ol: '#2a0e2a', hi: '#ffffff' },
};
/* =====================================================================================================
 * LIGHT — smooth light layer composited over the crisp pixel layer (at output resolution)
 *   1. multiply map: surface-to-depth ambient gradient + vignette + point lights punching through
 *   2. additive glow: coloured point lights + god-rays
 *   3. bloom: thresholded copy of the scene, mip-chain blur, added back
 *   4. colour grade: soft-light warm highlights / cool shadows
 * ===================================================================================================== */
function radialGlow(ctx, x, y, r, rgb, a, falloff = 0.42) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  const c = `${Math.round(rgb[0])},${Math.round(rgb[1])},${Math.round(rgb[2])}`;
  g.addColorStop(0, `rgba(${c},${a})`); g.addColorStop(falloff, `rgba(${c},${a * 0.38})`); g.addColorStop(0.75, `rgba(${c},${a * 0.08})`); g.addColorStop(1, `rgba(${c},0)`);
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
function upChain(src, tw, th) {
  let cur = src;
  while (cur.width * 2 <= tw) {
    const [c, x] = mkCanvas(cur.width * 2, cur.height * 2); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(cur, 0, 0, c.width, c.height); cur = c;
  }
  return cur;
}
function downTo(src, w, h) {
  let cur = src;
  while (cur.width / 2 >= w) { const [c, x] = mkCanvas(cur.width / 2, cur.height / 2); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(cur, 0, 0, c.width, c.height); cur = c; }
  return cur;
}
function bloomLayers(scene, thr = 170) {
  const sw = Math.round(scene.width / 4), sh = Math.round(scene.height / 4);
  const [b0, x0] = mkCanvas(sw, sh); x0.imageSmoothingEnabled = true; x0.imageSmoothingQuality = 'high'; x0.drawImage(scene, 0, 0, sw, sh);
  const im = x0.getImageData(0, 0, sw, sh), d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = Math.max(d[i], d[i + 1], d[i + 2]) * 0.3 + (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) * 0.7;   // luma-weighted: pale pinks do not bloom, only true emissives
    const k = smoothstep(thr, 255, lum);
    d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; d[i + 3] = 255;
  }
  x0.putImageData(im, 0, 0);
  const lv = [];
  for (const [f, w] of [[1, 0.42], [2, 0.38], [4, 0.34]]) { const small = downTo(b0, Math.max(2, Math.round(sw / f)), Math.max(2, Math.round(sh / f))); lv.push({ c: small, w }); }
  return lv;
}

/** Composite the lit frame onto octx with only THREE full-resolution passes (scene x2, multiply map, additive glow);
 *  everything else (ambient, grade tint, vignette, point lights, god-rays, bloom) is built at 1/4 output resolution.
 *  cfg: {t, lights, rays, vignette, ambient:[top,bottom], grade, bloom, bloomThr, extraGlow} */
function compositeLit(octx, scene, cfg) {
  const OW = octx.canvas.width, OH = octx.canvas.height;
  octx.imageSmoothingEnabled = false; octx.globalCompositeOperation = 'source-over'; octx.globalAlpha = 1;
  octx.drawImage(scene, 0, 0, OW, OH);                                   // pass 1: crisp pixel layer, integer upscale
  const LW = Math.round(OW / 4), LH = Math.round(OH / 4), K = LW / scene.width;       // light canvases = 1/4 output; K: scene px -> light px
  // --- multiply map: depth ambient + diagonal colour grade (warm top-left / cool bottom-right) + vignette + lights punching through
  const [dk, dx] = mkCanvas(LW, LH); dx.imageSmoothingEnabled = true;
  const amb = cfg.ambient || [[252, 255, 255], [178, 198, 244]];
  const g = dx.createLinearGradient(0, 0, 0, LH);
  g.addColorStop(0, `rgb(${amb[0]})`); g.addColorStop(0.5, `rgb(${mixc(amb[0], amb[1], 0.45).map(Math.round)})`); g.addColorStop(1, `rgb(${amb[1]})`);
  dx.fillStyle = g; dx.fillRect(0, 0, LW, LH);
  dx.globalCompositeOperation = 'multiply';
  const gr = cfg.grade || ['rgb(255,226,198)', 'rgb(160,196,255)'];
  const gg = dx.createLinearGradient(0, 0, LW, LH); gg.addColorStop(0, gr[0]); gg.addColorStop(1, gr[1]);
  dx.fillStyle = gg; dx.fillRect(0, 0, LW, LH);
  dx.globalCompositeOperation = 'source-over';
  if (cfg.vignette !== 0) {
    const vg = dx.createRadialGradient(LW / 2, LH * 0.46, Math.min(LW, LH) * 0.30, LW / 2, LH * 0.5, Math.hypot(LW, LH) * 0.56);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(0.65, `rgba(6,12,40,${0.16 * (cfg.vignette ?? 1)})`); vg.addColorStop(1, `rgba(4,8,30,${0.55 * (cfg.vignette ?? 1)})`);
    dx.fillStyle = vg; dx.fillRect(0, 0, LW, LH);
  }
  dx.globalCompositeOperation = 'lighter';
  for (const L of cfg.lights || []) radialGlow(dx, L.x * K, L.y * K, L.r * K * (L.hole ?? 0.9), mixc(L.c, [255, 255, 255], 0.35), (L.a ?? 0.5) * 0.7 * (L.lift ?? 1));
  octx.imageSmoothingEnabled = true; octx.imageSmoothingQuality = 'high';
  octx.globalCompositeOperation = 'multiply'; octx.drawImage(dk, 0, 0, OW, OH);                  // pass 2
  // --- additive glow map: god-rays + coloured point lights + bloom (mip chain), all at 1/4 res
  const [gl, gx] = mkCanvas(LW, LH); gx.imageSmoothingEnabled = true; gx.imageSmoothingQuality = 'high';
  gx.globalCompositeOperation = 'lighter';
  if (cfg.rays !== false) {     // rays live on their own 1/4-res layer so the masonry can occlude them (light falls between the slabs, not through them)
    const [rc, rx] = mkCanvas(LW, LH); rx.imageSmoothingEnabled = true; rx.globalCompositeOperation = 'lighter';
    drawGodRays(rx, LW, LH, cfg.t || 0, cfg.rays || {});
    if (cfg.rays && cfg.rays.shaft) drawShaft(rx, LW, LH, K, cfg.t || 0, cfg.rays.shaft);
    if (cfg.rayMask) { rx.globalCompositeOperation = 'destination-out'; rx.globalAlpha = 0.86; rx.drawImage(cfg.rayMask, 0, 0, LW, LH); rx.globalAlpha = 1; }
    gx.drawImage(rc, 0, 0);
  }
  for (const L of cfg.lights || []) radialGlow(gx, L.x * K, L.y * K, L.r * K, L.c, (L.a ?? 0.5) * (L.add ?? 1) * (L.pulse ? 0.85 + 0.15 * Math.sin((cfg.t || 0) * L.pulse) : 1));
  if (cfg.extraGlow) cfg.extraGlow(gx, K);
  if (cfg.bloom !== 0) {
    for (const { c, w } of bloomLayers(scene, cfg.bloomThr || 214)) { const up = upChain(c, LW, LH); gx.globalAlpha = w * (cfg.bloom ?? 1); gx.drawImage(up, 0, 0, LW, LH); }
    gx.globalAlpha = 1;
  }
  octx.globalCompositeOperation = 'lighter'; octx.drawImage(gl, 0, 0, OW, OH);                    // pass 3
  octx.globalCompositeOperation = 'source-over'; octx.globalAlpha = 1;
}

/** One broad warm shaft pouring through the ceiling gap (x,w,y0 in scene px): the hero light of the room. */
function drawShaft(gx, LW, LH, K, t, o = {}) {
  const cx = o.x * K, w = o.w * K, top = (o.y0 ?? 30) * K, len = LH * (o.len ?? 0.92), sk = o.skew ?? -0.12, a = (o.a ?? 0.16) * (0.92 + 0.08 * Math.sin(t * 0.8));
  for (let k = 0; k < 5; k++) {
    const w0 = w * (1 - k * 0.15), w1 = w0 * (o.spread ?? 1.9);
    const g = gx.createLinearGradient(0, top, 0, top + len);
    g.addColorStop(0, `rgba(255,243,208,${a * (0.35 + k * 0.22)})`); g.addColorStop(0.45, `rgba(214,240,255,${a * 0.34 * (0.35 + k * 0.22)})`); g.addColorStop(1, 'rgba(190,230,255,0)');
    gx.fillStyle = g; gx.beginPath(); gx.moveTo(cx - w0 / 2, top); gx.lineTo(cx + w0 / 2, top); gx.lineTo(cx + sk * len + w1 / 2, top + len); gx.lineTo(cx + sk * len - w1 / 2, top + len); gx.closePath(); gx.fill();
  }
  radialGlow(gx, cx, top + 4, w * 1.0, [255, 238, 196], (o.a ?? 0.16) * 1.2);
}
function drawGodRays(gx, W, H, t, o = {}) {
  const n = o.n ?? 7, sk = o.skew ?? -0.34, col = o.col || '210,244,255', gain = o.gain ?? 1;
  for (let i = 0; i < n; i++) {
    const cx = (i + 0.4 + Math.sin(i * 12.9898) * 0.35) / n * W * 1.15 + Math.sin(t * 0.25 + i * 1.7) * 5 - 4;
    const wd = (7 + (i * 7 % 5) * 3.2) * (o.wide ?? 1), len = H * (0.78 + (i % 3) * 0.08), a = (0.05 + (i % 3) * 0.018) * gain * (0.85 + 0.15 * Math.sin(t * 0.7 + i * 2.1));
    for (let k = 0; k < 4; k++) {
      const w2 = wd * (1 - k * 0.22), g = gx.createLinearGradient(cx, 0, cx + sk * len, len);
      g.addColorStop(0, `rgba(${col},${a * (0.55 + k * 0.3)})`); g.addColorStop(0.55, `rgba(${col},${a * 0.28 * (0.55 + k * 0.3)})`); g.addColorStop(1, `rgba(${col},0)`);
      gx.fillStyle = g; gx.beginPath(); gx.moveTo(cx - w2 * 0.5, 0); gx.lineTo(cx + w2 * 0.5, 0); gx.lineTo(cx + sk * len + w2 * 1.4, len); gx.lineTo(cx + sk * len - w2 * 1.4, len); gx.closePath(); gx.fill();
    }
  }
  // surface shimmer band at the very top
  const sg = gx.createLinearGradient(0, 0, 0, H * 0.22); sg.addColorStop(0, `rgba(190,235,255,${0.20 * gain})`); sg.addColorStop(1, 'rgba(190,235,255,0)');
  gx.fillStyle = sg; gx.fillRect(0, 0, W, H * 0.22);
}
/* =====================================================================================================
 * HUD — rounded pixel panels, score readouts, EXTEND gem sockets, life medallions, round plaque
 * ===================================================================================================== */
function pxPanel(ctx, x, y, w, h, o = {}) {
  const fill = hex2rgb(o.fill || '#0a1738'), border = hex2rgb(o.border || '#3b78c8'), hi = hex2rgb(o.hi || '#8cc4f4'), lo = hex2rgb(o.lo || '#050d24');
  const cut = o.cut ?? 2, img = ctx.createImageData(w, h), d = img.data, fa = o.fa ?? 0.9;
  const inside = (px, py) => { if (px < 0 || py < 0 || px >= w || py >= h) return false; const cx = Math.min(px, w - 1 - px), cy = Math.min(py, h - 1 - py); return !(cx + cy < cut); };
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    if (!inside(px, py)) continue;
    const edge = !inside(px - 1, py) || !inside(px + 1, py) || !inside(px, py - 1) || !inside(px, py + 1);
    let c, a = 1;
    if (edge) { c = py < h / 2 ? mixc(border, hi, 0.4) : border; }
    else if (py === 1) { c = mixc(fill, hi, 0.28); a = fa; }
    else if (py === h - 2) { c = lo; a = fa; }
    else { const t = py / h; c = mixc(mixc(fill, hex2rgb(o.fill2 || '#12285a'), 0.0 + t * 0.9), [255, 255, 255], 0); a = fa; }
    const k = (py * w + px) * 4; d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = Math.round(a * 255);
  }
  const [cv, cx] = mkCanvas(w, h); cx.putImageData(img, 0, 0); ctx.drawImage(cv, Math.round(x), Math.round(y));
}

function drawHudTop(ctx, st) {
  // bar
  const g = ctx.createLinearGradient(0, 0, 0, 32); g.addColorStop(0, 'rgba(6,12,34,0.98)'); g.addColorStop(1, 'rgba(10,22,52,0.96)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, IW, 32);
  ctx.fillStyle = '#2f6aa8'; ctx.fillRect(0, 31, IW, 1); ctx.fillStyle = '#0b1d44'; ctx.fillRect(0, 30, IW, 1);
  // soft shadow into the playfield
  const sg = ctx.createLinearGradient(0, 32, 0, 40); sg.addColorStop(0, 'rgba(4,8,24,0.55)'); sg.addColorStop(1, 'rgba(4,8,24,0)'); ctx.fillStyle = sg; ctx.fillRect(0, 32, IW, 8);
  const panels = [
    { x: 40, w: 142, label: '1UP', lt: TXT.pink, val: st.p1, border: '#d8527f', hi: '#ff9fbd', icon: 'p1' },
    { x: 185, w: 142, label: 'HI SCORE', lt: TXT.goldS, val: st.hi, border: '#c99a3a', hi: '#ffe08a', icon: 'crown' },
    { x: 330, w: 142, label: '2UP', lt: TXT.aqua, val: st.p2, border: '#3a9ac0', hi: '#9ae8ff', icon: 'p2' },
  ];
  for (const p of panels) {
    pxPanel(ctx, p.x, 2, p.w, 28, { border: p.border, hi: p.hi, fill: '#0a1738', fill2: '#13295a', fa: 0.92 });
    drawText(ctx, p.label, p.x + p.w / 2 + 10, 5, { ...p.lt, align: 'center', shadow: '#060c22' });
    drawText(ctx, String(p.val).padStart(6, '0'), p.x + p.w / 2 + 10, 13, { ...TXT.score, align: 'center' });
    const ic = p.icon === 'crown' ? crownIcon() : headIcon(p.icon, 0.78);
    ctx.drawImage(ic, p.x + 7, 9 + (p.icon === 'crown' ? 0 : 0));
    // ornament studs
    for (const sx of [p.x + 4, p.x + p.w - 6]) { ctx.fillStyle = p.hi; ctx.fillRect(sx, 14, 2, 2); ctx.fillStyle = p.border; ctx.fillRect(sx + 1, 15, 1, 1); }
  }
}

function gemSocket(ctx, cx, cy, letter, lit) {
  // stone ring
  const R = 11;
  ctx.fillStyle = '#1a0f2e'; pixelDisc(ctx, cx, cy, R + 1);
  ctx.fillStyle = lit ? '#e8a43a' : '#4a3a68'; pixelDisc(ctx, cx, cy, R);
  ctx.fillStyle = lit ? '#ffd166' : '#5c4c80'; pixelDisc(ctx, cx - 0.5, cy - 0.5, R - 1.2);
  ctx.fillStyle = lit ? '#3b1d6e' : '#121a3a'; pixelDisc(ctx, cx, cy, R - 2.6);
  if (lit) {
    ctx.fillStyle = '#7a3fd0'; pixelDisc(ctx, cx, cy, R - 3.4);
    ctx.fillStyle = '#a56cff'; pixelDisc(ctx, cx - 1, cy - 1.2, R - 5.2);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(cx - 6), Math.round(cy - 6), 2, 2);
  } else { ctx.fillStyle = '#1c2a58'; pixelDisc(ctx, cx - 0.5, cy - 0.5, R - 4.2); }
  const tc = textCanvas(letter, lit ? { epx: 0, bold: true, grad: ['#ffffff', '#fff2b8', '#ffd96a', '#ffc24a'], ol: '#2a0e2a', shadow: null } : { epx: 0, bold: true, grad: ['#5a6ca0', '#44558c'], ol: null, shadow: null });
  ctx.drawImage(tc.canvas, Math.round(cx - tc.w / 2 + 0.5), Math.round(cy - tc.h / 2 + 0.5));
}
let _headIcons = {};
function headIcon(who, sc = 1) {
  const hk = who + sc; if (_headIcons[hk]) return _headIcons[hk];
  const f = who === 'p1';
  const body = f ? MAT.fizz : MAT.pop, gill = f ? MAT.fizzGill : MAT.popGill, tip = f ? MAT.fizzGillTip : MAT.popGillTip;
  const o = [];
  o.push(...fluffGill(7.5, 8, -150 * RAD, 7, -1.6, gill, tip, { barbs: 3, barbLen: 2.4, w0: 1.1, w1: 0.6 }));
  o.push(...fluffGill(7, 12, 176 * RAD, 7, 1.6, gill, tip, { barbs: 3, barbLen: 2.4, w0: 1.1, w1: 0.6 }));
  o.push(E(13, 13, 8.2, 6.8, body, { cast: [1, 1, 1] }));
  o.push(FE(15.6, 11.6, 2.2, 2.6, '#22103a'), DT(14.6, 9.8, '#ffffff', { s: 1 }), DT(16.6, 12.8, '#d6f8ff', { s: 1 }));
  o.push(FE(17.4, 15.6, 2.0, 1.1, f ? '#ff3d78' : '#8a6bff', { al: 0.5 }), FC(16, 17, 0.4, 20.4, 16.4, 0.4, MAT.mouth.c[1]));
  const sp = sculpt(Math.ceil(24 * sc), Math.ceil(22 * sc), o, { scale: sc });
  _headIcons[hk] = sp.canvas; return sp.canvas;
}
function crownIcon() {
  if (_headIcons.crown) return _headIcons.crown;
  const g = MAT.gold, o = [PG([[1.5, 13], [2.2, 3.6], [6.4, 8], [9, 1.4], [11.6, 8], [15.8, 3.6], [16.5, 13]], g, { bev: 1.8, ln: 1 }), PG([[1.5, 10.8], [16.5, 10.8], [16.8, 14.6], [1.2, 14.6]], g, { bev: 1.4, ln: 1, bias: -0.1 }),
    E(9, 12.7, 1.3, 1.1, MAT.ruby, { ln: 0 }), E(4.4, 12.7, 0.9, 0.9, MAT.cyanGem, { ln: 0 }), E(13.6, 12.7, 0.9, 0.9, MAT.cyanGem, { ln: 0 })];
  _headIcons.crown = sculpt(18, 17, o, {}).canvas; return _headIcons.crown;
}
function lifeMedal(ctx, cx, cy, who) {
  const f = who === 'p1', ring = f ? '#ff6f91' : '#7ff0d4';
  ctx.fillStyle = '#1a0f2e'; pixelDisc(ctx, cx, cy, 13);
  ctx.fillStyle = ring; pixelDisc(ctx, cx, cy, 12);
  ctx.fillStyle = f ? '#ffb3c8' : '#c4fff2'; pixelDisc(ctx, cx - 0.5, cy - 0.5, 11);
  ctx.fillStyle = '#0e1d46'; pixelDisc(ctx, cx, cy, 9.6);
  ctx.fillStyle = '#17306a'; pixelDisc(ctx, cx - 0.5, cy - 0.8, 8.2);
  ctx.drawImage(headIcon(who), Math.round(cx - 12), Math.round(cy - 11 + 1));
}
function roundPlaque(ctx, cx, cy, n) {
  drawText(ctx, 'ROUND', cx + 0.5, cy - 24, { epx: 0, grad: ['#ffe9a0', '#ffc34a'], ol: '#2a0c30', shadow: null, align: 'center' });
  pxPanel(ctx, cx - 14, cy - 12, 28, 24, { border: '#e8a43a', hi: '#ffe08a', fill: '#1a0f3e', fill2: '#2a1a62', fa: 1, cut: 3 });
  drawText(ctx, String(n).padStart(2, '0'), cx, cy - 7, { ...TXT.gold, align: 'center' });
}
/** Wall furniture (drawn on the lit scene): round plaque, EXTEND gem sockets, lives. */
function drawWallHud(ctx, st) {
  // left wall (P1)
  roundPlaque(ctx, 16, 66, st.round);
  for (let side = 0; side < 2; side++) {
    const x0 = side === 0 ? 3 : 483, lit = side === 0 ? st.extend1 : st.extend2;
    // recessed niche
    pxPanel(ctx, x0, 88, 26, 190, { border: '#2a1740', hi: '#6a4a98', lo: '#0a0620', fill: '#0c0a24', fill2: '#150f38', fa: 0.96, cut: 3 });
    'EXTEND'.split('').forEach((ch, k) => gemSocket(ctx, x0 + 13, 106 + k * 29.4, ch, lit.includes(k)));
    // lives
    const lives = side === 0 ? st.lives1 : st.lives2;
    for (let k = 0; k < lives; k++) lifeMedal(ctx, x0 + 13, 380 - k * 30, side === 0 ? 'p1' : 'p2');
  }
}

/** Floating player tag ("P1"/"P2") with a pointer, bobbing: keeps the heroes findable in a busy screen. */
function drawPlayerTag(ctx, cx, y, who, t) {
  const f = who === 'p1', bob = Math.round(Math.sin(t * 4 + (f ? 0 : 1.3)) * 1.2), x = Math.round(cx - 10), yy = Math.round(y + bob);
  pxPanel(ctx, x, yy, 21, 11, { fill: f ? '#c23a6e' : '#1f86b0', fill2: f ? '#ff6f91' : '#5fd6ff', border: f ? '#ffd0dc' : '#d0f6ff', hi: '#ffffff', lo: '#12082a', fa: 1, cut: 2 });
  drawText(ctx, f ? 'P1' : 'P2', cx + 0.5, yy + 2, { epx: 0, grad: ['#ffffff', '#ffffff'], ol: f ? '#6a1236' : '#0c3a5a', shadow: null, align: 'center' });
  const col = f ? '#ffd0dc' : '#d0f6ff';
  for (let i = 0; i < 4; i++) { ctx.fillStyle = i === 0 ? '#12082a' : col; ctx.fillRect(Math.round(cx) - 3 + i, yy + 11 + i, 7 - i * 2, 1); }
}
/* =====================================================================================================
 * LOGO — "FIZZ & POP" drawn from stroke paths: mask -> inside-distance field -> puffy tube normals ->
 * banded hue-shifted ramps (same shader as the sprites) + extruded depth + coloured inner line + ink outline
 * ===================================================================================================== */
const LOGO_SW = 15, LOGO_H = 62;
const LOGO_LET = {
  F: { w: 40, f: c => { c.moveTo(8, 8); c.lineTo(8, 54); c.moveTo(8, 8); c.lineTo(35, 8); c.moveTo(8, 31); c.lineTo(28, 31); } },
  I: { w: 21, f: c => { c.moveTo(10.5, 8); c.lineTo(10.5, 54); } },
  Z: { w: 44, f: c => { c.moveTo(8, 8); c.lineTo(36, 8); c.lineTo(8, 54); c.lineTo(36, 54); } },
  '&': { w: 52, f: c => { c.moveTo(43, 54); c.bezierCurveTo(31, 47, 14, 28, 14, 17); c.bezierCurveTo(14, 4, 35, 4, 34, 17); c.bezierCurveTo(33, 29, 8, 34, 8, 44); c.bezierCurveTo(8, 61, 33, 58, 44, 33); } },
  P: { w: 40, f: c => { c.moveTo(8, 54); c.lineTo(8, 8); c.lineTo(23, 8); c.arc(23, 21, 13, -Math.PI / 2, Math.PI / 2); c.lineTo(8, 34); } },
  O: { w: 46, f: c => { c.ellipse(23, 31, 15, 23, 0, 0, Math.PI * 2); } },
};
function buildLogo(SC = 1.14) {
  const seq = [['F', '#ff5c8a', 0, 0], ['I', '#ff6fb0', -2, 1.2], ['Z', '#e27ae6', 1, -1.5], ['Z', '#b78cff', -1, 1], ['&', '#ffc83a', 0, -2], ['P', '#5cc8ff', 2, 1], ['O', '#44e0e8', -2, -1], ['P', '#6af2d2', 1, 1.5]];
  const gap = 2, wordGap = 12;
  const W = Math.round(430 * SC / 1.0) + 24, H = Math.round(70 * SC) + 24, ox = 12, oy = 8;
  const label = new Uint8Array(W * H), edge = new Float32Array(W * H);
  let x = ox;
  seq.forEach(([ch, col, dy, rotDeg], k) => {
    const L = LOGO_LET[ch];
    const [mc, mx] = mkCanvas(W, H);
    mx.save(); mx.translate(x + L.w * SC / 2, oy + dy + LOGO_H * SC / 2); mx.rotate(rotDeg * RAD); mx.scale(SC, SC); mx.translate(-L.w / 2, -LOGO_H / 2);
    mx.strokeStyle = '#fff'; mx.lineWidth = LOGO_SW; mx.lineCap = 'round'; mx.lineJoin = 'round'; mx.beginPath(); L.f(mx); mx.stroke(); mx.restore();
    const d = mx.getImageData(0, 0, W, H).data;
    for (let i = 0; i < W * H; i++) if (d[i * 4 + 3] > 127) label[i] = k + 1;
    x += L.w * SC + gap + (k === 3 || k === 4 ? wordGap - gap : 0);
  });
  // inside-distance (exact within radius R)
  const R = 11, dist = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
    const i = y * W + xx; if (!label[i]) continue;
    let best = R * R;
    for (let dy = -R; dy <= R; dy++) { const yy = y + dy; for (let dx = -R; dx <= R; dx++) { const x2 = xx + dx; const d2 = dx * dx + dy * dy; if (d2 >= best) continue; if (x2 < 0 || yy < 0 || x2 >= W || yy >= H || !label[yy * W + x2]) best = d2; } }
    dist[i] = Math.sqrt(best);
  }
  const Rt = LOGO_SW * SC / 2, hgt = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) if (label[i]) { const f = Math.min(dist[i], Rt) / Rt; hgt[i] = Math.sqrt(1 - (1 - f) * (1 - f)) * Rt; }
  const ramps = seq.map(s => makeRamp(s[1], { cool: 276, warm: 48 }));
  const [cv, cx] = mkCanvas(W, H); const img = cx.createImageData(W, H), d = img.data;
  const put = (i, c, a = 255) => { d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = a; };
  // extrusion (depth) + outline underlay
  const EX = 5;
  const solidAt = (x2, y2) => x2 >= 0 && y2 >= 0 && x2 < W && y2 < H && label[y2 * W + x2];
  for (let y = H - 1; y >= 0; y--) for (let xx = W - 1; xx >= 0; xx--) {
    const i = y * W + xx; if (label[i]) continue;
    for (let k = 1; k <= EX; k++) { const sx = xx - k, sy = y - k; if (solidAt(sx, sy)) { const r = ramps[label[sy * W + sx] - 1]; put(i, k === EX ? r.c[0] : mixc(r.c[0], r.c[1], 0.2 + 0.1 * k)); break; } }
  }
  // face shading
  for (let y = 1; y < H - 1; y++) for (let xx = 1; xx < W - 1; xx++) {
    const i = y * W + xx; if (!label[i]) continue;
    const r = ramps[label[i] - 1];
    const gx = (hgt[i + 1] - hgt[i - 1]) * 0.5, gy = (hgt[i + W] - hgt[i - W]) * 0.5;
    let nx = -gx * 0.9, ny = -gy * 0.9, nz = 1; const ln = Math.hypot(nx, ny, nz); nx /= ln; ny /= ln; nz /= ln;
    let I = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
    I += (0.5 - y / H) * 0.22;
    const idx = bandIdx(I, [-0.5, 0.0, 0.5, 0.88, 0.975], xx, y, 0.05);
    let c = r.c[Math.min(5, idx)];
    // coloured inner line on the shadow side, soft light line on the lit side
    if (dist[i] < 1.5) { const lit = (nx * LIGHT[0] + ny * LIGHT[1]) > 0.05; c = lit ? r.c[3] : mixc(r.c[0], r.c[1], 0.3); }
    put(i, c);
  }
  // ink outline (2 px) around face + extrusion
  const occ = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) occ[i] = d[i * 4 + 3] > 0 ? 1 : 0;
  const ol = [];
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
    const i = y * W + xx; if (occ[i]) continue;
    let near = 0;
    for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) { if (dx * dx + dy * dy > 5) continue; const x2 = xx + dx, y2 = y + dy; if (x2 >= 0 && y2 >= 0 && x2 < W && y2 < H && occ[y2 * W + x2]) { near = Math.abs(dx) + Math.abs(dy) <= 1 ? 2 : 1; break; } }
    if (near) ol.push([i, near]);
  }
  for (const [i, n] of ol) put(i, n === 2 ? [26, 15, 46] : [38, 22, 66], 255);
  cx.putImageData(img, 0, 0);
  return { canvas: cv, w: W, h: H, label, ramps };
}
const _logos = {};
function drawLogo(ctx, cxm, y, t = 0, SC = 1.14) {
  const L = _logos[SC] || (_logos[SC] = buildLogo(SC)); const x = Math.round(cxm - L.w / 2 + 6);
  ctx.drawImage(L.canvas, x, Math.round(y));
  // sheen sweep: a diagonal white band traveling across the face (additive, pixel-quantised)
  const [mc, mx] = mkCanvas(L.w, L.h); mx.drawImage(L.canvas, 0, 0);
  mx.globalCompositeOperation = 'source-atop';
  const sx = ((t * 0.35) % 1.4) * (L.w + 80) - 80;
  const g = mx.createLinearGradient(sx, 0, sx + 40, 40); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  mx.fillStyle = g; mx.fillRect(0, 0, L.w, L.h);
  ctx.drawImage(mc, x, Math.round(y));
  return { x, y, w: L.w, h: L.h };
}
/* =====================================================================================================
 * SCENES
 * ===================================================================================================== */
function softShadow(src, dx, dy, alpha, col = '5,10,34') {
  const [a, ax] = mkCanvas(src.width, src.height); ax.drawImage(src, 0, 0);
  ax.globalCompositeOperation = 'source-in'; ax.fillStyle = `rgba(${col},1)`; ax.fillRect(0, 0, a.width, a.height);
  const sm = downTo(a, src.width / 4, src.height / 4), up = upChain(sm, src.width, src.height);
  const [o, ox] = mkCanvas(src.width, src.height); ox.imageSmoothingEnabled = true; ox.globalAlpha = alpha; ox.drawImage(up, dx, dy, src.width, src.height);
  return o;
}
const hudState = () => ({ p1: 12300, hi: 50000, p2: 8700, round: 1, extend1: [0, 1], extend2: [], lives1: 2, lives2: 1 });

function sceneGameplay(octx, t = 2.4) {
  const [sc, s] = mkCanvas(IW, IH); s.imageSmoothingEnabled = false;
  const L0 = LEVELS[0];
  drawBgGradient(s, IW, IH);
  drawFarTowers(s, t);
  drawMidReef(s, t);
  const terrain = buildTerrain(L0.map);
  s.drawImage(softShadow(terrain.canvas, 4, 6, 0.55), 0, 0);
  s.drawImage(terrain.canvas, 0, 0);
  s.drawImage(buildCaustics(terrain, t), 0, 0);
  drawWallHud(s, hudState());
  const lights = terrain.glows.map(g => ({ x: g.x, y: g.y, r: 14, c: g.c, a: 0.3, hole: 0.5 }));
  const over = [];      // drawn after lighting (popups, sparkles)

  // --- sushi on the platform around tile (8,17) with +2000 popup
  const sush = charSprite('sushi', {});
  const sy = 272 - 2 + Math.round(Math.sin(t * 3) * 1.5);
  blit(s, sush, 92, sy);
  lights.push({ x: 108, y: 292, r: 46, c: [255, 190, 130], a: 0.5, pulse: 3, hole: 0.8 });
  for (const [dx, dy, ph] of [[-12, -8, 0], [14, -4, 1.4], [4, -16, 2.6]]) { const a = (Math.sin(t * 4 + ph) + 1) / 2; if (a > 0.2) over.push(c => drawSparkle(c, 108 + dx, sy + 10 + dy, 2 + Math.round(a * 2), '#fff6c8', 0.6 + a * 0.4)); }
  over.push(c => { const tx = textCanvas('+2000', { ...TXT.gold }); c.drawImage(tx.canvas, Math.round(92 - tx.w / 2), 244 - 3); });

  // --- Nibbler trapped (stage 1, yellowish warning tint)
  const nsp = charSprite('nibbler', { t: 0.3, walk: 0.25 }, { scale: 0.92 });
  const shake = Math.round(Math.sin(t * 18)) ;
  drawBubble(s, 240, 192, 44, 'trap1', t, { phase: 0.5, under: (c, x, y) => { c.fillStyle = 'rgba(28,14,62,0.78)'; pixelDisc(c, x, y, 18.5); c.fillStyle = 'rgba(52,30,104,0.55)'; pixelDisc(c, x - 1, y - 1, 14); blit(c, nsp, x - 16 * 0.92 + shake, y - 16 * 0.92 + 3); } });
  lights.push({ x: 240, y: 192, r: 52, c: [255, 212, 110], a: 0.30, pulse: 6, hole: 0.6 });
  over.push(c => { drawVibe(c, 240, 192, 21, -1); drawVibe(c, 240, 192, 21, 1); });

  // --- empty bubbles under the ceiling around the attractor (15.5, 2)
  [[234, 70, 32, 0.2], [265, 67, 30, 1.7], [250, 91, 33, 2.9], [220, 93, 29, 4.1], [281, 91, 31, 5.0]].forEach(([x, y, d, ph]) => {
    drawBubble(s, x, y, d, 'empty', t, { phase: ph }); lights.push({ x, y, r: 26, c: [120, 220, 255], a: 0.2 });
  });

  // --- Jellop flying around (9,6)
  const jb = Math.round(Math.sin(t * 2.2) * 2);
  blit(s, charSprite('jellop', { t: (t * 0.8) % 1 }), 144, 128 + jb);
  lights.push({ x: 160, y: 140 + jb, r: 56, c: [170, 110, 255], a: 0.30, pulse: 2.2, hole: 0.55 });

  // --- Crabbit (ANGRY) walking on the platform around (20,11)
  blit(s, charSprite('crabbit', { angry: 1, walk: 0.3, t: 0.2 }), 320, 208);
  over.push(c => drawDust(c, 322, 240, 0.25, 1));
  lights.push({ x: 336, y: 236, r: 46, c: [255, 80, 80], a: 0.28 });
  over.push(c => drawSteam(c, 336, 224, t * 0.8));

  // --- Pop mid-jump facing left (24,15)
  const popP = { jump: 1, bob: -0.5, gillOff: -16, mouth: 0, tail: -3 };
  blit(s, charSprite('pop', popP, { flip: true, sx: 0.94, sy: 1.1, rot: 0.16 }), 388, 250);
  for (const [dx, h, a] of [[12, 16, 0.75], [18, 11, 0.6], [24, 14, 0.7], [30, 9, 0.5]]) over.push(c => { c.fillStyle = `rgba(200,244,255,${a})`; c.fillRect(388 + dx - 4, 288, 1, h); c.fillStyle = `rgba(255,255,255,${a * 0.8})`; c.fillRect(388 + dx - 4, 288, 1, 2); });
  lights.push({ x: 404, y: 266, r: 48, c: [215, 250, 246], a: 0.80, add: 0.08, lift: 1.3, hole: 0.95 });

  // --- Fizz on the floor around (5,23), mid-shot
  blit(s, charSprite('fizz', { mouth: 1, bob: 0.4 }, { sx: 1.03, sy: 0.97 }), 80, 400);
  over.push(c => drawDust(c, 76, 430, 0.22, 1));
  drawBubble(s, 126, 414, 22, 'empty', t, { phase: 0.7 });
  lights.push({ x: 126, y: 414, r: 30, c: [140, 235, 255], a: 0.30, add: 0.7 });
  lights.push({ x: 96, y: 410, r: 50, c: [255, 222, 234], a: 0.85, add: 0.08, lift: 1.3, hole: 0.95 });   // hero key light: lifts the sprite out of the dark, without pink wash
  drawDroplets(s, 119, 410, 7, 6, 3);

  // --- thunder special bubble rising (27,20)
  const thx = 440, thy = 360;
  drawBubble(s, thx, thy, 38, 'thunder', t, { phase: 1.1, under: (c, x, y) => { const g = c.createRadialGradient(x, y, 0, x, y, 17); g.addColorStop(0, 'rgba(255,250,210,0.75)'); g.addColorStop(0.6, 'rgba(255,236,150,0.28)'); g.addColorStop(1, 'rgba(255,236,150,0)'); c.fillStyle = g; c.fillRect(x - 18, y - 18, 36, 36); const ic = iconSprite('thunder', 1.2); c.drawImage(ic.canvas, Math.round(x - ic.ox), Math.round(y - ic.oy)); } });
  for (let k = 0; k < 3; k++) { const an = t * 2 + k * 2.1, r0 = 20, r1 = 28; over.push(c => drawArc(c, thx + Math.cos(an) * r0, thy + Math.sin(an) * r0, thx + Math.cos(an + 0.3) * r1, thy + Math.sin(an + 0.3) * r1, k * 7 + Math.floor(t * 6))); }
  lights.push({ x: thx, y: thy, r: 84, c: [255, 226, 110], a: 0.42, pulse: 9, hole: 0.7 });
  for (const [a, r] of [[0.5, 24], [2.1, 22], [3.6, 25], [5.0, 21]]) { const ang = a + t * 3, rr = r; over.push(c => drawSparkle(c, thx + Math.cos(ang) * rr, thy + Math.sin(ang) * rr * 0.9, 2, '#fffbd0', 0.9)); }

  // bioluminescent plankton: a few slow glowing motes (the room's own light, not sunlight)
  [[62, 150, [127, 240, 212]], [446, 128, [255, 150, 190]], [186, 332, [255, 214, 130]], [338, 304, [127, 240, 212]], [58, 372, [255, 150, 190]], [472, 296, [127, 240, 212]], [352, 120, [180, 200, 255]]].forEach(([x, y, c], i) => {
    const a = (Math.sin(t * 1.6 + i * 1.9) + 1) / 2, yy = y + Math.round(Math.sin(t * 0.7 + i) * 3);
    lights.push({ x, y: yy, r: 16, c, a: 0.10 + a * 0.14, hole: 0.3 });
    over.push(cc => { cc.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.55 + a * 0.4})`; cc.fillRect(x, yy, 2, 2); cc.fillStyle = 'rgba(255,255,255,0.9)'; cc.fillRect(x, yy, 1, 1); });
  });
  drawNearParticles(s, t, 5, [[240, 192, 28], [440, 360, 28], [126, 414, 16], [108, 282, 26], [336, 236, 26], [404, 266, 26], [160, 140, 22], [250, 80, 70]]);

  // --- lighting
  compositeLit(octx, sc, { t, lights, rays: { n: 6, gain: 0.9, shaft: { x: 256, w: 58, y0: 34, a: 0.115 } }, rayMask: terrain.canvas, vignette: 1 });
  // --- crisp overlay: popups + sparkles + HUD (not dimmed by the light layer)
  const [ov, ox] = mkCanvas(IW, IH);
  over.forEach(f => f(ox));
  drawPlayerTag(ox, 100, 372, 'p1', t); drawPlayerTag(ox, 404, 226, 'p2', t);
  drawHudTop(ox, hudState());
  octx.imageSmoothingEnabled = false; octx.drawImage(ov, 0, 0, octx.canvas.width, octx.canvas.height);
}

/* ---------------------------------------------------------------------------------------------
 * TITLE
 * --------------------------------------------------------------------------------------------- */
function titleMap() {
  const rows = [];
  for (let r = 0; r < 26; r++) {
    let row = '##' + '.'.repeat(28) + '##';
    if (r === 0 || r >= 24) row = '#'.repeat(32);
    if (r === 19 || r === 20) row = '##' + '.'.repeat(0) + '#######' + '.'.repeat(14) + '#######' + '##';   // cols 2-8 and 23-29 ledges (+ walls)
    rows.push(row);
  }
  return rows;
}
function arrowTri(ctx, x, y, dir, col, sh) {   // pixel triangle cursor
  for (let i = 0; i < 6; i++) { const w = 6 - i; ctx.fillStyle = sh; ctx.fillRect(x + (dir > 0 ? i + 1 : -i - w) + 0, y - w + 1, 1, w * 2); }
  for (let i = 0; i < 6; i++) { const h = 5 - i; ctx.fillStyle = col; ctx.fillRect(x + (dir > 0 ? i : -i), y - h, 1, h * 2 + 1); }
}
function menuPill(ctx, x, y, w, h, t) {
  const [cv, c] = mkCanvas(w, h); const img = c.createImageData(w, h), d = img.data;
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const cx = Math.min(px, w - 1 - px), cy = Math.min(py, h - 1 - py);
    if (cx + cy < 3) continue;
    const edge = (cx + cy === 3) || px === 0 || px === w - 1 || py === 0 || py === h - 1;
    let col;
    if (edge) col = py < h / 2 ? [255, 236, 170] : [220, 120, 60];
    else { const f = py / h; col = f < 0.18 ? [255, 160, 120] : f < 0.55 ? [255, 111, 145] : f < 0.82 ? [226, 84, 150] : [170, 60, 140]; if (py === 1) col = [255, 205, 190]; }
    const k = (py * w + px) * 4; d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255;
  }
  c.putImageData(img, 0, 0); ctx.drawImage(cv, Math.round(x), Math.round(y));
}
function drawBanner(ctx, cx, y, w, h) {
  const x0 = Math.round(cx - w / 2);
  for (const sd of [-1, 1]) {      // folded tails with a V notch
    const tx = sd < 0 ? x0 - 20 : x0 + w - 3, tw = 23, ty = y + 5, th = h - 2;
    for (let yy = 0; yy < th; yy++) for (let xx = 0; xx < tw; xx++) {
      const ex = sd < 0 ? xx : tw - 1 - xx;                         // distance from the outer end
      const notch = Math.abs(yy - th / 2 + 0.5);                    // V notch cut at the outer end
      if (ex < (th / 2 - notch) * 0.8) continue;
      const shade = yy < 3 ? '#b3366f' : yy > th - 4 ? '#5a1440' : '#8a2658';
      ctx.fillStyle = (yy === 0 || yy === th - 1) ? '#1a0f2e' : shade; ctx.fillRect(tx + xx, ty + yy, 1, 1);
    }
  }
  pxPanel(ctx, x0, y, w, h, { fill: '#1b0d44', fill2: '#2e1670', border: '#f2b13e', hi: '#ffe9a0', lo: '#0c0524', fa: 1, cut: 3 });
  ctx.fillStyle = 'rgba(255,225,150,0.30)'; ctx.fillRect(x0 + 5, y + 3, w - 10, 1);
  for (const dx of [8, w - 11]) { ctx.fillStyle = '#ffe9a0'; ctx.fillRect(x0 + dx, y + h / 2 - 1, 3, 3); ctx.fillStyle = '#e08a2c'; ctx.fillRect(x0 + dx + 1, y + h / 2, 2, 2); }
}

function sceneTitle(octx, t = 1.7) {
  const [sc, s] = mkCanvas(IW, IH); s.imageSmoothingEnabled = false;
  drawBgGradient(s, IW, IH);
  drawFarTowers(s, t, { alpha: 0.95, windows: false });
  drawMidReef(s, t, { layout: 'title' });
  // the Kraken King lurks in the abyss between the ledges: a dark silhouette with glowing eyes (the thief of the Moon Pearl)
  const kLights = [];
  { const ks = charSprite('kraken', {}), [kc, kx] = mkCanvas(ks.canvas.width, ks.canvas.height);
    kx.drawImage(ks.canvas, 0, 0); kx.globalCompositeOperation = 'source-atop'; kx.fillStyle = 'rgba(10,12,44,0.80)'; kx.fillRect(0, 0, kc.width, kc.height);
    const bob = Math.round(Math.sin(t * 0.9) * 1.5), kx0 = 204, ky0 = 326 + bob;
    s.drawImage(kc, kx0, ky0);
    for (const ex of [35.5, 60.5]) {
      const cxk = kx0 + ex + 4, cyk = ky0 + 42 + 2;
      s.fillStyle = '#ff9a2e'; pixelDisc(s, cxk, cyk, 7.6); s.fillStyle = '#ffd24a'; pixelDisc(s, cxk - 0.6, cyk - 0.8, 6.4); s.fillStyle = '#fff3b0'; pixelDisc(s, cxk - 1.6, cyk - 2, 3.2);
      s.fillStyle = '#2a0a2a'; s.fillRect(Math.round(cxk + (ex < 48 ? 1 : -1)), Math.round(cyk - 5), 2, 10);
      kLights.push({ x: cxk, y: cyk, r: 46, c: [255, 160, 60], a: 0.34, hole: 0.5 });
    } }
  const terrain = buildTerrain(titleMap());
  s.drawImage(softShadow(terrain.canvas, 4, 6, 0.55), 0, 0);
  s.drawImage(terrain.canvas, 0, 0);
  s.drawImage(buildCaustics(terrain, t), 0, 0);
  const lights = [...kLights, ...terrain.glows.map(g => ({ x: g.x, y: g.y, r: 14, c: g.c, a: 0.3, hole: 0.5 }))], over = [];
  // cameo enemies drifting in the background: Jellop (left) and Glimmer with its lantern (right)
  blit(s, charSprite('jellop', { t: (t * 0.6) % 1 }), 92, 188 + Math.round(Math.sin(t * 1.6) * 3));
  lights.push({ x: 108, y: 202, r: 54, c: [170, 110, 255], a: 0.26, pulse: 2, hole: 0.5 });
  blit(s, charSprite('glimmer', { t: (t * 0.5) % 1 }, { flip: true }), 392, 176 + Math.round(Math.cos(t * 1.4) * 3));
  lights.push({ x: 392 + 5, y: 176 + 14, r: 64, c: [255, 220, 110], a: 0.5, pulse: 3, hole: 0.6 });
  // heroes on the ledges (surface y = 32 + 19*16 = 336)
  const fizzS = charSprite('fizz', { mouth: 0, barbs: 3, fine: 1, bob: Math.round(Math.sin(t * 2.4) * 0.6), sway: Math.sin(t * 2.4) * 0.6 }, { scale: 2.5 });
  const popS = charSprite('pop', { mouth: 0, barbs: 3, fine: 1, bob: Math.round(Math.sin(t * 2.4 + 1) * 0.6), sway: Math.sin(t * 2.4 + 1) * 0.6 }, { scale: 2.5, flip: true });
  blit(s, fizzS, 46, 336 - 80);
  blit(s, popS, 512 - 46 - 80, 336 - 80);
  lights.push({ x: 70, y: 280, r: 76, c: [255, 120, 170], a: 0.14, hole: 0.4 }, { x: 442, y: 280, r: 76, c: [120, 235, 240], a: 0.14, hole: 0.4 });
  // bubbles floating between
  [[150, 236, 22, 0.3], [364, 226, 20, 1.2], [112, 196, 16, 2.3], [404, 192, 14, 3.3], [60, 232, 12, 4.0], [452, 250, 12, 5.0]].forEach(([x, y, d, ph]) => { drawBubble(s, x, y, d, 'empty', t, { phase: ph }); lights.push({ x, y, r: 22, c: [120, 220, 255], a: 0.2 }); });
  drawNearParticles(s, t, 11);
  // logo
  const lg = drawLogo(s, 256, 52, t);
  
  // tagline banner
  drawBanner(s, 256, 150, 238, 26);
  const tg = textCanvas('THE SUNKEN TOWER', { ...TXT.gold, track: 2 }); s.drawImage(tg.canvas, Math.round(256 - tg.w / 2), 150 + 13 - 11);
  // menu panel
  pxPanel(s, 136, 186, 240, 130, { fill: '#0a1738', fill2: '#14306a', border: '#3b78c8', hi: '#9acbf5', fa: 0.96, cut: 3 });
  const items = ['1 PLAYER', '2 PLAYERS', 'HOW TO PLAY', 'HI-SCORES', 'SOUND ON'];
  items.forEach((it, i) => {
    const y = 192 + i * 24;
    if (i === 0) {
      menuPill(s, 150, y - 1, 212, 22, t);
      const bob = Math.round(Math.sin(t * 5) * 1.5);
      arrowTri(s, 160 + bob, y + 10, 1, '#fff6c8', '#7a2a4a'); arrowTri(s, 351 - bob, y + 10, -1, '#fff6c8', '#7a2a4a');
      const tx = textCanvas(it, { ...TXT.menuSel, grad: ['#ffffff', '#fff3c8', '#ffe28a', '#ffc24a'], ol: '#5a1840' }); s.drawImage(tx.canvas, Math.round(256 - tx.w / 2), y + 12 - 11);
    } else {
      const tx = textCanvas(it, TXT.menu); s.drawImage(tx.canvas, Math.round(256 - tx.w / 2), y + 12 - 11);
    }
  });
  lights.push({ x: 256, y: 207, r: 70, c: [255, 120, 160], a: 0.3 });
  compositeLit(octx, sc, { t, lights, rays: { n: 8, gain: 0.85, wide: 1.3 }, rayMask: terrain.canvas, vignette: 1.0, bloom: 0.4, bloomThr: 238 });
  // crisp overlay: hi score + footer
  const [ov, ox] = mkCanvas(IW, IH);
  const hs = { ...hudState() };
  pxPanel(ox, 185, 2, 142, 28, { border: '#c99a3a', hi: '#ffe08a', fill: '#0a1738', fill2: '#13295a', fa: 0.92 });
  drawText(ox, 'HI SCORE', 266, 5, { ...TXT.goldS, align: 'center', shadow: '#060c22' });
  drawText(ox, '050000', 266, 13, { ...TXT.score, align: 'center' });
  ox.drawImage(crownIcon(), 192, 9);
  pxPanel(ox, 128, 421, 256, 24, { fill: '#0a1738', fill2: '#10224c', border: '#2d5a96', hi: '#6aa4e0', fa: 0.92, cut: 2 });
  const f1 = textCanvas('(C) 2026 FIZZ & POP', { epx: 0, grad: ['#e4f1ff', '#aecdf5'], ol: '#0a1738' }); ox.drawImage(f1.canvas, Math.round(256 - f1.w / 2), 422);
  const f2 = textCanvas('P1 ARROWS + Z   P2 WASD + Q', { epx: 0, grad: ['#b6d3f6', '#8fb4e6'], ol: '#0a1738' }); ox.drawImage(f2.canvas, Math.round(256 - f2.w / 2), 432);
  // glints on the logo
  for (const [gx0, gy0, ph, r] of [[66, 66, 0.0, 4], [212, 60, 1.7, 3], [364, 62, 3.1, 4], [452, 72, 4.6, 3], [296, 112, 2.4, 3]]) { const a = (Math.sin(t * 3 + ph) + 1) / 2; if (a > 0.25) drawSparkle(ox, gx0, gy0, r, '#ffffff', 0.5 + a * 0.5); }
  octx.imageSmoothingEnabled = false; octx.drawImage(ov, 0, 0, octx.canvas.width, octx.canvas.height);
}

/* ---------------------------------------------------------------------------------------------
 * CAST (1600x600 = 534x200 internal at x3)
 * --------------------------------------------------------------------------------------------- */
function pedestal(ctx, cx, y, w = 40) {
  const sp = sculpt(w + 8, 12, [E((w + 8) / 2, 7, w / 2, 3.6, THEME.stone, { ln: 0, th: [-0.6, -0.1, 0.45, 0.86] }), E((w + 8) / 2, 6, w / 2 - 1.5, 2.4, THEME.moss, { ln: 0, th: [-0.7, -0.2, 0.4, 0.84] })], {});
  ctx.drawImage(sp.canvas, Math.round(cx - (w + 8) / 2), Math.round(y - 6));
}
function sceneCast(octx, t = 1.2) {
  const IWc = 534, IHc = 200;
  const [sc, s] = mkCanvas(IWc, IHc); s.imageSmoothingEnabled = false;
  const [ov, o] = mkCanvas(IWc, IHc);            // crisp overlay: all text + palette chips (not dimmed by the light layer)
  drawBgGradient(s, IWc, IHc);
  for (let y = 15; y < IHc; y += 16) { s.fillStyle = 'rgba(8,16,48,0.20)'; s.fillRect(0, y, IWc, 1); for (let x = ((y >> 4) & 1) * 16 + 15; x < IWc; x += 32) s.fillRect(x, y - 15, 1, 15); }
  const lights = [];
  const row1 = 104;
  const lab = (name, sub, cx, y, col) => {
    const tn = textCanvas(name, { epx: 0, grad: col || ['#ffffff', '#cfe8ff'], ol: '#0b1a3e' }); o.drawImage(tn.canvas, Math.round(cx - tn.w / 2), y);
    if (sub) { const tr = textCanvas(sub, { epx: 0, grad: ['#bcd8ff', '#94b8ec'], ol: '#0b1a3e', shadow: null }); o.drawImage(tr.canvas, Math.round(cx - tr.w / 2), y + 10); }
  };
  const chars = [
    ['fizz', { mouth: 0 }, {}, 'FIZZ', 'P1 HERO', [255, 120, 170]], ['pop', { mouth: 0 }, { flip: true }, 'POP', 'P2 HERO', [120, 235, 240]],
    ['nibbler', { t: 0.1, walk: 0.1 }, {}, 'NIBBLER', 'WALKER', [255, 200, 90]], ['crabbit', { angry: 0, t: 0.2 }, {}, 'CRABBIT', 'THROWER', [255, 130, 70]],
    ['jellop', { t: 0.35 }, {}, 'JELLOP', 'FLYER', [190, 130, 255]], ['springle', { t: 0 }, {}, 'SPRINGLE', 'BOUNCER', [110, 240, 130]],
    ['glimmer', { t: 0.25 }, {}, 'GLIMMER', 'SPARKER', [120, 170, 255]], ['bonefin', { t: 0.1 }, {}, 'BONEFIN', 'GHOST', [190, 230, 255]],
  ];
  chars.forEach(([k, pose, op, name, role, lc], i) => {
    const cx = 28 + i * 51;
    pedestal(s, cx, row1 + 1, 40);
    blit(s, charSprite(k, pose, op), cx - 16, row1 - 32 + 1);
    lights.push({ x: cx, y: row1 - 14, r: 38, c: lc, a: 0.26, hole: 0.7 });
    lab(name, role, cx, row1 + 9);
  });
  { const cx = 470; pedestal(s, cx, row1 + 1, 76); blit(s, charSprite('kraken', {}), cx - 48, row1 - 96 + 1);
    lights.push({ x: cx, y: row1 - 48, r: 84, c: [190, 110, 255], a: 0.28, hole: 0.7 });
    lab('KRAKEN KING', 'FINAL BOSS', cx, row1 + 9, ['#fff2b0', '#ffc34a']); }
  const row2 = 156;
  const nsp = charSprite('nibbler', { t: 0.3, walk: 0.25 }, { scale: 0.86 });
  const icon = (k) => (c, x, y) => { const ic = iconSprite(k); c.drawImage(ic.canvas, Math.round(x - 12), Math.round(y - 12)); };
  const rows2 = [
    ['EMPTY', 'AQUA', c => drawBubble(c, 0, 0, 32, 'empty', t)],
    ['TRAPPED', 'CAUGHT', c => drawBubble(c, 0, 0, 40, 'trap0', t, { under: (cc, x, y) => { cc.fillStyle = 'rgba(30,24,80,0.5)'; pixelDisc(cc, x, y, 17); blit(cc, nsp, x - 13.76, y - 13); } })],
    ['THUNDER', 'SPECIAL', c => drawBubble(c, 0, 0, 36, 'thunder', t, { under: (cc, x, y) => { const g = cc.createRadialGradient(x, y, 0, x, y, 16); g.addColorStop(0, 'rgba(255,250,210,0.7)'); g.addColorStop(1, 'rgba(255,236,150,0)'); cc.fillStyle = g; cc.fillRect(x - 17, y - 17, 34, 34); const ic = iconSprite('thunder', 1.15); cc.drawImage(ic.canvas, Math.round(x - ic.ox), Math.round(y - ic.oy)); } })],
    ['FIRE', 'SPECIAL', c => drawBubble(c, 0, 0, 34, 'fire', t, { under: icon('fire') })],
    ['WATER', 'SPECIAL', c => drawBubble(c, 0, 0, 34, 'water', t, { under: icon('water') })],
    ['SUSHI', 'FOOD', c => blit(c, charSprite('sushi', {}), -16, -16)],
    ['PEARL', 'POWER-UP', c => blit(c, charSprite('pearl', { tint: 'pink' }), -16, -16)],
  ];
  const lcs = [[120, 220, 255], [255, 212, 110], [255, 226, 110], [255, 140, 70], [90, 150, 255], [255, 190, 130], [255, 170, 220]];
  rows2.forEach(([name, sub, fn], i) => {
    const cx = 36 + i * 58, cy = row2;
    s.save(); s.translate(cx, cy); fn(s); s.restore();
    lights.push({ x: cx, y: cy, r: 34, c: lcs[i], a: i === 0 ? 0.16 : 0.3, hole: 0.6 });
    lab(name, sub, cx, row2 + 22);
  });
  // title + palette chips (overlay)
  const lgo = drawLogo(o, 190, 2, t, 0.8);
  const tt = textCanvas('THE CAST', { epx: 1, grad: ['#fff2b0', '#ffd166', '#ffb23e', '#e0742a'], ol: '#2a1030', hi: '#fffbe0' }); o.drawImage(tt.canvas, 336, 8);
  const tg = textCanvas('CONCEPT A', { epx: 0, grad: ['#bfe6ff', '#8fc4f2'], ol: '#0b1a3e' }); o.drawImage(tg.canvas, 338, 29);
  const tg2 = textCanvas('PIXEL DELUXE', { epx: 0, grad: ['#bfe6ff', '#8fc4f2'], ol: '#0b1a3e' }); o.drawImage(tg2.canvas, 338, 39);
  const pal = PALETTE_JSON(), px0 = 416, py0 = 148;
  const tp = textCanvas('PALETTE', { epx: 0, grad: ['#bfe6ff', '#8fc4f2'], ol: '#0b1a3e' }); o.drawImage(tp.canvas, px0, py0 - 13);
  pal.forEach((p, i) => {
    const col = i % 2, row = i >> 1, x = px0 + col * 64, y = py0 + row * 10;
    o.fillStyle = '#0a0618'; o.fillRect(x - 1, y - 1, 12, 10); o.fillStyle = p.hex; o.fillRect(x, y, 10, 8); o.fillStyle = 'rgba(255,255,255,0.4)'; o.fillRect(x, y, 10, 1);
    const th = textCanvas(p.hex.toUpperCase(), { epx: 0, grad: ['#dbe9ff', '#b4cdf2'], ol: '#0b1a3e', shadow: null }); o.drawImage(th.canvas, x + 12 - th.pad, y - 1 - th.pad + 2);
  });
  drawNearParticles(s, t, 3);
  const [big, bx] = mkCanvas(1602, 600);
  compositeLit(bx, sc, { t, lights, rays: { n: 9, gain: 0.9, wide: 1.5 }, vignette: 0.9, bloom: 0.8, bloomThr: 204, extraGlow: (gx, K) => {
    chars.forEach(([k, pose, op, name, role, lc], i) => { const cx = (28 + i * 51) * K, top = 12 * K, bot = (row1 + 2) * K; const g = gx.createLinearGradient(0, top, 0, bot); g.addColorStop(0, `rgba(${lc},0)`); g.addColorStop(0.55, `rgba(${lc},0.07)`); g.addColorStop(1, `rgba(${lc},0.20)`); gx.fillStyle = g; gx.beginPath(); gx.moveTo(cx - 3 * K, top); gx.lineTo(cx + 3 * K, top); gx.lineTo(cx + 24 * K, bot); gx.lineTo(cx - 24 * K, bot); gx.closePath(); gx.fill(); });
    { const cx = 470 * K, top = 4 * K, bot = (row1 + 2) * K, lc = [190, 110, 255]; const g = gx.createLinearGradient(0, top, 0, bot); g.addColorStop(0, `rgba(${lc},0)`); g.addColorStop(0.5, `rgba(${lc},0.08)`); g.addColorStop(1, `rgba(${lc},0.22)`); gx.fillStyle = g; gx.beginPath(); gx.moveTo(cx - 8 * K, top); gx.lineTo(cx + 8 * K, top); gx.lineTo(cx + 54 * K, bot); gx.lineTo(cx - 54 * K, bot); gx.closePath(); gx.fill(); }
  } });
  bx.imageSmoothingEnabled = false; bx.drawImage(ov, 0, 0, 1602, 600);
  octx.imageSmoothingEnabled = false; octx.drawImage(big, -1, 0);
}
/* palette.json source of truth (also drawn on the cast sheet) */
function PALETTE_JSON() {
  return [
    { name: 'Deep Water', hex: '#0d1b3a', role: 'darkest water (vignette, bottom bands #0b1736), shadow side of all cool materials, HUD panel base' },
    { name: 'Reef Blue', hex: '#13315c', role: 'main background water: 12 clean hue-stepped bands from #1b4f80 (surface) to #0b1736 (floor), far towers, panel fill' },
    { name: 'Dusk Mauve', hex: '#84506c', role: 'masonry body (platforms, walls): deliberately desaturated and darker than the cast so heroes, bubbles and enemies read first' },
    { name: 'Coral', hex: '#ff6f91', role: 'Fizz (P1, ramp base #f4659a, belly peach #ffb38a), 1UP, logo FIZZ, menu highlight, coral polyps, sushi and barnacle warmth' },
    { name: 'Sea-foam', hex: '#7ff0d4', role: 'moss lips on platform tops (walkable-edge cue), Pop highlights, POP letters, plankton' },
    { name: 'Bubble Aqua', hex: '#8be9ff', role: 'bubble rims, 2UP, Pop body (ramp base #3fcfe6), caustics, god-rays' },
    { name: 'Gold', hex: '#ffd166', role: 'score digits, Nibbler brass, crown, thunder bubble, EXTEND gems, hi-score, the ceiling light shaft' },
    { name: 'Ink', hex: '#1a0f2e', role: 'outer outlines, letter outlines, deepest shadow (hue-shifted plum, never black)' },
    { name: 'Lavender', hex: '#b78cff', role: 'Pop gills, Jellop, Kraken King, hue-shifted shadows of warm colours' },
    { name: 'Crimson', hex: '#e0324f', role: 'ANGRY state (enemies turn crimson + steam), warning bubbles' },
  ];
}

/* =====================================================================================================
 * PUBLIC API — the reusable entry points that would become the GFX module of the real game
 *   drawPlayer / drawEnemy / drawBoss / drawFood / drawPowerup : sprites (sculpted once, cached, blitted)
 *   drawBubble(kind)                                           : pixel bubble sprites (+ trapped enemy, special icons)
 *   drawBackground / drawPlatforms                             : 3 parallax layers + autotiled masonry (from LEVELS[i].map)
 *   drawHud / drawWallHud / drawLogo / drawText                : UI
 *   compositeLit                                               : the light layer (ambient, point lights, rays, bloom, grade)
 * ===================================================================================================== */
function drawPlayer(ctx, who, pose, x, y, o = {}) { blit(ctx, charSprite(who === 'p2' || who === 'pop' ? 'pop' : 'fizz', pose, o), x, y); }
function drawEnemy(ctx, type, state, x, y, o = {}) { blit(ctx, charSprite(type, state, o), x, y); }
function drawBoss(ctx, state, x, y) { blit(ctx, charSprite('kraken', state), x, y); }
function drawFood(ctx, id, x, y) { blit(ctx, charSprite(id), x, y); }
function drawPowerup(ctx, tint, x, y) { blit(ctx, charSprite('pearl', { tint }), x, y); }
function drawBackground(ctx, t, o = {}) { drawBgGradient(ctx, IW, IH); drawFarTowers(ctx, t, o); drawMidReef(ctx, t, o); }
function drawPlatforms(ctx, map, t) { const terr = buildTerrain(map); ctx.drawImage(softShadow(terr.canvas, 4, 6, 0.55), 0, 0); ctx.drawImage(terr.canvas, 0, 0); ctx.drawImage(buildCaustics(terr, t), 0, 0); return terr; }
function drawHud(ctx, st) { drawHudTop(ctx, st); drawWallHud(ctx, st); }
const GFX_A = { drawPlayer, drawEnemy, drawBoss, drawFood, drawPowerup, drawBubble, drawBackground, drawPlatforms, drawHud, drawLogo, drawText, compositeLit, sculpt };
/* =====================================================================================================
 * MAIN
 * ===================================================================================================== */
const Z_DEBUG = 5;
function debugSheet(cv) {
  const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#13315c'; ctx.fillRect(0, 0, cv.width, cv.height);
  const Z = Z_DEBUG; let x = 8, y = 8;
  const put = (sp, label) => {
    if (x + sp.canvas.width * Z > cv.width) { x = 8; y += 40 * Z + 26; }
    ctx.drawImage(sp.canvas, x, y, sp.canvas.width * Z, sp.canvas.height * Z);
    ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.fillText(label, x, y + sp.canvas.height * Z + 12);
    x += sp.canvas.width * Z + 8;
  };
  for (const [k, pose, lab] of [['fizz', { mouth: 1 }, 'fizz shoot'], ['fizz', {}, 'fizz idle'], ['pop', {}, 'pop'], ['nibbler', {}, 'nibbler'], ['nibbler', { angry: 1 }, 'nibbler angry'], ['crabbit', {}, 'crabbit'], ['crabbit', { angry: 1 }, 'crabbit angry'], ['jellop', {}, 'jellop'], ['springle', {}, 'springle'], ['glimmer', {}, 'glimmer'], ['bonefin', {}, 'bonefin'], ['sushi', {}, 'sushi'], ['pearl', { tint: 'pink' }, 'pearl'], ['kraken', {}, 'kraken']]) put(charSprite(k, pose), lab);
}
function heroSheet(cv) {
  const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#17306a'; ctx.fillRect(0, 0, cv.width, cv.height);
  const items = [['fizz', { mouth: 0 }, {}, 'fizz idle'], ['fizz', { mouth: 1, bob: 0.4 }, { sx: 1.03, sy: 0.97 }, 'fizz shoot'], ['pop', { mouth: 0 }, {}, 'pop idle'],
    ['pop', { jump: 1, bob: -0.5, gillOff: -16, tail: -3 }, { flip: true, sx: 0.94, sy: 1.1, rot: 0.16 }, 'pop jump L'], ['fizz', { blink: 1 }, {}, 'fizz blink']];
  items.forEach(([k, pose, op, lab], i) => {
    const sp = charSprite(k, pose, op), Z = 9, x = 10 + i * 40 * Z * 0.9, y = 10;
    ctx.drawImage(sp.canvas, x, y, sp.canvas.width * Z, sp.canvas.height * Z);
    ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.fillText(lab, x, y + 40 * Z + 14);
    ctx.drawImage(sp.canvas, 10 + i * 100, 420, sp.canvas.width * 2, sp.canvas.height * 2);
    ctx.drawImage(sp.canvas, 10 + i * 60, 520, sp.canvas.width, sp.canvas.height);
  });
}
function boot() {
  const __t0 = performance.now();
  initMaterials(); initEnemyMaterials(); initItemMaterials(); initBubbleMaterials(); initWorldMaterials();
  const hash = (location.hash || '#gameplay').slice(1);
  const cv = document.getElementById('screen');
  const octx = cv.getContext('2d');
  if (hash === 'gameplay') { cv.width = 1024; cv.height = 896; sceneGameplay(cv.getContext('2d')); }
  else if (hash === 'title') { cv.width = 1024; cv.height = 896; sceneTitle(cv.getContext('2d')); }
  else if (hash === 'cast') { cv.width = 1600; cv.height = 600; sceneCast(cv.getContext('2d')); }
  else if (hash === 'logo') { cv.width = 1024; cv.height = 400; const c = cv.getContext('2d'); c.fillStyle = '#13315c'; c.fillRect(0,0,1024,400); c.imageSmoothingEnabled = false; const l = buildLogo(); c.drawImage(l.canvas, 20, 20, l.w * 2, l.h * 2); }
  else if (hash === 'hero') { cv.width = 1700; cv.height = 620; heroSheet(cv); }
  else if (hash === 'debug') { cv.width = 1600; cv.height = 1400; debugSheet(cv); }
  window.__renderMs = Math.round(performance.now() - __t0);
  window.__ready = true;
}
window.addEventListener('hashchange', () => location.reload());
window.addEventListener('load', boot);

/* Micro-benchmark used for the per-frame cost estimates in notes.md (run with #bench; results in window.__bench). */
window.__runBench = function () {
  const T = (f, n = 1) => { const t0 = performance.now(); for (let i = 0; i < n; i++) f(); return (performance.now() - t0) / n; };
  const R = {};
  SPR_CACHE.clear();
  const kinds = [['fizz', { mouth: 1 }], ['pop', {}], ['nibbler', {}], ['crabbit', { angry: 1 }], ['jellop', {}], ['springle', {}], ['glimmer', {}], ['bonefin', {}], ['sushi', {}], ['pearl', {}]];
  R.sculptPerSprite32 = T(() => { for (const [k, p] of kinds) { SPR_CACHE.clear(); charSprite(k, p); } }, 3) / kinds.length;
  R.sculptKraken96 = T(() => { SPR_CACHE.clear(); charSprite('kraken', {}); }, 3);
  R.terrain = T(() => buildTerrain(LEVELS[0].map), 3);
  const terr = buildTerrain(LEVELS[0].map);
  R.causticsFull = T(() => buildCaustics(terr, 1.3), 5);
  const [oc, ox] = mkCanvas(1024, 896); const [sc, sx] = mkCanvas(IW, IH); sx.fillStyle = '#13315c'; sx.fillRect(0, 0, IW, IH);
  const lights = Array.from({ length: 14 }, (_, i) => ({ x: 40 + i * 30, y: 100 + (i % 4) * 70, r: 40, c: [255, 200, 120], a: 0.3 }));
  R.compositeLit = T(() => compositeLit(ox, sc, { t: 1, lights, rays: { shaft: { x: 256, w: 58, y0: 34 } }, rayMask: terr.canvas }), 8);
  R.bloomOnly = T(() => bloomLayers(sc), 8);
  R.farTowers = T(() => { const [c, x] = mkCanvas(IW, IH); drawFarTowers(x, 1); }, 3);
  R.waterBands = T(() => { const [c, x] = mkCanvas(IW, IH); drawBgGradient(x, IW, IH); }, 3);
  const ks = ['fizz', 'pop', 'nibbler', 'crabbit', 'jellop'].map(k => charSprite(k, {}));
  R.blit30 = T(() => { for (let i = 0; i < 30; i++) blit(sx, ks[i % 5], 10 + i * 12, 100 + (i % 7) * 30); }, 50);
  R.textHud = T(() => drawHudTop(sx, hudState()), 20);
  for (const k in R) R[k] = +R[k].toFixed(2);
  window.__bench = R; return R;
};
