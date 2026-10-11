import { launch, fp } from '../tools/harness.mjs';
const cases = [[560,560,1],[700,640,1],[900,760,1],[1280,800,1],[1280,1000,1],[1600,1000,1],[1500,1200,1],[640,480,2],[1024,768,2],[390,844,3],[800,600,2]];
for (const [w,h,d] of cases) {
  const t = await launch({ viewport: { width: w, height: h }, deviceScaleFactor: d });
  await t.page.waitForFunction(() => window.__fizzpop && window.__fizzpop.bootMs >= 0);
  const r = await t.page.evaluate(() => ({ k: window.__fizzpop._main.k(), lay: (({backW,backH,kNat,mode}) => ({backW,backH,kNat,mode}))(window.__fizzpop._main.layout()) }));
  console.log(w,h,d, JSON.stringify(r));
  await t.close();
}
