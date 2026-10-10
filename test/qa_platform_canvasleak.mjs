// QA platform: does the number of offscreen canvases (tinted glyph / sprite caches) keep growing during a long session? (unbounded cache = native memory leak)
import { launchBrowser, open, ev, log } from './qa_platform_lib.mjs';
const init = `(() => { window.__cv = []; const oc = document.createElement.bind(document); document.createElement = (t, ...a) => { const e = oc(t, ...a); if (String(t).toLowerCase() === 'canvas') window.__cv.push(e); return e; }; })();`;
const b = await launchBrowser({ autoplay: true });
const t = await open({ browser: b, initScript: init });
await ev(t.page, () => { fz.freeze(true); fz.start(2, 1, 77); fz.Game.debug.skipIntro(); fz.Game.debug.god(true); });
const out = [];
for (let c = 0; c < 10; c++) {
  await ev(t.page, (c) => { const r = fz.U.rng(50 + c); for (let i = 0; i < 2000; i++) { if (i % 6 === 0) for (const pi of [0, 1]) fz.input.set(pi, { left: r.chance(.45), right: r.chance(.45), jump: r.chance(.25), fire: r.chance(.5) }); if (i % 500 === 0) { fz.Game.debug.addScore(0, r.int(10, 5000)); fz.Game.debug.setLevel(1 + ((c * 7 + i / 500) % 30 | 0)); } if (fz.scene() !== 'play') fz.start(2, 1 + c, c); fz.step(1); } fz.input.clear(); }, c);
  const n = await ev(t.page, () => ({ n: window.__cv.length, mp: +(window.__cv.reduce((a, x) => a + x.width * x.height, 0) / 1e6).toFixed(2) }));
  out.push(n); log((c + 1) * 2000, 'steps: canvases', n.n, 'MP', n.mp);
}
await t.close(); await b.close();
