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
