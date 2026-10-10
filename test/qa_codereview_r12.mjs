// R12 evidence: top-row notch pits permanently hold walkers; screenshot + escape attempts count.
import { boot, log, OUT } from './qa_codereview_lib.mjs';
import path from 'path';
import { reachability } from '../tools/validate_levels.mjs';
const b = await boot({ players: 1, level: 12, seed: 1, god: true });
const { ev, g } = b;
await ev((H) => { H.D().noClear(true); H.D().setHurryTimer(-1e7); });
for (const n of [600, 1500, 2400]) {
  await ev((H) => { H.D().setHurryTimer(-1e7); H.step(600); });
  const s = await ev((H) => H.S().enemies.map((e) => e.t[0] + '@' + Math.round(e.x) + ',' + Math.round(e.y) + (e.onGround ? 'g' : '')));
  log('t+' + (n) + ' frames:', s.join(' '));
}
await g.shot(path.join(OUT, 'r12_enemies_stuck_at_top.png'));
// is the row-3 platform next to the notch reachable by P1 per the validator model?
const map = await ev((H) => fz.LEVELS[11].map);
const { reach } = reachability(map);
log('validator: row-3 surface cols reachable:', [7, 8, 12, 13, 19, 22, 23].map((c) => c + ':' + reach.has(3 * 32 + c)).join(' '));
await b.t.close();
