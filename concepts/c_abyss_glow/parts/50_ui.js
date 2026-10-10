/* ABYSS GLOW — HUD, score popups, logo, menu. Everything in OUTPUT px (S = px per logical px). */

const P1_COL = RGB.magenta, P2_COL = RGB.cyan, HI_COL = RGB.amber;

/* minimal HUD: thin tracked labels + thin numerals top-left / centre / top-right; round number + EXTEND letters in the walls;
 * lives as tiny glowing pearls at the foot of each wall. st = {s1, s2, hi, round, lives1, lives2, ext1:'EX', ext2:''} */
function drawHud(ctx, S, st, t) {
  const cap = 5.2 * S, lab = 2.5 * S;
  // labels
  const L = (txt, x, col, align, y) => drawText(ctx, txt, x, y === undefined ? 2.6 * S : y, lab, { col, align, track: 0.62, lw: Math.max(1.2, lab * 0.1), halo: 0.6, hot: 0.5 });
  const N = (txt, x, col, align) => drawText(ctx, txt, x, 6.9 * S, cap, { col, align, track: 0.3, lw: Math.max(1.5, cap * 0.075), halo: 0.7, hot: 0.55, mono: true });
  const xl = 19 * S, xr = (LW - 19) * S, xc = LW / 2 * S;
  L('1UP', xl, P1_COL, 'left');
  L('HI SCORE', xc, HI_COL, 'center');
  L('2UP', xr, P2_COL, 'right');
  N(st.s1, xl, mixc(P1_COL, WHITE, 0.8), 'left');
  N(st.hi, xc, mixc(HI_COL, WHITE, 0.8), 'center');
  N(st.s2, xr, mixc(P2_COL, WHITE, 0.8), 'right');
  // tiny pip beside each label: a glowing dot (P1/P2 identity) — reads even when labels are skimmed
  dot(ctx, xl - 2.6 * S, 3.7 * S, 0.65 * S, P1_COL, 1, { halo: 3.5 });
  dot(ctx, xr + 2.6 * S, 3.7 * S, 0.65 * S, P2_COL, 1, { halo: 3.5 });

  // round number: left wall, map rows 0-1
  drawText(ctx, st.round, 8 * S, 21 * S, 5 * S, { col: RGB.cyan, align: 'center', track: 0.3, lw: 1.7, halo: 0.9, hot: 0.55, mono: true });
  drawText(ctx, 'ROUND', 8 * S, 17.4 * S, 1.9 * S, { col: mixc(RGB.cyan, RGB.void, 0.35), align: 'center', track: 0.5, lw: 1.1, halo: 0.2, hot: 0.3 });

  // EXTEND letters down the walls (rows 4..9)
  const word = 'EXTEND';
  [[8, st.ext1 || '', P1_COL], [LW - 8, st.ext2 || '', P2_COL]].forEach(([cx, got, col]) => {
    for (let i = 0; i < 6; i++) {
      const cy = (16 + 4 * 8 + 4 + i * 8) * S;
      const on = !!(got[i] && got[i] !== '.');
      const flick = 0.9 + Math.sin(t * 3 + i) * 0.1;
      if (on) {
        glow(ctx, cx * S, cy, 5.5 * S, col, 0.26 * flick);
        drawText(ctx, word[i], cx * S, cy - 2.2 * S, 4.4 * S, { col: mixc(col, WHITE, 0.2), align: 'center', lw: 1.9, halo: 1.1, hot: 0.65, track: 0 });
        neon(ctx, circlePath(cx * S, cy, 3.6 * S), col, 1.0, { a: 0.55 * flick, halo: 0.4, hot: 0.2 });
      } else {
        drawText(ctx, word[i], cx * S, cy - 2.2 * S, 4.4 * S, { col: mixc(RGB.cyan, RGB.void, 0.42), align: 'center', lw: 1.3, halo: 0.0, hot: 0.2, track: 0, a: 0.9 });
      }
    }
  });

  // lives: tiny glowing pearls at the foot of each wall
  const pearl = (x, y, col) => {
    const br = 0.92 + Math.sin(t * 2.2 + x) * 0.08;
    glow(ctx, x, y, 5 * S, col, 0.34 * br);
    neon(ctx, circlePath(x, y, 2.35 * S), col, 1.2, { a: 0.8, halo: 0.5, hot: 0.4 });
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgba(hot(col, 0.55), 0.95 * br); ctx.beginPath(); ctx.arc(x, y, 1.15 * S, 0, TAU); ctx.fill(); ctx.restore();
  };
  for (let i = 0; i < st.lives1; i++) pearl(8 * S, (LH - 17.5 - i * 7) * S, P1_COL);
  for (let i = 0; i < st.lives2; i++) pearl((LW - 8) * S, (LH - 17.5 - i * 7) * S, P2_COL);
}

function drawPopup(ctx, txt, cx, cy, cap, t, col) {
  col = col || RGB.amber;
  const tw = textWidth(txt, 0.28) * cap, pw = tw + cap * 1.1, ph = cap * 1.9;
  ctx.save(); ctx.fillStyle = 'rgba(3,5,12,0.8)';           // scrim keeps the number legible over the crystal
  const rr = ph / 2, x0 = cx - pw / 2, y0 = cy - cap * 0.45;
  ctx.beginPath(); ctx.moveTo(x0 + rr, y0); ctx.lineTo(x0 + pw - rr, y0); ctx.arc(x0 + pw - rr, y0 + rr, rr, -Math.PI / 2, Math.PI / 2); ctx.lineTo(x0 + rr, y0 + ph); ctx.arc(x0 + rr, y0 + rr, rr, Math.PI / 2, -Math.PI / 2); ctx.closePath(); ctx.fill(); ctx.strokeStyle = rgba(col, 0.28); ctx.lineWidth = 1.2; ctx.stroke(); ctx.restore();
  glow(ctx, cx, cy + cap * 0.5, cap * 3.4, col, 0.22);
  drawText(ctx, txt, cx, cy, cap, { col, align: 'center', lw: Math.max(1.6, cap * 0.09), halo: 1.2, hot: 0.8, track: 0.28 });
}

/* ------------------------------------------------------------------ logo */
/* Hollow glass-tube lettering: every stroke of the wordmark is a tube with a bright 2-contour wall, a tinted translucent core of "liquid light",
 * a specular streak and a coloured halo - the same dark-core / luminous-contour language as the creatures (not a flat neon sign).
 * Built once per size into two cached layers (dark occluder, lit layer drawn additively); only the bubble-O and the rising bubbles are live. */
function ampersandPath(x, y, cap) {
  const P = [[0.80, 1.00], [0.52, 0.66], [0.26, 0.34], [0.18, 0.14], [0.27, 0.02], [0.42, 0.0], [0.56, 0.08], [0.58, 0.22], [0.48, 0.36], [0.28, 0.52], [0.08, 0.66], [0.0, 0.80], [0.06, 0.94], [0.22, 1.0], [0.42, 0.98], [0.58, 0.86], [0.70, 0.68], [0.76, 0.52]];
  return spline(P.map((p) => [x + p[0] * cap, y + p[1] * cap]), false, 0.5);
}
const _logoCache = {};
function logoLayers(W, H, groups, T) {
  const key = W + 'x' + H + '|' + T + '|' + groups.map((g) => g.id).join();
  if (_logoCache[key]) return _logoCache[key];
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.lineCap = 'round'; g.lineJoin = 'round'; return [c, g]; };
  const [dark, dg] = mk(), [lit, lg] = mk();
  const e = Math.max(1.8, T * 0.14);                  // wall thickness
  for (const G of groups) {
    const [wall, wg] = mk(), [core, cg] = mk(), [hotc, hg] = mk();
    const grad = (g, a0, a1) => { const gr = g.createLinearGradient(G.box[0], G.box[1], G.box[2], G.box[3]); gr.addColorStop(0, rgba(G.c0, a0)); gr.addColorStop(1, rgba(G.c1, a1)); return gr; };
    // wall: the tube minus its interior = two parallel contour lines
    wg.strokeStyle = grad(wg, 1, 1); wg.lineWidth = T; wg.stroke(G.path);
    wg.globalCompositeOperation = 'destination-out'; wg.lineWidth = T - 2 * e; wg.stroke(G.path);
    // hot line on the OUTER edge of the wall (the lit side of the glass)
    hg.strokeStyle = rgba(hot(G.c0, 0.9), 1); hg.lineWidth = T - e * 0.1; hg.stroke(G.path);
    hg.globalCompositeOperation = 'destination-out'; hg.lineWidth = T - e * 1.1; hg.stroke(G.path);
    // interior: translucent coloured liquid, brighter along the centre line, with a specular streak (clipped to the interior)
    cg.strokeStyle = grad(cg, 0.38, 0.22); cg.lineWidth = T - 2 * e; cg.stroke(G.path);
    cg.globalCompositeOperation = 'source-atop';
    cg.filter = 'blur(' + (T * 0.1).toFixed(2) + 'px)'; cg.strokeStyle = rgba(hot(G.c1, 0.45), 0.75); cg.lineWidth = (T - 2 * e) * 0.4; cg.stroke(G.path); cg.filter = 'none';
    cg.save(); cg.translate(-T * 0.17, -T * 0.2); cg.strokeStyle = rgba(WHITE, 0.55); cg.lineWidth = T * 0.09; cg.stroke(G.path); cg.restore();
    // occluder: opaque near-black body so the tube reads as a solid in front of the tower rings
    dg.strokeStyle = 'rgba(3,5,12,0.9)'; dg.lineWidth = T + 1.5; dg.stroke(G.path);
    // glow of the walls: two blurred copies
    lg.save(); lg.filter = 'blur(' + (T * 0.65).toFixed(1) + 'px)'; lg.globalAlpha = 0.95; lg.drawImage(wall, 0, 0); lg.restore();
    lg.save(); lg.filter = 'blur(' + (T * 1.4).toFixed(1) + 'px)'; lg.globalAlpha = 0.55; lg.drawImage(wall, 0, 0); lg.restore();
    lg.save(); lg.filter = 'blur(' + (T * 0.22).toFixed(1) + 'px)'; lg.globalAlpha = 1; lg.drawImage(wall, 0, 0); lg.restore();
    lg.drawImage(core, 0, 0); lg.drawImage(wall, 0, 0); lg.drawImage(hotc, 0, 0);
  }
  return (_logoCache[key] = { dark, lit });
}

function drawLogo(ctx, cx, y, cap, t) {
  const track = 0.5, T = cap * 0.17;
  const wF = textWidth('FIZZ', track) * cap, wA = 0.8 * cap, gap = cap * 0.56;
  const gP = GLYPH.P[0], gO = 1.04;                              // the O of POP becomes a bubble (diameter ~ 1.04 cap)
  const wP = (gP + track + gO + track + gP) * cap;
  const total = wF + gap + wA + gap + wP;
  const x = cx - total / 2;
  const xa = x + wF + gap, xp = xa + wA + gap;
  const bx = xp + (gP + track) * cap + gO * cap / 2, by = y + cap * 0.5;
  // soft colour clouds behind the wordmark
  glow(ctx, x + wF / 2, y + cap * 0.5, cap * 2.1, P1_COL, 0.17, 0.55);
  glow(ctx, xp + wP / 2, y + cap * 0.5, cap * 2.0, P2_COL, 0.16, 0.55);
  glow(ctx, xa + wA / 2, y + cap * 0.5, cap * 0.9, RGB.violet, 0.12, 0.8);
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const pF = textPath('FIZZ', x, y, cap, track);
  const pA = ampersandPath(xa, y, cap);
  const pP = new Path2D(); pP.addPath(textPath('P', xp, y, cap, 0)); pP.addPath(textPath('P', xp + (gP + track + gO + track) * cap, y, cap, 0));
  const L = logoLayers(W, H, [
    { id: 'F', path: pF, box: [x, y, x + wF, y + cap], c0: mixc(P1_COL, WHITE, 0.12), c1: mixc(P1_COL, RGB.violet, 0.22) },
    { id: 'A', path: pA, box: [xa, y, xa + wA, y + cap], c0: mixc(P1_COL, WHITE, 0.3), c1: mixc(P2_COL, WHITE, 0.2) },
    { id: 'P', path: pP, box: [xp, y, xp + wP, y + cap], c0: mixc(P2_COL, WHITE, 0.2), c1: mixc(RGB.cobalt, P2_COL, 0.4) },
  ], T);
  ctx.drawImage(L.dark, 0, 0);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(L.lit, 0, 0); ctx.restore();
  drawBubble(ctx, 'empty', bx, by, gO * cap / 2 + cap * 0.04, { t, ph: 1.3, halo: 1.2 });
  // bubbles fizzing up out of FIZZ
  const R = rng(9);
  for (let i = 0; i < 9; i++) {
    const bx0 = x + R.float(0.05, 0.95) * wF, ph = (t * R.float(0.12, 0.24) + R.float(0, 1)) % 1;
    const rr = cap * R.float(0.035, 0.1), px = bx0 + Math.sin(ph * 9 + i) * cap * 0.05, py = y - cap * 0.1 - ph * cap * 0.85;
    const a = Math.sin(Math.PI * ph);
    drawBubble(ctx, 'empty', px, py, rr, { t, ph: i, a: 0.95 * a, wobble: 0.6, tint: mixc(P1_COL, RGB.cyan, i % 3 * 0.3) });
  }
  // underline: hairline gradient with a pearl in the middle
  const uy = y + cap * 1.3, ux0 = cx - total / 2, ux1 = cx + total / 2;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const ug = ctx.createLinearGradient(ux0, 0, ux1, 0);
  ug.addColorStop(0, rgba(P1_COL, 0)); ug.addColorStop(0.2, rgba(P1_COL, 0.8)); ug.addColorStop(0.5, rgba(WHITE, 0.95)); ug.addColorStop(0.8, rgba(P2_COL, 0.8)); ug.addColorStop(1, rgba(P2_COL, 0));
  ctx.strokeStyle = ug; ctx.lineWidth = Math.max(1.4, cap * 0.014); ctx.beginPath(); ctx.moveTo(ux0, uy); ctx.lineTo(ux1, uy); ctx.stroke();
  ctx.restore();
  dot(ctx, cx, uy, cap * 0.028, WHITE, 1, { halo: 5 });
  return { total, uy };
}

function drawMenu(ctx, items, sel, cx, y0, cap, gap, t) {
  items.forEach((it, i) => {
    const y = y0 + i * gap, on = i === sel;
    if (on) {
      const tw = textWidth(it, 0.7) * cap;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(cx - tw / 2 - cap * 2.6, 0, cx + tw / 2 + cap * 2.6, 0);
      g.addColorStop(0, rgba(RGB.cyan, 0)); g.addColorStop(0.5, rgba(RGB.cyan, 0.11)); g.addColorStop(1, rgba(RGB.cyan, 0));
      ctx.fillStyle = g; ctx.fillRect(cx - tw / 2 - cap * 2.6, y - cap * 0.7, tw + cap * 5.2, cap * 2.4);
      ctx.restore();
      // chevrons either side
      const k = 0.5 + 0.5 * Math.sin(t * 3);
      const cv = (sx) => { const p = new Path2D(); const xx = cx + sx * (tw / 2 + cap * (1.0 + 0.12 * k)); p.moveTo(xx - sx * cap * 0.34, y + cap * 0.1); p.lineTo(xx, y + cap * 0.5); p.lineTo(xx - sx * cap * 0.34, y + cap * 0.9); return p; };
      neon(ctx, cv(-1), RGB.cyan, cap * 0.075, { halo: 1.2, hot: 0.7 }); neon(ctx, cv(1), RGB.cyan, cap * 0.075, { halo: 1.2, hot: 0.7 });
      drawText(ctx, it, cx, y, cap, { col: mixc(RGB.cyan, WHITE, 0.55), align: 'center', track: 0.7, lw: cap * 0.09, halo: 1.3, hot: 0.8 });
    } else {
      drawText(ctx, it, cx, y, cap, { col: mixc(RGB.cyan, RGB.void, 0.3), align: 'center', track: 0.7, lw: cap * 0.075, halo: 0.25, hot: 0.25, a: 0.9 });
    }
  });
}
