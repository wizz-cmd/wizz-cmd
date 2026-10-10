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
