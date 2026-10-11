// FIZZ & POP v2.0 - the ONE advisory "perf" step of test/e2e_all.sh (FIXPLAN_V3 "Release-gate policy").
//
// Everything that gates on wall-clock time or on the CPU share of a live context on this shared 4-core CPU-raster VM lives here instead of in the blocking run:
//   * every timing suite runs UNCHANGED (FP_TIMING unset = strict thresholds, the very checks that the blocking run only prints as "ADVISORY"), up to 3 attempts, the first clean attempt
//     counts ("best of 3"), otherwise the attempt with the fewest misses is the one reported;
//   * the real-frame-time budget report (test/v3_budgets_real.mjs) is re-run and compared with the recorded baseline (out/v3/regress/budgets_real_base.json): a regression > 25 % that shows
//     in EVERY run (up to 3) is reported as a FINDING; a number that is only bad once is noise.
// Nothing here ever fails the release gate: the exit code is always 0 (1 only when the runner itself breaks); the numbers and findings are printed and written to out/e2e/perf_report.json.
//
// Usage: node test/e2e_perf.mjs [--only substr[,substr]] [--no-budgets] [--budgets-only] [--attempts 3]
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);
const args = process.argv.slice(2);
const argVal = (k, d) => (args.indexOf(k) >= 0 ? args[args.indexOf(k) + 1] : d);
const ATTEMPTS = Math.max(1, +argVal('--attempts', 3));
const ONLY = argVal('--only', '') ? argVal('--only', '').split(',') : null;
const OUT = path.join(ROOT, 'out', 'e2e', 'perf');
fs.mkdirSync(OUT, { recursive: true });

// [label, env, command...]   (env: extra variables for this job; FP_TIMING is always removed = strict)
const JOBS = [
  ['gfx   v2_gfxcore_test (draw/text/postFX/levelCanvas/logo budgets)', {}, 'node', 'test/v2_gfxcore_test.mjs', '--cast'],
  ['gfx   v2_gfxcore_rebake (frame times after k steps, warm-up under load)', {}, 'node', 'test/v2_gfxcore_rebake.mjs'],
  ['gfx   v2_gfxcore_v3 (particle chain frame, hero bake slice)', {}, 'node', 'test/v2_gfxcore_v3.mjs'],
  ['gfx   v2_cast_test (bake times)', {}, 'node', 'test/v2_cast_test.mjs'],
  ['gfx   v2_neon_test (scene/neon/glow costs)', {}, 'node', 'test/v2_neon_test.mjs'],
  ['gfx   gfx_bg (background build cost)', {}, 'node', 'test/gfx_bg.mjs'],
  ['gfx   gfx_perf (init, draw, text, bake-all)', {}, 'node', 'test/gfx_perf.mjs'],
  ['audio audio_cpu (dense demo: offline / live / main-thread share)', {}, 'node', 'test/audio_cpu.mjs'],
  ['audio audio_cpu_sections (every section, pass 0)', {}, 'node', 'test/audio_cpu_sections.mjs'],
  ['audio audio_cpu_sections --pass 1 (alt passes)', {}, 'node', 'test/audio_cpu_sections.mjs', '--pass', '1'],
  ['audio audio_v3_mix (duck recovery time)', {}, 'node', 'test/audio_v3_mix.mjs', '--ctx', 'stage1_D2,stage2_D2,boss_F'],
  ['game  game_tests 22j/22k stubs (update/render cost, soak)', {}, 'node', 'test/game_tests.mjs', '22j', '22k'],
  ['game  game_tests 22j/22k REAL (update/render cost, soak)', { REAL: '1' }, 'node', 'test/game_tests.mjs', '22j', '22k'],
  ['main  main_tests loop (stub tick+render)', { ONLY_GROUPS: 'loop' }, 'node', 'test/main_tests.mjs'],
  ['main  main_v2 loading-and-boot (boot at 4x)', { ONLY_GROUPS: 'loading-and-boot' }, 'node', 'test/main_v2.mjs'],
  ['main  main_v3_perf (ladder, static-scene rates, calibration, phone 4x, ending cost)', {}, 'node', 'test/main_v3_perf.mjs'],
  ['e2e   e2e_smoke perf + soak (frame cost, 60 updates/s)', {}, 'node', 'test/e2e_smoke.mjs', '--only', 'perf,soak'],
  ['e2e   e2e_budgets desktop,phone,boot,hitch (SPEC_V2 section 5)', {}, 'node', 'test/e2e_budgets.mjs', '--only=desktop,phone,boot,hitch'],
];

function run(cmd, env, logFile) {
  return new Promise((resolve) => {
    const e = { ...process.env, ...env }; delete e.FP_TIMING;
    const log = fs.createWriteStream(logFile);
    const p = spawn(cmd[0], cmd.slice(1), { cwd: ROOT, env: e });
    p.stdout.pipe(log, { end: false }); p.stderr.pipe(log, { end: false });
    p.on('close', (code) => { log.end(); resolve(code); });
    p.on('error', () => { log.end(); resolve(127); });
  });
}
const slug = (s) => s.replace(/\(.*$/, '').trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
const NUM = /\b(INFO|ADVISORY|MISS|FAIL|PROBLEM)\b|dense demo|throughput|init ms|step = update|soak:|k steps|boot to the first|^perf |OFFLINE render|MAIN THREAD|busy|fps|ms\/frame/i;
const keyLines = (file, n = 6) => {
  let txt = ''; try { txt = fs.readFileSync(file, 'utf8'); } catch (e) { return []; }
  const lines = txt.split('\n').filter((l) => NUM.test(l)).map((l) => l.trim().replace(/\s+/g, ' ').slice(0, 230));
  const bad = lines.filter((l) => /\b(FAIL|MISS|PROBLEM)\b/.test(l));
  return (bad.length ? bad : lines).slice(0, n);
};
const report = { when: new Date().toISOString(), jobs: [], budgets: null };
const fmtS = (ms) => (ms / 1000).toFixed(0) + ' s';

if (!args.includes('--budgets-only')) {
  console.log(`=== perf suites (strict thresholds, best of ${ATTEMPTS}, advisory)`);
  for (const [label, env, ...cmd] of JOBS) {
    if (ONLY && !ONLY.some((s) => label.includes(s))) continue;
    const tries = [];
    for (let a = 1; a <= ATTEMPTS; a++) {
      const t0 = Date.now(), file = path.join(OUT, `${slug(label)}.${a}.log`);
      const code = await run(cmd, env, file);
      const txt = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      tries.push({ a, code, ms: Date.now() - t0, file, misses: (txt.match(/\b(FAIL|MISS|PROBLEM)\b/g) || []).length });
      if (code === 0) break;
    }
    const clean = tries.find((t) => t.code === 0), best = clean || tries.slice().sort((x, y) => x.misses - y.misses)[0];
    const row = { label, ok: !!clean, attempt: best.a, attempts: tries.length, secs: Math.round(best.ms / 1000), log: path.relative(ROOT, best.file), key: keyLines(best.file) };
    report.jobs.push(row);
    console.log(`    ${row.ok ? 'ok    ' : 'MISS  '}${label}  [${row.ok ? `attempt ${row.attempt}/${ATTEMPTS}` : `${tries.length} attempts, best had ${best.misses} miss lines`}, ${fmtS(best.ms)}]`);
    if (!row.ok) for (const l of row.key) console.log('        | ' + l);
  }
}

// ---------------------------------------------------------------- real-frame-time budgets vs the recorded baseline
const BASE = path.join(ROOT, 'out', 'v3', 'regress', 'budgets_real_base.json');
const PCT = 25;                                     // a regression above this, in EVERY run, is a finding
const worse = (cur, base, { hi, floor }) => {       // hi: higher is worse; floor: absolute difference below which a ratio means nothing
  if (cur === null || cur === undefined || base === null || base === undefined) return false;
  const d = hi ? cur - base : base - cur;
  return d > Math.abs(base) * PCT / 100 && d >= floor;
};
function metrics(rep) {                              // flat {name: [value, {hi, floor}]}
  const m = {}, S = rep.sections || {};
  for (const [k, v] of Object.entries(S.desk || {})) { m[`desk ${k} fps`] = [v.fps, { hi: false, floor: 3 }]; m[`desk ${k} p95 ms`] = [v.p95, { hi: true, floor: 2 }]; m[`desk ${k} frames>50ms`] = [v.over50, { hi: true, floor: 3 }]; m[`desk ${k} main busy %`] = [v.mainThreadBusyPct, { hi: true, floor: 8 }]; }
  const p = S.phone || {};
  if (p.after) { m['phone6x after 3s fps'] = [p.after.fps, { hi: false, floor: 4 }]; m['phone6x after 3s p95 ms'] = [p.after.p95, { hi: true, floor: 8 }]; m['phone6x after 3s frames>100ms'] = [p.after.over100, { hi: true, floor: 4 }]; }
  if (p.first3) m['phone6x first 3s fps'] = [p.first3.fps, { hi: false, floor: 1 }];
  if (p.boot) m['phone6x boot ms'] = [p.boot.bootMs, { hi: true, floor: 150 }];
  const h = S.hitch || {};
  if (h.all) { m['k-change worst gap ms'] = [h.worstGap, { hi: true, floor: 30 }]; m['k-change frames>50ms'] = [h.all.over50, { hi: true, floor: 3 }]; m['k-change p95 ms'] = [h.all.p95, { hi: true, floor: 2 }]; }
  for (const [k, v] of Object.entries(S.static || {})) if (v && typeof v === 'object') m[`static ${k} main busy %`] = [v.busyPct, { hi: true, floor: 8 }];
  if (S.boot) m['boot 4x median ms'] = [S.boot.median, { hi: true, floor: 100 }];
  return m;
}
if (!args.includes('--no-budgets') && !ONLY) {
  console.log('\n=== real-frame-time budgets vs the recorded baseline (out/v3/regress/budgets_real_base.json), regression threshold ' + PCT + ' %');
  const base = JSON.parse(fs.readFileSync(BASE, 'utf8')), bm = metrics(base);
  const runs = [];
  let flagged = null;
  for (let a = 1; a <= 3; a++) {
    const tag = 'e2e_perf' + a, file = path.join(OUT, `budgets_real.${a}.log`);
    const only = flagged ? [...new Set([...flagged].map((n) => (n.startsWith('desk') ? 'desk' : n.startsWith('phone') ? 'phone' : n.startsWith('k-change') ? 'hitch' : n.startsWith('static') ? 'static' : 'boot')))].join(',') : '';
    const code = await run(['node', 'test/v3_budgets_real.mjs', '--tag', tag, ...(only ? ['--only', only] : [])], {}, file);
    const jf = path.join(ROOT, 'out', 'v3', 'regress', `budgets_real_${tag}.json`);
    if (code !== 0 || !fs.existsSync(jf)) { console.log(`    run ${a}: the budget script itself failed (code ${code}), see ${path.relative(ROOT, file)}`); break; }
    const cm = metrics(JSON.parse(fs.readFileSync(jf, 'utf8')));
    const bad = new Map();
    for (const [name, [cur, rule]] of Object.entries(cm)) { const b = bm[name]; if (b && (!flagged || flagged.has(name)) && worse(cur, b[0], rule)) bad.set(name, { cur, base: b[0] }); }
    runs.push({ a, only: only || 'all', regressions: Object.fromEntries(bad), metrics: Object.fromEntries(Object.entries(cm).map(([k, v]) => [k, v[0]])) });
    console.log(`    run ${a}${only ? ' (re-check of: ' + only + ')' : ''}: ${bad.size ? bad.size + ' metric(s) worse than the baseline by > ' + PCT + ' %' : 'no metric worse than the baseline by > ' + PCT + ' %'}`);
    for (const [n, v] of bad) console.log(`        | ${n}: ${v.cur} vs baseline ${v.base}`);
    if (!bad.size) break;
    flagged = new Set(bad.keys());
  }
  const last = runs[runs.length - 1], consistent = runs.length === 3 && last && Object.keys(last.regressions).length ? Object.keys(last.regressions) : [];
  report.budgets = { runs, consistentRegressions: consistent };
  console.log(consistent.length ? `    FINDING: ${consistent.length} metric(s) regressed by > ${PCT} % against the baseline in all 3 runs: ${consistent.join('; ')}` : '    no consistent regression > ' + PCT + ' % against the baseline');
}

// ---------------------------------------------------------------- summary
const nOk = report.jobs.filter((j) => j.ok).length;
console.log(`\nperf (advisory): ${nOk}/${report.jobs.length} timing suites within their bars (best of ${ATTEMPTS})${report.budgets ? '; budget findings: ' + report.budgets.consistentRegressions.length : ''}`);
for (const j of report.jobs) if (j.key && j.key.length && j.ok) console.log(`    ${j.label.split('(')[0].trim()}:\n        ${j.key.slice(0, 3).join('\n        ')}`);
fs.writeFileSync(path.join(ROOT, 'out', 'e2e', 'perf_report.json'), JSON.stringify(report, null, 1));
process.exit(0);
