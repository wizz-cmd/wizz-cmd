// Pause state machine in the REAL page: manual (soft) pause, blur/hidden/offscreen/stall holds, focus restore, ordering races.
import { launch, fp, log, check, OUT } from './qa3_diffreview_lib.mjs';
const t = await launch({});
const g = fp(t.page);
const st = () => t.page.evaluate(() => { const a = window.__fizzpop.AUDIO, s = a._state(), x = a._stats(); return { paused: s.paused, pk: s.pauseKind, ctx: s.ctxState, music: s.music, jingle: s.jingle, tempo: s.tempo, cur: x.current, switching: s.switching, holds: window.__fizzpop._main.holds(), mpaused: window.__fizzpop._main.paused(), scene: window.__fizzpop.scene() }; });
const wait = (ms) => t.page.waitForTimeout(ms);
await t.page.keyboard.press('ArrowDown'); await wait(300);   // first gesture -> audio context
let s = await st(); log('after gesture', JSON.stringify(s));
// start a game via the title menu: Enter on 1 PLAYER
await t.page.keyboard.press('ArrowUp'); await t.page.keyboard.press('Enter'); await wait(500);
log('scene', await g.scene());
// skip the story
await t.page.keyboard.press('Enter'); await wait(300);
s = await st(); log('in play?', JSON.stringify(s));
for (let i = 0; i < 100 && (await st()).scene !== 'play'; i++) await wait(100);
await wait(300);
// wave-3 regression pass (K7): the 2.25 s start jingle is still playing about 1 s into the round, so wait for the stage loop first
for (let i = 0; i < 60 && (await st()).cur !== 'stage1'; i++) await wait(100);
s = await st(); log('in play', JSON.stringify(s));

// ---- A: manual pause -> blur -> focus -> resume
await t.page.keyboard.press('KeyP'); await wait(200);
s = await st(); log('manual pause', JSON.stringify(s));
check('A1 manual pause = soft pause, ctx running', s.paused && s.pk === 'soft' && s.ctx === 'running' && s.mpaused, s);
await t.page.evaluate(() => window.dispatchEvent(new Event('blur'))); await wait(500);
s = await st(); log('blur during manual pause', JSON.stringify(s));
check('A2 blur during manual pause -> hard pause, ctx suspended', s.pk === 'hard' && s.ctx === 'suspended' && s.mpaused, s);
await t.page.evaluate(() => window.dispatchEvent(new Event('focus'))); await wait(300);
s = await st(); log('focus after blur during manual pause', JSON.stringify(s));
check('A3 focus restores SOFT pause (menu sounds, no music), game still paused', s.paused && s.pk === 'soft' && s.ctx === 'running' && s.mpaused && s.holds.length === 0, s);
await t.page.keyboard.press('KeyP'); await wait(400);
s = await st(); log('resume', JSON.stringify(s));
check('A4 resume after: unpaused, music continuing', !s.paused && !s.mpaused && s.ctx === 'running' && s.cur === 'stage1', s);

// ---- B: auto pause (blur while playing)
await t.page.evaluate(() => window.dispatchEvent(new Event('blur'))); await wait(500);
s = await st(); log('blur while playing', JSON.stringify(s));
check('B1 blur -> game paused + hard audio pause', s.mpaused && s.pk === 'hard' && s.ctx === 'suspended', s);
await t.page.evaluate(() => window.dispatchEvent(new Event('focus'))); await wait(300);
s = await st(); log('focus', JSON.stringify(s));
check('B2 focus -> still paused (RESUME menu), soft', s.mpaused && s.pk === 'soft' && s.holds.length === 0, s);
await t.page.keyboard.press('KeyP'); await wait(300);
s = await st();
check('B3 resumed', !s.mpaused && !s.paused, s);

// ---- C: overlapping reasons
await t.page.evaluate(() => { window.dispatchEvent(new Event('blur')); Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
await wait(400);
s = await st(); log('blur+hidden', JSON.stringify(s));
await t.page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
await wait(200);
s = await st(); log('visible again (blur still held)', JSON.stringify(s));
check('C1 hidden released but blur still held -> still hard paused', s.holds.join() === 'blur' && s.pk === 'hard', s);
await t.page.evaluate(() => window.dispatchEvent(new Event('focus'))); await wait(300);
s = await st(); log('focus', JSON.stringify(s));
check('C2 all released -> soft (game paused)', s.holds.length === 0 && s.pk === 'soft' && s.mpaused, s);
await t.page.keyboard.press('KeyP'); await wait(200);

// ---- D: rapid hold/release storm; end state must be consistent
for (let i = 0; i < 40; i++) {
  await t.page.evaluate((i) => { window.dispatchEvent(new Event(i % 2 ? 'focus' : 'blur')); }, i);
  await wait(i % 5 === 0 ? 330 : 15);
}
await t.page.evaluate(() => window.dispatchEvent(new Event('focus'))); await wait(500);
s = await st(); log('after storm', JSON.stringify(s));
check('D1 storm end: no holds; audio paused iff game paused', s.holds.length === 0 && (s.paused === s.mpaused), s);
if (s.mpaused) { await t.page.keyboard.press('KeyP'); await wait(300); s = await st(); }
for (let i = 0; i < 100 && s.cur !== 'stage1'; i++) { await wait(100); s = await st(); }
check('D2 after resume ctx running + music stage1 (start jingle ended after pauses)', s.ctx === 'running' && !s.paused && s.cur === 'stage1', s);

// ---- E: dismissFocus click while auto-paused resumes the game
await t.page.evaluate(() => window.dispatchEvent(new Event('blur'))); await wait(400);
await t.page.evaluate(() => { const f = document.getElementById('focus'); log = f && !f.hidden; });
s = await st(); log('blur', JSON.stringify(s));
// emulate click on focus overlay if visible
const vis = await t.page.evaluate(() => { const f = document.getElementById('focus'); return !!f && !f.hidden; });
log('focus overlay visible', vis);
await t.page.evaluate(() => window.dispatchEvent(new Event('focus'))); await wait(200);
await t.page.keyboard.press('KeyP'); await wait(200);
log('errors', t.errors);
check('no page errors', t.errors.length === 0, t.errors);
await t.close();
