import path from 'path';
import fs from 'fs';
import { launch, fp, PROJECT } from '../tools/harness.mjs';
const O = path.join(PROJECT, 'out/qa3/art/transition'); fs.mkdirSync(O, { recursive: true });
const t = await launch({});
const g = fp(t.page);
await g.freeze(true);
for (const [lv, tag] of [[5, 'r5to6'], [15, 'r15to16'], [25, 'r25to26']]) {
  await g.start(1, lv, 3);
  await g.evaluate(() => { const D = fz.Game.debug; D.god(true); D.skipIntro(); });
  await g.step(30);
  await g.evaluate(() => fz.Game.debug.killAll());
  let n = 0, shots = 0;
  for (let i = 0; i < 900 && shots < 6; i++) {
    await g.step(1);
    const s = await g.state();
    if (s.phase === 'transition') { n++; if (n % 24 === 3) { await g.shot(path.join(O, `${tag}_${String(shots).padStart(2, '0')}.png`), { scale: 2 }); shots++; } }
  }
  console.log(tag, 'shots', shots);
}
console.log(t.errors);
await t.close();
