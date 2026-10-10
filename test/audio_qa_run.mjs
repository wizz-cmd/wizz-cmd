// FIZZ & POP — test/audio_qa_run.mjs
// Re-runs one of the wave-1 QA audio scripts (test/qa_audio_<name>.mjs) against the CURRENT src/20_audio.js on the bare audio host
// page (test/audio_qa_page.html) instead of dist/fizzpop.html, with its output redirected to out/fix/audio_qa/ (the QA evidence in
// out/qa/ stays untouched).  Scripts that need the whole game (flow / pearl / fault / jank / chain ...) must be run as they are.
// Usage: node test/audio_qa_run.mjs masking|measure|pump|dynamics|bossdie [args...]        (bare audio host page)
//        node test/audio_qa_run.mjs --dist flow|pearl|fault|jank|chain|... [args...]       (real game, dist/fizzpop.html)
//        node test/audio_qa_run.mjs --dist qa_codereview_pause_jingle                      (a full script name works too)
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const dist = argv[0] === '--dist';
if (dist) argv.shift();
const [name, ...rest] = argv;
const src = path.join(ROOT, 'test', name && name.startsWith('qa_') ? `${name}.mjs` : `qa_audio_${name}.mjs`);
if (!name || !fs.existsSync(src)) { console.error('usage: node test/audio_qa_run.mjs [--dist] <masking|measure|pump|dynamics|bossdie|flow|...> [args]'); process.exit(2); }
const OUT = path.join(ROOT, 'out', 'fix', 'audio_qa');
fs.mkdirSync(OUT, { recursive: true });
let code = fs.readFileSync(src, 'utf8');
if (!dist) code = code.replace(/launch\(\{\}\)/g, `launch({ html: ${JSON.stringify(path.join(ROOT, 'test', 'audio_qa_page.html'))} })`);
code = code.replace(/path\.join\(PROJECT, 'out', 'qa', 'audio'\)/g, JSON.stringify(OUT)).replace(/path\.join\(ROOT, 'out', 'qa', 'audio'\)/g, JSON.stringify(OUT));
const tmp = path.join(ROOT, 'test', `_audio_qa_tmp_${name}.mjs`);
fs.writeFileSync(tmp, code);
try {
  const r = spawnSync('node', [tmp, ...rest], { stdio: 'inherit' });
  process.exitCode = r.status || 0;
} finally { fs.rmSync(tmp, { force: true }); }
