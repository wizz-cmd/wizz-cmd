import { setup, sheet, OUT } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
await g.start(2, 1, 5);
await g.step(160);
await g.evaluate(() => fz.Game.debug.skipIntro && fz.Game.debug.skipIntro());
await g.evaluate(() => { fz.Game.debug.god(true); });
await canvasFull();
async function canvasFull() { const { canvasShot } = await import('./qa_v2_motion_lib.mjs'); await canvasShot(page, OUT + '/walk/_full.png', { scale: 1 }); }
await t.close();
