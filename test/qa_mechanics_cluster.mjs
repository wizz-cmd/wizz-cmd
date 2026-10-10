import { boot, OUT, canvasShot } from './qa_mechanics_lib.mjs';
const { t, g, ev, page } = await boot({ level: 1, clear: true, god: true });
const r = await ev((H) => {
  const S = H.S(); const p = H.P(); S.bubbles.length = 0;
  // shoot 14 bubbles over 280 frames while walking back and forth on the floor
  for (let k = 0; k < 14; k++) {
    p.x = 40 + (k * 13) % 150; p.y = 200; p.face = (k % 3 === 0) ? -1 : 1; p.cooldown = 0; p.noPopT = 1e7; p.inv = 1e9; p.vy = 0;
    H.step(1, () => [{ fire: true }]); H.step(19);
  }
  p.x = 24; p.y = 200;
  H.step(400);
  const bs = S.bubbles.filter(b => !b.dead);
  // cluster stats
  const near = bs.filter(b => Math.hypot(b.x + 8 - 124, b.y + 8 - 40) < 40).length;
  // number of bubbles within 18px of at least one other = chain connectivity
  let conn = 0; for (const a of bs) if (bs.some(b => b !== a && Math.hypot(a.x - b.x, a.y - b.y) <= 18)) conn++;
  // largest chain-connected component
  const seen = new Set(); let maxComp = 0;
  for (const a of bs) { if (seen.has(a)) continue; const st = [a]; seen.add(a); let n = 0; while (st.length) { const c = st.pop(); n++; for (const b of bs) if (!seen.has(b) && Math.hypot(c.x - b.x, c.y - b.y) <= 18) { seen.add(b); st.push(b); } } maxComp = Math.max(maxComp, n); }
  return { n: bs.length, nearAttractor: near, connected: conn, largestChainComponent: maxComp, pts: bs.map(b => [Math.round(b.x), Math.round(b.y), b.age]) };
});
console.log(JSON.stringify(r));
await canvasShot(page, OUT + '/cluster2.png');
await t.close();
