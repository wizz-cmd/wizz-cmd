import { arenaBoot, OUT, canvasShot } from './qa_mechanics_lib.mjs';
const { t, g, ev, page } = await arenaBoot({ god: true });
const out = {};
await g.evaluate(() => { window.arena([[8, 12, 23, 12]]); });
// Crabbit: platform surface y=112 (row 12). Crabbit on platform, player on same platform at 80px in front.
out.crabbit = await ev((H) => {
  const S = H.S(); S.enemies.length = 0; S.proj.length = 0; const p = H.P(); p.inv = 1e9;
  H.D.spawn('crabbit', 140, 96); const e = S.enemies[0]; e.d = -1; e.cool = 0;
  p.x = 60; p.y = 96; p.vy = 0; p.onGround = true; H.step(2);
  const throws = []; let stopFrames = 0, maxStop = 0, run = 0; const pebbles = [];
  let lastN = 0;
  for (let i = 0; i < 700; i++) {
    p.x = 60; p.y = 96; p.vy = 0;
    H.step(1);
    const n = S.proj.filter(q => q.type === 'pebble').length; if (S.proj.length && S.proj.filter(q => q.type === 'pebble').some(q => q.age === 1)) throws.push(i);
    if (e.pauseT > 0) { run++; maxStop = Math.max(maxStop, run); } else run = 0;
    for (const q of S.proj) if (q.type === 'pebble' && q.age === 1) pebbles.push({ y: q.y - e.y, vx: q.vx });
  }
  return { throws, maxStop, pebble0: pebbles[0], cooldownIntervals: throws.slice(1).map((f, k) => f - throws[k]) };
});
// Pebble hits platform side? pebble y relative to player
// Glimmer
out.glimmer = await ev((H) => {
  const S = H.S(); S.enemies.length = 0; S.proj.length = 0; const p = H.P(); p.inv = 1e9;
  H.D.spawn('glimmer', 100, 40); const e = S.enemies[0]; e.cool = 0;
  p.x = 100; p.y = 200; p.vy = 0; p.onGround = true; H.step(2);
  const sparks = []; let prev = 0;
  for (let i = 0; i < 700; i++) {
    p.x = e.x; p.y = 200; p.vy = 0;
    H.step(1);
    for (const q of S.proj) if (q.type === 'spark' && q.age === 1) sparks.push(i);
  }
  return { sparks, intervals: sparks.slice(1).map((f, k) => f - sparks[k]) };
});
// Springle: hop pattern
out.springle = await ev((H) => {
  const S = H.S(); S.enemies.length = 0; const p = H.P(); p.inv = 1e9; p.x = 20; p.y = 200;
  H.D.spawn('springle', 100, 96); const e = S.enemies[0];
  const hops = []; let wasG = true, hopStart = 0, ys = [];
  for (let i = 0; i < 400; i++) { p.x = 20; p.y = 200; H.step(1); if (wasG && !e.onGround) hopStart = i; if (!wasG && e.onGround) hops.push({ air: i - hopStart }); wasG = e.onGround; }
  return { hops: hops.slice(0, 6), count: hops.length };
});
// Nibbler at ledge: fraction turn vs walk-off (platform row 12, x from 64..191), nibbler on right edge walking right
out.ledge = await ev((H) => {
  const S = H.S(); const p = H.P(); p.inv = 1e9;
  let walk = 0, turn = 0;
  for (let trial = 0; trial < 60; trial++) {
    S.enemies.length = 0; p.x = 20; p.y = 200; p.vy = 0;
    H.D.spawn('nibbler', 150, 96); const e = S.enemies[0]; e.d = 1; e.vx = 0; e.turnCool = 0;
    let res = null;
    for (let i = 0; i < 120; i++) { p.x = 20; p.y = 200; H.step(1); if (!e.onGround && e.y > 100) { res = 'walk'; break; } if (e.d < 0) { res = 'turn'; break; } }
    if (res === 'walk') walk++; else if (res === 'turn') turn++;
  }
  return { walk, turn };
});
// Nibbler jumps toward player above
out.jumpFreq = await ev((H) => {
  const S = H.S(); const p = H.P(); p.inv = 1e9; S.enemies.length = 0;
  H.D.spawn('nibbler', 100, 200); const e = S.enemies[0];
  let jumps = 0, was = true;
  for (let i = 0; i < 1800; i++) { p.x = e.x + 10; p.y = 96; p.vy = 0; p.onGround = true; if (e.x > 200) e.x = 100; H.step(1); if (was && !e.onGround) jumps++; was = e.onGround; }
  return { jumpsIn1800f: jumps, expected: 1800 / 90 };
});
console.log(JSON.stringify(out, null, 1));
console.log('errors', t.errors);
await t.close();
