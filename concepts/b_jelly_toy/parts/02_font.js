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
