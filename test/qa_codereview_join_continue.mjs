// Main: session.lastPlayers is only updated on scene enter (play) and in finishGame(); a 1P game that P2 joined and then QUIT leaves lastPlayers=1,
// so CONTINUE (title) restarts as 1P although it was a 2P game (50_main.js scenes.play.enter ~1099 / leave ~1102, finishGame ~542).
import { launch, fp, log } from './qa_codereview_lib.mjs';
const t = await launch({});
const g = fp(t.page);
await g.freeze(true);
await g.start(1, 1, 5);
await g.evaluate(() => { fz.Game.debug.setLevel(8); fz.Game.debug.skipIntro(); fz.Game.join(1); });
await g.step(3);
log('players in game:', await g.evaluate(() => fz.Game.result().players));
await g.goto('pause');
await g.set(0, { down: true }); await g.step(1); await g.set(0, { down: false }); await g.step(1);
await g.set(0, { fire: true }); await g.step(1); await g.set(0, { fire: false }); await g.step(2);
log('after QUIT: scene', await g.scene(), 'session', JSON.stringify(await g.evaluate(() => fz._main.session())));
for (let k = 0; k < 2; k++) { await g.set(0, { down: true }); await g.step(1); await g.set(0, { down: false }); await g.step(1); }
await g.set(0, { fire: true }); await g.step(1); await g.set(0, { fire: false });
await g.step(300);
log('CONTINUE started a game with players =', await g.evaluate(() => fz.Game.result().players), '(was 2)');
log('errors', t.errors);
await t.close();
