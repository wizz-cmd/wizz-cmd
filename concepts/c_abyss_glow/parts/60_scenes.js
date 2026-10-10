/* ABYSS GLOW — scenes. The gameplay moment is placed on the REAL round-1 map (LEVELS[0].map, tile (c,r) -> x = 8c, y = 16 + 8r).
 * Characters are drawn ~1.2x their 16 px hitbox (k = 4.8 px per logical px at 4x output): luminous overdraw, hitbox untouched.
 */
const KP = 4.8;     // enemy scale (output px per logical px) in gameplay at S = 4
const KPP = 5.9;    // players: a touch larger than the hitbox so the twins always out-shine the threats

/* position a 16x16 design box so that its bottom-centre sits on the bottom-centre of the logical box (lx, ly, 16x16) */
function feet(lx, ly, k, S) { return { x: (lx + 8) * S - 8 * k, y: (ly + 16) * S - 16 * k }; }
function mid(lx, ly, k, S) { return { x: (lx + 8) * S - 8 * k, y: (ly + 8) * S - 8 * k }; }

/* dev: window.__prof = {} makes the gameplay scene record the cost of each stage (forces a pixel read-back after each, so it is slow but honest) */
let _pt = 0;
function prof(ctx, label) {
  const P = window.__prof; if (!P) return;
  ctx.getImageData(0, 0, 1, 1);
  const n = performance.now(); if (label) P[label] = (P[label] || 0) + (n - _pt); _pt = n;
}

function sceneGameplay(ctx, t) {
  prof(ctx);
  const S = 4, W = LW * S, H = LH * S, k = KP;
  const map = LEVELS[0].map, geo = buildLevelGeo(map);

  // ---- the moment (logical px) ----
  const fizzBox = { x: 40, y: 200 };                  // tile (5,23), floor surface y = 216
  const popBox = { x: 192, y: 129 };                  // tile (24,15) mid-jump, ~6 px above the row-17 platform (top y = 152)... rising
  const crabBox = { x: 160, y: 104 };                 // tile (20,11), standing on the row-13 platform (top y = 120)
  const jelBox = { x: 72, y: 64 };                    // tile (9,6)
  const nibC = { x: 120, y: 96 };                     // trapped in a bubble around tile (14,9)
  const sushiBox = { x: 64, y: 136 };                 // on the row-17 platform (top y = 152) around tile (8,17)
  const thunderC = { x: 216, y: 176 };                // thunder bubble rising around tile (27,20)
  const cluster = [[116, 31, 0.3, 7.9, 0.8, RGB.cyan], [131, 30, 1.7, 7.1, 0.72, mixc(RGB.cyan, RGB.violet, 0.45)], [123.6, 44.2, 2.6, 8.0, 0.88, RGB.cyan], [109, 44, 4.1, 6.9, 0.7, mixc(RGB.cyan, RGB.magenta, 0.3)], [138, 41, 5.3, 7.5, 0.78, mixc(RGB.cyan, WHITE, 0.25)]];   // under the ceiling, attractor (15.5, 2)
  const shot = { x: 70, y: 205.5, r: 6.6 };           // freshly blown bubble ~14 px in front of Fizz's mouth

  const lights = [
    { x: 48, y: 214, r: 38, col: P1_COL, i: 0.35 }, { x: 70, y: 205, r: 24, col: RGB.cyan, i: 0.3 },
    { x: 200, y: 140, r: 34, col: P2_COL, i: 0.25 }, { x: 168, y: 112, r: 44, col: RGB.crimson, i: 0.55 },
    { x: thunderC.x, y: thunderC.y, r: 46, col: RGB.amber, i: 0.9 }, { x: 72, y: 150, r: 30, col: RGB.ember, i: 0.4 },
    { x: nibC.x, y: nibC.y, r: 34, col: RGB.amber, i: 0.4 }, { x: 124, y: 36, r: 32, col: RGB.cyan, i: 0.35 },
  ];

  // ---- world ----
  drawBackground(ctx, W, H, t, { seed: 7 }); prof(ctx, 'background');
  drawPlatforms(ctx, geo, S, t, THEME_CORAL, lights); prof(ctx, 'platforms');

  // soft coloured light pools cast by the living things onto the water around them
  glow(ctx, 48 * S, 208 * S, 30 * S, P1_COL, 0.17);
  glow(ctx, 200 * S, 138 * S, 28 * S, P2_COL, 0.13);
  glow(ctx, 168 * S, 112 * S, 30 * S, RGB.crimson, 0.25);
  glow(ctx, 80 * S, 72 * S, 26 * S, RGB.violet, 0.16);
  glow(ctx, 72 * S, 146 * S, 22 * S, RGB.ember, 0.18);
  glow(ctx, thunderC.x * S, thunderC.y * S, 36 * S, RGB.amber, 0.22);
  glow(ctx, nibC.x * S, nibC.y * S, 30 * S, RGB.amber, 0.16);
  glow(ctx, 124 * S, 38 * S, 34 * S, RGB.cyan, 0.12);
  // contact glows where feet meet crystal (replaces drop shadows)
  glow(ctx, 48 * S, 216 * S, 14 * S, P1_COL, 0.55, 0.22);
  glow(ctx, 168 * S, 120 * S, 15 * S, RGB.crimson, 0.6, 0.22);
  glow(ctx, 72 * S, 152 * S, 12 * S, RGB.ember, 0.28, 0.22);

  prof(ctx, 'light pools');
  // ---- food + popup ----
  let p = feet(sushiBox.x, sushiBox.y, KP, S);
  drawFood(ctx, 'sushi', { x: p.x, y: p.y, k: KP, t });
  drawPopup(ctx, '+2000', 72 * S, 125.5 * S, 4.8 * S, t, RGB.amber);

  // ---- thunder bubble (rising: tiny bubble trail beneath) ----
  for (let i = 1; i <= 4; i++) drawBubble(ctx, 'empty', (thunderC.x + Math.sin(i * 2.1 + t) * 1.6) * S, (thunderC.y + 11 + i * 6.2) * S, (1.9 - i * 0.33) * S, { t, ph: i, a: 0.5 - i * 0.08, wobble: 0.5 });
  drawRing(ctx, thunderC.x * S, thunderC.y * S, 13.2 * S, RGB.amber, 0.16, 1.0);
  drawBubble(ctx, 'thunder', thunderC.x * S, thunderC.y * S, 9.2 * S, { t, ph: 0.5 });

  // ---- bubbles ----
  cluster.forEach(([bx, by, ph, br, dm, tn], i) => drawBubble(ctx, 'empty', (bx + Math.sin(t * 0.9 + ph) * 0.7) * S, (by + Math.cos(t * 0.8 + ph) * 0.6) * S, br * S, { t, ph, dim: dm, tint: tn, halo: 0.6 }));
  drawBubble(ctx, 'trapped', nibC.x * S, nibC.y * S, 11.6 * S, { t, ph: 2, stage: 1, enemy: { type: 'nibbler', face: 1 } });

  prof(ctx, 'bubbles+food');
  // ---- enemies ----
  // Jellop: diagonal flyer, trail behind it (up-left)
  p = mid(jelBox.x, jelBox.y, KP, S);
  drawTrail(ctx, [[(jelBox.x + 8) * S, (jelBox.y + 9) * S], [(jelBox.x + 1) * S, (jelBox.y + 2) * S], [(jelBox.x - 7) * S, (jelBox.y - 5) * S]], RGB.violet, 5 * S, 0.9);
  drawEnemy(ctx, 'jellop', { x: p.x, y: p.y, k: KP, t, face: 1, tilt: 0.2 });
  // Crabbit: ANGRY, walking right on the row-13 platform
  for (let i = 1; i <= 4; i++) { const gx = (crabBox.x + 8 - i * 6) * S, ga = 0.7 - i * 0.15; dot(ctx, gx, 119.2 * S, (1.2 - i * 0.18) * S * 0.5, RGB.crimson, ga, { halo: 3 }); }
  p = feet(crabBox.x, crabBox.y, KP, S);
  drawEnemy(ctx, 'crabbit', { x: p.x, y: p.y, k: KP, t, face: 1, angry: true });

  prof(ctx, 'enemies');
  // ---- players ----
  // Pop mid-jump facing left: ghost afterimages + light trail
  p = feet(popBox.x, popBox.y, KPP, S);
  drawTrail(ctx, [[(popBox.x + 8) * S, (popBox.y + 9) * S], [(popBox.x + 12) * S, (popBox.y + 20) * S], [(popBox.x + 17) * S, (popBox.y + 31) * S]], P2_COL, 8 * S, 1);
  drawPlayer(ctx, 'pop', { x: p.x, y: p.y, k: KPP, t, face: -1, pose: 'jump' });
  // Fizz mid-shot
  p = feet(fizzBox.x, fizzBox.y, KPP, S);
  glow(ctx, 50 * S, 208 * S, 17 * S, P1_COL, 0.2);
  drawPlayer(ctx, 'fizz', { x: p.x, y: p.y, k: KPP, t, face: 1, pose: 'shoot', mouth: 1 });
  // the freshly blown bubble + breath sparks
  glow(ctx, shot.x * S, shot.y * S, 15 * S, RGB.cyan, 0.2);
  drawBubble(ctx, 'shot', shot.x * S, shot.y * S, shot.r * S, { t, ph: 0.8 });
  // breath: micro-bubbles streaming from her mouth into the shot bubble
  glow(ctx, 59.5 * S, 205 * S, 5.5 * S, WHITE, 0.1);
  [[58.4, 204.6, 0.5], [60.3, 205.6, 0.75], [61.8, 203.9, 0.42]].forEach(([bx, by, br], i) => drawBubble(ctx, 'empty', bx * S, by * S, br * S, { t, ph: i * 1.7, a: 0.95, wobble: 0.4 }));
  sparkle(ctx, 66.6 * S, 201.3 * S, 1.0 * S, WHITE, 0.0, 0);

  prof(ctx, 'players');
  // ---- foreground + HUD ----
  drawBokeh(ctx, W, H, t, { seed: 31, n: 10, a: 0.9 });
  prof(ctx, 'bokeh');
  drawHud(ctx, S, { s1: '012300', s2: '008700', hi: '050000', round: '01', lives1: 2, lives2: 1, ext1: 'EX....', ext2: '......' }, t);

  const m = /[?&]chain=([0-9.]+)/.exec(location.search);   // ?chain=0.3 previews a chain-reaction frame
  if (m) drawChainFlash(ctx, W, H, +m[1], 124 * S, 40 * S, RGB.cyan);
  prof(ctx, 'hud');
  bloom(ctx, W, H, m ? { gain: 1.25 } : undefined); prof(ctx, 'bloom');
  drawFinish(ctx, W, H, 0.66, 0.01); prof(ctx, 'finish');
}

/* ================================================================== TITLE */
/* the Sunken Tower seen from above: an octagonal stair-well of luminous rings spiralling down toward the Moon Pearl */
function drawShaft(ctx, W, H, t, vx, vy) {
  const N = 20;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round';
  let prev = null;
  for (let i = 1; i <= N; i++) {
    const u = i / N, sc = Math.pow(u, 2.3);
    const rx = lerp(7, W * 1.02, sc), ry = lerp(7, H * 0.95, sc);
    const rot = i * 0.05 + t * 0.018;
    const pts = [];
    for (let k = 0; k < 8; k++) { const a = rot + k * TAU / 8 + TAU / 16; pts.push([vx + Math.cos(a) * rx, vy + Math.sin(a) * ry]); }
    const a = 0.035 + 0.13 * Math.sin(Math.PI * Math.pow(u, 0.72));
    ctx.strokeStyle = rgba(mixc(RGB.cobalt, RGB.cyan, 0.4 + 0.3 * Math.sin(i)), a);
    ctx.lineWidth = 1 + sc * 1.6;
    ctx.beginPath(); pts.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.stroke();
    if (prev) {   // struts between consecutive rings: the tower's pillars
      ctx.strokeStyle = rgba(RGB.violet, a * 0.35); ctx.lineWidth = 0.9;
      ctx.beginPath(); for (let k = 0; k < 8; k++) { ctx.moveTo(prev[k][0], prev[k][1]); ctx.lineTo(pts[k][0], pts[k][1]); } ctx.stroke();
    }
    // lit windows on the vertices
    if (i > 3) for (let k = 0; k < 8; k++) {
      const wcol = (i + k) % 3 === 0 ? RGB.amber : (i + k) % 3 === 1 ? RGB.cyan : RGB.magenta;
      const wa = a * 1.6 * (0.5 + 0.5 * Math.sin(t * 1.2 + i * 1.7 + k));
      ctx.fillStyle = rgba(wcol, wa); ctx.beginPath(); ctx.arc(pts[k][0], pts[k][1], 0.8 + sc * 2.0, 0, TAU); ctx.fill();
    }
    prev = pts;
  }
  ctx.restore();
  // the Moon Pearl at the bottom of the tower
  const pul = 0.9 + Math.sin(t * 1.6) * 0.1;
  glow(ctx, vx, vy, 230 * pul, RGB.cyan, 0.2);
  glow(ctx, vx, vy, 110 * pul, WHITE, 0.32);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const pg = ctx.createRadialGradient(vx - 4, vy - 5, 1, vx, vy, 17);
  pg.addColorStop(0, rgba(WHITE, 1)); pg.addColorStop(0.5, rgba(hot(RGB.cyan, 0.6), 0.95)); pg.addColorStop(1, rgba(RGB.cyan, 0.5));
  ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(vx, vy, 17, 0, TAU); ctx.fill(); ctx.restore();
  neon(ctx, circlePath(vx, vy, 22), WHITE, 1.2, { a: 0.5, halo: 0.8 });
  // god-rays radiating from the pearl
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 14; i++) { const a = i * TAU / 14 + t * 0.03, L = 260 + (i % 3) * 90; const g = ctx.createLinearGradient(vx, vy, vx + Math.cos(a) * L, vy + Math.sin(a) * L); g.addColorStop(0, rgba(RGB.cyan, 0.16)); g.addColorStop(1, rgba(RGB.cyan, 0)); ctx.strokeStyle = g; ctx.lineWidth = 2 + (i % 2) * 3; ctx.beginPath(); ctx.moveTo(vx, vy); ctx.lineTo(vx + Math.cos(a) * L, vy + Math.sin(a) * L); ctx.stroke(); }
  ctx.restore();
}

function sceneTitle(ctx, t) {
  const S = 4, W = 1024, H = 896;
  drawBackground(ctx, W, H, t, { seed: 21, plankton: 170, jellies: [
    { x: 0.13, y: 0.5, sz: 0.15, col: mixc(RGB.violet, RGB.cobalt, 0.5), a: 0.55, ph: 0.3, rot: -0.1 },
    { x: 0.88, y: 0.47, sz: 0.125, col: mixc(RGB.cyan, RGB.cobalt, 0.4), a: 0.5, ph: 2.4, rot: 0.12 },
    { x: 0.5, y: 0.94, sz: 0.1, col: mixc(RGB.violet, RGB.magenta, 0.5), a: 0.4, ph: 4.0, rot: 0.05 },
  ] });
  drawShaft(ctx, W, H, t, 512, 372);
  // ledges: left & right crystal shelves the twins stand on (same crystal renderer as the game)
  const row = (a, b) => '#'.repeat(a) + '.'.repeat(32 - a - b) + '#'.repeat(b);
  const lmap = [];
  for (let r = 0; r < 26; r++) lmap.push(r >= 21 ? row(12 - (r - 21) * 0, 12 - (r - 21) * 0) : '.'.repeat(32));
  const geo = buildLevelGeo(lmap);
  const lights = [{ x: 50, y: 188, r: 56, col: P1_COL, i: 0.85 }, { x: 206, y: 188, r: 56, col: P2_COL, i: 0.8 }];
  drawPlatforms(ctx, geo, S, t, THEME_TITLE, lights);

  // darken behind text for legibility
  ctx.save(); const sg = ctx.createRadialGradient(512, 420, 40, 512, 420, 470); sg.addColorStop(0, 'rgba(3,5,12,0.62)'); sg.addColorStop(1, 'rgba(3,5,12,0)'); ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H); ctx.restore();

  // twins
  const k = 14.4;
  glow(ctx, 200, 690, 190, P1_COL, 0.15); glow(ctx, 824, 690, 190, P2_COL, 0.13);
  drawPlayer(ctx, 'fizz', { x: 200 - 8 * k, y: 736 - 16 * k, k, t, face: 1, pose: 'shoot', mouth: 1 });
  drawPlayer(ctx, 'pop', { x: 824 - 8 * k, y: 736 - 16 * k, k, t: t + 0.8, face: -1, pose: 'idle' });
  glow(ctx, 200, 738, 120, P1_COL, 0.55, 0.18); glow(ctx, 824, 738, 120, P2_COL, 0.55, 0.18);
  // bubbles drifting off toward the centre
  drawBubble(ctx, 'empty', 126 + Math.sin(t) * 3, 452 - Math.sin(t * 0.8) * 4, 26, { t, ph: 0.4 });
  drawBubble(ctx, 'empty', 246, 404, 13, { t, ph: 1.4 });
  drawBubble(ctx, 'empty', 178, 372, 8, { t, ph: 3.4 });
  drawBubble(ctx, 'empty', 892, 440, 22, { t, ph: 2.2 });
  drawBubble(ctx, 'empty', 790, 402, 11, { t, ph: 3.2 });
  drawBubble(ctx, 'empty', 850, 356, 7, { t, ph: 5 });

  // logo + tagline
  const lg = drawLogo(ctx, 512, 122, 98, t);
  const tag = 'THE SUNKEN TOWER', tc = 17, tw = textWidth(tag, 1.1) * tc;
  drawText(ctx, tag, 512, lg.uy + 34, tc, { col: mixc(RGB.cyan, WHITE, 0.45), align: 'center', track: 1.1, lw: 1.6, halo: 0.9, hot: 0.6 });
  [[-1], [1]].forEach(([s]) => { const x0 = 512 + s * (tw / 2 + 24), x1 = 512 + s * (tw / 2 + 120); ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, rgba(RGB.cyan, 0.6)); g.addColorStop(1, rgba(RGB.cyan, 0)); ctx.strokeStyle = g; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x0, lg.uy + 34 + tc / 2); ctx.lineTo(x1, lg.uy + 34 + tc / 2); ctx.stroke(); ctx.restore(); });

  // menu
  drawMenu(ctx, ['1 PLAYER', '2 PLAYERS', 'HOW TO PLAY', 'HI-SCORES', 'SOUND ON'], 0, 512, 476, 25, 56, t);
  // hi score
  drawText(ctx, 'HI SCORE', 512 - 6, 808, 12, { col: RGB.amber, align: 'right', track: 0.7, lw: 1.3, halo: 0.6, hot: 0.5 });
  drawText(ctx, '050000', 512 + 14, 806, 16, { col: mixc(RGB.amber, WHITE, 0.8), align: 'left', track: 0.3, lw: 1.6, halo: 0.7, hot: 0.55, mono: true });

  drawBokeh(ctx, W, H, t, { seed: 41, n: 12, a: 0.8 });
  bloom(ctx, W, H);
  drawFinish(ctx, W, H, 0.66, 0.01);
}

/* ================================================================== CAST */
function drawPedestal(ctx, x, y, rx, col, t) {
  const ry = rx * 0.2;
  glow(ctx, x, y, rx * 1.5, col, 0.16, 0.25);
  neon(ctx, ellipsePath(x, y, rx, ry), col, 1.4, { a: 0.75, halo: 0.8, hot: 0.4 });
  neon(ctx, ellipsePath(x, y, rx * 0.64, ry * 0.64), col, 1.0, { a: 0.42, halo: 0.3, hot: 0.2 });
}
function sceneCast(ctx, t) {
  const W = 1600, H = 600;
  drawBackground(ctx, W, H, t, { seed: 5, plankton: 130, jellies: [
    { x: 0.06, y: 0.5, sz: 0.1, col: RGB.violet, a: 0.9, ph: 0.3, rot: -0.1 },
    { x: 0.95, y: 0.28, sz: 0.09, col: RGB.cyan, a: 0.8, ph: 2.1, rot: 0.1 },
  ], shafts: false });
  // header: wordmark | variant | sheet name, equal gaps
  const hc = 15, hopt = { track: 0.9, lw: 1.3, halo: 0.5, hot: 0.5 };
  let hx = 40;
  hx += drawText(ctx, 'FIZZ & POP', hx, 26, hc, Object.assign({ col: mixc(RGB.cyan, WHITE, 0.55) }, hopt)) + 24;
  neon(ctx, poly([[hx, 22], [hx, 44]]), RGB.cyan, 1.1, { a: 0.45, halo: 0.3, hot: 0.2 }); hx += 24;
  hx += drawText(ctx, 'ABYSS GLOW', hx, 26, hc, Object.assign({ col: mixc(RGB.cyan, RGB.void, 0.3) }, hopt)) + 24;
  neon(ctx, poly([[hx, 22], [hx, 44]]), RGB.cyan, 1.1, { a: 0.45, halo: 0.3, hot: 0.2 }); hx += 24;
  drawText(ctx, 'CAST SHEET', hx, 26, hc, Object.assign({ col: mixc(RGB.cyan, RGB.void, 0.55) }, hopt, { halo: 0.1 }));

  const base = 292, k = 8.8;
  const slots = [
    ['fizz', 'FIZZ', 'P1 AXOLOTL', P1_COL, 112], ['pop', 'POP', 'P2 AXOLOTL', P2_COL, 288],
    ['nibbler', 'NIBBLER', 'CLOCKWORK WALKER', RGB.amber, 452], ['crabbit', 'CRABBIT', 'PEBBLE THROWER', RGB.ember, 611],
    ['jellop', 'JELLOP', 'DIAGONAL DRIFTER', RGB.violet, 765], ['springle', 'SPRINGLE', 'CONSTANT BOUNCER', RGB.lime, 917],
    ['glimmer', 'GLIMMER', 'LANTERN HOVERER', RGB.cobalt, 1070], ['bonefin', 'BONEFIN', 'HURRY-UP GHOST', ENEMY_HUE.bonefin, 1236],
  ];
  slots.forEach(([id, name, sub, col, cx], i) => {
    drawPedestal(ctx, cx, base + 6, 58, col, t);
    const o = { k, t: t + i * 0.37, face: 1 };
    if (id === 'fizz') drawPlayer(ctx, 'fizz', Object.assign({}, o, { x: cx - 8 * k, y: base - 16 * k, pose: 'idle' }));
    else if (id === 'pop') drawPlayer(ctx, 'pop', Object.assign({}, o, { x: cx - 8 * k, y: base - 16 * k, pose: 'idle' }));
    else {
      const flying = id === 'jellop' || id === 'glimmer' || id === 'bonefin';
      drawEnemy(ctx, id, Object.assign({}, o, { x: cx - 8 * k, y: base - 16 * k - (flying ? 12 : 0), state: 'move' }));
    }
    drawText(ctx, name, cx, base + 34, 15, { col: mixc(col, WHITE, 0.35), align: 'center', track: 0.6, lw: 1.5, halo: 0.7, hot: 0.55 });
    drawText(ctx, sub, cx, base + 58, 8.4, { col: mixc(col, RGB.void, 0.3), align: 'center', track: 0.34, lw: 1.0, halo: 0, hot: 0.25 });
  });
  // Kraken King
  const kk = 5.3, kx = 1466;
  drawPedestal(ctx, kx, base + 6, 118, RGB.purple, t);
  drawEnemy(ctx, 'kraken', { x: kx - 24 * kk, y: base - 48 * kk + 4, k: kk, t, face: 1 });
  drawText(ctx, 'KRAKEN KING', kx, base + 34, 15, { col: mixc(RGB.purple, WHITE, 0.4), align: 'center', track: 0.6, lw: 1.5, halo: 0.7, hot: 0.55 });
  drawText(ctx, 'FINAL BOSS', kx, base + 58, 8.4, { col: mixc(RGB.purple, RGB.void, 0.25), align: 'center', track: 0.34, lw: 1.0, halo: 0, hot: 0.25 });

  // divider
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const dg = ctx.createLinearGradient(40, 0, W - 40, 0); dg.addColorStop(0, rgba(RGB.cyan, 0)); dg.addColorStop(0.08, rgba(RGB.cyan, 0.3)); dg.addColorStop(0.92, rgba(RGB.cyan, 0.3)); dg.addColorStop(1, rgba(RGB.cyan, 0));
  ctx.strokeStyle = dg; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(40, 382); ctx.lineTo(W - 40, 382); ctx.stroke(); ctx.restore();

  // bubble states
  const by = 462, br = 44;
  const bs = [
    ['empty', 'EMPTY', null, 110], ['trapped', 'TRAPPED', { stage: 0, enemy: { type: 'nibbler' } }, 262], ['trapped', 'WARNING', { stage: 1, enemy: { type: 'crabbit' } }, 414],
    ['trapped', 'BREAKING', { stage: 2, enemy: { type: 'jellop' } }, 566], ['thunder', 'THUNDER', null, 718], ['fire', 'FIRE', null, 870], ['water', 'WATER', null, 1022],
  ];
  bs.forEach(([kind, label, extra, cx], i) => {
    drawBubble(ctx, kind, cx, by, br, Object.assign({ t: t + i * 0.5, ph: i }, extra || {}));
    drawText(ctx, label, cx, by + br + 24, 11, { col: mixc(RGB.cyan, WHITE, 0.3), align: 'center', track: 0.6, lw: 1.2, halo: 0.4, hot: 0.4 });
  });
  // pickups
  drawText(ctx, 'FOOD', 1128, by + br + 24, 11, { col: mixc(RGB.cyan, WHITE, 0.3), align: 'center', track: 0.6, lw: 1.2, halo: 0.4, hot: 0.4 });
  drawText(ctx, 'POWER-UP', 1254, by + br + 24, 11, { col: mixc(RGB.cyan, WHITE, 0.3), align: 'center', track: 0.6, lw: 1.2, halo: 0.4, hot: 0.4 });
  drawFood(ctx, 'sushi', { x: 1128 - 8 * 6.9, y: by + 42 - 16 * 6.9, k: 6.9, t });
  drawPowerup(ctx, 'heart', { x: 1254 - 8 * 6.9, y: by + 42 - 16 * 6.9, k: 6.9, t });
  // angry state
  drawEnemy(ctx, 'crabbit', { x: 1398 - 8 * 6.6, y: by + 42 - 16 * 6.6, k: 6.6, t, face: 1, angry: true });
  drawEnemy(ctx, 'nibbler', { x: 1522 - 8 * 6.6, y: by + 42 - 16 * 6.6, k: 6.6, t, face: -1, angry: true });
  drawText(ctx, 'ANGRY STATE', 1460, by + br + 24, 11, { col: mixc(RGB.crimson, WHITE, 0.3), align: 'center', track: 0.6, lw: 1.2, halo: 0.4, hot: 0.4 });

  // palette strip
  const pals = ['void', 'abyss', 'cyan', 'magenta', 'lime', 'amber', 'violet', 'white', 'ember', 'cobalt'];
  pals.forEach((n, i) => { const x = 54 + i * 26, y = 570; ctx.save(); ctx.fillStyle = PAL[n]; ctx.globalCompositeOperation = 'lighter'; if (n === 'void' || n === 'abyss') { ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = rgba(RGB.cyan, 0.4); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.fill(); ctx.stroke(); } else { glow(ctx, x, y, 14, RGB[n], 0.3); ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.fill(); } ctx.restore(); });

  bloom(ctx, W, H);
  drawFinish(ctx, W, H, 0.45, 0.01);
}
