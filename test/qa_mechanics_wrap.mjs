import { boot, OUT, canvasShot } from './qa_mechanics_lib.mjs';
const { t, g, ev, page } = await boot({ level: 1, god: true, clear: true });
const r = await ev((H) => {
  const S = H.S(); const out = {};
  // nibbler on floor walking right toward gap x=112..143 (L1 floor gap cols 14..17)
  H.D.spawn('nibbler', 100, 200); const e = S.enemies[0]; e.d = 1; e.turnCool = 0;
  const log = []; let wraps = 0, prevY = e.y;
  for (let i = 0; i < 700; i++) {
    H.P().x = 24; H.P().y = 200; H.step(1);
    if (e.y < prevY - 100) { wraps++; log.push({ i, from: prevY.toFixed(0), to: e.y.toFixed(0), x: e.x.toFixed(0) }); }
    prevY = e.y;
  }
  out.walker = { wraps, log: log.slice(0, 5), end: [e.x, e.y] };
  // dying enemy over gap
  S.enemies.length = 0; S.items.length = 0;
  H.D.spawn('jellop', 124, 190); const j = S.enemies[0]; j.state = 'frozen'; j.freezeT = 1e6;
  H.D.killAll();
  const tr = []; let w = 0; prevY = j.y;
  for (let i = 0; i < 400; i++) { H.step(1); if (j.y < prevY - 100) { w++; tr.push({ i, x: j.x.toFixed(0) }); } prevY = j.y; if (j.dead) { out.food = S.items.map(it => ({ k: it.kind, x: Math.round(it.x), y: Math.round(it.y) })); out.foodAfter = i; break; } }
  out.dying = { wraps: w, tr };
  // food over a gap? find anything placed over gap columns
  return out;
});
console.log(JSON.stringify(r));
await t.close();
