// QA visual: transition mid-scroll, hurry banner, extend, pause, boss (normal / angry / trapped / pearl / victory), joined 2P.
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
    fresh(level, players = 1, seed = 5) { fz.start(players, level, seed); fz.step(2); const D = fz.Game.debug; D.god(true); D.clearEnemies(); D.skipIntro(); },
  };
});
// ---- transition: round 5 -> 6 (theme change) mid-scroll
await g.evaluate(() => { H.fresh(5, 2); fz.Game.debug.killAll(); });
let guard = 0;
while ((await g.state()).phase !== 'transition' && guard++ < 60) await g.step(10);
console.log('phase', (await g.state()).phase);
for (const n of [10, 30, 30, 30]) { await g.step(n); await shot('c1_transition_' + (await g.state()).phaseT); }
// ---- hurry banner
await g.evaluate(() => { H.fresh(6); H.spawn('nibbler', 60, 60); fz.Game.debug.setHurryTimer(1); });
await g.step(3); await shot('c2_hurry_a'); await g.step(5); await shot('c2_hurry_b');
// ---- extend
await g.evaluate(() => { H.fresh(7, 1); H.spawn('nibbler', 60, 60); const S = H.S(); S.players[0].letters = [true, true, true, true, true, false]; fz.Game.debug.spawn('letter', 120, 150); fz.Game.debug.setPlayer(0, { x: 120, y: 150 }); });
await g.step(4);
for (const n of [20, 40, 60]) { await g.step(n); await shot('c3_extend_' + n); }
// ---- pause
await g.evaluate(() => { H.fresh(2); H.spawn('nibbler', 60, 60); });
await g.step(10);
await g.evaluate(() => fz._main.setPaused(true)); await g.step(2); await shot('c4_pause');
await g.evaluate(() => fz._main.setPaused(false));
// ---- boss
await g.evaluate(() => { fz.start(1, 30, 5); fz.step(2); fz.Game.debug.god(true); });
await g.step(50); await shot('c5_boss_intro');
await g.evaluate(() => { fz.Game.debug.skipIntro(); }); await g.step(200); await shot('c5_boss_play');
await crop(t.page, path.join(OUT, 'c5_boss_zoom.png'), 16, 16, 224, 208, 5);
await g.evaluate(() => { const S = H.S(); const b = S.enemies.find(e => e.t === 'kraken'); b.hp = 20; });
await g.step(30); await shot('c5_boss_angry');
await g.evaluate(() => { const S = H.S(); const b = S.enemies.find(e => e.t === 'kraken'); b.flashT = 4; });
await g.step(1); await shot('c5_boss_flash'); await g.step(1);
await g.evaluate(() => { const S = H.S(); const b = S.enemies.find(e => e.t === 'kraken'); b.hp = 1; fz.Game.debug.killAll(); });
await g.step(10); await shot('c5_boss_trapped');
await crop(t.page, path.join(OUT, 'c5_boss_trapped_zoom.png'), 16, 16, 224, 208, 5);
await g.evaluate(() => { const S = H.S(); fz.Game.debug.setPlayer(0, { x: S.bossBubble.x + 24, y: S.bossBubble.y + 24 }); });
await g.step(4); await shot('c5_boss_pop'); await g.step(20); await shot('c5_boss_pearl');
await g.step(100); await shot('c5_boss_pearl2');
await g.evaluate(() => { const S = H.S(); const it = S.items.find(i => i.kind === 'moonpearl'); fz.Game.debug.setPlayer(0, { x: it.x + 8, y: it.y + 8 }); });
await g.step(10); await shot('c6_victory_a'); await g.step(120); await shot('c6_victory_b');
console.log(JSON.stringify((await g.state())).slice(0,200));
console.log('errors', t.errors);
await t.close();
