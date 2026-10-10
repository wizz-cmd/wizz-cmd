// Step 2: title menu navigation + HOW TO PLAY pages + HI-SCORES, desktop, with real key presses in the iframe
import { open, check, wait } from './qa3_firsttime_lib.mjs';
const t = await open({ w: 1280, h: 800, name: 'd_howto' });
await wait(800);
const cb = await t.ev(() => { const r = document.getElementById('focus').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
await t.page.mouse.click(cb.x + cb.w / 2, cb.y + 20);
await wait(400);
await t.key('ArrowDown'); await wait(200);
await t.shot('0_menu_down1', { canvas: true });
console.log('rows', JSON.stringify(await t.ev(() => fz._main.rows().map(r => r.label + (r.sel ? '*' : '')))));
await t.key('ArrowDown'); await t.key('ArrowDown'); await wait(200);
console.log('rows', JSON.stringify(await t.ev(() => fz._main.rows().map(r => r.label + (r.sel ? '*' : '')))));
await t.key('Enter'); await wait(300);
console.log('scene after Enter on HOW TO PLAY?', await t.scene());
for (let p = 0; p < 6; p++) {
  await wait(250);
  await t.shot(`1_howto_p${p}`, { canvas: true });
  await t.key('ArrowRight'); await wait(150);
}
console.log('scene after 6 pages', await t.scene());
await t.key('KeyT'); await wait(400);
console.log('scene after T', await t.scene());
await t.shot('2_scores', { canvas: true });
await t.key('Enter'); await wait(400);
console.log('scene after Enter on scores', await t.scene());
console.log('errors', t.errors);
await t.close();
