// Which render scale k do real devices get, and how often is it NOT a GFX bake bucket (=> every sprite/text/world blit is resampled)?
import fs from 'fs';
import { open, OUT } from './qa_v2_perf_lib.mjs';
const BUCKETS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 8];
const kbOf = (k) => { for (const b of BUCKETS) if (b >= k * 0.94) return b; return 8; };
const devs = [
  ['desktop 1920x969 (1080p browser) dpr1', 1920, 969, 1, false], ['desktop 1366x657 (768p laptop) dpr1', 1366, 657, 1, false], ['desktop 1536x730 (125% 1080p) dpr1.25', 1536, 730, 1.25, false],
  ['desktop 1280x625 dpr1', 1280, 625, 1, false], ['desktop 2560x1305 (1440p) dpr1', 2560, 1305, 1, false], ['desktop 1920x969 dpr1.5', 1280, 646, 1.5, false],
  ['macbook 1440x790 dpr2', 1440, 790, 2, false], ['macbook air 1280x700 dpr2', 1280, 700, 2, false], ['imac/4k 1920x1000 dpr2', 1920, 1000, 2, false], ['4k 3840x2000 dpr1', 3840, 2000, 1, false],
  ['iphone 390x844 dpr3', 390, 844, 3, true], ['iphone SE 375x667 dpr2', 375, 667, 2, true], ['pixel 412x915 dpr2.625', 412, 915, 2.625, true], ['galaxy 360x800 dpr3', 360, 800, 3, true],
  ['iphone landscape 844x390 dpr3', 844, 390, 3, true], ['ipad 820x1180 dpr2', 820, 1180, 2, true], ['ipad landscape 1180x820 dpr2', 1180, 820, 2, true], ['small android 360x640 dpr2', 360, 640, 2, true], ['lowend 360x640 dpr1.5', 360, 640, 1.5, true],
];
const rows = [];
for (const [name, vw, vh, dpr, touch] of devs) {
  const t = await open({ vw, vh, dpr, touch });
  const r = await t.page.evaluate(() => { const l = window.__fizzpop._main.layout(); return { k: l.k, kNat: l.kNat, snapped: l.snapped, mode: l.mode, back: l.backW + 'x' + l.backH, q: window.__fizzpop.quality }; });
  const kb = kbOf(r.k), exact = Math.abs(kb - r.k) < 1e-9;
  rows.push({ name, ...r, kb, bucketExact: exact, ratio: +(r.k / kb).toFixed(3) });
  console.log(name.padEnd(42), 'k=' + String(r.k).padEnd(5), 'kb=' + String(kb).padEnd(4), exact ? 'EXACT' : 'RESAMPLED x' + (r.k / kb).toFixed(2), r.mode, r.back, 'q' + r.q);
  await t.close();
}
fs.writeFileSync(OUT + '/devices.json', JSON.stringify(rows, null, 1));
