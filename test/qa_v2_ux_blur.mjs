// QA v2 (ux lens): the focus-loss path in an Artifact-like host: iframe smaller than the page, click outside = blur -> auto-pause + CLICK TO RESUME overlay; click overlay = resume + audio running.
import fs from 'fs';
import http from 'http';
import path from 'path';
import { createRequire } from 'module';
import { OUT, wait, FRAG, SKEL, AUDIO_SPY } from './qa_v2_ux_lib.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const serve = (map) => new Promise((res) => { const srv = http.createServer((q, r) => { const e = map[q.url.split('?')[0]]; if (!e) { r.writeHead(404); r.end('nf'); return; } r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(e); }); srv.listen(0, '127.0.0.1', () => res({ port: srv.address().port, close: () => new Promise((x) => srv.close(x)) })); });
const game = await serve({ '/game.html': SKEL(FRAG) });
const host = await serve({ '/': `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#2a2a30;color:#ddd;font:14px sans-serif"><div style="padding:12px 24px">Host page text (click here to blur the game)</div><iframe id="f" sandbox="allow-scripts" src="http://127.0.0.1:${game.port}/game.html" style="display:block;margin:0 24px;width:calc(100% - 48px);height:700px;border:0"></iframe><div style="padding:12px 24px;height:600px">more host content below the artifact</div></body></html>` });
const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
await context.addInitScript(AUDIO_SPY);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message)));
await page.goto(`http://127.0.0.1:${host.port}/`);
let frame = null;
for (let i = 0; i < 60 && !frame; i++) { frame = page.frames().find((f) => f.url().includes('/game.html')); if (!frame) await wait(100); }
await frame.waitForFunction(() => !!window.__fizzpop);
await frame.evaluate(() => { window.fz = window.__fizzpop; });
const S = (l) => page.screenshot({ path: path.join(OUT, `blur_${l}.png`) });
const info = () => frame.evaluate(() => ({ scene: fz.scene(), paused: fz._main.paused(), holds: fz._main.holds(), focusHidden: document.getElementById('focus').hidden, txt: document.getElementById('focus').innerText.replace(/\n/g, ' | '), hasFocus: document.hasFocus(), audio: fz.AUDIO._state() }));
await wait(1200);
await S('0_initial');
console.log('initial', JSON.stringify(await info()));
const fb = await (await frame.frameElement()).boundingBox();
await page.mouse.click(fb.x + 640, fb.y + 500);
await wait(1000);
console.log('after click', JSON.stringify(await info()));
await frame.evaluate(() => fz.start(1, 1, 5));
await wait(3500);
await S('1_playing');
// click outside the iframe -> blur
await page.mouse.click(300, 20);
await wait(1200);
console.log('after outside click', JSON.stringify(await info()));
await S('2_blurred');
// click the overlay to resume
const ov = await frame.evaluate(() => { const r = document.getElementById('focus').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
await page.mouse.click(fb.x + ov[0], fb.y + ov[1]);
await wait(1200);
console.log('after resume click', JSON.stringify(await info()));
await S('3_resumed');
// scroll the host so the iframe leaves the viewport -> IntersectionObserver hold
await page.evaluate(() => window.scrollTo(0, 760));
await wait(2500);
console.log('scroll', JSON.stringify(await page.evaluate(() => ({ y: scrollY, h: document.documentElement.scrollHeight, r: document.getElementById('f').getBoundingClientRect().toJSON() }))), 'perf', JSON.stringify(await frame.evaluate(() => ({ raf: fz._main.sceneTime(), vis: document.visibilityState }))));
console.log('scrolled away', JSON.stringify(await info()));
await page.evaluate(() => window.scrollTo(0, 0));
await wait(1200);
console.log('scrolled back', JSON.stringify(await info()));
await S('4_scrolled_back');
console.log('errors', JSON.stringify(errors));
await browser.close(); await game.close(); await host.close();
