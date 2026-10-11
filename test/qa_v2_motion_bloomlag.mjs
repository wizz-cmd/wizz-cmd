// Bloom refresh lag: HURRY UP! banner blinks hard on/off every 5 frames; measure residual luminance in the text region on the "off" frames.
import { setup, sheet, OUT } from './qa_v2_motion_lib.mjs';
for (const q of [2, 1]) {
  const { t, g, page } = await setup();
  await g.start(1, 1, 3);
  await g.step(160);
  await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.clearEnemies(); fz.Game.debug.god(true); fz.Game.debug.noClear(true); });
  await g.evaluate((q) => fz._main.setQuality(q, true), q);
  await g.step(100);
  await g.evaluate(() => fz.Game.debug.setHurryTimer(2700 - 3));
  const rows = [];
  for (let i = 0; i < 40; i++) {
    await g.step(1);
    const v = await page.evaluate(() => { const c = QA.grab(50, 90, 156, 14); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = 0, n = 0; for (let i = 0; i < d.length; i += 4) { s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++; } return +(s / n).toFixed(2); });
    const banner = await g.evaluate(() => fz.Game.debug._S().hurryBanner);
    rows.push([i, banner, v]);
  }
  console.log('quality', q, rows.map(r => `${r[1]}:${r[2]}`).join(' '));
  await t.close();
}
