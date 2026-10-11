// Halo clipping at the bake pad edge: draw every sprite/frame, look at the outermost ring of the baked rectangle.
import { setup, OUT, save } from './qa_v2_motion_lib.mjs';
import fs from 'fs';
const { t, g, page } = await setup();
await page.evaluate(() => { window.__KS = [1.25, 1.75, 2.25, 2.75, 3.25]; });
const res = await page.evaluate(() => {
  const GFX = window.__fizzpop.GFX;
  const BUCKETS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 8];
  const out = [];
  const regs = GFX._registry();
  for (const k of (window.__KS || [1, 1.5, 2, 3, 4])) {
    GFX.setScale(k);
    const kb = BUCKETS.find(b => b >= k * 0.94);
    for (const d of regs) {
      for (let f = 0; f < d.frames; f++) {
        const M = 40;
        const W = Math.ceil((d.w + 2 * M) * k), H = Math.ceil((d.h + 2 * M) * k);
        for (const variant of ['normal', 'white', 'tint']) {
          const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
          const c = cv.getContext('2d'); c.setTransform(k, 0, 0, k, 0, 0);
          const opt = variant === 'white' ? { white: true } : variant === 'tint' ? { tint: '#cfe8ff' } : undefined;
          GFX.draw(c, d.name, f, M, M, opt);
          const pl = Math.ceil(d.pad.l * kb), pr = Math.ceil(d.pad.r * kb), pt = Math.ceil(d.pad.t * kb), pb = Math.ceil(d.pad.b * kb);
          const cw = Math.ceil(d.w * kb) + pl + pr, ch = Math.ceil(d.h * kb) + pt + pb;
          // blit width/height in device px at K==kb is cw,ch (dw = e.w / kb logical -> *k = e.w when k==kb ... else scaled)
          const sx = Math.round(M * k) - Math.round(pl * k / kb), sy = Math.round(M * k) - Math.round(pt * k / kb);
          const bw = Math.round(cw * k / kb), bh = Math.round(ch * k / kb);
          const id = c.getImageData(0, 0, W, H).data;
          const A = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : id[(y * W + x) * 4 + 3];
          let top = 0, bot = 0, lef = 0, rig = 0;
          for (let x = sx + 1; x < sx + bw - 1; x++) { top = Math.max(top, A(x, sy + 1)); bot = Math.max(bot, A(x, sy + bh - 2)); }
          for (let y = sy + 1; y < sy + bh - 1; y++) { lef = Math.max(lef, A(sx + 1, y)); rig = Math.max(rig, A(sx + bw - 2, y)); }
          // alpha just OUTSIDE the rect must be 0 (sanity)
          let outside = 0;
          for (let x = sx; x < sx + bw; x++) { outside = Math.max(outside, A(x, sy - 2), A(x, sy + bh + 1)); }
          for (let y = sy; y < sy + bh; y++) { outside = Math.max(outside, A(sx - 2, y), A(sx + bw + 1, y)); }
          const m = Math.max(top, bot, lef, rig);
          if (m >= 3 || outside > 0) out.push({ k, name: d.name, f, variant, top, bot, lef, rig, outside, pad: d.pad });
        }
      }
    }
  }
  return out;
});
fs.writeFileSync(OUT + '/padclip_nonbucket.json', JSON.stringify(res, null, 1));
console.log('clipped entries:', res.length);
const byName = {};
for (const r of res) { const key = r.name; (byName[key] = byName[key] || []).push(r); }
for (const [n, arr] of Object.entries(byName)) {
  const mx = Math.max(...arr.map(a => Math.max(a.top, a.bot, a.lef, a.rig)));
  const ks = [...new Set(arr.map(a => a.k))].join(',');
  const sides = ['top', 'bot', 'lef', 'rig'].filter(s => arr.some(a => a[s] >= 3)).join('/');
  console.log(n.padEnd(24), 'max', String(mx).padStart(3), 'k:', ks, 'sides:', sides, 'variants:', [...new Set(arr.map(a=>a.variant))].join(','));
}
await t.close();
