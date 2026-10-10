// node test/gfx_cast.mjs <out.png> [levelIdx,levelIdx,...] [scale=3] - the whole cast (calm + angry) standing on the platform tiles of each look (figure/ground review)
import path from 'path';
import { launch, canvasFnShot, PROJECT } from '../tools/harness.mjs';
const [out, idxs = '0,4,9,15,20,25', scale = '3'] = process.argv.slice(2);
const t = await launch({ html: path.join(PROJECT, 'test', 'gfx_sheet.html') });
await canvasFnShot(t.page, path.resolve(out), (i, s) => T.cast(i, s), { args: [idxs.split(',').map(Number), +scale], scale: 1 });
console.log(JSON.stringify({ out: path.resolve(out), errors: t.errors, lint: await t.page.evaluate(() => T.lint()) }));
await t.close();
