import { setup, sheet, OUT, save } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
await g.start(1, 5, 6); await g.step(160);
await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.god(true); });
await g.step(60);
await g.evaluate(() => fz.Game.debug.killAll());
let n = 0, lastClear = null; const info = [];
await page.evaluate(() => QA.reset());
for (let i = 0; i < 700; i++) {
  const sPre = await g.state();
  if (sPre.phase === 'clear') await page.evaluate(() => { window.__lc = QA.grab(0, 0, 256, 224); });
  await g.step(1);
  const s = await g.state();
  if (s.phase === 'transition') { n++; await page.evaluate((l) => QA.push(0, 0, 256, 224, l), 'tr+' + n + ' phaseT' + s.phaseT); if (n === 1) await page.evaluate(() => { QA.frames.unshift({ c: window.__lc, label: 'last clear frame' }); }); if (n >= 40) break; }
}
const m = await page.evaluate(() => QA.metrics());
console.log(m.map(x => x.label.replace(' phaseT', '#') + ':' + x.diff).join(' '));
// difference image between last clear frame and tr+1
const url = await page.evaluate(() => {
  const a = QA.frames[0].c, b = QA.frames[1].c; const o = document.createElement('canvas'); o.width = a.width * 3; o.height = a.height; const c = o.getContext('2d');
  c.drawImage(a, 0, 0); c.drawImage(b, a.width, 0);
  const da = a.getContext('2d').getImageData(0, 0, a.width, a.height), db = b.getContext('2d').getImageData(0, 0, b.width, b.height);
  const out = c.createImageData(a.width, a.height);
  for (let i = 0; i < da.data.length; i += 4) { const d = Math.abs(da.data[i] - db.data[i]) + Math.abs(da.data[i + 1] - db.data[i + 1]) + Math.abs(da.data[i + 2] - db.data[i + 2]); const v = Math.min(255, d * 3); out.data[i] = out.data[i + 1] = out.data[i + 2] = v; out.data[i + 3] = 255; }
  c.putImageData(out, a.width * 2, 0); return o.toDataURL('image/png');
});
save(`${OUT}/transition/clear_to_transition_diff.png`, url);
await t.close();
