import path from 'path';
import fs from 'fs';
import { launch, fp, canvasShot, PROJECT } from '../tools/harness.mjs';
import { patchDist } from './qa3_art_patchlib.mjs';
const O = path.join(PROJECT, 'out/qa3/art/proto'); fs.mkdirSync(O, { recursive: true });
const oldBolt = `  const BOLT = [
    boltFrame([[0, 3], [2, 2], [4, 4], [6, 2], [8, 4], [10, 2], [12, 4], [15, 3]]),
    boltFrame([[0, 3], [2, 4], [4, 2], [6, 4], [8, 2], [10, 4], [12, 2], [15, 3]]),
  ];`;
const newBolt = `  const BOLT = [   // QA3 proposal: Z-stairs lightning, 2 px yellow stroke + 1 px white core, vertical mirror = shimmer frame
    outlineGrid(polyline(16, 8, [[0, 1], [4, 1], [2, 3], [8, 3], [6, 5], [15, 5]], 'w', 1, polyline(16, 8, [[0, 1], [4, 1], [2, 3], [8, 3], [6, 5], [15, 5]], 'y', 2)), 'o', false),
    outlineGrid(polyline(16, 8, [[0, 5], [4, 5], [2, 3], [8, 3], [6, 1], [15, 1]], 'w', 1, polyline(16, 8, [[0, 5], [4, 5], [2, 3], [8, 3], [6, 1], [15, 1]], 'y', 2)), 'o', false),
  ];`;
const newBolt3 = `  const BOLT = [   // QA3 proposal G: single Z, 3 px stroke (1 white core row + 2 yellow rows), mirror frame
    polyline(16, 8, [[0, 1], [6, 1], [3, 4], [15, 4]], 'w', 1, polyline(16, 8, [[0, 1], [6, 1], [3, 4], [15, 4]], 'y', 3)),
    polyline(16, 8, [[0, 4], [6, 4], [3, 1], [15, 1]], 'w', 1, polyline(16, 8, [[0, 4], [6, 4], [3, 1], [15, 1]], 'y', 3)),
  ];`;
const htmlNew3 = patchDist('fizzpop_bolt3.html', [[oldBolt, newBolt3]]);
const htmlNew = patchDist('fizzpop_bolt.html', [[oldBolt, newBolt], ["sprite('bolt', 16, 8, { y: '#ffe23a', w: '#ffffff' }, BOLT, { diag: true });", "sprite('bolt', 16, 8, { y: '#ffe23a', w: '#ffffff' }, BOLT, { diag: true });"]]);
for (const [tag, html] of [['new3', htmlNew3]]) {
  const t = await launch(html ? { html } : {});
  const g = fp(t.page);
  await g.freeze(true);
  await g.start(1, 12, 9);
  await g.evaluate(() => { const D = fz.Game.debug; D.god(true); D.noClear(true); D.skipIntro(); D.setPlayer(0, { x: 40, y: 200, vx: 0, vy: 0, face: 1 }); });
  await g.evaluate(() => { const D = fz.Game.debug; D.spawn('nibbler', 170, 200); D.spawn('crabbit', 200, 120); D.spawn('thunder', 44, 196); });
  for (const k of [6, 14, 24]) { await g.step(k === 6 ? 6 : 8); await g.shot(path.join(O, `bolt_${tag}_f${k}.png`), { scale: 4 }); }
  console.log(tag, t.errors);
  await t.close();
}
