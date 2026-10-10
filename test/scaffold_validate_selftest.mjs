// Self-test for tools/validate_levels.mjs and src/00_shared.js (node only, no browser).
// Run: node test/scaffold_validate_selftest.mjs      (exit 1 on failure)
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { loadLevels, validateLevels, reachability } from '../tools/validate_levels.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + extra}`);
  if (!cond) failed++;
};

// ---------------------------------------------------------------- 00_shared.js
{
  const src = fs.readFileSync(path.join(ROOT, 'src/00_shared.js'), 'utf8');
  const mkCtx = (win) => {
    const ctx = vm.createContext({ window: win, console });
    return vm.runInContext(src + '\n;({C, U})', ctx);
  };
  const { C, U } = mkCtx({});
  check('C is frozen with contract values', Object.isFrozen(C) && C.W === 256 && C.H === 224 && C.MAP_Y === 16 && C.STORE_PREFIX === 'fizzpop.v1.');
  check('clamp/lerp/sign', U.clamp(5, 0, 3) === 3 && U.clamp(-1, 0, 3) === 0 && U.lerp(0, 10, 0.25) === 2.5 && U.sign(-4) === -1 && U.sign(0) === 0 && U.sign(2) === 1);
  check('approach', U.approach(0, 5, 2) === 2 && U.approach(4, 5, 2) === 5 && U.approach(5, 0, 2) === 3 && U.approach(1, 0, 5) === 0 && U.approach(3, 3, 1) === 3);
  check('overlap', U.overlap(0, 0, 10, 10, 5, 5, 10, 10) === true && U.overlap(0, 0, 10, 10, 10, 0, 5, 5) === false && U.overlap(0, 0, 10, 10, 20, 20, 1, 1) === false);
  const a = U.rng(42), b = U.rng(42), c = U.rng(43);
  const sa = Array.from({ length: 8 }, () => a.next()), sb = Array.from({ length: 8 }, () => b.next());
  check('rng deterministic', JSON.stringify(sa) === JSON.stringify(sb));
  check('rng differs per seed', c.next() !== sa[0]);
  const r = U.rng(7);
  let ok = true, minI = 99, maxI = -99, sum = 0;
  for (let i = 0; i < 20000; i++) {
    const n = r.next(); if (!(n >= 0 && n < 1)) ok = false;
    const k = r.int(3, 6); if (k < minI) minI = k; if (k > maxI) maxI = k;
    const f = r.float(2, 4); if (!(f >= 2 && f < 4)) ok = false;
    sum += n;
  }
  check('rng.next in [0,1), float in range', ok);
  check('rng.int inclusive both ends', minI === 3 && maxI === 6, `${minI}..${maxI}`);
  check('rng mean ~0.5', Math.abs(sum / 20000 - 0.5) < 0.02, String(sum / 20000));
  const arr = ['x', 'y', 'z'], seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(r.pick(arr));
  check('rng.pick covers array', seen.size === 3 && r.pick([]) === undefined);
  let hits = 0; for (let i = 0; i < 20000; i++) if (r.chance(0.25)) hits++;
  check('rng.chance(0.25) ~25%', Math.abs(hits / 20000 - 0.25) < 0.02, String(hits / 20000));
  check('rng.chance extremes', r.chance(0) === false && r.chance(1) === true);

  // store: working localStorage
  const mem = {};
  const ls = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } };
  const s1 = mkCtx({ localStorage: ls }).U.store;
  s1.set('scores', [{ name: 'AAA', score: 5 }]);
  check('store.set writes prefixed JSON', mem['fizzpop.v1.scores'] === '[{"name":"AAA","score":5}]');
  check('store.get reads back', JSON.stringify(s1.get('scores', null)) === '[{"name":"AAA","score":5}]');
  check('store.get fallback for missing key', s1.get('nope', 123) === 123);
  mem['fizzpop.v1.bad'] = '{not json';
  check('store.get survives corrupt JSON', s1.get('bad', 'fb') === 'fb');
  // store: localStorage throws on every access
  const boom = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const s2 = mkCtx({ localStorage: boom }).U.store;
  s2.set('muted', true);
  check('store falls back to memory when storage throws', s2.get('muted', false) === true && s2.get('other', 9) === 9);
  // store: accessing window.localStorage itself throws (sandboxed iframe)
  const w3 = {}; Object.defineProperty(w3, 'localStorage', { get() { throw new Error('SecurityError'); } });
  const s3 = mkCtx(w3).U.store;
  s3.set('k', { a: 1 });
  check('store works when window.localStorage getter throws', s3.get('k', null).a === 1);
}

// ---------------------------------------------------------------- validator
const clone = (x) => JSON.parse(JSON.stringify(x));
const stub = loadLevels(path.join(ROOT, 'test/stubs/levels_stub.js'));
{
  const rep = validateLevels(stub);
  check('stub levels: 30 rounds, 0 errors', rep.rounds.length === 30 && rep.errors === 0, JSON.stringify(rep.rounds.filter((r) => r.errors.length).map((r) => r.errors)));
}
const withMutation = (round, mutate) => {
  const L = clone(stub);
  mutate(L[round - 1]);
  const rep = validateLevels(L, { only: round });
  return rep.rounds[0];
};
const setCell = (lv, r, c, ch) => { lv.map[r] = lv.map[r].slice(0, c) + ch + lv.map[r].slice(c + 1); };
const hasErr = (res, re) => res.errors.some((e) => re.test(e));

check('detects wrong row count', hasErr(withMutation(1, (l) => l.map.pop()), /rows, expected 26/));
check('detects wrong row width', hasErr(withMutation(1, (l) => { l.map[3] += '.'; }), /33 chars/));
check('detects illegal char', hasErr(withMutation(1, (l) => setCell(l, 3, 5, 'X')), /illegal characters/));
check('detects missing outer wall', hasErr(withMutation(1, (l) => setCell(l, 10, 31, '.')), /outer wall/));
check('detects spawn pad blocked', hasErr(withMutation(1, (l) => setCell(l, 22, 4, '#')), /P1 pad/));
check('detects P2 pad floor missing', hasErr(withMutation(1, (l) => setCell(l, 25, 27, '.')), /P2 pad/));
check('detects floor gap without ceiling gap', hasErr(withMutation(2, (l) => { setCell(l, 25, 10, '.'); setCell(l, 25, 11, '.'); }), /no matching ceiling gap/));
check('detects 1-wide floor gap', hasErr(withMutation(2, (l) => { setCell(l, 25, 10, '.'); setCell(l, 0, 10, '.'); }), /only 1 tile wide/));
check('detects walker without ground', hasErr(withMutation(1, (l) => { l.enemies[0].r = 17; }), /needs solid ground|overlaps solid/));
check('detects enemy in wall', hasErr(withMutation(1, (l) => { l.enemies[0].c = 0; }), /leaves the playfield/));
check('detects unknown enemy', hasErr(withMutation(1, (l) => { l.enemies[0].t = 'dragon'; }), /unknown enemy type/));
check('detects bad d', hasErr(withMutation(1, (l) => { l.enemies[0].d = 0; }), /d must be/));
check('detects bad hurry', hasErr(withMutation(1, (l) => { l.hurry = 10; }), /hurry/));
check('detects bad special', hasErr(withMutation(5, (l) => { l.specials = ['ice']; }), /unknown special/));
check('detects air outside playfield', hasErr(withMutation(1, (l) => { l.air = [[40, 5]]; }), /outside the playfield/));
check('detects empty air', hasErr(withMutation(1, (l) => { l.air = []; }), /air must be/));
check('detects boss flag on non-boss round', hasErr(withMutation(3, (l) => { l.boss = true; }), /only allowed for round 30/));
check('detects bad boss round 30', hasErr(withMutation(30, (l) => { l.enemies = [{ t: 'nibbler', c: 4, r: 3, d: 1 }]; }), /kraken/));
check('detects missing thunder in round 30', hasErr(withMutation(30, (l) => { l.specials = []; }), /specials/));
check('detects LEVELS length', validateLevels(stub.slice(0, 29)).errors > 0);
check('warns on early enemy intro', withMutation(1, (l) => { l.enemies[0].t = 'crabbit'; }).warnings.some((w) => /before its introduction/.test(w)));

// Reachability: delete the lower platform stacks so a walker's platform floats > 5 tiles above anything.
{
  const res = withMutation(1, (l) => {
    // map A: remove platform rows 21 and 17 -> row 13 is 12 tiles above the floor
    for (const r of [21, 17]) for (let c = 2; c < 30; c++) setCell(l, r, c, '.');
    for (let c = 2; c < 30; c++) { setCell(l, 0, c, '#'); setCell(l, 25, c, '#'); }   // no wrap shortcut
    l.enemies = [{ t: 'nibbler', c: 9, r: 11, d: 1 }, { t: 'nibbler', c: 19, r: 11, d: -1 }, { t: 'nibbler', c: 4, r: 7, d: 1 }];
  });
  check('unreachable walker platform is an ERROR', hasErr(res, /NOT reachable/), JSON.stringify(res.errors));
  check('unreachable platforms reported as warnings', res.warnings.some((w) => /not reachable/.test(w)));
  check('reach percentage < 100 when unreachable', res.info.reachPct < 100, String(res.info.reachPct));
}
// Reachability on synthetic arenas.
{
  const blankRow = '##' + '.'.repeat(28) + '##';
  const arena = (platforms) => {
    const m = Array.from({ length: 26 }, () => blankRow);
    m[0] = '#'.repeat(32); m[25] = '#'.repeat(32);
    for (const [r, c0, c1] of platforms) {
      m[r] = m[r].slice(0, c0) + '#'.repeat(c1 - c0 + 1) + m[r].slice(c1 + 1);
    }
    return m;
  };
  const fully = (m) => { const r = reachability(m); return { ok: r.all.length > 0 && r.reach.size === r.all.length, r }; };
  check('4-high platform is reachable', fully(arena([[21, 14, 20]])).ok);
  check('5-high platform is reachable', fully(arena([[20, 14, 20]])).ok);
  check('6-high platform is NOT reachable (jump limit 5)', !fully(arena([[19, 14, 20]])).ok);
  const stair = arena([[21, 14, 20], [17, 20, 26], [13, 14, 20], [9, 8, 14]]);
  check('chain of 4-high steps is reachable', fully(stair).ok);
  // horizontal limit: platform B (row 17) is only reachable from platform A (row 21) by a jump
  const farMap = arena([[21, 8, 12], [17, 21, 26]]);
  const far = reachability(farMap);
  const farPos = far.all.filter((p) => p.s === 17);
  check('platform 8 tiles sideways from a 4-high step is NOT reachable', farPos.length > 0 && farPos.every((p) => !far.reach.has(p.s * 32 + p.c)));
  const nearMap = arena([[21, 8, 12], [17, 14, 20]]);
  const nearPos = reachability(nearMap);
  check('platform 2 tiles sideways from a 4-high step is reachable', nearPos.all.filter((p) => p.s === 17).every((p) => nearPos.reach.has(p.s * 32 + p.c)));
  // walk off an edge and drop to a lower pocket platform that no jump can reach
  const pocket = arena([[21, 22, 26], [17, 14, 24], [19, 8, 11]]);
  const pr = reachability(pocket);
  const lo = pr.all.filter((p) => p.s === 19 && p.c <= 11);
  check('pocket platform reached by walking off the edge above it', lo.length > 0 && lo.every((p) => pr.reach.has(p.s * 32 + p.c)));
  const noHi = arena([[21, 22, 26], [19, 8, 11]]);
  const nr = reachability(noHi);
  check('pocket platform unreachable without the platform above', nr.all.filter((p) => p.s === 19 && p.c <= 11).every((p) => !nr.reach.has(p.s * 32 + p.c)));
}

// Falling through a floor gap wraps to the top: only a platform below the ceiling gap is reachable that way.
{
  const open = Array.from({ length: 26 }, (_, r) => '##' + '.'.repeat(28) + '##');
  open[0] = '#'.repeat(32);
  open[25] = '#'.repeat(32);
  const base = open.slice();
  // ceiling gap + floor gap at cols 14..17, a high platform at row 5 (20 tiles above floor, unreachable by jumping)
  base[0] = '#'.repeat(14) + '.'.repeat(4) + '#'.repeat(14);
  base[25] = base[0];
  base[5] = '#'.repeat(2) + '.'.repeat(12) + '#'.repeat(8) + '.'.repeat(8) + '#'.repeat(2); // platform cols 14..21
  const r = reachability(base);
  const top = r.all.filter((p) => p.s === 5);
  check('platform 20 tiles up is reached by wrapping through the floor gap', top.length > 0 && top.every((p) => r.reach.has(p.s * 32 + p.c)), `${top.length}`);
  const noGap = base.slice(); noGap[25] = '#'.repeat(32); noGap[0] = '#'.repeat(32);
  const r2 = reachability(noGap);
  const top2 = r2.all.filter((p) => p.s === 5);
  check('same platform unreachable without floor gap', top2.length > 0 && top2.every((p) => !r2.reach.has(p.s * 32 + p.c)));
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
