import { boot, OUT, canvasShot } from './qa_mechanics_lib.mjs';
const { t, g, ev, page } = await boot({ level: 30, god: true });
await ev((H) => {
  const S = H.S(); const p = H.P();
  H.D.setHurryTimer(3700); H.step(5);
  H.D.killAll(); H.step(2);
  const bb = S.bossBubble; p.x = bb.x + 20; p.y = bb.y + 20; p.vy = 0; H.step(1);  // pop boss bubble
  H.step(10);
  const pearl = S.items.find(i => i.kind === 'moonpearl'); p.x = pearl.x + 8; p.y = pearl.y + 8; H.step(1);
  H.step(14);
});
console.log(JSON.stringify(await ev((H) => ({ phase: H.S().phase, bossPhase: H.S().bossPhase, banner: H.S().hurryBanner, hurry: H.S().hurry }))));
await canvasShot(page, OUT + '/boss_victory_hurry.png');
await t.close();
