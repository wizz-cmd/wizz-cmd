// QA visual: specials (thunder/fire/water), dying chain, hurry+bonefin, transition, death, game over, extend, 2P overlap.
import path from 'path';
import { launch, canvasShot, fp, PROJECT } from '../tools/harness.mjs';
import { crop } from './qa_visual_lib.mjs';
const OUT = path.join(PROJECT, 'out/qa/visual/game');
const t = await launch({ viewport: { width: 1280, height: 800 } });
const g = fp(t.page);
const shot = (name, scale = 3) => canvasShot(t.page, path.join(OUT, name + '.png'), { scale });
await g.freeze(true);
await g.evaluate(() => {
  window.H = {
    S: () => fz.Game.debug._S(),
    spawn(type, x, y, props) { fz.Game.debug.spawn(type, x, y); const S = H.S(); const e = S.enemies[S.enemies.length - 1]; if (props) Object.assign(e, props); return e; },
    bub(kind, x, y) { fz.Game.debug.spawn(kind, x, y); const S = H.S(); return S.bubbles[S.bubbles.length - 1]; },
    fresh(level, players = 1, seed = 5) { fz.start(players, level, seed); fz.step(2); const D = fz.Game.debug; D.god(true); D.clearEnemies(); D.skipIntro(); },
  };
});
// ---- thunder
await g.evaluate(() => { H.fresh(1); fz.Game.debug.setPlayer(0, { x: 40, y: 200, face: 1 }); H.spawn('nibbler', 110, 200, { vx: 0 }); H.spawn('nibbler', 170, 200, { vx: 0 }); const b = H.bub('thunder', 44, 198); });
for (const n of [6, 10, 12]) { await g.step(n); await shot('b1_thunder_' + n); }
await crop(t.page, path.join(OUT, 'b1_thunder_zoom.png'), 16, 150, 224, 74, 5);
// ---- fire
await g.evaluate(() => { H.fresh(1); const D = fz.Game.debug; D.setPlayer(0, { x: 120, y: 120 }); H.bub('fire', 124, 118); H.spawn('nibbler', 60, 180, { vx: 0 }); });
for (const n of [8, 40, 80]) { await g.step(n); await shot('b2_fire_' + n); }
// ---- water
await g.evaluate(() => { H.fresh(1); const D = fz.Game.debug; D.setPlayer(0, { x: 120, y: 120 }); H.bub('water', 124, 118); H.spawn('nibbler', 60, 180, { vx: 0 }); H.spawn('crabbit', 200, 180, { vx: 0 }); });
for (const n of [8, 40, 70, 110]) { await g.step(n); await shot('b3_water_' + n); }
// ---- dying chain (killAll with 5 enemies)
await g.evaluate(() => { H.fresh(11, 2); ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer', 'nibbler', 'crabbit'].forEach((tp, i) => H.spawn(tp, 40 + i * 28, 70 + (i % 3) * 20)); fz.Game.debug.killAll(); });
for (const n of [4, 12, 20, 25, 40, 40]) { await g.step(n); await shot('b4_dying_' + n); }
// ---- hurry + bonefin
await g.evaluate(() => { H.fresh(6); H.spawn('nibbler', 60, 60); H.spawn('springle', 160, 100); fz.Game.debug.setHurryTimer(2); });
await g.step(8); await shot('b5_hurry_banner');
await g.evaluate(() => { fz.Game.debug.spawn('bonefin', 100, 90); const S = H.S(); S.hurry = true; for (const e of S.enemies) e.angry = true; });
await g.step(20); await shot('b5_bonefin');
await crop(t.page, path.join(OUT, 'b5_bonefin_zoom.png'), 16, 30, 224, 130, 5);
// ---- death
await g.evaluate(() => { H.fresh(3); fz.Game.debug.god(false); const S = H.S(); fz.Game.debug.setPlayer(0, { x: 100, y: 200 }); H.spawn('nibbler', 100, 200); });
await g.step(2);
for (const n of [6, 12, 20, 30, 60, 60]) { await g.step(n); await shot('b6_death_' + n); }
// ---- game over
await g.evaluate(() => { H.fresh(3); fz.Game.debug.god(false); const S = H.S(); S.players[0].lives = 1; fz.Game.debug.setPlayer(0, { x: 100, y: 200 }); H.spawn('nibbler', 100, 200); });
await g.step(100); await shot('b7_gameover_a'); await g.step(60); await shot('b7_gameover_b');
console.log(JSON.stringify(await g.state()).slice(0, 300));
console.log('errors', t.errors);
await t.close();
