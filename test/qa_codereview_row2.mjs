// Landable tiles in row 2 (rounds 8, 11, 19, 23, 26): standing y = 16 < PLAY_TOP (24). Jumping from there hits the rising-ceiling
// clamp (40_game.js physStep: `else if (e.y < PLAY_TOP) { e.y = PLAY_TOP; ...}`), which moves the entity DOWN 8 px into the platform,
// so it falls through the one-way platform instead of jumping.
import { boot, log, canvasShot } from './qa_codereview_lib.mjs';
import path from 'path';
import { OUT } from './qa_codereview_lib.mjs';
const b = await boot({ players: 1, level: 8, seed: 2, god: true });
const { ev } = b;
await ev((H) => { H.D().clearEnemies(); H.D().noClear(true); });
// drop the player from the top (as if wrapped from a floor gap) onto the row-2 platform (cols 14-17 -> x 112..143)
await ev((H) => { H.D().setPlayer(0, { x: 120, y: 0, vy: 0, vx: 0 }); });
for (let i = 0; i < 20; i++) await ev((H) => H.step(1));
const st = await ev((H) => ({ y: H.P(0).y, g: H.P(0).onGround }));
log('after drop from y=0: y=', st.y, 'onGround=', st.g, '(standing y=16 means feet on the row-2 platform top)');
await b.g.shot(path.join(OUT, 'row2_standing.png'));
const ys = [];
for (let i = 0; i < 60; i++) { await ev((H, i) => H.step(1, () => [{ jump: i === 0 }]), i); ys.push(await ev((H) => +H.P(0).y.toFixed(2))); }
log('y trace after pressing jump:', ys.slice(0, 30).join(' '));
log('final y', ys[ys.length - 1], 'onGround', await ev((H) => H.P(0).onGround), '=> fell through platform:', ys[ys.length - 1] > 40);
log('errors', b.t.errors);
await b.t.close();
