// QA platform lens (round 2) shared helpers. Own launcher: real autoplay policy by default, CDP session, expose-gc.
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { fileURLToPath } from 'url';
const { chromium } = createRequire(import.meta.url)('playwright');
export const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DIST = path.join(PROJECT, 'dist', 'fizzpop.html');
export const OUT = path.join(PROJECT, 'out/qa/platform/r2');
fs.mkdirSync(OUT, { recursive: true });

export async function launchBrowser({ autoplay = false, args = [] } = {}) {
  const a = ['--mute-audio', '--enable-precise-memory-info', '--js-flags=--expose-gc', ...args];
  if (autoplay) a.push('--autoplay-policy=no-user-gesture-required');
  return chromium.launch({ headless: true, args: a });
}

export async function open({ html = DIST, viewport = { width: 1024, height: 768 }, touch = false, dpr = 1, colorScheme, initScript, browser, autoplay = false, url, ctxOpts = {}, wait = 'load' } = {}) {
  const own = !browser;
  browser = browser || await launchBrowser({ autoplay });
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dpr, hasTouch: !!touch, isMobile: !!touch, ...(colorScheme ? { colorScheme } : {}), ...ctxOpts });
  const page = await ctx.newPage();
  const errors = [], logs = [];
  page.on('console', (m) => { logs.push(`[${m.type()}] ${m.text()}`); if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => { errors.push('pageerror: ' + (e.stack || e).toString().split('\n').slice(0, 3).join(' | ')); logs.push('[pageerror] ' + e); });
  page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url().slice(0, 100)));
  if (initScript) await page.addInitScript(initScript);
  await page.goto(url || ('file://' + html), { waitUntil: wait });
  const cdp = await ctx.newCDPSession(page);
  return { browser, ctx, page, errors, logs, cdp, async close() { try { await ctx.close(); if (own) await browser.close(); } catch (e) {} } };
}

export const ev = (page, fn, ...args) => page.evaluate(({ src, args }) => { window.fz = window.__fizzpop; return (0, eval)('(' + src + ')')(...args); }, { src: fn.toString(), args });

export function serve(map, port = 0, headers = {}) {
  return new Promise((res) => {
    const s = http.createServer((req, rsp) => {
      const u = req.url.split('?')[0];
      const e = map[u];
      if (!e) { rsp.writeHead(404); rsp.end('nf'); return; }
      rsp.writeHead(200, { 'Content-Type': e.type || 'text/html; charset=utf-8', ...headers, ...(e.headers || {}) });
      rsp.end(typeof e.body === 'function' ? e.body() : e.body);
    });
    s.listen(port, '127.0.0.1', () => res({ port: s.address().port, close: () => new Promise((r) => s.close(r)) }));
  });
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const save = (name, obj) => fs.writeFileSync(path.join(OUT, name), typeof obj === 'string' ? obj : JSON.stringify(obj, null, 1));
