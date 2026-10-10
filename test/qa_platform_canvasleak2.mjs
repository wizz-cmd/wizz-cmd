// QA platform: which code creates canvases after warm-up (call-site histogram), to tell finite caches from unbounded growth.
import { launchBrowser, open, ev, log } from './qa_platform_lib.mjs';
const init = `(() => { window.__sites = {}; window.__rec = false; const oc = document.createElement.bind(document); document.createElement = (t, ...a) => { const e = oc(t, ...a); if (window.__rec && String(t).toLowerCase() === 'canvas') { const s = (new Error().stack || '').split('\\n').slice(2, 5).map((l) => l.trim().replace(/^at /, '').replace(/\\(.*?:(\\d+):\\d+\\)/, '(L$1)')).join(' < '); window.__sites[s] = (window.__sites[s] || 0) + 1; } return e; }; })();`;
const b = await launchBrowser({ autoplay: true });
const t = await open({ browser: b, initScript: init });
await ev(t.page, () => { fz.freeze(true); fz.start(2, 1, 77); fz.Game.debug.skipIntro(); fz.Game.debug.god(true); for (let lv = 1; lv <= 30; lv++) { fz.Game.debug.setLevel(lv); fz.step(5); } fz.start(2, 4, 3); fz.Game.debug.skipIntro(); });
await ev(t.page, () => { window.__rec = true; });
// stay on rounds already visited, so level canvases are cached; play 20000 steps
await ev(t.page, () => { const r = fz.U.rng(9); for (let i = 0; i < 20000; i++) { if (i % 6 === 0) for (const pi of [0, 1]) fz.input.set(pi, { left: r.chance(.45), right: r.chance(.45), jump: r.chance(.25), fire: r.chance(.5) }); if (i % 700 === 0) { fz.Game.debug.setLevel(1 + r.int(0, 28)); fz.Game.debug.addScore(0, r.int(10, 7000)); } if (fz.scene() !== 'play') fz.start(2, 1 + r.int(0, 28), i); fz.step(1); } fz.input.clear(); });
const sites = await ev(t.page, () => window.__sites);
const arr = Object.entries(sites).sort((a, b) => b[1] - a[1]);
log('canvases created after all 30 rounds were visited, during 20000 further steps:', arr.reduce((a, [, n]) => a + n, 0));
arr.slice(0, 8).forEach(([k, n]) => log(String(n).padStart(6), k));
await t.close(); await b.close();
