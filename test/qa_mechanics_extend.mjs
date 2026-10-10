import { boot, OUT, canvasShot } from './qa_mechanics_lib.mjs';
const { t, g, ev, page } = await boot({ level: 3, god: false, players: 2 });
const out = {};
// 2P: independent letters; P2 pops a letter spawned by debug (for p1 letter) -> P2 collects it for P2?
out.letters2p = await ev((H) => {
  const S = H.S(); const p1 = H.P(0), p2 = H.P(1);
  p1.inv = p2.inv = 1e7;
  // debug.spawn('letter') picks the first missing letter of P1; pop by P2
  H.D.spawn('letter', 100, 100); const b = S.bubbles.find(b => b.kind === 'letter'); b.att = null;
  const letter = b.letter;
  p2.x = 94; p2.y = 94; p2.vy = 0; p2.noPopT = 0; H.step(1);
  const r = { letter, p1: S.players[0].letters.join(''), p2: S.players[1].letters.join('') };
  return r;
});
console.log(JSON.stringify(out.letters2p));
// Extend: P1 collects all 6
out.extend = await ev((H) => {
  const S = H.S(); const p1 = H.P(0);
  p1.inv = 1e7; p1.letters = [true, true, true, true, true, false]; // missing D
  const lives0 = p1.lives;
  H.D.spawn('letter', 100, 100); const b = S.bubbles.find(b => b.kind === 'letter' && !b.dead); b.att = null; b.letter = 'D';
  p1.x = 94; p1.y = 94; p1.vy = 0; p1.noPopT = 0; H.step(1);
  const trace = [];
  let last = S.phase;
  trace.push({ f: 0, ph: S.phase, lives: p1.lives });
  for (let i = 1; i < 700; i++) { H.step(1); if (S.phase !== last) { trace.push({ f: i, ph: S.phase, lives: p1.lives, level: S.level }); last = S.phase; } }
  return { lives0, trace, letters: p1.letters.join(','), enemiesLeft: S.enemies.length };
});
console.log(JSON.stringify(out.extend));
// duplicate letter bonus
out.dup = await ev((H) => {
  const S = H.S(); const p1 = H.P(0); p1.letters = [false, false, false, false, false, false]; p1.letters[1] = true; p1.score = 0; p1.inv = 1e7;
  H.D.spawn('letter', 100, 100); const b = S.bubbles.find(b => b.kind === 'letter' && !b.dead); b.att = null; b.letter = 'X';
  p1.x = 94; p1.y = 94; p1.vy = 0; p1.noPopT = 0; p1.onGround = false; H.step(1);
  return { score: p1.score };
});
console.log(JSON.stringify(out.dup));
console.log('errors', t.errors);
await t.close();
