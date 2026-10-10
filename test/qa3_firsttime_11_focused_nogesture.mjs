// Step 11: the iframe HAS focus (host calls iframe.focus()) but the user has made no gesture yet: overlay hidden, AudioContext locked.
// Is there any hint that sound is not on? Menu says "SOUND ON". What does a newcomer see/hear while waiting on the title?
import fs from 'fs';
import http from 'http';
import path from 'path';
import { createRequire } from 'module';
import { FRAG, SKEL, OUT, AUDIO_SPY, wait, check } from './qa3_firsttime_lib.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
function serve(map) { return new Promise((res) => { const srv = http.createServer((q, r) => { const e = map[q.url.split('?')[0]]; if (!e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(e); }); srv.listen(0, '127.0.0.1', () => res({ port: srv.address().port, close: () => new Promise((x) => srv.close(x)) })); }); }
const game = await serve({ '/game.html': SKEL(FRAG) });
const host = await serve({ '/': `<!doctype html><html><body style="margin:0"><iframe id="f" sandbox="allow-scripts" src="http://127.0.0.1:${game.port}/game.html" style="display:block;width:100%;height:100vh;border:0"></iframe><script>const f=document.getElementById('f');f.addEventListener('load',()=>{f.focus();f.contentWindow.focus();});</script></body></html>` });
const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(AUDIO_SPY);
const page = await ctx.newPage();
await page.goto(`http://127.0.0.1:${host.port}/`);
let frame = null; for (let i = 0; i < 60 && !frame; i++) { frame = page.frames().find((f) => f.url().includes('/game.html')); if (!frame) await wait(100); }
await frame.waitForFunction(() => !!window.__fizzpop);
await wait(2500);
const info = await frame.evaluate(() => ({ focusHidden: document.getElementById('focus').hidden, hasFocus: document.hasFocus(), act: navigator.userActivation && navigator.userActivation.hasBeenActive }));
const au = await frame.evaluate(() => { window.fz = window.__fizzpop; return { st: fz.AUDIO._state(), ready: fz.AUDIO.ready() }; });
console.log('state', JSON.stringify(info), JSON.stringify(au));
await page.screenshot({ path: path.join(OUT, 'nogesture_0_title.png') });
// wait past the 45-frame dead-audio hint threshold and look for a hint
await wait(3000);
await page.screenshot({ path: path.join(OUT, 'nogesture_1_title_3s.png') });
// wave-3 regression pass (R8): the pre-unlock hint is now drawn on the canvas, so spy on GFX.text and look for it
await frame.evaluate(() => { const G = window.__fizzpop.GFX; window.__tx = []; if (!G.__spied) { G.__spied = true; const o = G.text; G.text = function (c, s, ...a) { window.__tx.push(String(s)); return o.call(this, c, s, ...a); }; } });
await wait(1500);
const hintTexts = await frame.evaluate(() => window.__tx.slice());
const hintShown = hintTexts.some((s) => /FOR SOUND/.test(s));
console.log('hint texts', JSON.stringify([...new Set(hintTexts)].slice(0, 10)));
// press Down: does it unlock?
await page.keyboard.press('ArrowDown'); await wait(500);
const au2 = await frame.evaluate(() => ({ st: window.__fizzpop.AUDIO._state(), lvl: window.__level && window.__level() }));
console.log('after ArrowDown', JSON.stringify(au2));
check('no-gesture + focused: either an overlay/hint says how to get sound, or sound is already on', info.focusHidden === false || au.ready === true || hintShown, { info, ready: au.ready, hintShown });
await browser.close(); await game.close(); await host.close();
