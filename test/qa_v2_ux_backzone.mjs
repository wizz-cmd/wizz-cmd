// QA v2 (ux lens): size of the touch BACK zone on the how-to pages (bottom-left "< BACK" label).
import { open, wait, touchKit } from './qa_v2_ux_lib.mjs';
const t = await open({ w: 360, h: 740, dpr: 3, touch: true, name: 'bz', scheme: 'dark' });
const k = await touchKit(t);
await wait(1000);
const ov = await t.ev(() => { const r = document.getElementById('focus').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height * 0.92]; });
const f0 = await (await t.frame.frameElement()).boundingBox();
await k.tap(f0.x + ov[0], f0.y + ov[1]); await wait(1000);
const scale = (await t.ev(() => fz._main.layout())).scale;
const probe = async (lx, ly) => {
  await t.ev(() => fz.goto('howto', { page: 3 })); await wait(700);
  const p = await k.cv(lx, ly); await k.tap(p.x, p.y); await wait(400);
  return t.ev(() => fz._main.howtoPage());
};
const res = {};
for (const [lx, ly] of [[30, 215], [30, 202], [30, 199], [62, 210], [66, 210]]) res[`(${lx},${ly})`] = await probe(lx, ly);
console.log('scale', scale, 'pages after tap from page 3 (2 = BACK, 4 = NEXT)', JSON.stringify(res), 'zone css px =', (64 * scale).toFixed(0), 'x', (24 * scale).toFixed(0));
await t.close();
