// Step 33: verify the proposed hint fix for the focused-but-no-gesture case with a patched COPY (FT_FRAG): a "PRESS A KEY FOR SOUND" toast must blink on the title.
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
const page = await ctx.newPage();
await page.goto(`http://127.0.0.1:${host.port}/`);
let frame = null; for (let i = 0; i < 60 && !frame; i++) { frame = page.frames().find((f) => f.url().includes('/game.html')); if (!frame) await wait(100); }
await frame.waitForFunction(() => !!window.__fizzpop);
await wait(1500);
// sample the canvas bottom strip (y 212..220) for the toast plate (black 0.7 plate + gold text) across 2 s of blink phases
const hits = [];
for (let i = 0; i < 20; i++) {
  hits.push(await frame.evaluate(() => { const c = document.getElementById('screen'); const g = c.getContext('2d'); const m = c.width / 256; const d = g.getImageData(Math.round(60 * m), Math.round(212 * m), Math.round(136 * m), Math.round(8 * m)).data; let gold = 0; for (let k = 0; k < d.length; k += 4) if (d[k] > 220 && d[k + 1] > 190 && d[k + 2] < 140) gold++; return gold; }));
  await wait(100);
}
console.log('gold pixels in the toast strip over 2 s:', JSON.stringify(hits));
check('a "sound" hint is visible at some moment while the audio is locked (focused, no gesture)', hits.some((h) => h > 20), hits);
await page.screenshot({ path: path.join(OUT, 'nogesture_patched_hint.png') });
await browser.close(); await game.close(); await host.close();
