// Step 22: crispness / size on common desktop windows inside the iframe: 1536x730@1.25 (Windows laptop, iframe viewport), 1440x780@2 (MacBook), 1280x600@1, 960x540@1
import { open, check, wait } from './qa3_firsttime_lib.mjs';
for (const [w, h, dpr] of [[1536, 730, 1.25], [1440, 780, 2], [1280, 600, 1], [960, 540, 1]]) {
  const t = await open({ w, h, dpr, name: `dpr${w}x${h}` });
  await wait(900);
  const cb = await t.ev(() => { const r = document.getElementById('focus').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await t.page.mouse.click(cb.x + cb.w / 2, cb.y + 10);
  await wait(400);
  const lay = (await t.ui()).lay;
  console.log(`${w}x${h}@${dpr}`, JSON.stringify({ scale: +lay.scale.toFixed(3), sharp: lay.sharp, legend: lay.legend, w: lay.w, h: lay.h, m: lay.m }), 'device px per game px', (lay.scale * dpr).toFixed(3));
  await t.shot('title');
  await t.close();
}
