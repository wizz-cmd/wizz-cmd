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
