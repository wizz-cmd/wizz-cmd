import path from 'path';
import fs from 'fs';
import { launch, fp, PROJECT } from '../tools/harness.mjs';
import { patchDist } from './qa3_art_patchlib.mjs';
const O = path.join(PROJECT, 'out/qa3/art/proto');
const html = patchDist('fizzpop_nibcog.html', [["t: '#e4602a', s: '#eef2fb', S: '#9aa6c4', k: '#3a2a50', w: '#ffffff', e: '#2a1347', g: '#eef2fb'", "t: '#e4602a', s: '#8d99bd', S: '#4b5677', k: '#2a1f40', w: '#ffffff', e: '#2a1347', g: '#eef2fb'"]]);
for (const [tag, h] of [['old', undefined], ['new', html]]) {
  const t = await launch(h ? { html: h } : {});
  const g = fp(t.page);
  await g.freeze(true); await g.start(1, 1, 5);
  await g.evaluate(() => { const D = fz.Game.debug; D.skipIntro(); D.clearEnemies(); D.god(true); D.noClear(true); [60, 90, 150, 180].forEach((x, i) => D.spawn('nibbler', x, 200)); const S = D._S(); S.enemies.forEach((e, i) => { e.vx = 0; e.animT = i * 6; e.d = i < 2 ? 1 : -1; }); fz.step(1); });
  await g.shot(path.join(O, `nibcog_${tag}.png`), { scale: 1 });
  await t.close();
}
