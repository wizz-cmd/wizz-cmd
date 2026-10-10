// Step 28: play again right after a game over (patched = with the jingle-race fix so the flow isn't also affected by it): is anything stale in game 2?
import { open, check, wait } from './qa3_firsttime_lib.mjs';
const t = await open({ w: 1280, h: 800, name: 'g2' });
await wait(500);
const cb = await t.ev(() => { const r = document.getElementById('focus').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
await t.page.mouse.click(cb.x + cb.w / 2, cb.y + 20);
await wait(300);
await t.key('Enter', 80); await wait(900); await t.key('Enter', 80); await wait(3300);
await t.ev(() => { fz.Game.debug.setPlayer(0, { lives: 1 }); fz.Game.debug.addScore(0, 4300); });
for (let i = 0; i < 600; i++) { if ((await t.scene()) === 'entry') break; await wait(80); }
await wait(500);
for (let i = 0; i < 3; i++) await t.key('Space', 60);
await wait(1200);
console.log('scene', await t.scene());
await t.key('Enter', 60); await wait(500);
console.log('scene', await t.scene());
await t.key('Enter', 80); await wait(900); await t.key('Enter', 80); await wait(1500);
const s = await t.st();
console.log('game 2:', JSON.stringify({ lvl: s.level, ph: s.phase, lives: s.players[0].lives, score: s.players[0].score, bub: s.bubbles.length, hurry: s.hurry, ghost: s.ghost }), JSON.stringify((await t.audio()).st));
await t.shot('0_game2_intro', { canvas: true });
await wait(3500);
console.log('audio', JSON.stringify((await t.audio()).st));
console.log('hud hi score check: ', JSON.stringify(await t.ev(() => fz._main.scores()[0])));
console.log('errors', t.errors);
await t.close();
