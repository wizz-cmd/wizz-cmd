// P2 joining mid boss fight adds +30 HP to the boss (addPlayer2, 40_game.js ~374) regardless of how low it already is.
import { boot, log } from './qa_codereview_lib.mjs';
const b = await boot({ players: 1, level: 30, seed: 4, god: true });
const { ev } = b;
await ev((H) => { H.S().enemies[0].hp = 3; H.step(1); });
const before = await ev((H) => ({ hp: H.snap().bossHp, max: H.S().bossMax }));
await ev((H) => { fz.Game.join(1); H.step(1); });
const after = await ev((H) => ({ hp: H.snap().bossHp, max: H.S().bossMax, n: H.S().players.length }));
log('before join', JSON.stringify(before), ' after join', JSON.stringify(after), ' => boss healed by', after.hp - before.hp);
await b.g.shot('/tmp/claude-0/-home-user-wizz-cmd/513fa6d7-0d66-572a-84bd-f54579a0dbcb/scratchpad/fizzpop/out/qa/codereview/boss_join_heal.png');
await b.t.close();
