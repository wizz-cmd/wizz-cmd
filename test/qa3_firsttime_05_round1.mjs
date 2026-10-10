// Step 5: first round with REAL keys in realtime: intro banner, move, first shot, first trap, first pop, first death. SFX/music log.
import { open, check, wait } from './qa3_firsttime_lib.mjs';
const t = await open({ w: 1280, h: 800, name: 'r1' });
await wait(600);
const cb = await t.ev(() => { const r = document.getElementById('focus').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
await t.page.mouse.click(cb.x + cb.w / 2, cb.y + 20);
await wait(500);
await t.ev(() => {
  window.__ev = [];
  const A = fz.AUDIO;
  for (const k of ['sfx', 'jingle', 'music']) { const o = A[k]; A[k] = function (...a) { window.__ev.push({ k, a: String(a[0]), f: (fz.Game.debug.state() || {}).frame, t: Math.round(performance.now()) }); return o.apply(this, a); }; }
});
await t.key('Enter', 80);
await wait(1000);
await t.key('Enter', 80);   // skip the story ("ENTER TO SKIP")
// capture intro frames
await wait(300); await t.shot('0_intro_a', { canvas: true });
await wait(1000); await t.shot('0_intro_b', { canvas: true });
console.log('phase', (await t.st()).phase);
await wait(1500);
// first real moves
await t.page.keyboard.down('ArrowRight'); await wait(500); await t.page.keyboard.up('ArrowRight');
await t.key('Space', 70);
await wait(250);
await t.shot('1_first_bubble', { canvas: true });
const st1 = await t.st();
console.log('after first Space: bubbles', JSON.stringify(st1.bubbles), 'player', JSON.stringify(st1.players[0]));
// bot: hunt the nearest enemy with real keys until first trap + pop (max 60 s)
let trapped = false, popped = false, shotsAfter = 0;
const t0 = Date.now();
while (Date.now() - t0 < 70000) {
  const s = await t.st();
  if (s.phase !== 'play') { await wait(200); continue; }
  const p = s.players[0];
  const evs = await t.ev(() => window.__ev.map((e) => e.a));
  if (!trapped && evs.includes('trap')) { trapped = true; await t.shot('2_first_trap', { canvas: true }); console.log('TRAP at', Date.now() - t0); }
  if (trapped && !popped && evs.includes('pop')) { popped = true; await t.shot('3_first_pop', { canvas: true }); console.log('POP at', Date.now() - t0); }
  if (popped) { await wait(1200); await t.shot('4_after_pop', { canvas: true }); break; }
  const tr = s.bubbles.filter((b) => b.kind === 'trapped' || b.state === 'trapped' || (b.enemy));
  const targets = s.enemies.filter((e) => e.state === 'active');
  // go for a trapped bubble if exists (pop it by touching)
  let tx = null, ty = null, wantShoot = false;
  const trappedB = s.bubbles.find((b) => /trap|enemy/.test(JSON.stringify(b)) && b.kind !== 'empty');
  if (trappedB && trapped) { tx = trappedB.x; ty = trappedB.y; }
  else if (targets.length) {
    const e = targets.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    tx = e.x; ty = e.y;
    if (Math.abs(e.y - p.y) < 10 && Math.abs(e.x - p.x) < 60) wantShoot = true;
  }
  if (tx === null) { await wait(200); continue; }
  const dx = tx - p.x;
  const wantRight = dx > 6, wantLeft = dx < -6;
  if (wantRight) { await t.page.keyboard.up('ArrowLeft'); await t.page.keyboard.down('ArrowRight'); }
  else if (wantLeft) { await t.page.keyboard.up('ArrowRight'); await t.page.keyboard.down('ArrowLeft'); }
  else { await t.page.keyboard.up('ArrowLeft'); await t.page.keyboard.up('ArrowRight'); }
  if (wantShoot) await t.key('Space', 50);
  else if (ty < p.y - 12 && p.onGround && Math.abs(dx) < 70) await t.key('ArrowUp', 100);
  await wait(70);
}
await t.page.keyboard.up('ArrowLeft'); await t.page.keyboard.up('ArrowRight');
console.log('events', JSON.stringify(await t.ev(() => window.__ev.map((e) => e.a + '@' + e.f).slice(0, 80))));
console.log('trapped', trapped, 'popped', popped);
console.log('errors', t.errors);
await t.close();
