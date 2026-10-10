import { boot, OUT, canvasShot } from './qa_mechanics_lib.mjs';
const out = {};
for (const lvl of [5, 8, 29]) {
  const { t, g, ev, page } = await boot({ level: lvl, god: true, clear: true });
  const r = await ev((H) => {
    const S = H.S(); const seen = new Set(); const spawns = []; let maxAlive = 0;
    const gaps = S.gaps;
    for (let i = 0; i < 6000; i++) {
      S.hurryT = 0; fz.step(1);
      for (const b of S.bubbles) { if (b.kind === 'empty' || seen.has(b)) continue; seen.add(b); spawns.push({ i, kind: b.kind, x: b.x, y: b.y, att: b.att && [b.att.x, b.att.y] }); }
      maxAlive = Math.max(maxAlive, S.bubbles.filter(b => b.kind === 'thunder' || b.kind === 'fire' || b.kind === 'water').length);
    }
    return { gaps, count: spawns.length, spawns: spawns.slice(0, 14), maxAlive, intervals: spawns.slice(1).map((s, k) => s.i - spawns[k].i).slice(0, 12) };
  });
  console.log('LEVEL', lvl, JSON.stringify(r));
  await t.close();
}
