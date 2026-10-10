import { protoPage } from './qa3_art_protolib.mjs';
const t = await protoPage();
const r = await t.page.evaluate(() => { const d = GFX._dbg; return Object.keys(Object.getOwnPropertyDescriptors(d)).map((k) => k + ':' + (d[k] === undefined ? 'UNDEF' : typeof d[k])).join(' '); });
console.log(r); console.log(t.errors);
await t.close();
