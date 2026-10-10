// QA platform: real keyboard path (RAF loop, no virtual input). Chords for 2P, key repeat, focus loss mid-press (stuck keys), pause/Esc.
import fs from 'fs'; import path from 'path';
import { launchBrowser, serve, DIST, OUT, open, ev, log } from './qa_platform_lib.mjs';
const browser = await launchBrowser({ autoplay: true });
const t = await open({ browser, viewport: { width: 1024, height: 768 } });
const P = t.page;
await ev(P, () => { fz.start(2, 1, 5); fz.Game.debug.skipIntro(); fz.Game.debug.clearEnemies(); fz.Game.debug.noClear(true); fz.Game.debug.god(true); });
await P.waitForTimeout(300);
const st = () => ev(P, () => { const S = fz.Game.debug._S(); return { p: S.players.map((p) => ({ x: +p.x.toFixed(1), y: +p.y.toFixed(1), vy: +p.vy.toFixed(2), g: p.onGround })), b: S.bubbles.length, paused: fz._main.paused() }; });
const s0 = await st(); log('start', JSON.stringify(s0));
// 1) 6-key chord: P1 Right+Up+Space, P2 D+W+Q at once
await P.keyboard.down('ArrowRight'); await P.keyboard.down('ArrowUp'); await P.keyboard.down('Space');
await P.keyboard.down('KeyD'); await P.keyboard.down('KeyW'); await P.keyboard.down('KeyQ');
await P.waitForTimeout(250);
const s1 = await st(); log('6-key chord after 250ms', JSON.stringify(s1));
// hold the chord ~1s; with auto key-repeat events (Playwright repeats with repeat=true when down() is called again on a held key)
for (let i = 0; i < 10; i++) { await P.keyboard.down('Space'); await P.keyboard.down('KeyQ'); await P.waitForTimeout(80); }
const s2 = await st(); log('after 1s of OS-style repeat on Space+Q: bubbles', s2.b, '(expect no auto-fire)', 'P1 x', s2.p[0].x, 'P2 x', s2.p[1].x);
for (const k of ['ArrowRight', 'ArrowUp', 'Space', 'KeyD', 'KeyW', 'KeyQ']) await P.keyboard.up(k);
await P.waitForTimeout(200);
// 2) 10 simultaneous keys incl. ShiftLeft
const keys = ['ArrowLeft', 'ArrowUp', 'Space', 'KeyZ', 'KeyX', 'KeyA', 'KeyW', 'KeyQ', 'ShiftLeft'];
for (const k of keys) await P.keyboard.down(k);
await P.waitForTimeout(100);
const held = await ev(P, () => 'n/a');
for (const k of keys) await P.keyboard.up(k);
// 3) stuck-key check on blur: hold ArrowRight then dispatch blur+keyup lost
await P.waitForTimeout(500);
const a = await st();
await P.keyboard.down('ArrowRight'); await P.waitForTimeout(150);
await ev(P, () => { window.dispatchEvent(new Event('blur')); });     // focus lost: the matching keyup will never arrive
await P.keyboard.up('ArrowRight');
await P.waitForTimeout(100);
const b1 = await st(); await P.waitForTimeout(400); const b2 = await st();
log('blur while holding RIGHT: x', a.p[0].x, '->', b1.p[0].x, '->', b2.p[0].x, 'paused', b2.paused, '(x must stop after blur)');
// 4) Esc / P toggle
await ev(P, () => { fz._main.setPaused(false); });
await P.keyboard.press('Escape'); await P.waitForTimeout(100); const e1 = await st();
await P.keyboard.press('KeyP'); await P.waitForTimeout(100); const e2 = await st();
await P.keyboard.press('KeyP'); await P.waitForTimeout(100); const e3 = await st();
log('Esc ->', e1.paused, ' P ->', e2.paused, ' P again ->', e3.paused);
// 5) Arrow / Space must not scroll the page: make the page scrollable and see if scrollY changes
await ev(P, () => { document.body.style.minHeight = '3000px'; document.documentElement.style.overflowY = 'scroll'; document.documentElement.style.height = 'auto'; });
for (const k of ['ArrowDown', 'Space', 'ArrowUp', 'Backspace', 'Tab']) { await P.keyboard.press(k); }
const sy = await ev(P, () => window.scrollY); log('scrollY after Down/Space/Up/Backspace/Tab (0 expected):', sy);
log('errors', JSON.stringify(t.errors));
await t.close(); await browser.close();
