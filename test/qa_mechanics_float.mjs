// Section: bubble float / attractor / clustering / lifetimes
import { boot, OUT, canvasShot } from './qa_mechanics_lib.mjs';
const { t, g, ev, page } = await boot({ level: 1, clear: true, god: true });
const out = {};
// level 1: air [[15.5,3]] -> centre x=124,y=40
out.shotFloat = await ev((H) => {
  const p = H.P(); p.x = 40; p.y = 200; p.face = 1; p.cooldown = 0; H.step(2);
  H.step(1, () => [{ fire: true }]);
  const b = H.S().bubbles[0]; const tr = [];
  const reachRow = null;
  for (let i = 0; i < 700; i++) { H.step(1); if (i % 40 === 0) tr.push({ i, x: +b.x.toFixed(1), y: +b.y.toFixed(1), st: b.state }); if (b.dead) { tr.push({ i, dead: true, age: b.age }); break; } }
  return tr;
});
console.log(JSON.stringify(out.shotFloat));
// time from shot to reach attractor row and bubble lifetime check
out.life = await ev((H) => {
  H.S().bubbles.length = 0;
  const p = H.P(); p.x = 40; p.y = 200; p.face = 1; p.cooldown = 0; H.step(2);
  H.step(1, () => [{ fire: true }]);
  const b = H.S().bubbles[0]; let reached = null, warn = null, died = null, n = 0;
  while (n < 900) { H.step(1); n++; if (reached === null && b.y + 8 <= 40 + 1) reached = n; if (b.dead) { died = n; break; } }
  return { reachedAttractorRowAfter: reached, diedAfter: died, ageAtDeath: b.age, life: b.life, score: p.score };
});
console.log(JSON.stringify(out.life));
// cluster: shoot 10 bubbles from different positions
out.cluster = await ev((H) => {
  H.S().bubbles.length = 0;
  const p = H.P(); p.cooldown = 0;
  for (let k = 0; k < 10; k++) {
    p.x = 30 + k * 12; p.y = 200; p.face = (k % 2) ? -1 : 1; p.cooldown = 0; H.step(1);
    H.step(1, () => [{ fire: true }]); H.step(20);
  }
  H.step(250);
  const bs = H.S().bubbles.filter(b => !b.dead);
  return bs.map(b => ({ x: +b.x.toFixed(1), y: +b.y.toFixed(1), age: b.age }));
});
console.log(JSON.stringify(out.cluster));
await canvasShot(page, OUT + '/float_cluster.png');
console.log('errors', t.errors);
await t.close();
