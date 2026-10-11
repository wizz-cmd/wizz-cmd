// QA v2 (ux lens): the full player walk inside the sandboxed cross-origin iframe, with real keyboard / touch input and real gesture rules.
//   title -> how to play (6 pages) -> hi-scores -> 1 player -> story -> round 1 -> pause -> quit confirm -> resume -> game over -> entry -> scores -> continue
// Usage: node test/qa_v2_ux_walk.mjs <name> <w> <h> <dpr> <touch 0|1> [scheme light|dark]
import fs from 'fs';
import path from 'path';
import { open, touchKit, OUT, wait, check } from './qa_v2_ux_lib.mjs';

const [name = 'desk1', W = '1280', H = '800', DPR = '1', TOUCH = '0'] = process.argv.slice(2);
const w = +W, h = +H, dpr = +DPR, touch = TOUCH === '1';
const t = await open({ w, h, dpr, touch, name });
const k = touch ? await touchKit(t) : null;
let n = 0;
const shot = async (label, { page = true } = {}) => {
  n++;
  const id = String(n).padStart(2, '0') + '_' + label;
  if (page) await t.page.screenshot({ path: path.join(OUT, `${name}_${id}.png`) });
  // canvas crop in real device pixels (what the player sees)
  const r = await t.frame.evaluate(() => { const c = document.getElementById('screen').getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height }; });
  const fr = await (await t.frame.frameElement()).boundingBox();
  await t.page.screenshot({ path: path.join(OUT, `${name}_${id}_cv.png`), clip: { x: fr.x + r.x, y: fr.y + r.y, width: r.w, height: r.h } });
  return id;
};
const st = async () => t.frame.evaluate(() => ({ scene: fz.scene(), paused: fz._main.paused(), rows: fz._main.rows(), q: fz.quality, k: fz._main.k(), touchMode: fz._main.touchMode(), touchOnly: fz._main.touchOnly(), sceneT: fz._main.sceneTime(), holds: fz._main.holds() }));
const log = (...a) => console.log(name, ...a);

async function tapRow(id) {
  const s = await st();
  const row = s.rows.find((r) => r.id === id || r.label === id);
  if (!row) { log('NO ROW', id, JSON.stringify(s.rows)); return false; }
  const p = await k.cv((row.x0 + row.x1) / 2, row.top + row.h / 2);
  await k.tap(p.x, p.y);
  return true;
}
async function pickRow(id) {
  if (touch) return tapRow(id);
  const s = await st();
  const idx = s.rows.findIndex((r) => r.id === id || r.label === id), cur = s.rows.findIndex((r) => r.sel);
  if (idx < 0) { log('NO ROW', id); return false; }
  for (let i = 0; i < (idx - cur + s.rows.length) % s.rows.length; i++) await t.key('ArrowDown');
  await t.key('Enter');
  return true;
}

// ---- 0. overlay, audio before the gesture -------------------------------------------------------------------
await wait(1500);
const a0 = await t.audio();
log('audio before gesture', JSON.stringify(a0));
await shot('overlay');
const ov = await t.ev(() => { const r = document.getElementById('focus').getBoundingClientRect(); const c = document.querySelector('#focus .cta').getBoundingClientRect(); return { r: [r.x, r.y, r.width, r.height], cta: [c.x, c.y, c.width, c.height], txt: document.getElementById('focus').innerText, fs: getComputedStyle(document.querySelector('#focus small')).fontSize }; });
log('overlay', JSON.stringify(ov));
const fr = await (await t.frame.frameElement()).boundingBox();
const cx = fr.x + ov.r[0] + ov.r[2] / 2, cy = fr.y + ov.r[1] + ov.r[3] * 0.85;     // a corner-ish spot of the overlay, not the CTA
if (touch) await k.tap(cx, cy); else await t.page.mouse.click(cx, cy);
await wait(900);
const a1 = await t.audio();
log('audio after gesture', JSON.stringify(a1), JSON.stringify((await st())));
await wait(1200);
await shot('title');

// ---- 1. how to play: 6 pages -----------------------------------------------------------------------------------
await pickRow('help');
await wait(700);
for (let p = 0; p < 6; p++) {
  const pg = await t.ev(() => fz._main.howtoPage());
  await shot('howto' + p + '_pg' + pg);
  if (touch) { const c = await k.cv(128, 100); await k.tap(c.x, c.y); await wait(500); } else { await t.key('ArrowRight'); await wait(500); }
}
log('after howto', JSON.stringify((await st()).scene));
await wait(500);

// ---- 2. hi-scores -----------------------------------------------------------------------------------------------
await pickRow('table');
await wait(900);
await shot('scores');
if (touch) { const c = await k.cv(128, 100); await k.tap(c.x, c.y); } else await t.key('Escape');
await wait(700);
log('after scores', (await st()).scene);

// ---- 3. 1 player: story -> round 1 --------------------------------------------------------------------------------
await pickRow('p1');
await wait(700);
log('story', (await st()).scene);
await shot('story_a');
await wait(2400);
await shot('story_b');
await wait(3300);
log('after story', (await st()).scene);
await shot('r1_ready');
await wait(1800);
await shot('r1_play0');
// play for a while: hold right + fire
if (!touch) { await t.page.keyboard.down('ArrowRight'); await wait(900); await t.page.keyboard.down('KeyZ'); await wait(300); await t.page.keyboard.up('KeyZ'); await t.page.keyboard.up('ArrowRight'); }
await wait(2500);
await shot('r1_play1');
await t.ev(() => { fz.Game.debug.spawn('crabbit', 60, 120); fz.Game.debug.spawn('jellop', 180, 60); });
await wait(2500);
await shot('r1_play2');

// ---- 4. pause --------------------------------------------------------------------------------------------------
if (touch) { const b = await k.btn('pause'); await k.tap(b.x, b.y); } else await t.key('KeyP');
await wait(700);
log('paused', JSON.stringify((await st()).paused));
await shot('pause');
await pickRow('QUIT');
await wait(500);
await shot('pause_quit_confirm');
await pickRow('NO');
await wait(400);
await pickRow('RESUME');
await wait(600);
log('resumed', JSON.stringify((await st()).paused));
await shot('resumed');

// ---- 5. game over -> entry -> scores -> continue -------------------------------------------------------------------------
await t.ev(() => { fz.Game.debug.addScore(0, 41000); fz.Game.debug.setPlayer(0, { lives: 0, state: 'out' }); });
await wait(900);
await shot('gameover_a');
await wait(2500);
await shot('gameover_b');
for (let i = 0; i < 20 && (await st()).scene === 'play'; i++) await wait(500);
log('after gameover', (await st()).scene);
await wait(900);
await shot('entry');
if (!touch) { await t.key('KeyS'); await t.key('KeyA'); await t.key('KeyM'); } else {
  const b = await k.btn('fire'); for (let i = 0; i < 3; i++) { await k.tap(b.x, b.y); await wait(300); }
}
await wait(1500);
log('after entry', (await st()).scene);
await shot('after_entry');
await wait(1200);
await shot('scores_after');
for (let i = 0; i < 30 && (await st()).scene !== 'title'; i++) { if (touch) { const c = await k.cv(128, 100); await k.tap(c.x, c.y); } else await t.key('Enter'); await wait(700); }
await wait(800);
log('title again', JSON.stringify(await st()));
await shot('title_continue');
log('errors', JSON.stringify(t.errors));
await t.close();
