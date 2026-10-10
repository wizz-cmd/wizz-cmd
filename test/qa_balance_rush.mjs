// QA balance lens (b): REAL (non-god) idle player on the pad: absolute frame of the first death, phase at that frame, enemy that did it, and how
// many frames the enemies had been active. Shows the pad rush and the 60 hostile frames before READY! ends.  node test/qa_balance_rush.mjs
import { launch, fp } from '../tools/harness.mjs';
export function rush(level, seed, pad) {
  const G = fz.Game, D = G.debug; fz.start(1, level, seed); const S = D._S(), p = S.players[0];
  if (pad === 2) D.setPlayer(0, { x: 216, y: 200, face: -1 });
  const NO = { left: false, right: false, jump: false, fire: false, jumpPressed: false, firePressed: false };
  let firstActive = null;
  for (let f = 0; f < 1200; f++) {
    G.update([NO, NO]);
    if (firstActive === null && S.enemies.some((e) => e.state === 'active')) firstActive = S.frame;
    if (p.state === 'dying') {
      const near = S.enemies.filter((e) => e.state === 'active').map((e) => [e.t, Math.hypot(e.x - p.x, e.y - p.y)]).sort((a, b) => a[1] - b[1])[0];
      return { dieFrame: S.frame, phase: S.phase, firstActive, killer: near ? near[0] : (S.proj.length ? 'proj' : 'ghost') };
    }
  }
  return { dieFrame: null, firstActive };
}
const t = await launch(process.env.FP_HTML ? { html: process.env.FP_HTML } : {}); const g = fp(t.page); await g.freeze(true);
console.log('round pad seed: frame of death (READY! ends at 150) | phase | first enemy active | killer');
for (const [lv, pad] of [[3, 1], [21, 2], [23, 1], [25, 1], [26, 1], [27, 1], [27, 2], [30, 1], [2, 1], [7, 2]]) {
  const rs = []; for (const seed of [1, 2, 3, 4]) rs.push(await t.page.evaluate(`(${rush.toString()})(${lv}, ${seed}, ${pad})`));
  console.log(String(lv).padStart(2), 'P' + pad, rs.map((r) => `${r.dieFrame}(${r.phase},${r.killer})`).join('  '), '| firstActive', rs[0].firstActive);
}
console.log(t.errors.length ? 'ERR ' + t.errors : 'no page errors'); await t.close();
