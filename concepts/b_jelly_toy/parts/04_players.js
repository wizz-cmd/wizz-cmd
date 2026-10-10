/* ===================================================================================================
 * 04 PLAYERS — Fizz (pink) and Pop (lavender + aqua). Smooth vector axolotls, designed in a 100-unit
 * tall design space (feet at origin, +x = facing) and scaled by k = 0.2 -> a ~20 px tall toy for the
 * 16x16 logical box. Squash & stretch pivots at the feet; gills / tail carry secondary motion.
 * Silhouette: huge head, bean body, 3+3 bobbing gill fronds on the BACK of the head, paddle tail
 * behind -> facing direction reads from gills-vs-snout even in a silhouette.
 * ================================================================================================= */
const PLAYER_STYLE = {
  p1: { body: '#ff8fb8', gill: '#ff3f8e', tip: '#ff8cbc', gillFar: '#c91f6e', tipFar: '#f2589a', belly: '#fff0e0', cheek: '#ff4f8a', mouth: '#a21f5a', spot: null, name: 'Fizz' },
  p2: { body: '#aa9bff', gill: '#27cfe3', tip: '#8cf1f4', gillFar: '#119bbd', tipFar: '#48c9dd', belly: '#effcff', cheek: '#ff86b2', mouth: '#33328f', spot: '#7b66ee', name: 'Pop' },
};

const _PL = {};
function _plPaths() {
  if (_PL.body) return _PL;
  _PL.body = shape('M-26 -34 C-30 -62 -4 -72 14 -64 C34 -56 36 -22 24 -10 C12 2 -24 2 -26 -34 Z', -30, -72, 66, 74);
  _PL.head = shape('M-33 -64 C-35 -91 -12 -103 8 -101 C34 -99 50 -87 50 -66 C50 -44 32 -37 10 -37 C-14 -37 -31 -45 -33 -64 Z', -35, -103, 85, 66);
  return _PL;
}

function playerPose(pose, t, st) {
  const P = { sx: 1, sy: 1, lean: 0, bob: 0, mouth: 0, arm: 'down', armSwing: 0, footN: [0, 0], footF: [0, 0], sway: 0, tailAmp: 1, puff: 1, look: [0.35, 0.05], smile: 1 };
  const br = Math.sin(t * 2.6);
  switch (pose) {
    case 'walk': {
      const ph = t * 11;
      P.bob = -Math.abs(Math.sin(ph)) * 3.2;
      P.sy = 1 + Math.abs(Math.sin(ph)) * 0.025; P.sx = 2 - P.sy;
      P.lean = 0.045; P.arm = 'swing'; P.armSwing = Math.sin(ph);
      P.footN = [Math.sin(ph) * 8, Math.max(0, Math.cos(ph)) * 7];
      P.footF = [-Math.sin(ph) * 8, Math.max(0, -Math.cos(ph)) * 7];
      P.sway = -0.12; P.tailAmp = 1.4;
      break;
    }
    case 'jump':
      P.sy = 1.1; P.sx = 0.92; P.arm = 'cheer'; P.footN = [4, 11]; P.footF = [-6, 9]; P.sway = 0.5; P.mouth = 0; P.lean = 0.03; P.tailAmp = 0.5;
      P.look = [0.4, -0.2];
      break;
    case 'fall':
      P.sy = 0.96; P.sx = 1.05; P.arm = 'up'; P.footN = [6, 6]; P.footF = [-6, 4]; P.sway = -0.55; P.look = [0.3, 0.3]; P.tailAmp = 0.7;
      break;
    case 'shoot':
      P.sy = 1.02 + br * 0.01; P.sx = 1.05; P.arm = 'fwd'; P.mouth = st.mouth ?? 1; P.lean = -0.05; P.puff = 1.05; P.sway = -0.1; P.look = [0.5, 0.05];
      break;
    default:   // idle
      P.sy = 1 + br * 0.022; P.sx = 2 - P.sy; P.sway = Math.sin(t * 1.7) * 0.05;
  }
  if (st.mouth !== undefined && pose !== 'shoot') P.mouth = st.mouth;
  return P;
}

/**
 * One gill = tapered stalk + a feathery plume of tapered fronds (longer at the base, shorter toward the tip, alternating
 * sides, each one lighter than the stalk) + a 3-leaf fan at the tip. Reads as "frilly" even at 1x and sways per frond.
 */
function _gill(ctx, b, aDeg, L, sway, t, i, rpStalk, rpTip, w0 = 11, w1 = 6.5) {
  const a = rad(aDeg) + sway + Math.sin(t * 3.1 + i * 1.7) * 0.1;
  const dx = Math.cos(a), dy = Math.sin(a);
  const curve = Math.sin(t * 2.4 + i * 2.1) * 6 + 3;
  const mid = [b[0] + dx * L * 0.5 - dy * curve, b[1] + dy * L * 0.5 + dx * curve];
  const tip = [b[0] + dx * L, b[1] + dy * L];
  const pts = quad(b, mid, tip, 12);
  const at = (u) => {
    const q = u * (pts.length - 1), i0 = Math.min(pts.length - 2, Math.floor(q)), f = q - i0;
    const p0 = pts[i0], p1 = pts[i0 + 1];
    const tx = p1[0] - p0[0], ty = p1[1] - p0[1], d = Math.hypot(tx, ty) || 1;
    return [p0[0] + tx * f, p0[1] + ty * f, tx / d, ty / d];
  };
  const leaf = (px, py, ang, len, w, ph) => {
    const wob = Math.sin(t * 3.3 + ph) * 0.12;
    const A = ang + wob, ca = Math.cos(A), sa = Math.sin(A);
    const bend = Math.sin(t * 2.6 + ph * 1.3) * len * 0.12 + len * 0.1;
    const pp = [[px, py], [px + ca * len * 0.5 - sa * bend, py + sa * len * 0.5 + ca * bend], [px + ca * len, py + sa * len]];
    fastBlob(ctx, tubeShape(quad(pp[0], pp[1], pp[2], 5), w, w * 0.62), rpTip);
  };
  const nF = 5;
  for (let j = 0; j < nF; j++) {
    const u = 0.14 + j * 0.15, [px, py, tx, ty] = at(u);
    const side = j % 2 ? 1 : -1, base = Math.atan2(ty, tx);
    leaf(px, py, base + side * (0.9 - u * 0.4), L * (0.52 - u * 0.26), 8.6 - u * 3.2, j * 1.9 + i);
  }
  drawTube(ctx, pts, w0, w1, rpStalk, { hlA: 0.3 });
  // tip fan (centre leaf in front)
  const [ex, ey, tx, ty] = at(1), tb = Math.atan2(ty, tx);
  leaf(ex, ey, tb - 0.7, L * 0.28, 7.2, i + 7);
  leaf(ex, ey, tb + 0.7, L * 0.28, 7.2, i + 9);
  leaf(ex, ey, tb, L * 0.34, 8, i + 5);
}

/**
 * drawPlayer(ctx, who, st)  who: 'p1' | 'p2'
 * st: { x, y (feet centre, logical px), facing: 1|-1, pose: idle|walk|jump|fall|shoot, t (s), mouth 0..1,
 *       blink 0..1, scale (1 = 20 px tall toy), shadow:{y, a} optional contact shadow on a surface }
 */
function drawPlayer(ctx, who, st = {}) {
  const S = PLAYER_STYLE[who] || PLAYER_STYLE.p1;
  const t = st.t || 0, pose = st.pose || 'idle', f = st.facing || 1;
  const P = playerPose(pose, t, st);
  const k = 0.2 * (st.scale || 1);
  const { body, head } = _plPaths();
  const rBody = ramp(S.body), rGill = ramp(S.gill), rTip = ramp(S.tip), rBelly = ramp(S.belly);
  const rGillFar = ramp(S.gillFar), rTipFar = ramp(S.tipFar);
  const rFoot = ramp(mix(S.body, '#7a3fb0', 0.14));

  if (st.shadow) softShadow(ctx, st.x, st.shadow.y, 8.5 * (st.scale || 1) * (st.shadow.s ?? 1), 2.1 * (st.scale || 1) * (st.shadow.s ?? 1), st.shadow.a ?? 0.32);

  const prevF = JT.F; JT.F = f;
  ctx.save();
  ctx.translate(st.x || 0, st.y || 0);
  ctx.rotate(P.lean * f);
  ctx.scale(f * k * P.sx, k * P.sy);
  ctx.translate(0, P.bob);

  /* far gills (darker, behind everything) */
  [[-8, -99, -102, 24], [-24, -88, -136, 27], [-31, -72, -170, 25]].forEach((g, i) =>
    _gill(ctx, [g[0], g[1]], g[2], g[3], P.sway, t + 0.8, i + 3, rGillFar, rTipFar, 12, 7.6));

  /* tail */
  {
    const w = Math.sin(t * 3.2) * 9 * P.tailAmp, w2 = Math.cos(t * 3.2 - 0.6) * 9 * P.tailAmp;
    const pts = quad([-20, -22], [-48, -10 + w * 0.5], [-70, -38 + w2], 12);
    drawTube(ctx, pts, 27, 9, rBody, { hlA: 0.3 });
    // soft fin tint along the tail tip (light, follows the tube)
    const tip = pts.slice(6);
    drawTube(ctx, tip.map(([x, y]) => [x, y - 0.5]), 12, 5.6, ramp(mix(S.body, S.tip, 0.5)), { hl: false, rim: 0, edge: false, alpha: 0.55, spec: false });
  }

  /* far foot */
  paint(ctx, ellShape(-12 + P.footF[0], -5.5 - P.footF[1], 12, 7.2), rFoot, { spec: false, edgeA: 0.45 });

  /* body + belly */
  paint(ctx, body, rBody, { edgeA: 0.5 });
  ctx.save();
  ctx.clip(body.p);
  paint(ctx, ellShape(13, -30, 15.5, 22), rBelly, { rim: 0, spec: false, edge: false, lx: 0.4, ly: 0.2, spread: 0.9 });
  // soft AO under the chin onto the body
  const ao = ctx.createRadialGradient(8, -42, 2, 8, -42, 28);
  ao.addColorStop(0, alpha(mix(S.body, '#4a2a8c', 0.6), 0.5)); ao.addColorStop(1, alpha(S.body, 0));
  ctx.fillStyle = ao; ctx.fillRect(-40, -80, 90, 60);
  if (S.spot) {
    ctx.fillStyle = alpha(S.spot, 0.5);
    [[-14, -44, 3.2], [-6, -26, 2.6], [-17, -24, 2.2], [2, -52, 2.4], [-10, -57, 2]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); });
  }
  ctx.restore();

  /* near foot (toes as 3 tiny bumps) */
  {
    const fx = 16 + P.footN[0], fy = -5.5 - P.footN[1];
    paint(ctx, ellShape(fx, fy, 13.5, 7.6), rFoot, { spec: false, edgeA: 0.5 });
    ctx.fillStyle = alpha(S.mouth, 0.28);
    [-5, 1, 7].forEach((dx) => { ctx.beginPath(); ctx.ellipse(fx + 6 + dx * 0.6, fy + 1.6, 1.5, 1.1, 0, 0, TAU); ctx.fill(); });
  }

  /* near arm (drawn behind the head) */
  {
    let tgt;
    if (P.arm === 'swing') tgt = [18 + P.armSwing * 6, -26 + Math.abs(P.armSwing) * -3];
    else if (P.arm === 'cheer') tgt = [34, -56];
    else if (P.arm === 'up') tgt = [24, -62 + Math.sin(t * 9) * 2];
    else if (P.arm === 'fwd') tgt = [37, -44];
    else tgt = [24, -25];
    const pts = quad([8, -42], [(8 + tgt[0]) / 2 + 3, (-42 + tgt[1]) / 2 + 4], tgt, 8);
    drawTube(ctx, pts, 11, 9, rBody, { hlA: 0.35 });
    paint(ctx, ellShape(tgt[0] + 1, tgt[1] + 1, 6, 5.6), rBody, { rim: 0.5, edgeA: 0.4 });
    ctx.fillStyle = alpha(S.mouth, 0.3);
    [-2, 2.2].forEach((d) => { ctx.beginPath(); ctx.arc(tgt[0] + 3 + d * 0.4, tgt[1] + 2.6 + d * 0.5, 0.9, 0, TAU); ctx.fill(); });
  }

  /* near gills */
  [[-20, -90, -122, 31], [-28, -78, -158, 33], [-31, -63, -190, 29]].forEach((g, i) =>
    _gill(ctx, [g[0], g[1]], g[2], g[3], P.sway, t, i, rGill, rTip));

  /* head */
  ctx.save();
  ctx.translate(8, -68); ctx.scale(P.puff, P.puff * (2 - P.puff)); ctx.translate(-8, 68);
  paint(ctx, head, rBody, { edgeA: 0.5, lx: 0.4, ly: 0.2 });
  ctx.save();
  ctx.clip(head.p);
  if (S.spot) {
    ctx.fillStyle = alpha(S.spot, 0.45);
    [[-18, -84, 3], [-8, -92, 2.4], [-22, -72, 2.2], [4, -96, 2.2], [-12, -62, 1.9]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); });
  }
  // cheek blush
  spec(ctx, 41, -57, 10, 6, 0, 0.55, S.cheek);
  spec(ctx, 16, -55, 8, 4.5, 0, 0.3, S.cheek);
  ctx.restore();
  // crisp window highlight on the crown
  ctx.save(); ctx.clip(head.p);
  const wx = JT.F < 0 ? 1 : 1;
  gloss(ctx, -4, -92, 14, 4.6, -0.28, 0.5);
  ctx.restore();

  /* eyes */
  const lid = st.blink || 0;
  drawEye(ctx, 6, -75, 10.2, { look: P.look, lid });
  drawEye(ctx, 31, -72, 12, { look: P.look, lid });

  /* mouth */
  ctx.lineCap = 'round';
  if (P.mouth > 0.08) {
    const m = P.mouth;
    const my = -51, mx = 38 + (pose === 'shoot' ? 3 : 0);
    ctx.fillStyle = S.mouth;
    ctx.beginPath(); ctx.ellipse(mx, my, 6.5 + m * 2.5, 3 + m * 6, -0.1, 0, TAU); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.ellipse(mx, my, 6.5 + m * 2.5, 3 + m * 6, -0.1, 0, TAU); ctx.clip();
    ctx.fillStyle = '#ff7fa6'; ctx.beginPath(); ctx.ellipse(mx + 0.5, my + 3 + m * 3.5, 5.2, 3.4 + m * 2, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(mx - 12, my - 12, 24, 10);
    ctx.restore();
  } else {
    ctx.strokeStyle = S.mouth; ctx.lineWidth = 3.1;
    ctx.beginPath(); ctx.moveTo(25, -52); ctx.quadraticCurveTo(35, -43, 45, -54); ctx.stroke();
  }
  ctx.restore();   // head scale

  ctx.restore();
  JT.F = prevF;
}
