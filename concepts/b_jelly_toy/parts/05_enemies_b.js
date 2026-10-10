/* ------------------------------------------------ SPRINGLE (seahorse on a spring) -------------- */
/** A real helix spring seen from the side: back half darker + behind, front half bright + diagonal. */
function drawHelix(ctx, x, yBot, yTop, turns, rx, ry, wire, rp) {
  const N = Math.round(turns * 28), pts = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, s = u * turns * TAU - Math.PI * 0.5;
    pts.push({ x: x + Math.cos(s) * rx, y: yBot + (yTop - yBot) * u + Math.sin(s) * ry, front: Math.sin(s) > 0 });
  }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const front of [false, true]) {
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i < pts.length; i++) {
        const q = pts[i];
        if (q.front !== front) { pen = false; continue; }
        if (!pen) { ctx.moveTo(q.x, q.y); pen = true; } else ctx.lineTo(q.x, q.y);
      }
      if (pass === 0) { ctx.lineWidth = wire + 1.4; ctx.strokeStyle = alpha(rp.deep, front ? 0.95 : 0.7); }
      else { ctx.lineWidth = front ? wire : wire * 0.8; ctx.strokeStyle = front ? rp.light : rp.dark; }
      ctx.stroke();
    }
    if (front) {   // glint along the front strokes
      ctx.beginPath(); let pen = false;
      for (const q of pts) { if (!q.front) { pen = false; continue; } if (!pen) { ctx.moveTo(q.x, q.y - wire * 0.2); pen = true; } else ctx.lineTo(q.x, q.y - wire * 0.2); }
      ctx.lineWidth = wire * 0.28; ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.stroke();
    }
  }
}
function drawSpringle(ctx, st) {
  const t = st.t || 0, angry = !!st.angry;
  const base = angry ? '#ff4f66' : '#4fd682';
  const rB = ramp(base), rBelly = ramp(angry ? '#ffc0c8' : '#d6fbe0'), rCrest = ramp(angry ? '#7d2a56' : '#ffd45c'), rSpring = ramp(angry ? '#c9b3e8' : '#ffd23f');
  const hop = st.hop ?? (Math.sin(t * 6) * 0.5 + 0.5);          // 0 compressed .. 1 extended
  const squash = st.squash ?? (1 - hop);
  withEntity(ctx, st, 0.19, () => {
    const sTop = 14 + squash * 12;
    paint(ctx, rrShape(-15, 40, 30, 8, 4), rSpring, { rim: 0.4, edgeA: 0.5, spec: false });
    drawHelix(ctx, 0, 41, sTop, 2.6 + squash * 0.4, 14 + squash * 3, 6 + squash * 1.5, 5, rSpring);
    ctx.save(); ctx.translate(0, squash * 12 - hop * 2);
    // dorsal fin: translucent fan on the back
    ctx.save(); ctx.globalAlpha = 0.92;
    paint(ctx, shape('M-6 4 C-34 6 -40 -24 -30 -44 C-22 -30 -14 -24 -8 -22 Z', -38, -44, 34, 50), rCrest, { edgeA: 0.5, spec: false, rim: 0.4 });
    ctx.strokeStyle = alpha(rCrest.deep, 0.35); ctx.lineWidth = 1.2; ctx.lineCap = 'round';
    [[-8, -2, -30, -30], [-8, -8, -26, -18], [-8, 0, -30, -4]].forEach(([a0, b0, a1, b1]) => { ctx.beginPath(); ctx.moveTo(a0, b0); ctx.lineTo(a1, b1); ctx.stroke(); });
    ctx.restore();
    // one continuous S-curve body: tail root -> pot belly (bulges forward) -> neck bending back
    const spine = cubic([0, 16], [26, 2], [20, -30], [-6, -42], 18);
    const wf = (u) => 17 + 25 * Math.sin(Math.PI * Math.min(1, u * 1.25)) ** 1.2 - u * 3;
    drawTube(ctx, spine, wf, 0, rB, { hl: false, edgeA: 0.55 });
    // belly rings (segmented seahorse plates) clipped to the body
    const bodyShape = tubeShape(spine, wf, 0);
    ctx.save(); ctx.clip(bodyShape.p);
    ctx.strokeStyle = alpha(rBelly.base, 0.95); ctx.lineWidth = 3.1; ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const u = 0.1 + i * 0.13, q = spine[Math.round(u * 17)], w = wf(u) * 0.5;
      ctx.beginPath(); ctx.moveTo(q[0] - w * 0.1, q[1] - 1); ctx.quadraticCurveTo(q[0] + w * 0.55, q[1] + 5, q[0] + w * 0.95, q[1] - 1); ctx.stroke();
    }
    gloss(ctx, JT.F < 0 ? 22 : 4, -4, 12, 3.6, JT.F < 0 ? 1.2 : -1.2, 0.5);
    ctx.restore();
    // pectoral fin
    paint(ctx, shape('M8 -14 C-2 -18 -8 -4 2 4 C10 4 14 -6 8 -14 Z', -8, -18, 24, 24), rCrest, { edgeA: 0.5, spec: false, rim: 0.3 });
    // head tilted down-forward + long snout
    const bob = Math.sin(t * 6 + 1) * 1.2;
    ctx.save(); ctx.translate(0, bob);
    drawTube(ctx, [[2, -52], [16, -49], [38, -40]], 14, 9, rB, { hl: false, edgeA: 0.55 });
    paint(ctx, ellShape(39.5, -39.5, 6.4, 6), rB, { rim: 0.3, edgeA: 0.5, spec: false });
    ctx.fillStyle = alpha(rB.deep, 0.85); ctx.beginPath(); ctx.arc(41.5, -41.5, 1.3, 0, TAU); ctx.fill();
    paint(ctx, ellShape(-4, -52, 17.5, 15.5, 0.12), rB, { edgeA: 0.55, lx: 0.4 });
    [[-16, -62, 6], [-8, -68, 6.6], [2, -66, 5.4]].forEach(([x, y, r], i) => paint(ctx, ellShape(x, y, r, r), rCrest, { rim: 0.5, edgeA: 0.45, spec: i === 1 }));
    const lk = st.look || [0.5, 0.05];
    drawEye(ctx, 2, -55, 9, { look: lk, lid: st.blink || 0 });
    if (angry) drawBrow(ctx, 2, -55, 9.5, 1, 1, '#3a1030');
    spec(ctx, 12, -45, 6, 3.6, 0, 0.5, angry ? '#ff2b4d' : '#ff7fb0');
    ctx.strokeStyle = alpha(rB.deep, 0.9); ctx.lineWidth = 1.9; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(20, -44); ctx.quadraticCurveTo(26, -40, 33, -39); ctx.stroke();
    ctx.restore();
    if (angry) { drawAngerVein(ctx, -22, -62, 0.9); drawSteam(ctx, 0, -74, t, 40); }
    ctx.restore();
  });
}

/* ------------------------------------------------ GLIMMER (anglerfish) ------------------------- */
function drawGlimmer(ctx, st) {
  const t = st.t || 0, angry = !!st.angry;
  const base = angry ? '#e5365a' : '#3a67ff';
  const rB = ramp(base), rBelly = ramp(angry ? '#ff9db0' : '#6fd0ff'), rFin = ramp(angry ? '#b3203f' : '#2a4ed6');
  const lantern = angry ? '#ff8a3c' : '#ffe14d';
  const bob = Math.sin(t * 3) * 2;
  withEntity(ctx, st, 0.19, () => {
    ctx.translate(0, bob);
    // lantern stalk + glow (glow added later, on top, additive)
    const lx = 38 + Math.sin(t * 2.2) * 3, ly = -57 + Math.cos(t * 2.6) * 2;
    drawTube(ctx, quad([6, -36], [6, -66], [lx, ly + 4], 10), 6.5, 4, rFin, { hl: false, edgeA: 0.5 });
    // tail fin (fan, flaps)
    const fl = Math.sin(t * 6) * 0.2;
    ctx.save(); ctx.translate(-38, -2); ctx.rotate(fl);
    paint(ctx, shape('M6 0 L-24 -26 Q-34 0 -24 26 Z', -34, -26, 40, 52), rFin, { edgeA: 0.5, spec: false });
    ctx.strokeStyle = alpha(rFin.hi, 0.45); ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    [[-22, -16], [-28, 0], [-22, 16]].forEach(([x, y]) => { ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(x, y); ctx.stroke(); });
    ctx.restore();
    // dorsal fins
    paint(ctx, shape('M-26 -30 L-34 -50 L-14 -40 Z', -34, -50, 22, 20), rFin, { edgeA: 0.5, spec: false });
    paint(ctx, shape('M-10 -38 L-12 -56 L6 -40 Z', -12, -56, 18, 18), rFin, { edgeA: 0.5, spec: false });
    // body
    const body = shape('M-44 0 C-44 -32 -12 -44 16 -40 C44 -36 52 -12 48 6 C44 30 12 36 -14 32 C-34 28 -44 16 -44 0 Z', -45, -44, 96, 78);
    paint(ctx, body, rB, { edgeA: 0.55, lx: 0.4, ly: 0.2 });
    ctx.save(); ctx.clip(body.p);
    paint(ctx, ellShape(8, 34, 52, 17), rBelly, { rim: 0, spec: false, edge: false });
    // bioluminescent speckles
    const r = seeded(11);
    for (let i = 0; i < 16; i++) { ctx.fillStyle = alpha(angry ? '#ffd0d8' : '#a9c4ff', 0.6); ctx.beginPath(); ctx.arc(r.float(-38, 30), r.float(-34, 12), r.float(0.9, 2.2), 0, TAU); ctx.fill(); }
    ctx.restore();
    gloss(ctx, JT.F < 0 ? 12 : -16, -30, 14, 4.2, JT.F < 0 ? 0.35 : -0.35, 0.65);
    // pectoral fin
    paint(ctx, shape('M-8 2 C-6 -8 8 -6 14 4 C10 18 -6 16 -8 2 Z', -8, -8, 24, 26), rFin, { edgeA: 0.5, spec: false, rim: 0.4 });
    // mouth: dark cavity, teeth, lower jaw
    const jaw = Math.sin(t * 4) * 0.5 + 0.5;
    const mouth = shape('M20 2 C32 -6 52 -4 58 8 C52 24 34 28 20 22 Z', 20, -8, 40, 36);
    ctx.fillStyle = angry ? '#3a0a28' : '#27103f'; ctx.fill(mouth.p);
    ctx.save(); ctx.clip(mouth.p);
    ctx.fillStyle = '#ff6f93'; ctx.beginPath(); ctx.ellipse(38, 24, 14, 8, 0, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#fffaf0';
    [[26, 1], [33, -1], [40, -1], [47, 1], [53, 4]].forEach(([x, y]) => { ctx.beginPath(); ctx.moveTo(x - 3.3, y - 1); ctx.lineTo(x + 3.3, y - 1); ctx.lineTo(x, y + 8 + (x % 2) * 1.5); ctx.closePath(); ctx.fill(); });
    [[30, 21], [38, 22.5], [46, 20]].forEach(([x, y]) => { ctx.beginPath(); ctx.moveTo(x - 3, y + 2); ctx.lineTo(x + 3, y + 2); ctx.lineTo(x, y - 6); ctx.closePath(); ctx.fill(); });
    // upper lip over teeth
    ctx.strokeStyle = alpha(rB.deep, 0.9); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(20, 1); ctx.quadraticCurveTo(38, -8, 58, 7); ctx.stroke();
    // eye (big, with white of the eye)
    const ex = 16, ey = -16;
    paint(ctx, ellShape(ex, ey, 14.5, 14.5), ramp('#fffdf6'), { rim: 0.3, edgeA: 0.5, spec: false });
    const lk = st.look || [0.5, 0.1];
    drawEye(ctx, ex + lk[0] * 3.5, ey + lk[1] * 3.5, 8.6, { look: lk, lid: st.blink || 0, bounce: 0.2 });
    drawBrow(ctx, ex, ey + 1, 12.5, angry ? 1 : 0.55, 1, '#10153a');
    if (angry) drawAngerVein(ctx, -18, -30, 0.95);
    // lantern orb on top of everything
    const ro = ramp(lantern);
    glow(ctx, lx, ly, 40, lantern, 0.55);
    paint(ctx, ellShape(lx, ly, 10.5, 10.5), ro, { rim: 0.2, edge: false, spec: false, spread: 0.7 });
    ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.beginPath(); ctx.arc(lx - 1.5, ly - 1.5, 4.6, 0, TAU); ctx.fill();
    glow(ctx, lx, ly, 17, '#ffffff', 0.7);
  });
}

/* ------------------------------------------------ BONEFIN (skeletal ghost fish) ---------------- */
function drawBonefin(ctx, st) {
  const t = st.t || 0;
  const bone = ramp('#f2eeff');
  withEntity(ctx, st, 0.19, () => {
    const bob = Math.sin(t * 2.4) * 3;
    ctx.translate(0, bob - 2);
    // ghost aura
    glow(ctx, 0, -2, 62, '#9ad8ff', 0.35);
    // translucent ghost body: lilac-cyan gel with a wavy trail
    const wob = (u) => Math.sin(t * 4 + u * 5) * 5;
    const gb = new Path2D();
    gb.moveTo(30, -26);
    gb.bezierCurveTo(10, -44, -30, -36, -58, -20 + wob(1));
    gb.bezierCurveTo(-68, -8, -70, 6 + wob(2), -60, 18 + wob(3));
    gb.bezierCurveTo(-34, 32, 6, 36, 30, 20);
    gb.bezierCurveTo(46, 12, 46, -18, 30, -26);
    gb.closePath();
    const gg = ctx.createLinearGradient(0, -40, 0, 36);
    gg.addColorStop(0, 'rgba(150,170,255,.78)'); gg.addColorStop(1, 'rgba(150,110,255,.45)');
    ctx.fillStyle = gg; ctx.fill(gb);
    ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(96,92,214,.85)'; ctx.stroke(gb);
    ctx.save(); ctx.clip(gb);
    const rg = ctx.createLinearGradient(0, -4, 0, 36); rg.addColorStop(0, 'rgba(120,230,255,0)'); rg.addColorStop(1, 'rgba(120,230,255,.55)'); ctx.fillStyle = rg; ctx.fillRect(-80, -4, 140, 50);
    ctx.restore();
    // tail rays + fin rim
    const tailX = -52;
    ctx.lineCap = 'round'; ctx.strokeStyle = bone.base; ctx.lineWidth = 3.6;
    for (let i = -3; i <= 3; i++) {
      const sw = Math.sin(t * 4 + i * 0.35) * 3;
      ctx.beginPath(); ctx.moveTo(tailX + 2, -2); ctx.lineTo(tailX - 22 + Math.abs(i) * -1.5, i * 9 - 2 + sw); ctx.stroke();
    }
    ctx.strokeStyle = alpha(bone.dark, 0.7); ctx.lineWidth = 2;
    ctx.beginPath(); for (let i = -3; i <= 3; i++) { const sw = Math.sin(t * 4 + i * 0.35) * 3; const X = tailX - 22 + Math.abs(i) * -1.5, Y = i * 9 - 2 + sw; i === -3 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y); } ctx.stroke();
    // dorsal rays
    ctx.strokeStyle = bone.base; ctx.lineWidth = 3.2;
    [-16, -6, 4, 14].forEach((x, i) => { ctx.beginPath(); ctx.moveTo(x, -22 - Math.abs(x) * 0.05); ctx.lineTo(x - 6, -42 + i * 2); ctx.stroke(); });
    // spine beads along a wave + ribs
    for (let i = 0; i < 8; i++) {
      const u = i / 7, x = 12 - u * 62, y = -2 + Math.sin(t * 4 + u * 4) * 3 * u, r = 6 - u * 2.6;
      if (i > 0 && i < 6) {
        ctx.strokeStyle = alpha(bone.dark, 0.9); ctx.lineWidth = 4.4;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - 3, y - 12 * (1 - u * 0.4), x + 4, y - 20 * (1 - u * 0.4)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - 3, y + 12 * (1 - u * 0.4), x + 4, y + 18 * (1 - u * 0.4)); ctx.stroke();
        ctx.strokeStyle = bone.base; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - 3, y - 12 * (1 - u * 0.4), x + 4, y - 20 * (1 - u * 0.4)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - 3, y + 12 * (1 - u * 0.4), x + 4, y + 18 * (1 - u * 0.4)); ctx.stroke();
      }
      paint(ctx, ellShape(x, y, r, r * 1.1), bone, { rim: 0.4, edgeA: 0.45, spec: false });
    }
    // skull
    const sk = shape('M0 -22 C22 -36 52 -26 54 -2 C54 14 40 24 22 22 C6 22 -6 14 -6 0 C-6 -10 -4 -16 0 -22 Z', -8, -36, 64, 60);
    paint(ctx, sk, bone, { edgeA: 0.5, lx: 0.4, ly: 0.2 });
    // eye socket + glowing pupil
    const ex = 26, ey = -8;
    ctx.fillStyle = '#271b4a'; ctx.beginPath(); ctx.ellipse(ex, ey, 11.5, 12.5, -0.1, 0, TAU); ctx.fill();
    glow(ctx, ex + 3, ey + 1, 15, '#8dffb8', 0.8);
    ctx.fillStyle = '#d6ffe8'; ctx.beginPath(); ctx.arc(ex + 3, ey + 1, 4.4, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(ex, ey - 4, 2, 0, TAU); ctx.fill();
    // nose hole
    ctx.fillStyle = alpha(bone.deep, 0.85); ctx.beginPath(); ctx.ellipse(50, -8, 1.8, 3, 0.2, 0, TAU); ctx.fill();
    // jaw with teeth (slightly open, chatters)
    const jo = 3 + Math.sin(t * 5) * 1.6;
    ctx.save(); ctx.translate(0, jo);
    paint(ctx, shape('M10 12 C26 18 46 18 56 8 C54 24 36 32 18 28 C12 26 10 20 10 12 Z', 10, 8, 48, 26), bone, { edgeA: 0.5, spec: false });
    ctx.restore();
    ctx.fillStyle = '#fffdf8'; ctx.strokeStyle = alpha(bone.deep, 0.5); ctx.lineWidth = 0.8;
    for (let i = 0; i < 6; i++) { const x = 18 + i * 6.4; ctx.beginPath(); ctx.moveTo(x - 2.4, 14 + jo * 0.4); ctx.lineTo(x + 2.4, 14 + jo * 0.4); ctx.lineTo(x, 20 + jo * 0.7); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  });
}

/* ------------------------------------------------ KRAKEN KING ---------------------------------- */
function drawKraken(ctx, st) {
  const t = st.t || 0, angry = !!st.angry;
  const base = angry ? '#e0344f' : '#8d4ee0';
  const rB = ramp(base), rS = ramp(angry ? '#ff9aa8' : '#d3b6ff'), rGold = ramp('#ffc93a');
  withEntity(ctx, st, 0.5, () => {
    const bob = Math.sin(t * 2.2) * 2.5;
    ctx.translate(0, bob);
    // tentacles (8 -> 6 fat + 2 small), behind the mantle
    const T = [[-46, 6, 56, 0, -1], [-30, 14, 66, 1.2, -1], [-12, 18, 70, 2.1, -1], [12, 18, 70, 3.1, 1], [30, 14, 66, 4.0, 1], [46, 6, 56, 5.1, 1]];
    T.forEach(([x0, y0, L, ph, dir], i) => {
      const pts = [];
      for (let j = 0; j < 16; j++) {
        const u = j / 15;
        const curl = u * u * dir * 26;
        pts.push([x0 + dir * u * 14 + Math.sin(t * 2.4 + ph + u * 4) * (3 + u * 6) + curl * 0.6, y0 + 8 + u * L - Math.max(0, u - 0.8) * 60 * u]);
      }
      drawTube(ctx, pts, 26 - Math.abs(i - 2.5) * 0, 6, rB, { hl: false, edgeA: 0.5 });
      // suckers along the inside
      ctx.fillStyle = alpha(rS.base, 0.9);
      for (let j = 2; j < 13; j += 2) { const q = pts[j], r = 3.6 - j * 0.14; ctx.beginPath(); ctx.arc(q[0] + dir * -1, q[1], Math.max(1.2, r), 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.arc(q[0] - 1, q[1] - 1, Math.max(0.5, r * 0.35), 0, TAU); ctx.fill(); ctx.fillStyle = alpha(rS.base, 0.9); }
    });
    // mantle
    const mantle = shape('M-52 4 C-56 -40 -26 -72 0 -72 C26 -72 56 -40 52 4 C50 24 30 30 0 30 C-30 30 -50 24 -52 4 Z', -57, -73, 114, 104);
    paint(ctx, mantle, rB, { edgeA: 0.55, lx: 0.38, ly: 0.18 });
    ctx.save(); ctx.clip(mantle.p);
    const r = seeded(5);
    for (let i = 0; i < 22; i++) { const x = r.float(-48, 48), y = r.float(-62, 14), rr = r.float(1.6, 4.4); ctx.fillStyle = alpha(rB.hi, 0.28); ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill(); }
    ctx.restore();
    gloss(ctx, JT.F < 0 ? 26 : -26, -52, 20, 6, JT.F < 0 ? 0.5 : -0.5, 0.6);
    // face
    spec(ctx, -30, 8, 11, 6, 0, 0.5, '#ff7fb0'); spec(ctx, 36, 8, 11, 6, 0, 0.5, '#ff7fb0');
    [-20, 24].forEach((x) => {
      paint(ctx, ellShape(x, -16, 16, 16), ramp('#ffe9a8'), { rim: 0.3, edgeA: 0.5, spec: false });
      drawEye(ctx, x + 4, -16, 10, { look: [0.5, 0.1], bounce: 0.2 });
    });
    ctx.strokeStyle = '#2a0f3a'; ctx.lineCap = 'round'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(-36, -38); ctx.lineTo(-8, -29); ctx.stroke(); ctx.beginPath(); ctx.moveTo(40, -38); ctx.lineTo(12, -29); ctx.stroke();
    ctx.strokeStyle = alpha(rB.deep, 0.95); ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-14, 14); ctx.quadraticCurveTo(2, 6, 18, 14); ctx.stroke();
    ctx.fillStyle = '#fffaf0'; [[-8, 11], [10, 11]].forEach(([x, y]) => { ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.lineTo(x + 3, y); ctx.lineTo(x, y + 8); ctx.closePath(); ctx.fill(); });
    // crown
    ctx.save(); ctx.translate(0, -66);
    const crown = shape('M-30 4 L-36 -26 L-17 -12 L0 -34 L17 -12 L36 -26 L30 4 Q0 12 -30 4 Z', -37, -35, 74, 46);
    paint(ctx, crown, rGold, { edgeA: 0.55, lx: 0.4 });
    ctx.strokeStyle = alpha(rGold.deep, 0.5); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-30, -4); ctx.quadraticCurveTo(0, 4, 30, -4); ctx.stroke();
    [['#ff4d7d', -36, -28], ['#4fe3ff', 0, -36], ['#ff4d7d', 36, -28]].forEach(([c, x, y]) => { paint(ctx, ellShape(x, y, 5, 5), ramp(c), { rim: 0.4, edgeA: 0.5 }); });
    [['#7fe3b0', -14, -2], ['#a98bff', 0, 0], ['#7fe3b0', 14, -2]].forEach(([c, x, y]) => { paint(ctx, ellShape(x, y, 4.2, 4.2), ramp(c), { rim: 0.4, edgeA: 0.5 }); });
    ctx.restore();
    if (angry) { drawAngerVein(ctx, 38, -46, 1.2); drawSteam(ctx, 0, -78, t, 66); }
  });
}
