// Randomised invariant fuzz of Game via debug hooks: random inputs for 2 players + random debug events
// (specials, power-ups, hurry, join, setLevel, killAll, lives...). Checks entity cross-references, NaN, bounds,
// stuck phases, zombie players, array caps after every frame. Usage: node test/qa_codereview_fuzz.mjs [seeds=6] [frames=6000]
import { boot, log } from './qa_codereview_lib.mjs';
const seeds = +(process.argv[2] || 6), frames = +(process.argv[3] || 6000), onlySeed = process.argv[4] ? +process.argv[4] : 0;
const NOEV = !!process.env.NOEVENTS;
const SRC = `(seed, frames, players) => { const NOEV = ${process.env.NOEVENTS ? 'true' : 'false'};
  const rnd = fz.U.rng(seed);
  const out = {}; const note = (k, m) => { out[k] = out[k] || { n: 0, first: m }; out[k].n++; };
  const D = fz.Game.debug;
  let lastLives = {}, lastScore = {}, restartedThisFrame = false, lastEvent = '', lastPhase = '', phaseSince = 0, frameNo = 0, restarts = 0, maxLevel = 1;
  const stats = { phases: {}, trappedFrames: 0, carriedFrames: 0, frozenFrames: 0, extendCount: 0, ghostFrames: 0 };
  fz.start(players, 1 + rnd.int(0, 3), seed); D.skipIntro();
  let inp = [{}, {}];
  const num = Number.isFinite;
  function check() {
    const S = D._S();
    const tag = 'L' + S.level + ' ' + S.phase + ' f' + frameNo;
    for (const p of S.players) {
      if (![p.x, p.y, p.vx, p.vy].every(num)) note('player NaN', tag);
      if (p.state === 'normal' && p.lives <= 0) note('zombie player (normal, lives<=0)', tag + ' p' + p.i);
      if (p.state === 'dying' && p.lives <= 0 && S.phase === 'transition') note('dying player in transition w/ lives 0', tag);
      if (p.x < 16 - 1e-6 || p.x > 224 + 1e-6) { if (S.phase !== 'transition') note('player x out of bounds', tag + ' x=' + p.x); }
      if (p.state === 'normal' && S.phase !== 'transition' && (p.y > 232 || p.y < -1)) note('player y out of bounds', tag + ' y=' + p.y);
    }
    const bset = new Set(S.bubbles);
    for (const e of S.enemies) {
      if (e.state === 'trapped') stats.trappedFrames++; if (e.state === 'carried') stats.carriedFrames++; if (e.state === 'frozen') stats.frozenFrames++;
      if (e.dead) note('dead enemy not compacted', tag);
      if (![e.x, e.y].every(num)) note('enemy NaN', tag + ' ' + e.t + ' ' + e.state);
      if (e.t !== 'kraken' && (e.x < 15.99 || e.x > 224.01) && e.state !== 'enter') note('enemy x oob', tag + ' ' + e.t + ' ' + e.state + ' x=' + e.x);
      if (e.state === 'trapped') {
        if (!e.bubble) note('trapped enemy w/o bubble', tag);
        else if (e.bubble.dead || !bset.has(e.bubble)) note('trapped enemy with dead/removed bubble', tag);
        else if (e.bubble.enemy !== e) note('trapped enemy bubble.enemy mismatch', tag);
      } else if (e.bubble) note('non-trapped enemy keeps bubble ref (' + e.state + ')', tag);
      if (e.state === 'carried') {
        if (!e.stream || e.stream.dead || !S.streams.includes(e.stream)) note('carried enemy w/o live stream', tag);
      }
      if (e.state === 'frozen' && !(e.freezeT > 0)) note('frozen w/o timer', tag);
    }
    for (const b of S.bubbles) {
      if (b.dead) note('dead bubble not compacted', tag);
      if (![b.x, b.y].every(num)) note('bubble NaN', tag + ' ' + b.kind);
      if (b.kind === 'trapped') {
        const e = b.enemy;
        if (!e || e.dead || e.state !== 'trapped' || e.bubble !== b) note('trapped bubble inconsistent', tag + ' enemyState=' + (e && e.state));
      }
      if (b.x < 15.99 || b.x > 224.01 || (b.y < 23.99 && b.state !== 'shot') || b.y > 225) note('bubble out of bounds', tag + ' ' + b.kind + ' ' + b.state + ' (' + b.x.toFixed(1) + ',' + b.y.toFixed(1) + ')');
    }
    for (const s of S.streams) for (const e of s.carried) if (!e.dead && e.state !== 'carried') note('stream carries non-carried enemy', tag + ' ' + e.state);
    if (S.proj.length > 80) note('proj cap', tag);
    if (S.fx.length > 160) note('fx cap', tag);
    if (S.popups.length > 60) note('popup cap', tag);
    if (S.bubbles.length > 90) note('bubbles huge', tag + ' ' + S.bubbles.length);
    if (S.items.length > 40) note('items huge', tag + ' ' + S.items.length);
    if (S.flames.length > 120) note('flames huge', tag + ' ' + S.flames.length);

    // economy / bookkeeping invariants
    for (const p of S.players) {
      if (!Number.isInteger(p.lives) || p.lives < 0) note('lives not a non-negative int', tag + ' ' + p.lives);
      if (!Number.isInteger(p.score) || p.score < 0) note('score not a non-negative int', tag + ' ' + p.score);
      const prev = lastLives[p.i], ps = lastScore[p.i];
      if (prev !== undefined && p.lives - prev > 2) note('lives jumped by >2 in one frame', tag + ' ' + prev + '->' + p.lives);
      if (ps !== undefined && p.score < ps && !restartedThisFrame) note('score decreased', tag + ' ' + ps + '->' + p.score);
      lastLives[p.i] = p.lives; lastScore[p.i] = p.score;
      if (S.hiScore < p.score) note('hiScore below player score', tag);
      if (p.letters.length !== 6) note('letters array broken', tag);
    }
    { const tempo = fz.AUDIO._state().tempo; if ((tempo > 1.01) !== !!S.hurry && S.phase !== 'transition') note('AUDIO tempo ' + tempo + ' vs S.hurry=' + S.hurry, tag); }
    // stuck phases
    if (S.ghost) stats.ghostFrames++;
    if (S.phase !== lastPhase) { lastPhase = S.phase; phaseSince = 0; stats.phases[S.phase] = (stats.phases[S.phase] || 0) + 1; } else phaseSince++;
    const lim = { intro: 152, clear: 302, transition: 122, extend: 182, gameover: 242, victory: 242 }[S.phase];
    if (lim && phaseSince > lim) note('stuck phase ' + S.phase, tag + ' for ' + phaseSince);
    if (S.phase === 'play' && !S.noClear && !S.level !== 30 && S.enemies.length === 0 && S.level !== 30) note('play with 0 enemies not clearing', tag + ' phaseSince=' + phaseSince + ' lastEvent=' + lastEvent + ' noClear=' + S.noClear + ' boss=' + S.bossPhase);
    if (S.level < 1 || S.level > 30) note('level range', tag + ' ' + S.level);
    maxLevel = Math.max(maxLevel, S.level);
  }
  for (frameNo = 0; frameNo < frames; frameNo++) {
    restartedThisFrame = false; if (fz.scene() !== 'play' || D._S().over) { lastLives = {}; lastScore = {}; restartedThisFrame = true; restarts++; fz.start(players, 1 + rnd.int(0, 29), seed + restarts); if (rnd.chance(0.5)) D.skipIntro(); continue; }
    const S = D._S();
    // random inputs
    if (frameNo % 7 === 0) {
      for (let i = 0; i < 2; i++) {
        inp[i] = { left: rnd.chance(0.3), right: rnd.chance(0.3), jump: rnd.chance(0.25), fire: rnd.chance(0.5) };
        fz.input.set(i, inp[i]);
      }
    }

    if (rnd.chance(0.5) && frameNo % 3 === 0) {
      for (let i = 0; i < players; i++) {
        const p = S.players[i]; if (!p || p.state !== 'normal') continue;
        let best = null, bd = 1e9;
        for (const e of S.enemies) { if (e.state !== 'active' && e.state !== 'frozen') continue; const d = Math.abs(e.x - p.x) + Math.abs(e.y - p.y) * 2; if (d < bd) { bd = d; best = e; } }
        if (best) {
          const dx = best.x - p.x;
          fz.input.set(i, { left: dx < -20, right: dx > 20, jump: best.y < p.y - 10 && rnd.chance(0.5), fire: Math.abs(dx) < 70 && Math.abs(best.y - p.y) < 16 });
        }
      }
    }
    // random debug events
    if (rnd.chance(NOEV ? 0 : 0.012)) {
      const k = rnd.int(0, 17); lastEvent = 'k' + k + '@' + frameNo;
      const x = rnd.int(24, 216), y = rnd.int(40, 190);
      switch (k) {
        case 0: D.spawn(rnd.pick(['thunder', 'fire', 'water']), x, y); break;
        case 1: D.spawn(rnd.pick(['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer']), x, y); break;
        case 2: D.give(rnd.int(0, 1) % players, rnd.pick(['shoes', 'pink', 'blue', 'gold', 'clock', 'bomb', 'parasol', 'heart'])); break;
        case 3: D.setHurryTimer(rnd.int(1000, 4000)); break;
        case 4: D.spawn(rnd.pick(['pu_bomb', 'pu_parasol', 'pu_clock', 'pu_heart', 'food_3']), x, y); break;
        case 5: if (rnd.chance(0.15)) D.killAll(); break;
        case 6: if (rnd.chance(0.2)) fz.Game.join(1); break;
        case 7: D.setPlayer(rnd.int(0, players - 1), { lives: rnd.int(1, 3) }); break;
        case 8: D.spawn('bonefin', x, y); break;
        case 9: D.spawn('letter', x, y); break;
        case 10: if (rnd.chance(0.1)) { D.setLevel(rnd.int(1, 30)); } break;
        case 11: D.setPlayer(0, { letters: [true, true, true, true, true, false] }); D.spawn('letter', 100, 200); break;
        case 12: D.addScore(rnd.int(0, players - 1), rnd.pick([10, 500, 29990, 99990])); break;
        case 13: D.spawn('water', x, 30); break;
        case 14: D.spawn('fire', x, 30); break;
        case 15: D.spawn('thunder', x, y); break;
        case 16: D.setPlayer(rnd.int(0, players - 1), { x, y, vy: 0 }); break;
        default: D.skipIntro();
      }
    }
    fz.step(1);
    check();
  }
  return { out, restarts, maxLevel, stats };
}`;
let total = {};
for (let s = onlySeed || 1; s <= (onlySeed || seeds); s++) {
  const players = s % 2 === 0 ? 2 : 1;
  const b = await boot({ players, level: 1, seed: s, skipIntro: false });
  const r = await b.page.evaluate(`(${SRC})(${s * 977}, ${frames}, ${players})`);
  log(`seed ${s} players=${players} restarts=${r.restarts} maxLevel=${r.maxLevel} phases=${JSON.stringify(r.stats.phases)} trapped=${r.stats.trappedFrames} carried=${r.stats.carriedFrames} frozen=${r.stats.frozenFrames} ghost=${r.stats.ghostFrames}`);
  for (const [k, v] of Object.entries(r.out)) { log('   ', k, 'x' + v.n, '  e.g.', v.first); total[k] = (total[k] || 0) + v.n; }
  if (b.t.errors.length) log('   ERRORS', b.t.errors.slice(0, 3));
  await b.t.close();
}
log('TOTAL', JSON.stringify(total));
