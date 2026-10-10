// QA balance lens: fidelity check of the physics REPLICA (test/qa_balance_botlib.js) against the real Game.update.
import { launch, fp, PROJECT } from '../tools/harness.mjs';
import fs from 'fs'; import path from 'path';
const lib = fs.readFileSync(path.join(PROJECT, 'test', 'qa_balance_botlib.js'), 'utf8');
const t = await launch(); const g = fp(t.page); await g.freeze(true);
await t.page.evaluate(() => { window.fz = window.__fizzpop; });
await t.page.evaluate(lib);
let total = 0, bad = 0, worst = 0;
for (const lv of [1, 5, 9, 12, 20, 29, 30]) {
  const r = await t.page.evaluate((lv) => {
    const QB = window.QB, G = fz.Game, D = G.debug;
    fz.start(1, lv, 5); D.skipIntro(); D.clearEnemies(); D.noClear(true); D.god(true);
    const S = D._S(), p = S.players[0];
    QB.setSolid(S.solid);
    const gr = QB.buildGraph([[24, 200]]);
    const nodes = [...gr.nodes.values()];
    let n = 0, badc = 0, worst = 0, firstBad = null;
    for (let i = 0; i < Math.min(60, nodes.length); i++) {
      const nd = nodes[Math.floor(i * nodes.length / 60)];
      for (let mi = 0; mi < QB.MACROS.length - 1; mi += 3) {
        const m = QB.MACROS[mi];
        const rep = QB.runMacro({ x: nd.x, y: nd.y, vy: 0, g: true, jb: 0 }, m, true);
        // real
        S.bubbles.length = 0; S.items.length = 0; S.proj.length = 0; S.puT = -1; S.specialT = 1e9; S.letterT = 1e9; S.hurryT = 0; S.ghost = null;
        D.setPlayer(0, { x: nd.x, y: nd.y, vx: 0, vy: 0, onGround: true, state: 'normal', stunT: 0, face: 1, inv: 0, jumpBuf: 0, noPopT: 0, cooldown: 0, power: { shoes: false, pink: false, blue: false, gold: false } });
        let dev = 0;
        for (let f = 1; f <= rep.frames; f++) {
          const inp = QB.macroIn(m, f);
          G.update([{ left: inp.dir < 0, right: inp.dir > 0, jump: inp.jp, fire: false, jumpPressed: inp.jp, firePressed: false }, QB.NO]);
          const q = rep.path[f - 1];
          dev = Math.max(dev, Math.abs(p.x - q[0]), Math.abs(p.y - q[1]));
        }
        n++; worst = Math.max(worst, dev); if (dev > 1e-6) { badc++; if (!firstBad) firstBad = { node: [nd.x, nd.y], m, dev }; }
      }
    }
    return { nodes: nodes.length, n, badc, worst, firstBad };
  }, lv);
  total += r.n; bad += r.badc; worst = Math.max(worst, r.worst);
  console.log('round', lv, JSON.stringify(r));
}
console.log('macros compared', total, 'mismatches', bad, 'worst dev', worst);
console.log(t.errors.length ? 'ERR ' + t.errors : 'no page errors'); await t.close();
