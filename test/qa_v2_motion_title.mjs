import { setup, sheet, OUT, canvasShot } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
await g.goto('title');
await g.step(20);
await canvasShot(page, `${OUT}/title/title_full.png`, { scale: 1 });
await page.evaluate(() => QA.reset());
for (let i = 0; i < 120; i += 3) { await g.step(3); await page.evaluate((l) => QA.push(24, 20, 208, 80, l), 'f' + i); }
const met = await page.evaluate(() => QA.metrics());
console.log(met.map(m => `${m.lum}/${m.diff}`).join(' '));
console.log(await sheet(page, `${OUT}/title/logo_anim.png`, { cols: 5, scale: 0.6, smooth: true }));
// 1-frame steps for logo refresh cadence: diff series per frame
await page.evaluate(() => QA.reset());
for (let i = 0; i < 30; i++) { await g.step(1); await page.evaluate((l) => QA.push(24, 20, 208, 80, l), 'f' + i); }
const m2 = await page.evaluate(() => QA.metrics());
console.log('per-frame logo diff:', m2.map(m => m.diff).join(' '));
// twins region per-frame
await page.evaluate(() => QA.reset());
for (let i = 0; i < 30; i++) { await g.step(1); await page.evaluate((l) => QA.push(0, 100, 256, 60, l), 'f' + i); }
const m3 = await page.evaluate(() => QA.metrics());
console.log('per-frame twins-band diff:', m3.map(m => m.diff).join(' '));
await t.close();
