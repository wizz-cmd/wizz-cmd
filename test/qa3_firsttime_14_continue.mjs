// Step 14: reach round 6+, die, game over, title shows CONTINUE ROUND n; use it (desktop, real keys). Also the hi-score path with a big score.
import { open, check, wait } from './qa3_firsttime_lib.mjs';
const t = await open({ w: 1280, h: 800, name: 'cont' });
await wait(600);
const cb = await t.ev(() => { const r = document.getElementById('focus').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
await t.page.mouse.click(cb.x + cb.w / 2, cb.y + 20);
await wait(500);
await t.key('Enter', 80); await wait(900); await t.key('Enter', 80); await wait(4000);
await t.ev(() => { fz.Game.debug.setLevel(8); });
await wait(4200);
console.log('level', (await t.st()).level, 'phase', (await t.st()).phase);
await t.shot('0_round8', { canvas: true });
await t.ev(() => { fz.Game.debug.setPlayer(0, { lives: 1 }); fz.Game.debug.addScore(0, 12000); });
let sc = '';
for (let i = 0; i < 500; i++) { sc = await t.scene(); if (sc === 'entry') break; await wait(150); }
console.log('scene', sc, JSON.stringify(await t.ev(() => fz._main.entry())));
// enter name "ZED"? real keys: Left from A goes to digits; use Right x25 for Z is silly -> accept AAA with 3 confirms
await wait(600);
for (let i = 0; i < 3; i++) { await t.key('Space', 60); }
await wait(1500);
console.log('scene after entry', await t.scene());
await t.shot('1_scores', { canvas: true });
await wait(1500);
await t.key('Enter', 60); await wait(500);
console.log('scene', await t.scene(), JSON.stringify(await t.ev(() => fz._main.rows().map(r => r.label + (r.sel ? '*' : '')))), 'session', JSON.stringify(await t.ev(() => fz._main.session())));
await t.shot('2_title_with_continue', { canvas: true });
await t.key('ArrowDown', 60);
console.log('rows', JSON.stringify(await t.ev(() => fz._main.rows().map(r => r.label + (r.sel ? '*' : '')))));
await t.key('ArrowDown', 60);
await t.key('Enter', 80); await wait(600);
console.log('scene', await t.scene());
await t.key('Enter', 80); await wait(1200);
const st = await t.st();
console.log('continue game: level', st.level, 'score', st.players[0].score, 'lives', st.players[0].lives, 'phase', st.phase);
await t.shot('3_continue_intro', { canvas: true });
await wait(4000);
console.log('audio', JSON.stringify(await t.audio()));
console.log('errors', t.errors);
await t.close();
