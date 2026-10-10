// QA platform: phone-size sandboxed iframe, touch events only. Does the "click to play" overlay get in the way? Do touch buttons
// outside the overlay unlock audio / dismiss it? Real autoplay policy.
import fs from 'fs'; import path from 'path';
import { launchBrowser, serve, DIST, OUT, log } from './qa_platform_lib.mjs';
const D = path.join(OUT, 'iframe'); fs.mkdirSync(D, { recursive: true });
const html = fs.readFileSync(DIST, 'utf8');
const game = await serve({ '/game.html': { body: html } });
const parent = await serve({ '/': { body: `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><body style="margin:0;background:#fff"><div style="height:56px;background:#eee;font:14px sans-serif;padding:8px">host header</div><iframe id="f" sandbox="allow-scripts" src="http://127.0.0.1:${game.port}/game.html" style="width:100%;height:calc(100vh - 56px);border:0;display:block"></iframe>` } });
const browser = await launchBrowser({ autoplay: false });
for (const [name, vp, dpr] of [['p390', { width: 390, height: 844 }, 3], ['p360', { width: 360, height: 740 }, 2], ['land844', { width: 844, height: 390 }, 3]]) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: dpr, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e))); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.goto(`http://127.0.0.1:${parent.port}/`); await page.waitForTimeout(900);
  const frame = page.frames().find((f) => f.url().includes('game.html'));
  const cdp = await ctx.newCDPSession(page);
  const S = () => frame.evaluate(() => ({ focus: document.hasFocus(), overlayHidden: document.getElementById('focus').hidden, scene: __fizzpop.scene(), audio: __fizzpop.AUDIO.ready(), touch: __fizzpop._main.touchMode(), lay: __fizzpop._main.layout() }));
  const fb = await (await frame.frameElement()).boundingBox();
  const center = async (k) => { const r = await frame.evaluate((k) => { const b = document.querySelector('[data-k="' + k + '"]').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, k); return { x: fb.x + r.x, y: fb.y + r.y }; };
  const tap = async (p) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 0 }] }); await page.waitForTimeout(60); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(250); };
  log('\n==', name); log('initial', JSON.stringify(await S()));
  await page.screenshot({ path: path.join(D, `touch_${name}_0.png`) });
  // 1. user taps the BUBBLE button (outside of the overlay) first
  await tap(await center('fire'));
  const s1 = await S(); log('after tapping BUBBLE button first:', JSON.stringify({ focus: s1.focus, overlayHidden: s1.overlayHidden, audio: s1.audio, scene: s1.scene }));
  await page.screenshot({ path: path.join(D, `touch_${name}_1.png`) });
  await page.waitForTimeout(300);
  const s2 = await S(); log('then 300 ms later:', JSON.stringify({ overlayHidden: s2.overlayHidden, scene: s2.scene }));
  log('errors', JSON.stringify(errs));
  await ctx.close();
}
await browser.close(); await game.close(); await parent.close();
