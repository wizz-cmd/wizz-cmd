// QA (audio lens) -- phrase breathing / arrangement flatness metrics from the compiled scores (Node only).
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let src = ['00_shared.js', '20_audio.js'].map((f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8')).join('\n');
const sandbox = { console, setTimeout, setInterval, clearInterval, performance };
vm.createContext(sandbox);
vm.runInContext(src + '\n;globalThis.AUDIO = AUDIO;', sandbox);
const { AUDIO } = sandbox;
console.log('track      loopBars  lead steps sounding   rests>=4 steps   longest unbroken lead run (bars)   notes/s   distinct pitches   longest note (steps)');
for (const n of ['stage1', 'stage2', 'boss', 'title', 'entry', 'ending']) {
  const d = AUDIO._dump(n), info = AUDIO._info(n);
  const L = d.lead.slice().sort((a, b) => a.s - b.s);
  const start = info.loopStart, end = info.steps;
  const sounding = new Array(end).fill(false);
  for (const x of L) for (let k = 0; k < x.n; k++) sounding[x.s + k] = true;
  let on = 0; for (let s = start; s < end; s++) if (sounding[s]) on++;
  // rests >= 4 steps
  let rests = 0, run = 0, longestRun = 0, curRun = 0;
  for (let s = start; s < end; s++) { if (!sounding[s]) { run++; if (curRun) { longestRun = Math.max(longestRun, curRun); curRun = 0; } } else { if (run >= 4) rests++; run = 0; curRun++; } }
  longestRun = Math.max(longestRun, curRun);
  const loopNotes = L.filter((x) => x.s >= start);
  const nps = loopNotes.length / info.loopSeconds;
  const pitches = new Set(loopNotes.map((x) => x.m % 12)).size;
  const longest = Math.max(...loopNotes.map((x) => x.n));
  console.log(`${n.padEnd(9)}  ${String((end - start) / 16).padStart(3)}      ${(100 * on / (end - start)).toFixed(0).padStart(3)}%                 ${String(rests).padStart(3)}              ${(longestRun / 16).toFixed(1).padStart(5)}                      ${nps.toFixed(1).padStart(5)}      ${pitches}             ${longest}`);
}
