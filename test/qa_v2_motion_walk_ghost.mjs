import { setup, OUT, save } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
await g.start(2, 1, 5); await g.step(160);
await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.clearEnemies(); fz.Game.debug.god(true); fz.Game.debug.noClear(true); });
await g.step(130);
const rowsOut = [];
for (const rm of [false, true]) {
  await g.evaluate((rm) => fz.Game.setOptions({ reducedMotion: rm, quality: 2 }), rm);
  await g.evaluate(() => fz.Game.debug.setPlayer(0, { x: 28, y: 200, vx: 0, vy: 0 }));
  await g.set(0, { right: true });
  await g.step(30);
  const p = (await g.state()).players[0];
  await page.evaluate(({ x, y, rm }) => { if (!window.__cmp) window.__cmp = []; window.__cmp.push({ c: QA.grab(x - 14, y - 10, 44, 34), rm }); }, { x: p.x, y: p.y, rm });
  await g.set(0, { right: false });
}
// speed samples
const url = await page.evaluate(() => { const z = 6; const o = document.createElement('canvas'); o.width = window.__cmp[0].c.width * z * 2 + 10; o.height = window.__cmp[0].c.height * z + 14; const c = o.getContext('2d'); c.imageSmoothingEnabled = false; c.fillStyle = '#000'; c.fillRect(0, 0, o.width, o.height); window.__cmp.forEach((m, i) => { c.drawImage(m.c, i * (m.c.width * z + 10), 14, m.c.width * z, m.c.height * z); c.fillStyle = '#9bd'; c.font = '11px monospace'; c.fillText(m.rm ? 'reducedMotion (no trail)' : 'default (trail on) - Fizz walking right at 1.25 px/frame', i * (m.c.width * z + 10) + 2, 10); }); return o.toDataURL('image/png'); });
save(`${OUT}/players/walk_ghost_compare.png`, url);
await t.close();
