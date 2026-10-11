// Flash area stats for scenes with bright events: chain reaction, extend, victory/ending, boss-bubble pop, game over
import { setup, OUT } from './qa_v2_motion_lib.mjs';
const { t, g, page } = await setup();
await page.evaluate(() => {
  QA.flashStats = (frames) => {
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const lut = new Float32Array(256); for (let i = 0; i < 256; i++) lut[i] = lin(i);
    const Ls = frames.map(f => { const d = f.c.getContext('2d').getImageData(0, 0, f.c.width, f.c.height).data; const L = new Float32Array(d.length / 4); for (let i = 0; i < L.length; i++) L[i] = 0.2126 * lut[d[i * 4]] + 0.7152 * lut[d[i * 4 + 1]] + 0.0722 * lut[d[i * 4 + 2]]; return L; });
    const out = [];
    for (let i = 1; i < Ls.length; i++) {
      let up = 0, dn = 0, mean = 0; const a = Ls[i - 1], b = Ls[i], n = a.length;
      for (let p = 0; p < n; p++) { const dl = b[p] - a[p]; mean += b[p]; if (dl >= 0.1 && a[p] < 0.8) up++; else if (dl <= -0.1 && b[p] < 0.8) dn++; }
      out.push({ i, up: +(up / n * 100).toFixed(2), dn: +(dn / n * 100).toFixed(2), mean: +(mean / n).toFixed(4) });
    }
    return out;
  };
});
async function measure(label, n, each) {
  const st = await page.evaluate(() => QA.flashStats(QA.frames));
  const mx = Math.max(...st.map(s => Math.max(s.up, s.dn)));
  const big = st.filter(s => Math.max(s.up, s.dn) >= 11.1).length;
  const mean = st.map(s => s.mean); const dm = Math.max(...mean) - Math.min(...mean);
  console.log(label.padEnd(34), 'max changed area %', mx.toFixed(2), '| frames>=11.1% (WCAG area):', big, '| mean rel-lum span', dm.toFixed(4));
}
// chain
async function trapOne(type) {
  await g.evaluate(() => fz.Game.debug.setPlayer(0, { x: 28, y: 200, vx: 0, vy: 0, face: 1 }));
  await g.evaluate((ty) => { fz.Game.debug.spawn(ty, 60, 200); }, type);
  const st = () => g.state();
  const n0 = (await st()).bubbles.filter(b => b.kind === 'trapped').length;
  for (let i = 0; i < 200; i++) { await g.set(0, { fire: i % 15 === 0 }); await g.step(1); const s = await st(); if (s.bubbles.filter(b => b.kind === 'trapped').length > n0) break; }
  await g.set(0, { fire: false });
}
await g.start(1, 1, 11); await g.step(160);
await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.clearEnemies(); fz.Game.debug.god(true); fz.Game.debug.noClear(true); });
await g.step(100);
for (const ty of ['nibbler', 'crabbit', 'jellop', 'springle', 'nibbler', 'crabbit']) { await trapOne(ty); await g.step(20); }
await g.step(200);
const tb = (await g.state()).bubbles.find(b => b.kind === 'trapped');
await g.evaluate(({ x, y }) => fz.Game.debug.setPlayer(0, { x, y: y + 6, vx: 0, vy: 0 }), tb);
await page.evaluate(() => QA.reset());
for (let i = 0; i < 120; i++) { await g.step(1); await page.evaluate((l) => QA.push(0, 0, 256, 224, l), i); }
await measure('6-bubble chain reaction', 120);
// bomb
await g.start(1, 3, 11); await g.step(160);
await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.god(true); fz.Game.debug.noClear(true); });
await g.step(60);
await g.evaluate(() => { fz.Game.debug.spawn('pu_bomb', 40, 200); fz.Game.debug.setPlayer(0, { x: 40, y: 200 }); });
await page.evaluate(() => QA.reset());
for (let i = 0; i < 90; i++) { await g.step(1); await page.evaluate((l) => QA.push(0, 0, 256, 224, l), i); }
await measure('bomb pickup', 90);
// extend phase: give all letters
await g.start(1, 2, 3); await g.step(160);
await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.god(true); });
await g.step(30);
await g.evaluate(() => { const S = fz.Game.debug._S(); S.players[0].letters = [1, 1, 1, 1, 1, 0]; });
await g.evaluate(() => { fz.Game.debug.spawn('letter', 40, 190); const S = fz.Game.debug._S(); const b = S.bubbles.find(b => b.kind === 'letter'); fz.Game.debug.setPlayer(0, { x: b.x, y: b.y + 6, vx: 0, vy: 0 }); });
await page.evaluate(() => QA.reset());
for (let i = 0; i < 200; i++) { await g.step(1); await page.evaluate((l) => QA.push(0, 0, 256, 224, l), i); }
console.log('phase', (await g.state()).phase);
await measure('EXTEND completion (200f)', 200);
// ending
await g.goto('ending', { entries: [], res: { won: true, level: 30, scores: [1, 0], players: 1 } });
await page.evaluate(() => QA.reset());
for (let i = 0; i < 240; i++) { await g.step(1); await page.evaluate((l) => QA.push(0, 0, 256, 224, l), i); }
await measure('ending tableau (240f)', 240);
// boss bubble pop
await g.start(1, 30, 4); await g.step(1);
await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.god(true); });
await g.step(20);
await g.evaluate(() => { fz.Game.debug.killAll(); });
await g.step(30);
const bb = await g.evaluate(() => { const S = fz.Game.debug._S(); return S.bossBubble ? { x: S.bossBubble.x, y: S.bossBubble.y } : null; });
await g.evaluate(({ x, y }) => fz.Game.debug.setPlayer(0, { x: x + 28, y: y + 28, vx: 0, vy: 0 }), bb);
await page.evaluate(() => QA.reset());
for (let i = 0; i < 120; i++) { await g.step(1); await page.evaluate((l) => QA.push(0, 0, 256, 224, l), i); }
await measure('boss bubble pop + pearl', 120);
await t.close();
