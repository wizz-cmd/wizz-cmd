import { protoPage } from './qa3_art_protolib.mjs';
const t = await protoPage();
const r = await t.page.evaluate(() => { const d = GFX._dbg; const out = [];
  for (const i of [0, 3, 10, 12, 14, 15, 16, 20, 25, 27, 29]) { const def = d.THEME_DEFS[d.themeOf(i)], v = def.vars[d.variantOf(i)], pal = d.tonedPalette(v); out.push({ round: i + 1, bg: d.bgOf(i), p1: pal[1], p2: pal[2], p3: pal[3], p4: pal[4], p5: pal[5] }); }
  return out; });
for (const o of r) console.log(JSON.stringify(o));
await t.close();
