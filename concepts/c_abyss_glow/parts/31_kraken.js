/* ABYSS GLOW — Kraken King (48 x 48 design box): crowned royal-purple octopus, heavy-browed amber eyes, curling tentacles.
 * Tentacles are tapered ribbons on animated Catmull-Rom splines (the same primitive as gills/tails). */
function kraken(ctx, o, col, w, A) {
  const t = o.t, ang = !!o.angry;
  const hue = ang ? mixc(RGB.purple, RGB.crimson, 0.55) : RGB.purple;
  const gold = RGB.amber, eyeC = ang ? RGB.crimson : RGB.amber;
  const W2 = w * 1.0;
  const sw = (i, a, ph) => Math.sin(t * 1.7 + i * 1.3 + (ph || 0)) * a;
  glow(ctx, 24, 20, 36, hue, 0.2);
  glow(ctx, 24, 38, 26, RGB.magenta, 0.07, 0.7);

  // tentacles: outer pair curl outward into spirals, inner six sway and fan (no crossings)
  const sp0 = (i, pts) => pts.map((p) => [p[0], p[1]]);
  const spines = [
    [[10.5, 27.5], [5, 30 + sw(0, 1)], [1.6, 36], [2.8, 42 + sw(0, 1.2)], [7.6, 44.4], [10.8, 42], [9.2, 39.4]],
    [[13.5, 29], [9, 34 + sw(1, 1)], [7.2, 40.5], [9.6, 45.6 + sw(1, 0.6)], [14, 46.8]],
    [[17.2, 30], [14, 36 + sw(2, 1)], [13.6, 42.5], [16.4, 47.2]],
    [[21, 30.4], [19.4, 37 + sw(3, 1)], [19.6, 43], [21.6, 47.4]],
    [[27, 30.4], [28.6, 37 + sw(4, 1)], [28.4, 43], [26.4, 47.4]],
    [[30.8, 30], [34, 36 + sw(5, 1)], [34.4, 42.5], [31.6, 47.2]],
    [[34.5, 29], [39, 34 + sw(6, 1)], [40.8, 40.5], [38.4, 45.6 + sw(6, 0.6)], [34, 46.8]],
    [[37.5, 27.5], [43, 30 + sw(7, 1)], [46.4, 36], [45.2, 42 + sw(7, 1.2)], [40.4, 44.4], [37.2, 42], [38.8, 39.4]],
  ];
  const order = [0, 7, 1, 6, 2, 5, 3, 4];
  order.forEach((idx) => {
    const sp = sampleSpline(sp0(idx, spines[idx]), 8);
    const rb = taper(sp, (u) => 1.8 * Math.pow(1 - u, 0.85) + 0.26);
    ctx.save(); ctx.fillStyle = 'rgba(4,6,14,0.92)'; ctx.fill(rb); ctx.restore();
    const g = ctx.createLinearGradient(0, 27, 0, 47);
    g.addColorStop(0, rgba(mixc(hue, RGB.void, 0.1), 0.5)); g.addColorStop(1, rgba(mixc(hue, RGB.magenta, 0.55), 0.38));
    ctx.save(); ctx.fillStyle = g; ctx.fill(rb); ctx.restore();
    neon(ctx, rb, hue, W2 * 0.95, { a: A, grad: [0, 28, 0, 47], gradHot: 0.28, halo: 1.0, hot: 0.45 });
    // suckers along the inner edge
    const dots = new Path2D();
    for (let i = 7; i < sp.length - 5; i += 5) {
      const hw = 1.8 * Math.pow(1 - i / (sp.length - 1), 0.85) + 0.26;
      dots.moveTo(sp[i][0] + hw * 0.32, sp[i][1]); dots.arc(sp[i][0], sp[i][1], Math.max(0.3, hw * 0.32), 0, TAU);
    }
    neon(ctx, dots, mixc(hue, RGB.magenta, 0.5), W2 * 0.4, { a: 0.85 * A, halo: 0.2, hot: 0.3 });
    const tip = sp[sp.length - 1];
    dot(ctx, tip[0], tip[1], 0.55, mixc(RGB.magenta, WHITE, 0.3), A * 0.9, { halo: 3.5 });
  });

  // mantle (hooded dome)
  const mantle = new Path2D('M 8.6 27 C 5.4 11 15 5.4 24 5.4 C 33 5.4 42.6 11 39.4 27 C 36 31.4 12 31.4 8.6 27 Z');
  body(ctx, mantle, hue, W2, { a: A, y0: 5, y1: 31, tint: 1.55, hl: [17, 13, 20, 0.34] });
  neon(ctx, mantle, hue, W2 * 1.15, { a: A, grad: [8, 6, 40, 31], gradHot: 0.3, halo: 1.3, hot: 0.5 });
  neon(ctx, new Path2D('M 12.4 14 C 14.4 10.2 18.6 8.2 22 7.8'), WHITE, W2 * 0.55, { a: 0.55, halo: 0.2, hot: 0.4 });
  // arched ridges + bioluminescent spots
  const ridges = new Path2D('M 10.6 21 C 12 12.4 19 9.8 24 9.8 C 29 9.8 36 12.4 37.4 21 M 14.2 25.4 C 15.4 18.6 20 15.2 24 15.2 C 28 15.2 32.6 18.6 33.8 25.4');
  neon(ctx, ridges, hue, W2 * 0.45, { a: 0.5 * A, halo: 0, hot: 0.3 });
  for (const [sx2, sy2, r] of [[13.2, 17.6, 0.5], [34.8, 17.6, 0.5], [16.4, 12.8, 0.4], [31.6, 12.8, 0.4], [11.6, 23.2, 0.45], [36.4, 23.2, 0.45], [24, 11.6, 0.5], [19.2, 11.2, 0.35], [28.8, 11.2, 0.35], [24, 16.6, 0.45], [18.4, 27.6, 0.4], [29.6, 27.6, 0.4]])
    dot(ctx, sx2, sy2, r, mixc(RGB.cyan, hue, 0.15), 0.9 * A, { halo: 3 });

  // eyes: dark almond sockets, glowing iris, slit pupil, heavy brows (steeper when angry)
  const look = [Math.sin(t * 0.8) * 0.25, 0.1];
  for (const s of [-1, 1]) {
    const mx = (x) => (s < 0 ? x : 48 - x);
    const al = new Path2D(`M ${mx(11.8)} 22.4 Q ${mx(16.8)} ${ang ? 15.6 : 16.4} ${mx(22.4)} ${ang ? 23.2 : 22.2} Q ${mx(16.8)} 26.6 ${mx(11.8)} 22.4 Z`);
    ctx.save(); ctx.fillStyle = 'rgba(3,3,10,0.97)'; ctx.fill(al); ctx.restore();
    glow(ctx, mx(17.2), 21.4, 7, eyeC, 0.28 * A);
    ctx.save(); ctx.clip(al); ctx.globalCompositeOperation = 'lighter';
    const ig = ctx.createRadialGradient(mx(17.4 + look[0]), 21.6, 0.3, mx(17.4 + look[0]), 21.6, 3.3);
    ig.addColorStop(0, rgba(hot(eyeC, 0.7), 1)); ig.addColorStop(0.55, rgba(eyeC, 0.95)); ig.addColorStop(1, rgba(eyeC, 0.25));
    ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(mx(17.4 + look[0]), 21.6, 3.3, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = 'rgba(3,2,8,0.96)';
    ctx.beginPath(); ctx.ellipse(mx(17.4 + look[0] * 1.3), 21.6, 0.7, 2.7, 0, 0, TAU); ctx.fill();
    ctx.restore();
    neon(ctx, al, hot(eyeC, 0.2), W2 * 0.8, { a: A, halo: 1.0, hot: 0.5 });
    const bs = ang ? 4.4 : 2.8;
    neon(ctx, new Path2D(`M ${mx(10.6)} ${17.4 - bs * 0.2} L ${mx(23.2)} ${16.6 + bs}`), hot(hue, 0.25), W2 * 1.25, { a: A, halo: 1.0, hot: 0.55 });
    dot(ctx, mx(16.4), 20.4, 0.4, WHITE, 0.95 * A, { halo: 2.4 });
  }
  // stern mouth (a heavy frown with two small fangs) instead of a beak - the old triangle made the boss read as an owl
  neon(ctx, new Path2D('M 19.2 28.6 Q 24 25.6 28.8 28.6'), hot(hue, 0.5), W2 * 0.8, { a: A, halo: 0.7, hot: 0.5 });
  for (const fx of [21.6, 26.4]) neon(ctx, new Path2D(`M ${fx - 0.5} 27.5 L ${fx} 29.3 L ${fx + 0.5} 27.5`), WHITE, W2 * 0.45, { a: 0.85 * A, halo: 0.2, hot: 0.3 });
  // crown (gold, glowing, gem-tipped)
  const crown = new Path2D('M 15.6 8.4 L 16.6 1.4 L 20.5 5.2 L 24 -0.8 L 27.5 5.2 L 31.4 1.4 L 32.4 8.4 C 28 9.8 20 9.8 15.6 8.4 Z');
  ctx.save(); ctx.fillStyle = 'rgba(4,6,14,0.92)'; ctx.fill(crown); ctx.globalCompositeOperation = 'lighter';
  const cg = ctx.createLinearGradient(0, -1, 0, 9); cg.addColorStop(0, rgba(hot(gold, 0.4), 0.45)); cg.addColorStop(1, rgba(gold, 0.15)); ctx.fillStyle = cg; ctx.fill(crown); ctx.restore();
  neon(ctx, crown, gold, W2 * 1.0, { a: A, halo: 1.4, hot: 0.6, gradHot: 0.4 });
  for (const [gx, gy, c2] of [[16.6, 1.2, RGB.cyan], [24, -1.0, RGB.magenta], [31.4, 1.2, RGB.cyan]]) dot(ctx, gx, gy, 0.8, c2, A, { halo: 4 });
  neon(ctx, new Path2D('M 17.4 6.8 C 21 8 27 8 30.6 6.8'), hot(gold, 0.5), W2 * 0.4, { a: 0.8 * A, halo: 0, hot: 0.2 });
  dot(ctx, 24, 6.6, 0.55, RGB.magenta, A, { halo: 4 });
  sparkle(ctx, 24, -1.0, 2.2 + Math.sin(t * 3) * 0.5, hot(gold, 0.5), 0.8 * A, 0);
}
ENEMY_FN.kraken = kraken;
