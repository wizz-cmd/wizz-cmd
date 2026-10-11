// FIZZ & POP v2 - GFX core readability (role "gfxcore"):  node test/v2_gfxcore_readability.mjs [outDir]
// The approved mockup's cast (concepts/c_abyss_glow/mockup.js) stands on the platform tops of all 30 looks; writes contact sheets to out/v2/gfxcore/
// and numbers: for every creature the mean luminance contrast of its contour ring against the local scenery, listed per theme.
import fs from 'fs';
import path from 'path';
import { launch, canvasFnShot, PROJECT } from '../tools/harness.mjs';
const OUT = process.argv[2] || path.join(PROJECT, 'out', 'v2', 'gfxcore');
fs.mkdirSync(OUT, { recursive: true });
const t = await launch({ html: path.join(PROJECT, 'test', 'v2_gfxcore_readability.html'), viewport: { width: 1200, height: 900 } });
const out = [];
for (let th = 0; th < 6; th++) {
  await canvasFnShot(t.page, path.join(OUT, `cast_theme${th}.png`), (th) => {
    const items = []; for (const v of [0, 2, 4]) items.push(T2.cast(th * 5 + v, 2).cv);
    const g = T2.canvas(items.length * 512 + (items.length + 1) * 6, 416 + 12), c = g.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, g.width, g.height);
    items.forEach((it, i) => c.drawImage(it, 6 + i * 518, 6)); return g;
  }, { args: [th], scale: 1 });
}
for (const i of [0, 7, 11, 16, 21, 27]) await canvasFnShot(t.page, path.join(OUT, `cast_k4_look${String(i).padStart(2, '0')}.png`), (i) => T2.cast(i, 4).cv, { args: [i], scale: 1 });
console.log('errors', t.errors);
await t.close();
