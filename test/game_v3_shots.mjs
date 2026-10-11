// FIZZ & POP v3 - Game wave screenshots (FIXPLAN_V3 Game: G1-G8, V1, V2, V6) -> out/v3/game/shots/*.png ; every image is LOOKED at in the review.
//   node test/game_v3_shots.mjs [which...]     which = ink hud frozen thaw chain transition gameover pulses (default all)
//   GAME=../backup/v3/game_40_game.js node test/game_v3_shots.mjs   draws the same scenes with another Game build (before / after pairs; files get suffix _old)
import { launch, PROJECT } from '../tools/harness.mjs';
import fs from 'fs';
import path from 'path';

const K = +(process.env.K || 4);
const OLD = !!process.env.GAME;
const OUT = path.join(PROJECT, 'out/v3/game/shots');
fs.mkdirSync(OUT, { recursive: true });
const which = process.argv.slice(2);
const want = (n) => !which.length || which.includes(n);
const t = await launch({ html: path.join(PROJECT, 'test', 'game_harness.html') + `?real=1&k=${K}&post=2` + (OLD ? '&game=' + process.env.GAME : '') });
const page = t.page;
const ev = (fn, arg) => page.evaluate(fn, arg);
await ev(() => __t.freeze(true));
const sfx = OLD ? '_old' : '';
const settle = async (ms = 700) => {                    // wait until GFX has finished its background bakes (world canvases / overlay come in slices) so the shots show the final look
  await new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 40; i++) { const idle = await ev(() => { __t.step(1); const s = typeof GFX._stats === 'function' ? GFX._stats() : { jobs: 0, migrating: false, warmQueue: 0 }; return !s.jobs && !s.migrating; }); if (idle) break; await new Promise((r) => setTimeout(r, 250)); }
  await ev(() => __t.step(1));
};
/** crop of the canvas (logical units) written as PNG (scale = extra nearest upscale) */
async function crop(name, x, y, w, h, scale = 1) {
  const url = await ev(({ x, y, w, h, scale }) => {
    const cv = __t.canvas, k = cv.width / 256, o = document.createElement('canvas');
    o.width = Math.round(w * k * scale); o.height = Math.round(h * k * scale);
    const c = o.getContext('2d'); c.imageSmoothingEnabled = false;
    c.drawImage(cv, Math.round(x * k), Math.round(y * k), Math.round(w * k), Math.round(h * k), 0, 0, o.width, o.height);
    return o.toDataURL('image/png');
  }, { x, y, w, h, scale });
  fs.writeFileSync(path.join(OUT, name + sfx + '.png'), Buffer.from(url.replace(/^data:image\/png;base64,/, ''), 'base64'));
}
const full = (name) => crop(name, 0, 0, 256, 224, 1);

if (want('ink')) {                                    // G1: the ink telegraph, frame by frame (inkT 22 .. 1 then the volley and the fade)
  await ev(() => { const T = __t; T.start({ players: 1, level: 30, seed: 8 }); T.step(160); Game.debug.god(true); const S = T.S(), b = S.enemies[0]; S.thunderT = 1e9; b.jx = 0; b.jy = 0; b.x = 104; b.y = 56; b.inkT = 60; S.players[0].x = 24; S.players[0].y = 200; });
  await settle();
  const marks = [30, 22, 17, 12, 7, 2, -4, -10, -18];       // inkT values to capture (negative = frames after the volley)
  let i = 0;
  for (const m of marks) {
    await ev((m) => {
      const T = __t, S = T.S(), b = S.enemies[0];
      const target = m > 0 ? m : 120 + m;                   // after the volley inkT counts down from 120 again
      if (m > 0) { let g = 0; while (b.inkT > m && g++ < 400) { T.tick(1); b.x = 104; b.y = 56; } T.render(); }
      else { let g = 0; while (b.relT < -m && g++ < 400) { T.tick(1); b.x = 104; b.y = 56; } T.render(); }
    }, m);
    await crop(`ink_${String(i++).padStart(2, '0')}_${m}`, 92, 44, 72, 72, 3);
  }
}

if (want('hud')) {                                    // G6 / G8 / V2: HUD of round 1 (R01 label, dim EXTEND letters, water band) + the 6 themes' left walls
  for (const lvl of [1, 6, 11, 16, 21, 26]) {
    await ev((lvl) => { const T = __t; T.start({ players: 2, level: lvl, seed: 5 }); Game.debug.skipIntro(); T.step(30); Game.debug.god(true); const p = T.S().players[0]; p.letters = [true, false, true, false, false, false]; T.S().players[1].letters = [false, true, false, false, false, false]; T.step(2); }, lvl);
    await settle();
    await crop('hud_r' + lvl, 0, 0, 256, 224, 1);
    await crop('hudwall_r' + lvl, 0, 0, 64, 112, 3);
  }
}

if (want('frozen')) {                                 // V1: frozen enemies on all six themes + the thaw pulse
  const types = ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer'];
  for (const lvl of [1, 6, 11, 16, 21, 26]) {
    await ev(({ lvl, types }) => {
      const T = __t; T.start({ players: 1, level: lvl, seed: 5 }); T.step(160); Game.debug.god(true); Game.debug.clearEnemies(); const S = T.S();
      types.forEach((ty, i) => { Game.debug.spawn(ty, 40 + i * 36, 184); const e = S.enemies[S.enemies.length - 1]; e.state = 'frozen'; e.freezeT = 200; e.vx = 0; });
      Game.debug.spawn('nibbler', 220, 184); S.enemies[S.enemies.length - 1].vx = 0;
      S.players[0].x = 100; S.players[0].y = 120; T.step(2);
    }, { lvl, types });
    await settle();
    await crop('frozen_r' + lvl, 24, 164, 208, 48, 3);
  }
}

if (want('thaw')) {                                   // G3 / V1: the thaw = the last 60 frames of a freeze (every 6th frame): the ice thins in a gentle pulse while the creature returns
  await ev(() => { const T = __t; T.start({ players: 1, level: 1, seed: 5 }); T.step(160); Game.debug.god(true); Game.debug.clearEnemies(); Game.debug.spawn('crabbit', 56, 200); const e = T.S().enemies[0]; e.state = 'frozen'; e.freezeT = 61; e.vx = 0; e.vy = 0; T.S().players[0].x = 200; });
  await settle();
  for (let i = 0; i < 10; i++) { await ev(() => { const e = __t.S().enemies[0]; __t.step(6); e.x = 56; e.y = 200; }); await crop('thaw_' + i, 40, 184, 40, 40, 4); }
}

if (want('chain')) {                                  // V6 / G2: a bomb chain (8 enemies) at the kill frame, +4, +10 and a thunder pop ring
  for (const [n, steps] of [['a', 1], ['b', 5], ['c', 11]]) {
    await ev((steps) => {
      const T = __t; T.start({ players: 2, level: 8, seed: 5 }); T.step(160); Game.debug.god(true); Game.debug.clearEnemies(); const S = T.S();
      for (let i = 0; i < 8; i++) { Game.debug.spawn(['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer', 'nibbler', 'crabbit', 'jellop'][i], 40 + i * 24, 100 + (i % 2) * 40); const e = S.enemies[S.enemies.length - 1]; e.state = 'frozen'; e.freezeT = 1e9; }
      S.players[0].x = 120; S.players[0].y = 184; Game.debug.give(0, 'bomb'); T.step(steps);
    }, steps);
    await crop('chain_' + n, 0, 16, 256, 208, 1);
  }
}

if (want('transition')) {                             // G5: the round change (start / mid / end) with leftover items fading
  await ev(() => {
    const T = __t; T.start({ players: 1, level: 3, seed: 5 }); T.step(160); Game.debug.god(true); Game.debug.spawn('food_3', 120, 100); Game.debug.spawn('pu_shoes', 80, 150); Game.debug.spawn('letter', 160, 60);
    Game.debug.killAll(); Game.debug.noClear(false);
  });
  let seen = 0;
  for (let g = 0; g < 900 && seen < 1; g++) { const ph = await ev(() => { __t.step(1); return __t.state().phase; }); if (ph === 'transition') seen = 1; }
  for (const [i, n] of [[0, 0], [1, 6], [2, 20], [3, 25], [4, 20], [5, 20], [6, 25]]) { await ev((n) => { __t.step(n); }, n); await full('trans_' + i); }
}

if (want('gameover')) {                               // G6: GAME OVER with no "PUSH Q" hint (the old build blinks it under the banner)
  await ev(() => { const T = __t; T.start({ players: 1, level: 4, seed: 5 }); Game.debug.skipIntro(); T.step(20); const S = T.S(); S.phase = 'gameover'; S.phaseT = 0; });
  await settle(300);
  for (let i = 0; i < 4; i++) { await ev(() => { __t.step(15); }); await crop('gameover_' + i, 0, 0, 256, 140, 2); }
}

if (want('pulses')) {                                 // G3: the banners
  await ev(() => { const T = __t; T.start({ players: 1, level: 5, seed: 5 }); T.step(160); Game.debug.god(true); T.S().hurryBanner = 120; T.step(2); });
  await settle(300);
  for (let i = 0; i < 6; i++) { await ev(() => { __t.step(5); }); await crop('hurry_' + i, 40, 84, 176, 40, 2); }
}
console.log('errors', t.errors);
await t.close();
