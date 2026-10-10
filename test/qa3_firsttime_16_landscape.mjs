// Step 16: phone landscape 844x390 / 667x375: overlay, title, play, thumbs reachability (buttons vs picture)
import { open, check, wait, touchKit } from './qa3_firsttime_lib.mjs';
for (const [W, H] of [[844, 390], [667, 375]]) {
  const t = await open({ w: W, h: H, touch: true, dpr: 2, name: `ls${W}` });
  const k = await touchKit(t);
  await wait(1000);
  await t.shot('0_overlay');
  const ov = await t.ev(() => { const r = document.getElementById('focus').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const fr = await (await t.frame.frameElement()).boundingBox();
  await k.tap(fr.x + ov.x + ov.w / 2, fr.y + ov.y + ov.h / 2); await wait(600);
  console.log(W, 'layout', JSON.stringify((await t.ui()).lay));
  await t.shot('1_title');
  let p = await k.cv(128, 96); await k.tap(p.x, p.y); await wait(1000);
  p = await k.cv(128, 100); await k.tap(p.x, p.y); await wait(4200);
  await t.shot('2_play');
  const bt = {}; for (const n of ['left', 'right', 'jump', 'fire', 'pause', 'sound']) bt[n] = await k.btn(n);
  console.log(W, 'buttons', JSON.stringify(bt));
  const c = await t.ev(() => { const r = document.getElementById('screen').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  console.log(W, 'canvas', JSON.stringify(c), 'overlaps?', ['left', 'right', 'jump', 'fire'].map(n => { const b = bt[n]; const bx = b.x - fr.x; return !(bx + b.w / 2 < c.x || bx - b.w / 2 > c.x + c.w); }));
  console.log('errors', t.errors);
  await t.close();
}
