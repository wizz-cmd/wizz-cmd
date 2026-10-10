import path from 'path';
import { launch, canvasShot, fp, PROJECT } from '../tools/harness.mjs';
const OUT = path.join(PROJECT, 'out/qa/visual/rounds');
const t = await launch({ viewport: { width: 1280, height: 800 } });
const g = fp(t.page);
const shot = (name, scale = 3) => canvasShot(t.page, path.join(OUT, name + '.png'), { scale });
await g.freeze(true);
for (const r of [1, 6, 11, 16, 21, 26]) {
  await g.start(1, r, 100 + r);
  await g.step(20); await shot(`r${r}_intro20`);
  await g.step(50); await shot(`r${r}_intro70`);
  await g.step(100); await shot(`r${r}_play`);
  await g.step(200); await shot(`r${r}_play300`);
}
console.log(t.errors);
await t.close();
