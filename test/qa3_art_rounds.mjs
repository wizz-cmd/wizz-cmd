// QA3 art: real-game frame of all 30 rounds (play phase, enemies present, 2 players) + bgCanvas alone.
import path from 'path';
import fs from 'fs';
import { launch, fp, canvasShot, canvasFnShot, PROJECT } from '../tools/harness.mjs';
const O = path.join(PROJECT, 'out/qa3/art/rounds'); fs.mkdirSync(O, { recursive: true });
const t = await launch({});
const g = fp(t.page);
await g.freeze(true); await g.start(2, 1, 11);
for (let r = 1; r <= 30; r++) {
  await g.evaluate((r) => { const D = fz.Game.debug; D.setLevel(r); D.god(true); D.skipIntro(); fz.step(70); }, r);
  await g.shot(path.join(O, `r${String(r).padStart(2, '0')}.png`), { scale: 1 });
  await canvasFnShot(t.page, path.join(O, `bg${String(r).padStart(2, '0')}.png`), (r) => fz.GFX.bgCanvas(r - 1), { scale: 1, args: [r] });
}
console.log('errors', t.errors);
await t.close();
