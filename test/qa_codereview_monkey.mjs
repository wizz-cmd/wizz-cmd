// Real-time monkey test: random real keys (keydown/up with overlap), random blur/focus/visibility events, random canvas clicks, random resize,
// for N seconds through the genuine RAF loop with live audio. Reports scenes visited, scene-change count, console errors, heap.
// Usage: node test/qa_codereview_monkey.mjs [seconds=60] [seed=1]
import { launch, fp, log } from './qa_codereview_lib.mjs';
const secs = +(process.argv[2] || 60), seed = +(process.argv[3] || 1);
const t = await launch({});
const g = fp(t.page);
const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyZ', 'KeyX', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyQ', 'ShiftLeft', 'Enter', 'Escape', 'KeyP', 'KeyM', 'KeyH', 'KeyT', 'Backspace'];
let s = seed >>> 0; const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
const held = new Set(); const seen = {}; let changes = 0, lastScene = '';
await t.page.keyboard.press('ShiftRight');
const t0 = Date.now();
let n = 0;
while (Date.now() - t0 < secs * 1000) {
  n++;
  const r = rnd();
  try {
    if (r < 0.55) { const k = KEYS[Math.floor(rnd() * KEYS.length)]; if (held.has(k)) { await t.page.keyboard.up(k); held.delete(k); } else { await t.page.keyboard.down(k); held.add(k); } }
    else if (r < 0.80) { const k = KEYS[Math.floor(rnd() * KEYS.length)]; await t.page.keyboard.press(k); }
    else if (r < 0.86) await t.page.evaluate(() => window.dispatchEvent(new Event('blur')));
    else if (r < 0.92) await t.page.evaluate(() => window.dispatchEvent(new Event('focus')));
    else if (r < 0.96) await t.page.mouse.click(40 + rnd() * 900, 20 + rnd() * 700);
    else if (r < 0.98) await t.page.setViewportSize({ width: 300 + Math.floor(rnd() * 900), height: 300 + Math.floor(rnd() * 600) });
    else if (r < 0.99) await g.evaluate(() => { const D = fz.Game.debug; if (fz.scene() === "play") { D.give(0, ['bomb', 'parasol', 'clock', 'heart'][Math.floor(Math.random() * 4)]); } });
    else await g.evaluate(() => { const D = fz.Game.debug; if (fz.scene() === "play") D.killAll(); });
  } catch (e) { log('monkey exc', e.message); break; }
  await t.page.waitForTimeout(10 + Math.floor(rnd() * 60));
  if (n % 10 === 0) {
    const sc = await g.scene(); seen[sc] = (seen[sc] || 0) + 1;
    if (sc !== lastScene) { changes++; lastScene = sc; }
  }
}
for (const k of held) await t.page.keyboard.up(k);
const end = await g.evaluate(() => ({ scene: fz.scene(), paused: fz._main.paused(), heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1), a: fz.AUDIO._stats(), layout: fz._main.layout() }));
log('actions', n, 'scenes sampled', JSON.stringify(seen), 'scene changes', changes);
log('end', JSON.stringify(end));
log('errors', JSON.stringify(t.errors));
await t.close();
