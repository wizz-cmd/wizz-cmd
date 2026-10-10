// BUG: defeating the boss (HP 0 -> defeatBoss) leaves the Bonefin ghost alive and hunting for the whole `trapped` phase (the boss bubble
// rises at 0.3 px/frame, up to ~600 frames) -- a player who just won the fight can still lose a life to the ghost before popping the bubble.
// Only popBossBubble() clears S.ghost. (40_game.js defeatBoss ~1124, popBossBubble ~1144, playLogic bossBusy ~1277)
import { boot, log } from './qa_codereview_lib.mjs';
const b = await boot({ players: 1, level: 30, seed: 5 });
const { ev } = b;
await ev((H) => { H.D().setHurryTimer(60 * 60 + 600); H.step(3); });
log('before defeat', JSON.stringify(await ev((H) => ({ hurry: H.S().hurry, ghost: !!H.S().ghost, phase: H.S().bossPhase, lives: H.P(0).lives }))));
await ev((H) => { H.D().killAll(); H.step(1); });
log('boss defeated, bubble floating:', JSON.stringify(await ev((H) => ({ ghost: !!H.S().ghost, hurry: H.S().hurry, phase: H.S().bossPhase, lives: H.P(0).lives }))));
// player idles at the spawn pad (e.g. waiting for the bubble to drift down / choosing a route); count frames until the dead boss's ghost kills him
const r = await ev((H) => { let n = 0; while (H.P(0).state === 'normal' && n < 1500 && H.S().bossPhase === 'trapped') { H.step(1); n++; } return { frames: n, p: H.P(0).state, lives: H.P(0).lives, bossPhase: H.S().bossPhase }; });
log('after idling:', JSON.stringify(r));
log('BUG_REPRODUCED (player killed by Bonefin while boss already defeated) =', r.p === 'dying' && r.bossPhase === 'trapped');
log('errors', b.t.errors);
await b.t.close();
