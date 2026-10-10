// FIZZ & POP — tools/harness.mjs
// Shared Playwright helpers (SPEC §7). Real headless Chromium; never install browsers.
//
//   import { launch, canvasShot, canvasFnShot, pageShot, fp } from '../tools/harness.mjs';
//
//   const t = await launch({ html: '/abs/path/page.html' });   // default: dist/fizzpop.html
//   const g = fp(t.page);                                       // __fizzpop helpers
//   await g.freeze(true); await g.start(1, 1, 42); await g.step(120);
//   await canvasShot(t.page, 'out/x/frame.png');                // #screen upscaled x3
//   console.log(t.errors);                                      // [] == good
//   await t.close();
//
// launch() resolves after the page's `load` event. `errors` is a live array of strings
// (console.error messages, uncaught page errors, failed requests); `logs` is a live array of
// every console message formatted "[type] text".
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { chromium } = createRequire(import.meta.url)('playwright');

export const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_HTML = path.join(PROJECT, 'dist', 'fizzpop.html');

/** Turn a file path (absolute or relative to cwd) or an http(s)/file URL into a URL. */
function toUrl(html) {
  if (/^(https?|file|data|about):/i.test(html)) return html;
  return 'file://' + path.resolve(html);
}

/**
 * Launch Chromium and open `html`.
 * @param {object}  o
 * @param {string}  [o.html]       file path or URL (default dist/fizzpop.html)
 * @param {{width:number,height:number}} [o.viewport]  default 1024x768
 * @param {boolean} [o.touch]      hasTouch + isMobile emulation (phone-like)
 * @param {string}  [o.initScript] JS source run before any page script (addInitScript)
 * @param {'light'|'dark'} [o.colorScheme]  emulate prefers-color-scheme (page chrome dark-mode tests)
 * @param {number}  [o.deviceScaleFactor]   default 1
 * @param {boolean} [o.wait]       if false, do not wait for the load event (default true)
 * @returns {Promise<{browser, context, page, errors:string[], logs:string[], close():Promise<void>}>}
 */
export async function launch({
  html = DEFAULT_HTML,
  viewport = { width: 1024, height: 768 },
  touch = false,
  initScript,
  wait = true,
  colorScheme,
  deviceScaleFactor = 1,
} = {}) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor,
    hasTouch: !!touch,
    isMobile: !!touch,
    ...(colorScheme ? { colorScheme } : {}),
  });
  const page = await context.newPage();
  const errors = [];
  const logs = [];
  page.on('console', (msg) => {
    const text = msg.text();
    logs.push(`[${msg.type()}] ${text}`);
    if (msg.type() === 'error') {
      const loc = msg.location();
      errors.push(text + (loc && loc.url ? `  (${path.basename(loc.url)}:${loc.lineNumber})` : ''));
    }
  });
  page.on('pageerror', (err) => {
    const text = `pageerror: ${err && err.stack ? err.stack.split('\n').slice(0, 4).join(' | ') : err}`;
    logs.push('[pageerror] ' + text);
    errors.push(text);
  });
  page.on('requestfailed', (req) => {
    const text = `requestfailed: ${req.url().slice(0, 120)} ${req.failure() ? req.failure().errorText : ''}`;
    logs.push('[requestfailed] ' + text);
    errors.push(text);
  });
  if (initScript) await page.addInitScript(initScript);
  await page.goto(toUrl(html), { waitUntil: wait ? 'load' : 'commit' });
  return {
    browser, context, page, errors, logs,
    async close() { try { await browser.close(); } catch (e) { /* already closed */ } },
  };
}

function ensureDir(file) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
}

function writeDataUrl(file, dataUrl) {
  ensureDir(file);
  fs.writeFileSync(file, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
  return file;
}

/**
 * Grab a canvas' pixels (toDataURL), upscale nearest-neighbour by `scale` inside the page and
 * write a PNG. If `selector` is not a canvas the element is screenshotted instead.
 * @returns {Promise<string>} the file path written
 */
export async function canvasShot(page, file, { selector = '#screen', scale = 3 } = {}) {
  const dataUrl = await page.evaluate(async ({ selector, scale }) => {
    const el = document.querySelector(selector);
    if (!el) throw new Error('canvasShot: no element for selector ' + selector);
    if (!(el instanceof HTMLCanvasElement)) return null;
    const src = el.toDataURL('image/png');
    const img = new Image();
    img.src = src;
    await img.decode();
    const out = document.createElement('canvas');
    out.width = el.width * scale; out.height = el.height * scale;
    const c = out.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.drawImage(img, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  }, { selector, scale });
  if (dataUrl === null) {
    ensureDir(file);
    await page.locator(selector).first().screenshot({ path: file });
    return file;
  }
  return writeDataUrl(file, dataUrl);
}

/**
 * Screenshot a canvas that is NOT in the DOM: `fn(...args)` runs in the page and must return an
 * HTMLCanvasElement. The harness defines a page global `fz` = window.__fizzpop (when the hook exists)
 * so you can write
 *   canvasFnShot(page, 'out/x/sheet.png', () => fz.GFX.sheet(), { scale: 2 })
 *   canvasFnShot(page, 'out/x/lvl.png', (i) => fz.GFX.levelCanvas(i, fz.LEVELS[i].map), { args: [0] })
 * (on module test pages without the hook use the globals directly: () => GFX.sheet()).
 * Upscaled nearest-neighbour by `scale`. `fn` may also be an expression string (may use `fz`, `args`).
 */
export async function canvasFnShot(page, file, fn, { scale = 1, args = [] } = {}) {
  const src = typeof fn === 'function' ? fn.toString() : `(...args) => (${fn})`;
  const dataUrl = await page.evaluate(async ({ src, scale, args }) => {
    if (window.__fizzpop) window.fz = window.__fizzpop;
    const f = (0, eval)('(' + src + ')');
    const cv = await f(...args);
    if (!cv || !cv.toDataURL) throw new Error('canvasFnShot: function did not return a canvas');
    const out = document.createElement('canvas');
    out.width = cv.width * scale; out.height = cv.height * scale;
    const c = out.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.drawImage(cv, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  }, { src, scale, args });
  return writeDataUrl(file, dataUrl);
}

/** Full-page screenshot (shows the page chrome around the canvas). */
export async function pageShot(page, file) {
  ensureDir(file);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

/**
 * Handle wrapping window.__fizzpop (SPEC §3.5). All methods are async and wait for the hook to exist.
 *   freeze(b=true)            stop the RAF loop advancing updates (rendering continues)
 *   step(n=1)                 run n fixed updates synchronously with virtual input, then render
 *   start(players=1, level=1, seed=1)   jump straight into play
 *   set(pi, input)            virtual input for player pi (0|1): {left,right,jump,fire} (merged)
 *   clear()                   release all virtual input
 *   hold(pi, input, n)        set input, step(n), then release that player's input
 *   scene() / goto(name,args) current scene name / switch scene
 *   state()                   Game.debug.state()
 *   evaluate(fn, ...args)     run fn(...args) in the page and return its (JSON-able) result. Page global
 *                             `fz` = window.__fizzpop is defined for convenience, e.g.
 *                               g.evaluate(() => fz.Game.debug.killAll())
 *                               g.evaluate((t, x, y) => fz.Game.debug.spawn(t, x, y), 'nibbler', 100, 80)
 *                             fn may also be an expression string using `fz` and `args`.
 *   shot(file, opts)          canvasShot of #screen
 *   wait(ms)                  sleep
 */
export function fp(page) {
  const ready = () => page.waitForFunction(() => !!window.__fizzpop, null, { timeout: 10000 });
  const call = async (src, ...args) => {
    await ready();
    return page.evaluate(({ src, args }) => {
      window.fz = window.__fizzpop;
      const f = (0, eval)('(' + src + ')');
      return f(...args);
    }, { src, args });
  };
  const h = {
    freeze: (b = true) => call('(b) => { fz.freeze(b); }', b),
    step: (n = 1) => call('(n) => { fz.step(n); }', n),
    start: (players = 1, level = 1, seed = 1) =>
      call('(p, l, s) => { fz.start(p, l, s); }', players, level, seed),
    set: (pi, input) => call('(pi, inp) => { fz.input.set(pi, inp); }', pi, input),
    clear: () => call('() => { fz.input.clear(); }'),
    scene: () => call('() => fz.scene()'),
    goto: (name, args) => call('(n, a) => { fz.goto(n, a); }', name, args === undefined ? null : args),
    state: () => call('() => fz.Game.debug.state()'),
    async hold(pi, input, n) {
      await h.set(pi, input);
      await h.step(n);
      await h.set(pi, { left: false, right: false, jump: false, fire: false });
    },
    evaluate(fn, ...args) {
      const src = typeof fn === 'function' ? fn.toString() : `(...args) => (${fn})`;
      return call(src, ...args);
    },
    shot: (file, opts) => canvasShot(page, file, opts),
    wait: (ms) => page.waitForTimeout(ms),
  };
  return h;
}
