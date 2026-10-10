// Step 9: phone 390x844 touch inside the sandboxed iframe: overlay -> title -> how to play -> start -> first round with the on-screen buttons
import { open, check, wait, touchKit } from './qa3_firsttime_lib.mjs';
const W = +process.argv[2] || 390, H = +process.argv[3] || 844;
const t = await open({ w: W, h: H, touch: true, dpr: 2, name: `ph${W}` });
const k = await touchKit(t);
await wait(1200);
console.log('ui', JSON.stringify(await t.ui()));
await t.shot('0_overlay');
console.log('audio before tap', JSON.stringify(await t.audio()));
// tap somewhere harmless that a newcomer would tap: the overlay centre
const ov = await t.ev(() => { const r = document.getElementById('focus').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, txt: document.getElementById('focus').innerText }; });
console.log('overlay', JSON.stringify(ov));
const fr = await (await t.frame.frameElement()).boundingBox();
await k.tap(fr.x + ov.x + ov.w / 2, fr.y + ov.y + ov.h / 2);
await wait(700);
console.log('ui after tap', JSON.stringify((({ focusHidden, hasFocus, scene, touchMode, touchOnly }) => ({ focusHidden, hasFocus, scene, touchMode, touchOnly }))(await t.ui())));
console.log('audio after tap', JSON.stringify(await t.audio()));
await t.shot('1_title');
console.log('rows', JSON.stringify(await t.ev(() => fz._main.rows())));
console.log('errors', t.errors);
await t.close();
