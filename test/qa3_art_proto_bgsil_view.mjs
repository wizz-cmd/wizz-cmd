import path from 'path';
import { launch, fp, PROJECT } from '../tools/harness.mjs';
const O = path.join(PROJECT, 'out/qa3/art/proto');
const html = path.join(O, 'fizzpop_bgsil.html');   // built by qa3_art_bgstats.mjs --patched
const rows = [];
for (const [tag, h] of [['old', undefined], ['new', html]]) {
  const t = await launch(h ? { html: h } : {});
  const g = fp(t.page);
  await g.freeze(true);
  for (const r of [13, 28]) {
    await g.start(2, r, 5);
    await g.evaluate(() => { const D = fz.Game.debug; D.god(true); D.skipIntro(); fz.step(60); });
    await g.shot(path.join(O, `bgsil_${tag}_r${r}.png`), { scale: 2 });
  }
  await t.close();
}
