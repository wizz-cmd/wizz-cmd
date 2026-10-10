import { protoPage } from './qa3_art_protolib.mjs';
const t = await protoPage();
const r = await t.page.evaluate(() => { const d = GFX._dbg; const out = {};
  for (const [k, args] of [['tall0', ['tall', 0, 0]], ['tall1', ['tall', 0, 1]], ['med0', ['med', 1, 0]], ['squash', ['squash', 2]]]) out[k] = d.outlineGrid(d.springFrame(...args), 'o', false, '');
  return out; });
for (const [k, g] of Object.entries(r)) { console.log(k); g.forEach((row, i) => console.log(String(i).padStart(2), row)); }
await t.close();
