// node test/gfx_crop.mjs <out.png> <levelIdx,levelIdx,...> <x> <y> <w> <h> [scale]  - close-up of tile looks (sample map)
import path from 'path';
import { launch, canvasFnShot, PROJECT } from '../tools/harness.mjs';
const [out, idxs, x, y, w, h, scale = '6'] = process.argv.slice(2);
const t = await launch({ html: path.join(PROJECT, 'test', 'gfx_sheet.html') });
await canvasFnShot(t.page, path.resolve(out), (i, a, b, c, d, s) => T.crops(i, a, b, c, d, s, false), { args: [idxs.split(',').map(Number), +x, +y, +w, +h, +scale] });
console.log(JSON.stringify({ out: path.resolve(out), errors: t.errors, lint: await t.page.evaluate(() => T.lint()) }));
await t.close();
