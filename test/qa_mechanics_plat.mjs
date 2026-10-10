// Section: one-way platforms, walls, ceiling, wrap
import { arenaBoot, OUT } from './qa_mechanics_lib.mjs';
const { t, g, ev } = await arenaBoot({ god: true });
const out = {};
// 5-tile-high platform (surface y=176 = row 20): can player reach it by jumping from floor?
const reach = async (row, label) => {
  await g.evaluate((row) => { window.arena([[10, row, 17, row]]); }, row);
  return ev((H, row) => {
    const surf = 16 + row * 8; const res = {};
    // try several x offsets inside the platform span (body must be over platform on descent)
    let best = null;
    for (const x of [90, 100, 110]) {
      const p = H.P(); p.x = x; p.y = 200; p.vy = 0; p.onGround = true; H.step(2);
      H.step(1, () => [{ jump: true }]);
      let landedOn = null;
      for (let i = 0; i < 100; i++) { H.step(1); if (p.onGround) { landedOn = p.y + 16; break; } }
      if (landedOn === surf) best = x;
    }
    return { row, surface: surf, tilesAboveFloor: (216 - surf) / 8, canReachByStandingJump: best !== null };
  }, row);
};
out.reach = [];
for (const row of [21, 20, 19]) out.reach.push(await reach(row));

// partly-overlapped standing at platform edge: platform cols 10..17 => x 80..144
await g.evaluate(() => { window.arena([[10, 21, 17, 21]]); });
out.edge = await ev((H) => {
  const p = H.P(); const r = {};
  // stand on platform at right edge, walk right until fall; record x where we start to fall
  p.x = 120; p.y = 184 - 16; p.vy = 0; p.onGround = true; H.step(2);
  let n = 0; let fallX = null;
  while (n < 100) { H.step(1, () => [{ right: true }]); n++; if (!p.onGround) { fallX = p.x; break; } }
  r.rightEdgeFallX = fallX; r.rightEdgeOverlapPx = fallX !== null ? (144 - (fallX + 2)) : null;  // how much of body over platform when it left
  p.x = 100; p.y = 184 - 16; p.vy = 0; p.onGround = true; H.step(2);
  n = 0; fallX = null;
  while (n < 100) { H.step(1, () => [{ left: true }]); n++; if (!p.onGround) { fallX = p.x; break; } }
  r.leftEdgeFallX = fallX; r.leftEdgeOverlapPx = fallX !== null ? ((fallX + 14) - 80) : null;
  return r;
});

// side walls: thick wall cols 14..15 rows 21..24 -> walk into from left, stop at x?
await g.evaluate(() => { window.arena([[14, 21, 15, 24]]); });
out.wall = await ev((H) => {
  const p = H.P(); p.x = 40; p.y = 200; p.vy = 0; p.onGround = true; H.step(2);
  H.step(120, () => [{ right: true }]);
  const stopX = p.x;
  // wall left face at x=112; body right edge = x+14 -> expect x=98
  // jump over the wall (wall height 4 tiles = 32px: top at 16+21*8=184; need feet above 184 -> rise 32)
  p.x = 98; p.y = 200; H.step(2);
  let landed = null;
  H.step(1, () => [{ jump: true, right: true }]);
  for (let i = 0; i < 120; i++) { H.step(1, () => [{ right: true }]); }
  return { stopX, afterJumpOverX: p.x, y: p.y };
});

// Jump through 1-tile platform, sideways at the same time, plus "stuck inside" check for 2-thick block
await g.evaluate(() => { window.arena([[10, 20, 17, 21]]); });
out.thick = await ev((H) => {
  const p = H.P(); p.x = 100; p.y = 200; p.vy = 0; p.onGround = true; H.step(2);
  H.step(1, () => [{ jump: true }]);
  let maxRise = 0, ys = [];
  for (let i = 0; i < 100; i++) { H.step(1); if (p.onGround) break; }
  // 2-thick: surface is 176 (row 20); feet apex = 216-43.9 = 172.07 > top of row 21 (184) but only 4 above row20 top (176)? apex feet 172 < 176 => lands
  return { onGround: p.onGround, feetY: p.y + 16, expectSurfaceFeet: 176 };
});

// ceiling: stand on a platform at row 5 (surface 56) and jump: head clamps at y=24?
await g.evaluate(() => { window.arena([[10, 7, 17, 7]]); });
out.ceiling = await ev((H) => {
  const p = H.P(); p.x = 100; p.y = 16 + 7 * 8 - 16; p.vy = 0; p.onGround = true; H.step(2);
  let minY = 1e9, n = 0, air = 0;
  H.step(1, () => [{ jump: true }]);
  while (!p.onGround && n < 200) { H.step(1); n++; if (p.y < minY) minY = p.y; }
  return { startY: 16 + 7 * 8 - 16, minY, airFrames: n, note: 'platform surface y=72 => start y=56, apex would be 12 without clamp; clamp is 24' };
});

// wrap: floor gap cols 14..16; player walks into gap, falls, re-enters from top
await g.evaluate(() => { window.arena([], [[14, 16]]); });
out.wrap = await ev((H) => {
  const p = H.P(); p.x = 100; p.y = 200; p.vy = 0; p.onGround = true; H.step(2);
  const trace = [];
  p.x = 112 + 0; H.step(1);
  let n = 0, wrapped = false, prevY = p.y, minYAfter = 1e9, firstLand = null, wrapFrame = null;
  for (let i = 0; i < 300; i++) {
    H.step(1, () => [{}]);
    if (p.y < prevY - 100 && !wrapped) { wrapped = true; wrapFrame = i; trace.push({ i, from: prevY, to: p.y }); }
    prevY = p.y;
    if (wrapped && p.onGround) { firstLand = { i, y: p.y }; break; }
  }
  return { wrapped, wrapFrame, trace, firstLand, x: p.x };
});
console.log(JSON.stringify(out, null, 1));
console.log('errors', t.errors);
await t.close();
