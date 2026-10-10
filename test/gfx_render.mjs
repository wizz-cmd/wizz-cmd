// GFX review renders: node test/gfx_render.mjs <what> [out dir] [scale]
//   what = font | logo | looks | theme:N | sheet | all
// Writes PNGs into out/gfx/ (default). View them with the Read tool.
import path from 'path';
import { launch, canvasFnShot, PROJECT } from '../tools/harness.mjs';
const [what = 'all', outDir = path.join(PROJECT, 'out', 'gfx'), tag = ''] = process.argv.slice(2);
const t = await launch({ html: path.join(PROJECT, 'test', 'gfx_sheet.html') });
const jobs = {
  font: ['font' + tag + '.png', () => T.font(), 4],
  logo: ['logo' + tag + '.png', () => T.logo(), 3],
  looks: ['looks' + tag + '.png', () => T.allLooks(1), 2],
  sheet: ['sheet' + tag + '.png', () => T.sheet(), 2],
};
for (let i = 0; i < 6; i++) jobs['theme' + i] = ['theme' + i + tag + '.png', (n) => T.theme(n, 2), 1, i];
const run = async (k) => {
  const [file, fn, scale, arg] = jobs[k];
  await canvasFnShot(t.page, path.join(outDir, file), fn, { scale, args: arg === undefined ? [] : [arg] });
  console.log('wrote', path.join(outDir, file));
};
if (what === 'all') for (const k of Object.keys(jobs)) await run(k);
else if (what.startsWith('theme:')) { await run('theme' + what.slice(6)); }
else await run(what);
console.log(JSON.stringify({ errors: t.errors, lint: await t.page.evaluate(() => T.lint()) }));
await t.close();
process.exit(t.errors.length ? 1 : 0);
