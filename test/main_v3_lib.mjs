// FIZZ & POP v3 (wave 3) — shared helpers for the Main v3 checks (own copy of the tiny bits it needs; real build dist/fizzpop.html)
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const { chromium } = createRequire(import.meta.url)('playwright');
export const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const HTML = process.env.V3_HTML || path.join(PROJECT, 'dist', 'fizzpop.html');
export const OUT = path.join(PROJECT, 'out', 'v3', 'main');
fs.mkdirSync(OUT, { recursive: true });
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const stat = (a) => { const s = a.slice().sort((x, y) => x - y); const n = s.length || 1; return { n: s.length, avg: +(a.reduce((x, y) => x + y, 0) / n).toFixed(2), med: +(s[n >> 1] || 0).toFixed(2), p95: +(s[Math.floor(n * 0.95)] || 0).toFixed(2), p99: +(s[Math.floor(n * 0.99)] || 0).toFixed(2), max: +(s[n - 1] || 0).toFixed(1) }; };
export const PROFILES = {
  desk1: { vw: 1280, vh: 800, dpr: 1, touch: false },
  desk2: { vw: 1280, vh: 800, dpr: 2, touch: false },
  deskhd: { vw: 1920, vh: 1080, dpr: 1, touch: false },
  phone: { vw: 390, vh: 844, dpr: 3, touch: true },
  phone360: { vw: 360, vh: 740, dpr: 3, touch: true },
  land: { vw: 844, vh: 390, dpr: 3, touch: true },
  se: { vw: 568, vh: 320, dpr: 2, touch: true },
};
export async function open({ html = HTML, profile, vw = 1280, vh = 800, dpr = 1, touch = false, cpu = 1, wait = true, colorScheme, args = [], init } = {}) {
  if (profile) ({ vw, vh, dpr, touch } = PROFILES[profile]);
  const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', ...args] });
  const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr, hasTouch: !!touch, isMobile: !!touch, ...(colorScheme ? { colorScheme } : {}) });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e));
  if (init) await page.addInitScript(init);
  const cdp = await context.newCDPSession(page);
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await page.goto('file://' + path.resolve(html));
  if (wait) await page.waitForFunction(() => !!window.__fizzpop && window.__fizzpop.bootMs >= 0, null, { timeout: 120000 });
  const t = { browser, context, page, cdp, errors, close: () => browser.close().catch(() => {}) };
  t.ev = (fn, ...a) => page.evaluate(({ src, a }) => { window.fz = window.__fizzpop; return (0, eval)('(' + src + ')')(...a); }, { src: fn.toString(), a });
  t.shot = async (file) => { fs.mkdirSync(path.dirname(file), { recursive: true }); await page.screenshot({ path: file }); return file; };
  t.cvShot = async (file) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const url = await page.evaluate(() => document.getElementById('screen').toDataURL('image/png'));
    fs.writeFileSync(file, Buffer.from(url.replace(/^data:image\/png;base64,/, ''), 'base64'));
    return file;
  };
  return t;
}
let passed = 0, failed = 0;
export const check = (name, cond, extra = '') => { if (cond) passed++; else failed++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '   ' + extra}`); return !!cond; };
// release-gate policy (FIXPLAN_V3): a wall-clock / frame-rate / CPU-share check is ADVISORY in the blocking run (FP_TIMING=advisory: printed as ADVISORY ok / MISS, never counted as a failure);
// run by hand or in the e2e perf step (FP_TIMING unset) it is an ordinary check with the same threshold.
export const ADVISORY = process.env.FP_TIMING === 'advisory';
export const acheck = (name, cond, extra = '') => { if (!ADVISORY) return check(name, cond, extra); console.log(`${cond ? 'ADVISORY ok  ' : 'ADVISORY MISS'}  ${name}${cond ? '' : '   ' + extra}`); return !!cond; };
export const summary = () => { console.log(`\n${passed} passed, ${failed} failed`); return failed; };
export async function group(name, fn) {
  if (process.env.ONLY_GROUPS && !process.env.ONLY_GROUPS.split(',').includes(name)) return;
  console.log(`\n== ${name}`);
  try { await fn(); } catch (e) { check(name + ' threw', false, e && e.stack ? e.stack : String(e)); }
}
