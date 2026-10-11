// QA v2 (ux lens): title with the CONTINUE ROUND row (reached round >= 6): row geometry / touch target heights / overlaps on phone + desktop.
import path from 'path';
import { open, OUT, wait, touchKit } from './qa_v2_ux_lib.mjs';
const CFG = [{ name: 'ct_ph390', w: 390, h: 844, dpr: 3, touch: true }, { name: 'ct_ph360', w: 360, h: 740, dpr: 3, touch: true }, { name: 'ct_land844', w: 844, h: 390, dpr: 3, touch: true }, { name: 'ct_desk', w: 1280, h: 800, dpr: 1, touch: false }];
for (const c of CFG) {
  const t = await open({ ...c, scheme: 'dark' });
  await wait(1000);
  { const ov = await t.ev(() => { const r = document.getElementById('focus').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height * 0.92]; });
    const f0 = await (await t.frame.frameElement()).boundingBox();
    if (c.touch) { const k = await touchKit(t); await k.tap(f0.x + ov[0], f0.y + ov[1]); } else await t.page.mouse.click(f0.x + ov[0], f0.y + ov[1]);
    await wait(900); }
  await t.ev(() => { fz.freeze(true); fz.start(1, 6, 1); for (let i = 0; i < 20; i++) fz.step(1); fz.goto('title'); for (let i = 0; i < 60; i++) fz.step(1); });
  const info = await t.ev(() => ({ rows: fz._main.rows(), scale: fz._main.layout().scale, session: fz._main.session() }));
  const css = info.rows.map((r) => ({ id: r.id, hCss: +(r.h * info.scale).toFixed(1) }));
  console.log(c.name, 'scale', info.scale.toFixed(3), 'session', JSON.stringify(info.session), 'rows css pitch', JSON.stringify(css));
  const r = await t.frame.evaluate(() => { const c = document.getElementById('screen').getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height }; });
  const f = await (await t.frame.frameElement()).boundingBox();
  await t.page.screenshot({ path: path.join(OUT, `${c.name}_title_continue.png`), clip: { x: f.x + r.x, y: f.y + r.y, width: r.w, height: r.h } });
  await t.close();
}
