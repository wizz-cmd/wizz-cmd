import { launch, fp, log, check } from './qa3_diffreview_lib.mjs';
const t = await launch({});
const g = fp(t.page); await g.freeze(true);
const seq = []; let prev = '';
for (let f = 0; f < 800; f++) {
  await g.evaluate(() => { fz.step(30); });
  const s = await g.scene();
  if (s !== prev) { seq.push([f * 30, s]); prev = s; }
}
log(JSON.stringify(seq));
const names = seq.map((x) => x[1]);
check('AT1 attract cycle visits story, howto, scores and returns to title', ['story', 'howto', 'scores'].every((n) => names.includes(n)) && names.filter((n) => n === 'title').length >= 2, names);
// howto pages: step through all 6 pages via keyboard
await g.goto('howto', { page: 0 });
const pages = [];
for (let p = 0; p < 8; p++) { await g.evaluate(() => { fz.input.set(0, { right: true }); fz.step(2); fz.input.clear(); fz.step(30); }); pages.push(await g.scene()); }
log(JSON.stringify(pages));
check('AT2 errors', t.errors.length === 0, t.errors);
await t.close();
