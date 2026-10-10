// QA3 art: real-game enemy line-ups (normal / angry / frozen) on the 6 theme tiles, raw 1x frames; PIL builds crops.
import path from 'path';
import { launch, fp, canvasShot, PROJECT } from '../tools/harness.mjs';
const O = path.join(PROJECT, 'out/qa3/art/enemies');
const t = await launch({});
const g = fp(t.page);
await g.freeze(true); await g.start(1, 1, 7);
const rounds = [1, 6, 11, 16, 21, 26];
const types = ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer'];
for (const r of rounds) {
  for (const mode of ['normal', 'angry', 'frozen']) {
    await g.evaluate((r, mode, types) => {
      const D = fz.Game.debug; D.setLevel(r); D.skipIntro(); D.clearEnemies(); D.god(true);
      const xs = [52, 72, 92, 150, 170];
      types.forEach((ty, i) => D.spawn(ty, xs[i], 200));
      const S = D._S();
      S.enemies.forEach((e) => { e.animT = 0; e.pauseT = 0; e.sqT = 0; e.d = i2d(e.t); if (mode === 'angry') e.angry = true; if (mode === 'frozen') { e.state = 'frozen'; e.freezeT = 300; } });
      function i2d() { return 1; }
      fz.step(1);
    }, r, mode, types);
    await g.shot(path.join(O, `r${r}_${mode}_x1.png`), { scale: 1 });
  }
}
console.log('errors', t.errors);
await t.close();
