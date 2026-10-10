// FIZZ & POP -- wave-2 integration: re-run the wave-1 QA repro scripts against the CURRENT dist/fizzpop.html and file their output.
//
//   node test/e2e_qa_sweep.mjs [--jobs 3] [--timeout 600] [--serial-only] [pattern ...]
//
// Every test/qa_*.mjs whose name contains one of the patterns (default: all) is run from a temporary copy in which the wave-1
// evidence folder (out/qa) is redirected to out/wave2/qa_run, so the QA evidence of wave 1 stays untouched.
// Output of each script: out/wave2/qa/<name>.txt (stdout+stderr, exit code on the last line); summary: out/wave2/qa/_summary.json.
// Timing sensitive scripts (perf / soak / cadence / jank / cpu / profile) run one at a time AFTER the parallel batch.
// The sweep does not judge results: most QA scripts print numbers or "BUG_REPRODUCED=..." lines. It reports exit codes,
// console/page errors and BUG_REPRODUCED=true lines so a human (or the integration engineer) can read the tails.
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const JOBS = +opt('--jobs', 3), TIMEOUT = +opt('--timeout', 600) * 1000;
const SERIAL_ONLY = argv.includes('--serial-only');
const skipVals = new Set(['--jobs', '--timeout']);
const patterns = argv.filter((a, i) => !a.startsWith('--') && !skipVals.has(argv[i - 1]));
const OUT = path.join(ROOT, 'out', 'wave2', 'qa');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.join(ROOT, 'out', 'wave2', 'qa_run'), { recursive: true });
// mirror the wave-1 evidence folder TREE (directories only) so scripts that write into out/qa/<area>/<sub>/ find their folders
const mirror = (from, to) => { if (!fs.existsSync(from)) return; for (const e of fs.readdirSync(from, { withFileTypes: true })) if (e.isDirectory()) { fs.mkdirSync(path.join(to, e.name), { recursive: true }); mirror(path.join(from, e.name), path.join(to, e.name)); } };
mirror(path.join(ROOT, 'out', 'qa'), path.join(ROOT, 'out', 'wave2', 'qa_run'));

let names = fs.readdirSync(path.join(ROOT, 'test')).filter((f) => /^qa_.*\.mjs$/.test(f)).map((f) => f.replace(/\.mjs$/, ''));
// libs / helpers that are not runnable on their own
names = names.filter((n) => !/_lib$|_report$|^qa_balance_(bot|botlib)/.test(n));
if (patterns.length) names = names.filter((n) => patterns.some((p) => n.includes(p)));
const isSerial = (n) => /perf|soak|cadence|jank|cpu|profile|alloc|canvasleak|canvasmem/.test(n);
const parallel = SERIAL_ONLY ? [] : names.filter((n) => !isSerial(n));
const serial = names.filter(isSerial);

function runOne(name) {
  return new Promise((resolve) => {
    const src = fs.readFileSync(path.join(ROOT, 'test', name + '.mjs'), 'utf8')
      .replace(/out\/qa/g, 'out/wave2/qa_run')
      .replace(/'out',\s*'qa'/g, "'out', 'wave2', 'qa_run'");
    const tmp = path.join(ROOT, 'test', `_w2_${name}.mjs`);
    fs.writeFileSync(tmp, src);
    const t0 = Date.now();
    const p = spawn('node', [tmp], { cwd: ROOT, env: { ...process.env } });
    let buf = '';
    p.stdout.on('data', (d) => { buf += d; }); p.stderr.on('data', (d) => { buf += d; });
    let killed = false;
    const kt = setTimeout(() => { killed = true; p.kill('SIGKILL'); }, TIMEOUT);
    p.on('close', (code) => {
      clearTimeout(kt);
      fs.rmSync(tmp, { force: true });
      const sec = Math.round((Date.now() - t0) / 1000);
      fs.writeFileSync(path.join(OUT, name + '.txt'), buf + `\n[exit ${killed ? 'TIMEOUT' : code}] ${sec}s\n`);
      const errLines = buf.split('\n').filter((l) => /pageerror|console error|\[error\]|Uncaught|TypeError|ReferenceError/i.test(l)).slice(0, 3);
      const bug = buf.split('\n').filter((l) => /BUG_REPRODUCED\s*[=:]\s*true/i.test(l)).slice(0, 2);
      resolve({ name, code: killed ? 'TIMEOUT' : code, sec, errLines, bug });
    });
  });
}

const results = [];
async function pool(list) {
  let i = 0;
  const worker = async () => { while (i < list.length) { const n = list[i++]; const r = await runOne(n); results.push(r); console.log(`${String(r.code).padEnd(7)} ${String(r.sec).padStart(4)}s  ${r.name}${r.bug.length ? '   <<< BUG_REPRODUCED=true' : ''}${r.errLines.length ? '   <<< errors: ' + r.errLines[0].slice(0, 100) : ''}`); } };
  await Promise.all(Array.from({ length: Math.max(1, JOBS) }, worker));
}
console.log(`sweep: ${parallel.length} parallel + ${serial.length} serial scripts, ${JOBS} jobs, timeout ${TIMEOUT / 1000}s`);
await pool(parallel);
for (const n of serial) await pool([n]);
fs.writeFileSync(path.join(OUT, '_summary.json'), JSON.stringify(results, null, 1));
const bad = results.filter((r) => r.code !== 0);
console.log(`\n${results.length} scripts, ${bad.length} with a non-zero exit: ${bad.map((r) => r.name + '(' + r.code + ')').join(' ')}`);
