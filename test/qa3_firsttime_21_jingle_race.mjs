// Step 21: root cause of the silent entry/scores screens: music(name) requested while a jingle is in its last ~0.3 s is lost.
// Call AUDIO.jingle('gameover'), then AUDIO.music('entry') at delay d; look at the state ~1.5 s after the jingle ends.
import { open, check, wait } from './qa3_firsttime_lib.mjs';
const t = await open({ w: 1280, h: 800, name: 'race' });
await wait(500);
await t.ev(() => { fz.freeze(true); });
const cb = await t.ev(() => { const r = document.getElementById('focus').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
await t.page.mouse.click(cb.x + cb.w / 2, cb.y + 20);
await wait(500);
console.log('info gameover', JSON.stringify(await t.ev(() => { const i = fz.AUDIO._info('gameover'); return { bpm: i.bpm, steps: i.steps, secs: i.steps / 4 * 60 / i.bpm }; })));
const secs = await t.ev(() => { const i = fz.AUDIO._info('gameover'); return i.steps / 4 * 60 / i.bpm; });
const res = [];
for (const d of [0.5, 2.5, 3.4, 3.6, 3.8, 3.9, 4.0, 4.05, 4.1, 4.15, 4.2, 4.25, 4.3, 4.4, 4.5, 4.7]) {
  await t.ev(() => { fz.AUDIO.stopMusic(0); });
  await wait(500);
  await t.ev(() => { fz.AUDIO.jingle('gameover'); });
  await wait(Math.max(0, d * 1000));
  await t.ev(() => { fz.AUDIO.music('entry'); });
  await wait(Math.max(0, (secs - d) * 1000) + 1800);
  const s = (await t.audio()).st;
  res.push({ d: +d.toFixed(2), music: s.music, jingle: s.jingle });
  console.log('request at', d.toFixed(2), 's of', secs.toFixed(2), '->', JSON.stringify({ music: s.music, jingle: s.jingle }));
}
const lost = res.filter((r) => r.music !== 'entry');
check('music(entry) requested at any moment of a jingle still starts after it', lost.length === 0, lost);
console.log('errors', t.errors);
await t.close();
