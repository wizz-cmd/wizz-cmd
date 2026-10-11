// Scene gallery of the real build for the Main v3 review: desktop + phone portrait + phone landscape -> out/v3/main/<dir>/*.png
// Usage: node test/main_v3_shots.mjs [dir=final] [profiles=desk1,phone,land]
import path from 'path';
import { open, OUT, sleep } from './main_v3_lib.mjs';
const dir = process.argv[2] || 'final', profiles = (process.argv[3] || 'desk1,phone,land').split(',');
for (const profile of profiles) {
  const t = await open({ profile });
  await t.ev(() => { fz.freeze(true); fz._main.setQuality(2, true); });
  const base = path.join(OUT, dir);
  const S = async (name) => { await sleep(120); await t.cvShot(path.join(base, `${profile}_${name}.png`)); };
  const G = async (scene, args, steps = 30) => { await t.ev((s, a, n) => { fz.goto(s, a); fz.step(n); }, scene, args, steps); };
  await G('title', undefined, 80); await S('01_title');
  await t.ev(() => { fz._main.session; });
  for (let p = 0; p < 6; p++) { await G('howto', { page: p }, 40); await S('02_howto' + p); }
  await G('scores', {}, 30); await S('03_scores');
  await G('story', { next: { players: 1, level: 1, seed: 1 } }, 120); await S('04_story_a');
  await G('story', { next: { players: 1, level: 1, seed: 1 } }, 260); await S('05_story_b');
  await G('ending', { res: { won: true, level: 30, scores: [412300, 128000], players: 2 }, entries: [] }, 120); await S('06_ending_tableau');
  await G('ending', { res: { won: true, level: 30, scores: [412300, 128000], players: 2 }, entries: [] }, 700); await S('07_ending_credits');
  await t.ev(() => { fz.start(1, 5, 7); fz.step(120); }); await S('08_play');
  await t.ev(() => { fz._main.setPaused(true); fz.step(1); }); await S('09_pause');
  await t.shot(path.join(base, `${profile}_page_pause.png`));
  console.log(profile, 'errors:', JSON.stringify(t.errors));
  await t.close();
}
