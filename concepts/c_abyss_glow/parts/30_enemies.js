/* ABYSS GLOW — enemies. drawEnemy(ctx, type, o): o = {x,y,k,face,t,state,angry,ghost,a}
 * type: nibbler | crabbit | jellop | springle | glimmer | bonefin | kraken
 * state: 'move' (default) | 'trapped' (struggling pose, used inside bubbles) | 'throw' | 'squash' | 'fire'
 * Each type owns ONE neon hue AND a distinct silhouette (colour-blind safe):
 *   nibbler  amber  horizontal clockwork fish on legs, wind-up key + cog
 *   crabbit  ember  wide domed crab, raised pincers, tall eye stalks ("ears")
 *   jellop   violet bell + trailing tentacles
 *   springle lime   upright seahorse on a coil spring
 *   glimmer  cobalt anglerfish with an amber lantern (+ its own light)
 *   bonefin  white  skeletal ghost fish, no body fill
 *   kraken   purple crowned octopus (48 x 48)
 * Angry = crimson, slanted brows, pulsing red heat halo and steam puffs (a shape cue as well as a colour cue).
 */
const ENEMY_HUE = { nibbler: RGB.amber, crabbit: RGB.ember, jellop: RGB.violet, springle: RGB.lime, glimmer: RGB.cobalt, bonefin: mixc(RGB.white, RGB.cyan, 0.25), kraken: RGB.purple };

function eyeBall(ctx, x, y, r, col, look, o) {
  o = o || {};
  const a = o.a === undefined ? 1 : o.a;
  glow(ctx, x, y, r * 3.0, WHITE, 0.13 * a);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgba(hot(col, o.hotEye === undefined ? 0.84 : o.hotEye), 0.97 * a); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(8,5,18,' + (0.95 * a).toFixed(3) + ')';
  ctx.beginPath();
  const px = x + look[0] * r * 0.42, py = y + look[1] * r * 0.42;
  if (o.slit) ctx.ellipse(px, py, r * 0.22, r * 0.62, 0, 0, TAU); else ctx.arc(px, py, r * (o.pupil || 0.55), 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgba(WHITE, 0.95 * a); ctx.beginPath(); ctx.arc(x + r * 0.05 - look[0] * r * 0.05, y - r * 0.36, r * 0.2, 0, TAU); ctx.fill();
  ctx.restore();
  neon(ctx, circlePath(x, y, r), col, o.w || 0.3, { a: 0.9 * a, halo: 0.35, hot: 0.2 });
}

/* angry cue: slanted brow bars over eyes (call with eye centres), steam puffs, heat halo */
function brow(ctx, x, y, r, dir, w, col) {
  const p = new Path2D();
  p.moveTo(x - r * 1.15 * dir, y - r * 1.55); p.lineTo(x + r * 1.1 * dir, y - r * 0.55);
  neon(ctx, p, col, w * 1.15, { a: 1, halo: 0.6, hot: 0.5 });
}
function steam(ctx, x, y, t, w, col, n) {
  n = n || 3;
  const vc = mixc(col, WHITE, 0.45);
  for (let i = 0; i < n; i++) {
    const ph = (t * 0.8 + i / n) % 1;
    const bx = x + (i - (n - 1) / 2) * 2.0, rise = 1.0 + ph * 5.2;
    const p = new Path2D();
    for (let j = 0; j <= 14; j++) {
      const u = j / 14, yy = y - u * rise, xx = bx + Math.sin(u * 7 + ph * 5 + i * 2) * (0.35 + u * 0.55);
      j ? p.lineTo(xx, yy) : p.moveTo(xx, yy);
    }
    const a = Math.sin(Math.PI * Math.min(1, ph * 1.04)) * 0.95;
    neon(ctx, p, vc, w * 0.6, { a, halo: 0.55, hot: 0.4 });
    glow(ctx, bx, y - rise * 0.55, 2.0 + ph * 2.2, col, 0.34 * a);
    glow(ctx, bx + Math.sin(ph * 6 + i) * 0.6, y - rise * 0.9, 1.4 + ph * 1.6, vc, 0.2 * a);
  }
}
function heat(ctx, t, col, cx, cy, r) {
  glow(ctx, cx, cy, r * (1 + Math.sin(t * 6) * 0.08), col, 0.34 + Math.sin(t * 6) * 0.07);
}
function gearPath(cx, cy, R, r, teeth, rot) {
  const p = new Path2D(), step = TAU / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = rot + i * step;
    const pts = [[a - step * 0.5, r], [a - step * 0.27, r], [a - step * 0.17, R], [a + step * 0.17, R], [a + step * 0.27, r], [a + step * 0.5, r]];
    pts.forEach((q, j) => { const x = cx + Math.cos(q[0]) * q[1], y = cy + Math.sin(q[0]) * q[1]; (i === 0 && j === 0) ? p.moveTo(x, y) : p.lineTo(x, y); });
  }
  p.closePath();
  return p;
}

function drawEnemy(ctx, type, o) {
  o = Object.assign({ face: 1, t: 0, state: 'move', angry: false, k: 4.8 }, o);
  const fn = ENEMY_FN[type];
  if (!fn) return;
  const w = lwFor(o.k);
  const boxW = type === 'kraken' ? 48 : 16;
  const col = o.angry && type !== 'bonefin' && type !== 'kraken' ? RGB.crimson : (o.col || ENEMY_HUE[type]);
  const ctxA = 1;
  placeSprite(ctx, o, boxW, () => {
    if (o.angry && !o.ghost) heat(ctx, o.t, RGB.crimson, boxW / 2, boxW / 2 + 1, boxW * 0.95);
    fn(ctx, o, col, w, ctxA);
  });
}

/* ---------------------------------------------------------------- Nibbler: clockwork fish on legs */
function nibbler(ctx, o, col, w, A) {
  const t = o.t, trapped = o.state === 'trapped', k = o.k;
  const walk = o.state === 'move' ? Math.sin(t * 9) : 0;
  const bob = Math.abs(walk) * 0.18;
  ctx.translate(0, -bob);
  const wag = Math.sin(t * 5) * 0.5;
  // legs (behind)
  const legs = [[6.4, 12.2, -walk], [10.6, 12.0, walk]];
  for (const [lx, ly, ph] of legs) {
    const kx = lx - 0.7 + ph * 0.8, kyy = 13.9, fx = lx + (ph > 0 ? 0.5 : -0.9) + ph * 0.9, fy = 15.3 - Math.max(0, -ph) * 0.9;
    const lp = new Path2D(); lp.moveTo(lx, ly); lp.lineTo(kx, kyy); lp.lineTo(fx, fy);
    neon(ctx, lp, col, w * 0.95, { a: A, halo: 0.6 });
    neon(ctx, new Path2D(`M ${fx - 0.9} ${fy + 0.1} L ${fx + 0.9} ${fy + 0.1}`), col, w * 0.9, { a: A, halo: 0.4, hot: 0.3 });
  }
  // wind-up key
  const kr = Math.cos(t * 3.2);
  ctx.save(); ctx.translate(7.4, 2.4); ctx.scale(Math.max(0.25, Math.abs(kr)), 1); ctx.translate(-7.4, -2.4);
  const key = new Path2D('M 7.4 4.6 L 7.4 2.4 M 7.4 2.6 C 5.5 3 4.5 0.8 6.1 0.4 C 7.1 0.2 7.4 1.4 7.4 2.6 M 7.4 2.6 C 9.3 3 10.3 0.8 8.7 0.4 C 7.7 0.2 7.4 1.4 7.4 2.6');
  neon(ctx, key, col, w * 0.9, { a: A, halo: 0.8 });
  ctx.restore();
  // tail fin (forked)
  const tf = new Path2D(`M 3.1 8.3 L 0.2 ${4.6 + wag} Q 1.7 8.3 0.2 ${12 - wag} Z`);
  body(ctx, tf, col, w, { a: A, y0: 4, y1: 12 }); neon(ctx, tf, col, w * 0.95, { a: A });
  // body
  const bp = new Path2D('M 2.9 8.6 C 2.7 5.3 5.4 4.1 8.4 4.1 C 11.5 4.1 13.9 5.9 14.5 8.5 C 14 10.9 11.4 12.4 8.4 12.4 C 5.4 12.4 3.1 11.8 2.9 8.6 Z');
  body(ctx, bp, col, w, { a: A, y0: 4, y1: 12.4, tint: 1.15, hl: [6.4, 6, 6, 0.3] });
  neon(ctx, bp, col, w * 1.05, { a: A, grad: [3, 4, 14, 12.4] });
  // riveted plating
  neon(ctx, new Path2D('M 4.8 5.3 Q 4.1 8.4 4.9 11.4'), col, w * 0.4, { a: 0.5 * A, halo: 0, hot: 0.2 });
  for (const [rx, ry] of [[5.6, 11.4], [7.8, 11.7], [10, 11.5], [12, 10.7]]) dot(ctx, rx, ry, 0.22, hot(col, 0.4), 0.7 * A, { halo: 2.4 });
  // fin
  neon(ctx, new Path2D('M 9.8 9.7 L 11.8 11.7 L 9.1 11.5 Z'), col, w * 0.6, { a: 0.8 * A, halo: 0.3 });
  // COG (the signature) — spins with time
  const gx = 7.2, gy = 8.4;
  const rot = t * 1.6;
  const gear = gearPath(gx, gy, 2.75, 2.0, 8, rot);
  ctx.save(); ctx.fillStyle = 'rgba(4,6,14,0.85)'; ctx.fill(gear); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(col, 0.22 * A); ctx.fill(gear); ctx.restore();
  neon(ctx, gear, hot(col, 0.2), w * 0.8, { a: A, halo: 0.9, hot: 0.6 });
  neon(ctx, circlePath(gx, gy, 1.0), col, w * 0.55, { a: A, halo: 0.3, hot: 0.4 });
  dot(ctx, gx, gy, 0.35, hot(col, 0.7), A, { halo: 3 });
  // eye + mouth
  const eyeLook = trapped ? [Math.sin(t * 9) * 0.5, 0.25] : [0.7, 0.1];
  eyeBall(ctx, 11.5, 7.0, 1.5, col, eyeLook, { a: A, w: w * 0.55 });
  if (o.angry) brow(ctx, 11.5, 7.0, 1.5, 1, w, col);
  const mouth = new Path2D('M 12.4 9.7 L 14.5 9.0 M 13.1 9.45 L 13.3 10.2 M 14.0 9.15 L 14.1 9.9');
  neon(ctx, mouth, hot(col, 0.3), w * 0.5, { a: A, halo: 0.3, hot: 0.3 });
  if (o.angry) steam(ctx, 8.5, 3.6, t, w, col, 2);
}

/* ---------------------------------------------------------------- Crabbit: domed crab, raised pincers, eye stalks */
function crabbit(ctx, o, col, w, A) {
  const t = o.t, throwing = o.state === 'throw', trapped = o.state === 'trapped';
  const walk = o.state === 'move' ? Math.sin(t * 10) : 0;
  ctx.translate(0, -Math.abs(walk) * 0.15);
  const snap = trapped ? Math.sin(t * 14) * 0.5 : (o.angry ? Math.sin(t * 9) * 0.35 : Math.sin(t * 2.3) * 0.12);
  // legs
  const legP = new Path2D();
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const bx = 8 + s * (3.0 + i * 1.5), by = 12.4 + i * 0.1;
    const ph = Math.sin(t * 10 + i * 2.1 + (s > 0 ? Math.PI : 0)) * (o.state === 'move' ? 0.7 : 0.1);
    legP.moveTo(bx, by); legP.lineTo(bx + s * (1.2 + i * 0.2), 13.9 - Math.max(0, ph) * 0.5); legP.lineTo(bx + s * (1.5 + i * 0.1 + ph * 0.4), 15.5);
  }
  neon(ctx, legP, col, w * 0.85, { a: A, halo: 0.5 });
  // pincers: arm + two-prong claw, raised
  for (const s of [-1, 1]) {
    const cx = s < 0 ? 0 : 16, sg = s;
    const mx = (x) => (s < 0 ? x : 16 - x);
    const open = 0.5 + snap * (s < 0 ? 1 : -1) * 0.4;
    const arm = new Path2D(`M ${mx(2.9)} 10.6 C ${mx(1.1)} 10 ${mx(0.8)} 8.4 ${mx(1.5)} 6.9`);
    neon(ctx, arm, col, w * 1.15, { a: A, halo: 0.8 });
    const claw = new Path2D(`M ${mx(0.1)} 7 C ${mx(-1.3)} 5.9 ${mx(-1.3)} 3.3 ${mx(0.3)} 2.0 L ${mx(1.7 - open * 0.3)} 3.7 L ${mx(3.3 + open * 0.6)} 1.7 C ${mx(4.7)} 3.4 ${mx(4.5)} 6 ${mx(3.1)} 7 Z`);
    body(ctx, claw, col, w, { a: A, y0: 2, y1: 7.2, tint: 1.2 }); neon(ctx, claw, col, w * 1.0, { a: A, grad: [0, 2, 4, 7] });
  }
  // eye stalks ("bunny ears")
  const sway = Math.sin(t * 3) * 0.25;
  for (const s of [-1, 1]) {
    const bx = 8 + s * 2.1, ex = 8 + s * 3.0 + sway * s;
    const stalk = new Path2D(`M ${bx} 6.8 C ${bx + s * 0.1} 4.6 ${ex - s * 0.5} 3.2 ${ex} 1.9`);
    neon(ctx, stalk, col, w * 0.95, { a: A, halo: 0.7 });
  }
  // shell
  const shell = new Path2D('M 1.9 11.8 C 1.7 7.8 4.6 6.3 8 6.3 C 11.4 6.3 14.3 7.8 14.1 11.8 C 14 13.1 11.6 13.6 8 13.6 C 4.4 13.6 2 13.1 1.9 11.8 Z');
  body(ctx, shell, col, w, { a: A, y0: 6, y1: 13.6, tint: 1.4, hl: [6.2, 8.2, 7.2, 0.5] });
  neon(ctx, shell, col, w * 1.1, { a: A, grad: [2, 6, 14, 13.6] });
  // carapace plates
  neon(ctx, new Path2D('M 4.2 9.1 Q 8 7.4 11.8 9.1 M 5.2 11.2 Q 8 9.9 10.8 11.2'), col, w * 0.45, { a: 0.55 * A, halo: 0, hot: 0.2 });
  for (const [dx, dy] of [[6, 8.2], [10, 8.2], [8, 7.5]]) dot(ctx, dx, dy, 0.24, hot(col, 0.4), 0.6 * A, { halo: 2.4 });
  // face: two eyes on the stalks looking toward travel direction
  const look = [trapped ? Math.sin(t * 11) * 0.6 : 0.6, 0.15];
  for (const s of [-1, 1]) {
    const ex = 8 + s * 3.0 + sway * s;
    eyeBall(ctx, ex, 1.5, 1.35, col, look, { a: A, w: w * 0.55 });
    if (o.angry) brow(ctx, ex, 1.5, 1.35, -s, w, col);
  }
  // mouth
  neon(ctx, new Path2D(o.angry ? 'M 6.4 12.4 Q 8 11.2 9.6 12.4' : 'M 6.6 11.9 Q 8 12.8 9.4 11.9'), hot(col, 0.3), w * 0.55, { a: 0.9 * A, halo: 0.3, hot: 0.3 });
  if (o.angry) steam(ctx, 8, -0.2, t, w, col, 3);
}

/* ---------------------------------------------------------------- Jellop: bell + tentacles */
function jellop(ctx, o, col, w, A) {
  const t = o.t, trapped = o.state === 'trapped';
  const ps = 1 + Math.sin(t * 4.2) * 0.06;      // bell pulse
  const tilt = o.tilt || 0;
  ctx.translate(8, 6.5); ctx.rotate(tilt); ctx.scale(1 / ps, ps); ctx.translate(-8, -6.5);
  // tentacles
  const tp = new Path2D();
  for (let i = 0; i < 5; i++) {
    const x0 = 3.7 + i * 2.15, pts = [];
    for (let j = 0; j <= 5; j++) pts.push([x0 + Math.sin(t * 3.4 + i * 1.3 + j * 0.9) * 0.55 * (j / 5) * 1.4, 8.2 + j * 1.5]);
    const sp = sampleSpline(pts, 4);
    tp.moveTo(sp[0][0], sp[0][1]); for (let q = 1; q < sp.length; q++) tp.lineTo(sp[q][0], sp[q][1]);
  }
  neon(ctx, tp, col, w * 0.7, { a: 0.85 * A, halo: 0.8, hot: 0.35 });
  // oral arms (wider ribbons)
  for (const s of [-1, 1]) {
    const pts = []; for (let j = 0; j <= 4; j++) pts.push([8 + s * (0.9 + Math.sin(t * 3 + j + s) * 0.45), 8 + j * 1.55]);
    const rb = taper(sampleSpline(pts, 5), (u) => 0.5 * Math.sin(Math.PI * Math.pow(u, 0.7)) + 0.05);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(col, 0.18 * A); ctx.fill(rb); ctx.restore();
    neon(ctx, rb, mixc(col, RGB.magenta, 0.35), w * 0.5, { a: 0.7 * A, halo: 0.4, hot: 0.2 });
  }
  // bell with scalloped rim
  const sc = []; const n = 5, x1 = 14.1, x0 = 1.9, dx = (x1 - x0) / n;
  let d = `M ${x0} 7.7 C ${x0 - 0.4} 2.9 4.7 0.9 8 0.9 C 11.3 0.9 ${x1 + 0.4} 2.9 ${x1} 7.7`;
  for (let i = 0; i < n; i++) { const xa = x1 - i * dx, xb = x1 - (i + 1) * dx; d += ` Q ${(xa + xb) / 2} ${9.3 + Math.sin(t * 4 + i) * 0.3} ${xb} 7.7`; }
  const bell = new Path2D(d + ' Z');
  body(ctx, bell, col, w, { a: A, y0: 0.9, y1: 9, tint: 1.3, hl: [6.2, 3.2, 6.4, 0.34] });
  neon(ctx, bell, col, w * 1.08, { a: A, grad: [2, 1, 14, 9], halo: 1.1 });
  // radial canals + inner ring
  const cn = new Path2D();
  for (let i = -2; i <= 2; i++) { cn.moveTo(8, 1.6); cn.quadraticCurveTo(8 + i * 2.6, 3.6, 8 + i * 3.0, 7.4); }
  neon(ctx, cn, col, w * 0.38, { a: 0.45 * A, halo: 0, hot: 0.2 });
  // clover (the four gonads) — a magenta-violet signature
  const cl = new Path2D();
  for (let i = 0; i < 4; i++) { const a = i * TAU / 4 + Math.PI / 4 + t * 0.3; cl.moveTo(8 + Math.cos(a) * 1.7 + 0.8, 4.0 + Math.sin(a) * 1.15); cl.ellipse(8 + Math.cos(a) * 1.7, 4.0 + Math.sin(a) * 1.15, 0.8, 0.55, a, 0, TAU); }
  neon(ctx, cl, mixc(col, RGB.magenta, 0.5), w * 0.55, { a: 0.9 * A, halo: 0.6, hot: 0.4 });
  // eyes
  const look = trapped ? [Math.sin(t * 10) * 0.5, 0.2] : [0.5, 0.2];
  for (const ex of [5.4, 10.6]) eyeBall(ctx, ex, 6.2, 0.95, col, look, { a: A, w: w * 0.45, pupil: 0.58 });
  if (o.angry) { brow(ctx, 5.4, 6.2, 0.95, 1, w, col); brow(ctx, 10.6, 6.2, 0.95, -1, w, col); steam(ctx, 8, -0.4, t, w, col, 3); }
}

/* ---------------------------------------------------------------- Springle: seahorse on a coil spring */
function springle(ctx, o, col, w, A) {
  const t = o.t, squash = o.state === 'squash';
  const comp = squash ? 0.55 : 1 - Math.abs(Math.sin(t * 5)) * 0.06;
  // spring (coil) from y=11.8 to 15.7, compressed on landing — a glowing tesla coil
  const top = 11.8, bot = 15.7, h = (bot - top) * comp, y0 = bot - h;
  const coil = new Path2D(); coil.moveTo(7.6, y0);
  const turns = 5;
  for (let i = 0; i <= turns * 2; i++) { const y = y0 + (i / (turns * 2)) * h; coil.lineTo(7.6 + (i % 2 ? 2.0 : -2.0), y); }
  coil.lineTo(7.6, bot);
  neon(ctx, coil, col, w * 0.95, { a: A, halo: 1.2, hot: 0.7 });
  neon(ctx, new Path2D(`M 4.9 ${bot + 0.1} L 10.3 ${bot + 0.1}`), col, w * 0.9, { a: A, halo: 0.6 });
  ctx.translate(0, (1 - comp) * (bot - top));
  const sw = squash ? 0 : Math.sin(t * 5) * 0.12;
  // dorsal fin: ribbed fan on the back
  const fin = new Path2D('M 5.6 6.4 Q 3.4 6.4 3.0 8.2 Q 3.2 9.6 4.6 10.0 Q 5.0 8.4 5.5 7.8');
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(col, 0.14 * A); ctx.fill(fin); ctx.restore();
  neon(ctx, fin, col, w * 0.55, { a: 0.85 * A, halo: 0.5, hot: 0.25 });
  neon(ctx, new Path2D('M 5.4 6.9 L 3.5 7.9 M 5.3 7.6 L 3.8 9.1'), col, w * 0.3, { a: 0.55 * A, halo: 0, hot: 0.1 });
  // body: S-curved ribbon from neck to the spring (arched back, bulging chest)
  const spine = sampleSpline([[9.8, 3.3], [7.0, 4.7 + sw], [8.7, 7.3], [9.1, 9.7], [7.6, 11.9]], 7);
  const hwS = (u) => 1.05 + 2.25 * Math.sin(Math.PI * Math.pow(Math.min(1, u * 1.12), 0.85)) * (1 - u * 0.5);
  const torso = taper(spine, hwS);
  body(ctx, torso, col, w, { a: A, y0: 3, y1: 12, tint: 1.3, hl: [6.6, 6.4, 5.2, 0.32] });
  neon(ctx, torso, col, w * 1.05, { a: A, grad: [3, 3, 12, 12] });
  // bony belly rings across the chest
  const ring = new Path2D();
  for (let i = 0; i < 5; i++) { const u = 0.2 + i * 0.16, p0 = spine[Math.floor(u * (spine.length - 1))]; const hw = hwS(u); ring.moveTo(p0[0] - hw * 0.9, p0[1] - 0.2); ring.quadraticCurveTo(p0[0], p0[1] + 0.9, p0[0] + hw * 0.95, p0[1] - 0.25); }
  neon(ctx, ring, col, w * 0.4, { a: 0.62 * A, halo: 0, hot: 0.3 });
  // head: cranium + long tube snout angled down
  const head = new Path2D('M 7.8 3.3 C 7.0 1.4 8.8 0.2 10.4 0.6 C 11.7 0.9 12.5 1.9 12.5 2.9 L 15.0 5.9 C 15.5 6.6 14.9 7.2 14.3 6.8 L 11.4 4.9 C 10.2 5.4 8.6 4.8 7.8 3.3 Z');
  body(ctx, head, col, w, { a: A, y0: 0, y1: 7, tint: 1.35, hl: [9.6, 2.0, 3.6, 0.35] });
  neon(ctx, head, col, w * 1.08, { a: A, grad: [7, 0, 15, 7] });
  // coronet (white-hot spikes) and a mane ridge down the neck
  neon(ctx, new Path2D('M 8.4 1.2 L 7.0 -0.2 L 8.8 0.0 L 8.2 -1.5 L 10.0 -0.4 L 10.6 -1.7 L 11.4 -0.1'), hot(col, 0.2), w * 0.7, { a: A, halo: 1.0, hot: 0.6 });
  neon(ctx, new Path2D('M 7.6 3.4 Q 6.4 4.2 6.5 5.6'), col, w * 0.5, { a: 0.7 * A, halo: 0.2, hot: 0.2 });
  eyeBall(ctx, 10.5, 2.2, 0.95, col, [0.6, 0.25], { a: A, w: w * 0.5 });
  if (o.angry) brow(ctx, 10.5, 2.2, 0.95, 1, w, col);
  dot(ctx, 14.6, 6.3, 0.2, WHITE, 0.6 * A, { halo: 2.2 });
  // pectoral fin
  neon(ctx, new Path2D('M 9.4 5.6 L 11.6 5.8 L 10.4 7.4 Z'), col, w * 0.55, { a: 0.85 * A, halo: 0.3 });
  if (o.angry) steam(ctx, 10, -1.6, t, w, col, 2);
}

/* ---------------------------------------------------------------- Glimmer: anglerfish with a lantern */
function glimmer(ctx, o, col, w, A) {
  const t = o.t, fire = o.state === 'fire', trapped = o.state === 'trapped';
  const wag = Math.sin(t * 4) * 0.5;
  const lant = RGB.amber;
  const pulse = 0.85 + Math.sin(t * 3.4) * 0.15 + (fire ? 0.5 : 0);
  // tail fan
  const tf = new Path2D(`M 2.5 9.6 L 0 ${6.1 + wag} Q 1.1 9.6 0 ${13 - wag} Z`);
  body(ctx, tf, col, w, { a: A, y0: 6, y1: 13 }); neon(ctx, tf, col, w * 0.95, { a: A });
  neon(ctx, new Path2D(`M 2.3 9.6 L 0.5 ${7.3 + wag * 0.8} M 2.3 9.6 L 0.4 ${11.8 - wag * 0.8}`), col, w * 0.35, { a: 0.5 * A, halo: 0, hot: 0.2 });
  // dorsal spikes
  neon(ctx, new Path2D('M 4.3 5.3 L 5.2 2.9 L 6.6 4.5 L 7.8 2.5 L 8.8 4.2'), col, w * 0.7, { a: A, halo: 0.6, hot: 0.4 });
  // body
  const bp = new Path2D('M 2.2 9.6 C 1.9 6 4.6 4.1 7.8 4.1 C 11.2 4.1 13.5 5.6 13.9 8 L 13.9 10.4 C 13.2 13.1 10.6 14.5 7.7 14.5 C 4.3 14.5 2.5 12.6 2.2 9.6 Z');
  body(ctx, bp, col, w, { a: A, y0: 4, y1: 14.5, tint: 1.25, hl: [6, 7, 6.4, 0.3] });
  neon(ctx, bp, col, w * 1.1, { a: A, grad: [2, 4, 14, 14.5] });
  // lateral bio-dots
  for (const [bx, by, r] of [[4.4, 8.6, 0.28], [5.9, 7.7, 0.24], [7.5, 7.2, 0.24], [3.9, 10.8, 0.22], [5.6, 11.4, 0.22]]) dot(ctx, bx, by, r, RGB.cyan, 0.8 * A, { halo: 2.6 });
  // pectoral fin
  neon(ctx, new Path2D('M 7.6 10.5 L 4.7 12.9 L 8.9 12.3 Z'), col, w * 0.6, { a: 0.85 * A, halo: 0.4 });
  // mouth + teeth
  const open = fire ? 1.4 : 0.8 + Math.sin(t * 3) * 0.1;
  const mouth = new Path2D(`M 13.9 8.2 Q 11.4 ${10.4 + open} 8.6 ${9.9 + open * 0.4}`);
  neon(ctx, mouth, hot(col, 0.4), w * 0.7, { a: A, halo: 0.5, hot: 0.5 });
  const teeth = new Path2D();
  for (let i = 0; i < 4; i++) { const u = 0.1 + i * 0.22; const x = lerp(13.7, 9.2, u), y = lerp(8.4, 9.9 + open * 0.4, u) + Math.sin(u * 3) * 0.3; teeth.moveTo(x, y); teeth.lineTo(x - 0.35, y + 1.1); teeth.lineTo(x - 0.7, y + 0.1); }
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(WHITE, 0.9 * A); ctx.fill(teeth); ctx.restore();
  // eye (amber-ringed)
  eyeBall(ctx, 10.5, 6.7, 1.55, lant, trapped ? [Math.sin(t * 10) * 0.4, 0.3] : [0.7, 0.2], { a: A, w: w * 0.6 });
  if (o.angry) brow(ctx, 10.5, 6.7, 1.55, 1, w, col);
  // antenna + lantern (own light source)
  const ant = new Path2D('M 9.6 4.3 C 10.2 0.4 14.2 -0.4 15.0 2.9');
  neon(ctx, ant, hot(col, 0.2), w * 0.7, { a: A, halo: 0.7 });
  const lx = 15.0, ly = 4.0;
  glow(ctx, lx, ly, 9 * pulse, lant, 0.5 * A);
  glow(ctx, lx, ly, 4 * pulse, hot(lant, 0.5), 0.6 * A);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgba(hot(lant, 0.3), 0.98 * A); ctx.beginPath(); ctx.arc(lx, ly, 1.25, 0, TAU); ctx.fill();
  ctx.fillStyle = rgba(WHITE, 0.98 * A); ctx.beginPath(); ctx.arc(lx - 0.1, ly - 0.15, 0.62, 0, TAU); ctx.fill();
  ctx.restore();
  sparkle(ctx, lx, ly, 2.1 * pulse, hot(lant, 0.4), 0.7 * A, 0);
  if (o.angry) steam(ctx, 6, 1.6, t, w, col, 2);
}

/* ---------------------------------------------------------------- Bonefin: skeletal ghost fish (no body fill) */
function bonefin(ctx, o, col, w, A) {
  const t = o.t;
  const bone = hot(mixc(RGB.white, RGB.cyan, 0.3), 0.3);
  const wob = (x, ph) => Math.sin(t * 3.2 + x * 0.55 + ph) * 0.35;
  // ghost wisps trailing behind (fading)
  for (let i = 0; i < 4; i++) {
    const y = 6.2 + i * 1.35;
    const sp = sampleSpline([[2.4, y], [0.4, y + wob(0.4, i)], [-2.2, y + 0.4 + wob(1, i + 1)], [-5, y + 0.2 + wob(2, i + 2)]], 5);
    const g = ctx.createLinearGradient(2.4, 0, -5, 0); g.addColorStop(0, rgba(bone, 0.35 * A)); g.addColorStop(1, rgba(bone, 0));
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = w * 0.7; ctx.lineCap = 'round'; ctx.strokeStyle = g; ctx.stroke(spinePath(sp)); ctx.restore();
  }
  glow(ctx, 8, 8, 11, bone, 0.14 * A);
  // spine + vertebrae + ribs
  const sp = [];
  for (let i = 0; i <= 10; i++) { const x = 7.6 - i * 0.55; sp.push([x, 8.2 + wob(x, 0)]); }
  neon(ctx, spinePath(sp), bone, w * 0.7, { a: A, halo: 0.8, hot: 0.5 });
  const vt = new Path2D(), rb = new Path2D();
  for (let i = 0; i <= 10; i++) { const x = sp[i][0], y = sp[i][1]; vt.moveTo(x, y - 0.6); vt.lineTo(x, y + 0.6); }
  for (let i = 1; i <= 6; i++) { const x = sp[i][0], y = sp[i][1], r = 3.0 - i * 0.28; rb.moveTo(x, y); rb.quadraticCurveTo(x - 0.5, y + r * 0.75, x + 0.3, y + r + 0.2); rb.moveTo(x, y); rb.quadraticCurveTo(x - 0.5, y - r * 0.55, x + 0.1, y - r * 0.8); }
  neon(ctx, vt, bone, w * 0.4, { a: 0.7 * A, halo: 0.2, hot: 0.2 });
  neon(ctx, rb, bone, w * 0.5, { a: 0.9 * A, halo: 0.6, hot: 0.3 });
  // tail bones (fan)
  const tl = new Path2D();
  const tail0 = sp[10];
  for (const [ex, ey] of [[0.2, 4.2], [-0.3, 6.4], [-0.5, 8.4], [-0.3, 10.4], [0.2, 12.4]]) { tl.moveTo(tail0[0], tail0[1]); tl.lineTo(ex + wob(ex, ey), ey); }
  tl.moveTo(0.2, 4.2); tl.quadraticCurveTo(-1.0, 8.3, 0.2, 12.4);
  neon(ctx, tl, bone, w * 0.55, { a: 0.85 * A, halo: 0.6, hot: 0.3 });
  // dorsal & ventral rays
  const fr = new Path2D();
  for (const [bx, ex, ey] of [[6.2, 5.4, 4.3], [5.0, 4.6, 4.6], [3.8, 3.2, 5.2]]) { fr.moveTo(bx, 8.1); fr.lineTo(ex, ey); }
  for (const [bx, ex, ey] of [[5.6, 5.0, 12.0], [4.2, 3.4, 11.4]]) { fr.moveTo(bx, 8.3); fr.lineTo(ex, ey); }
  neon(ctx, fr, bone, w * 0.45, { a: 0.7 * A, halo: 0.4, hot: 0.2 });
  // skull (pike-like): sloped cranium into a pointed snout, brow ridge, gill-cover arc, open jaw with fangs
  const skull = new Path2D('M 7.4 7.4 C 7.6 5.5 9.4 4.8 11 5.1 C 12.8 5.4 14.5 6.9 15.5 8.5 L 15.0 9.1 L 10.4 9.2 C 8.8 9.2 7.5 8.6 7.4 7.4 Z');
  const jaw = new Path2D('M 10.2 9.9 L 15.1 10.3 L 14.4 11.3 L 11.2 11.5 C 10.3 11.3 9.9 10.7 10.2 9.9 Z');
  for (const sh of [skull, jaw]) { ctx.save(); ctx.fillStyle = 'rgba(4,6,14,0.84)'; ctx.fill(sh); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(bone, 0.08 * A); ctx.fill(sh); ctx.restore(); }
  neon(ctx, skull, bone, w * 1.0, { a: A, halo: 1.1, hot: 0.65 });
  neon(ctx, jaw, bone, w * 0.8, { a: A, halo: 0.7, hot: 0.5 });
  neon(ctx, new Path2D('M 9.3 5.9 C 8.5 7 8.7 8.1 9.5 8.9 M 12.6 5.9 L 13.9 7.1 M 13.6 6.6 L 14.6 7.9'), bone, w * 0.4, { a: 0.7 * A, halo: 0, hot: 0.2 });
  const tt = new Path2D();
  for (let i = 0; i < 5; i++) { const x = 10.6 + i * 0.95; tt.moveTo(x, 9.2); tt.lineTo(x + 0.32, 10.2); tt.lineTo(x + 0.64, 9.2); }
  for (let i = 0; i < 4; i++) { const x = 11.1 + i * 1.0; tt.moveTo(x, 10.1); tt.lineTo(x + 0.3, 9.3); tt.lineTo(x + 0.6, 10.1); }
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(WHITE, 0.92 * A); ctx.fill(tt); ctx.restore();
  // hollow socket with a cold flame, heavy brow
  const ex = 11.2, ey = 6.9;
  ctx.save(); ctx.fillStyle = 'rgba(2,3,8,0.97)'; ctx.beginPath(); ctx.arc(ex, ey, 1.2, 0, TAU); ctx.fill(); ctx.restore();
  neon(ctx, circlePath(ex, ey, 1.2), bone, w * 0.6, { a: A, halo: 0.5 });
  neon(ctx, new Path2D('M 9.4 5.6 L 12.8 6.2'), bone, w * 0.75, { a: A, halo: 0.4, hot: 0.4 });
  glow(ctx, ex, ey, 2.4, RGB.cyan, 0.34 * A * (0.8 + Math.sin(t * 5) * 0.2));
  dot(ctx, ex + 0.15, ey, 0.38, hot(RGB.cyan, 0.5), A, { halo: 2.6 });
}

const ENEMY_FN = { nibbler, crabbit, jellop, springle, glimmer, bonefin };
