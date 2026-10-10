// FIZZ & POP — test/levels_wave3_real.mjs
// Behaviour checks of the wave-3 level fixes with the REAL game (dist/fizzpop.html, or --html / FIZZ_HTML):
//   A. R16 slab rooms: a Nibbler put on either row-5 slab walks off an end like on any other platform. Before wave 3 the stalactites
//      walled both slabs in and every walker was held until the walker watchdog fired (~480 frames, 100 % of the runs); now the median is
//      ~1.2x that of the open row-9 slab of the same round (it was 2.6-2.9x).
//   B. R19 springle corners: with nobody to chase (pure geometry) a Springle started anywhere on the bottom half never stays inside a
//      28 px box for 300+ frames. Before wave 3 both Springles ping-ponged between the wall and the plank end of a bottom corner for
//      377 frames in every seed.
//   node test/levels_wave3_real.mjs [--html file] [--quick]        exit code 1 when a check fails
import { launch, fp } from '../tools/harness.mjs';
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const html = arg('--html', process.env.FIZZ_HTML || undefined);
const QUICK = args.includes('--quick');

// ---- A: walkers on the R16 slabs ---------------------------------------------------------------------------------------------
function slabSim(level, row, cols, seeds, frames) {
  const D = fz.Game.debug, out = [];
  for (const c of cols) for (const d of [-1, 1]) for (const seed of seeds) {
    fz.start(1, level, seed); D.skipIntro(); D.clearEnemies(); D.noClear(true); D.god(true); D.setHurryTimer(-1e7);
    const S = D._S(); S.puT = -1; S.specialT = 1e9; S.letterT = 1e9;
    D.spawn('nibbler', c * 8, row * 8); const e = S.enemies[S.enemies.length - 1]; e.d = d;
    const P0 = S.players[0]; let t = null;
    for (let f = 0; f < frames; f++) {
      P0.state = 'dying'; P0.dieT = -1e9; P0.y = 400; fz.step(1);                        // nobody to chase: pure geometry + the walker's own ledge dice
      if ((e.y > (row + 1) * 8 + 4 && !e.onGround) || e.y > (row + 2) * 8) { t = f; break; }   // fell past the wing of the slab = left it
    }
    out.push(t === null ? frames : t);
  }
  return out;
}
// ---- B: springles in the R19 corners -----------------------------------------------------------------------------------------
function cornerSim(level, seed, frames) {
  const D = fz.Game.debug;
  fz.start(1, level, seed); D.god(true); D.noClear(true); D.skipIntro();
  const S = D._S(), P0 = S.players[0];
  const tr = S.enemies.filter((e) => e.t === 'springle').map((e) => ({ e, x: e.x, y: e.y, since: 0, worst: 0, at: null }));
  for (let i = 0; i < frames; i++) {
    S.hurryT = 0; P0.state = 'dying'; P0.dieT = -1e9; P0.y = 400; fz.step(1);
    for (const a of tr) {
      if (a.e.dead) continue;
      if (Math.abs(a.e.x - a.x) > 28 || Math.abs(a.e.y - a.y) > 28) { a.x = a.e.x; a.y = a.e.y; a.since = i; }
      if (i - a.since > a.worst) { a.worst = i - a.since; a.at = [Math.round(a.x), Math.round(a.y)]; }
    }
  }
  return tr.map((a) => ({ worst: a.worst, at: a.at }));
}

const t = await launch(html ? { html } : {});
const g = fp(t.page); await g.freeze(true);
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? 'ok    ' : 'FAIL  ') + msg); };
const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
const seeds = Array.from({ length: QUICK ? 10 : 16 }, (_, i) => i + 1);

// The walker's ledge dice are seeded, so every start of one seed rolls the same dice: compare against an open slab of the same round (row 9,
// cols 14-17) on the SAME seeds instead of an absolute time. Old data: 2.6-2.9x the reference and every run > 360 f; now ~1.2x.
const ref = await t.page.evaluate(`(${slabSim.toString()})(16, 9, [15], ${JSON.stringify(seeds)}, 1200)`);
const refMed = med(ref), refOver = ref.filter((x) => x > 360).length;
for (const [name, row, c] of [['left slab (cols 8-12)', 5, 10], ['right slab (cols 19-23)', 5, 21]]) {
  const r = await t.page.evaluate(`(${slabSim.toString()})(16, ${row}, [${c}], ${JSON.stringify(seeds)}, 1200)`);
  const over = r.filter((x) => x > 360).length;
  check(med(r) <= 1.6 * refMed && over <= refOver + 0.15 * r.length,
    `R16 ${name}: a Nibbler leaves in a median ${med(r)} f (open reference slab, row 9: ${refMed} f; allowed <= ${Math.round(1.6 * refMed)}), ${over}/${r.length} need > 360 f (reference ${refOver}/${ref.length}; allowed <= ${refOver + Math.floor(0.15 * r.length)})`);
}

for (const L of [19]) {
  const hits = [];
  for (const seed of QUICK ? [3, 11, 29] : [3, 11, 29, 5, 7, 13]) {
    const r = await t.page.evaluate(`(${cornerSim.toString()})(${L}, ${seed}, 3500)`);
    for (const x of r) if (x.worst >= 300) hits.push(`s${seed} ${x.worst}f@${x.at}`);
  }
  check(hits.length === 0, `R${L} springles: never confined >= 300 f in a 28 px box (no player, ${QUICK ? 3 : 6} seeds x 3500 f)${hits.length ? ': ' + hits.join('; ') : ''}`);
}
check(t.errors.length === 0, 'no page errors' + (t.errors.length ? ': ' + t.errors.join(' | ') : ''));
await t.close();
console.log(bad ? `\n${bad} check(s) FAILED` : '\nall wave-3 behaviour checks passed');
process.exit(bad ? 1 : 0);
