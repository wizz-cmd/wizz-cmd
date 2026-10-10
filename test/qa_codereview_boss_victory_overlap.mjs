// Evidence shot for the boss-hurry bug: pearl grabbed right after the boss bubble pops -> the re-triggered "HURRY UP!" banner is drawn over
// "THE MOON PEARL IS SAFE!", the hurry sfx plays over the clear_boss jingle and the tempo stays 1.3.
import { boot, log, OUT } from './qa_codereview_lib.mjs';
import path from 'path';
const b = await boot({ players: 1, level: 30, seed: 3, god: true });
const { ev } = b;
await ev((H) => { H.D().setHurryTimer(60 * 60 - 1); H.step(2); });                       // fight outlasted the 60 s hurry timer (always true for 2P / real players)
await ev((H) => { H.D().killAll(); H.step(2); H.D().setPlayer(0, { x: H.S().bossBubble.x + 24, y: H.S().bossBubble.y + 24, vy: 0 }); H.step(1); });
await ev((H) => { const it = H.S().items.find((i) => i.kind === 'moonpearl'); H.D().setPlayer(0, { x: it.x + 8, y: it.y + 8, vy: 0 }); H.step(1); });
let shot = false;
for (let i = 0; i < 60 && !shot; i++) {
  await ev((H) => H.step(1));
  const s = await ev((H) => ({ ph: H.S().phase, banner: H.S().hurryBanner, hurry: H.S().hurry, tempo: fz.AUDIO._state().tempo }));
  if (s.ph === 'victory' && Math.floor(s.banner / 5) % 2 === 0 && s.banner > 0) {
    await b.g.shot(path.join(OUT, 'boss_victory_hurry_overlap.png'));
    log('captured at', JSON.stringify(s)); shot = true;
  }
}
log('errors', b.t.errors);
await b.t.close();
