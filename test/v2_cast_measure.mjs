// FIZZ & POP v3 - cast colour / luminance measurements (role "cast").   node test/v2_cast_measure.mjs [--cast=<rel path>] <what...>
// what: hue (lit-pixel mean hue / saturation / luminance per sprite) | lum (mean + top-15 % luminance of the 16x16 window, P1 vs P2 vs enemies, angry vs calm)
// Prints a table; used by the cast fixer and as a library of the numbers the gate in v2_cast_test.mjs asserts.
import path from 'path';
import { launch, PROJECT } from '../tools/harness.mjs';
const args = process.argv.slice(2);
const opt = (n, d) => { const a = args.find((x) => x.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3) : d; };
const cast = opt('cast', '../src/11_gfx_cast.js');
const what = args.filter((a) => !a.startsWith('--'));
const t = await launch({ html: path.join(PROJECT, 'test', 'v2_cast_harness.html') + '?gfx=stub&cast=' + encodeURIComponent(cast), viewport: { width: 1000, height: 700 } });
await t.page.waitForFunction(() => window.__castReady === true);
const rows = await t.page.evaluate((names) => {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const out = [];
  for (const [name, f, reg] of names) {
    const cv = T.bake(name, f, 4), g = cv.getContext('2d'), W = cv.width, H = cv.height, d = g.getImageData(0, 0, W, H).data;
    // composite over the abyss background colour (#03070f)
    let sR = 0, sG = 0, sB = 0, sw = 0, lumAll = [], tot = 0;
    const box = { x0: cv._pl, y0: cv._pt, x1: cv._pl + cv._w * 4, y1: cv._pt + cv._h * 4 };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, a = d[i + 3] / 255;
      const r = d[i] * a + 3 * (1 - a), gg = d[i + 1] * a + 7 * (1 - a), b = d[i + 2] * a + 15 * (1 - a);
      const L = 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(b);
      tot += L;
      if (x >= box.x0 && x < box.x1 && y >= box.y0 && y < box.y1) lumAll.push(L);
      const ch = Math.max(r, gg, b) - Math.min(r, gg, b), wgt = ch * ch * a;            // chroma-weighted: the white-hot cores do not wash the hue out
      const uy = (y - cv._pt) / 4, inReg = !reg || (uy >= reg[0] && uy < reg[1]);       // optional box-unit row range (e.g. the Kraken's tentacles: no gold crown / amber eyes)
      if (inReg && a > 0.2 && ch > 12) { sR += r * wgt; sG += gg * wgt; sB += b * wgt; sw += wgt; }
    }
    lumAll.sort((a, b) => b - a);
    const n15 = Math.max(1, Math.floor(lumAll.length * 0.15));
    const top15 = lumAll.slice(0, n15).reduce((a, b) => a + b, 0) / n15;
    const mean = lumAll.reduce((a, b) => a + b, 0) / lumAll.length;
    const R = sR / (sw || 1), G = sG / (sw || 1), B = sB / (sw || 1), mx = Math.max(R, G, B), mn = Math.min(R, G, B);
    let h = 0; if (mx > mn) { if (mx === R) h = ((G - B) / (mx - mn) + 6) % 6; else if (mx === G) h = (B - R) / (mx - mn) + 2; else h = (R - G) / (mx - mn) + 4; }
    // red share like test/gfx_angryposes.mjs: lit px (alpha >= 100, hsl saturation >= .45, .3 <= lightness <= .85) within 22 deg of red
    let tot2 = 0, red = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 100) continue; const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, mx2 = Math.max(r, g, b), mn2 = Math.min(r, g, b), l = (mx2 + mn2) / 2, dd = mx2 - mn2; if (!dd) continue; const sa = dd / (1 - Math.abs(2 * l - 1)); if (sa < 0.45 || l < 0.3 || l > 0.85) continue; let hh = mx2 === r ? ((g - b) / dd + 6) % 6 : mx2 === g ? (b - r) / dd + 2 : (r - g) / dd + 4; hh *= 60; tot2++; if (Math.min(hh, 360 - hh) <= 22) red++; }
    out.push({ redShare: tot2 ? +(red / tot2).toFixed(2) : 0, name, f, hue: Math.round(h * 60), sat: +(mx ? (mx - mn) / mx : 0).toFixed(2), val: Math.round(mx), rgb: [R, G, B].map(Math.round), mean: +mean.toFixed(3), top15: +top15.toFixed(3), emitted: +(tot / 16).toFixed(1) });
  }
  return out;
}, (what.includes('names') ? [] : (() => {
  const E = ['nibbler', 'crabbit', 'jellop', 'springle', 'glimmer'];
  const list = [['p1_idle', 0], ['p2_idle', 0], ['kraken', 0], ['kraken', 0, [30, 48]], ['kraken_angry', 0], ['kraken_angry', 0, [30, 48]], ['ink', 0], ['ink', 1], ['pebble', 0], ['spark', 0], ['bonefin', 0]];
  for (const e of E) { list.push([e + '_move', 0], [e + '_angry', 0]); if (what.includes('poses')) list.push(['crabbit_throw_angry', 0], ['springle_squash_angry', 0], ['glimmer_fire_angry', 0]); if (what.includes('frozen')) list.push([e + '_frozen', 0]); }
  return list;
})()));
console.log('name'.padEnd(18), 'hue sat  val  rgb              meanL   top15  emitted red%');
for (const r of rows) console.log((r.name + ' ' + r.f).padEnd(18), String(r.hue).padStart(3), r.sat.toFixed(2), String(r.val).padStart(4), r.rgb.join(',').padEnd(16), r.mean.toFixed(3), r.top15.toFixed(3), String(r.emitted).padStart(6), r.redShare);
await t.close();
