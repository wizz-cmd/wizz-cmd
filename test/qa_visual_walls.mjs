// Left-wall strip (round digits, EXTEND ghost letters, life icons) for all 30 rounds side by side at x4.
import path from 'path';
import { launch, fp, PROJECT } from '../tools/harness.mjs';
import { grab, montage } from './qa_visual_lib.mjs';
const OUT = path.join(PROJECT, 'out/qa/visual/hud');
const t = await launch({ viewport: { width: 1280, height: 800 } });
const g = fp(t.page); await g.freeze(true);
const tiles = [];
for (let r = 1; r <= 30; r++) {
  await g.start(2, r, 9); await g.step(3);
  // 2P game so both lives and 2UP show; left wall strip 0..16 x 16..224 + gap + right wall
  tiles.push({ dataUrl: await grab(t.page, 0, 16, 16, 208), w: 16, h: 208, label: 'R' + r });
}
await montage(t.page, path.join(OUT, 'leftwall_all30.png'), tiles, { scale: 3, cols: 15, gap: 6 });
const tiles2 = [];
for (let r = 1; r <= 30; r++) {
  await g.start(2, r, 9); await g.step(3);
  tiles2.push({ dataUrl: await grab(t.page, 240, 16, 16, 208), w: 16, h: 208, label: 'R' + r });
}
await montage(t.page, path.join(OUT, 'rightwall_all30.png'), tiles2, { scale: 3, cols: 15, gap: 6 });
console.log(t.errors);
await t.close();
