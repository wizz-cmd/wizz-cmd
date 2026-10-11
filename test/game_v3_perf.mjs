// FIZZ & POP v3 - G2 / V6 render cost of chain moments: Game.render() time of frames that carry shockwave rings (a bomb chain, thunder pops), old vs new Game.
//   node test/game_v3_perf.mjs [k=4]            real GFX (software raster of this VM: ONLY relative numbers are meaningful)
//   GAME=../backup/v3/game_40_game.js node test/game_v3_perf.mjs [k]     the same with another Game build
import { launch, PROJECT } from '../tools/harness.mjs';
import path from 'path';
const K = +(process.argv[2] || 4);
const t = await launch({ html: path.join(PROJECT, 'test', 'game_harness.html') + `?real=1&k=${K}&post=0` + (process.env.GAME ? '&game=' + process.env.GAME : '') });
await t.page.waitForFunction(() => !!window.__t);
await t.page.evaluate(() => __t.freeze(true));
const r = await t.page.evaluate(async () => {
  const T = __t; Game.setOptions({ quality: 2, reducedMotion: false }); const cv = T.canvas;
  const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1] || 0; };
  const out = { chain: [], calm: [], rings: [] };
  const prime = () => { T.start({ players: 2, level: 8, seed: 5 }); T.step(160); Game.debug.god(true); Game.debug.clearEnemies(); for (let i = 0; i < 40; i++) T.render(); };
  prime();
  await new Promise((r) => setTimeout(r, 800));
  // warm every ring / dot / spark sprite the chain will use (the first chain of a game pays the bakes: reported separately)
  const chainOnce = (record) => {
    const S = T.S(); Game.debug.clearEnemies();
    for (let i = 0; i < 8; i++) { Game.debug.spawn(['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer', 'nibbler', 'crabbit', 'jellop'][i], 40 + i * 24, 100 + (i % 2) * 40); const e = S.enemies[S.enemies.length - 1]; e.state = 'frozen'; e.freezeT = 1e9; }
    for (let i = 0; i < 12; i++) { Game.debug.spawn('thunder', 30 + i * 16, 60); const b = S.bubbles[S.bubbles.length - 1]; b.att = null; b.life = 1e9; }
    Game.debug.give(0, 'bomb'); const ts = [];
    for (let f = 0; f < 36; f++) { T.tick(1); const t0 = performance.now(); T.render(); cv.getContext('2d').getImageData(0, 0, 1, 1); const dt = performance.now() - t0; ts.push(dt); if (record) { out.rings.push((Game.debug.fxStats().drawn.rings)); } }
    return ts;
  };
  const first = chainOnce(false);
  out.firstChainMax = Math.max(...first);
  for (let i = 0; i < 4; i++) chainOnce(false);
  const all = [];
  for (let i = 0; i < 6; i++) all.push(chainOnce(true));
  out.chain = all.flat();
  // calm reference: the same scene without a chain
  Game.debug.clearEnemies(); T.S().bubbles.length = 0; T.S().parts.length = 0; for (let i = 0; i < 60; i++) { T.tick(1); const t0 = performance.now(); T.render(); cv.getContext('2d').getImageData(0, 0, 1, 1); out.calm.push(performance.now() - t0); }
  return { first: out.firstChainMax, chainMed: med(out.chain), chainP90: out.chain.slice().sort((a, b) => a - b)[Math.floor(out.chain.length * 0.9)], chainMax: Math.max(...out.chain), calmMed: med(out.calm), ringsMax: Math.max(...out.rings) };
});
console.log(`k=${K} Game: ${process.env.GAME || 'src/40_game.js'}  render + raster flush ms: chain-frames median ${r.chainMed.toFixed(2)}, p90 ${r.chainP90.toFixed(2)}, max ${r.chainMax.toFixed(1)} | calm median ${r.calmMed.toFixed(2)} | first chain of the game max ${r.first.toFixed(1)} | rings drawn per frame max ${r.ringsMax}`);
console.log('errors', t.errors);
await t.close();
