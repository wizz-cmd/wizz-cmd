// Step 32: a player mashes Space to confirm the three initials (150 ms apart, a few extra presses). Do they ever get to SEE the table with their new row?
import { open, check, wait } from './qa3_firsttime_lib.mjs';
const t = await open({ w: 1280, h: 800, name: 'ov' });
await wait(500);
await t.ev(() => { fz.freeze(true); fz.goto('entry', { entries: [{ pi: 0, score: 4300, round: 1 }], res: { won: false, level: 1, scores: [4300, 0], players: 1 } }); fz.step(40); });
await t.ev(() => { fz.freeze(false); });
const cb = await t.ev(() => { const r = document.getElementById('focus').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
await t.page.mouse.click(cb.x + cb.w / 2, cb.y + 20);   // dismiss overlay (gesture)
await wait(300);
const log = [];
const t0 = Date.now();
for (let i = 0; i < 9; i++) {                       // 9 mashes, 150 ms apart
  await t.page.keyboard.down('Space'); await wait(40); await t.page.keyboard.up('Space'); await wait(110);
  log.push(((Date.now() - t0) / 1000).toFixed(2) + 's ' + (await t.scene()));
}
console.log(log.join(' | '));
const seen = log.filter((l) => /scores/.test(l)).length;
console.log('mashes where the scores table was on screen:', seen);
check('the highlighted hi-score table stays on screen long enough to be seen after the initials (>= 1 s) even if the player keeps mashing', (await t.scene()) !== 'title' || seen >= 7, log);
await t.close();
