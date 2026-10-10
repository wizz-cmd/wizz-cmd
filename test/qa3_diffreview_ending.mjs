import { launch, fp, log, check, OUT, canvasShot } from './qa3_diffreview_lib.mjs';
const t = await launch({});
const g = fp(t.page);
await g.freeze(true);
const res = { won: true, level: 30, scores: [250000, 90000], players: 2 };
await g.goto('ending', { res, entries: [{ pi: 0, score: 250000, round: 30 }, { pi: 1, score: 90000, round: 30 }] });
const scenes = [];
let prev = '';
for (let f = 0; f < 4000; f++) {
  await g.evaluate(() => { fz.step(10); });
  const s = await g.scene();
  if (s !== prev) { scenes.push([f * 10, s]); prev = s; }
  if (s !== 'ending') break;
  if (f === 20) await canvasShot(t.page, OUT + '/ending_a.png', { scale: 2 });
  if (f === 110) await canvasShot(t.page, OUT + '/ending_b.png', { scale: 2 });
  if (f === 150) await canvasShot(t.page, OUT + '/ending_c.png', { scale: 2 });
}
log(JSON.stringify(scenes));
check('EN1 ending ends in entry within ~65 s of virtual time', scenes.some((x) => x[1] === 'entry'), scenes);
// skip with pause key early
await g.goto('ending', { res, entries: [{ pi: 0, score: 250000, round: 30 }] });
await g.evaluate(() => { fz.step(100); fz.input.set(0, { pause: true }); fz.step(2); fz.input.clear(); fz.step(2); });
check('EN2 ESC/pause skips to entry', (await g.scene()) === 'entry', await g.scene());
log(t.errors);
await t.close();
