import { setup, sheet, OUT, canvasShot } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
await g.start(1, 5, 6);
await g.step(160);
await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.god(true); });
await g.step(60);
await g.evaluate(() => fz.Game.debug.killAll());
let n = 0;
for (let i = 0; i < 600; i++) { await g.step(1); const s = await g.state(); if (s.phase === 'transition') { n++; if (n === 1 || n === 8) await canvasShot(page, `${OUT}/transition/scroll_${n}.png`, { scale: 1 }); if (n === 10) break; } }
// continue until mid scroll
for (let i = 0; i < 60; i++) { await g.step(1); }
await canvasShot(page, `${OUT}/transition/scroll_mid.png`, { scale: 1 });
const s = await g.state(); console.log(s.phase, s.phaseT);
await t.close();
