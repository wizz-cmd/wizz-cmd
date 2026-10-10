import { launch, log, check } from './qa3_diffreview_lib.mjs';
const t = await launch({});
await t.page.waitForFunction(() => !!window.__fizzpop); await t.page.evaluate(() => window.__fizzpop.scene());
const R = await t.page.evaluate(() => {
  const G = window.__fizzpop.GFX; const cv = document.createElement('canvas'); cv.width = 256; cv.height = 224; const ctx = cv.getContext('2d');
  const errs = [];
  const T = (label, f) => { try { f(); } catch (e) { errs.push(label + ': ' + e.message); } };
  const strs = ['', ' ', 'A', 'a b', 'ÄÖÜ ß', '😀 emoji', '◀ ▶', '←→', '©♥★', 'x'.repeat(200), '\n\t', null, undefined, 123, 0, '1UP', 'ROUND 30'];
  for (const s of strs) for (const sc of [undefined, 1, 2, 3, 0.5]) for (const al of ['left', 'center', 'right', undefined]) for (const o of [{}, { outline: '#102030' }, { outline: '#102030', shadow: true }, { shadow: false }, { outline: '' }]) {
    T('text ' + JSON.stringify(s) + sc + al + JSON.stringify(o), () => G.text(ctx, s, 128, 100, 'hsl(120,100%,70%)', Object.assign({ scale: sc, align: al }, o)));
  }
  T('textWidth', () => { for (const s of strs) G.textWidth(s, 2); });
  // every sprite x every frame x options
  const names = G._registry ? Object.keys(G._registry()) : [];
  let n = 0;
  for (const nm of names) for (let f = -1; f < 6; f++) for (const o of [undefined, { flip: true }, { white: true }, { alpha: 0.3 }, { flip: true, white: true, alpha: 0.5 }]) { T('draw ' + nm + f, () => { G.draw(ctx, nm, f, 10.4, 20.6, o); n++; }); }
  T('draw unknown', () => G.draw(ctx, 'does_not_exist', 0, 0, 0));
  for (let i = -2; i < 33; i++) T('bg ' + i, () => { const c = G.bgCanvas(i); if (c.width !== 256 || c.height !== 208) throw new Error('bad bg size ' + i); });
  for (let i = 0; i < 30; i++) T('theme ' + i, () => { const th = G.theme(i); if (!th.bg) throw new Error('no bg'); });
  return { errs, drawn: n, names: names.length };
});
log(JSON.stringify(R).slice(0, 1500));
check('GF1 GFX.text/draw/bgCanvas fuzz: no exceptions', R.errs.length === 0, R.errs.slice(0, 5));
await t.close();
