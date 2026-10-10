/* ===================================================================================================
 * 09 SCENES — the three mockup pages (#gameplay, #title, #cast), hash router, animation loop.
 * ================================================================================================= */

/** soft contact shadow of an entity on the first surface below it (fainter + wider with height),
 *  clipped to the solids so it only ever darkens the slab it falls on. */
function contactShadow(ctx, map, layer, x, yFeet, rx = 8, a = 0.34) {
  const sy = surfaceBelow(map, x, yFeet - 1);
  if (sy === null) return;
  const h = Math.max(0, sy - yFeet);
  const k = clamp(1 - h / 70, 0.18, 1);
  ctx.save();
  if (layer && layer.solidPath) ctx.clip(layer.solidPath);
  softShadow(ctx, x, sy + 1.3, rx * (1 + h * 0.012), rx * 0.2 * (1 + h * 0.01), a * k * 1.5, '#7a1740');
  ctx.restore();
}

/* ------------------------------------------------ GAMEPLAY -------------------------------------- */
function sceneGameplay(ctx, t) {
  const S = JT.S;
  const map = LEVELS[0].map;
  ctx.setTransform(S, 0, 0, S, 0, 0);
  drawBackground(ctx, t, S);
  const layer = buildLevelLayer(map, S, 0);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
  // caustic light projected onto the slabs too (very faint)
  drawCaustics(ctx, t, S, 0.07);
  drawGodRays(ctx, t, 0.28);
  drawGlints(ctx, layer, t, [[183, 96, 16], [72, 152, 16], [48, 224, 16]]);
  drawForegroundBokeh(ctx, t);

  /* ---- placements (tile coords from the brief, snapped to real surfaces) ---- */
  const fizz = { x: 48, y: 216 };                 // floor, tile (5,23)
  const pop = { x: 200, y: 134 };                 // mid-jump above the row-17 slab, tile (24,15)
  const nib = { x: 116, y: 91 };                  // trapped Nibbler, tile (14,9)
  const crab = { x: 183, y: 88 };                 // feet on the row-9 slab, tile (20,11) region
  const jel = { x: 80, y: 71 };                   // tile (9,6)
  const sushi = { x: 72, y: 151 };                // on the row-17 slab, tile (8,17)

  // contact shadows first
  contactShadow(ctx, map, layer, fizz.x, fizz.y, 10);
  contactShadow(ctx, map, layer, pop.x, pop.y, 9.5, 0.36);
  contactShadow(ctx, map, layer, crab.x, crab.y, 11);
  ctx.save(); ctx.clip(layer.solidPath); softShadow(ctx, sushi.x, sushi.y + 1.3, 10.5, 2.1, 0.5, '#7a1740'); ctx.restore();

  /* food + popup */
  drawSushi(ctx, sushi.x, sushi.y - 6.8, t);
  drawPopup(ctx, '+2000', sushi.x, sushi.y - 25, 6.6, t);

  /* bubbles: cluster under the ceiling around the attractor (15.5, 2) */
  const cl = [[118.5, 34.5, 8.6], [133.5, 33.5, 8.4], [111, 47, 8.2], [126, 46, 8.8], [141, 47.5, 8.3]];
  cl.forEach(([x, y, r], i) => drawBubble(ctx, x + Math.sin(t * 1.1 + i) * 0.5, y + Math.cos(t * 0.9 + i * 2) * 0.5, r, { t, seed: i + 1 }));
  /* thunder special bubble rising near (27,20) */
  drawBubble(ctx, 220, 183, 9.8, { kind: 'thunder', t, seed: 3 });

  /* enemies */
  drawJellop(ctx, { x: jel.x, y: jel.y - 1, facing: 1, t, look: [0.4, 0.2], scale: 1.2 });
  drawCrabbit(ctx, { x: crab.x, y: crab.y - 9.4, facing: -1, t, angry: true, look: [0.5, 0], scale: 1.2 });
  drawBubble(ctx, nib.x, nib.y, 12.2, {
    kind: 'trap', stage: 1, t, seed: 5,
    inside: (c) => drawNibbler(c, { x: 0, y: 1, facing: 1, t: t * 1.3, trapped: true, noBob: true, walk: 0, scale: 0.92, look: [0.2, 0.1] }),
  });

  /* players: a faint warm halo lifts the heroes off the water */
  glow(ctx, fizz.x, fizz.y - 11, 24, '#ffd9ea', 0.22); glow(ctx, pop.x, pop.y - 12, 24, '#e6e0ff', 0.2);
  drawPlayer(ctx, 'p1', { x: fizz.x, y: fizz.y, facing: 1, pose: 'shoot', t, mouth: 1, scale: 1.3 });
  drawBubble(ctx, 71, 203, 7.4, { t, seed: 9, wobble: 2 });
  sparkle(ctx, 63, 197, 1.6, t * 2, '#ffffff', 0.9); sparkle(ctx, 76, 208, 1.1, -t, '#ffffff', 0.8);
  // tiny trail bubbles shed by the jump
  [[209, 141, 1.9, 21], [200, 148, 1.4, 22], [207, 153.5, 1.1, 23]].forEach(([x, y, r, sd]) => drawBubble(ctx, x, y, r, { t, seed: sd, wobble: 1.5 }));
  drawPlayer(ctx, 'p2', { x: pop.x, y: pop.y, facing: -1, pose: 'jump', t, scale: 1.3 });

  if (!JT.lowFx) postBloom(ctx, 0.27);

  /* HUD + walls furniture */
  drawHud(ctx, { scores: { p1: '012300', hi: '050000', p2: '008700' }, round: '01', lives1: 2, lives2: 1, extP1: [0, 1], extP2: [] }, t);
}

/* ------------------------------------------------ router ---------------------------------------- */
const SCENES = {
  gameplay: { w: 1024, h: 896, draw: (ctx, t) => sceneGameplay(ctx, t), t: 2.35 },
  title: { w: 1024, h: 896, draw: (ctx, t) => sceneTitle(ctx, t), t: 1.7 },
  cast: { w: 1600, h: 600, draw: (ctx, t) => sceneCast(ctx, t), t: 1.25 },
};

function startMockup() {
  const cv = document.getElementById('c');
  const ctx = cv.getContext('2d');
  const params = new URLSearchParams(location.search);
  let name = (location.hash || '#gameplay').slice(1).split('&')[0];
  if (!SCENES[name]) name = 'gameplay';
  const sc = SCENES[name];
  cv.width = sc.w; cv.height = sc.h;
  JT.S = sc.w / 256;
  const still = params.has('still');
  const tStill = params.has('t') ? parseFloat(params.get('t')) : sc.t;
  const frame = (t) => { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); sc.draw(ctx, t); };
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + name));
  window.addEventListener('hashchange', () => location.reload());
  frame(tStill);
  window.__ready = true;
  window.__scene = name;
  if (!still) {
    const t0 = performance.now();
    // adaptive quality: on slow (software-raster) machines drop the full-screen bloom so the page stays fluid
    let last = performance.now(), ema = 16;
    const loop = () => {
      const n = performance.now();
      frame(tStill + (n - t0) / 1000);
      ema = ema * 0.9 + (performance.now() - n) * 0.1;
      if (ema > 40) JT.lowFx = true; else if (ema < 22) JT.lowFx = false;
      last = n; requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
window.addEventListener('DOMContentLoaded', startMockup);
