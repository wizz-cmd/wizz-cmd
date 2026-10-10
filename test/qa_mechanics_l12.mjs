import { boot, OUT, canvasShot } from './qa_mechanics_lib.mjs';
const { t, g, ev, page } = await boot({ level: 12, god: true, seed: 7 });
const r = await ev((H) => {
  const S = H.S(); S.noClear = true; const log = [];
  for (let i = 0; i < 1800; i++) { S.hurryT = 0; fz.step(1); if (i % 100 === 0) log.push({ i, en: S.enemies.map(e => `${e.t[0]}:${Math.round(e.x)},${Math.round(e.y)}${e.onGround ? 'g' : 'a'}`).join(' ') }); }
  return log;
});
for (const l of r) console.log(l.i, l.en);
await canvasShot(page, OUT + '/l12_stuck.png');
await t.close();
