import { setup, sheet, OUT, canvasShot } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
await g.start(2, 1, 11);
await g.step(160);
await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.god(true); fz.Game.debug.noClear(true); });
await g.step(150);
console.log(JSON.stringify((await g.state()).players.map(p=>({x:p.x,inv:p.inv,state:p.state}))));
await canvasShot(page, OUT + '/players/idle_full.png', { scale: 1 });
await page.evaluate(() => QA.reset());
for (let i = 0; i < 20; i++) { await g.step(2); await page.evaluate((l) => QA.push(8, 176, 48, 44, l), 'f' + i*2); }
console.log(await sheet(page, OUT + '/players/idle_zoom.png', { cols: 10, scale: 2 }));
await t.close();
