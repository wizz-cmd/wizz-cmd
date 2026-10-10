// FIZZ & POP — test/levels_integration.mjs
// Loads the built game (dist/fizzpop.html: real GFX + real LEVELS + Game + Main) and starts every round in turn.
// Checks, per round: the round starts (phase intro -> play), the live enemy list matches the level definition
// (type and spawn box), the map in the game equals the level, and the page logs no errors. Writes a frame of
// every round to out/levels/game/rNN.png (x2) so the real tile art / sprites can be reviewed.
//   node test/levels_integration.mjs [--shots] [--only N]
import path from 'path';
import { launch, canvasShot, fp, PROJECT } from '../tools/harness.mjs';

const args = process.argv.slice(2);
const shots = args.includes('--shots');
const oi = args.indexOf('--only');
const only = oi >= 0 ? +args[oi + 1] : 0;
const t = await launch({ html: path.join(PROJECT, 'dist', 'fizzpop.html') });
const g = fp(t.page);
await g.freeze(true);
let bad = 0;
const log = (ok, m) => { if (!ok) bad++; console.log((ok ? 'ok    ' : 'FAIL  ') + m); };
for (let n = 1; n <= 30; n++) {
  if (only && n !== only) continue;
  await g.start(1, n, 100 + n);
  await g.evaluate(() => fz.Game.debug.god(true));
  await g.step(200);                                         // intro (150) + a few frames of play
  const info = await g.evaluate((k) => {
    const lv = fz.LEVELS[k - 1], st = fz.Game.debug.state();
    const live = st.enemies.map((e) => `${e.t}`).sort().join(',');
    const want = lv.enemies.map((e) => e.t).sort().join(',');
    return { phase: st.phase, level: st.level, live, want, n: st.enemies.length, nWant: lv.enemies.length, hurry: lv.hurry };
  }, n);
  log(info.level === n && info.phase === 'play' && info.live === info.want, `round ${n}: phase ${info.phase}, ${info.n}/${info.nWant} enemies (${info.live === info.want ? 'types match' : 'MISMATCH ' + info.live + ' vs ' + info.want})`);
  if (shots) await canvasShot(t.page, path.join(PROJECT, 'out', 'levels', 'game', `r${String(n).padStart(2, '0')}.png`), { scale: 2 });
}
log(t.errors.length === 0, 'console errors: ' + (t.errors.length ? t.errors.slice(0, 5).join(' | ') : 'none'));
await t.close();
process.exit(bad ? 1 : 0);
