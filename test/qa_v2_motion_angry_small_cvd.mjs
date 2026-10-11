import { setup, OUT, save } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
const url = await page.evaluate(() => {
  const GFX = window.__fizzpop.GFX;
  const pairs = [['nibbler_move', 'nibbler_angry'], ['crabbit_move', 'crabbit_angry'], ['jellop_move', 'jellop_angry'], ['springle_move', 'springle_angry'], ['glimmer_move', 'glimmer_angry'], ['p1_idle', 'p2_idle']];
  const k = 1.25, zoom = 4, cell = 22;
  GFX.setScale(k);
  const modes = ['normal', 'deutan', 'protan', 'gray'];
  const cv = document.createElement('canvas'); cv.width = Math.ceil(cell * 12 * k); cv.height = Math.ceil(cell * k);
  const c = cv.getContext('2d'); const g2 = c.createLinearGradient(0, 0, cv.width, 0); g2.addColorStop(0, '#0a1030'); g2.addColorStop(1, '#10163a'); c.fillStyle = g2; c.fillRect(0, 0, cv.width, cv.height); c.setTransform(k, 0, 0, k, 0, 0);
  let x = 3; for (const pair of pairs) for (const n of pair) { GFX.draw(c, n, 0, x, 3); x += cell; }
  const out = document.createElement('canvas'); out.width = cv.width * zoom; out.height = modes.length * (cv.height * zoom + 14);
  const o = out.getContext('2d'); o.fillStyle = '#000'; o.fillRect(0, 0, out.width, out.height); o.imageSmoothingEnabled = false;
  modes.forEach((m, r) => { o.fillStyle = '#9bd'; o.font = '11px monospace'; o.fillText('k=1.25 ' + m + ' (calm/angry pairs: nibbler crabbit jellop springle glimmer | P1 P2)', 2, r * (cv.height * zoom + 14) + 10); o.drawImage(QA.simCanvas(cv, m), 0, r * (cv.height * zoom + 14) + 14, cv.width * zoom, cv.height * zoom); });
  return out.toDataURL('image/png');
});
save(`${OUT}/cvd/angry_calm_k125_cvd.png`, url);
await t.close();
