// FIZZ & POP — game module wave 3: screenshots of the polish items (angry aura, hurry banner plate, popups over banners).
//   node test/game_wave3_shots.mjs [outdir]      (default out/fix3/shots) — LOOK at the PNGs
import { launch, fp, canvasShot, canvasFnShot } from '../tools/harness.mjs';
import path from 'path';
import fs from 'fs';
const OUT = path.resolve(process.argv[2] || 'out/fix3/shots');
fs.mkdirSync(OUT, { recursive: true });
const t = await launch({ html: process.env.FIZZ_HTML || undefined });
const g = fp(t.page); await g.freeze(true);

// ---- K4 angry aura: contact sheet, rows = rounds (crimson R3, lava R22, lava R24), columns = pulse max / pulse min, calm vs angry
await g.evaluate(() => {
  window.sheet = document.createElement('canvas'); sheet.width = 256 * 4; sheet.height = 80 * 3 * 1;
});
for (const [row, r] of [[0, 3], [1, 22], [2, 24]]) {
  for (const [col, ph, angry] of [[0, 10, false], [1, 10, true], [2, 30, true], [3, 20, true]]) {
    await g.evaluate((row, r, col, ph, angry) => {
      const D = fz.Game.debug;
      fz.start(1, r, 7); const S = D._S(); D.god(true); D.noClear(true); D.skipIntro(); D.clearEnemies();
      const cv = document.getElementById('screen'), cx = cv.getContext('2d');
      // find a flat shelf: use the level's own spawn rows -> put the five types on the highest platform we can stand on
      const types = ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer'];
      const lv = fz.LEVELS[r - 1];
      const rowsWith = [];
      for (let rr = 4; rr < 24; rr++) { let run = 0; for (let c = 3; c < 29; c++) { const s = S.solid[rr * 32 + c] === 1 && S.solid[(rr - 1) * 32 + c] !== 1; run = s ? run + 1 : 0; if (run === 10) rowsWith.push([rr, c - 9]); } }
      const [rr, c0] = rowsWith[0] || [20, 4];
      types.forEach((k, i) => { D.spawn(k, (c0 + 1) * 8 + i * 18, 16 + rr * 8 - 16 - (k === 'jellop' || k === 'glimmer' ? 8 : 0)); const e = S.enemies[S.enemies.length - 1]; e.angry = angry; e.vx = 0; e.vy = 0; e.animT = 0; });
      S.frame = ph;
      fz.Game.render(cx);
      const sc = sheet.getContext('2d'); sc.imageSmoothingEnabled = false;
      const y0 = 16 + rr * 8 - 40;
      sc.drawImage(cv, 0, Math.max(16, y0), 256, 80, col * 256, row * 80, 256, 80);
    }, row, r, col, ph, angry);
  }
}
await canvasFnShot(t.page, OUT + '/aura_sheet.png', () => window.sheet, { scale: 3 });

// ---- hurry banner while a jellop sits behind it (visible-text frame)
await g.evaluate(() => {
  const D = fz.Game.debug;
  fz.start(1, 5, 2); const S = D._S(); D.god(true); D.noClear(true); D.skipIntro(); D.clearEnemies(); D.setHurryTimer(-1e7);
  D.spawn('jellop', 120, 96); S.enemies[0].jx = 0; S.enemies[0].jy = 0;
  S.proj.push({ type: 'pebble', x: 60, y: 104, vx: 0, vy: 0, age: 0, dead: false });
  fz.step(1);
  D.setHurryTimer(40 * 60); 
  for (let i = 0; i < 4; i++) { const e = S.enemies[0]; e.x = 120; e.y = 96; e.jx = 0; e.jy = 0; fz.step(1); }
  S.hurryBanner = 100;       // text lit (floor(100/5)=20 even)
  const e = S.enemies[0]; e.x = 120; e.y = 96; S.proj.forEach((q) => { q.x = 60; q.y = 104; q.vx = 0; q.vy = 0; });
  fz.Game.render(document.getElementById('screen').getContext('2d'));
});
await canvasShot(t.page, OUT + '/hurry_lit.png', { scale: 3 });

// ---- popups crossing a banner plate (victory)
await g.evaluate(() => {
  const D = fz.Game.debug;
  fz.start(1, 30, 7); const S = D._S(); D.god(true); D.skipIntro(); fz.step(5);
  S.phase = 'victory'; S.phaseT = 10; S.bossBubble = null; S.popups.length = 0;
});
await g.evaluate(() => { const S = fz.Game.debug._S(); S.popups.push({ x: 128, y: 100, text: '1UP', color: '#9dffa8', age: 0, life: 200, vy: 0 }); S.popups.push({ x: 90, y: 74, text: '50000', color: '#ffe36b', age: 0, life: 200, vy: 0 }); fz.Game.render(document.getElementById('screen').getContext('2d')); });
await canvasShot(t.page, OUT + '/popups_victory.png', { scale: 3 });
console.log('state', JSON.stringify(await g.evaluate(() => fz.Game.debug.state().phase)), 'errors', t.errors);
await t.close();
