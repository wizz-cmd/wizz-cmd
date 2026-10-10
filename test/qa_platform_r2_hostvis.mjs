// Host hides the artifact iframe (display:none / visibility:hidden / scrolled offscreen): does the game pause + music stop?
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
await frame.evaluate(() => { window.fz = window.__fizzpop; fz.start(1, 3, 1); });
await page.keyboard.press('Space'); await sleep(3500);
const S = () => frame.evaluate(() => ({ hidden: document.hidden, vis: document.visibilityState, focus: document.hasFocus(), paused: fz._main.paused(), frame: fz.Game.debug.state().frame, audio: fz.AUDIO._state().ctxState, audPaused: fz.AUDIO._state().paused }));
console.log('playing           ', JSON.stringify(await S()));
for (const [label, hide, show] of [['display:none', "f.style.display='none'", "f.style.display='block'"], ['visibility:hidden', "f.style.visibility='hidden'", "f.style.visibility='visible'"], ['scrolled far offscreen', 'window.scrollTo(0,2500)', 'window.scrollTo(0,0)']]) {
  await page.evaluate(`(()=>{const f=document.getElementById('f');${hide}})()`); await sleep(1500);
  let s1; try { s1 = await S(); } catch (e) { s1 = 'frame eval failed: ' + String(e).slice(0, 60); }
  await sleep(1500);
  let s2; try { s2 = await S(); } catch (e) { s2 = 'n/a'; }
  await page.evaluate(`(()=>{const f=document.getElementById('f');${show}})()`); await sleep(800);
  const s3 = await S();
  console.log(label.padEnd(24), 'hidden 1.5s:', JSON.stringify(s1), '\n'.padEnd(26), 'hidden 3s:  ', JSON.stringify(s2), '\n'.padEnd(26), 'shown again:', JSON.stringify(s3));
}
await browser.close();
process.exit(0);   // wave-2 integration: the script's http servers (serve()) are never closed, so the process used to hang after the report
