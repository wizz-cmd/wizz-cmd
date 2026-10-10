// QA3 art: facing legibility at 1x in the real game. P1 and P2 in 4 poses, facing left then right, standing on the R1 floor.
// Output: raw 1x frames; PIL crops them afterwards. Also numeric: eye/mouth centroid shift, silhouette asymmetry per pose.
import path from 'path';
import fs from 'fs';
import { launch, fp, canvasShot, PROJECT } from '../tools/harness.mjs';
const O = path.join(PROJECT, 'out/qa3/art/facing'); fs.mkdirSync(O, { recursive: true });
const t = await launch({});
const g = fp(t.page);
await g.freeze(true); await g.start(2, 1, 3);
await g.evaluate(() => { const D = fz.Game.debug; D.god(true); D.skipIntro(); D.clearEnemies(); D.noClear(true); });
// Poses: idle (no input), walk (hold direction a few frames), jump (jump input then 4 frames), shoot (fire)
for (const face of [-1, 1]) {
  for (const pose of ['idle', 'walk', 'jump', 'shoot']) {
    await g.evaluate((face) => { const D = fz.Game.debug; D.setPlayer(0, { x: 100, y: 200, vx: 0, vy: 0, face, onGround: true, shootT: 0, cooldown: 0, inv: 0 }); D.setPlayer(1, { x: 140, y: 200, vx: 0, vy: 0, face, onGround: true, shootT: 0, cooldown: 0, inv: 0 }); }, face);
    const dir = face < 0 ? 'left' : 'right';
    const inp = pose === 'walk' ? { [dir]: true } : pose === 'jump' ? { jump: true } : pose === 'shoot' ? { fire: true } : {};
    await g.set(0, inp); await g.set(1, inp);
    await g.step(pose === 'walk' ? 7 : pose === 'jump' ? 8 : pose === 'shoot' ? 3 : 2);
    await g.clear();
    await g.shot(path.join(O, `${pose}_${face < 0 ? 'L' : 'R'}.png`), { scale: 1 });
    const s = await g.state(); console.log(pose, face, JSON.stringify(s.players.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y), face: p.face }))));
  }
}
await t.close();
