// bubble lifecycle: shot -> trap -> stages -> pop (kill, food); empty bubble float + warn + natural pop
import { setup, sheet, OUT } from './qa_v2_motion_lib.mjs';
const level = +(process.argv[2] || 1);
const { t, g, page } = await setup();
await g.start(1, level, 11);
await g.step(160);
await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.clearEnemies(); fz.Game.debug.god(true); fz.Game.debug.noClear(true); });
await g.step(100);
const st = () => g.state();
await g.evaluate(() => fz.Game.debug.setPlayer(0, { x: 28, y: 200, vx: 0, vy: 0, face: 1 }));
await g.step(2);
// A. shot bubbles empty: fire 2 shots and follow for 160 frames, fixed camera region
await page.evaluate(() => QA.reset());
for (let i = 0; i < 150; i += 3) {
  await g.set(0, { fire: i === 0 || i === 21, right: false, left: false, jump: false });
  await g.step(3);
  await page.evaluate(({ l }) => QA.push(8, 150, 110, 76, l), { l: 'shot f' + i });
}
console.log(await sheet(page, `${OUT}/bubbles/L${level}_shot_float.png`, { cols: 9, scale: 1 }));
await g.set(0, { fire: false });
// B. trap an enemy: spawn nibbler right in front of the player
await g.evaluate(() => { fz.Game.debug.clearEnemies(); fz.Game.debug.setPlayer(0, { x: 28, y: 200, vx: 0, vy: 0, face: 1 }); });
await g.evaluate(() => { fz.Game.debug.spawn('nibbler', 56, 200); });
await page.evaluate(() => QA.reset());
let trapped = false, f = 0, firstBub = null;
for (let i = 0; i < 300 && !trapped; i += 1) {
  await g.set(0, { fire: i % 15 === 0, right: false, left: false, jump: false });
  await g.step(1);
  const s = await st();
  const b = s.bubbles.find(b => b.kind === 'trapped');
  if (b) { trapped = true; firstBub = b; }
}
console.log('trapped?', trapped, JSON.stringify(firstBub));
await g.set(0, { fire: false });
// record trap stages at fixed camera follow
const rec = async (n, every, lab, w = 40, h = 40) => {
  for (let i = 0; i < n; i += every) {
    await g.step(every);
    const s = await st();
    const b = s.bubbles.find(b => b.kind === 'trapped');
    if (!b) break;
    await page.evaluate(({ x, y, l, w, h }) => QA.push(x - 12, y - 12, w, h, l), { x: Math.round(b.x), y: Math.round(b.y), l: lab + ' f' + i, w, h });
  }
};
await g.evaluate(() => { const S = fz.Game.debug._S(); const b = S.bubbles.find(b => b.kind === 'trapped'); window.__tb = b; window.__tt = b.trapTime; });
const tt = await g.evaluate(() => window.__tb.trapTime);
console.log('trapTime', tt);
await rec(Math.floor(tt) - 10, 24, 'trap');
console.log(await sheet(page, `${OUT}/bubbles/L${level}_trap_stages.png`, { cols: 10, scale: 1 }));
await t.close();
