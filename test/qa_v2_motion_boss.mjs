import { setup, sheet, OUT } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
await g.start(1, 30, 4);
await g.step(1);
await page.evaluate(() => QA.reset());
// intro (Kraken glides in, banner)
for (let i = 0; i < 160; i += 8) { await g.step(8); await page.evaluate((l) => QA.push(0, 0, 256, 224, l), 'intro f' + i); }
console.log(await sheet(page, `${OUT}/boss/intro.png`, { cols: 5, scale: 0.5, smooth: true }));
await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.god(true); });
await g.step(30);
const bs = () => g.evaluate(() => { const S = fz.Game.debug._S(); const k = S.enemies.find(e => e.t === 'kraken'); return k ? { x: k.x, y: k.y, hp: k.hp, angry: k.angry, inkT: k.inkT, flashT: k.flashT } : null; });
console.log(JSON.stringify(await bs()));
// phase 1 motion + ink telegraph + ink fan: follow the kraken with a 96x96 crop
const follow = async (n, every, lab, scaleCrop = [96, 96]) => {
  await page.evaluate(() => QA.reset());
  for (let i = 0; i < n; i += every) {
    await g.step(every);
    const b = await bs(); if (!b) break;
    await page.evaluate(({ x, y, l, w, h }) => QA.push(x + 24 - w / 2, y + 24 - h / 2, w, h, l), { x: b.x, y: b.y, l: lab + ' f' + i + ' inkT' + b.inkT, w: scaleCrop[0], h: scaleCrop[1] });
  }
};
await g.evaluate(() => { const S = fz.Game.debug._S(); const k = S.enemies.find(e => e.t === 'kraken'); k.inkT = 80; });
await follow(120, 4, 'p1', [112, 112]);
console.log(await sheet(page, `${OUT}/boss/phase1_ink.png`, { cols: 6, scale: 1, smooth: false }));
// hit flash
await g.evaluate(() => { const S = fz.Game.debug._S(); const k = S.enemies.find(e => e.t === 'kraken'); k.flashT = 10; });
await follow(24, 1, 'hit', [64, 64]);
console.log(await sheet(page, `${OUT}/boss/hit_flash.png`, { cols: 8, scale: 1.5, smooth: false }));
// phase 2 (angry)
await g.evaluate(() => { const S = fz.Game.debug._S(); const k = S.enemies.find(e => e.t === 'kraken'); k.hp = 10; k.inkT = 60; });
await follow(120, 4, 'p2', [112, 112]);
console.log(await sheet(page, `${OUT}/boss/phase2_ink.png`, { cols: 6, scale: 1, smooth: false }));
// full screen phase 2 with bolts
await g.evaluate(() => { fz.Game.debug.spawn('thunder', 120, 180); });
await g.evaluate(() => { const S = fz.Game.debug._S(); const b = S.bubbles.find(b => b.kind === 'thunder'); fz.Game.debug.setPlayer(0, { x: b.x, y: b.y + 8, vx: 0, vy: 0 }); });
await page.evaluate(() => QA.reset());
for (let i = 0; i < 100; i += 4) { await g.step(4); await page.evaluate((l) => QA.push(0, 0, 256, 224, l), 'bolt f' + i); }
console.log(await sheet(page, `${OUT}/boss/bolt.png`, { cols: 5, scale: 0.5, smooth: true }));
// defeat -> trapped bubble
await g.evaluate(() => { fz.Game.debug.killAll(); });
await page.evaluate(() => QA.reset());
for (let i = 0; i < 120; i += 6) { await g.step(6); await page.evaluate((l) => QA.push(0, 0, 256, 224, l), 'def f' + i); }
console.log(await sheet(page, `${OUT}/boss/defeat.png`, { cols: 5, scale: 0.5, smooth: true }));
await t.close();
