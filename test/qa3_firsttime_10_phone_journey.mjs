// Step 10: phone journey with touch only (CDP touch events), inside the sandboxed iframe.
import { open, check, wait, touchKit } from './qa3_firsttime_lib.mjs';
const W = +process.argv[2] || 390, H = +process.argv[3] || 844;
const t = await open({ w: W, h: H, touch: true, dpr: 2, name: `phj${W}` });
const k = await touchKit(t);
const fr = await (await t.frame.frameElement()).boundingBox();
await wait(1000);
const ov = await t.ev(() => { const r = document.getElementById('focus').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
await k.tap(fr.x + ov.x + ov.w / 2, fr.y + ov.y + ov.h / 2);
await wait(600);
// HOW TO PLAY by tapping the row
let p = await k.cv(128, 80 + 32 + 16);
await k.tap(p.x, p.y); await wait(500);
console.log('scene', await t.scene());
for (let i = 0; i < 6; i++) { await t.shot(`1_howto_${i}`); p = await k.cv(160, 100); await k.tap(p.x, p.y); await wait(350); }
console.log('scene after 6 taps', await t.scene());
// Start: tap 1 PLAYER
p = await k.cv(128, 96); await k.tap(p.x, p.y); await wait(800);
console.log('scene', await t.scene());
await t.shot('2_story');
// skip story with a tap on the canvas (what the story says: TAP TO SKIP)
await wait(700);
p = await k.cv(128, 100); await k.tap(p.x, p.y); await wait(300);
console.log('scene after tap on story', await t.scene());
await wait(1800); await t.shot('3_intro');
await wait(1500); await t.shot('4_play');
// move right with the pad, jump, bubble
const R = await k.btn('right'), J = await k.btn('jump'), B = await k.btn('fire'), L = await k.btn('left');
console.log('buttons', JSON.stringify({ R, J, B, L }));
let s0 = await t.st();
await k.hold(R.x, R.y, 600);
let s1 = await t.st();
console.log('hold right 600ms: x', s0.players[0].x, '->', s1.players[0].x);
await k.tap(B.x, B.y, 60); await wait(200);
console.log('bubbles after tap BUBBLE', (await t.st()).bubbles.length);
await k.tap(J.x, J.y, 60); await wait(120);
console.log('jump vy', (await t.st()).players[0].vy);
await wait(900);
await t.shot('5_play_after');
// two thumbs: hold right + tap jump + tap bubble
const idR = await k.down(R.x, R.y);
await wait(150);
await k.tap(J.x, J.y, 60); await wait(100); await k.tap(B.x, B.y, 60);
await wait(200);
await k.up(idR);
console.log('multi-touch state', JSON.stringify((await t.st()).players[0]));
// pause by tapping PAUSE
const P = await k.btn('pause');
await k.tap(P.x, P.y); await wait(400);
console.log('paused', await t.ev(() => fz._main.paused()));
await t.shot('6_pause');
console.log('rows', JSON.stringify(await t.ev(() => fz._main.rows())));
// tap RESUME row
p = await k.cv(128, 96 + 12); await k.tap(p.x, p.y); await wait(300);
console.log('paused after RESUME tap', await t.ev(() => fz._main.paused()));
// die -> game over (score so we see the entry)
await t.ev(() => { fz.Game.debug.setPlayer(0, { lives: 1 }); fz.Game.debug.addScore(0, 4300); });
let sc = '';
for (let i = 0; i < 400; i++) { sc = await t.scene(); if (sc === 'entry' || sc === 'scores') break; await wait(150); }
console.log('scene', sc);
await wait(500);
await t.shot('7_entry');
if (sc === 'entry') {
  await k.tap(R.x, R.y, 60); await wait(150);
  console.log('after tap right', JSON.stringify(await t.ev(() => fz._main.entry())));
  await k.tap(B.x, B.y, 60); await wait(150);
  console.log('after tap bubble', JSON.stringify(await t.ev(() => fz._main.entry())));
  // hold left to wrap around to Z
  await k.hold(L.x, L.y, 500); await wait(100);
  console.log('after hold left 500ms', JSON.stringify(await t.ev(() => fz._main.entry())));
  await k.tap(B.x, B.y, 60); await wait(150); await k.tap(B.x, B.y, 60); await wait(150);
  await t.shot('8_entry_done');
  await wait(1200);
  console.log('scene', await t.scene());
  await t.shot('9_scores');
}
await wait(2500);
p = await k.cv(128, 120); await k.tap(p.x, p.y); await wait(500);
console.log('scene after tap on scores', await t.scene());
await t.shot('10_title_again');
console.log('errors', t.errors);
await t.close();
