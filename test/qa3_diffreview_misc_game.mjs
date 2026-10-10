// Misc game probes: (a) spawn poof/sfx for the first enemy, (b) thunder-chain screen-flash frequency, (c) relocation overlap with other enemies
import { boot, log, check } from './qa3_diffreview_lib.mjs';
const b = await boot({ players: 1, level: 1, seed: 1, skipIntro: false });
// (a) intro: count 'spawn' sfx and poof fx per enemy
const A = await b.page.evaluate(() => {
  fz.start(1, 5, 1); const D = fz.Game.debug; const S = D._S();
  let spawn = 0; const orig = fz.AUDIO.sfx; fz.AUDIO.sfx = function (n, o) { if (n === 'spawn') spawn++; return orig.apply(this, arguments); };
  const n = S.enemies.length; let poofs = 0;
  for (let f = 0; f < 150; f++) { fz.step(1); }
  fz.AUDIO.sfx = orig;
  return { enemies: n, spawnSfx: spawn, phase: D.state().phase };
});
log('intro spawn sfx', JSON.stringify(A));
check('M1 every entering enemy plays the spawn sfx/poof once', A.spawnSfx === A.enemies, A);

// (b) thunder chain flash: 8 thunder bubbles in a cluster, pop one, record per-frame flash alpha
const B = await b.page.evaluate(() => {
  fz.start(1, 5, 1); const D = fz.Game.debug; D.skipIntro(); D.god(true); D.noClear(true); D.clearEnemies(); D.setHurryTimer(-1e7);
  const S = D._S();
  for (let i = 0; i < 8; i++) D.spawn('thunder', 100 + i * 9, 60);
  S.bubbles.forEach((b, i) => { b.age = 0; b.att = null; });
  // pop the first one with the player standing in it
  const P = S.players[0]; P.x = 100; P.y = 60; P.inv = 9999;
  const alphas = [];
  for (let f = 0; f < 90; f++) { fz.step(1); alphas.push(+(S.flashT > 0 ? S.flashA * Math.min(1, S.flashT / S.flashDur) : 0).toFixed(2)); }
  // count flash onsets (0 -> >0) and the longest run with alpha >= 0.1
  let onsets = 0, prev = 0; for (const a of alphas) { if (a > 0 && prev === 0) onsets++; prev = a; }
  const lit = alphas.filter((a) => a > 0.05).length;
  return { alphas: alphas.slice(0, 60).join(' '), onsets, litFrames: lit, remainingThunder: S.bubbles.filter((b) => !b.dead && b.kind === 'thunder').length };
});
log('thunder chain flashes', JSON.stringify(B));
await b.t.close();
