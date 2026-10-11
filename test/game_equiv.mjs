// FIZZ & POP v2 — Game mechanics equivalence gate (SPEC_V2: "keep every mechanic and number identical").
//   node test/game_equiv.mjs [frames=4000]
// Runs the v2 src/40_game.js and the frozen pre-v2 build (backup/v2/src_40_game.js) side by side on the stub modules with the same seeds and the same
// scripted inputs (random walking / jumping / shooting, specials, power-ups, bombs, boss rounds, 1P and 2P) and compares a hash of Game.debug.state()
// after EVERY frame. The cosmetic layer (particles, trails, flashes, options) must never change a position, a score or a random draw.
// The v2 build is also run with reducedMotion + quality 0 to prove the options are cosmetic only.
import { launch, PROJECT } from '../tools/harness.mjs';
import path from 'path';
import fs from 'fs';

const FRAMES = +process.argv[2] || 4000;
const NEW = process.env.NEW_GAME ? 'game=' + process.env.NEW_GAME : '';        // NEW_GAME=<path relative to test/> runs another v2 build (mutation checks of this gate)
const OLD = path.join(PROJECT, 'backup', 'v2', 'src_40_game.js');
if (!fs.existsSync(OLD)) { console.log('SKIP: no pre-v2 backup at ' + OLD); process.exit(0); }
const page = (q) => path.join(PROJECT, 'test', 'game_harness.html') + '?' + q;

const SCENARIOS = [
  { name: '1P R1 seed 7', players: 1, level: 1, seed: 7 },
  { name: '2P R5 seed 11', players: 2, level: 5, seed: 11 },
  { name: '1P R12 seed 3', players: 1, level: 12, seed: 3 },
  { name: '2P R22 seed 21', players: 2, level: 22, seed: 21 },
  { name: '2P boss R30 seed 8', players: 2, level: 30, seed: 8 },
];

async function trace(q, sc) {
  const t = await launch({ html: page(q) });
  await t.page.waitForFunction(() => !!window.__t);
  await t.page.evaluate(() => __t.freeze(true));
  const res = await t.page.evaluate(({ sc, frames }) => {
    const T = __t;
    if (typeof Game.setOptions === 'function' && window.__opt) Game.setOptions(window.__opt);
    T.start({ players: sc.players, level: sc.level, seed: sc.seed });
    let s = (sc.seed * 7919 + 17) >>> 0; const rnd = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; };
    const held = [{ left: false, right: false, jump: false, fire: false }, { left: false, right: false, jump: false, fire: false }];
    const hashes = []; let h = 2166136261 >>> 0;
    const fnv = (str) => { let x = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; } return x; };
    for (let f = 0; f < frames; f++) {
      for (const hd of held) for (const k of ['left', 'right', 'jump', 'fire']) if (rnd() < 0.07) hd[k] = !hd[k];
      if (f % 600 === 200) { const kind = ['thunder', 'fire', 'water', 'letter', 'bomb', 'clock', 'shoes', 'pink', 'blue', 'gold', 'nibbler', 'crabbit', 'jellop', 'springle', 'glimmer', 'bonefin', 'food_3', 'pu_heart'][Math.floor(rnd() * 18)]; Game.debug.spawn(kind, 40 + rnd() * 160, 40 + rnd() * 150); }
      if (f % 1500 === 1400) Game.debug.killAll();
      T.tick(1, held);
      const st = JSON.stringify(Game.debug.state());
      h = (Math.imul(h ^ fnv(st), 16777619)) >>> 0;
      if (f % 50 === 0) hashes.push(h);
      if (Game.isOver()) { T.start({ players: sc.players, level: sc.level, seed: sc.seed + f }); }
    }
    return { hashes, final: h, state: Game.debug.state() };
  }, { sc, frames: FRAMES });
  const err = t.errors.slice();
  await t.close();
  return { ...res, err };
}

let fails = 0;
for (const sc of SCENARIOS) {
  const a = await trace('game=../backup/v2/src_40_game.js', sc);
  const b = await trace(NEW, sc);
  const c = await trace(NEW, Object.assign({}, sc));          // same build again (determinism of the harness itself)
  const same = a.final === b.final && JSON.stringify(a.hashes) === JSON.stringify(b.hashes);
  const first = same ? -1 : a.hashes.findIndex((x, i) => x !== b.hashes[i]) * 50;
  const ok = same && b.final === c.final && !a.err.length && !b.err.length;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + sc.name + ' ' + FRAMES + ' frames: final hash old ' + a.final + ' new ' + b.final + (same ? '' : ' (first divergence near frame ' + first + ')') + (a.err.length || b.err.length ? ' errors ' + JSON.stringify(a.err.concat(b.err)) : ''));
  if (!ok) fails++;
}
// the cosmetic options must not change mechanics either: v2 default vs v2 with reducedMotion + quality 0
for (const sc of SCENARIOS.slice(0, 3)) {
  const run = async (opt) => {
    const t = await launch({ html: page(NEW), initScript: 'window.__opt = ' + JSON.stringify(opt) + ';' });
    await t.page.waitForFunction(() => !!window.__t);
    await t.page.evaluate(() => __t.freeze(true));
    const r = await t.page.evaluate(({ sc, frames }) => {
      const T = __t; Game.setOptions(window.__opt); T.start({ players: sc.players, level: sc.level, seed: sc.seed });
      let s = (sc.seed * 7919 + 17) >>> 0; const rnd = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; };
      const held = [{ left: false, right: false, jump: false, fire: false }, { left: false, right: false, jump: false, fire: false }];
      let x = 2166136261 >>> 0;
      for (let f = 0; f < frames; f++) {
        for (const hd of held) for (const k of ['left', 'right', 'jump', 'fire']) if (rnd() < 0.07) hd[k] = !hd[k];
        if (f % 600 === 200) { const kind = ['thunder', 'fire', 'water', 'bomb', 'clock', 'nibbler', 'crabbit'][Math.floor(rnd() * 7)]; Game.debug.spawn(kind, 40 + rnd() * 160, 40 + rnd() * 150); }
        T.tick(1, held); if (f % 3 === 0) T.render();
        const st = JSON.stringify(Game.debug.state()); for (let i = 0; i < st.length; i += 7) { x ^= st.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; }
        if (Game.isOver()) T.start({ players: sc.players, level: sc.level, seed: sc.seed + f });
      }
      return x;
    }, { sc, frames: Math.min(FRAMES, 2500) });
    const e = t.errors.slice(); await t.close(); return { r, e };
  };
  const a = await run({ reducedMotion: false, quality: 2 }), b = await run({ reducedMotion: true, quality: 0 }), c = await run({ reducedMotion: false, quality: 1 });
  const ok = a.r === b.r && a.r === c.r && !a.e.length && !b.e.length && !c.e.length;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + 'options are cosmetic: ' + sc.name + ' (q2/rm0 ' + a.r + ', q0/rm1 ' + b.r + ', q1 ' + c.r + ')');
  if (!ok) fails++;
}
console.log(fails ? 'FAILED ' + fails : 'ALL EQUIVALENCE CHECKS PASSED');
process.exit(fails ? 1 : 0);
