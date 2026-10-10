// Enemies finish `enter` at frame 90..138 of the 150-frame intro (READY! banner still on screen) and are immediately hostile.
import { boot, log } from './qa_codereview_lib.mjs';
const b = await boot({ players: 1, level: 3, seed: 3, skipIntro: false });
const { ev } = b;
await ev((H) => H.step(100));
const info = await ev((H) => ({ phase: H.S().phase, phaseT: H.S().phaseT, states: H.S().enemies.map((e) => e.state), p: [H.P(0).x, H.P(0).y] }));
log('frame 100 of intro:', JSON.stringify(info));
// walk the player into an already-active enemy while the READY! banner is still showing
await ev((H) => { const e = H.S().enemies.find((e) => e.state === 'active'); H.D().setPlayer(0, { x: e.x, y: e.y, vy: 0 }); H.step(2); });
const after = await ev((H) => ({ phase: H.S().phase, phaseT: H.S().phaseT, p0: H.P(0).state, lives: H.P(0).lives }));
log('after touching it:', JSON.stringify(after), '=> player killed during the intro banner:', after.p0 === 'dying');
await b.t.close();
