// Presentation cost of the CSS-scaled canvas at big sizes (software raster in headless = pessimistic) + P2 accidental join via LeftShift.
import { launchBrowser, open, ev, save, sleep } from './qa_platform_r2_lib.mjs';
const browser = await launchBrowser({ autoplay: true });
const rows = [];
for (const [name, vp, dpr] of [['1280x800@1', { width: 1280, height: 800 }, 1], ['1920x1080@2', { width: 1920, height: 1080 }, 2], ['3840x2160@1', { width: 3840, height: 2160 }, 1], ['2560x1440@2', { width: 2560, height: 1440 }, 2]]) {
  const t = await open({ browser, viewport: vp, dpr, autoplay: true });
  await ev(t.page, () => { fz.start(2, 20, 8); const G = fz.Game.debug; G.skipIntro(); G.god(true); const r = fz.U.rng(3); for (let i = 0; i < 40; i++) G.spawn(['thunder', 'fire', 'water'][i % 3], r.int(30, 220), r.int(30, 190)); });
  await sleep(800);
  const m = await ev(t.page, () => new Promise((res) => { const ts = []; const f = (n) => { ts.push(n); if (n - ts[0] < 4000) requestAnimationFrame(f); else { const d = []; for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]); d.sort((a, b) => a - b); res({ fps: +(1000 * d.length / (ts[ts.length - 1] - ts[0])).toFixed(1), p95: d[Math.floor(d.length * 0.95)], max: d[d.length - 1], over25: d.filter((x) => x > 25).length }); } }; requestAnimationFrame(f); }));
  const L = await ev(t.page, () => fz._main.layout());
  rows.push({ name, canvas: `${L.w}x${L.h}`, devPx: `${Math.round(L.w * dpr)}x${Math.round(L.h * dpr)}`, ...m }); console.log(JSON.stringify(rows[rows.length - 1]));
  await t.close();
}
// LeftShift joins P2 in a 1P game?
{
  const t = await open({ browser, autoplay: true });
  await ev(t.page, () => { fz.start(1, 3, 2); fz.Game.debug.skipIntro(); });
  await sleep(300);
  const before = await ev(t.page, () => ({ players: fz.Game.result().players, p2alive: fz.Game.debug.state().players.length }));
  await t.page.keyboard.down('ShiftLeft'); await sleep(80); await t.page.keyboard.up('ShiftLeft'); await sleep(200);
  const after = await ev(t.page, () => ({ players: fz.Game.result().players, ps: fz.Game.debug.state().players.map((p) => ({ lives: p.lives, alive: p.alive })) }));
  // Z is next to ShiftLeft on QWERTY; also check KeyZ alone does NOT join
  console.log('join test', JSON.stringify({ before, after }));
  rows.push({ shiftJoin: { before, after } });
  await t.close();
}
await browser.close();
save('bigcanvas.json', rows);
