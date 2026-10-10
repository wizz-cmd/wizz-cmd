// Step 25: a newcomer TYPES their initials on a keyboard ("SAM", "ZOE") on the name-entry screen. What happens?
import { open, check, wait } from './qa3_firsttime_lib.mjs';
async function toEntry() {
  const t = await open({ w: 1280, h: 800, name: 'typ' });
  await wait(500);
  const cb = await t.ev(() => { const r = document.getElementById('focus').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await t.page.mouse.click(cb.x + cb.w / 2, cb.y + 20);
  await wait(300);
  await t.key('Enter', 80); await wait(900); await t.key('Enter', 80); await wait(3300);
  await t.ev(() => { fz.Game.debug.setPlayer(0, { lives: 1 }); fz.Game.debug.addScore(0, 4300); });
  for (let i = 0; i < 600; i++) { if ((await t.scene()) === 'entry') break; await wait(80); }
  await wait(700);
  return t;
}
{
  const t = await toEntry();
  console.log('start', JSON.stringify(await t.ev(() => fz._main.entry())), 'muted', await t.ev(() => fz.AUDIO.isMuted()));
  for (const k of ['KeyS', 'KeyA', 'KeyM']) { await t.key(k, 60); console.log('typed', k, JSON.stringify(await t.ev(() => { const e = fz._main.entry(); return { pos: e.pos, name: e.name, doneT: e.doneT }; })), 'muted', await t.ev(() => fz.AUDIO.isMuted())); }
  await t.shot('0_typed_SAM', { canvas: true });
  check('typing S,A,M on the name entry screen enters S,A,M (and does not toggle the sound)', (await t.ev(() => fz._main.entry().name)) === 'SAM' && !(await t.ev(() => fz.AUDIO.isMuted())), await t.ev(() => ({ e: fz._main.entry().name, muted: fz.AUDIO.isMuted() })));
  await t.close();
}
{
  const t = await toEntry();
  for (const k of ['KeyZ', 'KeyO', 'KeyE']) { await t.key(k, 60); console.log('typed', k, JSON.stringify(await t.ev(() => { const e = fz._main.entry(); return { pos: e.pos, name: e.name, doneT: e.doneT }; }))); }
  await t.close();
}
