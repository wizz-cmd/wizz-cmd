// QA (audio lens) -- how long is the boss-victory stretch with no music?  Pops the boss bubble, then times the pearl drop
// and a player walking from the spawn to the resting pearl (virtual input); reports silence between clear_boss end and 'ending'.
import { launch, fp } from '../tools/harness.mjs';
const t = await launch({}); const g = fp(t.page);
await t.page.keyboard.press('ArrowDown'); await t.page.waitForTimeout(300);
await g.evaluate(() => { fz.start(1, 30, 5); fz.Game.debug.skipIntro(); fz.Game.debug.god(true); });
await t.page.waitForTimeout(4200);
await g.evaluate(() => { fz.Game.debug.killAll(); });
// put the player in the bubble to pop it
for (let i = 0; i < 80; i++) {
  const done = await g.evaluate(() => { const S = fz.Game.debug._S(); const p = S.players[0]; if (S.bossBubble) { p.x = S.bossBubble.x + 24; p.y = S.bossBubble.y + 24; p.vy = 0; return false; } return true; });
  await t.page.waitForTimeout(50);
  if (done) break;
}
const t0 = Date.now();
await g.evaluate(() => { fz.freeze(true); });
// player back at its spawn, pearl state
const info = await g.evaluate(() => {
  const S = fz.Game.debug._S(); const p = S.players[0]; p.x = 24; p.y = 200; p.vx = 0; p.vy = 0;
  const pearl = S.items.find((it) => it.kind === 'moonpearl');
  return { pearl: pearl && { x: pearl.x, y: pearl.y }, phase: S.phase, bossPhase: S.bossPhase };
});
console.log('after pop:', JSON.stringify(info));
// step frames until pearl rests; then walk towards it with virtual input
const res = await g.evaluate(() => {
  const D = fz.Game.debug; let frames = 0, restFrame = null, grabFrame = null; const S = D._S();
  let lastY = -1;
  for (; frames < 1800; frames++) {
    const pearl = S.items.find((it) => it.kind === 'moonpearl');
    if (pearl) { if (pearl.y === lastY && restFrame === null) restFrame = frames; lastY = pearl.y; }
    const p = S.players[0];
    fz.input.clear();
    if (pearl) {
      const dx = (pearl.x + 16) - (p.x + 8);
      if (dx > 4) fz.input.set(0, { right: true }); else if (dx < -4) fz.input.set(0, { left: true });
      if (p.y > pearl.y + 16 && p.onGround && frames % 40 === 0) fz.input.set(0, { jump: true });
    }
    fz.step(1);
    if (S.phase === 'victory') { grabFrame = frames; break; }
  }
  fz.input.clear();
  const pe = S.items.find((it) => it.kind === 'moonpearl');
  return { frames, restFrame, grabFrame, phase: S.phase, pearl: pe && { x: pe.x, y: pe.y }, player: { x: S.players[0].x, y: S.players[0].y } };
});
console.log(JSON.stringify(res));
const secs = (res.grabFrame || res.frames) / 60;
console.log(`pearl pickup took ${secs.toFixed(1)} s of game time after the bubble popped; jingle covers 3.1 s; victory phase adds 4.0 s before the ending scene starts its music`);
console.log(`=> approx silence = ${(Math.max(0, secs - 3.1) + 4.0).toFixed(1)} s  (clear_boss 3.1 s ... ending music)`);
await t.close();
