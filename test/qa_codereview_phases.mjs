// Events during phases they were not designed for: simultaneous deaths, join during transition / gameover / dying,
// EXTEND during clear / intro, death during clear, parasol on rounds 26-29, killAll in the boss round, bomb with trapped enemies.
import { boot, log, launch, fp } from './qa_codereview_lib.mjs';

async function scenario(name, opts, fn) {
  const b = await boot(opts);
  let r;
  try { r = await fn(b); } catch (e) { r = 'EXC ' + e.message; }
  log(`## ${name}\n   ->`, typeof r === 'string' ? r : JSON.stringify(r), ' errors:', JSON.stringify(b.t.errors));
  await b.t.close();
}

await scenario('A. both players die on the same frame with their last life', { players: 2, level: 1, seed: 11 }, async ({ ev, g }) => {
  await ev((H) => { H.D().setPlayer(0, { lives: 1 }); H.D().setPlayer(1, { lives: 1 }); H.D().spawn('nibbler', H.P(0).x, H.P(0).y); H.D().spawn('nibbler', H.P(1).x, H.P(1).y); H.step(1); });
  const s1 = await ev((H) => H.snap().phase + '/' + H.P(0).state + '/' + H.P(1).state);
  await ev((H) => H.step(95));
  const s2 = await ev((H) => ({ phase: H.S().phase, st: [H.P(0).state, H.P(1).state] }));
  await ev((H) => H.step(250));
  const s3 = await g.scene();
  return { s1, s2, sceneAfter: s3 };
});

await scenario('B. P2 joins during the transition scroll (1P game)', { players: 1, level: 1, seed: 12, god: true }, async ({ ev }) => {
  await ev((H) => { H.D().killAll(); });
  let phases = [];
  for (let i = 0; i < 400; i++) { await ev((H) => H.step(1)); const ph = await ev((H) => H.S().phase); if (ph === 'transition') break; }
  await ev((H) => fz.Game.join(1));
  const mid = await ev((H) => ({ n: H.S().players.length, pending: H.S().pendingJoin }));
  await ev((H) => fz.Game.join(1));
  await ev((H) => H.step(130));
  const after = await ev((H) => ({ n: H.S().players.length, lives: H.S().players[1] && H.S().players[1].lives, phase: H.S().phase, level: H.S().level, pending: H.S().pendingJoin, p2: H.S().players[1] && { x: H.S().players[1].x, y: H.S().players[1].y, inv: H.S().players[1].inv } }));
  return { mid, after };
});

await scenario('C. P2 joins during game over / after P1 is out / while P1 dying on last life', { players: 1, level: 1, seed: 13 }, async ({ ev }) => {
  await ev((H) => { H.D().setPlayer(0, { lives: 1 }); H.D().spawn('nibbler', H.P(0).x, H.P(0).y); H.step(1); });
  fz_join: await ev((H) => fz.Game.join(1));
  const dyingJoin = await ev((H) => ({ n: H.S().players.length, p0: H.P(0).state }));
  await ev((H) => H.step(100));
  const st = await ev((H) => ({ phase: H.S().phase, p0: H.P(0).state, p1: H.S().players[1] && H.S().players[1].state, n: H.S().players.length }));
  return { dyingJoin, st };
});

await scenario('C2. join after game over began', { players: 1, level: 1, seed: 13 }, async ({ ev }) => {
  await ev((H) => { H.D().setPlayer(0, { lives: 1 }); H.D().spawn('nibbler', H.P(0).x, H.P(0).y); H.step(100); });
  const ph = await ev((H) => H.S().phase);
  await ev((H) => fz.Game.join(1));
  return { ph, n: await ev((H) => H.S().players.length) };
});

await scenario('D. EXTEND completed during the clear phase / during intro', { players: 1, level: 1, seed: 14, skipIntro: false }, async ({ ev }) => {
  // during intro
  await ev((H) => { H.D().setPlayer(0, { letters: [true, true, true, true, true, false] }); H.D().spawn('letter', H.P(0).x + 4, H.P(0).y - 2); });
  await ev((H) => H.step(3));
  const a = await ev((H) => ({ phase: H.S().phase, lives: H.P(0).lives, enemies: H.S().enemies.length }));
  await ev((H) => H.step(200));
  const a2 = await ev((H) => ({ phase: H.S().phase, level: H.S().level, enemiesLeft: H.S().enemies.length }));
  return { duringIntro: a, later: a2 };
});

await scenario('E. parasol rounds 26..30', { players: 1, level: 26, seed: 15, god: true }, async ({ ev }) => {
  const out = {};
  for (const L of [24, 25, 26, 27, 28, 29]) {
    await ev((H, L) => { H.D().setLevel(L); H.D().skipIntro(); H.D().give(0, 'parasol'); }, L);
    let to = null;
    for (let i = 0; i < 600; i++) { await ev((H) => H.step(1)); const r = await ev((H) => ({ ph: H.S().phase, lvl: H.S().level, to: H.S().tr && H.S().tr.to })); if (r.ph === 'transition') to = r.to; if (r.ph === 'intro' && r.lvl !== L) { out[L] = '-> ' + r.lvl + ' (transition.to=' + to + ')'; break; } }
  }
  return out;
});

await scenario('F. killAll in the boss round then pop + pearl + victory', { players: 2, level: 30, seed: 16, god: true }, async ({ ev, g }) => {
  await ev((H) => { H.D().killAll(); H.D().killAll(); H.step(2); });
  const a = await ev((H) => ({ ph: H.S().phase, bp: H.S().bossPhase, bb: !!H.S().bossBubble }));
  await ev((H) => { H.D().setPlayer(0, { x: H.S().bossBubble.x + 24, y: H.S().bossBubble.y + 24, vy: 0 }); H.step(1); H.D().killAll(); });
  const b2 = await ev((H) => ({ ph: H.S().phase, bp: H.S().bossPhase, items: H.S().items.map((i) => i.kind) }));
  await ev((H) => { const it = H.S().items.find((i) => i.kind === 'moonpearl'); H.D().setPlayer(1, { x: it.x + 8, y: it.y + 8, vy: 0 }); H.step(1); });
  const c = await ev((H) => ({ ph: H.S().phase, bp: H.S().bossPhase }));
  await ev((H) => H.step(250));
  const d = await ev((H) => ({ over: fz.Game.isOver(), res: fz.Game.result() }));
  return { a, b2, c, d, scene: await g.scene() };
});

await scenario('G. bomb / parasol / clock with trapped enemies on screen', { players: 1, level: 5, seed: 17, god: true }, async ({ ev }) => {
  const res = {};
  for (const item of ['bomb', 'parasol', 'clock']) {
    await ev((H) => { H.D().setLevel(5); H.D().skipIntro(); H.D().clearEnemies(); H.D().noClear(true); H.D().spawn('nibbler', 100, 100); H.D().spawn('crabbit', 150, 100); H.D().spawn('jellop', 60, 80); H.D().spawn('springle', 180, 80); });
    await ev((H) => {
      for (const e of H.S().enemies.slice(0, 2)) { e.vx = 0; H.D().setPlayer(0, { x: e.x - 12, y: e.y, face: 1, vy: 0 }); H.step(1, () => [{ fire: true }]); H.step(8); }
    });
    const pre = await ev((H) => H.S().enemies.map((e) => e.t + ':' + e.state));
    await ev((H, item) => { H.D().give(0, item); H.step(1); }, item);
    const post = await ev((H) => ({ en: H.S().enemies.map((e) => e.t + ':' + e.state + ':' + (e.bubble ? 'bub' : '-')), bub: H.S().bubbles.map((b) => b.kind + ':' + b.state), skip: H.S().skipTo }));
    await ev((H) => H.step(30));
    const later = await ev((H) => ({ en: H.S().enemies.map((e) => e.t + ':' + e.state), bub: H.S().bubbles.map((b) => b.kind) }));
    res[item] = { pre, post, later };
  }
  return res;
});
