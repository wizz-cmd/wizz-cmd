// QA v2 (ux lens): thin-stroke legibility at LOW device pixel ratios (DPR 1 phone / small pane, DPR 1.5, DPR 2 phone): how-to page 2 (cast, scale-1 text), title hint block and HUD at 1:1 device pixels.
import path from 'path';
import { open, OUT, wait, touchKit } from './qa_v2_ux_lib.mjs';
const CFG = [
  { name: 'lo_ph360_dpr1', w: 360, h: 640, dpr: 1, touch: true },
  { name: 'lo_ph360_dpr2', w: 360, h: 740, dpr: 2, touch: true },
  { name: 'lo_ph390_dpr2', w: 390, h: 844, dpr: 2, touch: true },
  { name: 'lo_pane600_dpr1', w: 600, h: 400, dpr: 1, touch: false },
];
for (const c of CFG) {
  const t = await open({ ...c, scheme: 'dark' });
  await wait(1000);
  const ov = await t.ev(() => { const r = document.getElementById('focus').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height * 0.9]; });
  const fr = await (await t.frame.frameElement()).boundingBox();
  if (c.touch) { const k = await touchKit(t); await k.tap(fr.x + ov[0], fr.y + ov[1]); } else await t.page.mouse.click(fr.x + ov[0], fr.y + ov[1]);
  await wait(1200);
  const crop = async (label) => {
    const r = await t.frame.evaluate(() => { const c = document.getElementById('screen').getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height }; });
    const f = await (await t.frame.frameElement()).boundingBox();
    await t.page.screenshot({ path: path.join(OUT, `${c.name}_${label}.png`), clip: { x: f.x + r.x, y: f.y + r.y, width: r.w, height: r.h } });
  };
  await crop('title');
  await t.ev(() => { fz.freeze(true); fz.goto('howto', { page: 2 }); fz.step(40); });
  await crop('howto2');
  await t.ev(() => { fz.goto('howto', { page: 1 }); fz.step(40); });
  await crop('howto1');
  await t.ev(() => { fz.start(1, 1, 5); fz.step(200); });
  await crop('play');
  const lay = await t.ev(() => fz._main.layout());
  console.log(c.name, 'k', lay.k, 'scale', lay.scale.toFixed(3), 'back', lay.backW, lay.backH, 'errors', t.errors.length);
  await t.close();
}
