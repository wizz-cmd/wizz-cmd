import { setup, sheet, OUT, canvasShot } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
await g.start(1, 5, 6); await g.step(160);
await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.god(true); });
await g.step(60);
await g.evaluate(() => fz.Game.debug.killAll());
let prev = '', n = 0;
await page.evaluate(() => QA.reset());
for (let i = 0; i < 700; i++) {
  await g.step(1);
  const s = await g.state();
  if (s.phase === 'transition') { n++; if (n >= 1 && n <= 8) await page.evaluate((l) => QA.push(0, 0, 256, 224, l), 'tr+' + n); }
  else if (prev === 'clear' && n === 0) { }
  if (s.phase === 'clear' && s.phaseT > 300 && n === 0 && i % 1 === 0) { /* keep last clear frames */ await page.evaluate((l) => { QA.push(0, 0, 256, 224, l); if (QA.frames.length > 3) QA.frames.shift(); }, 'clear ' + s.phaseT); }
  prev = s.phase; if (n > 8) break;
}
const m = await page.evaluate(() => QA.metrics()); console.log(m.map(x => x.label + ':' + x.lum + '/' + x.diff).join(' '));
console.log(await sheet(page, `${OUT}/transition/boundary.png`, { cols: 4, scale: 1, smooth: true }));
await t.close();
