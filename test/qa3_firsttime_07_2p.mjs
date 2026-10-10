// Step 7: 2P start on keyboard (title -> 2 PLAYERS), both players on one keyboard; P2 join with Q in a 1P game; pause/resume with leak checks
import { open, check, wait } from './qa3_firsttime_lib.mjs';
const t = await open({ w: 1280, h: 800, name: 'p2' });
await wait(600);
const cb = await t.ev(() => { const r = document.getElementById('focus').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
await t.page.mouse.click(cb.x + cb.w / 2, cb.y + 20);
await wait(500);
await t.key('ArrowDown', 60); await wait(100);
console.log('rows', JSON.stringify(await t.ev(() => fz._main.rows().map(r => r.label + (r.sel ? '*' : '')))));
await t.shot('0_title_2p_sel', { canvas: true });
await t.key('Enter', 80); await wait(1200);
console.log('scene', await t.scene());
await t.key('Enter', 80);
await wait(4300);
let s = await t.st();
console.log('players', JSON.stringify(s.players.map(p => ({ x: p.x, y: p.y, lives: p.lives }))), 'phase', s.phase);
await t.shot('1_2p_play', { canvas: true });
// P1 right, P2 left via WASD
await t.page.keyboard.down('ArrowRight'); await t.page.keyboard.down('KeyA'); await wait(500);
await t.page.keyboard.up('ArrowRight'); await t.page.keyboard.up('KeyA');
s = await t.st(); console.log('after moves', JSON.stringify(s.players.map(p => ({ x: p.x, face: p.face }))));
// P2 fire with Q, shift; P1 fire Space
await t.key('KeyQ', 60); await wait(150);
const b1 = (await t.st()).bubbles.length;
await t.key('ShiftLeft', 60); await wait(150);
const b2 = (await t.st()).bubbles.length;
await t.key('Space', 60); await wait(150);
const b3 = (await t.st()).bubbles.length;
console.log('bubbles after Q / Shift / Space', b1, b2, b3);
await t.shot('2_2p_bubbles', { canvas: true });
// pause with P, resume with Space -> any bubble leak?
const before = (await t.st()).bubbles.length;
await t.key('KeyP', 60); await wait(300);
console.log('paused', await t.ev(() => fz._main.paused()));
await t.shot('3_pause', { canvas: true });
await t.key('Space', 60); await wait(300);
const after = (await t.st());
console.log('resumed paused=', await t.ev(() => fz._main.paused()), 'bubbles before/after', before, after.bubbles.length);
// Escape pause, Enter resume
await t.key('Escape', 60); await wait(200);
console.log('esc paused', await t.ev(() => fz._main.paused()));
await t.key('Escape', 60); await wait(200);
console.log('esc again paused', await t.ev(() => fz._main.paused()));
// W jump and A/D
console.log('errors', t.errors);
await t.close();

// 1P game: Q joins P2
{
  const t = await open({ w: 1280, h: 800, name: 'p2join' });
  await wait(600);
  const cb = await t.ev(() => { const r = document.getElementById('focus').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await t.page.mouse.click(cb.x + cb.w / 2, cb.y + 20);
  await wait(500);
  await t.key('Enter', 80); await wait(900); await t.key('Enter', 80);
  await wait(4000);
  await t.key('KeyQ', 60); await wait(500);
  let s = await t.st();
  console.log('after Q: players', s.players.length, JSON.stringify(s.players.map(p => ({ x: p.x, lives: p.lives, state: p.state, inv: p.inv }))));
  await t.shot('4_joined', { canvas: true });
  await wait(1500);
  await t.shot('5_joined_later', { canvas: true });
  console.log('errors', t.errors);
  await t.close();
}
