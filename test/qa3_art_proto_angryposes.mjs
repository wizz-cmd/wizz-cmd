// QA3 art proposal #2: angry action poses. Patched COPY of dist: *_throw/_squash/_fire get an _angry variant (palette swap + steam) and Game picks it.
import path from 'path';
import fs from 'fs';
import { launch, fp, PROJECT } from '../tools/harness.mjs';
import { patchDist } from './qa3_art_patchlib.mjs';
const O = path.join(PROJECT, 'out/qa3/art/proto'); fs.mkdirSync(O, { recursive: true });
const html = patchDist('fizzpop_angryposes.html', [
  ["    sprite('crabbit_throw', 16, 16, CRAB_PAL, [crabThrow]);", "    const crabThrowFin = sprite('crabbit_throw', 16, 16, CRAB_PAL, [crabThrow]);\n    spriteFinished('crabbit_throw_angry', 16, 16, CRAB_ANGRY, addSteam(crabThrowFin, [[1, 2], [13, 2]]));"],
  ["    sprite('springle_squash', 16, 16, SPRING_PAL, [springFrame('squash', 2)]);", "    const sqFin = sprite('springle_squash', 16, 16, SPRING_PAL, [springFrame('squash', 2)]);\n    spriteFinished('springle_squash_angry', 16, 16, SPRING_ANGRY, addSteam(sqFin, [[11, 3], [13, 5]]));"],
  ["    sprite('glimmer_fire', 16, 16, GLIM_PAL, [glimFrame({ lantern: GLIM_LANTERN_BRIGHT, mouth: [[11, '..lm mttm mmKK KKK.']] })], { skip: 'kg' });", "    const glimFireFin = sprite('glimmer_fire', 16, 16, GLIM_PAL, [glimFrame({ lantern: GLIM_LANTERN_BRIGHT, mouth: [[11, '..lm mttm mmKK KKK.']] })], { skip: 'kg' });\n    spriteFinished('glimmer_fire_angry', 16, 16, GLIM_ANGRY, addSteam(glimFireFin, [[2, 4], [7, 4]]));"],
  ["    if (e.state === 'enter') o.alpha = Math.min(1, Math.max(0, e.enterT) / 30);\n    if (e.state === 'frozen')", "    if (e.angry && GFX.has(name + '_angry')) name += '_angry';        // action poses keep the angry palette\n    if (e.state === 'enter') o.alpha = Math.min(1, Math.max(0, e.enterT) / 30);\n    if (e.state === 'frozen')"],
]);
for (const [tag, h] of [['old', undefined], ['new', html]]) {
  const t = await launch(h ? { html: h } : {});
  const g = fp(t.page);
  await g.freeze(true); await g.start(1, 16, 5);
  // make every enemy show its action pose, angry, side by side on the floor of R16 (blue tiles): crabbit throw, springle squash, glimmer fire
  await g.evaluate(() => {
    const D = fz.Game.debug; D.skipIntro(); D.clearEnemies(); D.god(true); D.noClear(true);
    D.spawn('crabbit', 60, 200); D.spawn('springle', 100, 200); D.spawn('glimmer', 150, 196); D.spawn('crabbit', 190, 200);
    const S = D._S(); S.enemies.forEach((e) => { e.angry = true; e.vx = 0; });
    const [c, s, gl, c2] = S.enemies; c.pauseT = 18; s.sqT = 5; s.onGround = true; gl.poseT = 12; c2.pauseT = 0;
    fz.step(1);
  });
  await g.shot(path.join(O, `angrypose_${tag}.png`), { scale: 4 });
  console.log(tag, t.errors);
  await t.close();
}
