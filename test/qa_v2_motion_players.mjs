// Player motion: walk, jump, shoot, bounce, die, stun at desktop k=3 (fixed-camera crops).
import { setup, sheet, OUT } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
await g.start(1, 1, 5);
await g.step(160);
await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.clearEnemies(); fz.Game.debug.god(true); fz.Game.debug.noClear(true); });
await g.step(80);
async function pl() { const s = await g.state(); return s.players[0]; }
async function cap(label, w = 64, h = 44) {
  const p = await pl();
  const cx = Math.round(p.x + 8), cy = Math.round(p.y + 8);
  await page.evaluate(({ x, y, w, h, label }) => QA.push(x, y, w, h, label), { x: cx - w / 2, y: cy - h / 2 - 4, w, h, label });
}
const R = { left: false, right: true, jump: false, fire: false };
async function seq(name, n, every, setIn, cols = 8, w, h) {
  await page.evaluate(() => QA.reset());
  for (let i = 0; i < n; i += every) {
    await setIn(i);
    await g.step(every);
    await cap(name + ' f' + i, w, h);
  }
  const f = await sheet(page, `${OUT}/players/${name}.png`, { cols, scale: 1 });
  console.log(f);
}
// 1. walking right (floor, 1.25px/frame)
await seq('walk_right', 72, 3, async () => { await g.set(0, { right: true, left: false, jump: false, fire: false }); });
await g.set(0, { right: false, left: false, jump: false, fire: false }); await g.step(30);
// 2. jump
await seq('jump', 90, 3, async (i) => { await g.set(0, { right: i < 60, left: false, jump: i === 0, fire: false }); });
await g.set(0, { right: false }); await g.step(40);
// 3. shoot (standing) then shoot while walking
await seq('shoot', 60, 2, async (i) => { await g.set(0, { right: false, left: false, jump: false, fire: i === 0 || i === 30 }); }, 10);
await g.set(0, { fire: false });
await seq('walk_shoot', 60, 2, async (i) => { await g.set(0, { right: true, left: false, jump: false, fire: i % 20 === 0 }); }, 10);
await t.close();
