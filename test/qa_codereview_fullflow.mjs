// Real-time, real-keyboard full cycle: title -> 1P -> story -> play -> lose last life -> game over -> name entry -> hi-score table -> title.
// Records the scene sequence, audio state at each step, the stored table and any console error. Also checks that holding Space/Z (bubble key,
// also the UI "ok" key) through game over does not auto-confirm the first initials.
import { launch, fp, log } from './qa_codereview_lib.mjs';
const t = await launch({});
const g = fp(t.page);
const st = () => g.evaluate(() => { const a = fz.AUDIO._state(); return { scene: fz.scene(), music: a.music, jingle: a.jingle, ph: fz.Game.debug.state().phase, e: fz._main.entry && fz.scene() === 'entry' ? fz._main.entry() : undefined }; });
await t.page.keyboard.press('Enter'); await t.page.waitForTimeout(300);
log('after Enter on title ->', (await st()).scene);
await t.page.keyboard.press('Enter'); await t.page.waitForTimeout(400);        // skip story
log('after Enter in story ->', JSON.stringify(await st()));
await g.evaluate(() => { const D = fz.Game.debug; D.skipIntro(); D.addScore(0, 12345); D.setPlayer(0, { lives: 1 }); const p = D._S().players[0]; D.spawn('nibbler', p.x, p.y); });
await t.page.keyboard.down('Space');                                              // player is mashing/holding the bubble key when he dies
const seq = [];
let last = '';
for (let i = 0; i < 90; i++) {
  await t.page.waitForTimeout(100);
  const s = await st(); const k = s.scene + '/' + s.ph;
  if (k !== last) { last = k; seq.push({ at: i * 100, ...s }); }
  if (s.scene === 'entry') break;
}
log('sequence while holding Space:', JSON.stringify(seq.map((s) => ({ at: s.at, k: s.scene + '/' + s.ph, music: s.music, jingle: s.jingle }))));
await t.page.waitForTimeout(700);
log('entry state after 0.7 s with Space still held:', JSON.stringify((await st()).e));
await t.page.keyboard.up('Space');
await t.page.waitForTimeout(100);
for (let i = 0; i < 3; i++) { await t.page.keyboard.press('ArrowRight'); await t.page.keyboard.press('Enter'); await t.page.waitForTimeout(80); }
await t.page.waitForTimeout(1200);
log('after typing:', JSON.stringify(await st()));
log('stored scores:', await t.page.evaluate(() => (localStorage.getItem('fizzpop.v1.scores') || '').slice(0, 120)));
await t.page.waitForTimeout(500);
await t.page.keyboard.press('Enter'); await t.page.waitForTimeout(500);
log('after Enter on scores ->', JSON.stringify(await st()));
log('errors', t.errors);
await t.close();
