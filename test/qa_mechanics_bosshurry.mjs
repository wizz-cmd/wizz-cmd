// Does HURRY UP re-trigger after the boss is defeated when the fight lasted > hurry time?
import { boot, OUT, canvasShot } from './qa_mechanics_lib.mjs';
const { t, g, ev, page } = await boot({ level: 30, god: true });
await g.evaluate(() => { window.__tempo = []; const A = fz.AUDIO; const orig = A.setTempo; A.setTempo = (v) => { window.__tempo.push(v); return orig.call(A, v); }; });
const r = await ev((H) => {
  const S = H.S(); const p = H.P();
  H.D.setHurryTimer(3700);        // fight has lasted > 60 s
  H.step(5);
  const log = [{ ph: 'fight', hurry: S.hurry, ghost: !!S.ghost }];
  H.D.killAll(); H.step(2);
  log.push({ ph: S.bossPhase, hurry: S.hurry, banner: S.hurryBanner });
  // pop the boss bubble
  const bb = S.bossBubble; p.x = bb.x + 20; p.y = bb.y + 20; p.vy = 0; H.step(1);
  log.push({ afterPop: S.bossPhase, hurry: S.hurry, banner: S.hurryBanner, hurryT: S.hurryT });
  H.step(3);
  log.push({ f3: S.bossPhase, hurry: S.hurry, banner: S.hurryBanner });
  H.step(700);
  log.push({ later: S.bossPhase, ph: S.phase, ghost: !!S.ghost, hurry: S.hurry });
  return log;
});
console.log(JSON.stringify(r, null, 1));
console.log('tempo calls', await g.evaluate(() => window.__tempo));
await t.close();
