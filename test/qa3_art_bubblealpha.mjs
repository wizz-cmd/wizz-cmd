import { launch } from '../tools/harness.mjs';
const t = await launch({});
await t.page.waitForFunction(() => !!window.__fizzpop);
const r = await t.page.evaluate(() => {
  const G = window.__fizzpop.GFX; G.init();
  const out = {};
  for (const n of ['bubble', 'bubble_warn', 'trap_overlay', 'bubble_thunder', 'bubble_letter', 'bubble_shot']) {
    const sz = G.size(n); const c = document.createElement('canvas'); c.width = sz.w; c.height = sz.h; const x = c.getContext('2d', { willReadFrequently: true });
    G.draw(x, n, n === 'bubble_shot' ? 2 : 0, 0, 0); const d = x.getImageData(0, 0, sz.w, sz.h).data;
    const hist = {}; for (let i = 3; i < d.length; i += 4) hist[d[i]] = (hist[d[i]] || 0) + 1;
    out[n] = hist;
  }
  return out;
});
console.log(JSON.stringify(r)); await t.close();
