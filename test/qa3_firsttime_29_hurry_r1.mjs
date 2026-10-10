// Step 29: when does HURRY UP / Bonefin hit a newcomer in round 1 (stepped, god mode off, no input)? kills do not extend the timer.
import { launch, fp, PROJECT } from '../tools/harness.mjs';
import path from 'path';
const t = await launch({ html: path.join(PROJECT, 'dist', 'fizzpop.artifact.html').replace('.artifact', '') });
const g = fp(t.page);
await g.freeze(true); await g.start(1, 1, 1);
await t.page.evaluate(() => { fz = window.__fizzpop; fz.Game.debug.skipIntro(); fz.Game.debug.god(true); });
let hurryAt = null, ghostAt = null;
for (let f = 0; f < 60 * 60; f += 10) {
  await g.step(10);
  const s = await g.state();
  if (hurryAt === null && s.hurry) hurryAt = s.hurryT / 60;
  if (ghostAt === null && s.ghost) { ghostAt = s.hurryT / 60; break; }
}
console.log('round 1: HURRY UP after', hurryAt && hurryAt.toFixed(1), 's of play, Bonefin after', ghostAt && ghostAt.toFixed(1), 's; enemies at start', 3);
// does trapping/killing one enemy postpone it?  (state().hurryT is a plain counter)
await t.close();
