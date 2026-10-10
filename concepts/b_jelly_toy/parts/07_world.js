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
