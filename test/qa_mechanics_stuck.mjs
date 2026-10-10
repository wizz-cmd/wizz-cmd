// All 30 levels: let enemies roam with an idle god player; detect stuck / escaped / out-of-bounds enemies.
import { boot, OUT } from './qa_mechanics_lib.mjs';
const { t, g, ev } = await boot({ level: 1, god: true });
const res = await ev((H) => {
  const rep = [];
  for (let lvl = 1; lvl <= 29; lvl++) {
    fz.start(1, lvl, 7); fz.Game.debug.god(true); fz.Game.debug.noClear(true);
    // stay in intro until enemies active: skip intro
    fz.Game.debug.skipIntro();
    const S = H.S();
    const N = 1800;
    const trace = S.enemies.map(() => []);
    const oob = [];
    const hurryOff = () => { S.hurryT = 0; };
    for (let i = 0; i < N; i++) {
      hurryOff();
      fz.step(1);
      S.enemies.forEach((e, k) => {
        if (i % 20 === 0) trace[k].push([e.x, e.y]);
        if (e.state === 'active' && (e.x < 15.9 || e.x > 224.1 || e.y > 224 || e.y < 0)) oob.push({ lvl, t: e.t, x: e.x, y: e.y, i });
      });
    }
    const info = S.enemies.map((e, k) => {
      const tr = trace[k];
      // stuck: sliding window of 600 frames (30 samples) with bbox < 24 px
      let worst = Infinity, worstStart = 0;
      const W = 30;
      let stuck = 0;
      for (let s = 0; s + W <= tr.length; s++) {
        let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
        for (let q = s; q < s + W; q++) { minx = Math.min(minx, tr[q][0]); maxx = Math.max(maxx, tr[q][0]); miny = Math.min(miny, tr[q][1]); maxy = Math.max(maxy, tr[q][1]); }
        const ext = Math.max(maxx - minx, maxy - miny);
        if (ext < worst) { worst = ext; worstStart = s * 20; }
      }
      // total distinct rows visited (walkers)
      const rows = new Set(tr.map(p => Math.round(p[1] / 8)));
      return { t: e.t, minExtent600f: Math.round(worst), at: worstStart, rowsVisited: rows.size, end: [Math.round(e.x), Math.round(e.y)] };
    });
    rep.push({ lvl, info: info.filter(i => i.minExtent600f < 40 || i.rowsVisited < 2), oob: oob.slice(0, 3), oobCount: oob.length });
  }
  return rep;
});
for (const r of res) if (r.info.length || r.oobCount) console.log(JSON.stringify(r));
console.log('done; errors', t.errors);
await t.close();
