import { setup } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
const r = await g.evaluate(() => fz.GFX._registry().slice(52).map(d => `${d.name}:${d.w}x${d.h}f${d.frames}p${d.pad.l},${d.pad.r},${d.pad.t},${d.pad.b}`));
console.log(r.join('\n'));
await t.close();
