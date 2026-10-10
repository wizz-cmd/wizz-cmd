// Step 12: stuck focus / blur flows inside the iframe: (a) focus lost mid-round (b) lost on title (c) lost during name entry (d) lost during story
import { open, check, wait } from './qa3_firsttime_lib.mjs';
const t = await open({ w: 1280, h: 800, name: 'blur' });
await wait(600);
const click = async () => { const cb = await t.ev(() => { const r = document.getElementById('focus').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }); await t.page.mouse.click(cb.x + cb.w / 2, cb.y + 20); await wait(400); };
await click();
const blur = async () => { await t.page.evaluate(() => { document.getElementById('f').blur(); window.focus(); document.body.tabIndex = -1; document.body.focus(); }); await wait(700); };
// (a) mid-round
await t.key('Enter', 80); await wait(900); await t.key('Enter', 80); await wait(4000);
const f0 = (await t.st()).frame;
await blur();
let u = await t.ui();
console.log('(a) after blur', JSON.stringify({ focusHidden: u.focusHidden, paused: u.paused, holds: u.holds }));
await t.shot('a_blurred', { canvas: false });
const f1 = (await t.st()).frame; await wait(1000); const f2 = (await t.st()).frame;
console.log('frames frozen while blurred?', f1 === f2, f0, f1, f2);
// keys while blurred (go to host page): nothing should happen in the game
await t.page.keyboard.press('Space'); await t.page.keyboard.press('Enter'); await wait(200);
console.log('after keys while blurred: paused', (await t.ui()).paused, 'bubbles', (await t.st()).bubbles.length);
console.log('audio while blurred', JSON.stringify(await t.audio()));
await click();
u = await t.ui();
console.log('(a) after click', JSON.stringify({ focusHidden: u.focusHidden, paused: u.paused, holds: u.holds }));
await t.shot('a_after_click', { canvas: false });
console.log('audio after click', JSON.stringify(await t.audio()));
// keys work again?
await t.key('Space', 60); await wait(200);
console.log('bubbles after Space', (await t.st()).bubbles.length);
// (b) blur while on RESUME menu (manual pause) then click overlay: does it resume or stay paused?
await t.key('KeyP', 60); await wait(300);
console.log('manual pause', await t.ev(() => fz._main.paused()));
await blur(); await click();
u = await t.ui();
console.log('(b) manual pause + blur + click: paused?', u.paused, 'holds', u.holds);
console.log('errors', t.errors);
await t.close();
