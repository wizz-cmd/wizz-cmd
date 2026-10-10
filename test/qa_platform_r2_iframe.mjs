// Cross-origin sandboxed iframe, phone + desktop. Real autoplay policy. Overlay copy on touch, first tap flow, audio unlock, key flow.
import fs from 'fs';
import { launchBrowser, serve, DIST, OUT, save, sleep } from './qa_platform_r2_lib.mjs';
const html = fs.readFileSync(DIST, 'utf8');
const game = await serve({ '/game.html': { body: html } });
const browser = await launchBrowser({ autoplay: false });
const out = {};
for (const [name, vp, touch, dpr, ifr] of [['phone390', { width: 390, height: 844 }, true, 3, { w: '100%', h: '100%' }], ['phone390_short', { width: 390, height: 844 }, true, 3, { w: '100%', h: '560px' }], ['desk', { width: 1100, height: 760 }, false, 1, { w: '720px', h: '600px' }]]) {
  const parent = await serve({ '/': { body: `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><style>html,body{height:100%}</style><body style="margin:0;background:#f4f4f4"><iframe id="f" sandbox="allow-scripts" allow="autoplay; gamepad" src="http://127.0.0.1:${game.port}/game.html" style="display:block;width:${ifr.w};height:${ifr.h};border:0"></iframe>` } });
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: dpr, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage(); const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`http://127.0.0.1:${parent.port}/`); await sleep(900);
  const frame = page.frames().find((f) => f.url().includes('game.html'));
  const S = () => frame.evaluate(() => ({ focus: document.hasFocus(), overlay: !document.getElementById('focus').hidden, overlayText: document.getElementById('focus').innerText.replace(/\n/g, ' | '), scene: window.__fizzpop.scene(), audio: window.__fizzpop.AUDIO._state().ctxState, touchMode: window.__fizzpop._main.touchMode(), layout: window.__fizzpop._main.layout(), ls: (() => { try { localStorage.setItem('x', '1'); return 'ok'; } catch (e) { return e.name; } })() }));
  const o = { initial: await S() };
  await page.screenshot({ path: `${OUT}/iframe_${name}_0.png` });
  const box = await (await frame.frameElement()).boundingBox();
  if (touch) { await page.touchscreen.tap(box.x + box.width / 2, box.y + 160); } else { await page.mouse.click(box.x + box.width / 2, box.y + 200); }
  await sleep(800);
  o.afterTap = await S();
  await page.screenshot({ path: `${OUT}/iframe_${name}_1.png` });
  // does the first tap also start/skip something unintentionally? (scene after tap on overlay)
  o.errors = errs;
  out[name] = o;
  await ctx.close(); await parent.close();
}
await game.close(); await browser.close();
save('iframe.json', out);
console.log(JSON.stringify(out, null, 1));
