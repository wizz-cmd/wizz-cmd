// small render scales (phones / tiny windows): native-pixel screenshots of gameplay HUD + text scenes
import { launch, fp, OUT, save } from './qa_v2_motion_lib.mjs';
import fs from 'fs';
const cfgs = [
  { name: 'k1.25_320x568_d1', w: 320, h: 568, dpr: 1, touch: true },
  { name: 'k1.5_390x844_d1', w: 390, h: 844, dpr: 1, touch: true },
  { name: 'k2_390x844_d1.5', w: 390, h: 844, dpr: 1.5, touch: true },
  { name: 'k1.25_desk_340x300', w: 340, h: 300, dpr: 1, touch: false },
];
for (const c of cfgs) {
  const t = await launch({ viewport: { width: c.w, height: c.h }, deviceScaleFactor: c.dpr, touch: c.touch });
  const g = fp(t.page);
  await g.wait(700);
  const info = await g.evaluate(() => ({ k: fz._main.k(), q: fz._main.quality(), lay: fz._main.layout() }));
  console.log(c.name, 'k', info.k, 'q', info.q, 'canvas css', info.lay.w, info.lay.h);
  await g.freeze(true);
  const shot = async (n) => { const el = await t.page.$('#screen'); const bb = await el.boundingBox(); await t.page.screenshot({ path: `${OUT}/smallk/${c.name}_${n}.png`, clip: bb }); };
  fs.mkdirSync(`${OUT}/smallk`, { recursive: true });
  await shot('title');
  await g.start(2, 1, 5); await g.step(170); await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.god(true); }); await g.step(30);
  // one bubble chain on screen for popups: add letter bubble + score
  await g.evaluate(() => { fz.Game.debug.addScore(0, 12340); fz.Game.debug.give(0, 'shoes'); });
  await g.step(2);
  await shot('play');
  await g.goto('howto'); await g.step(30); await shot('howto');
  await g.goto('scores'); await g.step(60); await shot('scores');
  console.log(t.errors);
  await t.close();
}
