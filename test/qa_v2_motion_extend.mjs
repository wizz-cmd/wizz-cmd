// EXTEND letter panel lit vs dim, both players, all CVD modes, at k=3 and at small k via viewport
import { setup, sheet, OUT, save } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
await g.start(2, 1, 5);
await g.step(160);
await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.clearEnemies(); fz.Game.debug.god(true); fz.Game.debug.noClear(true); });
await g.step(200);
await g.evaluate(() => { const S = fz.Game.debug._S(); S.players[0].letters = [1, 1, 0, 1, 0, 0]; S.players[1].letters = [0, 1, 1, 0, 0, 1]; });
await g.step(2);
await page.evaluate(() => { QA.reset(); QA.push(0, 16, 20, 208, 'left P1: E X . E . .'); QA.push(236, 16, 20, 208, 'right P2: . X T . . D'); });
const url = await page.evaluate(() => {
  const modes = ['normal', 'deutan', 'protan', 'tritan', 'gray']; const fr = QA.frames;
  const cw = fr[0].c.width, ch = fr[0].c.height; const out = document.createElement('canvas'); out.width = (cw + 6) * 2 * modes.length; out.height = ch + 14;
  const c = out.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, out.width, out.height);
  modes.forEach((m, i) => { fr.forEach((f, j) => { c.drawImage(QA.simCanvas(f.c, m), (i * 2 + j) * (cw + 6), 14); }); c.fillStyle = '#9bd'; c.font = '10px monospace'; c.fillText(m, i * 2 * (cw + 6) + 2, 10); });
  return out.toDataURL('image/png');
});
save(`${OUT}/cvd/extend_panel.png`, url);
await t.close();
