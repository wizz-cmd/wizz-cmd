// QA platform: offscreen canvas count / pixel memory (iOS Safari has a hard canvas-memory budget); after boot and after visiting all 30 rounds + all scenes.
import { launchBrowser, open, ev, log } from './qa_platform_lib.mjs';
const init = `(() => { window.__cv = []; const oc = document.createElement.bind(document); document.createElement = (t, ...a) => { const e = oc(t, ...a); if (String(t).toLowerCase() === 'canvas') window.__cv.push(e); return e; };
  if (window.OffscreenCanvas) { const O = window.OffscreenCanvas; window.__oc = 0; window.OffscreenCanvas = class extends O { constructor(w, h) { super(w, h); window.__cv.push(this); } }; } })();`;
const b = await launchBrowser({ autoplay: true });
const t = await open({ browser: b, initScript: init });
const rep = () => ev(t.page, () => { const mp = window.__cv.reduce((a, c) => a + c.width * c.height, 0); const big = window.__cv.filter((c) => c.width * c.height > 100000).length; return { canvases: window.__cv.length, megaPixels: +(mp / 1e6).toFixed(2), MB_rgba: +(mp * 4 / 1048576).toFixed(1), bigOnes: big }; });
log('after boot', JSON.stringify(await rep()));
await ev(t.page, () => { fz.freeze(true); });
for (let lv = 1; lv <= 30; lv++) await ev(t.page, (lv) => { fz.start(2, lv, lv); fz.Game.debug.skipIntro(); fz.step(30); }, lv);
log('after all 30 rounds', JSON.stringify(await rep()));
for (const s of ['title', 'story', 'howto', 'scores']) await ev(t.page, (s) => { fz.goto(s, {}); fz.step(20); }, s);
await ev(t.page, () => { fz.goto('entry', { entries: [{ pi: 0, score: 99999, round: 4 }] }); fz.step(20); fz.goto('ending', { res: { won: true, level: 30, scores: [1, 1], players: 2 }, entries: [] }); fz.step(200); });
log('after every scene', JSON.stringify(await rep()), 'errors', JSON.stringify(t.errors));
await t.close(); await b.close();
