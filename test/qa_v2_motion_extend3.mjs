import { launch, fp, OUT } from './qa_v2_motion_lib.mjs';
import fs from 'fs';
for (const cfg of [{ n: 'k1.25', w: 320, h: 568, dpr: 1, touch: true }, { n: 'k3', w: 1024, h: 768, dpr: 1, touch: false }]) {
  for (const L of [1, 11, 21]) {
    const t = await launch({ viewport: { width: cfg.w, height: cfg.h }, deviceScaleFactor: cfg.dpr, touch: cfg.touch });
    const g = fp(t.page); await g.wait(600); await g.freeze(true);
    await g.start(1, L, 5); await g.step(170); await g.evaluate(() => { fz.Game.debug.skipIntro(); fz.Game.debug.clearEnemies(); fz.Game.debug.god(true); fz.Game.debug.noClear(true); });
    await g.step(100);
    await g.evaluate(() => { const S = fz.Game.debug._S(); S.players[0].letters = [1, 0, 1, 0, 0, 0]; });
    await g.step(2);
    const r = await t.page.evaluate(() => {
      const cv = document.getElementById('screen'), k = cv.width / 256, c = cv.getContext('2d');
      const x0 = Math.round(0 * k), w = Math.round(14 * k), y0 = Math.round(28 * k), h = Math.round(100 * k);
      const d = c.getImageData(x0, y0, w, h).data; const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const L = []; for (let i = 0; i < d.length; i += 4) L.push(0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]));
      L.sort((a, b) => a - b); const med = L[Math.floor(L.length / 2)], p99 = L[Math.floor(L.length * 0.99)], p90 = L[Math.floor(L.length * 0.9)];
      return { k, med: +med.toFixed(3), p90: +p90.toFixed(3), p99: +p99.toFixed(3) };
    });
    console.log(cfg.n, 'L' + L, JSON.stringify(r));
    await t.close();
  }
}
