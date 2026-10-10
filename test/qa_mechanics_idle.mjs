// Idle player (no input) survival time per level: pressure/difficulty probe + spawn-camping detector
import { boot } from './qa_mechanics_lib.mjs';
const { t, g, ev } = await boot({ level: 1, god: false });
const r = await ev((H) => {
  const rows = [];
  for (let lvl = 1; lvl <= 29; lvl++) {
    const times = [];
    for (const seed of [1, 2, 3, 4]) {
      fz.start(1, lvl, seed); const S = H.S();
      let died = null;
      for (let i = 0; i < 3600; i++) { fz.step(1); if (S.players[0].state === 'dying') { died = i; break; } }
      times.push(died === null ? '>3600' : died);
    }
    rows.push(lvl + ': ' + times.join(', '));
  }
  return rows;
});
console.log(r.join('\n'));
await t.close();
