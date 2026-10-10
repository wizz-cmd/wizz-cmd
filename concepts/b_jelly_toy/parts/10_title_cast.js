/* ===================================================================================================
 * 10 TITLE + CAST SHEET
 * ================================================================================================= */

/* ------------------------------------------------ logo ------------------------------------------ */
const LOGO_COLORS = ['#ff5a7a', '#ffc42a', '#2fd5a0', '#8d78ff', '#ffffff', '#ff8a3c', '#ffffff', '#ff5a7a', '#ffc42a', '#38b8ff'];
/** Puffy glossy balloon logo "FIZZ & POP" (procedural tubes), centred on cx, caps h tall, baseline y. */
function drawLogo(ctx, cx, y, h, t = 0) {
  const str = 'FIZZ & POP';
  const o = { weight: 0.265, track: 0.075 };
  const w = textWidth(str, h, o);
  softShadow(ctx, cx, y + h * 0.2, w * 0.52, h * 0.2, 0.3);
  const jig = (i) => [0, Math.sin(t * 2.4 + i * 0.85) * h * 0.028, Math.sin(t * 1.9 + i * 1.3) * 0.022];
  // inflated balloon letters on a cream + ink sticker, with a soft drop shadow baked into the sprites
  drawInflated(ctx, str, cx, y, h, {
    ...o, align: 'center', colors: LOGO_COLORS, jiggle: jig,
    rings: [{ w: h * 0.15, c: '#fff4e6' }, { w: h * 0.07, c: '#26336e' }],
    shadow: { c: 'rgba(16,40,110,.38)', dx: 0, dy: h * 0.07 },
  });
  return w;
}

function menuPill(ctx, cx, y, w, h, label, sel, t, icon) {
  const x = cx - w / 2;
  if (sel) {
    glow(ctx, cx, y + h / 2, w * 0.7, '#ffd45c', 0.35);
    const s = 1 + Math.sin(t * 4) * 0.012;
    ctx.save(); ctx.translate(cx, y + h / 2); ctx.scale(s, s); ctx.translate(-cx, -(y + h / 2));
    pill(ctx, x - 1.5, y - 0.8, w + 3, h + 1.6, { fill: ['#ffe885', '#ffb52e'], hi: 'rgba(255,255,255,.9)', bounce: 0.0, glossA: 0.5, stroke: '#fff4d0', strokeW: 0.6, shadowC: 'rgba(120,60,20,.45)' });
    drawText(ctx, label, cx + 2, y + h / 2 + 2.7, 5.4, { align: 'center', weight: 0.25, track: 0.1, color: '#4a2410' });
    // bubble marker
    drawBubble(ctx, x + 6.2, y + h / 2, 3.2, { t, seed: 2, wobble: 0.3 });
    ctx.restore();
  } else {
    // frosted-glass pill: airy, lets the water through, deep-ink label (the heavy navy slabs fought the sunny world)
    pill(ctx, x, y, w, h, { fill: ['rgba(255,255,255,.66)', 'rgba(200,240,255,.5)'], hi: 'rgba(255,255,255,.95)', stroke: 'rgba(255,255,255,.95)', strokeW: 0.7, bounce: 0.12, glossA: 0.5, shadowC: 'rgba(16,60,130,.3)', sb: 3, sy: 1.2 });
    drawText(ctx, label, cx + (icon ? 3 : 0), y + h / 2 + 2.6, 5.2, { align: 'center', weight: 0.26, track: 0.1, color: '#1d3b6e' });
    if (icon === 'sound') {   // speaker + waves
      const ix = x + 8.4, iy = y + h / 2;
      ctx.save(); ctx.fillStyle = '#1d3b6e'; ctx.beginPath(); ctx.moveTo(ix - 3, iy - 1.5); ctx.lineTo(ix - 1.2, iy - 1.5); ctx.lineTo(ix + 1.6, iy - 3.4); ctx.lineTo(ix + 1.6, iy + 3.4); ctx.lineTo(ix - 1.2, iy + 1.5); ctx.lineTo(ix - 3, iy + 1.5); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#1d3b6e'; ctx.lineWidth = 0.8; ctx.lineCap = 'round';
      [2.4, 4].forEach((r) => { ctx.beginPath(); ctx.arc(ix + 1.4, iy, r, -0.9, 0.9); ctx.stroke(); });
      ctx.restore();
    }
  }
}

/** The Sunken Tower as a soft diorama backdrop: stacked pill tiers, arched windows lit lemon, slight tilt. */
let _towerCv = null;
function titleTower(S) {
  if (_towerCv && _towerCv.S === S) return _towerCv;
  const cv = mkCanvas(LW * S, LH * S), c = cv.getContext('2d');
  c.scale(S, S);
  c.save(); c.translate(128, 224); c.rotate(-0.03);
  const tiers = [[128, 30], [112, 28], [96, 27], [82, 26], [68, 25], [54, 24], [40, 22]];
  let y = 0;
  tiers.forEach(([w, h], i) => {
    const g = c.createLinearGradient(0, y - h, 0, y);
    g.addColorStop(0, '#9fe6f6'); g.addColorStop(1, '#4fb2dc');
    c.fillStyle = g; c.beginPath(); c.roundRect(-w / 2, y - h, w, h, 8); c.fill();
    c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.roundRect(-w / 2 + 4, y - h + 1.2, w - 8, 2.2, 1.1); c.fill();
    const n = Math.max(2, Math.round(w / 26));
    for (let k = 0; k < n; k++) {
      const wx = -w / 2 + (k + 0.5) * (w / n);
      const lit = (k + i) % 3 !== 0;
      if (lit) glow(c, wx, y - h * 0.4, 11, '#ffd978', 0.55);
      c.fillStyle = lit ? 'rgba(255,226,140,1)' : 'rgba(40,110,170,.55)';
      c.beginPath(); c.moveTo(wx - 3.4, y - 5); c.lineTo(wx - 3.4, y - h * 0.58); c.arc(wx, y - h * 0.58, 3.4, Math.PI, 0); c.lineTo(wx + 3.4, y - 5); c.closePath(); c.fill();
    }
    y -= h - 4;
  });
  // spire
  c.fillStyle = '#7fd2ee'; c.beginPath(); c.moveTo(-9, y); c.quadraticCurveTo(-3, y - 24, 2, y - 46); c.quadraticCurveTo(7, y - 22, 9, y); c.closePath(); c.fill();
  c.restore();
  const out = mkCanvas(LW * S, LH * S);
  const oc = out.getContext('2d');
  blurInto(out, cv, 0.7, S);
  out.S = S;
  return (_towerCv = out);
}

function titleMap() {
  const rows = [];
  for (let r = 0; r < 26; r++) rows.push('.'.repeat(32));
  const set = (r, c0, c1) => { rows[r] = rows[r].slice(0, c0) + '#'.repeat(c1 - c0 + 1) + rows[r].slice(c1 + 1); };
  set(25, 0, 31);
  [17, 18].forEach((r) => { set(r, 2, 9); set(r, 22, 29); });
  return rows;
}

function sceneTitle(ctx, t) {
  const S = JT.S;
  const map = titleMap();
  ctx.setTransform(S, 0, 0, S, 0, 0);
  drawBackground(ctx, t, S);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 0.78; ctx.drawImage(titleTower(S), 0, 0); ctx.restore();
  // deep-water grounding: the lower third sinks into cerulean so the podiums, the floor crowd and the tower windows carry the contrast
  {
    const dg = ctx.createLinearGradient(0, 110, 0, LH);
    dg.addColorStop(0, 'rgba(16,70,170,0)'); dg.addColorStop(1, 'rgba(16,64,160,.42)');
    ctx.fillStyle = dg; ctx.fillRect(0, 110, LW, LH - 110);
  }
  glow(ctx, 128, 34, 120, '#fffbe0', 0.18);                       // sun glare behind the logo
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(buildLevelLayer(map, S, 'title'), 0, 0);
  ctx.restore();
  drawCaustics(ctx, t, S, 0.05);
  drawForegroundBokeh(ctx, t);

  /* floor crowd: Crabbit strolling left, Springle bouncing right */
  softShadow(ctx, 34, 216.4, 13, 2.4, 0.34); softShadow(ctx, 226, 216.4, 10, 2, 0.3);
  drawCrabbit(ctx, { x: 34, y: 216 - 8 * 1.25, facing: 1, t, scale: 1.25, look: [0.5, 0.1] });
  drawSpringle(ctx, { x: 226, y: 216 - 8 * 1.25 - Math.max(0, Math.sin(t * 3)) * 9, facing: -1, t, scale: 1.25, hop: Math.max(0, Math.sin(t * 3)), squash: 1 - Math.max(0, Math.sin(t * 3)) });

  /* hero podiums: Fizz left, Pop right */
  softShadow(ctx, 48, 153, 19, 3.2, 0.35); softShadow(ctx, 208, 153, 19, 3.2, 0.35);
  drawPlayer(ctx, 'p1', { x: 48, y: 152, facing: 1, pose: 'idle', t, scale: 2.15, blink: (Math.sin(t * 1.1) > 0.985) ? 1 : 0 });
  drawPlayer(ctx, 'p2', { x: 208, y: 152, facing: -1, pose: 'idle', t: t + 0.7, scale: 2.15 });
  // villains in the air: trapped Nibbler (left), Jellop (right)
  drawBubble(ctx, 30, 84, 13.5, { kind: 'trap', stage: 0, t, seed: 3, inside: (c) => drawNibbler(c, { x: 0, y: 1, t: t * 1.2, trapped: true, noBob: true, walk: 0, scale: 0.98, look: [0.3, 0.1] }) });
  drawJellop(ctx, { x: 228, y: 86 + Math.sin(t * 1.6) * 3, facing: -1, t, scale: 1.25 });
  drawBubble(ctx, 82, 132, 5.4, { t, seed: 6 }); drawBubble(ctx, 176, 128, 4.6, { t, seed: 8 }); drawBubble(ctx, 62, 100, 3.6, { t, seed: 11 }); drawBubble(ctx, 196, 104, 3.2, { t, seed: 12 });

  /* logo + tagline */
  const w = drawLogo(ctx, 128, 62, 33, t);
  sparkle(ctx, 128 - w / 2 + 7, 27, 4.4 + Math.sin(t * 4) * 0.8, t, '#ffffff'); sparkle(ctx, 128 + w / 2 - 3, 32, 3.6 + Math.sin(t * 4 + 1) * 0.8, -t, '#fff2a8');
  sparkle(ctx, 128 - 6, 22, 2.4, t * 1.3, '#ffffff', 0.9);
  {
    const str = 'THE SUNKEN TOWER', th = 5.4;
    const tw = textWidth(str, th, { weight: 0.22, track: 0.2 }) + 20;
    pill(ctx, 128 - tw / 2, 73.5, tw, 12, { fill: ['#2f5eac', '#1b3b80'], stroke: 'rgba(255,255,255,.3)' });
    drawText(ctx, str, 128, 73.5 + 6 + th / 2, th, { align: 'center', weight: 0.22, track: 0.2, color: '#ffd45c' });
    drawBubble(ctx, 128 - tw / 2 - 4.5, 79.5, 3.2, { t, seed: 1, wobble: 0.4 }); drawBubble(ctx, 128 + tw / 2 + 4.5, 79.5, 3.2, { t, seed: 4, wobble: 0.4 });
  }

  if (!JT.lowFx) postBloom(ctx, 0.22);

  /* menu (UI stays crisp: drawn after the bloom pass) */
  const items = ['1 PLAYER', '2 PLAYERS', 'HOW TO PLAY', 'HI-SCORES', 'SOUND ON'];
  items.forEach((str, i) => menuPill(ctx, 128, 99 + i * 15.8, 80, 12.8, str, i === 0, t, i === 4 ? 'sound' : null));
  hudChip(ctx, 128, 189, 'HI SCORE', '#ffd45c', '#4a2a1a', '050000', { align: 'center' });
  drawBokeh(ctx, t * 1.3, 8);
}

/* ------------------------------------------------ CAST SHEET ---------------------------------- */
function castBackdrop(ctx, W, H, t) {
  // same light story as the game: warm sun top-left, luminous turquoise -> cerulean, pastel blurred reef far away
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#94f3e4'); g.addColorStop(0.2, '#4adce0'); g.addColorStop(0.55, '#25b0e6'); g.addColorStop(0.85, '#2283d8'); g.addColorStop(1, '#2058b8');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const sun = ctx.createRadialGradient(W * 0.06, -50, 0, W * 0.06, -50, W * 0.5);
  sun.addColorStop(0, 'rgba(255,248,205,.95)'); sun.addColorStop(0.3, 'rgba(255,240,190,.3)'); sun.addColorStop(1, 'rgba(255,240,190,0)');
  ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);
  // far reef: tower + domes + coral, pastel and blurred
  const far = mkCanvas(W, H), fc = far.getContext('2d');
  fc.globalAlpha = 0.55;
  const rnd0 = seeded(21);
  for (let i = 0; i < 12; i++) { fc.fillStyle = i % 2 ? '#bcd8ff' : '#aef2e6'; fc.beginPath(); fc.ellipse(40 + i * 140, H + 10, 80 + (i % 3) * 24, 100 + (i % 4) * 26, 0, Math.PI, TAU); fc.fill(); }
  fc.globalAlpha = 0.5;
  for (let i = 0; i < 9; i++) _branchCoral(fc, 90 + i * 190 + rnd0.float(-30, 30), H + 8, -Math.PI / 2 + rnd0.float(-0.2, 0.2), 120, 22, 3, rnd0, i % 2 ? '#c9b7ff' : '#9fe9de');
  fc.save(); fc.translate(1020, H + 6); fc.scale(2.2, 2.2); fc.globalAlpha = 0.5; fc.translate(-0, 0); fc.restore();
  const fb = mkCanvas(W, H); blurInto(fb, far, 9, 1);
  ctx.drawImage(fb, 0, 0);
  // slanted god rays
  for (let i = 0; i < 9; i++) {
    const x = -80 + i * 200 + (i % 2) * 40, w = 60 + (i % 3) * 36;
    const gr = ctx.createLinearGradient(x, 0, x + 260, H);
    gr.addColorStop(0, 'rgba(255,252,225,.3)'); gr.addColorStop(0.6, 'rgba(255,252,225,.08)'); gr.addColorStop(1, 'rgba(255,252,225,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + w, 0); ctx.lineTo(x + w + 340, H); ctx.lineTo(x + 230, H); ctx.closePath(); ctx.fill();
  }
  // caustics (scaled) + bokeh
  const tex = causticTexture();
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.15;
  for (let x = -40; x < W; x += 400) for (let y = -40; y < H; y += 400) ctx.drawImage(tex, x, y, 400, 400);
  ctx.restore();
  const rnd = seeded(31);
  for (let i = 0; i < 26; i++) {
    const r = rnd.float(8, 40), x = rnd.float(0, W), y = rnd.float(0, H), a = rnd.float(0.05, 0.13);
    const bg = ctx.createRadialGradient(x, y, r * 0.5, x, y, r);
    bg.addColorStop(0, `rgba(255,255,255,${a * 0.4})`); bg.addColorStop(0.8, `rgba(235,255,255,${a})`); bg.addColorStop(1, 'rgba(235,255,255,0)');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
}

function castLabel(ctx, x, y, text, color = '#fff4e6', w0 = 0) {
  const h = 22 * 0.62;
  const tw = textWidth(text, 15, { weight: 0.22, track: 0.14 }) + 30;
  const w = Math.max(w0, tw);
  const prevS = JT.S; JT.S = 1;
  pill(ctx, x - w / 2, y - 14, w, 28, { fill: ['#2d5aa8', '#1a3a7e'], stroke: 'rgba(255,255,255,.22)', sb: 5, sy: 3 });
  drawText(ctx, text, x, y + 7.5, 15, { align: 'center', weight: 0.22, track: 0.14, color });
  JT.S = prevS;
}

/** draws fn(ctx) in a local logical-px space at (x,y), scaled sc device px per logical px. */
function at(ctx, x, y, sc, fn) {
  const prev = JT.S; JT.S = sc;
  ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
  fn(ctx);
  ctx.restore(); JT.S = prev;
}

function sceneCast(ctx, t) {
  const W = 1600, H = 600;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  castBackdrop(ctx, W, H, t);
  const SC = 6.7;

  /* header */
  at(ctx, 0, 0, 1, () => {
    drawText(ctx, 'FIZZ & POP', 40, 52, 32, { style: 'tube', weight: 0.3, colors: LOGO_COLORS, outline: { c: '#26336e', w: 3.4 }, shadow: { dy: 5, c: 'rgba(20,40,110,.3)' } });
    drawText(ctx, 'CONCEPT B   JELLY TOY   CAST SHEET', 268, 50, 15, { weight: 0.22, track: 0.2, color: '#26336e', alpha: 0.85 });
  });

  /* shelves: Row A (heroes + walkers) and Row B (flyers + hoppers); the boss gets a podium of its own */
  const rowA = 262, rowB = 506;
  at(ctx, 0, 0, SC, () => {
    drawSlab(ctx, 24 / SC, rowA / SC, 790 / SC, 40 / SC, 'candy', 12, { r: 20 / SC, drip: 0.55 });
    drawSlab(ctx, 24 / SC, rowB / SC, 790 / SC, 40 / SC, 'candy', 14, { r: 20 / SC, drip: 0.55 });
    drawSlab(ctx, 836 / SC, rowB / SC, 258 / SC, 40 / SC, 'candy', 16, { r: 20 / SC, drip: 0.55 });
  });

  const cells = [
    ['p1', 150, rowA, 'FIZZ'], ['p2', 352, rowA, 'POP'], ['nibbler', 548, rowA, 'NIBBLER'], ['crabbit', 722, rowA, 'CRABBIT'],
    ['jellop', 110, rowB, 'JELLOP'], ['springle', 254, rowB, 'SPRINGLE'], ['glimmer', 426, rowB, 'GLIMMER'], ['bonefin', 672, rowB, 'BONEFIN'],
  ];
  cells.forEach(([id, x, feet, label], i) => {
    const tt = t + i * 0.37;
    at(ctx, 0, 0, SC, () => {
      if (id === 'p1' || id === 'p2') {
        softShadow(ctx, x / SC, feet / SC + 0.4, 10, 2.2, 0.34);
        drawPlayer(ctx, id, { x: x / SC, y: feet / SC, facing: 1, pose: 'idle', t: tt, scale: 1.12 });
      } else {
        const fly = id === 'jellop' || id === 'glimmer' || id === 'bonefin';
        const lift = fly ? 2.5 : 0;
        softShadow(ctx, x / SC, feet / SC + 0.4, fly ? 7 : 10, fly ? 1.6 : 2.2, fly ? 0.2 : 0.34);
        const d = { nibbler: drawNibbler, crabbit: drawCrabbit, jellop: drawJellop, springle: drawSpringle, glimmer: drawGlimmer, bonefin: drawBonefin }[id];
        const sc = id === 'springle' ? 1.38 : id === 'bonefin' ? 1.22 : 1.12;
        d(ctx, { x: x / SC, y: feet / SC - 8 * sc - lift, facing: 1, t: tt, scale: sc, look: [0.4, 0.1] });
      }
    });
    castLabel(ctx, x, feet + 62, label);
  });
  // the boss
  at(ctx, 0, 0, SC, () => {
    softShadow(ctx, 968 / SC, rowB / SC + 0.4, 22, 3.4, 0.34);
    drawKraken(ctx, { x: 968 / SC, y: (rowB - 152) / SC, facing: -1, t: t + 0.4, scale: 0.54 });
  });
  castLabel(ctx, 968, rowB + 62, 'KRAKEN KING', '#ffd45c');

  /* right panel: bubble states, food, power-up, angry */
  at(ctx, 0, 0, 1, () => {
    pill(ctx, 1144, 90, 446, 494, { r: 30, fill: ['rgba(255,255,255,.22)', 'rgba(255,255,255,.1)'], hi: 'rgba(255,255,255,.55)', glossA: 0.12, bounce: 0.05, stroke: 'rgba(255,255,255,.35)', strokeW: 1.2, sb: 14, sy: 6, shadowC: 'rgba(14,50,120,.25)' });
  });
  const px = 1226, pxs = [1226, 1366, 1506];
  const r1 = 158, r2 = 302, r3 = 468;
  const B = 4.5;
  at(ctx, 0, 0, B, () => {
    drawBubble(ctx, px / B, r1 / B, 9, { t, seed: 1 });
    drawBubble(ctx, pxs[1] / B, r1 / B, 12.6, { kind: 'trap', stage: 0, t, seed: 2, inside: (c) => drawNibbler(c, { x: 0, y: 1, t, trapped: true, noBob: true, walk: 0, scale: 0.86, look: [0.2, 0.1] }) });
    drawBubble(ctx, pxs[2] / B, r1 / B, 12.6, { kind: 'trap', stage: 1, t, seed: 3, inside: (c) => drawCrabbit(c, { x: 0, y: 1, t, trapped: true, walk: 0, scale: 0.8, look: [0.3, 0.1] }) });
    drawBubble(ctx, pxs[0] / B, r2 / B, 10, { kind: 'thunder', t, seed: 4 });
    drawBubble(ctx, pxs[1] / B, r2 / B, 10, { kind: 'fire', t, seed: 5 });
    drawBubble(ctx, pxs[2] / B, r2 / B, 10, { kind: 'water', t, seed: 6 });
  });
  castLabel(ctx, pxs[0], r1 + 80, 'EMPTY'); castLabel(ctx, pxs[1], r1 + 80, 'TRAPPED'); castLabel(ctx, pxs[2], r1 + 80, 'WARNING');
  castLabel(ctx, pxs[0], r2 + 78, 'THUNDER'); castLabel(ctx, pxs[1], r2 + 78, 'FIRE'); castLabel(ctx, pxs[2], r2 + 78, 'WATER');
  at(ctx, 0, 0, 4.8, () => {
    drawSushi(ctx, pxs[0] / 4.8, (r3 - 2) / 4.8, t);
    drawHeart(ctx, pxs[1] / 4.8, (r3 - 2) / 4.8, t + 1);
  });
  at(ctx, 0, 0, 4.4, () => drawCrabbit(ctx, { x: pxs[2] / 4.4, y: (r3 + 8) / 4.4, facing: -1, t, angry: true, scale: 0.92, look: [0.5, 0] }));
  castLabel(ctx, pxs[0], r3 + 78, 'FOOD'); castLabel(ctx, pxs[1], r3 + 78, 'POWER-UP'); castLabel(ctx, pxs[2], r3 + 78, 'ANGRY', '#ff9aa8');
}
