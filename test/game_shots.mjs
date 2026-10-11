// FIZZ & POP v2 — Game screenshots of representative moments (canvas k = 3 = 768 x 672, post FX on) -> out/v2/game/shots/*.png
//   node test/game_shots.mjs            real GFX/AUDIO + stub LEVELS (stable boss arena)
//   MODE=1 node test/game_shots.mjs     everything real (whatever the other modules currently hold)
//   BASE=../out/fix/game_priv/src node ...   take the real modules from another directory (snapshot)
//   OUT=out/v2/game/shots node ...           output directory (default out/v2/game/shots)
//   POST=0|1|2 node ...                      GFX.postFX level (default 2)   K=2 node ...   canvas scale (default 3)
import { launch, canvasShot, PROJECT } from '../tools/harness.mjs';
import path from 'path';

const mode = process.env.MODE || 'gfx';
const K = +(process.env.K || 3);
const t = await launch({ html: path.join(PROJECT, 'test', 'game_harness.html') + '?real=' + mode + '&k=' + K + '&post=' + (process.env.POST || 2) + (process.env.BASE ? '&base=' + process.env.BASE : '') });
const page = t.page;
const OUT = path.join(PROJECT, process.env.OUT || 'out/v2/game/shots');
const ev = (fn, arg) => page.evaluate(fn, arg);
await ev(() => __t.freeze(true));
const shot = (name) => canvasShot(page, path.join(OUT, name + '.png'), { scale: 1 });

// 1. 2P play with bubbles, popups, HUD
await ev(() => {
  const T = __t; T.start({ players: 2, level: 1, seed: 21 }); T.step(160);
  Game.debug.god(true);
  const S = T.S();
  for (let i = 0; i < 4; i++) { T.step(1, [{ fire: true, right: i % 2 === 0 }, { fire: true, left: true }]); T.step(10); }
  S.players[0].score = 12340; S.players[1].score = 5600; S.hiScore = 50000;
  Game.debug.spawn('food_2', 120, 168); Game.debug.spawn('pu_shoes', 60, 168);
  T.step(4); T.render();
});
await shot('01_hud_2p_play');

// 2. intro banner of a later round (round 7)
await ev(() => { __t.start({ players: 1, level: 7, seed: 5 }); __t.step(110); });
await shot('02_intro_banner');
await ev(() => { __t.start({ players: 1, level: 30, seed: 5 }); __t.step(110); });
await shot('02b_intro_boss');

// 3. hurry up banner + angry enemies
await ev(() => {
  const T = __t; T.start({ players: 1, level: 1, seed: 5 }); Game.debug.god(true); T.step(150);
  Game.debug.setHurryTimer(LEVELS[0].hurry * 60 - 1); T.step(10);
});
await shot('03_hurry');
await ev(() => { __t.step(620); });
await shot('03b_bonefin');

// 4. transition mid-scroll
await ev(() => {
  const T = __t; T.start({ players: 2, level: 5, seed: 5 }); T.step(160); Game.debug.god(true);
  T.step(1, [{ right: true }, { left: true }]);
  Game.debug.killAll(); for (let i = 0; i < 800 && T.state().phase !== 'transition'; i++) T.step(1);
  T.step(55);
});
await shot('04_transition_mid');

// 5. boss (round 30 of the stub arena, real graphics)
await ev(() => {
  const T = __t; T.start({ players: 2, level: 30, seed: 8 }); T.step(300); Game.debug.god(true);
  const S = T.S(); S.enemies[0].hp = 31; T.step(200);
});
await shot('05_boss');
await ev(() => {
  const T = __t; const S = T.S(); const boss = S.enemies[0]; boss.hp = 20; boss.flashT = 3; T.step(3);
});
await shot('05b_boss_angry_flash');
await ev(() => {
  const T = __t; const S = T.S(); const boss = S.enemies[0]; S.players[0].x = 24; S.players[1].x = 216; Game.debug.killAll(); T.step(40);
});
await shot('05c_boss_trapped');
await ev(() => { const T = __t; const S = T.S(); S.players[0].x = S.bossBubble.x + 24; S.players[0].y = S.bossBubble.y + 24; T.step(12); });
await shot('05d_boss_pop');
await ev(() => { const S = __t.S(); S.players[0].x = 30; S.players[0].y = 200; S.players[1].x = 210; S.players[1].y = 200; __t.step(70); });
await shot('05e_pearl');
await ev(() => { const T = __t; const S = T.S(); const it = S.items.find((q) => q.kind === 'moonpearl'); S.players[0].x = it.x + 8; S.players[0].y = it.y; T.step(30); });
await shot('05f_victory');

// 5g. ink telegraph (angry face + white pulse, 22 frames before the fan) and the fan itself
await ev(() => {
  const T = __t; T.start({ players: 1, level: 30, seed: 8 }); T.step(160); Game.debug.god(true);
  const S = T.S(), b = S.enemies[0]; S.thunderT = 1e9; b.x = 104; b.y = 56; b.jx = 0; b.jy = 0; b.inkT = 14; S.players[0].x = 24; S.players[0].y = 200;
  T.step(2);
});
await shot('05g_ink_telegraph');
await ev(() => { __t.step(24); });
await shot('05h_ink_fan');

// 6. specials: thunder bolt, fire flames, water stream
await ev(() => {
  const T = __t; T.start({ players: 1, level: 2, seed: 3 }); T.step(160); Game.debug.god(true);
  const S = T.S(), p = S.players[0];
  Game.debug.clearEnemies(); Game.debug.noClear(true);
  Game.debug.spawn('crabbit', 200, 200); Game.debug.spawn('nibbler', 120, 200);
  Game.debug.spawn('thunder', 60, 190); p.x = 60; p.y = 190; p.face = 1; T.step(8);
});
await shot('06a_thunder');
await ev(() => {
  const T = __t; T.start({ players: 1, level: 2, seed: 3 }); T.step(160); Game.debug.god(true); Game.debug.noClear(true);
  const S = T.S(), p = S.players[0]; Game.debug.clearEnemies();
  Game.debug.spawn('springle', 140, 200); S.enemies[0].state = 'frozen'; S.enemies[0].freezeT = 1e9;
  Game.debug.spawn('fire', 130, 190); p.x = 130; p.y = 190; p.onGround = false; T.step(30); p.x = 24;
});
await shot('06b_fire');
await ev(() => {
  const T = __t; T.start({ players: 1, level: 1, seed: 3 }); T.step(160); Game.debug.god(true); Game.debug.noClear(true);
  const S = T.S(), p = S.players[0]; Game.debug.clearEnemies();
  Game.debug.spawn('jellop', 140, 100); Game.debug.spawn('water', 100, 80); p.x = 100; p.y = 80; p.onGround = false; T.step(1); p.x = 24; p.y = 200; T.step(50);
});
await shot('06c_water');

// 7. every enemy: normal, angry, trapped (3 stages), frozen, dying
await ev(() => {
  const T = __t; T.start({ players: 1, level: 20, seed: 3 }); T.step(160); Game.debug.god(true); Game.debug.noClear(true); Game.debug.clearEnemies();
  const S = T.S(); const kinds = ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer'];
  kinds.forEach((k, i) => {
    Game.debug.spawn(k, 40 + i * 40, 56); const e = S.enemies[S.enemies.length - 1]; e.state = 'frozen'; e.freezeT = 1e9;
    Game.debug.spawn(k, 40 + i * 40, 88); const a = S.enemies[S.enemies.length - 1]; a.angry = true; a.state = 'frozen'; a.freezeT = 1e9;
  });
  T.step(2);
});
await shot('07a_enemies_frozen');
await ev(() => {
  const T = __t; T.start({ players: 1, level: 20, seed: 3 }); T.step(160); Game.debug.god(true); Game.debug.noClear(true); Game.debug.clearEnemies();
  const S = T.S(); const kinds = ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer'];
  kinds.forEach((k, i) => { Game.debug.spawn(k, 40 + i * 40, 56); Game.debug.spawn(k, 40 + i * 40, 88); const e = S.enemies[S.enemies.length - 1]; e.angry = true; });
  T.step(30);
});
await shot('07b_enemies_active');
await ev(() => {
  const T = __t; const S = T.S(); Game.debug.clearEnemies(); S.bubbles.length = 0;
  const kinds = ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer'];
  kinds.forEach((k, i) => {
    Game.debug.spawn(k, 40 + i * 40, 56); const e = S.enemies[S.enemies.length - 1]; e.state = 'frozen'; e.freezeT = 1e9;
    S.players[0].x = 20 + i * 40; S.players[0].y = 56; S.players[0].face = 1;
  });
  for (let i = 0; i < 5; i++) { const e = S.enemies[i]; const b = (() => { const q = { }; return q; })(); }
  // trap each with a shot bubble fired from the left of it
  S.enemies.forEach((e, i) => { S.players[0].x = e.x - 24; S.players[0].y = e.y; S.players[0].face = 1; S.players[0].cooldown = 0; T.step(1, [{ fire: true }]); T.step(8); });
  S.bubbles.forEach((b, i) => { b.att = null; b.trapT = [10, 10, 300, 400, 450][i] || 10; });
  T.step(2);
});
await shot('07c_enemies_trapped');
await ev(() => {
  const T = __t; const S = T.S(); Game.debug.clearEnemies(); S.bubbles.length = 0; S.players[0].x = 24; S.players[0].y = 200;
  const kinds = ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer'];
  kinds.forEach((k, i) => { Game.debug.spawn(k, 40 + i * 40, 120); });
  Game.debug.killAll(); T.step(14);
});
await shot('07d_enemies_dying');

// 8. EXTEND, game over
await ev(() => {
  const T = __t; T.start({ players: 2, level: 3, seed: 3 }); Game.debug.god(true); T.step(160); Game.debug.noClear(true);
  const S = T.S(); S.players[0].letters = [true, true, true, false, true, false]; S.players[1].letters = [true, false, false, true, false, false];
  Game.debug.spawn('letter', 100, 160); Game.debug.spawn('letter', 140, 130); T.step(20);
});
await shot('08a_letters');
await ev(() => {
  const T = __t; const S = T.S(); S.players[0].letters = [true, true, true, true, true, false];
  S.bubbles.length = 0; Game.debug.spawn('letter', 100, 200); S.players[0].x = 100; S.players[0].y = 200; T.step(30);
});
await shot('08b_extend');
await ev(() => {
  const T = __t; T.start({ players: 1, level: 3, seed: 3 }); T.step(5); Game.debug.noClear(true); Game.debug.clearEnemies();
  const S = T.S(), p = S.players[0]; p.lives = 1;
  Game.debug.spawn('nibbler', p.x, p.y); T.step(1); Game.debug.clearEnemies(); T.step(130);
});
await shot('08c_gameover');

// 9. v2 effects: pop shockwaves + bursts, chain light, trails, reduced motion
await ev(() => {
  const T = __t; T.start({ players: 2, level: 4, seed: 6 }); T.step(160); Game.debug.god(true); Game.debug.noClear(true); Game.debug.clearEnemies();
  const S = T.S(), p = S.players[0]; p.inv = 0; S.players[1].inv = 0;
  for (let i = 0; i < 8; i++) { Game.debug.spawn(['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer'][i % 5], 50 + i * 20, 120); const e = S.enemies[S.enemies.length - 1]; e.state = 'frozen'; e.freezeT = 1e9; }
  for (let i = 0; i < 6; i++) Game.debug.spawn('thunder', 70 + i * 16, 70);
  S.bubbles.forEach((b) => { b.att = null; b.age = 0; });
  p.x = 70; p.y = 70; Game.debug.give(0, 'bomb'); T.step(6);
});
await shot('09a_chain_light');
await ev(() => { __t.step(10); });
await shot('09b_chain_after');
await ev(() => {
  const T = __t; T.arena({ level: 11, empty: true }); Game.debug.god(true); const p = T.S().players[0]; p.inv = 0; T.step(1, [{ jump: true, right: true }]); T.step(16, [{ right: true }]);
});
await shot('09c_trail_jump');
await ev(() => {
  const T = __t; T.opts({ reducedMotion: true }); T.start({ players: 2, level: 4, seed: 6 }); T.step(160); Game.debug.god(true);
  const S = T.S(); Game.debug.spawn('thunder', 90, 120); S.bubbles[S.bubbles.length - 1].att = null; S.players[0].x = 90; S.players[0].y = 124; T.step(5);
});
await shot('09d_reduced_motion_pop');
await ev(() => { __t.opts({ reducedMotion: false }); });

console.log('errors:', t.errors.length ? t.errors : 'none');
await t.close();
