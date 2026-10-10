// QA (audio lens) -- rhythmic template reuse across tracks (Node only).
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = ['00_shared.js', '20_audio.js'].map((f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8')).join('\n');
const sandbox = { console, setTimeout, setInterval, clearInterval, performance };
vm.createContext(sandbox); vm.runInContext(src + '\n;globalThis.AUDIO = AUDIO;', sandbox);
const { AUDIO } = sandbox;
const all = {}; const per = {};
for (const n of ['stage1', 'stage2', 'boss', 'title', 'entry', 'ending']) {
  const d = AUDIO._dump(n), info = AUDIO._info(n);
  per[n] = {};
  for (let b = info.loopStart / 16; b < info.steps / 16; b++) {
    const notes = d.lead.filter((x) => x.s >= b * 16 && x.s < b * 16 + 16);
    const r = notes.map((x) => (x.s - b * 16) + ':' + x.n).join(' ');
    all[r] = (all[r] || 0) + 1; per[n][r] = (per[n][r] || 0) + 1;
  }
}
const top = Object.entries(all).sort((a, b) => b[1] - a[1]).slice(0, 6);
const total = Object.values(all).reduce((a, b) => a + b, 0);
console.log('total loop bars across 6 loops:', total, ' distinct lead rhythms:', Object.keys(all).length);
for (const [r, c] of top) console.log(`  ${String(c).padStart(3)} bars  (${(100 * c / total).toFixed(0)}%)  ${r}   in: ` + Object.entries(per).filter(([, v]) => v[r]).map(([k, v]) => `${k}x${v[r]}`).join(' '));
const t6 = '0:6 6:2 8:4 12:4'; const t8 = '0:2 2:2 4:2 6:2 8:2 10:2 12:2 14:2';
console.log(`6-2-4-4 cell: ${all[t6] || 0} bars; straight 8ths (2x8): ${all[t8] || 0} bars`);
