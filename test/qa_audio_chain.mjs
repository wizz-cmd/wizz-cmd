// QA (audio lens) -- in-game 30-bubble chain pop through the real Game -> AUDIO path (real time): how many pop calls,
// max concurrent sfx groups/voices, output peak, and the cadence of pops.
import { launch, fp } from '../tools/harness.mjs';
const t = await launch({}); const g = fp(t.page);
await t.page.keyboard.press('ArrowDown'); await t.page.waitForTimeout(300);
await g.evaluate(() => { fz.start(1, 3, 3); fz.Game.debug.skipIntro(); fz.Game.debug.god(true); fz.Game.debug.noClear(true); });
await t.page.waitForTimeout(4200);
const r = await g.evaluate(async () => {
  const D = fz.Game.debug, S = D._S(), A = fz.AUDIO;
  // wrap sfx to record calls
  const calls = []; const orig = A.sfx; A.sfx = (n, o) => { calls.push([Math.round(performance.now()), n, o && o.vol]); return orig(n, o); };
  // 30 empty bubbles, 12 px apart in a snake row y=100
  const mk = (x, y) => ({ kind: 'empty', x, y, state: 'float', age: 100, owner: -1, grace: -1, popAt: 0, chain: null, dead: false, enemy: null, trapT: 0, trapTime: 0, att: null, life: 600, dir: 1, v: 0, decel: 0, range: 1, dist: 0, letter: '', chainImmune: 0 });
  S.bubbles.length = 0;
  for (let i = 0; i < 30; i++) S.bubbles.push(mk(40 + (i % 15) * 12, 100 + Math.floor(i / 15) * 12));
  // freeze bubble drift: zero their motion by keeping them in 'float' but position is rewritten each frame -> just trigger quickly
  const p = S.players[0]; p.x = S.bubbles[0].x - 4; p.y = S.bubbles[0].y - 6; p.vy = 0;
  const tap = A._tap(); const buf = new Float32Array(tap.fftSize);
  let peak = 0, maxG = 0, maxV = 0; const t0 = performance.now();
  while (performance.now() - t0 < 3500) {
    await new Promise((r) => setTimeout(r, 16));
    tap.getFloatTimeDomainData(buf); for (const x of buf) peak = Math.max(peak, Math.abs(x));
    const s = A._stats(); maxG = Math.max(maxG, s.groups); maxV = Math.max(maxV, s.voices);
  }
  A.sfx = orig;
  const pops = calls.filter((c) => c[1] === 'pop');
  const gaps = pops.slice(1).map((c, i) => c[0] - pops[i][0]);
  return { totalCalls: calls.length, pops: pops.length, firstPop: pops[0] && pops[0][0], span: pops.length ? pops[pops.length - 1][0] - pops[0][0] : 0, medianGap: gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)], other: calls.filter((c) => c[1] !== 'pop').map((c) => c[1]), bubblesLeft: S.bubbles.filter((b) => !b.dead).length, peak: +peak.toFixed(3), maxGroups: maxG, maxVoices: maxV };
});
console.log(JSON.stringify(r));
console.log('errors:', t.errors);
await t.close();
