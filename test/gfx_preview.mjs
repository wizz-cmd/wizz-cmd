// GFX preview CLI:  node test/gfx_preview.mjs <out.png> <zoom> <name1,name2,...|@family> [--flip] [--white] [--bg #rrggbb] [--grid cols] [--frame n]
// Renders the named sprites (all frames, zoomed) via test/gfx_sheet.html. Families: @player @enemies ... (prefix match)
import path from 'path';
import { launch, canvasFnShot, PROJECT } from '../tools/harness.mjs';
const args = process.argv.slice(2);
const flag = (f) => { const i = args.indexOf(f); if (i < 0) return null; args.splice(i, 1); return true; };
const val = (f) => { const i = args.indexOf(f); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const flip = !!flag('--flip'), white = !!flag('--white'); const bg = val('--bg') || '#0d0b1a'; const cols = +(val('--grid') || 0); const fr = +(val('--frame') || 0);
const [out, zoomS, spec] = args;
const t = await launch({ html: path.join(PROJECT, 'test', 'gfx_sheet.html') });
const names = await t.page.evaluate((spec) => {
  const all = GFX._registry ? GFX._registry().map((r) => r.name) : [];
  const out = [];
  for (const s of spec.split(',')) {
    if (s.startsWith('@')) { const p = s.slice(1); for (const n of all) if (n.startsWith(p) && !out.includes(n)) out.push(n); }
    else if (s.endsWith('*')) { for (const n of all) if (n.startsWith(s.slice(0, -1)) && !out.includes(n)) out.push(n); }
    else out.push(s);
  }
  return out;
}, spec);
if (cols) await canvasFnShot(t.page, path.resolve(out), (n, z, c, bg, f) => T.grid(n, z, c, bg, f), { args: [names, +zoomS || 8, cols, bg, fr], scale: 1 });
else await canvasFnShot(t.page, path.resolve(out), (n, z, bg, o) => T.preview(n, z, bg, o), { args: [names, +zoomS || 8, bg, { flip, white }], scale: 1 });
const lint = await t.page.evaluate(() => T.lint());
console.log(JSON.stringify({ out: path.resolve(out), names: names.length, lint, errors: t.errors }));
await t.close();
process.exit(t.errors.length ? 1 : 0);
