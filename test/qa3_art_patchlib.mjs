// QA3 art: build a PATCHED COPY of dist/fizzpop.html under out/qa3/art/proto/ (dist/ and src/ are never touched)
import fs from 'fs';
import path from 'path';
import { PROJECT } from '../tools/harness.mjs';
export function patchDist(name, patches) {
  let html = fs.readFileSync(path.join(PROJECT, 'dist/fizzpop.html'), 'utf8');
  for (const [from, to] of patches) {
    const n = html.split(from).length - 1;
    if (n !== 1) throw new Error(`patch anchor found ${n} times: ${from.slice(0, 70)}`);
    html = html.replace(from, () => to);
  }
  const out = path.join(PROJECT, 'out/qa3/art/proto', name);
  fs.writeFileSync(out, html);
  return out;
}
