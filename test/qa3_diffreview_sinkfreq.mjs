// How often does a random-walking player sink through a platform's top face (falling, feet 0-4 px below a landable tile top while the body overlaps it)?
import { boot, log } from './qa3_diffreview_lib.mjs';
const b = await boot({ players: 2, level: 1, seed: 1 });
const SRC = (L, seed, frames) => `(() => {
  fz.start(2, ${L}, ${seed}); const D = fz.Game.debug; D.skipIntro(); D.god(true); D.noClear(true); D.clearEnemies(); D.setHurryTimer(-1e7);
  const S = D._S(); const T = 8, MAP_Y = 16;
  const solid = (c, r) => (c < 0 || c >= 32) ? true : (r < 0 || r >= 26) ? false : S.solid[r * 32 + c] === 1;
  const landable = (c, r) => r >= 1 && solid(c, r) && !solid(c, r - 1);
  let s = ${seed} * 7919 + ${L}; const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const inp = [{}, {}]; const hold = [0, 0]; let sinks = 0, landings = 0; const was = [false, false]; const sunk = [false, false];
  for (let f = 0; f < ${frames}; f++) {
    for (let i = 0; i < 2; i++) { if (hold[i]-- <= 0) { hold[i] = 5 + Math.floor(rnd() * 40); const r = rnd(); inp[i] = { left: r < 0.35, right: r >= 0.35 && r < 0.7, jump: rnd() < 0.4, fire: rnd() < 0.3 }; if (rnd() < 0.1) inp[i] = {}; } fz.input.set(i, inp[i]); }
    fz.step(1);
    for (let i = 0; i < 2; i++) {
      const p = S.players[i];
      if (p.onGround && !was[i]) landings++;
      was[i] = p.onGround;
      let hit = false;
      if (!p.onGround && p.vy > 0.1) {
        const feet = p.y + 16;
        for (let c = Math.floor((p.x + 2) / T); c <= Math.floor((p.x + 14 - 1e-6) / T); c++) {
          for (let r = 1; r < 25; r++) { const top = MAP_Y + r * T; if (landable(c, r) && feet > top + 0.01 && feet <= top + 4) hit = true; }
        }
      }
      if (hit && !sunk[i]) sinks++;
      sunk[i] = hit;
    }
  }
  return { sinks, landings };
})()`;
for (const [label, html] of [['new', process.cwd() + '/dist/fizzpop.html'], ['old', process.cwd() + '/out/qa3/diffreview/old.html']]) {
  process.env.FIZZ_HTML = html;
  const bb = await boot({ players: 2, level: 1, seed: 1 });
  let sinks = 0, landings = 0;
  for (let L = 1; L <= 30; L++) for (const seed of [1, 2]) { const r = await bb.page.evaluate(SRC(L, seed, 2000)); sinks += r.sinks; landings += r.landings; }
  log(label, 'sink-through events', sinks, 'landings', landings, 'per 1000 landings', (1000 * sinks / landings).toFixed(1));
  await bb.t.close();
}
await b.t.close();
