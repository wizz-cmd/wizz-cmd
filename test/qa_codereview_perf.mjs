// update+render cost per frame in a busy scene (many bubbles, enemies, fx, popups, streams), plus score-string cache churn.
import { boot, log } from './qa_codereview_lib.mjs';
const b = await boot({ players: 2, level: 20, seed: 8, god: true });
const r = await b.page.evaluate(() => {
  const D = fz.Game.debug; const rnd = fz.U.rng(3);
  for (let i = 0; i < 30; i++) D.spawn(rnd.pick(['thunder', 'fire', 'water']), rnd.int(20, 210), rnd.int(40, 190));
  for (let i = 0; i < 8; i++) D.spawn(rnd.pick(['nibbler', 'crabbit', 'jellop', 'glimmer', 'springle']), rnd.int(20, 200), rnd.int(40, 190));
  fz.input.set(0, { fire: true, left: true }); fz.input.set(1, { fire: true, right: true });
  const times = [];
  for (let i = 0; i < 600; i++) {
    if (i % 5 === 0) { fz.input.set(0, { fire: i % 10 === 0 }); fz.input.set(1, { fire: i % 10 === 5 }); }
    if (i % 90 === 0) { D.addScore(0, 10); D.give(0, 'bomb'); D.spawn('water', 100, 40); }
    const t0 = performance.now(); fz.step(1); times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const S = D._S();
  return { mean: times.reduce((a, b) => a + b, 0) / times.length, p95: times[Math.floor(times.length * 0.95)], max: times[times.length - 1], bubbles: S.bubbles.length, enemies: S.enemies.length, fx: S.fx.length };
});
log(JSON.stringify(r), '(ms per step incl. render; budget 3 ms)');
// string cache churn: change the score every frame for 2000 frames
const r2 = await b.page.evaluate(() => {
  const D = fz.Game.debug; const times = [];
  for (let i = 0; i < 2000; i++) { D.addScore(0, 10); const t0 = performance.now(); fz.step(1); times.push(performance.now() - t0); }
  times.sort((a, b) => a - b);
  return { mean: times.reduce((a, b) => a + b, 0) / times.length, p99: times[Math.floor(times.length * 0.99)], max: times[times.length - 1] };
});
log('score changing every frame:', JSON.stringify(r2));
await b.t.close();
