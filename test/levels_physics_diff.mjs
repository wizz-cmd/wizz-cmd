// FIZZ & POP — test/levels_physics_diff.mjs
// Differential test of the movement model in test/levels_check.mjs against the REAL Game physics: the same random
// input macros (walk / jump / steer in the air) are run from random standing positions in both, and the player
// position is compared frame by frame. Max deviation should be ~0 (the model mirrors Game.physStep).
//   node test/levels_physics_diff.mjs [levels=1,4,10,18,25,30] [macros=60]
import path from 'path';
import { launch, PROJECT } from '../tools/harness.mjs';
import { loadLevels } from '../tools/validate_levels.mjs';
import { world, tick, explore } from './levels_check.mjs';

const levels = (process.argv[2] || '1,4,10,18,25,30').split(',').map(Number);
const nMacros = +(process.argv[3] || 60);
const LEVELS = loadLevels(path.join(PROJECT, 'src', '30_levels.js'));
const T1 = [0, 2, 5, 9, 14, 20, 27, 35, 45];
const FRAMES = 150;
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

const t = await launch({ html: path.join(PROJECT, 'test', 'game_harness.html') + '?real=1' });
const page = t.page;
await page.evaluate(() => __t.freeze(true));
let worst = 0, total = 0, off = 0;
for (const lv of levels) {
  const w = world(LEVELS[lv - 1].map);
  const states = [...explore(w, { x: 24, s: 25 }, []).states.values()];
  const jobs = [];
  for (let i = 0; i < nMacros; i++) {
    const S = states[Math.floor(rnd() * states.length)];
    jobs.push({ x: S.x, y: S.s * 8, jump: rnd() < 0.7, h1: Math.floor(rnd() * 3) - 1, h2: Math.floor(rnd() * 3) - 1, t1: T1[Math.floor(rnd() * T1.length)] });
  }
  // model trajectories
  const model = jobs.map((j) => {
    const st = { x: j.x, y: j.y, vy: 0, g: true }, tr = [];
    for (let f = 0; f < FRAMES; f++) { tick(w, st, f < j.t1 ? j.h1 : j.h2, j.jump && f === 0); tr.push([st.x, st.y]); }
    return tr;
  });
  // real game trajectories
  const real = await page.evaluate(({ level, jobs, FRAMES }) => {
    const T = __t;
    T.arena({ level, empty: true, noClear: true });
    Game.debug.god(true);
    const S = T.S(), p = S.players[0];
    const NO = { left: false, right: false, jump: false, fire: false, jumpPressed: false, firePressed: false };
    return jobs.map((j) => {
      S.bubbles.length = 0; S.items.length = 0; S.proj.length = 0; S.puT = -1; S.specialT = 1e9; S.letterT = 1e9; S.hurryT = 0; S.ghost = null;
      p.power = { shoes: false, pink: false, blue: false, gold: false };
      p.x = j.x; p.y = j.y; p.vx = 0; p.vy = 0; p.onGround = true; p.state = 'normal'; p.stunT = 0; p.inv = 0; p.jumpBuf = 0;
      const tr = [];
      for (let f = 0; f < FRAMES; f++) {
        const h = f < j.t1 ? j.h1 : j.h2;
        const inp = { left: h < 0, right: h > 0, jump: j.jump && f === 0, fire: false, jumpPressed: j.jump && f === 0, firePressed: false };
        Game.update([inp, NO]);
        tr.push([p.x, p.y]);
      }
      return tr;
    });
  }, { level: lv, jobs, FRAMES });
  let lvWorst = 0, lvOff = 0;
  jobs.forEach((j, i) => {
    let m = 0;
    for (let f = 0; f < FRAMES; f++) m = Math.max(m, Math.abs(model[i][f][0] - real[i][f][0]), Math.abs(model[i][f][1] - real[i][f][1]));
    lvWorst = Math.max(lvWorst, m); if (m > 1.0) lvOff++;
  });
  worst = Math.max(worst, lvWorst); off += lvOff; total += jobs.length;
  console.log(`round ${String(lv).padStart(2)}: ${jobs.length} macros, max deviation ${lvWorst.toFixed(3)} px, ${lvOff} macros off by > 1 px`);
}
console.log(`${total} macros, worst deviation ${worst.toFixed(3)} px, ${off} off by > 1 px; page errors: ${t.errors.length ? t.errors.join(' | ') : 'none'}`);
await t.close();
process.exit(off || t.errors.length ? 1 : 0);
