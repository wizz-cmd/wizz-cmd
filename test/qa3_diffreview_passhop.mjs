// First watchdog fire = "free pass" hop (blocks ignored 50 frames). Where does the walker end up?  Embedded in blocks? ceiling row? oob?
import { boot, log, check } from './qa3_diffreview_lib.mjs';
const b = await boot({ players: 1, level: 1, seed: 1 });
const SRC = (L, seed) => `(() => {
  fz.start(1, ${L}, ${seed}); const D = fz.Game.debug; D.skipIntro(); D.god(true); D.noClear(true); D.setHurryTimer(-1e7);
  const S = D._S(); const T = 8, MAP_Y = 16;
  const solid = (c, r) => (c < 0 || c >= 32) ? true : (r < 0 || r >= 26) ? false : S.solid[r * 32 + c] === 1;
  const bodyHits = (x, y) => { const c0 = Math.floor((x + 2) / T), c1 = Math.floor((x + 14 - 1e-6) / T), r0 = Math.floor((y + 2 - MAP_Y) / T), r1 = Math.floor((y + 16 - 1e-6 - MAP_Y) / T); for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (solid(c, r)) return true; return false; };
  const res = [];
  S.players[0].x = 24; S.players[0].y = 200;
  for (const e of S.enemies.slice()) {
    if (!['nibbler','crabbit','springle'].includes(e.t) || e.state !== 'active') continue;
    let embedded = 0, worst = 0, ceilFrames = 0, oob = 0, gone = false;
    e.wdHist = [[e.x, e.x, e.y, e.y], [e.x, e.x, e.y, e.y], [e.x, e.x, e.y, e.y]]; e.wdT = 119;
    e.wdLast = -1e9;
    let fired = false;
    for (let f = 0; f < 400; f++) {
      D.setHurryTimer(-1e7);
      const before = e.passT;
      fz.step(1);
      if (e.passT === 50) fired = true;
      if (e.dead) { gone = true; break; }
      if (!fired) continue;
      if (e.passT === 0 && bodyHits(e.x, e.y)) { embedded++; worst = Math.max(worst, embedded); } else embedded = 0;
      if (e.y < MAP_Y + 8) ceilFrames++;
      if (e.x < 16 || e.x > 224 || e.y > 224 || e.y < 0 || Number.isNaN(e.x + e.y)) oob++;
    }
    res.push({ t: e.t, fired, worstEmbeddedFramesAfterPass: worst, ceilFrames, oob, endY: Math.round(e.y), endX: Math.round(e.x) });
  }
  return res;
})()`;
let all = [];
for (let L = 1; L <= 29; L++) for (let seed = 1; seed <= 2; seed++) {
  const r = await b.page.evaluate(SRC(L, seed));
  for (const o of r) all.push({ L, seed, ...o });
}
const emb = all.filter((o) => o.worstEmbeddedFramesAfterPass > 0);
log('hops', all.length, 'embedded after pass:', emb.length, 'ceiling frames>0:', all.filter((o) => o.ceilFrames > 0).length, 'oob', all.filter((o) => o.oob).length);
for (const o of emb.sort((a, b) => b.worstEmbeddedFramesAfterPass - a.worstEmbeddedFramesAfterPass).slice(0, 15)) log(JSON.stringify(o));
check('P1 no walker stays embedded in blocks after the free pass', emb.every((o) => o.worstEmbeddedFramesAfterPass < 120), emb.slice(0, 5));
check('P2 no oob', all.every((o) => !o.oob));
log('errors', b.t.errors);
await b.t.close();
