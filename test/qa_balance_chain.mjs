// QA balance lens (a/f): CHAIN CLUSTERING. Freeze every enemy of a round at its spawn, trap each one with a real bubble shot (player teleports
// 36 px left of it, fires right), then watch the trapped bubbles float for trapTime frames with the real air-flow code.
// Reports the connected components (centre distance <= 18 = chain link) at several times, and for the biggest component whether/when a player
// from the P1 pad could touch it.  usage: node test/qa_balance_chain.mjs [levels]
import { launch, fp } from '../tools/harness.mjs';
import fs from 'fs'; import path from 'path';
import { OUT, LEVELS, loadReach, tBox, pad2 } from './qa_balance_lib.mjs';
export function chainSim(level, seed) {
  const G = fz.Game, D = G.debug;
  fz.start(1, level, seed); D.skipIntro(); D.noClear(true); D.god(true);
  const S = D._S(); const p = S.players[0];
  const NO = { left: false, right: false, jump: false, fire: false, jumpPressed: false, firePressed: false };
  S.puT = -1; S.specialT = 1e9; S.letterT = 1e9;
  const foes = S.enemies.filter((e) => e.t !== 'kraken');
  for (const e of foes) { e.state = 'frozen'; e.freezeT = 1e9; e.vx = 0; e.vy = 0; }
  for (let i = 0; i < 5; i++) G.update([NO, NO]);                    // let walkers settle on their floor
  const trapT = Math.max(240, 480 - 8 * (level - 1));
  let captured = 0;
  for (const e of foes) {
    let ok = false;
    // shoot from the left (or the right when too close to the wall)
    for (const side of [-1, 1]) {
      const px = Math.max(16, Math.min(224, e.x + side * 40));
      if (Math.abs(px - e.x) < 24) continue;
      D.setPlayer(0, { x: px, y: e.y, vx: 0, vy: 0, face: -side, cooldown: 0, onGround: true, inv: 1e9, noPopT: 1e9, state: 'normal' });
      G.update([{ ...NO, firePressed: true, fire: true }, NO]);
      for (let k = 0; k < 40 && e.state === 'frozen'; k++) { D.setPlayer(0, { x: px, y: e.y, vy: 0, inv: 1e9, noPopT: 1e9 }); G.update([NO, NO]); }
      if (e.state === 'trapped') { ok = true; captured++; break; }
    }
    if (!ok) { /* not capturable from the sides: skip */ }
    for (let k = 0; k < 20; k++) { D.setPlayer(0, { x: 24, y: 200, vy: 0, inv: 1e9, noPopT: 1e9 }); G.update([NO, NO]); }
  }
  const snaps = {};
  const t0 = S.frame;
  for (let t = 1; t <= trapT + 100; t++) {
    D.setPlayer(0, { x: 24, y: 200, vy: 0, inv: 1e9, noPopT: 1e9 });
    for (const b of S.bubbles) if (b.kind === 'trapped') b.trapT = Math.min(b.trapT, b.trapTime - 5);   // keep trapped until we stop looking
    G.update([NO, NO]);
    if (t % 60 === 0 || t === trapT - 40) snaps[t] = S.bubbles.filter((b) => b.kind === 'trapped').map((b) => [Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10]);
  }
  return { n: foes.length, captured, trapT, snaps };
}
function comps(pts, thr = 18) {
  const n = pts.length, seen = new Array(n).fill(false), out = [];
  for (let i = 0; i < n; i++) { if (seen[i]) continue; const comp = [i]; seen[i] = true; for (let k = 0; k < comp.length; k++) for (let j = 0; j < n; j++) if (!seen[j] && Math.hypot(pts[comp[k]][0] - pts[j][0], pts[comp[k]][1] - pts[j][1]) <= thr) { seen[j] = true; comp.push(j); } out.push(comp.map((c) => pts[c])); }
  return out.sort((a, b) => b.length - a.length);
}
const levels = (process.argv[2] || 'all') === 'all' ? Array.from({ length: 29 }, (_, i) => i + 1) : process.argv[2].split(',').map(Number);
const t = await launch(); const g = fp(t.page); await g.freeze(true);
console.log('rnd n capt | components at t=trapT-40 (sizes) | biggest comp centroid  tReach(P1 pad, frames) | comps at t=60 (sizes) | trapT');
const res = [];
for (const lv of levels) {
  const R = loadReach(lv, 1);
  const r = await t.page.evaluate(`(${chainSim.toString()})(${lv}, 3)`);
  const late = r.snaps[r.trapT - 40] || [];
  const cs = comps(late);
  const big = cs[0] || [];
  const cx = big.length ? big.reduce((a, q) => a + q[0], 0) / big.length : 0, cy = big.length ? big.reduce((a, q) => a + q[1], 0) / big.length : 0;
  const tr = big.length ? tBox(R, cx - 11, cx + 11, cy - 13, cy + 11) : 65535;
  const early = comps(r.snaps[60] || []);
  res.push({ lv, ...r, compsLate: cs.map((c) => c.length), big: [cx, cy], tr });
  console.log(String(lv).padStart(2), r.n, r.captured, '|', cs.map((c) => c.length).join(',').padEnd(14), '|', `(${cx.toFixed(0)},${cy.toFixed(0)})`.padEnd(10), tr === 65535 ? 'UNREACH' : tr, '|', early.map((c) => c.length).join(','), '|', r.trapT);
}
fs.writeFileSync(path.join(OUT, 'chain.json'), JSON.stringify(res));
console.log(t.errors.length ? 'ERR ' + t.errors : 'no page errors'); await t.close();
