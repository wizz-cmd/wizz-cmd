// Step 4: input leaks between scenes. Confirm keys (Space / Z / Q / Shift / Enter) used on the title and on the story skip:
// does the same press also fire a bubble or join P2 (Q) in the game that follows? Real key events in the sandboxed iframe.
import { open, check, wait } from './qa3_firsttime_lib.mjs';
async function run(confirmKey, skipKey, holdMs, skipDelay = 700) {
  const t = await open({ w: 1280, h: 800, name: 'leak' });
  await wait(600);
  const cb = await t.ev(() => { const r = document.getElementById('focus').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await t.page.mouse.click(cb.x + cb.w / 2, cb.y + 20);
  await wait(500);
  await t.key(confirmKey, holdMs);
  await wait(skipDelay);                         // story scene, guard long over
  const sc1 = await t.scene();
  await t.key(skipKey, holdMs);                  // skip story
  const samples = [];
  for (let i = 0; i < 12; i++) { await wait(60); samples.push(await t.ev(() => { const s = fz.Game.debug.state(); return { sc: fz.scene(), ph: s.phase, f: s.frame, np: s.players.length, bub: s.bubbles.length }; })); }
  // wait until play starts and a bit more; then record bubbles / players
  await wait(3200);
  const end = await t.ev(() => { const s = fz.Game.debug.state(); return { sc: fz.scene(), ph: s.phase, f: s.frame, np: s.players.length, bub: s.bubbles.length, lives: s.players.map(p => p.lives) }; });
  console.log(`confirm=${confirmKey} skip=${skipKey} hold=${holdMs}  story scene=${sc1}  maxbub-in-first-samples=${Math.max(...samples.map(s => s.bub))} players@samples=${[...new Set(samples.map(s => s.np))]}  end=${JSON.stringify(end)}`);
  const r = { bubbles: end.bub, np: end.np, errors: t.errors.length };
  await t.close();
  return r;
}
for (const [a, b] of [['Enter', 'Enter'], ['Space', 'Space'], ['KeyZ', 'KeyZ'], ['KeyQ', 'KeyQ'], ['ShiftLeft', 'ShiftLeft'], ['Space', 'KeyQ']]) {
  const r = await run(a, b, 60);
  check(`${a}->${b}: no stray bubble and no phantom P2 after the confirm presses`, r.np === 1 && r.errors === 0, r);
}
