// QA3 art: how often does an ANGRY enemy draw its action pose (which has NO angry palette)? Real game, 1200 frames per type.
import path from 'path';
import fs from 'fs';
import { launch, fp, canvasShot, PROJECT } from '../tools/harness.mjs';
const O = path.join(PROJECT, 'out/qa3/art'); 
const t = await launch({});
const g = fp(t.page);
await g.freeze(true); await g.start(1, 17, 5);
const res = {};
for (const ty of ['springle', 'crabbit', 'glimmer']) {
  const r = await g.evaluate((ty) => {
    const D = fz.Game.debug; D.setLevel(17); D.skipIntro(); D.clearEnemies(); D.god(true); D.noClear(true);
    D.setPlayer(0, { x: 40, y: 200 });
    D.spawn(ty, 120, 190);
    const S = D._S(); const e = S.enemies[S.enemies.length - 1]; e.angry = true;
    let pose = 0, n = 0, firstPoseShot = null;
    for (let i = 0; i < 1200; i++) {
      fz.step(1);
      const cur = S.enemies.find((x) => x === e); if (!cur || cur.dead || cur.state !== 'active') break;
      cur.angry = true;
      const isPose = (ty === 'crabbit' && cur.pauseT > 0) || (ty === 'springle' && cur.onGround && cur.sqT > 0) || (ty === 'glimmer' && cur.poseT > 0);
      n++; if (isPose) pose++;
      // keep the player away from contact
      D.setPlayer(0, { x: 40, y: 200, vx: 0, vy: 0, inv: 100 });
    }
    return { frames: n, poseFrames: pose, share: +(pose / Math.max(1, n)).toFixed(3) };
  }, ty);
  res[ty] = r; console.log(ty, JSON.stringify(r));
}
fs.writeFileSync(path.join(O, 'angrypose.json'), JSON.stringify(res, null, 1));
await t.close();
