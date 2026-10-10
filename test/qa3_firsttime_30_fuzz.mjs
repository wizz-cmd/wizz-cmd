// Step 30: a chaotic newcomer mashes keys / clicks everywhere for 45 s of real time (seeded). Errors? Stuck states? Can they always get back to the title?
import { open, check, wait } from './qa3_firsttime_lib.mjs';
const t = await open({ w: 1280, h: 800, name: 'fz' });
await wait(500);
const cb = await t.ev(() => { const r = document.getElementById('focus').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
await t.page.mouse.click(cb.x + cb.w / 2, cb.y + 20);
await wait(300);
let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const KEYS = ['Enter', 'Space', 'KeyZ', 'KeyX', 'KeyQ', 'ShiftLeft', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyP', 'Escape', 'KeyM', 'KeyH', 'KeyT', 'Backspace', 'Tab', 'KeyK'];
const seen = {};
const T0 = Date.now();
while (Date.now() - T0 < 45000) {
  const r = rnd();
  if (r < 0.75) { const k = KEYS[Math.floor(rnd() * KEYS.length)]; await t.page.keyboard.down(k); await wait(20 + rnd() * 120); await t.page.keyboard.up(k); }
  else if (r < 0.9) { await t.page.mouse.click(cb.x + rnd() * cb.w, cb.y + rnd() * cb.h); }
  else { await wait(200 + rnd() * 400); }
  const u = await t.ev(() => ({ sc: fz.scene(), p: fz._main.paused() }));
  seen[u.sc + (u.p ? '+pause' : '')] = (seen[u.sc + (u.p ? '+pause' : '')] || 0) + 1;
  if (u.sc === 'play') { await t.ev(() => { try { fz.Game.debug.god(true); } catch (e) {} }); }   // keep the chaos going instead of dying at once
}
console.log('scenes seen', JSON.stringify(seen));
console.log('errors', t.errors.length, t.errors.slice(0, 3));
// recover: Esc/Enter spam must reach the title eventually
let sc = '';
for (let i = 0; i < 12; i++) { sc = await t.scene(); if (sc === 'title') break; await t.key('Escape', 60); await t.key('Enter', 60); await wait(300); }
console.log('end scene', await t.scene(), 'focus overlay', (await t.ui()).focusHidden);
await t.shot('end');
check('no console errors during 45 s of key mashing', t.errors.length === 0, t.errors.slice(0, 3));
await t.close();
