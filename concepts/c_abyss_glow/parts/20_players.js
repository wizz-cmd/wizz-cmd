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
