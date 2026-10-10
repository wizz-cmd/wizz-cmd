// Contact sheets: all 30 rounds in play (1x), 2P with all enemies active, to judge palette harmony and sprite/tile separation.
import path from 'path';
import { launch, fp, PROJECT } from '../tools/harness.mjs';
import { grab, montage } from './qa_visual_lib.mjs';
const OUT = path.join(PROJECT, 'out/qa/visual/tiles');
const t = await launch({ viewport: { width: 1280, height: 800 } });
const g = fp(t.page); await g.freeze(true);
for (const [part, rs] of [['a', [...Array(15).keys()].map(i => i + 1)], ['b', [...Array(15).keys()].map(i => i + 16)]]) {
  const tiles = [];
  for (const r of rs) {
    await g.start(2, r, 40 + r); await g.step(2);
    await g.evaluate(() => { fz.Game.debug.god(true); fz.Game.debug.skipIntro(); });
    await g.step(60);
    tiles.push({ dataUrl: await grab(t.page, 0, 0, 256, 224), w: 256, h: 224, label: 'R' + r + ' ' + (await g.evaluate((r) => fz.GFX.theme(r - 1).name, r)) });
  }
  await montage(t.page, path.join(OUT, `all30_${part}.png`), tiles, { scale: 2, cols: 5, gap: 6 });
}
console.log(t.errors);
await t.close();
