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
