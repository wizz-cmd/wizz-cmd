// Section: trap -> chain reaction -> scoring -> food
import { arenaBoot, OUT, canvasShot } from './qa_mechanics_lib.mjs';
const { t, g, ev, page } = await arenaBoot({ god: true });
await g.evaluate(() => { window.arena([[8, 12, 23, 12]]); });   // a platform at row 12 (surface y=112)
const out = {};
const chain = async (spacing, n, label) => {
  return ev((H, spacing, n) => {
    const pos = []; for (let i = 0; i < n; i++) pos.push([40 + i * spacing, 60, 'jellop']);
    // trap with player placed to the left; but shots are blocked by already trapped? fine
    const S = H.S(); S.bubbles.length = 0; S.enemies.length = 0; S.items.length = 0; S.proj.length = 0;
    const p = H.P(); p.inv = 99999; p.noPopT = 1e7;
    for (const [x, y, ty] of pos) {
      H.D.spawn(ty, x, y); const e = S.enemies[S.enemies.length - 1]; e.state = 'frozen'; e.freezeT = 99999;
    }
    // trap each by direct shot from nearby: teleport player 20px left of it
    for (const [x, y] of pos) {
      p.x = Math.max(16, x - 28); p.y = y; p.vy = 0; p.face = 1; p.cooldown = 0; p.score = 0; p.onGround = true;
      H.step(1, () => [{ fire: true }]);
      for (let i = 0; i < 4; i++) { p.y = y; p.vy = 0; H.step(1); }
    }
    const bs = S.bubbles.filter(b => b.kind === 'trapped');
    bs.forEach((b, i) => { b.x = pos[i][0]; b.y = pos[i][1]; b.att = null; b.age = 0; });
    const trapped = bs.length;
    p.score = 0;
    // pop the first by touching: put player on top of leftmost
    S.bubbles.forEach(b => { b.grace = -1; });
    const first = bs[0];
    p.x = first.x - 6; p.y = first.y - 1; p.vy = 0; p.noPopT = 0; p.onGround = false;
    const popFrames = [];
    const sc = [];
    let lastScore = 0;
    for (let i = 0; i < 80; i++) {
      p.y = 5000; // park player off-play after first frame
      if (i === 0) { p.y = first.y - 1; p.x = first.x - 6; }
      H.step(1);
      if (p.score !== lastScore) { sc.push({ f: i, d: p.score - lastScore }); lastScore = p.score; }
      if (i === 0) { p.y = 5000; }
    }
    return { trapped, scoreEvents: sc, total: p.score, food: H.S().items.map(it => it.kind).concat(H.S().enemies.map(e => e.state)).slice(0, 12) };
  }, spacing, n);
};
out.chain16x7 = await chain(16, 7);
out.chain20x4 = await chain(20, 4);
console.log(JSON.stringify(out, null, 1));
console.log('errors', t.errors);
await t.close();
