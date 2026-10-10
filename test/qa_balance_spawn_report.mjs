// QA balance lens: summarise spawn.json files. Times in seconds after READY! (play start) unless noted.
import fs from 'fs'; import path from 'path';
import { OUT, LEVELS } from './qa_balance_lib.mjs';
const all = [];
for (const f of fs.readdirSync(OUT).filter((x) => /^spawn_\d+\.json$/.test(x))) all.push(...JSON.parse(fs.readFileSync(path.join(OUT, f))));
all.sort((a, b) => a.lv - b.lv || a.pad - b.pad);
const q = (a, p) => { a = a.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
const s = (f) => f === null || f === undefined ? '  -  ' : (f / 60).toFixed(1).padStart(5);
console.log('rnd pad hurry | first non-ghost hit after READY (s): min / median | who | eps60s(enemy) projEps camp(s within48) | ghost first (s, abs)');
for (const d of all) {
  const hurry = LEVELS[d.lv - 1].hurry;
  const firstHit = d.runs.map((r) => { const a = [r.first.enemy, r.first.proj].filter((v) => v !== null); return a.length ? Math.min(...a) - r.playStart : null; });
  const fh = firstHit.filter((v) => v !== null);
  const who = d.runs.map((r) => (r.first.enemy !== null && (r.first.proj === null || r.first.enemy <= r.first.proj)) ? r.firstEnemyType[0] : r.first.proj !== null ? r.firstProjType[0].toUpperCase() : '-').join('');
  const eps = d.runs.reduce((a, r) => a + r.eps.enemy, 0) / d.runs.length, pe = d.runs.reduce((a, r) => a + r.eps.proj, 0) / d.runs.length;
  const camp = d.runs.reduce((a, r) => a + r.camp, 0) / d.runs.length / 60;
  const gh = d.runs.map((r) => r.first.ghost).filter((v) => v !== null);
  console.log(String(d.lv).padStart(2), d.pad, String(hurry).padStart(4), '|', s(fh.length ? Math.min(...fh) : null), '/', s(fh.length ? q(fh, 0.5) : null), (fh.length < d.runs.length ? ` (${d.runs.length - fh.length} runs never)` : '').padEnd(16), who.padEnd(9), '|', eps.toFixed(1).padStart(5), pe.toFixed(1).padStart(4), camp.toFixed(1).padStart(5), '|', gh.length ? s(Math.min(...gh)) : '  -  ');
}
