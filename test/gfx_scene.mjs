// node test/gfx_scene.mjs <out.png> <levelIndex[,levelIndex...]> [variant] [scale=3]  - mock gameplay frame with sprites over a level look
import path from 'path';
import { launch, canvasFnShot, PROJECT } from '../tools/harness.mjs';
const [out, idx = '0', variant = '0', scale = '3'] = process.argv.slice(2);
const t = await launch({ html: path.join(PROJECT, 'test', 'gfx_sheet.html') });
if (idx.includes(',')) await canvasFnShot(t.page, path.resolve(out), (i, v, sc) => T.scenes(i, v, sc), { args: [idx.split(',').map(Number), +variant, +scale] });
else await canvasFnShot(t.page, path.resolve(out), (i, v) => T.scene(i, v), { args: [+idx, +variant], scale: +scale });
console.log(JSON.stringify({ out: path.resolve(out), errors: t.errors, lint: await t.page.evaluate(() => T.lint()) }));
await t.close();
