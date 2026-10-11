// Variant builder: applies exact-once string edits to a COPY of dist/fizzpop.html (never touches src/ or dist/).
import fs from 'fs';
import path from 'path';
import { HTML, OUT } from './qa_v2_perf_lib.mjs';
export const VDIR = path.join(OUT, 'variants');
fs.mkdirSync(VDIR, { recursive: true });
export function makeVariant(name, edits, base = HTML) {
  let s = fs.readFileSync(base, 'utf8');
  for (const [from, to, opt] of edits) {
    const n = s.split(from).length - 1;
    if (opt && opt.all) { if (n < 1) throw new Error(`variant ${name}: anchor not found: ${from.slice(0, 80)}`); s = s.split(from).join(to); continue; }
    if (n !== 1) throw new Error(`variant ${name}: anchor found ${n}x (need exactly 1): ${from.slice(0, 80)}`);
    s = s.replace(from, () => to);
  }
  const p = path.join(VDIR, name + '.html');
  fs.writeFileSync(p, s);
  return p;
}
