// Row-2 shelves (R8 R11 R19 R23): enemies that hop up there have their head in the ceiling row. How long do they stay?
import { boot, log, check } from './qa3_diffreview_lib.mjs';
const b = await boot({ players: 1, level: 1, seed: 1 });
const cases = [[8, 14, 17], [11, 14, 17], [19, 7, 8], [23, 15, 16]];
const res = [];
for (const [L, c0, c1] of cases) for (const type of ['springle', 'nibbler', 'crabbit']) for (const seed of [1, 2, 3]) {
  const r = await b.page.evaluate(([L, c0, c1, type, seed]) => {
    fz.start(1, L, seed); const D = fz.Game.debug; D.skipIntro(); D.god(true); D.noClear(true); D.clearEnemies(); D.setHurryTimer(-1e7);
    const S = D._S(); S.players[0].x = 24; S.players[0].y = 200;
    D.spawn(type, c0 * 8 + (c1 - c0) * 4, 16);   // stand on the shelf: feet at 32
    const e = S.enemies[S.enemies.length - 1];
    let frames = 0, left = -1, relocated = false;
    for (let f = 0; f < 3000; f++) {
      D.setHurryTimer(-1e7); const x0 = e.x, y0 = e.y; fz.step(1);
      if (Math.hypot(e.x - x0, e.y - y0) > 30) relocated = true;
      if (e.y > 33 && left < 0) { left = f; }
      if (left >= 0) break;
    }
    return { L, type, seed, leftAfter: left, relocated, y: e.y };
  }, [L, c0, c1, type, seed]);
  res.push(r);
}
for (const r of res) log(`R${r.L} ${r.type} seed${r.seed}: left the shelf after ${r.leftAfter} frames (${(r.leftAfter / 60).toFixed(1)} s)${r.relocated ? ' RELOCATED' : ''}`);
const worst = Math.max(...res.map((r) => (r.leftAfter < 0 ? 3000 : r.leftAfter)));
log('worst frames', worst);
check('SH1 an enemy standing on a row-2 shelf leaves within 6 s', worst <= 360, res.filter((r) => r.leftAfter < 0 || r.leftAfter > 360));
await b.t.close();
