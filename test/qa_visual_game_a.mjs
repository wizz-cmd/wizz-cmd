// QA visual: in-game compositions: many entities, trapped stages, angry, frozen, dying, specials, hurry/bonefin, transition, death.
import path from 'path';
import { launch, canvasShot, fp, PROJECT } from '../tools/harness.mjs';
import { crop } from './qa_visual_lib.mjs';
const OUT = path.join(PROJECT, 'out/qa/visual/game');
const t = await launch({ viewport: { width: 1280, height: 800 } });
const g = fp(t.page);
const shot = (name, scale = 3) => canvasShot(t.page, path.join(OUT, name + '.png'), { scale });
await g.freeze(true);

// helpers installed in page
await g.evaluate(() => {
  window.H = {
    S: () => fz.Game.debug._S(),
    spawn(type, x, y, props) { fz.Game.debug.spawn(type, x, y); const S = H.S(); const e = S.enemies[S.enemies.length - 1]; if (props) Object.assign(e, props); return e; },
    trap(type, x, y, frac) {
      const S = H.S(); const e = H.spawn(type, x, y);
      const b = { kind: 'trapped', x, y, state: 'float', age: 0, owner: 0, grace: -1, popAt: 0, chain: null, dead: false, enemy: e, trapT: 0, trapTime: 300, att: null, life: 9999, dir: 1, v: 0, decel: 0, range: 1, dist: 0, letter: '', chainImmune: 0 };
      b.trapT = Math.floor(frac * 300); e.state = 'trapped'; e.bubble = b; e.vx = 0; e.vy = 0; S.bubbles.push(b); return b;
    },
    bub(kind, x, y) { fz.Game.debug.spawn(kind, x, y); const S = H.S(); return S.bubbles[S.bubbles.length - 1]; },
  };
});

// ---- 1. many entities (2P, round 16 crystal caves)
await g.start(2, 16, 5); await g.step(2);
await g.evaluate(() => { const D = fz.Game.debug; D.god(true); D.clearEnemies(); D.skipIntro(); });
await g.evaluate(() => {
  const S = H.S();
  H.spawn('nibbler', 40, 100); H.spawn('crabbit', 150, 40); H.spawn('jellop', 120, 80); H.spawn('springle', 200, 100); H.spawn('glimmer', 70, 60);
  H.spawn('nibbler', 216, 150, { angry: true }); H.spawn('crabbit', 30, 150, { angry: true });
  H.trap('jellop', 100, 120, 0.1); H.trap('springle', 60, 80, 0.6); H.trap('nibbler', 180, 70, 0.9);
  H.bub('thunder', 130, 150); H.bub('fire', 160, 120); H.bub('water', 100, 50); H.bub('letter', 190, 30);
  for (let i = 0; i < 8; i++) { fz.Game.debug.spawn('food_' + i, 40 + i * 24, 184); }
  fz.Game.debug.spawn('pu_clock', 112, 120);
  S.popups.push({ x: 80, y: 90, text: '2000', color: '#ffe36b', t: 0, life: 9999 });
});
await g.step(10); await shot('a1_many'); await crop(t.page, path.join(OUT, 'a1_many_zoom.png'), 16, 16, 224, 208, 5);

// ---- 2. trapped stage strip for each enemy type: crops
for (const stage of [0.1, 0.6, 0.9]) {
  await g.start(1, 1, 5); await g.step(2);
  await g.evaluate(() => { const D = fz.Game.debug; D.clearEnemies(); D.skipIntro(); });
  await g.evaluate((f) => {
    const types = ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer'];
    types.forEach((tp, i) => H.trap(tp, 40 + i * 36, 100, f));
    fz.Game.debug.setPlayer(0, { x: 20, y: 200 });
  }, stage);
  await g.step(8);
  await crop(t.page, path.join(OUT, `a2_trapped_${Math.round(stage * 100)}.png`), 24, 90, 190, 40, 6);
}
// ---- 3. angry vs normal rows + frozen
await g.start(1, 1, 5); await g.step(2);
await g.evaluate(() => { const D = fz.Game.debug; D.clearEnemies(); D.skipIntro(); D.god(true); });
await g.evaluate(() => {
  const types = ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer'];
  types.forEach((tp, i) => { const e = H.spawn(tp, 40 + i * 36, 60, { vx: 0 }); });
  types.forEach((tp, i) => { const e = H.spawn(tp, 40 + i * 36, 110, { angry: true }); });
  types.forEach((tp, i) => { const e = H.spawn(tp, 40 + i * 36, 160); e.state = 'frozen'; e.freezeT = 200; });
});
await g.step(1);
await g.evaluate(() => { const S = H.S(); for (const e of S.enemies) { if (e.state === 'active') { e.vx = 0; e.vy = 0; } } });
await crop(t.page, path.join(OUT, 'a3_normal_angry_frozen.png'), 24, 40, 190, 150, 5);
await shot('a3_full');
console.log('errors', t.errors);
await t.close();
