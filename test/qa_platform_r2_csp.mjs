// Strict artifact-like CSP: no network, inline script/style only, data:/blob: images. Any violation or console error is a bug.
import fs from 'fs';
import { launchBrowser, serve, DIST, sleep } from './qa_platform_r2_lib.mjs';
const html = fs.readFileSync(DIST, 'utf8');
const csp = "default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src data: blob:; media-src data: blob:; connect-src 'none'; worker-src blob:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
const s = await serve({ '/g.html': { body: html, headers: { 'Content-Security-Policy': csp } } });
const browser = await launchBrowser({ autoplay: false });
const ctx = await browser.newContext({ viewport: { width: 900, height: 700 } });
const page = await ctx.newPage(); const msgs = [];
page.on('console', (m) => msgs.push(`[${m.type()}] ${m.text()}`)); page.on('pageerror', (e) => msgs.push('pageerror ' + e));
await page.goto(`http://127.0.0.1:${s.port}/g.html`); await sleep(500);
await page.mouse.click(450, 300); await page.keyboard.press('Enter'); await sleep(600);
await page.evaluate(() => { window.fz = window.__fizzpop; fz.start(2, 30, 3); fz.step(300); fz.goto('entry', { entries: [{ pi: 0, score: 50000, round: 5 }] }); fz.step(60); });
await sleep(300);
console.log('CSP run console/page messages:', JSON.stringify(msgs));
await browser.close(); await s.close();
