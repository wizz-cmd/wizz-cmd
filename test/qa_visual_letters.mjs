import path from 'path';
import { launch, fp, PROJECT } from '../tools/harness.mjs';
import { grab, montage } from './qa_visual_lib.mjs';
const OUT = path.join(PROJECT, 'out/qa/visual/hud');
const t = await launch({ viewport: { width: 1280, height: 800 } }); const g = fp(t.page); await g.freeze(true);
const tiles = [];
for (const r of [1, 4, 6, 16, 22, 28]) {
  await g.start(2, r, 3); await g.step(2);
  await g.evaluate(() => { const S = fz.Game.debug._S(); S.players[0].letters = [true, true, false, true, false, false]; S.players[1].letters = [false, true, true, false, false, true]; S.players[0].lives = 5; S.players[1].lives = 4; });
  await g.step(3);
  tiles.push({ dataUrl: await grab(t.page, 0, 16, 16, 208), w: 16, h: 208, label: 'L R' + r });
  tiles.push({ dataUrl: await grab(t.page, 240, 16, 16, 208), w: 16, h: 208, label: 'R R' + r });
}
await montage(t.page, path.join(OUT, 'letters_walls.png'), tiles, { scale: 4, cols: 12, gap: 6 });
await t.close();
