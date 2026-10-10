// Step 8: story intro reading time. Stepped deterministically (freeze + step) in the iframe; counts frames where each line is fully typed.
import { open, check, wait, OUT } from './qa3_firsttime_lib.mjs';
const t = await open({ w: 1280, h: 800, name: 'story' });
await wait(500);
await t.ev(() => { fz.freeze(true); fz.goto('story', { next: { players: 1, level: 1, seed: 1 } }); });
const frames = [30, 60, 100, 140, 170, 200, 214, 239, 300, 359];
let at = 0;
for (const f of frames) {
  await t.ev((n) => { fz.step(n); }, f - at); at = f;
  await t.shot(`f${String(f).padStart(3, '0')}`, { canvas: true });
}
// wave-3 regression pass: R4 changed STORY_FRAMES 240 -> 360 (6 s); measure the real cut-off instead of hard-coding it
console.log('scene at 359', await t.scene());
let end = 359;
for (let i = 0; i < 400 && (await t.scene()) === 'story'; i++) { await t.ev(() => { fz.step(1); }); end++; }
console.log('scene after the story', await t.scene(), 'story lasted', end, 'frames');
// compute: frame when final line fully typed = 190 + ceil(26/1.1)
const full = 190 + Math.ceil(26 / 1.1);
console.log('last line fully typed at frame', full, '-> readable for', (end - full), 'frames =', ((end - full) / 60).toFixed(2), 's before the scene cuts');
check('story: the final line (the actual instruction) is fully readable for >= 1.5 s before play starts', (end - full) / 60 >= 1.5, ((end - full) / 60).toFixed(2) + ' s');
console.log('errors', t.errors);
await t.close();
