// QA v2 (ux lens): the boot as the user sees it: screencast from navigation start, 4x CPU throttle, phone 390x844 DPR3 (and desktop DPR1). Frames saved with timestamps.
import fs from 'fs';
import http from 'http';
import path from 'path';
import { createRequire } from 'module';
import { OUT, wait, FRAG, SKEL } from './qa_v2_ux_lib.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const serve = (map) => new Promise((res) => { const srv = http.createServer((q, r) => { const e = map[q.url.split('?')[0]]; if (!e) { r.writeHead(404); r.end('nf'); return; } r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(e); }); srv.listen(0, '127.0.0.1', () => res({ port: srv.address().port, close: () => new Promise((x) => srv.close(x)) })); });
const CFG = [{ name: 'bc_ph390_cpu4', w: 390, h: 844, dpr: 3, touch: true, cpu: 4 }, { name: 'bc_desk_cpu4', w: 1280, h: 800, dpr: 1, touch: false, cpu: 4 }, { name: 'bc_ph390_cpu6', w: 390, h: 844, dpr: 3, touch: true, cpu: 6 }];
for (const c of CFG) {
  const game = await serve({ '/game.html': SKEL(FRAG) });
  const host = await serve({ '/': `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#222"><iframe id="f" sandbox="allow-scripts" src="http://127.0.0.1:${game.port}/game.html" style="display:block;width:100%;height:100vh;border:0"></iframe></body></html>` });
  const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
  const context = await browser.newContext({ viewport: { width: c.w, height: c.h }, deviceScaleFactor: c.dpr, hasTouch: c.touch, isMobile: c.touch, colorScheme: 'dark' });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: c.cpu });
  const frames = [];
  cdp.on('Page.screencastFrame', async (f) => { frames.push({ t: f.metadata.timestamp, data: f.data }); try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch (e) {} });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 55, maxWidth: Math.round(c.w * 0.6), maxHeight: Math.round(c.h * 0.6), everyNthFrame: 1 });
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${host.port}/`, { waitUntil: 'load' });
  let frame = null;
  for (let i = 0; i < 100 && !frame; i++) { frame = page.frames().find((f) => f.url().includes('/game.html')); if (!frame) await wait(50); }
  await wait(5000);
  await cdp.send('Page.stopScreencast');
  const info = await frame.evaluate(() => ({ loading: window.__fizzpop && window.__fizzpop.loadingMs, boot: window.__fizzpop && window.__fizzpop.bootMs, prof: window.__fizzpop && window.__fizzpop.bootProfile, scene: window.__fizzpop && window.__fizzpop.scene(), q: window.__fizzpop && window.__fizzpop.quality }));
  const base = frames.length ? frames[0].t : 0;
  console.log(c.name, 'frames', frames.length, JSON.stringify(info));
  const dir = path.join(OUT, c.name); fs.mkdirSync(dir, { recursive: true });
  const stamps = [];
  frames.forEach((f, i) => { fs.writeFileSync(path.join(dir, String(i).padStart(3, '0') + '.jpg'), Buffer.from(f.data, 'base64')); stamps.push(Math.round((f.t - base) * 1000)); });
  fs.writeFileSync(path.join(dir, 'stamps.json'), JSON.stringify(stamps));
  console.log(c.name, 'stamps(ms)', JSON.stringify(stamps.slice(0, 40)));
  await browser.close(); await game.close(); await host.close();
}
