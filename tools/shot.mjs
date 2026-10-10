#!/usr/bin/env node
// FIZZ & POP — tools/shot.mjs
// Usage: node tools/shot.mjs <html> <out.png> [--wait ms] [--eval "js expr"] [--viewport WxH] [--touch]
//                            [--canvas [selector]] [--scale N]
//   --wait ms        wait this long after load (default 300)
//   --eval "expr"    JS evaluated in the page after the wait (awaited); its value is printed as
//                    "evalResult". `fz` is window.__fizzpop when present, e.g.
//                    --eval "fz.start(1,1,7); fz.step(120)"
//   --viewport WxH   default 1024x768
//   --touch          phone-like touch emulation (hasTouch + isMobile)
//   --canvas [sel]   screenshot only the canvas (default selector #screen) upscaled by --scale (default 3)
//                    instead of the full page
// Prints JSON {errors, logs, evalResult?, out} to stdout; exit code 1 if any page error occurred.
import { launch, canvasShot, pageShot } from './harness.mjs';

const argv = process.argv.slice(2);
const pos = [];
const opt = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const k = a.slice(2);
    if (k === 'touch') opt.touch = true;
    else if (k === 'canvas') {
      opt.canvas = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : '#screen';
    } else opt[k] = argv[++i];
  } else pos.push(a);
}
if (pos.length < 2) {
  console.error('usage: node tools/shot.mjs <html> <out.png> [--wait ms] [--eval "js"] [--viewport WxH] [--touch] [--canvas [sel]] [--scale N]');
  process.exit(2);
}
const [html, out] = pos;
let viewport = { width: 1024, height: 768 };
if (opt.viewport) {
  const m = /^(\d+)x(\d+)$/.exec(opt.viewport);
  if (!m) { console.error('bad --viewport, expected WxH'); process.exit(2); }
  viewport = { width: +m[1], height: +m[2] };
}

const t = await launch({ html, viewport, touch: !!opt.touch });
let evalResult;
try {
  await t.page.waitForTimeout(opt.wait !== undefined ? +opt.wait : 300);
  if (opt.eval) {
    evalResult = await t.page.evaluate(async (code) => {
      const fz = window.__fizzpop;
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      // Try as an expression first so the value is returned; fall back to statements.
      try { return await new AsyncFunction('fz', 'return (' + code + ')')(fz); }
      catch (e) { if (!(e instanceof SyntaxError)) throw e; }
      return await new AsyncFunction('fz', code)(fz);
    }, opt.eval);
  }
  if (opt.canvas) await canvasShot(t.page, out, { selector: opt.canvas, scale: opt.scale ? +opt.scale : 3 });
  else await pageShot(t.page, out);
} catch (e) {
  t.errors.push('shot.mjs: ' + (e && e.message ? e.message : e));
}
const result = { out, errors: t.errors, logs: t.logs };
if (evalResult !== undefined) result.evalResult = evalResult;
console.log(JSON.stringify(result, null, 2));
await t.close();
process.exit(t.errors.length ? 1 : 0);
