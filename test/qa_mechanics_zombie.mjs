// Bug probe: P1 dies on last life during the clear phase (no food on screen) -> transition starts while still 'dying'
import { boot, OUT, canvasShot } from './qa_mechanics_lib.mjs';
const { t, g, ev, page } = await boot({ level: 1, god: false, players: 2 });
const r = await ev((H) => {
  const S = H.S(); const p1 = S.players[0], p2 = S.players[1];
  p2.inv = 1e9; p1.inv = 0; p1.lives = 1;
  const keep = S.enemies.find(e => e.state === 'active');
  // parasol-style clear (no food): clear phase with idle timer 60
  H.D.give(1, 'parasol');
  H.step(1);
  const log = [{ ph: S.phase, lvl: S.level, skipTo: S.skipTo }];
  // P1 dies 20 frames into the clear phase (hit by a pebble/ghost/flame). Use Bonefin spawn on P1.
  H.step(20);
  p1.inv = 0; H.D.spawn('bonefin', p1.x, p1.y); H.step(2);
  log.push({ ev: 'p1 hit', st: p1.state, lives: p1.lives, ph: S.phase });
  let last = S.phase;
  for (let i = 0; i < 900; i++) {
    H.step(1);
    if (S.phase !== last) { log.push({ i, ph: S.phase, lvl: S.level, p1: p1.state, p1lives: p1.lives }); last = S.phase; }
    if (S.phase === 'play') break;
  }
  log.push({ end: true, p1: p1.state, p1lives: p1.lives, hudReserveIcons: Math.max(0, p1.lives - 1), inv: p1.inv });
  // now: can zombie die again and is the game over?
  return log;
});
console.log(JSON.stringify(r, null, 1));
await canvasShot(page, OUT + '/zombie_p1.png');
await t.close();
