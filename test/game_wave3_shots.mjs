// FIZZ & POP v2 — game module: screenshots of the polish items (angry look without the K4 aura, HURRY banner band, popups over banners).
//   node test/game_wave3_shots.mjs [outdir]      (default out/v2/game/polish) — LOOK at the PNGs   (real modules, canvas k = 3, post FX on)
import { launch, canvasShot, PROJECT } from '../tools/harness.mjs';
import path from 'path';
import fs from 'fs';
const OUT = path.resolve(process.argv[2] || path.join(PROJECT, 'out/v2/game/polish'));
fs.mkdirSync(OUT, { recursive: true });
const t = await launch({ html: path.join(PROJECT, 'test', 'game_harness.html') + '?real=1&k=3&post=2' });
const page = t.page; await page.waitForFunction(() => !!window.__t); await page.evaluate(() => __t.freeze(true));
const ev = (fn, a) => page.evaluate(fn, a);
// angry lineup (calm row above, angry row below) on a crimson round (R3), the lava rounds (R22, R24)
for (const r of [3, 22, 24]) {
  await ev((r) => {
    const T = __t, D = Game.debug; T.start({ players: 1, level: r, seed: 7 }); D.god(true); D.noClear(true); D.skipIntro(); D.clearEnemies(); const S = D._S();
    ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer'].forEach((k, i) => {
      D.spawn(k, 40 + i * 36, 70); const a = S.enemies[S.enemies.length - 1]; a.vx = 0; a.vy = 0; a.state = 'frozen'; a.freezeT = 1e9; a.state = 'active'; a.angry = false;
      D.spawn(k, 40 + i * 36, 120); const b = S.enemies[S.enemies.length - 1]; b.angry = true; b.vx = 0; b.vy = 0;
    });
    T.step(2);
  }, r);
  await canvasShot(page, path.join(OUT, 'angry_R' + r + '.png'), { scale: 1 });
}
await ev(() => {
  const T = __t, D = Game.debug; T.start({ players: 1, level: 5, seed: 2 }); const S = D._S(); D.god(true); D.noClear(true); D.skipIntro(); D.clearEnemies(); D.setHurryTimer(-1e7);
  D.spawn('jellop', 120, 96); S.enemies[0].jx = 0; S.enemies[0].jy = 0; S.proj.push({ type: 'pebble', x: 60, y: 104, vx: 0, vy: 0, age: 0, dead: false });
  S.hurryBanner = 100; T.render();
});
await canvasShot(page, path.join(OUT, 'hurry_lit.png'), { scale: 1 });
await ev(() => {
  const T = __t, D = Game.debug; T.start({ players: 1, level: 30, seed: 7 }); const S = D._S(); D.god(true); D.skipIntro(); T.step(5);
  S.phase = 'victory'; S.phaseT = 10; S.bossBubble = null; S.popups.length = 0;
  S.popups.push({ x: 128, y: 100, text: '1UP', color: '#7dff8a', t: 0 }); S.popups.push({ x: 90, y: 74, text: '50000', color: '#ffe27a', t: 0 }); T.render();
});
await canvasShot(page, path.join(OUT, 'popups_victory.png'), { scale: 1 });
console.log('errors', t.errors);
await t.close();
process.exit(t.errors.length ? 1 : 0);
