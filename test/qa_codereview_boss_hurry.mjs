// BUG: popBossBubble() clears S.hurry but not S.hurryT, so playLogic() immediately re-runs startHurry():
// "HURRY UP!" banner + sfx + tempo 1.3 + (sfx) over the clear_boss jingle, while collecting the Moon Pearl.
import { boot, log } from './qa_codereview_lib.mjs';
const b = await boot({ players: 1, level: 30, seed: 3, god: true });
const { ev } = b;
// make the fight "long": hurry (60 s) already started
await ev((H) => { H.D().setHurryTimer(60 * 60 - 1); H.step(2); });
log('hurry started?', JSON.stringify(await ev((H) => { const S = H.S(); return { hurry: S.hurry, banner: S.hurryBanner, t: S.hurryT, bossPhase: S.bossPhase }; })));
await ev((H) => { H.D().killAll(); H.step(1); });
await ev((H) => { H.step(5); });
const bb = await ev((H) => ({ ...H.S().bossBubble }));
// put the player on the boss bubble
await ev((H) => { H.D().setPlayer(0, { x: H.S().bossBubble.x + 24, y: H.S().bossBubble.y + 24, vy: 0 }); H.step(1); });
log('popped?', JSON.stringify(await ev((H) => { const S = H.S(); return { bossPhase: S.bossPhase, hurry: S.hurry, banner: S.hurryBanner }; })));
const audio0 = await ev((H) => fz.AUDIO._state());
let rows = [];
for (let i = 0; i < 6; i++) {
  await ev((H) => H.step(1));
  rows.push(await ev((H) => { const S = H.S(); return { bossPhase: S.bossPhase, hurry: S.hurry, banner: S.hurryBanner, tempo: fz.AUDIO._state().tempo }; }));
}
log(JSON.stringify(rows));
log('audio before', JSON.stringify(audio0));
await b.g.shot('/tmp/claude-0/-home-user-wizz-cmd/513fa6d7-0d66-572a-84bd-f54579a0dbcb/scratchpad/fizzpop/out/qa/codereview/boss_hurry_after_pop.png');
const last = rows[rows.length - 1];
log('BUG_REPRODUCED =', last.hurry === true && last.tempo > 1.2 && last.bossPhase === 'pearl');
log('errors', b.t.errors);
await b.t.close();
