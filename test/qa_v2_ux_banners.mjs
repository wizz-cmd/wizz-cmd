// QA v2 (ux lens): banners / HUD on every theme at phone and desktop scale: ROUND n + READY!, EXTEND letters lit, 2P HUD, lives pearls, boss round, HURRY UP, GAME OVER.
// Frozen stepping (deterministic). Crops of the canvas only.
import path from 'path';
import { open, OUT, wait, touchKit } from './qa_v2_ux_lib.mjs';
const CFG = [{ name: 'bn_ph390', w: 390, h: 844, dpr: 3, touch: true }, { name: 'bn_desk', w: 1280, h: 800, dpr: 1, touch: false }];
const only = process.argv[2];
for (const c of CFG) {
  if (only && c.name !== only) continue;
  const t = await open({ ...c, scheme: 'dark' });
  await wait(1000);
  { const ov = await t.ev(() => { const r = document.getElementById('focus').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height * 0.92]; });
    const f0 = await (await t.frame.frameElement()).boundingBox();
    if (c.touch) { const k = await touchKit(t); await k.tap(f0.x + ov[0], f0.y + ov[1]); } else await t.page.mouse.click(f0.x + ov[0], f0.y + ov[1]);
    await wait(900); }
  const crop = async (label) => {
    await t.ev(() => fz._main.renderNow());
    const r = await t.frame.evaluate(() => { const c = document.getElementById('screen').getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height }; });
    const f = await (await t.frame.frameElement()).boundingBox();
    await t.page.screenshot({ path: path.join(OUT, `${c.name}_${label}.png`), clip: { x: f.x + r.x, y: f.y + r.y, width: r.w, height: r.h } });
  };
  await t.ev(() => fz.freeze(true));
  for (const lvl of [1, 6, 11, 16, 21, 26]) {
    await t.ev((l) => { fz.start(1, l, 5); for (let i = 0; i < 50; i++) fz.step(1); }, lvl);
    const st = await t.ev(() => { const s = fz.Game.debug.state(); return { phase: s.phase, level: s.level, frame: s.frame }; });
    await crop(`r${lvl}_banner`);
    console.log(c.name, 'level', lvl, JSON.stringify(st));
  }
  // EXTEND letters lit, many lives, 2P, hurry
  await t.ev(() => { fz.start(2, 11, 5); fz.Game.debug.skipIntro(); for (let i = 0; i < 90; i++) fz.step(1); const S = fz.Game.debug._S(); S.players[0].letters = [true, true, false, true, false, false]; S.players[0].lives = 6; S.players[1].letters = [false, true, true, false, false, false]; S.players[1].lives = 4; fz.Game.debug.god(true); for (let i = 0; i < 5; i++) fz.step(1); });
  await crop('hud_2p_letters');
  await t.ev(() => { fz.Game.debug.setHurryTimer(1); for (let i = 0; i < 30; i++) fz.step(1); });
  await crop('hurry_a');
  await t.ev(() => { for (let i = 0; i < 60; i++) fz.step(1); });
  await crop('hurry_b');
  await t.ev(() => { fz.start(1, 30, 5); for (let i = 0; i < 50; i++) fz.step(1); });
  await crop('boss_banner');
  await t.ev(() => { fz.Game.debug.skipIntro(); for (let i = 0; i < 150; i++) fz.step(1); });
  await crop('boss_play');
  console.log(c.name, 'errors', JSON.stringify(t.errors));
  await t.close();
}
