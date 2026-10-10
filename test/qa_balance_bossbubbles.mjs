// QA balance lens (e): where do the boss-round thunder bubbles actually gather when nobody pops them? (idle god player parked on the P1 pad)
import { launch, fp } from '../tools/harness.mjs';
const t = await launch(); const g = fp(t.page); await g.freeze(true);
const r = await t.page.evaluate(() => {
  const G = fz.Game, D = G.debug; fz.start(1, 30, 1); D.god(true);
  const S = D._S(); const NO = { left: false, right: false, jump: false, fire: false, jumpPressed: false, firePressed: false };
  const comps = (pts) => { const n = pts.length, seen = new Array(n).fill(false), out = []; for (let i = 0; i < n; i++) { if (seen[i]) continue; const c = [i]; seen[i] = true; for (let k = 0; k < c.length; k++) for (let j = 0; j < n; j++) if (!seen[j] && Math.hypot(pts[c[k]][0] - pts[j][0], pts[c[k]][1] - pts[j][1]) <= 18) { seen[j] = true; c.push(j); } out.push(c.length); } return out.sort((a, b) => b - a); };
  const log = []; let spawned = 0, prev = 0;
  for (let f = 0; f < 2700; f++) {
    D.setPlayer(0, { x: 24, y: 200, vy: 0, noPopT: 1e9, inv: 1e9 }); G.update([NO, NO]);
    const th = S.bubbles.filter((b) => !b.dead && b.kind === 'thunder');
    if (f % 150 === 0) log.push({ f, n: th.length, comps: comps(th.map((b) => [b.x, b.y])), pos: th.map((b) => [Math.round(b.x), Math.round(b.y), b.age]) });
  }
  return log;
});
for (const l of r) console.log(l.f, 'n=' + l.n, 'components', l.comps.join(','), JSON.stringify(l.pos));
await t.close();
