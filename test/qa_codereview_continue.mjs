// CONTINUE flow: reach round >= 6, quit/die, title offers CONTINUE ROUND n (first round of the theme), same player count, score 0.
import { launch, fp, log } from './qa_codereview_lib.mjs';
const t = await launch({});
const g = fp(t.page);
await g.freeze(true);
const items = () => g.evaluate(() => { const s = fz._main.session(); return s; });
log('session at boot', JSON.stringify(await items()));
await g.start(2, 1, 5);
await g.evaluate(() => { fz.Game.debug.setLevel(13); fz.Game.debug.skipIntro(); });
await g.step(5);
await g.goto('pause');                       // pause -> QUIT through the real menu
await g.set(0, { down: true }); await g.step(1); await g.set(0, { down: false }); await g.step(1);
await g.set(0, { fire: true }); await g.step(1); await g.set(0, { fire: false }); await g.step(2);
log('after QUIT: scene', await g.scene(), 'session', JSON.stringify(await items()));
// click through the title menu: items -> CONTINUE
await g.step(30);
const menu = [];
for (let i = 0; i < 5; i++) { menu.push(await g.evaluate(() => { /* title items are private; read via a screenshot-free probe */ return fz._main.session(); })); }
// navigate: down x2 -> CONTINUE (items: 1P, 2P, CONTINUE, SOUND)
for (let k = 0; k < 2; k++) { await g.set(0, { down: true }); await g.step(1); await g.set(0, { down: false }); await g.step(1); }
await g.set(0, { fire: true }); await g.step(1); await g.set(0, { fire: false });
await g.step(300);                                        // story is 240 frames; then play
const st = await g.evaluate(() => { const s = fz.Game.debug.state(); return { scene: fz.scene(), level: s.level, players: s.players.length, scores: s.players.map((p) => p.score), lives: s.players.map((p) => p.lives) }; });
log('after CONTINUE:', JSON.stringify(st), '(expect round 11, 2 players, score 0, 3 lives)');
log('errors', t.errors);
await t.close();
