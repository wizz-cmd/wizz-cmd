// FIZZ & POP v2 - cast contact sheets (role "gfxcast").   node test/v2_cast_sheet.mjs [--cast=<path>] [--gfx=real] [--out=<dir>] [--k=2,4] <group...>
// groups: heroes enemies angry trapped die bubbles fx items power kraken all   (or sprite names)
// Writes out/v2/gfxcast/sheet_<group>_k<k>.png (nearest-neighbour x1) and prints console errors.
import fs from 'fs';
import path from 'path';
import { launch, canvasFnShot, PROJECT } from '../tools/harness.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const a = args.find((x) => x.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3) : d; };
const OUT = opt('out', path.join(PROJECT, 'out', 'v2', 'gfxcast'));
const ks = opt('k', '2,4').split(',').map(Number);
const cast = opt('cast', '../src/11_gfx_cast.js');
const gfx = opt('gfx', 'stub');
const groups = args.filter((a) => !a.startsWith('--'));
if (!groups.length) groups.push('all');
fs.mkdirSync(OUT, { recursive: true });

const t = await launch({ html: path.join(PROJECT, 'test', 'v2_cast_harness.html') + '?gfx=' + gfx + '&cast=' + encodeURIComponent(cast), viewport: { width: 1400, height: 900 } });
await t.page.waitForFunction(() => window.__castReady === true);
const list = await t.page.evaluate(() => T.list().map((s) => s.name));
const sel = (g) => {
  const E = ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer'];
  switch (g) {
    case 'heroes': return list.filter((n) => /^p[12]_/.test(n));
    case 'p1': return list.filter((n) => /^p1_/.test(n));
    case 'p2': return list.filter((n) => /^p2_/.test(n));
    case 'enemies': return list.filter((n) => E.some((e) => n === e + '_move') || n === 'bonefin');
    case 'angry': return list.filter((n) => /_angry$/.test(n) && !/^kraken/.test(n));
    case 'trapped': return list.filter((n) => /_trapped$/.test(n) || n === 'trap_overlay');
    case 'die': return list.filter((n) => /_die$/.test(n) && !/^p[12]/.test(n));
    case 'actions': return list.filter((n) => /_(throw|squash|fire)(_angry)?$/.test(n));
    case 'bubbles': return list.filter((n) => /^bubble/.test(n) || n === 'trap_overlay');
    case 'fx': return list.filter((n) => ['pebble', 'spark', 'ink', 'bolt', 'fire_drop', 'flame', 'water_flow', 'water_fall', 'sparkle', 'poof'].includes(n));
    case 'food': return list.filter((n) => /^food_/.test(n));
    case 'power': return list.filter((n) => /^pu_/.test(n));
    case 'items': return list.filter((n) => /^(food_|pu_)/.test(n) || n === 'moonpearl');
    case 'kraken': return list.filter((n) => /^kraken|^moonpearl/.test(n));
    case 'all': return list;
    default: {
      const parts = g.split(',');           // 'a,b,c' = one sheet with these exact names (or prefixes ending in *)
      return list.filter((n) => parts.some((q) => (q.endsWith('*') ? n.startsWith(q.slice(0, -1)) : n === q)));
    }
  }
};
for (const g of groups) {
  const names = sel(g);
  if (!names.length) { console.log('no sprites for', g); continue; }
  for (const k of ks) {
    const file = path.join(OUT, `sheet_${g.replace(/[^a-z0-9_]+/gi, '-').slice(0, 40)}_k${k}.png`);
    await canvasFnShot(t.page, file, (names, k, mw) => T.sheet(names, k, { maxW: mw }), { args: [names, k, Number(opt('maxw', '1500'))], scale: Number(opt('zoom', '1')) });
    console.log('wrote', file, names.length, 'sprites');
  }
}
console.log('errors', t.errors);
await t.close();
