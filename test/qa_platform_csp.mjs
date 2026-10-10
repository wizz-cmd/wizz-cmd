// QA platform: run under a strict Artifact-like CSP (inline script/style only, no network, no eval) inside a sandboxed iframe; full flow + audio.
import fs from 'fs';
import { launchBrowser, serve, DIST, log } from './qa_platform_lib.mjs';
const html = fs.readFileSync(DIST, 'utf8');
const csp = "default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com; style-src 'unsafe-inline' https://fonts.googleapis.com; img-src data: blob:; media-src data: blob:; font-src https://fonts.gstatic.com; connect-src 'none'; frame-src 'none'; worker-src blob:";
const game = await serve({ '/g.html': { body: html, headers: { 'Content-Security-Policy': csp } } });
const parent = await serve({ '/': { body: `<!doctype html><body style="margin:0"><iframe sandbox="allow-scripts" src="http://127.0.0.1:${game.port}/g.html" style="width:900px;height:700px;border:0"></iframe>` } });
const b = await launchBrowser({ autoplay: false });
const ctx = await b.newContext({ viewport: { width: 920, height: 720 } });
const page = await ctx.newPage(); const msgs = [];
page.on('console', (m) => msgs.push(`[${m.type()}] ${m.text()}`)); page.on('pageerror', (e) => msgs.push('[pageerror] ' + e));
await page.goto(`http://127.0.0.1:${parent.port}/`); await page.waitForTimeout(800);
const f = page.frames().find((x) => x.url().includes('g.html'));
await page.mouse.click(450, 300); await page.waitForTimeout(300);
await page.keyboard.press('Enter'); await page.waitForTimeout(700); await page.keyboard.press('Enter'); await page.waitForTimeout(800);
await f.evaluate(() => { __fizzpop.Game.debug.skipIntro(); });
const r = await f.evaluate(() => ({ scene: __fizzpop.scene(), audio: __fizzpop.AUDIO.ready(), frames: __fizzpop.Game.debug.state().frame }));
log('under strict CSP + sandbox:', JSON.stringify(r)); log('console:', JSON.stringify(msgs));
await b.close(); await game.close(); await parent.close();
