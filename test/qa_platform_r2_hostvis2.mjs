// Can the page detect "iframe hidden by host" itself? IntersectionObserver + rAF watchdog (setInterval) while the iframe is display:none / offscreen.
import fs from 'fs';
import { launchBrowser, serve, DIST, sleep } from './qa_platform_r2_lib.mjs';
const html = fs.readFileSync(DIST, 'utf8');
const game = await serve({ '/game.html': { body: html } });
const parent = await serve({ '/': { body: `<!doctype html><meta name=viewport content="width=device-width"><body style="margin:0"><iframe id=f sandbox="allow-scripts" src="http://127.0.0.1:${game.port}/game.html" style="width:800px;height:640px;border:0"></iframe><div style="height:3000px"></div>` } });
const browser = await launchBrowser({ autoplay: false });
const ctx = await browser.newContext({ viewport: { width: 900, height: 700 } });
const page = await ctx.newPage();
await page.goto(`http://127.0.0.1:${parent.port}/`); await sleep(800);
const frame = page.frames().find((f) => f.url().includes('game.html'));
await page.mouse.click(300, 300); await sleep(300);
await frame.evaluate(() => {
  window.__ev = []; window.__lastRaf = performance.now();
  const io = new IntersectionObserver((es) => { window.__ev.push(['IO', es[es.length - 1].isIntersecting, Math.round(performance.now())]); }, { threshold: [0, 0.01] });
  io.observe(document.getElementById('screen'));
  (function r() { window.__lastRaf = performance.now(); requestAnimationFrame(r); })();
  setInterval(() => { const late = performance.now() - window.__lastRaf; if (late > 700) window.__ev.push(['watchdog: no rAF for ms', Math.round(late), Math.round(performance.now())]); }, 500);
});
const T0 = Date.now();
for (const [label, hide, show] of [['display:none', "f.style.display='none'", "f.style.display='block'"], ['scrolled offscreen', 'window.scrollTo(0,2500)', 'window.scrollTo(0,0)']]) {
  await frame.evaluate(() => { window.__ev.length = 0; });
  await page.evaluate(`(()=>{const f=document.getElementById('f');${hide}})()`); await sleep(2500);
  const hiddenEv = await frame.evaluate(() => window.__ev.slice()).catch((e) => 'eval failed ' + String(e).slice(0, 50));
  await page.evaluate(`(()=>{const f=document.getElementById('f');${show}})()`); await sleep(700);
  const shownEv = await frame.evaluate(() => window.__ev.slice());
  console.log(label.padEnd(20), 'while hidden:', JSON.stringify(hiddenEv), '| after shown:', JSON.stringify(shownEv.slice(hiddenEv.length || 0)));
}
await browser.close();
process.exit(0);   // wave-2 integration: the script's http servers (serve()) are never closed, so the process used to hang after the report
