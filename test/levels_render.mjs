// FIZZ & POP — test/levels_render.mjs
// Renders the level-design review images into out/levels/ (see test/levels_overview.html):
//   node test/levels_render.mjs                 overview.png (6x5), theme0..5.png (2x), r01..r30.png (3x)
//   node test/levels_render.mjs 3 5 12          only those rounds (per-round PNGs, 3x) + their sheet
//   --schematic                                 flat fill instead of the real tile art
//   --scale N                                   per-round scale (default 3)
// Prints JSON { files, errors }; exit code 1 on any page error.
import path from 'path';
import { launch, canvasFnShot, PROJECT } from '../tools/harness.mjs';

const argv = process.argv.slice(2);
const opt = { real: true, scale: 3 };
const rounds = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--schematic') opt.real = false;
  else if (argv[i] === '--scale') opt.scale = +argv[++i];
  else if (/^\d+$/.test(argv[i])) rounds.push(+argv[i]);
}
const OUT = path.join(PROJECT, 'out', 'levels');
const t = await launch({ html: path.join(PROJECT, 'test', 'levels_overview.html'), viewport: { width: 1700, height: 1200 } });
const files = [];
const shot = async (name, fn, args, scale = 1) => files.push(await canvasFnShot(t.page, path.join(OUT, name), fn, { args, scale }));

if (!rounds.length) {
  await shot('overview.png', (real) => T.sheet(0, 30, 6, 1, { real }), [opt.real]);
  for (let th = 0; th < 6; th++) await shot(`theme${th}.png`, (a, b, real) => T.sheet(a, b, 3, 2, { real }), [th * 5, th * 5 + 5, opt.real]);
  for (let i = 0; i < 30; i++) await shot(`r${String(i + 1).padStart(2, '0')}.png`, (n, sc, real) => T.single(n, sc, { real }), [i, opt.scale, opt.real]);
} else {
  for (const n of rounds) await shot(`r${String(n).padStart(2, '0')}.png`, (k, sc, real) => T.single(k, sc, { real }), [n - 1, opt.scale, opt.real]);
}
console.log(JSON.stringify({ files, errors: t.errors }, null, 1));
await t.close();
process.exit(t.errors.length ? 1 : 0);
