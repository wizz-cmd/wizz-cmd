import { launchBrowser, DIST, sleep } from './qa_platform_r2_lib.mjs';
import fs from 'fs';
import { serve } from './qa_platform_r2_lib.mjs';
const html = fs.readFileSync(DIST, 'utf8');
const s = await serve({ '/g.html': { body: html } });
const browser = await launchBrowser({ autoplay: true });
const ctx = await browser.newContext({ viewport: { width: 900, height: 700 } });
const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(`http://127.0.0.1:${s.port}/g.html`); await sleep(300);
await page.keyboard.press('KeyM'); await sleep(150);
await page.evaluate(() => { const f = window.__fizzpop; f.goto('entry', { entries: [{ pi: 0, score: 99000, round: 11 }] }); });
await sleep(500); for (let i = 0; i < 4; i++) { await page.keyboard.press('ArrowRight'); await page.keyboard.press('Space'); await sleep(100); }
await sleep(1500);
await page.reload(); await sleep(500);
const r = await page.evaluate(() => ({ muted: window.__fizzpop.AUDIO.isMuted(), top: window.__fizzpop._main.scores()[0] }));
console.log('after reload:', JSON.stringify(r), errs);
await browser.close(); await s.close();
