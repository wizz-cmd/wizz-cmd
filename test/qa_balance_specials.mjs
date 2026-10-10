// QA balance lens (a): special bubbles (thunder/fire/water). For rounds that have specials, spawn one at each floor-gap column group
// (as risePoint does: y = 208), follow it 900 frames (its life) and report where it hovers + when a player starting on the P1 pad could first touch it.
import { launch, fp } from '../tools/harness.mjs';
import { LEVELS, loadReach, tBox } from './qa_balance_lib.mjs';
export function specSim(level, xs) {
  const G = fz.Game, D = G.debug; fz.start(1, level, 3); D.skipIntro(); D.clearEnemies(); D.noClear(true); D.god(true);
  const S = D._S(); const NO = { left: false, right: false, jump: false, fire: false, jumpPressed: false, firePressed: false };
  S.puT = -1; S.specialT = 1e9; S.letterT = 1e9;
  const out = [];
  for (const x of xs) {
    S.bubbles.length = 0; D.spawn('thunder', x, 208); const b = S.bubbles[S.bubbles.length - 1]; b.life = 900;
    const traj = [];
    for (let t = 1; t <= 900; t++) { D.setPlayer(0, { x: 24, y: 200, vy: 0, noPopT: 1e9, inv: 1e9 }); G.update([NO, NO]); if (b.dead) break; traj.push([Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10]); }
    out.push({ x, traj, ended: b.dead ? traj.length : null });
  }
  return out;
}
const t = await launch(); const g = fp(t.page); await g.freeze(true);
console.log('rnd specials | gap x -> hover (x,y)@frame arrive | first touch by P1-pad player (frames after spawn) | usable hover frames (900 - touch)');
for (let lv = 1; lv <= 30; lv++) {
  const def = LEVELS[lv - 1]; if (!def.specials.length) continue;
  const R = loadReach(lv, 1);
  const gaps = []; { let c = 2; while (c < 30) { if (def.map[25][c] !== '#') { const c0 = c; while (c < 30 && def.map[25][c] !== '#') c++; gaps.push([c0, c - 1]); } else c++; } }
  const xs = []; for (const [a, b] of gaps) { xs.push(a * 8, Math.round(((a + b + 1) * 8 - 16 + a * 8) / 2), (b + 1) * 8 - 16); }
  if (!gaps.length) xs.push(40, 120, 200);
  const res = await t.page.evaluate(`(${specSim.toString()})(${lv}, ${JSON.stringify(xs)})`);
  const lines = res.map((r) => {
    const tr = r.traj; const last = tr[tr.length - 1];
    const w = tr.slice(Math.max(0, tr.length - 120)); const mx = w.reduce((a, q) => a + q[0], 0) / w.length, my = w.reduce((a, q) => a + q[1], 0) / w.length;
    let touch = null; for (let i = 0; i < tr.length; i++) { const v = tBox(R, tr[i][0] - 11, tr[i][0] + 11, tr[i][1] - 13, tr[i][1] + 11); if (v < 65535 && v <= i + 1) { touch = i + 1; break; } }
    return `x${r.x}->(${mx.toFixed(0)},${my.toFixed(0)}) ${touch === null ? 'UNREACHABLE' : 'touch@' + touch}`;
  });
  console.log(String(lv).padStart(2), def.specials.join(','), '|', 'gaps', JSON.stringify(gaps), '|', lines.join(' ; '));
}
console.log(t.errors.length ? 'ERR ' + t.errors : 'no page errors'); await t.close();
