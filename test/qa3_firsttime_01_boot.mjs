// Step 1: first paint, focus overlay, audio before/after the first click (desktop 1280x800, sandboxed cross-origin iframe)
import { open, check, wait, OUT } from './qa3_firsttime_lib.mjs';
const sameOrigin = process.argv.includes('--same');
const t = await open({ w: 1280, h: 800, name: sameOrigin ? 'd_boot_same' : 'd_boot', sameOrigin });
await wait(300);
await t.shot('0_firstpaint');
await wait(1500);
console.log('ui@1.8s', JSON.stringify(await t.ui()));
console.log('audio before gesture', JSON.stringify(await t.audio()));
await t.shot('1_overlay', { canvas: true });
// a newcomer presses Enter BEFORE clicking: the keyboard goes to the host page, not the iframe
await t.page.keyboard.press('Enter');
await wait(400);
console.log('after Enter (no click) scene', await t.scene(), JSON.stringify(await t.ui()));
// click on the overlay
const box = await t.page.locator('#f').boundingBox();
const cb = await t.frame.evaluate(() => { const r = document.getElementById('focus').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
console.log('overlay box', cb);
await t.page.mouse.click(cb.x + cb.w / 2, cb.y + cb.h / 2);
await wait(500);
console.log('ui after click', JSON.stringify(await t.ui()));
console.log('audio after click', JSON.stringify(await t.audio()));
await t.shot('2_after_click', { canvas: true });
await wait(2500);
console.log('audio +2.5s', JSON.stringify(await t.audio()));
console.log('errors', t.errors);
console.log('logs', t.logs.filter((l) => !/\[log\]/.test(l)).slice(0, 10));
await t.close();
