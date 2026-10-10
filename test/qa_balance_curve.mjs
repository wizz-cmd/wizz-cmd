// QA balance lens (f): difficulty-curve table = LEVELS data + bot clear times (out/qa/balance/clear_*.json) + idle pad rush (spawn_*.json)
import fs from 'fs'; import path from 'path';
import { OUT, LEVELS } from './qa_balance_lib.mjs';
const clear = {}; for (const f of fs.readdirSync(OUT).filter((x) => /^clear_\d+_p1\.json$/.test(x))) for (const r of JSON.parse(fs.readFileSync(path.join(OUT, f)))) (clear[r.level] ||= []).push(r);
const spawn = {}; for (const f of fs.readdirSync(OUT).filter((x) => /^spawn_\d+\.json$/.test(x))) for (const d of JSON.parse(fs.readFileSync(path.join(OUT, f)))) spawn[d.lv + '_' + d.pad] = d;
const med = (a) => { a = a.slice().sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
const W = { nibbler: 1.0, crabbit: 1.3, jellop: 1.6, springle: 1.5, glimmer: 1.4 };
console.log('R   n  mix                          threat trapT  hurry  angry px/f nib/jel/spr  bot clear med/max  hurry/med  contacts/run  escapes/run  idle-pad first hit P1/P2 (s)  specials');
for (let r = 1; r <= 30; r++) {
  const L = LEVELS[r - 1]; const cnt = {}; L.enemies.forEach((e) => cnt[e.t] = (cnt[e.t] || 0) + 1);
  const mix = Object.entries(cnt).map(([k, v]) => k.slice(0, 3) + v).join(' ');
  const scale = 1 + Math.min(0.3, 0.01 * (r - 1)); const threat = L.enemies.reduce((a, e) => a + (W[e.t] || 3), 0) * scale;
  const trapT = Math.max(240, 480 - 8 * (r - 1));
  const ang = (k) => (k * scale * 1.6).toFixed(2);
  const c = clear[r]; let bm = '-', ratio = '-', cont = '-', esc = '-';
  if (c && r < 30) { const ts = c.map((x) => x.clearAt).filter((v) => v !== null).map((v) => v / 60); bm = med(ts).toFixed(1) + '/' + Math.max(...ts).toFixed(1); ratio = (L.hurry / med(ts)).toFixed(1); cont = (c.reduce((a, x) => a + x.contacts.enemy + x.contacts.proj, 0) / c.length).toFixed(1); esc = (c.reduce((a, x) => a + x.escapes, 0) / c.length).toFixed(1); }
  const fh = (pad) => { const d = spawn[r + '_' + pad]; if (!d) return '-'; const v = d.runs.map((x) => [x.first.enemy, x.first.proj].filter((q) => q !== null)).map((a) => a.length ? Math.min(...a) - 150 : null).filter((q) => q !== null); return v.length ? (med(v) / 60).toFixed(1) : 'never'; };
  console.log(String(r).padStart(2), String(L.enemies.length).padStart(2), mix.padEnd(28), threat.toFixed(1).padStart(5), String(trapT).padStart(5), String(L.hurry).padStart(5), ' ', (ang(0.6) + '/' + (Math.hypot(0.6 * scale * 1.6, 0.6 * scale * 1.6)).toFixed(2) + '/' + ang(0.8)).padEnd(16), bm.padStart(10), ratio.padStart(8), cont.padStart(8), esc.padStart(8), (fh(1) + '/' + fh(2)).padStart(14), '  ', L.specials.join(',') || '-');
}
