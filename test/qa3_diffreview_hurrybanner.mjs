// HURRY UP banner: full-width 72 % dark plate (y 88..120) lies over the live playfield for 120 frames while enemies are angry.
import { boot, log, check, canvasShot, OUT } from './qa3_diffreview_lib.mjs';
const b = await boot({ players: 1, level: 5, seed: 2, god: true });
const R = await b.page.evaluate(() => {
  const D = fz.Game.debug; D.clearEnemies(); D.noClear(true); D.setHurryTimer(-1e7);
  const S = D._S();
  D.spawn('jellop', 120, 96); const e = S.enemies[0]; e.jx = 0; e.jy = 0;
  D.spawn('pebble', 0, 0);   // unknown type -> ignored
  S.proj.push({ type: 'pebble', x: 60, y: 104, vx: 0, vy: 0, age: 0, dead: false });
  const cv = document.getElementById('screen');
  const lum = (x0, y0, w, h) => { const c = cv.getContext('2d'); const k = cv.width / 256; const d = c.getImageData(Math.round(x0 * k), Math.round(y0 * k), Math.round(w * k), Math.round(h * k)).data; let s = 0, n = 0, mx = 0; for (let i = 0; i < d.length; i += 4) { const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; s += l; n++; mx = Math.max(mx, l); } return { mean: +(s / n).toFixed(1), max: Math.round(mx) }; };
  const keep = () => { e.x = 120; e.y = 96; e.jx = 0; e.jy = 0; S.proj.forEach((q) => { q.x = 60; q.y = 104; q.vx = 0; q.vy = 0; q.age = 0; }); };
  keep(); fz.step(1);
  const before = { jellop: lum(120, 96, 16, 16), pebble: lum(60, 104, 8, 8) };
  D.setHurryTimer(0); let f = 0; while (!D.state().hurry && f < 5) { keep(); D.setHurryTimer(40 * 60); fz.step(1); f++; }
  keep(); fz.step(1);
  const during = { jellop: lum(120, 96, 16, 16), pebble: lum(60, 104, 8, 8), banner: S.hurryBanner };
  return { before, during };
});
log(JSON.stringify(R));
await canvasShot(b.page, OUT + '/hurry_band.png', { scale: 3 });
const ratio = R.during.jellop.max / R.before.jellop.max;
check('HB1 enemies / projectiles inside the HURRY UP band stay at least ~60 % as bright as outside it', ratio >= 0.6, { ratio: +ratio.toFixed(2), R });
await b.t.close();
