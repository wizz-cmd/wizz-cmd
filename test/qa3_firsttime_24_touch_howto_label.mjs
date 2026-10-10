// Step 24: touch HOW TO PLAY: the footer label says "TAP: NEXT" (drawn at x 4..76, y 211) but the hit-test sends x<64,y>200 to the PREVIOUS page.
import { open, check, wait, touchKit } from './qa3_firsttime_lib.mjs';
const t = await open({ w: 390, h: 844, touch: true, dpr: 2, name: 'thl' });
const k = await touchKit(t);
await wait(900);
const ov = await t.ev(() => { const r = document.getElementById('focus').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const fr = await (await t.frame.frameElement()).boundingBox();
await k.tap(fr.x + ov.x + ov.w / 2, fr.y + ov.y + ov.h / 2); await wait(500);
let p = await k.cv(128, 80 + 32 + 16); await k.tap(p.x, p.y); await wait(500);       // HOW TO PLAY row
console.log('scene', await t.scene());
const pageNo = async () => await t.ev(() => { /* page number is private; read it from the dots via pixel colour */ const c = document.getElementById('screen'); const g = c.getContext('2d'); const m = c.width / 256; for (let i = 0; i < 6; i++) { const d = g.getImageData(Math.round((128 - 36 + i * 12 + 4) * m), Math.round(214 * m), 1, 1).data; if (d[0] > 200 && d[1] > 180 && d[2] < 150) return i; } return -1; });
console.log('page at start', await pageNo());
// wave-3 regression pass (R7): the footer now shows two labels that match the hit zones: "< BACK" at the bottom-left (previous
// page, or the title from page 0) and "TAP: NEXT" at the bottom-right (next page). Tap each label's centre.
// 1) "TAP: NEXT" on page 0 -> page 1
p = await k.cv(216, 215); await k.tap(p.x, p.y); await wait(400);
const a = await pageNo();
console.log('after tapping the TAP: NEXT label on page 0 -> page', a);
// 2) "TAP: NEXT" again -> page 2, then "< BACK" -> page 1
await k.tap(p.x, p.y); await wait(400);
const b0 = await pageNo();
p = await k.cv(40, 215); await k.tap(p.x, p.y); await wait(400);
const b = await pageNo();
console.log('page after NEXT', b0, 'then after tapping "< BACK" ->', b);
// 3) "< BACK" on page 1 -> page 0, then "< BACK" on page 0 -> title
await k.tap(p.x, p.y); await wait(400);
const c = await pageNo();
await k.tap(p.x, p.y); await wait(500);
const scn = await t.scene();
console.log('back to page', c, 'then title?', scn);
await t.shot('label');
check('tapping the "TAP: NEXT" label advances to the next page', a === 1 && b0 === 2, { a, b0 });
check('tapping the "< BACK" label goes to the previous page / leaves from page 0', b === 1 && c === 0 && scn === 'title', { b, c, scn });
await t.close();
