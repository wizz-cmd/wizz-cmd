// Step 6: first death -> game over -> (name entry) -> scores -> continue, real keys + realtime. Variant A: score 0. Variant B: score 4300 (rank 7).
import { open, check, wait } from './qa3_firsttime_lib.mjs';
const variant = process.argv[2] || 'B';
const t = await open({ w: 1280, h: 800, name: 'go' + variant });
await wait(600);
const cb = await t.ev(() => { const r = document.getElementById('focus').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
await t.page.mouse.click(cb.x + cb.w / 2, cb.y + 20);
await wait(500);
await t.ev(() => {
  window.__ev = [];
  const A = fz.AUDIO;
  for (const k of ['sfx', 'jingle', 'music']) { const o = A[k]; A[k] = function (...a) { window.__ev.push({ k, a: String(a[0]), sc: fz.scene(), t: Math.round(performance.now()) }); return o.apply(this, a); }; }
});
await t.key('Enter', 80); await wait(900); await t.key('Enter', 80);
await wait(3500);                                       // past intro
await t.ev((v) => { fz.Game.debug.setPlayer(0, { lives: 1 }); if (v === 'B') fz.Game.debug.addScore(0, 4300); }, variant);
const T0 = Date.now();
let lastScene = '', lastPhase = '';
const tl = [];
let shotDeath = false, shotGO = false;
while (Date.now() - T0 < 90000) {
  const s = await t.ev(() => { const st = fz.Game.debug.state(); return { sc: fz.scene(), ph: st.phase, ps: st.players[0] && st.players[0].state, lives: st.players[0] && st.players[0].lives, mus: fz.AUDIO._state().music, jin: fz.AUDIO._state().jingle }; });
  const key = s.sc + '/' + s.ph + '/' + s.ps;
  if (key !== lastScene) { tl.push(((Date.now() - T0) / 1000).toFixed(1) + 's ' + key + ' lives=' + s.lives + ' mus=' + s.mus + ' jin=' + s.jin); lastScene = key; }
  if (s.ps === 'dying' && !shotDeath) { shotDeath = true; await wait(350); await t.shot('0_dying', { canvas: true }); }
  if (s.ph === 'gameover' && !shotGO) { shotGO = true; await wait(500); await t.shot('1_gameover', { canvas: true }); }
  if (s.sc === 'entry' || s.sc === 'scores') break;
  await wait(120);
}
console.log(tl.join('\n'));
const goT = Date.now();
console.log('scene now', await t.scene());
await wait(500);
await t.shot('2_after_gameover', { canvas: true });
if (await t.scene() === 'entry') {
  console.log('entry dbg', JSON.stringify(await t.ev(() => fz._main.entry())));
  // real keys: Up cycles letters? JUMP: BACK says jump deletes. Test ArrowUp (the jump key) and X
  await t.key('ArrowUp', 60); await wait(150);
  console.log('after ArrowUp pos/name', JSON.stringify(await t.ev(() => fz._main.entry())));
  await t.shot('3_entry_up', { canvas: true });
  await t.key('Space', 60); await wait(150);       // confirm letter 1
  console.log('after Space', JSON.stringify(await t.ev(() => fz._main.entry())));
  await t.key('ArrowRight', 60); await t.key('ArrowRight', 60); await wait(100);
  await t.key('Space', 60); await wait(150);
  console.log('after 2nd confirm', JSON.stringify(await t.ev(() => fz._main.entry())));
  await t.key('ArrowUp', 60); await wait(100);       // press the JUMP key (UP) to go BACK as the screen says
  console.log('after ArrowUp as "JUMP: BACK"', JSON.stringify(await t.ev(() => fz._main.entry())));
  await t.key('KeyX', 60); await wait(100);
  console.log('after X', JSON.stringify(await t.ev(() => fz._main.entry())));
  await t.shot('4_entry_mid', { canvas: true });
  await t.key('Space', 60); await wait(100); await t.key('Space', 60); await wait(100);
  console.log('after more', JSON.stringify(await t.ev(() => fz._main.entry())));
  await t.shot('5_entry_ok', { canvas: true });
  await wait(1200);
  console.log('scene after entry', await t.scene());
  await t.shot('6_scores_hl', { canvas: true });
  console.log('scores', JSON.stringify(await t.ev(() => fz._main.scores())));
}
// scores: wait & press Enter at the "ENTER TO CONTINUE" prompt
await wait(2500);
await t.shot('7_scores_prompt', { canvas: true });
const sT = Date.now();
await t.key('Enter', 60); await wait(400);
console.log('scene after Enter on scores', await t.scene());
await t.shot('8_title_again', { canvas: true });
console.log('events', JSON.stringify(await t.ev(() => window.__ev.filter(e => !/jump|land|shoot/.test(e.a)).map((e) => e.a + '@' + e.sc))));
console.log('errors', t.errors);
await t.close();
