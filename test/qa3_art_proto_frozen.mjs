// QA3 art: frozen look (wash alpha 0.7 vs 0.4 + dark inner contrast), 5 enemies x 3 tile themes, x6 crops
import path from 'path';
import fs from 'fs';
import { launch, fp, PROJECT } from '../tools/harness.mjs';
import { patchDist } from './qa3_art_patchlib.mjs';
const O = path.join(PROJECT, 'out/qa3/art/proto');
const html = patchDist('fizzpop_frozen.html', [["    drawTinted(ctx, name, frame, e.x, e.y, flip, '#e4f6ff', 0.7);", "    drawTinted(ctx, name, frame, e.x, e.y, flip, '#cfeeff', 0.38);"]]);
for (const [tag, h] of [['old', undefined], ['new', html]]) {
  const t = await launch(h ? { html: h } : {});
  const g = fp(t.page);
  await g.freeze(true);
  for (const r of [1, 16]) {
    await g.start(1, r, 5);
    await g.evaluate(() => { const D = fz.Game.debug; D.skipIntro(); D.clearEnemies(); D.god(true); D.noClear(true);
      ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer'].forEach((ty, i) => D.spawn(ty, 52 + i * 22, 200));
      const S = D._S(); S.enemies.forEach((e) => { e.animT = 0; e.sqT = 0; e.state = 'frozen'; e.freezeT = 300; }); fz.step(1); });
    await g.shot(path.join(O, `frozen_${tag}_r${r}.png`), { scale: 1 });
  }
  await t.close();
}
