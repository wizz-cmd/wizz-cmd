import { boot } from './qa_mechanics_lib.mjs';
const { t, g, ev } = await boot({ level: 1, god: true });
const res = await ev((H) => {
  const rnd = (s => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const run = 19; const R = rnd(1000 + run);
  const players = 1, lvl = 1 + (run * 7) % 29;
  fz.start(players, lvl, 100 + run); const S = H.S(); if (run % 2) fz.Game.debug.god(true);
  let held = {}; const log = [];
  for (let i = 0; i < 2700; i++) {
    if (R() < 0.05) held = { left: R() < 0.4, right: R() < 0.4, jump: R() < 0.5, fire: R() < 0.5 };
    fz.input.set(0, held); fz.step(1);
    const p = S.players[0];
    if (i >= 2620 && i <= 2650) log.push({ i, y: +p.y.toFixed(2), vy: +p.vy.toFixed(2), noPop: p.noPopT, bub: S.bubbles.filter(b => Math.abs(b.x - p.x) < 20 && Math.abs(b.y - p.y) < 40).map(b => `${b.kind}:${b.x.toFixed(1)},${b.y.toFixed(1)}:${b.state}`).join(' | ') });
  }
  return log;
});
for (const l of res) console.log(JSON.stringify(l));
await t.close();
