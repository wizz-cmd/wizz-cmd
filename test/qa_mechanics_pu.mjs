import { boot, OUT, canvasShot } from './qa_mechanics_lib.mjs';
const { t, g, ev, page } = await boot({ level: 3, clear: true, god: true });
const out = {};
out.spawn = await ev((H) => {
  const res = []; const kinds = {};
  const lv = [1, 3, 7, 12, 20];
  for (let seed = 1; seed <= 150; seed++) {
    fz.start(1, lv[seed % lv.length], seed);
    fz.Game.debug.skipIntro(); fz.Game.debug.clearEnemies(); fz.Game.debug.noClear(true); fz.Game.debug.god(true);
    let first = null;
    for (let i = 0; i < 1400 && !first; i++) {
      fz.step(1);
      const it = fz.Game.debug.state().items.find(it => it.kind.startsWith('pu_'));
      if (it) first = { t: i, kind: it.kind, x: it.x, y: it.y };
    }
    if (first) { kinds[first.kind] = (kinds[first.kind] || 0) + 1; res.push(first); }
    else res.push(null);
  }
  const times = res.filter(Boolean).map(r => r.t);
  // distance to player at spawn (player at 24,200)
  const near = res.filter(Boolean).filter(r => Math.hypot(r.x - 24, r.y - 200) < 32).length;
  return { n: res.length, none: res.filter(r => !r).length, minT: Math.min(...times), maxT: Math.max(...times), kinds, nearPlayerSpawn: near };
});
console.log(JSON.stringify(out.spawn));
console.log('errors', t.errors);
await t.close();
