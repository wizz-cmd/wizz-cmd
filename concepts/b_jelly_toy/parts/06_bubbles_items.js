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
