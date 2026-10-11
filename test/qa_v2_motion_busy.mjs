import { setup, sheet, OUT, canvasShot } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
for (const L of [18, 21, 26, 29]) {
  await g.start(2, L, 13);
  await g.step(170);
  await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.god(true); fz.Game.debug.noClear(true); });
  let seed = L * 7919;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  let inp = [{}, {}];
  for (let i = 0; i < 900; i++) {
    if (i % 20 === 0) inp = [0, 1].map(() => ({ left: rnd() < 0.4, right: rnd() < 0.4, jump: rnd() < 0.2, fire: rnd() < 0.6 }));
    await g.set(0, inp[0]); await g.set(1, inp[1]);
    await g.step(1);
    if (i === 899 || i === 600) await canvasShot(page, `${OUT}/busy/L${L}_f${i}.png`, { scale: 1 });
  }
  const s = await g.state();
  console.log(L, 'enemies', s.enemies.length, 'bubbles', s.bubbles.length, 'items', s.items.length);
}
await t.close();
