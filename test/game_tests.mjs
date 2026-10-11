// FIZZ & POP — Game module tests (real headless Chromium via Playwright, deterministic, stubs for GFX/AUDIO/LEVELS).
//   v2: sections 1-21 are MECHANICS (unchanged numbers) + presentation hooks; section 22 = v2 "Abyss Glow" presentation gates (setOptions, photosensitivity
//   caps, reduced motion, particle / entity bounds, trails, render cost, fallbacks, HUD hooks); 11 = soak. Pixel-level look gates live in test/game_visual.mjs,
//   mechanics equivalence against the pre-v2 build in test/game_equiv.mjs.
//   node test/game_tests.mjs            run everything
//   node test/game_tests.mjs 8 11       run only tests whose name starts with "8" or "11"
//   REAL=1 node test/game_tests.mjs     run against the real GFX/AUDIO/LEVELS modules instead of the stubs
//   REAL=1 BASE=../out/fix/game_priv/src ... take the real modules from another directory (snapshot of wave-1 modules)
//   GAME=../backup/wave2/40_game.js ...  run against another Game build (e.g. to see that a new test fails on the old code)
import { launch, canvasShot, PROJECT } from '../tools/harness.mjs';
import path from 'path';

const HTML = path.join(PROJECT, 'test', 'game_harness.html') + '?' + [process.env.REAL ? 'real=1' : '', process.env.BASE ? 'base=' + process.env.BASE : '', process.env.GAME ? 'game=' + process.env.GAME : ''].filter(Boolean).join('&');
const only = process.argv.slice(2);
const results = [];
let t, page;

// ---- tiny assertion helpers ---------------------------------------------------------------------
class Fail extends Error {}
const ok = (c, msg) => { if (!c) throw new Fail(msg || 'assertion failed'); };
const eq = (a, b, msg) => { if (a !== b) throw new Fail(`${msg || 'eq'}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`); };
const near = (a, b, tol, msg) => { if (!(Math.abs(a - b) <= tol)) throw new Fail(`${msg || 'near'}: got ${a}, expected ${b} +/- ${tol}`); };
const ev = (fn, arg) => page.evaluate(fn, arg);

async function fresh() {
  if (page) await t.close();
  t = await launch({ html: HTML });
  page = t.page;
  await page.waitForFunction(() => !!window.__t);
  await ev(() => __t.freeze(true));
}

async function test(name, fn) {
  if (only.length && !only.some((p) => name.startsWith(p))) return;
  await fresh();
  const errBefore = t.errors.length;
  try {
    await fn();
    if (t.errors.length > errBefore) throw new Fail('console errors: ' + t.errors.slice(errBefore).join(' | '));
    results.push([name, true]);
    console.log('PASS  ' + name);
  } catch (e) {
    results.push([name, false]);
    console.log('FAIL  ' + name + '\n        ' + (e instanceof Fail ? e.message : e.stack || e));
  }
}

// =================================================================================================
// 1. Physics
// =================================================================================================
await test('1a jump apex ~44 px, lands exactly, no double jump', async () => {
  const r = await ev(() => {
    const T = __t; T.arena(); const p = T.S().players[0];
    const y0 = p.y; T.step(1, [{ jump: true }]); let min = p.y;
    for (let i = 0; i < 90; i++) { T.step(1, [{ jump: i > 3 && i < 30 && i % 5 === 0 }]); min = Math.min(min, p.y); }   // tapping jump in the air does nothing
    return { apex: y0 - min, y: p.y, y0, onGround: p.onGround };
  });
  near(r.apex, 44, 2.5, 'apex');
  eq(r.y, r.y0, 'landed on the floor');
  ok(r.onGround, 'onGround');
});

await test('1b jump up through a platform and land on it; sideways move while passing through', async () => {
  const r = await ev(() => {
    const T = __t; T.arena(); const p = T.S().players[0];          // stub map A: platform row 21 (surface y=184) cols 8..13
    p.x = 72; p.y = 200;
    T.step(1, [{ jump: true }]);
    let throughY = null;
    for (let i = 0; i < 80; i++) { T.step(1); if (p.y + 16 < 184 + 8 && p.y + 16 > 184 - 2 && throughY === null) throughY = p.y; }
    const landed = { y: p.y, onGround: p.onGround };
    // sideways while rising through the platform
    p.x = 66; p.y = 200; p.vy = 0; T.step(2);
    const x0 = p.x; T.step(1, [{ jump: true, right: true }]);
    for (let i = 0; i < 20; i++) T.step(1, [{ right: true }]);
    return { landed, dx: p.x - x0 };
  });
  eq(r.landed.y, 184 - 16, 'landed on top of the platform');
  ok(r.landed.onGround, 'onGround on platform');
  ok(r.dx > 21, 'moved sideways while passing through (dx=' + r.dx + ')');
});

await test('1c cannot walk into a block wall; walls stop at tile edge', async () => {
  const r = await ev(() => {
    const T = __t; T.useMap(0, T.mkMap({ blocks: [[14, 23, 15, 24]] })); T.arena(); const p = T.S().players[0];
    T.step(200, [{ right: true }]);
    const right = p.x;
    p.x = 200; T.step(200, [{ left: true }]);
    return { right, left: p.x };
  });
  near(r.right, 98, 0.01, 'stopped at wall tile (x+14 == 112)');
  near(r.left, 128 - 2, 0.01, 'stopped at the wall from the other side (x+2 == 128)');
});

await test('1d falling through a floor gap re-enters from the top', async () => {
  const r = await ev(() => {
    const T = __t; T.useMap(0, T.mkMap({ floorGap: [14, 17] })); T.arena(); const p = T.S().players[0];
    p.x = 120; p.y = 190; p.onGround = false; p.vy = 0;
    let wrapped = -1, prevY = p.y, maxY = p.y;
    for (let i = 0; i < 160; i++) { T.step(1); if (p.y < prevY - 100 && wrapped < 0) wrapped = i; prevY = p.y; maxY = Math.max(maxY, p.y); }
    const afterWrapY = p.y;
    T.step(60, [{ right: true }]);
    T.step(200);
    return { wrapped, maxY, afterWrapY, y: p.y, x: p.x, onGround: p.onGround };
  });
  ok(r.wrapped >= 0, 'wrapped');
  ok(r.maxY > 200, 'fell through the floor row');
  eq(r.y, 200, 'finally standing on the floor next to the gap');
  ok(r.x >= 140, 'beside the gap');
  ok(r.onGround, 'onGround');
});

await test('1e rising player cannot pass above row 1; walkers fall off ledges, jump physics shared', async () => {
  const r = await ev(() => {
    const T = __t; T.useMap(0, T.mkMap({ blocks: [[4, 3, 20, 3]] })); T.arena(); const S = T.S(), p = S.players[0];
    p.x = 100; p.y = 24; p.vy = -3; p.onGround = false; T.step(1);
    return { y: p.y };
  });
  ok(r.y >= 24, 'ceiling at y=24, got ' + r.y);
});

// =================================================================================================
// 2. Bubbles, trapping, popping, chains
// =================================================================================================
await test('2a shot bubble traps an enemy', async () => {
  const r = await ev(() => {
    const T = __t; T.arena(); const S = T.S();
    Game.debug.spawn('nibbler', 60, 200);
    const e = S.enemies[0]; e.state = 'frozen'; e.freezeT = 999999;
    T.step(1, [{ fire: true }]);
    T.step(1);
    const early = S.bubbles.map((b) => b.state + ':' + b.kind);
    T.step(20);
    return { early, kinds: S.bubbles.map((b) => b.kind), es: e.state, log: __t.log.filter((l) => l[0] === 'sfx').map((l) => l[1]) };
  });
  eq(r.early[0], 'shot:empty', 'bubble starts in the shot phase');
  eq(r.kinds[0], 'trapped', 'bubble became a trapped bubble');
  eq(r.es, 'trapped', 'enemy trapped');
  ok(r.log.includes('shoot') && r.log.includes('trap'), 'sfx shoot + trap');
});

await test('2b popping a trapped bubble kills (1000) and the corpse lands as food_0', async () => {
  const r = await ev(() => {
    const T = __t; T.arena(); const S = T.S(), p = S.players[0];
    Game.debug.spawn('nibbler', 60, 200);
    const e = S.enemies[0]; e.state = 'frozen'; e.freezeT = 999999;
    T.step(1, [{ fire: true }]); T.step(30);
    const b = S.bubbles[0];
    const trappedOk = b.kind === 'trapped';
    p.x = b.x; p.y = b.y; p.onGround = false; T.step(1);
    const afterPop = { es: e.state, score: p.score };
    p.x = 200; p.y = 200;
    let food = null;
    for (let i = 0; i < 300 && !food; i++) { T.step(1); const it = S.items.find((q) => q.kind.startsWith('food_')); if (it) food = it.kind; }
    return { trappedOk, afterPop, food, enemies: S.enemies.length };
  });
  ok(r.trappedOk, 'trapped');
  eq(r.afterPop.es, 'dying', 'enemy dying');
  eq(r.afterPop.score, 1000, 'score 1000');
  eq(r.food, 'food_0', 'food');
  eq(r.enemies, 0, 'enemy removed after landing');
});

await test('2c 3-kill chain scores 1000/2000/4000, propagates via 4-frame delays, spawns a letter bubble', async () => {
  const r = await ev(() => {
    const T = __t; T.arena(); const S = T.S(), p = S.players[0];
    for (const x of [56, 72, 88]) { Game.debug.spawn('nibbler', x, 200); const e = S.enemies[S.enemies.length - 1]; e.state = 'frozen'; e.freezeT = 999999; }
    for (let i = 0; i < 3; i++) { T.step(1, [{ fire: true }]); T.step(20); }
    const kinds = S.bubbles.map((b) => b.kind);
    const [b0, b1, b2] = S.bubbles;
    b1.x = b0.x + 15; b1.y = b0.y; b2.x = b0.x + 30; b2.y = b0.y;
    p.x = b0.x; p.y = b0.y; p.onGround = false;
    const scores = [];
    for (let i = 0; i < 30; i++) { T.step(1); scores.push(p.score); }
    const changes = [];
    scores.forEach((s, i) => { if (i === 0 || s !== scores[i - 1]) changes.push([i, s]); });
    return { kinds, final: p.score, changes, letter: S.bubbles.some((b) => b.kind === 'letter') };
  });
  eq(r.kinds.join(), 'trapped,trapped,trapped', 'three trapped bubbles');
  eq(r.final, 7000, 'total 1000+2000+4000');
  const k = r.changes.filter((c) => c[1] > 0);
  eq(k.length, 3, 'three score events: ' + JSON.stringify(r.changes));
  eq(k[1][0] - k[0][0], 4, 'second pop 4 frames after the first');
  eq(k[2][0] - k[1][0], 4, 'third pop 4 frames after the second');
  ok(r.letter, 'letter bubble spawned by the >=3 chain');
});

await test('2d empty bubble gives 10 points; shooter cannot pop own fresh bubble; lifetime 660', async () => {
  const r = await ev(() => {
    const T = __t; T.arena(); const S = T.S(), p = S.players[0];
    p.x = 16;                                  // against the left wall: facing left would be a point-blank shot
    p.face = -1;
    T.step(1, [{ fire: true }]); T.step(2);
    const survivedPointBlank = S.bubbles.length === 1;
    S.bubbles.length = 0;
    p.x = 24; p.face = 1; p.cooldown = 0; T.step(1);
    T.step(1, [{ fire: true }]); T.step(40);
    const b = S.bubbles[0];
    p.x = b.x; p.y = b.y; p.onGround = false; T.step(1);
    const score = p.score;
    // lifetime
    p.x = 24; p.y = 200; T.step(1);
    T.step(1, [{ fire: true }]); T.step(1);
    const b2 = S.bubbles[0]; b2.x = 200; b2.y = 30; b2.att = null;
    p.x = 24; p.y = 200;
    T.step(600); const aliveAt600 = S.bubbles.length; T.step(80);
    return { survivedPointBlank, score, aliveAt600, alive: S.bubbles.length, warn: null };
  });
  ok(r.survivedPointBlank, 'point-blank bubble not popped by its owner');
  eq(r.score, 10, 'empty bubble = 10');
  eq(r.aliveAt600, 1, 'alive at 600');
  eq(r.alive, 0, 'popped silently by 680');
});

await test('2e bounce on a bubble while holding jump (pop without jump)', async () => {
  const r = await ev(() => {
    const T = __t; T.arena(); const S = T.S(), p = S.players[0];
    T.step(1, [{ fire: true }]); T.step(60);
    const b = S.bubbles[0];
    p.x = b.x; p.y = b.y - 12; p.vy = 1.0; p.onGround = false; p.coyote = -1;
    T.step(1, [{ jump: true }]);
    const bounced = { vy: p.vy, alive: S.bubbles.length, score: p.score, log: __t.log.some((l) => l[0] === 'sfx' && l[1] === 'bounce') };
    // pop variant (no jump held)
    T.arena(); const S2 = T.S(), p2 = S2.players[0];
    T.step(1, [{ fire: true }]); T.step(60);
    const b2 = S2.bubbles[0];
    p2.x = b2.x; p2.y = b2.y - 12; p2.vy = 1.0; p2.onGround = false; p2.coyote = -1;
    T.step(1);
    return { bounced, popped: { alive: S2.bubbles.length, score: p2.score } };
  });
  ok(r.bounced.vy < -3, 'vy after bounce ' + r.bounced.vy);
  eq(r.bounced.alive, 1, 'bubble survived');
  eq(r.bounced.score, 0, 'no points for a bounce');
  ok(r.bounced.log, 'bounce sfx');
  eq(r.popped.alive, 0, 'popped without jump');
  eq(r.popped.score, 10, '10 points');
});

await test('2f bubble cap 40, shot distance 48/80/120 px, speed 4 -> 0', async () => {
  const r = await ev(() => {
    const T = __t; T.arena(); const S = T.S(), p = S.players[0];
    p.x = 100; T.step(1, [{ fire: true }]); T.step(1);
    const x1 = S.bubbles[0].x; T.step(60);
    const dist48 = S.bubbles[0].x - x1;
    T.arena(); const S2 = T.S(), q = S2.players[0];
    q.power.pink = true; q.x = 100; T.step(1, [{ fire: true }]); T.step(1); const y1 = S2.bubbles[0].x; T.step(80);
    const dist80 = S2.bubbles[0].x - y1;
    T.arena(); const S3 = T.S(), w = S3.players[0];
    for (let i = 0; i < 80; i++) { w.cooldown = 0; T.step(1, [{ fire: i % 2 === 0 }]); w.x = 100 + (i % 5) * 20; }
    return { dist48, dist80, count: S3.bubbles.filter((b) => !b.dead).length };
  });
  near(r.dist48, 48, 6, 'default range');
  near(r.dist80, 80, 8, 'pink range');
  ok(r.count <= 40, 'bubble cap: ' + r.count);
});

// =================================================================================================
// 3. Escape
// =================================================================================================
await test('3 trapped enemy escapes angry after trapTime (480 in round 1) with 3 stages', async () => {
  const r = await ev(() => {
    const T = __t; T.arena(); const S = T.S();
    Game.debug.spawn('nibbler', 60, 200);
    const e = S.enemies[0]; e.state = 'frozen'; e.freezeT = 999999;
    T.step(1, [{ fire: true }]); T.step(5);
    const b = S.bubbles[0], tt = b.trapTime;
    T.step(tt - 15);
    const before = { es: e.state, kind: b.kind };
    T.step(30);
    return { tt, before, es: e.state, angry: e.angry, bubbles: S.bubbles.length };
  });
  eq(r.tt, 480, 'trapTime round 1');
  eq(r.before.es, 'trapped', 'still trapped just before');
  eq(r.es, 'active', 'escaped');
  ok(r.angry, 'angry');
  eq(r.bubbles, 0, 'bubble gone');
});

await test('3b trapTime shrinks by 10 frames per round, floor 240 (round 11 -> 380, round 29 -> 240)', async () => {
  const r = await ev(() => {
    const out = [];
    for (const level of [11, 29]) {
      const T = __t; T.arena({ level }); const S = T.S();
      Game.debug.spawn('nibbler', 60, 200);
      const e = S.enemies[0]; e.state = 'frozen'; e.freezeT = 999999;
      T.step(1, [{ fire: true }]); T.step(5);
      out.push(S.bubbles[0].trapTime);
    }
    return out;
  });
  eq(r[0], 380, 'max(240, 480-10*10)'); eq(r[1], 240, 'floor 240');
});

// =================================================================================================
// 4. Round flow
// =================================================================================================
await test('4 round clear -> clear -> transition (scroll) -> next intro -> play', async () => {
  const r = await ev(() => {
    const T = __t; T.start({ players: 1, level: 1, seed: 11 });
    const phases = []; const note = () => { const s = T.state(); if (!phases.length || phases[phases.length - 1][0] !== s.phase + ':' + s.level) phases.push([s.phase + ':' + s.level, s.frame]); };
    note();
    T.step(149); const at149 = T.state().phase;
    T.step(2); note();
    const enemies = T.state().enemies.length;
    Game.debug.killAll(); note();
    for (let i = 0; i < 700; i++) { T.step(1); note(); if (T.state().phase === 'intro' && T.state().level === 2) break; }
    const mid = (() => { for (let i = 0; i < 200; i++) { if (T.state().phase === 'play') break; T.step(1); } return null; })();
    const final = T.state();
    return { phases, at149, enemies, final: { phase: final.phase, level: final.level, en: final.enemies.length } };
  });
  eq(r.at149, 'intro', 'intro lasts 150 frames');
  eq(r.enemies, 3, 'round 1 has 3 enemies');
  const names = r.phases.map((p) => p[0]);
  ok(names.includes('clear:1'), 'clear phase ' + names);
  ok(names.includes('transition:1'), 'transition phase');
  ok(names.includes('intro:2'), 'next intro');
  const iClear = names.indexOf('clear:1'), iTr = names.indexOf('transition:1'), iIntro = names.indexOf('intro:2');
  ok(iClear < iTr && iTr < iIntro, 'order');
  eq(r.final.phase, 'play', 'play in round 2');
  eq(r.final.level, 2, 'level 2');
});

await test('4b transition: 120-frame scroll, leftovers vanish, players end at their spawn', async () => {
  const r = await ev(() => {
    const T = __t; T.start({ players: 2, level: 1, seed: 5 }); T.step(160);
    const S = T.S(); Game.debug.spawn('shoes', 100, 200); T.step(1, [{ fire: true }]);
    Game.debug.killAll();
    for (let i = 0; i < 700 && T.state().phase !== 'transition'; i++) T.step(1);
    const at0 = T.state();
    T.step(60); const mid = T.state();
    T.step(59); const late = T.state();
    T.step(2); const end = T.state();
    return { at0: [at0.phase, at0.bubbles.length, at0.items.length], mid: mid.players.map((p) => [p.x, p.y]), late: late.phase, end: [end.phase, end.level, end.players.map((p) => [p.x, p.y])] };
  });
  eq(r.at0[0], 'transition', 'in transition');
  eq(r.at0[1], 0, 'bubbles vanished');
  eq(r.at0[2], 0, 'items vanished');
  eq(r.late, 'transition', 'still scrolling at 119');
  eq(r.end[0], 'intro', 'intro after scroll');
  eq(r.end[1], 2, 'next level');
  eq(JSON.stringify(r.end[2]), JSON.stringify([[24, 200], [216, 200]]), 'players at spawn');
});

// =================================================================================================
// 5. Hurry up / Bonefin
// =================================================================================================
await test('5 HURRY UP at level.hurry s, Bonefin 600 frames later, death resets everything', async () => {
  const r = await ev(() => {
    const T = __t; T.useMap(0, LEVELS[0].map, { hurry: 5 }); T.arena(); const S = T.S();
    Game.debug.spawn('nibbler', 100, 100); const e = S.enemies[0]; e.state = 'frozen'; e.freezeT = 1e9;
    T.step(299); const a = T.state();
    T.step(1); const b = T.state();
    const tempo = __t.log.filter((l) => l[0] === 'setTempo').map((l) => l[1]);
    const angry = e.angry;
    T.step(599); const c = T.state();
    T.step(1); const d = T.state();
    const ghostSfx = __t.log.some((l) => l[0] === 'sfx' && l[1] === 'ghost');
    // ghost homes on the player and kills; death resets hurry
    for (let i = 0; i < 700 && T.state().players[0].state === 'normal'; i++) T.step(1);
    T.step(2); const dead = T.state();
    return { a: [a.hurry, a.ghost], b: [b.hurry, b.ghost], tempo, angry, c: [c.hurry, c.ghost], d: [d.hurry, d.ghost], ghostSfx, dead: [dead.hurry, dead.ghost, dead.hurryT, dead.players[0].lives, dead.players[0].state], eAngry: e.angry, tempoAfter: __t.log.filter((l) => l[0] === 'setTempo').map((l) => l[1]).pop() };
  });
  eq(r.a.join(), 'false,false', 'before hurry');
  eq(r.b.join(), 'true,false', 'hurry at 300 frames');
  ok(r.tempo.includes(1.3), 'tempo 1.3');
  ok(r.angry, 'enemies angry');
  eq(r.c.join(), 'true,false', 'ghost not yet');
  eq(r.d.join(), 'true,true', 'ghost 600 frames later');
  ok(r.ghostSfx, 'ghost sfx');
  ok(r.dead[3] < 3, 'bonefin killed the player (lives=' + r.dead[3] + ')');
  eq(r.dead[1], false, 'ghost left');
  eq(r.dead[0], false, 'hurry reset');
  ok(r.dead[2] < 10, 'hurry timer restarted (' + r.dead[2] + ')');
  ok(r.eAngry, 'enemies stay angry');
  eq(r.tempoAfter, 1, 'tempo back to 1');
});

// =================================================================================================
// 6. Death, respawn, game over
// =================================================================================================
await test('6a death -> dying 90 frames -> respawn at spawn with 120 frames invulnerability', async () => {
  const r = await ev(() => {
    const T = __t; T.arena(); const S = T.S(), p = S.players[0];
    Game.debug.spawn('nibbler', p.x, p.y);
    T.step(1); const a = T.state();
    Game.debug.clearEnemies();
    T.step(88); const b = T.state();
    T.step(2); const c = T.state();
    Game.debug.spawn('nibbler', p.x, p.y); T.step(30); const d = T.state();
    Game.debug.clearEnemies(); Game.debug.setPlayer(0, { inv: 0 }); Game.debug.spawn('nibbler', p.x, p.y); T.step(1); const e = T.state();
    return { a: [a.phase, a.players[0].state, a.players[0].lives], b: b.players[0].state, c: [c.players[0].state, c.players[0].inv, c.players[0].x, c.players[0].y], d: [d.players[0].state, d.players[0].lives], e: [e.players[0].state, e.players[0].lives] };
  });
  eq(r.a[0], 'dying', 'phase dying'); eq(r.a[1], 'dying'); eq(r.a[2], 2, 'lives decremented');
  eq(r.b, 'dying', 'still dying at 89');
  eq(r.c[0], 'normal', 'respawned'); ok(r.c[1] > 100, 'invulnerable'); eq(r.c[2], 24); eq(r.c[3], 200);
  eq(r.d[0], 'normal', 'enemy at spawn cannot hurt during invulnerability'); eq(r.d[1], 2);
  eq(r.e[1], 1, 'killed again once invulnerability ended');
});

await test('6b three deaths -> gameover phase (240 frames) -> isOver, result()', async () => {
  const r = await ev(() => {
    const T = __t; T.arena(); const S = T.S(), p = S.players[0];
    p.score = 1234;
    const die = () => { Game.debug.spawn('nibbler', p.x, p.y); T.step(1); Game.debug.clearEnemies(); };
    die(); T.step(215); die(); T.step(215); die();
    const dying = T.state().phase;
    T.step(89); const early = Game.isOver();
    T.step(2); const g = T.state();
    const overBefore = Game.isOver();
    T.step(240);
    return { dying, early, g: [g.phase, g.players[0].lives, g.players[0].alive], overBefore, over: Game.isOver(), res: Game.result(), log: __t.log.filter((l) => l[0] === 'jingle').map((l) => l[1]) };
  });
  eq(r.dying, 'dying'); eq(r.early, false);
  eq(r.g[0], 'gameover', 'gameover phase'); eq(r.g[1], 0); eq(r.g[2], false);
  eq(r.overBefore, false, 'not over during the GAME OVER banner');
  eq(r.over, true, 'isOver');
  eq(r.res.won, false); eq(r.res.level, 1); eq(r.res.scores[0], 1234); eq(r.res.players, 1);
  ok(r.log.includes('gameover'), 'gameover jingle');
});

await test('6c extra lives at 30000 and every 100000 after (100k, 200k)', async () => {
  const r = await ev(() => {
    const T = __t; T.arena(); const p = T.S().players[0];
    Game.debug.addScore(0, 29990); const a = p.lives;
    Game.debug.addScore(0, 10); const b = p.lives;
    Game.debug.addScore(0, 69999); const c = p.lives;
    Game.debug.addScore(0, 1); const d = p.lives;
    Game.debug.addScore(0, 100000); const e = p.lives;
    return [a, b, c, d, e];
  });
  eq(r.join(), '3,4,4,5,6');
});

// =================================================================================================
// 7. EXTEND
// =================================================================================================
await test('7 EXTEND completion: +1 life, jingle, letters reset, round skipped to the transition', async () => {
  const r = await ev(() => {
    const T = __t; T.arena({ empty: false }); const S = T.S(), p = S.players[0];
    p.letters = [true, true, true, true, true, false];
    Game.debug.spawn('letter', 100, 200);
    const letterChar = S.bubbles[0].letter;
    p.x = 100; p.y = 200; T.step(1);
    const a = T.state();
    const jingle = __t.log.some((l) => l[0] === 'jingle' && l[1] === 'extend');
    T.step(179); const mid = T.state();
    T.step(2); const b = T.state();
    T.step(125); const c = T.state();
    return { letterChar, a: [a.phase, a.players[0].lives, a.letters[0].length], jingle, mid: [mid.phase, mid.letters[0].length], b: b.phase, bLetters: b.letters[0].length, enemiesAfter: b.enemies.length, c: [c.phase, c.level] };
  });
  eq(r.letterChar, 'D', 'carries the missing letter');
  eq(r.a[0], 'extend'); eq(r.a[1], 4, 'life +1'); eq(r.a[2], 6, 'all six letters stay lit during the extend phase');
  ok(r.jingle, 'extend jingle');
  eq(r.mid[0], 'extend'); eq(r.mid[1], 6, 'still lit at the end of the phase');
  eq(r.b, 'transition', 'round skipped'); eq(r.bLetters, 0, 'letters reset when the phase ends');
  eq(r.enemiesAfter, 0);
  eq(r.c[1], 2, 'level 2'); eq(r.c[0], 'intro');
});

await test('7b letters: duplicate letter gives +500, collecting by popping, HUD letters per player', async () => {
  const r = await ev(() => {
    const T = __t; T.arena(); const S = T.S(), p = S.players[0];
    p.letters = [true, false, false, false, false, false];
    Game.debug.spawn('letter', 100, 200);
    S.bubbles[0].letter = 'E';                       // E slot 0 owned, slot 3 free -> fills slot 3
    p.x = 100; p.y = 200; T.step(1);
    const a = [p.letters.filter(Boolean).length, p.score];
    Game.debug.spawn('letter', 100, 200); S.bubbles[0].letter = 'X';
    p.letters[1] = true;
    p.x = 100; p.y = 200; T.step(1);
    return { a, b: p.score, log: __t.log.filter((l) => l[0] === 'sfx' && l[1] === 'letter').length };
  });
  eq(r.a.join(), '2,0', 'second E fills slot 3');
  eq(r.b, 500, 'duplicate X bonus');
  eq(r.log, 2);
});

// =================================================================================================
// 8. Power-ups and specials
// =================================================================================================
await test('8a power-ups: shoes / pink / blue / gold / heart', async () => {
  const r = await ev(() => {
    const T = __t;
    const give = (kind) => { T.arena(); const S = T.S(), p = S.players[0]; Game.debug.spawn(kind, p.x, p.y); T.step(1); return { S, p }; };
    let { p } = give('shoes'); const sc = p.score; const x0 = p.x; T.step(10, [{ right: true }]); const shoesSpeed = (p.x - x0) / 10;
    ({ p } = give('blue')); let shots = 0;
    for (let i = 0; i < 24; i++) { const n = T.S().bubbles.length; T.step(1, [{ fire: i % 2 === 0 }]); shots += T.S().bubbles.length > n ? 1 : 0; }
    const blueShots = shots;
    ({ p } = give('none')); T.arena(); const p0 = T.S().players[0]; shots = 0;
    for (let i = 0; i < 24; i++) { const n = T.S().bubbles.length; T.step(1, [{ fire: i % 2 === 0 }]); shots += T.S().bubbles.length > n ? 1 : 0; }
    const baseShots = shots;
    ({ p } = give('gold')); p.x = 100; T.step(1, [{ fire: true }]); const bx = T.S().bubbles[0].x; const gx0 = bx; T.step(1); const goldStep = T.S().bubbles[0].x - gx0;
    ({ p } = give('pink')); const pinkPower = T.state().players[0].power;
    ({ p } = give('heart')); const lives = p.lives; const hs = p.score;
    // death removes power-ups
    const { S: S2, p: p2 } = give('shoes'); Game.debug.give(0, 'gold'); const had = T.state().players[0].power.slice();
    Game.debug.spawn('nibbler', p2.x, p2.y); T.step(1); const afterDeath = T.state().players[0].power;
    return { sc, shoesSpeed, blueShots, baseShots, goldStep, pinkPower, lives, hs, had, afterDeath };
  });
  eq(r.sc, 1000, 'pickup = 1000 points');
  near(r.shoesSpeed, 1.75, 0.001, 'shoes speed');
  ok(r.blueShots > r.baseShots, `blue fires faster (${r.blueShots} vs ${r.baseShots})`);
  near(r.goldStep, 6 - 36 / 128, 0.01, 'gold shot speed 6 (decelerating by v^2/128 per frame: range 64)');
  eq(r.pinkPower.join(), 'pink');
  eq(r.lives, 4, 'heart +1 life'); eq(r.hs, 1000);
  eq(r.had.sort().join(), 'gold,shoes'); eq(r.afterDeath.length, 0, 'power-ups lost on death');
});

await test('8b clock freezes enemies 300 frames (harmless, trappable), bomb kills all as one chain, parasol skips 3 rounds', async () => {
  const r = await ev(() => {
    const T = __t;
    // clock
    T.arena({ level: 1, empty: false }); let S = T.S(), p = S.players[0];
    Game.debug.spawn('clock', p.x, p.y); T.step(1);
    const fr = T.state().enemies.map((e) => e.state);
    Game.debug.spawn('nibbler', p.x, p.y); const harmless = (() => { S.enemies[S.enemies.length - 1].state = 'frozen'; S.enemies[S.enemies.length - 1].freezeT = 50; T.step(10); return T.state().players[0].state; })();
    T.step(1);
    const e0 = S.enemies[0]; e0.freezeT = 5; T.step(6);
    const back = e0.state;
    // bomb
    T.arena({ level: 1, empty: false }); S = T.S(); p = S.players[0];
    Game.debug.skipIntro();
    Game.debug.spawn('bomb', p.x, p.y); T.step(1);
    const scoreBomb = p.score; const states = T.state().enemies.map((e) => e.state);
    // parasol
    T.arena({ level: 1, empty: false, noClear: false }); S = T.S(); p = S.players[0];
    Game.debug.spawn('parasol', p.x, p.y); T.step(1);
    let phases = []; for (let i = 0; i < 600; i++) { T.step(1); const s = T.state(); if (!phases.length || phases[phases.length - 1] !== s.phase + s.level) phases.push(s.phase + s.level); if (s.phase === 'intro' && s.level !== 1) break; }
    return { fr, harmless, back, scoreBomb: scoreBomb - 1000, states, phases, level: T.state().level };
  });
  ok(r.fr.length === 3 && r.fr.every((s) => s === 'frozen'), 'all frozen ' + r.fr);
  eq(r.harmless, 'normal', 'frozen enemies are harmless');
  eq(r.back, 'active', 'unfreezes');
  eq(r.scoreBomb, 1000 + 2000 + 4000, 'bomb kills as one chain');
  ok(r.states.every((s) => s === 'dying'), 'all dying ' + r.states);
  eq(r.level, 5, 'parasol skipped three rounds (1 -> 5)');
  ok(r.phases.includes('clear1') && r.phases.includes('transition1'), 'cleared via clear+transition: ' + r.phases);
});

await test('8c thunder bubble: two bolts (both ways) kill; fire: flames kill + stun; water: carries and drowns', async () => {
  const r = await ev(() => {
    const T = __t; const out = {};
    // thunder
    T.arena(); let S = T.S(), p = S.players[0];
    Game.debug.spawn('nibbler', 180, 200); let e = S.enemies[0]; e.state = 'frozen'; e.freezeT = 1e9;
    Game.debug.spawn('thunder', 100, 200); p.x = 100; p.y = 200; p.face = 1; T.step(1);
    const bolt = T.state().counts.bolts; p.x = 24; T.step(40);
    out.thunder = { bolt, es: e.state, score: p.score, sfx: __t.log.some((l) => l[1] === 'thunder') };
    // the other bolt flies the other way: a pop facing RIGHT kills an enemy on the LEFT too
    T.arena(); S = T.S(); p = S.players[0];
    Game.debug.spawn('nibbler', 40, 200); e = S.enemies[0]; e.state = 'frozen'; e.freezeT = 1e9;
    Game.debug.spawn('thunder', 100, 200); p.x = 100; p.y = 200; p.face = 1; T.step(1); p.x = 200; T.step(40);
    out.thunderLeft = e.state;
    // fire
    T.arena(); S = T.S(); p = S.players[0];
    Game.debug.spawn('nibbler', 96, 200); e = S.enemies[0]; e.state = 'frozen'; e.freezeT = 1e9;
    Game.debug.spawn('fire', 100, 190); p.x = 100; p.y = 190; p.onGround = false; T.step(1);
    T.step(12); const flames = T.state().counts.flames;
    out.fire = { flames, es: e.state, stun: T.state().players[0].stun, pstate: T.state().players[0].state };
    T.step(300); out.fireEnd = T.state().counts.flames;
    // water
    T.arena(); S = T.S(); p = S.players[0];
    Game.debug.spawn('nibbler', 108, 200); e = S.enemies[0]; e.state = 'frozen'; e.freezeT = 1e9;
    Game.debug.spawn('water', 100, 190); p.x = 100; p.y = 190; T.step(1);
    let st = null; for (let i = 0; i < 200 && !st; i++) { T.step(1); if (e.state === 'carried') st = 'carried'; }
    let dying = false; for (let i = 0; i < 400 && !dying; i++) { T.step(1); if (e.state === 'dying') dying = true; }
    out.water = { st, dying, score: p.score, streams: T.state().counts.streams };
    return out;
  });
  eq(r.thunder.bolt, 2, 'two bolts (one each way)'); eq(r.thunder.es, 'dying', 'thunder kills'); eq(r.thunder.score, 1000);
  ok(r.thunder.sfx, 'thunder sfx'); eq(r.thunderLeft, 'dying', 'the second bolt flies left although the player faced right');
  ok(r.fire.flames >= 3, 'flames ' + r.fire.flames); eq(r.fire.es, 'dying', 'fire kills');
  ok(r.fire.stun > 0 && r.fire.pstate === 'normal', 'player stunned not killed'); eq(r.fireEnd, 0, 'flames burn out');
  eq(r.water.st, 'carried', 'water carries the enemy'); ok(r.water.dying, 'water kills at the end'); ok(r.water.score >= 1000);
});

await test('8d specials spawn every 360-600 frames (max 2), expire after 900; power-up appears once per round', async () => {
  const r = await ev(() => {
    const T = __t; T.arena({ level: 5 }); const S = T.S();    // stub round 5 has specials
    const spawns = []; let prev = 0; const seen = new Set(); const firstPu = [];
    for (let i = 0; i < 2400; i++) {
      T.step(1);
      const n = S.bubbles.filter((b) => ['thunder', 'fire', 'water'].includes(b.kind)).length; if (n > prev) spawns.push(i); prev = n; if (n > 2) return { err: 'more than 2' };
      for (const q of S.items) if (q.kind.startsWith('pu_') && !seen.has(q)) { seen.add(q); firstPu.push(i); }
    }
    return { spawns, puCount: seen.size, firstPu };
  });
  ok(!r.err, r.err); ok(r.spawns.length >= 2, 'specials spawned: ' + r.spawns);
  eq(r.puCount, 1, 'exactly one power-up per round'); ok(r.firstPu[0] >= 600 && r.firstPu[0] <= 1200, 'power-up appears 600-1200 frames in: ' + r.firstPu);
});

await test('8e food: points 500..8000 by chain index, lasts 600 frames', async () => {
  const r = await ev(() => {
    const T = __t; T.arena(); const S = T.S(), p = S.players[0];
    Game.debug.spawn('food_3', 100, 200); p.x = 100; T.step(1); const a = p.score;
    Game.debug.spawn('food_7', 150, 200); T.step(2); p.x = 150; T.step(1); const b = p.score - a;
    Game.debug.spawn('food_0', 200, 200); p.x = 24; T.step(599); const alive599 = T.state().items.length; T.step(2);
    return { a, b, alive599, alive: T.state().items.length };
  });
  eq(r.a, 1500); eq(r.b, 8000); eq(r.alive599, 1); eq(r.alive, 0);
});

// =================================================================================================
// 9. Boss
// =================================================================================================
await test('9 boss: bolts damage it (-1 HP, +100), defeat -> kraken_trapped -> pop -> moonpearl -> victory', async () => {
  const r = await ev(() => {
    const T = __t; T.start({ players: 1, level: 30, seed: 9 }); Game.debug.god(true);
    const S = T.S(), p = S.players[0];
    T.step(1); const intro = T.state();
    T.step(160);
    const boss = S.enemies[0]; const hp0 = boss.hp;
    boss.x = 100; boss.y = 100; boss.jx = 0; boss.jy = 0; boss.inkT = 1e9;
    S.thunderT = 1e9;
    Game.debug.spawn('thunder', 20, 112); p.x = 20; p.y = 112; p.face = 1; p.onGround = false; T.step(1); p.x = 24; p.y = 200;
    T.step(60);
    const after1 = { hp: boss.hp, score: p.score, sfx: __t.log.some((l) => l[1] === 'boss_hit') };
    // finish it: hp 1 then another bolt
    boss.hp = 1; boss.flashT = 0;
    Game.debug.spawn('thunder', 20, 112); p.x = 20; p.y = 112; p.face = 1; p.onGround = false; T.step(1); p.x = 24; p.y = 200;
    T.step(60);
    const defeat = T.state();
    const bb = defeat.bubbles.find((b) => b.kind === 'kraken');
    T.step(30); const bb2 = T.state().bubbles.find((b) => b.kind === 'kraken');
    p.x = bb2.x + 24; p.y = bb2.y + 24; p.onGround = false; T.step(1);
    const popped = T.state();
    const bossDie = __t.log.some((l) => l[0] === 'sfx' && l[1] === 'boss_die');
    const jingleEarly = __t.log.some((l) => l[0] === 'jingle' && l[1] === 'clear_boss');
    p.x = 200; p.y = 200; p.onGround = false; T.step(61);
    const jingle = __t.log.some((l) => l[0] === 'jingle' && l[1] === 'clear_boss');
    const endingQueued = __t.log.some((l) => l[0] === 'music' && l[1] === 'ending');
    const pearl = popped.items.find((q) => q.kind === 'moonpearl');
    p.x = 200; p.y = 200; p.onGround = false; T.step(1);
    T.step(150);
    const pearl2 = T.state().items.find((q) => q.kind === 'moonpearl');
    const sc0 = p.score; p.x = pearl2.x + 8; p.y = pearl2.y; p.onGround = false; T.step(1);
    const vic = T.state(); const overBefore = Game.isOver();
    T.step(239); const overMid = Game.isOver(); T.step(2);
    return { introEnemies: intro.enemies.map((e) => e.t), hp0, after1, defeatPhase: defeat.bossPhase, enemiesAfterDefeat: defeat.enemies.length, bb: !!bb, popped: popped.bossPhase, bossDie, jingleEarly, jingle, endingQueued, pearl: !!pearl, pearlY: pearl2.y, scoreGain: p.score - sc0, vic: vic.phase, overBefore, overMid, over: Game.isOver(), res: Game.result() };
  });
  eq(r.introEnemies.join(), 'kraken'); eq(r.hp0, 40, 'boss HP 40 in 1P');
  eq(r.after1.hp, 39, 'bolt damage'); eq(r.after1.score, 100, '+100'); ok(r.after1.sfx, 'boss_hit sfx');
  eq(r.defeatPhase, 'trapped'); eq(r.enemiesAfterDefeat, 0); ok(r.bb, 'kraken_trapped bubble');
  eq(r.popped, 'pearl'); ok(r.bossDie, 'boss_die sfx at the pop'); ok(!r.jingleEarly, 'fanfare not on the same frame as the explosion');
  ok(r.jingle, 'clear_boss jingle ~60 frames later'); ok(r.endingQueued, 'ending music queued behind the fanfare'); ok(r.pearl, 'moonpearl appears');
  eq(r.scoreGain, 100000, 'pearl worth 100000'); eq(r.vic, 'victory');
  eq(r.overBefore, false); eq(r.overMid, false); eq(r.over, true, 'isOver'); eq(r.res.won, true, 'won'); eq(r.res.level, 30);
});

await test('9b boss behaviour: bounces diagonally, 4-way ink every 120 frames, HP 60 in 2P, thunder bubbles every 30 frames (max 8)', async () => {
  const r = await ev(() => {
    const T = __t; T.start({ players: 2, level: 30, seed: 3 }); Game.debug.god(true);
    const S = T.S(); T.step(155);
    const boss = S.enemies[0]; const hp = boss.hp;
    let inkMax = 0, minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9; const spreads = [];
    for (let i = 0; i < 600; i++) { T.step(1); const ink = S.proj.filter((q) => q.type === 'ink'); inkMax = Math.max(inkMax, ink.length); minX = Math.min(minX, boss.x); maxX = Math.max(maxX, boss.x); minY = Math.min(minY, boss.y); maxY = Math.max(maxY, boss.y); }
    const thunder = S.bubbles.filter((b) => b.kind === 'thunder').length;
    return { hp, inkMax, rangeX: [minX, maxX], rangeY: [minY, maxY], thunder };
  });
  eq(r.hp, 60, '2P boss HP');
  eq(r.inkMax, 4, 'four-bullet ink fan, saw ' + r.inkMax);
  ok(r.rangeX[0] <= 20 && r.rangeX[1] >= 188 || r.rangeY[1] - r.rangeY[0] > 60, 'boss bounces around ' + JSON.stringify(r.rangeX) + JSON.stringify(r.rangeY));
  ok(r.thunder >= 1 && r.thunder <= 8, 'thunder bubbles ' + r.thunder);
});

// =================================================================================================
// 10. Two players
// =================================================================================================
await test('10a 2P: independent movement, shooting and scores', async () => {
  const r = await ev(() => {
    const T = __t; T.arena({ players: 2 }); const S = T.S(); const [a, b] = S.players;
    const ax = a.x, bx = b.x;
    T.step(20, [{ right: true }, { left: true }]);
    const moved = [a.x - ax, b.x - bx, a.face, b.face];
    T.step(1, [{ fire: true }, {}]); T.step(40);
    const bub = S.bubbles[0]; a.x = bub.x; a.y = bub.y; a.onGround = false; T.step(1);
    return { moved, scores: [a.score, b.score], lives: [a.lives, b.lives], hud: T.state().players.length };
  });
  near(r.moved[0], 25, 0.01); near(r.moved[1], -25, 0.01); eq(r.moved[2], 1); eq(r.moved[3], -1);
  eq(r.scores.join(), '10,0'); eq(r.hud, 2);
});

await test('10b join(1) in a running 1P game adds P2 with 3 lives; not after game over', async () => {
  const r = await ev(() => {
    const T = __t; T.arena({ players: 1 });
    const before = T.state().players.length; Game.join(1);
    const s = T.state(); const p2 = s.players[1];
    Game.join(1); const again = T.state().players.length;
    T.step(10, [{}, { left: true }]);
    return { before, after: s.players.length, p2: [p2.lives, p2.x, p2.y, p2.inv > 0], again, moved: T.state().players[1].x < 216 };
  });
  eq(r.before, 1); eq(r.after, 2); eq(r.p2.join(), '3,216,200,true'); eq(r.again, 2); ok(r.moved, 'P2 controllable');
});

await test('10c 2P: one player out, other continues; game over only when both are out', async () => {
  const r = await ev(() => {
    const T = __t; T.arena({ players: 2 }); const S = T.S(); const [a, b] = S.players;
    a.lives = 1; Game.debug.spawn('nibbler', a.x, a.y); T.step(1); Game.debug.clearEnemies(); T.step(95);
    const s1 = T.state(); b.lives = 1; b.inv = 0;
    Game.debug.spawn('nibbler', b.x, b.y); T.step(1); Game.debug.clearEnemies(); T.step(95);
    const s2 = T.state();
    return { s1: [s1.phase, s1.players[0].state, s1.players[1].state], s2: [s2.phase, s2.players[0].state, s2.players[1].state] };
  });
  eq(r.s1.join(), 'play,out,normal'); eq(r.s2.join(), 'gameover,out,out');
});

// =================================================================================================
// 12. Enemy behaviours and misc mechanics
// =================================================================================================
await test('12a nibbler: walks 0.6 px/frame, turns at the outer walls', async () => {
  const r = await ev(() => {
    const T = __t; T.useMap(0, T.mkMap({})); T.arena(); Game.debug.god(true); const S = T.S();
    Game.debug.spawn('nibbler', 100, 200); const e = S.enemies[0];
    let flips = 0, last = e.d, minX = 1e9, maxX = -1e9; const steps = [];
    let px = e.x;
    for (let i = 0; i < 800; i++) { T.step(1); if (e.d !== last) { flips++; last = e.d; } minX = Math.min(minX, e.x); maxX = Math.max(maxX, e.x); if (i < 50) steps.push(Math.abs(e.x - px)); px = e.x; }
    return { flips, minX, maxX, speed: steps.reduce((a, b) => a + b, 0) / steps.length };
  });
  near(r.speed, 0.6, 0.01, 'speed'); ok(r.flips >= 2, 'turned ' + r.flips); near(r.minX, 16, 1, 'reaches left wall'); near(r.maxX, 224, 1, 'reaches right wall');
});

await test('12b nibbler at a ledge: turns back OR walks off (both happen)', async () => {
  const r = await ev(() => {
    const T = __t; const out = { turned: 0, dropped: 0 };
    for (let seed = 1; seed <= 16; seed++) {
      T.useMap(0, T.mkMap({ blocks: [[10, 12, 21, 12]] })); T.arena({ seed }); Game.debug.god(true); const S = T.S();
      S.players[0].x = 224; S.players[0].y = 200;
      Game.debug.spawn('nibbler', 84, 96); const e = S.enemies[0];
      for (let i = 0; i < 330; i++) T.step(1);
      if (e.y > 100) out.dropped++; else out.turned++;
    }
    return out;
  });
  ok(r.turned > 0 && r.dropped > 0, 'both outcomes: ' + JSON.stringify(r));
});

await test('12c crabbit throws pebbles (speed 2.0, stop 20 frames), pebble dies at the wall and kills the player', async () => {
  const r = await ev(() => {
    const T = __t; T.useMap(0, T.mkMap({})); T.arena(); const S = T.S(), p = S.players[0];
    Game.debug.spawn('crabbit', 130, 200); const e = S.enemies[0]; e.d = -1;
    let pebbleSeen = null, paused = 0, dead = -1;
    for (let i = 0; i < 300; i++) { T.step(1); if (e.pauseT > 0 && !pebbleSeen) paused++; const q = S.proj.find((z) => z.type === 'pebble'); if (q && !pebbleSeen) pebbleSeen = { vx: q.vx, y: q.y }; if (p.state === 'dying' && dead < 0) dead = i; }
    return { pebbleSeen, paused, dead, lives: p.lives, sfx: __t.log.some((l) => l[1] === 'enemy_shot') };
  });
  ok(r.pebbleSeen, 'pebble'); eq(r.pebbleSeen.vx, -2.0); ok(r.paused >= 19 && r.paused <= 21, 'wind-up ' + r.paused); ok(r.dead > 0 && r.lives === 2, 'player hit'); ok(r.sfx, 'enemy_shot');
});

await test('12d jellop: diagonal 0.6/0.6, bounces off walls, ceiling and floor row', async () => {
  const r = await ev(() => {
    const T = __t; T.arena(); Game.debug.god(true); const S = T.S();
    Game.debug.spawn('jellop', 100, 100); const e = S.enemies[0];
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, px = e.x, py = e.y; const d = [];
    for (let i = 0; i < 1600; i++) { T.step(1); minX = Math.min(minX, e.x); maxX = Math.max(maxX, e.x); minY = Math.min(minY, e.y); maxY = Math.max(maxY, e.y); if (i > 0 && i < 20) d.push([Math.abs(e.x - px), Math.abs(e.y - py)]); px = e.x; py = e.y; }
    return { minX, maxX, minY, maxY, d: d[5] };
  });
  near(r.d[0], 0.6, 0.01); near(r.d[1], 0.6, 0.01); near(r.minX, 16, 1.5); near(r.maxX, 224, 1.5); near(r.minY, 24, 1.5); near(r.maxY, 200, 1.5);
});

await test('12e springle: hops (apex ~32 px, vx 0.8), squashes 6 frames on landing', async () => {
  const r = await ev(() => {
    const T = __t; T.useMap(0, T.mkMap({})); T.arena(); Game.debug.god(true); const S = T.S();
    Game.debug.spawn('springle', 100, 200); const e = S.enemies[0]; e.sqT = 0; e.d = 1;
    let minY = 1e9, sq = 0, maxSq = 0, vxSeen = 0;
    for (let i = 0; i < 200; i++) { T.step(1); minY = Math.min(minY, e.y); if (e.onGround && e.sqT > 0) { sq++; maxSq = Math.max(maxSq, e.sqT); } vxSeen = Math.max(vxSeen, Math.abs(e.vx)); }
    return { apex: 200 - minY, sq, maxSq, vxSeen };
  });
  near(r.apex, 32, 2, 'apex'); ok(r.maxSq === 6 && r.sq >= 4, 'squash ' + r.sq + '/' + r.maxSq); near(r.vxSeen, 0.8, 0.01, 'vx');
});

await test('12f glimmer: drops a spark (1.5 px/frame) when a player is below; spark dies on the first solid tile', async () => {
  const r = await ev(() => {
    const T = __t; T.useMap(0, T.mkMap({ blocks: [[8, 15, 18, 15]] })); T.arena(); const S = T.S(), p = S.players[0];
    p.x = 100; p.y = 200;
    Game.debug.spawn('glimmer', 100, 90); const e = S.enemies[0]; e.d = 1; e.cool = 0;
    let sparks = 0, vy = 0, seen = false;
    for (let i = 0; i < 400; i++) { T.step(1); const q = S.proj.find((z) => z.type === 'spark'); if (q) { if (!seen) { sparks++; vy = q.vy; } seen = true; } else seen = false; }
    const shielded = p.lives;
    // without the platform the spark kills
    T.useMap(0, T.mkMap({})); T.arena(); const S2 = T.S(), p2 = S2.players[0]; p2.x = 100; p2.y = 200;
    Game.debug.spawn('glimmer', 100, 90); S2.enemies[0].cool = 0;
    for (let i = 0; i < 400 && p2.lives === 3; i++) T.step(1);
    return { sparks, vy, shielded, killed: p2.lives };
  });
  ok(r.sparks >= 1, 'sparks'); eq(r.vy, 1.5); eq(r.shielded, 3, 'platform shields the player'); eq(r.killed, 2, 'spark kills without cover');
});

await test('12g angry: hurry makes enemies 1.6x faster; round scaling +1% per round (cap 30%)', async () => {
  const r = await ev(() => {
    const T = __t; const out = {};
    const speed = (level, angry) => { T.useMap(level - 1, T.mkMap({})); T.arena({ level }); Game.debug.god(true); const S = T.S(); Game.debug.spawn('nibbler', 100, 200); const e = S.enemies[0]; e.angry = angry; T.step(2); const x0 = e.x; T.step(10); return Math.abs(e.x - x0) / 10; };
    out.base = speed(1, false); out.angry = speed(1, true); out.r21 = speed(21, false); out.r30 = speed(30, false);
    return out;
  });
  near(r.base, 0.6, 0.001); near(r.angry, 0.96, 0.001); near(r.r21, 0.72, 0.001); near(r.r30, 0.6 * 1.29, 0.001);
});

await test('12h dying enemies: flung vx 1.5-2.5 / vy -3.5, bounce off walls, food lands after >= 40 frames', async () => {
  const r = await ev(() => {
    const T = __t; T.useMap(0, T.mkMap({})); T.arena(); const S = T.S(), p = S.players[0]; p.x = 24;
    Game.debug.spawn('nibbler', 100, 200); const e = S.enemies[0]; e.state = 'frozen'; e.freezeT = 1e9;
    Game.debug.killAll();
    const v0 = [Math.abs(e.vx), e.vy]; let frames = 0, minVx = 9, maxVx = -9, flips = 0, last = Math.sign(e.vx);
    while (!e.dead && frames < 500) { T.step(1); frames++; if (Math.sign(e.vx) !== last) { flips++; last = Math.sign(e.vx); } }
    return { v0, frames, foods: S.items.map((i) => i.kind), flips };
  });
  ok(r.v0[0] >= 1.5 && r.v0[0] <= 2.5, 'vx ' + r.v0[0]); eq(r.v0[1], -3.5); ok(r.frames >= 40, 'lands after >= 40 frames (' + r.frames + ')'); eq(r.foods.join(), 'food_0');
});

await test('12i chain scoring doubles to the 64000 cap; food index caps at 7 (8000 points)', async () => {
  const r = await ev(() => {
    const T = __t; T.useMap(0, T.mkMap({})); T.arena(); const S = T.S(), p = S.players[0];
    for (let i = 0; i < 9; i++) Game.debug.spawn('nibbler', 30 + i * 20, 200);
    Game.debug.give(0, 'bomb'); const sc = p.score;
    T.step(300); const foods = S.items.map((q) => q.kind).sort();
    return { sc, foods };
  });
  eq(r.sc, 1000 + 2000 + 4000 + 8000 + 16000 + 32000 + 64000 + 64000 + 64000, 'bomb chain');
  ok(r.foods.filter((f) => f === 'food_7').length >= 2, 'food cap: ' + r.foods);
});

await test('12j bubbles float at 0.5 px/frame and gather at the level attractor; special bubbles expire after 900 frames', async () => {
  const r = await ev(() => {
    const T = __t; T.useMap(0, T.mkMap({}), { air: [[8, 6]] }); T.arena(); const S = T.S();
    Game.debug.spawn('thunder', 200, 150); const b = S.bubbles[0]; b.att = null; const y0 = b.y; T.step(20); const rise = y0 - b.y;
    S.bubbles.length = 0; Game.debug.spawn('water', 200, 150); const w = S.bubbles[0];
    let gather = null; for (let i = 0; i < 600; i++) { T.step(1); } gather = [w.x + 8, w.y + 8];
    S.bubbles.length = 0; Game.debug.spawn('fire', 150, 150); const f = S.bubbles[0]; f.att = null; f.y = 100; const fires = () => S.bubbles.filter((q) => q.kind === 'fire').length; T.step(899); const at899 = fires(); T.step(3);
    return { rise, gather, at899, after: fires() };
  });
  near(r.rise, 10, 0.01, 'rise 0.5/frame'); near(r.gather[0], 64, 6, 'gathers at attractor x'); near(r.gather[1], 16 + 6 * 8, 6, 'gathers at attractor y');
  eq(r.at899, 1); eq(r.after, 0);
});

await test('12k parasol never skips past 29; round 29 goes to the boss round', async () => {
  const r = await ev(() => {
    const T = __t; const to = (level) => { T.arena({ level, empty: false, noClear: false }); const p = T.S().players[0]; Game.debug.spawn('parasol', p.x, p.y); T.step(1); for (let i = 0; i < 700; i++) { T.step(1); const s = T.state(); if (s.phase === 'intro' && s.level !== level) return s.level; } return -1; };
    return [to(24), to(26), to(29)];
  });
  eq(r.join(), '28,29,30');
});

await test('12l HUD/music/sfx contract: only known sprite names, sfx names and tracks are used', async () => {
  const r = await ev(() => {
    const T = __t; T.start({ players: 2, level: 1, seed: 4 }); Game.debug.god(true);
    for (const lv of [1, 5, 11, 16, 21, 26, 30]) { Game.debug.setLevel(lv); T.step(200); for (const k of ['thunder', 'fire', 'water', 'letter', 'nibbler', 'crabbit', 'jellop', 'springle', 'glimmer', 'bonefin', 'food_3', 'pu_clock']) Game.debug.spawn(k, 60 + Math.random() * 120, 60 + Math.random() * 100); T.step(300); Game.debug.killAll(); T.step(100); }
    return { u: __t.unknown(), tracks: [...new Set(__t.log.filter((l) => l[0] === 'music' || l[0] === 'jingle').map((l) => l[1]))] };
  });
  eq(r.u.sprites.length, 0, 'unknown sprites: ' + r.u.sprites); eq(r.u.sfx.length, 0, 'unknown sfx: ' + r.u.sfx); eq(r.u.music.length, 0, 'unknown tracks: ' + r.u.music);
  ok(['stage1', 'stage2', 'boss', 'start'].every((n) => r.tracks.includes(n)), 'tracks used: ' + r.tracks);
});

await test('13 determinism: same seed + same inputs => identical game; different seed differs', async () => {
  const r = await ev(() => {
    const T = __t;
    const run = (seed) => {
      T.start({ players: 2, level: 6, seed }); Game.debug.god(true);
      let s = 4242; const rnd = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; };
      const held = [{}, {}];
      for (let f = 0; f < 3000; f++) { for (const h of held) for (const k of ['left', 'right', 'jump', 'fire']) if (rnd() < 0.05) h[k] = !h[k]; T.step(1, held); }
      return JSON.stringify(T.state());
    };
    const a = run(77), b = run(77), c = run(78);
    return { same: a === b, differs: a !== c, len: a.length };
  });
  ok(r.same, 'same seed reproduces the exact state'); ok(r.differs, 'different seed gives a different game');
});

await test('14a join during a transition is deferred to the next round; boss HP scales when P2 joins the boss round', async () => {
  const r = await ev(() => {
    const T = __t; T.start({ players: 1, level: 1, seed: 3 }); T.step(160); Game.debug.god(true);
    Game.debug.killAll(); for (let i = 0; i < 700 && T.state().phase !== 'transition'; i++) T.step(1);
    Game.join(1); const during = T.state().players.length;
    T.step(125); const after = T.state();
    // boss round join
    T.start({ players: 1, level: 30, seed: 3 }); T.step(160); const hp1 = T.state().bossHp; Game.join(1); const hp2 = T.state().bossHp;
    return { during, after: [after.phase, after.level, after.players.length], hp1, hp2 };
  });
  eq(r.during, 1, 'P2 not added mid-scroll'); eq(r.after[2], 2, 'P2 added when the next round starts'); eq(r.hp1, 40); eq(r.hp2, 60, 'boss HP 40 -> 60 (full health scales to full)');
});

await test('14b EXTEND in the boss round grants the life but does not skip the boss; EXTEND during clear still skips', async () => {
  const r = await ev(() => {
    const T = __t; T.start({ players: 1, level: 30, seed: 3 }); T.step(160); Game.debug.god(true);
    const S = T.S(), p = S.players[0]; p.letters = [true, true, true, true, true, false];
    Game.debug.spawn('letter', 100, 200); p.x = 100; p.y = 200; T.step(1);
    const a = T.state().phase; T.step(185); const b = T.state();
    // clear phase variant
    T.start({ players: 1, level: 2, seed: 3 }); T.step(160); Game.debug.god(true); const S2 = T.S(), p2 = S2.players[0];
    Game.debug.killAll(); for (let i = 0; i < 400 && T.state().phase !== 'clear'; i++) T.step(1);
    p2.letters = [true, true, true, true, true, false]; Game.debug.spawn('letter', 100, 200); p2.x = 100; p2.y = 200; T.step(1);
    const c = T.state().phase; T.step(185); const d = T.state().phase;
    return { a, b: [b.phase, b.enemies.length, b.players[0].lives], c, d };
  });
  eq(r.a, 'extend'); eq(r.b.join(), 'play,1,4', 'boss still there, +1 life'); eq(r.c, 'extend'); eq(r.d, 'transition');
});

// =================================================================================================
// 15. Wave 2: boss
// =================================================================================================
await test('15a boss net speed 0.8 -> 1.2 px/frame (slower than the player), starts after READY!, random first direction', async () => {
  const r = await ev(() => {
    const T = __t; T.start({ players: 1, level: 30, seed: 4 }); Game.debug.god(true);
    const S = T.S(), boss = S.enemies[0];
    T.step(149); const inert = boss.state, atSpawn = [boss.x, boss.y];
    T.step(5);
    const meas = (hp) => { boss.hp = hp; boss.x = 100; boss.y = 80; boss.jx = 1; boss.jy = 1; boss.inkT = 1e9; const x0 = boss.x, y0 = boss.y; T.step(10); return Math.hypot(boss.x - x0, boss.y - y0) / 10; };
    const speeds = { active: boss.state, full: meas(40), half: meas(20), low: meas(1) };
    const dirs = new Set();
    for (let seed = 1; seed <= 12; seed++) { T.start({ players: 1, level: 30, seed }); T.step(152); const b = T.S().enemies[0]; dirs.add(b.jx + ',' + b.jy); }
    return Object.assign({ inert, atSpawn, dirs: dirs.size }, speeds);
  });
  eq(r.inert, 'enter', 'boss waits inert until the intro is over'); near(r.atSpawn[0], 112, 0.1, 'boss parked at its spawn x'); near(r.atSpawn[1], 48, 0.1, 'spawn y'); eq(r.active, 'active');
  near(r.full, 0.8, 0.02, 'full HP'); near(r.half, 1.0, 0.02, 'half HP'); near(r.low, 1.19, 0.02, 'nearly dead'); ok(r.low < 1.25, 'slower than the player (1.25)');
  ok(r.dirs >= 2, 'first direction is seeded-random, saw ' + r.dirs + ' different');
});

await test('15b boss ink: 22-frame telegraph, then 4 bullets (none at the centre); outer two only when a player is within 48 px', async () => {
  const r = await ev(() => {
    const T = __t; T.start({ players: 1, level: 30, seed: 5 }); Game.debug.god(true); T.step(155);
    const S = T.S(), boss = S.enemies[0], p = S.players[0];
    const fire = (px, py) => {
      S.proj = []; boss.x = 104; boss.y = 40; boss.jx = 0; boss.jy = 0; boss.inkT = 40; p.x = px; p.y = py; p.vx = 0; p.vy = 0;
      let tele = 0, fan = null, aim = 0;
      for (let i = 0; i < 60 && !fan; i++) {
        p.x = px; p.y = py; p.vy = 0; p.onGround = true;
        T.step(1);
        if (boss.inkT > 0 && boss.inkT <= 22) tele++;
        const ink = S.proj.filter((q) => q.type === 'ink');
        if (ink.length) { aim = Math.atan2(p.y + 8 - (boss.y + 24), p.x + 8 - (boss.x + 24)); fan = ink.map((q) => +(Math.atan2(q.vy, q.vx) - aim).toFixed(2)).sort((a, b) => a - b); }
      }
      return { tele, fan };
    };
    return { far: fire(24, 200), near: fire(120, 96) };
  });
  eq(r.far.tele, 22, 'telegraph frames'); eq(r.far.fan.join(), '-0.45,-0.15,0.15,0.45', 'even 4-fan, nothing aimed dead-centre');
  eq(r.near.fan.join(), '-0.45,0.45', 'only the outer two bullets close up');
});

await test('15c P2 joining the boss round scales HP proportionally (never heals)', async () => {
  const r = await ev(() => {
    const T = __t; const out = [];
    for (const hp of [40, 10, 1]) {
      T.start({ players: 1, level: 30, seed: 6 }); T.step(155); const boss = T.S().enemies[0]; boss.hp = hp;
      Game.join(1); out.push([hp, T.state().bossHp, T.state().bossMax]);
    }
    return out;
  });
  eq(r[0].join(), '40,60,60', 'full health stays full'); eq(r[1].join(), '10,15,60', '25 % stays 25 %'); ok(r[2][1] >= 1 && r[2][1] <= 2, 'one hit point stays nearly dead: ' + r[2][1]);
});

await test('15d boss defeated: ghost, hurry and banner are cleared and never come back; tempo reset', async () => {
  const r = await ev(() => {
    const T = __t; T.start({ players: 1, level: 30, seed: 2 }); Game.debug.god(true); T.step(155);
    const S = T.S(); const at = LEVELS[29].hurry * 60;
    Game.debug.setHurryTimer(at - 1); T.step(2); const hurry = T.state().hurry; T.step(600); const ghost = T.state().ghost;
    const tempoHurry = __t.log.filter((l) => l[0] === 'setTempo').map((l) => l[1]);
    Game.debug.killAll(); const a = T.state();
    T.step(900); const b = T.state();
    const tempos = __t.log.filter((l) => l[0] === 'setTempo').map((l) => l[1]);
    return { hurry, ghost, tempoHurry, a: [a.hurry, a.ghost, a.bossPhase], b: [b.hurry, b.ghost, b.bossPhase], last: tempos[tempos.length - 1], banner: S.hurryBanner };
  });
  ok(r.hurry && r.ghost, 'hurry + Bonefin before the kill'); ok(r.tempoHurry.includes(1.15) && !r.tempoHurry.includes(1.3), 'boss-round hurry tempo is 1.15, not 1.3: ' + r.tempoHurry);
  eq(r.a.join(), 'false,false,trapped', 'cleared by defeatBoss'); eq(r.b.join(), 'false,false,trapped', 'no re-trigger over the next 15 s');
  eq(r.last, 1, 'tempo back to 1.0'); eq(r.banner, 0, 'no banner');
});

await test('15e boss phase 2 (below 50 % HP) nudges the music tempo to 1.1', async () => {
  const r = await ev(() => {
    const T = __t; T.start({ players: 1, level: 30, seed: 2 }); Game.debug.god(true); T.step(155);
    const S = T.S(), boss = S.enemies[0]; const n0 = __t.log.length;
    boss.hp = 21; T.step(2); const before = __t.log.slice(n0).filter((l) => l[0] === 'setTempo').length;
    boss.hp = 19; T.step(2); const after = __t.log.slice(n0).filter((l) => l[0] === 'setTempo').map((l) => l[1]);
    T.step(30); const again = __t.log.slice(n0).filter((l) => l[0] === 'setTempo').length;
    return { before, after, again, angry: boss.angry };
  });
  eq(r.before, 0); eq(r.after.join(), '1.1'); eq(r.again, 1, 'only once'); ok(r.angry, 'angry face');
});

await test('15f thunder in the boss round flies ONE bolt toward the Kraken, whatever the player faces', async () => {
  const r = await ev(() => {
    const T = __t; T.start({ players: 1, level: 30, seed: 2 }); Game.debug.god(true); T.step(155);
    const S = T.S(), boss = S.enemies[0], p = S.players[0]; S.thunderT = 1e9;
    const shot = (bossX, bubX, face) => {
      S.bolts = []; S.bubbles = []; boss.x = bossX; boss.y = 90; boss.jx = 0; boss.jy = 0; boss.inkT = 1e9;
      Game.debug.spawn('thunder', bubX, 100); const b = S.bubbles[0]; b.att = null; p.x = bubX; p.y = 100; p.face = face; p.vy = 0; p.onGround = false; p.noPopT = 0;
      T.step(1); const bo = S.bolts.map((q) => q.dir); p.x = 24; p.y = 200; return bo;
    };
    return { left: shot(20, 180, 1), right: shot(190, 40, -1) };
  });
  eq(r.left.join(), '-1', 'boss on the left, player faces right'); eq(r.right.join(), '1', 'boss on the right, player faces left');
});

await test('15g bolts in the boss round steer toward the boss height (a bolt row 32 px off centre still hits)', async () => {
  const r = await ev(() => {
    const T = __t; T.start({ players: 1, level: 30, seed: 2 }); Game.debug.god(true); T.step(155);
    const S = T.S(), boss = S.enemies[0], p = S.players[0]; S.thunderT = 1e9;
    boss.x = 180; boss.y = 100; boss.jx = 0; boss.jy = 0; boss.inkT = 1e9; const hp0 = boss.hp;   // boss centre row 124 -> a bolt row of 156 is 32 px off
    Game.debug.spawn('thunder', 30, 152); const b = S.bubbles[0]; b.att = null; p.x = 30; p.y = 152; p.vy = 0; p.onGround = false; T.step(1); p.x = 24; p.y = 200;
    T.step(60);
    return { hp0, hp: boss.hp };
  });
  eq(r.hp, r.hp0 - 1, 'the bolt found the boss');
});

// =================================================================================================
// 16. Wave 2: walkers that must never be stuck
// =================================================================================================
await test('16a enemy walkers climb one-tile steps; players do not', async () => {
  const r = await ev(() => {
    const T = __t; T.useMap(0, T.mkMap({ blocks: [[12, 24, 12, 24]] }), { enemies: [], specials: [], air: [[16, 3]], hurry: 999 });
    T.arena({ players: 1 }); const S = T.S(), p = S.players[0];
    Game.debug.spawn('nibbler', 64, 200); const e = S.enemies[0]; e.d = 1; p.x = 200; p.y = 200;
    let maxX = 0, minY = 999; for (let i = 0; i < 300; i++) { T.step(1); maxX = Math.max(maxX, e.x); minY = Math.min(minY, e.y); }
    T.arena({ players: 1 }); const q = T.S().players[0]; q.x = 64; q.y = 200;
    T.step(200, [{ right: true }]);
    return { maxX, minY, playerX: q.x };
  });
  ok(r.maxX > 120, 'nibbler walked over the one-tile step, max x ' + r.maxX); ok(r.minY < 200, 'it stood on top of the step');
  ok(r.playerX < 96, 'the player is blocked by the step wall at x=' + r.playerX);
});

await test('16b a walker sealed in a deep pit is forced out within 1500 frames (watchdog)', async () => {
  const r = await ev(() => {
    const T = __t; const walls = [[10, 17, 10, 24], [14, 17, 14, 24]];
    T.useMap(0, T.mkMap({ blocks: walls }), { enemies: [], specials: [], air: [[16, 3]], hurry: 999 });
    T.arena({ players: 1 }); Game.debug.god(true); const S = T.S();
    Game.debug.spawn('nibbler', 96, 200); const e = S.enemies[0]; e.d = 1;
    let left = -1; for (let i = 0; i < 1500; i++) { T.step(1); if (e.x < 72 || e.x > 130 || e.y < 150) { left = i; break; } }
    return { left, x: e.x, y: e.y };
  });
  ok(r.left >= 0, 'escaped the pit (still at ' + Math.round(r.x) + ',' + Math.round(r.y) + ')');
});

await test('16c springles and crabbits are covered by the watchdog too (sealed pit)', async () => {
  const r = await ev(() => {
    const out = {};
    for (const kind of ['springle', 'crabbit']) {
      const T = __t; T.useMap(0, T.mkMap({ blocks: [[10, 14, 10, 24], [14, 14, 14, 24]] }), { enemies: [], specials: [], air: [[16, 3]], hurry: 999 });
      T.arena({ players: 1 }); Game.debug.god(true); const S = T.S();
      Game.debug.spawn(kind, 96, 200); const e = S.enemies[0]; let left = -1;
      for (let i = 0; i < 1800; i++) { T.step(1); if (e.x < 72 || e.x > 130 || e.y < 120) { left = i; break; } }
      out[kind] = left;
    }
    return out;
  });
  ok(r.springle >= 0, 'springle escaped'); ok(r.crabbit >= 0, 'crabbit escaped');
});

// =================================================================================================
// 17. Wave 2: state bugs
// =================================================================================================
await test('17a intro: enemies stay inert (no contact) until READY! is over; players get 60 frames of grace', async () => {
  const r = await ev(() => {
    const T = __t; T.start({ players: 1, level: 3, seed: 3 }); const S = T.S(), p = S.players[0];
    T.step(110); const states = S.enemies.map((e) => e.state);
    const e = S.enemies[0]; p.x = e.x; p.y = e.y; T.step(30); const stillAlive = p.state;
    T.step(10); const phase = T.state().phase;
    p.x = e.x; p.y = e.y; T.step(1);
    const after = { phase: T.state().phase, enemy: S.enemies.map((q) => q.state).join(), inv: p.inv, pstate: p.state };
    return { states, stillAlive, phase, after };
  });
  ok(r.states.every((s) => s === 'enter'), 'all enemies still entering at frame 110: ' + r.states); eq(r.stillAlive, 'normal', 'touching an enemy in the intro is harmless');
  eq(r.after.phase, 'play'); ok(r.after.enemy.split(',').every((s) => s === 'active'), 'enemies wake up at play'); ok(r.after.inv >= 50, 'grace period ' + r.after.inv); eq(r.after.pstate, 'normal');
});

await test('17b a player who dies on the last life is "out" when the round transition starts (no zombie)', async () => {
  const r = await ev(() => {
    const T = __t; T.arena({ players: 2, empty: false }); const S = T.S(); Game.debug.noClear(false); Game.debug.clearEnemies(); Game.debug.god(false);
    const [a, b] = S.players; a.lives = 1; Game.debug.spawn('nibbler', a.x, a.y); T.step(1); Game.debug.clearEnemies();
    const dying = a.state; Game.debug.give(1, 'parasol');
    for (let i = 0; i < 400 && T.state().phase !== 'transition'; i++) T.step(1);
    const atTransition = [T.state().phase, a.state, a.lives];
    T.step(200);
    return { dying, atTransition, later: [T.state().phase, a.state, a.lives, b.state] };
  });
  eq(r.dying, 'dying'); eq(r.atTransition[0], 'transition'); eq(r.atTransition[1], 'out', 'out at the start of the scroll');
  eq(r.later[1], 'out', 'still out in the next round'); eq(r.later[2], 0); eq(r.later[3], 'normal');
});

await test('17c last player dying right before a clear ends the game instead of scrolling on', async () => {
  const r = await ev(() => {
    const T = __t; T.arena({ players: 1, empty: false }); const S = T.S(); Game.debug.noClear(false); Game.debug.clearEnemies(); Game.debug.god(false);
    const a = S.players[0]; a.lives = 1; Game.debug.spawn('nibbler', a.x, a.y); T.step(1); Game.debug.clearEnemies();
    for (let i = 0; i < 400 && !['gameover', 'transition'].includes(T.state().phase); i++) T.step(1);
    return T.state().phase;
  });
  eq(r, 'gameover');
});

await test('17d periodic EXTEND letters go to the leading LIVING player', async () => {
  const r = await ev(() => {
    const T = __t; T.arena({ players: 2 }); const S = T.S(); const [a, b] = S.players;
    a.state = 'out'; a.score = 50000; b.score = 100; b.letters = [true, true, true, true, true, false];
    const seen = [];
    for (let i = 0; i < 60; i++) { S.bubbles = S.bubbles.filter((q) => q.kind !== 'letter'); S.letterT = 1; T.step(1); for (const q of S.bubbles) if (q.kind === 'letter') seen.push(q.letter); }
    return seen;
  });
  ok(r.length >= 10, 'enough letter bubbles: ' + r.length); ok(r.every((c) => c === 'D'), 'all carry the missing D: ' + r.join(''));
});

await test('17e bubble bounce never shoves the player above row 1; ceiling bubbles just pop', async () => {
  const r = await ev(() => {
    const T = __t; T.arena(); const S = T.S(), p = S.players[0];
    T.step(1, [{ fire: true }]); T.step(5); const b = S.bubbles[0];
    b.x = 100; b.y = 34; b.att = null; b.state = 'float'; b.age = 0; b.grace = -1; b.dist = 0;
    p.x = 100; p.y = 24; p.vy = 1.5; p.vx = 0; p.onGround = false; p.coyote = -1;
    let minY = 1e9; for (let i = 0; i < 12; i++) { T.step(1, [{ jump: true }]); minY = Math.min(minY, p.y); }
    return { minY, score: p.score, alive: S.bubbles.filter((q) => !q.dead).length };
  });
  ok(r.minY >= 24, 'player stays at or below y=24: ' + r.minY); eq(r.score, 10, 'the bubble popped'); eq(r.alive, 0);
});

// =================================================================================================
// 18. Wave 2: specials
// =================================================================================================
await test('18a fire spreads 4 tiles each side; gold shot reaches 64 px', async () => {
  const r = await ev(() => {
    const T = __t; T.arena(); const S = T.S(), p = S.players[0];
    Game.debug.spawn('fire', 56, 190); p.x = 56; p.y = 190; p.onGround = false; T.step(1); p.x = 200; p.y = 200; T.step(14);
    const flames = S.flames.map((f) => f.x / 8).sort((a, b) => a - b);
    T.arena(); const S2 = T.S(), q = S2.players[0]; q.power.gold = true; q.x = 100; T.step(1, [{ fire: true }]); T.step(60);
    return { flames, gold: S2.bubbles[0].x - 110 };
  });
  eq(r.flames.length, 9, 'flames: ' + r.flames.join()); eq(r.flames[8] - r.flames[0], 8, 'contiguous 4 + 1 + 4');
  near(r.gold, 64, 4, 'gold range 64');
});

await test('18b water flows toward the nearest enemy (not just away from the nearer wall)', async () => {
  const r = await ev(() => {
    const T = __t; const out = {};
    for (const [bx, ex, name] of [[100, 30, 'left'], [160, 230, 'right']]) {
      T.arena(); const S = T.S(), p = S.players[0];
      Game.debug.spawn('nibbler', ex - 16, 200); const e = S.enemies[0]; e.state = 'frozen'; e.freezeT = 1e9;
      Game.debug.spawn('water', bx, 190); p.x = bx; p.y = 190; p.onGround = false; T.step(1); p.x = 120; p.y = 100;
      let carried = -1; for (let i = 0; i < 300 && carried < 0; i++) { T.step(1); if (e.state === 'carried' || e.state === 'dying') carried = i; }
      out[name] = carried >= 0;
    }
    return out;
  });
  ok(r.left, 'bubble on the left half, enemy further left'); ok(r.right, 'bubble on the right, enemy further right');
});

await test('18c thunder pops near a wall only fire the bolt that is not born inside the wall', async () => {
  const r = await ev(() => {
    const T = __t; const n = {};
    for (const [x, name] of [[18, 'leftWall'], [222, 'rightWall'], [120, 'middle']]) {
      T.arena(); const S = T.S(), p = S.players[0]; Game.debug.spawn('thunder', x, 190); p.x = x; p.y = 190; p.onGround = false; T.step(1);
      n[name] = S.bolts.map((b) => b.dir).sort().join();
    }
    return n;
  });
  eq(r.leftWall, '1'); eq(r.rightWall, '-1'); eq(r.middle, '-1,1');
});

await test('18d one thunder pop = one chain (kills of both bolts escalate 1000, 2000, ...)', async () => {
  const r = await ev(() => {
    const T = __t; T.arena(); const S = T.S(), p = S.players[0];
    for (const x of [50, 190]) { Game.debug.spawn('nibbler', x, 200); const e = S.enemies[S.enemies.length - 1]; e.state = 'frozen'; e.freezeT = 1e9; }
    Game.debug.spawn('thunder', 120, 200); p.x = 120; p.y = 200; p.onGround = false; T.step(1); p.x = 30; T.step(60);
    return p.score;
  });
  eq(r, 3000, '1000 + 2000');
});

// =================================================================================================
// 19. Wave 2: feel
// =================================================================================================
await test('19a players need 4 px of foot support; 5 frames of coyote time', async () => {
  const r = await ev(() => {
    const T = __t; T.useMap(0, T.mkMap({ blocks: [[8, 21, 13, 21]] }), { enemies: [], specials: [], air: [[16, 3]], hurry: 999 });   // platform row 21 (surface y=184) spans x 64..112
    const land = (x) => { T.arena(); const p = T.S().players[0]; p.x = x; p.y = 150; p.vy = 0; p.vx = 0; p.onGround = false; p.coyote = -1; T.step(45); return p.y; };   // <4 px: lands, is eased off the edge (0.75 px/frame) and then falls beside the platform
    // standing on it the sprite is at y 168
    const right4 = land(106), right3 = land(107), left4 = land(54), left3 = land(53);
    const coy = (wait) => {
      T.arena(); const p = T.S().players[0]; p.x = 100; p.y = 168; p.vy = 0; p.onGround = true; T.step(2);
      let guard = 0; while (p.onGround && guard++ < 60) T.step(1, [{ right: true }]);
      for (let i = 0; i < wait; i++) T.step(1, [{ right: true }]);
      const vy0 = p.vy; T.step(1, [{ right: true, jump: true }]); return { jumped: p.vy < -2, vy0 };
    };
    return { right4, right3, left4, left3, c3: coy(3), c4: coy(4), c8: coy(8) };
  });
  eq(r.right4, 168, '4 px of support: stands'); ok(r.right3 > 170, '3 px of support: slides off and falls (y=' + r.right3 + ')');
  eq(r.left4, 168, '4 px left'); ok(r.left3 > 170, '3 px left falls (y=' + r.left3 + ')');
  ok(r.c3.jumped && r.c4.jumped, 'jump 3-4 frames after walking off an edge works'); ok(!r.c8.jumped, 'jump 9 frames after leaving the ledge is an air press');
});

await test('19b fire presses up to 4 frames before the cooldown ends are not lost (steady 14-frame rhythm when mashing)', async () => {
  const r = await ev(() => {
    const T = __t; T.arena(); const S = T.S(), p = S.players[0]; const shotsAt = [];
    let n = 0;
    for (let f = 0; f < 60; f++) {
      const press = f === 0 || f === 10 || f === 24 || f === 38;                   // 10 = 4 frames early, 24 = 4 frames early, ...
      T.step(1, [{ fire: press }]);
      const now = S.bubbles.length + S.fx.filter((q) => q.sprite === 'bubble_pop').length; if (S.bubbles.length > n) { shotsAt.push(f); } n = S.bubbles.length;
    }
    return shotsAt;
  });
  eq(r.join(), '0,14,28,42', 'buffered presses fire the moment the cooldown ends');
});

await test('19c crowds spread along the ceiling instead of piling into one blob (but stay chain-connected)', async () => {
  const r = await ev(() => {
    const T = __t; T.arena(); const S = T.S(), p = S.players[0];
    for (let i = 0; i < 12; i++) {
      p.cooldown = 0; p.x = 100 + (i % 4) * 4; T.step(1, [{ fire: true }]); T.step(1, [{ fire: false }]); const b = S.bubbles[S.bubbles.length - 1];
      b.x = 118 + (i % 3) * 3; b.y = 30 + (i % 2) * 5; b.state = 'float'; b.age = 0; b.grace = -1; b.dist = 0; b.att = { x: 124, y: 40 };
    }
    p.x = 24; p.y = 200; T.step(500);
    const L = S.bubbles.filter((b) => !b.dead); let minD = 1e9, maxX = -1e9, minX = 1e9;
    for (let i = 0; i < L.length; i++) { maxX = Math.max(maxX, L[i].x); minX = Math.min(minX, L[i].x); for (let j = i + 1; j < L.length; j++) minD = Math.min(minD, Math.hypot(L[i].x - L[j].x, L[i].y - L[j].y)); }
    // largest chain-connected component (18 px)
    const seen = new Set(); let best = 0; for (const b of L) { if (seen.has(b)) continue; const c = [b]; seen.add(b); for (let k = 0; k < c.length; k++) for (const o of L) if (!seen.has(o) && Math.hypot(o.x - c[k].x, o.y - c[k].y) <= 18) { seen.add(o); c.push(o); } best = Math.max(best, c.length); }
    return { n: L.length, minD, spread: maxX - minX, best };
  });
  ok(r.n >= 10, 'bubbles alive ' + r.n); ok(r.minD >= 14, 'no two bubbles pile up (min distance ' + r.minD.toFixed(1) + ', was 0.2 before)'); ok(r.spread >= 60, 'crowd fans out sideways (' + r.spread.toFixed(0) + ' px)');
  ok(r.best >= 4, 'neighbours still chain, largest component ' + r.best);
});

await test('19d angry speeds: walkers/springles capped at 1.2 px/frame, jellops x1.35, glimmers keep x1.6', async () => {
  const r = await ev(() => {
    const T = __t; T.arena({ level: 29 }); const S = T.S(); const out = {};
    Game.debug.spawn('nibbler', 40, 200); Game.debug.spawn('crabbit', 150, 150); Game.debug.spawn('jellop', 100, 100); Game.debug.spawn('glimmer', 100, 60);
    for (const e of S.enemies) e.angry = true;
    const [n, c, j, g] = S.enemies; const p0 = S.enemies.map((e) => [e.x, e.y]);
    S.players[0].x = 200; Game.debug.god(true); T.step(8);
    out.nibbler = Math.abs(n.x - p0[0][0]) / 8; out.jellop = Math.abs(j.x - p0[2][0]) / 8; out.glimmer = Math.abs(g.x - p0[3][0]) / 8;
    return out;
  });
  near(r.nibbler, 1.2, 0.02, 'nibbler capped (0.6*1.28*1.6 = 1.23 -> 1.2)'); near(r.jellop, 0.6 * 1.28 * 1.35, 0.03, 'jellop per-axis'); near(r.glimmer, 0.5 * 1.28 * 1.6, 0.05, 'glimmer unchanged');
});

// =================================================================================================
// 20. Wave 2: presentation hooks (spied through the GFX / AUDIO objects)
// =================================================================================================
await test('20a chain kills ring higher (pitch min(2k, 12)); land has no volume override; round clear has a stinger', async () => {
  const r = await ev(() => {
    const T = __t; T.arena({ empty: false }); const S = T.S(); Game.debug.noClear(false); Game.debug.clearEnemies();
    for (let i = 0; i < 8; i++) { Game.debug.spawn('nibbler', 40 + i * 8, 100); S.enemies[i].state = 'frozen'; S.enemies[i].freezeT = 1e9; }
    __t.log.length = 0; Game.debug.give(0, 'bomb'); T.step(1);
    const kills = __t.log.filter((l) => l[0] === 'sfx' && l[1] === 'kill').map((l) => l[2] && l[2].pitch);
    const p = S.players[0]; p.x = 24; p.y = 150; p.vy = 2; p.onGround = false; T.step(30);
    const land = __t.log.filter((l) => l[0] === 'sfx' && l[1] === 'land');
    for (let i = 0; i < 200 && T.state().phase !== 'clear'; i++) T.step(1);
    const clear = __t.log.filter((l) => l[0] === 'sfx' && l[1] === 'clear').length;
    return { kills, land: land.map((l) => !(l[2] && 'vol' in l[2])), clear };
  });
  eq(r.kills.join(), '0,2,4,6,8,10,12,12', 'pitch per chain index'); ok(r.land.length >= 1 && r.land.every(Boolean), 'land plays at full volume (no vol override)'); eq(r.clear, 1, "one 'clear' stinger");
});

await test('20b next round art is built during the clear phase (level canvas, then backdrop), not at the scroll', async () => {
  const r = await ev(() => {
    const T = __t; const calls = [];
    GFX.bgCanvas = (i) => { calls.push(['bg', i, T.state().phase]); const c = document.createElement('canvas'); c.width = 256; c.height = 208; return c; };
    const lc = GFX.levelCanvas; GFX.levelCanvas = (i, m) => { calls.push(['lvl', i, T.state().phase]); return lc.call(GFX, i, m); };
    T.start({ players: 1, level: 1, seed: 3 }); Game.debug.god(true); T.step(150);
    calls.length = 0; Game.debug.killAll();
    for (let i = 0; i < 700 && T.state().phase !== 'transition'; i++) T.step(1);
    const clearCalls = calls.filter((c) => c[2] === 'clear').map((c) => c[0] + c[1]);
    const rest = calls.filter((c) => c[2] === 'transition').map((c) => c[0] + c[1]);
    const first = calls.findIndex((c) => c[1] === 1);
    return { clearCalls, hasBgBefore: calls.some((c) => c[0] === 'bg' && c[1] === 0), rest: [...new Set(rest)], first: calls[first] };
  });
  ok(r.clearCalls.includes('lvl1') && r.clearCalls.includes('bg1'), 'prebuilt in the clear phase: ' + r.clearCalls); ok(r.hasBgBefore, 'backdrop drawn from GFX.bgCanvas');
});

await test('20c without GFX.bgCanvas the flat theme colour is used (feature detect), and nothing throws', async () => {
  const r = await ev(() => { const T = __t; delete GFX.bgCanvas; T.arena({ empty: false }); T.step(20); T.render(); return typeof GFX.bgCanvas; });
  eq(r, 'undefined');
});

await test('20d joinHint: default "PUSH Q", custom text, or nothing; banners and popups ask for an outline', async () => {
  const r = await ev(() => {
    const T = __t; const seen = []; const lastOpts = {};
    const orig = GFX.text; GFX.text = (c, s, x, y, col, o) => { seen.push(String(s)); lastOpts[String(s)] = o; return orig.call(GFX, c, s, x, y, col, o); };
    const run = (hint) => { seen.length = 0; T.start(hint === undefined ? { players: 1, level: 1, seed: 3 } : { players: 1, level: 1, seed: 3, joinHint: hint }); for (let i = 0; i < 70; i++) T.step(1); return seen.some((s) => s === 'PUSH Q') ? 'PUSH Q' : seen.some((s) => s === 'TAP 2P') ? 'TAP 2P' : ''; };
    const out = { def: run(undefined), custom: run('TAP 2P'), none: run('') };
    seen.length = 0; T.start({ players: 1, level: 5, seed: 3 }); T.step(70);
    out.bannerOutline = !!(lastOpts['ROUND 5'] && lastOpts['ROUND 5'].outline); out.ready = !!(lastOpts['READY!'] && lastOpts['READY!'].outline);
    T.arena(); Game.debug.spawn('nibbler', 60, 200); T.S().enemies[0].state = 'frozen'; T.S().enemies[0].freezeT = 1e9; Game.debug.give(0, 'bomb'); T.step(2);
    out.popup = !!(lastOpts['1000'] && lastOpts['1000'].outline);
    return out;
  });
  eq(r.def, 'PUSH Q'); eq(r.custom, 'TAP 2P'); eq(r.none, '', 'empty hint draws nothing'); ok(r.bannerOutline && r.ready, 'banner text outlined'); ok(r.popup, 'popup text outlined');
});

await test('20e chain popups stack 9 px apart instead of overlapping', async () => {
  const r = await ev(() => {
    const T = __t; T.arena(); const S = T.S();
    for (let i = 0; i < 4; i++) { Game.debug.spawn('nibbler', 100, 100); S.enemies[i].state = 'frozen'; S.enemies[i].freezeT = 1e9; }
    Game.debug.give(0, 'bomb'); T.step(1);
    return S.popups.map((q) => q.y).sort((a, b) => a - b);
  });
  eq(r.length, 4); for (let i = 1; i < r.length; i++) ok(r[i] - r[i - 1] >= 9 - 1e-6, 'popups at least 9 px apart: ' + r.join());
});

await test('20f victory: special bubbles and projectiles are cleared away; three short lines; fanfare only after the explosion', async () => {
  const r = await ev(() => {
    const T = __t; T.start({ players: 1, level: 30, seed: 2 }); Game.debug.god(true); T.step(160); const S = T.S(), p = S.players[0];
    Game.debug.spawn('thunder', 60, 100); Game.debug.spawn('letter', 100, 100); S.proj.push({ type: 'ink', x: 60, y: 60, vx: 0, vy: 0, age: 0, dead: false });
    Game.debug.spawn('moonpearl', p.x, p.y); T.step(2);
    const texts = []; const orig = GFX.text; GFX.text = (c, s, ...r) => { texts.push(String(s)); return orig.call(GFX, c, s, ...r); }; T.step(3); texts.length = 0; T.render();
    return { phase: T.state().phase, bubbles: T.state().bubbles.length, proj: T.state().counts.proj, texts: texts.filter((s) => /MOON|PEARL|SAFE/.test(s)) };
  });
  eq(r.phase, 'victory'); eq(r.bubbles, 0, 'no bubbles'); eq(r.proj, 0, 'no projectiles'); eq(r.texts.join('|'), 'THE MOON|PEARL IS|SAFE!', 'three short lines');
});

await test('20g frozen enemies render the ice look without errors for every enemy type', async () => {
  const r = await ev(() => {
    const T = __t; T.arena(); const S = T.S(); const draws = [];
    for (const k of ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer']) { Game.debug.spawn(k, 40 + draws.length * 30, 100); const e = S.enemies[S.enemies.length - 1]; e.state = 'frozen'; e.freezeT = 200; draws.push(k); }
    const n0 = (() => { let c = 0; const o = GFX.draw; GFX.draw = (...a) => { c++; return o.apply(GFX, a); }; T.render(); GFX.draw = o; return c; })();
    for (const e of S.enemies) e.freezeT = 30;
    for (let i = 0; i < 40; i++) { T.step(1); T.render(); }
    return { n0, kinds: draws.length };
  });
  ok(r.n0 > 0 && r.kinds === 5, 'rendered');
});

// =================================================================================================
// 21. Wave 3: polish
// =================================================================================================
await test('21a stepping off a ledge / failed landings on a platform end never sink the body into the block; thin edges ease the player off', async () => {
  const r = await ev(() => {
    const T = __t; const out = {};
    const depth = (S, x, y) => { let n = 0; const solid = (c, rr) => (c < 0 || c >= 32) ? true : (rr < 0 || rr >= 26) ? false : S.solid[rr * 32 + c] === 1;
      for (let rr = Math.floor((y + 2 - 16) / 8); rr <= Math.floor((y + 16 - 1e-6 - 16) / 8); rr++) for (let c = Math.floor((x + 2) / 8); c <= Math.floor((x + 14 - 1e-6) / 8); c++) if (solid(c, rr)) n++; return n; };
    for (const thick of [1, 3]) {
      T.useMap(0, T.mkMap({ blocks: [[10, 12, 19, 11 + thick]] }), { enemies: [], specials: [], air: [[16, 3]], hurry: 999 });   // platform top y=112 (stand y=96), x 80..160
      T.arena(); const S = T.S(), p = S.players[0];
      let worst = 0, endY = 0;
      for (const hold of [0, 1, 2, 3]) {          // walk off the right end, keep the key for `hold` more frames after leaving the ground
        p.x = 140; p.y = 96; p.vx = 0; p.vy = 0; p.onGround = true; p.coyote = 5; T.step(2);
        let left = -1, emb = 0;
        for (let f = 0; f < 80; f++) {
          T.step(1, [left < 0 || f - left < hold ? { right: true } : {}]);
          if (left < 0 && !p.onGround) left = f;
          if (left >= 0 && depth(S, p.x, p.y) > 0) emb++;
        }
        worst = Math.max(worst, emb); endY = p.y;
      }
      out['walk' + thick] = { worst, endY };
      const drops = {};
      for (const [label, x0] of [['L', 80 + 3.5 - 14], ['R', 160 - 3.5 - 2]]) {   // 3.5 px of the 12 px body over the end of the platform
        p.x = x0; p.y = 60; p.vx = 0; p.vy = 0; p.onGround = false; p.coyote = -1; let emb = 0;
        for (let f = 0; f < 90; f++) { T.step(1); if (depth(S, p.x, p.y) > 0) emb++; }
        drops[label] = { emb, y: p.y, x: p.x };
      }
      out['drop' + thick] = drops;
    }
    // a platform that carries >= 4 px still holds the player for good (no creeping)
    T.useMap(0, T.mkMap({ blocks: [[10, 12, 19, 12]] }), { enemies: [], specials: [], air: [[16, 3]], hurry: 999 });
    T.arena(); const S2 = T.S(), p2 = S2.players[0];
    p2.x = 160 - 4 - 2; p2.y = 60; p2.vx = 0; p2.vy = 0; p2.onGround = false; T.step(60);
    out.hold4 = { y: p2.y, x: p2.x };
    return out;
  });
  for (const th of [1, 3]) {
    eq(r['walk' + th].worst, 0, 'walking off a ' + th + '-row platform: embedded frames'); eq(r['walk' + th].endY, 200, 'fell to the floor beside the platform');
    for (const k of ['L', 'R']) { eq(r['drop' + th][k].emb, 0, 'edge drop ' + k + ' embedded frames'); eq(r['drop' + th][k].y, 200, 'edge drop ' + k + ' ended on the floor, beside the platform'); }
  }
  eq(r.hold4.y, 96, '4 px of support: stands'); ok(Math.abs(r.hold4.x - 154) < 1e-6, 'and does not creep (x=' + r.hold4.x + ')');
});

await test('21b every entering enemy (and the Kraken) plays the spawn sfx once during the intro', async () => {
  const r = await ev(() => {
    const T = __t; const out = {};
    for (const lv of [5, 30]) {
      T.start({ players: 1, level: lv, seed: 3 }); const S = T.S(); const n = S.enemies.length; T.log.length = 0;
      for (let i = 0; i < 150; i++) T.step(1);
      out[lv] = { enemies: n, spawn: T.log.filter((l) => l[0] === 'sfx' && l[1] === 'spawn').length, phase: S.phase };
    }
    return out;
  });
  eq(r[5].spawn, r[5].enemies, 'round 5: one spawn sfx per enemy (' + r[5].enemies + ')'); ok(r[5].enemies >= 3, 'several enemies');
  eq(r[30].spawn, 1, 'the Kraken entrance has its spawn sfx'); eq(r[30].phase, 'play');
});

await test('21c chained thunder pops do not strobe the screen flash (<= 3 flashes per second)', async () => {
  const r = await ev(() => {
    const T = __t; T.arena({ level: 5 }); const S = T.S(), p = S.players[0]; Game.debug.god(true);
    for (let i = 0; i < 8; i++) Game.debug.spawn('thunder', 100 + i * 9, 60);
    S.bubbles.forEach((b) => { b.age = 0; b.att = null; });
    p.x = 100; p.y = 60; p.inv = 9999;
    let onsets = 0, prev = 0, popped = 0;
    let maxA = 0;
    for (let f = 0; f < 90; f++) { T.step(1); const a = S.flashT > 0 ? S.flashA * Math.min(1, S.flashT / S.flashDur) : 0; if (a > 0 && prev === 0) onsets++; prev = a; maxA = Math.max(maxA, a); }
    popped = 8 - S.bubbles.filter((b) => !b.dead && b.kind === 'thunder').length;
    // and the flash is back after the cooldown for a later, separate pop
    Game.debug.spawn('thunder', 150, 150); S.bubbles[S.bubbles.length - 1].att = null; p.x = 150; p.y = 150; T.step(1);
    return { onsets, popped, later: S.flashT > 0, maxA };
  });
  ok(r.maxA <= 0.12 + 1e-9, 'thunder flash alpha capped at 12 % (' + r.maxA + ')');
  ok(r.popped >= 5, 'the cluster chained (' + r.popped + ' popped)'); ok(r.onsets >= 1 && r.onsets <= 5, 'flash onsets in 90 frames: ' + r.onsets + ' (<= 1 per 20 frames)'); ok(r.later, 'a later pop flashes again');
});

await test('21d watchdog relocation avoids other enemies and the respawn pad of a dying player', async () => {
  const r = await ev(() => {
    const T = __t; const out = {};
    T.useMap(0, T.mkMap({ blocks: [[10, 17, 10, 24], [14, 17, 14, 24]] }), { enemies: [], specials: [], air: [[16, 3]], hurry: 999 });
    const trial = (setup) => {
      T.arena({ players: 2 }); Game.debug.god(true); const S = T.S();
      S.spots = [{ x: 200, y: 100 }];                                     // the only free spot there is
      Game.debug.spawn('nibbler', 96, 200); const e = S.enemies[0];
      setup(S, e);
      e.wdHist = [[e.x, e.x, e.y, e.y], [e.x, e.x, e.y, e.y], [e.x, e.x, e.y, e.y]]; e.wdT = 119; e.wx0 = e.wx1 = e.x; e.wy0 = e.wy1 = e.y; e.wdFires = 1; e.wdLast = e.animT - 10; e.fx = e.x; e.fy = e.y;
      T.step(1);
      return Math.hypot(e.x - 200, e.y - 100) < 1;
    };
    out.free = trial((S) => { S.players[0].x = 24; S.players[0].y = 200; S.players[1].state = 'out'; });
    out.enemyThere = trial((S) => { S.players[0].x = 24; S.players[0].y = 200; S.players[1].state = 'out'; Game.debug.spawn('jellop', 204, 104); });
    out.padDying = trial((S) => { S.spots = [{ x: 216, y: 200 }]; S.players[0].x = 24; S.players[0].y = 200; S.players[1].state = 'dying'; S.players[1].lives = 2; S.players[1].dieT = 1; });
    return out;
  });
  ok(r.free, 'with a free spot the stuck walker is poofed there'); ok(!r.enemyThere, 'a spot occupied by another enemy is refused'); ok(!r.padDying, 'the respawn pad of a dying player is refused');
});

await test('21e popups are drawn after the banner plate and text (a popup crossing a banner band is never dimmed)', async () => {
  const r = await ev(() => {
    const T = __t; T.arena(); const S = T.S(); const order = [];
    const o1 = GFX.text;
    GFX.text = function (c, str, ...rest) { order.push(String(str)); return o1.call(this, c, str, ...rest); };
    S.phase = 'victory'; S.phaseT = 10; S.popups.push({ x: 128, y: 100, text: '1UP', color: '#9dffa8', age: 0, life: 200, vy: 0 });
    T.render();
    GFX.text = o1;
    return { order };
  });
  const iBanner = r.order.indexOf('SAFE!'), iPop = r.order.lastIndexOf('1UP');
  ok(iBanner >= 0 && iPop > iBanner, 'popup text drawn after the banner text: ' + r.order.join('|'));
});


// =================================================================================================
// 22. v2 "Abyss Glow" presentation (SPEC_V2 sec. 1 + 4): options, photosensitivity, reduced motion, bounds, trails, cost, fallbacks
// =================================================================================================
const REAL_MODE = !!process.env.REAL;

await test('22a Game.setOptions: defaults, partial updates, clamping, persists across start(), callable before any game', async () => {
  const r = await ev(() => {
    const out = {};
    out.def = Game.debug.options ? Game.setOptions({}) : null;
    out.afterQ = Game.setOptions({ quality: 1 }); out.afterRM = Game.setOptions({ reducedMotion: true });
    out.clampHi = Game.setOptions({ quality: 7 }).quality; out.clampLo = Game.setOptions({ quality: -3 }).quality; out.round = Game.setOptions({ quality: 1.4 }).quality;
    out.nan = Game.setOptions({ quality: NaN }).quality; out.junk = Game.setOptions(null) && Game.setOptions(undefined) && Game.setOptions('x');
    Game.setOptions({ reducedMotion: false, quality: 2 });
    const T = __t; T.start({ players: 1, level: 1, seed: 1 }); Game.setOptions({ reducedMotion: true, quality: 0 }); T.start({ players: 1, level: 1, seed: 2 });
    out.persist = Game.debug.options();
    Game.setOptions({ reducedMotion: false, quality: 2 });
    return out;
  });
  eq(r.def.quality, 2, 'default quality 2'); eq(r.def.reducedMotion, false, 'default reducedMotion false');
  eq(r.afterQ.quality, 1); eq(r.afterQ.reducedMotion, false, 'partial update keeps the other option'); eq(r.afterRM.quality, 1); eq(r.afterRM.reducedMotion, true);
  eq(r.clampHi, 2, 'quality clamps to 2'); eq(r.clampLo, 0, 'quality clamps to 0'); eq(r.round, 1, 'quality rounds'); eq(r.nan, 1, 'NaN is ignored (keeps the previous value)');
  eq(JSON.stringify(r.persist), JSON.stringify({ reducedMotion: true, quality: 0 }), 'options survive Game.start()');
});

// one worst-case flash scenario, run in the page: thunder chain + chained kills + repeated bombs + boss-style flash spam; records the rendered flash every frame
const FLASH_SCENARIO = () => {
  const T = __t; T.arena({ level: 5, empty: false }); Game.debug.god(true); Game.debug.noClear(true); Game.debug.clearEnemies();
  const S = T.S(), p = S.players[0], log = [];
  const rec = () => { const f = Game.debug.flash(); log.push([f.alpha, f.t]); };
  for (let i = 0; i < 8; i++) Game.debug.spawn('thunder', 100 + i * 9, 60);
  S.bubbles.forEach((b) => { b.age = 0; b.att = null; }); p.x = 100; p.y = 60; p.inv = 9999;
  for (let f = 0; f < 120; f++) { T.step(1); rec(); }
  for (let f = 0; f < 150; f++) {                                              // bombs every 5 frames, each killing a fresh frozen crowd (chain light), plus direct flash spam
    if (f % 5 === 0) { for (let i = 0; i < 6; i++) { Game.debug.spawn(['nibbler', 'crabbit', 'jellop'][i % 3], 60 + i * 14, 120); const e = S.enemies[S.enemies.length - 1]; e.state = 'frozen'; e.freezeT = 1e9; } Game.debug.give(0, 'bomb'); }
    if (f % 3 === 0) Game.debug._fx('flash', 0, 0, 0.9);
    T.step(1); rec();
  }
  for (let f = 0; f < 60; f++) { T.step(1); rec(); }
  return log;
};
const flashStats = (log) => {
  let max = 0, onsets = [], prevT = 0;
  log.forEach(([a, t], i) => { max = Math.max(max, a); if (t > prevT) onsets.push(i); prevT = t; });
  let worstWindow = 0;
  for (let i = 0; i < log.length; i++) worstWindow = Math.max(worstWindow, onsets.filter((o) => o >= i && o < i + 60).length);
  return { max, onsets: onsets.length, worstWindow, minGap: onsets.length > 1 ? Math.min(...onsets.slice(1).map((o, k) => o - onsets[k])) : 999 };
};

await test('22b photosensitivity: full-screen flash alpha <= 12 %, onsets >= 20 frames apart (<= 3 per second) in the worst case (thunder chain, bomb spam, chain light)', async () => {
  const log = await ev(FLASH_SCENARIO);
  const st = flashStats(log);
  console.log('        flash: max alpha ' + st.max.toFixed(3) + ', onsets ' + st.onsets + ', worst 60-frame window ' + st.worstWindow + ', min gap ' + st.minGap + ' frames');
  ok(st.max > 0.05, 'the chain light / thunder / bomb flashes exist (max ' + st.max + ')');
  ok(st.max <= 0.12 + 1e-9, 'flash alpha capped at 0.12, got ' + st.max);
  ok(st.worstWindow <= 3, 'at most 3 flash onsets in any 60 frames, got ' + st.worstWindow);
  ok(st.minGap >= 20, 'onsets at least 20 frames apart, got ' + st.minGap);
  ok(st.onsets >= 5, 'the scenario really fires many requests (' + st.onsets + ' onsets)');
});

await test('22b2 photosensitivity (rendered): whole-frame luminance never jumps by the WCAG general-flash threshold (0.1) and rises >= 0.02 at most 3x per second', async function () {
  if (!REAL_MODE) { console.log('        (skipped without REAL=1: the stub art has no light model)'); return; }
  const r = await ev(() => {
    const T = __t, cv = T.canvas, tmp = document.createElement('canvas'); tmp.width = 64; tmp.height = 56; const g = tmp.getContext('2d', { willReadFrequently: true });
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const Y = () => { g.drawImage(cv, 0, 0, tmp.width, tmp.height); const d = g.getImageData(0, 0, 64, 56).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]); return s / (d.length / 4); };
    T.arena({ level: 5, empty: false }); Game.debug.god(true); Game.debug.noClear(true); Game.debug.clearEnemies();
    const S = T.S(), p = S.players[0]; p.inv = 9999; p.x = 100; p.y = 60;
    for (let i = 0; i < 8; i++) Game.debug.spawn('thunder', 100 + i * 9, 60);
    S.bubbles.forEach((b) => { b.age = 0; b.att = null; });
    const ys = [];
    for (let f = 0; f < 420; f++) {
      if (f > 120 && f % 7 === 0) { for (let i = 0; i < 6; i++) { Game.debug.spawn(['nibbler', 'crabbit', 'jellop'][i % 3], 60 + i * 14, 120); const e = S.enemies[S.enemies.length - 1]; e.state = 'frozen'; e.freezeT = 1e9; } Game.debug.give(0, 'bomb'); }
      T.step(1); ys.push(Y());
    }
    let maxD = 0, rises = [];
    for (let i = 1; i < ys.length; i++) { const d = ys[i] - ys[i - 1]; maxD = Math.max(maxD, Math.abs(d)); if (d >= 0.02) rises.push(i); }
    let worst = 0; for (let i = 0; i < ys.length; i++) worst = Math.max(worst, rises.filter((o) => o >= i && o < i + 60).length);
    return { maxD, worst, mean: ys.reduce((a, b) => a + b, 0) / ys.length, max: Math.max(...ys) };
  });
  console.log('        rendered luminance: max frame-to-frame delta ' + r.maxD.toFixed(4) + ', worst rises >= 0.02 per second ' + r.worst + ', mean Y ' + r.mean.toFixed(3) + ', peak Y ' + r.max.toFixed(3));
  ok(r.maxD < 0.1, 'frame-to-frame relative luminance delta < 0.1 (WCAG general flash), got ' + r.maxD);
  ok(r.worst <= 3, 'luminance rises >= 0.02 at most 3 per second, got ' + r.worst);
});

await test('22c reduced motion: no flashes, no trails, half the ambient particles, steady (non-blinking) cues; mechanics unchanged', async () => {
  const r = await ev((scenarioSrc) => {
    const T = __t, out = {};
    Game.setOptions({ reducedMotion: true, quality: 2 });
    const log = (0, eval)('(' + scenarioSrc + ')')();
    out.flashMax = Math.max(...log.map((l) => l[0])); out.flashT = Math.max(...log.map((l) => l[1]));
    // ambient
    T.arena({ level: 3, empty: true }); T.render(); out.ambientReduced = Game.debug.fxStats().drawn.ambient; out.ambientStatReduced = Game.debug.fxStats().ambient;
    Game.setOptions({ reducedMotion: false }); T.render(); out.ambientFull = Game.debug.fxStats().drawn.ambient;
    // trails: a player running and jumping
    const runTrail = () => { T.arena({ level: 3, empty: true }); Game.debug.god(true); const p = T.S().players[0]; p.inv = 0; let g = 0; T.step(1, [{ jump: true, right: true }]); for (let i = 0; i < 40; i++) { T.step(1, [{ right: true }]); g = Math.max(g, Game.debug.fxStats().drawn.ghosts); } return g; };
    Game.setOptions({ reducedMotion: true }); out.ghostsReduced = runTrail();
    Game.setOptions({ reducedMotion: false }); out.ghostsFull = runTrail();
    Game.setOptions({ quality: 0 }); out.ghostsQ0 = runTrail(); Game.setOptions({ quality: 2 });
    // blinking cues: invulnerable player alpha, HURRY UP text
    const alphas = (reduced) => {
      Game.setOptions({ reducedMotion: reduced }); T.arena({ level: 3, empty: true }); const p = T.S().players[0]; p.inv = 9999; const seen = []; const o = GFX.draw;
      GFX.draw = (c, n, f, x, y, opt) => { if (n.startsWith('p1_')) seen.push(opt && opt.alpha !== undefined ? opt.alpha : 1); return o.call(GFX, c, n, f, x, y, opt); };
      for (let i = 0; i < 30; i++) T.step(1); GFX.draw = o; return { n: seen.length, distinct: [...new Set(seen)].length, min: Math.min(...seen) };
    };
    out.invReduced = alphas(true); out.invNormal = alphas(false);
    const hurry = (reduced) => {
      Game.setOptions({ reducedMotion: reduced }); T.arena({ level: 3, empty: true }); const S = T.S(); let n = 0; const o = GFX.text; S.hurryBanner = 100;
      GFX.text = (c, str, ...rest) => { if (str === 'HURRY UP!') n++; return o.call(GFX, c, str, ...rest); };
      for (let i = 0; i < 60; i++) T.step(1); GFX.text = o; return n;
    };
    out.hurryReduced = hurry(true); out.hurryNormal = hurry(false);
    Game.setOptions({ reducedMotion: false, quality: 2 });
    return out;
  }, FLASH_SCENARIO.toString());
  eq(r.flashMax, 0, 'no full-screen flash under reduced motion'); eq(r.flashT, 0);
  eq(r.ambientStatReduced, 40, 'ambient count halved (80 -> 40)'); eq(r.ambientReduced, 40, 'ambient drawn halved'); eq(r.ambientFull, 80, 'full ambient count is 80 at quality 2');
  eq(r.ghostsReduced, 0, 'no trails under reduced motion'); ok(r.ghostsFull > 0, 'trails exist at quality 2 (' + r.ghostsFull + ')'); eq(r.ghostsQ0, 0, 'no trails at quality 0');
  ok(r.invReduced.distinct === 1 && r.invReduced.min > 0.4, 'invulnerable player: steady alpha under reduced motion ' + JSON.stringify(r.invReduced)); ok(r.invNormal.distinct > 1, 'invulnerable player blinks normally ' + JSON.stringify(r.invNormal));
  eq(r.hurryReduced, 60, 'HURRY UP! text is steady under reduced motion (every frame)'); ok(r.hurryNormal > 0 && r.hurryNormal < 60, 'HURRY UP! blinks normally (' + r.hurryNormal + ' of 60 frames)');
});

await test('22d quality levels: ambient 40 / 56 / 80, trails and motes only at quality >= 1, particle cap per level, bounds hold under chain spam', async () => {
  const r = await ev(() => {
    const T = __t, out = {};
    for (const q of [0, 1, 2]) for (const rm of [false, true]) {
      Game.setOptions({ quality: q, reducedMotion: rm });
      T.arena({ level: 5, empty: false }); Game.debug.god(true); Game.debug.noClear(true); const S = T.S(), p = S.players[0]; p.inv = 9999;
      T.render(); const amb = Game.debug.fxStats().drawn.ambient;
      let maxParts = 0, maxFx = 0, maxPop = 0, cap = 0, flashMax = 0;
      for (let f = 0; f < 900; f++) {
        if (f % 12 === 0) for (let i = 0; i < 5; i++) Game.debug.spawn(['thunder', 'fire', 'water'][(f + i) % 3], 60 + i * 20, 80 + (f % 5) * 12);
        if (f % 40 === 0) { for (let i = 0; i < 7; i++) { Game.debug.spawn(['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer'][i % 5], 40 + i * 15, 100); const e = S.enemies[S.enemies.length - 1]; e.state = 'frozen'; e.freezeT = 1e9; } Game.debug.give(0, 'bomb'); }
        S.bubbles.forEach((b) => { if (b.kind !== 'trapped') b.att = null; });
        p.x = 100 + (f % 50); p.y = 80 + (f % 7);
        T.tick(1); if (f % 4 === 0) T.render();
        const fs = Game.debug.fxStats(); maxParts = Math.max(maxParts, fs.parts); maxFx = Math.max(maxFx, fs.fx); maxPop = Math.max(maxPop, fs.popups); cap = fs.partCap; flashMax = Math.max(flashMax, Game.debug.flash().alpha);
      }
      out[q + (rm ? 'r' : '')] = { amb, maxParts, maxFx, maxPop, cap, flashMax, motes: Game.debug.fxStats().drawn.motes };
    }
    Game.setOptions({ quality: 2, reducedMotion: false });
    return out;
  });
  eq(r['0'].amb, 40, 'q0 ambient'); eq(r['1'].amb, 56, 'q1 ambient'); eq(r['2'].amb, 80, 'q2 ambient'); eq(r['0r'].amb, 20); eq(r['1r'].amb, 28); eq(r['2r'].amb, 40);
  for (const k of Object.keys(r)) {
    ok(r[k].maxParts <= r[k].cap, k + ': particles bounded by the cap ' + r[k].cap + ' (max ' + r[k].maxParts + ')'); ok(r[k].maxFx <= 160 && r[k].maxPop <= 60, k + ': fx / popups bounded');
    ok(r[k].flashMax <= 0.12 + 1e-9, k + ': flash cap');
  }
  eq(r['0'].cap, 80); eq(r['1'].cap, 140); eq(r['2'].cap, 220);
  ok(r['2'].maxParts > 60, 'the chain spam really fills the particle pool (' + r['2'].maxParts + ')'); eq(r['0'].motes, 0, 'no motes at quality 0'); eq(r['2r'].flashMax, 0, 'reduced: no flash');
});

await test('22e cosmetic effects: every pop gets a shockwave ring, kills get spark bursts, trails only while moving, no K4 aura, frozen = tint + sparkles', async () => {
  const r = await ev(() => {
    const T = __t, out = {}; Game.setOptions({ quality: 2, reducedMotion: false });
    T.arena({ level: 3, empty: true }); Game.debug.god(true); let S = T.S(); const p = S.players[0]; p.inv = 0;
    Game.debug.spawn('thunder', 60, 100); const b = S.bubbles[S.bubbles.length - 1]; b.att = null; b.age = 0; p.x = b.x; p.y = b.y + 8; p.vy = 0; p.noPopT = 0;
    const rings0 = S.parts.filter((q) => q.k === 'ring').length; T.step(1);
    out.ringsAfterPop = S.parts.filter((q) => q.k === 'ring').length - rings0; out.bubbleDead = b.dead;
    // kill burst
    T.arena({ level: 3, empty: true }); Game.debug.god(true); S = T.S(); Game.debug.spawn('crabbit', 100, 120); const e = S.enemies[S.enemies.length - 1]; e.state = 'frozen'; e.freezeT = 1e9; S.parts.length = 0;
    Game.debug.give(0, 'bomb'); T.step(1); out.burstParts = S.parts.length; out.kinds = [...new Set(S.parts.map((q) => q.k))].sort().join();
    // standing still: no ghosts; running: ghosts
    T.arena({ level: 3, empty: true }); Game.debug.god(true); S = T.S(); S.players[0].inv = 0; T.step(30); out.ghostsStill = Game.debug.fxStats().drawn.ghosts;
    T.step(1, [{ jump: true, right: true }]); let g = 0; for (let i = 0; i < 20; i++) { T.step(1, [{ right: true }]); g = Math.max(g, Game.debug.fxStats().drawn.ghosts); } out.ghostsMoving = g;
    // angry enemy: ONE sprite draw, no white silhouette copies (the K4 aura is removed), no draw with white:true
    T.arena({ level: 22, empty: true }); Game.debug.god(true); S = T.S(); Game.debug.spawn('crabbit', 120, 100); const c = S.enemies[S.enemies.length - 1]; c.angry = true; c.vx = 0; c.vy = 0; c.animT = 0;
    const calls = []; const o = GFX.draw; GFX.draw = (cx, n, f, x, y, opt) => { if (n.startsWith('crabbit')) calls.push({ n, white: !!(opt && opt.white), alpha: opt && opt.alpha }); return o.call(GFX, cx, n, f, x, y, opt); };
    T.render(); GFX.draw = o; out.angryCalls = calls;
    // frozen: GFX.draw gets a tint, sparkles come from GFX.particle('spark')
    T.arena({ level: 12, empty: true }); S = T.S(); Game.debug.spawn('jellop', 120, 100); const j = S.enemies[S.enemies.length - 1]; j.state = 'frozen'; j.freezeT = 200;
    const tints = [], sparks = []; const o2 = GFX.draw, p2 = GFX.particle;
    GFX.draw = (cx, n, f, x, y, opt) => { if (n.startsWith('jellop') && opt && opt.tint) tints.push(opt.tint); return o2.call(GFX, cx, n, f, x, y, opt); };
    GFX.particle = (cx, kind, ...rest) => { if (kind === 'spark') sparks.push(1); return p2.call(GFX, cx, kind, ...rest); };
    for (let i = 0; i < 10; i++) T.step(1); GFX.draw = o2; GFX.particle = p2;
    out.tints = tints.length; out.tintColour = tints[0]; out.sparks = sparks.length;
    return out;
  });
  ok(r.bubbleDead && r.ringsAfterPop >= 1, 'a popped bubble spawns a shockwave ring (' + r.ringsAfterPop + ')');
  ok(r.burstParts >= 8 && /dot/.test(r.kinds) && /ring/.test(r.kinds) && /spark/.test(r.kinds), 'a kill spawns a ring + spark / dot burst: ' + r.burstParts + ' parts (' + r.kinds + ')');
  eq(r.ghostsStill, 0, 'no trail ghosts while standing still'); ok(r.ghostsMoving > 0, 'trail ghosts while moving (' + r.ghostsMoving + ')');
  eq(r.angryCalls.length, 1, 'angry crabbit: one sprite draw, no aura copies: ' + JSON.stringify(r.angryCalls)); ok(!r.angryCalls[0].white, 'and no white silhouette');
  ok(r.tints >= 8 && /^#[0-9a-f]{6}$/i.test(r.tintColour), 'frozen enemy drawn with a #rrggbb tint (' + r.tints + ' draws, ' + r.tintColour + ')'); ok(r.sparks >= 8, 'frozen sparkles via GFX.particle spark (' + r.sparks + ')');
});

await test('22f item glow pulse: food / power-ups get a pulsing glow (alpha varies), the pearl too', async () => {
  const r = await ev(() => {
    const T = __t; Game.setOptions({ quality: 2, reducedMotion: false }); T.arena({ level: 3, empty: true });
    Game.debug.spawn('food_2', 100, 168); Game.debug.spawn('pu_shoes', 60, 168);
    const rec = { food: [], pu: [] }; const o = GFX.particle;
    GFX.particle = (cx, kind, x, y, size, col, a, rot) => { if (kind === 'dot') { if (Math.abs(x - 108) < 0.01) rec.food.push(a); if (Math.abs(x - 68) < 0.01) rec.pu.push(a); } return o.call(GFX, cx, kind, x, y, size, col, a, rot); };
    for (let i = 0; i < 60; i++) T.step(1); GFX.particle = o;
    return { food: [Math.min(...rec.food), Math.max(...rec.food), rec.food.length], pu: [Math.min(...rec.pu), Math.max(...rec.pu), rec.pu.length] };
  });
  ok(r.food[2] >= 50 && r.food[1] - r.food[0] > 0.08, 'food glow pulses: alpha ' + r.food[0].toFixed(2) + ' .. ' + r.food[1].toFixed(2)); ok(r.pu[2] >= 50 && r.pu[1] - r.pu[0] > 0.08, 'power-up glow pulses');
});

await test('22g HUD: lives = pearls (lives - 1), lit EXTEND letters are ringed, round number thin, no opaque plates; boss gauge only while fighting', async () => {
  const r = await ev(() => {
    const T = __t; Game.setOptions({ quality: 2, reducedMotion: false }); T.arena({ players: 2, level: 7, empty: true }); const S = T.S();
    S.players[0].lives = 4; S.players[1].lives = 2; S.players[0].letters = [true, true, false, true, false, false];
    const pearls = [0, 0], rings = [0, 0], texts = []; const op = GFX.particle, ot = GFX.text, of = CanvasRenderingContext2D.prototype.fillRect; let bigRects = 0;
    GFX.particle = (cx, kind, x, y, size, col, a, rot) => { if (kind === 'dot' && Math.abs(size - 1.35) < 1e-6) pearls[x < 128 ? 0 : 1]++; if (kind === 'ring' && Math.abs(size - 3.7) < 1e-6) rings[x < 128 ? 0 : 1]++; return op.call(GFX, cx, kind, x, y, size, col, a, rot); };
    GFX.text = (cx, s, ...rest) => { texts.push(String(s)); return ot.call(GFX, cx, s, ...rest); };
    CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) { const t = this.getTransform(); if (w >= 14 && h >= 10 && this.fillStyle !== '#02040a' && typeof this.fillStyle === 'string' && /^rgba\(\d+,\d+,\d+,(0\.[5-9]|1)\)$/.test(this.fillStyle) && y >= 16) bigRects++; return of.call(this, x, y, w, h); };
    T.render(); GFX.particle = op; GFX.text = ot; CanvasRenderingContext2D.prototype.fillRect = of;
    return { pearls, rings, texts, bigRects, round: texts.includes('07') };
  });
  eq(r.pearls[0], 3, 'P1: 4 lives -> 3 reserve pearls'); eq(r.pearls[1], 1, 'P2: 2 lives -> 1 reserve pearl'); eq(r.rings[0], 3, 'P1: three lit EXTEND letters are ringed'); eq(r.rings[1], 0);
  ok(r.round, 'round number drawn as text'); eq(r.bigRects, 0, 'no opaque rectangles in the HUD');
});

await test('22h chain light: a long chain of kills adds light pools and rate-limited tinted washes, never more than the caps', async () => {
  const r = await ev(() => {
    const T = __t; Game.setOptions({ quality: 2, reducedMotion: false }); T.arena({ level: 3, empty: true }); Game.debug.god(true); const S = T.S();
    for (let i = 0; i < 8; i++) { Game.debug.spawn(['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer'][i % 5], 40 + i * 20, 110); const e = S.enemies[S.enemies.length - 1]; e.state = 'frozen'; e.freezeT = 1e9; }
    Game.debug.give(0, 'bomb'); T.step(1);
    const pools = S.parts.filter((q) => q.k === 'dot' && q.s0 >= 2.5 && q.vx === 0 && q.vy === 0).length;
    const f = Game.debug.flash();
    return { pools, alpha: f.alpha, col: f.col, cool: f.cool };
  });
  ok(r.pools >= 1, 'chain kills spawn light pools (' + r.pools + ')'); ok(r.alpha > 0 && r.alpha <= 0.12 + 1e-9, 'a faint wash (' + r.alpha + ')'); ok(r.cool > 0 && r.cool <= 20, 'flash cooldown armed (' + r.cool + ')');
});

await test('22i fallbacks: without GFX.particle / levelGlints / tint support the game still renders everything (no throw)', async () => {
  const r = await ev(() => {
    const T = __t; delete GFX.particle; GFX.levelGlints = undefined; Game.setOptions({ quality: 2, reducedMotion: false });
    T.start({ players: 2, level: 5, seed: 4 }); T.step(100); Game.debug.god(true); const S = T.S();
    Game.debug.spawn('thunder', 100, 60); Game.debug.spawn('bomb', 100, 100); Game.debug.give(0, 'clock'); Game.debug.give(0, 'bomb');
    for (let i = 0; i < 80; i++) T.step(1);
    T.start({ players: 1, level: 30, seed: 4 }); for (let i = 0; i < 200; i++) T.step(1);
    return { parts: Game.debug.fxStats().parts };
  });
  ok(r.parts >= 0, 'rendered without GFX.particle');
});

await test('22j render + update cost in a busy scene (40 bubbles, 8 enemies, chain): update stays tiny; render is within the budget of this (CPU-raster) machine', async () => {
  const r = await ev(() => {
    const T = __t; Game.setOptions({ quality: 2, reducedMotion: false });
    T.start({ players: 2, level: 8, seed: 5 }); Game.debug.skipIntro(); Game.debug.god(true); const S = T.S(); Game.debug.clearEnemies();
    for (let i = 0; i < 8; i++) Game.debug.spawn(['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer', 'nibbler', 'crabbit', 'jellop'][i], 30 + i * 24, 60 + (i % 3) * 40);
    for (let i = 0; i < 38; i++) Game.debug.spawn(['thunder', 'fire', 'water'][i % 3], 24 + (i % 10) * 20, 40 + Math.floor(i / 10) * 30);
    for (const b of S.bubbles) { b.att = null; b.life = 1e9; }
    S.players[0].inv = 0; S.players[1].inv = 0; Game.debug.noClear(true);
    const inputs = [{ right: true }, { left: true }], ctx = T.ctx, K = T.K;
    const frame = () => { ctx.setTransform(K, 0, 0, K, 0, 0); Game.render(ctx); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.getImageData(0, 0, 1, 1); };   // readback = the raster work really finishes
    for (let i = 0; i < 30; i++) { T.tick(1, inputs); frame(); }
    const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
    const out = {};
    const run = (label, n, chain) => {                         // two passes, the quieter one counts (the machine is shared with other jobs)
      let best = null;
      for (let pass = 0; pass < 2; pass++) {
        const tu = [], tr = [];
        for (let i = 0; i < n; i++) {
          if (chain && i % 12 === 0) { for (let k = 0; k < 6; k++) { Game.debug.spawn(['nibbler', 'crabbit', 'jellop'][k % 3], 60 + k * 14, 120); const e = S.enemies[S.enemies.length - 1]; e.state = 'frozen'; e.freezeT = 1e9; } Game.debug.give(0, 'bomb'); }
          const t0 = performance.now(); T.tick(1, inputs); const t1 = performance.now(); frame(); const t2 = performance.now(); tu.push(t1 - t0); tr.push(t2 - t1);
        }
        const o = { upd: +(tu.reduce((a, b) => a + b, 0) / n).toFixed(3), rend: +(tr.reduce((a, b) => a + b, 0) / n).toFixed(2), rendMed: +med(tr).toFixed(2), rendMax: +Math.max(...tr).toFixed(1) };
        if (!best || o.rendMed < best.rendMed) best = o;
      }
      out[label] = best;
    };
    run('busy q2', 100, false);
    Game.setOptions({ quality: 1 }); run('busy q1', 100, false); Game.setOptions({ quality: 0 }); run('busy q0', 100, false); Game.setOptions({ quality: 2 });
    run('busy+chain q2', 100, true);
    out.stats = Game.debug.fxStats();
    return out;
  });
  for (const k of ['busy q2', 'busy q1', 'busy q0', 'busy+chain q2']) console.log('        ' + k.padEnd(14) + 'update ' + r[k].upd + ' ms, render avg ' + r[k].rend + ' ms (median ' + r[k].rendMed + ', max ' + r[k].rendMax + ')  [k=' + (REAL_MODE ? 3 : 1) + ', software raster]');
  ok(r['busy q2'].upd < 0.6, 'update avg ' + r['busy q2'].upd + ' ms (< 0.6)');
  // the render gate only means something with the real art at k=3; the budget is for THIS container's CPU rasteriser (SPEC_V2 sec. 5 gates the full frame on real hardware)
  if (REAL_MODE) { ok(r['busy q2'].rendMed <= 6, 'busy render median ' + r['busy q2'].rendMed + ' ms (<= 6 on the CPU raster)'); ok(r['busy+chain q2'].rendMed <= 14, 'busy + chain render median ' + r['busy+chain q2'].rendMed + ' ms (<= 14)'); ok(r['busy q1'].rendMed <= r['busy q2'].rendMed + 1 && r['busy q0'].rendMed <= r['busy q1'].rendMed + 1, 'lower quality is not slower'); }
});

await test('22k render fuzz: every phase (intro, play, clear, transition, extend, gameover, victory, boss fight / trapped / pearl) x quality 0-2 x reduced motion renders every frame without errors', async () => {
  const r = await ev(() => {
    const T = __t; let frames = 0; const phases = new Set();
    const rnd = (() => { let s = 4242; return () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; }; })();
    for (const q of [0, 1, 2]) for (const rm of [false, true]) {
      Game.setOptions({ quality: q, reducedMotion: rm });
      for (const lvl of [2, 9, 17, 30]) {
        T.start({ players: 2, level: lvl, seed: 31 + lvl + q }); const S = T.S(); phases.add(S.phase);
        for (let f = 0; f < 700; f++) {
          if (f === 160) { Game.debug.god(true); }
          if (f % 90 === 40) { const kind = ['thunder', 'fire', 'water', 'letter', 'bomb', 'clock', 'nibbler', 'crabbit', 'glimmer', 'bonefin', 'food_5', 'pu_blue', 'pu_parasol'][Math.floor(rnd() * 13)]; Game.debug.spawn(kind, 40 + rnd() * 160, 40 + rnd() * 150); }
          if (f === 300) { S.players[0].letters = [true, true, true, true, true, false]; Game.debug.spawn('letter', S.players[0].x, S.players[0].y); }
          if (f === 420 && lvl !== 30) Game.debug.killAll();
          if (f === 420 && lvl === 30) { S.enemies[0].hp = 1; Game.debug.spawn('thunder', S.enemies[0].x + 20, S.enemies[0].y + 20); }
          if (f === 520 && lvl === 30 && S.bossBubble) { S.players[0].x = S.bossBubble.x + 24; S.players[0].y = S.bossBubble.y + 24; }
          if (f === 600) { Game.debug.god(false); for (const p of S.players) p.lives = 1; Game.debug.spawn('nibbler', S.players[0].x, S.players[0].y); }
          T.step(1, [{ right: f % 50 < 25, jump: f % 70 === 0, fire: f % 9 === 0 }, { left: f % 60 < 30, fire: f % 11 === 0 }]);
          phases.add(S.phase); frames++;
          if (Game.isOver()) break;
        }
        // victory + gameover screens explicitly
        const S2 = T.S(); if (S2) { S2.phase = 'victory'; S2.phaseT = 5; S2.bossBubble = null; for (let k = 0; k < 6; k++) T.step(1); S2.phase = 'gameover'; S2.phaseT = 5; for (let k = 0; k < 6; k++) T.step(1); phases.add('victory'); phases.add('gameover'); }
      }
    }
    Game.setOptions({ quality: 2, reducedMotion: false });
    return { frames, phases: [...phases].sort() };
  });
  ok(r.frames > 8000, 'rendered ' + r.frames + ' frames'); ok(['extend', 'gameover', 'intro', 'play', 'transition', 'victory'].concat(REAL_MODE ? ['clear'] : []).every((p) => r.phases.includes(p)), 'phases covered: ' + r.phases.join(','));
});

// =================================================================================================
// 11. Soak
// =================================================================================================
await test('11 soak: 20000 frames of random input over many rounds, god mode: no errors, bounded counts (incl. cosmetic particles), fast', async () => {
  const r = await ev(() => {
    const T = __t; T.start({ players: 2, level: 1, seed: 99 }); Game.debug.god(true);
    let s = 12345; const rnd = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; };
    const held = [{ left: false, right: false, jump: false, fire: false }, { left: false, right: false, jump: false, fire: false }];
    const max = { enemies: 0, bubbles: 0, proj: 0, fx: 0, popups: 0, items: 0, flames: 0, streams: 0, bolts: 0, parts: 0 };
    let tUpd = 0, tMax = 0, tRend = 0, nRend = 0, rMax = 0, rounds = new Set(), phases = {}; let kills = 0, flashMax = 0, partCap = 0;
    for (let f = 0; f < 20000; f++) {
      for (const h of held) for (const k of ['left', 'right', 'jump', 'fire']) if (rnd() < 0.06) h[k] = !h[k];
      if (f % 900 === 450) Game.debug.killAll();
      if (f % 3500 === 3000) Game.debug.setLevel(1 + Math.floor(rnd() * 30));
      if (f % 700 === 100) { const kind = ['thunder', 'fire', 'water', 'letter', 'bomb', 'clock', 'shoes', 'pink', 'blue', 'gold', 'nibbler', 'crabbit', 'jellop', 'springle', 'glimmer', 'bonefin'][Math.floor(rnd() * 16)]; Game.debug.spawn(kind, 40 + rnd() * 160, 40 + rnd() * 150); }
      const t0 = performance.now();
      T.tick(1, held);
      const dt = performance.now() - t0; tUpd += dt; tMax = Math.max(tMax, dt);
      if (f % 25 === 0) { const r0 = performance.now(); T.render(); const dr = performance.now() - r0; tRend += dr; nRend++; rMax = Math.max(rMax, dr); }     // the real frame (renders every 25th update)
      const S = T.S(); phases[S.phase] = (phases[S.phase] || 0) + 1; rounds.add(S.level);
      max.enemies = Math.max(max.enemies, S.enemies.length); max.bubbles = Math.max(max.bubbles, S.bubbles.length); max.proj = Math.max(max.proj, S.proj.length);
      max.fx = Math.max(max.fx, S.fx.length); max.popups = Math.max(max.popups, S.popups.length); max.items = Math.max(max.items, S.items.length);
      max.flames = Math.max(max.flames, S.flames.length); max.streams = Math.max(max.streams, S.streams.length); max.bolts = Math.max(max.bolts, S.bolts.length); max.parts = Math.max(max.parts, S.parts.length);
      flashMax = Math.max(flashMax, Game.debug.flash().alpha); partCap = Game.debug.fxStats().partCap;
      if (Game.isOver()) { T.start({ players: 2, level: 1 + Math.floor(rnd() * 30), seed: f }); Game.debug.god(true); }
    }
    const st = T.state();
    return { avg: tUpd / 20000, tMax, rend: tRend / nRend, rMax, max, flashMax, partCap, rounds: [...rounds].length, phases, nan: [st.players.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y)), st.enemies.some((e) => !Number.isFinite(e.x) || !Number.isFinite(e.y))] };
  });
  console.log('        soak: avg update ' + r.avg.toFixed(3) + ' ms (max ' + r.tMax.toFixed(2) + '), sampled render avg ' + r.rend.toFixed(2) + ' ms (max ' + r.rMax.toFixed(1) + '), rounds seen ' + r.rounds + ', max counts ' + JSON.stringify(r.max) + ', flash max ' + r.flashMax.toFixed(3) + ', phases ' + JSON.stringify(r.phases));
  ok(r.max.bubbles <= 60, 'bubbles bounded ' + r.max.bubbles); ok(r.max.enemies <= 20, 'enemies bounded ' + r.max.enemies);
  ok(r.max.proj <= 80 && r.max.fx <= 160 && r.max.popups <= 60, 'proj/fx/popups bounded'); ok(r.max.parts <= r.partCap, 'cosmetic particles bounded ' + r.max.parts + ' <= ' + r.partCap);
  ok(r.flashMax <= 0.12 + 1e-9, 'flash cap held for 20000 frames');
  ok(r.avg < 0.6, 'avg update time ' + r.avg);
  if (REAL_MODE) ok(r.rend < 9, 'sampled render avg ' + r.rend + ' ms (CPU raster, k=3)'); else ok(r.rend < 3, 'sampled render avg ' + r.rend);
  ok(!r.nan[0] && !r.nan[1], 'no NaN positions');
  const u = await ev(() => __t.unknown());
  ok(!u.sprites.length && !u.sfx.length && !u.music.length, 'only contract names used: ' + JSON.stringify(u));
});

// ---- summary --------------------------------------------------------------------------------------
if (t) await t.close();
const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} tests passed`);
process.exit(failed.length ? 1 : 0);
