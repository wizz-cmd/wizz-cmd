import { boot, log } from './qa3_diffreview_lib.mjs';
const b = await boot({ players: 1, level: 19, seed: 1 });
const r = await b.page.evaluate(() => {
  fz.start(1, 19, 1); const D = fz.Game.debug; D.skipIntro(); D.god(true); D.noClear(true); D.setHurryTimer(-1e7);
  const S = D._S(); const T = 8, MAP_Y = 16;
  const solid = (c, r) => (c < 0 || c >= 32) ? true : (r < 0 || r >= 26) ? false : S.solid[r * 32 + c] === 1;
  const bodyHits = (x, y) => { const c0 = Math.floor((x + 2) / T), c1 = Math.floor((x + 14 - 1e-6) / T), r0 = Math.floor((y + 2 - MAP_Y) / T), r1 = Math.floor((y + 16 - 1e-6 - MAP_Y) / T); for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (solid(c, r)) return true; return false; };
  S.players[0].x = 24; S.players[0].y = 200;
  const rows = [];
  const springles = S.enemies.filter((e) => e.t === 'springle' || true);
  rows.push(springles.map((e, i) => i + ':' + e.t + '@' + e.x + ',' + e.y).join(' '));
  // replicate the earlier sequential procedure: fire each walker in turn for 400 frames
  for (const e of S.enemies.slice()) {
    if (!['nibbler','crabbit','springle'].includes(e.t) || e.state !== 'active') continue;
    e.wdHist = [[e.x, e.x, e.y, e.y], [e.x, e.x, e.y, e.y], [e.x, e.x, e.y, e.y]]; e.wdT = 119; e.wdLast = -1e9;
    let ceil = 0, first = -1, trace = [];
    for (let f = 0; f < 400; f++) {
      D.setHurryTimer(-1e7); fz.step(1);
      if (e.y < MAP_Y + 8) { ceil++; if (first < 0) first = f; }
      if (ceil && trace.length < 60 && f >= first) trace.push(`f${f} x=${e.x.toFixed(1)} y=${e.y.toFixed(1)} vy=${e.vy.toFixed(2)} vx=${e.vx.toFixed(2)} g=${e.onGround?1:0} pass=${e.passT} emb=${bodyHits(e.x,e.y)?1:0}`);
    }
    if (ceil > 50) { rows.push(`${e.t} ceil=${ceil} first=${first} end y=${e.y}`); rows.push(...trace.filter((_, i) => i % 3 === 0)); break; }
  }
  return rows;
});
console.log(r.join('\n'));
await b.t.close();
