// QA v2 (ux lens): live rotation / resize while playing: portrait -> landscape -> portrait, and desktop window resize 1280x800 -> 700x500 -> 1280x800.
import path from 'path';
import { open, OUT, wait, touchKit } from './qa_v2_ux_lib.mjs';
async function run(name, cfg, sizes) {
  const t = await open({ ...cfg, name, scheme: 'dark' });
  await wait(1000);
  const ov = await t.ev(() => { const r = document.getElementById('focus').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height * 0.92]; });
  const f0 = await (await t.frame.frameElement()).boundingBox();
  if (cfg.touch) { const k = await touchKit(t); await k.tap(f0.x + ov[0], f0.y + ov[1]); } else await t.page.mouse.click(f0.x + ov[0], f0.y + ov[1]);
  await wait(900);
  await t.ev(() => fz.start(1, 1, 5)); await wait(2500);
  let i = 0;
  for (const [w, h] of sizes) {
    await t.page.setViewportSize({ width: w, height: h }); await wait(1500);
    const m = await t.ev(() => { const b = document.getElementById('screen').getBoundingClientRect(); return { cv: [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)], lay: (({ mode, scale, k, backW, backH }) => ({ mode, scale: +scale.toFixed(3), k, backW, backH }))(fz._main.layout()), sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight, q: fz.quality, paused: fz._main.paused(), holds: fz._main.holds(), btns: [...document.querySelectorAll('#touch button')].map((x) => { const r = x.getBoundingClientRect(); return x.dataset.k + ':' + [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)].join('x'); }) }; });
    console.log(name, w + 'x' + h, JSON.stringify(m));
    await t.page.screenshot({ path: path.join(OUT, `${name}_${i++}_${w}x${h}.png`) });
  }
  console.log(name, 'errors', JSON.stringify(t.errors));
  await t.close();
}
await run('rot_ph', { w: 390, h: 844, dpr: 3, touch: true }, [[844, 390], [390, 844], [390, 664]]);
await run('rot_desk', { w: 1280, h: 800, dpr: 1, touch: false }, [[700, 500], [1280, 800], [420, 700]]);
