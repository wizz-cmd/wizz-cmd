/* ===================================================================================================
 * 08 HUD / UI — soft rounded chips, glossy pill buttons, bead letters, axolotl-head life icons.
 * Text is the procedural stroke font (no fillText). All sizes in logical px.
 * ================================================================================================= */
function pill(ctx, x, y, w, h, o = {}) {
  const S = JT.S;
  ctx.save();
  const p = new Path2D(); rrectPath(p, x, y, w, h, o.r ?? h / 2);
  if (o.shadow !== false) {
    ctx.shadowColor = o.shadowC || 'rgba(14,40,100,.42)'; ctx.shadowBlur = (o.sb ?? 2.4) * S; ctx.shadowOffsetY = (o.sy ?? 1.1) * S;
  }
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  const c = o.fill || ['#2a4f94', '#1b3a78'];
  g.addColorStop(0, c[0]); g.addColorStop(1, c[1]);
  ctx.fillStyle = g; ctx.fill(p);
  ctx.shadowColor = 'transparent';
  ctx.save(); ctx.clip(p);
  // inner bevel: bright top edge, aqua bounce from below
  ctx.lineWidth = 0.9; ctx.strokeStyle = o.hi || 'rgba(255,255,255,.42)'; ctx.translate(0, 0.55); ctx.stroke(p); ctx.translate(0, -0.55);
  const bg = ctx.createLinearGradient(0, y + h * 0.55, 0, y + h);
  bg.addColorStop(0, 'rgba(90,230,255,0)'); bg.addColorStop(1, `rgba(90,230,255,${o.bounce ?? 0.35})`);
  ctx.fillStyle = bg; ctx.fillRect(x, y + h * 0.5, w, h * 0.5);
  if (o.gloss !== false) {   // top gloss window
    const gg = ctx.createLinearGradient(0, y, 0, y + h * 0.5);
    gg.addColorStop(0, `rgba(255,255,255,${o.glossA ?? 0.3})`); gg.addColorStop(1, 'rgba(255,255,255,0.04)');
    ctx.fillStyle = gg; ctx.beginPath(); ctx.roundRect(x + h * 0.3, y + h * 0.1, w - h * 0.6, h * 0.36, h * 0.18); ctx.fill();
  }
  ctx.restore();
  if (o.stroke) { ctx.lineWidth = o.strokeW ?? 0.5; ctx.strokeStyle = o.stroke; ctx.stroke(p); }
  ctx.restore();
}

function hudChip(ctx, x, y, label, lc, ink, value, o = {}) {
  const h = o.h ?? 10.6;
  const lh = 4.3, vh = 5.5;
  const lw = textWidth(label, lh, { weight: 0.26, track: 0.1 }) + 5.4;
  const vw = textWidth(value, vh, { weight: 0.24, track: 0.1 }) + 5.2;
  const w = lw + vw + 1;
  let X = x;
  if (o.align === 'right') X = x - w; else if (o.align === 'center') X = x - w / 2;
  pill(ctx, X, y, w, h, { fill: ['#2c5399', '#1a3772'], stroke: 'rgba(255,255,255,.18)' });
  // label capsule
  pill(ctx, X + 0.9, y + 0.9, lw, h - 1.8, { fill: [mix(lc, '#ffffff', 0.28), lc], shadow: false, gloss: true, glossA: 0.45, bounce: 0.0, hi: 'rgba(255,255,255,.7)' });
  drawText(ctx, label, X + 0.9 + lw / 2, y + h / 2 + lh / 2, lh, { align: 'center', weight: 0.26, track: 0.1, color: ink });
  drawText(ctx, value, X + lw + 3.4, y + h / 2 + vh / 2, vh, { weight: 0.24, track: 0.1, color: '#fff7e6' });
  return w;
}

const EXT_COLORS = ['#ff7a8a', '#ffd45c', '#7fe3b0', '#52d4ff', '#a98bff', '#ff9a5c'];
function drawExtendBead(ctx, x, y, letter, lit, color, t = 0) {
  // recessed well: dark inner shadow on the top-left, light lip on the bottom-right (carved into the clay)
  ctx.save();
  const lip = ctx.createLinearGradient(0, y - 5.4, 0, y + 5.4);
  lip.addColorStop(0, 'rgba(120,50,80,.6)'); lip.addColorStop(1, 'rgba(255,236,206,.85)');
  ctx.fillStyle = lip; ctx.beginPath(); ctx.arc(x, y, 5.4, 0, TAU); ctx.fill();
  const wg = ctx.createRadialGradient(x - 1.2, y - 1.6, 0.4, x, y, 4.7);
  wg.addColorStop(0, lit ? 'rgba(80,28,70,.7)' : 'rgba(150,72,98,.9)'); wg.addColorStop(1, lit ? 'rgba(70,24,64,.8)' : 'rgba(112,48,84,.95)');
  ctx.fillStyle = wg; ctx.beginPath(); ctx.arc(x, y + 0.2, 4.6, 0, TAU); ctx.fill();
  if (!lit) {
    // unlit: a pale, clearly legible engraved letter (cream on berry) so the EXTEND word is always readable
    drawText(ctx, letter, x, y + 2.1 + 0.35, 4.3, { align: 'center', weight: 0.3, color: 'rgba(70,20,60,.55)' });
    drawText(ctx, letter, x, y + 2.1, 4.3, { align: 'center', weight: 0.3, color: 'rgba(255,238,226,.95)' });
  } else {
    const lift = Math.sin(t * 3 + x) * 0.2;
    glow(ctx, x, y, 9.5, color, 0.55);
    paint(ctx, ellShape(x, y - 0.3 + lift, 4.5, 4.5), ramp(color), { rim: 0.6, edgeA: 0.55, spec: false });
    gloss(ctx, x - 1.5, y - 2.5 + lift, 1.6, 0.8, -0.5, 0.85);
    drawText(ctx, letter, x + 0.1, y + 1.9 + lift, 4.0, { align: 'center', weight: 0.3, color: '#fffdf3', outline: { c: alpha(ramp(color).deep, 0.9), w: 0.5 } });
  }
  ctx.restore();
}

/** Tiny axolotl head for life counters. */
function drawLifeIcon(ctx, x, y, who) {
  const S = PLAYER_STYLE[who];
  const rB = ramp(S.body), rG = ramp(S.gill);
  const prev = JT.F; JT.F = 1;
  ctx.save(); ctx.translate(x, y);
  // wells like the beads
  ctx.fillStyle = 'rgba(90,35,80,.4)'; ctx.beginPath(); ctx.arc(0, 0.2, 5.6, 0, TAU); ctx.fill();
  const wg = ctx.createLinearGradient(0, -5.5, 0, 5.5); wg.addColorStop(0, 'rgba(255,255,255,0)'); wg.addColorStop(1, 'rgba(255,230,200,.45)');
  ctx.strokeStyle = wg; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.arc(0, 0.2, 5.5, 0, TAU); ctx.stroke();
  // gills (3 bulbs per side)
  [[-5.4, -3.4], [-6.2, -0.4], [-5.2, 2.4], [5.4, -3.4], [6.2, -0.4], [5.2, 2.4]].forEach(([gx, gy]) => paint(ctx, ellShape(gx, gy, 1.9, 1.9), rG, { rim: 0.5, edgeA: 0.4, spec: false }));
  paint(ctx, ellShape(0, 0.4, 4.7, 4.1), rB, { rim: 0.6, edgeA: 0.5 });
  [-1.9, 1.9].forEach((ex) => drawEye(ctx, ex, -0.4, 1.35, { look: [0, 0.1], bounce: 0.2 }));
  spec(ctx, -3, 1.6, 1.6, 0.9, 0, 0.6, S.cheek); spec(ctx, 3, 1.6, 1.6, 0.9, 0, 0.6, S.cheek);
  ctx.strokeStyle = S.mouth; ctx.lineWidth = 0.45; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-1, 2); ctx.quadraticCurveTo(0, 2.8, 1, 2); ctx.stroke();
  ctx.restore();
  JT.F = prev;
}
function drawLifeWell(ctx, x, y) {
  // empty life slot: just a faint engraved ring (reads as "slot", not as a hole)
  ctx.strokeStyle = 'rgba(120,50,90,.28)'; ctx.lineWidth = 0.6; ctx.setLineDash([1.2, 1.4]);
  ctx.beginPath(); ctx.arc(x, y + 0.2, 5.0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
}

function drawRoundBadge(ctx, x, y, str) {
  ctx.save();
  glow(ctx, x, y, 12, '#ffe58a', 0.35);
  paint(ctx, rrShape(x - 6.6, y - 4.6, 13.2, 9.2, 4.6), ramp('#ffd45c'), { rim: 0.5, edgeA: 0.6, spec: true });
  drawText(ctx, str, x, y + 2.7, 5.4, { align: 'center', weight: 0.26, track: 0.08, color: '#4a2a1a' });
  ctx.restore();
}

function drawHud(ctx, st, t = 0) {
  const sc = st.scores;
  hudChip(ctx, 3.5, 2.8, '1UP', '#ff7a8a', '#5a1030', sc.p1, {});
  hudChip(ctx, 128, 2.8, 'HI SCORE', '#ffd45c', '#4a2a1a', sc.hi, { align: 'center' });
  hudChip(ctx, LW - 3.5, 2.8, '2UP', '#a98bff', '#2a1a6a', sc.p2, { align: 'right' });
  drawRoundBadge(ctx, 8, 26, st.round);
  const letters = 'EXTEND';
  for (let i = 0; i < 6; i++) {
    drawExtendBead(ctx, 8, 51 + i * 11.4, letters[i], st.extP1.includes(i), EXT_COLORS[i], t);
    drawExtendBead(ctx, LW - 8, 51 + i * 11.4, letters[i], (st.extP2 || []).includes(i), EXT_COLORS[i], t);
  }
  for (let i = 0; i < 3; i++) {
    const y = 203 - i * 12;
    if (i < st.lives1) drawLifeIcon(ctx, 8, y, 'p1'); else if (i < 2) drawLifeWell(ctx, 8, y);
    if (i < st.lives2) drawLifeIcon(ctx, LW - 8, y, 'p2'); else if (i < 2) drawLifeWell(ctx, LW - 8, y);
  }
}
