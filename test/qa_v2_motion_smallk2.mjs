// small-k legibility of banners and chain popups on bright themes (native device pixels, zoomed with nearest for review)
import { launch, fp, OUT } from './qa_v2_motion_lib.mjs';
import fs from 'fs';
fs.mkdirSync(`${OUT}/smallk`, { recursive: true });
for (const cfg of [{ n: 'k1.25', w: 320, h: 568, dpr: 1 }, { n: 'k2', w: 390, h: 844, dpr: 1.5 }]) {
  const t = await launch({ viewport: { width: cfg.w, height: cfg.h }, deviceScaleFactor: cfg.dpr, touch: true });
  const g = fp(t.page);
  await g.wait(700); await g.freeze(true);
  const shot = async (n) => { const el = await t.page.$('#screen'); const bb = await el.boundingBox(); await t.page.screenshot({ path: `${OUT}/smallk/${cfg.n}_${n}.png`, clip: bb }); };
  console.log(cfg.n, await g.evaluate(() => fz._main.k()));
  // intro banner on volcanic round 21
  await g.start(1, 21, 4); await g.step(100); await shot('L21_intro_banner');
  await g.step(80); await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.god(true); fz.Game.debug.noClear(true); }); await g.step(30);
  // hurry banner on L11 (ship)
  await g.start(1, 11, 4); await g.step(170); await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.god(true); fz.Game.debug.noClear(true); fz.Game.debug.setHurryTimer(45 * 60 - 50); }); await g.step(52); await shot('L11_hurry_banner');
  // popups: chain
  await g.start(1, 6, 4); await g.step(170);
  await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.clearEnemies(); fz.Game.debug.god(true); fz.Game.debug.noClear(true); });
  await g.evaluate(() => { const S = fz.Game.debug._S(); for (let i = 0; i < 5; i++) { /* score popups via kills */ } fz.Game.debug.addScore(0, 4000); });
  // game over & extend banner
  await g.evaluate(() => { const S = fz.Game.debug._S(); S.phase = 'gameover'; S.over = true; }); await g.step(10); await shot('gameover_banner');
  await t.close();
}
import { execSync } from 'child_process';
