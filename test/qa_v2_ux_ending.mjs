// QA v2 (ux lens): ending (victory tableau -> credits -> cast waves) and boss-round HUD at phone + desktop scale; crops of the canvas.
import path from 'path';
import { open, OUT, wait, touchKit } from './qa_v2_ux_lib.mjs';
const CFG = [{ name: 'en_ph390', w: 390, h: 844, dpr: 3, touch: true }, { name: 'en_desk', w: 1280, h: 800, dpr: 1, touch: false }];
for (const c of CFG) {
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
  await t.ev(() => { fz.freeze(true); fz.goto('ending', { res: { won: true, level: 30, scores: [88000, 61000], players: 2 }, entries: [] }); });
  for (const [label, frames] of [['a_t2s', 120], ['b_t8s', 360], ['c_t14s', 360], ['d_t22s', 480], ['e_t34s', 720], ['f_t50s', 960]]) {
    await t.ev((n) => { for (let i = 0; i < n; i++) fz.step(1); }, frames);
    await crop(label);
    console.log(c.name, label, JSON.stringify(await t.ev(() => ({ scene: fz.scene(), band: (() => { try { return fz._main.endingBand(); } catch (e) { return String(e); } })() }))));
  }
  console.log(c.name, 'errors', JSON.stringify(t.errors));
  await t.close();
}
