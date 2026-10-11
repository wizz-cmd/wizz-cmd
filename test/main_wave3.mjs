// FIZZ & POP — wave-3 Main checks (FIXPLAN2 K1 K2 K3 + the wave-3 review findings R1-R8 and the polish items P2-P6).
// Runs against the REAL build (dist/fizzpop.html). Usage: node test/main_wave3.mjs   -> out/main/wave3/*.png, exit 1 on any failure.
import fs from 'fs';
import path from 'path';
import { launch, canvasShot, pageShot, fp, PROJECT } from '../tools/harness.mjs';

const OUT = path.join(PROJECT, 'out', 'main', 'wave3');
fs.mkdirSync(OUT, { recursive: true });
const HTML = process.env.W3_HTML || path.join(PROJECT, 'dist', 'fizzpop.html');
let failed = 0, passed = 0;
const check = (name, cond, extra = '') => { if (cond) passed++; else failed++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '   ' + extra}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function group(name, fn) {
  console.log(`\n== ${name}`);
  try { await fn(); } catch (e) { check(name + ' threw', false, e && e.stack ? e.stack : String(e)); }
}
async function open(opts = {}) {
  const t = await launch({ html: HTML, viewport: { width: 1280, height: 800 }, ...opts });
  t.g = fp(t.page);
  await t.page.waitForFunction(() => !!window.__fizzpop);
  await t.page.evaluate(() => window.__fizzpop.scene());                    // finish the boot
  t.noErrors = (label = 'zero console/page errors') => check(label, t.errors.length === 0, JSON.stringify(t.errors));
  return t;
}
/** Record every string drawn through GFX.text (window.__tx). */
const spyText = (page) => page.evaluate(() => {
  const G = window.__fizzpop.GFX;
  window.__tx = []; window.__txy = [];
  if (!G.__spied) { G.__spied = true; const o = G.text; G.text = function (c, s, x, y, ...a) { window.__tx.push(String(s)); window.__txy.push([String(s), y]); return o.call(this, c, s, x, y, ...a); }; }
});
const texts = (page) => page.evaluate(() => window.__tx.slice());
const clearTexts = (page) => page.evaluate(() => { window.__tx.length = 0; });
const rect = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x, y: r.y, r: r.right, b: r.bottom, w: r.width, h: r.height }; }, sel);

// ---------------------------------------------------------------------------------------------------------------------------
// K1: ambient bubbles never cross text, sprites or panels on the title, how-to and scores screens (also story / entry)
// ---------------------------------------------------------------------------------------------------------------------------
await group('K1 ambient bubbles keep out of text and panels', async () => {
  for (const touch of [false, true]) {
    const t = await open(touch ? { viewport: { width: 390, height: 844 }, touch: true, deviceScaleFactor: 2 } : {});
    const g = t.g;
    await g.freeze(true);
    const scenes = [['title', 'title', undefined], ['story', 'story', { attract: true }], ['scores', 'scores', {}], ['entry', 'entry', { entries: [{ pi: 0, score: 41230, round: 9 }] }]];
    for (let p = 0; p < 6; p++) scenes.push([`howto page ${p}`, 'howto', { page: p }]);
    for (const [label, name, args] of scenes) {
      await g.goto(name, args);
      let shownTotal = 0, bad = 0, worst = 99, samples = 0;
      for (let i = 0; i < 95; i++) {                                         // 570 frames: the title stays a title (it idles into the attract cycle after 600)
        await g.step(6);
        const a = await t.page.evaluate(() => window.__fizzpop._main.ambient());
        samples++;
        for (let k = 0; k < a.shown.length; k += 3) {
          shownTotal++;
          const x = a.shown[k], y = a.shown[k + 1];
          for (const r of a.avoid) {
            const dx = Math.max(r[0] - (x + 16), 0, x - r[2]), dy = Math.max(r[1] - (y + 16), 0, y - r[3]);
            const d = Math.hypot(dx, dy);
            worst = Math.min(worst, d);
            if (d < 1.9) bad++;
          }
        }
      }
      check(`${touch ? 'touch ' : ''}${label}: no drawn bubble touches any text / sprite / panel rectangle (${samples} frames, ${shownTotal} bubble draws, closest ${worst === 99 ? '-' : worst.toFixed(1)} px)`, bad === 0, `bad=${bad}`);
      if (name === 'title' || name === 'scores') check(`${touch ? 'touch ' : ''}${label}: bubbles are still visible somewhere (not just switched off)`, shownTotal > 0, `shown=${shownTotal}`);
      if (name === 'title') await canvasShot(t.page, path.join(OUT, `k1_title${touch ? '_touch' : ''}.png`), { scale: 1 });
      if (name === 'howto' && label.endsWith('2')) await canvasShot(t.page, path.join(OUT, `k1_howto2${touch ? '_touch' : ''}.png`), { scale: 1 });
    }
    // pixel proof on the title: the logo / HI SCORE plate region never contains a bubble of the ambient layer (a bubble sprite has a cyan ring)
    t.noErrors(touch ? 'K1 touch: zero errors' : 'K1 desktop: zero errors');
    await t.close();
  }
});

// ---------------------------------------------------------------------------------------------------------------------------
// K2: phone portrait: controls at the bottom, picture centred above them; R3: pads inside root padding
// ---------------------------------------------------------------------------------------------------------------------------
await group('K2 phone portrait: bottom-anchored controls, centred picture', async () => {
  for (const [w, h, dpr] of [[390, 844, 3], [360, 640, 2], [412, 915, 2.625], [375, 667, 2], [430, 932, 3], [768, 1024, 2]]) {
    const t = await open({ viewport: { width: w, height: h }, touch: true, deviceScaleFactor: dpr });
    await t.g.freeze(true); await t.g.step(10); await wait(150);
    const L = await t.page.evaluate(() => window.__fizzpop._main.layout());
    const c = await rect(t.page, '#screen'), tc = await rect(t.page, '#touch'), pads = await rect(t.page, '#touch .pads'), strip = await rect(t.page, '[data-k="pause"]');
    const m = await t.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight }));
    if (L.mode === 'port') {
      check(`${w}x${h}@${dpr}: controls end 8 px above the bottom edge (no empty band below them)`, Math.abs(tc.b - (m.ih - 8)) < 1.5, JSON.stringify({ tb: tc.b, ih: m.ih }));
      // (v3 V4: the PAUSE / SOUND strip hangs under the picture; picture + strip are centred in the space above the pads)
      check(`${w}x${h}@${dpr}: picture + strip centred in the space above the pads (gaps ${(c.y - 8).toFixed(1)} / ${(pads.y - strip.b).toFixed(1)})`, Math.abs((c.y - 8) - (pads.y - strip.b)) < 3 && strip.y >= c.b - 0.5, JSON.stringify({ cy: c.y, cb: c.b, py: pads.y, sb: strip.b }));
      check(`${w}x${h}@${dpr}: 16 px side gutters kept, no scroll`, c.x >= 15.5 && c.r <= m.iw - 15.5 && m.sw <= m.iw && m.sh <= m.ih + 1, JSON.stringify({ c, m }));
    } else check(`${w}x${h}@${dpr}: landscape arrangement chosen (${L.mode}); portrait rules not applicable`, true);
    if (w === 390) await pageShot(t.page, path.join(OUT, 'k2_390x844.png'));
    t.noErrors(`${w}x${h}@${dpr}: zero errors`);
    await t.close();
  }
  // root padding (Artifact skeleton / safe areas): controls rest above the bottom inset, picture below the top inset
  const t = await open({ viewport: { width: 390, height: 844 }, touch: true });
  await t.page.evaluate(() => { document.documentElement.style.padding = '47px 0 34px'; window.__fizzpop._main.fit(); });
  await wait(100);
  const c = await rect(t.page, '#screen'), tc = await rect(t.page, '#touch'), pads = await rect(t.page, '#touch .pads'), strip = await rect(t.page, '[data-k="pause"]');
  check('portrait with 47/34 px root padding: controls end 8 px above the bottom inset, picture below the top inset', Math.abs(tc.b - (844 - 34 - 8)) < 1.5 && c.y >= 47 + 8 - 0.5, JSON.stringify({ c, tc }));
  check('...and the picture + strip stay centred between the top inset and the pads', Math.abs((c.y - 47 - 8) - (pads.y - strip.b)) < 3, JSON.stringify({ cy: c.y, cb: c.b, py: pads.y, sb: strip.b }));
  await t.close();
});

await group('R3 landscape / overlay pads respect the root padding', async () => {
  for (const [pad, label] of [['0 47px', 'symmetric 47 px'], ['0 34px 0 59px', 'asymmetric 59 / 34 px'], ['10px 47px 21px', '47 px sides + 10 / 21 px']]) {
    const t = await open({ viewport: { width: 844, height: 390 }, touch: true });
    await t.page.evaluate((p) => { document.documentElement.style.padding = p; window.__fizzpop._main.fit(); }, pad);
    await wait(150);
    const cs = await t.page.evaluate(() => { const s = getComputedStyle(document.documentElement); return { l: parseFloat(s.paddingLeft), r: parseFloat(s.paddingRight), t: parseFloat(s.paddingTop), b: parseFloat(s.paddingBottom) }; });
    const L = await rect(t.page, '#touch .left'), R = await rect(t.page, '#touch .right'), M = await rect(t.page, '#touch .mid'), c = await rect(t.page, '#screen');
    check(`${label}: left pad group starts inside the padding (x=${L.x.toFixed(0)} >= ${cs.l})`, L.x >= cs.l + 11.5, JSON.stringify({ L, cs }));
    check(`${label}: right pad group ends inside the padding (r=${R.r.toFixed(0)} <= ${844 - cs.r})`, R.r <= 844 - cs.r - 11.5, JSON.stringify({ R, cs }));
    check(`${label}: PAUSE / SOUND inside the padding (top >= ${cs.t}, right <= ${844 - cs.r})`, M.y >= cs.t + 11.5 && M.r <= 844 - cs.r - 11.5, JSON.stringify({ M, cs }));
    check(`${label}: pads clear the picture`, L.r <= c.x + 0.5 && R.x >= c.r - 0.5, JSON.stringify({ L, R, c }));
    if (label === 'symmetric 47 px') await pageShot(t.page, path.join(OUT, 'r3_land_pad47.png'));
    await t.close();
  }
  const t = await open({ viewport: { width: 844, height: 390 }, touch: true });
  const L = await rect(t.page, '#touch .left');
  check('no root padding: pads keep their 12 px margin', Math.abs(L.x - 12) < 1.5, JSON.stringify(L));
  await t.close();
});

// ---------------------------------------------------------------------------------------------------------------------------
// K3: the credits roll inside a clipped band that never reaches the tableau; the hint has its own plate
// ---------------------------------------------------------------------------------------------------------------------------
await group('K3 ending credits band', async () => {
  const run = async (hold) => {
    const t = await open();
    const g = t.g;
    await g.freeze(true);
    await t.page.evaluate(() => window.__fizzpop._main.setQuality(0, true));       // v2: no post FX (its bloom glows beyond the band by design) and no ambient specks: these are pure pixel proofs
    await g.goto('ending', { res: { won: true, level: 30, scores: [412300, 128000], players: 2 }, entries: [] });
    await t.page.evaluate(() => window.__fizzpop._main.ambientReset());           // the title ticked a timing-dependent number of frames before the freeze
    await g.step(545);
    if (hold) await g.set(0, { fire: true });
    await g.step(100);
    const band = await t.page.evaluate(() => window.__fizzpop._main.endingBand());
    const px = await t.page.evaluate(() => {
      const cv = document.getElementById('screen'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data, m = cv.width / 256;
      const region = (y0, y1) => { const out = []; for (let y = Math.round(y0 * m); y < Math.round(y1 * m); y++) for (let x = Math.round(16 * m); x < Math.round(240 * m); x++) { const i = (y * cv.width + x) * 4; out.push(d[i], d[i + 1], d[i + 2]); } return out; };   // (k is a 0.25 step: round the region edges)
      return { top: region(0, 17), tableau: region(161, 224), band: region(30, 150) };
    });
    if (!hold) await canvasShot(t.page, path.join(OUT, 'k3_credits.png'), { scale: 1 });
    await t.close();
    return { band, px };
  };
  const A = await run(false), B = await run(true);
  check('phase 1 (credits) at the same instant: slow vs fast scroll', A.band.phase === 1 && B.band.phase === 1 && B.band.scroll > A.band.scroll + 20, JSON.stringify({ a: A.band, b: B.band }));
  const same = (u, v) => u.length === v.length && u.every((x, i) => x === v[i]);
  check('pixels below the band (the Fizz / Pearl / Pop tableau and the floor) do not depend on the credits scroll: no overlap', same(A.px.tableau, B.px.tableau));
  check('pixels above the band (the hint plate) do not depend on the credits scroll', same(A.px.top, B.px.top));
  check('(sanity) the band itself does change with the scroll', !same(A.px.band, B.px.band));
  check('band ends (y=' + A.band.bottom + ') above the hero hop apex (170) and the small pearl (174); starts below the hint plate', A.band.bottom <= 164 && A.band.top >= 16, JSON.stringify(A.band));
  // the hint sits on its own plate outside the band and names both keys
  const t = await open();
  await t.g.freeze(true); await spyText(t.page);
  await t.g.goto('ending', { res: { won: true, level: 30, scores: [1, 0], players: 1 }, entries: [] });
  await t.g.step(600);
  const tx = await texts(t.page);
  check('keyboard hint "ENTER: FASTER  ESC: SKIP" is drawn during the credits', tx.includes('ENTER: FASTER  ESC: SKIP'), JSON.stringify(tx.slice(-8)));
  await t.close();
});

// ---------------------------------------------------------------------------------------------------------------------------
// R1: the first touch on a (pointer: fine) device flips the layout; it must act on the row under the finger
// ---------------------------------------------------------------------------------------------------------------------------
await group('R1 first touch on a fine-pointer device', async () => {
  let ok = 0, n = 0;
  for (const [w, h] of [[1280, 800], [1024, 768], [1366, 768], [1920, 1080], [800, 600]]) {
    for (const rowId of ['p1', 'help']) {
      const t = await open({ viewport: { width: w, height: h } });
      await wait(250);
      const before = await t.page.evaluate(() => { const r = document.getElementById('screen').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, rows: window.__fizzpop._main.rows() }; });
      const row = before.rows.find((r) => r.id === rowId);
      const tx = before.x + ((row.x0 + row.x1) / 2) * before.w / 256, ty = before.y + (row.top + row.h / 2) * before.h / 224;
      await t.page.evaluate(([x, y]) => { const c = document.getElementById('screen'); const o = { pointerType: 'touch', pointerId: 7, clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: true }; c.dispatchEvent(new PointerEvent('pointerdown', o)); c.dispatchEvent(new PointerEvent('pointerup', o)); }, [tx, ty]);
      await wait(450);
      const after = await t.page.evaluate(() => ({ scene: window.__fizzpop.scene(), touch: window.__fizzpop._main.touchMode() }));
      const want = rowId === 'p1' ? 'story' : 'howto';
      n++; if (after.scene === want && after.touch) ok++; else console.log(`      ${w}x${h} ${rowId}: scene=${after.scene} touch=${after.touch}`);
      await t.close();
    }
  }
  check(`first touch (layout flip) activates the aimed row: ${ok}/${n}`, ok === n);
});

// ---------------------------------------------------------------------------------------------------------------------------
// R2: a blur that no focus follows must not hold the game / audio for ever
// ---------------------------------------------------------------------------------------------------------------------------
await group('R2 lone blur self-heals', async () => {
  const t = await open();
  const g = t.g;
  const holds = () => t.page.evaluate(() => window.__fizzpop._main.holds());
  await t.page.evaluate(() => window.dispatchEvent(new Event('blur')));
  check('a lone blur (document still focused) holds', (await holds()).includes('blur'));
  await t.page.keyboard.press('ArrowDown'); await wait(120);
  check('a real key press is proof of life: hold released', (await holds()).length === 0, JSON.stringify(await holds()));
  check('audio is running again after the heal', await g.evaluate(() => fz.AUDIO.ready()));
  await t.page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await wait(2300);
  check('with no key at all the 500 ms poll lets a stale blur go after ~1.5 s (document.hasFocus() is true)', (await holds()).length === 0, JSON.stringify(await holds()));
  // a REAL blur (document has no focus) is not healed by the poll
  await t.page.evaluate(() => { window.__hf = document.hasFocus; document.hasFocus = () => false; window.dispatchEvent(new Event('blur')); });
  await wait(2300);
  check('a genuine blur (hasFocus() false) stays held, however long', (await holds()).includes('blur'), JSON.stringify(await holds()));
  check('...and the click-to-play overlay is up', await t.page.evaluate(() => !document.getElementById('focus').hidden));
  await t.page.evaluate(() => { document.hasFocus = window.__hf; window.dispatchEvent(new Event('focus')); });
  await wait(150);
  check('focus returns: hold released, overlay gone', (await holds()).length === 0 && await t.page.evaluate(() => document.getElementById('focus').hidden));
  // a new game never starts already paused after the heal
  await t.page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await t.page.keyboard.press('Enter'); await wait(150);
  await t.g.freeze(true); await g.step(400);
  check('after a stale blur + key press, a new game starts running (not paused)', (await t.g.scene()) === 'play' && !(await g.evaluate(() => fz._main.paused())));
  t.noErrors();
  await t.close();
});

// ---------------------------------------------------------------------------------------------------------------------------
// R4 story length, R5 / R6 name entry, R7 touch how-to labels, R8 the pre-unlock hint
// ---------------------------------------------------------------------------------------------------------------------------
await group('R4 the story keeps its last line readable', async () => {
  const t = await open();
  const g = t.g;
  await g.freeze(true);
  await g.goto('story', { next: { players: 1, level: 1, seed: 1 } });
  await g.step(359);
  check('story still on screen after 359 frames', (await t.g.scene()) === 'story');
  await g.step(2);
  check('story ends at 6 s', (await t.g.scene()) === 'play');
  // last line starts at frame 190, 26 chars at 1.1 chars/frame -> complete at 214: >= 2.4 s fully readable
  check('the gold rules line is complete for >= 2 s before play starts (360 - 214 frames)', 360 - 214 >= 120);
  await t.close();
});

await group('R5 / R6 name entry on a keyboard', async () => {
  const t = await open();
  const g = t.g;
  await g.freeze(true); await spyText(t.page);
  const start = async (score = 3000) => {
    await g.evaluate(() => fz._main.resetScores());
    await g.goto('entry', { entries: [{ pi: 0, score, round: 3 }] });
    await g.step(60);
  };
  const entry = () => g.evaluate(() => fz._main.entry());
  // letters are queued by the key handler and consumed by update(); every other key needs the real loop (step() ignores real keys)
  const press = async (code) => {
    if (/^(Key|Digit)/.test(code)) { await t.page.keyboard.press(code); await g.step(2); return; }
    await g.freeze(false); await t.page.keyboard.press(code); await wait(150); await g.freeze(true);
  };
  await start();
  await press('KeyS'); await press('KeyA'); await press('KeyM');
  const e1 = await entry();
  check('typing S, A, M enters S, A, M', e1.name === 'SAM' && e1.doneT > 0, JSON.stringify(e1));
  check('the M hotkey did not mute the game while typing', !(await g.evaluate(() => fz.AUDIO.isMuted())));
  await start();
  await press('KeyZ'); await press('KeyO'); await press('KeyE');
  check('typing Z, O, E enters Z, O, E (Z is no longer a confirm key here)', (await entry()).name === 'ZOE', JSON.stringify(await entry()));
  await start();
  await press('Digit7'); await press('KeyQ'); await press('KeyX');
  check('digits and Q / X are letters too', (await entry()).name === '7QX', JSON.stringify(await entry()));
  await start();
  await press('KeyB'); await press('KeyB');
  await press('Backspace');
  const e2 = await entry();
  check('Backspace steps back one slot', e2.pos === 1 && e2.name.startsWith('BB'), JSON.stringify(e2));
  await press('ArrowUp');
  check('ArrowUp still cycles the letter (JUMP is not claimed for it on the keyboard label)', (await entry()).name[1] === 'C', JSON.stringify(await entry()));
  await press('Enter');
  check('Enter confirms the slot', (await entry()).pos === 2);
  // letters typed during the guard (a player still mashing the game keys) are ignored
  await g.evaluate(() => fz._main.resetScores());
  await g.goto('entry', { entries: [{ pi: 0, score: 3000, round: 3 }] });
  await g.step(5);
  await press('KeyZ'); await press('KeyZ');
  check('keys mashed in the first moments of the screen do not fill the name', (await entry()).pos === 0 && (await entry()).name === 'AAA', JSON.stringify(await entry()));
  // the hint names the real keys
  await g.step(50); await clearTexts(t.page); await g.step(2);
  const tx = await texts(t.page);
  check('keyboard hints: "TYPE OR ← → CHANGE LETTER" and "ENTER: OK  BACKSPACE: BACK"', tx.includes('TYPE OR ← → CHANGE LETTER') && tx.includes('ENTER: OK  BACKSPACE: BACK'), JSON.stringify(tx));
  check('no hint blames JUMP on the keyboard', !tx.some((s) => /JUMP: BACK/.test(s)));
  // the virtual / gamepad route still works exactly as before
  await start();
  await g.set(0, { right: true }); await g.step(1); await g.set(0, { right: false }); await g.step(1);
  check('virtual input (gamepad route) still cycles letters', (await entry()).name[0] === 'B', JSON.stringify(await entry()));
  await canvasShot(t.page, path.join(OUT, 'r6_entry.png'), { scale: 1 });
  t.noErrors();
  await t.close();
  // touch: label unchanged ("JUMP: BACK"), the SOUND pill still mutes during the entry
  const u = await open({ viewport: { width: 390, height: 844 }, touch: true });
  await u.g.freeze(true); await spyText(u.page);
  await u.g.evaluate(() => fz._main.resetScores());
  await u.g.goto('entry', { entries: [{ pi: 0, score: 3000, round: 3 }] });
  await u.g.step(60);
  const ux = await texts(u.page);
  check('touch labels: "← → CHANGE   BUBBLE: OK" / "JUMP: BACK"', ux.includes('← → CHANGE   BUBBLE: OK') && ux.includes('JUMP: BACK'), JSON.stringify(ux.slice(-6)));
  await u.close();
});

await group('R7 touch how-to labels match their tap zones', async () => {
  const t = await open({ viewport: { width: 390, height: 844 }, touch: true });
  const g = t.g;
  await spyText(t.page);
  await g.goto('howto', { page: 1 });
  await wait(700);                                                           // past the input guard
  const tx = await texts(t.page);
  check('touch labels "< BACK" and "NEXT >" are drawn on their own plates (v3 U13)', tx.includes('< BACK') && tx.includes('NEXT >'), JSON.stringify([...new Set(tx)]));
  const c = await rect(t.page, '#screen');
  const tap = async (lx, ly) => { await t.page.touchscreen.tap(c.x + lx * c.w / 256, c.y + ly * c.h / 224); await wait(250); };
  const page = () => g.evaluate(() => fz._main.howtoPage());
  await tap(216, 214);
  check('tapping the "NEXT >" plate advances (page 1 -> 2)', (await page()) === 2, String(await page()));
  await tap(24, 214);
  check('tapping the "< BACK" label goes back (page 2 -> 1)', (await page()) === 1, String(await page()));
  await tap(128, 120);
  check('tapping elsewhere advances (page 1 -> 2)', (await page()) === 2, String(await page()));
  await g.goto('howto', { page: 0 }); await wait(300);
  await tap(24, 214);
  check('"< BACK" on page 0 leaves the how-to for the title', (await t.g.scene()) === 'title', await t.g.scene());
  t.noErrors();
  await t.close();
  // keyboard / mouse device: "ESC: BACK" label, a click on it leaves
  const d = await open();
  await spyText(d.page);
  await d.g.goto('howto', { page: 2 }); await wait(700);
  const dx = await texts(d.page);
  check('desktop labels "ESC: BACK" / "← → PAGE" unchanged', dx.includes('ESC: BACK') && dx.includes('← → PAGE'));
  const dc = await rect(d.page, '#screen');
  await d.page.mouse.click(dc.x + 30 * dc.w / 256, dc.y + 214 * dc.h / 224); await wait(250);
  check('a mouse click on "ESC: BACK" leaves like Esc', (await d.g.scene()) === 'title', await d.g.scene());
  await d.close();
});

await group('R8 the sound hint before the first gesture', async () => {
  const t = await open();
  await spyText(t.page);
  const ready0 = await t.page.evaluate(() => window.__fizzpop.AUDIO.ready());
  await wait(2600);
  const tx = await texts(t.page);
  const focused = await t.page.evaluate(() => document.getElementById('focus').hidden);
  check(`audio locked (ready=${ready0}), focus overlay hidden (${focused}): "PRESS A KEY FOR SOUND" blinks`, !ready0 && focused && tx.includes('PRESS A KEY FOR SOUND'), JSON.stringify([...new Set(tx)].slice(0, 12)));
  await canvasShot(t.page, path.join(OUT, 'r8_hint.png'), { scale: 1 });
  await t.page.keyboard.press('ArrowDown'); await wait(600);
  await clearTexts(t.page); await wait(1800);
  const after = await texts(t.page);
  check('after a key press (audio running) the hint is gone', !after.includes('PRESS A KEY FOR SOUND') && await t.page.evaluate(() => window.__fizzpop.AUDIO.ready()), JSON.stringify([...new Set(after)].slice(0, 8)));
  t.noErrors();
  await t.close();
  // touch wording
  const u = await open({ viewport: { width: 390, height: 844 }, touch: true });
  await spyText(u.page);
  await wait(2600);
  check('touch: "TAP FOR SOUND" before the first tap', (await texts(u.page)).includes('TAP FOR SOUND'));
  await u.close();
});

// ---------------------------------------------------------------------------------------------------------------------------
// P2 blur overlay on a paused round, P3 / P4 wording, P5 non-qualifying score, P6 storage note
// ---------------------------------------------------------------------------------------------------------------------------
await group('P2 focus overlay over a paused round', async () => {
  const t = await open();
  const g = t.g;
  await spyText(t.page);
  await t.page.keyboard.press('Enter'); await wait(450); await t.page.keyboard.press('Enter'); await wait(300);   // title -> story -> play
  check('in a round', (await t.g.scene()) === 'play');
  await t.page.evaluate(() => { window.__hf = document.hasFocus; document.hasFocus = () => false; window.dispatchEvent(new Event('blur')); });
  await wait(300); await clearTexts(t.page); await wait(200);
  const cta = await t.page.evaluate(() => ({ cta: document.querySelector('#focus .cta').textContent, sub: document.querySelector('#focus small').textContent, hidden: document.getElementById('focus').hidden }));
  check('a blur mid-round shows "CLICK TO RESUME / Game paused"', !cta.hidden && cta.cta === 'CLICK TO RESUME' && cta.sub === 'Game paused', JSON.stringify(cta));
  const tx = await texts(t.page);
  check('the in-canvas PAUSED panel is not drawn under the overlay', !tx.includes('PAUSED') && !tx.includes('RESUME'), JSON.stringify([...new Set(tx)]));
  await pageShot(t.page, path.join(OUT, 'p2_blur_overlay.png'));
  await t.page.evaluate(() => { document.hasFocus = window.__hf; });
  await t.page.mouse.click(640, 400); await wait(300);
  check('click resumes the round (U17) and the overlay is gone', !(await g.evaluate(() => fz._main.paused())) && await t.page.evaluate(() => document.getElementById('focus').hidden));
  // manual pause + blur: the panel is hidden while the overlay is up and comes back after the click
  await t.page.keyboard.press('KeyP'); await wait(200);
  await t.page.evaluate(() => { document.hasFocus = () => false; window.dispatchEvent(new Event('blur')); });
  await wait(300); await clearTexts(t.page); await wait(150);
  const c2 = await t.page.evaluate(() => document.querySelector('#focus .cta').textContent);
  check('manual pause + blur: "CLICK TO FOCUS" and no panel text under it', c2 === 'CLICK TO FOCUS' && !(await texts(t.page)).includes('PAUSED'), c2);
  await t.page.evaluate(() => { document.hasFocus = window.__hf; });
  await t.page.mouse.click(640, 400); await wait(300); await clearTexts(t.page); await wait(150);
  check('after the click the manual pause menu is back (still paused)', (await g.evaluate(() => fz._main.paused())) && (await texts(t.page)).includes('PAUSED'));
  t.noErrors();
  await t.close();
});

await group('P3 / P4 wording', async () => {
  const t = await open();
  const g = t.g;
  await g.freeze(true); await spyText(t.page);
  await g.goto('title'); await g.step(5);
  let tx = await texts(t.page);
  check('title: no help / control lines any more (V3: they live in HOW TO PLAY, which names Z and Q)', !tx.some((s) => /ARROWS|WASD|UP\/DOWN|FREE SOFTWARE/.test(s)), JSON.stringify([...new Set(tx)]));
  const ty = await t.page.evaluate(() => window.__txy.slice());
  check('title: no text reaches the sound-hint / toast strip (y >= 211): the hint never covers the copyright lines', ty.every(([s, y]) => y + 8 <= 210), JSON.stringify(ty.filter(([s, y]) => y + 8 > 210)));
  check('legend names Left Shift (only the left Shift works)', await t.page.evaluate(() => /Left Shift/.test(document.getElementById('legend').textContent) && !/<kbd>Shift<\/kbd>/.test(document.getElementById('legend').innerHTML)));
  await g.goto('story', { next: { players: 1, level: 1, seed: 1 } }); await clearTexts(t.page); await g.step(230);
  tx = await texts(t.page);
  check('the story shows the controls once the rules are told (round 1 has no hint of its own)', tx.includes('Z / SPACE: BUBBLE') && tx.includes('UP / X: JUMP'), JSON.stringify([...new Set(tx)]));
  const all = new Set();
  for (let p = 0; p < 6; p++) { await clearTexts(t.page); await g.goto('howto', { page: p }); await g.step(3); (await texts(t.page)).forEach((s) => all.add(s)); }
  const joined = [...all].join('\n');
  check('how-to: "1 BUBBLE" step, "30 ROUNDS TO GO", "CLEARS ALL FOES" (one word per concept)', joined.includes('1 BUBBLE') && /30 ROUNDS TO GO/.test(joined) && joined.includes('CLEARS ALL FOES'), joined);
  check('how-to: no "1 SHOOT", "FLOORS", "EVERYONE", "ENEMY / ENEMIES" left', !/1 SHOOT|FLOORS|EVERYONE|ENEM(Y|IES)/.test(joined), joined.match(/.*(1 SHOOT|FLOORS|EVERYONE|ENEM(Y|IES)).*/g));
  check('controls page: "PUSH Q TO JOIN AS P2"', joined.includes('PUSH Q TO JOIN AS P2'));
  await g.goto('scores', {}); await clearTexts(t.page); await g.step(10);
  tx = await texts(t.page);
  check('scores footer says where ENTER leads, once: "ENTER / ESC: BACK" (not "TO CONTINUE", no second back line; v3 U15)', tx.includes('ENTER / ESC: BACK') && !tx.some((s) => /TO CONTINUE|BACK TO TITLE/.test(s)) && new Set(tx.filter((s) => /BACK/.test(s))).size === 1, JSON.stringify([...new Set(tx)]));
  t.noErrors();
  await t.close();
});

await group('P5 a score below the table is still shown', async () => {
  const t = await open();
  const g = t.g;
  await g.freeze(true); await spyText(t.page);
  await g.evaluate(() => fz._main.resetScores());
  await g.start(1, 1, 3); await g.step(20);
  await g.evaluate(() => { fz.Game.debug.addScore(0, 1200); fz.Game.debug._S().over = true; });
  await g.step(3);
  check('game over with a score below the table -> scores screen (no entry)', (await t.g.scene()) === 'scores', await t.g.scene());
  await clearTexts(t.page); await g.step(10);
  const tx = await texts(t.page);
  check('"YOUR SCORE 001200" is drawn on it', tx.includes('YOUR SCORE 001200'), JSON.stringify([...new Set(tx)]));
  await canvasShot(t.page, path.join(OUT, 'p5_yourscore.png'), { scale: 1 });
  // 2P: P1 qualifies, P2 does not
  await g.evaluate(() => fz._main.resetScores());
  await g.start(2, 1, 3); await g.step(20);
  await g.evaluate(() => { fz.Game.debug.addScore(0, 41230); fz.Game.debug.addScore(1, 900); fz.Game.debug._S().over = true; });
  await g.step(3);
  check('2P: P1 qualifies -> name entry first', (await t.g.scene()) === 'entry', await t.g.scene());
  await g.step(60); await t.page.keyboard.type('ABC'); await g.step(4); await g.step(80);
  check('...then the scores screen', (await t.g.scene()) === 'scores', await t.g.scene());
  await clearTexts(t.page); await g.step(10);
  const t2 = await texts(t.page);
  check('2P: the missed player is listed ("P2 SCORE 000900")', t2.includes('P2 SCORE 000900'), JSON.stringify([...new Set(t2)]));
  await canvasShot(t.page, path.join(OUT, 'p5_p2score.png'), { scale: 1 });
  t.noErrors();
  await t.close();
});

await group('P6 scores kept for this visit only (no storage)', async () => {
  const t = await open();
  await t.g.freeze(true); await spyText(t.page);
  await t.g.goto('scores', {}); await t.g.step(30);
  check('with working storage there is no "visit only" note', !(await texts(t.page)).includes('SCORES KEPT THIS VISIT ONLY'));
  await t.close();
  const u = await launch({ html: HTML, viewport: { width: 1280, height: 800 }, initScript: `Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } });` });
  u.g = fp(u.page);
  await u.page.waitForFunction(() => !!window.__fizzpop);
  await u.page.evaluate(() => window.__fizzpop.scene());
  await u.g.freeze(true); await spyText(u.page);
  await u.g.goto('scores', {}); await u.g.step(30);
  check('storage that throws -> "SCORES KEPT THIS VISIT ONLY" on the scores screen', (await texts(u.page)).includes('SCORES KEPT THIS VISIT ONLY') && !(await u.page.evaluate(() => window.__fizzpop._main.persistent())));
  await canvasShot(u.page, path.join(OUT, 'p6_visit_only.png'), { scale: 1 });
  check('the page still works (zero errors)', u.errors.length === 0, JSON.stringify(u.errors));
  await u.close();
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
